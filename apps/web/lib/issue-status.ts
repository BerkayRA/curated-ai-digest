/**
 * Issue status state machine — re-exported from @digest/delivery.
 *
 * The canonical ALLOWED_TRANSITIONS map, canTransition, and assertTransition
 * live in the shared delivery package so both apps/web and apps/worker share
 * the same state machine without duplication.
 */

// Import from the delivery package's PURE state-machine subpath (not its barrel),
// so client components like IssueEditor don't pull the server-only dispatch/email
// code (@digest/db, @digest/email) into the client bundle.
export {
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
} from '@digest/delivery/issue-status';
