/**
 * Archive rate-limit helper tests. Fake timers drive the fixed window; distinct
 * IPs per test keep the shared in-process limiter buckets isolated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkArchiveRateLimit,
  isArchivePath,
  ARCHIVE_RATE_LIMIT,
  ARCHIVE_RATE_WINDOW_MS,
} from '../lib/public-rate-limit';

function headersFor(ip: string): Headers {
  return new Headers({ 'x-forwarded-for': ip });
}

describe('isArchivePath', () => {
  it('matches the archive index, issues, and rss feed', () => {
    expect(isArchivePath('/archive')).toBe(true);
    expect(isArchivePath('/archive/enterprise-ai')).toBe(true);
    expect(isArchivePath('/archive/enterprise-ai/2026-W24')).toBe(true);
    expect(isArchivePath('/archive/enterprise-ai/rss.xml')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(isArchivePath('/')).toBe(false);
    expect(isArchivePath('/archived')).toBe(false); // must be exact or /archive/
    expect(isArchivePath('/api/topics')).toBe(false);
  });

  it('is case-sensitive (Next.js normalises path case upstream)', () => {
    // Documents the assumption: the matcher is lowercase-only; Next lowercases
    // incoming pathnames before middleware runs, so this is not a real gap.
    expect(isArchivePath('/Archive/foo')).toBe(false);
    expect(isArchivePath('/ARCHIVE')).toBe(false);
  });
});

describe('checkArchiveRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns null (allowed) for non-archive paths regardless of volume', () => {
    for (let i = 0; i < ARCHIVE_RATE_LIMIT + 5; i += 1) {
      expect(checkArchiveRateLimit('/api/topics', headersFor('10.0.0.1'))).toBeNull();
    }
  });

  it('allows up to the limit, then blocks with a Retry-After', () => {
    const h = headersFor('10.0.0.2');
    for (let i = 0; i < ARCHIVE_RATE_LIMIT; i += 1) {
      expect(checkArchiveRateLimit('/archive/enterprise-ai', h)).toBeNull();
    }
    const blocked = checkArchiveRateLimit('/archive/enterprise-ai', h);
    expect(blocked).not.toBeNull();
    expect(blocked!.retryAfterSec).toBeGreaterThan(0);
    expect(blocked!.retryAfterSec).toBeLessThanOrEqual(ARCHIVE_RATE_WINDOW_MS / 1000);
  });

  it('counts all archive sub-paths against one per-IP bucket', () => {
    const h = headersFor('10.0.0.3');
    // Mix of index, issue, and rss requests all consume the same bucket.
    for (let i = 0; i < ARCHIVE_RATE_LIMIT; i += 1) {
      const path =
        i % 3 === 0
          ? '/archive/enterprise-ai'
          : i % 3 === 1
            ? '/archive/enterprise-ai/2026-W24'
            : '/archive/enterprise-ai/rss.xml';
      expect(checkArchiveRateLimit(path, h)).toBeNull();
    }
    expect(checkArchiveRateLimit('/archive/edge-ai', h)).not.toBeNull();
  });

  it('isolates limits per IP', () => {
    const a = headersFor('10.0.0.4');
    const b = headersFor('10.0.0.5');
    for (let i = 0; i < ARCHIVE_RATE_LIMIT; i += 1) checkArchiveRateLimit('/archive', a);
    expect(checkArchiveRateLimit('/archive', a)).not.toBeNull(); // A blocked
    expect(checkArchiveRateLimit('/archive', b)).toBeNull(); // B unaffected
  });

  it('resets after the window elapses', () => {
    const h = headersFor('10.0.0.6');
    for (let i = 0; i < ARCHIVE_RATE_LIMIT; i += 1) checkArchiveRateLimit('/archive', h);
    expect(checkArchiveRateLimit('/archive', h)).not.toBeNull();
    vi.advanceTimersByTime(ARCHIVE_RATE_WINDOW_MS + 1);
    expect(checkArchiveRateLimit('/archive', h)).toBeNull();
  });
});
