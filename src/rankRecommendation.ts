export type RankRecommendationAction = "raise_watch" | "lower_watch" | "watch" | "not_eligible";
export type RankRecommendationPriority = "high" | "medium" | "low";
export type RankRecommendationStatus = "active" | "not_eligible";
export type RankRecommendationForecastSignal = "high_occupancy" | "low_occupancy" | "neutral";
export type RankRecommendationSalesAdrHealthSignal = "adr_down" | "sales_down" | "adr_and_sales_down" | "neutral";
export type RankRecommendationWeekdayContextSignal = "weekday_reference_supports_raise" | "weekday_reference_supports_lower" | "weekday_reference_neutral";
export type RankRecommendationOwnPricePositionSignal = "own_price_low_against_competitors" | "own_price_near_competitors" | "own_price_high_against_competitors";
export type RankRecommendationRankOrderSource = "numeric_rank_name" | "settings_screen" | "manual_override" | "unresolved";
export type RankRecommendationRecommendedRankUnavailableReason =
    | "rank_ladder_missing"
    | "current_rank_not_in_ladder"
    | "rank_order_unresolved"
    | "rank_ladder_boundary";

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
    recommendedRankUnavailableReason: RankRecommendationRecommendedRankUnavailableReason | null;
    rankOrderSource: RankRecommendationRankOrderSource;
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
    weekdayContextSignal: RankRecommendationWeekdayContextSignal | null;
    ownPricePositionSignal: RankRecommendationOwnPricePositionSignal | null;
    diagnostics: string[];
}

export interface RankRecommendationRankLadderEntry {
    price_rank_code?: string | null;
    price_rank_name?: string | null;
}

export interface RankRecommendationRankOrderOverride {
    rankCodesHighToLow: readonly string[];
}

export interface RankRecommendationRankOrderEntry {
    code: string;
    name: string;
}

export interface RankRecommendationRankOrderResolution {
    source: RankRecommendationRankOrderSource;
    ranksHighToLow: RankRecommendationRankOrderEntry[];
    diagnostics: string[];
}

interface ManualRankOrderResolution {
    ranks: RankRecommendationRankOrderEntry[] | null;
    diagnostics: string[];
}

export function buildRankRecommendationCandidates(options: {
    response: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    asOfDate: string;
    visibleStayDates: Set<string>;
    generatedAt: string;
    curveEvidenceByKey?: ReadonlyMap<string, RankRecommendationCurveEvidence>;
    rankLadder?: readonly RankRecommendationRankLadderEntry[];
    rankOrderOverride?: RankRecommendationRankOrderOverride | null;
}): RankRecommendationCandidate[] {
    const candidates: RankRecommendationCandidate[] = [];
    const rankOrder = resolveRankRecommendationRankOrder({
        rankLadder: options.rankLadder ?? [],
        override: options.rankOrderOverride ?? null
    });

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
                rankOrder,
                generatedAt: options.generatedAt
            }));
        }
    }

    return candidates.sort(compareRankRecommendationCandidates);
}

