/**
 * Open-tracking pixel route tests — GET /api/track/open/[token].
 * All DB access is mocked; no real Prisma or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const record = vi.fn();
const hasRecentOpen = vi.fn();

vi.mock('@digest/db', () => ({
  prisma: { send: { findUnique: (...args: unknown[]) => findUnique(...args) } },
  createEmailEventRepository: () => ({ record, hasRecentOpen }),
}));

import { GET } from '../app/api/track/open/[token]/route';

function makeRequest(token: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/api/track/open/${token}`, { headers });
}

describe('GET /api/track/open/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasRecentOpen.mockResolvedValue(false);
    record.mockResolvedValue({ id: 'evt-1' });
  });

  it('returns a 1x1 GIF and records an open on a known token', async () => {
    findUnique.mockResolvedValue({ id: 'send-1', trackToken: 'tok-known' });

    const res = await GET(makeRequest('tok-known', { 'user-agent': 'Mozilla iPhone' }), {
      params: { token: 'tok-known' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
    expect(record).toHaveBeenCalledTimes(1);
    const recorded = record.mock.calls[0]![0] as { type: string; sendId: string; uaClass: string };
    expect(recorded.type).toBe('open');
    expect(recorded.sendId).toBe('send-1');
    expect(recorded.uaClass).toBe('mobile');
  });

  it('returns the pixel WITHOUT recording for an unknown token', async () => {
    findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest('tok-unknown'), { params: { token: 'tok-unknown' } });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');
    expect(record).not.toHaveBeenCalled();
  });

  it('does not record a duplicate open within the dedup window', async () => {
    findUnique.mockResolvedValue({ id: 'send-1', trackToken: 'tok-known' });
    hasRecentOpen.mockResolvedValue(true);

    const res = await GET(makeRequest('tok-known'), { params: { token: 'tok-known' } });

    expect(res.status).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });

  it('still returns the pixel when the DB throws', async () => {
    findUnique.mockRejectedValue(new Error('db down'));

    const res = await GET(makeRequest('tok-known'), { params: { token: 'tok-known' } });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/gif');
  });
});
