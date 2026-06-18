import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { defaultProviders, isRadarEnabled } from '../ingest/providers.js';
import { rssProvider } from '../ingest/rss-source.js';
import { exaProvider, topicTunedQueries } from '../ingest/exa-source.js';
import { radarProvider } from '../ingest/radar-source.js';
import { DEFAULT_TOPIC } from '../ingest/sources.js';
import type { Logger, SourceContext } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Source-provider unit tests — no network or DB.
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function ctx(overrides: Partial<SourceContext> = {}): SourceContext {
  return { topic: DEFAULT_TOPIC, logger: noopLogger, ...overrides };
}

describe('defaultProviders', () => {
  const ORIGINAL_ENABLED = process.env['RADAR_ENABLED'];
  const ORIGINAL_FEED_URL = process.env['RADAR_FEED_URL'];

  beforeEach(() => {
    // Radar is gated OFF by default; clear both gating vars so these assertions
    // are deterministic regardless of the ambient environment.
    delete process.env['RADAR_ENABLED'];
    delete process.env['RADAR_FEED_URL'];
  });

  afterEach(() => {
    if (ORIGINAL_ENABLED === undefined) delete process.env['RADAR_ENABLED'];
    else process.env['RADAR_ENABLED'] = ORIGINAL_ENABLED;
    if (ORIGINAL_FEED_URL === undefined) delete process.env['RADAR_FEED_URL'];
    else process.env['RADAR_FEED_URL'] = ORIGINAL_FEED_URL;
  });

  it('returns the rss and exa providers in order (radar gated off by default)', () => {
    const providers = defaultProviders();
    expect(providers.map((p) => p.id)).toEqual(['rss', 'exa']);
  });

  it('exposes the same provider instances as the named exports', () => {
    const providers = defaultProviders();
    expect(providers).toContain(rssProvider);
    expect(providers).toContain(exaProvider);
  });

  it('returns a fresh array on each call (safe to append a radar provider)', () => {
    expect(defaultProviders()).not.toBe(defaultProviders());
  });

  it('appends the radar provider when RADAR_ENABLED=true', () => {
    process.env['RADAR_ENABLED'] = 'true';
    const providers = defaultProviders();
    expect(providers.map((p) => p.id)).toEqual(['rss', 'exa', 'radar']);
    expect(providers).toContain(radarProvider);
  });

  it('appends the radar provider when RADAR_FEED_URL is set', () => {
    process.env['RADAR_FEED_URL'] = 'https://example.com/history.jsonl';
    expect(defaultProviders().map((p) => p.id)).toEqual(['rss', 'exa', 'radar']);
  });

  it('does not append the radar provider when RADAR_ENABLED is not exactly "true"', () => {
    process.env['RADAR_ENABLED'] = '1';
    expect(defaultProviders().map((p) => p.id)).toEqual(['rss', 'exa']);
  });
});

describe('isRadarEnabled', () => {
  const ORIGINAL_ENABLED = process.env['RADAR_ENABLED'];
  const ORIGINAL_FEED_URL = process.env['RADAR_FEED_URL'];

  beforeEach(() => {
    delete process.env['RADAR_ENABLED'];
    delete process.env['RADAR_FEED_URL'];
  });

  afterEach(() => {
    if (ORIGINAL_ENABLED === undefined) delete process.env['RADAR_ENABLED'];
    else process.env['RADAR_ENABLED'] = ORIGINAL_ENABLED;
    if (ORIGINAL_FEED_URL === undefined) delete process.env['RADAR_FEED_URL'];
    else process.env['RADAR_FEED_URL'] = ORIGINAL_FEED_URL;
  });

  it('is false when neither gating var is set', () => {
    expect(isRadarEnabled()).toBe(false);
  });

  it('is true when RADAR_ENABLED is "true"', () => {
    process.env['RADAR_ENABLED'] = 'true';
    expect(isRadarEnabled()).toBe(true);
  });

  it('is true when a feed URL is configured', () => {
    process.env['RADAR_FEED_URL'] = 'https://example.com/history.jsonl';
    expect(isRadarEnabled()).toBe(true);
  });
});

describe('rssProvider', () => {
  it('has the expected id and label', () => {
    expect(rssProvider.id).toBe('rss');
    expect(rssProvider.label).toBe('RSS Feeds');
  });
});

describe('exaProvider', () => {
  const ORIGINAL_KEY = process.env['EXA_API_KEY'];

  beforeEach(() => {
    delete process.env['EXA_API_KEY'];
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env['EXA_API_KEY'];
    else process.env['EXA_API_KEY'] = ORIGINAL_KEY;
  });

  it('has the expected id and label', () => {
    expect(exaProvider.id).toBe('exa');
    expect(exaProvider.label).toBe('Exa Neural Search');
  });

  it('no-ops with no candidates/errors when EXA_API_KEY is missing', async () => {
    const result = await exaProvider.fetch(ctx());
    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('topicTunedQueries', () => {
  it('appends the topic focus to every base query', () => {
    const tuned = topicTunedQueries('on-prem AI', ['llm releases', 'ai funding']);
    expect(tuned).toEqual(['llm releases (focus: on-prem AI)', 'ai funding (focus: on-prem AI)']);
  });

  it('returns the base queries unchanged when the topic is blank', () => {
    const base = ['llm releases', 'ai funding'];
    expect(topicTunedQueries('   ', base)).toEqual(base);
  });
});
