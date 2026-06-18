import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@digest/db';
import { UpdateSubscriberSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const subscriber = await prisma.subscriber.findUnique({ where: { id: params.id } });
    if (!subscriber) {
      return NextResponse.json(err('Abone bulunamadı'), { status: 404 });
    }
    return NextResponse.json(ok(subscriber));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const body: unknown = await request.json();
    const parsed = UpdateSubscriberSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const existing = await prisma.subscriber.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json(err('Abone bulunamadı'), { status: 404 });
    }

    const updated = await prisma.subscriber.update({
      where: { id: params.id },
      data: parsed.data,
    });

    return NextResponse.json(ok(updated));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const existing = await prisma.subscriber.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json(err('Abone bulunamadı'), { status: 404 });
    }

    await prisma.subscriber.delete({ where: { id: params.id } });
    return NextResponse.json(ok({ deleted: true }));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
