import type { Maybe } from '../../common/types';
import type { NewPlan, Plan, PlanRepository, PlanService } from './types';

export function planServiceFactory({
  planRepository,
}: {
  planRepository: PlanRepository;
}): PlanService {
  function getLatestPlanForIdea(ideaId: string): Promise<Maybe<Plan>> {
    return planRepository.findLatestPlanByIdeaId(ideaId);
  }

  function listPlansForIdea(ideaId: string): Promise<Plan[]> {
    return planRepository.listPlansByIdeaId(ideaId);
  }

  function savePlan(plan: NewPlan): Promise<Plan> {
    return planRepository.createPlan(plan);
  }

  return { getLatestPlanForIdea, listPlansForIdea, savePlan };
}
