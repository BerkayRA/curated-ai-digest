import Link from 'next/link';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import styles from './shell.module.css';

interface FooterChip {
  href: string;
  label: string;
}

const QUICK_LINKS: FooterChip[] = [
  { href: '/issues', label: '→ Sayı arşivi' },
  { href: '/subscribers', label: '→ Aboneler' },
  { href: '/settings', label: '→ Ayarlar' },
];

const NEW_LINKS: FooterChip[] = [{ href: '/issues/new', label: '⬇ Yeni sayı oluştur' }];

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Footer band on --color-surface-20 with gray Buka dots, chip links, and the
 * Mega attribution — mirrors the hero on the muted surface. Tokens only, so the
 * dark navy variant comes for free.
 */
export function ShellFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerLead}>
          <h2 className={styles.footerHeading}>Mega Bülten</h2>
          <p className={styles.footerText}>
            Mega Bilgisayar Tic. Ltd. Şti&apos;nin haftalık yapay zeka digesti. &ldquo;On-Prem AI
            Adoption Radar&rdquo; ile aynı tasarım sistemini paylaşır.
          </p>
        </div>

        <div className={styles.footerCol}>
          <EyebrowLabel as="span" className={styles.footerColTitle}>
            Hızlı erişim
          </EyebrowLabel>
          <div className={styles.footerChips}>
            {QUICK_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className={styles.footerChip}>
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className={styles.footerCol}>
          <EyebrowLabel as="span" className={styles.footerColTitle}>
            Yeni içerik
          </EyebrowLabel>
          <div className={styles.footerChips}>
            {NEW_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className={styles.footerChip}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.footerBase}>
        <div className={styles.footerBaseInner}>
          <span>© {CURRENT_YEAR} Mega Bilgisayar Tic. Ltd. Şti</span>
          <span className={styles.footerVersion}>radar sistemi ile eşlenik</span>
        </div>
      </div>
    </footer>
  );
}
