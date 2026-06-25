/**
 * Suppression admin API tests — GET/POST /api/suppression and
 * DELETE /api/suppression/[id]. All DB access is mocked (DB-free; CI has no
 * DATABASE_URL). Covers pagination shape, email validation, and the
 * same-origin CSRF guard on the mutating routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const listAll = vi.fn();
const count = vi.fn();
const insertManual = vi.fn();
const remove = vi.fn();
const suppressionFindUnique = vi.fn();
const auditLogCreate = vi.fn();

vi.mock('@digest/db', () => ({
  prisma: {
    suppression: { findUnique: (...args: unknown[]) => suppressionFindUnique(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreate(...args) },
  },
  createSuppressionRepository: () => ({ listAll, count, insertManual, remove }),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } }),
}));

import { GET, POST } from '../app/api/suppression/route';
import { DELETE } from '../app/api/suppression/[id]/route';

const APP_ORIGIN = 'http://localhost:3100';

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/suppression${query}`, { method: 'GET' });
}

function postRequest(body: unknown, origin: string | null = APP_ORIGIN): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin !== null) headers.origin = origin;
  return new NextRequest('http://localhost/api/suppression', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function deleteRequest(id: string, origin: string | null = APP_ORIGIN): NextRequest {
  const headers: Record<string, string> = {};
  if (origin !== null) headers.origin = origin;
  return new NextRequest(`http://localhost/api/suppression/${id}`, { method: 'DELETE', headers });
}

describe('GET /api/suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_BASE_URL', APP_ORIGIN);
  });

  it('returns the paginated envelope shape with meta', async () => {
    listAll.mockResolvedValue([{ id: 's-1', email: 'a@x.test' }]);
    count.mockResolvedValue(1);

    const res = await GET(getRequest());
    const json = (await res.json()) as Envelope<{ id: string }[]>;

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.meta).toEqual({ total: 1, page: 1, limit: 50 });
  });

  it('passes search + computes offset from page/limit', async () => {
    listAll.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await GET(getRequest('?search=foo&page=3&limit=10'));

    expect(listAll).toHaveBeenCalledWith({ search: 'foo', limit: 10, offset: 20 });
    expect(count).toHaveBeenCalledWith({ search: 'foo' });
  });
});

describe('POST /api/suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_BASE_URL', APP_ORIGIN);
  });

  it('validates the email and calls insertManual on success', async () => {
    insertManual.mockResolvedValue({ id: 's-9', email: 'good@x.test', reason: 'manual' });

    const res = await POST(postRequest({ email: 'good@x.test' }));
    const json = (await res.json()) as Envelope<{ id: string }>;

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(insertManual).toHaveBeenCalledWith('good@x.test');
  });

  it('rejects an invalid email with 400 and does not touch the repo', async () => {
    const res = await POST(postRequest({ email: 'not-an-email' }));

    expect(res.status).toBe(400);
    expect(insertManual).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin POST with 403', async () => {
    const res = await POST(postRequest({ email: 'good@x.test' }, 'http://evil.test'));

    expect(res.status).toBe(403);
    expect(insertManual).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/suppression/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_BASE_URL', APP_ORIGIN);
  });

  it('calls remove(id), writes an audit log, and returns success', async () => {
    remove.mockResolvedValue(undefined);
    suppressionFindUnique.mockResolvedValue({ id: 's-1', email: 'a@x.test', reason: 'manual' });
    auditLogCreate.mockResolvedValue({ id: 'al-1' });

    const res = await DELETE(deleteRequest('s-1'), { params: { id: 's-1' } });
    const json = (await res.json()) as Envelope<{ deleted: boolean }>;

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(remove).toHaveBeenCalledWith('s-1');
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'suppression.removed',
          entity: 'Suppression',
          entityId: 's-1',
        }),
      }),
    );
  });

  it('rejects a cross-origin DELETE with 403', async () => {
    const res = await DELETE(deleteRequest('s-1', 'http://evil.test'), { params: { id: 's-1' } });

    expect(res.status).toBe(403);
    expect(remove).not.toHaveBeenCalled();
  });
});
