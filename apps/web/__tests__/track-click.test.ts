/**
 * Click-tracking redirect route tests — GET /api/track/click/[token]/[urlIndex].
 * All DB access is mocked; no real Prisma or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const record = vi.fn();

vi.mock('@digest/db', () => ({
  prisma: { send: { findUnique: (...args: unknown[]) => findUnique(...args) } },
  createEmailEventRepository: () => ({ record }),
}));

import { GET } from '../app/api/track/click/[token]/[urlIndex]/route';

function makeRequest(token: string, index: string): Request {
  return new Request(`http://localhost/api/track/click/${token}/${index}`, {
    headers: { 'user-agent': 'Mozilla Macintosh' },
  });
}

function sendWith(items: Array<{ order: number; sourceUrl: string | null }>) {
  return { id: 'send-1', trackToken: 'tok-known', issue: { items } };
}

describe('GET /api/track/click/[token]/[urlIndex]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    record.mockResolvedValue({ id: 'evt-1' });
  });

  it('302-redirects to the item sourceUrl and records a click', async () => {
    findUnique.mockResolvedValue(sendWith([{ order: 0, sourceUrl: 'https://dest.example.com/a' }]));

    const res = await GET(makeRequest('tok-known', '0'), {
      params: { token: 'tok-known', urlIndex: '0' },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://dest.example.com/a');
    expect(record).toHaveBeenCalledTimes(1);
    const recorded = record.mock.calls[0]![0] as { type: string; url: string; urlIndex: number };
    expect(recorded.type).toBe('click');
    expect(recorded.url).toBe('https://dest.example.com/a');
    expect(recorded.urlIndex).toBe(0);
  });

  it('resolves the destination by item order, not array position', async () => {
    findUnique.mockResolvedValue(
      sendWith([
        { order: 5, sourceUrl: 'https://dest.example.com/five' },
        { order: 2, sourceUrl: 'https://dest.example.com/two' },
      ]),
    );

    const res = await GET(makeRequest('tok-known', '2'), {
      params: { token: 'tok-known', urlIndex: '2' },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://dest.example.com/two');
  });

  it('redirects to / for an unknown token without recording', async () => {
    findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest('tok-unknown', '0'), {
      params: { token: 'tok-unknown', urlIndex: '0' },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(record).not.toHaveBeenCalled();
  });

  it('redirects to / when the index does not match any item', async () => {
    findUnique.mockResolvedValue(sendWith([{ order: 0, sourceUrl: 'https://dest.example.com/a' }]));

    const res = await GET(makeRequest('tok-known', '9'), {
      params: { token: 'tok-known', urlIndex: '9' },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(record).not.toHaveBeenCalled();
  });

  it('redirects to / for a non-http(s) destination (open-redirect guard)', async () => {
    findUnique.mockResolvedValue(
      sendWith([{ order: 0, sourceUrl: 'javascript:alert(1)' }]),
    );

    const res = await GET(makeRequest('tok-known', '0'), {
      params: { token: 'tok-known', urlIndex: '0' },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(record).not.toHaveBeenCalled();
  });

  it('redirects to / when the DB throws', async () => {
    findUnique.mockRejectedValue(new Error('db down'));

    const res = await GET(makeRequest('tok-known', '0'), {
      params: { token: 'tok-known', urlIndex: '0' },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/');
  });
});
