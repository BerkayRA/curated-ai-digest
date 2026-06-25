import { prisma } from '@digest/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { DeliverabilitySection } from '@/components/settings/DeliverabilitySection';
import { SuppressionSection } from '@/components/settings/SuppressionSection';

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
      <DeliverabilitySection />
      <SuppressionSection />
    </section>
  );
}
