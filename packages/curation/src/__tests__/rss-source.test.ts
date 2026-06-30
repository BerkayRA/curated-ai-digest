import { describe, it, expect } from 'vitest';
import { parseFeedXml } from '../ingest/rss-source';

// ---------------------------------------------------------------------------
// RSS source — tested against a static XML fixture (no network I/O)
// ---------------------------------------------------------------------------

/**
 * Fixture RSS feed:
 *   - item 1: valid (title + link)
 *   - item 2: valid (title + link)
 *   - item 3: blank title (only whitespace) → should be skipped
 *   - item 4: title present, link absent, non-URL guid → should be skipped
 */
const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI News Feed</title>
    <link>https://example.com</link>
    <description>The latest in artificial intelligence</description>
    <item>
      <title>GPT-5 Released With Enhanced Reasoning</title>
      <link>https://example.com/gpt-5-release</link>
      <description>OpenAI has released GPT-5 featuring significant improvements in reasoning capabilities.</description>
      <pubDate>Mon, 09 Jun 2026 10:00:00 +0000</pubDate>
    </item>
    <item>
      <title>DeepMind Achieves New Protein Folding Milestone</title>
      <link>https://example.com/deepmind-protein</link>
      <description>DeepMind researchers have achieved a new breakthrough in protein structure prediction.</description>
      <pubDate>Tue, 10 Jun 2026 14:30:00 +0000</pubDate>
    </item>
    <item>
      <title>   </title>
      <link>https://example.com/blank-title</link>
      <description>This item has a whitespace-only title and should be skipped.</description>
    </item>
    <item>
      <title>Article Without Link</title>
      <guid>non-url-guid-value</guid>
      <description>This item has no http link — guid is not a URL — should be skipped.</description>
    </item>
  </channel>
</rss>`;

describe('parseFeedXml', () => {
  it('parses valid RSS items and maps them to RawCandidate shape', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    // Only the 2 items with both a non-empty title and an http link should survive.
    expect(candidates).toHaveLength(2);
  });

  it('maps title correctly', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    expect(candidates[0]?.title).toBe('GPT-5 Released With Enhanced Reasoning');
  });

  it('maps sourceUrl to the item link', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    expect(candidates[0]?.sourceUrl).toBe('https://example.com/gpt-5-release');
  });

  it('maps sourceName to the provided feed name', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    expect(candidates.every((c) => c.sourceName === 'Test Feed')).toBe(true);
  });

  it('maps rawExcerpt from description', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    expect(candidates[0]?.rawExcerpt).toContain('GPT-5');
  });

  it('parses publishedAt from pubDate', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    expect(candidates[0]?.publishedAt).toBeInstanceOf(Date);
  });

  it('skips items with a whitespace-only title', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    const urls = candidates.map((c) => c.sourceUrl);
    expect(urls).not.toContain('https://example.com/blank-title');
  });

  it('skips items without an http link (non-URL guid)', async () => {
    const candidates = await parseFeedXml(SAMPLE_RSS_XML, 'Test Feed');
    const titles = candidates.map((c) => c.title);
    expect(titles).not.toContain('Article Without Link');
  });

  it('returns empty array for a feed with no valid items', async () => {
    const emptyFeed = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Empty</title>
    <item><description>No title, no link</description></item>
  </channel>
</rss>`;
    const candidates = await parseFeedXml(emptyFeed, 'Empty Feed');
    expect(candidates).toHaveLength(0);
  });
});
