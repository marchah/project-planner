import type { Maybe } from '../../common/types';
import type { Decision } from '../../entities/decision/types';
import type { Idea } from '../../entities/idea/types';
import type { Plan } from '../../entities/plan/types';
import type { Question } from '../../entities/question/types';
import type { ResearchJob } from '../../entities/research-job/types';

/** Everything known about one idea, for an agent discussing it. */
export interface IdeaBrief {
  idea: Idea;
  plan: Maybe<Plan>;
  questions: Question[];
  decisions: Decision[];
  research: Maybe<ResearchJob>;
}

export interface IdeaSummary {
  id: string;
  title: Maybe<string>;
  status: Idea['status'];
  hasPlan: boolean;
  openQuestions: number;
  createdAt: Date;
}

export interface BriefService {
  getIdeaBrief: (ideaId: string) => Promise<IdeaBrief>;
  listIdeaSummaries: () => Promise<IdeaSummary[]>;
}
