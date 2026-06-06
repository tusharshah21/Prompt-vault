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
import { fhenixHelium } from '@/lib/contract';
import { createFheClient, decryptCidChunks } from '@/lib/fhe';
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
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`text-xl transition-colors ${i <= value ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}
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
  // SECURITY: plaintext in RAM only. Never persisted or sent anywhere.
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [showRateForm, setShowRateForm] = useState(false);
  const [overall, setOverall] = useState(0);
  const [effectiveness, setEffectiveness] = useState(0);
  const [reusability, setReusability] = useState(0);
  const [rating, setRating] = useState(false);

  // Wipe plaintext from RAM on unmount
  useEffect(() => {
    return () => { setPlaintext(null); };
  }, []);

  if (!purchased) return null;

  const handleReveal = async () => {
    if (!walletClient || !publicClient) return;
    setRevealing(true);
    try {
      setStatus('Fetching FHE-encrypted CID chunks...');
      const [chunk0, chunk1, chunk2] = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPromptCt',
        args: [listing.id],
        account: address,
      }) as [`0x${string}`, `0x${string}`, `0x${string}`];

      setStatus('Decrypting CID via CoFHE coprocessor...');
      const client = await createFheClient(walletClient, publicClient);
      const cid = await decryptCidChunks(client, chunk0, chunk1, chunk2, fhenixHelium.id, address);

      setStatus('Fetching ECIES blob from IPFS...');
      const eciesHex = await fetchFromIPFS(cid);

      setStatus('Requesting MetaMask decryption...');
      const decryptedBytes = await eciesDecrypt(eciesHex, address);
      // after decrypting: TextDecoder converts bytes → plaintext string
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
        isPurchased
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
        <p className="text-xs text-purple-400 font-mono px-1">{status}</p>
      )}

      <button
        onClick={handleReveal}
        disabled={revealing}
        className="text-xs bg-green-900 hover:bg-green-800 text-green-300 font-mono px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {revealing ? 'Decrypting...' : 'Reveal Prompt'}
      </button>

      {/* Rate Prompt form — appears after reveal if not yet rated */}
      {showRateForm && !alreadyRated && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-white">Rate this prompt</h4>
          <StarPicker label="Overall" value={overall} onChange={setOverall} />
          <StarPicker label="Effectiveness" value={effectiveness} onChange={setEffectiveness} />
          <StarPicker label="Reusability" value={reusability} onChange={setReusability} />
          <div className="flex gap-2">
            <button
              onClick={handleRate}
              disabled={rating}
              className="flex-1 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-2 rounded-lg transition-colors"
            >
              {rating ? 'Submitting...' : 'Submit Rating'}
            </button>
            <button
              onClick={() => setShowRateForm(false)}
              className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-400 px-4 py-2 rounded-lg transition-colors"
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
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-20 text-center">
          <p className="text-gray-400">Connect your wallet to view purchased prompts.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">My Prompts</h1>
        <p className="text-gray-400 mb-8">Prompts you have purchased. Click reveal to decrypt via FHE + MetaMask.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
          <p className="text-gray-500 text-center py-20">
            No prompts found.{' '}
            <a href="/browse" className="text-purple-400 underline">Browse the marketplace</a>.
          </p>
        )}
      </main>
    </div>
  );
}
