import { prisma } from '@digest/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { SettingsForm } from '@/components/settings/SettingsForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ayarlar — Curated AI Digest',
};

export default async function SettingsPage() {
  const settings = await prisma.settings.findFirst();

  return (
    <section aria-label="Ayarlar">
      <PageHeader title="Ayarlar" description="Gönderim ve sağlayıcı yapılandırması" />
      <SettingsForm settings={settings} />
    </section>
  );
}
