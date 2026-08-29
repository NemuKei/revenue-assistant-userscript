import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    buildBookingCurveRawSourceCacheKey
} from "../../bookingCurveRawSourceContract";
import {
    getRecentWeighted90CandidateStayDates,
    getDaysBetweenDateKeys,
    getSeasonalComponentCandidateStayDates,
    getUtcWeekday,
    normalizeDateKey,
    shiftDate,
    toCompactDateKey,
    type BookingCurveApiPoint,
    type BookingCurveApiResponse
} from "../../curveCore";
import { LEAD_TIME_BUCKET_TICKS } from "../../leadTimeBuckets";
import type { RankRecommendationCurrentSettingsResponse } from "../../rankRecommendation";
import {
    buildNextBookingCurveRecordKey,
    buildNextBookingCurveSourceKey,
    type NextBookingCurveLandingObservation,
    type NextBookingCurveSourceRecord
} from "./bookingCurveSourceStore";

export const NEXT_BOOKING_CURVE_BOOTSTRAP_REQUEST_LIMIT = 800;
export const NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT = 200;
export const NEXT_BOOKING_CURVE_REQUEST_INTERVAL_MS = 50;
export const NEXT_BOOKING_CURVE_CONCURRENCY = 20;
export const NEXT_BOOKING_CURVE_INTERACTIVE_REQUEST_INTERVAL_MS = 35;
export const NEXT_BOOKING_CURVE_INTERACTIVE_CONCURRENCY = 20;
export const NEXT_BOOKING_CURVE_POINT_LIMIT = 512;

export interface NextBookingCurveScope {
    key: string;
    kind: "hotel" | "roomGroup";
    roomGroupId: string | null;
}

export interface NextBookingCurveAcquisitionContext {
    asOfDate: string;
    facilityId: string;
    reviewRooms?: readonly NextBookingCurveReviewRoom[];
    roomScopes: readonly NextBookingCurveScope[];
    visibleStayDates: readonly string[];
}

export interface NextBookingCurveReviewRoom {
    order: number;
    roomGroupId: string;
    roomGroupName: string | null;
}

export interface NextBookingCurveAcquisitionTask {
    query: string;
    role: "current" | "recent-reference" | "seasonal-reference";
    roomGroupId: string | null;
    scope: "hotel" | "roomGroup";
    sourceKey: string;
    stayDate: string;
}

export type NextBookingCurveMergeMode = "append" | "repair-internal-gaps";

export function createNextBookingCurveScopes(
    currentSettings: RankRecommendationCurrentSettingsResponse
): NextBookingCurveScope[] {
    const scopes: NextBookingCurveScope[] = [{
        key: "hotel",
        kind: "hotel",
        roomGroupId: null
    }];
    const seen = new Set<string>();
    for (const setting of currentSettings.suggest_output_current_settings ?? []) {
        for (const roomGroup of setting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            if (roomGroupId === "" || seen.has(roomGroupId)) {
                continue;
            }
            seen.add(roomGroupId);
            scopes.push({
                key: `room:${roomGroupId}`,
                kind: "roomGroup",
                roomGroupId
            });
        }
    }
    return scopes;
}

export function createNextBookingCurveReviewRooms(
    currentSettings: RankRecommendationCurrentSettingsResponse
): NextBookingCurveReviewRoom[] {
    const rooms: NextBookingCurveReviewRoom[] = [];
    const seen = new Set<string>();
    for (const setting of currentSettings.suggest_output_current_settings ?? []) {
        for (const roomGroup of setting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            if (roomGroupId === "" || seen.has(roomGroupId)) {
                continue;
            }
            seen.add(roomGroupId);
            const roomGroupName = roomGroup.rm_room_group_name?.trim() ?? "";
            rooms.push({
                order: rooms.length,
                roomGroupId,
                roomGroupName: roomGroupName === "" ? null : roomGroupName
            });
        }
    }
    return rooms;
}

