import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDb, type Db } from './client';

// A migrated database in a temp FILE: libsql runs a transaction on ':memory:' against a new,
// empty connection, so in-memory databases cannot test code that uses transactions.
export async function createTestDb(): Promise<{ db: Db; cleanup: () => void }> {
  const path = join(tmpdir(), `project-planner-test-${randomUUID()}.db`);
  const db = createDb(`file:${path}`);
  await migrate(db, { migrationsFolder: 'drizzle' });
  return {
    db,
    cleanup: () => {
      db.$client.close();
      for (const suffix of ['', '-wal', '-shm', '-journal'])
        rmSync(`${path}${suffix}`, { force: true });
    },
  };
}
