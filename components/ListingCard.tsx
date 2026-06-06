'use client';

import { useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { maskToBadges, computeConfidence } from '@/lib/scoring';

const CATEGORY_BORDER: Record<string, string> = {
  productivity: 'border-blue-500/30 text-blue-300/60',
  coding:       'border-green-500/30 text-green-300/60',
  creative:     'border-pink-500/30 text-pink-300/60',
  research:     'border-yellow-500/30 text-yellow-300/60',
};

type ListingCardProps = {
  listingId: bigint;
  title: string;
  category: string;
  seller: string;
  price: bigint;
  isPurchased: boolean;
  isOwnListing: boolean;
  isBidding: boolean;
  onBid: (listingId: bigint, bidWei: bigint) => void;
  specificityScore: number;
  complexityScore: number;
  structureBadges: number;
  totalRatings: bigint;
  ratingSum: bigint;
  effectivenessSum: bigint;
  reusabilitySum: bigint;
  sellerAvgRating: number;
  isVerifiedSeller: boolean;
};

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-0.5 bg-white/10 overflow-hidden w-16">
      <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function Stars({ rating, count }: { rating: number; count: bigint }) {
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`text-xs ${i <= filled ? 'text-yellow-400' : 'text-white/10'}`}>★</span>
        ))}
      </div>
      <span className="text-[9px] font-mono text-white/30">({count.toString()})</span>
    </div>
  );
}

export default function ListingCard({
  listingId,
  title,
  category,
  seller,
  price,
  isPurchased,
  isOwnListing,
  isBidding,
  onBid,
  specificityScore,
  complexityScore,
  structureBadges,
  totalRatings,
  ratingSum,
  effectivenessSum,
  reusabilitySum,
  sellerAvgRating,
  isVerifiedSeller,
}: ListingCardProps) {
  const [bidAmount, setBidAmount] = useState(() => formatEther(price));
  const categoryStyle = CATEGORY_BORDER[category] ?? 'border-white/20 text-white/40';
  const badges = maskToBadges(structureBadges);

  const avgRating       = totalRatings > 0n ? Number(ratingSum)       / Number(totalRatings) : 0;
  const avgEffectiveness = totalRatings > 0n ? Number(effectivenessSum) / Number(totalRatings) : 0;
  const avgReusability   = totalRatings > 0n ? Number(reusabilitySum)   / Number(totalRatings) : 0;

  const confidence      = computeConfidence(specificityScore, avgRating, sellerAvgRating);
  const effectivenessPct = Math.round(avgEffectiveness / 5 * 100);
  const reusabilityPct   = Math.round(avgReusability  / 5 * 100);

  const handleBid = () => {
    try { onBid(listingId, parseEther(bidAmount || '0')); } catch {}
  };

  return (
    <div className="bg-black border border-white/20 hover:border-white/40 transition-colors p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-mono text-white text-xs leading-tight">{title}</h3>
        <span className="text-base shrink-0 opacity-60" title={isPurchased ? 'Purchased' : 'Locked'}>
          {isPurchased ? '🔓' : '🔒'}
        </span>
      </div>

      {/* Category + verified */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9px] font-mono px-2 py-0.5 border uppercase tracking-wider ${categoryStyle}`}>
          {category}
        </span>
        {isVerifiedSeller && (
          <span className="text-[9px] font-mono border border-white/20 text-white/40 px-2 py-0.5 uppercase tracking-wider">
            ✓ Verified
          </span>
        )}
      </div>

      {/* Confidence score */}
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-green-400 leading-none font-mono">{confidence}</span>
        <div className="flex-1 flex flex-col gap-1">
          <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Confidence</div>
          <div className="h-0.5 bg-white/10 overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${confidence}%` }} />
          </div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-3 gap-2 text-[9px] font-mono text-white/40">
        <div className="flex flex-col gap-1 items-center">
          <span className="uppercase tracking-wider">Spec</span>
          <MiniBar value={specificityScore} color="bg-blue-400" />
          <span className="text-blue-400">{specificityScore}</span>
        </div>
        <div className="flex flex-col gap-1 items-center">
          <span className="uppercase tracking-wider">Effect</span>
          <MiniBar value={effectivenessPct} color="bg-orange-400" />
          <span className="text-orange-400">{effectivenessPct}</span>
        </div>
        <div className="flex flex-col gap-1 items-center">
          <span className="uppercase tracking-wider">Reuse</span>
          <MiniBar value={reusabilityPct} color="bg-pink-400" />
          <span className="text-pink-400">{reusabilityPct}</span>
        </div>
      </div>

      {/* Structure badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b} className="text-[9px] font-mono border border-white/10 text-white/30 px-1.5 py-0.5">
              {b}
            </span>
          ))}
        </div>
      )}

      {/* Stars */}
      <Stars rating={avgRating} count={totalRatings} />

      {/* Seller */}
      <p className="text-[9px] font-mono text-white/20">
        {seller.slice(0, 6)}…{seller.slice(-4)}
      </p>

      {/* Buy / status section */}
      <div className="pt-2 border-t border-white/10">
        {isOwnListing ? (
          <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Your listing</span>
        ) : isPurchased ? (
          <span className="text-[9px] font-mono text-green-400 uppercase tracking-wider">✓ Purchased</span>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider">Price</span>
              <span className="text-xs font-mono text-white">{formatEther(price)} ETH</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                disabled={isBidding}
                className="flex-1 bg-transparent border border-white/20 px-2 py-1 text-white text-[10px] font-mono focus:outline-none focus:border-white disabled:opacity-40"
                placeholder={formatEther(price)}
              />
              <span className="text-[9px] font-mono text-white/30 shrink-0">ETH</span>
              <button
                onClick={handleBid}
                disabled={isBidding}
                className="text-[10px] font-mono border border-white/30 text-white/70 px-3 py-1 hover:border-white hover:text-white hover:bg-white hover:text-black transition-all disabled:opacity-30 shrink-0"
              >
                {isBidding ? '⏳' : 'BUY'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
