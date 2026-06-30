import {
  prisma,
  createAnalyticsRepository,
  createTopicRepository,
  createSendTimeRepository,
} from '@digest/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { AnalyticsClient } from '@/components/analytics/AnalyticsClient';
import { resolveTopicIdBySlug } from '@/lib/resolve-topic';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Analitik — Curated AI Digest',
};

export default async function AnalyticsPage(
  props: {
    searchParams?: Promise<{ topic?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const topicId = await resolveTopicIdBySlug(searchParams?.topic);
  const analytics = createAnalyticsRepository(prisma);

  const [summary, issues, topClicks, growth, topic, sendTimeHint] = await Promise.all([
    analytics.getTopicSummary(topicId),
    analytics.getIssueHistory(topicId),
    analytics.getTopClickedUrls(topicId),
    analytics.getSubscriberGrowth(topicId),
    createTopicRepository(prisma).findById(topicId),
    createSendTimeRepository(prisma).getOptimalSendWindow(topicId),
  ]);

  return (
    <section aria-label="Analitik">
      <PageHeader
        title="Analitik"
        description="Gönderim, açılma, tıklama ve abone büyümesi — etkin konu için."
      />
      <AnalyticsClient
        summary={summary}
        issues={issues}
        topClicks={topClicks}
        growth={growth}
        topicName={topic?.name ?? null}
        sendTimeHint={sendTimeHint}
      />
    </section>
  );
}
