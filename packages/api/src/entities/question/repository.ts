import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, isNull, max, ne } from 'drizzle-orm';
import { questions } from '../../db/schema';
import type { Db } from '../../db/client';
import type { Maybe } from '../../common/types';
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

  async function createQuestions(
    ideaId: string,
    items: NewQuestion[],
    askedInPlanId: Maybe<string>,
  ): Promise<Question[]> {
    if (items.length === 0) return [];
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ value: max(questions.number) })
        .from(questions)
        .where(eq(questions.ideaId, ideaId));
      const first = (current?.value ?? 0) + 1;
      const createdAt = new Date();
      const rows: Question[] = items.map((item, index) => ({
        ...item,
        id: randomUUID(),
        ideaId,
        number: first + index,
        answer: null,
        status: QuestionStatus.OPEN,
        askedInPlanId,
        createdAt,
      }));
      await tx.insert(questions).values(rows);
      return rows;
    });
  }

  async function supersedeUnansweredOpenQuestions(ideaId: string): Promise<number> {
    const superseded = await db
      .update(questions)
      .set({ status: QuestionStatus.SUPERSEDED })
      .where(
        and(
          eq(questions.ideaId, ideaId),
          eq(questions.status, QuestionStatus.OPEN),
          isNull(questions.answer),
        ),
      )
      .returning({ id: questions.id });
    return superseded.length;
  }

  return {
    listQuestionsByIdeaId,
    countOpenQuestionsByIdeaId,
    createQuestions,
    supersedeUnansweredOpenQuestions,
  };
}
