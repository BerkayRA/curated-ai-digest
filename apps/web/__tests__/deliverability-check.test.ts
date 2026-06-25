/**
 * Deliverability DNS-check tests — SPF/DMARC/DKIM grading, overall status,
 * caching, and per-provider selector defaults. `node:dns/promises` is mocked,
 * so no real DNS lookups happen (DB-free; CI has no network/DATABASE_URL).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveTxt = vi.fn();

vi.mock('node:dns/promises', () => ({
  resolveTxt: (...args: unknown[]) => resolveTxt(...args),
}));

import { checkDeliverability, clearDnsCache, resolveDkimSelector } from '../lib/dns-check';

/** Builds a TXT-mock that returns chunk arrays per queried name. */
function mockTxtByName(map: Record<string, string[][] | Error>): void {
  resolveTxt.mockImplementation((name: string) => {
    const entry = map[name];
    if (entry instanceof Error) return Promise.reject(entry);
    return Promise.resolve(entry ?? []);
  });
}

function enotfound(): Error {
  const e = new Error('not found') as Error & { code: string };
  e.code = 'ENOTFOUND';
  return e;
}

const DOMAIN = 'mega.com.tr';
const SELECTOR = 'selector1';

describe('checkDeliverability', () => {
  beforeEach(() => {
    clearDnsCache();
    resolveTxt.mockReset();
  });

  it('passes all three when SPF ~all, DMARC p=reject, DKIM v=DKIM1', async () => {
    mockTxtByName({
      [DOMAIN]: [['v=spf1 include:spf.example.com ~all']],
      [`_dmarc.${DOMAIN}`]: [['v=DMARC1; p=reject; rua=mailto:dmarc@mega.com.tr']],
      [`${SELECTOR}._domainkey.${DOMAIN}`]: [['v=DKIM1; k=rsa; p=MIGfMA0']],
    });

    const result = await checkDeliverability(`digest@${DOMAIN}`, SELECTOR);

    expect(result.domain).toBe(DOMAIN);
    expect(result.records.find((r) => r.name === 'SPF')?.status).toBe('pass');
    expect(result.records.find((r) => r.name === 'DMARC')?.status).toBe('pass');
    expect(result.records.find((r) => r.name === 'DKIM')?.status).toBe('pass');
    expect(result.overallStatus).toBe('pass');
  });

  it('fails SPF when no SPF record is present', async () => {
    mockTxtByName({
      [DOMAIN]: [['some-unrelated-txt']],
      [`_dmarc.${DOMAIN}`]: [['v=DMARC1; p=reject']],
      [`${SELECTOR}._domainkey.${DOMAIN}`]: [['v=DKIM1; p=abc']],
    });

    const result = await checkDeliverability(`digest@${DOMAIN}`, SELECTOR);
    const spf = result.records.find((r) => r.name === 'SPF');
    expect(spf?.status).toBe('fail');
    expect(spf?.detail).toBe('SPF kaydı bulunamadı');
  });

  it('warns on DMARC p=none', async () => {
    mockTxtByName({
      [DOMAIN]: [['v=spf1 -all']],
      [`_dmarc.${DOMAIN}`]: [['v=DMARC1; p=none']],
      [`${SELECTOR}._domainkey.${DOMAIN}`]: [['v=DKIM1; p=abc']],
    });

    const result = await checkDeliverability(`digest@${DOMAIN}`, SELECTOR);
    expect(result.records.find((r) => r.name === 'DMARC')?.status).toBe('warn');
  });

  it('fails DKIM when the selector record does not exist (ENOTFOUND)', async () => {
    mockTxtByName({
      [DOMAIN]: [['v=spf1 -all']],
      [`_dmarc.${DOMAIN}`]: [['v=DMARC1; p=reject']],
      [`${SELECTOR}._domainkey.${DOMAIN}`]: enotfound(),
    });

    const result = await checkDeliverability(`digest@${DOMAIN}`, SELECTOR);
    const dkim = result.records.find((r) => r.name === 'DKIM');
    expect(dkim?.status).toBe('fail');
    expect(dkim?.hint).toContain(`${SELECTOR}._domainkey.${DOMAIN}`);
  });

  it('reports overallStatus as the worst of the three records', async () => {
    // SPF pass, DMARC warn, DKIM fail → overall fail.
    mockTxtByName({
      [DOMAIN]: [['v=spf1 ~all']],
      [`_dmarc.${DOMAIN}`]: [['v=DMARC1; p=none']],
      [`${SELECTOR}._domainkey.${DOMAIN}`]: enotfound(),
    });

    const result = await checkDeliverability(`digest@${DOMAIN}`, SELECTOR);
    expect(result.overallStatus).toBe('fail');
  });

  it('serves cache hits without re-querying DNS', async () => {
    mockTxtByName({
      [DOMAIN]: [['v=spf1 -all']],
      [`_dmarc.${DOMAIN}`]: [['v=DMARC1; p=reject']],
      [`${SELECTOR}._domainkey.${DOMAIN}`]: [['v=DKIM1; p=abc']],
    });

    await checkDeliverability(`digest@${DOMAIN}`, SELECTOR);
    const callsAfterFirst = resolveTxt.mock.calls.length;
    expect(callsAfterFirst).toBe(3);

    const second = await checkDeliverability(`digest@${DOMAIN}`, SELECTOR);
    expect(resolveTxt.mock.calls.length).toBe(callsAfterFirst);
    expect(second.overallStatus).toBe('pass');
  });
});

describe('resolveDkimSelector', () => {
  it('uses the configured selector when present', () => {
    expect(resolveDkimSelector('mycustom', 'resend')).toBe('mycustom');
  });

  it('falls back to provider defaults when empty/null', () => {
    expect(resolveDkimSelector(null, 'acs_email')).toBe('selector1');
    expect(resolveDkimSelector('', 'resend')).toBe('resend');
    expect(resolveDkimSelector('   ', 'microsoft_graph')).toBe('selector1');
  });

  it('uses a generic fallback for unknown providers', () => {
    expect(resolveDkimSelector(null, 'unknown_provider')).toBe('selector1');
  });
});
