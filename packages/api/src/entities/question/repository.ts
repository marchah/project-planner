import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray, max, ne } from 'drizzle-orm';
import { questions } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Maybe } from '../../common/types';
import {
  QuestionStatus,
  type AskedIn,
  type NewQuestion,
  type Question,
  type QuestionRepository,
  type QuestionResolution,
} from './types';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function questionRepositoryFactory({ db }: { db: Db }): QuestionRepository {
  async function findQuestionById(id: string): Promise<Maybe<Question>> {
    const rows = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function findQuestionByNumber(ideaId: string, number: number): Promise<Maybe<Question>> {
    const rows = await db
      .select()
      .from(questions)
      .where(and(eq(questions.ideaId, ideaId), eq(questions.number, number)))
      .limit(1);
    return rows[0] ?? null;
  }

  async function listQuestionsByIdeaId(ideaId: string): Promise<Question[]> {
    return db
      .select()
      .from(questions)
      .where(and(eq(questions.ideaId, ideaId), ne(questions.status, QuestionStatus.SUPERSEDED)))
      .orderBy(asc(questions.number));
  }

  async function countOpenQuestionsByIdeaId(ideaId: string): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(questions)
      .where(and(eq(questions.ideaId, ideaId), eq(questions.status, QuestionStatus.OPEN)));
    return rows[0]?.value ?? 0;
  }

  async function answerQuestion(id: string, answer: string, at: Date): Promise<Maybe<Question>> {
    const rows = await db
      .update(questions)
      .set({ answer, status: QuestionStatus.ANSWERED, answeredAt: at })
      .where(
        and(
          eq(questions.id, id),
          inArray(questions.status, [QuestionStatus.OPEN, QuestionStatus.ANSWERED]),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  async function appendQuestions(
    ideaId: string,
    items: NewQuestion[],
    askedIn: AskedIn,
    limit: number,
  ): Promise<Question[]> {
    return db.transaction(async (tx) => {
      const already = await tx
        .select()
        .from(questions)
        .where(eq(questions.askedInJobId, askedIn.jobId));
      if (already.length > 0) return already;
      const open = await countOpen(tx, ideaId);
      const asked = items.slice(0, Math.max(0, limit - open));
      if (asked.length === 0) return [];
      const [current] = await tx
        .select({ value: max(questions.number) })
        .from(questions)
        .where(eq(questions.ideaId, ideaId));
      const first = (current?.value ?? 0) + 1;
      const createdAt = new Date();
      const rows: Question[] = asked.map((item, index) => ({
        ...item,
        id: randomUUID(),
        ideaId,
        number: first + index,
        answer: null,
        status: QuestionStatus.OPEN,
        askedInPlanId: askedIn.planId,
        askedInJobId: askedIn.jobId,
        answeredAt: null,
        resolvedAt: null,
        resolvedInPlanId: null,
        appliedNote: null,
        createdAt,
      }));
      await tx.insert(questions).values(rows);
      return rows;
    });
  }

  async function resolveQuestions(
    resolutions: QuestionResolution[],
    planId: string,
    at: Date,
  ): Promise<void> {
    for (const { questionId, answeredAt, appliedNote } of resolutions) {
      await db
        .update(questions)
        .set({
          status: QuestionStatus.RESOLVED,
          resolvedAt: at,
          resolvedInPlanId: planId,
          appliedNote,
        })
        .where(
          and(
            eq(questions.id, questionId),
            eq(questions.status, QuestionStatus.ANSWERED),
            eq(questions.answeredAt, answeredAt),
          ),
        );
    }
  }

  async function countOpen(tx: Tx, ideaId: string): Promise<number> {
    const [open] = await tx
      .select({ value: count() })
      .from(questions)
      .where(and(eq(questions.ideaId, ideaId), eq(questions.status, QuestionStatus.OPEN)));
    return open?.value ?? 0;
  }

  return {
    findQuestionById,
    findQuestionByNumber,
    listQuestionsByIdeaId,
    countOpenQuestionsByIdeaId,
    answerQuestion,
    appendQuestions,
    resolveQuestions,
  };
}
