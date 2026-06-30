import {
  type ConsentBasis,
  type PrismaClient,
  type SubscriberStatus,
  type SubscriberTopic,
} from '@prisma/client';

import { prisma as defaultClient } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertSubscriberTopicData {
  subscriberId: string;
  topicId: string;
  status?: SubscriberStatus;
  /** Per-topic unsubscribe token; generated when omitted. */
  unsubscribeToken?: string;
  /** Double opt-in confirmation token (set when creating a `pending` membership). */
  confirmToken?: string | null;
  /** Recorded lawful basis for this membership (İYS-ready audit trail). */
  consentBasis?: ConsentBasis;
  consentAt?: Date | null;
  consentSource?: string | null;
}

/** A dispatch-ready recipient: the membership row joined to subscriber identity. */
export interface TopicRecipient {
  subscriberTopicId: string;
  subscriberId: string;
  email: string;
  displayName: string | null;
  /** Per-topic unsubscribe token (NOT the global Subscriber token). */
  unsubscribeToken: string;
}

/**
 * A membership row WITHOUT the secret tokens. Returned by the admin list
 * endpoints so neither the unsubscribe nor the confirm token leaks into list
 * responses.
 */
export type SubscriberTopicSummary = Omit<
  SubscriberTopic,
  'unsubscribeToken' | 'confirmToken'
>;

