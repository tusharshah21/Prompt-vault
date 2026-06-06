'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import Navbar from '@/components/Navbar';
import ListingCard from '@/components/ListingCard';
import PromptModal from '@/components/PromptModal';
import { useListings, useBuyPrompt, ABI, CONTRACT_ADDRESS, type ListingView } from '@/lib/contract';
import { eciesDecrypt, fetchFromIPFS } from '@/lib/ecies';
import { computeConfidence } from '@/lib/scoring';
import Link from 'next/link';

const CATEGORIES = ['all', 'productivity', 'coding', 'creative', 'research'];
type SortKey = 'confidence' | 'rating' | 'price-asc' | 'price-desc';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    const totalSum     = ls.reduce((s, l) => s + Number(l.ratingSum), 0);
    const avgRating    = totalRatings > 0 ? totalSum / totalRatings : 0;
    stats.set(seller, { avgRating, isVerified: totalRatings >= 5 && avgRating >= 4.0 });
  }
  return stats;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-black border border-white/10 p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex gap-2">
        <div className="h-4 bg-white/8 rounded-none flex-1" />
        <div className="h-4 w-4 bg-white/8" />
      </div>
      <div className="h-3 bg-white/5 w-24" />
      <div className="flex gap-4">
        <div className="h-10 w-10 bg-white/8 shrink-0" />
        <div className="flex-1 flex flex-col gap-2 pt-1">
          <div className="h-1 bg-white/8" />
          <div className="h-1 bg-white/8" />
          <div className="h-1 bg-white/8" />
        </div>
      </div>
      <div className="h-2 bg-white/5 w-32" />
      <div className="border-t border-white/5 pt-3 flex justify-between">
        <div className="h-4 bg-white/8 w-20" />
        <div className="h-7 bg-white/8 w-16" />
      </div>
    </div>
  );
}

