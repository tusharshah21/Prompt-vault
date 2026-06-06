'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import Navbar from '@/components/Navbar';
import ListingCard from '@/components/ListingCard';
import PromptModal from '@/components/PromptModal';
import { useListings, useBuyPrompt, ABI, CONTRACT_ADDRESS, type ListingView } from '@/lib/contract';
import { eciesDecrypt, fetchFromIPFS } from '@/lib/ecies';
import { computeConfidence } from '@/lib/scoring';

const CATEGORIES = ['all', 'productivity', 'coding', 'creative', 'research'];
type SortKey = 'confidence' | 'rating';

function buildSellerStats(listings: ListingView[]): Map<string, { avgRating: number; isVerified: boolean }> {
  const bySeller = new Map<string, ListingView[]>();
  for (const l of listings) {
    const arr = bySeller.get(l.seller) ?? [];
    arr.push(l);
    bySeller.set(l.seller, arr);
  }
  const stats = new Map<string, { avgRating: number; isVerified: boolean }>();
  for (const [seller, ls] of bySeller) {
    const totalRatings = ls.reduce((s, l) => s + Number(l.totalRatings), 0);
    const totalSum = ls.reduce((s, l) => s + Number(l.ratingSum), 0);
    const avgRating = totalRatings > 0 ? totalSum / totalRatings : 0;
    const isVerified = totalRatings >= 5 && avgRating >= 4.0;
    stats.set(seller, { avgRating, isVerified });
  }
  return stats;
}

