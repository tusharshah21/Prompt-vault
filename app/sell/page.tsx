'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import Navbar from '@/components/Navbar';
import EncryptionVisualizer, { type Stage } from '@/components/EncryptionVisualizer';
import { useListPrompt, useListings, useDeactivateListing, CONTRACT_ADDRESS, ABI, type ListingView } from '@/lib/contract';
import { formatEther } from 'viem';
import { eciesEncrypt, uploadToIPFS } from '@/lib/ecies';
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
  const publicClient = usePublicClient();
  const { data: rawListings, refetch: refetchListings } = useListings();
  const myListings = ((rawListings ?? []) as ListingView[]).filter(
    (l) => l.seller.toLowerCase() === (address ?? '').toLowerCase()
  );

  const { writeContractAsync: deactivateTx } = useDeactivateListing();
  const [deactivating, setDeactivating] = useState<bigint | null>(null);
  const [deactivateStatus, setDeactivateStatus] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleDeactivate = async (listingId: bigint) => {
    setDeactivating(listingId);
    setDeactivateStatus('');
    try {
      await deactivateTx({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'deactivateListing', args: [listingId] });
      setDeactivateStatus('Listing deactivated.');
    } catch (e: any) {
      setDeactivateStatus(`Error: ${e.message}`);
    } finally {
      setDeactivating(null);
    }
  };

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('productivity');
  const [priceEth, setPriceEth] = useState('0.001');
  const [promptText, setPromptText] = useState('');

  const [stage, setStage] = useState<Stage>(0);
  const [eciesBlob, setEciesBlob] = useState('');
  const [ipfsCid, setIpfsCid] = useState('');
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const [encKey, setEncKey] = useState<string | null>(null);
  const [encKeyError, setEncKeyError] = useState(false);

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

  // Fetch the connected wallet's MetaMask encryption public key.
  // Required before encrypting — ensures only this wallet can eth_decrypt the prompt.
  const fetchEncryptionKey = async () => {
    if (!address || !(window as any).ethereum) return;
    setEncKeyError(false);
    try {
      const key = await (window as any).ethereum.request({
        method: 'eth_getEncryptionPublicKey',
        params: [address],
      }) as string;
      setEncKey(key);
    } catch {
      setEncKeyError(true);
    }
  };

  const reset = () => {
    setDone(false);
    setStage(0);
    setTitle('');
    setPromptText('');
    setEciesBlob('');
    setIpfsCid('');
    setScores({ specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0 });
  };

  const handleList = async () => {
    if (!address) {
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
      // Fetch the buyer's real MetaMask encryption public key so only they can decrypt.
      // eth_getEncryptionPublicKey requires a MetaMask confirmation from the connected wallet.
      let buyerPublicKey = encKey;
      if (!buyerPublicKey) {
        setStatus('Requesting your encryption public key from MetaMask...');
        try {
          buyerPublicKey = await (window as any).ethereum.request({
            method: 'eth_getEncryptionPublicKey',
            params: [address],
          }) as string;
          setEncKey(buyerPublicKey);
        } catch {
          setStatus('MetaMask key request denied. Cannot encrypt prompt.');
          setStage(0);
          return;
        }
      }
      setStatus('Encrypting with ECIES (your wallet public key)...');
      // before encrypting: TextEncoder converts prompt string → bytes
      const promptBytes = new TextEncoder().encode(promptText);
      const ecies = eciesEncrypt(buyerPublicKey, promptBytes);
      setEciesBlob(ecies);

      setStage(2);
      setStatus('Uploading ECIES blob to IPFS (Pinata)...');
      const cid = await uploadToIPFS(ecies);
      setIpfsCid(cid);

      setStage(3);
      setStatus('Step 3/3: Submitting to Sepolia...');
      const hash = await listPrompt({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'listPrompt',
        args: [
          cid,
          parseEther(priceEth),
          title,
          category,
          Math.round(scores.specificity),
          Math.round(scores.complexity),
          scores.badgesMask,
        ],
      });

      // Wait for the block to be mined before refetching
      if (hash && publicClient) {
        setStatus('Waiting for confirmation...');
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setStatus('');
      setDone(true);
      refetchListings();
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
                  Prompts are ECIES-encrypted with <strong className="text-white">your wallet's public key</strong>, uploaded to IPFS, and the CID is stored on Sepolia.
                  Only your MetaMask wallet can decrypt purchased prompts.
                </p>

                {/* Encryption key display — lets seller copy key for seed script */}
                {mounted && address && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Your Encryption Public Key</span>
                      {!encKey && (
                        <button
                          onClick={fetchEncryptionKey}
                          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          Reveal
                        </button>
                      )}
                    </div>
                    {encKey ? (
                      <p className="text-xs font-mono text-green-400 break-all">{encKey}</p>
                    ) : encKeyError ? (
                      <p className="text-xs text-red-400">MetaMask denied — key needed to encrypt prompts.</p>
                    ) : (
                      <p className="text-xs text-gray-600">Click Reveal to fetch from MetaMask. Required before listing.</p>
                    )}
                  </div>
                )}
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
                    <label className="block text-sm text-gray-300 mb-1.5">Price (ETH)</label>
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
                      if (stage > 0) { setStage(0); setEciesBlob(''); setIpfsCid(''); }
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
                  {stage === 1 && 'Step 1/3: ECIES Encrypting...'}
                  {stage === 2 && 'Step 2/3: Uploading to IPFS...'}
                  {stage === 3 && 'Step 3/3: Submitting to Sepolia...'}
                </button>
              </>
            )}
          </div>

          <div className="lg:w-80">
            <EncryptionVisualizer
              plaintext={promptText}
              eciesBlob={eciesBlob}
              ipfsCid={ipfsCid}
              stage={stage}
            />
          </div>
        </div>

        {/* My Listings section */}
        {mounted && address && (
          <div className="mt-14">
            <h2 className="text-xl font-bold text-white mb-1">My Listings</h2>
            <p className="text-gray-400 text-sm mb-6">Prompts you have listed on PromptVault.</p>

            {deactivateStatus && (
              <div className="mb-4 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-300 text-sm">
                {deactivateStatus}
              </div>
            )}

            {myListings.length === 0 ? (
              <p className="text-gray-500 text-sm">No listings yet. Use the form above to list your first prompt.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {myListings.map((l) => {
                  const avgRating = Number(l.totalRatings) > 0
                    ? (Number(l.ratingSum) / Number(l.totalRatings)).toFixed(1)
                    : '—';
                  return (
                    <div key={l.id.toString()} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-semibold text-sm">{l.title}</span>
                          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{l.category}</span>
                          {!l.isActive && (
                            <span className="text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">Deactivated</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-gray-400 mt-1">
                          <span>Price: <span className="text-white font-mono">{formatEther(l.price)} ETH</span></span>
                          <span>Sales: <span className="text-white">{l.totalRatings.toString()}</span> rated</span>
                          <span>Avg rating: <span className="text-yellow-400">{avgRating}</span></span>
                          <span>Specificity: <span className="text-blue-400">{l.specificityScore}</span></span>
                          <span>ID: <span className="text-gray-500 font-mono">#{l.id.toString()}</span></span>
                        </div>
                      </div>
                      {l.isActive && (
                        <button
                          onClick={() => handleDeactivate(l.id)}
                          disabled={deactivating === l.id}
                          className="text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                        >
                          {deactivating === l.id ? 'Deactivating...' : 'Deactivate'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
