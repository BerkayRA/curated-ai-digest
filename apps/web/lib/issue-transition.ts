/**
 * Transition service — re-exported from @mega-bulten/delivery.
 *
 * The canonical implementation lives in the shared delivery package
 * so both apps/web and apps/worker share the same state-machine logic.
 */

export {
  transitionIssue,
} from '@mega-bulten/delivery';

export type {
  TransitionOptions,
  TransitionResult,
} from '@mega-bulten/delivery';
