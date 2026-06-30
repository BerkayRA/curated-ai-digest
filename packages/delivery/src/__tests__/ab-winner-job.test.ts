/**
 * runAbWinnerJob tests.
 *
 * @digest/db is mocked (createSubjectVariantRepository) and dispatch is
 * injected, so no DB or email I/O occurs. The repo's claimAbTesting performs
 * the atomic testing → selecting claim that both checks and guards the job.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SubjectVariantRepository } from '@digest/db';

vi.mock('@digest/db', () => ({
  prisma: {},
  createSubjectVariantRepository: vi.fn(),
}));

const { runAbWinnerJob } = await import('../ab-winner-job');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<SubjectVariantRepository> = {}): SubjectVariantRepository {
  return {
    claimAbTesting: vi.fn().mockResolvedValue(true),
    findByIssueId: vi.fn().mockResolvedValue([
      { variantIndex: 0, subject: 'Konu A' },
      { variantIndex: 1, subject: 'Konu B' },
    ]),
    create: vi.fn(),
    replaceForIssue: vi.fn().mockResolvedValue(undefined),
    getVariantStats: vi.fn().mockResolvedValue([
      { variantIndex: 0, sentCount: 100, openCount: 20 },
      { variantIndex: 1, sentCount: 100, openCount: 40 },
    ]),
    persistCounts: vi.fn().mockResolvedValue(undefined),
    setIssueAbStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as SubjectVariantRepository;
}

function makeDispatch() {
  return vi.fn().mockResolvedValue({
    totalRecipients: 80,
    successCount: 80,
    failureCount: 0,
    issueStatus: 'sent',
  });
}

describe('runAbWinnerJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null (no-op) when the issue has no variants', async () => {
    const repo = makeRepo({ findByIssueId: vi.fn().mockResolvedValue([]) });
    const dispatch = makeDispatch();

    const result = await runAbWinnerJob({ issueId: 'issue-1', repo, dispatch });

    expect(result).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns null and does NOT dispatch when the atomic claim is lost', async () => {
    const repo = makeRepo({ claimAbTesting: vi.fn().mockResolvedValue(false) });
    const dispatch = makeDispatch();

    const result = await runAbWinnerJob({ issueId: 'issue-1', repo, dispatch });

    expect(result).toBeNull();
    expect(repo.getVariantStats).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('marks completed and dispatches the winner subject on the happy path', async () => {
    const repo = makeRepo();
    const dispatch = makeDispatch();

    const result = await runAbWinnerJob({ issueId: 'issue-1', repo, dispatch });

    // Variant 1 wins (0.40 > 0.20). The claim already moved it to 'selecting'.
    expect(repo.claimAbTesting).toHaveBeenCalledWith('issue-1');
    expect(repo.setIssueAbStatus).toHaveBeenCalledWith('issue-1', 'completed', 1);
    expect(repo.persistCounts).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('issue-1', {
      overrideSubject: 'Konu B',
      actorId: 'worker:ab',
    });
    expect(result).toEqual({
      winnerVariantIndex: 1,
      winnerSubject: 'Konu B',
      remainderSentCount: 80,
    });
  });
});
