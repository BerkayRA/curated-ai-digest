import styles from './shell.module.css';

export function Topbar() {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarInner}>
        <div className={styles.topbarLeft}>
          <div className={styles.topbarAccentLine} aria-hidden="true" />
        </div>
        <div className={styles.topbarRight}>
          {/* TODO(phase-11): Render signed-in user avatar + logout */}
          <div className={styles.userBadge} aria-label="Kullanıcı">
            <span className={styles.userAvatar} aria-hidden="true">M</span>
          </div>
        </div>
      </div>
    </header>
  );
}
