import {
  Prisma,
  type ConsentMode,
  type PrismaClient,
  type Topic,
  type TopicStatus,
} from '@prisma/client';

import { prisma as defaultClient } from './index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTopicData {
  slug: string;
  name: string;
  description?: string | null;
  /** Audience descriptor injected into rank/curate/QA prompts; null → default copy. */
  audience?: string | null;
  /** Voice descriptor injected into copywrite/QA prompts; null → default copy. */
  voice?: string | null;
  status?: TopicStatus;
  /** Consent mode; defaults to `business` at the DB level when omitted. */
  consentMode?: ConsentMode;
  sendDayOfWeek?: string | null;
  sendTime?: string | null;
  timezone?: string | null;
  pipelineLeadDays?: number | null;
  autoSendEnabled?: boolean | null;
  fromAddress?: string | null;
  replyTo?: string | null;
  brandLogoUrl?: string | null;
  brandColorHex?: string | null;
}

export interface UpdateTopicData {
  slug?: string;
  name?: string;
  description?: string | null;
  audience?: string | null;
  voice?: string | null;
  status?: TopicStatus;
  consentMode?: ConsentMode;
  sendDayOfWeek?: string | null;
  sendTime?: string | null;
  timezone?: string | null;
  pipelineLeadDays?: number | null;
  autoSendEnabled?: boolean | null;
  fromAddress?: string | null;
  replyTo?: string | null;
  brandLogoUrl?: string | null;
  brandColorHex?: string | null;
}

export interface TopicRepository {
  findAll(): Promise<Topic[]>;
  findActive(): Promise<Topic[]>;
  findBySlug(slug: string): Promise<Topic | null>;
  findById(id: string): Promise<Topic | null>;
  create(data: CreateTopicData): Promise<Topic>;
  update(id: string, data: UpdateTopicData): Promise<Topic>;
  /** Convenience for pause/activate toggles; equivalent to update(id, { status }). */
  setStatus(id: string, status: TopicStatus): Promise<Topic>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `TopicRepository` bound to the given PrismaClient. Defaults to the
 * shared singleton client; accepts any compatible client so tests can inject a
 * fake without a live database.
 */
export function createTopicRepository(
  client: PrismaClient = defaultClient,
): TopicRepository {
  return {
    findAll(): Promise<Topic[]> {
      return client.topic.findMany({});
    },

    findActive(): Promise<Topic[]> {
      return client.topic.findMany({ where: { status: 'active' } });
    },

    findBySlug(slug: string): Promise<Topic | null> {
      return client.topic.findUnique({ where: { slug } });
    },

    findById(id: string): Promise<Topic | null> {
      return client.topic.findUnique({ where: { id } });
    },

    create(data: CreateTopicData): Promise<Topic> {
      return client.topic.create({ data: data as Prisma.TopicCreateInput });
    },

    update(id: string, data: UpdateTopicData): Promise<Topic> {
      return client.topic.update({
        where: { id },
        data: data as Prisma.TopicUpdateInput,
      });
    },

    setStatus(id: string, status: TopicStatus): Promise<Topic> {
      return client.topic.update({ where: { id }, data: { status } });
    },
  };
}
