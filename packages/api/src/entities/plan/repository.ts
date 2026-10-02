import { randomUUID } from 'node:crypto';
import { desc, eq, max } from 'drizzle-orm';
import { plans } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Maybe } from '../../common/types';
import type { NewPlan, Plan, PlanRepository } from './types';

export function planRepositoryFactory({ db }: { db: Db }): PlanRepository {
  async function findLatestPlanByIdeaId(ideaId: string): Promise<Maybe<Plan>> {
    const rows = await db
      .select()
      .from(plans)
      .where(eq(plans.ideaId, ideaId))
      .orderBy(desc(plans.version))
      .limit(1);
    return rows[0] ?? null;
  }

  async function findPlanByJobId(jobId: string): Promise<Maybe<Plan>> {
    const rows = await db.select().from(plans).where(eq(plans.jobId, jobId)).limit(1);
    return rows[0] ?? null;
  }

  async function listPlansByIdeaId(ideaId: string): Promise<Plan[]> {
    return db.select().from(plans).where(eq(plans.ideaId, ideaId)).orderBy(desc(plans.version));
  }

  async function createPlan(plan: NewPlan): Promise<Plan> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ value: max(plans.version) })
        .from(plans)
        .where(eq(plans.ideaId, plan.ideaId));
      const row: Plan = {
        ...plan,
        id: randomUUID(),
        version: (current?.value ?? 0) + 1,
        createdAt: new Date(),
      };
      await tx.insert(plans).values(row);
      return row;
    });
  }

  return { findLatestPlanByIdeaId, findPlanByJobId, listPlansByIdeaId, createPlan };
}
