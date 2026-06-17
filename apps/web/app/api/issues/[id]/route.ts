/**
 * PATCH /api/issues/[id]
 * Save editable fields for a draft or in_review issue.
 * Includes per-item updates and reordering.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@mega-bulten/db';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';

export const dynamic = 'force-dynamic';

const PatchIssueItemSchema = z.object({
  id: z.string().cuid(),
  order: z.number().int().min(0).max(2).optional(),
  titleTr: z.string().min(1).optional(),
  summaryTr: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  sourceName: z.string().min(1).optional(),
});

const PatchIssueSchema = z.object({
  subject: z.string().min(1).optional(),
  preheader: z.string().optional(),
  items: z.array(PatchIssueItemSchema).optional(),
});

interface RouteParams {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const body: unknown = await request.json();
    const parsed = PatchIssueSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(err(parsed.error.message), { status: 400 });
    }

    const issue = await prisma.issue.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });

    if (!issue) {
      return NextResponse.json(err('Issue not found'), { status: 404 });
    }

    const editableStatuses = ['draft', 'in_review'] as const;
    if (!editableStatuses.includes(issue.status as (typeof editableStatuses)[number])) {
      return NextResponse.json(
        err(`Issue is ${issue.status} and cannot be edited`),
        { status: 409 },
      );
    }

    const { subject, preheader, items } = parsed.data;

    await prisma.$transaction(async (tx) => {
      if (subject !== undefined || preheader !== undefined) {
        await tx.issue.update({
          where: { id: params.id },
          data: {
            ...(subject !== undefined ? { subject } : {}),
            ...(preheader !== undefined ? { preheader } : {}),
          },
        });
      }

      if (items && items.length > 0) {
        // Apply item updates — order updates included
        for (const item of items) {
          const { id, ...updateData } = item;
          if (Object.keys(updateData).length === 0) continue;
          await tx.issueItem.update({
            where: { id },
            data: updateData,
          });
        }
      }
    });

    const updated = await prisma.issue.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    return NextResponse.json(ok(updated));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const issue = await prisma.issue.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: { order: 'asc' } },
        sends: { select: { id: true, status: true, subscriberId: true, sentAt: true, error: true } },
      },
    });

    if (!issue) {
      return NextResponse.json(err('Issue not found'), { status: 404 });
    }

    return NextResponse.json(ok(issue));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
