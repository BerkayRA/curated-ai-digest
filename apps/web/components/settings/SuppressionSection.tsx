/**
 * Server wrapper for the global suppression list. Loads the first page on the
 * server and hands it to the client <SuppressionList />. The settings page
 * (force-dynamic) drops <SuppressionSection /> in directly.
 */

import { prisma, createSuppressionRepository } from '@digest/db';
import { SuppressionList } from './SuppressionList';

export async function SuppressionSection() {
  const repo = createSuppressionRepository(prisma);
  const [data, total] = await Promise.all([repo.listAll(), repo.count()]);

  return <SuppressionList initialData={data} initialTotal={total} />;
}
