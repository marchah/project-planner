import type { IdeaService } from '../../entities/idea/types';
import type { PlanService } from '../../entities/plan/types';
import type { QuestionService } from '../../entities/question/types';
import type { ResearchJobService } from '../../entities/research-job/types';
import type { BriefService, IdeaBrief, IdeaSummary } from './types';

// A read model over the idea slices, shaped for an agent rather than the board's UI.
export function briefServiceFactory({
  ideaService: { getIdeaById, listIdeas },
  planService: { getLatestPlanForIdea },
  questionService: { listQuestionsForIdea, countOpenQuestionsForIdea },
  researchJobService: { getLatestJobForIdea },
}: {
  ideaService: IdeaService;
  planService: PlanService;
  questionService: QuestionService;
  researchJobService: ResearchJobService;
}): BriefService {
  async function getIdeaBrief(ideaId: string): Promise<IdeaBrief> {
    const idea = await getIdeaById(ideaId);
    const [plan, questions, research] = await Promise.all([
      getLatestPlanForIdea(ideaId),
      listQuestionsForIdea(ideaId),
      getLatestJobForIdea(ideaId),
    ]);
    return { idea, plan, questions, research };
  }

  async function listIdeaSummaries(): Promise<IdeaSummary[]> {
    const ideas = await listIdeas();
    return Promise.all(
      ideas.map(async (idea) => ({
        id: idea.id,
        title: idea.title,
        status: idea.status,
        hasPlan: (await getLatestPlanForIdea(idea.id)) !== null,
        openQuestions: await countOpenQuestionsForIdea(idea.id),
        createdAt: idea.createdAt,
      })),
    );
  }

  return { getIdeaBrief, listIdeaSummaries };
}
