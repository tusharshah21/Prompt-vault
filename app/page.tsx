'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

const FEATURES = [
  {
    icon: '🔐',
    title: 'ECIES Layer',
    desc: 'Prompt is encrypted with the buyer\'s X25519 public key before it ever touches the chain.',
  },
  {
    icon: '🧮',
    title: 'FHE Layer',
    desc: 'The encrypted blob is wrapped in Fhenix Fully Homomorphic Encryption via the CoFHE coprocessor.',
  },
  {
    icon: '⛓️',
    title: 'On-Chain Settlement',
    desc: 'Smart contract on Fhenix Helium handles payments and access control with zero plaintext exposure.',
  },
  {
    icon: '🗝️',
    title: 'Buyer Decryption',
    desc: 'After purchase, only the buyer\'s MetaMask key can strip both layers and reveal the prompt.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4">
        {/* Hero */}
        <section className="py-24 text-center flex flex-col items-center gap-6">
          <div className="inline-block bg-purple-950 border border-purple-800 rounded-full px-4 py-1.5 text-xs text-purple-300 font-mono tracking-wide">
            Built on Fhenix CoFHE · Helium Testnet
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight">
            Privacy-Preserving<br />
            <span className="text-purple-400">Prompt Marketplace</span>
          </h1>

          <p className="text-lg text-gray-400 max-w-xl">
            Buy and sell AI prompts with end-to-end double encryption.
            The chain never sees your plaintext — not even the seller can decrypt after listing.
          </p>

          <div className="flex gap-4 flex-wrap justify-center">
            <Link
              href="/browse"
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Browse Prompts
            </Link>
            <Link
              href="/sell"
              className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Sell a Prompt
            </Link>
          </div>
        </section>

        {/* Encryption flow */}
        <section className="py-10 border-t border-gray-800">
          <h2 className="text-center text-xl font-semibold text-white mb-8">
            Double-Encryption Architecture
          </h2>

          <div className="flex flex-col md:flex-row items-center justify-center gap-3 text-sm font-mono">
            {['Plaintext', 'ECIES Encrypt', 'FHE Wrap', 'On-chain ctHash'].map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <div
                  className={`px-4 py-2 rounded-lg border text-center min-w-32 ${
                    i === 0
                      ? 'border-gray-600 text-white bg-gray-900'
                      : i === 1
                      ? 'border-yellow-800 text-yellow-300 bg-yellow-950'
                      : i === 2
                      ? 'border-purple-800 text-purple-300 bg-purple-950'
                      : 'border-green-800 text-green-300 bg-green-950'
                  }`}
                >
                  {step}
                </div>
                {i < 3 && <span className="text-gray-600">→</span>}
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="py-16 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex gap-4"
            >
              <span className="text-2xl">{f.icon}</span>
              <div>
                <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                <p className="text-sm text-gray-400">{f.desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* CTA */}
        <section className="py-12 text-center border-t border-gray-800">
          <p className="text-gray-500 text-sm font-mono">
            Powered by{' '}
            <span className="text-purple-400">@fhenixprotocol/cofhe-contracts</span>
            {' · '}
            <span className="text-yellow-400">@metamask/eth-sig-util</span>
            {' · '}
            <span className="text-green-400">Next.js 14</span>
          </p>
        </section>
      </main>
    </div>
  );
}
