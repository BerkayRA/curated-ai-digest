/**
 * Unit tests for the scrubPii helper.
 */

import { describe, it, expect } from 'vitest';
import { scrubPii } from '../dispatch.js';

describe('scrubPii', () => {
  it('replaces a plain email address with [redacted]', () => {
    const result = scrubPii('Failed to deliver to user@example.com: timeout');
    expect(result).toBe('Failed to deliver to [redacted]: timeout');
  });

  it('replaces multiple email addresses in one string', () => {
    const result = scrubPii('From: alice@example.com, To: bob@other.org');
    expect(result).toBe('From: [redacted], To: [redacted]');
  });

  it('replaces email with plus-addressing', () => {
    const result = scrubPii('Bounce from user+tag@example.com');
    expect(result).toBe('Bounce from [redacted]');
  });

  it('replaces email with dots in local part', () => {
    const result = scrubPii('Error for first.last@domain.co.uk');
    expect(result).toBe('Error for [redacted]');
  });

  it('does not alter a string with no email addresses', () => {
    const input = 'Provider timeout after 30 seconds';
    expect(scrubPii(input)).toBe(input);
  });

  it('returns an empty string unchanged', () => {
    expect(scrubPii('')).toBe('');
  });

  it('handles a string that is only an email address', () => {
    expect(scrubPii('subscriber@example.com')).toBe('[redacted]');
  });

  it('replaces emails embedded in JSON-like error messages', () => {
    const input = '{"error":"invalid recipient","email":"bad@domain.com"}';
    const result = scrubPii(input);
    expect(result).toBe('{"error":"invalid recipient","email":"[redacted]"}');
    expect(result).not.toContain('bad@domain.com');
  });
});
