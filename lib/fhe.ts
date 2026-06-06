import {
  createCofheClient,
  createCofheConfig,
  type CofheClient,
  type CofheConfig,
} from '@cofhe/sdk/web';
import { FheTypes, type EncryptableUint128 } from '@cofhe/sdk';

export type { CofheClient };

type InEuint128Tuple = readonly [bigint, number, number, `0x${string}`];

export async function createFheClient(
  walletClient: any,
  publicClient: any
): Promise<CofheClient<CofheConfig>> {
  const config = createCofheConfig({ walletClient, publicClient });
  return createCofheClient(config);
}

/**
 * FHE-encrypts a CID string (up to 48 bytes) into 3 × euint128 chunks.
 *
 * The IPFS CID (~59 chars for CIDv1, padded to 48 bytes) cannot fit in a
 * single euint128 (16 bytes), so we split it into 3 chunks of 16 bytes each.
 * All 3 are encrypted in a single CoFHE batch call.
 *
 * Returns three tuples matching the InEuint128 Solidity struct:
 *   (ctHash: uint256, securityZone: uint8, utype: uint8, signature: bytes)
 */
export async function encryptCidForContract(
  client: CofheClient<CofheConfig>,
  cidString: string
): Promise<[InEuint128Tuple, InEuint128Tuple, InEuint128Tuple]> {
  // before encrypting: TextEncoder → bytes, pad/truncate to 48 bytes
  const cidBytes = new TextEncoder().encode(cidString);
  const padded = new Uint8Array(48);
  padded.set(cidBytes.slice(0, 48));

  const chunkToUint128 = (chunk: Uint8Array): bigint => {
    let value = 0n;
    for (const byte of chunk) {
      value = (value << 8n) | BigInt(byte);
    }
    return value;
  };

  const items: EncryptableUint128[] = [
    { data: chunkToUint128(padded.slice(0, 16)), securityZone: 0, utype: FheTypes.Uint128 },
    { data: chunkToUint128(padded.slice(16, 32)), securityZone: 0, utype: FheTypes.Uint128 },
    { data: chunkToUint128(padded.slice(32, 48)), securityZone: 0, utype: FheTypes.Uint128 },
  ];

  const results = await client.encrypt(items).send();

  const toTuple = (r: any): InEuint128Tuple =>
    [r.ctHash as bigint, r.securityZone as number, r.utype as number, r.signature as `0x${string}`] as const;

  return [toTuple(results[0]), toTuple(results[1]), toTuple(results[2])];
}

/**
 * Decrypts 3 FHE ctHash chunks back into the IPFS CID string.
 * Decrypts in parallel then reassembles bytes → TextDecoder → CID string.
 */
export async function decryptCidChunks(
  client: CofheClient<CofheConfig>,
  ctHash0: `0x${string}`,
  ctHash1: `0x${string}`,
  ctHash2: `0x${string}`,
  chainId: number,
  account: `0x${string}`
): Promise<string> {
  const decryptChunk = (ctHash: `0x${string}`) =>
    client
      .decryptForView(BigInt(ctHash), FheTypes.Uint128)
      .setChainId(chainId)
      .setAccount(account)
      .withPermit()
      .send();

  const [r0, r1, r2] = await Promise.all([
    decryptChunk(ctHash0),
    decryptChunk(ctHash1),
    decryptChunk(ctHash2),
  ]);

  const uint128ToBytes = (value: bigint): Uint8Array => {
    const bytes = new Uint8Array(16);
    for (let i = 15; i >= 0; i--) {
      bytes[i] = Number(value & 0xffn);
      value >>= 8n;
    }
    return bytes;
  };

  const combined = new Uint8Array(48);
  combined.set(uint128ToBytes(r0.value as bigint), 0);
  combined.set(uint128ToBytes(r1.value as bigint), 16);
  combined.set(uint128ToBytes(r2.value as bigint), 32);

  // Strip trailing null padding
  let len = 48;
  for (let i = 47; i >= 0; i--) {
    if (combined[i] !== 0) { len = i + 1; break; }
  }

  // after decrypting: TextDecoder → CID string
  return new TextDecoder().decode(combined.slice(0, len));
}

/**
 * FHE-encrypts a single wei amount (bigint) as euint128.
 * Used for both listing prices (seller) and bids (buyer).
 * The amount must fit in uint128 — all reasonable ETH values do.
 *
 * Returns a tuple matching the InEuint128 Solidity struct:
 *   (ctHash: uint256, securityZone: uint8, utype: uint8, signature: bytes)
 */
export async function encryptBidForContract(
  client: CofheClient<CofheConfig>,
  amountWei: bigint
): Promise<InEuint128Tuple> {
  const item: EncryptableUint128 = {
    data: amountWei,
    securityZone: 0,
    utype: FheTypes.Uint128,
  };
  const results = await client.encrypt([item]).send();
  const enc = results[0] as {
    ctHash: bigint;
    securityZone: number;
    utype: number;
    signature: `0x${string}`;
  };
  return [enc.ctHash, enc.securityZone, enc.utype, enc.signature] as const;
}
