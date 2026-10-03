import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import { researchJobs } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Maybe } from '../../common/types';
import {
  ResearchJobStatus,
  type ResearchJob,
  type ResearchJobKind,
  type ResearchJobPatch,
  type ResearchJobRepository,
} from './types';

const ACTIVE = [ResearchJobStatus.QUEUED, ResearchJobStatus.RUNNING];

export function researchJobRepositoryFactory({ db }: { db: Db }): ResearchJobRepository {
  async function findJobById(id: string): Promise<Maybe<ResearchJob>> {
    const rows = await db.select().from(researchJobs).where(eq(researchJobs.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function findActiveJobByIdeaId(ideaId: string): Promise<Maybe<ResearchJob>> {
    const rows = await db
      .select()
      .from(researchJobs)
      .where(and(eq(researchJobs.ideaId, ideaId), inArray(researchJobs.status, ACTIVE)))
      .limit(1);
    return rows[0] ?? null;
  }

  async function findLatestJobByIdeaId(ideaId: string): Promise<Maybe<ResearchJob>> {
    const rows = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.ideaId, ideaId))
      .orderBy(desc(researchJobs.createdAt), desc(researchJobs.id))
      .limit(1);
    return rows[0] ?? null;
  }

  async function findRunningJob(): Promise<Maybe<ResearchJob>> {
    const rows = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.status, ResearchJobStatus.RUNNING))
      .orderBy(asc(researchJobs.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async function findNextDueJob(now: Date): Promise<Maybe<ResearchJob>> {
    const rows = await db
      .select()
      .from(researchJobs)
      .where(
        and(eq(researchJobs.status, ResearchJobStatus.QUEUED), lte(researchJobs.notBefore, now)),
      )
      .orderBy(asc(researchJobs.notBefore), asc(researchJobs.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async function listIdeaIdsWithJobs(): Promise<string[]> {
    const rows = await db.selectDistinct({ ideaId: researchJobs.ideaId }).from(researchJobs);
    return rows.map((row) => row.ideaId);
  }

  async function insertJobUnlessActive(
    ideaId: string,
    kind: ResearchJobKind,
    now: Date,
    notBefore: Date,
  ): Promise<Maybe<ResearchJob>> {
    const row: ResearchJob = {
      id: randomUUID(),
      ideaId,
      kind,
      status: ResearchJobStatus.QUEUED,
      attempt: 1,
      dispatchFailures: 0,
      prompt: null,
      inputAsOf: null,
      outcome: null,
      runId: null,
      repairUsed: false,
      notBefore,
      deadlineAt: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    // research_jobs_one_active turns a racing second insert into a no-op instead of a duplicate.
    const inserted = await db.insert(researchJobs).values(row).onConflictDoNothing().returning();
    return inserted[0] ?? null;
  }

  async function updateJob(
    id: string,
    patch: ResearchJobPatch,
    now: Date,
  ): Promise<Maybe<ResearchJob>> {
    const rows = await db
      .update(researchJobs)
      .set({ ...patch, updatedAt: now })
      .where(eq(researchJobs.id, id))
      .returning();
    return rows[0] ?? null;
  }

  return {
    findJobById,
    findActiveJobByIdeaId,
    findLatestJobByIdeaId,
    findRunningJob,
    findNextDueJob,
    listIdeaIdsWithJobs,
    insertJobUnlessActive,
    updateJob,
  };
}