export default function BrowsePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: rawListings } = useListings();
  const listings = (rawListings ?? []) as ListingView[];

  const { writeContractAsync: buyPromptTx } = useBuyPrompt();

  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('confidence');
  const [biddingId, setBiddingId] = useState<bigint | null>(null);
  const [revealingId, setRevealingId] = useState<bigint | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  const checkPurchased = useCallback(async () => {
    if (!address || !publicClient || listings.length === 0) return;
    const results = await Promise.all(
      listings.map((l) =>
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'hasPurchased',
          args: [l.id, address],
        }).then((v) => ({ id: l.id.toString(), purchased: v as boolean }))
          .catch(() => ({ id: l.id.toString(), purchased: false }))
      )
    );
    setPurchasedIds(new Set(results.filter((r) => r.purchased).map((r) => r.id)));
  }, [address, publicClient, listings]);

  useEffect(() => { checkPurchased(); }, [checkPurchased]);

  const sellerStats = useMemo(() => buildSellerStats(listings), [listings]);

  const sorted = useMemo(() => {
    const filtered = filter === 'all' ? [...listings] : listings.filter((l) => l.category === filter);
    if (sort === 'confidence') {
      return filtered.sort((a, b) => {
        const ca = computeConfidence(a.specificityScore, Number(a.ratingSum) / Math.max(Number(a.totalRatings), 1), sellerStats.get(a.seller)?.avgRating ?? 0);
        const cb = computeConfidence(b.specificityScore, Number(b.ratingSum) / Math.max(Number(b.totalRatings), 1), sellerStats.get(b.seller)?.avgRating ?? 0);
        return cb - ca;
      });
    }
    return filtered.sort((a, b) => {
      const ra = Number(a.totalRatings) > 0 ? Number(a.ratingSum) / Number(a.totalRatings) : 0;
      const rb = Number(b.totalRatings) > 0 ? Number(b.ratingSum) / Number(b.totalRatings) : 0;
      return rb - ra;
    });
  }, [listings, filter, sort, sellerStats]);

  const handleBid = async (listingId: bigint, bidWei: bigint) => {
    if (!address) { setStatus('Connect your wallet first.'); return; }
    setBiddingId(listingId);
    try {
      setStatus('Submitting purchase to Sepolia...');
      await buyPromptTx({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'buyPrompt',
        args: [listingId],
        value: bidWei,
      });
      setStatus('Purchase accepted. Click "Reveal" to decrypt.');
      setPurchasedIds((prev) => new Set([...prev, listingId.toString()]));
    } catch (e: any) {
      const msg = (e.message ?? '').toLowerCase();
      if (msg.includes('insufficient')) {
        setStatus('Insufficient payment — the price shown is the minimum.');
      } else if (msg.includes('reject') || msg.includes('denied')) {
        setStatus('Transaction rejected by wallet.');
      } else {
        setStatus(`Error: ${e.message}`);
      }
    } finally {
      setBiddingId(null);
    }
  };

  const handleReveal = async (listingId: bigint) => {
    if (!address || !publicClient) return;
    setRevealingId(listingId);
    try {
      setStatus('Fetching IPFS CID from contract...');
      const cid = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPromptCID',
        args: [listingId],
        account: address,
      }) as string;

      setStatus(`Fetching ECIES blob from IPFS (${cid.slice(0, 12)}...)...`);
      const eciesHex = await fetchFromIPFS(cid);

      setStatus('Requesting MetaMask decryption (eth_decrypt)...');
      const decryptedBytes = await eciesDecrypt(eciesHex, address);
      setPlaintext(new TextDecoder().decode(decryptedBytes));
      setStatus('');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setRevealingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-px bg-white/40" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">002</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <h1 className="text-2xl font-mono font-bold text-white uppercase tracking-wider mb-1">
            Browse Prompts
          </h1>
          <p className="text-xs font-mono text-white/40">
            All prompts are ECIES-encrypted. Buy to receive the IPFS CID, then decrypt via MetaMask.
          </p>
        </div>

        {/* Architecture callout */}
        <div className="mb-6 border border-white/10 px-4 py-3 text-[10px] font-mono text-white/40">
          ⚡ ECIES + IPFS — Seller encrypts → uploads to IPFS → stores CID on Sepolia. Only buyers can fetch and decrypt.
        </div>

        {/* Status */}
        {status && (
          <div className="mb-6 border border-white/20 px-4 py-3 text-xs font-mono text-white/60">
            {status}
          </div>
        )}

        {/* Filter + Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`text-[10px] font-mono uppercase tracking-wider px-3 py-1 border transition-all ${
                  filter === cat
                    ? 'border-white text-white'
                    : 'border-white/20 text-white/40 hover:border-white/50 hover:text-white/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-black border border-white/20 text-white/50 text-[10px] font-mono uppercase tracking-wider px-3 py-1 focus:outline-none focus:border-white"
            >
              <option value="confidence">SORT: CONFIDENCE ↓</option>
              <option value="rating">SORT: RATING ↓</option>
            </select>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((listing) => {
            const ss = sellerStats.get(listing.seller) ?? { avgRating: 0, isVerified: false };
            const isPurchased = purchasedIds.has(listing.id.toString());
            const isOwnListing = !!address && listing.seller.toLowerCase() === address.toLowerCase();
            return (
              <div key={listing.id.toString()} className="flex flex-col gap-2">
                <ListingCard
                  listingId={listing.id}
                  title={listing.title}
                  category={listing.category}
                  seller={listing.seller}
                  price={listing.price}
                  isPurchased={isPurchased}
                  isOwnListing={isOwnListing}
                  isBidding={biddingId === listing.id}
                  onBid={handleBid}
                  specificityScore={listing.specificityScore}
                  complexityScore={listing.complexityScore}
                  structureBadges={listing.structureBadges}
                  totalRatings={listing.totalRatings}
                  ratingSum={listing.ratingSum}
                  effectivenessSum={listing.effectivenessSum}
                  reusabilitySum={listing.reusabilitySum}
                  sellerAvgRating={ss.avgRating}
                  isVerifiedSeller={ss.isVerified}
                />
                {isPurchased && !isOwnListing && (
                  <button
                    onClick={() => handleReveal(listing.id)}
                    disabled={revealingId === listing.id}
                    className="text-[10px] font-mono border border-green-500/30 text-green-400/70 px-3 py-1.5 hover:border-green-400 hover:text-green-400 transition-all disabled:opacity-30 uppercase tracking-wider"
                  >
                    {revealingId === listing.id ? 'DECRYPTING...' : '🔑 REVEAL PROMPT'}
                  </button>
                )}
              </div>
            );
          })}

          {sorted.length === 0 && (
            <p className="text-[10px] font-mono text-white/30 col-span-3 py-16 text-center uppercase tracking-wider">
              No listings yet.{' '}
              <a href="/sell" className="text-white/50 underline hover:text-white transition-colors">
                Be the first to sell a prompt
              </a>.
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
