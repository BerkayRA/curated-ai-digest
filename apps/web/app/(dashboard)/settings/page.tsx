import { prisma } from '@mega-bulten/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { SettingsForm } from '@/components/settings/SettingsForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ayarlar — Mega Bülten',
};

export default async function SettingsPage() {
  const settings = await prisma.settings.findFirst();

  return (
    <section aria-labelledby="settings-heading">
      <PageHeader
        title="Ayarlar"
        description="Bülten gönderim ve sağlayıcı yapılandırması"
      />
      <SettingsForm settings={settings} />
    </section>
  );
}
