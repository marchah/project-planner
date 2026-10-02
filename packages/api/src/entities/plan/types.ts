import type { Maybe } from '../../common/types';

export enum PlanSuggestion {
  PLANNED = 'PLANNED',
  SHELVED = 'SHELVED',
}

export interface StackItem {
  name: string;
  version: Maybe<string>;
  role: string;
}

export interface PlanSource {
  url: string;
  title: string;
  firstParty: boolean;
}

/** One version of an idea's plan; a new research run adds a version, it never edits one. */
export interface Plan {
  id: string;
  ideaId: string;
  version: number;
  summary: string;
  planMd: string;
  stack: StackItem[];
  researchMd: string;
  sources: PlanSource[];
  suggestion: PlanSuggestion;
  shelveReason: Maybe<string>;
  jobId: Maybe<string>;
  createdAt: Date;
}

export type NewPlan = Omit<Plan, 'id' | 'version' | 'createdAt'>;

export interface PlanRepository {
  findLatestPlanByIdeaId: (ideaId: string) => Promise<Maybe<Plan>>;
  listPlansByIdeaId: (ideaId: string) => Promise<Plan[]>;
  createPlan: (plan: NewPlan) => Promise<Plan>;
}

export interface PlanService {
  getLatestPlanForIdea: (ideaId: string) => Promise<Maybe<Plan>>;
  listPlansForIdea: (ideaId: string) => Promise<Plan[]>;
  savePlan: (plan: NewPlan) => Promise<Plan>;
}
