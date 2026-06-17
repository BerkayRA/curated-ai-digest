import Parser from 'rss-parser';
import type { RawCandidate, SourceError } from './types.js';
import type { FeedDefinition } from './sources.js';
import { FEEDS } from './sources.js';

// ---------------------------------------------------------------------------
// RSS source: fetch + parse all configured feeds, map to RawCandidate
// ---------------------------------------------------------------------------

const RSS_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_FEED = 20;

/**
 * Result of fetching a single feed.
 * Errors are collected rather than thrown so one bad feed can't abort the run.
 */
export interface FeedResult {
  readonly candidates: readonly RawCandidate[];
  readonly error: SourceError | undefined;
}

/**
 * Map a single parsed feed item to a RawCandidate.
 * Returns undefined when the item is missing a usable link or a non-empty title.
 */
function mapItem(
  item: Parser.Item,
  sourceName: string,
): RawCandidate | undefined {
  // Prefer explicit <link>; fall back to <guid> only if it looks like a URL.
  const rawUrl = item.link ?? (item.guid?.startsWith('http') ? item.guid : undefined);
  const rawTitle = item.title?.trim();

  if (!rawUrl || !rawTitle) return undefined;

  const publishedAt = item.isoDate ? new Date(item.isoDate) : undefined;
  const rawExcerpt = (item.contentSnippet ?? item.summary ?? item.content)?.slice(0, 500);

  return {
    title: rawTitle,
    sourceUrl: rawUrl.trim(),
    sourceName,
    rawExcerpt,
    publishedAt,
  };
}

/** Fetch and parse a single RSS/Atom feed URL. */
export async function fetchFeed(feed: FeedDefinition): Promise<FeedResult> {
  const parser = new Parser({ timeout: RSS_TIMEOUT_MS });
  try {
    const output = await parser.parseURL(feed.url);
    const items = output.items.slice(0, MAX_ITEMS_PER_FEED);

    const candidates: RawCandidate[] = items.flatMap((item) => {
      const mapped = mapItem(item, feed.name);
      return mapped ? [mapped] : [];
    });

    return { candidates, error: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      candidates: [],
      error: { source: feed.name, message },
    };
  }
}

/**
 * Parse RSS/Atom feeds from a custom XML string (used in tests without
 * a network).
 */
export async function parseFeedXml(
  xml: string,
  sourceName: string,
): Promise<readonly RawCandidate[]> {
  const parser = new Parser();
  const output = await parser.parseString(xml);
  const items = output.items.slice(0, MAX_ITEMS_PER_FEED);

  return items.flatMap((item) => {
    const mapped = mapItem(item, sourceName);
    return mapped ? [mapped] : [];
  });
}

/** Fetch all configured RSS feeds, collecting per-feed errors non-fatally. */
export async function fetchAllFeeds(
  feeds: readonly FeedDefinition[] = FEEDS,
): Promise<{ candidates: readonly RawCandidate[]; errors: readonly SourceError[] }> {
  const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f)));

  const candidates: RawCandidate[] = [];
  const errors: SourceError[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      candidates.push(...result.value.candidates);
      if (result.value.error) {
        errors.push(result.value.error);
      }
    } else {
      // Promise.allSettled shouldn't reject when fetchFeed catches internally,
      // but guard just in case.
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ source: 'rss-unknown', message });
    }
  }

  return { candidates, errors };
}
