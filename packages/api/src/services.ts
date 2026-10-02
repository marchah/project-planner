import { createDb } from './db/client';
import { getEntitiesServices, type EntitiesServices } from './entities';
import { getFeaturesServices, type FeaturesServices } from './features';
import { getThirdPartyServices } from './third-party';

// The application's service surface. Resolvers and workers use this shape via context.
export type Services = EntitiesServices & FeaturesServices;

let cached: Services | undefined;

// The composition root — the ONLY place the dependency graph is wired, memoized so the whole app
// shares one service graph + db handle. Modules are built in dependency order.
export function getServices(): Services {
  if (cached) return cached;
  const db = createDb();

  const thirdParty = getThirdPartyServices();
  const entities = getEntitiesServices({ db, thirdParty });
  const features = getFeaturesServices({ entities, thirdParty });

  cached = { ...entities, ...features };
  return cached;
}
