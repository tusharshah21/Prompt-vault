'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import Navbar from '@/components/Navbar';
import ListingCard from '@/components/ListingCard';
import PromptModal from '@/components/PromptModal';
import {
  useListings, useHasPurchased, useHasRated, useRatePrompt,
  ABI, CONTRACT_ADDRESS, type ListingView,
} from '@/lib/contract';
import { eciesDecrypt, fetchFromIPFS } from '@/lib/ecies';
import Link from 'next/link';

// ── Star picker ───────────────────────────────────────────────────────────────

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-mono text-white/35 uppercase tracking-wider">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`text-lg transition-colors ${i <= value ? 'text-yellow-400' : 'text-white/10 hover:text-white/25'}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />;
}

// ── Per-listing purchased card ────────────────────────────────────────────────

function PurchasedListing({
  listing, address, walletClient, publicClient,
}: {
  listing: ListingView;
  address: `0x${string}`;
  walletClient: any;
  publicClient: any;
}) {
  const { data: purchased }   = useHasPurchased(listing.id, address);
  const { data: alreadyRated } = useHasRated(listing.id, address);
  const { writeContractAsync: ratePrompt } = useRatePrompt();

  const [revealing,    setRevealing]    = useState(false);
  const [plaintext,    setPlaintext]    = useState<string | null>(null);
  const [status,       setStatus]       = useState('');
  const [showRate,     setShowRate]     = useState(false);
  const [overall,      setOverall]      = useState(0);
  const [effectiveness, setEffectiveness] = useState(0);
  const [reusability,  setReusability]  = useState(0);
  const [submitting,   setSubmitting]   = useState(false);

  useEffect(() => () => { setPlaintext(null); }, []);

  if (!purchased) return null;

  const handleReveal = async () => {
    if (!walletClient || !publicClient) return;
    setRevealing(true);
    setStatus('Fetching CID from contract…');
    try {
      const cid = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: 'getPromptCID', args: [listing.id], account: address,
      }) as string;
      setStatus('Fetching encrypted blob from IPFS…');
      const eciesHex = await fetchFromIPFS(cid);
      setStatus('Awaiting MetaMask decryption…');
      const decryptedBytes = await eciesDecrypt(eciesHex, address);
      setPlaintext(new TextDecoder().decode(decryptedBytes));
      setStatus('');
      if (!alreadyRated) setShowRate(true);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setRevealing(false);
    }
  };

  const handleRate = async () => {
    if (overall === 0 || effectiveness === 0 || reusability === 0) {
      setStatus('Please fill in all three ratings.');
      return;
    }
    setSubmitting(true);
    try {
      await ratePrompt({
        address: CONTRACT_ADDRESS, abi: ABI,
        functionName: 'ratePrompt',
        args: [listing.id, overall, effectiveness, reusability],
      });
      setShowRate(false);
      setStatus('Rating submitted — thanks!');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) {
      setStatus(`Rating error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col">
      <ListingCard
        listingId={listing.id}
        title={listing.title}
        category={listing.category}
        seller={listing.seller}
        price={listing.price}
        isPurchased
        isOwnListing={false}
        isBuying={false}
        onBuy={() => {}}
        specificityScore={listing.specificityScore}
        complexityScore={listing.complexityScore}
        structureBadges={listing.structureBadges}
        totalRatings={listing.totalRatings}
        ratingSum={listing.ratingSum}
        effectivenessSum={listing.effectivenessSum}
        reusabilitySum={listing.reusabilitySum}
        sellerAvgRating={0}
        isVerifiedSeller={false}
      />

      {/* Reveal button — visually attached to card */}
      <button
        onClick={handleReveal}
        disabled={revealing}
        className="border border-t-0 border-green-500/20 text-green-400/60 text-sm font-mono py-3 hover:bg-green-500/5 hover:text-green-400 hover:border-green-400/40 transition-all disabled:opacity-30 uppercase tracking-wider flex items-center justify-center gap-2"
      >
        {revealing ? <><Spinner /> Decrypting…</> : '🔑 Reveal Prompt'}
      </button>

      {/* Status line */}
      {status && (
        <p className={`text-[10px] font-mono px-1 pt-1.5 ${
          status.startsWith('Error') ? 'text-red-400/60' : 'text-white/35'
        }`}>
          {revealing && <Spinner />}{' '}{status}
        </p>
      )}

      {/* Rating form */}
      {showRate && !alreadyRated && (
        <div className="border border-t-0 border-white/10 p-4 flex flex-col gap-3 bg-black">
          <div className="flex items-center gap-2">
            <div className="w-3 h-px bg-white/20" />
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Rate this prompt</span>
          </div>
          <StarPicker label="Overall"       value={overall}       onChange={setOverall} />
          <StarPicker label="Effectiveness" value={effectiveness} onChange={setEffectiveness} />
          <StarPicker label="Reusability"   value={reusability}   onChange={setReusability} />
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleRate}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 text-[10px] font-mono border border-white/25 text-white/50 py-2 hover:border-white hover:text-white hover:bg-white hover:text-black transition-all disabled:opacity-30 uppercase tracking-wider"
            >
              {submitting ? <><Spinner /> Submitting</> : 'Submit Rating'}
            </button>
            <button
              onClick={() => setShowRate(false)}
              className="text-[10px] font-mono border border-white/10 text-white/25 px-4 py-2 hover:border-white/25 hover:text-white/40 transition-all uppercase"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {plaintext && <PromptModal plaintext={plaintext} onClose={() => setPlaintext(null)} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyPromptsPage() {
  const { address }         = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient        = usePublicClient();
  const { data: rawListings } = useListings();
  const listings            = (rawListings ?? []) as ListingView[];

  if (!address) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 flex flex-col items-center justify-center py-32 gap-5">
          <div className="relative w-16 h-16 border border-white/10 flex items-center justify-center">
            <span className="text-3xl opacity-20">🔑</span>
            <div className="absolute -top-px -left-px w-3 h-3 border-t border-l border-white/15" />
            <div className="absolute -bottom-px -right-px w-3 h-3 border-b border-r border-white/15" />
          </div>
          <div className="text-center">
            <p className="text-sm font-mono text-white/40 uppercase tracking-wider mb-1">Wallet not connected</p>
            <p className="text-xs font-mono text-white/20">Connect your wallet to view purchased prompts.</p>
          </div>
        </main>
      </div>
    );
  }

  const isLoading = rawListings === undefined;

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-px bg-white/30" />
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">004</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <h1 className="text-xl font-mono font-bold text-white uppercase tracking-wider mb-1">
            My Prompts
          </h1>
          <p className="text-xs font-mono text-white/30">
            Prompts you have purchased. Click Reveal to decrypt via MetaMask.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-white/10 h-64 animate-pulse bg-white/5" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center gap-6 py-24 text-center">
            <div className="relative w-20 h-20 border border-white/10 flex items-center justify-center">
              <span className="text-4xl opacity-15">🔒</span>
              <div className="absolute -top-px -left-px w-4 h-4 border-t border-l border-white/15" />
              <div className="absolute -bottom-px -right-px w-4 h-4 border-b border-r border-white/15" />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-mono text-white/40 uppercase tracking-wider">Your vault is empty</p>
              <p className="text-xs font-mono text-white/20 max-w-xs">
                Once you purchase a prompt from the marketplace, it will appear here ready to decrypt.
              </p>
            </div>
            <Link
              href="/browse"
              className="text-[10px] font-mono border border-white/20 text-white/40 px-6 py-2.5 hover:border-white hover:text-white transition-all uppercase tracking-wider"
            >
              Browse Marketplace →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <PurchasedListing
                key={listing.id.toString()}
                listing={listing}
                address={address}
                walletClient={walletClient}
                publicClient={publicClient}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
