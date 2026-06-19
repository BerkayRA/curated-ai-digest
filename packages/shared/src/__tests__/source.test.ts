import { describe, it, expect } from 'vitest';
import {
  SourceTypeSchema,
  radarConfigSchema,
  exaConfigSchema,
  CreateSourceSchema,
  UpdateSourceSchema,
} from '../source.js';

// ---------------------------------------------------------------------------
// SourceTypeSchema
// ---------------------------------------------------------------------------

describe('SourceTypeSchema', () => {
  it('accepts rss', () => {
    expect(SourceTypeSchema.parse('rss')).toBe('rss');
  });

  it('accepts radar', () => {
    expect(SourceTypeSchema.parse('radar')).toBe('radar');
  });

  it('accepts exa', () => {
    expect(SourceTypeSchema.parse('exa')).toBe('exa');
  });

  it('rejects an unknown type', () => {
    expect(() => SourceTypeSchema.parse('atom')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => SourceTypeSchema.parse('')).toThrow();
  });

  it('rejects null', () => {
    expect(() => SourceTypeSchema.parse(null)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// radarConfigSchema
// ---------------------------------------------------------------------------

describe('radarConfigSchema', () => {
  it('accepts an empty object (all optional)', () => {
    expect(() => radarConfigSchema.parse({})).not.toThrow();
  });

  it('accepts a full valid config', () => {
    const result = radarConfigSchema.parse({
      categories: ['coding_agents', 'model_serving'],
      changeTypes: ['new', 'promoted'],
      maxItems: 10,
      siteRoot: 'https://radar.example.com',
    });
    expect(result.maxItems).toBe(10);
    expect(result.categories).toHaveLength(2);
  });

  it('rejects a negative maxItems', () => {
    expect(() => radarConfigSchema.parse({ maxItems: -1 })).toThrow();
  });

  it('rejects a zero maxItems', () => {
    expect(() => radarConfigSchema.parse({ maxItems: 0 })).toThrow();
  });

  it('rejects an invalid category', () => {
    expect(() => radarConfigSchema.parse({ categories: ['unknown_category'] })).toThrow();
  });

  it('rejects an invalid changeType', () => {
    expect(() => radarConfigSchema.parse({ changeTypes: ['ignored'] })).toThrow();
  });

  it('rejects a non-URL siteRoot', () => {
    expect(() => radarConfigSchema.parse({ siteRoot: 'not-a-url' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// exaConfigSchema
// ---------------------------------------------------------------------------

describe('exaConfigSchema', () => {
  it('accepts an empty object', () => {
    expect(() => exaConfigSchema.parse({})).not.toThrow();
  });

  it('accepts a queries array', () => {
    const result = exaConfigSchema.parse({ queries: ['AI news', 'LLM releases'] });
    expect(result.queries).toHaveLength(2);
  });

  it('accepts an undefined queries field', () => {
    const result = exaConfigSchema.parse({});
    expect(result.queries).toBeUndefined();
  });

  it('rejects queries with a non-string entry', () => {
    expect(() => exaConfigSchema.parse({ queries: [42] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CreateSourceSchema — rss
// ---------------------------------------------------------------------------

describe('CreateSourceSchema (rss)', () => {
  it('accepts a valid rss source', () => {
    const result = CreateSourceSchema.parse({
      type: 'rss',
      label: 'OpenAI Blog',
      url: 'https://openai.com/blog/rss.xml',
    });
    expect(result.type).toBe('rss');
    expect(result.enabled).toBe(true);
  });

  it('accepts enabled: false override', () => {
    const result = CreateSourceSchema.parse({
      type: 'rss',
      label: 'OpenAI Blog',
      url: 'https://openai.com/blog/rss.xml',
      enabled: false,
    });
    expect(result.enabled).toBe(false);
  });

  it('rejects an rss source without url', () => {
    expect(() =>
      CreateSourceSchema.parse({ type: 'rss', label: 'OpenAI Blog' }),
    ).toThrow();
  });

  it('rejects an rss source with a non-URL url', () => {
    expect(() =>
      CreateSourceSchema.parse({ type: 'rss', label: 'OpenAI Blog', url: 'not-a-url' }),
    ).toThrow();
  });

  it('rejects an rss source with empty label', () => {
    expect(() =>
      CreateSourceSchema.parse({
        type: 'rss',
        label: '',
        url: 'https://openai.com/blog/rss.xml',
      }),
    ).toThrow();
  });

  it('accepts an optional rss config (empty object)', () => {
    const result = CreateSourceSchema.parse({
      type: 'rss',
      label: 'OpenAI Blog',
      url: 'https://openai.com/blog/rss.xml',
      config: {},
    });
    expect(result.config).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CreateSourceSchema — radar
// ---------------------------------------------------------------------------

describe('CreateSourceSchema (radar)', () => {
  it('accepts a valid radar source', () => {
    const result = CreateSourceSchema.parse({
      type: 'radar',
      label: 'On-Prem AI Adoption Radar',
      url: 'https://raw.githubusercontent.com/example/radar/main/data/history.jsonl',
      config: {
        categories: ['coding_agents'],
        changeTypes: ['new', 'promoted', 'demoted'],
        maxItems: 25,
      },
    });
    expect(result.type).toBe('radar');
  });

  it('rejects a radar source without url', () => {
    expect(() =>
      CreateSourceSchema.parse({ type: 'radar', label: 'Radar' }),
    ).toThrow();
  });

  it('rejects a radar source with a non-URL url', () => {
    expect(() =>
      CreateSourceSchema.parse({ type: 'radar', label: 'Radar', url: 'github.com/no-scheme' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CreateSourceSchema — exa
// ---------------------------------------------------------------------------

describe('CreateSourceSchema (exa)', () => {
  it('accepts a valid exa source without url', () => {
    const result = CreateSourceSchema.parse({
      type: 'exa',
      label: 'Exa Neural Search',
      config: { queries: ['AI news'] },
    });
    expect(result.type).toBe('exa');
    expect(result.url).toBeUndefined();
  });

  it('accepts exa with url omitted entirely', () => {
    const result = CreateSourceSchema.parse({ type: 'exa', label: 'Exa' });
    expect(result.url).toBeUndefined();
  });

  it('rejects exa with a url value (must be omitted for exa)', () => {
    expect(() =>
      CreateSourceSchema.parse({
        type: 'exa',
        label: 'Exa Neural Search',
        url: 'https://exa.ai',
      }),
    ).toThrow();
  });

  it('rejects an exa source with empty label', () => {
    expect(() => CreateSourceSchema.parse({ type: 'exa', label: '' })).toThrow();
  });

  it('rejects an unknown type value', () => {
    expect(() =>
      CreateSourceSchema.parse({ type: 'webhook', label: 'Webhook', url: 'https://example.com' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// UpdateSourceSchema
// ---------------------------------------------------------------------------

describe('UpdateSourceSchema', () => {
  it('accepts an empty object (all optional)', () => {
    expect(() => UpdateSourceSchema.parse({})).not.toThrow();
  });

  it('accepts a partial update with only label', () => {
    const result = UpdateSourceSchema.parse({ label: 'New Label' });
    expect(result.label).toBe('New Label');
  });

  it('accepts enabled toggle', () => {
    const result = UpdateSourceSchema.parse({ enabled: false });
    expect(result.enabled).toBe(false);
  });

  it('rejects an invalid type in update', () => {
    expect(() => UpdateSourceSchema.parse({ type: 'webhook' })).toThrow();
  });
});
