import { describe, it, expect } from 'vitest';
import {
  createRadarProvider,
  fetchRadarCandidates,
  parseRadarBody,
  slug,
  DEFAULT_RADAR_REPO_URL,
  type FetchImpl,
  type RadarProviderConfig,
} from '../ingest/radar-source.js';
import type { Logger, SourceContext } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Radar source — tested against static fixtures with an injected fetch.
// No network or DB I/O.
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function ctx(overrides: Partial<SourceContext> = {}): SourceContext {
  return { topic: 'on-prem AI', logger: noopLogger, ...overrides };
}

/** Build a fake fetch that returns the given body with a 200 status. */
function okFetch(body: string): FetchImpl {
  return async () => ({ ok: true, status: 200, text: async () => body });
}

/** A fake fetch that records the URL and signal it was called with. */
function recordingFetch(body: string): {
  impl: FetchImpl;
  calls: { url: string; signal?: AbortSignal }[];
} {
  const calls: { url: string; signal?: AbortSignal }[] = [];
  const impl: FetchImpl = async (url, init) => {
    calls.push({ url, signal: init?.signal });
    return { ok: true, status: 200, text: async () => body };
  };
  return { impl, calls };
}

// ---------------------------------------------------------------------------
// Fixtures — the two real example records from docs/RADAR-DATA-CONTRACT.md.
// ---------------------------------------------------------------------------

/** Verbatim example record from the data contract (a `demoted` event). */
const VLLM_DEMOTED = {
  project: 'vLLM',
  category: 'model_serving',
  change_type: 'demoted',
  ring: 'pilot',
  previous_ring: 'adopt',
  run_id: 'run-20260615T073452Z-ab5d0a59',
  observed_at: '2026-06-15T07:36:02.282606Z',
  reasons: ['Ring moved adopt -> pilot.', 'This release features 408 commits ...', '...'],
};

/** A second realistic record: a `new` event for a project with a dotted name. */
const LLAMA_CPP_NEW = {
  project: 'llama.cpp',
  category: 'ai_infrastructure',
  change_type: 'new',
  ring: 'watch',
  previous_ring: null,
  run_id: 'run-20260616T080000Z-deadbeef',
  observed_at: '2026-06-16T08:00:00.000000Z',
  reasons: ['Newly tracked on the radar.', 'GGUF quantization improvements.'],
};

/** A `promoted` event used for filtering/sort assertions. */
const LANGGRAPH_PROMOTED = {
  project: 'LangGraph',
  category: 'agent_frameworks',
  change_type: 'promoted',
  ring: 'adopt',
  previous_ring: 'pilot',
  run_id: 'run-20260617T090000Z-cafef00d',
  observed_at: '2026-06-17T09:00:00.000000Z',
  reasons: ['Ring moved pilot -> adopt.'],
};

/** An `updated` event — excluded by the default changeTypes filter. */
const OLLAMA_UPDATED = {
  project: 'Ollama',
  category: 'model_serving',
  change_type: 'updated',
  ring: 'pilot',
  previous_ring: 'pilot',
  run_id: 'run-20260614T060000Z-12345678',
  observed_at: '2026-06-14T06:00:00.000000Z',
  reasons: ['Minor version bump.'],
};

function ndjson(...records: object[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n');
}

// ---------------------------------------------------------------------------
// slug()
// ---------------------------------------------------------------------------

describe('slug', () => {
  it('lowercases simple names', () => {
    expect(slug('vLLM')).toBe('vllm');
  });

  it('collapses non-alphanumeric runs to a single dash', () => {
    expect(slug('llama.cpp')).toBe('llama-cpp');
  });

  it('trims leading and trailing dashes', () => {
    expect(slug('  Hello World!  ')).toBe('hello-world');
  });

  it('collapses multiple separators into one dash', () => {
    expect(slug('GPT-4 / o3 (mini)')).toBe('gpt-4-o3-mini');
  });
});

// ---------------------------------------------------------------------------
// parseRadarBody — NDJSON
// ---------------------------------------------------------------------------

describe('parseRadarBody (NDJSON)', () => {
  it('parses each JSON line into a validated event', () => {
    const body = ndjson(VLLM_DEMOTED, LLAMA_CPP_NEW);
    const events = parseRadarBody(body);
    expect(events).toHaveLength(2);
    expect(events[0]?.project).toBe('vLLM');
    expect(events[1]?.project).toBe('llama.cpp');
  });

  it('tolerates blank lines and skips malformed/garbage lines', () => {
    const body = [
      JSON.stringify(VLLM_DEMOTED),
      '', // blank
      '   ', // whitespace-only
      'this is not json{{', // garbage
      JSON.stringify(LLAMA_CPP_NEW),
    ].join('\n');
    const events = parseRadarBody(body);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.project)).toEqual(['vLLM', 'llama.cpp']);
  });

  it('skips records that fail schema validation (bad enum)', () => {
    const bad = { ...VLLM_DEMOTED, category: 'not_a_real_category' };
    const body = ndjson(bad, LLAMA_CPP_NEW);
    const events = parseRadarBody(body);
    expect(events).toHaveLength(1);
    expect(events[0]?.project).toBe('llama.cpp');
  });
});

