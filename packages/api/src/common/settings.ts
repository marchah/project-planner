import 'dotenv/config';
import { Cron } from 'croner';
import { z } from 'zod';

// The SINGLE place environment variables are read. Everything else imports `settings`;
// nothing else touches process.env (enforced by ESLint). Field names are SCREAMING_SNAKE_CASE
// so they visibly mirror the environment variables. Validated once at startup so a
// misconfigured deploy fails fast with a clear message.

function optional<T extends z.ZodType>(schema: T) {
  return schema.optional();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isCronPattern(pattern: string): boolean {
  try {
    new Cron(pattern, { paused: true });
    return true;
  } catch {
    return false;
  }
}

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_DIR: z.string().optional(),
  DATABASE_URL: z.string().default('file:./data/app.db'),
  MIGRATIONS_DIR: z.string().default('drizzle'),
  // OpenAI-compatible endpoint that names new ideas (…/v1). Unset: ideas stay untitled until you
  // name them. The model name and key are only needed by servers that ask for them.
  TITLE_MODEL_BASE_URL: optional(z.url().transform(stripTrailingSlash)),
  TITLE_MODEL: optional(z.string()),
  TITLE_MODEL_API_KEY: optional(z.string()),
  TITLE_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Hermes Agent's API (…:8642), which runs research. Unset: research is off.
  HERMES_API_URL: optional(z.url().transform(stripTrailingSlash)),
  HERMES_API_KEY: optional(z.string()),
  // Which model provider Hermes runs research on, e.g. `openai-codex`. Unset: Hermes' default.
  HERMES_PROVIDER: optional(z.string()),
  HERMES_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  // Research ideas that are still CAPTURED without being asked to.
  RESEARCH_ON_CAPTURE: z
    .enum(['true', 'false', ''])
    .default('false')
    .transform((value) => value === 'true'),
  // A research run is stopped and retried after this long.
  RESEARCH_RUN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),
  RESEARCH_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  // After an answer or a decision, wait this long for more before refreshing the plan.
  REFRESH_DEBOUNCE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(10 * 60_000),
  // When plans are re-checked, as a cron pattern (`0 10 * * 0`: Sundays 10:00). Unset: never on a
  // schedule, only from answers, decisions and "Refresh now".
  REFRESH_SCHEDULE: optional(
    z.string().refine(isCronPattern, 'REFRESH_SCHEDULE is not a valid cron pattern'),
  ),
  // The IANA time zone REFRESH_SCHEDULE is read in.
  REFRESH_TIMEZONE: z
    .string()
    .default('UTC')
    .refine(isTimeZone, 'REFRESH_TIMEZONE is not an IANA time zone, e.g. Europe/Paris'),
  // Free text about you and your setup, appended to every research prompt.
  RESEARCH_CONTEXT: optional(z.string()),
  // A Slack bot token with chat:write (Hermes' own works): research results are posted in the
  // thread an idea was captured from. Unset: no Slack messages.
  SLACK_BOT_TOKEN: optional(z.string()),
  // Base for links handed to machine callers; defaults to the Host header they reached us on.
  PUBLIC_URL: optional(z.url().transform(stripTrailingSlash)),
});

// An empty variable means unset, so the compose file can pass every `${VAR:-}` through and leave the
// defaults here.
const ENV = EnvSchema.parse(
  // eslint-disable-next-line no-restricted-properties -- the one allowed read of process.env
  Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== '')),
);

export const settings = {
  NODE_ENV: ENV.NODE_ENV,
  LOG_LEVEL: ENV.LOG_LEVEL,
  PORT: ENV.PORT,
  WEB_DIR: ENV.WEB_DIR,
  DATABASE_URL: ENV.DATABASE_URL,
  MIGRATIONS_DIR: ENV.MIGRATIONS_DIR,
  PUBLIC_URL: ENV.PUBLIC_URL,
  SLACK_BOT_TOKEN: ENV.SLACK_BOT_TOKEN,
  HERMES_API_URL: ENV.HERMES_API_URL,
  HERMES_API_KEY: ENV.HERMES_API_KEY,
  HERMES_PROVIDER: ENV.HERMES_PROVIDER,
  HERMES_REQUEST_TIMEOUT_MS: ENV.HERMES_REQUEST_TIMEOUT_MS,
  RESEARCH_ON_CAPTURE: ENV.RESEARCH_ON_CAPTURE,
  RESEARCH_RUN_TIMEOUT_MS: ENV.RESEARCH_RUN_TIMEOUT_MS,
  RESEARCH_POLL_INTERVAL_MS: ENV.RESEARCH_POLL_INTERVAL_MS,
  RESEARCH_CONTEXT: ENV.RESEARCH_CONTEXT,
  REFRESH_DEBOUNCE_MS: ENV.REFRESH_DEBOUNCE_MS,
  REFRESH_SCHEDULE: ENV.REFRESH_SCHEDULE,
  REFRESH_TIMEZONE: ENV.REFRESH_TIMEZONE,
  TITLE_MODEL_BASE_URL: ENV.TITLE_MODEL_BASE_URL,
  TITLE_MODEL: ENV.TITLE_MODEL,
  TITLE_MODEL_API_KEY: ENV.TITLE_MODEL_API_KEY,
  TITLE_MODEL_TIMEOUT_MS: ENV.TITLE_MODEL_TIMEOUT_MS,
};

export type Settings = typeof settings;
