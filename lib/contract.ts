import { useReadContract, useWriteContract } from 'wagmi';
import type { Chain } from 'viem';

export const sepolia: Chain = {
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://sepolia.etherscan.io',
    },
  },
};

// Deployed to Sepolia: npm run deploy:sepolia
export const CONTRACT_ADDRESS =
  '0xE8225344c716133Cd687206A23Ae9Eb825Ba8a1f' as `0x${string}`;

export const ABI = [
  {
    name: 'listPrompt',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'ipfsCID', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'title', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'specificityScore', type: 'uint8' },
      { name: 'complexityScore', type: 'uint8' },
      { name: 'structureBadges', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    name: 'deactivateListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'buyPrompt',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getPromptCID',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
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
          { name: 'price', type: 'uint256' },
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
  price: bigint;
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
    query: { refetchInterval: 5_000 },
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

export function useBuyPrompt() {
  return useWriteContract();
}

export function useDeactivateListing() {
  return useWriteContract();
}

export function useRatePrompt() {
  return useWriteContract();
}