// ---------------------------------------------------------------------------
// parseRadarBody — JSON Feed 1.1
// ---------------------------------------------------------------------------

describe('parseRadarBody (JSON Feed 1.1)', () => {
  it('detects and parses a JSON Feed body via items[]', () => {
    const feed = {
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Radar changes',
      items: [
        {
          id: `${VLLM_DEMOTED.run_id}:${VLLM_DEMOTED.project}:${VLLM_DEMOTED.change_type}`,
          title: 'vLLM demoted',
          content_text: VLLM_DEMOTED.reasons.join(' '),
          date_published: VLLM_DEMOTED.observed_at,
          tags: [VLLM_DEMOTED.category, VLLM_DEMOTED.ring],
        },
        {
          id: `${LLAMA_CPP_NEW.run_id}:${LLAMA_CPP_NEW.project}:${LLAMA_CPP_NEW.change_type}`,
          title: 'llama.cpp new',
          content_text: LLAMA_CPP_NEW.reasons.join(' '),
          date_published: LLAMA_CPP_NEW.observed_at,
          tags: [LLAMA_CPP_NEW.category, LLAMA_CPP_NEW.ring],
        },
      ],
    };
    const events = parseRadarBody(JSON.stringify(feed));
    expect(events).toHaveLength(2);
    expect(events[0]?.project).toBe('vLLM');
    expect(events[0]?.change_type).toBe('demoted');
    expect(events[1]?.project).toBe('llama.cpp');
    expect(events[1]?.category).toBe('ai_infrastructure');
  });

  it('returns no events for a JSON Feed with an empty items array', () => {
    const feed = { version: 'https://jsonfeed.org/version/1.1', items: [] };
    expect(parseRadarBody(JSON.stringify(feed))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mapping — title / sourceUrl / excerpt / publishedAt
// ---------------------------------------------------------------------------

describe('fetchRadarCandidates — mapping', () => {
  it('maps a demoted event title as "from → to (change_type)"', async () => {
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(ndjson(VLLM_DEMOTED)) });
    expect(result.errors).toHaveLength(0);
    expect(result.candidates[0]?.title).toBe('vLLM: adopt → pilot (demoted)');
  });

  it('maps a new event title as "new on the radar (ring)"', async () => {
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(ndjson(LLAMA_CPP_NEW)) });
    expect(result.candidates[0]?.title).toBe('llama.cpp: new on the radar (watch)');
  });

  it('builds a per-project deep link when siteRoot is set', async () => {
    const result = await fetchRadarCandidates({
      fetchImpl: okFetch(ndjson(LLAMA_CPP_NEW)),
      siteRoot: 'https://radar.example.com',
    });
    expect(result.candidates[0]?.sourceUrl).toBe(
      'https://radar.example.com/project_llama-cpp.html',
    );
  });

  it('strips a trailing slash from siteRoot before building the deep link', async () => {
    const result = await fetchRadarCandidates({
      fetchImpl: okFetch(ndjson(VLLM_DEMOTED)),
      siteRoot: 'https://radar.example.com/',
    });
    expect(result.candidates[0]?.sourceUrl).toBe('https://radar.example.com/project_vllm.html');
  });

  it('falls back to the repo URL when siteRoot is absent', async () => {
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(ndjson(VLLM_DEMOTED)) });
    expect(result.candidates[0]?.sourceUrl).toBe(DEFAULT_RADAR_REPO_URL);
  });

  it('uses a custom repoUrl fallback when provided', async () => {
    const result = await fetchRadarCandidates({
      fetchImpl: okFetch(ndjson(VLLM_DEMOTED)),
      repoUrl: 'https://custom.example/radar',
    });
    expect(result.candidates[0]?.sourceUrl).toBe('https://custom.example/radar');
  });

  it('sets sourceName, joins reasons into rawExcerpt, and parses publishedAt', async () => {
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(ndjson(VLLM_DEMOTED)) });
    const candidate = result.candidates[0];
    expect(candidate?.sourceName).toBe('On-Prem AI Adoption Radar');
    expect(candidate?.rawExcerpt).toBe(VLLM_DEMOTED.reasons.join(' '));
    expect(candidate?.publishedAt).toBeInstanceOf(Date);
    expect(candidate?.publishedAt?.toISOString()).toBe('2026-06-15T07:36:02.282Z');
  });
});

