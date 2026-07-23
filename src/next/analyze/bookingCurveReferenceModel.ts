import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    buildBookingCurveRawSourceCacheKey,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";
import {
    buildCurveInputFromBookingCurveResponses,
    buildRecentWeighted90ReferenceCurve,
    buildSeasonalComponentReferenceCurve,
    getDaysBetweenDateKeys,
    getUtcWeekday,
    normalizeDateKey,
    shiftDate,
    toCompactDateKey,
    type BookingCurveApiPoint,
    type BookingCurveApiResponse,
    type BookingCurveResponseSource,
    type CurveSegment,
    type CurveTick,
    type ReferenceCurveResult
} from "../../curveCore";
import type { ExistingIndexedDbReadResult } from "../../indexedDbReadOnly";
import { LEAD_TIME_BUCKET_TICKS } from "../../leadTimeBuckets";
import type { BookingCurveReferenceScope } from "./bookingCurveReferenceDataSource";

export type BookingCurveReferenceSecondarySegment = "transient" | "group";

export interface BookingCurveReferenceVisibility {
    recent: boolean;
    seasonal: boolean;
}

export interface BookingCurveReferenceSeriesPoint {
    interpolated: boolean;
    tick: CurveTick;
    value: number | null;
}

export interface BookingCurveReferenceSeries {
    id: "current" | "recent" | "seasonal";
    label: string;
    missingReason: string | null;
    points: readonly BookingCurveReferenceSeriesPoint[];
    sourceStayDateCount: number | null;
}

export interface BookingCurveReferencePanel {
    current: BookingCurveReferenceSeries;
    recent: BookingCurveReferenceSeries;
    seasonal: BookingCurveReferenceSeries;
    segment: CurveSegment;
    title: string;
}

export interface BookingCurveReferenceViewModel {
    asOfDate: string;
    capacityRooms: number | null;
    invalidRecordCount: number;
    panels: readonly BookingCurveReferencePanel[];
    scope: BookingCurveReferenceScope;
    scopes: readonly BookingCurveReferenceScope[];
    secondarySegment: BookingCurveReferenceSecondarySegment;
    sourceRecordCount: number;
    staleRecordCount: number;
    stayDate: string;
    visibility: BookingCurveReferenceVisibility;
}

export type BookingCurveReferenceModelResult =
    | { status: "ready"; viewModel: BookingCurveReferenceViewModel }
    | {
        status: "empty";
        reason:
            | "database-missing"
            | "indexeddb-unavailable"
            | "no-records"
            | "read-failed"
            | "stale-records-only"
            | "store-missing"
            | "version-mismatch";
    };

