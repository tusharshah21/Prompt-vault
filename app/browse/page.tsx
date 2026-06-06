'use client';

import { useState, useMemo } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import Navbar from '@/components/Navbar';
import ListingCard from '@/components/ListingCard';
import PromptModal from '@/components/PromptModal';
import { useListings, useSubmitBid, ABI, CONTRACT_ADDRESS, type ListingView } from '@/lib/contract';
import { fhenixHelium } from '@/lib/contract';
import { createFheClient, decryptCidChunks, encryptBidForContract } from '@/lib/fhe';
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
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { data: rawListings } = useListings();
  const listings = (rawListings ?? []) as ListingView[];

  const { writeContractAsync: submitBidTx } = useSubmitBid();

  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('confidence');
  const [biddingId, setBiddingId] = useState<bigint | null>(null);
  const [revealingId, setRevealingId] = useState<bigint | null>(null);
  // SECURITY: plaintext in RAM only. Never persisted or sent anywhere.
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [status, setStatus] = useState('');

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
    // rating
    return filtered.sort((a, b) => {
      const ra = Number(a.totalRatings) > 0 ? Number(a.ratingSum) / Number(a.totalRatings) : 0;
      const rb = Number(b.totalRatings) > 0 ? Number(b.ratingSum) / Number(b.totalRatings) : 0;
      return rb - ra;
    });
  }, [listings, filter, sort, sellerStats]);

  // Core FHE demo: encrypt bid → submit alongside msg.value →
  // CoFHE coprocessor runs FHE.gte(bid, price) + FHE.req() on-chain.
  // Reverts without revealing price if bid too low.
  const handleBid = async (listingId: bigint, bidWei: bigint) => {
    if (!address || !walletClient || !publicClient) {
      setStatus('Connect your wallet first.');
      return;
    }
    setBiddingId(listingId);
    try {
      setStatus('Encrypting bid with CoFHE...');
      const client = await createFheClient(walletClient, publicClient);
      const [ctHash, securityZone, utype, signature] = await encryptBidForContract(client, bidWei);

      setStatus('Verifying bid on-chain (FHE.gte + FHE.req via CoFHE)...');
      await submitBidTx({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitBid',
        args: [listingId, { ctHash, securityZone, utype, signature }],
        value: bidWei,
      });

      setStatus('Bid accepted! Go to My Prompts to reveal the prompt.');
    } catch (e: any) {
      const msg = (e.message ?? '').toLowerCase();
      if (msg.includes('revert') || msg.includes('fhe') || msg.includes('req')) {
        setStatus('Bid too low — try a higher amount. The actual price stays hidden.');
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
    if (!address || !walletClient || !publicClient) return;
    setRevealingId(listingId);
    try {
      setStatus('Fetching FHE-encrypted CID chunks...');
      const [chunk0, chunk1, chunk2] = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPromptCt',
        args: [listingId],
        account: address,
      }) as [`0x${string}`, `0x${string}`, `0x${string}`];

      setStatus('Decrypting IPFS CID via CoFHE coprocessor...');
      const client = await createFheClient(walletClient, publicClient);
      const cid = await decryptCidChunks(client, chunk0, chunk1, chunk2, fhenixHelium.id, address);

      setStatus(`Fetching ECIES blob from IPFS (${cid.slice(0, 12)}...)...`);
      const eciesHex = await fetchFromIPFS(cid);

      setStatus('Requesting MetaMask decryption (eth_decrypt)...');
      const decryptedBytes = await eciesDecrypt(eciesHex, address);
      // after decrypting: TextDecoder converts bytes → plaintext string
      setPlaintext(new TextDecoder().decode(decryptedBytes));
      setStatus('');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setRevealingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">Browse Prompts</h1>
        <p className="text-gray-400 mb-2">
          All prompts are FHE + ECIES double-encrypted. Prices are hidden — submit a bid and the
          CoFHE coprocessor compares encrypted values on-chain.
        </p>

        {/* FHE computation explainer */}
        <div className="mb-8 bg-purple-950 border border-purple-800 rounded-lg px-4 py-3 text-xs text-purple-300 font-mono">
          ⚡ <strong>Real FHE computation:</strong>{' '}
          FHE.gte(encryptedBid, encryptedPrice) + FHE.req() — contract never decrypts either value
        </div>

        {status && (
          <div className="mb-6 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-300 text-sm">
            {status}
          </div>
        )}

        {/* Filter + Sort */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  filter === cat ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
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
              className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-purple-600"
            >
              <option value="confidence">Sort: Confidence ↓</option>
              <option value="rating">Sort: Rating ↓</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sorted.map((listing) => {
            const ss = sellerStats.get(listing.seller) ?? { avgRating: 0, isVerified: false };
            return (
              <div key={listing.id.toString()} className="flex flex-col gap-2">
                <ListingCard
                  listingId={listing.id}
                  title={listing.title}
                  category={listing.category}
                  seller={listing.seller}
                  isPurchased={false}
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
                {address && (
                  <button
                    onClick={() => handleReveal(listing.id)}
                    disabled={revealingId === listing.id}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-green-300 font-mono px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {revealingId === listing.id ? 'Unlocking...' : '🔑 Reveal Prompt'}
                  </button>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-gray-500 col-span-3 py-12 text-center">
              No listings yet. Be the first to{' '}
              <a href="/sell" className="text-purple-400 underline">sell a prompt</a>.
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
