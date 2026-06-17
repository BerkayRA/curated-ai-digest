/**
 * Transition service — updates Issue status + writes AuditLog in one transaction.
 *
 * This is the single authoritative place to apply guarded status changes.
 * The state machine assertion runs before any DB writes.
 */

import { prisma } from '@mega-bulten/db';
import type { IssueStatus } from '@mega-bulten/shared';
import { assertTransition } from './issue-status.js';

export interface TransitionOptions {
  /** ID of the issue to transition. */
  readonly issueId: string;
  /** Target status. */
  readonly to: IssueStatus;
  /** Actor performing the transition (user id or system identifier). */
  readonly actorId?: string;
  /** Optional extra metadata to store on the AuditLog row. */
  readonly meta?: Record<string, unknown>;
}

export interface TransitionResult {
  readonly id: string;
  readonly status: IssueStatus;
}

/**
 * Applies a guarded status transition inside a Prisma transaction.
 * Throws if the transition is not allowed by the state machine.
 */
export async function transitionIssue(opts: TransitionOptions): Promise<TransitionResult> {
  const { issueId, to, actorId, meta } = opts;

  return prisma.$transaction(async (tx) => {
    const current = await tx.issue.findUniqueOrThrow({
      where: { id: issueId },
      select: { id: true, status: true },
    });

    assertTransition(current.status as IssueStatus, to);

    const updated = await tx.issue.update({
      where: { id: issueId },
      data: { status: to },
      select: { id: true, status: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: 'issue.status_changed',
        entity: 'Issue',
        entityId: issueId,
        meta: {
          from: current.status,
          to,
          ...meta,
        },
      },
    });

    return { id: updated.id, status: updated.status as IssueStatus };
  });
}
