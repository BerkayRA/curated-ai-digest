/**
 * Public unsubscribe page — /unsubscribe?token=...
 * Unauthenticated. Looks up subscriber by unsubscribeToken, sets status to
 * 'unsubscribed', and renders a branded confirmation.
 */

import { prisma } from '@mega-bulten/db';
import styles from './unsubscribe.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Abonelik İptal — Mega Bülten',
};

interface UnsubscribePageProps {
  searchParams: { token?: string };
}

async function processUnsubscribe(token: string): Promise<'ok' | 'already' | 'invalid'> {
  const subscriber = await prisma.subscriber.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, status: true },
  });

  if (!subscriber) return 'invalid';
  if (subscriber.status === 'unsubscribed') return 'already';

  await prisma.subscriber.update({
    where: { id: subscriber.id },
    data: { status: 'unsubscribed' },
  });

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: 'subscriber.unsubscribed',
      entity: 'Subscriber',
      entityId: subscriber.id,
      meta: { method: 'unsubscribe_link' },
    },
  });

  return 'ok';
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const { token } = searchParams;

  if (!token) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoMark} aria-hidden="true">
            <span className={styles.logoText}>MB</span>
          </div>
          <h1 className={styles.heading}>Geçersiz Bağlantı</h1>
          <p className={styles.body}>
            Bu abonelik iptal bağlantısı geçersiz. Lütfen e-postanızdaki bağlantıyı kullanın.
          </p>
        </div>
      </main>
    );
  }

  const result = await processUnsubscribe(token);

  const content = {
    ok: {
      heading: 'Aboneliğiniz İptal Edildi',
      body: 'Mega Bülten listesinden başarıyla çıkarıldınız. Bir daha bülten almayacaksınız.',
    },
    already: {
      heading: 'Zaten Abonelik İptal',
      body: 'Bu adres zaten listeden çıkarılmış.',
    },
    invalid: {
      heading: 'Bağlantı Bulunamadı',
      body: 'Bu abonelik iptal bağlantısı tanınmadı. Bağlantının doğru olduğundan emin olun.',
    },
  }[result];

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoMark} aria-hidden="true">
          <span className={styles.logoText}>MB</span>
          {result === 'ok' && <span className={styles.checkmark} aria-hidden="true">✓</span>}
        </div>
        <h1 className={styles.heading}>{content.heading}</h1>
        <p className={styles.body}>{content.body}</p>
        {result === 'ok' && (
          <p className={styles.footer}>
            Tekrar abone olmak isterseniz{' '}
            <a href="mailto:bulten@mega.com.tr" className={styles.link}>
              bizimle iletişime geçin
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}
