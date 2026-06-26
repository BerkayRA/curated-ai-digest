import { describe, it, expect } from 'vitest';

import { buildRssFeed, escapeXml, type RssFeedInput, type RssItem } from '../rss.js';

function makeItem(overrides: Partial<RssItem> = {}): RssItem {
  return {
    title: 'Item title',
    link: 'https://example.com/issues/1',
    description: 'A short preheader.',
    pubDate: new Date('2026-06-25T12:00:00Z'),
    guid: 'https://example.com/issues/1',
    ...overrides,
  };
}

function makeFeed(overrides: Partial<RssFeedInput> = {}): RssFeedInput {
  return {
    title: 'Curated AI Digest',
    link: 'https://example.com/archive',
    description: 'Weekly AI news.',
    language: 'tr',
    items: [makeItem()],
    ...overrides,
  };
}

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &apos;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('Hello, world 123')).toBe('Hello, world 123');
  });
});

describe('buildRssFeed — document shape', () => {
  it('starts with the XML declaration and contains the rss/channel envelope', () => {
    const xml = buildRssFeed(makeFeed());
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  it('renders the channel title, link, and description', () => {
    const xml = buildRssFeed(makeFeed());
    expect(xml).toContain('<title>Curated AI Digest</title>');
    expect(xml).toContain('<link>https://example.com/archive</link>');
    expect(xml).toContain('<description>Weekly AI news.</description>');
  });

  it('includes <language> when language is provided', () => {
    const xml = buildRssFeed(makeFeed({ language: 'tr' }));
    expect(xml).toContain('<language>tr</language>');
  });

  it('omits <language> when not provided', () => {
    const xml = buildRssFeed(makeFeed({ language: undefined }));
    expect(xml).not.toContain('<language>');
  });
});

describe('buildRssFeed — item escaping', () => {
  it('XML-escapes ampersand, angle bracket, and quote in the title', () => {
    const xml = buildRssFeed(
      makeFeed({ items: [makeItem({ title: 'Tom & Jerry < "best" >' })] }),
    );
    expect(xml).toContain('<title>Tom &amp; Jerry &lt; &quot;best&quot; &gt;</title>');
    expect(xml).not.toContain('<title>Tom & Jerry');
  });

  it('emits a permalink guid with the escaped URL', () => {
    const xml = buildRssFeed(
      makeFeed({ items: [makeItem({ guid: 'https://example.com/a?x=1&y=2' })] }),
    );
    expect(xml).toContain(
      '<guid isPermaLink="true">https://example.com/a?x=1&amp;y=2</guid>',
    );
  });

  it('renders pubDate as an RFC-822 date string', () => {
    const xml = buildRssFeed(makeFeed());
    const match = xml.match(/<pubDate>(.+?)<\/pubDate>/);
    expect(match).not.toBeNull();
    const value = match![1];
    expect(value).toMatch(/GMT|UTC|\+0000/);
    expect(value).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/);
  });
});

describe('buildRssFeed — description CDATA handling', () => {
  it('wraps description in CDATA and does NOT entity-escape & or <', () => {
    const xml = buildRssFeed(
      makeFeed({ items: [makeItem({ description: 'A & B < C' })] }),
    );
    expect(xml).toContain('<description><![CDATA[A & B < C]]></description>');
    expect(xml).not.toContain('A &amp; B');
  });

  it('safely splits an embedded ]]> so the CDATA section is not broken', () => {
    const xml = buildRssFeed(
      makeFeed({ items: [makeItem({ description: 'evil ]]> escape' })] }),
    );
    // The raw, unsplit terminator must not survive inside the description.
    expect(xml).toContain('<description><![CDATA[evil ]]]]><![CDATA[> escape]]></description>');
    // Every opened CDATA section must be matched by a close.
    const opens = (xml.match(/<!\[CDATA\[/g) ?? []).length;
    const closes = (xml.match(/]]>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

describe('buildRssFeed — empty items', () => {
  it('produces a valid feed with no <item> elements', () => {
    const xml = buildRssFeed(makeFeed({ items: [] }));
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
  });
});
