import type { Metadata } from 'next';
import '@mega-bulten/brand/tokens.css';
import '../styles/global.css';

export const metadata: Metadata = {
  title: 'Mega Bülten',
  description: 'Haftalık AI haber bülteni yönetim paneli',
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
