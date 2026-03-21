import './globals.css';
import dynamic from 'next/dynamic';
import Script from 'next/script';

const AppShell = dynamic(() => import('./components/AppShell'), { ssr: false });

export const metadata = {
  title: 'Samsung Demo',
  description: 'Panel sterowania lektorami i RFID',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pl">
      <body suppressHydrationWarning>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
