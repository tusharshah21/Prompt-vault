'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import Navbar from '@/components/Navbar';
import EncryptionVisualizer, { type Stage } from '@/components/EncryptionVisualizer';
import { useListPrompt, useListings, useDeactivateListing, CONTRACT_ADDRESS, ABI, type ListingView } from '@/lib/contract';
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
      <div className="flex justify-between text-[9px] font-mono">
        <span className="text-white/40 uppercase tracking-wider">{label}</span>
        <span className={color}>{value}</span>
      </div>
      <div className="h-0.5 bg-white/10 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${color.replace('text-', 'bg-')}`}
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
    specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0,
  });

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
    setDone(false); setStage(0); setTitle(''); setPromptText('');
    setEciesBlob(''); setIpfsCid('');
    setScores({ specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0 });
  };

  const handleList = async () => {
    if (!address) { setStatus('Connect your wallet first.'); return; }
    if (!title || !promptText) { setStatus('Title and prompt text are required.'); return; }
    setDone(false);

    try {
      setStage(1);
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

  const fieldClass = 'w-full bg-transparent border border-white/20 px-3 py-2 text-white text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white transition-colors';
  const labelClass = 'block text-[9px] font-mono text-white/40 uppercase tracking-widest mb-1.5';

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-px bg-white/40" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">003</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <h1 className="text-2xl font-mono font-bold text-white uppercase tracking-wider mb-1">
            List a Prompt
          </h1>
          <p className="text-xs font-mono text-white/40">
            Prompts are ECIES-encrypted with your wallet's public key, uploaded to IPFS, and the CID is stored on Sepolia.
          </p>
        </div>

        {/* Encryption key panel */}
        {mounted && address && (
          <div className="border border-white/20 p-4 flex flex-col gap-2 mb-8">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
                Encryption Public Key
              </span>
              {!encKey && (
                <button
                  onClick={fetchEncryptionKey}
                  className="text-[9px] font-mono text-white/40 border border-white/20 px-2 py-0.5 hover:border-white hover:text-white transition-all uppercase"
                >
                  Reveal
                </button>
              )}
            </div>
            {encKey ? (
              <p className="text-[10px] font-mono text-green-400 break-all">{encKey}</p>
            ) : encKeyError ? (
              <p className="text-[10px] font-mono text-red-400/70">MetaMask denied — key needed to encrypt prompts.</p>
            ) : (
              <p className="text-[10px] font-mono text-white/20">Click Reveal to fetch from MetaMask. Required before listing.</p>
            )}
          </div>
        )}

        <div className="flex gap-8 flex-col lg:flex-row">
          <div className="flex-1 flex flex-col gap-5">
            {done ? (
              <div className="border border-green-500/30 p-6 flex flex-col gap-3">
                <div className="text-sm font-mono text-green-400 uppercase tracking-wider">
                  ✓ Prompt Listed on PromptVault
                </div>
                <p className="text-xs font-mono text-white/40">
                  Your prompt is live — ECIES-encrypted, IPFS-stored, CID on Sepolia.
                </p>
                <button
                  onClick={reset}
                  className="w-fit text-[10px] font-mono border border-white/20 text-white/50 px-4 py-2 hover:border-white hover:text-white transition-all uppercase tracking-wider mt-1"
                >
                  List Another
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass}>Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Ultimate code reviewer prompt"
                    className={fieldClass}
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className={labelClass}>Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={fieldClass}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c} className="bg-black">{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelClass}>Price (ETH)</label>
                    <input
                      value={priceEth}
                      onChange={(e) => setPriceEth(e.target.value)}
                      type="number"
                      step="0.0001"
                      min="0"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Prompt Text</label>
                  <textarea
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value);
                      if (stage > 0) { setStage(0); setEciesBlob(''); setIpfsCid(''); }
                    }}
                    placeholder="Write your prompt here. Only buyers can decrypt it."
                    rows={7}
                    className={`${fieldClass} resize-none`}
                  />
                </div>

                {/* Live scoring */}
                {promptText && (
                  <div className="border border-white/20 p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
                        Quality Preview
                      </span>
                      <span className="text-2xl font-mono font-bold text-green-400">{scores.confidence}</span>
                    </div>
                    <ScoreBar label="Specificity" value={scores.specificity} color="text-blue-400" />
                    <ScoreBar label="Complexity"  value={scores.complexity}  color="text-purple-400" />
                    {scores.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {scores.badges.map((b) => (
                          <span key={b} className="text-[9px] font-mono border border-white/10 text-white/30 px-1.5 py-0.5">
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {status && (
                  <div className="border border-white/20 px-4 py-3 text-[10px] font-mono text-white/50">
                    {status}
                  </div>
                )}

                <button
                  onClick={handleList}
                  disabled={stage > 0 && !done}
                  className="text-xs font-mono border border-white/40 text-white/70 py-3 uppercase tracking-widest hover:border-white hover:text-white hover:bg-white hover:text-black transition-all disabled:opacity-30"
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

        {/* My Listings */}
        {mounted && address && (
          <div className="mt-14">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-4 h-px bg-white/40" />
              <h2 className="text-sm font-mono text-white uppercase tracking-wider">My Listings</h2>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <p className="text-[10px] font-mono text-white/30 mb-5">Prompts you have listed on PromptVault.</p>

            {deactivateStatus && (
              <div className="mb-4 border border-white/20 px-4 py-3 text-[10px] font-mono text-white/50">
                {deactivateStatus}
              </div>
            )}

            {myListings.length === 0 ? (
              <p className="text-[10px] font-mono text-white/20 uppercase tracking-wider">
                No listings yet. Use the form above to list your first prompt.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {myListings.map((l) => {
                  const avgRating = Number(l.totalRatings) > 0
                    ? (Number(l.ratingSum) / Number(l.totalRatings)).toFixed(1)
                    : '—';
                  return (
                    <div
                      key={l.id.toString()}
                      className="border border-white/20 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono text-white">{l.title}</span>
                          <span className="text-[9px] font-mono border border-white/10 text-white/30 px-1.5 py-0.5">
                            {l.category}
                          </span>
                          {!l.isActive && (
                            <span className="text-[9px] font-mono border border-red-500/30 text-red-400/60 px-1.5 py-0.5">
                              DEACTIVATED
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-[9px] font-mono text-white/30">
                          <span>PRICE: <span className="text-white/60">{formatEther(l.price)} ETH</span></span>
                          <span>RATED: <span className="text-white/60">{l.totalRatings.toString()}</span></span>
                          <span>AVG: <span className="text-yellow-400/60">{avgRating}</span></span>
                          <span>SPEC: <span className="text-blue-400/60">{l.specificityScore}</span></span>
                          <span>ID: <span className="text-white/20">#{l.id.toString()}</span></span>
                        </div>
                      </div>
                      {l.isActive && (
                        <button
                          onClick={() => handleDeactivate(l.id)}
                          disabled={deactivating === l.id}
                          className="text-[9px] font-mono border border-red-500/20 text-red-400/50 px-3 py-1.5 hover:border-red-400/50 hover:text-red-400 transition-all disabled:opacity-30 shrink-0 uppercase"
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
