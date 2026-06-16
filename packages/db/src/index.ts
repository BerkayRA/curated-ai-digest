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
} from '@prisma/client';
