/**
 * Public RSS 2.0 feed — /archive/[topicSlug]/rss.xml
 *
 * Emits the topic's SENT issues (newest first) as an RSS feed. Item links are
 * absolute permalinks into the web archive, built from APP_BASE_URL. Language
 * is taken from the topic. Unknown topic → 404.
 */

import { prisma, createTopicRepository } from '@digest/db';
import { buildRssFeed } from '@digest/shared';
import { resolveArchiveBranding, issuesToRssItems } from '../../../../lib/archive';

export const dynamic = 'force-dynamic';

/** Number of recent issues to include in the feed. */
const FEED_LIMIT = 50;

function baseUrl(): string {
  return (process.env['APP_BASE_URL'] ?? 'http://localhost:3100').replace(/\/$/, '');
}

export async function GET(_request: Request, props: { params: Promise<{ topicSlug: string }> }): Promise<Response> {
  const params = await props.params;
  const topic = await createTopicRepository(prisma).findBySlug(params.topicSlug);
  if (!topic) {
    return new Response('Not found', { status: 404 });
  }

  const rows = await prisma.issue.findMany({
    where: { topicId: topic.id, status: 'sent' },
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    take: FEED_LIMIT,
    select: { isoWeek: true, subject: true, preheader: true, sentAt: true, createdAt: true },
  });

  const branding = resolveArchiveBranding(topic);
  const base = baseUrl();

  const items = issuesToRssItems(
    base,
    topic.slug,
    rows.map((r) => ({
      isoWeek: r.isoWeek,
      subject: r.subject,
      preheader: r.preheader,
      sentAt: r.sentAt ?? r.createdAt,
    })),
  );

  const xml = buildRssFeed({
    title: topic.name,
    link: `${base}/archive/${encodeURIComponent(topic.slug)}`,
    description: topic.description ?? branding.footerText,
    language: branding.language,
    items,
  });

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
