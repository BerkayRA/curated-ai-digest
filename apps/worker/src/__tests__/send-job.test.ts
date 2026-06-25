/**
 * runSendJob decision logic tests.
 *
 * All DB and dispatch calls are mocked; tests cover:
 *   - approved → dispatch
 *   - scheduled → dispatch
 *   - autoSend + guardrails pass → dispatch (autoSent=true)
 *   - autoSend + guardrails fail → skip + alert
 *   - draft + autoSend disabled → skip
 *   - sent → noop
 *   - cancelled → noop
 *   - no issue → warn + return
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendJobRepo } from '../jobs/send.js';
import type { Logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@digest/delivery', () => ({
  dispatchIssue: vi.fn().mockResolvedValue({
    totalRecipients: 5,
    successCount: 5,
    failureCount: 0,
    issueStatus: 'sent',
  }),
  evaluateAutoSend: vi.fn().mockReturnValue({ canSend: true, reasons: [] }),
}));

vi.mock('@digest/email', () => ({
  createEmailProvider: vi.fn().mockReturnValue({
    verifyConfig: vi.fn().mockResolvedValue({ ok: true }),
  }),
}));

const { runSendJob } = await import('../jobs/send.js');
const { dispatchIssue, evaluateAutoSend } = await import('@digest/delivery');
const { createEmailProvider } = await import('@digest/email');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

const baseIssue = {
  id: 'issue-1',
  items: [
    { id: 'item-1', qaFlags: null },
    { id: 'item-2', qaFlags: null },
  ],
};

const autoSendSettings = {
  autoSendEnabled: true,
  activeProvider: 'resend',
};

const noAutoSendSettings = {
  autoSendEnabled: false,
  activeProvider: 'resend',
};

function makeRepo(overrides: Partial<SendJobRepo> = {}): SendJobRepo {
  return {
    findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'approved' }),
    getActiveSubscriberCount: vi.fn().mockResolvedValue(50),
    getSettings: vi.fn().mockResolvedValue(autoSendSettings),
    markAutoSent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSendJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches when status is approved', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'approved' }),
    });

    await runSendJob({
      logger: makeLogger(),
      topicId: 'topic-1',
      isoWeek: '2026-W25',
      autoSendEnabled: true,
      repo,
    });

    expect(dispatchIssue).toHaveBeenCalledWith('issue-1', { actorId: 'worker' });
  });

  it('dispatches when status is scheduled', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'scheduled' }),
    });

    await runSendJob({
      logger: makeLogger(),
      topicId: 'topic-1',
      isoWeek: '2026-W25',
      autoSendEnabled: true,
      repo,
    });

    expect(dispatchIssue).toHaveBeenCalledWith('issue-1', { actorId: 'worker' });
  });

  it('auto-sends when autoSendEnabled and guardrails pass', async () => {
    vi.mocked(evaluateAutoSend).mockReturnValueOnce({ canSend: true, reasons: [] });
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'draft' }),
      getSettings: vi.fn().mockResolvedValue(autoSendSettings),
    });

    await runSendJob({
      logger: makeLogger(),
      topicId: 'topic-1',
      isoWeek: '2026-W25',
      autoSendEnabled: true,
      repo,
    });

    expect(repo.markAutoSent).toHaveBeenCalledWith('issue-1');
    expect(dispatchIssue).toHaveBeenCalledWith('issue-1', { actorId: 'worker:auto' });
  });

  it('auto-sends when status is in_review and guardrails pass', async () => {
    vi.mocked(evaluateAutoSend).mockReturnValueOnce({ canSend: true, reasons: [] });
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'in_review' }),
      getSettings: vi.fn().mockResolvedValue(autoSendSettings),
    });

    await runSendJob({
      logger: makeLogger(),
      topicId: 'topic-1',
      isoWeek: '2026-W25',
      autoSendEnabled: true,
      repo,
    });

    expect(dispatchIssue).toHaveBeenCalledWith('issue-1', { actorId: 'worker:auto' });
  });

  it('skips and alerts when autoSend guardrails fail', async () => {
    const blockingReasons = ['No curated items.', 'Provider not configured.'];
    vi.mocked(evaluateAutoSend).mockReturnValueOnce({
      canSend: false,
      reasons: blockingReasons,
    });

    const onAutoSendBlocked = vi.fn();
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'draft' }),
      getSettings: vi.fn().mockResolvedValue(autoSendSettings),
    });

    await runSendJob({
      logger: makeLogger(),
      topicId: 'topic-1',
      isoWeek: '2026-W25',
      autoSendEnabled: true,
      repo,
      onAutoSendBlocked,
    });

    expect(dispatchIssue).not.toHaveBeenCalled();
    expect(repo.markAutoSent).not.toHaveBeenCalled();
    expect(onAutoSendBlocked).toHaveBeenCalledWith('issue-1', blockingReasons);
  });

  it('skips draft issue when autoSend is disabled', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'draft' }),
      getSettings: vi.fn().mockResolvedValue(noAutoSendSettings),
    });

    await runSendJob({
      logger: makeLogger(),
      topicId: 'topic-1',
      isoWeek: '2026-W25',
      autoSendEnabled: false,
      repo,
    });

    expect(dispatchIssue).not.toHaveBeenCalled();
  });

  it('does nothing when status is sent', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'sent' }),
    });

    await runSendJob({ logger: makeLogger(), topicId: 'topic-1', isoWeek: '2026-W25', autoSendEnabled: true, repo });

    expect(dispatchIssue).not.toHaveBeenCalled();
  });

  it('does nothing when status is cancelled', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'cancelled' }),
    });

    await runSendJob({ logger: makeLogger(), topicId: 'topic-1', isoWeek: '2026-W25', autoSendEnabled: true, repo });

    expect(dispatchIssue).not.toHaveBeenCalled();
  });

  it('does nothing when status is failed', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'failed' }),
    });

    await runSendJob({ logger: makeLogger(), topicId: 'topic-1', isoWeek: '2026-W25', autoSendEnabled: true, repo });

    expect(dispatchIssue).not.toHaveBeenCalled();
  });

  it('warns and returns when no issue exists for the week', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue(null),
    });
    const logger = makeLogger();

    await runSendJob({ logger, topicId: 'topic-1', isoWeek: '2026-W25', autoSendEnabled: true, repo });

    expect(dispatchIssue).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'job.send.no_issue',
      expect.objectContaining({ topicId: 'topic-1', isoWeek: '2026-W25' }),
    );
  });

  it('looks up the issue by the (topicId, isoWeek) composite key', async () => {
    const findIssueByWeek = vi
      .fn()
      .mockResolvedValue({ ...baseIssue, status: 'approved' });
    const repo = makeRepo({ findIssueByWeek });

    await runSendJob({ logger: makeLogger(), topicId: 'topic-1', isoWeek: '2026-W25', autoSendEnabled: true, repo });

    expect(findIssueByWeek).toHaveBeenCalledWith('topic-1', '2026-W25');
  });

  it('passes correct provider kind to createEmailProvider for guardrail check', async () => {
    vi.mocked(evaluateAutoSend).mockReturnValueOnce({ canSend: true, reasons: [] });
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ ...baseIssue, status: 'draft' }),
      getSettings: vi.fn().mockResolvedValue({ autoSendEnabled: true, activeProvider: 'acs_email' }),
    });

    await runSendJob({ logger: makeLogger(), topicId: 'topic-1', isoWeek: '2026-W25', autoSendEnabled: true, repo });

    expect(createEmailProvider).toHaveBeenCalledWith('acs_email');
  });
});
