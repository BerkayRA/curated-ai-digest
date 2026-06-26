'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import styles from './shell.module.css';

interface NavItem {
  href: string;
  label: string;
}

/** Minimal active-topic shape the switcher needs from the server. */
export interface NavTopic {
  slug: string;
  name: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/issues', label: 'Arşiv' },
  { href: '/analytics', label: 'Analitik' },
  { href: '/subscribers', label: 'Aboneler' },
  { href: '/topics', label: 'Konular' },
  { href: '/sponsors', label: 'Sponsorlar' },
  { href: '/sources', label: 'Kaynaklar' },
  { href: '/settings', label: 'Ayarlar' },
];

/** Preferred default topic slug when no `?topic=` is present (seed topic). */
const DEFAULT_TOPIC_SLUG = 'enterprise-ai';

interface HeroNavProps {
  /** Active topics for the topic switcher. */
  topics?: NavTopic[];
}

/**
 * Horizontal hero navigation — replaces the former left Sidebar. Active item is
 * derived from the current path (client-side) and rendered blue/underlined.
 *
 * The topic switcher lists active topics and reflects/updates the `?topic=`
 * query param while preserving all other params.
 */
export function HeroNav({ topics = [] }: HeroNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Current topic: ?topic= → seed slug → first active topic.
  const currentTopic =
    searchParams.get('topic') ??
    (topics.some((t) => t.slug === DEFAULT_TOPIC_SLUG)
      ? DEFAULT_TOPIC_SLUG
      : (topics[0]?.slug ?? ''));

  const handleTopicChange = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('topic', slug);
    router.push(`${pathname}?${params.toString()}`);
  };

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

      {topics.length > 0 && (
        <select
          className={styles.topicSwitcher}
          value={currentTopic}
          aria-label="Etkin konu seç"
          onChange={(e) => handleTopicChange(e.target.value)}
        >
          {topics.map((topic) => (
            <option key={topic.slug} value={topic.slug}>
              {topic.name}
            </option>
          ))}
        </select>
      )}
    </nav>
  );
}
