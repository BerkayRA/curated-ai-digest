/**
 * POST /api/issues/[id]/preview
 * Renders the current (possibly unsaved) issue as email HTML + text.
 * Returns { html, text } — consumed by the live preview iframe.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderDigestEmail } from '@mega-bulten/email';
import type { DigestEmailData, DigestItem } from '@mega-bulten/email';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';

export const dynamic = 'force-dynamic';

const PreviewItemSchema = z.object({
  titleTr: z.string().min(1),
  summaryTr: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceName: z.string().min(1),
});

const PreviewBodySchema = z.object({
  subject: z.string().min(1),
  preheader: z.string().optional(),
  isoWeek: z.string().optional(),
  issueDate: z.string().optional(),
  items: z.array(PreviewItemSchema).min(2).max(3),
});

interface RouteParams {
  params: { id: string };
}

export async function POST(request: Request, { params: _params }: RouteParams) {
  try {
    const body: unknown = await request.json();
    const parsed = PreviewBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(err(parsed.error.message), { status: 400 });
    }

    const { subject, preheader, isoWeek, issueDate, items } = parsed.data;

    const digestItems = items as DigestItem[];

    const data: DigestEmailData = {
      subject,
      preheader: preheader ?? '',
      issueDate: issueDate ?? new Date().toISOString().split('T')[0]!,
      issueLabel: isoWeek ?? '',
      items: (digestItems.length >= 3
        ? [digestItems[0]!, digestItems[1]!, digestItems[2]!]
        : [digestItems[0]!, digestItems[1]!]) as DigestEmailData['items'],
      unsubscribeUrl: '#',
      senderAddress: 'Mega Bilgisayar Tic. Ltd. Şti, Ankara, Türkiye',
    };

    const rendered = await renderDigestEmail(data);

    return NextResponse.json(ok(rendered));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
