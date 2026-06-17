/**
 * Phase 11 — Authentication middleware.
 *
 * Protects all routes except:
 *   /login              — sign-in page
 *   /api/auth/*         — Auth.js route handler
 *   /unsubscribe        — public unsubscribe page (must stay open)
 *   /_next/static/*     — Next.js static assets
 *   /_next/image/*      — Next.js image optimisation
 *   /favicon.ico        — browser favicon
 *
 * Unauthenticated requests:
 *   - API routes (/api/**) → 401 JSON
 *   - Page routes          → redirect to /login
 */

import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextMiddleware } from 'next/server';
import { authConfig } from '@/auth.config';
import { isPublicPath, shouldReturnJson } from '@/lib/auth-guard';

// Build an Edge-safe auth() from the config that does NOT import argon2.
const { auth } = NextAuth(authConfig);

const middleware: NextMiddleware = auth((request) => {
  const { pathname } = request.nextUrl;

  // Public paths — always pass through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Protected path — check for a session
  const session = (request as typeof request & { auth: unknown }).auth;
  if (!session) {
    if (shouldReturnJson(pathname)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}) as unknown as NextMiddleware;

export default middleware;

/**
 * Run middleware on all routes. The handler itself skips public paths,
 * so listing the full wildcard here is intentional.
 */
export const config = {
  matcher: [
    /*
     * Match every pathname EXCEPT:
     *   - _next/static (static assets)
     *   - _next/image  (image optimisation)
     *   - favicon.ico
     * Auth.js needs the middleware to run on /api/auth/* so it can process
     * the callbacks — isPublicPath() allows those through without a session.
     */
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
