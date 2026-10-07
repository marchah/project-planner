import { settings } from '../common/settings';
import type { EntitiesServices } from '../entities';
import { ideaUrl } from '../entities/idea/routes';
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
    decisionService: entities.decisionService,
    ideaService: entities.ideaService,
    planService: entities.planService,
    questionService: entities.questionService,
    researchJobService: entities.researchJobService,
    researchRunner: thirdParty.researchRunner,
    researchNotifier: thirdParty.researchNotifier,
    settings: {
      researchOnCapture: settings.RESEARCH_ON_CAPTURE,
      runTimeoutMs: settings.RESEARCH_RUN_TIMEOUT_MS,
      refreshDebounceMs: settings.REFRESH_DEBOUNCE_MS,
      refreshSchedule: settings.REFRESH_SCHEDULE
        ? { pattern: settings.REFRESH_SCHEDULE, timezone: settings.REFRESH_TIMEZONE }
        : null,
      context: settings.RESEARCH_CONTEXT ?? null,
      ideaUrl: (id) => (settings.PUBLIC_URL ? ideaUrl(settings.PUBLIC_URL, id) : null),
    },
  });
  const briefService = briefServiceFactory({
    decisionService: entities.decisionService,
    ideaService: entities.ideaService,
    planService: entities.planService,
    questionService: entities.questionService,
    researchJobService: entities.researchJobService,
  });

  return { researchService, briefService };
}
