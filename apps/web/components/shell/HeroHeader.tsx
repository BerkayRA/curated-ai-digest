import Image from 'next/image';
import { auth, signOut } from '@/auth';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { HeroNav } from './HeroNav';
import styles from './shell.module.css';

async function HeroSignOut(): Promise<React.ReactElement> {
  async function handleSignOut(): Promise<void> {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <form action={handleSignOut}>
      <button type="submit" className={styles.signOutButton} aria-label="Çıkış yap">
        Çıkış
      </button>
    </form>
  );
}

/**
 * Process-Blue hero header band — the shell's primary chrome (replaces the old
 * sidebar). Carries the white Buka dot-pattern overlay, the white chameleon
 * logo, the title + tagline, the horizontal nav, and the signed-in user with a
 * sign-out action. All colors are tokens, so dark mode is automatic.
 */
export async function HeroHeader(): Promise<React.ReactElement> {
  const session = await auth();
  const user = session?.user;
  const displayName = user?.name ?? user?.email ?? '';

  return (
    <header className={styles.hero} aria-labelledby="hero-heading">
      <div className={styles.heroInner}>
        <div className={styles.heroTopRow}>
          <Image
            className={styles.heroLogo}
            src="/brand/mega-logo-white.svg"
            width={136}
            height={44}
            alt="Mega Bülten"
            priority
          />
          <div className={styles.heroAccount}>
            {user && (
              <>
                <span className={styles.userName} title={displayName}>
                  {displayName}
                </span>
                <HeroSignOut />
              </>
            )}
          </div>
        </div>

        <div className={styles.heroBody}>
          <div className={styles.heroText}>
            <EyebrowLabel as="span" className={styles.heroEyebrow}>
              Yönetim Paneli
            </EyebrowLabel>
            <h1 id="hero-heading" className={styles.heroTitle}>
              Mega Bülten
            </h1>
            <p className={styles.heroTagline}>
              Yapay zeka dünyasından haftalık, özenle seçilmiş haberler.
            </p>
          </div>
          <HeroNav />
        </div>
      </div>
    </header>
  );
}
