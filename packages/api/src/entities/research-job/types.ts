import type { Maybe } from '../../common/types';

export enum ResearchJobKind {
  /** First research: no plan yet. */
  INTAKE = 'INTAKE',
  /** Updates an existing plan with answers, decisions and anything that moved upstream. */
  REFRESH = 'REFRESH',
}

export enum ResearchJobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

/** One request to research an idea; it may take several Hermes runs (retries, a JSON repair). */
export interface ResearchJob {
  id: string;
  ideaId: string;
  kind: ResearchJobKind;
  status: ResearchJobStatus;
  /** 1-based; a failed attempt is retried until MAX_ATTEMPTS. */
  attempt: number;
  /** Consecutive failures to hand the current attempt to the runner; reset once one is accepted. */
  dispatchFailures: number;
  /** The current attempt's prompt, built when it is first handed to the runner. */
  prompt: Maybe<string>;
  /** Answers and decisions up to this instant are this attempt's input. */
  inputAsOf: Maybe<Date>;
  /** One line on what the finished job did, e.g. what a refresh changed. */
  outcome: Maybe<string>;
  runId: Maybe<string>;
  repairUsed: boolean;
  /** A queued job is not started before this. */
  notBefore: Date;
  deadlineAt: Maybe<Date>;
  startedAt: Maybe<Date>;
  finishedAt: Maybe<Date>;
  error: Maybe<string>;
  createdAt: Date;
  updatedAt: Date;
}

export type ResearchJobPatch = Partial<
  Pick<
    ResearchJob,
    | 'status'
    | 'attempt'
    | 'dispatchFailures'
    | 'prompt'
    | 'inputAsOf'
    | 'outcome'
    | 'runId'
    | 'repairUsed'
    | 'notBefore'
    | 'deadlineAt'
    | 'startedAt'
    | 'finishedAt'
    | 'error'
  >
>;

export interface ResearchJobRepository {
  findJobById: (id: string) => Promise<Maybe<ResearchJob>>;
  findActiveJobByIdeaId: (ideaId: string) => Promise<Maybe<ResearchJob>>;
  findLatestJobByIdeaId: (ideaId: string) => Promise<Maybe<ResearchJob>>;
  findRunningJob: () => Promise<Maybe<ResearchJob>>;
  findNextDueJob: (now: Date) => Promise<Maybe<ResearchJob>>;
  listIdeaIdsWithJobs: () => Promise<string[]>;
  /** Inserts a QUEUED job unless the idea already has an active one, atomically. */
  insertJobUnlessActive: (
    ideaId: string,
    kind: ResearchJobKind,
    now: Date,
    notBefore: Date,
  ) => Promise<Maybe<ResearchJob>>;
  updateJob: (id: string, patch: ResearchJobPatch, now: Date) => Promise<Maybe<ResearchJob>>;
}

export interface ResearchJobService {
  getJobById: (id: string) => Promise<ResearchJob>;
  findActiveJobForIdea: (ideaId: string) => Promise<Maybe<ResearchJob>>;
  getLatestJobForIdea: (ideaId: string) => Promise<Maybe<ResearchJob>>;
  findRunningJob: () => Promise<Maybe<ResearchJob>>;
  findNextDueJob: (now: Date) => Promise<Maybe<ResearchJob>>;
  listIdeaIdsWithJobs: () => Promise<string[]>;
  /** Queues a job for the idea, or returns the one already queued or running; `created` tells which. */
  queueJob: (
    ideaId: string,
    kind: ResearchJobKind,
    now: Date,
    notBefore?: Date,
  ) => Promise<{ job: ResearchJob; created: boolean }>;
  updateJob: (id: string, patch: ResearchJobPatch, now: Date) => Promise<ResearchJob>;
}
