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
  listDecisionsByIdeaId: (ideaId: string) => Promise<Decision[]>;
  createDecision: (
    ideaId: string,
    text: string,
    source: DecisionSource,
    at: Date,
  ) => Promise<Decision>;
  markDecisionsApplied: (ids: string[], planId: string, at: Date) => Promise<void>;
}

export interface DecisionService {
  listDecisionsForIdea: (ideaId: string) => Promise<Decision[]>;
  recordDecision: (
    ideaId: string,
    text: string,
    source: DecisionSource,
    at: Date,
  ) => Promise<Decision>;
  markDecisionsApplied: (ids: string[], planId: string, at: Date) => Promise<void>;
}
