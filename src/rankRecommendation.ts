export type RankRecommendationAction = "raise_watch" | "lower_watch" | "watch" | "not_eligible";
export type RankRecommendationPriority = "high" | "medium" | "low";
export type RankRecommendationStatus = "active" | "not_eligible";

export interface RankRecommendationCurrentSettingRoomGroup {
    rm_room_group_id?: string;
    rm_room_group_name?: string;
    remaining_num_room?: number;
    max_num_room?: number;
    latest_current?: {
        price_rank_code?: string | null;
        price_rank_name?: string | null;
    } | null;
}

export interface RankRecommendationCurrentSettingByDate {
    stay_date?: string;
    rm_room_groups?: RankRecommendationCurrentSettingRoomGroup[];
}

export interface RankRecommendationCurrentSettingsResponse {
    suggest_output_current_settings?: RankRecommendationCurrentSettingByDate[];
}

export interface RankRecommendationCandidate {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    roomGroupName: string;
    currentRankCode: string | null;
    currentRankName: string | null;
    action: RankRecommendationAction;
    priority: RankRecommendationPriority;
    confidence: number;
    reasonCodes: string[];
    reasonFingerprint: string;
    diagnostics: string[];
    status: RankRecommendationStatus;
    generatedAt: string;
}

export function buildRankRecommendationCandidates(options: {
    response: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    asOfDate: string;
    visibleStayDates: Set<string>;
    generatedAt: string;
}): RankRecommendationCandidate[] {
    const candidates: RankRecommendationCandidate[] = [];

    for (const currentSetting of options.response.suggest_output_current_settings ?? []) {
        const stayDate = normalizeCurrentSettingStayDate(currentSetting.stay_date);
        if (stayDate === null || !options.visibleStayDates.has(stayDate)) {
            continue;
        }

        for (const roomGroup of currentSetting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            const roomGroupName = roomGroup.rm_room_group_name?.trim() ?? "";
            if (roomGroupId === "" || roomGroupName === "") {
                continue;
            }

            candidates.push(buildRankRecommendationCandidate({
                facilityId: options.facilityId,
                stayDate,
                asOfDate: options.asOfDate,
                roomGroupId,
                roomGroupName,
                roomGroup,
                generatedAt: options.generatedAt
            }));
        }
    }

    return candidates
        .sort(compareRankRecommendationCandidates)
        .slice(0, 10);
}

function buildRankRecommendationCandidate(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    roomGroupName: string;
    roomGroup: RankRecommendationCurrentSettingRoomGroup;
    generatedAt: string;
}): RankRecommendationCandidate {
    const maxRooms = normalizeFiniteNumber(options.roomGroup.max_num_room);
    const remainingRooms = normalizeFiniteNumber(options.roomGroup.remaining_num_room);
    const diagnostics: string[] = [];
    const reasonCodes: string[] = [];
    const daysToStay = getDaysBetweenDateKeys(options.stayDate, options.asOfDate);

    let action: RankRecommendationAction;
    let priority: RankRecommendationPriority;
    let confidence: number;

    if (maxRooms === null || remainingRooms === null || maxRooms <= 0) {
        action = "not_eligible";
        priority = "low";
        confidence = 0.1;
        diagnostics.push("capacity_missing");
        reasonCodes.push("判定対象外: 部屋数不明");
    } else if (maxRooms <= 2) {
        action = "not_eligible";
        priority = "low";
        confidence = 0.2;
        diagnostics.push("small_capacity");
        reasonCodes.push("判定対象外: 小キャパ");
    } else {
        const remainingRatio = Math.max(0, Math.min(1, remainingRooms / maxRooms));
        const occupancyRatio = 1 - remainingRatio;
        if (remainingRooms <= 2 || occupancyRatio >= 0.85) {
            action = "raise_watch";
            priority = "high";
            confidence = 0.55;
            reasonCodes.push("残室少");
        } else if (daysToStay !== null && daysToStay <= 30 && occupancyRatio <= 0.4) {
            action = "lower_watch";
            priority = "medium";
            confidence = 0.45;
            reasonCodes.push("近日程で稼働低め");
        } else {
            action = "watch";
            priority = occupancyRatio >= 0.65 ? "medium" : "low";
            confidence = 0.35;
            reasonCodes.push("監視");
        }
    }

    if (daysToStay === null) {
        diagnostics.push("lead_time_missing");
    } else if (daysToStay < 0) {
        diagnostics.push("past_stay_date");
    } else if (daysToStay <= 14) {
        reasonCodes.push("LT近い");
    }

    const currentRankCode = normalizeNullableText(options.roomGroup.latest_current?.price_rank_code);
    const currentRankName = normalizeNullableText(options.roomGroup.latest_current?.price_rank_name);
    if (currentRankName === null) {
        diagnostics.push("current_rank_missing");
    }

    const status: RankRecommendationStatus = action === "not_eligible" ? "not_eligible" : "active";
    const reasonFingerprint = [
        options.facilityId,
        options.stayDate,
        options.roomGroupId,
        action,
        priority,
        reasonCodes.join(","),
        diagnostics.join(",")
    ].join(":");

    return {
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        asOfDate: options.asOfDate,
        roomGroupId: options.roomGroupId,
        roomGroupName: options.roomGroupName,
        currentRankCode,
        currentRankName,
        action,
        priority,
        confidence,
        reasonCodes,
        reasonFingerprint,
        diagnostics,
        status,
        generatedAt: options.generatedAt
    };
}

