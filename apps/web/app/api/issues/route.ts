import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@digest/db';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin.js';
import { resolveTopicIdBySlug, resolveTopicIdFromRequest } from '@/lib/resolve-topic';
// CreateIssueDraftSchema is defined in ./schema (not inline) because Next.js
// Route Handlers only allow a fixed set of named exports (HTTP verbs + config).
import { CreateIssueDraftSchema } from './schema';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const topicId = await resolveTopicIdFromRequest(request);
    const issues = await prisma.issue.findMany({
      where: { topicId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        isoWeek: true,
        status: true,
        subject: true,
        preheader: true,
        scheduledAt: true,
        sentAt: true,
        autoSent: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(ok(issues));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = CreateIssueDraftSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const { isoWeek, subject, preheader, items, topicSlug } = parsed.data;

    // The active topic travels in the mutation body as `topicSlug`. A
    // missing/unknown slug degrades to the default topic.
    const topicId = await resolveTopicIdBySlug(topicSlug);

    const existing = await prisma.issue.findUnique({
      where: { topicId_isoWeek: { topicId, isoWeek } },
    });
    if (existing) {
      return NextResponse.json(err('Bu hafta için zaten bir sayı var.'), { status: 409 });
    }

    const issue = await prisma.$transaction(async (tx) => {
      return tx.issue.create({
        data: {
          topicId,
          isoWeek,
          subject,
          ...(preheader ? { preheader } : {}),
          status: 'draft',
          items: {
            create: items.map((item, order) => ({
              order,
              titleTr: item.titleTr,
              summaryTr: item.summaryTr,
              sourceUrl: item.sourceUrl,
              sourceName: item.sourceName,
              ...(item.candidateArticleId ? { candidateArticleId: item.candidateArticleId } : {}),
            })),
          },
        },
        select: { id: true },
      });
    });

    return NextResponse.json(ok({ id: issue.id }), { status: 201 });
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
