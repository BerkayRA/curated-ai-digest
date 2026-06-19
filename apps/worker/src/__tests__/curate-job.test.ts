/**
 * runCurationJob wiring tests.
 * Verifies that renderDigestEmail is passed as renderFn and that
 * the job logs the result and propagates errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPipelineResult = {
  issueId: 'issue-1',
  isoWeek: '2026-W25',
  itemCount: 3,
  qaFlags: [],
  pipelineRuns: [],
  costUsd: 0.05,
};

vi.mock('@digest/curation', () => ({
  runWeeklyPipeline: vi.fn().mockResolvedValue(mockPipelineResult),
  importCommittedCandidates: vi.fn().mockResolvedValue({ poolSize: 5, imported: 5 }),
}));

vi.mock('@digest/email', () => ({
  renderDigestEmail: vi.fn().mockResolvedValue({ html: '<html/>', text: '' }),
}));

const { runCurationJob } = await import('../jobs/curate.js');
const { runWeeklyPipeline, importCommittedCandidates } = await import('@digest/curation');
const { renderDigestEmail } = await import('@digest/email');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runCurationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runWeeklyPipeline with renderDigestEmail as renderFn', async () => {
    const logger = makeLogger();
    await runCurationJob({ logger, isoWeek: '2026-W25' });

    expect(runWeeklyPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        isoWeek: '2026-W25',
        renderFn: renderDigestEmail,
      }),
    );
  });

  it('passes an injected logger to the pipeline', async () => {
    const logger = makeLogger();
    await runCurationJob({ logger, isoWeek: '2026-W25' });

    const callArgs = vi.mocked(runWeeklyPipeline).mock.calls[0]![0]!;
    expect(callArgs.logger).toBeDefined();
    expect(typeof callArgs.logger!.info).toBe('function');
  });

  it('logs completion with result fields', async () => {
    const logger = makeLogger();
    await runCurationJob({ logger, isoWeek: '2026-W25' });

    expect(logger.info).toHaveBeenCalledWith(
      'job.curate.done',
      expect.objectContaining({
        issueId: 'issue-1',
        isoWeek: '2026-W25',
        itemCount: 3,
        costUsd: 0.05,
      }),
    );
  });

  it('logs error and rethrows when pipeline fails', async () => {
    vi.mocked(runWeeklyPipeline).mockRejectedValueOnce(new Error('Pipeline failed'));
    const logger = makeLogger();

    await expect(runCurationJob({ logger, isoWeek: '2026-W25' })).rejects.toThrow(
      'Pipeline failed',
    );

    expect(logger.error).toHaveBeenCalledWith(
      'job.curate.error',
      expect.objectContaining({ message: 'Pipeline failed' }),
    );
  });

  it('uses current week when isoWeek is not provided', async () => {
    const logger = makeLogger();
    await runCurationJob({ logger });

    const callArgs = vi.mocked(runWeeklyPipeline).mock.calls[0]![0]!;
    // isoWeek should be undefined so the pipeline defaults to current week
    expect(callArgs.isoWeek).toBeUndefined();
  });

  it('imports the committed candidate pool before running the pipeline', async () => {
    const logger = makeLogger();
    await runCurationJob({ logger, isoWeek: '2026-W25' });

    expect(importCommittedCandidates).toHaveBeenCalledTimes(1);
    const importOrder = vi.mocked(importCommittedCandidates).mock.invocationCallOrder[0]!;
    const pipelineOrder = vi.mocked(runWeeklyPipeline).mock.invocationCallOrder[0]!;
    expect(importOrder).toBeLessThan(pipelineOrder);
  });

  it('still runs the pipeline when the pool import fails', async () => {
    vi.mocked(importCommittedCandidates).mockRejectedValueOnce(new Error('no artifact'));
    const logger = makeLogger();

    await runCurationJob({ logger, isoWeek: '2026-W25' });

    expect(runWeeklyPipeline).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'job.curate.pool-import-failed',
      expect.objectContaining({ message: 'no artifact' }),
    );
  });
});
