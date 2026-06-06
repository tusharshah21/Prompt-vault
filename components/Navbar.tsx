'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';

export default function Navbar() {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950 sticky top-0 z-40">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-xl font-bold text-purple-400 tracking-tight">
          PromptVault
        </Link>
        <div className="hidden md:flex gap-6 text-sm text-gray-400">
          <Link href="/browse" className="hover:text-white transition-colors">Browse</Link>
          <Link href="/sell" className="hover:text-white transition-colors">Sell</Link>
          <Link href="/my-prompts" className="hover:text-white transition-colors">My Prompts</Link>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {address && balance && (
          <span className="text-sm text-gray-400 hidden md:block">
            {parseFloat(formatEther(balance.value)).toFixed(4)} ETH
          </span>
        )}
        <ConnectButton />
      </div>
    </nav>
  );
}
