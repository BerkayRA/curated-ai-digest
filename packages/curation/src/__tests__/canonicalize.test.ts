import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, contentHash } from '../ingest/canonicalize.js';

// ---------------------------------------------------------------------------
// canonicalizeUrl
// ---------------------------------------------------------------------------

describe('canonicalizeUrl', () => {
  it('removes utm_source', () => {
    const result = canonicalizeUrl('https://example.com/article?utm_source=twitter');
    expect(result).toBe('https://example.com/article');
  });

  it('removes utm_medium and utm_campaign together', () => {
    const result = canonicalizeUrl(
      'https://example.com/post?utm_medium=email&utm_campaign=weekly',
    );
    expect(result).toBe('https://example.com/post');
  });

  it('removes fbclid', () => {
    const result = canonicalizeUrl('https://example.com/story?fbclid=Abc123');
    expect(result).toBe('https://example.com/story');
  });

  it('removes gclid', () => {
    const result = canonicalizeUrl('https://example.com/page?gclid=XYZ');
    expect(result).toBe('https://example.com/page');
  });

  it('preserves meaningful query params', () => {
    const result = canonicalizeUrl('https://example.com/search?q=llm&page=2');
    expect(result).toBe('https://example.com/search?page=2&q=llm');
  });

  it('sorts remaining query params for stability', () => {
    const a = canonicalizeUrl('https://example.com/page?z=1&a=2');
    const b = canonicalizeUrl('https://example.com/page?a=2&z=1');
    expect(a).toBe(b);
  });

  it('strips trailing slash from pathname', () => {
    const result = canonicalizeUrl('https://example.com/article/');
    expect(result).toBe('https://example.com/article');
  });

  it('keeps bare root slash', () => {
    const result = canonicalizeUrl('https://example.com/');
    expect(result).toBe('https://example.com/');
  });

  it('removes fragment', () => {
    const result = canonicalizeUrl('https://example.com/article#section-2');
    expect(result).toBe('https://example.com/article');
  });

  it('returns the original string for invalid URLs', () => {
    const bad = 'not a url at all';
    expect(canonicalizeUrl(bad)).toBe(bad);
  });

  it('handles URLs with no query string', () => {
    const result = canonicalizeUrl('https://openai.com/blog/gpt-5');
    expect(result).toBe('https://openai.com/blog/gpt-5');
  });

  it('produces the same output for the same URL (idempotent)', () => {
    const url = 'https://example.com/post?id=42';
    expect(canonicalizeUrl(url)).toBe(canonicalizeUrl(url));
  });
});

// ---------------------------------------------------------------------------
// contentHash
// ---------------------------------------------------------------------------

describe('contentHash', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = contentHash('https://example.com/article', 'AI makes a breakthrough');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable — same inputs always produce the same hash', () => {
    const h1 = contentHash('https://example.com/article', 'Some Title');
    const h2 = contentHash('https://example.com/article', 'Some Title');
    expect(h1).toBe(h2);
  });

  it('differs when URL differs', () => {
    const h1 = contentHash('https://example.com/a', 'Same Title');
    const h2 = contentHash('https://example.com/b', 'Same Title');
    expect(h1).not.toBe(h2);
  });

  it('differs when title differs', () => {
    const url = 'https://example.com/article';
    const h1 = contentHash(url, 'Title One');
    const h2 = contentHash(url, 'Title Two');
    expect(h1).not.toBe(h2);
  });

  it('is case-insensitive for the title', () => {
    const url = 'https://example.com/article';
    const h1 = contentHash(url, 'OpenAI Releases GPT-5');
    const h2 = contentHash(url, 'openai releases gpt-5');
    expect(h1).toBe(h2);
  });

  it('collapses title whitespace before hashing', () => {
    const url = 'https://example.com/article';
    const h1 = contentHash(url, 'AI  News   Today');
    const h2 = contentHash(url, 'AI News Today');
    expect(h1).toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// isAllowedScheme
// ---------------------------------------------------------------------------

import { isAllowedScheme } from '../ingest/canonicalize.js';

describe('isAllowedScheme', () => {
  it('allows http URLs', () => {
    expect(isAllowedScheme('http://example.com/article')).toBe(true);
  });

  it('allows https URLs', () => {
    expect(isAllowedScheme('https://example.com/article')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isAllowedScheme('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isAllowedScheme('data:text/html,<h1>hello</h1>')).toBe(false);
  });

  it('rejects file: URLs', () => {
    expect(isAllowedScheme('file:///etc/passwd')).toBe(false);
  });

  it('rejects ftp: URLs', () => {
    expect(isAllowedScheme('ftp://example.com/file')).toBe(false);
  });

  it('rejects invalid (non-URL) strings', () => {
    expect(isAllowedScheme('not a url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAllowedScheme('')).toBe(false);
  });
});
