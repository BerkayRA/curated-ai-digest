import type { PrismaClient } from '@prisma/client';
import { FEEDS, EXA_QUERIES } from '../../curation/src/ingest/sources';
import {
  DEFAULT_RADAR_FEED_URL,
  RADAR_CATEGORIES,
} from '../../curation/src/ingest/radar-source';

// ---------------------------------------------------------------------------
// Idempotent Source seed — upsert all static sources into the DB.
//
// Upsert key: (topicId, type, url). Postgres allows multiple NULLs in a unique
// index so exa rows (url = null) are matched by (topicId, type = 'exa', url = null).
// ---------------------------------------------------------------------------

/** The default `enterprise-ai` topic id every seeded source belongs to. */
export const ENTERPRISE_AI_TOPIC_ID = 'topic_enterprise_ai';

export async function seedSources(prisma: PrismaClient): Promise<void> {
  const topicId = ENTERPRISE_AI_TOPIC_ID;

  // -------------------------------------------------------------------------
  // RSS feeds — one row per FEEDS entry
  // -------------------------------------------------------------------------
  for (const feed of FEEDS) {
    await prisma.source.upsert({
      where: {
        topicId_type_url: { topicId, type: 'rss', url: feed.url },
      },
      update: {},
      create: {
        topicId,
        type: 'rss',
        label: feed.name,
        url: feed.url,
        enabled: true,
        config: {},
      },
    });
  }

  // -------------------------------------------------------------------------
  // Radar source — single row for the on-prem AI adoption radar
  // -------------------------------------------------------------------------
  await prisma.source.upsert({
    where: {
      topicId_type_url: { topicId, type: 'radar', url: DEFAULT_RADAR_FEED_URL },
    },
    update: {},
    create: {
      topicId,
      type: 'radar',
      label: 'On-Prem AI Adoption Radar',
      url: DEFAULT_RADAR_FEED_URL,
      enabled: true,
      config: {
        categories: [...RADAR_CATEGORIES],
        changeTypes: ['new', 'promoted', 'demoted'],
        maxItems: 25,
      },
    },
  });

  // -------------------------------------------------------------------------
  // Exa neural search — single row, no feed URL, disabled by default
  // (EXA_API_KEY is NOT stored — only the non-secret query list)
  // -------------------------------------------------------------------------
  // Exa has url = null; Prisma unique constraint @@unique([topicId, type, url])
  // uses the generated compound name `topicId_type_url`. For null url values
  // Postgres allows multiple NULLs, but Prisma's upsert needs a stable lookup.
  // We use the findFirst + create pattern, scoped to this topic.
  const existingExa = await prisma.source.findFirst({
    where: { topicId, type: 'exa' },
  });

  if (!existingExa) {
    await prisma.source.create({
      data: {
        topicId,
        type: 'exa',
        label: 'Exa Neural Search',
        url: null,
        enabled: false,
        config: {
          queries: [...EXA_QUERIES],
        },
      },
    });
  }

  console.log(
    `Sources seeded: ${FEEDS.length} RSS + 1 radar + 1 exa (${FEEDS.length + 2} total).`,
  );
}
