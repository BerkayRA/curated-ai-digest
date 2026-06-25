/**
 * /api/deliverability/check — server-side SPF/DMARC/DKIM health check.
 *
 * POST { fromAddress, dkimSelector? } → DeliverabilityResult.
 *
 * Dashboard-guarded (middleware) with same-origin CSRF protection, matching the
 * other dashboard mutation routes. When `dkimSelector` is omitted, the selector
 * is resolved from Settings (configured value, else the provider default).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@digest/db';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import { checkDeliverability, resolveDkimSelector } from '@/lib/dns-check';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const CheckSchema = z.object({
  fromAddress: z.string().email().max(320),
  dkimSelector: z
    .string()
    .max(63)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});

export async function POST(request: NextRequest) {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    // Defense-in-depth: middleware already guards this route.
    const session = await auth();
    if (!session) return NextResponse.json(err('Unauthorized'), { status: 401 });

    const body: unknown = await request.json();
    const parsed = CheckSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const { fromAddress, dkimSelector } = parsed.data;

    let selector = dkimSelector?.trim() ?? '';
    if (!selector) {
      const settings = await prisma.settings.findFirst();
      selector = resolveDkimSelector(
        settings?.dkimSelector ?? null,
        settings?.activeProvider ?? 'acs_email',
      );
    }

    const result = await checkDeliverability(fromAddress, selector);
    return NextResponse.json(ok(result));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
