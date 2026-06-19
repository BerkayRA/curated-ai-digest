import { z } from 'zod';
import type {
  RawCandidate,
  SourceContext,
  SourceFetchResult,
  SourceProvider,
} from './types.js';

// ---------------------------------------------------------------------------
// On-Prem AI Adoption Radar source
//
// Consumes the radar's ring-change event feed (the rich DecisionCards are not
// published over HTTP). The default feed is `history.jsonl` (JSON Lines); a
// JSON Feed 1.1 body (`changes.json`) is also supported. See
// docs/RADAR-DATA-CONTRACT.md for the exact schema and mapping.
//
// Deterministic and LLM-free: validate → filter → sort → map.
// ---------------------------------------------------------------------------

/** The 9 radar categories (verbatim from the data contract). */
export const RADAR_CATEGORIES = [
  'coding_agents',
  'general_agents',
  'mcp_tooling',
  'sandbox_governance',
  'agent_frameworks',
  'model_serving',
  'ai_infrastructure',
  'physical_ai_infrastructure',
  'fun_experimental',
] as const;

export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

/** Adoption rings (verbatim). */
export const RADAR_RINGS = ['avoid', 'watch', 'pilot', 'adopt'] as const;
export type RadarRing = (typeof RADAR_RINGS)[number];

/** Ring-change types (verbatim). */
export const RADAR_CHANGE_TYPES = ['new', 'promoted', 'demoted', 'updated'] as const;
export type RadarChangeType = (typeof RADAR_CHANGE_TYPES)[number];

export const DEFAULT_RADAR_FEED_URL =
  'https://raw.githubusercontent.com/ekaynac/onprem-ai-adoption-radar/main/data/history.jsonl';

export const DEFAULT_RADAR_REPO_URL = 'https://github.com/ekaynac/onprem-ai-adoption-radar';

/** Change types kept by default: `updated` is lower-signal and excluded. */
const DEFAULT_CHANGE_TYPES: readonly RadarChangeType[] = ['new', 'promoted', 'demoted'];

const DEFAULT_MAX_ITEMS = 25;

const RADAR_SOURCE_NAME = 'On-Prem AI Adoption Radar';

/** Minimal fetch signature so tests can inject a fake implementation. */
export type FetchImpl = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * Configurable surface for the radar provider. All fields are optional and
 * fall back to env vars / sensible defaults so the provider works out of the
 * box but stays fully overridable (including a mock `fetchImpl` in tests).
 */
export interface RadarProviderConfig {
  /** Feed URL. Defaults to `RADAR_FEED_URL` env, then the raw history.jsonl URL. */
  readonly feedUrl?: string;
  /**
   * GitHub Pages base used to build per-project deep links
   * (`${siteRoot}/project_${slug}.html`). When absent, sourceUrl falls back to
   * `repoUrl`. Defaults to the `RADAR_SITE_ROOT` env var.
   */
  readonly siteRoot?: string;
  /** Allowlist of categories to keep. Defaults to all 9. */
  readonly categories?: readonly RadarCategory[];
  /** Change types to keep. Defaults to `['new','promoted','demoted']`. */
  readonly changeTypes?: readonly RadarChangeType[];
  /** Cap on the number of (most recent) events returned. Defaults to 25. */
  readonly maxItems?: number;
  /** sourceUrl fallback when no siteRoot is set. Defaults to the radar repo URL. */
  readonly repoUrl?: string;
  /** Injectable fetch (defaults to `globalThis.fetch`). */
  readonly fetchImpl?: FetchImpl;
}

// ---------------------------------------------------------------------------
// Record schema (the verbatim `ProjectHistoryEvent` shape)
// ---------------------------------------------------------------------------

const radarEventSchema = z.object({
  project: z.string().min(1),
  category: z.enum(RADAR_CATEGORIES),
  change_type: z.enum(RADAR_CHANGE_TYPES),
  ring: z.enum(RADAR_RINGS),
  previous_ring: z.enum(RADAR_RINGS).nullable(),
  run_id: z.string().min(1),
  observed_at: z.string().min(1),
  reasons: z.array(z.string()),
});

/** A validated radar ring-change event. */
export type RadarEvent = z.infer<typeof radarEventSchema>;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Slugify a project name: lowercase, collapse runs of non-`[a-z0-9]` chars to a
 * single `-`, and trim leading/trailing dashes. e.g. `llama.cpp` → `llama-cpp`.
 */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build the candidate title from a radar event (per the data contract). */
