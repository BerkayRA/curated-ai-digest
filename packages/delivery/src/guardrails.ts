/**
 * Auto-send guardrails — pure evaluation function.
 *
 * evaluateAutoSend() runs synchronously against a snapshot of the current
 * state and returns { canSend, reasons } without any side effects.
 *
 * Conditions that BLOCK auto-send (all must pass for canSend=true):
 *   1. At least one curated IssueItem present.
 *   2. No blocking QA flags on any item.
 *   3. Email provider verifyConfig() returned ok.
 *   4. Active-subscriber count within [AUTOSEND_MIN_SUBSCRIBERS, AUTOSEND_MAX_SUBSCRIBERS].
 *   5. Kill-switch env var AUTOSEND_KILL_SWITCH is not set to "true".
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Defaults (can be overridden via env)
// ---------------------------------------------------------------------------

const DEFAULT_MIN_SUBSCRIBERS = 1;
const DEFAULT_MAX_SUBSCRIBERS = 50_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
}

// ---------------------------------------------------------------------------
// Input schema (validates external/caller-supplied data)
// ---------------------------------------------------------------------------

export const AutoSendInputSchema = z.object({
  /** Items belonging to the issue. */
  items: z.array(
    z.object({
      id: z.string(),
      qaFlags: z.unknown().nullable(),
    }),
  ),
  /** Result of provider.verifyConfig(). */
  providerOk: z.boolean(),
  /** Optional detail from verifyConfig() for richer error messages. */
  providerDetail: z.string().optional(),
  /** Number of currently active subscribers. */
  activeSubscriberCount: z.number().int().nonnegative(),
});

export type AutoSendInput = z.infer<typeof AutoSendInputSchema>;

export interface AutoSendResult {
  readonly canSend: boolean;
  /** Human-readable explanations for each blocking condition. */
  readonly reasons: readonly string[];
}

// ---------------------------------------------------------------------------
// Kill-switch helper (pure-ish: reads env, but stable within a process)
// ---------------------------------------------------------------------------

function isKillSwitchOn(): boolean {
  return process.env['AUTOSEND_KILL_SWITCH'] === 'true';
}

// ---------------------------------------------------------------------------
// QA flag blocker check
// ---------------------------------------------------------------------------

/**
 * Returns true if the qaFlags value contains any blocking flags.
 * qaFlags is stored as JSON in Prisma; we treat any truthy non-empty value
 * as "blocking" unless the array is empty.
 */
function hasBlockingQaFlags(qaFlags: unknown): boolean {
  if (qaFlags === null || qaFlags === undefined) return false;
  if (Array.isArray(qaFlags)) return qaFlags.length > 0;
  // Unexpected shape — treat as blocking to be safe
  return true;
}

// ---------------------------------------------------------------------------
// Main guard
// ---------------------------------------------------------------------------

/**
 * Pure evaluation of whether auto-send is permitted for the current state.
 *
 * Does NOT perform any I/O. Callers must gather the required data and pass
 * it in. This makes the function fully unit-testable without mocks.
 */
export function evaluateAutoSend(rawInput: AutoSendInput): AutoSendResult {
  // Validate + narrow the input
  const input = AutoSendInputSchema.parse(rawInput);

  const reasons: string[] = [];

  // 1. Kill-switch
  if (isKillSwitchOn()) {
    reasons.push('Auto-send kill-switch (AUTOSEND_KILL_SWITCH=true) is active.');
  }

  // 2. At least one item
  if (input.items.length === 0) {
    reasons.push('Issue has no curated items.');
  }

  // 3. No blocking QA flags
  const flaggedItems = input.items.filter((item) => hasBlockingQaFlags(item.qaFlags));
  if (flaggedItems.length > 0) {
    reasons.push(
      `${flaggedItems.length} item(s) have blocking QA flags: [${flaggedItems.map((i) => i.id).join(', ')}].`,
    );
  }

  // 4. Provider configured
  if (!input.providerOk) {
    const detail = input.providerDetail ? ` (${input.providerDetail})` : '';
    reasons.push(`Email provider is not configured${detail}.`);
  }

  // 5. Subscriber bounds
  const minSubs = envInt('AUTOSEND_MIN_SUBSCRIBERS', DEFAULT_MIN_SUBSCRIBERS);
  const maxSubs = envInt('AUTOSEND_MAX_SUBSCRIBERS', DEFAULT_MAX_SUBSCRIBERS);

  if (input.activeSubscriberCount < minSubs) {
    reasons.push(
      `Active subscriber count (${input.activeSubscriberCount}) is below the minimum of ${minSubs}.`,
    );
  } else if (input.activeSubscriberCount > maxSubs) {
    reasons.push(
      `Active subscriber count (${input.activeSubscriberCount}) exceeds the maximum of ${maxSubs}. ` +
        `Human approval required for large sends.`,
    );
  }

  return { canSend: reasons.length === 0, reasons };
}
