import { settings } from '../common/settings';
import type { EntitiesServices } from '../entities';
import type { ThirdPartyServices } from '../third-party';
import { briefServiceFactory } from './brief/service';
import type { BriefService } from './brief/types';
import { researchServiceFactory } from './research/service';
import type { ResearchService } from './research/types';

// Builds every feature slice from the already-constructed entity services (entities → features).
export interface FeaturesServices {
  researchService: ResearchService;
  briefService: BriefService;
}

export function getFeaturesServices({
  entities,
  thirdParty,
}: {
  entities: EntitiesServices;
  thirdParty: ThirdPartyServices;
}): FeaturesServices {
  const researchService = researchServiceFactory({
    ideaService: entities.ideaService,
    planService: entities.planService,
    questionService: entities.questionService,
    researchJobService: entities.researchJobService,
    researchRunner: thirdParty.researchRunner,
    settings: {
      researchOnCapture: settings.RESEARCH_ON_CAPTURE,
      runTimeoutMs: settings.RESEARCH_RUN_TIMEOUT_MS,
      context: settings.RESEARCH_CONTEXT ?? null,
    },
  });
  const briefService = briefServiceFactory({
    ideaService: entities.ideaService,
    planService: entities.planService,
    questionService: entities.questionService,
    researchJobService: entities.researchJobService,
  });

  return { researchService, briefService };
}
