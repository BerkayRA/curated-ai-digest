/**
 * Public signup landing — /s/[slug]
 *
 * Standalone branded page (NOT the dashboard shell). Renders only for topics
 * with consentMode 'public' and status 'active'; everything else is a 404 so
 * business-only and paused topics stay unlisted. The actual submission is a
 * small client form that double-opt-in subscribes via /api/public/subscribe.
 */

import Image from 'next/image';
import { notFound } from 'next/navigation';
import { prisma, createTopicRepository } from '@digest/db';
import { SignupForm } from './SignupForm';
import styles from './signup.module.css';

export const dynamic = 'force-dynamic';

interface SignupPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SignupPage(props: SignupPageProps) {
  const params = await props.params;
  const topic = await createTopicRepository(prisma).findBySlug(params.slug);

  if (!topic || topic.consentMode !== 'public' || topic.status !== 'active') {
    notFound();
  }

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
          <p className={styles.eyebrow}>ABONE OL</p>
          <h1 className={styles.heading}>{topic.name}</h1>
          <p className={styles.subheading}>
            Haftalık seçkiler doğrudan gelen kutunuza.
          </p>

          <SignupForm topicSlug={params.slug} topicName={topic.name} />

          <p className={styles.kvkk}>
            E-posta adresiniz yalnızca bu listeye abonelik için kullanılır. KVKK
            kapsamında dilediğiniz zaman çıkabilirsiniz.
          </p>
        </div>

        <footer className={styles.cardFooter}>
          <span>Mega Bilgisayar Tic. Ltd. Şti</span>
        </footer>
      </article>
    </main>
  );
}
