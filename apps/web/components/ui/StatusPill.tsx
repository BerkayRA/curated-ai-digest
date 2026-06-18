import type { IssueStatus, SubscriberStatus } from '@mega-bulten/db';
import styles from './StatusPill.module.css';

/**
 * Ring decisions from the shared Mega/radar design language:
 *   adopt = Process Blue · pilot = deeper blue · watch = amber · avoid = red.
 * Each maps to the --ring-* token triplet (tint bg / colored border / solid text).
 */
export type RingTone = 'adopt' | 'pilot' | 'watch' | 'avoid';

interface StatusPillProps {
  /** Ring tone — drives the pill colors via --ring-* tokens. */
  tone: RingTone;
  label: string;
  className?: string;
}

/**
 * StatusPill — the ring-pill recipe (999px, uppercase, leading status dot,
 * ~12% tint bg + ~30% border + solid darker text) built entirely on the
 * shared --ring-* custom properties so light/dark theming is automatic.
 *
 * Use `issueStatusTone` to map an IssueStatus onto a ring tone; keep the
 * existing Turkish labels as the visible text.
 */
export function StatusPill({ tone, label, className = '' }: StatusPillProps) {
  return (
    <span className={`${styles.pill} ${styles[tone]} ${className}`} aria-label={label}>
      {label}
    </span>
  );
}

/**
 * Maps an issue status onto a ring tone:
 *   draft → watch · in_review → pilot · approved/scheduled/sent → adopt ·
 *   cancelled/failed → avoid.
 */
export function issueStatusTone(status: IssueStatus): RingTone {
  switch (status) {
    case 'draft':
      return 'watch';
    case 'in_review':
      return 'pilot';
    case 'approved':
    case 'scheduled':
    case 'sent':
      return 'adopt';
    case 'cancelled':
    case 'failed':
      return 'avoid';
    default:
      return 'watch';
  }
}

/**
 * Maps a subscriber status onto a ring tone:
 *   active → adopt · unsubscribed → avoid · bounced → watch.
 */
export function subscriberStatusTone(status: SubscriberStatus): RingTone {
  switch (status) {
    case 'active':
      return 'adopt';
    case 'unsubscribed':
      return 'avoid';
    case 'bounced':
      return 'watch';
    default:
      return 'watch';
  }
}
