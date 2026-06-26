/**
 * Public per-topic archive index — /archive/[topicSlug]
 *
 * Lists this topic's SENT issues only (newest first). Drafts, scheduled, and
 * failed issues never appear — the archive is the public record of what went
 * out. Branding (logo / accent / wordmark / language) falls back to the Mega /
 * Process-Blue / TR defaults for any unset topic field.
 *
 * Standalone branded page (not the dashboard shell); reachable unauthenticated
 * via the /archive public prefix in auth-guard.ts.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma, createTopicRepository } from '@digest/db';
import { resolveArchiveBranding, getArchiveStrings, formatIssueDate } from '../../../lib/archive';
import styles from '../archive.module.css';

// Public, read-only, changes at most weekly → cache + revalidate (ISR) instead
// of force-dynamic so repeat views don't hit the DB on every request.
export const revalidate = 300;

interface ArchiveIndexProps {
  params: { topicSlug: string };
}

export default async function ArchiveIndexPage({ params }: ArchiveIndexProps) {
  const topic = await createTopicRepository(prisma).findBySlug(params.topicSlug);
  if (!topic) {
    notFound();
  }

  const issues = await prisma.issue.findMany({
    where: { topicId: topic.id, status: 'sent' },
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    select: { isoWeek: true, subject: true, preheader: true, sentAt: true, createdAt: true },
  });

  const branding = resolveArchiveBranding(topic);
  const t = getArchiveStrings(branding.language);
  const accentStyle = { '--accent': branding.accentHex } as CSSProperties;
  const showSubscribe = topic.consentMode === 'public' && topic.status === 'active';

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
          <p className={styles.eyebrow}>{t.eyebrow}</p>
          <h1 className={styles.title}>{topic.name}</h1>
          {showSubscribe && (
            <div className={styles.bandActions}>
              <Link className={styles.subscribe} href={`/s/${encodeURIComponent(topic.slug)}`}>
                {t.subscribeCta}
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className={styles.column}>
        {issues.length === 0 ? (
          <p className={styles.empty}>{t.empty}</p>
        ) : (
          <ul className={styles.list}>
            {issues.map((issue) => (
              <li key={issue.isoWeek}>
                <Link
                  className={styles.entry}
                  href={`/archive/${encodeURIComponent(topic.slug)}/${encodeURIComponent(issue.isoWeek)}`}
                >
                  <div className={styles.entryMeta}>
                    <span className={styles.week}>{issue.isoWeek}</span>
                    <span className={styles.date}>
                      {formatIssueDate(issue.sentAt ?? issue.createdAt, branding.locale)}
                    </span>
                  </div>
                  <h2 className={styles.entryTitle}>{issue.subject}</h2>
                  {issue.preheader && <p className={styles.preheader}>{issue.preheader}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>{branding.footerText}</p>
          <p>
            <a
              className={styles.feedLink}
              href={`/archive/${encodeURIComponent(topic.slug)}/rss.xml`}
            >
              RSS
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
