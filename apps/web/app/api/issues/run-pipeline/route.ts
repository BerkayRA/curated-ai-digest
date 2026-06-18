import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isoWeekSchema } from '@mega-bulten/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { nextIsoWeek } from '@/lib/iso-week';

// The pipeline runs Claude + Exa calls end-to-end; it must run on the Node
// runtime, never be statically optimised, and be granted a long budget.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Body is optional — when omitted we default to next week.
const RunPipelineSchema = z.object({
  isoWeek: isoWeekSchema.optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 503 early when the required curation credentials are absent, so the UI
    // can surface a clear "configure your keys" message instead of a 500.
    if (!process.env['ANTHROPIC_API_KEY'] || !process.env['EXA_API_KEY']) {
      return NextResponse.json(
        err('Curation için ANTHROPIC_API_KEY ve EXA_API_KEY gerekli.'),
        { status: 503 },
      );
    }

    // Body may be empty; tolerate a missing/invalid JSON body and fall back.
    let isoWeek = nextIsoWeek();
    try {
      const body: unknown = await request.json();
      const parsed = RunPipelineSchema.safeParse(body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join('; ');
        return NextResponse.json(err(message), { status: 400 });
      }
      if (parsed.data.isoWeek) isoWeek = parsed.data.isoWeek;
    } catch {
      // No JSON body — keep the nextIsoWeek() default.
    }

    // Heavy deps are dynamically imported so they never enter the edge/client
    // bundle and only load when the pipeline is actually invoked.
    const { runWeeklyPipeline } = await import('@mega-bulten/curation');
    const { renderDigestEmail } = await import('@mega-bulten/email');

    const result = await runWeeklyPipeline({ isoWeek, renderFn: renderDigestEmail });

    return NextResponse.json(
      ok({
        issueId: result.issueId,
        isoWeek: result.isoWeek,
        itemCount: result.itemCount,
        qaFlagCount: result.qaFlags.length,
        costUsd: result.costUsd,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      err(`Curation pipeline çalıştırılamadı: ${getErrorMessage(error)}`),
      { status: 500 },
    );
  }
}
