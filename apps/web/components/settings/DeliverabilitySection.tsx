/**
 * Server wrapper for deliverability (SPF/DMARC/DKIM) health. Runs the initial
 * DNS check on the server and hands the result + inputs to the client card.
 * The settings page (force-dynamic) drops <DeliverabilitySection /> in directly.
 */

import { prisma } from '@digest/db';
import { checkDeliverability, resolveDkimSelector } from '@/lib/dns-check';
import { DeliverabilityCard } from './DeliverabilityCard';

export async function DeliverabilitySection() {
  const settings = await prisma.settings.findFirst();
  const fromAddress = settings?.fromAddress ?? '';
  const selector = resolveDkimSelector(
    settings?.dkimSelector ?? null,
    settings?.activeProvider ?? 'acs_email',
  );

  const initial = await checkDeliverability(fromAddress, selector);

  return (
    <DeliverabilityCard initial={initial} fromAddress={fromAddress} dkimSelector={selector} />
  );
}
