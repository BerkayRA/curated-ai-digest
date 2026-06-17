import { describe, it, expect } from 'vitest';
import { parseCsvImport } from '../lib/csv-import';

describe('parseCsvImport', () => {
  it('returns empty result for empty string', () => {
    const result = parseCsvImport('');
    expect(result.valid).toHaveLength(0);
    expect(result.rowErrors).toEqual({});
    expect(result.duplicatesSkipped).toBe(0);
  });

  it('returns empty result for header-only CSV', () => {
    const result = parseCsvImport('email,displayName,company');
    expect(result.valid).toHaveLength(0);
  });

  it('returns error when email column is missing', () => {
    const csv = 'name,company\nfoo,bar';
    const result = parseCsvImport(csv);
    expect(result.rowErrors[0]).toMatch(/email/i);
    expect(result.valid).toHaveLength(0);
  });

  it('parses a well-formed CSV with email only', () => {
    const csv = 'email\ntest@example.com\nuser@domain.org';
    const result = parseCsvImport(csv);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]!.email).toBe('test@example.com');
    expect(result.valid[1]!.email).toBe('user@domain.org');
    expect(result.rowErrors).toEqual({});
    expect(result.duplicatesSkipped).toBe(0);
  });

  it('lowercases emails via SubscriberImportRowSchema', () => {
    const csv = 'email\nFoo@EXAMPLE.COM';
    const result = parseCsvImport(csv);
    expect(result.valid[0]!.email).toBe('foo@example.com');
  });

  it('parses optional displayName and company', () => {
    const csv = 'email,displayName,company\ntest@example.com,Ali Veli,Mega Bilişim';
    const result = parseCsvImport(csv);
    expect(result.valid[0]).toMatchObject({
      email: 'test@example.com',
      displayName: 'Ali Veli',
      company: 'Mega Bilişim',
    });
  });

  it('records row error for invalid email and continues', () => {
    const csv = 'email\nnot-an-email\nvalid@example.com';
    const result = parseCsvImport(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.email).toBe('valid@example.com');
    expect(result.rowErrors[2]).toBeDefined();
  });

  it('deduplicates within CSV (case-insensitive), keeps first occurrence', () => {
    const csv = 'email\nfoo@example.com\nFOO@EXAMPLE.COM\nbar@example.com';
    const result = parseCsvImport(csv);
    expect(result.valid).toHaveLength(2);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.valid.map((r) => r.email)).toContain('foo@example.com');
    expect(result.valid.map((r) => r.email)).toContain('bar@example.com');
  });

  it('handles quoted CSV fields', () => {
    const csv = 'email,displayName,company\n"test@example.com","Ali Veli","Mega, Bilişim"';
    const result = parseCsvImport(csv);
    expect(result.valid[0]!.email).toBe('test@example.com');
    expect(result.valid[0]!.company).toBe('Mega, Bilişim');
  });

  it('handles Windows-style CRLF line endings', () => {
    const csv = 'email\r\ntest@example.com\r\nuser@domain.org';
    const result = parseCsvImport(csv);
    expect(result.valid).toHaveLength(2);
  });

  it('skips blank lines', () => {
    const csv = 'email\n\ntest@example.com\n\n';
    const result = parseCsvImport(csv);
    expect(result.valid).toHaveLength(1);
  });

  it('records the correct 1-based row number in errors', () => {
    const csv = 'email\nvalid@example.com\nbadEmail\nanother@example.com';
    const result = parseCsvImport(csv);
    // Row 1 = header, row 2 = valid, row 3 = bad, row 4 = valid
    expect(result.rowErrors[3]).toBeDefined();
    expect(result.rowErrors[2]).toBeUndefined();
    expect(result.rowErrors[4]).toBeUndefined();
  });
});
