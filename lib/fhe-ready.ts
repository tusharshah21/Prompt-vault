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
  ): Promise<InEuint128> {
    const bytes = new TextEncoder().encode(cid)
    const padded = new Uint8Array(48)
    padded.set(bytes.slice(0, 48))
    return client.encrypt_uint128(padded)
  }

  export async function decryptCID(
    client: FhenixClient,
    provider: any,
    contractAddress: string,
    listingId: bigint
  ): Promise<string> {
    const permit = await getPermit(contractAddress, provider)
    const sealed = await contract.getPromptCID(listingId, permit)
    const bytes = await client.unseal(contractAddress, sealed)
    return new TextDecoder().decode(bytes)
  }

  // In contract — encrypted bid comparison:
  // euint128 bid = FHE.asEuint128(encryptedBid);
  // euint128 price = listings[listingId].encryptedPrice;
  // ebool isEnough = FHE.gte(bid, price);
  // FHE.req(isEnough);
*/

export {};
