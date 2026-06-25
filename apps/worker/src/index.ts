/**
 * Curated AI Digest worker — entrypoint.
 *
 * Bootstraps the scheduler after loading Settings from the database.
 * Handles SIGTERM / SIGINT for graceful shutdown.
 */

import { prisma, createTopicRepository } from '@digest/db';
import { logger } from './logger.js';
import { startScheduler } from './scheduler.js';

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error('worker.env.missing', { variable: name });
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  logger.info('worker.boot');

  // Fail loudly if required environment variables are missing
  requireEnv('DATABASE_URL');

  // Load settings from DB
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    logger.error('worker.settings.missing', {
      hint: 'Run the seed script or create a Settings row before starting the worker.',
    });
    process.exit(1);
  }

  logger.info('worker.settings.loaded', {
    sendDayOfWeek: settings.sendDayOfWeek,
    sendTime: settings.sendTime,
    timezone: settings.timezone,
    pipelineLeadDays: settings.pipelineLeadDays,
    autoSendEnabled: settings.autoSendEnabled,
  });

  // Load active topics so the scheduler can register one cron pair per topic.
  const topics = await createTopicRepository(prisma).findActive();
  logger.info('worker.topics.loaded', { topicCount: topics.length });

  const scheduler = startScheduler({
    topics,
    settings: {
      sendDayOfWeek: settings.sendDayOfWeek,
      sendTime: settings.sendTime,
      timezone: settings.timezone,
      pipelineLeadDays: settings.pipelineLeadDays,
      autoSendEnabled: settings.autoSendEnabled,
    },
    logger,
  });

  // Graceful shutdown
  function shutdown(signal: string): void {
    logger.info('worker.shutdown', { signal });
    scheduler.stop();
    prisma
      .$disconnect()
      .then(() => {
        logger.info('worker.shutdown.done');
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error('worker.shutdown.error', {
          message: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('worker.ready');
}

bootstrap().catch((err: unknown) => {
  logger.error('worker.boot.fatal', {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
