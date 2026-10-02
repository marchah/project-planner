import type { Maybe } from '../../common/types';

export enum QuestionStatus {
  OPEN = 'OPEN',
  ANSWERED = 'ANSWERED',
  RESOLVED = 'RESOLVED',
  /** Never answered, and a later plan asked other questions instead. Kept so numbers are never reused. */
  SUPERSEDED = 'SUPERSEDED',
}

/** At most this many questions are open on an idea at once; more is an interrogation. */
export const MAX_OPEN_QUESTIONS = 5;

export interface Question {
  id: string;
  ideaId: string;
  /** Per-idea, stable, never reused: Q1, Q2… */
  number: number;
  topic: string;
  text: string;
  /** What answering it would change in the plan. */
  why: string;
  /** The reversible assumption the plan uses until it is answered. */
  defaultAnswer: string;
  answer: Maybe<string>;
  status: QuestionStatus;
  askedInPlanId: Maybe<string>;
  createdAt: Date;
}

export interface NewQuestion {
  topic: string;
  text: string;
  why: string;
  defaultAnswer: string;
}

export interface QuestionRepository {
  listQuestionsByIdeaId: (ideaId: string) => Promise<Question[]>;
  countOpenQuestionsByIdeaId: (ideaId: string) => Promise<number>;
  /** In one transaction: supersede the idea's unanswered open questions, then ask `questions`
   * (at most `limit`) for `planId`. A no-op when that plan's questions were already asked. */
  replaceUnansweredOpenQuestions: (
    ideaId: string,
    questions: NewQuestion[],
    planId: string,
    limit: number,
  ) => Promise<Question[]>;
}

export interface QuestionService {
  /** Every question except superseded ones, in number order. */
  listQuestionsForIdea: (ideaId: string) => Promise<Question[]>;
  countOpenQuestionsForIdea: (ideaId: string) => Promise<number>;
  /** Replaces the idea's unanswered open questions with `questions`, capped at MAX_OPEN_QUESTIONS. */
  replaceOpenQuestions: (
    ideaId: string,
    questions: NewQuestion[],
    planId: string,
  ) => Promise<Question[]>;
}
