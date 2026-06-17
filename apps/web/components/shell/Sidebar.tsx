'use client';

import Image from 'next/image';
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
        <Image
          src="/brand/mega-wordmark-white.png"
          width={168}
          height={61}
          alt="Mega Bilişim Teknolojileri"
          priority
        />
        <span className={styles.brandSub}>Bülten</span>
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
          <span
            className={styles.bukaParticle}
            style={
              { '--x': '10%', '--y': '20%', '--c': 'var(--color-accent-teal)' } as React.CSSProperties
            }
          />
          <span
            className={styles.bukaParticle}
            style={
              { '--x': '40%', '--y': '60%', '--c': 'var(--color-accent-orange)' } as React.CSSProperties
            }
          />
          <span
            className={styles.bukaParticle}
            style={
              { '--x': '70%', '--y': '30%', '--c': 'var(--color-accent-magenta)' } as React.CSSProperties
            }
          />
          <span
            className={styles.bukaParticle}
            style={
              { '--x': '20%', '--y': '80%', '--c': 'var(--color-brand)' } as React.CSSProperties
            }
          />
          <span
            className={styles.bukaParticle}
            style={
              { '--x': '60%', '--y': '10%', '--c': 'var(--color-accent-teal)' } as React.CSSProperties
            }
          />
          <span
            className={styles.bukaParticle}
            style={
              { '--x': '85%', '--y': '70%', '--c': 'var(--color-accent-orange)' } as React.CSSProperties
            }
          />
        </div>
      </div>
    </aside>
  );
}
