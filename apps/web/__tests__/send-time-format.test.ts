/**
 * Send-time formatter tests — covers the pure bucket→label helpers that drive
 * the advisory SendTimeWidget. No DOM, no React, no DB.
 */

import { describe, it, expect } from 'vitest';
import {
  formatSendWindow,
  buildSendTimeRecommendation,
  DAY_NAMES_TR,
} from '../components/analytics/send-time-format';

describe('formatSendWindow', () => {
  it('formats a bucket as "Gün, HH:00–HH+1:00 (UTC)"', () => {
    expect(formatSendWindow({ dayOfWeek: 4, hourOfDay: 9, openCount: 234 })).toEqual({
      window: 'Perşembe, 09:00–10:00 (UTC)',
      openCount: 234,
    });
  });

  it('zero-pads single-digit hours', () => {
    expect(formatSendWindow({ dayOfWeek: 1, hourOfDay: 8, openCount: 5 }).window).toBe(
      'Pazartesi, 08:00–09:00 (UTC)',
    );
  });

  it('wraps the end hour from 23:00 to 00:00', () => {
    expect(formatSendWindow({ dayOfWeek: 0, hourOfDay: 23, openCount: 9 }).window).toBe(
      'Pazar, 23:00–00:00 (UTC)',
    );
  });

  it('maps each DOW index to the correct Turkish day name', () => {
    expect(DAY_NAMES_TR[0]).toBe('Pazar');
    expect(DAY_NAMES_TR[6]).toBe('Cumartesi');
    const days = [0, 1, 2, 3, 4, 5, 6].map(
      (d) => formatSendWindow({ dayOfWeek: d, hourOfDay: 0, openCount: 1 }).window.split(',')[0],
    );
    expect(days).toEqual([
      'Pazar',
      'Pazartesi',
      'Salı',
      'Çarşamba',
      'Perşembe',
      'Cuma',
      'Cumartesi',
    ]);
  });
});

describe('buildSendTimeRecommendation', () => {
  it('returns null for an empty (insufficient-data) bucket list', () => {
    expect(buildSendTimeRecommendation([])).toBeNull();
  });

  it('returns the top window with no runners-up when only one bucket exists', () => {
    const result = buildSendTimeRecommendation([
      { dayOfWeek: 4, hourOfDay: 9, openCount: 50 },
    ]);
    expect(result?.top.window).toBe('Perşembe, 09:00–10:00 (UTC)');
    expect(result?.runnersUp).toEqual([]);
  });

  it('caps the runners-up list at the top three windows', () => {
    const result = buildSendTimeRecommendation([
      { dayOfWeek: 4, hourOfDay: 9, openCount: 50 },
      { dayOfWeek: 2, hourOfDay: 14, openCount: 30 },
      { dayOfWeek: 1, hourOfDay: 8, openCount: 20 },
      { dayOfWeek: 5, hourOfDay: 16, openCount: 10 },
    ]);
    expect(result?.top.openCount).toBe(50);
    expect(result?.runnersUp).toHaveLength(2);
    expect(result?.runnersUp.map((r) => r.openCount)).toEqual([30, 20]);
  });
});
