/**
 * Demo seed — inserts one sample DRAFT issue with 3 Turkish AI-news items so the
 * dashboard archive, draft editor, and email preview are populated without needing
 * the live curation pipeline (Anthropic/Exa). Idempotent on isoWeek.
 *
 * Run: pnpm --filter @digest/db exec tsx prisma/seed-demo.ts
 */

import { PrismaClient, IssueStatus } from '@prisma/client';

const prisma = new PrismaClient();

const ISO_WEEK = '2026-W25';
const TOPIC_ID = 'topic_enterprise_ai';

const ITEMS = [
  {
    order: 0,
    titleTr: 'Google Gemini Ultra 2.0 Yayınlandı: Tüm Kıyaslamalarda Liderliği Ele Geçirdi',
    summaryTr:
      'Google, Gemini Ultra 2.0 modelini duyurdu. Yeni model muhakeme, kodlama ve çok dilli görevlerde önceki sürümleri geride bırakarak sektör kıyaslamalarında ilk sıraya yerleşti. Mega müşterileri için kurumsal entegrasyon senaryolarını yakından takip ediyoruz.',
    sourceUrl: 'https://blog.google/technology/ai/gemini-ultra-2-launch',
    sourceName: 'Google Blog',
  },
  {
    order: 1,
    titleTr: "Apple Intelligence Türkiye'de: Siri Artık Türkçe Anlıyor",
    summaryTr:
      "Apple Intelligence, Türkçe dil desteğiyle Türkiye'de kullanıma açıldı. Cihaz üzerinde çalışan yapay zeka, gizliliği koruyarak metin yazımı, özetleme ve Siri etkileşimlerini Türkçe olarak sunuyor. Kurumsal cihaz filoları için önemli bir gelişme.",
    sourceUrl: 'https://www.apple.com/newsroom/2026/03/apple-intelligence-turkey',
    sourceName: 'Apple Newsroom',
  },
  {
    order: 2,
    titleTr: "Meta, Llama 4'ü Açık Kaynak Olarak Yayınladı: 400 Milyar Parametre Serbest",
    summaryTr:
      "Meta, 400 milyar parametreli Llama 4 modelini açık kaynak lisansıyla yayınladı. Şirketler artık modeli kendi altyapılarında barındırarak veri egemenliğini koruyabiliyor. Şirket içi kurulum ve maliyet avantajları değerlendirmemizde öne çıkıyor.",
    sourceUrl: 'https://ai.meta.com/blog/llama-4-open-source-release',
    sourceName: 'Meta AI Blog',
  },
];

async function main(): Promise<void> {
  const existing = await prisma.issue.findFirst({
    where: { topicId: TOPIC_ID, isoWeek: ISO_WEEK },
  });
  if (existing) {
    await prisma.issueItem.deleteMany({ where: { issueId: existing.id } });
    await prisma.issue.delete({ where: { id: existing.id } });
  }

  const issue = await prisma.issue.create({
    data: {
      topicId: TOPIC_ID,
      isoWeek: ISO_WEEK,
      status: IssueStatus.draft,
      subject: 'Yapay Zeka Haftası: Gemini Ultra 2.0, Apple Intelligence ve Açık Kaynak Savaşı',
      preheader: "Bu hafta yapay zeka dünyasında öne çıkan 3 gelişmeyi Curated AI Digest için derledik.",
      items: { create: ITEMS },
    },
    include: { items: true },
  });

  console.log(`Demo issue seeded: ${issue.isoWeek} (${issue.items.length} items, status=${issue.status})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
