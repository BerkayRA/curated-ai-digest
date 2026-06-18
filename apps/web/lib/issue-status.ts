/**
 * Issue status state machine — re-exported from @digest/delivery.
 *
 * The canonical ALLOWED_TRANSITIONS map, canTransition, and assertTransition
 * live in the shared delivery package so both apps/web and apps/worker share
 * the same state machine without duplication.
 */

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
} from '@digest/delivery';
