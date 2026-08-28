import {
    getDaysBetweenDateKeys,
    getUtcWeekday,
    normalizeDateKey,
    shiftDate,
    toCompactDateKey,
    type BookingCurveApiPoint
} from "../../curveCore";
import {
    resolveRankRecommendationRankChangeDirection,
    type RankRecommendationRankOrderResolution,
    type RankRecommendationRankOrderSource
} from "../../rankOrder";
import type { NextBookingCurveSourceRecord } from "../bookingCurve/bookingCurveSourceStore";

const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
});

export const ADJUSTMENT_REVIEW_HORIZONS = [3, 7] as const;
export const ADJUSTMENT_REVIEW_INITIAL_HORIZON = 7 as const;

export type AdjustmentReviewHorizon = typeof ADJUSTMENT_REVIEW_HORIZONS[number];
export type AdjustmentReviewDirection = "lower" | "raise" | "unknown";
export type AdjustmentReviewObservationState =
    | "censored"
    | "excluded"
    | "missing"
    | "pending"
    | "ready";
export type AdjustmentReviewSort =
    | "actor"
    | "adjustment-date"
    | "default"
    | "pace-delta"
    | "room-count"
    | "stay-date";

export interface AdjustmentReviewRoom {
    order: number;
    roomGroupId: string;
    roomGroupName: string | null;
}

export interface AdjustmentReviewEvent {
    actorName: string | null;
    afterRankName: string | null;
    beforeRankName: string | null;
    daysBeforeStay: number;
    direction: AdjustmentReviewDirection;
    directionSource: RankRecommendationRankOrderSource;
    eventKey: string;
    reflectedAt: string;
    reflectedDate: string;
    roomGroupId: string;
    stayDate: string;
}

export type AdjustmentReviewObservation =
    | {
        afterPace: number;
        beforePace: number;
        delta: number;
        state: "ready";
    }
    | {
        reason: "future-window";
        state: "pending";
    }
    | {
        reason: "later-adjustment";
        state: "censored";
    }
    | {
        reason: "exact-point-missing";
        state: "missing";
    }
    | {
        reason: "crosses-stay" | "same-day-multiple";
        state: "excluded";
    };

export interface EvaluatedAdjustmentReviewEvent extends AdjustmentReviewEvent {
    observations: Record<AdjustmentReviewHorizon, AdjustmentReviewObservation>;
    roomOrder: number;
    roomGroupName: string | null;
}

export interface AdjustmentReviewFilters {
    actorName: string | null;
    adjustmentDateFrom: string | null;
    adjustmentDateTo: string | null;
    direction: AdjustmentReviewDirection | null;
    observation: AdjustmentReviewObservationState | null;
    roomGroupId: string | null;
    stayMonth: string | null;
    weekday: number | null;
}

export interface AdjustmentReviewFilterOption {
    count: number;
    label: string;
    value: string;
}

export interface AdjustmentReviewParentRow {
    actorCoverageCount: number;
    actorNames: readonly string[];
    adjustmentDateFrom: string;
    adjustmentDateTo: string;
    afterPaceTotal: number;
    beforePaceTotal: number;
    deltaTotal: number;
    detailEvents: readonly EvaluatedAdjustmentReviewEvent[];
    directionCounts: Record<AdjustmentReviewDirection, number>;
    latestEvents: readonly EvaluatedAdjustmentReviewEvent[];
    latestReflectedAt: string;
    leadTimeFrom: number;
    leadTimeTo: number;
    observationCounts: Record<AdjustmentReviewObservationState, number>;
    numericDirectionCount: number;
    readyCount: number;
    roomCount: number;
    stayDate: string;
    timestampCount: number;
    weekday: number;
}

export interface AdjustmentReviewViewModel {
    actorOptions: readonly AdjustmentReviewFilterOption[];
    evaluatedEvents: readonly EvaluatedAdjustmentReviewEvent[];
    maxAbsPace: number;
    parentRows: readonly AdjustmentReviewParentRow[];
    roomOptions: readonly AdjustmentReviewFilterOption[];
    stayMonths: readonly string[];
    totalEventCount: number;
}

