/**
 * Unit tests for the assertSameOrigin CSRF helper.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// We need to control APP_BASE_URL before importing the module.
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env['APP_BASE_URL'];

function makeRequest(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) {
    headers.set('origin', origin);
  }
  return new Request('http://localhost:3100/api/issues/abc/send', {
    method: 'POST',
    headers,
  });
}

describe('assertSameOrigin', () => {
  beforeEach(() => {
    process.env['APP_BASE_URL'] = 'http://localhost:3100';
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env['APP_BASE_URL'];
    } else {
      process.env['APP_BASE_URL'] = ORIGINAL_ENV;
    }
  });

  it('returns null when no Origin header is present (same-origin navigation)', async () => {
    // Dynamic import so env is set before module evaluates
    const { assertSameOrigin } = await import('../lib/assert-same-origin');
    const result = assertSameOrigin(makeRequest(null));
    expect(result).toBeNull();
  });

  it('returns null when Origin matches APP_BASE_URL', async () => {
    const { assertSameOrigin } = await import('../lib/assert-same-origin');
    const result = assertSameOrigin(makeRequest('http://localhost:3100'));
    expect(result).toBeNull();
  });

  it('returns null when Origin matches APP_BASE_URL with trailing slash', async () => {
    const { assertSameOrigin } = await import('../lib/assert-same-origin');
    const result = assertSameOrigin(makeRequest('http://localhost:3100/'));
    expect(result).toBeNull();
  });

  it('returns a 403 Response when Origin is a different host', async () => {
    const { assertSameOrigin } = await import('../lib/assert-same-origin');
    const result = assertSameOrigin(makeRequest('https://evil.example.com'));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('returns a 403 Response when Origin is a different port', async () => {
    const { assertSameOrigin } = await import('../lib/assert-same-origin');
    const result = assertSameOrigin(makeRequest('http://localhost:9999'));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('returns a 403 Response when Origin is a different scheme', async () => {
    const { assertSameOrigin } = await import('../lib/assert-same-origin');
    const result = assertSameOrigin(makeRequest('https://localhost:3100'));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('403 response body contains success:false and an error message', async () => {
    const { assertSameOrigin } = await import('../lib/assert-same-origin');
    const result = assertSameOrigin(makeRequest('https://attacker.com'));
    expect(result).not.toBeNull();
    const body = (await result!.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});
