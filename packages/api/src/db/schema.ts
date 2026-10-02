import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { IdeaSource, IdeaStatus } from '../entities/idea/types';
import type { PlanSource, PlanSuggestion, StackItem } from '../entities/plan/types';
import { QuestionStatus } from '../entities/question/types';
import type { ResearchJobKind, ResearchJobStatus } from '../entities/research-job/types';

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

const ideaId = () =>
  text('idea_id')
    .notNull()
    .references(() => ideas.id, { onDelete: 'cascade' });

export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    ideaId: ideaId(),
    version: integer('version').notNull(),
    summary: text('summary').notNull(),
    planMd: text('plan_md').notNull(),
    stack: text('stack', { mode: 'json' }).$type<StackItem[]>().notNull(),
    researchMd: text('research_md').notNull(),
    sources: text('sources', { mode: 'json' }).$type<PlanSource[]>().notNull(),
    suggestion: text('suggestion').$type<PlanSuggestion>().notNull(),
    shelveReason: text('shelve_reason'),
    jobId: text('job_id'),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('plans_idea_version').on(t.ideaId, t.version)],
);

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    ideaId: ideaId(),
    number: integer('number').notNull(),
    topic: text('topic').notNull(),
    text: text('text').notNull(),
    why: text('why').notNull(),
    defaultAnswer: text('default_answer').notNull(),
    answer: text('answer'),
    status: text('status').$type<QuestionStatus>().notNull().default(QuestionStatus.OPEN),
    askedInPlanId: text('asked_in_plan_id'),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('questions_idea_number').on(t.ideaId, t.number)],
);

export const researchJobs = sqliteTable(
  'research_jobs',
  {
    id: text('id').primaryKey(),
    ideaId: ideaId(),
    kind: text('kind').$type<ResearchJobKind>().notNull(),
    status: text('status').$type<ResearchJobStatus>().notNull(),
    attempt: integer('attempt').notNull().default(1),
    runId: text('run_id'),
    repairUsed: integer('repair_used', { mode: 'boolean' }).notNull().default(false),
    notBefore: timestamp('not_before').notNull(),
    deadlineAt: timestamp('deadline_at'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [
    index('research_jobs_status').on(t.status, t.notBefore),
    index('research_jobs_idea').on(t.ideaId, t.createdAt),
  ],
);
