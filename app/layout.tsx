'use client';

import './globals.css';
import { WagmiProvider, createConfig, http } from 'wagmi';
import {
  RainbowKitProvider,
  getDefaultWallets,
  connectorsForWallets,
} from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sepolia } from '@/lib/contract';
import '@rainbow-me/rainbowkit/styles.css';

const { wallets } = getDefaultWallets();
const connectors = connectorsForWallets(wallets, {
  appName: 'PromptVault',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'demo',
});

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
  transports: { [sepolia.id]: http() },
});

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* SECURITY: Disable React DevTools in production to prevent RAM inspection */}
        <script dangerouslySetInnerHTML={{ __html:
          `if(typeof window!=='undefined'&&'${process.env.NODE_ENV}'==='production'){window.__REACT_DEVTOOLS_GLOBAL_HOOK__={isDisabled:true}}`
        }} />
      </head>
      <body>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider>{children}</RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
