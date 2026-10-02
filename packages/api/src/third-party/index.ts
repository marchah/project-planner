import { settings } from '../common/settings';
import type { IdeaTitleGenerator } from '../entities/idea/types';
import type { ResearchRunner } from '../features/research/types';
import { hermesAdapterFactory } from './hermes/adapter';
import { titleModelAdapterFactory } from './title-model/adapter';

// Builds every external-provider adapter. Adapters implement ports the slices declare, so this
// module sits BELOW entities in the dependency order: third-party → entities → features.
export interface ThirdPartyServices {
  titleGenerator: IdeaTitleGenerator;
  researchRunner: ResearchRunner;
}

export function getThirdPartyServices(): ThirdPartyServices {
  const titleGenerator = titleModelAdapterFactory({ config: settings });
  const researchRunner = hermesAdapterFactory({ config: settings });

  return { titleGenerator, researchRunner };
}
