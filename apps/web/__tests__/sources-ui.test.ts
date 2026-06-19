/**
 * Sources UI logic tests — covers pure functions that the client components
 * delegate to, so they can be exercised without a DOM or React renderer.
 *
 * Tested:
 *   formatRelativeTime  — relative timestamps shown in health lines
 *   formatHealthLine    — full health line copy
 *   sourceBadge         — type → { emoji, label } mapping
 *   typeFieldsVisible   — type-driven field visibility rules
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers under test — imported from the lib module we will create
// ---------------------------------------------------------------------------
import {
  formatRelativeTime,
  formatHealthLine,
  sourceBadge,
  typeFieldsVisible,
} from '../components/sources/sources-utils';

// ===========================================================================
// formatRelativeTime
// ===========================================================================

describe('formatRelativeTime', () => {
  it('returns "henüz taranmadı" when date is null', () => {
    expect(formatRelativeTime(null)).toBe('henüz taranmadı');
  });

  it('returns seconds label for very recent dates', () => {
    const recent = new Date(Date.now() - 30_000); // 30s ago
    expect(formatRelativeTime(recent)).toMatch(/sn önce/);
  });

  it('returns minutes label for dates a few minutes ago', () => {
    const fiveMins = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(fiveMins)).toMatch(/dk önce/);
  });

  it('returns hours label for dates several hours ago', () => {
    const twoHours = new Date(Date.now() - 2 * 3_600_000);
    expect(formatRelativeTime(twoHours)).toMatch(/sa önce/);
  });

  it('returns days label for dates more than a day ago', () => {
    const threeDays = new Date(Date.now() - 3 * 86_400_000);
    expect(formatRelativeTime(threeDays)).toMatch(/gün önce/);
  });

  it('accepts a Date string and still works', () => {
    const dateStr = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatRelativeTime(dateStr)).toMatch(/dk önce/);
  });
});

// ===========================================================================
// formatHealthLine
// ===========================================================================

describe('formatHealthLine', () => {
  it('returns "henüz taranmadı" when lastRunAt is null', () => {
    expect(formatHealthLine(null, null, 0, null)).toBe('henüz taranmadı');
  });

  it('includes candidate count and relative time when ok', () => {
    const recent = new Date(Date.now() - 2 * 60_000); // 2 minutes ago
    const line = formatHealthLine(recent, 'ok', 24, null);
    expect(line).toContain('24 aday');
    expect(line).toMatch(/dk önce/);
  });

  it('includes lastError in the health line when status is error', () => {
    const recent = new Date(Date.now() - 3 * 3_600_000);
    const line = formatHealthLine(recent, 'error', 0, 'zaman aşımı');
    expect(line).toContain('0 aday');
    expect(line).toContain('zaman aşımı');
  });

  it('handles zero count correctly', () => {
    const recent = new Date(Date.now() - 60_000);
    const line = formatHealthLine(recent, 'ok', 0, null);
    expect(line).toContain('0 aday');
  });
});

// ===========================================================================
// sourceBadge
// ===========================================================================

describe('sourceBadge', () => {
  it('returns RSS badge for rss type', () => {
    const badge = sourceBadge('rss');
    expect(badge.emoji).toBe('📡');
    expect(badge.label).toBe('RSS');
  });

  it('returns Radar badge for radar type', () => {
    const badge = sourceBadge('radar');
    expect(badge.emoji).toBe('🛰');
    expect(badge.label).toBe('Radar');
  });

  it('returns Exa badge for exa type', () => {
    const badge = sourceBadge('exa');
    expect(badge.emoji).toBe('🔎');
    expect(badge.label).toBe('Exa');
  });
});

// ===========================================================================
// typeFieldsVisible — drives add/edit panel field visibility
// ===========================================================================

describe('typeFieldsVisible', () => {
  it('shows URL field and hides radar/exa fields for rss', () => {
    const vis = typeFieldsVisible('rss');
    expect(vis.showUrl).toBe(true);
    expect(vis.showRadar).toBe(false);
    expect(vis.showExa).toBe(false);
  });

  it('shows URL and radar fields, hides exa for radar', () => {
    const vis = typeFieldsVisible('radar');
    expect(vis.showUrl).toBe(true);
    expect(vis.showRadar).toBe(true);
    expect(vis.showExa).toBe(false);
  });

  it('hides URL and radar fields, shows exa for exa', () => {
    const vis = typeFieldsVisible('exa');
    expect(vis.showUrl).toBe(false);
    expect(vis.showRadar).toBe(false);
    expect(vis.showExa).toBe(true);
  });
});
