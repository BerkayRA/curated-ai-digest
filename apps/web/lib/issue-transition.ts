/**
 * Transition service — re-exported from @digest/delivery.
 *
 * The canonical implementation lives in the shared delivery package
 * so both apps/web and apps/worker share the same state-machine logic.
 */

export {
  transitionIssue,
} from '@digest/delivery';

export type {
  TransitionOptions,
  TransitionResult,
} from '@digest/delivery';
