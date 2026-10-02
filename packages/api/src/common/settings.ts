import 'dotenv/config';
import { z } from 'zod';

// The SINGLE place environment variables are read. Everything else imports `settings`;
// nothing else touches process.env (enforced by ESLint). Field names are SCREAMING_SNAKE_CASE
// so they visibly mirror the environment variables. Validated once at startup so a
// misconfigured deploy fails fast with a clear message.

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_DIR: z.string().optional(),
  DATABASE_URL: z.string().default('file:./data/app.db'),
  MIGRATIONS_DIR: z.string().default('drizzle'),
  // OpenAI-compatible endpoint that names new ideas, e.g. http://llamacpp.lan:1234/v1. Unset: ideas
  // stay untitled until you name them.
  TITLE_MODEL_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .url()
      .transform((url) => url.replace(/\/+$/, ''))
      .optional(),
  ),
  TITLE_MODEL: z.string().min(1).default('qwen3.6-35b-a3b'),
  TITLE_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Base for links handed to machine callers; defaults to the Host header they reached us on.
  PUBLIC_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .url()
      .transform((url) => url.replace(/\/+$/, ''))
      .optional(),
  ),
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
  TITLE_MODEL_TIMEOUT_MS: ENV.TITLE_MODEL_TIMEOUT_MS,
};

export type Settings = typeof settings;
