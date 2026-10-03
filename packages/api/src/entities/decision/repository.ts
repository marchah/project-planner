import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { decisions } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Decision, DecisionRepository, DecisionSource } from './types';

export function decisionRepositoryFactory({ db }: { db: Db }): DecisionRepository {
  async function listDecisionsByIdeaId(ideaId: string): Promise<Decision[]> {
    return db
      .select()
      .from(decisions)
      .where(eq(decisions.ideaId, ideaId))
      .orderBy(asc(decisions.createdAt), asc(decisions.id));
  }

  async function createDecision(
    ideaId: string,
    text: string,
    source: DecisionSource,
    at: Date,
  ): Promise<Decision> {
    const row: Decision = {
      id: randomUUID(),
      ideaId,
      text,
      source,
      appliedInPlanId: null,
      appliedAt: null,
      createdAt: at,
    };
    await db.insert(decisions).values(row);
    return row;
  }

  async function markDecisionsApplied(ids: string[], planId: string, at: Date): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(decisions)
      .set({ appliedInPlanId: planId, appliedAt: at })
      .where(and(inArray(decisions.id, ids), isNull(decisions.appliedAt)));
  }

  return { listDecisionsByIdeaId, createDecision, markDecisionsApplied };
}
