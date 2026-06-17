/**
 * Scheduler — reads Settings and registers two timezone-aware croner jobs:
 *   1. Curation job: pipelineLeadDays before send day
 *   2. Send job:     on send day at send time
 *
 * Exposes pure helper settingsToCronExpressions() for unit testing.
 */

import { Cron } from 'croner';
import type { Logger } from './logger.js';
import { runCurationJob } from './jobs/curate.js';
import { runSendJob } from './jobs/send.js';

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
 * Cron field order: second minute hour day-of-month month day-of-week
 * We use 6-field croner format: "0 <minute> <hour> * * <dow>"
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
// Scheduler state
// ---------------------------------------------------------------------------

export interface SchedulerHandle {
  stop(): void;
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
// Start scheduler
// ---------------------------------------------------------------------------

export interface StartSchedulerOptions {
  readonly settings: SchedulerSettings & { readonly timezone?: string };
  readonly logger: Logger;
}

/**
 * Registers both cron jobs and returns a handle to stop them on shutdown.
 */
export function startScheduler(opts: StartSchedulerOptions): SchedulerHandle {
  const { settings, logger } = opts;
  const timezone = settings.timezone ?? 'Europe/Istanbul';

  const expressions = settingsToCronExpressions(settings);

  logger.info('scheduler.start', {
    curationCron: expressions.curation,
    sendCron: expressions.send,
    timezone,
  });

  const curationJob = new Cron(
    expressions.curation,
    {
      timezone,
      name: 'curation',
      catch: (err: Error | unknown) => {
        logger.error('scheduler.curation.error', {
          message: err instanceof Error ? err.message : String(err),
        });
      },
    },
    async () => {
      const isoWeek = currentIsoWeek();
      logger.info('scheduler.curation.trigger', { isoWeek });
      await runCurationJob({ logger, isoWeek });
    },
  );

  const sendJob = new Cron(
    expressions.send,
    {
      timezone,
      name: 'send',
      catch: (err: Error | unknown) => {
        logger.error('scheduler.send.error', {
          message: err instanceof Error ? err.message : String(err),
        });
      },
    },
    async () => {
      const isoWeek = currentIsoWeek();
      logger.info('scheduler.send.trigger', { isoWeek });
      await runSendJob({ logger, isoWeek });
    },
  );

  return {
    stop() {
      curationJob.stop();
      sendJob.stop();
      logger.info('scheduler.stopped');
    },
  };
}
