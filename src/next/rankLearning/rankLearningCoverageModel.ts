import {
    shiftDate,
    toCompactDateKey
} from "../../curveCore";

export type RankLearningDirection = "lower" | "raise";

export type RankLearningRankOrder =
    | {
        status: "confirmed";
        namesHighToLow: readonly string[];
    }
    | { status: "unconfirmed" };

export interface RankLearningCoverageEventInput {
    afterRankName: string | null;
    beforeRankName: string | null;
    facilityId: string;
    reflectedAt: string;
    reflectedDate: string;
    roomGroupId: string;
    stayDate: string;
}

export interface RankLearningTransientCurvePointInput {
    observedDate: string;
    rooms: number | null;
}

export interface RankLearningTransientCurveInput {
    facilityId: string;
    points: readonly RankLearningTransientCurvePointInput[];
    roomGroupId: string;
    stayDate: string;
}

export type RankLearningEventExclusionReason =
    | "duplicate-event"
    | "event-after-stay-date"
    | "event-after-analysis-as-of"
    | "facility-mismatch"
    | "invalid-event"
    | "rank-name-unresolved"
    | "rank-order-unconfirmed"
    | "same-day-multiple-changes"
    | "transition-non-adjacent"
    | "transition-unchanged";

export type RankLearningHorizonCensorReason =
    | "horizon-after-analysis-as-of"
    | "horizon-after-stay-date"
    | "rank-change-before-horizon";

export type RankLearningHorizonExclusionReason =
    | "exact-end-missing"
    | "exact-start-and-end-missing"
    | "exact-start-missing";

export interface RankLearningReasonCount<TReason extends string> {
    count: number;
    reason: TReason;
}

export type RankLearningHorizonEvaluation =
    | {
        days: 3 | 7;
        endDate: string;
        endRooms: number;
        pickupRooms: number;
        startDate: string;
        startRooms: number;
        status: "observed";
    }
    | {
        days: 3 | 7;
        endDate: string;
        reason: RankLearningHorizonCensorReason;
        startDate: string;
        status: "censored";
    }
    | {
        days: 3 | 7;
        endDate: string;
        reason: RankLearningHorizonExclusionReason;
        startDate: string;
        status: "excluded";
    };

export interface RankLearningEpisodeMember {
    afterRankName: string;
    beforeRankName: string;
    direction: RankLearningDirection;
    eventKey: string;
    horizons: readonly RankLearningHorizonEvaluation[];
    stayDate: string;
}

export interface RankLearningAdjustmentEpisode {
    afterRankName: string | null;
    beforeRankName: string | null;
    decisionClusterKey: string;
    direction: RankLearningDirection;
    episodeKey: string;
    firstStayDate: string;
    lastStayDate: string;
    members: readonly RankLearningEpisodeMember[];
    reflectedDate: string;
    roomGroupId: string;
}

export interface RankLearningHorizonCoverage {
    censoredCount: number;
    censorReasons: readonly RankLearningReasonCount<RankLearningHorizonCensorReason>[];
    days: 3 | 7;
    eligibleCount: number;
    excludedCount: number;
    exclusionReasons: readonly RankLearningReasonCount<RankLearningHorizonExclusionReason>[];
    memberCount: number;
    observedCount: number;
}

export interface RankLearningRoomTransitionCoverage {
    afterRankName: string;
    beforeRankName: string;
    decisionClusterCount: number;
    direction: RankLearningDirection;
    episodeCount: number;
    horizons: readonly RankLearningHorizonCoverage[];
    roomGroupId: string;
    stayDateMemberCount: number;
}

