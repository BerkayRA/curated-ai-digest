import { describe, it, expect } from 'vitest';
import {
  toHistoryJsonl,
  toChangesJson,
  eventId,
  JSON_FEED_VERSION,
  CHANGES_FEED_MAX_ITEMS,
} from '../emit';
import type { RadarEvent } from '../types';

// ---------------------------------------------------------------------------
// emit.ts produces history.jsonl + changes.json that conform EXACTLY to
// docs/RADAR-DATA-CONTRACT.md, so the curation `radar` SourceProvider consumes
// our radar unchanged. These tests assert verbatim field names.
// ---------------------------------------------------------------------------

/** Verbatim example record from docs/RADAR-DATA-CONTRACT.md (a `demoted` event). */
const VLLM_DEMOTED: RadarEvent = {
  project: 'vLLM',
  category: 'model_serving',
  change_type: 'demoted',
  ring: 'pilot',
  previous_ring: 'adopt',
  run_id: 'run-20260615T073452Z-ab5d0a59',
  observed_at: '2026-06-15T07:36:02.282606Z',
  reasons: ['Ring moved adopt -> pilot.', 'This release features 408 commits ...', '...'],
};

/** A `new` event for a dotted-name project. */
const LLAMA_CPP_NEW: RadarEvent = {
  project: 'llama.cpp',
  category: 'ai_infrastructure',
  change_type: 'new',
  ring: 'watch',
  previous_ring: null,
  run_id: 'run-20260616T080000Z-deadbeef',
  observed_at: '2026-06-16T08:00:00.000000Z',
  reasons: ['Newly tracked on the radar.', 'GGUF quantization improvements.'],
};

describe('toHistoryJsonl', () => {
  it('emits one JSON-Lines record per event, oldest-first', () => {
    const jsonl = toHistoryJsonl([VLLM_DEMOTED, LLAMA_CPP_NEW]);
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '').project).toBe('vLLM');
    expect(JSON.parse(lines[1] ?? '').project).toBe('llama.cpp');
  });

  it('uses the exact contract field names (snake_case)', () => {
    const jsonl = toHistoryJsonl([VLLM_DEMOTED]);
    const record = JSON.parse(jsonl);
    expect(Object.keys(record).sort()).toEqual(
      [
        'category',
        'change_type',
        'observed_at',
        'previous_ring',
        'project',
        'reasons',
        'ring',
        'run_id',
      ].sort(),
    );
    // Verbatim values from the data contract.
    expect(record.change_type).toBe('demoted');
    expect(record.previous_ring).toBe('adopt');
    expect(record.run_id).toBe('run-20260615T073452Z-ab5d0a59');
    expect(record.observed_at).toBe('2026-06-15T07:36:02.282606Z');
    expect(record.reasons).toEqual(VLLM_DEMOTED.reasons);
  });

  it('serializes previous_ring as null for a new event', () => {
    const record = JSON.parse(toHistoryJsonl([LLAMA_CPP_NEW]));
    expect(record.previous_ring).toBeNull();
    expect(record.change_type).toBe('new');
  });

  it('round-trips: a history.jsonl line parses back to the same event', () => {
    const line = toHistoryJsonl([VLLM_DEMOTED]);
    expect(JSON.parse(line)).toEqual(VLLM_DEMOTED);
  });
});

describe('toChangesJson', () => {
  it('produces a JSON Feed 1.1 document, newest-first', () => {
    const feed = toChangesJson([VLLM_DEMOTED, LLAMA_CPP_NEW]);
    expect(feed.version).toBe(JSON_FEED_VERSION);
    expect(feed.items).toHaveLength(2);
    // Input is oldest-first; output is newest-first.
    expect(feed.items[0]?.id).toContain('llama.cpp');
    expect(feed.items[1]?.id).toContain('vLLM');
  });

  it('maps each item to the contract shape (id/title/content_text/date_published/tags)', () => {
    const feed = toChangesJson([VLLM_DEMOTED]);
    const item = feed.items[0];
    expect(item?.id).toBe('run-20260615T073452Z-ab5d0a59:vLLM:demoted');
    expect(item?.id).toBe(eventId(VLLM_DEMOTED));
    expect(item?.content_text).toBe(VLLM_DEMOTED.reasons.join(' '));
    expect(item?.date_published).toBe(VLLM_DEMOTED.observed_at);
    expect(item?.tags).toEqual(['model_serving', 'pilot']);
  });

  it('builds a "from → to (change_type)" title for ring moves', () => {
    const feed = toChangesJson([VLLM_DEMOTED]);
    expect(feed.items[0]?.title).toBe('vLLM: adopt → pilot (demoted)');
  });

  it('builds a "new on the radar (ring)" title for new events', () => {
    const feed = toChangesJson([LLAMA_CPP_NEW]);
    expect(feed.items[0]?.title).toBe('llama.cpp: new on the radar (watch)');
  });

  it(`caps the feed at the newest ${CHANGES_FEED_MAX_ITEMS} items`, () => {
    const many: RadarEvent[] = Array.from({ length: CHANGES_FEED_MAX_ITEMS + 10 }, (_, i) => ({
      ...VLLM_DEMOTED,
      run_id: `run-${i}`,
      observed_at: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    const feed = toChangesJson(many);
    expect(feed.items).toHaveLength(CHANGES_FEED_MAX_ITEMS);
    // Newest-first → the last input (highest minute) leads.
    expect(feed.items[0]?.id).toBe(`run-${CHANGES_FEED_MAX_ITEMS + 9}:vLLM:demoted`);
  });
});

describe('contract parity — curation radar provider consumes our output', () => {
  // Replicates the provider's NDJSON + JSON-Feed parsing expectations (the
  // verbatim mapping in docs/RADAR-DATA-CONTRACT.md) WITHOUT importing curation,
  // to keep this package dependency-free. Field-name drift would fail here.

  it('history.jsonl lines parse with the exact ProjectHistoryEvent fields', () => {
    const jsonl = toHistoryJsonl([VLLM_DEMOTED, LLAMA_CPP_NEW]);
    for (const line of jsonl.split('\n')) {
      const e = JSON.parse(line);
      // The provider's radarEventSchema requires precisely these keys.
      expect(typeof e.project).toBe('string');
      expect(typeof e.category).toBe('string');
      expect(['new', 'promoted', 'demoted', 'updated']).toContain(e.change_type);
      expect(['avoid', 'watch', 'pilot', 'adopt']).toContain(e.ring);
      expect(e.previous_ring === null || typeof e.previous_ring === 'string').toBe(true);
      expect(typeof e.run_id).toBe('string');
      expect(typeof e.observed_at).toBe('string');
      expect(Array.isArray(e.reasons)).toBe(true);
    }
  });

  it('changes.json id decomposes to {run_id}:{project}:{change_type}', () => {
    const feed = toChangesJson([VLLM_DEMOTED]);
    const id = feed.items[0]?.id ?? '';
    const segments = id.split(':');
    // Provider: run_id = first segment, change_type = last, project = middle.
    expect(segments[0]).toBe('run-20260615T073452Z-ab5d0a59');
    expect(segments[segments.length - 1]).toBe('demoted');
    expect(segments.slice(1, -1).join(':')).toBe('vLLM');
  });

  it('changes.json tags carry [category, ring] in that order', () => {
    const feed = toChangesJson([VLLM_DEMOTED]);
    expect(feed.items[0]?.tags[0]).toBe('model_serving');
    expect(feed.items[0]?.tags[1]).toBe('pilot');
  });
});
