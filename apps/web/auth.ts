/**
 * Auth.js v5 (next-auth@5) — Node-runtime config for Mega Bülten.
 *
 * This file consumes the edge-safe `authConfig` and ADDS the argon2-based local
 * Credentials provider. It is imported ONLY by Node-runtime code (the
 * /api/auth/[...nextauth] route handler and server components via `auth()`).
 * `middleware.ts` must import `auth.config.ts` instead — never this file —
 * so argon2 (a native module) never enters the Edge Runtime bundle.
 *
 * See apps/web/.env.example for all required environment variables.
 */

import NextAuth, { type NextAuthConfig, type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import argon2 from 'argon2';
import { z } from 'zod';
import { authConfig, getAuthMode, type MegaUser } from './auth.config';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Local fallback: validate against an env-configured single admin (argon2id). */
function buildCredentialsProvider(): ReturnType<typeof Credentials> {
  return Credentials({
    name: 'Local',
    credentials: {
      email: { label: 'E-posta', type: 'email' },
      password: { label: 'Şifre', type: 'password' },
    },
    async authorize(rawCredentials) {
      const parsed = CredentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) {
        return null;
      }

      const { email, password } = parsed.data;
      const adminEmail = process.env.ADMIN_EMAIL ?? '';
      const adminHash = process.env.ADMIN_PASSWORD_HASH ?? '';

      if (!adminEmail || !adminHash) {
        // Local mode misconfigured — fail closed.
        return null;
      }

      if (email.toLowerCase() !== adminEmail.toLowerCase()) {
        // Verify against the hash anyway to keep timing uniform, discard result.
        await argon2.verify(adminHash, password).catch(() => false);
        return null;
      }

      const valid = await argon2.verify(adminHash, password).catch(() => false);
      if (!valid) {
        return null;
      }

      const user: MegaUser = { id: adminEmail, email: adminEmail, name: 'Admin' };
      return user;
    },
  });
}

/** Full provider set: Entra (from edge config) in entra mode, Credentials in local mode. */
const providers: NextAuthConfig['providers'] =
  getAuthMode() === 'local' ? [buildCredentialsProvider()] : authConfig.providers;

const nextAuthResult: NextAuthResult = NextAuth({ ...authConfig, providers });

export const handlers: NextAuthResult['handlers'] = nextAuthResult.handlers;
export const auth: NextAuthResult['auth'] = nextAuthResult.auth;
export const signIn: NextAuthResult['signIn'] = nextAuthResult.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuthResult.signOut;
