import { expect } from "chai";
import { ethers } from "hardhat";

// Target buyer wallet — impersonated in all purchase flows
const BUYER_ADDRESS = "0xAd1C4453dF163396D2B4A2173212fC73c537652d";

// Shared fixture: deploy contract, fund + impersonate BUYER_ADDRESS as buyer
async function deploy() {
  const [seller, otherAccount] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("PromptMarketplace");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  // Fund the target buyer address and impersonate it
  await ethers.provider.send("hardhat_setBalance", [
    BUYER_ADDRESS,
    "0x56BC75E2D63100000", // 100 ETH
  ]);
  await ethers.provider.send("hardhat_impersonateAccount", [BUYER_ADDRESS]);
  const buyer = await ethers.getImpersonatedSigner(BUYER_ADDRESS);

  return { contract, seller, buyer, otherAccount };
}

// Helper: list a sample prompt from seller
async function listSample(
  contract: any,
  seller: any,
  overrides: Partial<{
    cid: string;
    price: bigint;
    title: string;
    category: string;
    specificity: number;
    complexity: number;
    badges: number;
  }> = {}
) {
  const tx = await contract.connect(seller).listPrompt(
    overrides.cid ?? "QmTestCID123456789abcdef",
    overrides.price ?? ethers.parseEther("0.01"),
    overrides.title ?? "Ultimate Code Reviewer",
    overrides.category ?? "coding",
    overrides.specificity ?? 80,
    overrides.complexity ?? 60,
    overrides.badges ?? 0b0111
  );
  await tx.wait();
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe("PromptMarketplace — initial state", function () {
  it("starts with zero listings", async function () {
    const { contract } = await deploy();
    expect(await contract.listingCount()).to.equal(0n);
  });

  it("getListings returns empty array", async function () {
    const { contract } = await deploy();
    expect(await contract.getListings()).to.have.length(0);
  });
});

// ─── listPrompt ───────────────────────────────────────────────────────────────

describe("PromptMarketplace — listPrompt", function () {
  it("increments listingCount", async function () {
    const { contract, seller } = await deploy();
    await listSample(contract, seller);
    expect(await contract.listingCount()).to.equal(1n);
  });

  it("stores all fields correctly", async function () {
    const { contract, seller } = await deploy();
    const price = ethers.parseEther("0.05");
    await contract.connect(seller).listPrompt(
      "QmSampleCIDxyz",
      price,
      "My Prompt",
      "productivity",
      75,
      55,
      0b0011
    );
    const [view] = await contract.getListings();
    expect(view.seller).to.equal(seller.address);
    expect(view.price).to.equal(price);
    expect(view.title).to.equal("My Prompt");
    expect(view.category).to.equal("productivity");
    expect(view.specificityScore).to.equal(75);
    expect(view.complexityScore).to.equal(55);
    expect(view.structureBadges).to.equal(0b0011);
    expect(view.isActive).to.be.true;
    expect(view.totalRatings).to.equal(0n);
  });

  it("emits PromptListed event", async function () {
    const { contract, seller } = await deploy();
    const price = ethers.parseEther("0.01");
    await expect(
      contract.connect(seller).listPrompt(
        "QmEventCID",
        price,
        "Event Prompt",
        "creative",
        50,
        40,
        0
      )
    )
      .to.emit(contract, "PromptListed")
      .withArgs(0n, seller.address, price, "Event Prompt", "creative");
  });

  it("CID is NOT exposed in getListings", async function () {
    const { contract, seller } = await deploy();
    await listSample(contract, seller, { cid: "QmSecretCID" });
    const [view] = await contract.getListings();
    // ListingView has no ipfsCID field — verify the struct has expected keys only
    expect(Object.keys(view.toObject())).not.to.include("ipfsCID");
  });

  it("multiple listings get sequential IDs", async function () {
    const { contract, seller } = await deploy();
    await listSample(contract, seller, { title: "First" });
    await listSample(contract, seller, { title: "Second" });
    const listings = await contract.getListings();
    expect(listings[0].id).to.equal(0n);
    expect(listings[1].id).to.equal(1n);
    expect(listings[0].title).to.equal("First");
    expect(listings[1].title).to.equal("Second");
  });
});

// ─── buyPrompt — buyer: 0xAd1C4453... ─────────────────────────────────────────

describe(`PromptMarketplace — buyPrompt (buyer: ${BUYER_ADDRESS})`, function () {
  it("marks hasPurchased for the buyer", async function () {
    const { contract, seller, buyer } = await deploy();
    await listSample(contract, seller);

    await contract.connect(buyer).buyPrompt(0n, {
      value: ethers.parseEther("0.01"),
    });

    expect(await contract.hasPurchased(0n, buyer.address)).to.be.true;
  });

  it("transfers ETH to seller", async function () {
    const { contract, seller, buyer } = await deploy();
    const price = ethers.parseEther("0.02");
    await listSample(contract, seller, { price });

    const sellerBefore = await ethers.provider.getBalance(seller.address);
    await contract.connect(buyer).buyPrompt(0n, { value: price });
    const sellerAfter = await ethers.provider.getBalance(seller.address);

    expect(sellerAfter - sellerBefore).to.equal(price);
  });

  it("accepts overpayment (forwards full msg.value to seller)", async function () {
    const { contract, seller, buyer } = await deploy();
    const price = ethers.parseEther("0.01");
    const overpay = ethers.parseEther("0.05");
    await listSample(contract, seller, { price });

    const sellerBefore = await ethers.provider.getBalance(seller.address);
    await contract.connect(buyer).buyPrompt(0n, { value: overpay });
    const sellerAfter = await ethers.provider.getBalance(seller.address);

    expect(sellerAfter - sellerBefore).to.equal(overpay);
  });

  it("emits PromptPurchased event", async function () {
    const { contract, seller, buyer } = await deploy();
    await listSample(contract, seller);

    await expect(
      contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") })
    )
      .to.emit(contract, "PromptPurchased")
      .withArgs(0n, buyer.address);
  });

  it("reverts with Insufficient payment when underpaying", async function () {
    const { contract, seller, buyer } = await deploy();
    await listSample(contract, seller, { price: ethers.parseEther("0.05") });

    await expect(
      contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.001") })
    ).to.be.revertedWith("Insufficient payment");
  });

  it("reverts on Already purchased (double buy)", async function () {
    const { contract, seller, buyer } = await deploy();
    await listSample(contract, seller);
    await contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") });

    await expect(
      contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWith("Already purchased");
  });

  it("reverts when listing does not exist", async function () {
    const { contract, buyer } = await deploy();
    await expect(
      contract.connect(buyer).buyPrompt(99n, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWith("Listing not active");
  });
});

// ─── getPromptCID — access control ────────────────────────────────────────────

describe(`PromptMarketplace — getPromptCID (buyer: ${BUYER_ADDRESS})`, function () {
  it("returns the correct CID to the buyer after purchase", async function () {
    const { contract, seller, buyer } = await deploy();
    const expectedCID = "QmRealPromptCID_abcdef1234567890";
    await listSample(contract, seller, { cid: expectedCID });
    await contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") });

    const cid = await contract.connect(buyer).getPromptCID(0n);
    expect(cid).to.equal(expectedCID);
  });

  it("reverts when called by non-buyer (otherAccount)", async function () {
    const { contract, seller, buyer, otherAccount } = await deploy();
    await listSample(contract, seller);
    await contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") });

    await expect(
      contract.connect(otherAccount).getPromptCID(0n)
    ).to.be.revertedWith("Not purchased");
  });

  it("reverts when called by the seller (seller did not buy)", async function () {
    const { contract, seller } = await deploy();
    await listSample(contract, seller);

    await expect(
      contract.connect(seller).getPromptCID(0n)
    ).to.be.revertedWith("Not purchased");
  });

  it("reverts before purchase even for the buyer", async function () {
    const { contract, seller, buyer } = await deploy();
    await listSample(contract, seller);

    await expect(
      contract.connect(buyer).getPromptCID(0n)
    ).to.be.revertedWith("Not purchased");
  });

  it("buyer can access CID for multiple purchased listings", async function () {
    const { contract, seller, buyer } = await deploy();
    await listSample(contract, seller, { cid: "QmCID_listing0" });
    await listSample(contract, seller, { cid: "QmCID_listing1" });

    await contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") });
    await contract.connect(buyer).buyPrompt(1n, { value: ethers.parseEther("0.01") });

    expect(await contract.connect(buyer).getPromptCID(0n)).to.equal("QmCID_listing0");
    expect(await contract.connect(buyer).getPromptCID(1n)).to.equal("QmCID_listing1");
  });
});

// ─── ratePrompt ───────────────────────────────────────────────────────────────

describe(`PromptMarketplace — ratePrompt (buyer: ${BUYER_ADDRESS})`, function () {
  async function buyAndSetup() {
    const fixtures = await deploy();
    const { contract, seller, buyer } = fixtures;
    await listSample(contract, seller);
    await contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") });
    return fixtures;
  }

  it("records rating correctly", async function () {
    const { contract, buyer } = await buyAndSetup();
    await contract.connect(buyer).ratePrompt(0n, 5, 4, 3);

    const [view] = await contract.getListings();
    expect(view.totalRatings).to.equal(1n);
    expect(view.ratingSum).to.equal(5n);
    expect(view.effectivenessSum).to.equal(4n);
    expect(view.reusabilitySum).to.equal(3n);
  });

  it("emits PromptRated event", async function () {
    const { contract, buyer } = await buyAndSetup();
    await expect(contract.connect(buyer).ratePrompt(0n, 4, 4, 4))
      .to.emit(contract, "PromptRated")
      .withArgs(0n, buyer.address);
  });

  it("accumulates ratings from multiple buyers", async function () {
    const { contract, seller, buyer, otherAccount } = await deploy();
    await listSample(contract, seller);

    // buyer (0xAd1C...) purchases and rates
    await contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") });
    await contract.connect(buyer).ratePrompt(0n, 5, 5, 5);

    // otherAccount also purchases and rates
    await contract.connect(otherAccount).buyPrompt(0n, { value: ethers.parseEther("0.01") });
    await contract.connect(otherAccount).ratePrompt(0n, 3, 4, 2);

    const [view] = await contract.getListings();
    expect(view.totalRatings).to.equal(2n);
    expect(view.ratingSum).to.equal(8n);       // 5 + 3
    expect(view.effectivenessSum).to.equal(9n); // 5 + 4
    expect(view.reusabilitySum).to.equal(7n);   // 5 + 2
  });

  it("reverts on Already rated (double rating)", async function () {
    const { contract, buyer } = await buyAndSetup();
    await contract.connect(buyer).ratePrompt(0n, 5, 5, 5);

    await expect(
      contract.connect(buyer).ratePrompt(0n, 1, 1, 1)
    ).to.be.revertedWith("Already rated");
  });

  it("reverts when caller has not purchased", async function () {
    const { contract, seller, otherAccount } = await deploy();
    await listSample(contract, seller);

    await expect(
      contract.connect(otherAccount).ratePrompt(0n, 5, 5, 5)
    ).to.be.revertedWith("Not purchased");
  });

  it("reverts when overall rating is 0", async function () {
    const { contract, buyer } = await buyAndSetup();
    await expect(
      contract.connect(buyer).ratePrompt(0n, 0, 3, 3)
    ).to.be.revertedWith("Rating 1-5");
  });

  it("reverts when any rating exceeds 5", async function () {
    const { contract, buyer } = await buyAndSetup();
    await expect(
      contract.connect(buyer).ratePrompt(0n, 5, 6, 3)
    ).to.be.revertedWith("Rating 1-5");
  });

  it("sets hasRated after rating", async function () {
    const { contract, buyer } = await buyAndSetup();
    expect(await contract.hasRated(0n, buyer.address)).to.be.false;
    await contract.connect(buyer).ratePrompt(0n, 4, 4, 4);
    expect(await contract.hasRated(0n, buyer.address)).to.be.true;
  });
});

// ─── Full end-to-end flow ─────────────────────────────────────────────────────

describe(`PromptMarketplace — full e2e (buyer: ${BUYER_ADDRESS})`, function () {
  it("completes list → buy → reveal → rate cycle", async function () {
    const { contract, seller, buyer } = await deploy();

    // 1. Seller lists a prompt
    const cid = "QmFullFlowCID_0xAd1C4453";
    const price = ethers.parseEther("0.01");
    await contract.connect(seller).listPrompt(cid, price, "E2E Prompt", "research", 90, 70, 0b1111);

    // 2. Buyer purchases
    await contract.connect(buyer).buyPrompt(0n, { value: price });
    expect(await contract.hasPurchased(0n, buyer.address)).to.be.true;

    // 3. Buyer retrieves CID (simulates: fetch IPFS → eth_decrypt → plaintext)
    const revealedCid = await contract.connect(buyer).getPromptCID(0n);
    expect(revealedCid).to.equal(cid);

    // 4. Buyer rates the prompt
    await contract.connect(buyer).ratePrompt(0n, 5, 5, 4);
    expect(await contract.hasRated(0n, buyer.address)).to.be.true;

    // 5. Verify final on-chain state
    const [view] = await contract.getListings();
    expect(view.totalRatings).to.equal(1n);
    expect(view.ratingSum).to.equal(5n);
    expect(view.effectivenessSum).to.equal(5n);
    expect(view.reusabilitySum).to.equal(4n);
  });
});

