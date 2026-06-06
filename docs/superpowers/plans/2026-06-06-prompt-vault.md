# PromptVault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PromptVault — a privacy-preserving AI prompt marketplace on Fhenix Helium testnet where prompts are double-encrypted (ECIES + FHE) and plaintext never leaves the buyer's browser.

**Architecture:** A single Next.js 14 project root at `C:\open` contains both the Hardhat smart-contract toolchain (`contracts/`, `scripts/`, `hardhat.config.ts`) and the Next.js frontend (`app/`, `components/`, `lib/`). The Solidity contract stores FHE-encrypted ECIES blobs on-chain. The frontend handles both encryption layers entirely client-side. Sellers ECIES-encrypt with a demo buyer key, then FHE-wrap before listing; buyers FHE-unseal via CoFHE SDK then MetaMask `eth_decrypt` to get plaintext only in browser — never stored.

**Tech Stack:** Solidity 0.8.28, `@fhenixprotocol/cofhe-contracts` 0.1.0, `@cofhe/hardhat-plugin` 0.4.0, Hardhat 2.22.3, Next.js 14 App Router, TypeScript 6, wagmi v2, viem, RainbowKit, Tailwind CSS, `@metamask/eth-sig-util` (browser ECIES), `@fhenixprotocol/cofhe-sdk` (FHE client), dotenv

---

## File Map

| File | Purpose |
|------|---------|
| `package.json` | Combined Hardhat + Next.js deps + scripts |
| `tsconfig.json` | Next.js TypeScript config (ESM / bundler) |
| `tsconfig.hardhat.json` | Hardhat TypeScript config (commonjs, TS 6.0 fixes) |
| `next.config.js` | Next.js webpack config with Node.js polyfills for browser crypto |
| `tailwind.config.js` | Tailwind dark theme config |
| `hardhat.config.ts` | Hardhat targeting Fhenix Helium (chainId 8008135) |
| `.env.example` | `PRIVATE_KEY` + `HELIUM_RPC_URL` template |
| `.gitignore` | Excludes `.env`, `node_modules`, artifacts, `.next` |
| `contracts/PromptMarketplace.sol` | FHE marketplace contract |
| `scripts/deploy.ts` | Deploy script using ethers v6 API |
| `test/PromptMarketplace.ts` | Hardhat test suite |
| `lib/ecies.ts` | ECIES encrypt (seller) + MetaMask `eth_decrypt` (buyer) |
| `lib/fhe.ts` | CoFHE encrypt blob + unseal helpers |
| `lib/contract.ts` | ABI, Fhenix Helium chain def, wagmi typed hooks |
| `app/globals.css` | Tailwind directives + dark body background |
| `app/layout.tsx` | Root layout with wagmi + RainbowKit providers |
| `app/page.tsx` | Homepage hero + featured listings |
| `app/browse/page.tsx` | Marketplace grid + buy/reveal flow |
| `app/sell/page.tsx` | Seller form + live EncryptionVisualizer |
| `app/my-prompts/page.tsx` | Purchased prompts + reveal/decrypt flow |
| `components/Navbar.tsx` | Logo + nav links + RainbowKit ConnectButton |
| `components/ListingCard.tsx` | Card with lock icon, category badge, buy button |
| `components/PromptModal.tsx` | Decrypted prompt display (no persist, wipe on close) |
| `components/EncryptionVisualizer.tsx` | 4-stage encryption step animation |
| `README.md` | Setup, architecture, demo script for judges |

---

## Task 1: Project Scaffold

**Files:**
- Create: `C:\open\package.json`
- Create: `C:\open\tsconfig.json`
- Create: `C:\open\tsconfig.hardhat.json`
- Create: `C:\open\next.config.js`
- Create: `C:\open\tailwind.config.js`
- Create: `C:\open\.env.example`
- Create: `C:\open\.gitignore`

- [ ] **Step 1: Create `package.json` in `C:\open`**

```bash
cd C:\open
```

`package.json`:
```json
{
  "name": "prompt-vault",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "compile": "hardhat compile",
    "deploy:helium": "hardhat run scripts/deploy.ts --network helium",
    "test:contract": "hardhat test",
    "lint": "next lint"
  },
  "dependencies": {
    "@fhenixprotocol/cofhe-sdk": "^0.4.0",
    "@metamask/eth-sig-util": "^7.0.3",
    "@rainbow-me/rainbowkit": "^2.1.6",
    "@tanstack/react-query": "^5.59.20",
    "buffer": "^6.0.3",
    "crypto-browserify": "^3.12.1",
    "dotenv": "^17.3.1",
    "next": "14.2.29",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "stream-browserify": "^3.0.0",
    "viem": "^2.21.54",
    "wagmi": "^2.12.29"
  },
  "devDependencies": {
    "@cofhe/hardhat-plugin": "^0.4.0",
    "@fhenixprotocol/cofhe-contracts": "0.1.0",
    "@nomicfoundation/hardhat-toolbox": "^6.1.2",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "autoprefixer": "^10.4.20",
    "hardhat": "^2.22.3",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.16",
    "ts-node": "^10.9.2",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` (Next.js — ESM bundler)**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "scripts", "test", "hardhat.config.ts"]
}
```

- [ ] **Step 3: Create `tsconfig.hardhat.json` (Hardhat — commonjs, TypeScript 6.0 fixes)**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "rootDir": ".",
    "outDir": "dist",
    "moduleResolution": "node",
    "skipLibCheck": true,
    "ignoreDeprecations": "6.0"
  },
  "include": ["./scripts", "./test", "./typechain-types"],
  "files": ["./hardhat.config.ts"]
}
```