export interface RankLearningCoverageReport {
    analysisAsOfDate: string;
    byRoomTransition: readonly RankLearningRoomTransitionCoverage[];
    episodeCount: number;
    episodes: readonly RankLearningAdjustmentEpisode[];
    excludedEvents: {
        byReason: readonly RankLearningReasonCount<RankLearningEventExclusionReason>[];
        count: number;
    };
    facilityId: string;
    horizons: readonly RankLearningHorizonCoverage[];
    independentDecisionClusterCount: number;
    inputEventCount: number;
    minimumSamplePolicy: "not-fixed";
    noChangeControl: {
        reasons: readonly [
            "rank-status-history-completeness-unconfirmed",
            "daily-current-rank-snapshots-not-collected",
            "unchanged-window-not-proven",
            "matching-policy-not-defined"
        ];
        status: "disabled";
    };
    stayDateMemberCount: number;
}

interface NormalizedEvent {
    afterRankName: string | null;
    beforeRankName: string | null;
    eventKey: string;
    facilityId: string;
    reflectedAt: string;
    reflectedDate: string;
    roomGroupId: string;
    stayDate: string;
}

interface EligibleEvent extends NormalizedEvent {
    afterRankName: string;
    beforeRankName: string;
    direction: RankLearningDirection;
}

interface MutableEpisodeGroup {
    direction: RankLearningDirection;
    events: EligibleEvent[];
    reflectedDate: string;
    roomGroupId: string;
}

const HORIZON_DAYS = [3, 7] as const;
const NO_CHANGE_REASONS = [
    "rank-status-history-completeness-unconfirmed",
    "daily-current-rank-snapshots-not-collected",
    "unchanged-window-not-proven",
    "matching-policy-not-defined"
] as const;

export function buildRankLearningCoverageReport(options: {
    analysisAsOfDate: string;
    curves: readonly RankLearningTransientCurveInput[];
    events: readonly RankLearningCoverageEventInput[];
    facilityId: string;
    rankOrder: RankLearningRankOrder;
}): RankLearningCoverageReport {
    const facilityId = options.facilityId.trim();
    const analysisAsOfDate = toCompactDateKey(options.analysisAsOfDate);
    if (facilityId === "" || analysisAsOfDate === null) {
        throw new Error("rank learning coverage context is invalid");
    }

    const exclusions: RankLearningEventExclusionReason[] = [];
    const normalizedEvents: NormalizedEvent[] = [];
    for (const input of options.events) {
        const result = normalizeEvent(input, facilityId, analysisAsOfDate);
        if (typeof result === "string") {
            exclusions.push(result);
        } else {
            normalizedEvents.push(result);
        }
    }

    const uniqueEvents: NormalizedEvent[] = [];
    const seenEventKeys = new Set<string>();
    for (const event of normalizedEvents) {
        if (seenEventKeys.has(event.eventKey)) {
            exclusions.push("duplicate-event");
            continue;
        }
        seenEventKeys.add(event.eventKey);
        uniqueEvents.push(event);
    }

    const eventsByRoomDay = groupBy(uniqueEvents, (event) => buildKey([
        event.facilityId,
        event.stayDate,
        event.roomGroupId,
        event.reflectedDate
    ]));
    const sameDayMultipleEventKeys = new Set<string>();
    for (const events of eventsByRoomDay.values()) {
        if (events.length > 1) {
            for (const event of events) {
                sameDayMultipleEventKeys.add(event.eventKey);
            }
        }
    }

    const rankIndex = buildConfirmedRankIndex(options.rankOrder);
    const eligibleEvents: EligibleEvent[] = [];
    for (const event of uniqueEvents) {
        if (sameDayMultipleEventKeys.has(event.eventKey)) {
            exclusions.push("same-day-multiple-changes");
            continue;
        }
        const transition = resolveTransition(event, rankIndex);
        if (typeof transition === "string") {
            exclusions.push(transition);
            continue;
        }
        eligibleEvents.push({
            ...event,
            afterRankName: transition.afterRankName,
            beforeRankName: transition.beforeRankName,
            direction: transition.direction
        });
    }

    const curveIndex = buildCurveIndex(options.curves, facilityId);
    const changeIndex = groupBy(uniqueEvents, (event) => buildKey([
        event.facilityId,
        event.stayDate,
        event.roomGroupId
    ]));
    for (const events of changeIndex.values()) {
        events.sort(compareEvents);
    }

    const episodes = buildEpisodes({
        analysisAsOfDate,
        changeIndex,
        curveIndex,
        events: eligibleEvents,
        facilityId
    });
    const members = episodes.flatMap((episode) => episode.members);
    const horizons = HORIZON_DAYS.map((days) => summarizeHorizon(members, days));
    const decisionClusterKeys = new Set(episodes.map((episode) => episode.decisionClusterKey));

    return {
        analysisAsOfDate,
        byRoomTransition: buildRoomTransitionCoverage(episodes),
        episodeCount: episodes.length,
        episodes,
        excludedEvents: {
            byReason: countReasons(exclusions),
            count: exclusions.length
        },
        facilityId,
        horizons,
        independentDecisionClusterCount: decisionClusterKeys.size,
        inputEventCount: options.events.length,
        minimumSamplePolicy: "not-fixed",
        noChangeControl: {
            reasons: NO_CHANGE_REASONS,
            status: "disabled"
        },
        stayDateMemberCount: members.length
    };
}