// ---------------------------------------------------------------------------
// Filtering — categories + changeTypes
// ---------------------------------------------------------------------------

describe('fetchRadarCandidates — filtering', () => {
  it('excludes "updated" events by default', async () => {
    const body = ndjson(VLLM_DEMOTED, OLLAMA_UPDATED);
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(body) });
    expect(result.candidates.map((c) => c.title)).not.toContain('Ollama: pilot → pilot (updated)');
    expect(result.candidates).toHaveLength(1);
  });

  it('includes "updated" events when changeTypes opts them in', async () => {
    const body = ndjson(VLLM_DEMOTED, OLLAMA_UPDATED);
    const result = await fetchRadarCandidates({
      fetchImpl: okFetch(body),
      changeTypes: ['updated'],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.title).toBe('Ollama: pilot → pilot (updated)');
  });

  it('keeps only events whose category is in the allowlist', async () => {
    const body = ndjson(VLLM_DEMOTED, LLAMA_CPP_NEW, LANGGRAPH_PROMOTED);
    const result = await fetchRadarCandidates({
      fetchImpl: okFetch(body),
      categories: ['model_serving'],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.title).toContain('vLLM');
  });

  it('keeps all categories by default', async () => {
    const body = ndjson(VLLM_DEMOTED, LLAMA_CPP_NEW, LANGGRAPH_PROMOTED);
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(body) });
    expect(result.candidates).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Sorting + maxItems cap
// ---------------------------------------------------------------------------

describe('fetchRadarCandidates — sort + maxItems', () => {
  it('sorts by observed_at descending (most recent first)', async () => {
    // Fixtures listed oldest-first; expect newest-first output.
    const body = ndjson(VLLM_DEMOTED, LLAMA_CPP_NEW, LANGGRAPH_PROMOTED);
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(body) });
    const projects = result.candidates.map((c) => c.title.split(':')[0]);
    expect(projects).toEqual(['LangGraph', 'llama.cpp', 'vLLM']);
  });

  it('caps the result at maxItems (taking the most recent)', async () => {
    const body = ndjson(VLLM_DEMOTED, LLAMA_CPP_NEW, LANGGRAPH_PROMOTED);
    const result = await fetchRadarCandidates({ fetchImpl: okFetch(body), maxItems: 2 });
    expect(result.candidates).toHaveLength(2);
    const projects = result.candidates.map((c) => c.title.split(':')[0]);
    expect(projects).toEqual(['LangGraph', 'llama.cpp']);
  });
});

// ---------------------------------------------------------------------------
// Error handling — never throws out of fetch
// ---------------------------------------------------------------------------

describe('fetchRadarCandidates — errors', () => {
  it('returns a SourceError (no throw) when fetch rejects', async () => {
    const failing: FetchImpl = async () => {
      throw new Error('network down');
    };
    const result = await fetchRadarCandidates({ fetchImpl: failing });
    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toEqual([{ source: 'radar', message: 'network down' }]);
  });

  it('returns a SourceError on a non-200 response', async () => {
    const notFound: FetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });
    const result = await fetchRadarCandidates({ fetchImpl: notFound });
    expect(result.candidates).toHaveLength(0);
    expect(result.errors[0]?.source).toBe('radar');
    expect(result.errors[0]?.message).toContain('404');
  });

  it('returns a SourceError when text() rejects', async () => {
    const badBody: FetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error('stream error');
      },
    });
    const result = await fetchRadarCandidates({ fetchImpl: badBody });
    expect(result.errors).toEqual([{ source: 'radar', message: 'stream error' }]);
  });
});

// ---------------------------------------------------------------------------
// Provider adapter (createRadarProvider)
// ---------------------------------------------------------------------------

describe('createRadarProvider', () => {
  it('has the expected id and label', () => {
    const provider = createRadarProvider();
    expect(provider.id).toBe('radar');
    expect(provider.label).toBe('On-Prem AI Adoption Radar');
  });

  it('fetches through the configured feed and forwards the context signal', async () => {
    const { impl, calls } = recordingFetch(ndjson(VLLM_DEMOTED));
    const controller = new AbortController();
    const config: RadarProviderConfig = {
      feedUrl: 'https://feed.example/history.jsonl',
      fetchImpl: impl,
    };
    const provider = createRadarProvider(config);

    const result = await provider.fetch(ctx({ signal: controller.signal }));

    expect(result.candidates).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://feed.example/history.jsonl');
    expect(calls[0]?.signal).toBe(controller.signal);
  });

  it('reports errors through the provider result without throwing', async () => {
    const failing: FetchImpl = async () => {
      throw new Error('boom');
    };
    const provider = createRadarProvider({ fetchImpl: failing });
    const result = await provider.fetch(ctx());
    expect(result.candidates).toHaveLength(0);
    expect(result.errors[0]?.message).toBe('boom');
  });
});
