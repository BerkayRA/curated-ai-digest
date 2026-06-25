/**
 * Preference center — /preferences/[token]
 *
 * Keyed by the GLOBAL Subscriber.unsubscribeToken. Lists every topic the
 * subscriber has a membership for, with a per-topic toggle plus a global
 * "leave all" action. An unknown token renders a neutral invalid-link page.
 */

import Image from 'next/image';
import { headers } from 'next/headers';
import { prisma, createSubscriberTopicRepository } from '@digest/db';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { PreferencesClient, type PreferenceTopic } from './PreferencesClient';
import styles from './preferences.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tercih Merkezi — Curated AI Digest',
};

interface PreferencesPageProps {
  params: { token: string };
}

/** Neutral standalone shell (invalid link, rate limit) — no subscriber data. */
function NoticeShell({
  heading = 'Bağlantı geçersiz',
  subheading = 'Bu bağlantı geçersiz.',
}: {
  heading?: string;
  subheading?: string;
}) {
  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <span className={styles.dots} aria-hidden="true" />
          <Image
            className={styles.logo}
            src="/brand/mega-logo-white.png"
            width={200}
            height={65}
            alt="Mega Bilgisayar Tic. Ltd. Şti"
            priority
          />
        </header>
        <div className={styles.cardBody}>
          <h1 className={styles.heading}>{heading}</h1>
          <p className={styles.subheading}>{subheading}</p>
        </div>
        <footer className={styles.cardFooter}>
          <span>Mega Bilgisayar Tic. Ltd. Şti</span>
        </footer>
      </article>
    </main>
  );
}

export default async function PreferencesPage({ params }: PreferencesPageProps) {
  const ip = getClientIp(headers() as unknown as Headers);
  const rate = checkRateLimit(ip, 'prefs-get', 30, 60_000);
  if (!rate.allowed) {
    return (
      <NoticeShell
        heading="Çok fazla istek"
        subheading="Çok fazla istek. Lütfen biraz sonra tekrar deneyin."
      />
    );
  }

  const subscriber = await prisma.subscriber.findUnique({
    where: { unsubscribeToken: params.token },
    select: { id: true, email: true, displayName: true },
  });

  if (!subscriber) {
    return <NoticeShell />;
  }

  const memberships = await createSubscriberTopicRepository(prisma).findBySubscriberId(
    subscriber.id,
  );

  const topicIds = memberships.map((m) => m.topicId);
  const topics = await prisma.topic.findMany({
    where: { id: { in: topicIds } },
    select: { id: true, name: true, slug: true, consentMode: true, status: true },
  });
  const topicById = new Map(topics.map((t) => [t.id, t]));

  // Surface only memberships whose topic still exists, sorted by name for a
  // stable, readable list.
  const items: PreferenceTopic[] = memberships
    .flatMap((m) => {
      const topic = topicById.get(m.topicId);
      if (!topic) return [];
      return [
        {
          topicId: m.topicId,
          topicName: topic.name,
          consentMode: topic.consentMode,
          status: m.status,
        },
      ];
    })
    .sort((a, b) => a.topicName.localeCompare(b.topicName, 'tr'));

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <span className={styles.dots} aria-hidden="true" />
          <Image
            className={styles.logo}
            src="/brand/mega-logo-white.png"
            width={200}
            height={65}
            alt="Mega Bilgisayar Tic. Ltd. Şti"
            priority
          />
        </header>

        <div className={styles.cardBody}>
          <p className={styles.eyebrow}>TERCİH MERKEZİ</p>
          <h1 className={styles.heading}>Abonelik tercihleriniz</h1>
          <p className={styles.subheading}>{subscriber.email}</p>

          <PreferencesClient subscriberToken={params.token} topics={items} />
        </div>

        <footer className={styles.cardFooter}>
          <span>Mega Bilgisayar Tic. Ltd. Şti</span>
        </footer>
      </article>
    </main>
  );
}
