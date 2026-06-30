/**
 * Scheduler — registers per-topic timezone-aware croner job pairs.
 *
 * For each ACTIVE topic it registers two crons:
 *   1. Curation job: pipelineLeadDays before send day
 *   2. Send job:     on send day at send time
 *
 * Topic schedule fields are nullable; when null they fall back to the global
 * Settings row. The active topic set + global settings are re-read on a fixed
 * polling interval (SCHEDULE_RELOAD_INTERVAL_MS) so dashboard changes (pausing
 * a topic, editing its schedule) take effect without a worker restart.
 *
 * Exposes pure helper settingsToCronExpressions() for unit testing.
 */

import { Cron } from 'croner';
import { createTopicRepository, prisma } from '@digest/db';
import { runAbWinnerJob } from '@digest/delivery';
import type { Logger } from './logger';
import { runCurationJob } from './jobs/curate';
import { runSendJob } from './jobs/send';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often the scheduler re-reads active topics + settings and re-registers crons. */
export const SCHEDULE_RELOAD_INTERVAL_MS = 5 * 60_000;

/** Holdout window (hours after send) before the A/B winner is selected. */
export const AB_HOLDOUT_HOURS = 4;

const DEFAULT_TIMEZONE = 'Europe/Istanbul';

// ---------------------------------------------------------------------------
// Day-of-week mapping
// ---------------------------------------------------------------------------

type DayName = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

const DAY_INDEX: Readonly<Record<DayName, number>> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// ---------------------------------------------------------------------------
// Cron expression builder
// ---------------------------------------------------------------------------

export interface SchedulerSettings {
  readonly sendDayOfWeek: string;
  readonly sendTime: string; // "HH:mm"
  readonly pipelineLeadDays: number;
}

export interface CronExpressions {
  /** Cron expression for the curation job (pipelineLeadDays before send). */
  readonly curation: string;
  /** Cron expression for the send job (on send day at send time). */
  readonly send: string;
}

/**
 * Converts Settings fields to two croner cron expressions.
 *
 * Standard 5-field cron format: "<minute> <hour> day-of-month month <dow>".
 * Both expressions wildcard day-of-month + month, so the shape is
 * "<minute> <hour> * * <dow>".
 *
 * pipelineLeadDays: number of days BEFORE send day that curation should run.
 * Example: sendDayOfWeek=Thursday (4), pipelineLeadDays=2 → curation runs on Tuesday (2).
 * If leadDays > 6, we clamp to 0 (same day) with a warning; caller can decide.
 */
export function settingsToCronExpressions(settings: SchedulerSettings): CronExpressions {
  const [hourStr, minuteStr] = settings.sendTime.split(':');
  const hour = parseInt(hourStr ?? '9', 10);
  const minute = parseInt(minuteStr ?? '0', 10);

  const sendDow = DAY_INDEX[settings.sendDayOfWeek as DayName] ?? 4; // default Thursday

  // Curation runs pipelineLeadDays before the send day
  const curationDow = ((sendDow - settings.pipelineLeadDays) % 7 + 7) % 7;

  // Curation runs at the same time but 1 hour earlier (if same day, 2 hours earlier)
  // to ensure it's done before the send window. Use a fixed early-morning time instead
  // to keep it simple and predictable: run curation at 05:00 on its day.
  const curationCron = `0 5 * * ${curationDow}`;
  const sendCron = `${minute} ${hour} * * ${sendDow}`;

  return { curation: curationCron, send: sendCron };
}

// ---------------------------------------------------------------------------
// Resolved per-topic schedule
// ---------------------------------------------------------------------------

/** Minimal shape of an active Topic the scheduler needs. */
export interface ScheduleTopic {
  readonly id: string;
  readonly sendDayOfWeek: string | null;
  readonly sendTime: string | null;
  readonly timezone: string | null;
  readonly pipelineLeadDays: number | null;
  readonly autoSendEnabled: boolean | null;
}

