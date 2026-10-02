import type { Maybe } from '../../common/types';

export enum ResearchJobKind {
  INTAKE = 'INTAKE',
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
  createJob: (ideaId: string, kind: ResearchJobKind, now: Date) => Promise<ResearchJob>;
  updateJob: (id: string, patch: ResearchJobPatch, now: Date) => Promise<Maybe<ResearchJob>>;
}

export interface ResearchJobService {
  getJobById: (id: string) => Promise<ResearchJob>;
  findActiveJobForIdea: (ideaId: string) => Promise<Maybe<ResearchJob>>;
  getLatestJobForIdea: (ideaId: string) => Promise<Maybe<ResearchJob>>;
  findRunningJob: () => Promise<Maybe<ResearchJob>>;
  findNextDueJob: (now: Date) => Promise<Maybe<ResearchJob>>;
  listIdeaIdsWithJobs: () => Promise<string[]>;
  createJob: (ideaId: string, kind: ResearchJobKind, now: Date) => Promise<ResearchJob>;
  updateJob: (id: string, patch: ResearchJobPatch, now: Date) => Promise<ResearchJob>;
}
