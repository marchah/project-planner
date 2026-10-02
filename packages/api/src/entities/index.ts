import type { Db } from '../db/client';
import type { ThirdPartyServices } from '../third-party';
import { ideaRepositoryFactory } from './idea/repository';
import { ideaServiceFactory } from './idea/service';
import type { IdeaService } from './idea/types';
import { planRepositoryFactory } from './plan/repository';
import { planServiceFactory } from './plan/service';
import type { PlanService } from './plan/types';
import { questionRepositoryFactory } from './question/repository';
import { questionServiceFactory } from './question/service';
import type { QuestionService } from './question/types';
import { researchJobRepositoryFactory } from './research-job/repository';
import { researchJobServiceFactory } from './research-job/service';
import type { ResearchJobService } from './research-job/types';

// Builds every entity slice. Entities own a table + repository and must never import features.
export interface EntitiesServices {
  ideaService: IdeaService;
  planService: PlanService;
  questionService: QuestionService;
  researchJobService: ResearchJobService;
}

export function getEntitiesServices({
  db,
  thirdParty,
}: {
  db: Db;
  thirdParty: ThirdPartyServices;
}): EntitiesServices {
  const ideaService = ideaServiceFactory({
    ideaRepository: ideaRepositoryFactory({ db }),
    titleGenerator: thirdParty.titleGenerator,
  });
  const planService = planServiceFactory({ planRepository: planRepositoryFactory({ db }) });
  const questionService = questionServiceFactory({
    questionRepository: questionRepositoryFactory({ db }),
  });
  const researchJobService = researchJobServiceFactory({
    researchJobRepository: researchJobRepositoryFactory({ db }),
  });

  return { ideaService, planService, questionService, researchJobService };
}
