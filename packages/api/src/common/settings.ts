import 'dotenv/config';
import { z } from 'zod';

// The SINGLE place environment variables are read. Everything else imports `settings`;
// nothing else touches process.env (enforced by ESLint). Field names are SCREAMING_SNAKE_CASE
// so they visibly mirror the environment variables. Validated once at startup so a
// misconfigured deploy fails fast with a clear message.

// An empty variable means unset, so a compose file can pass `${VAR:-}` through without a default.
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
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
  // Base for links handed to machine callers; defaults to the Host header they reached us on.
  PUBLIC_URL: optional(z.url().transform(stripTrailingSlash)),
});

// eslint-disable-next-line no-restricted-properties -- the one allowed read of process.env
const ENV = EnvSchema.parse(process.env);

export const settings = {
  NODE_ENV: ENV.NODE_ENV,
  LOG_LEVEL: ENV.LOG_LEVEL,
  PORT: ENV.PORT,
  WEB_DIR: ENV.WEB_DIR,
  DATABASE_URL: ENV.DATABASE_URL,
  MIGRATIONS_DIR: ENV.MIGRATIONS_DIR,
  PUBLIC_URL: ENV.PUBLIC_URL,
  TITLE_MODEL_BASE_URL: ENV.TITLE_MODEL_BASE_URL,
  TITLE_MODEL: ENV.TITLE_MODEL,
  TITLE_MODEL_API_KEY: ENV.TITLE_MODEL_API_KEY,
  TITLE_MODEL_TIMEOUT_MS: ENV.TITLE_MODEL_TIMEOUT_MS,
};

export type Settings = typeof settings;
