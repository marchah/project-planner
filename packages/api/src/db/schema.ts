import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { IdeaSource, IdeaStatus } from '../entities/idea/types';
import type { PlanSource, PlanSuggestion, StackItem } from '../entities/plan/types';
import { QuestionStatus } from '../entities/question/types';
import type { DecisionSource } from '../entities/decision/types';
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
  autoRefresh: integer('auto_refresh', { mode: 'boolean' }).notNull().default(true),
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
  (t) => [
    uniqueIndex('plans_idea_version').on(t.ideaId, t.version),
    // A job produces at most one plan, so finishing it again (a retry, a restart) cannot add another.
    uniqueIndex('plans_job').on(t.jobId),
  ],
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
    // The job that asked it: finishing that job again (a retry, a restart) must not ask twice.
    askedInJobId: text('asked_in_job_id'),
    answeredAt: timestamp('answered_at'),
    resolvedAt: timestamp('resolved_at'),
    resolvedInPlanId: text('resolved_in_plan_id'),
    appliedNote: text('applied_note'),
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
    dispatchFailures: integer('dispatch_failures').notNull().default(0),
    // An attempt's prompt is built once and kept, so a retried dispatch sends the same body; answers
    // and decisions up to inputAsOf are what it was told, anything later waits for the next run.
    prompt: text('prompt'),
    inputAsOf: timestamp('input_as_of'),
    outcome: text('outcome'),
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
    // At most one queued-or-running job per idea, even when two requests race to queue one.
    uniqueIndex('research_jobs_one_active')
      .on(t.ideaId)
      .where(sql`${t.status} in ('QUEUED', 'RUNNING')`),
    index('research_jobs_status').on(t.status, t.notBefore),
    index('research_jobs_idea').on(t.ideaId, t.createdAt),
  ],
);

export const decisions = sqliteTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    ideaId: ideaId(),
    text: text('text').notNull(),
    source: text('source').$type<DecisionSource>().notNull(),
    appliedInPlanId: text('applied_in_plan_id'),
    appliedAt: timestamp('applied_at'),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [index('decisions_idea').on(t.ideaId, t.createdAt)],
);