// ── Status toast ──────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const isError   = /error|insufficient|reject|denied/i.test(message);
  const isSuccess = /accepted|purchased|✓/i.test(message);
  const isLoading = !isError && !isSuccess;

  const border = isError ? 'border-red-500/40' : isSuccess ? 'border-green-500/40' : 'border-white/25';
  const text   = isError ? 'text-red-400/80'  : isSuccess ? 'text-green-400/80'   : 'text-white/60';

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md`}>
      <div className={`bg-black border ${border} px-4 py-3 flex items-center gap-3 shadow-2xl`}>
        {isLoading && (
          <span className="shrink-0 inline-block w-3 h-3 border border-white/40 border-t-transparent rounded-full animate-spin" />
        )}
        {isSuccess && <span className="shrink-0 text-green-400 text-sm">✓</span>}
        {isError   && <span className="shrink-0 text-red-400 text-sm">✕</span>}
        <p className={`flex-1 text-xs font-mono ${text}`}>{message}</p>
        <button
          onClick={onDismiss}
          className="shrink-0 text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors ml-2"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="col-span-3 py-20 flex flex-col items-center gap-6 text-center">
      <div className="relative w-16 h-16 border border-white/10 flex items-center justify-center">
        <span className="text-3xl opacity-20">🔒</span>
        <div className="absolute -top-px -left-px w-3 h-3 border-t border-l border-white/20" />
        <div className="absolute -bottom-px -right-px w-3 h-3 border-b border-r border-white/20" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-mono text-white/40 uppercase tracking-wider">
          {hasSearch ? 'No results found' : 'No prompts listed yet'}
        </p>
        <p className="text-xs font-mono text-white/20">
          {hasSearch
            ? 'Try a different search or clear the filter'
            : 'Be the first to list an encrypted prompt'}
        </p>
      </div>
      {!hasSearch && (
        <Link
          href="/sell"
          className="text-[10px] font-mono border border-white/20 text-white/40 px-5 py-2 hover:border-white hover:text-white transition-all uppercase tracking-wider"
        >
          List a Prompt →
        </Link>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: rawListings } = useListings();

  const isLoading = rawListings === undefined;
  // Filter out deactivated listings
  const listings = useMemo(
    () => ((rawListings ?? []) as ListingView[]).filter((l) => l.isActive),
    [rawListings]
  );

  const { writeContractAsync: buyPromptTx } = useBuyPrompt();

  const [filter,      setFilter]      = useState('all');
  const [sort,        setSort]        = useState<SortKey>('confidence');
  const [search,      setSearch]      = useState('');
  const [buyingId,    setBuyingId]    = useState<bigint | null>(null);
  const [revealingId, setRevealingId] = useState<bigint | null>(null);
  const [plaintext,   setPlaintext]   = useState<string | null>(null);
  const [status,      setStatus]      = useState('');
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  // auto-dismiss success toasts
  useEffect(() => {
    if (!status) return;
    const isSuccess = /accepted|purchased/i.test(status);
    if (!isSuccess) return;
    const t = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const checkPurchased = useCallback(async () => {
    if (!address || !publicClient || listings.length === 0) return;
    const results = await Promise.all(
      listings.map((l) =>
        publicClient.readContract({
          address: CONTRACT_ADDRESS, abi: ABI,
          functionName: 'hasPurchased', args: [l.id, address],
        }).then((v) => ({ id: l.id.toString(), purchased: v as boolean }))
          .catch(() => ({ id: l.id.toString(), purchased: false }))
      )
    );
    setPurchasedIds(new Set(results.filter((r) => r.purchased).map((r) => r.id)));
  }, [address, publicClient, listings]);

  useEffect(() => { checkPurchased(); }, [checkPurchased]);

  const sellerStats = useMemo(() => buildSellerStats(listings), [listings]);

  const sorted = useMemo(() => {
    let out = filter === 'all' ? [...listings] : listings.filter((l) => l.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((l) => l.title.toLowerCase().includes(q) || l.category.toLowerCase().includes(q));
    }
    switch (sort) {
      case 'confidence':
        return out.sort((a, b) => {
          const ca = computeConfidence(a.specificityScore, Number(a.ratingSum) / Math.max(Number(a.totalRatings), 1), sellerStats.get(a.seller)?.avgRating ?? 0);
          const cb = computeConfidence(b.specificityScore, Number(b.ratingSum) / Math.max(Number(b.totalRatings), 1), sellerStats.get(b.seller)?.avgRating ?? 0);
          return cb - ca;
        });
      case 'rating':
        return out.sort((a, b) => {
          const ra = Number(a.totalRatings) > 0 ? Number(a.ratingSum) / Number(a.totalRatings) : 0;
          const rb = Number(b.totalRatings) > 0 ? Number(b.ratingSum) / Number(b.totalRatings) : 0;
          return rb - ra;
        });
      case 'price-asc':
        return out.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
      case 'price-desc':
        return out.sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0));
    }
  }, [listings, filter, sort, search, sellerStats]);

  const handleBuy = async (listingId: bigint, price: bigint) => {
    if (!address) { setStatus('Connect your wallet first.'); return; }
    setBuyingId(listingId);
    setStatus('Submitting purchase to Sepolia...');
    try {
      await buyPromptTx({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: 'buyPrompt', args: [listingId], value: price,
      });
      setStatus('✓ Purchase accepted — click Reveal to decrypt.');
      setPurchasedIds((prev) => new Set([...prev, listingId.toString()]));
    } catch (e: any) {
      const msg = (e.message ?? '').toLowerCase();
      if (msg.includes('insufficient'))      setStatus('Error: Insufficient payment — send at least the listed price.');
      else if (msg.includes('reject') || msg.includes('denied')) setStatus('Error: Transaction rejected.');
      else                                    setStatus(`Error: ${e.message}`);
    } finally {
      setBuyingId(null);
    }
  };

  const handleReveal = async (listingId: bigint) => {
    if (!address || !publicClient) return;
    setRevealingId(listingId);
    setStatus('Fetching CID from contract...');
    try {
      const cid = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: 'getPromptCID', args: [listingId], account: address,
      }) as string;
      setStatus(`Fetching encrypted blob from IPFS...`);
      const eciesHex = await fetchFromIPFS(cid);
      setStatus('Awaiting MetaMask decryption...');
      const decryptedBytes = await eciesDecrypt(eciesHex, address);
      setPlaintext(new TextDecoder().decode(decryptedBytes));
      setStatus('');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setRevealingId(null);
    }
  };

  const hasSearch = !!(search.trim() || filter !== 'all');

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-px bg-white/30" />
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">002</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <h1 className="text-3xl font-mono font-bold text-white uppercase tracking-wider mb-2">
            Browse Prompts
          </h1>
          <p className="text-sm font-mono text-white/40">
            {isLoading
              ? 'Loading listings from Sepolia…'
              : `${listings.length} listing${listings.length !== 1 ? 's' : ''} · ECIES-encrypted · Buy to decrypt`}
          </p>
        </div>

        {/* Search + Filter + Sort bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs font-mono pointer-events-none">
              ⌕
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts…"
              className="w-full bg-transparent border border-white/15 pl-8 pr-3 py-2.5 text-sm font-mono text-white placeholder-white/25 focus:outline-none focus:border-white/50 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 text-xs transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`text-xs font-mono uppercase tracking-wider px-3 py-2 border transition-all ${
                  filter === cat
                    ? 'border-white text-white'
                    : 'border-white/15 text-white/40 hover:border-white/40 hover:text-white/70'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-black border border-white/15 text-white/50 text-xs font-mono px-3 py-2 focus:outline-none focus:border-white/50 transition-colors cursor-pointer"
          >
            <option value="confidence">Confidence ↓</option>
            <option value="rating">Rating ↓</option>
            <option value="price-asc">Price ↑</option>
            <option value="price-desc">Price ↓</option>
          </select>
        </div>

        {/* Active search badge */}
        {search && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/30">Results for</span>
            <span className="text-[10px] font-mono border border-white/20 text-white/50 px-2 py-0.5">
              "{search}"
            </span>
            <span className="text-[10px] font-mono text-white/20">· {sorted?.length ?? 0} found</span>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : sorted!.length === 0
            ? <EmptyState hasSearch={hasSearch} />
            : sorted!.map((listing) => {
                const ss          = sellerStats.get(listing.seller) ?? { avgRating: 0, isVerified: false };
                const isPurchased = purchasedIds.has(listing.id.toString());
                const isOwn       = !!address && listing.seller.toLowerCase() === address.toLowerCase();
                return (
                  <div key={listing.id.toString()} className="flex flex-col">
                    <ListingCard
                      listingId={listing.id}
                      title={listing.title}
                      category={listing.category}
                      seller={listing.seller}
                      price={listing.price}
                      isPurchased={isPurchased}
                      isOwnListing={isOwn}
                      isBuying={buyingId === listing.id}
                      onBuy={handleBuy}
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
                    {isPurchased && !isOwn && (
                      <button
                        onClick={() => handleReveal(listing.id)}
                        disabled={revealingId === listing.id}
                        className="border border-t-0 border-green-500/20 text-green-400/60 text-sm font-mono py-3 hover:bg-green-500/5 hover:text-green-400 hover:border-green-400/40 transition-all disabled:opacity-30 uppercase tracking-wider flex items-center justify-center gap-2"
                      >
                        {revealingId === listing.id ? (
                          <>
                            <span className="inline-block w-3 h-3 border border-green-400/40 border-t-transparent rounded-full animate-spin" />
                            Decrypting…
                          </>
                        ) : '🔑 Reveal Prompt'}
                      </button>
                    )}
                  </div>
                );
              })}
        </div>
      </main>

      {/* Status toast */}
      {status && <Toast message={status} onDismiss={() => setStatus('')} />}

      {/* Prompt reveal modal */}
      {plaintext && <PromptModal plaintext={plaintext} onClose={() => setPlaintext(null)} />}
    </div>
  );
}