export function buildNextBookingCurveBackgroundTasks(
    context: NextBookingCurveAcquisitionContext
): NextBookingCurveAcquisitionTask[] {
    const tasks = new Map<string, NextBookingCurveAcquisitionTask>();
    for (const stayDate of normalizeCompactDates(context.visibleStayDates)) {
        for (const scope of context.roomScopes) {
            const task = buildTask(context.facilityId, stayDate, scope, "current");
            tasks.set(task.sourceKey, task);
        }
    }
    const hotelScope = context.roomScopes.find((scope) => scope.kind === "hotel") ?? {
        key: "hotel",
        kind: "hotel" as const,
        roomGroupId: null
    };
    for (const targetStayDate of normalizeCompactDates(context.visibleStayDates)) {
        for (const sourceStayDate of getNextRecentReferenceCandidateStayDates(
            targetStayDate,
            context.asOfDate
        )) {
            const task = buildTask(
                context.facilityId,
                sourceStayDate,
                hotelScope,
                "recent-reference"
            );
            if (!tasks.has(task.sourceKey)) {
                tasks.set(task.sourceKey, task);
            }
        }
    }
    return Array.from(tasks.values()).sort(compareTaskOrder);
}

export function buildNextBookingCurveVisibleHotelCurrentTasks(
    context: NextBookingCurveAcquisitionContext
): NextBookingCurveAcquisitionTask[] {
    const hotelScope = context.roomScopes.find((scope) => scope.kind === "hotel");
    if (hotelScope === undefined) {
        return [];
    }
    return normalizeCompactDates(context.visibleStayDates)
        .map((stayDate) => buildTask(context.facilityId, stayDate, hotelScope, "current"))
        .sort(compareTaskOrder);
}

export function buildNextBookingCurveCurrentTasks(options: {
    context: NextBookingCurveAcquisitionContext;
    scopeKeys?: readonly string[];
    stayDate: string;
}): NextBookingCurveAcquisitionTask[] {
    const stayDate = toCompactDateKey(options.stayDate);
    if (stayDate === null) {
        return [];
    }
    const scopeKeys = options.scopeKeys === undefined ? null : new Set(options.scopeKeys);
    return options.context.roomScopes
        .filter((scope) => scopeKeys === null || scopeKeys.has(scope.key))
        .map((scope) => buildTask(options.context.facilityId, stayDate, scope, "current"))
        .sort(compareTaskOrder);
}

export function buildNextBookingCurveReferenceTasks(options: {
    context: NextBookingCurveAcquisitionContext;
    scopeKey: string;
    targetStayDate: string;
}): NextBookingCurveAcquisitionTask[] {
    const scope = options.context.roomScopes.find((item) => item.key === options.scopeKey);
    if (scope === undefined) {
        return [];
    }
    const tasks = new Map<string, NextBookingCurveAcquisitionTask>();
    for (const stayDate of getNextRecentReferenceCandidateStayDates(
        options.targetStayDate,
        options.context.asOfDate
    )) {
        const task = buildTask(
            options.context.facilityId,
            stayDate,
            scope,
            "recent-reference"
        );
        tasks.set(task.sourceKey, task);
    }
    for (const stayDate of getNextSeasonalReferenceCandidateStayDates(
        options.targetStayDate
    )) {
        const task = buildTask(
            options.context.facilityId,
            stayDate,
            scope,
            "seasonal-reference"
        );
        if (!tasks.has(task.sourceKey)) {
            tasks.set(task.sourceKey, task);
        }
    }
    return Array.from(tasks.values()).sort(compareTaskOrder);
}

export function selectNextBookingCurveDueTasks(options: {
    asOfDate: string;
    existingRecords: readonly NextBookingCurveSourceRecord[];
    limit: number;
    tasks: readonly NextBookingCurveAcquisitionTask[];
}): NextBookingCurveAcquisitionTask[] {
    const latestBySource = new Map(options.existingRecords.map((record) => [
        record.sourceKey,
        record
    ]));
    return options.tasks
        .map((task) => ({
            due: getTaskDueState(task, latestBySource.get(task.sourceKey), options.asOfDate),
            task
        }))
        .filter((item) => item.due !== null)
        .sort((left, right) => (
            (left.due?.rank ?? 0) - (right.due?.rank ?? 0)
            || (right.due?.ageDays ?? 0) - (left.due?.ageDays ?? 0)
            || compareTaskOrder(left.task, right.task)
        ))
        .slice(0, Math.max(0, Math.floor(options.limit)))
        .map((item) => item.task);
}

