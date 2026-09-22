import { getServices, type Services } from './services';

// The GraphQL context threaded into every resolver. Resolvers reach data ONLY through
// `ctx.services` (never the db). Add per-request DataLoaders here when a relation needs batching.
export interface YogaContext {
  services: Services;
}

export function createContext(): YogaContext {
  return { services: getServices() };
}