function buildTitle(event: RadarEvent): string {
  if (event.change_type === 'new') {
    return `${event.project}: new on the radar (${event.ring})`;
  }
  const from = event.previous_ring ?? 'new';
  return `${event.project}: ${from} → ${event.ring} (${event.change_type})`;
}

/**
 * Build the sourceUrl: a per-project deep link when `siteRoot` is set, else the
 * repo URL. No canonical per-article URL exists in the feed.
 */
function buildSourceUrl(event: RadarEvent, siteRoot: string | undefined, repoUrl: string): string {
  if (siteRoot) {
    const base = siteRoot.replace(/\/+$/, '');
    return `${base}/project_${slug(event.project)}.html`;
  }
  return repoUrl;
}

/** Map a validated radar event to a RawCandidate. */
export function mapEventToCandidate(
  event: RadarEvent,
  siteRoot: string | undefined,
  repoUrl: string,
): RawCandidate {
  return {
    title: buildTitle(event),
    sourceUrl: buildSourceUrl(event, siteRoot, repoUrl),
    sourceName: RADAR_SOURCE_NAME,
    rawExcerpt: event.reasons.join(' '),
    publishedAt: new Date(event.observed_at),
  };
}

// ---------------------------------------------------------------------------
// Body parsing: JSON Feed 1.1 first, then NDJSON line parsing
// ---------------------------------------------------------------------------

/**
 * Try to parse the body as a JSON Feed 1.1 document. Returns the validated
 * `items[]` mapped to RadarEvents, or `undefined` when the body is not a
 * single JSON value with a `version` + `items[]` shape (i.e. fall back to
 * NDJSON line parsing).
 *
 * JSON Feed items carry the radar payload as `{ id, title, content_text,
 * date_published, tags:[category, ring], _radar:{...} }` per the data contract.
 * We reconstruct a RadarEvent from the structured fields the feed preserves.
 */
function parseJsonFeed(body: string): readonly RadarEvent[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined; // Not a single JSON document → NDJSON path.
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('items' in parsed)
  ) {
    return undefined;
  }

  const itemsValue = (parsed as { items: unknown }).items;
  if (!Array.isArray(itemsValue)) return [];

  const events: RadarEvent[] = [];
  for (const item of itemsValue) {
    const event = jsonFeedItemToEvent(item);
    if (event) events.push(event);
  }
  return events;
}

/**
 * Reconstruct a RadarEvent from a JSON Feed item. The radar's `changes.json`
 * encodes `id` as `{run_id}:{project}:{change_type}` and `tags` as
 * `[category, ring]`; `previous_ring` is not always present, so it defaults to
 * null. Invalid items are skipped (returns undefined).
 */
function jsonFeedItemToEvent(item: unknown): RadarEvent | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const obj = item as Record<string, unknown>;

  const id = typeof obj['id'] === 'string' ? obj['id'] : '';
  const tags = Array.isArray(obj['tags']) ? (obj['tags'] as unknown[]) : [];

  // id = "{run_id}:{project}:{change_type}" — project may itself contain ':',
  // so the run_id is the first segment and change_type the last.
  const segments = id.split(':');
  const runId = segments.length >= 3 ? (segments[0] ?? '') : '';
  const changeType = segments.length >= 3 ? (segments[segments.length - 1] ?? '') : '';
  const project = segments.length >= 3 ? segments.slice(1, -1).join(':') : '';

  const category = typeof tags[0] === 'string' ? tags[0] : '';
  const ring = typeof tags[1] === 'string' ? tags[1] : '';

  const candidate = {
    project,
    category,
    change_type: changeType,
    ring,
    previous_ring: typeof obj['previous_ring'] === 'string' ? obj['previous_ring'] : null,
    run_id: runId,
    observed_at: typeof obj['date_published'] === 'string' ? obj['date_published'] : '',
    reasons: typeof obj['content_text'] === 'string' ? [obj['content_text']] : [],
  };

  const result = radarEventSchema.safeParse(candidate);
  return result.success ? result.data : undefined;
}

/**
 * Parse NDJSON (JSON Lines): one record per line. Blank lines and lines that
 * fail to parse or validate are skipped rather than throwing.
 */
function parseNdjson(body: string): readonly RadarEvent[] {
  const events: RadarEvent[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // Tolerate garbage lines.
    }

    const result = radarEventSchema.safeParse(parsed);
    if (result.success) events.push(result.data);
  }
  return events;
}

/**
 * Parse a feed body into validated radar events. Detects the format by trying
 * to parse the whole body as a single JSON document (JSON Feed 1.1); if that
 * shape isn't present, falls back to NDJSON line parsing.
 */
