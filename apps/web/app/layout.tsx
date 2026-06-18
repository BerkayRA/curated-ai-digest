import type { Metadata } from 'next';
import '@digest/brand/tokens.css';
import '../styles/global.css';

export const metadata: Metadata = {
  title: 'Curated AI Digest',
  description: 'Haftalık AI haber digesti yönetim paneli',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

// Root layout is chrome-free: public pages (/login, /unsubscribe) render full-page.
// The authenticated dashboard shell lives in app/(dashboard)/layout.tsx.
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
