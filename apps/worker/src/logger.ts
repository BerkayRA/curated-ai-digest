/**
 * Minimal structured logger for the worker process.
 *
 * This is the ONLY file in the codebase permitted to use console.* directly.
 * Library packages must receive a logger via injection instead.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

function formatEntry(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = JSON.stringify({ ts, level, msg, ...meta });
  return base;
}

export const logger: Logger = {
  debug(msg, meta) {
    if (process.env['LOG_LEVEL'] === 'debug') {
      // eslint-disable-next-line no-console
      console.debug(formatEntry('debug', msg, meta));
    }
  },
  info(msg, meta) {
    // eslint-disable-next-line no-console
    console.info(formatEntry('info', msg, meta));
  },
  warn(msg, meta) {
    // eslint-disable-next-line no-console
    console.warn(formatEntry('warn', msg, meta));
  },
  error(msg, meta) {
    // eslint-disable-next-line no-console
    console.error(formatEntry('error', msg, meta));
  },
};
