'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './shell.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/issues', label: 'Arşiv', icon: '📰' },
  { href: '/subscribers', label: 'Aboneler', icon: '👥' },
  { href: '/settings', label: 'Ayarlar', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar} aria-label="Ana menü">
      <div className={styles.sidebarBrand}>
        <div className={styles.logoMark} aria-hidden="true">
          <span className={styles.logoText}>MB</span>
          <div className={styles.dotAccent} aria-hidden="true" />
        </div>
        <div className={styles.brandLabel}>
          <span className={styles.brandName}>Mega</span>
          <span className={styles.brandSub}>Bülten</span>
        </div>
      </div>

      <nav aria-label="Sayfa gezgini">
        <ul className={styles.navList} role="list">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    {icon}
                  </span>
                  <span className={styles.navLabel}>{label}</span>
                  {isActive && <span className={styles.navActiveDot} aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.bukaMotif} aria-hidden="true">
          <span className={styles.bukaParticle} style={{ '--x': '10%', '--y': '20%', '--c': 'var(--color-accent-teal)' } as React.CSSProperties} />
          <span className={styles.bukaParticle} style={{ '--x': '40%', '--y': '60%', '--c': 'var(--color-accent-orange)' } as React.CSSProperties} />
          <span className={styles.bukaParticle} style={{ '--x': '70%', '--y': '30%', '--c': 'var(--color-accent-magenta)' } as React.CSSProperties} />
          <span className={styles.bukaParticle} style={{ '--x': '20%', '--y': '80%', '--c': 'var(--color-brand)' } as React.CSSProperties} />
          <span className={styles.bukaParticle} style={{ '--x': '60%', '--y': '10%', '--c': 'var(--color-accent-teal)' } as React.CSSProperties} />
          <span className={styles.bukaParticle} style={{ '--x': '85%', '--y': '70%', '--c': 'var(--color-accent-orange)' } as React.CSSProperties} />
        </div>
      </div>
    </aside>
  );
}
