export type MatchTier = "best_matches" | "broader_pool";
export type LocationMatchType = "city_exact" | "city_alias" | "country_only" | "none";

export interface TierCandidate {
  matchTier?: MatchTier | null;
  locationMatchType?: LocationMatchType | null;
}

export type TierModel = "explicit" | "location_derived" | "fallback";

export interface TierSplit<TCandidate> {
  bestMatches: TCandidate[];
  broaderPool: TCandidate[];
  tierModel: TierModel;
}

export function splitByTier<TCandidate extends TierCandidate>(
  candidates: TCandidate[],
  forcedModel?: TierModel,
): TierSplit<TCandidate> {
  const model = forcedModel ?? detectTierModel(candidates);

  if (model === "explicit") {
    return {
      bestMatches: candidates.filter((candidate) => candidate.matchTier !== "broader_pool"),
      broaderPool: candidates.filter((candidate) => candidate.matchTier === "broader_pool"),
      tierModel: "explicit",
    };
  }

  if (model === "location_derived") {
    return {
      bestMatches: candidates.filter((candidate) => candidate.locationMatchType !== "none"),
      broaderPool: candidates.filter((candidate) => candidate.locationMatchType === "none"),
      tierModel: "location_derived",
    };
  }

  return {
    bestMatches: candidates,
    broaderPool: [],
    tierModel: "fallback",
  };
}

export function detectTierModel<TCandidate extends TierCandidate>(
  candidates: TCandidate[],
): TierModel {
  if (candidates.some((c) => c.matchTier === "best_matches" || c.matchTier === "broader_pool")) {
    return "explicit";
  }
  if (candidates.some((c) => !!c.locationMatchType)) {
    return "location_derived";
  }
  return "fallback";
}
