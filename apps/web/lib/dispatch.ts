/**
 * Dispatch service — re-exported from @digest/delivery.
 *
 * This thin re-export keeps existing web imports working while the
 * canonical implementation lives in the shared delivery package
 * (used by both apps/web and apps/worker).
 */

export {
  dispatchIssue,
  defaultDispatchRepo,
} from '@digest/delivery';

export type {
  DispatchRepo,
  DispatchOptions,
  DispatchResult,
} from '@digest/delivery';
