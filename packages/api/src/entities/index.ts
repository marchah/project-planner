import type { Db } from '../db/client';
import type { ThirdPartyServices } from '../third-party';
import { ideaRepositoryFactory } from './idea/repository';
import { ideaServiceFactory } from './idea/service';
import type { IdeaService } from './idea/types';

// Builds every entity slice. Entities own a table + repository and must never import features.
export interface EntitiesServices {
  ideaService: IdeaService;
}

export function getEntitiesServices({
  db,
}: {
  db: Db;
  thirdParty: ThirdPartyServices;
}): EntitiesServices {
  const ideaService = ideaServiceFactory({ ideaRepository: ideaRepositoryFactory({ db }) });

  return { ideaService };
}
