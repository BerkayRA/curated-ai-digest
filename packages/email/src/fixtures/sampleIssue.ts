import type { DigestEmailData } from '../types.js';

/**
 * Realistic Turkish-language sample issue for dev preview and vitest tests.
 * Content focuses on AI industry news — the core editorial topic of Mega Bülten.
 */
export const sampleIssue: DigestEmailData = {
  subject: 'Yapay Zeka Haftası: Gemini Ultra 2.0, Apple Intelligence ve Açık Kaynak Savaşı',
  preheader:
    "Google'ın en büyük modeli rekorlar kırdı; Apple, gizlilik odaklı yapay zekasını Türkiye'ye açıyor; Meta ise Llama 4'ü açık kaynak yaptı.",
  issueDate: '2026-06-16',
  issueLabel: '#12',
  items: [
    {
      titleTr: "Google Gemini Ultra 2.0 Yayınlandı: Tüm Kıyaslamalarda Liderliği Ele Geçirdi",
      summaryTr:
        "Google DeepMind'ın en büyük modeli Gemini Ultra 2.0, MMLU, HumanEval ve MATH testlerinin tamamında GPT-4o ve Claude 3 Opus'u geride bıraktı. Model, 2 milyon token bağlam penceresiyle uzun belgeler üzerinde neredeyse hatasız çalışıyor. Kurumsal kullanıcılar için Google Workspace'e entegrasyon bu ay başlıyor.",
      sourceUrl: 'https://blog.google/technology/ai/gemini-ultra-2-launch',
      sourceName: 'Google Blog',
    },
    {
      titleTr: "Apple Intelligence Türkiye'de: Siri Artık Türkçe Anlıyor",
      summaryTr:
        "Apple, kişisel yapay zeka sistemini iOS 18.4 güncellemesiyle Türkiye'ye taşıdı. Cihaz üzerinde çalışan modeller, bulut sunucularına veri göndermeden metin özetleme, e-posta taslağı hazırlama ve akıllı bildirim önceliklendirmesi yapabiliyor. Gizlilik mimarisi, Apple Silicon üzerindeki güvenli enklave sayesinde üçüncü taraf erişimini donanım düzeyinde engelliyor.",
      sourceUrl: 'https://www.apple.com/newsroom/2026/03/apple-intelligence-turkey',
      sourceName: 'Apple Newsroom',
    },
    {
      titleTr: "Meta, Llama 4'ü Açık Kaynak Olarak Yayınladı: 400 Milyar Parametre Serbest",
      summaryTr:
        "Meta AI, 400 milyar parametreli Llama 4 modelini ticari kullanıma açık lisansla GitHub'a yükledi. Model, özellikle Türkçe dahil çok dilli görevlerde GPT-3.5 seviyesini aşıyor. Açık kaynak topluluğu modeli ilk 24 saatte 2 milyondan fazla kez indirdi; Hugging Face üzerinde onlarca ince ayar çalışması başladı.",
      sourceUrl: 'https://ai.meta.com/blog/llama-4-open-source-release',
      sourceName: 'Meta AI Blog',
    },
  ],
  unsubscribeUrl: '{{unsubscribeUrl}}',
  senderAddress: 'Mega Bilgisayar Tic. Ltd. Şti, Ankara, Türkiye',
  assetBaseUrl: 'https://bulten.megabilgisayar.com.tr',
};

/** Two-item variant for test coverage of the 2-item render path. */
export const sampleIssueTwoItems: DigestEmailData = {
  ...sampleIssue,
  issueLabel: '#11',
  items: [sampleIssue.items[0], sampleIssue.items[1]] as [
    (typeof sampleIssue.items)[0],
    (typeof sampleIssue.items)[1],
  ],
};