export function selectNextBookingCurveGapRepairTasks(options: {
    asOfDate: string;
    existingRecords: readonly NextBookingCurveSourceRecord[];
    limit: number;
    tasks: readonly NextBookingCurveAcquisitionTask[];
}): NextBookingCurveAcquisitionTask[] {
    const normalizedAsOfDate = toCompactDateKey(options.asOfDate);
    if (normalizedAsOfDate === null) {
        return [];
    }
    const latestBySource = new Map<string, NextBookingCurveSourceRecord>();
    for (const record of options.existingRecords) {
        const previous = latestBySource.get(record.sourceKey);
        if (
            previous === undefined
            || record.asOfDate > previous.asOfDate
            || (
                record.asOfDate === previous.asOfDate
                && record.fetchedAt > previous.fetchedAt
            )
        ) {
            latestBySource.set(record.sourceKey, record);
        }
    }
    return options.tasks
        .filter((task) => {
            if (task.role !== "current") {
                return false;
            }
            const record = latestBySource.get(task.sourceKey);
            return record !== undefined
                && record.asOfDate === normalizedAsOfDate
                && hasInternalExplicitNull(record, normalizedAsOfDate);
        })
        .sort(compareTaskOrder)
        .slice(0, Math.max(0, Math.floor(options.limit)));
}

export function isNextBookingCurveRecordUsable(
    record: NextBookingCurveSourceRecord,
    asOfDate: string
): boolean {
    const requestedAsOfDate = toCompactDateKey(asOfDate);
    if (requestedAsOfDate === null || record.asOfDate > requestedAsOfDate) {
        return false;
    }
    if (requestedAsOfDate > record.stayDate) {
        return record.landing !== null;
    }
    return record.asOfDate >= requestedAsOfDate;
}

export function getNextRecentReferenceCandidateStayDates(
    targetStayDate: string,
    asOfDate: string
): string[] {
    return getRecentWeighted90CandidateStayDates({
        targetStayDate,
        asOfDate,
        ticks: LEAD_TIME_BUCKET_TICKS
    })
        .map(toCompactDateKey)
        .filter((value): value is string => value !== null);
}

export function getNextSeasonalReferenceCandidateStayDates(
    targetStayDate: string
): string[] {
    const normalizedTargetStayDate = normalizeDateKey(targetStayDate);
    const weekday = normalizedTargetStayDate === null
        ? null
        : getUtcWeekday(normalizedTargetStayDate);
    if (normalizedTargetStayDate === null || weekday === null) {
        return [];
    }
    return getSeasonalComponentCandidateStayDates({
        targetMonth: normalizedTargetStayDate.slice(0, 7),
        weekday
    })
        .map(toCompactDateKey)
        .filter((value): value is string => value !== null);
}

export function compactNextBookingCurveResponse(
    payload: unknown,
    expectedStayDate: string
): BookingCurveApiResponse | null {
    if (!isRecord(payload) || typeof payload.stay_date !== "string") {
        return null;
    }
    const stayDate = toCompactDateKey(payload.stay_date);
    const expected = toCompactDateKey(expectedStayDate);
    if (stayDate === null || expected === null || stayDate !== expected) {
        return null;
    }
    if (payload.booking_curve !== undefined && !Array.isArray(payload.booking_curve)) {
        return null;
    }
    if ((payload.booking_curve?.length ?? 0) > NEXT_BOOKING_CURVE_POINT_LIMIT) {
        return null;
    }
    const bookingCurve = (payload.booking_curve ?? []).flatMap((value): BookingCurveApiPoint[] => {
        if (!isRecord(value)) {
            return [];
        }
        const date = typeof value.date === "string" ? normalizeDateKey(value.date) : null;
        if (date === null) {
            return [];
        }
        const point: BookingCurveApiPoint = { date };
        for (const segment of ["all", "transient", "group"] as const) {
            const counts = compactCounts(value[segment]);
            if (counts !== null) {
                point[segment] = counts;
            }
        }
        return [point];
    });
    const maxRoomCount = normalizeNonNegativeNumber(payload.max_room_count);
    return {
        stay_date: stayDate,
        ...(maxRoomCount === null ? {} : { max_room_count: maxRoomCount }),
        booking_curve: bookingCurve
    };
}

