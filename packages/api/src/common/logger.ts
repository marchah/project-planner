import winston from 'winston';
import { settings } from './settings';

// Structured logging — use these instead of console.* (ESLint enforces no-console).
// Pretty + colorized in development, JSON in production, silent in tests unless LOG_LEVEL=debug.

export type LoggingTag = 'SERVER' | 'DB' | 'REST' | 'TITLE' | 'RESEARCH' | 'MCP';

interface LogOptions {
  extra?: Record<string, unknown>;
  tag?: LoggingTag | LoggingTag[];
}

const isDev = settings.NODE_ENV === 'development';
const isTest = settings.NODE_ENV === 'test';

// JSON.stringify drops Error fields by default — serialize name/message/stack explicitly.
const replacer = (_key: string, value: unknown): unknown =>
  value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;

const prettyFormat = winston.format.printf((info) => {
  const { level, message, tag, extra } = info as {
    level: string;
    message: unknown;
    tag?: LoggingTag | LoggingTag[];
    extra?: Record<string, unknown>;
  };
  const tags = tag ? (Array.isArray(tag) ? tag : [tag]).map((t) => `[${t}]`).join('') : '';
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra, replacer)}` : '';
  return `${level}${tags ? ` ${tags}` : ''} ${String(message)}${suffix}`;
});

const logger = winston.createLogger({
  level: settings.LOG_LEVEL,
  silent: isTest && settings.LOG_LEVEL !== 'debug',
  format: isDev
    ? winston.format.combine(winston.format.colorize(), prettyFormat)
    : winston.format.json(),
  transports: [new winston.transports.Console()],
});

export function logInfo(message: string, options: LogOptions = {}): void {
  logger.info({ message, ...options });
}

export function logWarning(message: string, options: LogOptions = {}): void {
  logger.warn({ message, ...options });
}

export function logDebug(message: string, options: LogOptions = {}): void {
  logger.debug({ message, ...options });
}

export function logError(message: string, options: LogOptions = {}): void {
  logger.error({ message, ...options });
}

/** Log a caught exception (preserves name/message/stack). Prefer over logError in try/catch. */
export function logException(exception: unknown, options: LogOptions = {}): void {
  if (exception instanceof Error) {
    logger.error({
      message: exception.message,
      ...options,
      extra: { ...options.extra, name: exception.name, stack: exception.stack },
    });
    return;
  }
  logger.error({
    message: 'Unknown exception',
    ...options,
    extra: { ...options.extra, exception },
  });
}
