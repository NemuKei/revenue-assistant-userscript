import type {
    AdjustmentReviewDirection,
    AdjustmentReviewIntentAssessment,
    AdjustmentReviewIntentState,
    AdjustmentReviewObservation
} from "./adjustmentReviewModel";

export function formatAdjustmentReviewIntentSummary(state: AdjustmentReviewIntentState): string {
    switch (state) {
        case "aligned": return "同方向・様子見";
        case "opposed": return "逆方向・追加確認";
        case "unchanged": return "変化なし・反応確認";
        case "unavailable": return "判定材料待ち";
    }
}

export function formatAdjustmentReviewNextAction(
    assessment: AdjustmentReviewIntentAssessment
): string {
    switch (assessment.nextAction) {
        case "monitor": return "様子見・追加調整の緊急度低";
        case "review-adjustment": return `${formatAdjustmentReviewFollowUpDirection(assessment)}方向の追加調整余地を確認`;
        case "review-response": return `${formatAdjustmentReviewFollowUpDirection(assessment)}方向の反応と追加調整余地を確認`;
        case "needs-evidence": return "観測状態またはランク方向を確認";
    }
}

export function formatAdjustmentReviewObservation(
    observation: AdjustmentReviewObservation
): string {
    switch (observation.state) {
        case "ready": return "比較可";
        case "missing": return "観測不足（exact pointなし）";
        case "pending": return "観測待ち";
        case "censored": return "再調整あり";
        case "excluded": return observation.reason === "same-day-multiple"
            ? "比較対象外（同日複数調整）"
            : "比較対象外（宿泊日を越える期間）";
    }
}

export function formatAdjustmentReviewDirection(direction: AdjustmentReviewDirection): string {
    return direction === "raise" ? "上げ" : direction === "lower" ? "下げ" : "方向未確認";
}

export function getAdjustmentReviewIntentIcon(state: AdjustmentReviewIntentState): string {
    return state === "aligned" ? "↔" : state === "opposed" ? "⇄" : state === "unchanged" ? "0" : "?";
}

function formatAdjustmentReviewFollowUpDirection(
    assessment: AdjustmentReviewIntentAssessment
): string {
    return assessment.followUpDirection === null
        ? "同じ"
        : formatAdjustmentReviewDirection(assessment.followUpDirection);
}
