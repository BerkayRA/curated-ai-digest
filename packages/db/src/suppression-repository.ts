import { type PrismaClient, type Suppression } from '@prisma/client';

import { prisma as defaultClient } from './index';

// ---------------------------------------------------------------------------
// Global suppression list — a do-not-send firewall keyed by email, applied
// across ALL topics (distinct from per-topic unsubscribe). Fed by hard bounces /
// complaints from provider webhooks and by manual admin entries.
//
// Invariant: the presence of a Suppression row means "do not send". Soft
// (transient) bounces are intentionally NOT globally suppressed here — they keep
// only the per-membership `bounced` status set by the webhook. The
// `soft_bounce_threshold` reason is reserved for a future count-then-suppress
// enhancement.
// ---------------------------------------------------------------------------

export interface ListSuppressionsOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SuppressionRepository {
  findByEmail(email: string): Promise<Suppression | null>;
  /** Suppress (or escalate an existing row to) a hard bounce. Idempotent on email. */
  insertHardBounce(email: string, source: string): Promise<Suppression>;
  /** Suppress (or escalate an existing row to) a complaint. Idempotent on email. */
  insertComplaint(email: string, source: string): Promise<Suppression>;
  /** Manual admin suppression. Idempotent on email. */
  insertManual(email: string): Promise<Suppression>;
  remove(id: string): Promise<void>;
  listAll(opts?: ListSuppressionsOptions): Promise<Suppression[]>;
  count(opts?: Pick<ListSuppressionsOptions, 'search'>): Promise<number>;
  /** Of the given emails, the subset currently suppressed. */
  isSuppressedBatch(emails: readonly string[]): Promise<Set<string>>;
}

export function createSuppressionRepository(
  client: PrismaClient = defaultClient,
): SuppressionRepository {
  const searchWhere = (search?: string) =>
    search ? { email: { contains: search.toLowerCase() } } : {};

  return {
    findByEmail(email: string): Promise<Suppression | null> {
      return client.suppression.findUnique({ where: { email } });
    },

    insertHardBounce(email: string, source: string): Promise<Suppression> {
      return client.suppression.upsert({
        where: { email },
        update: { reason: 'hard_bounce', source },
        create: { email, reason: 'hard_bounce', source },
      });
    },

    insertComplaint(email: string, source: string): Promise<Suppression> {
      return client.suppression.upsert({
        where: { email },
        update: { reason: 'complaint', source },
        create: { email, reason: 'complaint', source },
      });
    },

    insertManual(email: string): Promise<Suppression> {
      return client.suppression.upsert({
        where: { email },
        update: {},
        create: { email, reason: 'manual', source: 'admin' },
      });
    },

    async remove(id: string): Promise<void> {
      await client.suppression.delete({ where: { id } });
    },

    listAll(opts: ListSuppressionsOptions = {}): Promise<Suppression[]> {
      return client.suppression.findMany({
        where: searchWhere(opts.search),
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 50,
        skip: opts.offset ?? 0,
      });
    },

    count(opts: Pick<ListSuppressionsOptions, 'search'> = {}): Promise<number> {
      return client.suppression.count({ where: searchWhere(opts.search) });
    },

    async isSuppressedBatch(emails: readonly string[]): Promise<Set<string>> {
      if (emails.length === 0) return new Set();
      const rows = await client.suppression.findMany({
        where: { email: { in: [...emails] } },
        select: { email: true },
      });
      return new Set(rows.map((r) => r.email));
    },
  };
}
