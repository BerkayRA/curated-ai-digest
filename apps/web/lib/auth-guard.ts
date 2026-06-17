/**
 * Pure, testable functions extracted from auth configuration and middleware.
 * Keeping these side-effect-free means they can be unit tested without Next.js.
 */

// ---------------------------------------------------------------------------
// Middleware path matcher
// ---------------------------------------------------------------------------

/**
 * Public paths that must never require authentication.
 * Pattern matching is intentionally simple — no regex — so it stays testable.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/unsubscribe',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
] as const;

/**
 * Returns true when the pathname is publicly accessible (no auth required).
 * Used by middleware.ts and unit tests.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`));
}

/**
 * Returns true when an unauthenticated request to this pathname should receive
 * a 401 JSON response instead of a redirect to /login.
 * API routes (non-auth) get 401; page routes get a redirect.
 */
export function shouldReturnJson(pathname: string): boolean {
  return pathname.startsWith('/api/') && !pathname.startsWith('/api/auth');
}

// ---------------------------------------------------------------------------
// Entra tenant / group / domain guard
// Pure function — takes config as arguments so tests don't need env vars.
// ---------------------------------------------------------------------------

export interface EntraTokenPayload {
  /** Object ID from the Entra token (oid claim). */
  readonly oid?: string;
  /** Tenant ID from the Entra token (tid claim). */
  readonly tid?: string;
  /** Email from the Entra token. */
  readonly email?: string;
  /** Groups claim — an array of group/role OIDs the user belongs to. */
  readonly groups?: string[];
}

export interface EntraAllowConfig {
  /** The only Entra tenant that is allowed. Required. */
  readonly allowedTenantId: string;
  /** If set, the user must be a member of this group/role OID. */
  readonly allowedGroupId?: string;
  /** If set and no groupId check, the user's email domain must match. */
  readonly allowedEmailDomain?: string;
}

export type EntraGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Decides whether an Entra sign-in should be allowed.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function checkEntraAllowance(
  token: EntraTokenPayload,
  config: EntraAllowConfig,
): EntraGuardResult {
  // 1. Tenant must match
  if (!token.tid || token.tid !== config.allowedTenantId) {
    return {
      allowed: false,
      reason: `Tenant mismatch: expected ${config.allowedTenantId}, got ${token.tid ?? '(none)'}`,
    };
  }

  // 2. Group membership check (takes priority over domain check)
  if (config.allowedGroupId) {
    const groups = token.groups ?? [];
    if (!groups.includes(config.allowedGroupId)) {
      return {
        allowed: false,
        reason: `User is not a member of required group ${config.allowedGroupId}`,
      };
    }
    return { allowed: true };
  }

  // 3. Email domain check
  if (config.allowedEmailDomain) {
    const email = token.email ?? '';
    const domain = email.split('@')[1] ?? '';
    if (domain.toLowerCase() !== config.allowedEmailDomain.toLowerCase()) {
      return {
        allowed: false,
        reason: `Email domain '${domain}' is not in the allowed domain '${config.allowedEmailDomain}'`,
      };
    }
    return { allowed: true };
  }

  // 4. No secondary restriction configured — tenant match is sufficient
  return { allowed: true };
}
