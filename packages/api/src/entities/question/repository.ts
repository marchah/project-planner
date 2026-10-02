import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, isNull, max, ne } from 'drizzle-orm';
import { questions } from '../../db/schema';
import type { Db } from '../../db/client';
import { QuestionStatus, type NewQuestion, type Question, type QuestionRepository } from './types';

export function questionRepositoryFactory({ db }: { db: Db }): QuestionRepository {
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

  async function replaceUnansweredOpenQuestions(
    ideaId: string,
    items: NewQuestion[],
    planId: string,
    limit: number,
  ): Promise<Question[]> {
    return db.transaction(async (tx) => {
      const already = await tx.select().from(questions).where(eq(questions.askedInPlanId, planId));
      if (already.length > 0) return already;
      await tx
        .update(questions)
        .set({ status: QuestionStatus.SUPERSEDED })
        .where(
          and(
            eq(questions.ideaId, ideaId),
            eq(questions.status, QuestionStatus.OPEN),
            isNull(questions.answer),
          ),
        );
      const [open] = await tx
        .select({ value: count() })
        .from(questions)
        .where(and(eq(questions.ideaId, ideaId), eq(questions.status, QuestionStatus.OPEN)));
      const asked = items.slice(0, Math.max(0, limit - (open?.value ?? 0)));
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
        askedInPlanId: planId,
        createdAt,
      }));
      await tx.insert(questions).values(rows);
      return rows;
    });
  }

  return {
    listQuestionsByIdeaId,
    countOpenQuestionsByIdeaId,
    replaceUnansweredOpenQuestions,
  };
}
