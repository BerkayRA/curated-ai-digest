import type { HourlyOpenBucket } from '@digest/db';

// ---------------------------------------------------------------------------
// Pure send-time formatting helpers — kept free of React/CSS imports so they
// can be unit-tested in a node environment. The widget composes these.
// ---------------------------------------------------------------------------

/** Turkish day names indexed by JS/Postgres DOW (0 = Pazar … 6 = Cumartesi). */
export const DAY_NAMES_TR = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const;

const HOURS_IN_DAY = 24;
const TOP_WINDOWS = 3;

export interface SendWindowLabel {
  /** e.g. "Perşembe, 09:00–10:00 (UTC)". */
  window: string;
  openCount: number;
}

/** Zero-pad an hour to "HH". */
function pad2(hour: number): string {
  return String(hour).padStart(2, '0');
}

/**
 * Format a single bucket into a Turkish "Gün, HH:00–HH+1:00 (UTC)" label.
 * Pure — unit-tested in isolation from React.
 */
export function formatSendWindow(bucket: HourlyOpenBucket): SendWindowLabel {
  const day = DAY_NAMES_TR[bucket.dayOfWeek] ?? '—';
  const start = pad2(bucket.hourOfDay);
  const end = pad2((bucket.hourOfDay + 1) % HOURS_IN_DAY);
  return {
    window: `${day}, ${start}:00–${end}:00 (UTC)`,
    openCount: bucket.openCount,
  };
}

/**
 * Reduce buckets to the recommendation (top window) plus up to two runners-up.
 * Returns null when there is no data so callers render the muted hint.
 */
export function buildSendTimeRecommendation(
  buckets: HourlyOpenBucket[],
): { top: SendWindowLabel; runnersUp: SendWindowLabel[] } | null {
  const [first, ...rest] = buckets;
  if (first === undefined) return null;
  return {
    top: formatSendWindow(first),
    runnersUp: rest.slice(0, TOP_WINDOWS - 1).map(formatSendWindow),
  };
}
