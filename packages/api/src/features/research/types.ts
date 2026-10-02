import type { Maybe } from '../../common/types';
import type { Idea } from '../../entities/idea/types';
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

export interface ResearchSettings {
  /** Research ideas still CAPTURED without being asked to. */
  researchOnCapture: boolean;
  runTimeoutMs: number;
  /** Free text about the person and their setup, appended to every research prompt. */
  context: Maybe<string>;
}

export interface ResearchService {
  isResearchEnabled: () => boolean;
  /** Queue research for an idea, or return the job already queued or running for it. */
  startResearch: (ideaId: string) => Promise<ResearchJob>;
  /** Advance the queue by one step. Called on an interval by the worker; never concurrently. */
  tickResearch: (now: Date) => Promise<void>;
  buildIntakePrompt: (idea: Idea, today: Date) => string;
}