export function buildBookingCurveReferenceViewModel(options: {
    asOfDate: string;
    facilityId: string;
    readStatus: ExistingIndexedDbReadResult<BookingCurveRawSourceRecord>;
    records: readonly unknown[];
    scope: BookingCurveReferenceScope;
    scopes: readonly BookingCurveReferenceScope[];
    secondarySegment?: BookingCurveReferenceSecondarySegment;
    stayDate: string;
    visibility?: BookingCurveReferenceVisibility;
}): BookingCurveReferenceModelResult {
    if (options.readStatus.status === "missing") {
        return {
            status: "empty",
            reason: options.readStatus.reason === "index-missing"
                ? "store-missing"
                : options.readStatus.reason
        };
    }
    if (options.readStatus.status === "unavailable") {
        return { status: "empty", reason: "indexeddb-unavailable" };
    }
    if (options.readStatus.status === "error") {
        return { status: "empty", reason: "read-failed" };
    }
    const stayDate = toCompactDateKey(options.stayDate);
    const asOfDate = toCompactDateKey(options.asOfDate);
    if (stayDate === null || asOfDate === null) {
        return { status: "empty", reason: "no-records" };
    }

    let invalidRecordCount = 0;
    let staleRecordCount = 0;
    const validRecordByStayDate = new Map<string, BookingCurveRawSourceRecord>();
    for (const rawRecord of options.records) {
        const basicRecord = parseBookingCurveRawSourceRecord(rawRecord);
        if (
            basicRecord === null
            || basicRecord.facilityId !== options.facilityId
            || !matchesSelectedScope(basicRecord, options.scope)
        ) {
            invalidRecordCount += 1;
            continue;
        }
        if (basicRecord.asOfDate !== asOfDate) {
            staleRecordCount += 1;
            continue;
        }
        const normalizedRecordStayDate = toCompactDateKey(basicRecord.stayDate);
        if (normalizedRecordStayDate === null) {
            invalidRecordCount += 1;
            continue;
        }
        const expectedQuery = options.scope.kind === "hotel"
            ? `date=${normalizedRecordStayDate}`
            : `date=${normalizedRecordStayDate}&rm_room_group_id=${options.scope.roomGroupId ?? ""}`;
        if (basicRecord.query !== expectedQuery) {
            invalidRecordCount += 1;
            continue;
        }
        const expectedCacheKey = buildBookingCurveRawSourceCacheKey({
            facilityId: options.facilityId,
            stayDate: normalizedRecordStayDate,
            asOfDate,
            scope: options.scope.kind,
            ...(options.scope.roomGroupId === null ? {} : { roomGroupId: options.scope.roomGroupId }),
            endpoint: BOOKING_CURVE_ENDPOINT,
            query: expectedQuery
        });
        if (basicRecord.cacheKey !== expectedCacheKey) {
            invalidRecordCount += 1;
            continue;
        }
        const current = validRecordByStayDate.get(normalizedRecordStayDate);
        if (current === undefined || basicRecord.fetchedAt.localeCompare(current.fetchedAt) > 0) {
            validRecordByStayDate.set(normalizedRecordStayDate, basicRecord);
        }
    }

    const records = Array.from(validRecordByStayDate.values());
    if (records.length === 0) {
        return {
            status: "empty",
            reason: staleRecordCount > 0 ? "stale-records-only" : "no-records"
        };
    }
    const normalizedStayDate = normalizeDateKey(stayDate);
    const normalizedAsOfDate = normalizeDateKey(asOfDate);
    const weekday = normalizedStayDate === null ? null : getUtcWeekday(normalizedStayDate);
    if (normalizedStayDate === null || normalizedAsOfDate === null || weekday === null) {
        return { status: "empty", reason: "no-records" };
    }
    const currentRecord = validRecordByStayDate.get(stayDate) ?? null;
    const sources = records.map((record): BookingCurveResponseSource => ({
        response: record.response,
        scope: options.scope.kind,
        ...(options.scope.roomGroupId === null ? {} : { roomGroupId: options.scope.roomGroupId })
    }));
    const input = buildCurveInputFromBookingCurveResponses({
        facilityId: options.facilityId,
        asOfDate: normalizedAsOfDate,
        sources
    });
    const secondarySegment = options.secondarySegment ?? "transient";
    const visibility = options.visibility ?? { recent: true, seasonal: true };
    const panels = (["all", secondarySegment] as const).map((segment): BookingCurveReferencePanel => {
        const current = buildCurrentSeries(currentRecord?.response ?? null, normalizedStayDate, normalizedAsOfDate, segment);
        const recentResult = buildRecentWeighted90ReferenceCurve(input, {
            scope: options.scope.kind,
            ...(options.scope.roomGroupId === null ? {} : { roomGroupId: options.scope.roomGroupId }),
            segment,
            ticks: LEAD_TIME_BUCKET_TICKS,
            targetStayDate: normalizedStayDate,
            asOfDate: normalizedAsOfDate
        });
        const seasonalResult = buildSeasonalComponentReferenceCurve(input, {
            scope: options.scope.kind,
            ...(options.scope.roomGroupId === null ? {} : { roomGroupId: options.scope.roomGroupId }),
            segment,
            ticks: LEAD_TIME_BUCKET_TICKS,
            targetMonth: normalizedStayDate.slice(0, 7),
            weekday,
            asOfDate: normalizedAsOfDate
        });
        return {
            current,
            recent: buildReferenceSeries(recentResult, "recent", "直近型"),
            seasonal: buildReferenceSeries(seasonalResult, "seasonal", "季節型"),
            segment,
            title: segment === "all" ? "全体" : segment === "group" ? "団体" : "個人"
        };
    });
    if (!panels.some((panel) => [panel.current, panel.recent, panel.seasonal]
        .some((series) => series.points.some((point) => point.value !== null)))) {
        return { status: "empty", reason: "no-records" };
    }

    return {
        status: "ready",
        viewModel: {
            asOfDate,
            capacityRooms: normalizeNonNegativeNumber(currentRecord?.response.max_room_count),
            invalidRecordCount,
            panels,
            scope: options.scope,
            scopes: options.scopes,
            secondarySegment,
            sourceRecordCount: records.length,
            staleRecordCount,
            stayDate,
            visibility
        }
    };
}

function buildCurrentSeries(
    response: BookingCurveApiResponse | null,
    stayDate: string,
    asOfDate: string,
    segment: CurveSegment
): BookingCurveReferenceSeries {
    const observationLeadDays = getDaysBetweenDateKeys(stayDate, asOfDate);
    const points = LEAD_TIME_BUCKET_TICKS.map((tick): BookingCurveReferenceSeriesPoint => {
        if (response === null) {
            return { interpolated: false, tick, value: null };
        }
        if (tick === "ACT") {
            return {
                interpolated: false,
                tick,
                value: observationLeadDays !== null && observationLeadDays >= 0
                    ? null
                    : resolveMetricAtDate(response, asOfDate, segment, true)
            };
        }
        if (observationLeadDays !== null && observationLeadDays > tick) {
            return { interpolated: false, tick, value: null };
        }
        const targetDate = shiftDate(stayDate, -tick);
        return {
            interpolated: false,
            tick,
            value: targetDate === null ? null : resolveMetricAtDate(response, targetDate, segment, false)
        };
    });
    return {
        id: "current",
        label: "現在",
        missingReason: response === null ? "current-record-missing" : null,
        points,
        sourceStayDateCount: response === null ? 0 : 1
    };
}

