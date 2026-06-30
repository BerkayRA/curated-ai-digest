/**
 * Scheduler tests.
 *
 *  - settingsToCronExpressions: pure cron-derivation helper.
 *  - startScheduler: per-topic cron registration, global-settings fallback,
 *    polling reload, and handle.stop() cleanup.
 *
 * croner's Cron and @digest/db are mocked so no real timers or DB are touched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (must be hoisted before importing the module under test)
// ---------------------------------------------------------------------------

interface FakeCron {
  expression: string;
  name: string;
  timezone: string;
  fn: () => unknown;
  stop: ReturnType<typeof vi.fn>;
}

const cronInstances: FakeCron[] = [];

// Regular (constructable) function — the scheduler calls `new Cron(...)`, and
// Vitest 4 constructs mock implementations via Reflect.construct (arrow fns are
// not constructable). Returning an object makes `new CronMock()` yield it.
const CronMock = vi.fn(function (
  expression: string,
  options: { name: string; timezone: string },
  fn: () => unknown,
): FakeCron {
  const instance: FakeCron = {
    expression,
    name: options.name,
    timezone: options.timezone,
    fn,
    stop: vi.fn(),
  };
  cronInstances.push(instance);
  return instance;
});

vi.mock('croner', () => ({ Cron: CronMock }));

const issueFindUnique = vi.fn().mockResolvedValue(null);

vi.mock('@digest/db', () => ({
  prisma: { issue: { findUnique: (...args: unknown[]) => issueFindUnique(...args) } },
  createTopicRepository: vi.fn(),
}));

vi.mock('@digest/delivery', () => ({ runAbWinnerJob: vi.fn().mockResolvedValue(null) }));

vi.mock('../jobs/send', () => ({ runSendJob: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../jobs/curate', () => ({ runCurationJob: vi.fn().mockResolvedValue(undefined) }));

const { runSendJob } = await import('../jobs/send');
const { runAbWinnerJob } = await import('@digest/delivery');

const { settingsToCronExpressions, startScheduler, SCHEDULE_RELOAD_INTERVAL_MS } = await import(
  '../scheduler'
);
import type {
  SchedulerSettings,
  ScheduleTopic,
  GlobalSchedulerSettings,
  SchedulerDataSource,
} from '../scheduler';
import type { Logger } from '../logger';

// ---------------------------------------------------------------------------
// settingsToCronExpressions
// ---------------------------------------------------------------------------

function settings(overrides: Partial<SchedulerSettings> = {}): SchedulerSettings {
  return {
    sendDayOfWeek: 'Thursday',
    sendTime: '09:00',
    pipelineLeadDays: 2,
    ...overrides,
  };
}

describe('settingsToCronExpressions', () => {
  it('produces the correct send cron for Thursday 09:00', () => {
    const { send } = settingsToCronExpressions(settings());
    expect(send).toBe('0 9 * * 4');
  });

  it('produces the curation cron 2 days before Thursday (Tuesday = 2)', () => {
    const { curation } = settingsToCronExpressions(settings());
    expect(curation).toBe('0 5 * * 2');
  });

  it('handles Monday sendDay with 1 lead day → curation on Sunday (0)', () => {
    const { send, curation } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Monday', pipelineLeadDays: 1 }),
    );
    expect(send).toBe('0 9 * * 1');
    expect(curation).toBe('0 5 * * 0');
  });

  it('handles Sunday sendDay with 2 lead days → curation wraps to Friday (5)', () => {
    const { curation } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Sunday', sendTime: '08:30', pipelineLeadDays: 2 }),
    );
    expect(curation).toBe('0 5 * * 5');
  });

  it('handles 0 lead days → curation on same day as send', () => {
    const { curation, send } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Wednesday', pipelineLeadDays: 0 }),
    );
    expect(curation).toBe('0 5 * * 3');
    expect(send).toBe('0 9 * * 3');
  });

  it('parses sendTime minutes correctly for 14:30', () => {
    const { send } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Friday', sendTime: '14:30' }),
    );
    expect(send).toBe('30 14 * * 5');
  });

  it('handles full week wrap: Saturday sendDay with 3 lead days → Wednesday (3)', () => {
    const { curation } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Saturday', pipelineLeadDays: 3 }),
    );
    expect(curation).toBe('0 5 * * 3');
  });
});

// ---------------------------------------------------------------------------
// startScheduler
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const globalSettings: GlobalSchedulerSettings = {
  sendDayOfWeek: 'Thursday',
  sendTime: '09:00',
  timezone: 'Europe/Istanbul',
  pipelineLeadDays: 2,
  autoSendEnabled: false,
};

function topic(overrides: Partial<ScheduleTopic> = {}): ScheduleTopic {
  return {
    id: 'topic-1',
    sendDayOfWeek: null,
    sendTime: null,
    timezone: null,
    pipelineLeadDays: null,
    autoSendEnabled: null,
    ...overrides,
  };
}

/** A data source whose reload never changes anything (used when poll is irrelevant). */
function staticDataSource(
  topics: ScheduleTopic[],
  s: GlobalSchedulerSettings | null = globalSettings,
): SchedulerDataSource {
  return {
    loadTopics: vi.fn().mockResolvedValue(topics),
    loadSettings: vi.fn().mockResolvedValue(s),
  };
}

