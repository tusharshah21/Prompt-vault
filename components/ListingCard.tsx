'use client';

import { formatEther } from 'viem';
import { maskToBadges, computeConfidence } from '@/lib/scoring';

const CATEGORY_STYLE: Record<string, string> = {
  productivity: 'border-blue-400/30 text-blue-300/60',
  coding:       'border-green-400/30 text-green-300/60',
  creative:     'border-pink-400/30 text-pink-300/60',
  research:     'border-yellow-400/30 text-yellow-300/60',
};

export type ListingCardProps = {
  listingId: bigint;
  title: string;
  category: string;
  seller: string;
  price: bigint;
  isPurchased: boolean;
  isOwnListing: boolean;
  isBuying: boolean;
  onBuy: (listingId: bigint, price: bigint) => void;
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

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
  );
}

function ScoreRow({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-white/40 w-12 shrink-0 uppercase">{label}</span>
      <div className="flex-1 h-0.5 bg-white/10 relative overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-sm font-mono font-semibold tabular-nums w-7 text-right ${colorClass}`}>{value}</span>
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
  isBuying,
  onBuy,
  specificityScore,
  structureBadges,
  totalRatings,
  ratingSum,
  effectivenessSum,
  reusabilitySum,
  sellerAvgRating,
  isVerifiedSeller,
}: ListingCardProps) {
  const categoryStyle = CATEGORY_STYLE[category] ?? 'border-white/20 text-white/40';
  const badges        = maskToBadges(structureBadges);

  const n = Number(totalRatings);
  const avgRating        = n > 0 ? Number(ratingSum)       / n : 0;
  const avgEffectiveness = n > 0 ? Number(effectivenessSum) / n : 0;
  const avgReusability   = n > 0 ? Number(reusabilitySum)   / n : 0;

  const confidence       = computeConfidence(specificityScore, avgRating, sellerAvgRating);
  const effectivenessPct = Math.round(avgEffectiveness / 5 * 100);
  const reusabilityPct   = Math.round(avgReusability   / 5 * 100);
  const filledStars      = Math.round(avgRating);

  return (
    <div className="group bg-black border border-white/15 hover:border-white/40 transition-all duration-200 flex flex-col h-full">
      {/* ── Body ─────────────────────────────────────────── */}
      <div className="p-5 flex flex-col gap-4 flex-1">

        {/* Title + lock */}
        <div className="flex items-start gap-2">
          <h3 className="flex-1 font-mono text-white text-lg leading-snug line-clamp-2 min-w-0">
            {title}
          </h3>
          <span className="text-base opacity-40 shrink-0 mt-0.5 select-none">
            {isPurchased ? '🔓' : '🔒'}
          </span>
        </div>

        {/* Category + verified */}
        <div className="flex items-center gap-2 flex-wrap -mt-1">
          <span className={`text-xs font-mono px-2 py-0.5 border uppercase tracking-wider ${categoryStyle}`}>
            {category}
          </span>
          {isVerifiedSeller && (
            <span className="text-xs font-mono border border-white/15 text-white/40 px-2 py-0.5 uppercase tracking-wider">
              ✓ Verified
            </span>
          )}
        </div>

        {/* Confidence + score rows */}
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center shrink-0 pt-0.5">
            <span className="text-5xl font-mono font-bold text-green-400 leading-none tabular-nums">
              {confidence}
            </span>
            <span className="text-xs font-mono text-white/30 uppercase tracking-wider mt-1">conf</span>
          </div>
          <div className="flex-1 flex flex-col gap-2.5 pt-2">
            <ScoreRow label="Spec"  value={specificityScore} colorClass="bg-blue-400 text-blue-400"    />
            <ScoreRow label="Effct" value={effectivenessPct} colorClass="bg-orange-400 text-orange-400" />
            <ScoreRow label="Reuse" value={reusabilityPct}   colorClass="bg-pink-400 text-pink-400"    />
          </div>
        </div>

        {/* Structure badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span key={b} className="text-xs font-mono border border-white/15 text-white/40 px-2 py-0.5 uppercase tracking-wide">
                {b}
              </span>
            ))}
          </div>
        )}

        {/* Stars + seller row */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`text-base ${i <= filledStars ? 'text-yellow-400' : 'text-white/15'}`}>
                  ★
                </span>
              ))}
            </div>
            <span className="text-xs font-mono text-white/30">({n})</span>
          </div>
          <span className="text-xs font-mono text-white/30 tabular-nums">
            {seller.slice(0, 6)}…{seller.slice(-4)}
          </span>
        </div>
      </div>

      {/* ── Footer / CTA ─────────────────────────────────── */}
      <div className="border-t border-white/10 px-5 py-3.5">
        {isOwnListing ? (
          <div className="flex items-center justify-between">
            <span className="text-base font-mono text-white tabular-nums">{formatEther(price)} ETH</span>
            <span className="text-xs font-mono text-white/30 uppercase tracking-wider">Your listing</span>
          </div>
        ) : isPurchased ? (
          <div className="flex items-center justify-between">
            <span className="text-base font-mono text-white tabular-nums">{formatEther(price)} ETH</span>
            <span className="text-xs font-mono text-green-400 uppercase tracking-wider">✓ Purchased</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-mono text-white/30 uppercase tracking-wider">Price</div>
              <div className="text-base font-mono font-bold text-white tabular-nums">{formatEther(price)} ETH</div>
            </div>
            <button
              onClick={() => onBuy(listingId, price)}
              disabled={isBuying}
              className="flex items-center gap-2 text-sm font-mono border border-white/30 text-white/60 px-4 py-2 hover:border-white hover:text-white hover:bg-white hover:text-black transition-all duration-150 disabled:opacity-30 uppercase tracking-wider shrink-0 min-w-[80px] justify-center"
            >
              {isBuying ? <><Spinner /> Buying</> : 'Buy →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