export function createInitialAdjustmentReviewFilters(): AdjustmentReviewFilters {
    return {
        actorName: null,
        adjustmentDateFrom: null,
        adjustmentDateTo: null,
        direction: null,
        observation: null,
        roomGroupId: null,
        stayMonth: null,
        weekday: null
    };
}

export function buildAdjustmentReviewEventKey(options: {
    afterRankName: string | null;
    beforeRankName: string | null;
    reflectedAt: string;
    roomGroupId: string;
    stayDate: string;
}): string {
    const timestamp = Date.parse(options.reflectedAt);
    const canonicalTimestamp = Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : options.reflectedAt;
    return JSON.stringify([
        toCompactDateKey(options.stayDate) ?? options.stayDate,
        options.roomGroupId,
        canonicalTimestamp,
        options.beforeRankName,
        options.afterRankName
    ]);
}

export function parseAdjustmentReviewEvents(
    payload: unknown,
    options: {
        asOfDate: string;
        rankOrder?: RankRecommendationRankOrderResolution | null;
        visibleStayDates: readonly string[];
    }
): AdjustmentReviewEvent[] | null {
    if (!isRecord(payload) || !Array.isArray(payload.suggest_statuses)) {
        return null;
    }
    const asOfDate = toCompactDateKey(options.asOfDate);
    const visibleStayDates = new Set(options.visibleStayDates
        .map(toCompactDateKey)
        .filter((value): value is string => value !== null));
    if (asOfDate === null || visibleStayDates.size === 0) {
        return [];
    }
    const parsed = new Map<string, AdjustmentReviewEvent>();
    for (const value of payload.suggest_statuses) {
        if (!isRecord(value)) {
            continue;
        }
        const stayDate = toCompactDateKey(typeof value.date === "string" ? value.date : "");
        const roomGroupId = typeof value.rm_room_group_id === "string"
            ? value.rm_room_group_id.trim()
            : "";
        const reflectedAt = resolveStatusTimestamp(value);
        const beforeRankName = readRankName(value.before_price_rank_name);
        const afterRankName = readRankName(value.after_price_rank_name);
        if (
            stayDate === null
            || !visibleStayDates.has(stayDate)
            || roomGroupId === ""
            || reflectedAt === null
            || beforeRankName === undefined
            || afterRankName === undefined
            || (beforeRankName === null && afterRankName === null)
        ) {
            continue;
        }
        const reflectedDate = formatJstDate(Date.parse(reflectedAt));
        const daysBeforeStay = reflectedDate === null
            ? null
            : getDaysBetweenDateKeys(stayDate, reflectedDate);
        if (
            reflectedDate === null
            || reflectedDate > asOfDate
            || daysBeforeStay === null
            || daysBeforeStay < 0
            || daysBeforeStay > 360
        ) {
            continue;
        }
        const canonicalReflectedAt = new Date(Date.parse(reflectedAt)).toISOString();
        const eventKey = buildAdjustmentReviewEventKey({
            afterRankName,
            beforeRankName,
            reflectedAt: canonicalReflectedAt,
            roomGroupId,
            stayDate
        });
        const direction = resolveRankRecommendationRankChangeDirection({
            afterRankName,
            beforeRankName,
            rankOrder: options.rankOrder ?? null
        });
        parsed.set(eventKey, {
            actorName: readActorName(value.reflector_name),
            afterRankName,
            beforeRankName,
            daysBeforeStay,
            direction: direction.direction,
            directionSource: direction.source,
            eventKey,
            reflectedAt: canonicalReflectedAt,
            reflectedDate,
            roomGroupId,
            stayDate
        });
    }
    return Array.from(parsed.values()).sort(compareEventNewestFirst);
}

