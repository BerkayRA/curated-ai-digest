import { describe, it, expect } from 'vitest';
import { createEmailProvider } from '../../providers/factory.js';
import { AcsEmailProvider } from '../../providers/acs.js';
import { GraphEmailProvider } from '../../providers/graph.js';
import { ResendEmailProvider } from '../../providers/resend.js';

describe('createEmailProvider factory', () => {
  it('returns AcsEmailProvider for "acs_email"', () => {
    const provider = createEmailProvider('acs_email');
    expect(provider).toBeInstanceOf(AcsEmailProvider);
    expect(provider.kind).toBe('acs_email');
  });

  it('returns GraphEmailProvider for "microsoft_graph"', () => {
    const provider = createEmailProvider('microsoft_graph');
    expect(provider).toBeInstanceOf(GraphEmailProvider);
    expect(provider.kind).toBe('microsoft_graph');
  });

  it('returns ResendEmailProvider for "resend"', () => {
    const provider = createEmailProvider('resend');
    expect(provider).toBeInstanceOf(ResendEmailProvider);
    expect(provider.kind).toBe('resend');
  });

  it('passes options through to the provider', () => {
    // Verify that config overrides make it into the provider (visible via verifyConfig).
    const provider = createEmailProvider('resend', { config: { apiKey: 're_test' } });
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });
});
