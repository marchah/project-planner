import type { EntitiesServices } from '../entities';

// Builds every feature slice from the already-constructed entity services (entities → features).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no features yet
export interface FeaturesServices {}

export function getFeaturesServices(_deps: { entities: EntitiesServices }): FeaturesServices {
  return {};
}
