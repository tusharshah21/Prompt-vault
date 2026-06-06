'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';

const NAV_LINKS = [
  { href: '/browse', label: 'Browse' },
  { href: '/sell', label: 'Sell' },
  { href: '/my-prompts', label: 'My Prompts' },
];

export default function Navbar() {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-black border-b border-white/20 sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Left: logo + links */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="font-mono text-white text-base font-bold tracking-widest italic -skew-x-12 inline-block hover:text-white/80 transition-colors"
          >
            PROMPTVAULT
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative px-3 py-1.5 text-xs font-mono tracking-wide transition-colors ${
                    active ? 'text-white' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {label}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-px bg-white" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: balance + connect + hamburger */}
        <div className="flex items-center gap-3">
          {address && balance && (
            <span className="hidden sm:block text-[10px] font-mono text-white/25 tabular-nums">
              {parseFloat(formatEther(balance.value)).toFixed(4)} ETH
            </span>
          )}

          <ConnectButton
            showBalance={false}
            chainStatus="none"
            accountStatus="avatar"
          />

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 border border-white/20 hover:border-white/50 transition-colors"
            aria-label="Toggle menu"
          >
            <span className={`block w-4 h-px bg-white/60 transition-all ${open ? 'rotate-45 translate-y-[5px]' : ''}`} />
            <span className={`block w-4 h-px bg-white/60 transition-all ${open ? 'opacity-0' : ''}`} />
            <span className={`block w-4 h-px bg-white/60 transition-all ${open ? '-rotate-45 -translate-y-[5px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-black">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`block px-6 py-3.5 text-sm font-mono border-b border-white/5 transition-colors ${
                  active ? 'text-white bg-white/5' : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {active && <span className="mr-2 text-white/30">›</span>}
                {label}
              </Link>
            );
          })}
          {address && balance && (
            <div className="px-6 py-3 text-[10px] font-mono text-white/20">
              {parseFloat(formatEther(balance.value)).toFixed(4)} ETH
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
