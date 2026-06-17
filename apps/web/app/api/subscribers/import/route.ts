import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@mega-bulten/db';
import { ok, err } from '@/lib/api-response';
import { parseCsvImport } from '@/lib/csv-import';
import { getErrorMessage } from '@/lib/error';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/** Maximum allowed CSV body size (5 MB). */
const MAX_CSV_BYTES = 5 * 1024 * 1024;

export interface ImportResult {
  imported: number;
  skippedDuplicates: number;
  skippedExisting: number;
  rowErrors: Record<number, string>;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? '';

    let csvText: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json(err('CSV dosyası gerekli (form field: "file")'), { status: 400 });
      }
      const blob = file as Blob;
      if (blob.size > MAX_CSV_BYTES) {
        return NextResponse.json(err('CSV dosyası 5 MB sınırını aşıyor'), { status: 413 });
      }
      csvText = await blob.text();
    } else {
      const body = await request.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_CSV_BYTES) {
        return NextResponse.json(err('CSV dosyası 5 MB sınırını aşıyor'), { status: 413 });
      }
      csvText = body;
    }

    const { valid, rowErrors, duplicatesSkipped } = parseCsvImport(csvText);

    if (valid.length === 0 && Object.keys(rowErrors).length === 0) {
      return NextResponse.json(err('CSV dosyası boş veya geçersiz'), { status: 400 });
    }

    let imported = 0;
    let skippedExisting = 0;

    for (const row of valid) {
      const existing = await prisma.subscriber.findUnique({ where: { email: row.email } });
      if (existing) {
        skippedExisting++;
        continue;
      }

      await prisma.subscriber.create({
        data: {
          email: row.email,
          displayName: row.displayName,
          company: row.company,
          source: 'import',
          unsubscribeToken: randomUUID(),
        },
      });
      imported++;
    }

    const result: ImportResult = {
      imported,
      skippedDuplicates: duplicatesSkipped,
      skippedExisting,
      rowErrors,
    };

    return NextResponse.json(ok(result));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
