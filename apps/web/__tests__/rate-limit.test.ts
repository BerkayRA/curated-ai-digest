/**
 * In-process rate limiter tests. Uses fake timers to drive the fixed window
 * deterministically — no real clock, no DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, getClientIp } from '../lib/rate-limit';

const LIMIT = 3;
const WINDOW_MS = 10_000;

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('allows the first N requests within the window', () => {
    for (let i = 0; i < LIMIT; i += 1) {
      expect(checkRateLimit('1.1.1.1', 'a', LIMIT, WINDOW_MS).allowed).toBe(true);
    }
  });

  it('blocks request N+1 and reports retryAfterMs', () => {
    for (let i = 0; i < LIMIT; i += 1) checkRateLimit('2.2.2.2', 'a', LIMIT, WINDOW_MS);
    const blocked = checkRateLimit('2.2.2.2', 'a', LIMIT, WINDOW_MS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
  });

  it('resets after the window elapses', () => {
    for (let i = 0; i < LIMIT; i += 1) checkRateLimit('3.3.3.3', 'a', LIMIT, WINDOW_MS);
    expect(checkRateLimit('3.3.3.3', 'a', LIMIT, WINDOW_MS).allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1);
    expect(checkRateLimit('3.3.3.3', 'a', LIMIT, WINDOW_MS).allowed).toBe(true);
  });

  it('buckets different IPs independently', () => {
    for (let i = 0; i < LIMIT; i += 1) checkRateLimit('4.4.4.4', 'a', LIMIT, WINDOW_MS);
    expect(checkRateLimit('4.4.4.4', 'a', LIMIT, WINDOW_MS).allowed).toBe(false);
    // A different IP starts with a fresh allowance.
    expect(checkRateLimit('5.5.5.5', 'a', LIMIT, WINDOW_MS).allowed).toBe(true);
  });

  it('buckets different actions independently', () => {
    for (let i = 0; i < LIMIT; i += 1) checkRateLimit('6.6.6.6', 'a', LIMIT, WINDOW_MS);
    expect(checkRateLimit('6.6.6.6', 'a', LIMIT, WINDOW_MS).allowed).toBe(false);
    // Same IP, different action → independent bucket.
    expect(checkRateLimit('6.6.6.6', 'b', LIMIT, WINDOW_MS).allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  it('uses the first x-forwarded-for value, trimmed', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 9.9.9.9 , 8.8.8.8' });
    expect(getClientIp(headers)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '7.7.7.7' });
    expect(getClientIp(headers)).toBe('7.7.7.7');
  });

  it('falls back to localhost when no proxy headers are present', () => {
    expect(getClientIp(new Headers())).toBe('127.0.0.1');
  });

  describe('TRUSTED_CLIENT_IP_HEADER (cloud LB / CDN)', () => {
    afterEach(() => {
      delete process.env.TRUSTED_CLIENT_IP_HEADER;
    });

    it('prefers the configured trusted header over x-forwarded-for', () => {
      process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip';
      const headers = new Headers({
        'cf-connecting-ip': '3.3.3.3',
        'x-forwarded-for': '9.9.9.9', // would be used without the trusted header
      });
      expect(getClientIp(headers)).toBe('3.3.3.3');
    });

    it('is case-insensitive and trims the configured header name', () => {
      process.env.TRUSTED_CLIENT_IP_HEADER = '  CF-Connecting-IP  ';
      expect(getClientIp(new Headers({ 'cf-connecting-ip': '4.4.4.4' }))).toBe('4.4.4.4');
    });

    it('falls back to x-forwarded-for when the trusted header is absent on the request', () => {
      process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip';
      expect(getClientIp(new Headers({ 'x-forwarded-for': '9.9.9.9' }))).toBe('9.9.9.9');
    });
  });
});
