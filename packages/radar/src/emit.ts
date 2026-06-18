// ---------------------------------------------------------------------------
// @digest/radar — emit (history.jsonl + changes.json)
//
// Serializes RadarEvent[] into the EXACT machine-readable shapes defined in
// docs/RADAR-DATA-CONTRACT.md so the existing `radar` SourceProvider in
// @digest/curation can consume our radar's output with no code changes.
//
// These serializers are simple and FULLY IMPLEMENTED (and tested) — they are
// the contract surface that makes Mega Radar consumable today. See
// docs/RFC-001-mega-radar.md §3.5 and §6.
// ---------------------------------------------------------------------------

import type { Category, RadarEvent, Ring } from './types.js';

/** JSON Feed 1.1 version string used by `changes.json`. */
export const JSON_FEED_VERSION = 'https://jsonfeed.org/version/1.1';

/** The radar's stable id for an event: `{run_id}:{project}:{change_type}`. */
export function eventId(event: RadarEvent): string {
  return `${event.run_id}:${event.project}:${event.change_type}`;
}

/**
 * Serialize events to `history.jsonl`: append-only JSON Lines, one event per
 * line, OLDEST-FIRST (verbatim contract ordering). The output is a sequence of
 * `ProjectHistoryEvent` records — field names exactly as the contract specifies
 * (`change_type`, `previous_ring`, `run_id`, `observed_at`, `reasons`).
 *
 * Input is assumed oldest-first; callers that hold newest-first events should
 * reverse before calling. No trailing newline is appended (callers concatenate
 * onto an existing append-only file).
 */
export function toHistoryJsonl(events: readonly RadarEvent[]): string {
  return events.map((event) => JSON.stringify(historyRecord(event))).join('\n');
}

/** A single history.jsonl record (verbatim contract field order/names). */
interface HistoryRecord {
  readonly project: string;
  readonly category: Category;
  readonly change_type: RadarEvent['change_type'];
  readonly ring: Ring;
  readonly previous_ring: Ring | null;
  readonly run_id: string;
  readonly observed_at: string;
  readonly reasons: readonly string[];
}

function historyRecord(event: RadarEvent): HistoryRecord {
  return {
    project: event.project,
    category: event.category,
    change_type: event.change_type,
    ring: event.ring,
    previous_ring: event.previous_ring,
    run_id: event.run_id,
    observed_at: event.observed_at,
    reasons: event.reasons,
  };
}

/** A single JSON Feed 1.1 item, per the contract's `changes.json` mapping. */
export interface ChangesFeedItem {
  readonly id: string;
  readonly title: string;
  readonly content_text: string;
  readonly date_published: string;
  readonly tags: readonly [Category, Ring];
}

/** The full JSON Feed 1.1 document emitted as `changes.json`. */
export interface ChangesFeed {
  readonly version: string;
  readonly title: string;
  readonly items: readonly ChangesFeedItem[];
}

/** Newest `changes.json` window size (verbatim from the contract). */
export const CHANGES_FEED_MAX_ITEMS = 50;

/**
 * Build the `title` for a changes.json item from an event, matching the
 * curation provider's expectation (`{project}: {from} → {to} ({change_type})`,
 * or `{project}: new on the radar ({ring})` for a `new` event).
 */
function buildTitle(event: RadarEvent): string {
  if (event.change_type === 'new') {
    return `${event.project}: new on the radar (${event.ring})`;
  }
  const from = event.previous_ring ?? 'new';
  return `${event.project}: ${from} → ${event.ring} (${event.change_type})`;
}

/** Map one event to a JSON Feed item per the data contract. */
function changesItem(event: RadarEvent): ChangesFeedItem {
  return {
    id: eventId(event),
    title: buildTitle(event),
    content_text: event.reasons.join(' '),
    date_published: event.observed_at,
    tags: [event.category, event.ring],
  };
}

/**
 * Serialize events to a `changes.json` JSON Feed 1.1 document: NEWEST-FIRST,
 * capped at the newest {@link CHANGES_FEED_MAX_ITEMS}. Returns the document as a
 * plain object (callers `JSON.stringify` it when writing to disk).
 *
 * `events` is assumed oldest-first (history order); this reverses to
 * newest-first and applies the cap.
 */
export function toChangesJson(events: readonly RadarEvent[], title = 'Mega Radar changes'): ChangesFeed {
  const newestFirst = [...events].reverse().slice(0, CHANGES_FEED_MAX_ITEMS);
  return {
    version: JSON_FEED_VERSION,
    title,
    items: newestFirst.map(changesItem),
  };
}
