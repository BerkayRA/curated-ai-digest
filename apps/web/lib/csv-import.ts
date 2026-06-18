import { SubscriberImportRowSchema } from '@digest/shared';
import type { SubscriberImportRow } from '@digest/shared';

export interface CsvImportResult {
  valid: SubscriberImportRow[];
  /** Row errors keyed by 1-based row number. */
  rowErrors: Record<number, string>;
  duplicatesSkipped: number;
}

/**
 * Parse a raw CSV string (first row = header) into validated import rows.
 * - Validates each row with SubscriberImportRowSchema
 * - Deduplicates by email (case-insensitive, keeps first occurrence)
 * - Collects per-row parse errors without stopping processing
 */
export function parseCsvImport(csvText: string): CsvImportResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { valid: [], rowErrors: {}, duplicatesSkipped: 0 };
  }

  const [headerLine, ...dataLines] = lines;
  if (!headerLine) {
    return { valid: [], rowErrors: {}, duplicatesSkipped: 0 };
  }

  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

  const emailIdx = headers.indexOf('email');
  const displayNameIdx = headers.indexOf('displayname');
  const companyIdx = headers.indexOf('company');

  if (emailIdx === -1) {
    return {
      valid: [],
      rowErrors: { 0: 'CSV must have an "email" column header' },
      duplicatesSkipped: 0,
    };
  }

  const seenEmails = new Set<string>();
  const valid: SubscriberImportRow[] = [];
  const rowErrors: Record<number, string> = {};
  let duplicatesSkipped = 0;

  dataLines.forEach((line, index) => {
    const rowNum = index + 2; // 1-based, row 1 is header
    const cells = splitCsvLine(line);

    const emailCell = cells[emailIdx];
    const displayNameCell = displayNameIdx !== -1 ? cells[displayNameIdx] : undefined;
    const companyCell = companyIdx !== -1 ? cells[companyIdx] : undefined;

    const raw = {
      email: emailCell != null ? emailCell.replace(/['"]/g, '').trim() : '',
      displayName:
        displayNameCell != null
          ? displayNameCell.replace(/['"]/g, '').trim() || undefined
          : undefined,
      company:
        companyCell != null ? companyCell.replace(/['"]/g, '').trim() || undefined : undefined,
    };

    const result = SubscriberImportRowSchema.safeParse(raw);
    if (!result.success) {
      rowErrors[rowNum] = result.error.issues.map((i) => i.message).join('; ');
      return;
    }

    const emailKey = result.data.email.toLowerCase();
    if (seenEmails.has(emailKey)) {
      duplicatesSkipped++;
      return;
    }
    seenEmails.add(emailKey);
    valid.push(result.data);
  });

  return { valid, rowErrors, duplicatesSkipped };
}

/** Split a single CSV line respecting quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