export function createNextBookingCurveSourceRecord(options: {
    asOfDate: string;
    facilityId: string;
    fetchedAt: string;
    mergeMode?: NextBookingCurveMergeMode;
    previousRecord?: NextBookingCurveSourceRecord;
    response: BookingCurveApiResponse;
    task: NextBookingCurveAcquisitionTask;
}): NextBookingCurveSourceRecord {
    const asOfDate = toCompactDateKey(options.asOfDate);
    if (asOfDate === null) {
        throw new Error("Next booking curve source as-of date is invalid");
    }
    const previousRecord = options.previousRecord !== undefined
        && options.previousRecord.sourceKey === options.task.sourceKey
        && options.previousRecord.asOfDate <= asOfDate
        ? options.previousRecord
        : undefined;
    const response = mergeNextBookingCurveResponse({
        asOfDate,
        mergeMode: options.mergeMode ?? "append",
        previousRecord,
        response: options.response,
        stayDate: options.task.stayDate
    });
    const landing = options.mergeMode === "repair-internal-gaps"
        ? previousRecord?.landing ?? null
        : previousRecord?.landing
            ?? buildNextBookingCurveLandingObservation(
                options.response,
                options.task.stayDate,
                asOfDate
            );
    const cacheKey = buildBookingCurveRawSourceCacheKey({
        facilityId: options.facilityId,
        stayDate: options.task.stayDate,
        asOfDate,
        scope: options.task.scope,
        ...(options.task.roomGroupId === null ? {} : { roomGroupId: options.task.roomGroupId }),
        endpoint: BOOKING_CURVE_ENDPOINT,
        query: options.task.query
    });
    return {
        recordKey: buildNextBookingCurveRecordKey(options.task.sourceKey, asOfDate),
        sourceKey: options.task.sourceKey,
        source: "next-bounded-booking-curve",
        firstObservedAsOfDate: previousRecord?.firstObservedAsOfDate ?? asOfDate,
        landing,
        cacheKey,
        facilityId: options.facilityId,
        stayDate: options.task.stayDate,
        asOfDate,
        scope: options.task.scope,
        roomGroupId: options.task.roomGroupId,
        endpoint: BOOKING_CURVE_ENDPOINT,
        query: options.task.query,
        fetchedAt: options.fetchedAt,
        schemaVersion: BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
        response
    };
}

function buildTask(
    facilityId: string,
    stayDate: string,
    scope: NextBookingCurveScope,
    role: NextBookingCurveAcquisitionTask["role"]
): NextBookingCurveAcquisitionTask {
    const query = scope.kind === "hotel"
        ? `date=${stayDate}`
        : `date=${stayDate}&rm_room_group_id=${scope.roomGroupId ?? ""}`;
    return {
        query,
        role,
        roomGroupId: scope.roomGroupId,
        scope: scope.kind,
        sourceKey: buildNextBookingCurveSourceKey({
            facilityId,
            roomGroupId: scope.roomGroupId,
            scope: scope.kind,
            stayDate
        }),
        stayDate
    };
}

function getTaskDueState(
    task: NextBookingCurveAcquisitionTask,
    record: NextBookingCurveSourceRecord | undefined,
    asOfDate: string
): { ageDays: number; rank: number } | null {
    if (record === undefined) {
        return { ageDays: Number.POSITIVE_INFINITY, rank: task.role === "current" ? 0 : 1 };
    }
    const normalizedAsOfDate = toCompactDateKey(asOfDate);
    if (normalizedAsOfDate === null || record.asOfDate > normalizedAsOfDate) {
        return { ageDays: Number.POSITIVE_INFINITY, rank: 0 };
    }
    const ageDays = getDaysBetweenDateKeys(normalizedAsOfDate, record.asOfDate)
        ?? Number.POSITIVE_INFINITY;
    if (task.role === "current") {
        if (normalizedAsOfDate > task.stayDate) {
            return record.landing === null ? { ageDays, rank: 0 } : null;
        }
        return record.asOfDate < normalizedAsOfDate ? { ageDays, rank: 0 } : null;
    }
    if (task.stayDate < normalizedAsOfDate && record.landing === null) {
        return { ageDays, rank: 2 };
    }
    const requiredObservationDate = getLatestRequiredReferenceObservationDate(
        task.stayDate,
        normalizedAsOfDate
    );
    return requiredObservationDate !== null && record.asOfDate < requiredObservationDate
        ? { ageDays, rank: 2 }
        : null;
}

function compareTaskOrder(
    left: NextBookingCurveAcquisitionTask,
    right: NextBookingCurveAcquisitionTask
): number {
    return (left.role === "current" ? 0 : 1) - (right.role === "current" ? 0 : 1)
        || (left.scope === "hotel" ? 0 : 1) - (right.scope === "hotel" ? 0 : 1)
        || left.stayDate.localeCompare(right.stayDate)
        || (left.roomGroupId ?? "").localeCompare(right.roomGroupId ?? "")
        || left.sourceKey.localeCompare(right.sourceKey);
}