/** Global Settings fields the scheduler falls back to for null topic fields. */
export interface GlobalSchedulerSettings {
  readonly sendDayOfWeek: string;
  readonly sendTime: string;
  readonly timezone: string;
  readonly pipelineLeadDays: number;
  readonly autoSendEnabled: boolean;
}

interface ResolvedSchedule {
  readonly sendDayOfWeek: string;
  readonly sendTime: string;
  readonly timezone: string;
  readonly pipelineLeadDays: number;
  readonly autoSendEnabled: boolean;
}

/**
 * Resolves a topic's effective schedule by falling back to global Settings for
 * each null field. Returns an immutable resolved schedule.
 */
function resolveTopicSchedule(
  topic: ScheduleTopic,
  settings: GlobalSchedulerSettings,
): ResolvedSchedule {
  return {
    sendDayOfWeek: topic.sendDayOfWeek ?? settings.sendDayOfWeek,
    sendTime: topic.sendTime ?? settings.sendTime,
    timezone: topic.timezone ?? settings.timezone,
    pipelineLeadDays: topic.pipelineLeadDays ?? settings.pipelineLeadDays,
    autoSendEnabled: topic.autoSendEnabled ?? settings.autoSendEnabled,
  };
}

// ---------------------------------------------------------------------------
// Cron registration (per topic)
// ---------------------------------------------------------------------------

/**
 * Registers the curation, send, and A/B-check crons for a single topic and
 * returns all three Cron instances. Job callbacks pass the topicId through to
 * the underlying jobs. The A/B-check cron fires AB_HOLDOUT_HOURS after the send
 * cron and only acts on issues still in 'testing'.
 */
function registerTopicCrons(
  topic: ScheduleTopic,
  settings: GlobalSchedulerSettings,
  logger: Logger,
): readonly Cron[] {
  const resolved = resolveTopicSchedule(topic, settings);
  const expressions = settingsToCronExpressions(resolved);
  const { timezone, autoSendEnabled } = resolved;
  const { id: topicId } = topic;

  logger.info('scheduler.topic.register', {
    topicId,
    curationCron: expressions.curation,
    sendCron: expressions.send,
    timezone,
  });

  const curationJob = new Cron(
    expressions.curation,
    {
      timezone,
      name: `curation:${topicId}`,
      catch: (err: Error | unknown) => {
        logger.error('scheduler.curation.error', {
          topicId,
          message: err instanceof Error ? err.message : String(err),
        });
      },
    },
    async () => {
      const isoWeek = currentIsoWeek();
      logger.info('scheduler.curation.trigger', { topicId, isoWeek });
      await runCurationJob({ logger, isoWeek, topicId });
    },
  );

  const sendJob = new Cron(
    expressions.send,
    {
      timezone,
      name: `send:${topicId}`,
      catch: (err: Error | unknown) => {
        logger.error('scheduler.send.error', {
          topicId,
          message: err instanceof Error ? err.message : String(err),
        });
      },
    },
    async () => {
      const isoWeek = currentIsoWeek();
      logger.info('scheduler.send.trigger', { topicId, isoWeek });
      await runSendJob({ logger, isoWeek, topicId, autoSendEnabled });
    },
  );

  // A/B-check job: fires AB_HOLDOUT_HOURS after the send cron on the same day,
  // selecting the winner for any issue still in 'testing'. Re-parse the resolved
  // send time so the offset matches settingsToCronExpressions exactly.
  const [hourStr, minuteStr] = resolved.sendTime.split(':');
  const sendHour = parseInt(hourStr ?? '9', 10);
  const sendMinute = parseInt(minuteStr ?? '0', 10);
  const sendDow = DAY_INDEX[resolved.sendDayOfWeek as DayName] ?? 4;
  const abCheckHour = (sendHour + AB_HOLDOUT_HOURS) % 24;
  // When the holdout pushes the check past midnight, roll the day forward too.
  const abCheckDow = abCheckHour < sendHour ? (sendDow + 1) % 7 : sendDow;
  const abCheckCron = `${sendMinute} ${abCheckHour} * * ${abCheckDow}`;

  const abCheckJob = new Cron(
    abCheckCron,
    {
      timezone,
      name: `abcheck:${topicId}`,
      catch: (err: Error | unknown) => {
        logger.error('scheduler.abcheck.error', {
          topicId,
          message: err instanceof Error ? err.message : String(err),
        });
      },
    },
    async () => {
      const isoWeek = currentIsoWeek();
      logger.info('scheduler.abcheck.trigger', { topicId, isoWeek });
      const issue = await prisma.issue.findUnique({
        where: { topicId_isoWeek: { topicId, isoWeek } },
        select: { id: true, abStatus: true },
      });
      if (issue?.abStatus === 'testing') {
        await runAbWinnerJob({ issueId: issue.id, logger });
      }
    },
  );

  return [curationJob, sendJob, abCheckJob];
}

