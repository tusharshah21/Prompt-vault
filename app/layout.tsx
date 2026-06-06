import './globals.css';
import '@rainbow-me/rainbowkit/styles.css';
import Providers from '@/components/Providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html:
          `if(typeof window!=='undefined'&&'${process.env.NODE_ENV}'==='production'){window.__REACT_DEVTOOLS_GLOBAL_HOOK__={isDisabled:true}}`
        }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
