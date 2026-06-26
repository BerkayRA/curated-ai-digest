import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  isoWeekSchema,
  timeHHmmSchema,
  httpUrlSchema,
  isHttpUrl,
  isHttpsUrl,
} from '../primitives.js';

describe('emailSchema', () => {
  it('accepts a valid lowercase email', () => {
    expect(emailSchema.parse('user@example.com')).toBe('user@example.com');
  });

  it('lowercases an uppercase email', () => {
    expect(emailSchema.parse('USER@EXAMPLE.COM')).toBe('user@example.com');
  });

  it('trims leading/trailing whitespace', () => {
    expect(emailSchema.parse('  user@example.com  ')).toBe('user@example.com');
  });

  it('accepts a subdomain email', () => {
    expect(emailSchema.parse('admin@mail.mega.com.tr')).toBe('admin@mail.mega.com.tr');
  });

  it('rejects a string without @', () => {
    expect(() => emailSchema.parse('notanemail')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => emailSchema.parse('')).toThrow();
  });

  it('rejects a string with no domain', () => {
    expect(() => emailSchema.parse('user@')).toThrow();
  });

  it('rejects a string with no local part', () => {
    expect(() => emailSchema.parse('@example.com')).toThrow();
  });
});

describe('isoWeekSchema', () => {
  it('accepts a valid ISO week string', () => {
    expect(isoWeekSchema.parse('2026-W24')).toBe('2026-W24');
  });

  it('accepts week 01', () => {
    expect(isoWeekSchema.parse('2026-W01')).toBe('2026-W01');
  });

  it('accepts week 53', () => {
    expect(isoWeekSchema.parse('2026-W53')).toBe('2026-W53');
  });

  it('rejects lowercase "w"', () => {
    expect(() => isoWeekSchema.parse('2026-w24')).toThrow();
  });

  it('rejects a plain date string', () => {
    expect(() => isoWeekSchema.parse('2026-06-16')).toThrow();
  });

  it('rejects a week number without zero-padding omission guard (single digit)', () => {
    // The regex requires exactly two digits after W
    expect(() => isoWeekSchema.parse('2026-W4')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => isoWeekSchema.parse('')).toThrow();
  });
});

describe('timeHHmmSchema', () => {
  it('accepts "09:00"', () => {
    expect(timeHHmmSchema.parse('09:00')).toBe('09:00');
  });

  it('accepts "23:59"', () => {
    expect(timeHHmmSchema.parse('23:59')).toBe('23:59');
  });

  it('accepts "00:00"', () => {
    expect(timeHHmmSchema.parse('00:00')).toBe('00:00');
  });

  it('rejects "9:00" (missing leading zero)', () => {
    expect(() => timeHHmmSchema.parse('9:00')).toThrow();
  });

  it('rejects "24:00" (hour out of range)', () => {
    expect(() => timeHHmmSchema.parse('24:00')).toThrow();
  });

  it('rejects "12:60" (minute out of range)', () => {
    expect(() => timeHHmmSchema.parse('12:60')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => timeHHmmSchema.parse('')).toThrow();
  });
});

describe('URL scheme guards', () => {
  it('httpUrlSchema accepts http and https URLs', () => {
    expect(httpUrlSchema.parse('http://example.com/a')).toBe('http://example.com/a');
    expect(httpUrlSchema.parse('https://example.com/a')).toBe('https://example.com/a');
  });

  it('httpUrlSchema rejects javascript:, data:, and ftp: URLs', () => {
    // These all pass Zod's bare .url() (new URL succeeds) — the refine blocks them.
    expect(() => httpUrlSchema.parse('javascript:alert(1)')).toThrow();
    expect(() => httpUrlSchema.parse('data:text/html,<script>1</script>')).toThrow();
    expect(() => httpUrlSchema.parse('ftp://example.com/x')).toThrow();
  });

  it('isHttpUrl / isHttpsUrl predicates classify schemes correctly', () => {
    expect(isHttpUrl('http://x.com')).toBe(true);
    expect(isHttpUrl('https://x.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);

    expect(isHttpsUrl('https://x.com')).toBe(true);
    expect(isHttpsUrl('http://x.com')).toBe(false);
    expect(isHttpsUrl('data:image/svg+xml,<svg/>')).toBe(false);
  });
});
