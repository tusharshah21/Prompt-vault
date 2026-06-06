import { encrypt } from '@metamask/eth-sig-util';

export const DEMO_BUYER_PUBLIC_KEY =
  'tQJEBVIUzPSK9vBVXG1xUxwKNkRNHV2q7GY4Fc4IQAA=';

/**
 * ECIES-encrypts raw bytes using the buyer's X25519 public key.
 * Internally base64-encodes the bytes (eth-sig-util requires a string).
 * Returns a hex-encoded JSON blob suitable for IPFS upload and eth_decrypt.
 */
export function eciesEncrypt(buyerPublicKey: string, data: Uint8Array): string {
  // before encrypting: encode bytes to base64 string for eth-sig-util
  const base64Data = Buffer.from(data).toString('base64');
  const encrypted = encrypt({
    publicKey: buyerPublicKey,
    data: base64Data,
    version: 'x25519-xsalsa20-poly1305',
  });
  return '0x' + Buffer.from(JSON.stringify(encrypted)).toString('hex');
}

/**
 * Decrypts an ECIES hex blob via MetaMask eth_decrypt.
 * Returns raw bytes (the original Uint8Array before encryption).
 * Call new TextDecoder().decode(result) to get the plaintext string.
 */
export async function eciesDecrypt(
  encryptedHex: string,
  buyerAddress: string
): Promise<Uint8Array> {
  if (!window.ethereum) throw new Error('MetaMask not found');
  // MetaMask decrypts and returns the base64 string we passed to encrypt()
  const base64Decrypted = await (window.ethereum as any).request({
    method: 'eth_decrypt',
    params: [encryptedHex, buyerAddress],
  }) as string;
  // after decrypting: decode base64 back to original bytes
  return Buffer.from(base64Decrypted, 'base64');
}

/**
 * Uploads an ECIES hex blob to IPFS via Pinata.
 * Requires NEXT_PUBLIC_PINATA_JWT in your .env.
 * Returns the IPFS CID string (~59 chars for CIDv1).
 */
export async function uploadToIPFS(eciesHex: string): Promise<string> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!jwt) throw new Error('NEXT_PUBLIC_PINATA_JWT is not set in .env');

  const blob = new Blob([eciesHex], { type: 'text/plain' });
  const form = new FormData();
  form.append('file', blob, 'ecies.bin');

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!res.ok) throw new Error(`IPFS upload failed: ${res.statusText}`);
  const json = await res.json();
  return json.IpfsHash as string;
}

/**
 * Fetches an ECIES hex blob from IPFS by CID.
 * Handles both plain-text hex (browser sell flow) and
 * JSON-wrapped { eciesHex } (seed script / pinJSONToIPFS).
 */
export async function fetchFromIPFS(cid: string): Promise<string> {
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.statusText}`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && typeof json.eciesHex === 'string') return json.eciesHex;
  } catch {
    // not JSON — fall through to return raw text
  }
  return text;
}

/**
 * Gets the buyer's encryption public key from MetaMask.
 * Deprecated in MetaMask ≥ v11. Use DEMO_BUYER_PUBLIC_KEY for the hackathon.
 */
export async function getBuyerPublicKey(address: string): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask not found');
  return (window.ethereum as any).request({
    method: 'eth_getEncryptionPublicKey',
    params: [address],
  }) as Promise<string>;
}
