import { auth, signOut } from '@/auth';
import styles from './shell.module.css';

async function TopbarSignOut(): Promise<React.ReactElement> {
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

export async function Topbar(): Promise<React.ReactElement> {
  const session = await auth();
  const user = session?.user;

  // Derive initials for the avatar (first character of name or email)
  const initials =
    user?.name?.charAt(0).toUpperCase() ??
    user?.email?.charAt(0).toUpperCase() ??
    'M';

  const displayName = user?.name ?? user?.email ?? '';

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarInner}>
        <div className={styles.topbarLeft}>
          <div className={styles.topbarAccentLine} aria-hidden="true" />
        </div>
        <div className={styles.topbarRight}>
          {user && (
            <>
              <div className={styles.userBadge} aria-label={`Oturum açık: ${displayName}`}>
                <span className={styles.userAvatar} aria-hidden="true">
                  {initials}
                </span>
                <span className={styles.userName}>{displayName}</span>
              </div>
              <TopbarSignOut />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
