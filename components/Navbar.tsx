'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';

const NAV_LINKS = [
  { href: '/browse', label: 'BROWSE' },
  { href: '/sell', label: 'SELL' },
  { href: '/my-prompts', label: 'MY PROMPTS' },
];

export default function Navbar() {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-white/20 bg-black sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="font-mono text-white text-lg font-bold tracking-widest italic transform -skew-x-12"
        >
          PROMPTVAULT
        </Link>

        <div className="h-4 w-px bg-white/20 hidden md:block" />

        <div className="hidden md:flex gap-5 text-[10px] font-mono text-white/40 tracking-wider">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`transition-colors hover:text-white ${
                pathname === href ? 'text-white' : ''
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {address && balance && (
          <span className="text-[10px] text-white/30 font-mono hidden md:block">
            {parseFloat(formatEther(balance.value)).toFixed(4)} ETH
          </span>
        )}
        <ConnectButton />
      </div>
    </nav>
  );
}
