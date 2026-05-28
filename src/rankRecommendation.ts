export type RankRecommendationAction = "raise_watch" | "lower_watch" | "watch" | "not_eligible";
export type RankRecommendationPriority = "high" | "medium" | "low";
export type RankRecommendationStatus = "active" | "not_eligible";
export type RankRecommendationForecastSignal = "high_occupancy" | "low_occupancy" | "neutral";
export type RankRecommendationSalesAdrHealthSignal = "adr_down" | "sales_down" | "adr_and_sales_down" | "neutral";

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
    recommendedRankCode: string | null;
    recommendedRankName: string | null;
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
    forecastSignal: RankRecommendationForecastSignal | null;
    salesAdrHealthSignal: RankRecommendationSalesAdrHealthSignal | null;
    diagnostics: string[];
}

export interface RankRecommendationRankLadderEntry {
    price_rank_code?: string | null;
    price_rank_name?: string | null;
}

export function buildRankRecommendationCandidates(options: {
    response: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    asOfDate: string;
    visibleStayDates: Set<string>;
    generatedAt: string;
    curveEvidenceByKey?: ReadonlyMap<string, RankRecommendationCurveEvidence>;
    rankLadder?: readonly RankRecommendationRankLadderEntry[];
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
                rankLadder: options.rankLadder ?? [],
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
    rankLadder: readonly RankRecommendationRankLadderEntry[];
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
    const forecastSignal = curveEvidence?.forecastSignal ?? null;
    const salesAdrHealthSignal = curveEvidence?.salesAdrHealthSignal ?? null;

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

    if (action !== "not_eligible" && forecastSignal !== null) {
        if (forecastSignal === "high_occupancy") {
            reasonCodes.push("着地見込み高");
            if (action === "raise_watch") {
                confidence = increaseConfidence(confidence, 0.08);
            } else if (action === "watch" && !isGroupDriven) {
                priority = maxPriority(priority, "medium");
                confidence = increaseConfidence(confidence, 0.05);
            }
        } else if (forecastSignal === "low_occupancy") {
            reasonCodes.push("着地見込み低");
            if (action === "lower_watch") {
                confidence = increaseConfidence(confidence, 0.08);
            } else if (action === "watch" && (daysToStay === null || daysToStay <= 30)) {
                priority = maxPriority(priority, "medium");
                confidence = increaseConfidence(confidence, 0.05);
            }
        }
    }

    if (action !== "not_eligible" && salesAdrHealthSignal !== null) {
        if (salesAdrHealthSignal === "adr_and_sales_down") {
            reasonCodes.push("ADR・売上弱含み");
            if (action === "raise_watch") {
                priority = minPriority(priority, "medium");
                confidence = decreaseConfidence(confidence, 0.08);
            } else if (action === "lower_watch") {
                confidence = increaseConfidence(confidence, 0.06);
            } else if (action === "watch" && (daysToStay === null || daysToStay <= 30)) {
                priority = maxPriority(priority, "medium");
                confidence = increaseConfidence(confidence, 0.04);
            }
        } else if (salesAdrHealthSignal === "adr_down") {
            reasonCodes.push("ADR弱含み");
            if (action === "raise_watch") {
                priority = minPriority(priority, "medium");
                confidence = decreaseConfidence(confidence, 0.05);
            } else if (action === "lower_watch") {
                confidence = increaseConfidence(confidence, 0.03);
            }
        } else if (salesAdrHealthSignal === "sales_down") {
            reasonCodes.push("売上弱含み");
            if (action === "raise_watch") {
                priority = minPriority(priority, "medium");
                confidence = decreaseConfidence(confidence, 0.04);
            } else if (action === "lower_watch") {
                confidence = increaseConfidence(confidence, 0.05);
            } else if (action === "watch" && (daysToStay === null || daysToStay <= 30)) {
                priority = maxPriority(priority, "medium");
                confidence = increaseConfidence(confidence, 0.03);
            }
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
    const recommendedRank = resolveRecommendedRank({
        action,
        currentRankCode,
        rankLadder: options.rankLadder
    });

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
        recommendedRankCode: recommendedRank?.code ?? null,
        recommendedRankName: recommendedRank?.name ?? null,
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

function increaseConfidence(current: number, delta: number): number {
    return Math.min(0.95, Math.round((current + delta) * 100) / 100);
}

function decreaseConfidence(current: number, delta: number): number {
    return Math.max(0.05, Math.round((current - delta) * 100) / 100);
}

function maxPriority(current: RankRecommendationPriority, candidate: RankRecommendationPriority): RankRecommendationPriority {
    return getRankRecommendationPriorityWeight(candidate) > getRankRecommendationPriorityWeight(current)
        ? candidate
        : current;
}

function minPriority(current: RankRecommendationPriority, candidate: RankRecommendationPriority): RankRecommendationPriority {
    return getRankRecommendationPriorityWeight(candidate) < getRankRecommendationPriorityWeight(current)
        ? candidate
        : current;
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

function resolveRecommendedRank(options: {
    action: RankRecommendationAction;
    currentRankCode: string | null;
    rankLadder: readonly RankRecommendationRankLadderEntry[];
}): { code: string; name: string } | null {
    if (options.currentRankCode === null) {
        return null;
    }

    const direction = getRecommendedRankStepDirection(options.action);
    if (direction === 0) {
        return null;
    }

    const ladder = options.rankLadder.flatMap((entry) => {
        const code = normalizeNullableText(entry.price_rank_code);
        const name = normalizeNullableText(entry.price_rank_name);
        return code === null || name === null ? [] : [{ code, name }];
    });
    const currentIndex = ladder.findIndex((entry) => entry.code === options.currentRankCode);
    const targetIndex = currentIndex + direction;
    const targetRank = ladder[targetIndex];
    return targetRank ?? null;
}

function getRecommendedRankStepDirection(action: RankRecommendationAction): -1 | 0 | 1 {
    if (action === "raise_watch") {
        return 1;
    }
    if (action === "lower_watch") {
        return -1;
    }
    return 0;
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
