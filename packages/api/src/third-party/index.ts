// Builds every external-provider adapter. Adapters implement ports the slices declare, so this
// module sits BELOW entities in the dependency order: third-party → entities → features.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no adapters yet
export interface ThirdPartyServices {}

export function getThirdPartyServices(): ThirdPartyServices {
  return {};
}
