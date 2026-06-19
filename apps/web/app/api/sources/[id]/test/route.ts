/**
 * POST /api/sources/[id]/test
 *
 * Isolated test-fetch for a single source:
 *   1. Load the source from the DB.
 *   2. Build the appropriate provider (rss | radar | exa) using the curation
 *      factory that matches the source type.
 *   3. Call provider.fetch() directly — no dedup, no persist, no health update.
 *   4. Return { ok, count, sample (up to 5), errors } in the standard envelope.
 *
 * Network / provider errors are captured in the response payload (not a 500)
 * so the UI can surface them without a noisy error boundary.
 *
 * Auth is enforced by middleware. Same-origin guard on this mutation.
 */

import { NextResponse } from 'next/server';
import { prisma, createSourceRepository } from '@digest/db';
import type { Source } from '@digest/db';
import {
  createRssProvider,
  createExaProvider,
  createRadarProvider,
  DEFAULT_TOPIC,
} from '@digest/curation';
import type { SourceProvider, Logger, RawCandidate, RadarProviderConfig } from '@digest/curation';
import { ok, err } from '@/lib/api-response.js';
import { getErrorMessage } from '@/lib/error.js';
import { assertSameOrigin } from '@/lib/assert-same-origin.js';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

/** No-op logger for isolated test-fetches — keeps provider internals quiet. */
const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function buildProvider(source: Source): SourceProvider {
  const providerId = `${source.type}:${source.id}`;
  const config = source.config as Record<string, unknown> | null;

  switch (source.type) {
    case 'rss': {
      const feeds = source.url
        ? [{ name: source.label, url: source.url }]
        : [];
      return createRssProvider(feeds, { id: providerId });
    }
    case 'radar': {
      const radarConfig: RadarProviderConfig = {
        feedUrl: source.url ?? undefined,
        ...(config?.categories !== undefined
          ? { categories: config.categories as RadarProviderConfig['categories'] }
          : {}),
        ...(config?.changeTypes !== undefined
          ? { changeTypes: config.changeTypes as RadarProviderConfig['changeTypes'] }
          : {}),
        ...(config?.maxItems !== undefined
          ? { maxItems: config.maxItems as number }
          : {}),
        ...(config?.siteRoot !== undefined
          ? { siteRoot: config.siteRoot as string }
          : {}),
      };
      return createRadarProvider(radarConfig, { id: providerId });
    }
    case 'exa': {
      return createExaProvider({
        id: providerId,
        ...(config?.queries !== undefined
          ? { queries: config.queries as string[] }
          : {}),
      });
    }
  }
}

type SampleItem = {
  readonly title: string;
  readonly sourceUrl: string;
};

type TestFetchPayload = {
  readonly ok: boolean;
  readonly count: number;
  readonly sample: readonly SampleItem[];
  readonly errors: readonly { source: string; message: string }[];
};

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const repo = createSourceRepository(prisma);
    const source = await repo.findById(params.id);

    if (!source) {
      return NextResponse.json(err('Source not found'), { status: 404 });
    }

    const provider = buildProvider(source);

    // Network/provider errors must not bubble as a 500 — capture and return them.
    let payload: TestFetchPayload;
    try {
      const result = await provider.fetch({ topic: DEFAULT_TOPIC, logger: silentLogger });
      const sample: readonly SampleItem[] = result.candidates
        .slice(0, 5)
        .map((c: RawCandidate) => ({ title: c.title, sourceUrl: c.sourceUrl }));

      payload = {
        ok: true,
        count: result.candidates.length,
        sample,
        errors: result.errors,
      };
    } catch (providerError) {
      payload = {
        ok: false,
        count: 0,
        sample: [],
        errors: [{ source: source.type, message: getErrorMessage(providerError) }],
      };
    }

    return NextResponse.json(ok(payload));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
