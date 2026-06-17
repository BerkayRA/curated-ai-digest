/**
 * Edge-safe Auth.js config for Mega Bülten.
 *
 * This file is imported by `middleware.ts` (Edge Runtime) and therefore MUST NOT
 * import any Node-only modules (argon2, node:fs, native addons). The argon2-based
 * Credentials provider lives in `auth.ts` (Node runtime) only.
 *
 * AUTH_MODE switch:
 *   'entra' (default) — Microsoft Entra ID SSO (edge-safe OAuth provider).
 *   'local'           — Credentials provider added in auth.ts; here providers is [].
 *
 * The middleware only verifies the JWT session cookie (no provider needed for that),
 * so an empty providers array in local mode is correct for the edge config.
 */

import type { NextAuthConfig } from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { checkEntraAllowance } from '@/lib/auth-guard';

/** Shape stored in the JWT and surfaced via session.user. */
export interface MegaUser {
  /** Entra OID or email (local mode). Stable identifier for AuditLog. */
  id: string;
  email: string;
  name: string;
}

export function getAuthMode(): 'entra' | 'local' {
  const raw = process.env.AUTH_MODE ?? 'entra';
  if (raw !== 'entra' && raw !== 'local') {
    throw new Error(`AUTH_MODE must be 'entra' or 'local', got: ${raw}`);
  }
  return raw;
}

function buildEntraProvider(): ReturnType<typeof MicrosoftEntraID> {
  return MicrosoftEntraID({
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? '',
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? '',
    issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? '',
  });
}

/** Edge-safe providers only. The argon2 Credentials provider is added in auth.ts. */
export const edgeProviders: NextAuthConfig['providers'] =
  getAuthMode() === 'entra' ? [buildEntraProvider()] : [];

export const authConfig: NextAuthConfig = {
  providers: edgeProviders,
  // Self-hosted (Docker) behind our own reverse proxy — Auth.js must trust the
  // Host header. Without this, v5 throws UntrustedHost and middleware fails open.
  // Can also be set via AUTH_TRUST_HOST=true.
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    /**
     * Entra mode: enforce tenant + group/domain allowlist. Local mode: the
     * Credentials authorize() (in auth.ts) already validated, so allow.
     */
    async signIn({ profile }) {
      if (getAuthMode() !== 'entra') {
        return true;
      }

      const allowedTenantId = process.env.AUTH_ALLOWED_TENANT_ID ?? '';
      if (!allowedTenantId) {
        // Misconfigured — fail closed.
        return false;
      }

      const claims = (profile ?? {}) as Record<string, unknown>;
      const result = checkEntraAllowance(
        {
          oid: claims['oid'] as string | undefined,
          tid: claims['tid'] as string | undefined,
          email: (profile?.email as string | undefined) ?? undefined,
          groups: claims['groups'] as string[] | undefined,
        },
        {
          allowedTenantId,
          allowedGroupId: process.env.AUTH_ALLOWED_GROUP_ID || undefined,
          allowedEmailDomain: process.env.AUTH_ALLOWED_EMAIL_DOMAIN || undefined,
        },
      );
      return result.allowed;
    },

    /** Persist the stable user id (OID for Entra, email for local) into the JWT. */
    async jwt({ token, user, profile }) {
      if (user) {
        if (getAuthMode() === 'entra' && profile) {
          const oid = (profile as Record<string, unknown>)['oid'] as string | undefined;
          token['megaId'] = oid ?? user.email ?? '';
          token['megaEmail'] = user.email ?? '';
          token['megaName'] = user.name ?? '';
        } else {
          token['megaId'] = (user as MegaUser).id;
          token['megaEmail'] = (user as MegaUser).email;
          token['megaName'] = (user as MegaUser).name;
        }
      }
      return token;
    },

    /** Shape session.user for auth()/useSession(). */
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: (token['megaId'] as string) ?? '',
          email: (token['megaEmail'] as string) ?? session.user.email ?? '',
          name: (token['megaName'] as string) ?? session.user.name ?? '',
        },
      };
    },
  },
};
