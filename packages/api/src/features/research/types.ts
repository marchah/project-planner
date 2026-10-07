import type { Maybe } from '../../common/types';
import type { Decision, DecisionSource } from '../../entities/decision/types';
import type { Question } from '../../entities/question/types';
import type { ResearchJob } from '../../entities/research-job/types';

export enum ResearchRunState {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface ResearchRun {
  state: ResearchRunState;
  /** The agent's final reply, once completed. */
  output: Maybe<string>;
  /** Continues the same conversation when a reply has to be repaired. */
  sessionId: Maybe<string>;
  /** The agent's own status word, for error messages ("interrupted", "waiting_for_approval"…). */
  detail: string;
}

/** Runs one research prompt as an agent turn with web access, somewhere that is not this process. */
export interface ResearchRunner {
  isConfigured: () => boolean;
  startRun: (input: {
    prompt: string;
    sessionId: Maybe<string>;
    idempotencyKey: string;
  }) => Promise<{ runId: string }>;
  /** `null` when the runner no longer knows the run (restarted, expired). */
  getRun: (runId: string) => Promise<Maybe<ResearchRun>>;
  stopRun: (runId: string) => Promise<void>;
}

export enum ResearchNewsKind {
  /** An idea's first plan. */
  PLAN_READY = 'PLAN_READY',
  /** A refresh made a new plan version. */
  PLAN_CHANGED = 'PLAN_CHANGED',
  /** Research gave up after its retries. */
  FAILED = 'FAILED',
}

/** Something worth telling the idea's author, where they captured it. */
export interface ResearchNews {
  kind: ResearchNewsKind;
  /** Where the idea was captured, e.g. a Slack permalink: the notifier replies there if it can. */
  sourceUrl: Maybe<string>;
  ideaUrl: Maybe<string>;
  planVersion: Maybe<number>;
  /** The plan's summary, or what the refresh changed. */
  summary: Maybe<string>;
  /** A first plan's open questions, or the ones a refresh asked. */
  questions: { number: number; text: string }[];
  shelveReason: Maybe<string>;
  error: Maybe<string>;
}

/** Tells the author what research produced, e.g. in the idea's Slack thread. Rejects when it could
 * not deliver; resolves without doing anything when it has nowhere to say it. */
export interface ResearchNotifier {
  announceResearch: (news: ResearchNews) => Promise<void>;
}

export interface ResearchSettings {
  /** Research ideas still CAPTURED without being asked to. */
  researchOnCapture: boolean;
  runTimeoutMs: number;
  /** After an answer or a decision, wait this long for more before refreshing the plan. */
  refreshDebounceMs: number;
  /** When every planned idea is re-checked: a cron pattern read in an IANA time zone. */
  refreshSchedule: Maybe<{ pattern: string; timezone: string }>;
  /** Free text about the person and their setup, appended to every research prompt. */
  context: Maybe<string>;
  /** The idea's link on the board, when the board knows its own address. */
  ideaUrl: (ideaId: string) => Maybe<string>;
}

/** What was saved, and the research job that will fold it into the plan, if one will. */
export interface AnsweredQuestion {
  question: Question;
  refresh: Maybe<ResearchJob>;
}

export interface RecordedDecision {
  decision: Decision;
  refresh: Maybe<ResearchJob>;
}

export interface ResearchService {
  isResearchEnabled: () => boolean;
  isScheduledRefreshEnabled: () => boolean;
  /** When the schedule next re-checks this idea's plan; null when it will not. */
  getNextScheduledRefresh: (ideaId: string) => Promise<Maybe<Date>>;
  /** Research an idea now: its first plan, or a refresh of the plan it has. Returns the job that
   * will run, which may be one already queued or running. */
  startResearch: (ideaId: string) => Promise<ResearchJob>;
  /** Save an answer and schedule a refresh, which waits a little for more answers. */
  answerQuestion: (questionId: string, answer: string) => Promise<AnsweredQuestion>;
  answerQuestionByNumber: (
    ideaId: string,
    number: number,
    answer: string,
  ) => Promise<AnsweredQuestion>;
  recordDecision: (
    ideaId: string,
    text: string,
    source: DecisionSource,
  ) => Promise<RecordedDecision>;
  /** Delete a decision no plan has applied yet, unless the research running now was given it. */
  deleteDecision: (decisionId: string) => Promise<Decision>;
  /** Delete an idea, stopping its research run first if one is running. */
  deleteIdea: (ideaId: string) => Promise<void>;
  /** Advance the queue by one step. Called on an interval by the worker; never concurrently. */
  tickResearch: (now: Date) => Promise<void>;
}