// ---------------------------------------------------------------------------
// ISO week helper (used by jobs to determine current week)
// ---------------------------------------------------------------------------

export function currentIsoWeek(): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Scheduler handle + options
// ---------------------------------------------------------------------------

export interface SchedulerHandle {
  /** Clears the poll timer and stops all registered crons. */
  stop(): void;
}

/** Reloads active topics + global settings; falls back to the seed data on error. */
export interface SchedulerDataSource {
  loadTopics(): Promise<ScheduleTopic[]>;
  loadSettings(): Promise<GlobalSchedulerSettings | null>;
}

const defaultDataSource: SchedulerDataSource = {
  async loadTopics() {
    return createTopicRepository(prisma).findActive();
  },
  async loadSettings() {
    return prisma.settings.findFirst();
  },
};

export interface StartSchedulerOptions {
  /** Initial topics loaded at boot (avoids a redundant query on startup). */
  readonly topics: readonly ScheduleTopic[];
  /** Initial global settings loaded at boot. */
  readonly settings: GlobalSchedulerSettings;
  readonly logger: Logger;
  /** Injectable for tests; defaults to the live Prisma-backed source. */
  readonly dataSource?: SchedulerDataSource;
  /** Override the reload interval (ms); defaults to SCHEDULE_RELOAD_INTERVAL_MS. */
  readonly reloadIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Start scheduler
// ---------------------------------------------------------------------------

/**
 * Registers a curation+send cron pair per active topic and polls for changes
 * every reloadIntervalMs. Returns a handle to stop the poll timer and all crons.
 */
export function startScheduler(opts: StartSchedulerOptions): SchedulerHandle {
  const {
    topics: initialTopics,
    settings: initialSettings,
    logger,
    dataSource = defaultDataSource,
    reloadIntervalMs = SCHEDULE_RELOAD_INTERVAL_MS,
  } = opts;

  // Mutable holder for the currently-registered crons. Reassigned (not mutated)
  // on each reload so the previous set can be stopped cleanly.
  let crons: readonly Cron[] = [];

  function register(topics: readonly ScheduleTopic[], settings: GlobalSchedulerSettings): void {
    // Always stop the previous set first to avoid leaking crons on reload.
    for (const cron of crons) {
      cron.stop();
    }
    crons = topics.flatMap((topic) => registerTopicCrons(topic, settings, logger));
    logger.info('scheduler.registered', { topicCount: topics.length, cronCount: crons.length });
  }

  register(initialTopics, initialSettings);

  async function reload(): Promise<void> {
    try {
      const [topics, settings] = await Promise.all([
        dataSource.loadTopics(),
        dataSource.loadSettings(),
      ]);
      if (!settings) {
        logger.warn('scheduler.reload.no_settings');
        return;
      }
      register(topics, settings);
    } catch (err: unknown) {
      logger.error('scheduler.reload.error', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const pollTimer = setInterval(() => {
    void reload();
  }, reloadIntervalMs);

  return {
    stop() {
      clearInterval(pollTimer);
      for (const cron of crons) {
        cron.stop();
      }
      crons = [];
      logger.info('scheduler.stopped');
    },
  };
}

// Re-exported for callers that need the default timezone constant.
export { DEFAULT_TIMEZONE };
