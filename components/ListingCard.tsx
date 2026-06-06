'use client';

import { useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { maskToBadges, computeConfidence } from '@/lib/scoring';

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
    <div className="h-1 bg-gray-800 rounded-full overflow-hidden w-16">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function Stars({ rating, count }: { rating: number; count: bigint }) {
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`text-sm ${i <= filled ? 'text-yellow-400' : 'text-gray-700'}`}>★</span>
        ))}
      </div>
      <span className="text-xs text-gray-500">({count.toString()})</span>
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
  const categoryColor = CATEGORY_COLORS[category] ?? 'bg-gray-800 text-gray-300';
  const badges = maskToBadges(structureBadges);

  const avgRating = totalRatings > 0n ? Number(ratingSum) / Number(totalRatings) : 0;
  const avgEffectiveness = totalRatings > 0n ? Number(effectivenessSum) / Number(totalRatings) : 0;
  const avgReusability = totalRatings > 0n ? Number(reusabilitySum) / Number(totalRatings) : 0;

  const confidence = computeConfidence(specificityScore, avgRating, sellerAvgRating);
  const effectivenessPct = Math.round(avgEffectiveness / 5 * 100);
  const reusabilityPct = Math.round(avgReusability / 5 * 100);

  const handleBid = () => {
    try {
      onBid(listingId, parseEther(bidAmount || '0'));
    } catch {
      // invalid amount — ignore, user will see nothing happen
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-3 border border-gray-800 hover:border-purple-800 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-white text-sm leading-tight">{title}</h3>
        <span className="text-lg shrink-0" title={isPurchased ? 'Purchased' : 'Locked'}>
          {isPurchased ? '🔓' : '🔒'}
        </span>
      </div>

      {/* Category + verified */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor}`}>
          {category}
        </span>
        {isVerifiedSeller && (
          <span className="text-xs bg-blue-950 border border-blue-800 text-blue-300 px-2 py-0.5 rounded-full">
            ✓ Verified seller
          </span>
        )}
      </div>

      {/* Confidence score */}
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-green-400 leading-none">{confidence}</span>
        <div className="flex-1 flex flex-col gap-1">
          <div className="text-xs text-gray-500">Confidence</div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${confidence}%` }} />
          </div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
        <div className="flex flex-col gap-1 items-center">
          <span>Specificity</span>
          <MiniBar value={specificityScore} color="bg-blue-500" />
          <span className="text-blue-400 font-mono">{specificityScore}</span>
        </div>
        <div className="flex flex-col gap-1 items-center">
          <span>Effectiveness</span>
          <MiniBar value={effectivenessPct} color="bg-orange-500" />
          <span className="text-orange-400 font-mono">{effectivenessPct}</span>
        </div>
        <div className="flex flex-col gap-1 items-center">
          <span>Reusability</span>
          <MiniBar value={reusabilityPct} color="bg-pink-500" />
          <span className="text-pink-400 font-mono">{reusabilityPct}</span>
        </div>
      </div>

      {/* Structure badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">{b}</span>
          ))}
        </div>
      )}

      {/* Star rating */}
      <Stars rating={avgRating} count={totalRatings} />

      {/* Seller */}
      <p className="text-xs text-gray-500 font-mono">
        {seller.slice(0, 6)}…{seller.slice(-4)}
      </p>

      {/* Bid section */}
      {isOwnListing ? (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-xs text-purple-400 font-medium">Your listing</span>
        </div>
      ) : isPurchased ? (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-xs text-green-400 font-medium">✓ Purchased</span>
        </div>
      ) : (
        <div className="pt-2 border-t border-gray-800 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Price</span>
            <span className="text-sm font-mono font-semibold text-white">{formatEther(price)} ETH</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.001"
              min="0"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              disabled={isBidding}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-purple-600 disabled:opacity-50"
              placeholder={formatEther(price)}
            />
            <span className="text-xs text-gray-500 shrink-0">ETH</span>
            <button
              onClick={handleBid}
              disabled={isBidding}
              className="text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1"
            >
              {isBidding ? (
                <>
                  <span className="animate-pulse">⏳</span>
                  Buying...
                </>
              ) : (
                'Buy'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
