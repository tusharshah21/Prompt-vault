'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import Navbar from '@/components/Navbar';
import EncryptionVisualizer, { type Stage } from '@/components/EncryptionVisualizer';
import { useListPrompt, useListings, useDeactivateListing, CONTRACT_ADDRESS, ABI, type ListingView } from '@/lib/contract';
import { eciesEncrypt, uploadToIPFS } from '@/lib/ecies';
import {
  computeSpecificity, computeComplexity, computeConfidence,
  getStructureBadges, getStructureBadgesMask,
} from '@/lib/scoring';

const CATEGORIES = ['productivity', 'coding', 'creative', 'research'];
const MAX_CHARS   = 4000;

type Scores = {
  specificity: number; complexity: number; confidence: number;
  badges: string[]; badgesMask: number;
};

// ── Step progress ─────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1 as const, label: 'Encrypt' },
  { n: 2 as const, label: 'IPFS' },
  { n: 3 as const, label: 'Sepolia' },
];

function StepProgress({ stage }: { stage: Stage }) {
  return (
    <div className="flex items-start">
      {STEPS.map(({ n, label }, i) => (
        <div key={n} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 flex items-center justify-center text-[10px] font-mono border transition-all ${
                stage > n
                  ? 'border-green-500/50 text-green-400 bg-green-950/30'
                  : stage === n
                  ? 'border-white text-white'
                  : 'border-white/15 text-white/20'
              }`}
            >
              {stage > n ? '✓' : n}
            </div>
            <span
              className={`text-[8px] font-mono uppercase tracking-wider whitespace-nowrap ${
                stage >= n ? 'text-white/50' : 'text-white/15'
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`flex-1 h-px mt-3.5 mx-2 transition-colors ${
                stage > n ? 'bg-green-500/30' : 'bg-white/10'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[9px] font-mono">
        <span className="text-white/35 uppercase tracking-wider">{label}</span>
        <span className={color}>{value}</span>
      </div>
      <div className="h-px bg-white/10 relative overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-500 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SellPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: rawListings, refetch: refetchListings } = useListings();
  const myListings = ((rawListings ?? []) as ListingView[]).filter(
    (l) => l.seller.toLowerCase() === (address ?? '').toLowerCase()
  );

  const { writeContractAsync: deactivateTx } = useDeactivateListing();
  const [deactivating,    setDeactivating]    = useState<bigint | null>(null);
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

  const [title,      setTitle]      = useState('');
  const [category,   setCategory]   = useState('productivity');
  const [priceEth,   setPriceEth]   = useState('0.001');
  const [promptText, setPromptText] = useState('');

  const [stage,     setStage]     = useState<Stage>(0);
  const [eciesBlob, setEciesBlob] = useState('');
  const [ipfsCid,   setIpfsCid]   = useState('');
  const [status,    setStatus]    = useState('');
  const [done,      setDone]      = useState(false);
  const [encKey,    setEncKey]    = useState<string | null>(null);
  const [encKeyError, setEncKeyError] = useState(false);

  const [scores, setScores] = useState<Scores>({
    specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0,
  });

  useEffect(() => {
    if (!promptText) {
      setScores({ specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0 });
      return;
    }
    const t = setTimeout(() => {
      const s = computeSpecificity(promptText);
      const c = computeComplexity(promptText);
      const badges = getStructureBadges(promptText);
      setScores({ specificity: s, complexity: c, confidence: computeConfidence(s, 0, 0), badges, badgesMask: getStructureBadgesMask(promptText) });
    }, 300);
    return () => clearTimeout(t);
  }, [promptText]);

  const { writeContractAsync: listPrompt } = useListPrompt();

  const fetchEncryptionKey = async () => {
    if (!address || !(window as any).ethereum) return;
    setEncKeyError(false);
    try {
      const key = await (window as any).ethereum.request({
        method: 'eth_getEncryptionPublicKey', params: [address],
      }) as string;
      setEncKey(key);
    } catch { setEncKeyError(true); }
  };

  const reset = () => {
    setDone(false); setStage(0); setTitle(''); setPromptText('');
    setEciesBlob(''); setIpfsCid(''); setStatus('');
    setScores({ specificity: 0, complexity: 0, confidence: 0, badges: [], badgesMask: 0 });
  };

  const handleList = async () => {
    if (!address)            { setStatus('Connect your wallet first.'); return; }
    if (!title.trim())       { setStatus('A title is required.'); return; }
    if (!promptText.trim())  { setStatus('Prompt text cannot be empty.'); return; }
    setDone(false);

    try {
      setStage(1);
      let buyerPublicKey = encKey;
      if (!buyerPublicKey) {
        setStatus('Requesting encryption key from MetaMask…');
        try {
          buyerPublicKey = await (window as any).ethereum.request({
            method: 'eth_getEncryptionPublicKey', params: [address],
          }) as string;
          setEncKey(buyerPublicKey);
        } catch {
          setStatus('MetaMask key request denied — cannot encrypt prompt.');
          setStage(0); return;
        }
      }
      setStatus('ECIES-encrypting with your wallet key…');
      const ecies = eciesEncrypt(buyerPublicKey, new TextEncoder().encode(promptText));
      setEciesBlob(ecies);

      setStage(2);
      setStatus('Uploading encrypted blob to IPFS (Pinata)…');
      const cid = await uploadToIPFS(ecies);
      setIpfsCid(cid);

      setStage(3);
      setStatus('Submitting to Sepolia…');
      const hash = await listPrompt({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: 'listPrompt',
        args: [cid, parseEther(priceEth), title, category, Math.round(scores.specificity), Math.round(scores.complexity), scores.badgesMask],
      });

      if (hash && publicClient) {
        setStatus('Waiting for confirmation…');
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

  const isSubmitting = stage > 0 && !done;
  const charCount    = promptText.length;
  const charNear     = charCount > MAX_CHARS * 0.8;
  const charOver     = charCount > MAX_CHARS;

  const fieldBase = 'w-full bg-transparent border border-white/15 px-3 py-2.5 text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:border-white/50 transition-colors';
  const labelBase = 'block text-[9px] font-mono text-white/35 uppercase tracking-widest mb-1.5';

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-px bg-white/30" />
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">003</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <h1 className="text-xl font-mono font-bold text-white uppercase tracking-wider mb-1">
            List a Prompt
          </h1>
          <p className="text-xs font-mono text-white/30">
            ECIES-encrypt with your wallet key → upload to IPFS → store CID on Sepolia.
          </p>
        </div>

        {/* Encryption key panel */}
        {mounted && address && (
          <div className="border border-white/15 p-4 mb-8 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-white/35 uppercase tracking-widest">
                Your Encryption Public Key
              </span>
              {!encKey && (
                <button
                  onClick={fetchEncryptionKey}
                  className="text-[9px] font-mono text-white/35 border border-white/15 px-2.5 py-1 hover:border-white/50 hover:text-white/60 transition-all uppercase tracking-wider"
                >
                  Reveal
                </button>
              )}
            </div>
            {encKey ? (
              <p className="text-[10px] font-mono text-green-400 break-all leading-relaxed">{encKey}</p>
            ) : encKeyError ? (
              <p className="text-[10px] font-mono text-red-400/60">MetaMask denied — key required to encrypt prompts.</p>
            ) : (
              <p className="text-[10px] font-mono text-white/15">Click Reveal to fetch from MetaMask. Required before listing.</p>
            )}
          </div>
        )}

        <div className="flex gap-8 flex-col lg:flex-row">
          {/* ── Form ───────────────────────────────────────── */}
          <div className="flex-1 flex flex-col gap-5">
            {done ? (
              /* Success state */
              <div className="border border-green-500/25 p-8 flex flex-col items-center gap-4 text-center">
                <div className="relative w-12 h-12 border border-green-500/30 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                  <div className="absolute -top-px -left-px w-2.5 h-2.5 border-t border-l border-green-500/40" />
                  <div className="absolute -bottom-px -right-px w-2.5 h-2.5 border-b border-r border-green-500/40" />
                </div>
                <div>
                  <div className="text-sm font-mono text-green-400 uppercase tracking-wider mb-1">
                    Prompt Listed
                  </div>
                  <p className="text-xs font-mono text-white/30">
                    Encrypted · IPFS-stored · CID on Sepolia
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="text-[10px] font-mono border border-white/15 text-white/35 px-5 py-2 hover:border-white/50 hover:text-white/60 transition-all uppercase tracking-wider"
                >
                  List Another →
                </button>
              </div>
            ) : (
              <>
                {/* Step progress (visible during submission) */}
                {isSubmitting && (
                  <div className="border border-white/10 p-4">
                    <StepProgress stage={stage} />
                    {status && (
                      <p className="text-[10px] font-mono text-white/40 mt-4 text-center">{status}</p>
                    )}
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className={labelBase}>Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Ultimate code reviewer prompt"
                    maxLength={100}
                    className={fieldBase}
                  />
                </div>

                {/* Category + Price */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className={labelBase}>Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={fieldBase + ' cursor-pointer'}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c} className="bg-black capitalize">{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelBase}>Price (ETH)</label>
                    <input
                      value={priceEth}
                      onChange={(e) => setPriceEth(e.target.value)}
                      type="number" step="0.0001" min="0"
                      className={fieldBase}
                    />
                  </div>
                </div>

                {/* Prompt textarea */}
                <div>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <label className={labelBase} style={{ marginBottom: 0 }}>Prompt Text</label>
                    <span className={`text-[9px] font-mono tabular-nums ${charOver ? 'text-red-400' : charNear ? 'text-yellow-400/70' : 'text-white/20'}`}>
                      {charCount}/{MAX_CHARS}
                    </span>
                  </div>
                  <textarea
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value.slice(0, MAX_CHARS));
                      if (stage > 0) { setStage(0); setEciesBlob(''); setIpfsCid(''); }
                    }}
                    placeholder="Write your prompt here. Buyers will only see it after decrypting with MetaMask."
                    rows={8}
                    className={fieldBase + ' resize-none leading-relaxed'}
                  />
                </div>

                {/* Live quality score */}
                {promptText && (
                  <div className="border border-white/10 p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                        Quality Preview
                      </span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-mono font-bold text-green-400 leading-none tabular-nums">
                          {scores.confidence}
                        </span>
                        <span className="text-[9px] font-mono text-white/20">/ 100</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <ScoreBar label="Specificity" value={scores.specificity} color="text-blue-400" />
                      <ScoreBar label="Complexity"  value={scores.complexity}  color="text-purple-400" />
                    </div>
                    {scores.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {scores.badges.map((b) => (
                          <span key={b} className="text-[8px] font-mono border border-white/10 text-white/25 px-1.5 py-0.5 uppercase">
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Error/status (non-submitting) */}
                {status && !isSubmitting && (
                  <div className={`border px-4 py-3 text-[10px] font-mono ${
                    status.startsWith('Error')
                      ? 'border-red-500/25 text-red-400/70'
                      : 'border-white/15 text-white/40'
                  }`}>
                    {status}
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleList}
                  disabled={isSubmitting || charOver}
                  className="relative text-xs font-mono border border-white/30 text-white/60 py-3.5 uppercase tracking-widest hover:border-white hover:text-white hover:bg-white hover:text-black transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      {stage === 1 && 'Encrypting…'}
                      {stage === 2 && 'Uploading to IPFS…'}
                      {stage === 3 && 'Submitting to Sepolia…'}
                    </span>
                  ) : 'Encrypt & List Prompt'}
                </button>
              </>
            )}
          </div>

          {/* ── Visualizer sidebar ──────────────────────────── */}
          <div className="lg:w-72 xl:w-80">
            <EncryptionVisualizer
              plaintext={promptText}
              eciesBlob={eciesBlob}
              ipfsCid={ipfsCid}
              stage={stage}
            />
          </div>
        </div>

        {/* ── My Listings ─────────────────────────────────── */}
        {mounted && address && (
          <div className="mt-14">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-4 h-px bg-white/30" />
              <h2 className="text-sm font-mono text-white uppercase tracking-wider">My Listings</h2>
              <div className="flex-1 h-px bg-white/10" />
              {myListings.length > 0 && (
                <span className="text-[9px] font-mono text-white/20">{myListings.length} total</span>
              )}
            </div>

            {deactivateStatus && (
              <div className={`mb-4 border px-4 py-3 text-[10px] font-mono ${
                deactivateStatus.startsWith('Error') ? 'border-red-500/25 text-red-400/60' : 'border-white/15 text-white/40'
              }`}>
                {deactivateStatus}
              </div>
            )}

            {myListings.length === 0 ? (
              <p className="text-[10px] font-mono text-white/20 uppercase tracking-wider py-6 text-center border border-white/5">
                No listings yet
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {myListings.map((l) => {
                  const avgRating = Number(l.totalRatings) > 0
                    ? (Number(l.ratingSum) / Number(l.totalRatings)).toFixed(1) : '—';
                  return (
                    <div
                      key={l.id.toString()}
                      className={`border p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
                        l.isActive ? 'border-white/15' : 'border-white/5 opacity-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-xs font-mono text-white truncate">{l.title}</span>
                          <span className="text-[9px] font-mono border border-white/10 text-white/30 px-1.5 py-0.5 uppercase">
                            {l.category}
                          </span>
                          {!l.isActive && (
                            <span className="text-[9px] font-mono border border-red-500/25 text-red-400/50 px-1.5 py-0.5 uppercase">
                              Deactivated
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-[9px] font-mono text-white/25">
                          <span>Price <span className="text-white/50 tabular-nums">{formatEther(l.price)} ETH</span></span>
                          <span>Ratings <span className="text-white/50">{l.totalRatings.toString()}</span></span>
                          <span>Avg <span className="text-yellow-400/50">{avgRating}</span></span>
                          <span>Spec <span className="text-blue-400/50">{l.specificityScore}</span></span>
                          <span className="text-white/15">#{l.id.toString()}</span>
                        </div>
                      </div>
                      {l.isActive && (
                        <button
                          onClick={() => handleDeactivate(l.id)}
                          disabled={deactivating === l.id}
                          className="text-[9px] font-mono border border-red-500/20 text-red-400/45 px-4 py-2 hover:border-red-400/40 hover:text-red-400/70 transition-all disabled:opacity-30 shrink-0 uppercase tracking-wider"
                        >
                          {deactivating === l.id ? 'Deactivating…' : 'Deactivate'}
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
