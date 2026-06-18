import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition, ALLOWED_TRANSITIONS } from '../lib/issue-status';
import type { IssueStatus } from '@digest/shared';

// ---------------------------------------------------------------------------
// Allowed transitions table-driven test
// ---------------------------------------------------------------------------

describe('canTransition', () => {
  const allowedCases: Array<[IssueStatus, IssueStatus]> = [
    ['draft', 'in_review'],
    ['draft', 'cancelled'],
    ['in_review', 'approved'],
    ['in_review', 'draft'],
    ['in_review', 'cancelled'],
    ['approved', 'scheduled'],
    ['approved', 'sent'],
    ['approved', 'cancelled'],
    ['approved', 'failed'],
    ['scheduled', 'sent'],
    ['scheduled', 'cancelled'],
    ['scheduled', 'failed'],
    ['failed', 'draft'],
  ];

  it.each(allowedCases)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  const forbiddenCases: Array<[IssueStatus, IssueStatus]> = [
    ['draft', 'approved'],
    ['draft', 'sent'],
    ['draft', 'scheduled'],
    ['draft', 'failed'],
    ['in_review', 'sent'],
    ['in_review', 'scheduled'],
    ['in_review', 'failed'],
    ['approved', 'draft'],
    ['approved', 'in_review'],
    ['sent', 'draft'],
    ['sent', 'in_review'],
    ['sent', 'approved'],
    ['sent', 'scheduled'],
    ['sent', 'cancelled'],
    ['sent', 'failed'],
    ['cancelled', 'draft'],
    ['cancelled', 'in_review'],
    ['cancelled', 'sent'],
  ];

  it.each(forbiddenCases)('forbids %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('does not throw for an allowed transition', () => {
    expect(() => assertTransition('draft', 'in_review')).not.toThrow();
  });

  it('throws a descriptive error for a forbidden transition', () => {
    expect(() => assertTransition('sent', 'draft')).toThrowError(
      /Invalid issue status transition: sent → draft/,
    );
  });

  it('includes the list of allowed transitions in the error', () => {
    expect(() => assertTransition('draft', 'sent')).toThrowError(/Allowed from 'draft'/);
  });
});

describe('ALLOWED_TRANSITIONS map', () => {
  it('covers all IssueStatus values', () => {
    const allStatuses: IssueStatus[] = [
      'draft',
      'in_review',
      'approved',
      'scheduled',
      'sent',
      'failed',
      'cancelled',
    ];
    for (const status of allStatuses) {
      expect(ALLOWED_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('sent has no allowed outgoing transitions', () => {
    expect(ALLOWED_TRANSITIONS.sent).toHaveLength(0);
  });

  it('cancelled has no allowed outgoing transitions', () => {
    expect(ALLOWED_TRANSITIONS.cancelled).toHaveLength(0);
  });
});
