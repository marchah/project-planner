import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../db/client';
import { createTestDb } from '../../db/testing';
import { ideaRepositoryFactory } from '../idea/repository';
import { IdeaSource } from '../idea/types';
import { questionRepositoryFactory } from './repository';
import { questionServiceFactory } from './service';
import { QuestionStatus, type QuestionService } from './types';

const T0 = new Date('2026-10-02T12:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const ask = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    topic: 't',
    text: `Question ${String(i)}?`,
    why: 'w',
    defaultAnswer: 'd',
  }));

let db: Db;
let cleanup: () => void;
let service: QuestionService;
let ideaId: string;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  service = questionServiceFactory({ questionRepository: questionRepositoryFactory({ db }) });
  const idea = await ideaRepositoryFactory({ db }).createIdea({
    title: null,
    body: 'an idea',
    source: IdeaSource.WEB,
    sourceUrl: null,
  });
  ideaId = idea.id;
});
afterEach(() => cleanup());

describe('questionService', () => {
  it('asks up to five open questions, numbering on, once per job', async () => {
    await service.appendQuestions(ideaId, ask(3), { planId: 'p1', jobId: 'j1' });
    const again = await service.appendQuestions(ideaId, ask(3), { planId: 'p1', jobId: 'j1' });
    expect(again.map((q) => q.number)).toEqual([1, 2, 3]);
    await service.appendQuestions(ideaId, ask(4), { planId: 'p2', jobId: 'j2' });
    expect((await service.listQuestionsForIdea(ideaId)).map((q) => q.number)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('resolves the answer a refresh saw, not one given after it', async () => {
    const [q1, q2] = await service.appendQuestions(ideaId, ask(2), { planId: 'p1', jobId: 'j1' });
    await service.answerQuestion(q1?.id ?? '', 'first', at(1));
    await service.answerQuestion(q2?.id ?? '', 'only', at(1));
    await service.answerQuestion(q1?.id ?? '', 'second thoughts', at(2));
    await service.resolveQuestions(
      [
        { questionId: q1?.id ?? '', answeredAt: at(1), appliedNote: 'a' },
        { questionId: q2?.id ?? '', answeredAt: at(1), appliedNote: 'b' },
      ],
      'p2',
      at(3),
    );
    expect(
      (await service.listQuestionsForIdea(ideaId)).map((q) => [q.number, q.status, q.answer]),
    ).toEqual([
      [1, QuestionStatus.ANSWERED, 'second thoughts'],
      [2, QuestionStatus.RESOLVED, 'only'],
    ]);
  });

  it('refuses an empty answer, and any answer once one is applied', async () => {
    const [q1] = await service.appendQuestions(ideaId, ask(1), { planId: 'p1', jobId: 'j1' });
    const id = q1?.id ?? '';
    await expect(service.answerQuestion(id, ' ', at(1))).rejects.toThrow('some text');
    await service.answerQuestion(id, 'yes', at(1));
    await service.resolveQuestions(
      [{ questionId: id, answeredAt: at(1), appliedNote: null }],
      'p2',
      at(2),
    );
    await expect(service.answerQuestion(id, 'no', at(3))).rejects.toThrow('already applied');
    expect(await service.countOpenQuestionsForIdea(ideaId)).toBe(0);
  });
});