export function buildAdjustmentReviewViewModel(options: {
    asOfDate: string;
    events: readonly AdjustmentReviewEvent[];
    filters: AdjustmentReviewFilters;
    horizon: AdjustmentReviewHorizon;
    records: readonly NextBookingCurveSourceRecord[];
    rooms: readonly AdjustmentReviewRoom[];
    sort: AdjustmentReviewSort;
}): AdjustmentReviewViewModel {
    const evaluatedEvents = evaluateAdjustmentReviewEvents({
        asOfDate: options.asOfDate,
        events: options.events,
        records: options.records,
        rooms: options.rooms
    });
    const stayMonths = Array.from(new Set(evaluatedEvents.map((event) => event.stayDate.slice(0, 6))))
        .sort();
    const actorOptions = buildActorOptions(evaluatedEvents, options.filters, options.horizon);
    const roomOptions = buildRoomOptions(evaluatedEvents, options.filters, options.horizon);
    const prefilteredEvents = evaluatedEvents.filter((event) => (
        passesPreFilters(event, options.filters)
    ));
    const latestEvents = selectLatestEvents(prefilteredEvents)
        .filter((event) => passesObservationFilter(event, options.filters, options.horizon));
    const selectedKeys = new Set(latestEvents.map((event) => buildStayRoomKey(event)));
    const detailEvents = prefilteredEvents.filter((event) => (
        selectedKeys.has(buildStayRoomKey(event))
        && passesObservationFilter(event, options.filters, options.horizon)
    ));
    const parentRows = buildParentRows(latestEvents, detailEvents, options.horizon)
        .sort((left, right) => compareParentRows(left, right, options.sort));
    const maxAbsPace = Math.max(1, ...parentRows.flatMap((row) => [
        Math.abs(row.beforePaceTotal),
        Math.abs(row.afterPaceTotal)
    ]));
    return {
        actorOptions,
        evaluatedEvents,
        maxAbsPace,
        parentRows,
        roomOptions,
        stayMonths,
        totalEventCount: evaluatedEvents.length
    };
}

export function evaluateAdjustmentReviewEvents(options: {
    asOfDate: string;
    events: readonly AdjustmentReviewEvent[];
    records: readonly NextBookingCurveSourceRecord[];
    rooms: readonly AdjustmentReviewRoom[];
}): EvaluatedAdjustmentReviewEvent[] {
    const asOfDate = toCompactDateKey(options.asOfDate) ?? "";
    const roomById = new Map(options.rooms.map((room) => [room.roomGroupId, room]));
    const curveByStayRoom = buildCurveIndex(options.records);
    const sameDayCounts = new Map<string, number>();
    const eventsByStayRoom = new Map<string, AdjustmentReviewEvent[]>();
    for (const event of options.events) {
        const sameDayKey = `${buildStayRoomKey(event)}|${event.reflectedDate}`;
        sameDayCounts.set(sameDayKey, (sameDayCounts.get(sameDayKey) ?? 0) + 1);
        const stayRoomKey = buildStayRoomKey(event);
        const scoped = eventsByStayRoom.get(stayRoomKey) ?? [];
        scoped.push(event);
        eventsByStayRoom.set(stayRoomKey, scoped);
    }
    return options.events.map((event) => {
        const room = roomById.get(event.roomGroupId);
        const scopedEvents = eventsByStayRoom.get(buildStayRoomKey(event)) ?? [];
        const curve = curveByStayRoom.get(buildStayRoomKey(event)) ?? new Map<string, number>();
        const sameDayCount = sameDayCounts.get(
            `${buildStayRoomKey(event)}|${event.reflectedDate}`
        ) ?? 0;
        return {
            ...event,
            observations: {
                3: evaluateHorizon(event, 3, asOfDate, curve, scopedEvents, sameDayCount),
                7: evaluateHorizon(event, 7, asOfDate, curve, scopedEvents, sameDayCount)
            },
            roomGroupName: room?.roomGroupName ?? null,
            roomOrder: room?.order ?? Number.MAX_SAFE_INTEGER
        };
    }).sort(compareEvaluatedEventDetailOrder);
}

