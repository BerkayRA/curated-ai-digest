/**
 * Auth.js v5 route handler.
 * Catches /api/auth/* — sign in, sign out, callbacks, CSRF, session.
 */

import { handlers } from '@/auth';

export const { GET, POST } = handlers;
