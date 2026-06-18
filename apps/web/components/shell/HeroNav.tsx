'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './shell.module.css';

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/issues', label: 'Arşiv' },
  { href: '/subscribers', label: 'Aboneler' },
  { href: '/settings', label: 'Ayarlar' },
];

/**
 * Horizontal hero navigation — replaces the former left Sidebar. Active item is
 * derived from the current path (client-side) and rendered blue/underlined.
 */
export function HeroNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.heroNav} aria-label="Ana gezinme">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.heroNavLink} ${isActive ? styles.heroNavLinkActive : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
