'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import Navbar from '@/components/Navbar';
import ListingCard from '@/components/ListingCard';
import PromptModal from '@/components/PromptModal';
import {
  useListings,
  useHasPurchased,
  useHasRated,
  useRatePrompt,
  ABI,
  CONTRACT_ADDRESS,
  type ListingView,
} from '@/lib/contract';
import { eciesDecrypt, fetchFromIPFS } from '@/lib/ecies';

function StarPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`text-base transition-colors ${i <= value ? 'text-yellow-400' : 'text-white/10 hover:text-white/30'}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function PurchasedListing({
  listing,
  address,
  walletClient,
  publicClient,
}: {
  listing: ListingView;
  address: `0x${string}`;
  walletClient: any;
  publicClient: any;
}) {
  const { data: purchased } = useHasPurchased(listing.id, address);
  const { data: alreadyRated } = useHasRated(listing.id, address);
  const { writeContractAsync: ratePrompt } = useRatePrompt();

  const [revealing, setRevealing] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [showRateForm, setShowRateForm] = useState(false);
  const [overall, setOverall] = useState(0);
  const [effectiveness, setEffectiveness] = useState(0);
  const [reusability, setReusability] = useState(0);
  const [rating, setRating] = useState(false);

  useEffect(() => {
    return () => { setPlaintext(null); };
  }, []);

  if (!purchased) return null;

  const handleReveal = async () => {
    if (!walletClient || !publicClient) return;
    setRevealing(true);
    try {
      setStatus('Fetching IPFS CID from contract...');
      const cid = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPromptCID',
        args: [listing.id],
        account: address,
      }) as string;

      setStatus('Fetching ECIES blob from IPFS...');
      const eciesHex = await fetchFromIPFS(cid);

      setStatus('Requesting MetaMask decryption...');
      const decryptedBytes = await eciesDecrypt(eciesHex, address);
      setPlaintext(new TextDecoder().decode(decryptedBytes));
      setStatus('');
      if (!alreadyRated) setShowRateForm(true);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setRevealing(false);
    }
  };

  const handleRate = async () => {
    if (overall === 0 || effectiveness === 0 || reusability === 0) {
      setStatus('Please select all three ratings.');
      return;
    }
    setRating(true);
    try {
      await ratePrompt({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'ratePrompt',
        args: [listing.id, overall, effectiveness, reusability],
      });
      setShowRateForm(false);
      setStatus('Thanks for rating!');
    } catch (e: any) {
      setStatus(`Rating error: ${e.message}`);
    } finally {
      setRating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ListingCard
        listingId={listing.id}
        title={listing.title}
        category={listing.category}
        seller={listing.seller}
        price={listing.price}
        isPurchased
        isOwnListing={false}
        isBidding={false}
        onBid={() => {}}
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

      {status && (
        <p className="text-[10px] font-mono text-white/50 px-1">{status}</p>
      )}

      <button
        onClick={handleReveal}
        disabled={revealing}
        className="text-[10px] font-mono border border-green-500/30 text-green-400/70 px-3 py-1.5 hover:border-green-400 hover:text-green-400 transition-all disabled:opacity-30 uppercase tracking-wider"
      >
        {revealing ? 'DECRYPTING...' : 'REVEAL PROMPT'}
      </button>

      {showRateForm && !alreadyRated && (
        <div className="border border-white/20 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-px bg-white/30" />
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
              Rate this prompt
            </span>
          </div>
          <StarPicker label="Overall"       value={overall}       onChange={setOverall} />
          <StarPicker label="Effectiveness" value={effectiveness} onChange={setEffectiveness} />
          <StarPicker label="Reusability"   value={reusability}   onChange={setReusability} />
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleRate}
              disabled={rating}
              className="flex-1 text-[10px] font-mono border border-white/30 text-white/60 py-2 hover:border-white hover:text-white hover:bg-white hover:text-black transition-all disabled:opacity-30 uppercase tracking-wider"
            >
              {rating ? 'Submitting...' : 'Submit Rating'}
            </button>
            <button
              onClick={() => setShowRateForm(false)}
              className="text-[10px] font-mono border border-white/10 text-white/30 px-4 py-2 hover:border-white/30 hover:text-white/50 transition-all uppercase"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {plaintext && (
        <PromptModal plaintext={plaintext} onClose={() => setPlaintext(null)} />
      )}
    </div>
  );
}

export default function MyPromptsPage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { data: rawListings } = useListings();
  const listings = (rawListings ?? []) as ListingView[];

  if (!address) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-20 text-center">
          <p className="text-xs font-mono text-white/30 uppercase tracking-widest">
            Connect your wallet to view purchased prompts.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-px bg-white/40" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">004</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <h1 className="text-2xl font-mono font-bold text-white uppercase tracking-wider mb-1">
            My Prompts
          </h1>
          <p className="text-xs font-mono text-white/40">
            Prompts you have purchased. Click reveal to decrypt via MetaMask.
          </p>
        </div>

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

        {listings.length === 0 && (
          <p className="text-[10px] font-mono text-white/20 text-center py-20 uppercase tracking-widest">
            No prompts found.{' '}
            <a href="/browse" className="text-white/40 underline hover:text-white transition-colors">
              Browse the marketplace
            </a>.
          </p>
        )}
      </main>
    </div>
  );
}
