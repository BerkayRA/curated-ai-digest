/**
 * test-send.ts — send ONE real digest email through the live Resend provider.
 *
 * This exercises the real render path (renderDigestEmail) + the real
 * ResendEmailProvider end-to-end, with no DB / subscribers / issues required.
 *
 * Run (secrets stay local — never committed). Preferred: put the vars in a
 * gitignored apps/worker/.env.local (see .env.example) and just run:
 *
 *   pnpm --filter @digest/worker test-send
 *
 * Or pass them inline (these override .env.local):
 *
 *   RESEND_API_KEY=re_xxx \
 *   TEST_FROM='Curated AI Digest <onboarding@resend.dev>' \
 *   TEST_TO=you@example.com \
 *   pnpm --filter @digest/worker test-send
 *
 * Optional env:
 *   TEST_SPONSORED=1     → mark the 2nd story sponsored (shows the "Sponsorlu" label)
 *   APP_BASE_URL=...      → absolute base for the email logo (defaults localhost)
 *
 * Resend notes:
 *   - Without a verified domain, `from` must be onboarding@resend.dev and `to`
 *     must be the email you registered your Resend account with.
 *   - With a verified domain, `from` is anything@your-domain and `to` is anyone.
 */

import { renderDigestEmail, ResendEmailProvider } from '@digest/email';
import type { DigestEmailData, EmailMessage } from '@digest/email';
import { loadEnvLocal, required, parseAddress } from './send-helpers';

async function main(): Promise<void> {
  loadEnvLocal();
  required('RESEND_API_KEY'); // read by ResendEmailProvider from env
  const from = parseAddress(required('TEST_FROM'));
  const to = parseAddress(required('TEST_TO'));
  const sponsored = process.env['TEST_SPONSORED'] === '1';
  const assetBaseUrl = process.env['APP_BASE_URL'] ?? 'http://localhost:3100';

  const data: DigestEmailData = {
    subject: 'Yapay Zeka Haftası: Gemini Ultra 2.0 ve Açık Kaynak Savaşı',
    preheader: "Google'ın en büyük modeli rekor kırdı; Meta Llama 4'ü açık kaynak yaptı.",
    issueDate: new Date().toISOString().slice(0, 10),
    issueLabel: 'TEST',
    items: [
      {
        titleTr: 'Google Gemini Ultra 2.0 Yayınlandı: Tüm Kıyaslamalarda Lider',
        summaryTr:
          "Google DeepMind'ın en büyük modeli Gemini Ultra 2.0, MMLU ve HumanEval testlerinde rakiplerini geride bıraktı. 2 milyon token bağlam penceresiyle uzun belgelerde neredeyse hatasız çalışıyor.",
        sourceUrl: 'https://blog.google/technology/ai/gemini-ultra-2-launch',
        sourceName: 'Google Blog',
      },
      {
        titleTr: sponsored
          ? 'Mega Bilgisayar Kurumsal AI Çözümleri'
          : "Meta, Llama 4'ü Açık Kaynak Olarak Yayınladı",
        summaryTr: sponsored
          ? 'Kurumunuza özel, şirket içinde çalışan yapay zeka altyapısı. On-prem kurulum, KVKK uyumu ve uçtan uca destek.'
          : 'Meta AI, 400 milyar parametreli Llama 4 modelini ticari kullanıma açık lisansla yayımladı. Türkçe dahil çok dilli görevlerde güçlü sonuçlar veriyor.',
        sourceUrl: sponsored
          ? 'https://www.megabilgisayar.com.tr'
          : 'https://ai.meta.com/blog/llama-4-open-source-release',
        sourceName: sponsored ? 'Mega Bilgisayar' : 'Meta AI Blog',
        ...(sponsored ? { isSponsored: true } : {}),
      },
    ],
    unsubscribeUrl: `${assetBaseUrl}/unsubscribe?token=test-token`,
    senderAddress: 'Mega Bilgisayar Tic. Ltd. Şti, Ankara, Türkiye',
    assetBaseUrl,
    language: 'tr',
  };

  console.log(`→ Rendering digest (${sponsored ? 'with sponsored slot' : 'editorial only'})…`);
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
    html: rendered.html,
    text: rendered.text,
    headers: {
      'List-Unsubscribe': `<${data.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };

  console.log(`→ Sending to ${to.email} from ${from.email}…`);
  const result = await provider.send(message);
  console.log(`✓ Sent. Provider message id: ${result.providerMessageId}`);
}

main().catch((err: unknown) => {
  console.error('✗ Send failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
