/**
 * Issue status state machine.
 *
 * Encodes the allowed transitions from ARCHITECTURE.md:
 *   draft → in_review → approved → scheduled → sent
 *   Any non-sent state → cancelled
 *   approved / scheduled / sent → failed
 */

import type { IssueStatus } from '@mega-bulten/shared';

// ---------------------------------------------------------------------------
// Allowed transitions map
// ---------------------------------------------------------------------------

/**
 * For each source status, the set of valid target statuses.
 * Exhaustive and immutable — never mutate at runtime.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> = {
  draft: ['in_review', 'cancelled'],
  in_review: ['approved', 'draft', 'cancelled'],
  approved: ['scheduled', 'sent', 'cancelled', 'failed'],
  scheduled: ['sent', 'cancelled', 'failed'],
  sent: [],
  failed: ['draft'],
  cancelled: [],
};

// ---------------------------------------------------------------------------
// Guard functions
// ---------------------------------------------------------------------------

/**
 * Returns true when transitioning from → to is allowed by the state machine.
 */
export function canTransition(from: IssueStatus, to: IssueStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly IssueStatus[]).includes(to);
}

/**
 * Throws a descriptive Error if the transition is not allowed.
 * Use before writing to the database.
 */
export function assertTransition(from: IssueStatus, to: IssueStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid issue status transition: ${from} → ${to}. ` +
        `Allowed from '${from}': [${ALLOWED_TRANSITIONS[from].join(', ') || 'none'}]`,
    );
  }
}
