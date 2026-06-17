import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@mega-bulten/db';
import { UpdateSettingsSchema } from '@mega-bulten/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return NextResponse.json(err('Settings row not found'), { status: 404 });
    }
    return NextResponse.json(ok(settings));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = UpdateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const existing = await prisma.settings.findFirst();
    if (!existing) {
      return NextResponse.json(err('Settings row not found'), { status: 404 });
    }

    const updated = await prisma.settings.update({
      where: { id: existing.id },
      data: parsed.data,
    });

    return NextResponse.json(ok(updated));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
