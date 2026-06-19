/**
 * Unit tests for auth-guard pure functions:
 *  - isPublicPath / shouldReturnJson (middleware path matching)
 *  - checkEntraAllowance (Entra tenant + group/domain guard)
 */

import { describe, it, expect } from 'vitest';
import { isPublicPath, shouldReturnJson, checkEntraAllowance } from '../lib/auth-guard';
import type { EntraTokenPayload, EntraAllowConfig } from '../lib/auth-guard';

// ---------------------------------------------------------------------------
// isPublicPath — table-driven
// ---------------------------------------------------------------------------

describe('isPublicPath', () => {
  const publicPaths: string[] = [
    '/login',
    '/login?callbackUrl=%2F',
    '/api/auth/signin',
    '/api/auth/callback/microsoft-entra-id',
    '/api/auth/csrf',
    '/api/auth/session',
    '/unsubscribe',
    '/unsubscribe?token=abc123',
    '/_next/static/chunks/main.js',
    '/_next/image?url=foo',
    '/favicon.ico',
    // static brand/favicon assets must load pre-auth
    '/icon.png',
    '/apple-icon.png',
    '/brand/mega-logo-white.svg',
    '/brand/mega-logo-blue.svg',
    '/some/nested/asset.svg',
  ];

  it.each(publicPaths)('treats %s as public', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  const protectedPaths: string[] = [
    '/',
    '/issues',
    '/issues/abc-123',
    '/subscribers',
    '/settings',
    '/api/issues',
    '/api/issues/abc/transition',
    '/api/issues/abc/send',
    '/api/subscribers',
    '/api/settings',
  ];

  it.each(protectedPaths)('treats %s as protected', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldReturnJson — table-driven
// ---------------------------------------------------------------------------

describe('shouldReturnJson', () => {
  it.each([
    '/api/issues',
    '/api/issues/abc/transition',
    '/api/subscribers',
    '/api/settings',
  ])('returns true for API route %s', (path) => {
    expect(shouldReturnJson(path)).toBe(true);
  });

  it.each([
    '/',
    '/issues',
    '/login',
    '/api/auth/signin',    // auth route — should NOT get 401
    '/api/auth/callback',  // auth route — should NOT get 401
  ])('returns false for page / auth route %s', (path) => {
    expect(shouldReturnJson(path)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkEntraAllowance — Entra tenant + group / domain guard
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-abc-123';
const GROUP_ID = 'group-xyz-456';
const DOMAIN = 'mega.com.tr';

const validToken: EntraTokenPayload = {
  oid: 'oid-user-001',
  tid: TENANT_ID,
  email: 'user@mega.com.tr',
  groups: [GROUP_ID],
};

describe('checkEntraAllowance — tenant enforcement', () => {
  const config: EntraAllowConfig = { allowedTenantId: TENANT_ID };

  it('allows a matching tenant', () => {
    expect(checkEntraAllowance(validToken, config)).toEqual({ allowed: true });
  });

  it('rejects a mismatched tenant', () => {
    const result = checkEntraAllowance({ ...validToken, tid: 'other-tenant' }, config);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('Tenant mismatch');
    }
  });

  it('rejects when tid is missing', () => {
    const result = checkEntraAllowance({ ...validToken, tid: undefined }, config);
    expect(result.allowed).toBe(false);
  });
});

describe('checkEntraAllowance — group membership', () => {
  const config: EntraAllowConfig = {
    allowedTenantId: TENANT_ID,
    allowedGroupId: GROUP_ID,
  };

  it('allows when user is in the required group', () => {
    expect(checkEntraAllowance(validToken, config)).toEqual({ allowed: true });
  });

  it('rejects when user is NOT in the required group', () => {
    const result = checkEntraAllowance(
      { ...validToken, groups: ['some-other-group'] },
      config,
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('not a member');
    }
  });

  it('rejects when groups claim is absent', () => {
    const result = checkEntraAllowance(
      { ...validToken, groups: undefined },
      config,
    );
    expect(result.allowed).toBe(false);
  });
});

describe('checkEntraAllowance — email domain', () => {
  const config: EntraAllowConfig = {
    allowedTenantId: TENANT_ID,
    allowedEmailDomain: DOMAIN,
  };

  it('allows when email domain matches', () => {
    expect(checkEntraAllowance(validToken, config)).toEqual({ allowed: true });
  });

  it('is case-insensitive for domain comparison', () => {
    const result = checkEntraAllowance(
      { ...validToken, email: 'user@MEGA.COM.TR' },
      config,
    );
    expect(result.allowed).toBe(true);
  });

  it('rejects when email domain does not match', () => {
    const result = checkEntraAllowance(
      { ...validToken, email: 'user@other.com' },
      config,
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('Email domain');
    }
  });

  it('rejects when email is missing', () => {
    const result = checkEntraAllowance(
      { ...validToken, email: undefined },
      config,
    );
    expect(result.allowed).toBe(false);
  });
});

describe('checkEntraAllowance — group takes priority over domain', () => {
  const config: EntraAllowConfig = {
    allowedTenantId: TENANT_ID,
    allowedGroupId: GROUP_ID,
    allowedEmailDomain: DOMAIN,
  };

  it('passes when group is satisfied (ignores domain)', () => {
    // Email domain is wrong, but group is correct — should pass
    const result = checkEntraAllowance(
      { ...validToken, email: 'user@other.com', groups: [GROUP_ID] },
      config,
    );
    expect(result.allowed).toBe(true);
  });

  it('rejects when group is not satisfied (ignores domain)', () => {
    const result = checkEntraAllowance(
      { ...validToken, email: 'user@mega.com.tr', groups: [] },
      config,
    );
    expect(result.allowed).toBe(false);
  });
});

describe('checkEntraAllowance — no secondary restriction', () => {
  const config: EntraAllowConfig = { allowedTenantId: TENANT_ID };

  it('allows any tenant-matched user when no group or domain is configured', () => {
    const result = checkEntraAllowance(
      { tid: TENANT_ID, email: 'anyone@anywhere.com', groups: [] },
      config,
    );
    expect(result.allowed).toBe(true);
  });
});
