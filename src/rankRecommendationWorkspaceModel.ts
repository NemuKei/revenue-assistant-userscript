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

export type RankRecommendationCalendarCuePolicy = "all_active" | "visible_tasks" | "high_priority";

export interface RankRecommendationCalendarCueSelectable {
    priority: "high" | "medium" | "low";
}

export interface RankRecommendationCalendarCueSummary {
    dominantState: RankRecommendationWorkState;
    totalCount: number;
    stateCounts: RankRecommendationWorkStateCounts;
    label: string;
}

export const DEFAULT_RANK_RECOMMENDATION_CALENDAR_CUE_POLICY: RankRecommendationCalendarCuePolicy = "visible_tasks";

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

export function selectRankRecommendationCalendarCueItems<T extends RankRecommendationCalendarCueSelectable>(options: {
    activeItems: readonly T[];
    visibleItems: readonly T[];
    policy?: RankRecommendationCalendarCuePolicy;
}): readonly T[] {
    const policy = options.policy ?? DEFAULT_RANK_RECOMMENDATION_CALENDAR_CUE_POLICY;
    if (policy === "all_active") {
        return options.activeItems;
    }
    if (policy === "high_priority") {
        return options.activeItems.filter((item) => item.priority === "high");
    }
    return options.visibleItems;
}

export function buildRankRecommendationCalendarCueSummary(
    states: readonly RankRecommendationWorkState[],
    subjectLabel: string
): RankRecommendationCalendarCueSummary {
    const stateCounts = countRankRecommendationWorkStates(states);
    const dominantState: RankRecommendationWorkState = stateCounts.ready > 0
        ? "ready"
        : stateCounts.needs_evidence > 0
            ? "needs_evidence"
            : "recent_or_held";
    const label = [
        `${subjectLabel} ${states.length}件`,
        stateCounts.ready > 0 ? `判断可能 ${stateCounts.ready}件` : null,
        stateCounts.needs_evidence > 0 ? `要確認 ${stateCounts.needs_evidence}件` : null,
        stateCounts.recent_or_held > 0 ? `保留・直近 ${stateCounts.recent_or_held}件` : null
    ].filter((part): part is string => part !== null).join("、");
    return {
        dominantState,
        totalCount: states.length,
        stateCounts,
        label
    };
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
