import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Singleton PrismaClient — prevents connection storms on hot-reload (Next.js
// dev server) by reusing the same instance across module evaluations.
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ---------------------------------------------------------------------------
// Re-export enums and Prisma namespace so consumers never import from
// '@prisma/client' directly.
// ---------------------------------------------------------------------------

export {
  IssueStatus,
  ArticleStatus,
  SendStatus,
  EmailProviderKind,
  SubscriberStatus,
  SourceType,
  TopicStatus,
  TopicTier,
  IssueItemKind,
  ConsentMode,
  ConsentBasis,
  AbStatus,
  SuppressionReason,
  Prisma,
} from '@prisma/client';

export type {
  Issue,
  IssueItem,
  CandidateArticle,
  Subscriber,
  Settings,
  Send,
  IngestRun,
  PipelineRun,
  AuditLog,
  Source,
  Topic,
  SubscriberTopic,
  EmailEvent,
  SubjectVariant,
  Suppression,
  Sponsor,
} from '@prisma/client';

export { EmailEventType } from '@prisma/client';

export { createSourceRepository } from './source-repository.js';
export type {
  SourceRepository,
  CreateSourceData,
  UpdateSourceData,
  HealthData,
} from './source-repository.js';

export { createTopicRepository } from './topic-repository.js';
export type { TopicRepository, CreateTopicData, UpdateTopicData } from './topic-repository.js';

export { createSubscriberTopicRepository } from './subscriber-topic-repository.js';
export type {
  SubscriberTopicRepository,
  SubscriberTopicSummary,
  UpsertSubscriberTopicData,
  TopicRecipient,
} from './subscriber-topic-repository.js';

export { createEmailEventRepository } from './email-event-repository.js';
export type { EmailEventRepository, RecordEmailEventData } from './email-event-repository.js';

export { createAnalyticsRepository } from './analytics-repository.js';
export type {
  AnalyticsRepository,
  TopicAnalyticsSummary,
  IssueAnalyticsRow,
  ClickedUrlRow,
  GrowthPoint,
} from './analytics-repository.js';

export { createSuppressionRepository } from './suppression-repository.js';
export type { SuppressionRepository, ListSuppressionsOptions } from './suppression-repository.js';

export { createSubjectVariantRepository } from './subject-variant-repository.js';
export type {
  SubjectVariantRepository,
  CreateSubjectVariantData,
  VariantStatsRow,
} from './subject-variant-repository.js';

export { createSendTimeRepository, MIN_OPENS_FOR_RECOMMENDATION } from './send-time-repository.js';
export type { SendTimeRepository, HourlyOpenBucket } from './send-time-repository.js';

export { createSponsorRepository } from './sponsor-repository.js';
export type {
  SponsorRepository,
  CreateSponsorData,
  UpdateSponsorData,
} from './sponsor-repository.js';

export {
  createSponsorAnalyticsRepository,
  mapSponsorClickRows,
} from './sponsor-analytics-repository.js';
export type {
  SponsorAnalyticsRepository,
  SponsorIssueClickRow,
} from './sponsor-analytics-repository.js';

export { getDefaultTopic, getDefaultTopicId } from './default-topic.js';