function evaluateHorizon(
    event: AdjustmentReviewEvent,
    horizon: AdjustmentReviewHorizon,
    asOfDate: string,
    curve: ReadonlyMap<string, number>,
    scopedEvents: readonly AdjustmentReviewEvent[],
    sameDayCount: number
): AdjustmentReviewObservation {
    if (sameDayCount > 1) {
        return { reason: "same-day-multiple", state: "excluded" };
    }
    const beforeDate = toCompactDateKey(shiftDate(event.reflectedDate, -horizon) ?? "");
    const afterDate = toCompactDateKey(shiftDate(event.reflectedDate, horizon) ?? "");
    if (beforeDate === null || afterDate === null || afterDate > event.stayDate) {
        return { reason: "crosses-stay", state: "excluded" };
    }
    if (afterDate > asOfDate) {
        return { reason: "future-window", state: "pending" };
    }
    if (scopedEvents.some((candidate) => (
        candidate.eventKey !== event.eventKey
        && candidate.reflectedAt > event.reflectedAt
        && candidate.reflectedDate <= afterDate
    ))) {
        return { reason: "later-adjustment", state: "censored" };
    }
    const beforeStart = curve.get(beforeDate);
    const atAdjustment = curve.get(event.reflectedDate);
    const afterEnd = curve.get(afterDate);
    if (beforeStart === undefined || atAdjustment === undefined || afterEnd === undefined) {
        return { reason: "exact-point-missing", state: "missing" };
    }
    const beforePace = atAdjustment - beforeStart;
    const afterPace = afterEnd - atAdjustment;
    return {
        afterPace,
        beforePace,
        delta: afterPace - beforePace,
        state: "ready"
    };
}

function buildCurveIndex(
    records: readonly NextBookingCurveSourceRecord[]
): Map<string, Map<string, number>> {
    const result = new Map<string, Map<string, number>>();
    for (const record of records) {
        if (record.scope !== "roomGroup" || record.roomGroupId === null) {
            continue;
        }
        const key = `${record.stayDate}|${record.roomGroupId}`;
        const points = result.get(key) ?? new Map<string, number>();
        for (const point of record.response.booking_curve ?? []) {
            const observedDate = toCompactDateKey(point.date);
            const rooms = readTransientRooms(point);
            if (observedDate !== null && rooms !== null && !points.has(observedDate)) {
                points.set(observedDate, rooms);
            }
        }
        result.set(key, points);
    }
    return result;
}

function readTransientRooms(point: BookingCurveApiPoint): number | null {
    const rooms = point.transient?.this_year_room_sum;
    return typeof rooms === "number" && Number.isFinite(rooms) ? rooms : null;
}

function selectLatestEvents(
    events: readonly EvaluatedAdjustmentReviewEvent[]
): EvaluatedAdjustmentReviewEvent[] {
    const latest = new Map<string, EvaluatedAdjustmentReviewEvent>();
    for (const event of events) {
        const key = buildStayRoomKey(event);
        const previous = latest.get(key);
        if (previous === undefined || compareEventNewestFirst(event, previous) < 0) {
            latest.set(key, event);
        }
    }
    return Array.from(latest.values());
}

function buildParentRows(
    latestEvents: readonly EvaluatedAdjustmentReviewEvent[],
    detailEvents: readonly EvaluatedAdjustmentReviewEvent[],
    horizon: AdjustmentReviewHorizon
): AdjustmentReviewParentRow[] {
    const latestByStay = groupByStayDate(latestEvents);
    const detailsByStay = groupByStayDate(detailEvents);
    return Array.from(latestByStay, ([stayDate, scopedLatest]) => {
        const observations = scopedLatest.map((event) => event.observations[horizon]);
        const ready = observations.filter((value): value is Extract<AdjustmentReviewObservation, { state: "ready" }> => (
            value.state === "ready"
        ));
        const actorNames = Array.from(new Set(scopedLatest
            .map((event) => event.actorName)
            .filter((value): value is string => value !== null)))
            .sort((left, right) => left.localeCompare(right, "ja"));
        const reflectedDates = scopedLatest.map((event) => event.reflectedDate).sort();
        const leadTimes = scopedLatest.map((event) => event.daysBeforeStay).sort((a, b) => a - b);
        const latestReflectedAt = scopedLatest
            .map((event) => event.reflectedAt)
            .sort()
            .at(-1) ?? "";
        return {
            actorCoverageCount: scopedLatest.filter((event) => event.actorName !== null).length,
            actorNames,
            adjustmentDateFrom: reflectedDates[0] ?? "",
            adjustmentDateTo: reflectedDates.at(-1) ?? "",
            afterPaceTotal: ready.reduce((sum, value) => sum + value.afterPace, 0),
            beforePaceTotal: ready.reduce((sum, value) => sum + value.beforePace, 0),
            deltaTotal: ready.reduce((sum, value) => sum + value.delta, 0),
            detailEvents: (detailsByStay.get(stayDate) ?? []).sort(compareEvaluatedEventDetailOrder),
            directionCounts: countValues(scopedLatest.map((event) => event.direction), [
                "raise", "lower", "unknown"
            ]),
            latestEvents: scopedLatest.sort(compareEvaluatedEventDetailOrder),
            latestReflectedAt,
            leadTimeFrom: leadTimes[0] ?? 0,
            leadTimeTo: leadTimes.at(-1) ?? 0,
            observationCounts: countValues(observations.map((value) => value.state), [
                "ready", "missing", "pending", "censored", "excluded"
            ]),
            numericDirectionCount: scopedLatest.filter((event) => (
                event.direction !== "unknown" && event.directionSource === "numeric_rank_name"
            )).length,
            readyCount: ready.length,
            roomCount: scopedLatest.length,
            stayDate,
            timestampCount: new Set(scopedLatest.map((event) => event.reflectedAt)).size,
            weekday: getUtcWeekday(normalizeDateKey(stayDate) ?? "") ?? 0
        };
    });
}