export function parseRadarBody(body: string): readonly RadarEvent[] {
  const jsonFeed = parseJsonFeed(body);
  return jsonFeed ?? parseNdjson(body);
}

// ---------------------------------------------------------------------------
// Filtering, sorting, mapping
// ---------------------------------------------------------------------------

function selectEvents(
  events: readonly RadarEvent[],
  config: Required<Pick<RadarProviderConfig, 'changeTypes' | 'maxItems'>> & {
    categories: readonly RadarCategory[] | undefined;
  },
): readonly RadarEvent[] {
  const categorySet = config.categories ? new Set(config.categories) : undefined;
  const changeTypeSet = new Set(config.changeTypes);

  const filtered = events.filter((e) => {
    if (categorySet && !categorySet.has(e.category)) return false;
    if (!changeTypeSet.has(e.change_type)) return false;
    return true;
  });

  // Sort by observed_at descending (most recent first), then cap.
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime(),
  );

  return sorted.slice(0, config.maxItems);
}

// ---------------------------------------------------------------------------
// Fetch + map (the provider's core)
// ---------------------------------------------------------------------------

/**
 * Fetch the radar feed and map it to RawCandidates. Any network/parse failure
 * is captured as a non-fatal SourceError; this function never throws out of the
 * `fetch()` call. Respects `signal` for cancellation when provided.
 */
export async function fetchRadarCandidates(
  config: RadarProviderConfig = {},
  signal?: AbortSignal,
): Promise<SourceFetchResult> {
  const feedUrl = config.feedUrl ?? process.env['RADAR_FEED_URL'] ?? DEFAULT_RADAR_FEED_URL;
  const siteRoot = config.siteRoot ?? process.env['RADAR_SITE_ROOT'];
  const repoUrl = config.repoUrl ?? DEFAULT_RADAR_REPO_URL;
  const changeTypes = config.changeTypes ?? DEFAULT_CHANGE_TYPES;
  const maxItems = config.maxItems ?? DEFAULT_MAX_ITEMS;
  const fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchImpl | undefined);

  if (!fetchImpl) {
    return {
      candidates: [],
      errors: [{ source: 'radar', message: 'No fetch implementation available' }],
    };
  }

  try {
    const response = await fetchImpl(feedUrl, signal ? { signal } : undefined);
    if (!response.ok) {
      return {
        candidates: [],
        errors: [
          { source: 'radar', message: `Feed request failed with status ${response.status}` },
        ],
      };
    }

    const body = await response.text();
    const events = parseRadarBody(body);
    const selected = selectEvents(events, { changeTypes, maxItems, categories: config.categories });
    const candidates = selected.map((e) => mapEventToCandidate(e, siteRoot, repoUrl));

    return { candidates, errors: [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { candidates: [], errors: [{ source: 'radar', message }] };
  }
}

// ---------------------------------------------------------------------------
// SourceProvider factory + default instance
// ---------------------------------------------------------------------------

export interface RadarProviderFactoryOptions {
  /** Provider id. Defaults to `'radar'`. */
  id?: string;
}

/**
 * Create a radar {@link SourceProvider} with a custom configuration. The feed
 * URL, site root, category/changeType filters, item cap, and fetch impl are all
 * overridable here (handy for tests and bespoke worker setups).
 *
 * The optional `factoryOpts.id` allows DB-backed source rows to get their own
 * distinct id (e.g. `'radar:cuid123'`) so per-source health can be recorded.
 */
export function createRadarProvider(
  config: RadarProviderConfig = {},
  factoryOpts: RadarProviderFactoryOptions = {},
): SourceProvider {
  const providerId = factoryOpts.id ?? 'radar';
  return {
    id: providerId,
    label: 'On-Prem AI Adoption Radar',
    async fetch(ctx: SourceContext): Promise<SourceFetchResult> {
      ctx.logger.info('radar.fetch.start', {
        feedUrl: config.feedUrl ?? process.env['RADAR_FEED_URL'] ?? DEFAULT_RADAR_FEED_URL,
      });
      const result = await fetchRadarCandidates(config, ctx.signal);
      ctx.logger.info('radar.fetch.done', {
        candidates: result.candidates.length,
        errors: result.errors.length,
      });
      return result;
    },
  };
}

/**
 * The default radar provider (env-configured). Always exported for explicit
 * use; it is only added to {@link defaultProviders} when radar ingestion is
 * gated on via env (see providers.ts) so existing runs don't hit the network.
 */
export const radarProvider: SourceProvider = createRadarProvider();
