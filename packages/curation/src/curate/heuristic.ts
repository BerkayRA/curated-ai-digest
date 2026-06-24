/**
 * LLM-free curation heuristics.
 *
 * Deterministic scoring + selection over already-scanned candidates, so an
 * issue can be assembled (manual picker) or pre-filled (auto-curate) without
 * any Anthropic/Exa call or API key — the lightweight backup to the Claude
 * pipeline. Pure functions only (no IO, no Prisma), so they are trivially
 * unit-testable and safe to import anywhere.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A normalized, source-agnostic view of a scanned candidate. */
export interface CandidateView {
  /** DB id when sourced from CandidateArticle; undefined for the file pool. */
  readonly id?: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
  readonly rawExcerpt: string | null;
  readonly publishedAt: Date | null;
  /** Row creation time (DB fetchedAt / file firstSeenAt) — recency fallback. */
  readonly fetchedAt?: Date | null;
}

/** A draft issue item — matches the new-issue form's DraftItem shape. */
export interface CandidateDraftItem {
  readonly titleTr: string;
  readonly summaryTr: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
  /** Links the created IssueItem back to its CandidateArticle when known. */
  readonly candidateArticleId?: string;
}

export interface ScoreOptions {
  /** Configured digest topic; its words augment the built-in keyword list. */
  readonly topic?: string;
  /** Injectable clock for deterministic tests. Defaults to the current time. */
  readonly now?: Date;
}

export interface CurateOptions extends ScoreOptions {
  /** How many items to select (default 3). */
  readonly limit?: number;
  /** Max items per source before the diversity cap is relaxed (default 1). */
  readonly perSourceCap?: number;
}

export interface SourceGroup {
  readonly sourceName: string;
  readonly items: CandidateView[];
}

// ---------------------------------------------------------------------------
// Scoring constants (tunable, named — no magic numbers)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const RECENCY_WINDOW_DAYS = 14;
/** publishedAt/fetchedAt both unknown → a mild, non-zero recency floor. */
const RECENCY_NULL_DEFAULT = 0.25;

const W_RECENCY = 0.45;
const W_SOURCE = 0.25;
const W_TOPIC = 0.3;

const SOURCE_TIER_BASELINE = 0.5;
/**
 * Authority weight for an enterprise-AI digest, matched by case-insensitive
 * substring of the source name. First match wins; unmatched → baseline.
 */
const SOURCE_TIERS: ReadonlyArray<readonly [string, number]> = [
  ['openai', 1],
  ['deepmind', 1],
  ['anthropic', 1],
  ['google ai', 0.9],
  ['mit technology', 0.8],
  ['ars technica', 0.75],
  ['venturebeat', 0.7],
  ['techcrunch', 0.7],
  ['hugging face', 0.7],
  ['the verge', 0.6],
];

/** Enterprise / on-prem AI relevance keywords (lowercase). */
const TOPIC_KEYWORDS: readonly string[] = [
  'enterprise', 'on-prem', 'on prem', 'on-premise', 'self-host', 'self host',
  'agent', 'agentic', 'model', 'inference', 'serving', 'vllm', 'rag',
  'fine-tun', 'fine tun', 'open-source', 'open source', 'open-weight', 'open weight',
  'llm', 'gpu', 'deploy', 'workflow', 'mcp', 'privacy', 'compliance',
  'data center', 'datacenter', 'cluster', 'quantiz', 'embedding',
];
/** Hit count at/above which the topic component reaches its full weight. */
const TOPIC_SATURATION = 4;
const MIN_TOPIC_TOKEN_LEN = 4;

// ---------------------------------------------------------------------------
// Component scores
// ---------------------------------------------------------------------------

/** 1 for fresh, decaying linearly to 0 across RECENCY_WINDOW_DAYS. */
export function recencyScore(candidate: CandidateView, now: Date): number {
  const when = candidate.publishedAt ?? candidate.fetchedAt ?? null;
  if (!when) return RECENCY_NULL_DEFAULT;
  const ageDays = (now.getTime() - when.getTime()) / MS_PER_DAY;
  if (ageDays <= 0) return 1;
  return Math.max(0, 1 - ageDays / RECENCY_WINDOW_DAYS);
}

/** Authority weight of the source (substring match), else a baseline. */
export function sourceTierScore(sourceName: string): number {
  const name = sourceName.toLowerCase();
  for (const [needle, weight] of SOURCE_TIERS) {
    if (name.includes(needle)) return weight;
  }
  return SOURCE_TIER_BASELINE;
}

function topicTokens(topic: string): string[] {
  return topic
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((token) => token.length >= MIN_TOPIC_TOKEN_LEN);
}

