/**
 * Seed script — lists 4 test prompts on the deployed Sepolia contract.
 *
 * Each prompt is ECIES-encrypted with DEMO_BUYER_PUBLIC_KEY, uploaded to
 * IPFS via Pinata, then stored on-chain via listPrompt().
 *
 * The buyer at wallet 0xAd1C4453dF163396D2B4A2173212fC73c537652d can
 * buy any listing and decrypt via MetaMask eth_decrypt.
 *
 * Usage:
 *   npm run seed
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { encrypt } from "@metamask/eth-sig-util";

dotenv.config();

// X25519 public key for the buyer wallet.
// Get this by visiting /sell with your wallet connected and clicking "Reveal" next to "Your Encryption Public Key".
// Then set BUYER_PUBLIC_KEY in your .env file and re-run: npm run seed
const BUYER_PUBLIC_KEY = process.env.BUYER_PUBLIC_KEY;
if (!BUYER_PUBLIC_KEY) {
  console.error(
    'ERROR: BUYER_PUBLIC_KEY is not set in .env\n' +
    '  1. Go to http://localhost:3000/sell with wallet 0xAd1C...652d connected\n' +
    '  2. Click "Reveal" next to "Your Encryption Public Key"\n' +
    '  3. Approve the MetaMask prompt\n' +
    '  4. Copy the key and add it to .env as: BUYER_PUBLIC_KEY=<key>\n' +
    '  5. Re-run: npm run seed'
  );
  process.exit(1);
}

const CONTRACT_ADDRESS = "0xE8225344c716133Cd687206A23Ae9Eb825Ba8a1f";

// Sample prompts to seed
const SEED_PROMPTS = [
  {
    title: "Ultimate Code Reviewer",
    category: "coding",
    price: "0.001",
    specificity: 88,
    complexity: 72,
    badges: 0b1111,
    text:
      "You are a senior software engineer with 15 years of experience. " +
      "Review the following code and provide structured feedback. " +
      "Never skip security issues. Always flag: 1) security vulnerabilities, " +
      "2) performance bottlenecks, 3) code smell, 4) missing edge cases. " +
      "Format: ## Summary, ## Critical Issues, ## Suggestions, ## Positives. " +
      "Example: For a SQL query without parameterization, flag SQL injection risk immediately.",
  },
  {
    title: "Product Launch Email Sequence",
    category: "productivity",
    price: "0.002",
    specificity: 75,
    complexity: 60,
    badges: 0b0110,
    text:
      "You are a B2B SaaS copywriter. Write a 5-email launch sequence for a new product. " +
      "Never use generic phrases like 'exciting' or 'revolutionary'. " +
      "Format each email with: Subject, Preview text, Body (max 200 words), CTA. " +
      "Constraints: tone is direct and ROI-focused, audience is CTOs at 50-500 person companies.",
  },
  {
    title: "Research Paper Summariser",
    category: "research",
    price: "0.001",
    specificity: 80,
    complexity: 65,
    badges: 0b0111,
    text:
      "You are an academic research assistant with expertise in synthesising complex papers. " +
      "Summarise the provided research paper. Do not omit methodology or limitations. " +
      "Output format: ## TL;DR (2 sentences), ## Problem, ## Method, ## Key Findings, " +
      "## Limitations, ## Relevance to [field]. " +
      "Example: For an ML paper, always state dataset size and benchmark comparisons.",
  },
  {
    title: "Creative Story Starter",
    category: "creative",
    price: "0.0005",
    specificity: 65,
    complexity: 55,
    badges: 0b0011,
    text:
      "You are a bestselling fiction author. Generate a compelling story opening. " +
      "Avoid clichés like 'It was a dark and stormy night'. " +
      "Respond in third-person limited POV. " +
      "Format: Opening paragraph (hook), Scene setting (2 sentences), " +
      "Character introduction with one defining trait, Inciting incident hint. " +
      "Target: literary fiction readers who enjoy character-driven narratives.",
  },
];

function eciesEncrypt(buyerPublicKey: string, data: Uint8Array): string {
  const base64Data = Buffer.from(data).toString("base64");
  const encrypted = encrypt({
    publicKey: buyerPublicKey,
    data: base64Data,
    version: "x25519-xsalsa20-poly1305",
  });
  return "0x" + Buffer.from(JSON.stringify(encrypted)).toString("hex");
}

async function uploadToIPFS(eciesHex: string): Promise<string> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!jwt) throw new Error("NEXT_PUBLIC_PINATA_JWT is not set in .env");

  // Use Pinata's JSON pinning endpoint — avoids multipart/form-data in Node
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: { eciesHex },
      pinataMetadata: { name: "prompt-vault-ecies" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata upload failed (${response.status}): ${text}`);
  }

  const json = await response.json() as { IpfsHash: string };
  return json.IpfsHash;
}

async function main() {
  const [seller] = await ethers.getSigners();
  console.log(`\nSeeding with seller: ${seller.address}`);
  console.log(`Contract: ${CONTRACT_ADDRESS}\n`);

  const contract = await ethers.getContractAt("PromptMarketplace", CONTRACT_ADDRESS);

  // Fetch existing titles to avoid duplicates
  const existing = await (contract as any).getListings() as { title: string }[];
  const existingTitles = new Set(existing.map((l: { title: string }) => l.title));
  console.log(`Existing listings: ${existingTitles.size} (${[...existingTitles].join(', ') || 'none'})\n`);

  for (const prompt of SEED_PROMPTS) {
    if (existingTitles.has(prompt.title)) {
      console.log(`→ [${prompt.category}] "${prompt.title}" — already exists, skipping\n`);
      continue;
    }
    console.log(`→ [${prompt.category}] "${prompt.title}"`);

    // Step 1: ECIES-encrypt the prompt
    const promptBytes = new TextEncoder().encode(prompt.text);
    const eciesHex = eciesEncrypt(BUYER_PUBLIC_KEY!, promptBytes);
    console.log(`  ✓ ECIES encrypted (${eciesHex.length} chars)`);

    // Step 2: Upload to IPFS
    let cid: string;
    try {
      cid = await uploadToIPFS(eciesHex);
      console.log(`  ✓ IPFS uploaded: ${cid}`);
    } catch (e: any) {
      console.error(`  ✗ IPFS upload failed: ${e.message}`);
      console.log(`  → Skipping "${prompt.title}"`);
      continue;
    }

    // Step 3: List on-chain
    const price = ethers.parseEther(prompt.price);
    const tx = await (contract as any).listPrompt(
      cid,
      price,
      prompt.title,
      prompt.category,
      prompt.specificity,
      prompt.complexity,
      prompt.badges
    );
    await tx.wait();
    console.log(`  ✓ Listed on Sepolia (tx: ${tx.hash})\n`);
  }

  const count = await (contract as any).listingCount();
  console.log(`\nDone! Contract now has ${count} listing(s).`);
  console.log(`View on Sepolia: https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
