// ---------------------------------------------------------------------------
// rss.ts — hand-rolled, dependency-free RSS 2.0 feed builder.
//
// Produces a spec-compliant <rss version="2.0"> document. Item titles, links,
// and guids are XML-escaped; descriptions are wrapped in CDATA (with the `]]>`
// terminator defensively split) so plain-text/markup descriptions pass through
// untouched. No external deps.
// ---------------------------------------------------------------------------

export interface RssItem {
  title: string;
  link: string;
  description: string; // plain text (e.g. issue preheader)
  pubDate: Date;
  guid: string; // permalink URL
}

export interface RssFeedInput {
  title: string;
  link: string; // channel link (archive index URL)
  description: string;
  language?: string; // 'tr' | 'en' → channel <language>
  items: RssItem[];
}

/** Escape the five XML special characters. Safe for attributes and text. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap text in CDATA, defending against an embedded `]]>` terminator. */
function wrapCdata(text: string): string {
  const safe = text.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

/** Render a single <item> element. */
function renderItem(item: RssItem): string {
  return [
    '    <item>',
    `      <title>${escapeXml(item.title)}</title>`,
    `      <link>${escapeXml(item.link)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>`,
    `      <pubDate>${item.pubDate.toUTCString()}</pubDate>`,
    `      <description>${wrapCdata(item.description)}</description>`,
    '    </item>',
  ].join('\n');
}

/** Build a complete RSS 2.0 document string from the given feed input. */
export function buildRssFeed(input: RssFeedInput): string {
  const channelLines = [
    `    <title>${escapeXml(input.title)}</title>`,
    `    <link>${escapeXml(input.link)}</link>`,
    `    <description>${escapeXml(input.description)}</description>`,
  ];
  if (input.language) {
    channelLines.push(`    <language>${escapeXml(input.language)}</language>`);
  }

  const itemLines = input.items.map(renderItem);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    ...channelLines,
    ...itemLines,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
