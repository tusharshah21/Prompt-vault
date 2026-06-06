'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEther } from 'viem';
import Navbar from '@/components/Navbar';
import EncryptionVisualizer, { type Stage } from '@/components/EncryptionVisualizer';
import { useListPrompt, CONTRACT_ADDRESS, ABI } from '@/lib/contract';
import { createFheClient, encryptCidForContract, encryptBidForContract } from '@/lib/fhe';
import { eciesEncrypt, uploadToIPFS, DEMO_BUYER_PUBLIC_KEY } from '@/lib/ecies';
import {
  computeSpecificity,
  computeComplexity,
  computeConfidence,
  getStructureBadges,
  getStructureBadgesMask,
} from '@/lib/scoring';

const CATEGORIES = ['productivity', 'coding', 'creative', 'research'];

type Scores = {
  specificity: number;
  complexity: number;
  confidence: number;
  badges: string[];
  badgesMask: number;
};

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={color}>{value}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function SellPage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('productivity');
  const [priceEth, setPriceEth] = useState('0.001');
  const [promptText, setPromptText] = useState('');

  const [stage, setStage] = useState<Stage>(0);
  const [eciesBlob, setEciesBlob] = useState('');
  const [ipfsCid, setIpfsCid] = useState('');
  const [fheBlob, setFheBlob] = useState('');
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);

  const [scores, setScores] = useState<Scores>({
    specificity: 0,
    complexity: 0,
    confidence: 0,
    badges: [],
    badgesMask: 0,
  });

  // Debounced scoring — runs on plaintext before any encryption
  useEffect(() => {
    if (!promptText) {
      setScores({ specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0 });
      return;
    }
    const timer = setTimeout(() => {
      const s = computeSpecificity(promptText);
      const c = computeComplexity(promptText);
      const badges = getStructureBadges(promptText);
      const badgesMask = getStructureBadgesMask(promptText);
      const conf = computeConfidence(s, 0, 0);
      setScores({ specificity: s, complexity: c, confidence: conf, badges, badgesMask });
    }, 300);
    return () => clearTimeout(timer);
  }, [promptText]);

  const { writeContractAsync: listPrompt } = useListPrompt();

  const reset = () => {
    setDone(false);
    setStage(0);
    setTitle('');
    setPromptText('');
    setEciesBlob('');
    setIpfsCid('');
    setFheBlob('');
    setScores({ specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0 });
  };

  const handleList = async () => {
    if (!address || !walletClient || !publicClient) {
      setStatus('Connect your wallet first.');
      return;
    }
    if (!title || !promptText) {
      setStatus('Title and prompt text are required.');
      return;
    }
    setDone(false);

    try {
      setStage(1);
      setStatus('Encrypting with ECIES (buyer public key)...');
      // before encrypting: TextEncoder converts prompt string → bytes
      const promptBytes = new TextEncoder().encode(promptText);
      const ecies = eciesEncrypt(DEMO_BUYER_PUBLIC_KEY, promptBytes);
      setEciesBlob(ecies);

      setStage(2);
      setStatus('Uploading ECIES blob to IPFS (Pinata)...');
      const cid = await uploadToIPFS(ecies);
      setIpfsCid(cid);

      setStage(3);
      setStatus('FHE-encrypting IPFS CID + price (CoFHE coprocessor)...');
      const client = await createFheClient(walletClient, publicClient);
      const [chunk0, chunk1, chunk2] = await encryptCidForContract(client, cid);
      // Encrypt price so the blockchain never sees it in plaintext — FHE comparison on submitBid
      const encPrice = await encryptBidForContract(client, parseEther(priceEth));
      setFheBlob('0x' + chunk0[0].toString(16));

      setStage(4);
      setStatus('Submitting transaction to Fhenix Helium...');
      await listPrompt({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'listPrompt',
        args: [
          { ctHash: chunk0[0], securityZone: chunk0[1], utype: chunk0[2], signature: chunk0[3] },
          { ctHash: chunk1[0], securityZone: chunk1[1], utype: chunk1[2], signature: chunk1[3] },
          { ctHash: chunk2[0], securityZone: chunk2[1], utype: chunk2[2], signature: chunk2[3] },
          { ctHash: encPrice[0], securityZone: encPrice[1], utype: encPrice[2], signature: encPrice[3] },
          title,
          category,
          scores.specificity,
          scores.complexity,
          scores.badgesMask,
        ],
      });

      setStatus('');
      setDone(true);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
      setStage(0);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">List a Prompt</h1>
        <p className="text-gray-400 mb-8">
          Prompts are ECIES-encrypted, uploaded to IPFS, and the CID is FHE-protected on Fhenix.
        </p>

        <div className="flex gap-8 flex-col lg:flex-row">
          <div className="flex-1 flex flex-col gap-5">
            {done ? (
              <div className="bg-green-950 border border-green-700 rounded-xl p-6 text-green-300">
                <div className="text-lg font-semibold mb-2">Prompt listed on PromptVault!</div>
                <p className="text-sm text-green-400">
                  Your prompt is live — double-encrypted, IPFS-stored, FHE-protected.
                </p>
                <button
                  onClick={reset}
                  className="mt-4 text-sm bg-green-800 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  List another
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Ultimate code reviewer prompt"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm text-gray-300 mb-1.5">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-600"
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-gray-300 mb-1.5">Min price (tFHE) — hidden from buyers 🔒</label>
                    <input
                      value={priceEth}
                      onChange={(e) => setPriceEth(e.target.value)}
                      type="number"
                      step="0.0001"
                      min="0"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Prompt Text</label>
                  <textarea
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value);
                      if (stage > 0) { setStage(0); setEciesBlob(''); setIpfsCid(''); setFheBlob(''); }
                    }}
                    placeholder="Write your prompt here. Only buyers can decrypt it."
                    rows={7}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-600 resize-none"
                  />
                </div>

                {/* Live scoring preview */}
                {promptText && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Quality Preview</span>
                      <span className="text-2xl font-bold text-green-400">{scores.confidence}</span>
                    </div>
                    <ScoreBar label="Specificity" value={scores.specificity} color="text-blue-400" />
                    <ScoreBar label="Complexity" value={scores.complexity} color="text-purple-400" />
                    {scores.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {scores.badges.map((b) => (
                          <span key={b} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {status && (
                  <div className="bg-purple-950 border border-purple-800 rounded-lg px-4 py-3 text-purple-300 text-sm">
                    {status}
                  </div>
                )}

                <button
                  onClick={handleList}
                  disabled={stage > 0 && !done}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  {stage === 0 && 'Encrypt & List Prompt'}
                  {stage === 1 && 'Step 1/4: ECIES Encrypting...'}
                  {stage === 2 && 'Step 2/4: Uploading to IPFS...'}
                  {stage === 3 && 'Step 3/4: FHE Wrapping CID...'}
                  {stage === 4 && 'Step 4/4: Submitting tx...'}
                </button>
              </>
            )}
          </div>

          <div className="lg:w-80">
            <EncryptionVisualizer
              plaintext={promptText}
              eciesBlob={eciesBlob}
              ipfsCid={ipfsCid}
              fheBlob={fheBlob}
              stage={stage}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
