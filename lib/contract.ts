import { useReadContract, useWriteContract } from 'wagmi';
import type { Chain } from 'viem';

export const fhenixHelium: Chain = {
  id: 8008135,
  name: 'Fhenix Helium',
  nativeCurrency: { name: 'tFHE', symbol: 'tFHE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.helium.fhenix.zone'] },
  },
  blockExplorers: {
    default: {
      name: 'Fhenix Explorer',
      url: 'https://explorer.helium.fhenix.zone',
    },
  },
};

// Fill in after running: npm run deploy:helium
export const CONTRACT_ADDRESS =
  '0x0000000000000000000000000000000000000000' as `0x${string}`;

// InEuint128 Solidity struct: { ctHash: uint256, securityZone: uint8, utype: uint8, signature: bytes }
const IN_EUINT128_COMPONENTS = [
  { name: 'ctHash', type: 'uint256' },
  { name: 'securityZone', type: 'uint8' },
  { name: 'utype', type: 'uint8' },
  { name: 'signature', type: 'bytes' },
] as const;

export const ABI = [
  {
    name: 'listPrompt',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'cidChunk0', type: 'tuple', components: IN_EUINT128_COMPONENTS },
      { name: 'cidChunk1', type: 'tuple', components: IN_EUINT128_COMPONENTS },
      { name: 'cidChunk2', type: 'tuple', components: IN_EUINT128_COMPONENTS },
      { name: 'encryptedPrice', type: 'tuple', components: IN_EUINT128_COMPONENTS },
      { name: 'title', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'specificityScore', type: 'uint8' },
      { name: 'complexityScore', type: 'uint8' },
      { name: 'structureBadges', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    // Core FHE demo: encrypted bid compared against encrypted price on-chain.
    // FHE.gte(bid, price) + FHE.req() enforced by CoFHE coprocessor.
    // Reverts (returning msg.value) if bid < price without revealing either value.
    name: 'submitBid',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'encryptedBid', type: 'tuple', components: IN_EUINT128_COMPONENTS },
    ],
    outputs: [],
  },
  {
    name: 'getPromptCt',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [
      { name: 'chunk0', type: 'bytes32' },
      { name: 'chunk1', type: 'bytes32' },
      { name: 'chunk2', type: 'bytes32' },
    ],
  },
  {
    name: 'ratePrompt',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'overall', type: 'uint8' },
      { name: 'effectiveness', type: 'uint8' },
      { name: 'reusability', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    name: 'getListings',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'seller', type: 'address' },
          { name: 'isActive', type: 'bool' },
          { name: 'title', type: 'string' },
          { name: 'category', type: 'string' },
          { name: 'specificityScore', type: 'uint8' },
          { name: 'complexityScore', type: 'uint8' },
          { name: 'structureBadges', type: 'uint8' },
          { name: 'totalRatings', type: 'uint256' },
          { name: 'ratingSum', type: 'uint256' },
          { name: 'effectivenessSum', type: 'uint256' },
          { name: 'reusabilitySum', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'hasPurchased',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'buyer', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'hasRated',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'rater', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'PromptListed',
    type: 'event',
    inputs: [
      { name: 'listingId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'category', type: 'string', indexed: false },
    ],
  },
  {
    name: 'PromptPurchased',
    type: 'event',
    inputs: [
      { name: 'listingId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
    ],
  },
  {
    name: 'PromptRated',
    type: 'event',
    inputs: [
      { name: 'listingId', type: 'uint256', indexed: true },
      { name: 'rater', type: 'address', indexed: true },
    ],
  },
] as const;

export type ListingView = {
  id: bigint;
  seller: `0x${string}`;
  isActive: boolean;
  title: string;
  category: string;
  specificityScore: number;
  complexityScore: number;
  structureBadges: number;
  totalRatings: bigint;
  ratingSum: bigint;
  effectivenessSum: bigint;
  reusabilitySum: bigint;
};

export function useListings() {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'getListings',
  });
}

export function useHasPurchased(
  listingId: bigint,
  buyer: `0x${string}` | undefined
) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'hasPurchased',
    args: buyer ? [listingId, buyer] : undefined,
    query: { enabled: !!buyer },
  });
}

export function useHasRated(
  listingId: bigint,
  rater: `0x${string}` | undefined
) {
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'hasRated',
    args: rater ? [listingId, rater] : undefined,
    query: { enabled: !!rater },
  });
}

export function useListPrompt() {
  return useWriteContract();
}

export function useSubmitBid() {
  return useWriteContract();
}

export function useRatePrompt() {
  return useWriteContract();
}
