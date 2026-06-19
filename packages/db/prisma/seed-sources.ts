import type { PrismaClient } from '@prisma/client';
import { FEEDS, EXA_QUERIES } from '../../curation/src/ingest/sources.js';
import {
  DEFAULT_RADAR_FEED_URL,
  RADAR_CATEGORIES,
} from '../../curation/src/ingest/radar-source.js';

// ---------------------------------------------------------------------------
// Idempotent Source seed — upsert all static sources into the DB.
//
// Upsert key: (type, url). Postgres allows multiple NULLs in a unique index
// so exa rows (url = null) are matched by (type = 'exa', url = null).
// ---------------------------------------------------------------------------

export async function seedSources(prisma: PrismaClient): Promise<void> {
  // -------------------------------------------------------------------------
  // RSS feeds — one row per FEEDS entry
  // -------------------------------------------------------------------------
  for (const feed of FEEDS) {
    await prisma.source.upsert({
      where: {
        type_url: { type: 'rss', url: feed.url },
      },
      update: {},
      create: {
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
      type_url: { type: 'radar', url: DEFAULT_RADAR_FEED_URL },
    },
    update: {},
    create: {
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
  // Exa has url = null; Prisma unique constraint @@unique([type, url]) uses
  // the generated compound name `type_url`. For null url values Postgres
  // allows multiple NULLs, but Prisma's upsert needs a stable lookup.
  // We use updateMany + createIfNotExists pattern via findFirst + create.
  const existingExa = await prisma.source.findFirst({
    where: { type: 'exa' },
  });

  if (!existingExa) {
    await prisma.source.create({
      data: {
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
