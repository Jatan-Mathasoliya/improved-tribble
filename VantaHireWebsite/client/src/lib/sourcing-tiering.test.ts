import { describe, expect, it } from "vitest";
import { splitByTier } from "./sourcing-tiering";

interface TestCandidate {
  id: number;
  matchTier?: "best_matches" | "broader_pool" | null;
  locationMatchType?: "city_exact" | "city_alias" | "country_only" | "none" | null;
}

describe("splitByTier", () => {
  it("handles empty candidate list", () => {
    const result = splitByTier([]);

    expect(result.tierModel).toBe("fallback");
    expect(result.bestMatches).toHaveLength(0);
    expect(result.broaderPool).toHaveLength(0);
  });

  it("uses explicit matchTier when present", () => {
    const candidates: TestCandidate[] = [
      { id: 1, matchTier: "best_matches", locationMatchType: "none" },
      { id: 2, matchTier: "broader_pool", locationMatchType: "city_exact" },
      { id: 3 },
    ];

    const result = splitByTier(candidates);

    expect(result.tierModel).toBe("explicit");
    expect(result.bestMatches.map((candidate) => candidate.id)).toEqual([1, 3]);
    expect(result.broaderPool.map((candidate) => candidate.id)).toEqual([2]);
  });

  it("triggers explicit mode even when some candidates lack matchTier", () => {
    const candidates: TestCandidate[] = [
      { id: 1, matchTier: "best_matches" },
      { id: 2, matchTier: null },
      { id: 3 },
    ];

    const result = splitByTier(candidates);

    expect(result.tierModel).toBe("explicit");
    expect(result.bestMatches.map((candidate) => candidate.id)).toEqual([1, 2, 3]);
    expect(result.broaderPool).toHaveLength(0);
  });

  it("derives tiers from locationMatchType when explicit tiers are absent", () => {
    const candidates: TestCandidate[] = [
      { id: 1, locationMatchType: "city_exact" },
      { id: 2, locationMatchType: "none" },
      { id: 3 },
    ];

    const result = splitByTier(candidates);

    expect(result.tierModel).toBe("location_derived");
    expect(result.bestMatches.map((candidate) => candidate.id)).toEqual([1, 3]);
    expect(result.broaderPool.map((candidate) => candidate.id)).toEqual([2]);
  });

  it("falls back to all best matches when no tiering metadata exists", () => {
    const candidates: TestCandidate[] = [{ id: 1 }, { id: 2 }];

    const result = splitByTier(candidates);

    expect(result.tierModel).toBe("fallback");
    expect(result.bestMatches.map((candidate) => candidate.id)).toEqual([1, 2]);
    expect(result.broaderPool).toHaveLength(0);
  });
});
