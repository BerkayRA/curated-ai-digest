/**
 * Server-only deliverability health checks (SPF / DMARC / DKIM).
 *
 * Resolves the sending domain's authentication DNS records and grades them.
 * Pure-ish: only side effect is DNS resolution + a module-level result cache.
 * Never throws out of `checkDeliverability` — DNS failures map to fail/unknown.
 */

import { resolveTxt } from 'node:dns/promises';

export type DnsCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface DnsRecord {
  name: 'SPF' | 'DMARC' | 'DKIM';
  status: DnsCheckStatus;
  detail: string;
  hint?: string;
}

export interface DeliverabilityResult {
  domain: string;
  checkedAt: Date;
  records: DnsRecord[];
  overallStatus: DnsCheckStatus;
}

/** Default DKIM selector per provider, used when no selector is configured. */
const PROVIDER_DKIM_DEFAULTS: Record<string, string> = {
  acs_email: 'selector1',
  resend: 'resend',
  microsoft_graph: 'selector1',
};

const FALLBACK_DKIM_SELECTOR = 'selector1';
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Hard cap on distinct cache entries; oldest is evicted on overflow. */
const CACHE_MAX_ENTRIES = 500;
const STATUS_RANK: Record<DnsCheckStatus, number> = { pass: 0, warn: 1, unknown: 2, fail: 3 };

interface CacheEntry {
  result: DeliverabilityResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Clears the in-memory DNS result cache (test helper). */
export function clearDnsCache(): void {
  cache.clear();
}

/** Resolves the DKIM selector: configured value wins, else the provider default. */
export function resolveDkimSelector(configured: string | null, provider: string): string {
  const trimmed = configured?.trim();
  if (trimmed) return trimmed;
  return PROVIDER_DKIM_DEFAULTS[provider] ?? FALLBACK_DKIM_SELECTOR;
}

/** Extracts the domain (part after `@`) from an email address. */
function domainFromAddress(fromAddress: string): string {
  const at = fromAddress.lastIndexOf('@');
  return at >= 0 ? fromAddress.slice(at + 1).trim().toLowerCase() : fromAddress.trim().toLowerCase();
}

/** True when the error indicates the name simply has no such record. */
function isMissingRecordError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'ENOTFOUND' || code === 'ENODATA';
}

/** Resolves TXT records, joining each record's chunks. Returns null on any error. */
async function resolveJoinedTxt(name: string): Promise<string[] | null> {
  try {
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch (error) {
    return isMissingRecordError(error) ? [] : null;
  }
}

function checkSpf(records: string[] | null): DnsRecord {
  if (records === null) {
    return { name: 'SPF', status: 'unknown', detail: 'SPF kaydı sorgulanamadı (DNS hatası).' };
  }
  const spf = records.find((r) => r.toLowerCase().startsWith('v=spf1'));
  if (!spf) {
    return {
      name: 'SPF',
      status: 'fail',
      detail: 'SPF kaydı bulunamadı',
      hint: 'Alan adınıza bir SPF TXT kaydı ekleyin (örn. "v=spf1 include:... -all").',
    };
  }
  const lower = spf.toLowerCase();
  if (lower.endsWith('~all') || lower.endsWith('-all')) {
    return { name: 'SPF', status: 'pass', detail: spf };
  }
  if (lower.endsWith('?all') || lower.endsWith('+all')) {
    return {
      name: 'SPF',
      status: 'warn',
      detail: spf,
      hint: '"?all" veya "+all" yetersizdir; "~all" (softfail) veya "-all" (fail) kullanın.',
    };
  }
  return {
    name: 'SPF',
    status: 'warn',
    detail: spf,
    hint: 'SPF kaydı bir "all" mekanizmasıyla bitmiyor; "~all" veya "-all" ekleyin.',
  };
}

function checkDmarc(records: string[] | null): DnsRecord {
  if (records === null) {
    return { name: 'DMARC', status: 'unknown', detail: 'DMARC kaydı sorgulanamadı (DNS hatası).' };
  }
  const dmarc = records.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
  if (!dmarc) {
    return {
      name: 'DMARC',
      status: 'fail',
      detail: 'DMARC kaydı bulunamadı',
      hint: '_dmarc alt alan adına bir TXT kaydı ekleyin (örn. "v=DMARC1; p=quarantine").',
    };
  }
  const lower = dmarc.toLowerCase();
  if (lower.includes('p=quarantine') || lower.includes('p=reject')) {
    return { name: 'DMARC', status: 'pass', detail: dmarc };
  }
  if (lower.includes('p=none')) {
    return {
      name: 'DMARC',
      status: 'warn',
      detail: dmarc,
      hint: '"p=none" yalnızca izleme yapar; teslimat için "p=quarantine" veya "p=reject" kullanın.',
    };
  }
  return {
    name: 'DMARC',
    status: 'warn',
    detail: dmarc,
    hint: 'DMARC politikası belirsiz; "p=quarantine" veya "p=reject" ayarlayın.',
  };
}

function checkDkim(records: string[] | null, lookupName: string): DnsRecord {
  if (records === null) {
    return { name: 'DKIM', status: 'unknown', detail: 'DKIM kaydı sorgulanamadı (DNS hatası).' };
  }
  // Authoritative match only: a real DKIM record declares v=DKIM1, names a key
  // algorithm, or carries a long base64-ish key blob. Bare "k="/"p=" substrings
  // are too broad and would pass unrelated TXT records.
  const dkim = records.find((r) => {
    const lower = r.toLowerCase().trim();
    return (
      lower.startsWith('v=dkim1') ||
      lower.includes('k=rsa') ||
      lower.includes('k=ed25519') ||
      /^[a-z0-9+/=;_\s-]{60,}$/.test(lower)
    );
  });
  if (dkim) {
    return { name: 'DKIM', status: 'pass', detail: dkim };
  }
  return {
    name: 'DKIM',
    status: 'fail',
    detail: 'DKIM kaydı bulunamadı',
    hint: `"${lookupName}" kaydı bulunamadı; sağlayıcınızın DKIM TXT kaydını bu adrese ekleyin.`,
  };
}

/** Returns the worst (highest-rank) status across the records. */
function worstStatus(records: DnsRecord[]): DnsCheckStatus {
  return records.reduce<DnsCheckStatus>(
    (worst, r) => (STATUS_RANK[r.status] > STATUS_RANK[worst] ? r.status : worst),
    'pass',
  );
}

/**
 * Checks SPF, DMARC, and DKIM for the sending domain derived from `fromAddress`.
 * Cached in-memory for 5 minutes per `${domain}:${selector}`.
 */
export async function checkDeliverability(
  fromAddress: string,
  dkimSelector: string,
): Promise<DeliverabilityResult> {
  const domain = domainFromAddress(fromAddress);
  const selector = dkimSelector.trim() || FALLBACK_DKIM_SELECTOR;
  const cacheKey = `${domain}:${selector}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const dkimLookup = `${selector}._domainkey.${domain}`;
  const [spfTxt, dmarcTxt, dkimTxt] = await Promise.all([
    resolveJoinedTxt(domain),
    resolveJoinedTxt(`_dmarc.${domain}`),
    resolveJoinedTxt(dkimLookup),
  ]);

  const records: DnsRecord[] = [
    checkSpf(spfTxt),
    checkDmarc(dmarcTxt),
    checkDkim(dkimTxt, dkimLookup),
  ];

  const result: DeliverabilityResult = {
    domain,
    checkedAt: new Date(),
    records,
    overallStatus: worstStatus(records),
  };

  // Bound the cache: evict the oldest (insertion-order) entry on overflow.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
