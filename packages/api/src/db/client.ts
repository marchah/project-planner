import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { settings } from '../common/settings';
import * as schema from './schema';

// The database handle type. Repositories depend on this; nothing else does.
export type Db = ReturnType<typeof createDb>;

/**
 * Build a Drizzle client bound to libsql (SQLite by default).
 * This is the single place the concrete dialect/driver is named — swapping to Postgres
 * is a change here + in schema.ts only.
 */
export function createDb(
  url: string = settings.DATABASE_URL,
): ReturnType<typeof drizzle<typeof schema>> {
  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length);
    if (path && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  }
  return drizzle(createClient({ url }), { schema });
}
