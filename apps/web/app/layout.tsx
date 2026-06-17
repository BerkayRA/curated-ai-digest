import type { Metadata } from 'next';
import '@mega-bulten/brand/tokens.css';
import '../styles/global.css';
import { AdminShell } from '@/components/shell/AdminShell';

export const metadata: Metadata = {
  title: 'Mega Bülten — Dashboard',
  description: 'Haftalık AI haber bülteni yönetim paneli',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="tr">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
