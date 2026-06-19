import { HeroHeader } from './HeroHeader';
import { ShellFooter } from './ShellFooter';
import styles from './shell.module.css';

interface AdminShellProps {
  children: React.ReactNode;
}

/**
 * Hero-led admin shell (no sidebar) — follows the Mega design language so
 * the two products read as one system: a Process-Blue hero band with the
 * horizontal nav up top, a centered editorial column, and a Cool-Gray footer.
 */
export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className={styles.shell}>
      <HeroHeader />
      <main className={styles.main}>{children}</main>
      <ShellFooter />
    </div>
  );
}