function normalizeEvent(
    input: RankLearningCoverageEventInput,
    facilityId: string,
    analysisAsOfDate: string
): NormalizedEvent | RankLearningEventExclusionReason {
    if (input.facilityId.trim() !== facilityId) {
        return "facility-mismatch";
    }
    const stayDate = toCompactDateKey(input.stayDate);
    const reflectedDate = toCompactDateKey(input.reflectedDate);
    const roomGroupId = input.roomGroupId.trim();
    const reflectedTimestamp = Date.parse(input.reflectedAt);
    if (
        stayDate === null
        || reflectedDate === null
        || roomGroupId === ""
        || !Number.isFinite(reflectedTimestamp)
    ) {
        return "invalid-event";
    }
    if (reflectedDate > analysisAsOfDate) {
        return "event-after-analysis-as-of";
    }
    if (reflectedDate > stayDate) {
        return "event-after-stay-date";
    }
    const beforeRankName = normalizeRankName(input.beforeRankName);
    const afterRankName = normalizeRankName(input.afterRankName);
    const reflectedAt = new Date(reflectedTimestamp).toISOString();
    if (formatJstDate(reflectedTimestamp) !== reflectedDate) {
        return "invalid-event";
    }
    return {
        afterRankName,
        beforeRankName,
        eventKey: buildKey([
            facilityId,
            stayDate,
            roomGroupId,
            reflectedAt,
            beforeRankName,
            afterRankName
        ]),
        facilityId,
        reflectedAt,
        reflectedDate,
        roomGroupId,
        stayDate
    };
}

function normalizeRankName(value: string | null): string | null {
    if (value === null) {
        return null;
    }
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
}

function buildConfirmedRankIndex(rankOrder: RankLearningRankOrder): Map<string, number> | null {
    if (rankOrder.status !== "confirmed" || rankOrder.namesHighToLow.length < 2) {
        return null;
    }
    const index = new Map<string, number>();
    for (const [position, value] of rankOrder.namesHighToLow.entries()) {
        const name = value.trim();
        if (name === "" || index.has(name)) {
            return null;
        }
        index.set(name, position);
    }
    return index;
}