function normalizeCompactDates(values: readonly string[]): string[] {
    return Array.from(new Set(values
        .map(toCompactDateKey)
        .filter((value): value is string => value !== null)))
        .sort();
}

function mergeNextBookingCurveResponse(options: {
    asOfDate: string;
    mergeMode: NextBookingCurveMergeMode;
    previousRecord: NextBookingCurveSourceRecord | undefined;
    response: BookingCurveApiResponse;
    stayDate: string;
}): BookingCurveApiResponse {
    const pointByDate = new Map<string, BookingCurveApiPoint>();
    for (const point of options.previousRecord?.response.booking_curve ?? []) {
        const pointDate = normalizeDateKey(point.date);
        if (pointDate !== null && !pointByDate.has(pointDate)) {
            pointByDate.set(pointDate, point);
        }
    }
    for (const point of options.response.booking_curve ?? []) {
        const pointDate = normalizeDateKey(point.date);
        const compactPointDate = pointDate === null ? null : toCompactDateKey(pointDate);
        const previousPoint = pointDate === null ? undefined : pointByDate.get(pointDate);
        if (
            pointDate === null
            || compactPointDate === null
            || compactPointDate > options.asOfDate
            || compactPointDate > options.stayDate
            || (
                compactPointDate === options.stayDate
                && options.asOfDate > options.stayDate
                && !pointByDate.has(pointDate)
            )
        ) {
            continue;
        }
        if (previousPoint !== undefined) {
            if (
                compactPointDate === options.stayDate
                && options.asOfDate > options.stayDate
            ) {
                continue;
            }
            pointByDate.set(pointDate, fillMissingBookingCurveSegments(previousPoint, point));
            continue;
        }
        if (options.mergeMode === "repair-internal-gaps") {
            continue;
        }
        pointByDate.set(pointDate, point);
    }
    const bookingCurve = Array.from(pointByDate.values())
        .sort((left, right) => left.date.localeCompare(right.date));
    if (bookingCurve.length > NEXT_BOOKING_CURVE_POINT_LIMIT) {
        throw new Error("Next booking curve merged point count exceeds the fixed limit");
    }
    const previousMaxRoomCount = normalizeNonNegativeNumber(
        options.previousRecord?.response.max_room_count
    );
    const responseMaxRoomCount = normalizeNonNegativeNumber(options.response.max_room_count);
    const maxRoomCount = options.mergeMode === "repair-internal-gaps"
        ? previousMaxRoomCount
        : responseMaxRoomCount ?? previousMaxRoomCount;
    return {
        stay_date: options.stayDate,
        ...(maxRoomCount === null ? {} : { max_room_count: maxRoomCount }),
        booking_curve: bookingCurve
    };
}

function hasInternalExplicitNull(
    record: NextBookingCurveSourceRecord,
    asOfDate: string
): boolean {
    const points = (record.response.booking_curve ?? [])
        .flatMap((point): Array<{ compactDate: string; point: BookingCurveApiPoint }> => {
            const compactDate = toCompactDateKey(point.date);
            return compactDate === null
                || compactDate > asOfDate
                || compactDate > record.stayDate
                ? []
                : [{ compactDate, point }];
        })
        .sort((left, right) => left.compactDate.localeCompare(right.compactDate));
    const normalizedStayDate = normalizeDateKey(record.stayDate);
    if (normalizedStayDate === null) {
        return false;
    }
    const observedTickDates = Array.from(new Set(LEAD_TIME_BUCKET_TICKS
        .flatMap((tick): string[] => {
            if (typeof tick !== "number") {
                return [];
            }
            const observedDate = shiftDate(normalizedStayDate, -tick);
            const compactObservedDate = observedDate === null
                ? null
                : toCompactDateKey(observedDate);
            return compactObservedDate === null
                || compactObservedDate > asOfDate
                || compactObservedDate > record.stayDate
                ? []
                : [compactObservedDate];
        }))).sort();
    for (const segment of ["all", "transient", "group"] as const) {
        const firstFiniteIndex = points.findIndex((candidate) => (
            isFiniteNonNegativeNumber(candidate.point[segment]?.this_year_room_sum)
        ));
        let lastFiniteIndex = -1;
        for (let index = points.length - 1; index >= 0; index -= 1) {
            if (isFiniteNonNegativeNumber(
                points[index]?.point[segment]?.this_year_room_sum
            )) {
                lastFiniteIndex = index;
                break;
            }
        }
        if (firstFiniteIndex < 0 || lastFiniteIndex <= firstFiniteIndex) {
            continue;
        }
        let observedIndex = -1;
        for (const observedDate of observedTickDates) {
            while (
                observedIndex + 1 < points.length
                && (points[observedIndex + 1]?.compactDate ?? "") <= observedDate
            ) {
                observedIndex += 1;
            }
            if (observedIndex < 0) {
                continue;
            }
            const value = points[observedIndex]?.point[segment]?.this_year_room_sum;
            if (
                value === null
                && firstFiniteIndex < observedIndex
                && observedIndex < lastFiniteIndex
            ) {
                return true;
            }
        }
    }
    return false;
}

