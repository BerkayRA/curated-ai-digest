/**
 * Dispatch service — re-exported from @mega-bulten/delivery.
 *
 * This thin re-export keeps existing web imports working while the
 * canonical implementation lives in the shared delivery package
 * (used by both apps/web and apps/worker).
 */

export {
  dispatchIssue,
  defaultDispatchRepo,
} from '@mega-bulten/delivery';

export type {
  DispatchRepo,
  DispatchOptions,
  DispatchResult,
} from '@mega-bulten/delivery';
