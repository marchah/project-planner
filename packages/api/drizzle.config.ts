import { defineConfig } from 'drizzle-kit';

// drizzle-kit `generate` reads only `schema` + `dialect` (no DB connection needed), so
// migrations are produced headlessly. Migrations are APPLIED at runtime by src/db/migrate.ts
// (the libsql migrator), not by drizzle-kit.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'file:./data/app.db' },
  strict: true,
  verbose: true,
});
