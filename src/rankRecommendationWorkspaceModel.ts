export type RankRecommendationWorkState = "ready" | "needs_evidence" | "recent_or_held";

export interface RankRecommendationWorkStateInput {
    hasPendingRankChange: boolean;
    hasActiveRankChange: boolean;
    hasRecentChange: boolean;
    hasCompleteIndividualGroupEvidence: boolean;
    rankChangeResultStatus: "success" | "blocked" | "failed" | "confirming" | null;
    proposalEnabled: boolean;
    status: "active" | "not_eligible";
    action: "raise_watch" | "lower_watch" | "watch" | "not_eligible";
    cautionCount: number;
}

export type RankRecommendationWorkStateCounts = Record<RankRecommendationWorkState, number>;

export function resolveRankRecommendationWorkState(
    input: RankRecommendationWorkStateInput
): RankRecommendationWorkState {
    if (
        input.hasPendingRankChange
        || input.hasActiveRankChange
        || input.hasRecentChange
        || input.rankChangeResultStatus === "confirming"
        || input.rankChangeResultStatus === "success"
    ) {
        return "recent_or_held";
    }

    if (
        input.rankChangeResultStatus === "blocked"
        || input.rankChangeResultStatus === "failed"
        || !input.hasCompleteIndividualGroupEvidence
        || !input.proposalEnabled
        || input.status !== "active"
        || input.action === "watch"
        || input.action === "not_eligible"
        || input.cautionCount > 0
    ) {
        return "needs_evidence";
    }

    return "ready";
}

export function countRankRecommendationWorkStates(
    states: readonly RankRecommendationWorkState[]
): RankRecommendationWorkStateCounts {
    const counts: RankRecommendationWorkStateCounts = {
        ready: 0,
        needs_evidence: 0,
        recent_or_held: 0
    };
    for (const state of states) {
        counts[state] += 1;
    }
    return counts;
}

export function selectAvailableRankRecommendationWorkState(
    requested: RankRecommendationWorkState,
    counts: RankRecommendationWorkStateCounts
): RankRecommendationWorkState {
    if (counts[requested] > 0) {
        return requested;
    }

    const fallbackOrder: readonly RankRecommendationWorkState[] = [
        "ready",
        "needs_evidence",
        "recent_or_held"
    ];
    return fallbackOrder.find((state) => counts[state] > 0) ?? requested;
}