describe('startScheduler', () => {
  beforeEach(() => {
    cronInstances.length = 0;
    CronMock.mockClear();
    vi.mocked(runSendJob).mockClear();
    vi.mocked(runAbWinnerJob).mockClear();
    issueFindUnique.mockReset();
    issueFindUnique.mockResolvedValue(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers six Cron instances (3 per topic) for two active topics', () => {
    const topics = [topic({ id: 'topic-a' }), topic({ id: 'topic-b' })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    expect(cronInstances).toHaveLength(6);
    const names = cronInstances.map((c) => c.name).sort();
    expect(names).toEqual([
      'abcheck:topic-a',
      'abcheck:topic-b',
      'curation:topic-a',
      'curation:topic-b',
      'send:topic-a',
      'send:topic-b',
    ]);

    handle.stop();
  });

  it('registers the A/B-check cron 4 hours after the send cron on the same day', () => {
    const topics = [topic({ id: 'topic-a' })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    // Global: Thursday (4) 09:00 → A/B-check at 13:00 the same day.
    const abcheck = cronInstances.find((c) => c.name === 'abcheck:topic-a');
    expect(abcheck?.expression).toBe('0 13 * * 4');

    handle.stop();
  });

  it('rolls the A/B-check day forward when the holdout crosses midnight', () => {
    // Thursday (4) 21:00 → +4h holdout = 01:00 next day (Friday = 5).
    const topics = [topic({ id: 'topic-a', sendDayOfWeek: 'Thursday', sendTime: '21:00' })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    const abcheck = cronInstances.find((c) => c.name === 'abcheck:topic-a');
    expect(abcheck?.expression).toBe('0 1 * * 5');

    handle.stop();
  });

  it('A/B-check callback no-ops when the issue abStatus is not testing', async () => {
    const topics = [topic({ id: 'topic-a' })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    issueFindUnique.mockResolvedValueOnce({ id: 'issue-1', abStatus: 'completed' });
    const abcheck = cronInstances.find((c) => c.name === 'abcheck:topic-a');
    await abcheck?.fn();

    expect(vi.mocked(runAbWinnerJob)).not.toHaveBeenCalled();

    handle.stop();
  });

  it('A/B-check callback runs the winner job when the issue is testing', async () => {
    const topics = [topic({ id: 'topic-a' })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    issueFindUnique.mockResolvedValueOnce({ id: 'issue-1', abStatus: 'testing' });
    const abcheck = cronInstances.find((c) => c.name === 'abcheck:topic-a');
    await abcheck?.fn();

    expect(vi.mocked(runAbWinnerJob)).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'issue-1' }),
    );

    handle.stop();
  });

  it('uses global settings expressions when topic schedule fields are null', () => {
    const topics = [topic({ id: 'topic-a' })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    const send = cronInstances.find((c) => c.name === 'send:topic-a');
    const curation = cronInstances.find((c) => c.name === 'curation:topic-a');
    // Global: Thursday 09:00 (send dow 4), leadDays 2 → curation Tuesday (2).
    expect(send?.expression).toBe('0 9 * * 4');
    expect(curation?.expression).toBe('0 5 * * 2');
    expect(send?.timezone).toBe('Europe/Istanbul');

    handle.stop();
  });

  it('lets a topic override global sendDayOfWeek/sendTime', () => {
    const topics = [
      topic({ id: 'topic-a', sendDayOfWeek: 'Monday', sendTime: '14:30', timezone: 'UTC' }),
    ];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    const send = cronInstances.find((c) => c.name === 'send:topic-a');
    // Monday = 1, 14:30. leadDays falls back to global (2) → Saturday (6).
    expect(send?.expression).toBe('30 14 * * 1');
    expect(send?.timezone).toBe('UTC');

    handle.stop();
  });

  it('stops previous crons before re-registering on reload', async () => {
    const initial = [topic({ id: 'topic-a' })];
    const dataSource = staticDataSource([topic({ id: 'topic-b' })]);

    const handle = startScheduler({
      topics: initial,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource,
      reloadIntervalMs: 1000,
    });

    const initialCrons = [...cronInstances];
    expect(initialCrons).toHaveLength(3); // topic-a trio

    // Trigger the poll and let the async reload settle.
    await vi.advanceTimersByTimeAsync(1000);

    // Previous crons stopped, new ones registered for topic-b.
    for (const cron of initialCrons) {
      expect(cron.stop).toHaveBeenCalled();
    }
    expect(dataSource.loadTopics).toHaveBeenCalled();
    const reloaded = cronInstances.filter((c) => c.name.endsWith('topic-b'));
    expect(reloaded).toHaveLength(3);

    handle.stop();
  });

  it('stop() clears the poll timer and stops all crons', async () => {
    const dataSource = staticDataSource([topic({ id: 'topic-a' })]);
    const handle = startScheduler({
      topics: [topic({ id: 'topic-a' })],
      settings: globalSettings,
      logger: makeLogger(),
      dataSource,
      reloadIntervalMs: 1000,
    });

    const crons = [...cronInstances];
    handle.stop();

    for (const cron of crons) {
      expect(cron.stop).toHaveBeenCalled();
    }

    // Timer cleared: advancing time must not trigger another reload.
    vi.mocked(dataSource.loadTopics).mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(dataSource.loadTopics).not.toHaveBeenCalled();
  });

  it('exposes a 5-minute reload interval constant', () => {
    expect(SCHEDULE_RELOAD_INTERVAL_MS).toBe(5 * 60_000);
  });

  it('passes the global autoSendEnabled fallback into runSendJob', async () => {
    // Topic leaves autoSendEnabled null → falls back to global (false).
    const topics = [topic({ id: 'topic-a' })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    const send = cronInstances.find((c) => c.name === 'send:topic-a');
    await send?.fn();

    expect(vi.mocked(runSendJob)).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: 'topic-a', autoSendEnabled: false }),
    );

    handle.stop();
  });

  it('passes a topic-level autoSendEnabled override into runSendJob', async () => {
    // Topic sets autoSendEnabled true; global is false → resolves to true.
    const topics = [topic({ id: 'topic-a', autoSendEnabled: true })];
    const handle = startScheduler({
      topics,
      settings: globalSettings,
      logger: makeLogger(),
      dataSource: staticDataSource(topics),
    });

    const send = cronInstances.find((c) => c.name === 'send:topic-a');
    await send?.fn();

    expect(vi.mocked(runSendJob)).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: 'topic-a', autoSendEnabled: true }),
    );

    handle.stop();
  });
});