function resolveTransition(
    event: NormalizedEvent,
    rankIndex: ReadonlyMap<string, number> | null
): {
    afterRankName: string;
    beforeRankName: string;
    direction: RankLearningDirection;
} | RankLearningEventExclusionReason {
    if (rankIndex === null) {
        return "rank-order-unconfirmed";
    }
    if (event.beforeRankName === null || event.afterRankName === null) {
        return "rank-name-unresolved";
    }
    if (event.beforeRankName === event.afterRankName) {
        return "transition-unchanged";
    }
    const beforeIndex = rankIndex.get(event.beforeRankName);
    const afterIndex = rankIndex.get(event.afterRankName);
    if (beforeIndex === undefined || afterIndex === undefined) {
        return "rank-name-unresolved";
    }
    const difference = afterIndex - beforeIndex;
    if (Math.abs(difference) !== 1) {
        return "transition-non-adjacent";
    }
    return {
        afterRankName: event.afterRankName,
        beforeRankName: event.beforeRankName,
        direction: difference < 0 ? "raise" : "lower"
    };
}

function buildCurveIndex(
    curves: readonly RankLearningTransientCurveInput[],
    facilityId: string
): Map<string, Map<string, number | null>> {
    const index = new Map<string, Map<string, number | null>>();
    for (const curve of curves) {
        const stayDate = toCompactDateKey(curve.stayDate);
        const roomGroupId = curve.roomGroupId.trim();
        if (curve.facilityId.trim() !== facilityId || stayDate === null || roomGroupId === "") {
            continue;
        }
        const curveKey = buildKey([facilityId, stayDate, roomGroupId]);
        const pointByDate = index.get(curveKey) ?? new Map<string, number | null>();
        for (const point of curve.points) {
            const observedDate = toCompactDateKey(point.observedDate);
            if (observedDate === null) {
                continue;
            }
            const rooms = typeof point.rooms === "number"
                && Number.isFinite(point.rooms)
                && point.rooms >= 0
                ? point.rooms
                : null;
            if (!pointByDate.has(observedDate)) {
                pointByDate.set(observedDate, rooms);
                continue;
            }
            if (pointByDate.get(observedDate) !== rooms) {
                pointByDate.set(observedDate, null);
            }
        }
        index.set(curveKey, pointByDate);
    }
    return index;
}

function buildEpisodes(options: {
    analysisAsOfDate: string;
    changeIndex: ReadonlyMap<string, readonly NormalizedEvent[]>;
    curveIndex: ReadonlyMap<string, ReadonlyMap<string, number | null>>;
    events: readonly EligibleEvent[];
    facilityId: string;
}): RankLearningAdjustmentEpisode[] {
    const grouped = groupBy(options.events, (event) => buildKey([
        event.facilityId,
        event.roomGroupId,
        event.reflectedDate,
        event.direction
    ]));
    const episodes: RankLearningAdjustmentEpisode[] = [];
    for (const events of grouped.values()) {
        const sorted = events.slice().sort((left, right) => (
            left.stayDate.localeCompare(right.stayDate)
            || left.eventKey.localeCompare(right.eventKey)
        ));
        let current: MutableEpisodeGroup | null = null;
        for (const event of sorted) {
            if (
                current === null
                || addDays(current.events.at(-1)?.stayDate ?? "", 1) !== event.stayDate
            ) {
                if (current !== null) {
                    episodes.push(finalizeEpisode(current, options));
                }
                current = {
                    direction: event.direction,
                    events: [event],
                    reflectedDate: event.reflectedDate,
                    roomGroupId: event.roomGroupId
                };
            } else {
                current.events.push(event);
            }
        }
        if (current !== null) {
            episodes.push(finalizeEpisode(current, options));
        }
    }
    return episodes.sort((left, right) => (
        left.reflectedDate.localeCompare(right.reflectedDate)
        || left.roomGroupId.localeCompare(right.roomGroupId)
        || left.direction.localeCompare(right.direction)
        || left.firstStayDate.localeCompare(right.firstStayDate)
    ));
}

