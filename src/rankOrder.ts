export type RankRecommendationRankOrderSource =
    | "manual_override"
    | "numeric_rank_name"
    | "settings_screen"
    | "unresolved";
export type RankRecommendationRankChangeDirection = "lower" | "raise" | "unknown";

export interface RankRecommendationRankOrderEntry {
    code: string;
    name: string;
}

export interface RankRecommendationRankOrderResolution {
    diagnostics: string[];
    ranksHighToLow: RankRecommendationRankOrderEntry[];
    source: RankRecommendationRankOrderSource;
}

export interface RankRecommendationRankChangeDirectionResolution {
    direction: RankRecommendationRankChangeDirection;
    source: RankRecommendationRankOrderSource;
}

export function resolveRankRecommendationRankChangeDirection(options: {
    afterRankName: string | null;
    beforeRankName: string | null;
    rankOrder?: RankRecommendationRankOrderResolution | null;
}): RankRecommendationRankChangeDirectionResolution {
    const beforeRankName = normalizeRankName(options.beforeRankName);
    const afterRankName = normalizeRankName(options.afterRankName);
    if (beforeRankName === null || afterRankName === null || beforeRankName === afterRankName) {
        return { direction: "unknown", source: "unresolved" };
    }

    const rankOrder = options.rankOrder ?? null;
    if (rankOrder !== null && rankOrder.source !== "unresolved") {
        const positionsByName = new Map<string, number>();
        const duplicateNames = new Set<string>();
        for (const [position, rank] of rankOrder.ranksHighToLow.entries()) {
            const name = normalizeRankName(rank.name);
            if (name === null) {
                continue;
            }
            if (positionsByName.has(name)) {
                duplicateNames.add(name);
            } else {
                positionsByName.set(name, position);
            }
        }
        const before = duplicateNames.has(beforeRankName)
            ? undefined
            : positionsByName.get(beforeRankName);
        const after = duplicateNames.has(afterRankName)
            ? undefined
            : positionsByName.get(afterRankName);
        return before === undefined || after === undefined || before === after
            ? { direction: "unknown", source: "unresolved" }
            : {
                direction: after < before ? "raise" : "lower",
                source: rankOrder.source
            };
    }

    const before = parseRankNameNumber(beforeRankName);
    const after = parseRankNameNumber(afterRankName);
    return before === null || after === null || before === after
        ? { direction: "unknown", source: "unresolved" }
        : {
            direction: after < before ? "raise" : "lower",
            source: "numeric_rank_name"
        };
}

export function parseRankNameNumber(value: string): number | null {
    const normalized = value.trim();
    if (!/^\d+$/u.test(normalized)) {
        return null;
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRankName(value: string | null): string | null {
    if (value === null) {
        return null;
    }
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
}