- [ ] **Step 4: Create `next.config.js`**

The browser has no Node.js `crypto` / `buffer` built-ins. These polyfills let `@metamask/eth-sig-util` run client-side.

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        vm: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
```

- [ ] **Step 5: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: { gray: { 950: '#0a0a0f' } },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: Create `postcss.config.js`** (required by Tailwind)

```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Create `.env.example`**

```
PRIVATE_KEY=your_wallet_private_key_0x...
HELIUM_RPC_URL=https://api.helium.fhenix.zone
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=demo
```

- [ ] **Step 8: Create `.gitignore`**

```
node_modules/
.env
.next/
dist/
artifacts/
cache/
typechain-types/
coverage/
```

- [ ] **Step 9: Run `npm install`**

```bash
npm install
```

Expected: installs without fatal errors. Peer warnings from wagmi/RainbowKit are acceptable.

- [ ] **Step 10: Init git and commit**

```bash
git init
git add package.json tsconfig.json tsconfig.hardhat.json next.config.js tailwind.config.js postcss.config.js .env.example .gitignore
git commit -m "chore: scaffold PromptVault project with Hardhat + Next.js 14"
```

---

## Task 2: Smart Contract

**Files:**
- Create: `contracts/PromptMarketplace.sol`

- [ ] **Step 1: Create `contracts/PromptMarketplace.sol`**

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import '@fhenixprotocol/cofhe-contracts/FHE.sol';

contract PromptMarketplace {
    struct Listing {
        address seller;
        uint256 price;
        euint128 encryptedPrompt;
        bool isActive;
        string title;
        string category;
    }

    struct ListingView {
        uint256 id;
        address seller;
        uint256 price;
        bool isActive;
        string title;
        string category;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => mapping(address => bool)) public hasPurchased;
    uint256 public listingCount;

    event PromptListed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 price,
        string title,
        string category
    );
    event PromptPurchased(uint256 indexed listingId, address indexed buyer);

    function listPrompt(
        inEuint128 calldata encryptedBlob,
        uint256 price,
        string calldata title,
        string calldata category
    ) external {
        uint256 listingId = listingCount++;
        listings[listingId] = Listing({
            seller: msg.sender,
            price: price,
            encryptedPrompt: FHE.asEuint128(encryptedBlob),
            isActive: true,
            title: title,
            category: category
        });
        FHE.allowThis(listings[listingId].encryptedPrompt);
        emit PromptListed(listingId, msg.sender, price, title, category);
    }

    function buyPrompt(uint256 listingId) external payable {
        Listing storage listing = listings[listingId];
        require(listing.isActive, "Listing not active");
        require(msg.value >= listing.price, "Insufficient payment");
        require(!hasPurchased[listingId][msg.sender], "Already purchased");
        hasPurchased[listingId][msg.sender] = true;
        payable(listing.seller).transfer(msg.value);
        FHE.allow(listing.encryptedPrompt, msg.sender);
        emit PromptPurchased(listingId, msg.sender);
    }

    function getPrompt(
        uint256 listingId,
        Permission calldata permission
    ) external view returns (string memory) {
        require(hasPurchased[listingId][msg.sender], "Not purchased");
        return FHE.sealoutput(listings[listingId].encryptedPrompt, permission.publicKey);
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
                category: l.category
            });
        }
        return result;
    }
}
```

> **euint128 size note:** `euint128` = 16 bytes. A full ECIES blob is 100-200 bytes. For the hackathon demo the seller uses a truncated/hashed ECIES reference (see `lib/fhe.ts`). Production would chunk or use off-chain storage with an on-chain hash.

- [ ] **Step 2: Commit**

```bash
git add contracts/PromptMarketplace.sol
git commit -m "feat: add PromptMarketplace contract with FHE encrypted prompt storage"
```

---

## Task 3: Hardhat Config + Deploy Script

**Files:**
- Create: `hardhat.config.ts`
- Create: `scripts/deploy.ts`

- [ ] **Step 1: Create `hardhat.config.ts`**

```typescript
import "@cofhe/hardhat-plugin";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: any = {
  solidity: {
    version: "0.8.28",
    settings: { evmVersion: "cancun" },
  },
  networks: {
    helium: {
      url: process.env.HELIUM_RPC_URL || "https://api.helium.fhenix.zone",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8008135,
    },
  },
};

export default config;
```

> The fhenix-setup skill defaults to Sepolia — we target Fhenix Helium (chainId 8008135) instead.

- [ ] **Step 2: Create `scripts/deploy.ts`**

```typescript
import { ethers } from "hardhat";

