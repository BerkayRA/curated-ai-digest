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
}));

vi.mock('@digest/email', () => ({
  renderDigestEmail: vi.fn().mockResolvedValue({ html: '<html/>', text: '' }),
}));

const { runCurationJob } = await import('../jobs/curate.js');
const { runWeeklyPipeline } = await import('@digest/curation');
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
});
