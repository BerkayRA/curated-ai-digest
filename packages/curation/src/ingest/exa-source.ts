import type {
  RawCandidate,
  SourceError,
  Logger,
  SourceContext,
  SourceFetchResult,
  SourceProvider,
} from './types';
import { EXA_QUERIES } from './sources';

// ---------------------------------------------------------------------------
// Exa neural-search source
// ---------------------------------------------------------------------------

const EXA_RESULTS_PER_QUERY = 10;
/** How many days back to scope the published-date filter. */
const LOOKBACK_DAYS = 7;

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Tune the base query intents toward the run's topic so Exa surfaces results
 * relevant to the configured focus (e.g. "on-prem & enterprise AI workflows").
 * When topic is blank/whitespace the base queries are returned unchanged.
 */
export function topicTunedQueries(
  topic: string,
  queries: readonly string[] = EXA_QUERIES,
): readonly string[] {
  const trimmed = topic.trim();
  if (!trimmed) return queries;
  return queries.map((q) => `${q} (focus: ${trimmed})`);
}

/**
 * Fetch recent AI-news candidates from Exa neural search.
 *
 * - Reads `EXA_API_KEY` from the environment only when invoked (not at import
 *   time) so the module is safe to import in offline / test contexts.
 * - If the key is absent, returns zero candidates and logs a warning; the
 *   pipeline continues on RSS alone.
 * - If the key is present but a query fails, that query's error is collected
 *   non-fatally and the rest continue.
 */
export async function fetchExaCandidates(
  logger: Logger,
  queries: readonly string[] = EXA_QUERIES,
): Promise<SourceFetchResult> {
  const apiKey = process.env['EXA_API_KEY'];

  if (!apiKey) {
    logger.warn('EXA_API_KEY not set — skipping Exa source; pipeline will run on RSS only.');
    return { candidates: [], errors: [] };
  }

  // Dynamic import so the module can be loaded lazily. exa-js exports Exa as
  // both the default and a named export; we use the named export to avoid
  // esModuleInterop ambiguity with { default: ... }.
  const exaModule = await import('exa-js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ExaClass: new (key: string) => import('exa-js').default =
    (exaModule as any).Exa ?? exaModule.default;
  const client = new ExaClass(apiKey);

  const startPublishedDate = isoDateDaysAgo(LOOKBACK_DAYS);

  const results = await Promise.allSettled(
    queries.map((q) =>
      client.search(q, {
        type: 'neural',
        numResults: EXA_RESULTS_PER_QUERY,
        startPublishedDate,
        category: 'news',
      }),
    ),
  );

  const candidates: RawCandidate[] = [];
  const errors: SourceError[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const query = queries[i] ?? 'unknown';

    if (!result) continue;

    if (result.status === 'rejected') {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ source: `exa:${query}`, message });
      continue;
    }

    for (const hit of result.value.results) {
      if (!hit.url || !hit.title) continue;

      const publishedAt = hit.publishedDate ? new Date(hit.publishedDate) : undefined;

      candidates.push({
        title: hit.title.trim(),
        sourceUrl: hit.url.trim(),
        sourceName: 'Exa Neural Search',
        rawExcerpt: undefined,
        publishedAt,
      });
    }
  }

  return { candidates, errors };
}

// ---------------------------------------------------------------------------
// SourceProvider adapter
// ---------------------------------------------------------------------------

/**
 * Exa neural-search source as a pluggable {@link SourceProvider}.
 *
 * Incorporates `ctx.topic` into every query (see {@link topicTunedQueries}) so
 * the configured focus tunes what Exa surfaces. Preserves the existing no-op +
 * warning behavior when `EXA_API_KEY` is absent.
 */
export const exaProvider: SourceProvider = {
  id: 'exa',
  label: 'Exa Neural Search',
  async fetch(ctx: SourceContext): Promise<SourceFetchResult> {
    const queries = topicTunedQueries(ctx.topic);
    return fetchExaCandidates(ctx.logger, queries);
  },
};

// ---------------------------------------------------------------------------
// Factory (for DB-driven provider resolution)
// ---------------------------------------------------------------------------

export interface ExaProviderOptions {
  /** Provider id. Defaults to `'exa'`. */
  id?: string;
  /** Override the queries used for this provider. Defaults to {@link EXA_QUERIES}. */
  queries?: readonly string[];
}

/**
 * Create an Exa neural-search {@link SourceProvider} with a custom id and
 * optional query override. The `opts.id` allows each DB-backed source row to
 * get its own distinct id (e.g. `'exa:cuid123'`) so per-source health can be
 * recorded.
 */
export function createExaProvider(opts: ExaProviderOptions = {}): SourceProvider {
  const providerId = opts.id ?? 'exa';
  const customQueries = opts.queries;

  return {
    id: providerId,
    label: 'Exa Neural Search',
    async fetch(ctx: SourceContext): Promise<SourceFetchResult> {
      const baseQueries = customQueries ?? EXA_QUERIES;
      const queries = topicTunedQueries(ctx.topic, baseQueries);
      return fetchExaCandidates(ctx.logger, queries);
    },
  };
}