export interface SubscriberTopicRepository {
  /** All topic memberships for one subscriber (token excluded). */
  findBySubscriberId(subscriberId: string): Promise<SubscriberTopicSummary[]>;
  /** All memberships for a topic (status-agnostic, token excluded) — admin UI. */
  findByTopicId(topicId: string): Promise<SubscriberTopicSummary[]>;
  /**
   * Dispatch recipients: memberships that are active AND whose global subscriber
   * is not unsubscribed/bounced. The global status is a hard ceiling.
   */
  findActiveRecipients(topicId: string): Promise<TopicRecipient[]>;
  /** Count active recipients per topic membership (admin counts). */
  countByTopicId(topicId: string): Promise<number>;
  upsert(data: UpsertSubscriberTopicData): Promise<SubscriberTopic>;
  setStatus(
    subscriberId: string,
    topicId: string,
    status: SubscriberStatus,
  ): Promise<SubscriberTopic>;
  /** Resolve a membership by its per-topic unsubscribe token. */
  findByUnsubscribeToken(token: string): Promise<SubscriberTopic | null>;
  /** Resolve a `pending` membership by its double opt-in confirm token. */
  findPendingByConfirmToken(token: string): Promise<SubscriberTopic | null>;
  /**
   * Confirm a double opt-in: flip a `pending` membership matching `token` to
   * `active`, stamp the lawful basis, and clear the confirm token. Returns the
   * updated row, or null when no `pending` membership matches (unknown/used token).
   */
  confirmMembership(token: string): Promise<SubscriberTopic | null>;
  delete(subscriberId: string, topicId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Prisma select that excludes the per-topic unsubscribe token from list reads.
// ---------------------------------------------------------------------------

const SUMMARY_SELECT = {
  id: true,
  subscriberId: true,
  topicId: true,
  status: true,
  // Consent audit fields are safe to surface in admin lists; the secret tokens
  // (unsubscribeToken, confirmToken) remain excluded.
  consentBasis: true,
  consentAt: true,
  consentSource: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `SubscriberTopicRepository` bound to the given PrismaClient. Defaults
 * to the shared singleton; accepts any compatible client so tests can inject a
 * fake without a live database.
 */
export function createSubscriberTopicRepository(
  client: PrismaClient = defaultClient,
): SubscriberTopicRepository {
  return {
    findBySubscriberId(subscriberId: string): Promise<SubscriberTopicSummary[]> {
      return client.subscriberTopic.findMany({
        where: { subscriberId },
        select: SUMMARY_SELECT,
      });
    },

    findByTopicId(topicId: string): Promise<SubscriberTopicSummary[]> {
      return client.subscriberTopic.findMany({
        where: { topicId },
        select: SUMMARY_SELECT,
      });
    },

    async findActiveRecipients(topicId: string): Promise<TopicRecipient[]> {
      const rows = await client.subscriberTopic.findMany({
        where: {
          topicId,
          status: 'active',
          subscriber: { status: { notIn: ['unsubscribed', 'bounced'] } },
        },
        select: {
          id: true,
          subscriberId: true,
          unsubscribeToken: true,
          subscriber: { select: { email: true, displayName: true } },
        },
      });

      return rows.map((row) => ({
        subscriberTopicId: row.id,
        subscriberId: row.subscriberId,
        email: row.subscriber.email,
        displayName: row.subscriber.displayName,
        unsubscribeToken: row.unsubscribeToken,
      }));
    },

    countByTopicId(topicId: string): Promise<number> {
      return client.subscriberTopic.count({
        where: {
          topicId,
          status: 'active',
          subscriber: { status: { notIn: ['unsubscribed', 'bounced'] } },
        },
      });
    },

    upsert(data: UpsertSubscriberTopicData): Promise<SubscriberTopic> {
      const {
        subscriberId,
        topicId,
        status,
        unsubscribeToken,
        confirmToken,
        consentBasis,
        consentAt,
        consentSource,
      } = data;
      const token = unsubscribeToken ?? randomToken();
      return client.subscriberTopic.upsert({
        where: { subscriberId_topicId: { subscriberId, topicId } },
        // On re-add, set the requested status (defaulting to 'active') and
        // refresh consent fields when provided — but a re-add that omits them
        // does NOT clobber an existing lawful basis.
        update: {
          status: status ?? 'active',
          ...(confirmToken !== undefined ? { confirmToken } : {}),
          ...(consentBasis !== undefined ? { consentBasis } : {}),
          ...(consentAt !== undefined ? { consentAt } : {}),
          ...(consentSource !== undefined ? { consentSource } : {}),
        },
        create: {
          subscriberId,
          topicId,
          status: status ?? 'active',
          unsubscribeToken: token,
          confirmToken: confirmToken ?? null,
          consentBasis: consentBasis ?? null,
          consentAt: consentAt ?? null,
          consentSource: consentSource ?? null,
        },
      });
    },

    setStatus(
      subscriberId: string,
      topicId: string,
      status: SubscriberStatus,
    ): Promise<SubscriberTopic> {
      return client.subscriberTopic.update({
        where: { subscriberId_topicId: { subscriberId, topicId } },
        data: { status },
      });
    },

    findByUnsubscribeToken(token: string): Promise<SubscriberTopic | null> {
      return client.subscriberTopic.findUnique({ where: { unsubscribeToken: token } });
    },

    async findPendingByConfirmToken(token: string): Promise<SubscriberTopic | null> {
      const row = await client.subscriberTopic.findUnique({
        where: { confirmToken: token },
      });
      return row?.status === 'pending' ? row : null;
    },

    async confirmMembership(token: string): Promise<SubscriberTopic | null> {
      // Idempotent: resolve the pending membership first (capturing its id),
      // then flip it by id and clear the confirm token. A replayed confirm link
      // finds no pending row → safe no-op returning null.
      // NOTE: find-then-update is not strictly atomic, but the outcome is still
      // idempotent-`active` and consentAt reflects the winning write —
      // acceptable for this low-traffic flow.
      const pending = await client.subscriberTopic.findUnique({
        where: { confirmToken: token },
      });
      if (!pending || pending.status !== 'pending') return null;

      return client.subscriberTopic.update({
        where: { id: pending.id },
        data: {
          status: 'active',
          consentBasis: 'double_opt_in',
          consentAt: new Date(),
          consentSource: 'public_signup',
          confirmToken: null,
        },
      });
    },

    async delete(subscriberId: string, topicId: string): Promise<void> {
      await client.subscriberTopic.delete({
        where: { subscriberId_topicId: { subscriberId, topicId } },
      });
    },
  };
}

/** Crypto-strong opaque token for per-topic unsubscribe links. */
function randomToken(): string {
  // A UUID keeps tokens unguessable and matches the migration backfill
  // (gen_random_uuid()).
  return globalThis.crypto.randomUUID();
}
