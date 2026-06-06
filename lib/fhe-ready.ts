/*
  FHE-READY MODULE — uncomment when Fhenix Helium is live

  Replace ipfsCID string storage with euint128 on-chain and add encrypted
  bid comparison using FHE.gte() — enabling the contract to verify payments
  without seeing bid amounts.

  Switching to Fhenix requires only:
    1. Replacing the chain config in lib/contract.ts with fhenixHelium
    2. Uncommenting this module and replacing lib/ecies.ts IPFS upload/reveal calls
    3. Replacing the contract with the FHE version (euint128 CID chunks + encryptedPrice)

  import { FhenixClient, getPermit } from '@fhenixprotocol/cofhe-sdk'

  export async function encryptCID(
    client: FhenixClient,
    cid: string
  ): Promise<[InEuint128, InEuint128, InEuint128]> {
    // Pad CID to 48 bytes, split into 3 × 16-byte chunks, encrypt each
    const bytes = new TextEncoder().encode(cid)
    const padded = new Uint8Array(48)
    padded.set(bytes.slice(0, 48))
    return Promise.all([
      client.encrypt_uint128(padded.slice(0, 16)),
      client.encrypt_uint128(padded.slice(16, 32)),
      client.encrypt_uint128(padded.slice(32, 48)),
    ]) as Promise<[InEuint128, InEuint128, InEuint128]>
  }

  export async function decryptCID(
    client: FhenixClient,
    provider: any,
    contractAddress: string,
    listingId: bigint,
    chainId: number,
    userAddress: string
  ): Promise<string> {
    const permit = await getPermit(contractAddress, provider)
    // getPromptCt() returns (bytes32 chunk0, bytes32 chunk1, bytes32 chunk2)
    const [chunk0, chunk1, chunk2] = await contract.getPromptCt(listingId)
    const dec0 = await client.decryptForView(chunk0, chainId, userAddress)
    const dec1 = await client.decryptForView(chunk1, chainId, userAddress)
    const dec2 = await client.decryptForView(chunk2, chainId, userAddress)
    const allBytes = new Uint8Array([...dec0, ...dec1, ...dec2])
    // Find null terminator to trim padding
    const end = allBytes.indexOf(0)
    return new TextDecoder().decode(end === -1 ? allBytes : allBytes.slice(0, end))
  }

  // In contract (FHE version) — encrypted bid comparison:
  //
  //   function submitBid(uint256 listingId, InEuint128 calldata encryptedBid) external payable {
  //     euint128 bid = FHE.asEuint128(encryptedBid);
  //     euint128 price = listings[listingId].encryptedPrice;
  //     ebool isEnough = FHE.gte(bid, price);
  //     FHE.req(isEnough);   // reverts without revealing either value if bid < price
  //     hasPurchased[listingId][msg.sender] = true;
  //     FHE.allow(listings[listingId].cidChunk0, msg.sender);
  //     FHE.allow(listings[listingId].cidChunk1, msg.sender);
  //     FHE.allow(listings[listingId].cidChunk2, msg.sender);
  //     payable(listings[listingId].seller).transfer(msg.value);
  //   }
*/

export {};
