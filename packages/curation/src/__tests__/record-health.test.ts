import { describe, it, expect, vi } from 'vitest';
import type { IngestResult } from '../ingest/types';
import type { SourceRepository } from '@digest/db';

// ---------------------------------------------------------------------------
// recordSourceHealth tests — fake SourceRepository, no live DB.
// ---------------------------------------------------------------------------

function makeFakeRepo(): SourceRepository {
  return {
    findAll: vi.fn(),
    findEnabled: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordHealth: vi.fn().mockResolvedValue({}),
  } as unknown as SourceRepository;
}

function makeResult(
  bySource: Record<string, number>,
  errors: Array<{ source: string; message: string }> = [],
): IngestResult {
  return {
    ingestRunId: 'test-run-id',
    fetched: Object.values(bySource).reduce((a, b) => a + b, 0),
    deduped: 0,
    persisted: 0,
    errors,
    bySource,
  };
}

const FIXED_NOW = new Date('2026-06-19T12:00:00.000Z');

vi.mock('@digest/db', () => ({
  createSourceRepository: vi.fn(),
  prisma: {},
}));

describe('recordSourceHealth', () => {
  it('calls recordHealth for each provider id that contains a colon', async () => {
    const repo = makeFakeRepo();
    const result = makeResult({
      'rss:src-1': 5,
      'exa:src-2': 3,
    });

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => FIXED_NOW });

    expect(vi.mocked(repo.recordHealth)).toHaveBeenCalledTimes(2);
  });

  it('records status "ok" when no errors match the provider id', async () => {
    const repo = makeFakeRepo();
    const result = makeResult({ 'rss:src-ok': 7 });

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => FIXED_NOW });

    expect(vi.mocked(repo.recordHealth)).toHaveBeenCalledWith('src-ok', {
      lastRunAt: FIXED_NOW,
      lastStatus: 'ok',
      lastCount: 7,
      lastError: null,
    });
  });

  it('records status "error" when an error matches the provider id', async () => {
    const repo = makeFakeRepo();
    const result = makeResult(
      { 'radar:src-err': 0 },
      [{ source: 'radar:src-err', message: 'Network timeout' }],
    );

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => FIXED_NOW });

    expect(vi.mocked(repo.recordHealth)).toHaveBeenCalledWith('src-err', {
      lastRunAt: FIXED_NOW,
      lastStatus: 'error',
      lastCount: 0,
      lastError: 'Network timeout',
    });
  });

  it('skips provider ids without a colon (static fallback providers)', async () => {
    const repo = makeFakeRepo();
    // 'rss' and 'exa' have no colon — they are the static fallback providers.
    const result = makeResult({ rss: 5, exa: 3 });

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => FIXED_NOW });

    expect(vi.mocked(repo.recordHealth)).not.toHaveBeenCalled();
  });

  it('handles a mix of DB-backed and static providers, skipping static ones', async () => {
    const repo = makeFakeRepo();
    const result = makeResult({
      rss: 10, // static — skip
      'rss:src-db-1': 5, // DB-backed — record
      'exa:src-db-2': 2, // DB-backed — record
    });

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => FIXED_NOW });

    expect(vi.mocked(repo.recordHealth)).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(repo.recordHealth).mock.calls.map((c) => c[0]);
    expect(calls).toContain('src-db-1');
    expect(calls).toContain('src-db-2');
    expect(calls).not.toContain('rss');
  });

  it('uses the first colon as the split point, preserving sourceId with colons in it', async () => {
    const repo = makeFakeRepo();
    // A cuid id shouldn't contain colons but we test splitting on the FIRST colon only.
    const result = makeResult({ 'rss:cuid-abc123': 4 });

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => FIXED_NOW });

    expect(vi.mocked(repo.recordHealth)).toHaveBeenCalledWith('cuid-abc123', expect.any(Object));
  });

  it('passes lastRunAt from the now() option', async () => {
    const repo = makeFakeRepo();
    const customNow = new Date('2025-01-15T08:30:00.000Z');
    const result = makeResult({ 'exa:src-ts': 1 });

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => customNow });

    expect(vi.mocked(repo.recordHealth)).toHaveBeenCalledWith(
      'src-ts',
      expect.objectContaining({ lastRunAt: customNow }),
    );
  });

  it('uses current Date by default when now is not provided', async () => {
    const repo = makeFakeRepo();
    const before = new Date();
    const result = makeResult({ 'rss:src-default': 2 });

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo });
    const after = new Date();

    const callArg = vi.mocked(repo.recordHealth).mock.calls[0]?.[1];
    expect(callArg?.lastRunAt).toBeDefined();
    expect(callArg!.lastRunAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(callArg!.lastRunAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('records lastError as null for ok sources even when other sources have errors', async () => {
    const repo = makeFakeRepo();
    const result = makeResult(
      { 'rss:src-ok': 3, 'exa:src-bad': 0 },
      [{ source: 'exa:src-bad', message: 'API failure' }],
    );

    const { recordSourceHealth } = await import('../ingest/record-health');
    await recordSourceHealth(result, { repository: repo, now: () => FIXED_NOW });

    const okCall = vi
      .mocked(repo.recordHealth)
      .mock.calls.find((c) => c[0] === 'src-ok');
    expect(okCall?.[1].lastError).toBeNull();
    expect(okCall?.[1].lastStatus).toBe('ok');
  });
});
