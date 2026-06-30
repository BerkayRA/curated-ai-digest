import {
  type PrismaClient,
  type EmailEvent,
  type EmailEventType,
} from '@prisma/client';

import { prisma as defaultClient } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecordEmailEventData {
  sendId: string;
  type: EmailEventType;
  url?: string | null;
  urlIndex?: number | null;
  ipHash?: string | null;
  uaClass?: string | null;
  /** Webhook dedup key; when present an existing event with the same key is reused. */
  providerEventId?: string | null;
  occurredAt: Date;
}

export interface EmailEventRepository {
  /** Insert an engagement event. */
  record(data: RecordEmailEventData): Promise<EmailEvent>;
  /**
   * Record a webhook event idempotently: if an event with the same
   * providerEventId already exists, return it instead of inserting a duplicate.
   */
  recordOnce(data: RecordEmailEventData & { providerEventId: string }): Promise<EmailEvent>;
  /** Whether this send already has an `open` within the dedup window (since `since`). */
  hasRecentOpen(sendId: string, ipHash: string, since: Date): Promise<boolean>;
  findBySendId(sendId: string): Promise<EmailEvent[]>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmailEventRepository(
  client: PrismaClient = defaultClient,
): EmailEventRepository {
  return {
    record(data: RecordEmailEventData): Promise<EmailEvent> {
      return client.emailEvent.create({
        data: {
          sendId: data.sendId,
          type: data.type,
          url: data.url ?? null,
          urlIndex: data.urlIndex ?? null,
          ipHash: data.ipHash ?? null,
          uaClass: data.uaClass ?? null,
          providerEventId: data.providerEventId ?? null,
          occurredAt: data.occurredAt,
        },
      });
    },

    async recordOnce(
      data: RecordEmailEventData & { providerEventId: string },
    ): Promise<EmailEvent> {
      const existing = await client.emailEvent.findUnique({
        where: { providerEventId: data.providerEventId },
      });
      if (existing) return existing;

      return client.emailEvent.create({
        data: {
          sendId: data.sendId,
          type: data.type,
          url: data.url ?? null,
          urlIndex: data.urlIndex ?? null,
          ipHash: data.ipHash ?? null,
          uaClass: data.uaClass ?? null,
          providerEventId: data.providerEventId,
          occurredAt: data.occurredAt,
        },
      });
    },

    async hasRecentOpen(sendId: string, ipHash: string, since: Date): Promise<boolean> {
      const count = await client.emailEvent.count({
        where: { sendId, type: 'open', ipHash, occurredAt: { gte: since } },
      });
      return count > 0;
    },

    findBySendId(sendId: string): Promise<EmailEvent[]> {
      return client.emailEvent.findMany({ where: { sendId } });
    },
  };
}