function normalizeCurrentSettingStayDate(value: string | undefined): string | null {
    if (value === undefined) {
        return null;
    }

    return toCompactDateKey(value);
}

function toCompactDateKey(value: string): string | null {
    const compact = value.trim().replace(/-/g, "");
    return /^\d{8}$/.test(compact) ? compact : null;
}

function normalizeFiniteNumber(value: number | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

function compareRankRecommendationCandidates(left: RankRecommendationCandidate, right: RankRecommendationCandidate): number {
    const priorityDelta = getRankRecommendationPriorityWeight(right.priority) - getRankRecommendationPriorityWeight(left.priority);
    if (priorityDelta !== 0) {
        return priorityDelta;
    }

    const statusDelta = getRankRecommendationStatusWeight(right.status) - getRankRecommendationStatusWeight(left.status);
    if (statusDelta !== 0) {
        return statusDelta;
    }

    const confidenceDelta = right.confidence - left.confidence;
    if (confidenceDelta !== 0) {
        return confidenceDelta;
    }

    const dateDelta = left.stayDate.localeCompare(right.stayDate);
    if (dateDelta !== 0) {
        return dateDelta;
    }

    return left.roomGroupName.localeCompare(right.roomGroupName, "ja");
}

function getRankRecommendationPriorityWeight(priority: RankRecommendationPriority): number {
    switch (priority) {
        case "high":
            return 3;
        case "medium":
            return 2;
        case "low":
        default:
            return 1;
    }
}

function getRankRecommendationStatusWeight(status: RankRecommendationStatus): number {
    return status === "active" ? 1 : 0;
}

function getDaysBetweenDateKeys(laterDateKey: string, earlierDateKey: string): number | null {
    const laterYear = Number(laterDateKey.slice(0, 4));
    const laterMonth = Number(laterDateKey.slice(4, 6));
    const laterDay = Number(laterDateKey.slice(6, 8));
    const earlierYear = Number(earlierDateKey.slice(0, 4));
    const earlierMonth = Number(earlierDateKey.slice(4, 6));
    const earlierDay = Number(earlierDateKey.slice(6, 8));

    if (
        !Number.isFinite(laterYear) || !Number.isFinite(laterMonth) || !Number.isFinite(laterDay)
        || !Number.isFinite(earlierYear) || !Number.isFinite(earlierMonth) || !Number.isFinite(earlierDay)
    ) {
        return null;
    }

    const laterDate = Date.UTC(laterYear, laterMonth - 1, laterDay);
    const earlierDate = Date.UTC(earlierYear, earlierMonth - 1, earlierDay);
    return Math.round((laterDate - earlierDate) / 86400000);
}
