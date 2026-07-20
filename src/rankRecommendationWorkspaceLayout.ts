export type RankRecommendationWorkspaceLayoutMode = "wide" | "stacked";

export const RANK_RECOMMENDATION_WORKSPACE_RAIL_MAX_WIDTH = 356;
export const RANK_RECOMMENDATION_WORKSPACE_GAP = 14;
export const RANK_RECOMMENDATION_WORKSPACE_READABLE_MONTH_WIDTH = 560;

export interface RankRecommendationWorkspaceLayoutInput {
    containerWidth: number;
    calendarMinimumWidth: number;
    calendarMonthCount: number;
    structureSafe: boolean;
}

export function resolveRankRecommendationWorkspaceLayoutMode(
    input: RankRecommendationWorkspaceLayoutInput
): RankRecommendationWorkspaceLayoutMode {
    if (
        !input.structureSafe
        || !Number.isFinite(input.containerWidth)
        || !Number.isFinite(input.calendarMinimumWidth)
        || !Number.isInteger(input.calendarMonthCount)
        || input.containerWidth <= 0
        || input.calendarMinimumWidth <= 0
        || input.calendarMonthCount <= 0
    ) {
        return "stacked";
    }

    const readableCalendarWidth = Math.max(
        input.calendarMinimumWidth,
        input.calendarMonthCount * RANK_RECOMMENDATION_WORKSPACE_READABLE_MONTH_WIDTH
    );
    const requiredWidth = readableCalendarWidth
        + RANK_RECOMMENDATION_WORKSPACE_GAP
        + RANK_RECOMMENDATION_WORKSPACE_RAIL_MAX_WIDTH;
    return input.containerWidth >= requiredWidth ? "wide" : "stacked";
}