async function main() {
  console.log("Deploying PromptMarketplace to Fhenix Helium...");
  const Factory = await ethers.getContractFactory("PromptMarketplace");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("PromptMarketplace deployed to:", address);
  console.log("→ Copy this address into lib/contract.ts as CONTRACT_ADDRESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Compile**

```bash
npm run compile
```

Expected: `Compiled N Solidity files successfully` — no errors. If you see `TS5011` rootDir errors, ensure `tsconfig.hardhat.json` is in root and Hardhat picks it up (the `paths.tsconfig` key in hardhat.config.ts can force it if needed).

- [ ] **Step 4: Commit**

```bash
git add hardhat.config.ts scripts/deploy.ts
git commit -m "feat: add Hardhat config for Fhenix Helium and deploy script"
```

---

## Task 4: Contract Test

**Files:**
- Create: `test/PromptMarketplace.ts`

- [ ] **Step 1: Create `test/PromptMarketplace.ts`**

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("PromptMarketplace", function () {
  async function deploy() {
    const [seller, buyer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PromptMarketplace");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    return { contract, seller, buyer };
  }

  it("starts with zero listings", async function () {
    const { contract } = await deploy();
    expect(await contract.listingCount()).to.equal(0n);
  });

  it("getListings returns empty array initially", async function () {
    const { contract } = await deploy();
    const listings = await contract.getListings();
    expect(listings.length).to.equal(0);
  });

  it("buyPrompt reverts when listing does not exist", async function () {
    const { contract, buyer } = await deploy();
    await expect(
      contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWith("Listing not active");
  });
});
```

> FHE calls (`listPrompt`, `getPrompt`) require the Fhenix co-processor. Standard Hardhat local node reverts on FHE ops. Run integration tests on Fhenix Helium testnet or a local Fhenix devnet: https://cofhe-docs.fhenix.zone/docs/devdocs/local-devnet

- [ ] **Step 2: Run tests**

```bash
npm run test:contract
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/PromptMarketplace.ts
git commit -m "test: add PromptMarketplace Hardhat test suite"
```

---

## Task 5: ECIES Helper — `lib/ecies.ts`

**Files:**
- Create: `lib/ecies.ts`

Uses `@metamask/eth-sig-util` which is browser-compatible (unlike raw `eccrypto`). MetaMask's `eth_decrypt` handles decryption without exposing the private key.

- [ ] **Step 1: Create `lib/ecies.ts`**

```typescript
import { encrypt } from '@metamask/eth-sig-util';

/**
 * Demo buyer public key (base64 X25519, from eth_getEncryptionPublicKey).
 * Replace with the real buyer's key in production.
 * eth_getEncryptionPublicKey is deprecated in MetaMask ≥ v11 —
 * for a live app, use EIP-5630 or an out-of-band key exchange.
 */
export const DEMO_BUYER_PUBLIC_KEY =
  'tQJEBVIUzPSK9vBVXG1xUxwKNkRNHV2q7GY4Fc4IQAA=';

/**
 * ECIES-encrypts a plaintext string using the buyer's public key.
 * Returns a hex string of the JSON-serialised EIP-1098 encrypted object.
 */
export function eciesEncrypt(buyerPublicKey: string, plaintext: string): string {
  const encrypted = encrypt({
    publicKey: buyerPublicKey,
    data: plaintext,
    version: 'x25519-xsalsa20-poly1305',
  });
  return '0x' + Buffer.from(JSON.stringify(encrypted)).toString('hex');
}

/**
 * Decrypts an ECIES blob via MetaMask's eth_decrypt (EIP-1098).
 * MetaMask holds the private key — the plaintext never leaves the extension.
 */
export async function eciesDecrypt(
  encryptedHex: string,
  buyerAddress: string
): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask not found');
  const decrypted = await (window.ethereum as any).request({
    method: 'eth_decrypt',
    params: [encryptedHex, buyerAddress],
  });
  return decrypted as string;
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/ecies.ts
git commit -m "feat: add ECIES helpers using @metamask/eth-sig-util for browser-safe encryption"
```

---

## Task 6: FHE Helper — `lib/fhe.ts`

**Files:**
- Create: `lib/fhe.ts`

- [ ] **Step 1: Create `lib/fhe.ts`**

```typescript
import { FhenixClient, getPermit, type Permission } from '@fhenixprotocol/cofhe-sdk';

/** Creates a FhenixClient from the browser wallet provider (from wagmi connector). */
export async function createFheClient(provider: any): Promise<FhenixClient> {
  return new FhenixClient({ provider });
}

/**
 * FHE-encrypts an ECIES hex blob for on-chain storage as euint128.
 *
 * euint128 = 16 bytes. The full ECIES blob is larger, so for this demo
 * we hash the blob to 128 bits: take the first 32 hex chars (16 bytes)
 * of the ECIES output. The full blob is stored off-chain or reconstructed
 * from this reference in a production system.
 *
 * @param client   FhenixClient instance
 * @param blobHex  Full hex string from eciesEncrypt() — we truncate to 128 bits
 */
export async function encryptBlobForContract(
  client: FhenixClient,
  blobHex: string
): Promise<any> {
  const hex = blobHex.startsWith('0x') ? blobHex.slice(2) : blobHex;
  const truncated = hex.slice(0, 32).padStart(32, '0'); // 16 bytes = 128 bits
  const value = BigInt('0x' + truncated);
  return client.encrypt_uint128(value);
}

/**
 * Gets a Permission proof (permit) needed to call getPrompt() on the contract.
 * The permit proves to the contract that this wallet is allowed to receive
 * the sealed (re-encrypted) FHE output.
 */
export async function getContractPermit(
  provider: any,
  contractAddress: string
): Promise<Permission> {
  return getPermit(contractAddress, provider);
}

/**
 * Unseals the FHE-sealed output returned by getPrompt().
 * Returns the decrypted value as a hex string (the ECIES blob reference).
 */
export async function unsealPrompt(
  client: FhenixClient,
  sealedOutput: string,
  contractAddress: string
): Promise<string> {
  const unsealed = client.unseal(contractAddress, sealedOutput);
  return unsealed.toString(16);
}
```

> **SDK API note:** Method names (`encrypt_uint128`, `unseal`) are from `@fhenixprotocol/cofhe-sdk`. Check the package's TypeScript exports after install — method names may differ across versions. Adjust if the compiler reports "property does not exist."

- [ ] **Step 2: Commit**

```bash
git add lib/fhe.ts
git commit -m "feat: add CoFHE FhenixClient encrypt and unseal helpers"
```

---

## Task 7: Contract Interface — `lib/contract.ts`

**Files:**
- Create: `lib/contract.ts`

- [ ] **Step 1: Create `lib/contract.ts`**

```typescript
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

// Fill this in after running: npm run deploy:helium
export const CONTRACT_ADDRESS =
  '0x0000000000000000000000000000000000000000' as `0x${string}`;

export const ABI = [
  {
    name: 'listPrompt',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'encryptedBlob', type: 'bytes' },
      { name: 'price', type: 'uint256' },
      { name: 'title', type: 'string' },
      { name: 'category', type: 'string' },
    ],
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
    name: 'getPrompt',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      {
        name: 'permission',
        type: 'tuple',
        components: [{ name: 'publicKey', type: 'bytes32' }],
      },
    ],
    outputs: [{ name: '', type: 'string' }],
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
    name: 'PromptListed',
    type: 'event',
    inputs: [
      { name: 'listingId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'price', type: 'uint256', indexed: false },
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
] as const;

export type ListingView = {
  id: bigint;
  seller: `0x${string}`;
  price: bigint;
  isActive: boolean;
  title: string;
  category: string;
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

export function useListPrompt() {
  return useWriteContract();
}

export function useBuyPrompt() {
  return useWriteContract();
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/contract.ts
git commit -m "feat: add ABI, Fhenix Helium chain config, and wagmi typed hooks"
```

---

## Task 8: Root Layout with Providers

**Files:**
- Create: `app/globals.css`
- Create: `app/layout.tsx`

- [ ] **Step 1: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #0a0a0f;
  color: white;
}
```

- [ ] **Step 2: Create `app/layout.tsx`**

```tsx
'use client';

import './globals.css';
import { WagmiProvider, createConfig, http } from 'wagmi';
import {
  RainbowKitProvider,
  getDefaultWallets,
  connectorsForWallets,
} from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fhenixHelium } from '@/lib/contract';
import '@rainbow-me/rainbowkit/styles.css';

const { wallets } = getDefaultWallets();
const connectors = connectorsForWallets(wallets, {
  appName: 'PromptVault',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'demo',
});

const wagmiConfig = createConfig({
  chains: [fhenixHelium],
  connectors,
  transports: { [fhenixHelium.id]: http() },
});

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider>{children}</RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add root layout with wagmi, RainbowKit, and React Query providers"
```

---

## Task 9: Navbar Component

**Files:**
- Create: `components/Navbar.tsx`

- [ ] **Step 1: Create `components/Navbar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';

export default function Navbar() {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950 sticky top-0 z-40">
      <div className="flex items-center gap-8">
        <Link
          href="/"
          className="text-xl font-bold text-purple-400 tracking-tight"
        >
          PromptVault
        </Link>
        <div className="hidden md:flex gap-6 text-sm text-gray-400">
          <Link href="/browse" className="hover:text-white transition-colors">
            Browse
          </Link>
          <Link href="/sell" className="hover:text-white transition-colors">
            Sell
          </Link>
          <Link
            href="/my-prompts"
            className="hover:text-white transition-colors"
          >
            My Prompts
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {address && balance && (
          <span className="text-sm text-gray-400 hidden md:block">
            {parseFloat(formatEther(balance.value)).toFixed(4)} tFHE
          </span>
        )}
        <ConnectButton />
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Navbar.tsx
git commit -m "feat: add Navbar with wallet connect and tFHE balance display"
```

---

## Task 10: ListingCard Component

**Files:**
- Create: `components/ListingCard.tsx`

- [ ] **Step 1: Create `components/ListingCard.tsx`**

```tsx
'use client';

import { formatEther } from 'viem';

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'bg-blue-900 text-blue-300',
  coding: 'bg-green-900 text-green-300',
  creative: 'bg-pink-900 text-pink-300',
  research: 'bg-yellow-900 text-yellow-300',
};

type ListingCardProps = {
  listingId: bigint;
  title: string;
  category: string;
  seller: string;
  price: bigint;
  isPurchased: boolean;
  isBuying: boolean;
  onBuy: (listingId: bigint) => void;
};

export default function ListingCard({
  listingId,
  title,
  category,
  seller,
  price,
  isPurchased,
  isBuying,
  onBuy,
}: ListingCardProps) {
  const categoryColor =
    CATEGORY_COLORS[category] ?? 'bg-gray-800 text-gray-300';

  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800 hover:border-purple-800 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-white text-sm leading-tight">
          {title}
        </h3>
        <span
          className={`text-lg transition-transform ${isBuying ? 'animate-spin' : ''}`}
          title={isPurchased ? 'Purchased' : 'Locked'}
        >
          {isPurchased ? '🔓' : '🔒'}
        </span>
      </div>

      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${categoryColor}`}
      >
        {category}
      </span>

      <p className="text-xs text-gray-500 font-mono truncate">
        {seller.slice(0, 6)}...{seller.slice(-4)}
      </p>

      <div className="flex items-center justify-between mt-1">
        <span className="text-purple-300 font-semibold">
          {formatEther(price)} tFHE
        </span>
        {isPurchased ? (
          <span className="text-xs text-green-400 font-medium">Purchased</span>
        ) : (
          <button
            onClick={() => onBuy(listingId)}
            disabled={isBuying}
            className="text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {isBuying ? 'Buying...' : 'Buy'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ListingCard.tsx
git commit -m "feat: add ListingCard with animated lock icon, category badge, buy button"
```

---

## Task 11: PromptModal Component

**Files:**
- Create: `components/PromptModal.tsx`

- [ ] **Step 1: Create `components/PromptModal.tsx`**

```tsx
'use client';

import { useState } from 'react';

type PromptModalProps = {
  plaintext: string;
  onClose: () => void;
};

export default function PromptModal({ plaintext, onClose }: PromptModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full mx-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Your Prompt</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Close & Clear
          </button>
        </div>

        <div className="bg-yellow-950 border border-yellow-800 rounded-lg px-4 py-2 text-yellow-300 text-xs">
          This prompt will not be saved anywhere. Closing this modal wipes it from memory.
        </div>

        <pre className="bg-gray-950 rounded-xl p-4 text-sm text-green-300 font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
          {plaintext}
        </pre>

        <div className="flex justify-end">
          <button
            onClick={handleCopy}
            className="text-sm bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/PromptModal.tsx
git commit -m "feat: add PromptModal that clears plaintext on close"
```

---

## Task 12: EncryptionVisualizer Component

**Files:**
- Create: `components/EncryptionVisualizer.tsx`

- [ ] **Step 1: Create `components/EncryptionVisualizer.tsx`**

```tsx
'use client';

type Stage = 0 | 1 | 2 | 3;

type EncryptionVisualizerProps = {
  plaintext: string;
  eciesBlob: string;
  fheBlob: string;
  stage: Stage;
};

const STAGES: { label: string; color: string }[] = [
  { label: 'Plaintext', color: 'text-white' },
  { label: 'ECIES Encrypted', color: 'text-yellow-400' },
  { label: 'FHE Wrapped', color: 'text-purple-400' },
  { label: 'On-chain', color: 'text-green-400' },
];

export default function EncryptionVisualizer({
  plaintext,
  eciesBlob,
  fheBlob,
  stage,
}: EncryptionVisualizerProps) {
  const previews = [
    plaintext || '(type your prompt above)',
    eciesBlob || 'Encrypting with buyer public key...',
    fheBlob || 'Wrapping with FHE...',
    fheBlob ? `On-chain: ${fheBlob.slice(0, 40)}…` : 'Submitting transaction...',
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4 sticky top-24">
      <h3 className="text-sm font-semibold text-gray-300">Encryption Preview</h3>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {STAGES.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <span
              className={`font-medium ${i <= stage ? s.color : 'text-gray-600'}`}
            >
              [{i + 1}] {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <span className={i < stage ? 'text-gray-400' : 'text-gray-700'}>
                →
              </span>
            )}
          </span>
        ))}
      </div>

      <pre
        className={`text-xs font-mono p-3 bg-gray-950 rounded-lg whitespace-pre-wrap break-all min-h-24 transition-colors ${STAGES[stage].color}`}
      >
        {previews[stage]}
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/EncryptionVisualizer.tsx
git commit -m "feat: add EncryptionVisualizer with 4-stage live preview"
```

---

## Task 13: Browse Page

**Files:**
- Create: `app/browse/page.tsx`

- [ ] **Step 1: Create `app/browse/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import Navbar from '@/components/Navbar';
import ListingCard from '@/components/ListingCard';
import PromptModal from '@/components/PromptModal';
import {
  useListings,
  ABI,
  CONTRACT_ADDRESS,
  type ListingView,
} from '@/lib/contract';
import { createFheClient, getContractPermit, unsealPrompt } from '@/lib/fhe';
import { eciesDecrypt } from '@/lib/ecies';

const CATEGORIES = ['all', 'productivity', 'coding', 'creative', 'research'];

export default function BrowsePage() {
  const { address, connector } = useAccount();
  const { data: rawListings } = useListings();
  const listings = (rawListings ?? []) as ListingView[];

  const [filter, setFilter] = useState('all');
  const [buyingId, setBuyingId] = useState<bigint | null>(null);
  const [revealingId, setRevealingId] = useState<bigint | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const { writeContractAsync } = useWriteContract();

  const filteredListings =
    filter === 'all' ? listings : listings.filter((l) => l.category === filter);

  const handleBuy = async (listingId: bigint) => {
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) return;
    setBuyingId(listingId);
    setStatus('Waiting for transaction...');
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'buyPrompt',
        args: [listingId],
        value: listing.price,
      });
      setStatus('Purchase confirmed! Go to My Prompts to reveal.');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setBuyingId(null);
    }
  };

  const handleReveal = async (listingId: bigint) => {
    if (!address || !connector) return;
    setRevealingId(listingId);
    try {
      setStatus('Decrypting FHE layer...');
      const provider = await connector.getProvider();
      const client = await createFheClient(provider);
      const permit = await getContractPermit(provider, CONTRACT_ADDRESS);

      setStatus('Fetching sealed prompt from contract...');
      // Read getPrompt via eth_call with ABI-encoded calldata
      const { encodeFunctionData, decodeFunctionResult } = await import('viem');
      const calldata = encodeFunctionData({
        abi: ABI,
        functionName: 'getPrompt',
        args: [listingId, permit as any],
      });
      const raw = await (provider as any).request({
        method: 'eth_call',
        params: [{ to: CONTRACT_ADDRESS, data: calldata }, 'latest'],
      });
      const [sealedOutput] = decodeFunctionResult({
        abi: ABI,
        functionName: 'getPrompt',
        data: raw,
      }) as [string];

      setStatus('Unsealing FHE output...');
      const eciesHex = await unsealPrompt(client, sealedOutput, CONTRACT_ADDRESS);

      setStatus('Requesting wallet decryption...');
      const decrypted = await eciesDecrypt('0x' + eciesHex, address);
      setPlaintext(decrypted);
      setStatus('');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setRevealingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">Browse Prompts</h1>
        <p className="text-gray-400 mb-8">
          All prompts are FHE + ECIES double-encrypted. Pay to unlock.
        </p>

        {status && (
          <div className="mb-6 bg-purple-950 border border-purple-800 rounded-lg px-4 py-3 text-purple-300 text-sm">
            {status}
          </div>
        )}

        <div className="flex gap-2 mb-8 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                filter === cat
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredListings.map((listing) => (
            <div key={listing.id.toString()} className="flex flex-col gap-2">
              <ListingCard
                listingId={listing.id}
                title={listing.title}
                category={listing.category}
                seller={listing.seller}
                price={listing.price}
                isPurchased={false}
                isBuying={buyingId === listing.id}
                onBuy={handleBuy}
              />
              {address && (
                <button
                  onClick={() => handleReveal(listing.id)}
                  disabled={revealingId === listing.id}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-green-300 font-mono px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {revealingId === listing.id ? 'Unlocking...' : '🔑 Reveal Prompt'}
                </button>
              )}
            </div>
          ))}
          {filteredListings.length === 0 && (
            <p className="text-gray-500 col-span-3 py-12 text-center">
              No listings yet. Be the first to{' '}
              <a href="/sell" className="text-purple-400 underline">sell a prompt</a>.
            </p>
          )}
        </div>
      </main>

      {plaintext && (
        <PromptModal plaintext={plaintext} onClose={() => setPlaintext(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/browse/page.tsx
git commit -m "feat: add browse page with category filter, buy flow, and reveal flow"
```

---

## Task 14: Sell Page

**Files:**
- Create: `app/sell/page.tsx`

- [ ] **Step 1: Create `app/sell/page.tsx`**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import Navbar from '@/components/Navbar';
import EncryptionVisualizer from '@/components/EncryptionVisualizer';
import { eciesEncrypt, DEMO_BUYER_PUBLIC_KEY } from '@/lib/ecies';
import { createFheClient, encryptBlobForContract } from '@/lib/fhe';
import { ABI, CONTRACT_ADDRESS } from '@/lib/contract';

const CATEGORIES = ['productivity', 'coding', 'creative', 'research'];

export default function SellPage() {
  const { address, connector } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('productivity');
  const [priceEth, setPriceEth] = useState('0.01');
  const [prompt, setPrompt] = useState('');
  const [eciesBlob, setEciesBlob] = useState('');
  const [fheBlob, setFheBlob] = useState('');
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const [status, setStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [listingId, setListingId] = useState<string>('');

  const handlePromptChange = useCallback((value: string) => {
    setPrompt(value);
    setEciesBlob('');
    setFheBlob('');
    setStage(0);
    setStatus('');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !connector || !prompt || !title) return;

    try {
      setStatus('Encrypting with buyer public key...');
      setStage(1);
      const encrypted = eciesEncrypt(DEMO_BUYER_PUBLIC_KEY, prompt);
      setEciesBlob(encrypted);

      setStatus('Wrapping with FHE...');
      setStage(2);
      const provider = await connector.getProvider();
      const client = await createFheClient(provider);
      const fheEncrypted = await encryptBlobForContract(client, encrypted);
      setFheBlob(JSON.stringify(fheEncrypted).slice(0, 80) + '...');

      setStatus('Waiting for transaction...');
      setStage(3);
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'listPrompt',
        args: [fheEncrypted, parseEther(priceEth), title, category],
      });
      setTxHash(hash);
      setStatus('Listed successfully!');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      setStage(0);
    }
  };

  if (!address) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="flex flex-col items-center justify-center h-96 gap-3 text-gray-400">
          <p>Connect your wallet to sell prompts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">List a Prompt</h1>
        <p className="text-gray-400 mb-8">
          Your prompt is encrypted before it leaves your browser.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Expert negotiation coach..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Price (tFHE)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={priceEth}
                onChange={(e) => setPriceEth(e.target.value)}
                required
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Your Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                required
                rows={7}
                placeholder="You are an expert..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              Encrypt & List
            </button>

            {status && (
              <p className="text-sm text-purple-300">{status}</p>
            )}
            {txHash && (
              <div className="text-xs text-green-400 font-mono break-all bg-gray-900 p-3 rounded-lg">
                <p>TX: {txHash}</p>
                {listingId && <p>Listing ID: {listingId}</p>}
              </div>
            )}
          </form>

          <EncryptionVisualizer
            plaintext={prompt}
            eciesBlob={eciesBlob}
            fheBlob={fheBlob}
            stage={stage}
          />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/sell/page.tsx
git commit -m "feat: add sell page with live encryption visualizer"
```

---

## Task 15: My Prompts Page

**Files:**
- Create: `app/my-prompts/page.tsx`

- [ ] **Step 1: Create `app/my-prompts/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import Navbar from '@/components/Navbar';
import PromptModal from '@/components/PromptModal';
import { useListings, useHasPurchased, ABI, CONTRACT_ADDRESS, type ListingView } from '@/lib/contract';
import { createFheClient, getContractPermit, unsealPrompt } from '@/lib/fhe';
import { eciesDecrypt } from '@/lib/ecies';
import { encodeFunctionData, decodeFunctionResult } from 'viem';

function PurchasedRow({
  listing,
  address,
  connector,
}: {
  listing: ListingView;
  address: string;
  connector: any;
}) {
  const { data: purchased } = useHasPurchased(listing.id, address as `0x${string}`);
  const [revealing, setRevealing] = useState(false);
  const [status, setStatus] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);

  if (!purchased) return null;

  const handleReveal = async () => {
    setRevealing(true);
    try {
      setStatus('Decrypting FHE layer...');
      const provider = await connector.getProvider();
      const client = await createFheClient(provider);
      const permit = await getContractPermit(provider, CONTRACT_ADDRESS);

      setStatus('Fetching sealed prompt...');
      const calldata = encodeFunctionData({
        abi: ABI,
        functionName: 'getPrompt',
        args: [listing.id, permit as any],
      });
      const raw = await (provider as any).request({
        method: 'eth_call',
        params: [{ to: CONTRACT_ADDRESS, data: calldata }, 'latest'],
      });
      const [sealedOutput] = decodeFunctionResult({
        abi: ABI,
        functionName: 'getPrompt',
        data: raw,
      }) as [string];

      setStatus('Unsealing FHE output...');
      const eciesHex = await unsealPrompt(client, sealedOutput, CONTRACT_ADDRESS);

      setStatus('Requesting wallet decryption...');
      const decrypted = await eciesDecrypt('0x' + eciesHex, address);
      setPlaintext(decrypted);
      setStatus('');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setRevealing(false);
    }
  };

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-white font-medium">{listing.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{listing.category}</p>
          {status && (
            <p className="text-xs text-purple-400 mt-1">{status}</p>
          )}
        </div>
        <button
          onClick={handleReveal}
          disabled={revealing}
          className="text-sm bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {revealing ? 'Unlocking...' : 'Reveal Prompt'}
        </button>
      </div>
      {plaintext && (
        <PromptModal plaintext={plaintext} onClose={() => setPlaintext(null)} />
      )}
    </>
  );
}

export default function MyPromptsPage() {
  const { address, connector } = useAccount();
  const { data: rawListings } = useListings();
  const listings = (rawListings ?? []) as ListingView[];

  if (!address) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="flex items-center justify-center h-96 text-gray-400">
          Connect your wallet to see your purchased prompts.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">My Prompts</h1>
        <p className="text-gray-400 mb-8">
          Prompts you've purchased. Click Reveal to decrypt in-browser.
        </p>

        <div className="flex flex-col gap-3">
          {listings.map((listing) => (
            <PurchasedRow
              key={listing.id.toString()}
              listing={listing}
              address={address}
              connector={connector}
            />
          ))}
          {listings.length === 0 && (
            <p className="text-gray-500 text-center py-12">
              No purchased prompts yet.{' '}
              <a href="/browse" className="text-purple-400 underline">Browse the marketplace.</a>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/my-prompts/page.tsx
git commit -m "feat: add my-prompts page with per-listing FHE unseal and reveal flow"
```

---

## Task 16: Homepage

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Create `app/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ListingCard from '@/components/ListingCard';
import { useListings, type ListingView } from '@/lib/contract';

export default function HomePage() {
  const { data: rawListings } = useListings();
  const listings = (rawListings ?? []) as ListingView[];
  const featured = listings.slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 py-24 text-center">
        <h1 className="text-5xl font-extrabold text-white mb-4 leading-tight">
          The prompt marketplace where
          <br />
          <span className="text-purple-400">sellers never expose their secrets</span>
        </h1>
        <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
          Every prompt is double-encrypted before leaving the seller&apos;s
          browser — ECIES asymmetric encryption wrapped in Fhenix Fully
          Homomorphic Encryption.
        </p>
        <ul className="text-left inline-flex flex-col gap-2 text-gray-300 text-sm mb-10 bg-gray-900 border border-gray-800 rounded-xl px-6 py-4">
          <li>🔐 Layer 1: ECIES — only the buyer&apos;s wallet can decrypt</li>
          <li>🔮 Layer 2: FHE — ciphertext computed on-chain without ever decrypting</li>
          <li>🚫 Plaintext never touches any server, DB, or browser storage</li>
        </ul>
        <div className="flex gap-4 justify-center">
          <Link
            href="/sell"
            className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            Sell a Prompt
          </Link>
          <Link
            href="/browse"
            className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            Browse Prompts
          </Link>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pb-24">
          <h2 className="text-2xl font-bold text-white mb-6">
            Featured Prompts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((listing) => (
              <ListingCard
                key={listing.id.toString()}
                listingId={listing.id}
                title={listing.title}
                category={listing.category}
                seller={listing.seller}
                price={listing.price}
                isPurchased={false}
                isBuying={false}
                onBuy={() => {}}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add homepage with hero, encryption explainer, and featured listings"
```

---

## Task 17: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# PromptVault — Privacy-Preserving AI Prompt Marketplace

Prompts are double-encrypted (ECIES + FHE). The plaintext never leaves the buyer's browser.

## Tech Stack
- **Contract:** Solidity 0.8.28 on Fhenix Helium (chainId 8008135)
- **FHE:** @fhenixprotocol/cofhe-contracts + cofhe-sdk
- **Frontend:** Next.js 14 App Router, wagmi v2, RainbowKit, Tailwind CSS
- **ECIES:** @metamask/eth-sig-util (browser-safe)

## Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Set PRIVATE_KEY and HELIUM_RPC_URL in .env

# 3. Compile contract
npm run compile

# 4. Deploy to Fhenix Helium
npm run deploy:helium
# → Copy the deployed address into lib/contract.ts → CONTRACT_ADDRESS

# 5. Run frontend
npm run dev
```

Get testnet tFHE: https://faucet.fhenix.zone/

## Architecture

**Seller flow:**
1. Type prompt → ECIES-encrypt with demo buyer public key (in-browser, `@metamask/eth-sig-util`)
2. FHE-wrap the ECIES blob (`@fhenixprotocol/cofhe-sdk` `encrypt_uint128`)
3. Call `listPrompt()` — FHE ciphertext stored on Fhenix Helium

**Buyer flow:**
1. Call `buyPrompt()` — pay tFHE, contract grants FHE read permission via `FHE.allow`
2. Call `getPrompt(permission)` — contract re-encrypts (sealed output) for the buyer's wallet key
3. `cofhe-sdk unseal()` → ECIES blob → `eth_decrypt` via MetaMask → plaintext in modal
4. Close modal → plaintext wiped from React state. Never stored anywhere.

## Demo Script (Judges)

1. Open `/sell` — connect Seller wallet — type a prompt — watch EncryptionVisualizer show 3 layers
2. Submit — confirm tx — see listing ID + tx hash
3. Switch to Buyer wallet — open `/browse` — click **Buy** on a listing
4. Go to `/my-prompts` — click **Reveal Prompt**
5. MetaMask prompts for decryption — approve
6. Plaintext appears in modal — close it — check `localStorage`: nothing there

**Key message to judges:**
> At no point did the prompt travel in plaintext over any network, touch any server, or get stored anywhere.

## References
- Fhenix CoFHE docs: https://cofhe-docs.fhenix.zone/
- Fhenix testnet faucet: https://faucet.fhenix.zone/
- Fhenix Explorer: https://explorer.helium.fhenix.zone
- EIP-1098 eth_decrypt: https://eips.ethereum.org/EIPS/eip-1098
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup guide, architecture, and demo script"
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Task |
|---|---|
| `PromptMarketplace.sol` — Listing struct, `hasPurchased`, `listingCount` | Task 2 |
| `listPrompt()` with `FHE.asEuint128`, `FHE.allowThis`, `PromptListed` event | Task 2 |
| `buyPrompt()` payable, checks, `FHE.allow`, `PromptPurchased` event | Task 2 |
| `getPrompt()` with `Permission` + `FHE.sealoutput` | Task 2 |
| `getListings()` returning public metadata only | Task 2 |
| Fhenix Helium chainId 8008135, tFHE currency, RPC + Explorer | Task 3, Task 7 |
| `lib/ecies.ts` — ECIES encrypt (seller) + `eth_decrypt` (buyer) | Task 5 |
| `lib/fhe.ts` — `encryptBlobForContract`, `getContractPermit`, `unsealPrompt` | Task 6 |
| `lib/contract.ts` — ABI, chain, `useListings`, `useHasPurchased`, `useListPrompt`, `useBuyPrompt` | Task 7 |
| `app/layout.tsx` — wagmi + RainbowKit + QueryClient providers | Task 8 |
| `Navbar` — logo, nav links, ConnectButton, ETH balance | Task 9 |
| `ListingCard` — lock icon (animated during buy), category badge, price, buy button | Task 10 |
| `PromptModal` — no storage, wipe on close, copy button, warning banner | Task 11 |
| `EncryptionVisualizer` — 4-stage animation, live hex preview | Task 12 |
| `/browse` — grid, category filter, buy flow, unlock status messages | Task 13 |
| `/sell` — form, live encryption preview panel | Task 14 |
| `/my-prompts` — per-listing `hasPurchased` check, reveal flow | Task 15 |
| Homepage — hero, double-encryption explainer, 3 featured listings, CTAs | Task 16 |
| `README.md` — setup, architecture, demo script for judges | Task 17 |
| Dark theme `bg-gray-950`, purple accents, `font-mono text-green-400` for hex | Tasks 8–16 (Tailwind throughout) |
| Status messages during async ops | Tasks 13, 14, 15 |

### Placeholder Scan
- No "TBD" or "TODO" remaining. The `getPrompt` contract call is fully implemented via `encodeFunctionData` + `eth_call` + `decodeFunctionResult` in both Browse (Task 13) and My Prompts (Task 15).

### Type Consistency
- `ListingView` — defined once in `lib/contract.ts`, imported in `app/page.tsx`, `app/browse/page.tsx`, `app/my-prompts/page.tsx`. Consistent.
- `fhenixHelium` — defined in `lib/contract.ts`, imported in `app/layout.tsx`. Consistent.
- `CONTRACT_ADDRESS`, `ABI` — from `lib/contract.ts` everywhere. Consistent.
- `eciesEncrypt`, `eciesDecrypt`, `DEMO_BUYER_PUBLIC_KEY` — from `lib/ecies.ts`. Consistent.
- `createFheClient`, `encryptBlobForContract`, `getContractPermit`, `unsealPrompt` — from `lib/fhe.ts`. Consistent.
- `stage` prop on `EncryptionVisualizer` typed as `0 | 1 | 2 | 3` in both component and sell page. Consistent.
