/**
 * GET /api/track/open/[token]
 * Public open-tracking pixel. Records an `open` EmailEvent (deduped per
 * ipHash/hour) for the Send identified by `token`, then ALWAYS returns a 1x1
 * transparent GIF. Never throws and never reveals whether the token matched.
 */

import { NextResponse } from 'next/server';
import { prisma, createEmailEventRepository } from '@digest/db';
import { deriveTrackMeta } from '@/lib/track-meta';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/** 1x1 transparent GIF body. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);

/** Dedup window for repeated opens from the same hashed IP. */
const OPEN_DEDUP_WINDOW_MS = 60 * 60 * 1000;

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Length': String(PIXEL.byteLength),
    },
  });
}

export async function GET(request: Request, props: RouteParams): Promise<NextResponse> {
  const params = await props.params;
  try {
    const send = await prisma.send.findUnique({ where: { trackToken: params.token } });
    if (send) {
      const now = new Date();
      const { ipHash, uaClass } = deriveTrackMeta(request.headers, now);
      const events = createEmailEventRepository(prisma);
      const since = new Date(now.getTime() - OPEN_DEDUP_WINDOW_MS);
      const alreadyOpened = await events.hasRecentOpen(send.id, ipHash, since);
      if (!alreadyOpened) {
        await events.record({ sendId: send.id, type: 'open', ipHash, uaClass, occurredAt: now });
      }
    }
  } catch {
    // Tracking must never break the pixel response — swallow and return below.
  }

  return pixelResponse();
}
