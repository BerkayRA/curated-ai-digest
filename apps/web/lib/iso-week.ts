/**
 * ISO week helpers.
 *
 * Mirrors the algorithm used by the curation pipeline orchestrator
 * (`packages/curation/src/pipeline/orchestrator.ts`) so the web app and the
 * pipeline agree on what "this week" / "next week" means.
 */

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;

/** Returns the ISO week string for a given date, e.g. "2026-W24". */
function isoWeekOf(date: Date): string {
  // Work in UTC and normalise to the Thursday of the target week — the ISO-8601
  // rule that anchors the week to its year.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || DAYS_PER_WEEK; // treat Sunday (0) as 7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / DAYS_PER_WEEK);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns the ISO week string for the week *after* `from`, e.g. "2026-W25".
 *
 * Defaults to the current date so the New Issue form can pre-fill the next
 * upcoming week. The 7-day offset is computed before the ISO-week reduction so
 * year boundaries (W52 → W01) fall out naturally.
 */
export function nextIsoWeek(from: Date = new Date()): string {
  const next = new Date(from.getTime() + DAYS_PER_WEEK * MS_PER_DAY);
  return isoWeekOf(next);
}