/** Fraction of distinct topic keywords present in title + excerpt (saturating). */
export function topicScore(candidate: CandidateView, topic?: string): number {
  const haystack = `${candidate.title} ${candidate.rawExcerpt ?? ''}`.toLowerCase();
  const keywords = topic ? [...TOPIC_KEYWORDS, ...topicTokens(topic)] : TOPIC_KEYWORDS;

  const seen = new Set<string>();
  let hits = 0;
  for (const keyword of keywords) {
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    if (haystack.includes(keyword)) hits += 1;
  }
  return Math.min(1, hits / TOPIC_SATURATION);
}

/** Weighted blend of recency, source authority, and topic relevance (0..1). */
export function scoreCandidate(candidate: CandidateView, opts: ScoreOptions = {}): number {
  const now = opts.now ?? new Date();
  return (
    W_RECENCY * recencyScore(candidate, now) +
    W_SOURCE * sourceTierScore(candidate.sourceName) +
    W_TOPIC * topicScore(candidate, opts.topic)
  );
}

// ---------------------------------------------------------------------------
// Selection + grouping
// ---------------------------------------------------------------------------

/**
 * Select the top `limit` candidates by heuristic score with source diversity.
 * First pass honors `perSourceCap`; if too few are chosen, a second pass relaxes
 * the cap and fills the remaining slots from the best leftovers. De-dups by URL.
 */
export function heuristicCurate(
  candidates: readonly CandidateView[],
  opts: CurateOptions = {},
): CandidateView[] {
  const limit = opts.limit ?? 3;
  const perSourceCap = opts.perSourceCap ?? 1;
  const now = opts.now ?? new Date();

  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, { topic: opts.topic, now }) }))
    .sort((a, b) => b.score - a.score);

  const selected: CandidateView[] = [];
  const perSource = new Map<string, number>();
  const usedUrls = new Set<string>();

  for (const { candidate } of ranked) {
    if (selected.length >= limit) break;
    if (usedUrls.has(candidate.sourceUrl)) continue;
    if ((perSource.get(candidate.sourceName) ?? 0) >= perSourceCap) continue;
    selected.push(candidate);
    usedUrls.add(candidate.sourceUrl);
    perSource.set(candidate.sourceName, (perSource.get(candidate.sourceName) ?? 0) + 1);
  }

  if (selected.length < limit) {
    for (const { candidate } of ranked) {
      if (selected.length >= limit) break;
      if (usedUrls.has(candidate.sourceUrl)) continue;
      selected.push(candidate);
      usedUrls.add(candidate.sourceUrl);
    }
  }

  return selected;
}

/** Map a candidate to a draft issue item. LLM-free: raw title + excerpt. */
export function candidateToDraftItem(candidate: CandidateView): CandidateDraftItem {
  // summaryTr must be non-empty (the create schema requires min 1); fall back
  // to the title when there is no excerpt. The editor polishes to Turkish.
  const summary = (candidate.rawExcerpt ?? '').trim() || candidate.title;
  const item: CandidateDraftItem = {
    titleTr: candidate.title,
    summaryTr: summary,
    sourceUrl: candidate.sourceUrl,
    sourceName: candidate.sourceName,
  };
  return candidate.id ? { ...item, candidateArticleId: candidate.id } : item;
}

/**
 * Return the first item whose `sourceUrl` is not already used — for filling a
 * news slot from a chosen source (re-picking the same source yields the next
 * one, since the just-filled URL joins the used set). Returns null when the
 * source is exhausted.
 */
export function pickFirstUnused<T extends { sourceUrl: string }>(
  items: readonly T[],
  usedUrls: ReadonlySet<string>,
): T | null {
  for (const item of items) {
    if (!usedUrls.has(item.sourceUrl)) return item;
  }
  return null;
}

/** Group by sourceName; order each group by recency; cap at `n` per source. */
export function groupBySourceTopN(
  candidates: readonly CandidateView[],
  n = 3,
): SourceGroup[] {
  const bySource = new Map<string, CandidateView[]>();
  for (const candidate of candidates) {
    const list = bySource.get(candidate.sourceName);
    if (list) list.push(candidate);
    else bySource.set(candidate.sourceName, [candidate]);
  }

  const recencyOf = (candidate: CandidateView): number =>
    (candidate.publishedAt ?? candidate.fetchedAt ?? null)?.getTime() ?? 0;

  const groups: SourceGroup[] = [];
  for (const [sourceName, list] of bySource) {
    const items = [...list].sort((a, b) => recencyOf(b) - recencyOf(a)).slice(0, n);
    groups.push({ sourceName, items });
  }
  groups.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
  return groups;
}
