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
): TierSplit<TCandidate> {
  const hasExplicitTier = candidates.some(
    (candidate) => candidate.matchTier === "best_matches" || candidate.matchTier === "broader_pool",
  );

  if (hasExplicitTier) {
    return {
      bestMatches: candidates.filter((candidate) => candidate.matchTier !== "broader_pool"),
      broaderPool: candidates.filter((candidate) => candidate.matchTier === "broader_pool"),
      tierModel: "explicit",
    };
  }

  const hasLocationMatchType = candidates.some((candidate) => !!candidate.locationMatchType);
  if (hasLocationMatchType) {
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