function finalizeEpisode(
    group: MutableEpisodeGroup,
    options: {
        analysisAsOfDate: string;
        changeIndex: ReadonlyMap<string, readonly NormalizedEvent[]>;
        curveIndex: ReadonlyMap<string, ReadonlyMap<string, number | null>>;
        facilityId: string;
    }
): RankLearningAdjustmentEpisode {
    const firstStayDate = group.events[0]?.stayDate ?? "";
    const lastStayDate = group.events.at(-1)?.stayDate ?? "";
    const firstEvent = group.events[0];
    const hasSingleTransition = firstEvent !== undefined && group.events.every((event) => (
        event.beforeRankName === firstEvent.beforeRankName
        && event.afterRankName === firstEvent.afterRankName
    ));
    const decisionClusterKey = buildKey([options.facilityId, group.reflectedDate]);
    const members = group.events.map((event): RankLearningEpisodeMember => ({
        afterRankName: event.afterRankName,
        beforeRankName: event.beforeRankName,
        direction: event.direction,
        eventKey: event.eventKey,
        horizons: HORIZON_DAYS.map((days) => evaluateHorizon({
            analysisAsOfDate: options.analysisAsOfDate,
            changeIndex: options.changeIndex,
            curveIndex: options.curveIndex,
            days,
            event,
            facilityId: options.facilityId
        })),
        stayDate: event.stayDate
    }));
    return {
        afterRankName: hasSingleTransition ? firstEvent.afterRankName : null,
        beforeRankName: hasSingleTransition ? firstEvent.beforeRankName : null,
        decisionClusterKey,
        direction: group.direction,
        episodeKey: buildKey([
            options.facilityId,
            group.roomGroupId,
            group.reflectedDate,
            group.direction,
            firstStayDate,
            lastStayDate
        ]),
        firstStayDate,
        lastStayDate,
        members,
        reflectedDate: group.reflectedDate,
        roomGroupId: group.roomGroupId
    };
}

function evaluateHorizon(options: {
    analysisAsOfDate: string;
    changeIndex: ReadonlyMap<string, readonly NormalizedEvent[]>;
    curveIndex: ReadonlyMap<string, ReadonlyMap<string, number | null>>;
    days: 3 | 7;
    event: EligibleEvent;
    facilityId: string;
}): RankLearningHorizonEvaluation {
    const startDate = options.event.reflectedDate;
    const endDate = addDays(startDate, options.days);
    if (endDate === null) {
        throw new Error("rank learning horizon date is invalid");
    }
    if (endDate > options.event.stayDate) {
        return {
            days: options.days,
            endDate,
            reason: "horizon-after-stay-date",
            startDate,
            status: "censored"
        };
    }
    if (endDate > options.analysisAsOfDate) {
        return {
            days: options.days,
            endDate,
            reason: "horizon-after-analysis-as-of",
            startDate,
            status: "censored"
        };
    }
    const scopeKey = buildKey([options.facilityId, options.event.stayDate, options.event.roomGroupId]);
    const changes = options.changeIndex.get(scopeKey) ?? [];
    if (changes.some((change) => (
        change.eventKey !== options.event.eventKey
        && change.reflectedDate > startDate
        && change.reflectedDate <= endDate
    ))) {
        return {
            days: options.days,
            endDate,
            reason: "rank-change-before-horizon",
            startDate,
            status: "censored"
        };
    }
    const points = options.curveIndex.get(scopeKey);
    const startRooms = points?.get(startDate) ?? null;
    const endRooms = points?.get(endDate) ?? null;
    if (startRooms === null && endRooms === null) {
        return {
            days: options.days,
            endDate,
            reason: "exact-start-and-end-missing",
            startDate,
            status: "excluded"
        };
    }
    if (startRooms === null) {
        return {
            days: options.days,
            endDate,
            reason: "exact-start-missing",
            startDate,
            status: "excluded"
        };
    }
    if (endRooms === null) {
        return {
            days: options.days,
            endDate,
            reason: "exact-end-missing",
            startDate,
            status: "excluded"
        };
    }
    return {
        days: options.days,
        endDate,
        endRooms,
        pickupRooms: normalizeSignedZero(endRooms - startRooms),
        startDate,
        startRooms,
        status: "observed"
    };
}

