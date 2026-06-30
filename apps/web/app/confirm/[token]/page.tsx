/**
 * Double opt-in confirmation — /confirm/[token]
 *
 * Standalone branded page. confirmMembership flips a `pending` membership to
 * `active` (idempotent: a replayed link returns null). We never distinguish
 * "expired" from "already used" — both render the same neutral notice so the
 * page leaks nothing about token validity.
 */

import Image from 'next/image';
import { headers } from 'next/headers';
import { prisma, createSubscriberTopicRepository } from '@digest/db';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import styles from './confirm.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Abonelik Onayı — Curated AI Digest',
};

interface ConfirmPageProps {
  params: Promise<{ token: string }>;
}

/** Branded standalone shell wrapping a heading + body line. */
function Shell({ heading, body }: { heading: string; body: string }) {
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
          <p className={styles.body}>{body}</p>
        </div>
        <footer className={styles.cardFooter}>
          <span>Mega Bilgisayar Tic. Ltd. Şti</span>
        </footer>
      </article>
    </main>
  );
}

export default async function ConfirmPage(props: ConfirmPageProps) {
  const params = await props.params;
  const ip = getClientIp(await headers() as unknown as Headers);
  const rate = checkRateLimit(ip, 'confirm-get', 30, 60_000);
  if (!rate.allowed) {
    return <Shell heading="Çok fazla istek" body="Çok fazla istek. Lütfen biraz sonra tekrar deneyin." />;
  }

  const membership = await createSubscriberTopicRepository(prisma).confirmMembership(
    params.token,
  );

  // Build a preference-center link from the subscriber's global token when the
  // confirm succeeds — best-effort; omitted if the lookup turns up nothing.
  let preferencesHref: string | null = null;
  if (membership) {
    const subscriber = await prisma.subscriber.findUnique({
      where: { id: membership.subscriberId },
      select: { unsubscribeToken: true },
    });
    if (subscriber) {
      preferencesHref = `/preferences/${subscriber.unsubscribeToken}`;
    }
  }

  const success = membership !== null;

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
          {success ? (
            <>
              <span className={styles.successMark} aria-hidden="true">
                ✓
              </span>
              <h1 className={styles.heading}>Aboneliğiniz onaylandı</h1>
              <p className={styles.body}>
                Artık seçkileri gelen kutunuzda alacaksınız. Teşekkürler!
              </p>
              {preferencesHref && (
                <p className={styles.footerLine}>
                  Tercihlerinizi{' '}
                  <a href={preferencesHref} className={styles.link}>
                    tercih merkezinden
                  </a>{' '}
                  düzenleyebilirsiniz.
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className={styles.heading}>Bağlantı geçersiz</h1>
              <p className={styles.body}>
                Bu bağlantı geçersiz veya daha önce kullanılmış.
              </p>
            </>
          )}
        </div>

        <footer className={styles.cardFooter}>
          <span>Mega Bilgisayar Tic. Ltd. Şti</span>
        </footer>
      </article>
    </main>
  );
}
