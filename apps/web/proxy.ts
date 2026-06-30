/**
 * Authentication proxy (Next.js 16 renamed the `middleware` convention to
 * `proxy`; same Edge handler + matcher API).
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
import type { NextProxy } from 'next/server';
import { authConfig } from '@/auth.config';
import { isPublicPath, shouldReturnJson } from '@/lib/auth-guard';
import { checkArchiveRateLimit } from '@/lib/public-rate-limit';

// Build an Edge-safe auth() from the config that does NOT import argon2.
const { auth } = NextAuth(authConfig);

const proxy: NextProxy = auth((request) => {
  const { pathname } = request.nextUrl;

  // Per-IP rate limit for the public archive (+ RSS) — bounds abuse of the
  // unauthenticated, DB-backed routes before any lookup happens. Returns 429
  // when exceeded; allowed requests fall through to the public-path check below.
  const archiveBlock = checkArchiveRateLimit(pathname, request.headers);
  if (archiveBlock) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(archiveBlock.retryAfterSec) },
    });
  }

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
}) as unknown as NextProxy;

export default proxy;

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