function buildReferenceSeries(
    result: ReferenceCurveResult,
    id: "recent" | "seasonal",
    label: string
): BookingCurveReferenceSeries {
    const valueByTick = new Map(result.points.map((point) => [point.lt, point.rooms]));
    const points = LEAD_TIME_BUCKET_TICKS.map((tick): BookingCurveReferenceSeriesPoint => ({
        interpolated: false,
        tick,
        value: normalizeNonNegativeNumber(valueByTick.get(tick))
    }));
    applyZeroDayDisplayInterpolation(points);
    return {
        id,
        label,
        missingReason: result.diagnostics.missingReason ?? null,
        points,
        sourceStayDateCount: result.diagnostics.sourceStayDateCount
    };
}

function applyZeroDayDisplayInterpolation(points: BookingCurveReferenceSeriesPoint[]): void {
    const zeroDay = points.find((point) => point.tick === 0);
    const oneDay = points.find((point) => point.tick === 1);
    const act = points.find((point) => point.tick === "ACT");
    if (zeroDay === undefined || oneDay === undefined || act === undefined) {
        return;
    }
    if (
        zeroDay.value !== null
        && oneDay.value !== null
        && act.value !== null
        && Math.abs(zeroDay.value - act.value) <= 0.0001
        && Math.abs(oneDay.value - act.value) > 0.0001
    ) {
        zeroDay.value = null;
    }
    if (zeroDay.value === null && oneDay.value !== null && act.value !== null) {
        zeroDay.value = Math.max(0, Math.round(oneDay.value + ((act.value - oneDay.value) * 0.5)));
        zeroDay.interpolated = true;
    }
}

function resolveMetricAtDate(
    response: BookingCurveApiResponse,
    lookupDate: string,
    segment: CurveSegment,
    exact: boolean
): number | null {
    let matchedDate = "";
    let matchedPoint: BookingCurveApiPoint | null = null;
    for (const point of response.booking_curve ?? []) {
        const pointDate = normalizeDateKey(point.date);
        if (pointDate === null || (exact ? pointDate !== lookupDate : pointDate > lookupDate)) {
            continue;
        }
        if (exact || pointDate >= matchedDate) {
            matchedDate = pointDate;
            matchedPoint = point;
        }
    }
    if (matchedPoint === null) {
        return null;
    }
    if (segment === "transient") {
        return normalizeNonNegativeNumber(matchedPoint.transient?.this_year_room_sum);
    }
    return normalizeNonNegativeNumber(matchedPoint[segment]?.this_year_room_sum);
}

function parseBookingCurveRawSourceRecord(value: unknown): BookingCurveRawSourceRecord | null {
    if (!isRecord(value) || !isBookingCurveApiResponse(value.response)) {
        return null;
    }
    if (
        typeof value.cacheKey !== "string"
        || typeof value.facilityId !== "string"
        || typeof value.stayDate !== "string"
        || typeof value.asOfDate !== "string"
        || (value.scope !== "hotel" && value.scope !== "roomGroup")
        || (value.roomGroupId !== null && typeof value.roomGroupId !== "string")
        || value.endpoint !== BOOKING_CURVE_ENDPOINT
        || typeof value.query !== "string"
        || typeof value.fetchedAt !== "string"
        || !Number.isFinite(Date.parse(value.fetchedAt))
        || value.schemaVersion !== BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION
    ) {
        return null;
    }
    const record = value as unknown as BookingCurveRawSourceRecord;
    const recordStayDate = toCompactDateKey(record.stayDate);
    const responseStayDate = toCompactDateKey(record.response.stay_date);
    return recordStayDate !== null && responseStayDate === recordStayDate ? record : null;
}

function matchesSelectedScope(record: BookingCurveRawSourceRecord, scope: BookingCurveReferenceScope): boolean {
    return record.scope === scope.kind
        && (scope.kind === "hotel"
            ? record.roomGroupId === null
            : record.roomGroupId === scope.roomGroupId);
}

function isBookingCurveApiResponse(value: unknown): value is BookingCurveApiResponse {
    if (!isRecord(value) || typeof value.stay_date !== "string") {
        return false;
    }
    if (!isOptionalFiniteNumber(value.max_room_count)) {
        return false;
    }
    return value.booking_curve === undefined
        || (Array.isArray(value.booking_curve) && value.booking_curve.every(isBookingCurveApiPoint));
}

function isBookingCurveApiPoint(value: unknown): value is BookingCurveApiPoint {
    if (!isRecord(value) || typeof value.date !== "string") {
        return false;
    }
    return [value.all, value.transient, value.group].every((counts) => (
        counts === undefined
        || (
            isRecord(counts)
            && isOptionalFiniteNumberOrNull(counts.this_year_room_sum)
        )
    ));
}

function normalizeNonNegativeNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isOptionalFiniteNumber(value: unknown): boolean {
    return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isOptionalFiniteNumberOrNull(value: unknown): boolean {
    return value === undefined
        || value === null
        || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
