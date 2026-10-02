import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { IdeaSource, IdeaStatus } from '../entities/idea/types';

// The persistence schema. This file + client.ts are the ONLY dialect-aware files: swapping to
// Postgres means re-expressing these tables with drizzle-orm/pg-core and changing the driver in
// client.ts — repositories (which import this) are the only other code that touches the db.

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const now = sql`(unixepoch() * 1000)`;

export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(),
  title: text('title'),
  body: text('body').notNull(),
  status: text('status').$type<IdeaStatus>().notNull().default(IdeaStatus.CAPTURED),
  source: text('source').$type<IdeaSource>().notNull().default(IdeaSource.WEB),
  sourceUrl: text('source_url'),
  createdAt: timestamp('created_at').notNull().default(now),
  updatedAt: timestamp('updated_at').notNull().default(now),
});
