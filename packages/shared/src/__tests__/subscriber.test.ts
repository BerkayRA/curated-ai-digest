import { describe, it, expect } from 'vitest';
import { SubscriberImportRowSchema, CreateSubscriberSchema } from '../subscriber';

describe('SubscriberImportRowSchema', () => {
  it('parses a full valid row', () => {
    const result = SubscriberImportRowSchema.parse({
      email: 'Ahmet@Example.COM',
      displayName: 'Ahmet Yılmaz',
      company: 'Örnek Teknoloji',
    });
    expect(result.email).toBe('ahmet@example.com');
    expect(result.displayName).toBe('Ahmet Yılmaz');
    expect(result.company).toBe('Örnek Teknoloji');
  });

  it('parses a minimal row (email only)', () => {
    const result = SubscriberImportRowSchema.parse({ email: 'min@example.com' });
    expect(result.email).toBe('min@example.com');
    expect(result.displayName).toBeUndefined();
    expect(result.company).toBeUndefined();
  });

  it('rejects a row with an invalid email', () => {
    expect(() =>
      SubscriberImportRowSchema.parse({ email: 'not-an-email', displayName: 'Test' }),
    ).toThrow();
  });

  it('rejects a row with no email field', () => {
    expect(() =>
      SubscriberImportRowSchema.parse({ displayName: 'No email' }),
    ).toThrow();
  });

  it('rejects a row with an empty email', () => {
    expect(() => SubscriberImportRowSchema.parse({ email: '' })).toThrow();
  });

  it('trims whitespace from email in import row', () => {
    const result = SubscriberImportRowSchema.parse({ email: '  hello@example.com  ' });
    expect(result.email).toBe('hello@example.com');
  });
});

describe('CreateSubscriberSchema', () => {
  it('applies default locale and source when omitted', () => {
    const result = CreateSubscriberSchema.parse({ email: 'new@example.com' });
    expect(result.locale).toBe('tr-TR');
    expect(result.source).toBe('manual');
  });

  it('accepts source "import"', () => {
    const result = CreateSubscriberSchema.parse({ email: 'imp@example.com', source: 'import' });
    expect(result.source).toBe('import');
  });

  it('rejects an invalid source value', () => {
    expect(() =>
      CreateSubscriberSchema.parse({ email: 'x@example.com', source: 'csv' }),
    ).toThrow();
  });
});