function fillMissingBookingCurveSegments(
    previous: BookingCurveApiPoint,
    incoming: BookingCurveApiPoint
): BookingCurveApiPoint {
    let merged = previous;
    for (const segment of ["all", "transient", "group"] as const) {
        const previousRooms = previous[segment]?.this_year_room_sum;
        const incomingRooms = incoming[segment]?.this_year_room_sum;
        if (
            isFiniteNonNegativeNumber(previousRooms)
            || !isFiniteNonNegativeNumber(incomingRooms)
        ) {
            continue;
        }
        if (merged === previous) {
            merged = { ...previous };
        }
        merged[segment] = { this_year_room_sum: incomingRooms };
    }
    return merged;
}

function buildNextBookingCurveLandingObservation(
    response: BookingCurveApiResponse,
    stayDate: string,
    asOfDate: string
): NextBookingCurveLandingObservation | null {
    if (asOfDate <= stayDate) {
        return null;
    }
    return {
        all: resolveLatestRooms(response, asOfDate, "all"),
        group: resolveLatestRooms(response, asOfDate, "group"),
        observedAsOfDate: asOfDate,
        transient: resolveLatestRooms(response, asOfDate, "transient")
    };
}

function resolveLatestRooms(
    response: BookingCurveApiResponse,
    asOfDate: string,
    segment: "all" | "transient" | "group"
): number | null {
    let latestDate = "";
    let latestPoint: BookingCurveApiPoint | null = null;
    for (const point of response.booking_curve ?? []) {
        const pointDate = toCompactDateKey(point.date);
        if (
            pointDate === null
            || pointDate > asOfDate
            || pointDate < latestDate
        ) {
            continue;
        }
        latestDate = pointDate;
        latestPoint = point;
    }
    const rooms = latestPoint?.[segment]?.this_year_room_sum;
    return typeof rooms === "number" && Number.isFinite(rooms) && rooms >= 0
        ? rooms
        : null;
}

function getLatestRequiredReferenceObservationDate(
    stayDate: string,
    asOfDate: string
): string | null {
    const normalizedStayDate = normalizeDateKey(stayDate);
    const normalizedAsOfDate = normalizeDateKey(asOfDate);
    if (normalizedStayDate === null || normalizedAsOfDate === null) {
        return null;
    }
    let latestRequiredDate: string | null = null;
    for (const tick of LEAD_TIME_BUCKET_TICKS) {
        if (typeof tick !== "number") {
            continue;
        }
        const rangeStart = shiftDate(normalizedAsOfDate, -(90 - tick));
        const rangeEnd = shiftDate(normalizedAsOfDate, tick);
        const observedDate = shiftDate(normalizedStayDate, -tick);
        if (
            rangeStart === null
            || rangeEnd === null
            || observedDate === null
            || normalizedStayDate < rangeStart
            || normalizedStayDate > rangeEnd
            || observedDate > normalizedAsOfDate
        ) {
            continue;
        }
        const compactObservedDate = toCompactDateKey(observedDate);
        if (
            compactObservedDate !== null
            && (latestRequiredDate === null || compactObservedDate > latestRequiredDate)
        ) {
            latestRequiredDate = compactObservedDate;
        }
    }
    return latestRequiredDate;
}

function compactCounts(value: unknown): { this_year_room_sum?: number | null } | null {
    if (!isRecord(value)) {
        return null;
    }
    if (value.this_year_room_sum === null) {
        return { this_year_room_sum: null };
    }
    const rooms = normalizeNonNegativeNumber(value.this_year_room_sum);
    return rooms === null ? null : { this_year_room_sum: rooms };
}

function normalizeNonNegativeNumber(value: unknown): number | null {
    return isFiniteNonNegativeNumber(value) ? value : null;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