function buildActorOptions(
    events: readonly EvaluatedAdjustmentReviewEvent[],
    filters: AdjustmentReviewFilters,
    horizon: AdjustmentReviewHorizon
): AdjustmentReviewFilterOption[] {
    const candidateEvents = events.filter((event) => (
        passesPreFilters(event, { ...filters, actorName: null })
    ));
    const candidatesByActor = new Map<string, EvaluatedAdjustmentReviewEvent[]>();
    for (const event of candidateEvents) {
        const value = event.actorName ?? "__unknown__";
        const scoped = candidatesByActor.get(value) ?? [];
        scoped.push(event);
        candidatesByActor.set(value, scoped);
    }
    return Array.from(candidatesByActor, ([value, scoped]) => ({
        count: selectLatestEvents(scoped)
            .filter((event) => passesObservationFilter(event, filters, horizon))
            .length,
        label: value === "__unknown__" ? "担当者不明" : value,
        value
    }))
        .filter((option) => option.count > 0)
        .sort((left, right) => (
            right.count - left.count || left.label.localeCompare(right.label, "ja")
        ));
}

function buildRoomOptions(
    events: readonly EvaluatedAdjustmentReviewEvent[],
    filters: AdjustmentReviewFilters,
    horizon: AdjustmentReviewHorizon
): AdjustmentReviewFilterOption[] {
    const candidatesByRoom = new Map<string, EvaluatedAdjustmentReviewEvent[]>();
    const labels = new Map<string, string>();
    const order = new Map<string, number>();
    for (const event of events) {
        if (!passesPreFilters(event, { ...filters, roomGroupId: null })) {
            continue;
        }
        const scoped = candidatesByRoom.get(event.roomGroupId) ?? [];
        scoped.push(event);
        candidatesByRoom.set(event.roomGroupId, scoped);
        labels.set(event.roomGroupId, event.roomGroupName ?? "部屋タイプ不明");
        order.set(event.roomGroupId, event.roomOrder);
    }
    return Array.from(candidatesByRoom, ([value, scoped]) => ({
        count: selectLatestEvents(scoped)
            .filter((event) => passesObservationFilter(event, filters, horizon))
            .length,
        label: labels.get(value) ?? "部屋タイプ不明",
        value
    }))
        .filter((option) => option.count > 0)
        .sort((left, right) => (
            (order.get(left.value) ?? Number.MAX_SAFE_INTEGER)
            - (order.get(right.value) ?? Number.MAX_SAFE_INTEGER)
            || left.label.localeCompare(right.label, "ja")
        ));
}

function passesPreFilters(
    event: EvaluatedAdjustmentReviewEvent,
    filters: AdjustmentReviewFilters
): boolean {
    const weekday = getUtcWeekday(normalizeDateKey(event.stayDate) ?? "");
    return (filters.actorName === null
            || (filters.actorName === "__unknown__"
                ? event.actorName === null
                : event.actorName === filters.actorName))
        && (filters.stayMonth === null || event.stayDate.startsWith(filters.stayMonth))
        && (filters.weekday === null || weekday === filters.weekday)
        && (filters.roomGroupId === null || event.roomGroupId === filters.roomGroupId)
        && (filters.direction === null || event.direction === filters.direction)
        && (
            filters.adjustmentDateFrom === null
            || event.reflectedDate >= filters.adjustmentDateFrom
        )
        && (
            filters.adjustmentDateTo === null
            || event.reflectedDate <= filters.adjustmentDateTo
        );
}

