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

export interface RankRecommendationCurveEvidence {
    currentAllRooms: number | null;
    referenceAllRooms: number | null;
    currentTransientRooms: number | null;
    referenceTransientRooms: number | null;
    currentGroupRooms: number | null;
    referenceGroupRooms: number | null;
    diagnostics: string[];
}

export function buildRankRecommendationCandidates(options: {
    response: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    asOfDate: string;
    visibleStayDates: Set<string>;
    generatedAt: string;
    curveEvidenceByKey?: ReadonlyMap<string, RankRecommendationCurveEvidence>;
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
                curveEvidence: options.curveEvidenceByKey?.get(buildRankRecommendationEvidenceKey(stayDate, roomGroupId)) ?? null,
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
    curveEvidence: RankRecommendationCurveEvidence | null;
    generatedAt: string;
}): RankRecommendationCandidate {
    const maxRooms = normalizeFiniteNumber(options.roomGroup.max_num_room);
    const remainingRooms = normalizeFiniteNumber(options.roomGroup.remaining_num_room);
    const diagnostics: string[] = [];
    const reasonCodes: string[] = [];
    const daysToStay = getDaysBetweenDateKeys(options.stayDate, options.asOfDate);
    const curveEvidence = options.curveEvidence;
    const allDeviation = getDeviation(curveEvidence?.currentAllRooms ?? null, curveEvidence?.referenceAllRooms ?? null);
    const transientDeviation = getDeviation(curveEvidence?.currentTransientRooms ?? null, curveEvidence?.referenceTransientRooms ?? null);
    const groupDeviation = getDeviation(curveEvidence?.currentGroupRooms ?? null, curveEvidence?.referenceGroupRooms ?? null);
    const isGroupDriven = isPositive(groupDeviation) && !isPositive(transientDeviation);

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
        if (isGroupDriven && (remainingRooms <= 2 || occupancyRatio >= 0.85)) {
            action = "watch";
            priority = "medium";
            confidence = 0.35;
            diagnostics.push("group_driven_raise_suppressed");
            reasonCodes.push("団体主因");
        } else if ((remainingRooms <= 2 || occupancyRatio >= 0.85) && (curveEvidence === null || allDeviation === null || allDeviation >= 0 || isPositive(transientDeviation))) {
            action = "raise_watch";
            priority = "high";
            confidence = curveEvidence === null || allDeviation === null ? 0.45 : 0.62;
            reasonCodes.push("残室少");
            if (isPositive(transientDeviation)) {
                reasonCodes.push("個人pace上振れ");
            }
        } else if (
            daysToStay !== null
            && daysToStay <= 30
            && occupancyRatio <= 0.4
            && (allDeviation === null || allDeviation < 0 || transientDeviation === null || transientDeviation < 0)
        ) {
            action = "lower_watch";
            priority = "medium";
            confidence = curveEvidence === null || allDeviation === null ? 0.35 : 0.5;
            reasonCodes.push("近日程で稼働低め");
        } else {
            action = "watch";
            priority = occupancyRatio >= 0.65 || isPositive(allDeviation) ? "medium" : "low";
            confidence = curveEvidence === null ? 0.25 : 0.38;
            reasonCodes.push(allDeviation === null ? "監視" : "reference差分小");
        }
    }

    if (curveEvidence === null) {
        diagnostics.push("booking_curve_source_missing");
        reasonCodes.push("データ不足");
    } else {
        diagnostics.push(...curveEvidence.diagnostics);
        if (allDeviation === null) {
            diagnostics.push("reference_deviation_missing");
            reasonCodes.push("reference不足");
        } else if (allDeviation > 0) {
            reasonCodes.push("reference上振れ");
        } else if (allDeviation < 0) {
            reasonCodes.push("reference下振れ");
        } else {
            reasonCodes.push("reference同水準");
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

export function buildRankRecommendationEvidenceKey(stayDate: string, roomGroupId: string): string {
    return `${stayDate}:${roomGroupId}`;
}

function getDeviation(current: number | null, reference: number | null): number | null {
    return current === null || reference === null ? null : current - reference;
}

function isPositive(value: number | null): boolean {
    return value !== null && value > 0;
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