function buildRoomTransitionCoverage(
    episodes: readonly RankLearningAdjustmentEpisode[]
): RankLearningRoomTransitionCoverage[] {
    const memberships = episodes.flatMap((episode) => episode.members.map((member) => ({
        episode,
        member
    })));
    const grouped = groupBy(memberships, ({ episode, member }) => buildKey([
        episode.roomGroupId,
        member.beforeRankName,
        member.afterRankName,
        member.direction
    ]));
    const result: RankLearningRoomTransitionCoverage[] = [];
    for (const group of grouped.values()) {
        const first = group[0];
        if (first === undefined) {
            continue;
        }
        const members = group.map(({ member }) => member);
        result.push({
            afterRankName: first.member.afterRankName,
            beforeRankName: first.member.beforeRankName,
            decisionClusterCount: new Set(
                group.map(({ episode }) => episode.decisionClusterKey)
            ).size,
            direction: first.member.direction,
            episodeCount: new Set(group.map(({ episode }) => episode.episodeKey)).size,
            horizons: HORIZON_DAYS.map((days) => summarizeHorizon(members, days)),
            roomGroupId: first.episode.roomGroupId,
            stayDateMemberCount: members.length
        });
    }
    return result.sort((left, right) => (
        left.roomGroupId.localeCompare(right.roomGroupId)
        || left.beforeRankName.localeCompare(right.beforeRankName)
        || left.afterRankName.localeCompare(right.afterRankName)
        || left.direction.localeCompare(right.direction)
    ));
}

function formatJstDate(timestamp: number): string | null {
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    return new Date(timestamp + 9 * 60 * 60 * 1_000)
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "");
}

function summarizeHorizon(
    members: readonly RankLearningEpisodeMember[],
    days: 3 | 7
): RankLearningHorizonCoverage {
    const evaluations = members.flatMap((member) => {
        const evaluation = member.horizons.find((candidate) => candidate.days === days);
        return evaluation === undefined ? [] : [evaluation];
    });
    const censored = evaluations.filter((evaluation) => evaluation.status === "censored");
    const excluded = evaluations.filter((evaluation) => evaluation.status === "excluded");
    const observedCount = evaluations.filter((evaluation) => evaluation.status === "observed").length;
    return {
        censoredCount: censored.length,
        censorReasons: countReasons(censored.map((evaluation) => evaluation.reason)),
        days,
        eligibleCount: observedCount + excluded.length,
        excludedCount: excluded.length,
        exclusionReasons: countReasons(excluded.map((evaluation) => evaluation.reason)),
        memberCount: evaluations.length,
        observedCount
    };
}

function countReasons<TReason extends string>(reasons: readonly TReason[]): RankLearningReasonCount<TReason>[] {
    const countByReason = new Map<TReason, number>();
    for (const reason of reasons) {
        countByReason.set(reason, (countByReason.get(reason) ?? 0) + 1);
    }
    return Array.from(countByReason, ([reason, count]) => ({ count, reason }))
        .sort((left, right) => left.reason.localeCompare(right.reason));
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const value of values) {
        const key = keyOf(value);
        const group = groups.get(key) ?? [];
        group.push(value);
        groups.set(key, group);
    }
    return groups;
}

function compareEvents(left: NormalizedEvent, right: NormalizedEvent): number {
    return left.reflectedDate.localeCompare(right.reflectedDate)
        || left.reflectedAt.localeCompare(right.reflectedAt)
        || left.eventKey.localeCompare(right.eventKey);
}

function addDays(date: string, days: number): string | null {
    const shifted = shiftDate(date, days);
    return shifted === null ? null : toCompactDateKey(shifted);
}

function buildKey(parts: readonly (string | null)[]): string {
    return JSON.stringify(parts);
}

function normalizeSignedZero(value: number): number {
    return Object.is(value, -0) ? 0 : value;
}
