/**
 * @digest/delivery — public API
 *
 * Dispatch service + auto-send guardrails shared between apps/web and apps/worker.
 */

// Dispatch
export { dispatchIssue, defaultDispatchRepo, scrubPii } from './dispatch';
export type {
  DispatchRepo,
  DispatchOptions,
  DispatchResult,
  SubjectVariantRow,
} from './dispatch';

// A/B subject-line split (pure helpers)
export { assignVariant, selectWinner } from './ab-split';
export type { VariantStats } from './ab-split';

// A/B winner-selection job
export { runAbWinnerJob } from './ab-winner-job';
export type {
  RunAbWinnerJobOptions,
  AbWinnerLogger,
  AbDispatchFn,
} from './ab-winner-job';

// Engagement tracking hooks
export { injectTrackingHooks } from './track';

// Auto-send guardrails
export { evaluateAutoSend, AutoSendInputSchema } from './guardrails';
export type { AutoSendInput, AutoSendResult } from './guardrails';

// State machine (re-exported so web/worker can use without importing from apps/web)
export { canTransition, assertTransition, ALLOWED_TRANSITIONS } from './issue-status';

// Transition
export { transitionIssue } from './issue-transition';
export type { TransitionOptions, TransitionResult } from './issue-transition';
