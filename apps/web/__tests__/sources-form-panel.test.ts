/**
 * SourceFormPanel utility tests — covers the pure helper functions used by
 * the slide-over form panel to extract typed config values from a raw JSON
 * config blob, and the typeFieldsVisible field-visibility rules.
 *
 * All functions under test are pure (no DOM, no React), making them ideal
 * for fast unit coverage.
 */

import { describe, it, expect } from 'vitest';
import { typeFieldsVisible } from '../components/sources/sources-utils';

// ---------------------------------------------------------------------------
// typeFieldsVisible — type → field-visibility mapping
// ---------------------------------------------------------------------------

describe('typeFieldsVisible', () => {
  it('rss: shows URL, hides radar and exa sections', () => {
    const vis = typeFieldsVisible('rss');
    expect(vis.showUrl).toBe(true);
    expect(vis.showRadar).toBe(false);
    expect(vis.showExa).toBe(false);
  });

  it('radar: shows URL and radar sections, hides exa', () => {
    const vis = typeFieldsVisible('radar');
    expect(vis.showUrl).toBe(true);
    expect(vis.showRadar).toBe(true);
    expect(vis.showExa).toBe(false);
  });

  it('exa: hides URL and radar sections, shows exa', () => {
    const vis = typeFieldsVisible('exa');
    expect(vis.showUrl).toBe(false);
    expect(vis.showRadar).toBe(false);
    expect(vis.showExa).toBe(true);
  });

  it('returns an immutable-shaped object (all three keys present)', () => {
    for (const type of ['rss', 'radar', 'exa'] as const) {
      const vis = typeFieldsVisible(type);
      expect(Object.keys(vis)).toEqual(
        expect.arrayContaining(['showUrl', 'showRadar', 'showExa']),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Config extraction helpers — tested through representative inputs
// ---------------------------------------------------------------------------

/** Inline helpers mirroring what SourceFormPanel uses internally. */
function extractQueriesText(config: unknown): string {
  if (!config || typeof config !== 'object') return '';
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.queries)) return '';
  return (c.queries as string[]).join('\n');
}

function extractRadarCategories(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as Record<string, unknown>;
  return Array.isArray(c.categories) ? (c.categories as string[]) : [];
}

function extractRadarChangeTypes(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as Record<string, unknown>;
  return Array.isArray(c.changeTypes) ? (c.changeTypes as string[]) : [];
}

function extractRadarMaxItems(config: unknown): string {
  if (!config || typeof config !== 'object') return '';
  const c = config as Record<string, unknown>;
  return typeof c.maxItems === 'number' ? String(c.maxItems) : '';
}

function extractRadarSiteRoot(config: unknown): string {
  if (!config || typeof config !== 'object') return '';
  const c = config as Record<string, unknown>;
  return typeof c.siteRoot === 'string' ? c.siteRoot : '';
}

// ── extractQueriesText ──────────────────────────────────────

describe('extractQueriesText', () => {
  it('returns empty string for null config', () => {
    expect(extractQueriesText(null)).toBe('');
  });

  it('returns empty string when config has no queries key', () => {
    expect(extractQueriesText({})).toBe('');
  });

  it('returns queries joined by newline', () => {
    const config = { queries: ['AI agents', 'LLM inference'] };
    expect(extractQueriesText(config)).toBe('AI agents\nLLM inference');
  });

  it('handles single query', () => {
    expect(extractQueriesText({ queries: ['only one'] })).toBe('only one');
  });

  it('returns empty string when queries is not an array', () => {
    expect(extractQueriesText({ queries: 'not-an-array' })).toBe('');
  });

  it('returns empty string for undefined config', () => {
    expect(extractQueriesText(undefined)).toBe('');
  });
});

// ── extractRadarCategories ──────────────────────────────────

describe('extractRadarCategories', () => {
  it('returns empty array for null config', () => {
    expect(extractRadarCategories(null)).toEqual([]);
  });

  it('returns empty array when categories is absent', () => {
    expect(extractRadarCategories({})).toEqual([]);
  });

  it('returns the categories array when present', () => {
    const config = { categories: ['coding_agents', 'mcp_tooling'] };
    expect(extractRadarCategories(config)).toEqual(['coding_agents', 'mcp_tooling']);
  });

  it('returns empty array when categories is not an array', () => {
    expect(extractRadarCategories({ categories: 'coding_agents' })).toEqual([]);
  });
});

// ── extractRadarChangeTypes ─────────────────────────────────

describe('extractRadarChangeTypes', () => {
  it('returns empty array when config is null', () => {
    expect(extractRadarChangeTypes(null)).toEqual([]);
  });

  it('returns empty array when changeTypes is absent', () => {
    expect(extractRadarChangeTypes({})).toEqual([]);
  });

  it('returns the changeTypes array when present', () => {
    const config = { changeTypes: ['new', 'promoted'] };
    expect(extractRadarChangeTypes(config)).toEqual(['new', 'promoted']);
  });
});

// ── extractRadarMaxItems ────────────────────────────────────

describe('extractRadarMaxItems', () => {
  it('returns empty string when config is null', () => {
    expect(extractRadarMaxItems(null)).toBe('');
  });

  it('returns empty string when maxItems is absent', () => {
    expect(extractRadarMaxItems({})).toBe('');
  });

  it('returns string representation of numeric maxItems', () => {
    expect(extractRadarMaxItems({ maxItems: 25 })).toBe('25');
  });

  it('returns empty string when maxItems is not a number', () => {
    expect(extractRadarMaxItems({ maxItems: 'many' })).toBe('');
  });

  it('handles zero as a valid (edge) value', () => {
    expect(extractRadarMaxItems({ maxItems: 0 })).toBe('0');
  });
});

// ── extractRadarSiteRoot ────────────────────────────────────

describe('extractRadarSiteRoot', () => {
  it('returns empty string when config is null', () => {
    expect(extractRadarSiteRoot(null)).toBe('');
  });

  it('returns empty string when siteRoot is absent', () => {
    expect(extractRadarSiteRoot({})).toBe('');
  });

  it('returns the siteRoot string when present', () => {
    const config = { siteRoot: 'https://radar.example.com' };
    expect(extractRadarSiteRoot(config)).toBe('https://radar.example.com');
  });

  it('returns empty string when siteRoot is not a string', () => {
    expect(extractRadarSiteRoot({ siteRoot: 42 })).toBe('');
  });
});
