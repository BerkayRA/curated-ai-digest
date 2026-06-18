/**
 * createEmailProvider — factory that selects the concrete EmailProvider
 * implementation by EmailProviderKind enum value.
 *
 * The factory reads credentials from environment variables by default.
 * Pass per-provider option overrides via the second argument.
 *
 * ACS is the default provider (aligned with ARCHITECTURE.md).
 *
 * Usage:
 *   const provider = createEmailProvider('acs_email');
 *   const provider = createEmailProvider('resend', { perMinute: 200 });
 */

import type { EmailProviderKind } from '@digest/shared';
import { AcsEmailProvider } from './acs.js';
import { GraphEmailProvider } from './graph.js';
import { ResendEmailProvider } from './resend.js';
import type { EmailProvider } from './provider.js';
import type { AcsEmailProviderOptions } from './acs.js';
import type { GraphEmailProviderOptions } from './graph.js';
import type { ResendEmailProviderOptions } from './resend.js';

// ---------------------------------------------------------------------------
// Per-provider option types
// ---------------------------------------------------------------------------

export type ProviderOptions<K extends EmailProviderKind> = K extends 'acs_email'
  ? AcsEmailProviderOptions
  : K extends 'microsoft_graph'
    ? GraphEmailProviderOptions
    : K extends 'resend'
      ? ResendEmailProviderOptions
      : never;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates and returns an EmailProvider for the given kind.
 *
 * @param kind    - The provider variant (from EmailProviderKind enum).
 * @param options - Optional per-provider configuration overrides.
 * @returns       A concrete EmailProvider instance.
 */
export function createEmailProvider<K extends EmailProviderKind>(
  kind: K,
  options?: ProviderOptions<K>,
): EmailProvider {
  switch (kind) {
    case 'acs_email':
      return new AcsEmailProvider(options as AcsEmailProviderOptions | undefined);
    case 'microsoft_graph':
      return new GraphEmailProvider(options as GraphEmailProviderOptions | undefined);
    case 'resend':
      return new ResendEmailProvider(options as ResendEmailProviderOptions | undefined);
    default: {
      // Exhaustiveness check — TypeScript ensures this is unreachable.
      const _exhaustive: never = kind;
      throw new Error(`createEmailProvider: unknown kind "${String(_exhaustive)}"`);
    }
  }
}
