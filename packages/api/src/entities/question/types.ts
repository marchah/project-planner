import type { Maybe } from '../../common/types';

export enum QuestionStatus {
  OPEN = 'OPEN',
  /** Answered on the board or over MCP; the next refresh folds it into the plan. */
  ANSWERED = 'ANSWERED',
  /** A refresh applied the answer. */
  RESOLVED = 'RESOLVED',
  /** Never answered, and a re-research asked other questions instead. Kept so numbers are never reused. */
  SUPERSEDED = 'SUPERSEDED',
}

/** At most this many questions are open on an idea at once; more is an interrogation. */
export const MAX_OPEN_QUESTIONS = 5;
export const ANSWER_MAX_LENGTH = 4_000;

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
  askedInJobId: Maybe<string>;
  answeredAt: Maybe<Date>;
  resolvedAt: Maybe<Date>;
  resolvedInPlanId: Maybe<string>;
  /** What applying the answer changed in the plan, in the refresh's words. */
  appliedNote: Maybe<string>;
  createdAt: Date;
}

export interface NewQuestion {
  topic: string;
  text: string;
  why: string;
  defaultAnswer: string;
}

/** Applies one answer: the one given at `answeredAt`. A newer answer stays ANSWERED for the next refresh. */
export interface QuestionResolution {
  questionId: string;
  answeredAt: Date;
  appliedNote: Maybe<string>;
}

/** Who asked: the plan the questions belong to and the job whose finishing asked them. */
export interface AskedIn {
  planId: string;
  jobId: string;
}

export interface QuestionRepository {
  findQuestionById: (id: string) => Promise<Maybe<Question>>;
  findQuestionByNumber: (ideaId: string, number: number) => Promise<Maybe<Question>>;
  listQuestionsByIdeaId: (ideaId: string) => Promise<Question[]>;
  countOpenQuestionsByIdeaId: (ideaId: string) => Promise<number>;
  /** OPEN or ANSWERED → ANSWERED with this answer; null for any other status. */
  answerQuestion: (id: string, answer: string, at: Date) => Promise<Maybe<Question>>;
  /** Adds questions until `limit` are open, numbering on, in one transaction. A no-op returning
   * what was asked when this job already asked. */
  appendQuestions: (
    ideaId: string,
    questions: NewQuestion[],
    askedIn: AskedIn,
    limit: number,
  ) => Promise<Question[]>;
  /** ANSWERED → RESOLVED when the answer is still the one resolved; anything else is left alone. */
  resolveQuestions: (resolutions: QuestionResolution[], planId: string, at: Date) => Promise<void>;
}

export interface QuestionService {
  getQuestionById: (id: string) => Promise<Question>;
  getQuestionByNumber: (ideaId: string, number: number) => Promise<Question>;
  /** Every question except superseded ones, in number order. */
  listQuestionsForIdea: (ideaId: string) => Promise<Question[]>;
  countOpenQuestionsForIdea: (ideaId: string) => Promise<number>;
  answerQuestion: (id: string, answer: string, at: Date) => Promise<Question>;
  appendQuestions: (
    ideaId: string,
    questions: NewQuestion[],
    askedIn: AskedIn,
  ) => Promise<Question[]>;
  resolveQuestions: (resolutions: QuestionResolution[], planId: string, at: Date) => Promise<void>;
}
