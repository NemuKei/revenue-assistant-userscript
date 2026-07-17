export type RankRecommendationWorkspaceLayoutMode = "wide" | "stacked";

export const RANK_RECOMMENDATION_WORKSPACE_RAIL_MAX_WIDTH = 356;
export const RANK_RECOMMENDATION_WORKSPACE_GAP = 14;

export interface RankRecommendationWorkspaceLayoutInput {
    containerWidth: number;
    calendarMinimumWidth: number;
    structureSafe: boolean;
}

export function resolveRankRecommendationWorkspaceLayoutMode(
    input: RankRecommendationWorkspaceLayoutInput
): RankRecommendationWorkspaceLayoutMode {
    if (
        !input.structureSafe
        || !Number.isFinite(input.containerWidth)
        || !Number.isFinite(input.calendarMinimumWidth)
        || input.containerWidth <= 0
        || input.calendarMinimumWidth <= 0
    ) {
        return "stacked";
    }

    const requiredWidth = input.calendarMinimumWidth
        + RANK_RECOMMENDATION_WORKSPACE_GAP
        + RANK_RECOMMENDATION_WORKSPACE_RAIL_MAX_WIDTH;
    return input.containerWidth >= requiredWidth ? "wide" : "stacked";
}
