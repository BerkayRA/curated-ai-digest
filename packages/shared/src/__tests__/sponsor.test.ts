import { describe, it, expect } from 'vitest';
import { CreateSponsorSchema, UpdateSponsorSchema } from '../sponsor';

describe('CreateSponsorSchema', () => {
  const base = { name: 'Acme', websiteUrl: 'https://acme.example.com' };

  it('accepts a minimal sponsor with an https website', () => {
    const parsed = CreateSponsorSchema.parse(base);
    expect(parsed.name).toBe('Acme');
    expect(parsed.active).toBe(true); // default
  });

  it('rejects a non-https website URL (javascript:/data:/http:)', () => {
    for (const bad of [
      'http://acme.example.com',
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
    ]) {
      expect(() => CreateSponsorSchema.parse({ ...base, websiteUrl: bad })).toThrow();
    }
  });

  it('rejects a non-https logo URL when provided', () => {
    expect(() =>
      CreateSponsorSchema.parse({ ...base, logoUrl: 'http://acme.example.com/l.png' }),
    ).toThrow();
    expect(
      CreateSponsorSchema.parse({ ...base, logoUrl: 'https://acme.example.com/l.png' }).logoUrl,
    ).toBe('https://acme.example.com/l.png');
  });

  it('rejects an empty name', () => {
    expect(() => CreateSponsorSchema.parse({ ...base, name: '' })).toThrow();
  });

  it('validates contactEmail when present', () => {
    expect(() => CreateSponsorSchema.parse({ ...base, contactEmail: 'not-an-email' })).toThrow();
    expect(
      CreateSponsorSchema.parse({ ...base, contactEmail: 'ads@acme.example.com' }).contactEmail,
    ).toBe('ads@acme.example.com');
  });
});

describe('UpdateSponsorSchema', () => {
  it('allows partial updates', () => {
    expect(UpdateSponsorSchema.parse({ active: false }).active).toBe(false);
    expect(UpdateSponsorSchema.parse({}).name).toBeUndefined();
  });

  it('still enforces https on websiteUrl when provided', () => {
    expect(() => UpdateSponsorSchema.parse({ websiteUrl: 'http://x.com' })).toThrow();
  });
});
