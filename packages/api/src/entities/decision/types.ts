import type { Maybe } from '../../common/types';

export enum DecisionSource {
  /** Typed on the board. */
  BOARD = 'BOARD',
  /** Recorded by an assistant over MCP, e.g. Hermes from the idea's Slack thread. */
  ASSISTANT = 'ASSISTANT',
}

export const DECISION_MAX_LENGTH = 2_000;

/** Something the author told the planner that is not an answer to one of its questions. */
export interface Decision {
  id: string;
  ideaId: string;
  text: string;
  source: DecisionSource;
  /** The plan the next research folded it into; null until then. */
  appliedInPlanId: Maybe<string>;
  appliedAt: Maybe<Date>;
  createdAt: Date;
}

export interface DecisionRepository {
  findDecisionById: (id: string) => Promise<Maybe<Decision>>;
  listDecisionsByIdeaId: (ideaId: string) => Promise<Decision[]>;
  createDecision: (
    ideaId: string,
    text: string,
    source: DecisionSource,
    at: Date,
  ) => Promise<Decision>;
  markDecisionsApplied: (ids: string[], planId: string, at: Date) => Promise<void>;
  /** Deletes it unless a plan has applied it; null when nothing was deleted. */
  deleteUnappliedDecision: (id: string) => Promise<Maybe<Decision>>;
}

export interface DecisionService {
  getDecisionById: (id: string) => Promise<Decision>;
  listDecisionsForIdea: (ideaId: string) => Promise<Decision[]>;
  recordDecision: (
    ideaId: string,
    text: string,
    source: DecisionSource,
    at: Date,
  ) => Promise<Decision>;
  markDecisionsApplied: (ids: string[], planId: string, at: Date) => Promise<void>;
  /** Only before a plan applies it: after that the plan carries it, and a new decision changes course. */
  deleteDecision: (id: string) => Promise<Decision>;
}
