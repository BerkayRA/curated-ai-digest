/**
 * Public single archived issue — /archive/[topicSlug]/[isoWeek]
 *
 * Re-renders the issue from its IssueItems (NOT the stored bodyHtml) so the
 * archive presentation is independent of the email markup and always reflects
 * current branding. Only SENT issues resolve; anything else is a 404.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma, createTopicRepository } from '@digest/db';
import { isoWeekSchema } from '@digest/shared';
import {
  resolveArchiveBranding,
  getArchiveStrings,
  formatIssueDate,
  safeHttpHref,
} from '../../../../lib/archive';
import styles from '../../archive.module.css';

// Public, read-only, changes at most weekly → cache + revalidate (ISR) instead
// of force-dynamic so repeat views don't hit the DB on every request.
export const revalidate = 300;

interface ArchiveIssueProps {
  params: { topicSlug: string; isoWeek: string };
}

export default async function ArchiveIssuePage({ params }: ArchiveIssueProps) {
  // Reject malformed week params before touching the DB (e.g. oversized strings).
  const week = isoWeekSchema.safeParse(params.isoWeek);
  if (!week.success) {
    notFound();
  }

  const topic = await createTopicRepository(prisma).findBySlug(params.topicSlug);
  if (!topic) {
    notFound();
  }

  const issue = await prisma.issue.findFirst({
    where: { topicId: topic.id, isoWeek: week.data, status: 'sent' },
    include: { items: { orderBy: { order: 'asc' }, include: { sponsor: true } } },
  });
  if (!issue) {
    notFound();
  }

  const branding = resolveArchiveBranding(topic);
  const t = getArchiveStrings(branding.language);
  const accentStyle = { '--accent': branding.accentHex } as CSSProperties;
  const issueDate = issue.sentAt ?? issue.createdAt;
  // Sponsored slots disclose only on public topics (defense-in-depth; the API
  // already forbids attaching them to business topics).
  const sponsoredAllowed = topic.consentMode === 'public';

  return (
    <main className={styles.page} style={accentStyle} lang={branding.language}>
      <header className={styles.band}>
        <div className={styles.bandInner}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.logo}
            src={branding.logoUrl}
            width={186}
            height={40}
            alt={branding.brandName}
          />
          <p className={styles.eyebrow}>
            {topic.name} · {issue.isoWeek}
          </p>
          <h1 className={styles.title}>{issue.subject}</h1>
        </div>
      </header>

      <article className={styles.column}>
        <Link className={styles.back} href={`/archive/${encodeURIComponent(topic.slug)}`}>
          {t.backToList}
        </Link>

        <p className={styles.date}>{formatIssueDate(issueDate, branding.locale)}</p>

        {issue.items.map((item, index) => {
          const isSponsored = sponsoredAllowed && item.kind === 'sponsored';
          // A sponsored slot links to the sponsor's site (falling back to the
          // item source URL); both pass the http(s) render-boundary guard.
          const href = safeHttpHref(
            isSponsored ? (item.sponsor?.websiteUrl ?? item.sourceUrl) : item.sourceUrl,
          );
          const linkLabel = isSponsored ? (item.sponsor?.name ?? item.sourceName) : item.sourceName;
          return (
            <section key={item.id} className={styles.story}>
              <div className={styles.storyMeta}>
                <p className={styles.storyIndex}>{String(index + 1).padStart(2, '0')}</p>
                {isSponsored && <span className={styles.sponsoredPill}>{t.sponsoredLabel}</span>}
              </div>
              <h2 className={styles.storyTitle}>{item.titleTr}</h2>
              <p className={styles.storySummary}>{item.summaryTr}</p>
              {href ? (
                <a
                  className={styles.storyLink}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {linkLabel} ↗
                </a>
              ) : (
                <span className={styles.source}>{linkLabel}</span>
              )}
            </section>
          );
        })}
      </article>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>{branding.footerText}</p>
        </div>
      </footer>
    </main>
  );
}
