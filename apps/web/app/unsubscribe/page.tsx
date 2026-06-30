/**
 * Public unsubscribe page — /unsubscribe?token=...
 * Unauthenticated. Looks up subscriber by unsubscribeToken, sets status to
 * 'unsubscribed', and renders a branded confirmation.
 */

import { prisma, createSubscriberTopicRepository } from '@digest/db';
import styles from './unsubscribe.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Abonelik İptal — Curated AI Digest',
};

interface UnsubscribePageProps {
  searchParams: Promise<{ token?: string }>;
}

type UnsubscribeResult = 'ok' | 'topic' | 'already' | 'invalid';

async function processUnsubscribe(token: string): Promise<UnsubscribeResult> {
  const subscriber = await prisma.subscriber.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, status: true },
  });

  if (subscriber) {
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

  // Fall back to a per-topic membership token.
  const membershipRepo = createSubscriberTopicRepository(prisma);
  const membership = await membershipRepo.findByUnsubscribeToken(token);

  if (!membership) return 'invalid';
  if (membership.status === 'unsubscribed') return 'already';

  await membershipRepo.setStatus(membership.subscriberId, membership.topicId, 'unsubscribed');

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: 'subscriberTopic.unsubscribed',
      entity: 'SubscriberTopic',
      entityId: membership.id,
      meta: { method: 'unsubscribe_link', topicId: membership.topicId },
    },
  });

  return 'topic';
}

export default async function UnsubscribePage(props: UnsubscribePageProps) {
  const searchParams = await props.searchParams;
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
      body: 'Curated AI Digest listesinden başarıyla çıkarıldınız. Bir daha digest almayacaksınız.',
    },
    topic: {
      heading: 'Bu Konudan Çıkarıldınız',
      body: 'Bu konudan aboneliğiniz iptal edildi. Diğer konulardan içerik almaya devam edeceksiniz.',
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
          {(result === 'ok' || result === 'topic') && (
            <span className={styles.checkmark} aria-hidden="true">✓</span>
          )}
        </div>
        <h1 className={styles.heading}>{content.heading}</h1>
        <p className={styles.body}>{content.body}</p>
        {(result === 'ok' || result === 'topic') && (
          <p className={styles.footer}>
            Tekrar abone olmak isterseniz{' '}
            <a href="mailto:digest@mega.com.tr" className={styles.link}>
              bizimle iletişime geçin
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}
