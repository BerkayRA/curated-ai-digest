import { describe, it, expect } from 'vitest';
import { nextIsoWeek } from '../lib/iso-week';

// ---------------------------------------------------------------------------
// nextIsoWeek — returns the ISO week (YYYY-Www) of the week after `from`.
// ---------------------------------------------------------------------------

describe('nextIsoWeek', () => {
  it('returns the YYYY-Www format', () => {
    expect(nextIsoWeek(new Date('2026-06-18T00:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('advances to the following week within a month', () => {
    // 2026-06-18 is ISO week 2026-W25 → next week is W26.
    expect(nextIsoWeek(new Date('2026-06-18T12:00:00Z'))).toBe('2026-W26');
  });

  it('is stable across times within the same day', () => {
    const morning = nextIsoWeek(new Date('2026-06-18T01:00:00Z'));
    const evening = nextIsoWeek(new Date('2026-06-18T23:00:00Z'));
    expect(morning).toBe(evening);
  });

  it('crosses the year boundary (last week of 2025 → first week of 2026)', () => {
    // 2025-12-29 is ISO week 2026-W01; the week before it is 2025-W52.
    // Picking a date in 2025-W52 should yield 2026-W01 as next.
    expect(nextIsoWeek(new Date('2025-12-25T00:00:00Z'))).toBe('2026-W01');
  });

  it('pads single-digit week numbers to two digits', () => {
    // Early January → low week numbers must be zero-padded.
    const result = nextIsoWeek(new Date('2026-01-05T00:00:00Z'));
    expect(result).toMatch(/^\d{4}-W0\d$/);
  });

  it('defaults to the current date when no argument is given', () => {
    expect(nextIsoWeek()).toMatch(/^\d{4}-W\d{2}$/);
  });
});
