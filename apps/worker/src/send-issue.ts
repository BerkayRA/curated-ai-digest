/**
 * send-issue.ts — send ONE real, already-drafted Issue as a preview email
 * through the live Resend provider, to a single test recipient.
 *
 * Unlike test-send.ts (synthetic sample data), this loads the actual Issue and
 * its curated items from the database and renders them with the exact same
 * mapping the production dispatcher uses (buildDigestEmailData) — including the
 * sponsored-slot consent gate and per-topic brand/language props. So what lands
 * in your inbox is what real subscribers would get, minus per-recipient open/
 * click tracking (skipped: preview tokens don't exist in the DB).
 *
 * This is a PREVIEW, not a dispatch. It does NOT read subscribers, does NOT
 * change the issue status, and does NOT write Send rows.
 *
 * Env (apps/worker/.env.local — gitignored):
 *   DATABASE_URL     the local Postgres the pipeline drafts into
 *   RESEND_API_KEY   re_...  (read by ResendEmailProvider)
 *   TEST_FROM        e.g. 'Curated AI Digest <onboarding@resend.dev>'
 *   TEST_TO          your Resend signup email (unverified domain constraint)
 *   APP_BASE_URL     optional — absolute base for the email logo (default localhost:3100)
 *
 * Usage:
 *   pnpm --filter @digest/worker send-issue --iso-week 2026-W30
 *   pnpm --filter @digest/worker send-issue --issue-id <cuid>
 *   pnpm --filter @digest/worker send-issue                      # latest issue (any topic)
 *   pnpm --filter @digest/worker send-issue --iso-week 2026-W30 --topic enterprise-ai
 *
 * Resend notes (unverified domain): `from` must be onboarding@resend.dev and
 * `to` must be the email you registered your Resend account with.
 */

import { prisma } from '@digest/db';
import { renderDigestEmail, ResendEmailProvider } from '@digest/email';
import type { EmailMessage } from '@digest/email';
import { buildDigestEmailData, defaultDispatchRepo } from '@digest/delivery';
import { loadEnvLocal, required, parseAddress } from './send-helpers';

/** Parse `--flag value` pairs from argv into a small option bag. */
interface CliArgs {
  issueId?: string;
  isoWeek?: string;
  topicSlug?: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--issue-id' && value) {
      args.issueId = value;
      i++;
    } else if (flag === '--iso-week' && value) {
      args.isoWeek = value;
      i++;
    } else if (flag === '--topic' && value) {
      args.topicSlug = value;
      i++;
    }
  }
  return args;
}

const ISSUE_INCLUDE = { items: { orderBy: { order: 'asc' as const } } };

/**
 * Resolve the target issue from the CLI args, in precedence order:
 *   --issue-id → exact issue
 *   --iso-week → that week within the resolved topic (--topic slug, else default)
 *   (neither) → the most recently created issue, any topic
 */
async function resolveIssue(args: CliArgs) {
  if (args.issueId) {
    return prisma.issue.findUnique({ where: { id: args.issueId }, include: ISSUE_INCLUDE });
  }

  if (args.isoWeek) {
    let topicId: string;
    if (args.topicSlug) {
      const topic = await prisma.topic.findUnique({ where: { slug: args.topicSlug } });
      if (!topic) {
        console.error(`✗ No topic with slug '${args.topicSlug}'`);
        process.exit(1);
      }
      topicId = topic.id;
    } else {
      const topic = await prisma.topic.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
      });
      if (!topic) {
        console.error('✗ No active topic found');
        process.exit(1);
      }
      topicId = topic.id;
    }
    return prisma.issue.findFirst({
      where: { topicId, isoWeek: args.isoWeek },
      include: ISSUE_INCLUDE,
    });
  }

  return prisma.issue.findFirst({ orderBy: { createdAt: 'desc' }, include: ISSUE_INCLUDE });
}

async function main(): Promise<void> {
  loadEnvLocal();
  required('RESEND_API_KEY'); // read by ResendEmailProvider from env
  const from = parseAddress(required('TEST_FROM'));
  const to = parseAddress(required('TEST_TO'));

  const args = parseArgs(process.argv.slice(2));

  const issue = await resolveIssue(args);
  if (!issue) {
    const which = args.issueId
      ? `id '${args.issueId}'`
      : args.isoWeek
        ? `week '${args.isoWeek}'${args.topicSlug ? ` (topic '${args.topicSlug}')` : ''}`
        : 'the latest draft';
    console.error(`✗ No issue found for ${which}. Draft one first via the pipeline.`);
    process.exit(1);
  }

  console.log(`→ Loaded issue ${issue.isoWeek} (${issue.id})`);
  console.log(`  status: ${issue.status} · items: ${issue.items.length}`);

  // Resolve per-topic branding (From footer / language / white-label) exactly
  // as the dispatcher would, then build the same DigestEmailData contract.
  const branding = await defaultDispatchRepo.getTopicBranding(issue.topicId);
  const senderAddress =
    branding?.brandFooterText ?? 'Mega Bilgisayar Tic. Ltd. Şti, Ankara, Türkiye';
  const assetBaseUrl = process.env['APP_BASE_URL'] ?? 'http://localhost:3100';

  // Preview unsubscribe link — a placeholder token (no real subscriber exists).
  const unsubscribeUrl = `${assetBaseUrl}/unsubscribe?token=preview`;

  const data = buildDigestEmailData(issue, unsubscribeUrl, senderAddress, issue.subject, branding);

  console.log('→ Rendering the drafted issue…');
  const rendered = await renderDigestEmail(data);

  const provider = new ResendEmailProvider();
  const check = await provider.verifyConfig();
  if (!check.ok) {
    console.error(`✗ Resend not configured: ${check.detail}`);
    process.exit(1);
  }

  const message: EmailMessage = {
    to,
    from,
    subject: data.subject,
    html: rendered.html, // NOTE: no tracking hooks — this is a preview, not a dispatch.
    text: rendered.text,
    headers: {
      'List-Unsubscribe': `<${data.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };

  console.log(`→ Sending "${data.subject}" to ${to.email} from ${from.email}…`);
  const result = await provider.send(message);
  console.log(`✓ Sent. Provider message id: ${result.providerMessageId}`);
  console.log('  (preview only — issue status unchanged, no Send rows written)');
}

main()
  .catch((err: unknown) => {
    console.error('✗ Send failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
