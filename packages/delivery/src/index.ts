/**
 * @digest/delivery — public API
 *
 * Dispatch service + auto-send guardrails shared between apps/web and apps/worker.
 */

// Dispatch
export { dispatchIssue, defaultDispatchRepo } from './dispatch.js';
export type { DispatchRepo, DispatchOptions, DispatchResult } from './dispatch.js';

// Auto-send guardrails
export { evaluateAutoSend, AutoSendInputSchema } from './guardrails.js';
export type { AutoSendInput, AutoSendResult } from './guardrails.js';

// State machine (re-exported so web/worker can use without importing from apps/web)
export { canTransition, assertTransition, ALLOWED_TRANSITIONS } from './issue-status.js';

// Transition
export { transitionIssue } from './issue-transition.js';
export type { TransitionOptions, TransitionResult } from './issue-transition.js';