function passesObservationFilter(
    event: EvaluatedAdjustmentReviewEvent,
    filters: AdjustmentReviewFilters,
    horizon: AdjustmentReviewHorizon
): boolean {
    return filters.observation === null
        || event.observations[horizon].state === filters.observation;
}

function compareParentRows(
    left: AdjustmentReviewParentRow,
    right: AdjustmentReviewParentRow,
    sort: AdjustmentReviewSort
): number {
    let compared = 0;
    switch (sort) {
        case "default":
            compared = Number(right.readyCount > 0) - Number(left.readyCount > 0)
                || Math.abs(right.deltaTotal) - Math.abs(left.deltaTotal);
            break;
        case "pace-delta":
            compared = Math.abs(right.deltaTotal) - Math.abs(left.deltaTotal);
            break;
        case "adjustment-date":
            compared = right.latestReflectedAt.localeCompare(left.latestReflectedAt);
            break;
        case "actor":
            compared = left.actorNames.join("\u001f").localeCompare(
                right.actorNames.join("\u001f"),
                "ja"
            );
            break;
        case "room-count":
            compared = right.roomCount - left.roomCount;
            break;
        case "stay-date":
            compared = left.stayDate.localeCompare(right.stayDate);
            break;
    }
    return compared || left.stayDate.localeCompare(right.stayDate);
}

function compareEventNewestFirst(
    left: Pick<AdjustmentReviewEvent, "eventKey" | "reflectedAt" | "roomGroupId" | "stayDate">,
    right: Pick<AdjustmentReviewEvent, "eventKey" | "reflectedAt" | "roomGroupId" | "stayDate">
): number {
    return right.reflectedAt.localeCompare(left.reflectedAt)
        || left.stayDate.localeCompare(right.stayDate)
        || left.roomGroupId.localeCompare(right.roomGroupId)
        || left.eventKey.localeCompare(right.eventKey);
}

function compareEvaluatedEventDetailOrder(
    left: EvaluatedAdjustmentReviewEvent,
    right: EvaluatedAdjustmentReviewEvent
): number {
    return left.roomOrder - right.roomOrder
        || (left.roomGroupName ?? "").localeCompare(right.roomGroupName ?? "", "ja")
        || compareEventNewestFirst(left, right);
}

function groupByStayDate<T extends { stayDate: string }>(
    events: readonly T[]
): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    for (const event of events) {
        const values = grouped.get(event.stayDate) ?? [];
        values.push(event);
        grouped.set(event.stayDate, values);
    }
    return grouped;
}

function countValues<T extends string>(
    values: readonly T[],
    keys: readonly T[]
): Record<T, number> {
    return Object.fromEntries(keys.map((key) => [
        key,
        values.filter((value) => value === key).length
    ])) as Record<T, number>;
}

function buildStayRoomKey(event: Pick<AdjustmentReviewEvent, "roomGroupId" | "stayDate">): string {
    return `${event.stayDate}|${event.roomGroupId}`;
}

function resolveStatusTimestamp(value: Record<string, unknown>): string | null {
    for (const key of ["accepted_at", "completed_at", "suggest_calc_datetime"] as const) {
        const candidate = value[key];
        if (candidate === null || candidate === undefined || candidate === "") {
            continue;
        }
        if (typeof candidate !== "string" || !Number.isFinite(Date.parse(candidate))) {
            return null;
        }
        return candidate;
    }
    return null;
}

function readRankName(value: unknown): string | null | undefined {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    return value.trim() === "" ? null : value.trim();
}

function readActorName(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function formatJstDate(timestamp: number): string | null {
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    const parts = JST_DATE_FORMATTER.formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year === undefined || month === undefined || day === undefined
        ? null
        : `${year}${month}${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
