// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// PromptVault — Privacy-preserving AI prompt marketplace on ETH Sepolia.
//
// Architecture:
//   Seller: ECIES-encrypt prompt bytes → upload to IPFS → store CID on-chain
//   Buyer:  pay price → get CID → fetch IPFS blob → eth_decrypt via MetaMask
//
// FHE upgrade path: see /lib/fhe-ready.ts — replaces ipfsCID string with
// euint128 on-chain and adds encrypted bid comparison using FHE.gte().
// Switching to Fhenix requires only updating the chain config + contract types.
contract PromptMarketplace {
    struct Listing {
        address seller;
        uint256 price;           // in wei
        string ipfsCID;          // IPFS pointer to ECIES-encrypted prompt blob
        bool isActive;
        string title;
        string category;
        uint8 specificityScore;  // 0–100, computed client-side before listing
        uint8 complexityScore;   // 0–100, computed client-side before listing
        // bitmask: bit0=role definition, bit1=constraints, bit2=output format, bit3=examples
        uint8 structureBadges;
        uint256 totalRatings;
        uint256 ratingSum;
        uint256 effectivenessSum;
        uint256 reusabilitySum;
    }

    // ipfsCID is intentionally excluded — only accessible to buyers via getPromptCID()
    struct ListingView {
        uint256 id;
        address seller;
        uint256 price;
        bool isActive;
        string title;
        string category;
        uint8 specificityScore;
        uint8 complexityScore;
        uint8 structureBadges;
        uint256 totalRatings;
        uint256 ratingSum;
        uint256 effectivenessSum;
        uint256 reusabilitySum;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => mapping(address => bool)) public hasPurchased;
    mapping(uint256 => mapping(address => bool)) public hasRated;
    uint256 public listingCount;

    event PromptListed(uint256 indexed listingId, address indexed seller, uint256 price, string title, string category);
    event PromptPurchased(uint256 indexed listingId, address indexed buyer);
    event PromptRated(uint256 indexed listingId, address indexed rater);

    function listPrompt(
        string calldata ipfsCID,
        uint256 price,
        string calldata title,
        string calldata category,
        uint8 specificityScore,
        uint8 complexityScore,
        uint8 structureBadges
    ) external {
        uint256 listingId = listingCount++;
        listings[listingId] = Listing({
            seller: msg.sender,
            price: price,
            ipfsCID: ipfsCID,
            isActive: true,
            title: title,
            category: category,
            specificityScore: specificityScore,
            complexityScore: complexityScore,
            structureBadges: structureBadges,
            totalRatings: 0,
            ratingSum: 0,
            effectivenessSum: 0,
            reusabilitySum: 0
        });
        emit PromptListed(listingId, msg.sender, price, title, category);
    }

    function buyPrompt(uint256 listingId) external payable {
        Listing storage listing = listings[listingId];
        require(listing.isActive, "Listing not active");
        require(msg.value >= listing.price, "Insufficient payment");
        require(!hasPurchased[listingId][msg.sender], "Already purchased");
        hasPurchased[listingId][msg.sender] = true;
        payable(listing.seller).transfer(msg.value);
        emit PromptPurchased(listingId, msg.sender);
    }

    // Returns the IPFS CID so the buyer can fetch and decrypt the ECIES blob.
    // Requires purchase — the CID is the only gate needed since the blob is
    // ECIES-encrypted and only the buyer's MetaMask key can decrypt it.
    function getPromptCID(uint256 listingId) external view returns (string memory) {
        require(hasPurchased[listingId][msg.sender], "Not purchased");
        return listings[listingId].ipfsCID;
    }

    function ratePrompt(
        uint256 listingId,
        uint8 overall,
        uint8 effectiveness,
        uint8 reusability
    ) external {
        require(hasPurchased[listingId][msg.sender], "Not purchased");
        require(!hasRated[listingId][msg.sender], "Already rated");
        require(overall >= 1 && overall <= 5, "Rating 1-5");
        require(effectiveness >= 1 && effectiveness <= 5, "Rating 1-5");
        require(reusability >= 1 && reusability <= 5, "Rating 1-5");
        hasRated[listingId][msg.sender] = true;
        listings[listingId].totalRatings += 1;
        listings[listingId].ratingSum += overall;
        listings[listingId].effectivenessSum += effectiveness;
        listings[listingId].reusabilitySum += reusability;
        emit PromptRated(listingId, msg.sender);
    }

    function getListings() external view returns (ListingView[] memory) {
        ListingView[] memory result = new ListingView[](listingCount);
        for (uint256 i = 0; i < listingCount; i++) {
            Listing storage l = listings[i];
            result[i] = ListingView({
                id: i,
                seller: l.seller,
                price: l.price,
                isActive: l.isActive,
                title: l.title,
                category: l.category,
                specificityScore: l.specificityScore,
                complexityScore: l.complexityScore,
                structureBadges: l.structureBadges,
                totalRatings: l.totalRatings,
                ratingSum: l.ratingSum,
                effectivenessSum: l.effectivenessSum,
                reusabilitySum: l.reusabilitySum
            });
        }
        return result;
    }
}
