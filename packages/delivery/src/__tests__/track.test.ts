/**
 * Unit tests for injectTrackingHooks — pure HTML post-processing.
 * No DB, no network.
 */

import { describe, it, expect } from 'vitest';
import { injectTrackingHooks } from '../track';

const BASE_URL = 'https://digest.example.com';
const TOKEN = 'tok-123';

describe('injectTrackingHooks', () => {
  it('rewrites an item href to a click-tracking redirect keyed by item order', () => {
    const html = '<html><body><a href="https://news.example.com/a">Read</a></body></html>';
    const items = [{ sourceUrl: 'https://news.example.com/a', order: 0 }];

    const result = injectTrackingHooks(html, TOKEN, items, BASE_URL);

    expect(result).toContain(`href="${BASE_URL}/api/track/click/${TOKEN}/0"`);
    expect(result).not.toContain('href="https://news.example.com/a"');
  });

  it('uses the item order field (not array position) for the click index', () => {
    const html = '<body><a href="https://x.test/p">x</a></body>';
    const items = [{ sourceUrl: 'https://x.test/p', order: 7 }];

    const result = injectTrackingHooks(html, TOKEN, items, BASE_URL);

    expect(result).toContain(`/api/track/click/${TOKEN}/7"`);
  });

  it('appends the open pixel immediately before </body>', () => {
    const html = '<html><body><p>hi</p></body></html>';

    const result = injectTrackingHooks(html, TOKEN, [], BASE_URL);

    expect(result).toContain(`<img src="${BASE_URL}/api/track/open/${TOKEN}"`);
    expect(result).toMatch(/<img src="[^"]+\/api\/track\/open\/tok-123"[^>]*\/><\/body>/);
  });

  it('appends the pixel at the end when there is no </body>', () => {
    const html = '<div>fragment</div>';

    const result = injectTrackingHooks(html, TOKEN, [], BASE_URL);

    expect(result.startsWith('<div>fragment</div>')).toBe(true);
    expect(result).toContain(`/api/track/open/${TOKEN}`);
  });

  it('does not mutate the original input string (immutability)', () => {
    const html = '<body><a href="https://y.test/z">z</a></body>';
    const original = html;
    const items = [{ sourceUrl: 'https://y.test/z', order: 0 }];

    injectTrackingHooks(html, TOKEN, items, BASE_URL);

    expect(html).toBe(original);
  });

  it('skips items whose sourceUrl is null', () => {
    const html = '<body><a href="https://keep.test/k">k</a></body>';
    const items = [
      { sourceUrl: null, order: 0 },
      { sourceUrl: 'https://keep.test/k', order: 1 },
    ];

    const result = injectTrackingHooks(html, TOKEN, items, BASE_URL);

    expect(result).toContain(`/api/track/click/${TOKEN}/1"`);
    // No click URL was generated for the null (order 0) item.
    expect(result).not.toContain(`/api/track/click/${TOKEN}/0"`);
  });

  it('replaces all occurrences of the same href', () => {
    const html =
      '<body><a href="https://dup.test/d">1</a><a href="https://dup.test/d">2</a></body>';
    const items = [{ sourceUrl: 'https://dup.test/d', order: 0 }];

    const result = injectTrackingHooks(html, TOKEN, items, BASE_URL);

    const matches = result.match(/\/api\/track\/click\/tok-123\/0"/g) ?? [];
    expect(matches.length).toBe(2);
  });
});
