/**
 * GET /api/track/click/[token]/[urlIndex]
 * Public click-tracking redirect. Resolves the destination from the Send's
 * issue items by `order === urlIndex`, records a `click` EmailEvent, and
 * 302-redirects to the destination. Falls back to '/' for unknown tokens,
 * invalid indices, or non-http(s) destinations. Never throws.
 */

import { NextResponse } from 'next/server';
import { prisma, createEmailEventRepository } from '@digest/db';
import { deriveTrackMeta } from '@/lib/track-meta';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { token: string; urlIndex: string };
}

/** Only redirect to absolute http(s) destinations (open-redirect guard). */
function isSafeRedirect(url: string | null | undefined): url is string {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));
}

function homeRedirect(request: Request): NextResponse {
  return NextResponse.redirect(new URL('/', request.url), 302);
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const urlIndex = Number(params.urlIndex);
    const send = await prisma.send.findUnique({
      where: { trackToken: params.token },
      include: { issue: { include: { items: true } } },
    });

    const destination = send?.issue.items.find((i) => i.order === urlIndex)?.sourceUrl;
    if (!send || !isSafeRedirect(destination)) {
      return homeRedirect(request);
    }

    const now = new Date();
    const { ipHash, uaClass } = deriveTrackMeta(request.headers, now);
    await createEmailEventRepository(prisma).record({
      sendId: send.id,
      type: 'click',
      url: destination,
      urlIndex,
      ipHash,
      uaClass,
      occurredAt: now,
    });

    return NextResponse.redirect(destination, 302);
  } catch {
    return homeRedirect(request);
  }
}