function buildRankRecommendationCandidate(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    roomGroupName: string;
    roomGroup: RankRecommendationCurrentSettingRoomGroup;
    curveEvidence: RankRecommendationCurveEvidence | null;
    rankOrder: RankRecommendationRankOrderResolution;
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
    const weekdayContextSignal = curveEvidence?.weekdayContextSignal ?? null;
    const ownPricePositionSignal = curveEvidence?.ownPricePositionSignal ?? null;

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

    if (action !== "not_eligible" && weekdayContextSignal !== null) {
        if (weekdayContextSignal === "weekday_reference_supports_raise") {
            if (action === "raise_watch") {
                reasonCodes.push("同曜日強め");
                confidence = increaseConfidence(confidence, 0.04);
            } else if (action === "watch" && !isGroupDriven) {
                reasonCodes.push("同曜日強め");
                priority = maxPriority(priority, "medium");
                confidence = increaseConfidence(confidence, 0.03);
            }
        } else if (weekdayContextSignal === "weekday_reference_supports_lower") {
            if (action === "lower_watch") {
                reasonCodes.push("同曜日弱め");
                confidence = increaseConfidence(confidence, 0.04);
            } else if (action === "watch" && (daysToStay === null || daysToStay <= 30)) {
                reasonCodes.push("同曜日弱め");
                priority = maxPriority(priority, "medium");
                confidence = increaseConfidence(confidence, 0.03);
            }
        }
    }

    if (action !== "not_eligible" && ownPricePositionSignal !== null) {
        diagnostics.push("competitor_price_room_group_scope_unconfirmed");
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
    diagnostics.push(...options.rankOrder.diagnostics);
    const recommendedRankResolution = resolveRecommendedRank({
        action,
        currentRankCode,
        rankOrder: options.rankOrder
    });
    diagnostics.push(`rank_order_source_${options.rankOrder.source}`);
    if (recommendedRankResolution.unavailableReason !== null) {
        diagnostics.push(`recommended_rank_${recommendedRankResolution.unavailableReason}`);
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
        recommendedRankCode: recommendedRankResolution.rank?.code ?? null,
        recommendedRankName: recommendedRankResolution.rank?.name ?? null,
        recommendedRankUnavailableReason: recommendedRankResolution.unavailableReason,
        rankOrderSource: options.rankOrder.source,
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
    rankOrder: RankRecommendationRankOrderResolution;
}): {
    rank: { code: string; name: string } | null;
    unavailableReason: RankRecommendationRecommendedRankUnavailableReason | null;
} {
    const direction = getRecommendedRankStepDirection(options.action);
    if (direction === 0) {
        return { rank: null, unavailableReason: null };
    }

    if (options.currentRankCode === null) {
        return { rank: null, unavailableReason: null };
    }

    const ladder = options.rankOrder.ranksHighToLow;
    if (ladder.length === 0) {
        return { rank: null, unavailableReason: "rank_ladder_missing" };
    }
    if (options.rankOrder.source === "unresolved") {
        return { rank: null, unavailableReason: "rank_order_unresolved" };
    }

    const currentIndex = ladder.findIndex((entry) => entry.code === options.currentRankCode);
    if (currentIndex < 0) {
        return { rank: null, unavailableReason: "current_rank_not_in_ladder" };
    }

    const targetIndex = currentIndex + direction;
    const targetRank = ladder[targetIndex];
    return targetRank === undefined
        ? { rank: null, unavailableReason: "rank_ladder_boundary" }
        : { rank: targetRank, unavailableReason: null };
}

function getRecommendedRankStepDirection(action: RankRecommendationAction): -1 | 0 | 1 {
    if (action === "raise_watch") {
        return -1;
    }
    if (action === "lower_watch") {
        return 1;
    }
    return 0;
}

export function resolveRankRecommendationRankOrder(options: {
    rankLadder: readonly RankRecommendationRankLadderEntry[];
    override?: RankRecommendationRankOrderOverride | null;
}): RankRecommendationRankOrderResolution {
    const normalized = options.rankLadder.flatMap((entry) => {
        const code = normalizeNullableText(entry.price_rank_code);
        const name = normalizeNullableText(entry.price_rank_name);
        if (code === null || name === null) {
            return [];
        }

        return [{ code, name, orderValue: parseRankNameNumber(name) }];
    });
    if (normalized.length === 0) {
        return {
            source: "unresolved",
            ranksHighToLow: [],
            diagnostics: ["rank_ladder_missing"]
        };
    }

    const manualOrder = resolveManualRankOrder(normalized, options.override ?? null);
    if (manualOrder.ranks !== null) {
        return {
            source: "manual_override",
            ranksHighToLow: manualOrder.ranks,
            diagnostics: []
        };
    }

    const settingsScreenOrder = resolveSettingsScreenRankOrder(normalized, options.rankLadder.length);
    if (settingsScreenOrder !== null) {
        return {
            source: "settings_screen",
            ranksHighToLow: settingsScreenOrder,
            diagnostics: manualOrder.diagnostics
        };
    }

    const numericRanks = normalized.filter((entry) => entry.orderValue !== null);
    return numericRanks.length === normalized.length
        ? {
            source: "numeric_rank_name",
            ranksHighToLow: [...normalized]
                .sort((left, right) => (left.orderValue ?? 0) - (right.orderValue ?? 0))
                .map(({ code, name }) => ({ code, name })),
            diagnostics: manualOrder.diagnostics
        }
        : {
            source: "unresolved",
            ranksHighToLow: normalized.map(({ code, name }) => ({ code, name })),
            diagnostics: [...manualOrder.diagnostics, "rank_order_unresolved"]
        };
}

function resolveSettingsScreenRankOrder(
    rankLadder: Array<{ code: string; name: string; orderValue: number | null }>,
    sourceLength: number
): RankRecommendationRankOrderEntry[] | null {
    if (rankLadder.length === 0 || rankLadder.length !== sourceLength) {
        return null;
    }

    const usedCodes = new Set<string>();
    for (const rank of rankLadder) {
        if (usedCodes.has(rank.code)) {
            return null;
        }
        usedCodes.add(rank.code);
    }

    return rankLadder.map(({ code, name }) => ({ code, name }));
}

function resolveManualRankOrder(
    rankLadder: Array<{ code: string; name: string; orderValue: number | null }>,
    override: RankRecommendationRankOrderOverride | null
): ManualRankOrderResolution {
    if (override === null) {
        return { ranks: null, diagnostics: [] };
    }

    if (override.rankCodesHighToLow.length !== rankLadder.length) {
        return { ranks: null, diagnostics: ["manual_override_ignored_length_mismatch"] };
    }

    const rankByCode = new Map(rankLadder.map((entry) => [entry.code, { code: entry.code, name: entry.name }]));
    const usedCodes = new Set<string>();
    const resolved: RankRecommendationRankOrderEntry[] = [];
    for (const code of override.rankCodesHighToLow) {
        const rank = rankByCode.get(code);
        if (rank === undefined) {
            return { ranks: null, diagnostics: ["manual_override_ignored_unknown_rank"] };
        }
        if (usedCodes.has(code)) {
            return { ranks: null, diagnostics: ["manual_override_ignored_duplicate_rank"] };
        }
        usedCodes.add(code);
        resolved.push(rank);
    }

    return usedCodes.size === rankByCode.size
        ? { ranks: resolved, diagnostics: [] }
        : { ranks: null, diagnostics: ["manual_override_ignored_missing_rank"] };
}

function parseRankNameNumber(value: string): number | null {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
        return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
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
