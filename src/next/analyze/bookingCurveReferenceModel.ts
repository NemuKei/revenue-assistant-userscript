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
import type {
    NextBookingCurveLandingObservation,
    NextBookingCurveSourceRecord
} from "../bookingCurve/bookingCurveSourceStore";
import type { BookingCurveReferenceScope } from "./bookingCurveReferenceDataSource";
import type { BookingCurveRankStatusEvent } from "./bookingCurveRankMarkerModel";

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
    rankMarkers: readonly BookingCurveReferenceRankMarker[];
    recent: BookingCurveReferenceSeries;
    seasonal: BookingCurveReferenceSeries;
    segment: CurveSegment;
    title: string;
}

export interface BookingCurveReferenceRankMarker {
    afterRankName: string | null;
    beforeRankName: string | null;
    daysBeforeStay: number;
    reflectedDate: string;
    signature: string;
    value: number;
}

export interface BookingCurveReferenceViewModel {
    asOfDate: string;
    capacityRooms: number | null;
    invalidRecordCount: number;
    panels: readonly BookingCurveReferencePanel[];
    scope: BookingCurveReferenceScope;
    scopes: readonly BookingCurveReferenceScope[];
    secondarySegment: BookingCurveReferenceSecondarySegment;
    reusedRecordCount: number;
    sourceRecordCount: number;
    futureRecordCount: number;
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
            | "future-records-only"
            | "store-missing"
            | "version-mismatch";
    };

export function buildBookingCurveReferenceViewModel(options: {
    asOfDate: string;
    facilityId: string;
    readStatus: ExistingIndexedDbReadResult<BookingCurveRawSourceRecord>;
    records: readonly unknown[];
    rankEvents?: readonly BookingCurveRankStatusEvent[];
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
    let reusedRecordCount = 0;
    let futureRecordCount = 0;
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
        if (basicRecord.asOfDate > asOfDate) {
            futureRecordCount += 1;
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
            asOfDate: basicRecord.asOfDate,
            scope: options.scope.kind,
            ...(options.scope.roomGroupId === null ? {} : { roomGroupId: options.scope.roomGroupId }),
            endpoint: BOOKING_CURVE_ENDPOINT,
            query: expectedQuery
        });
        if (basicRecord.cacheKey !== expectedCacheKey) {
            invalidRecordCount += 1;
            continue;
        }
        if (basicRecord.asOfDate !== asOfDate) {
            reusedRecordCount += 1;
        }
        const current = validRecordByStayDate.get(normalizedRecordStayDate);
        if (
            current === undefined
            || basicRecord.asOfDate.localeCompare(current.asOfDate) > 0
            || (
                basicRecord.asOfDate === current.asOfDate
                && (
                    (isNextBookingCurveRecord(basicRecord) && !isNextBookingCurveRecord(current))
                    || (
                        isNextBookingCurveRecord(basicRecord) === isNextBookingCurveRecord(current)
                        && basicRecord.fetchedAt.localeCompare(current.fetchedAt) > 0
                    )
                )
            )
        ) {
            validRecordByStayDate.set(normalizedRecordStayDate, basicRecord);
        }
    }

    const records = Array.from(validRecordByStayDate.values());
    if (records.length === 0) {
        return {
            status: "empty",
            reason: futureRecordCount > 0 ? "future-records-only" : "no-records"
        };
    }
    const normalizedStayDate = normalizeDateKey(stayDate);
    const normalizedAsOfDate = normalizeDateKey(asOfDate);
    const weekday = normalizedStayDate === null ? null : getUtcWeekday(normalizedStayDate);
    if (normalizedStayDate === null || normalizedAsOfDate === null || weekday === null) {
        return { status: "empty", reason: "no-records" };
    }
    const selectedStayDateRecord = validRecordByStayDate.get(stayDate) ?? null;
    const currentRecord = selectedStayDateRecord?.asOfDate === asOfDate
        ? selectedStayDateRecord
        : null;
    const sources = records.map((record): BookingCurveResponseSource => ({
        response: buildReferenceResponse(record),
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
        const current = buildCurrentSeries(currentRecord, normalizedStayDate, normalizedAsOfDate, segment);
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
        const recentZeroDay = buildRecentZeroDayReference(
            records,
            segment,
            normalizedStayDate,
            normalizedAsOfDate
        );
        const recentLanding = buildRecentLandingReference(
            records,
            segment,
            normalizedStayDate,
            normalizedAsOfDate
        );
        const seasonalZeroDay = buildSeasonalZeroDayReference(
            records,
            segment,
            normalizedStayDate.slice(0, 7),
            weekday
        );
        const seasonalLanding = buildSeasonalLandingReference(
            records,
            segment,
            normalizedStayDate.slice(0, 7),
            weekday
        );
        return {
            current,
            rankMarkers: buildBookingCurveRankMarkers(
                currentRecord?.response ?? null,
                options.scope.kind === "roomGroup" ? options.rankEvents ?? [] : [],
                segment
            ),
            recent: buildReferenceSeries(
                recentResult,
                "recent",
                "直近型",
                recentZeroDay,
                recentLanding
            ),
            seasonal: buildReferenceSeries(
                seasonalResult,
                "seasonal",
                "季節型",
                seasonalZeroDay,
                seasonalLanding
            ),
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
            reusedRecordCount,
            sourceRecordCount: records.length,
            futureRecordCount,
            stayDate,
            visibility
        }
    };
}

function buildBookingCurveRankMarkers(
    response: BookingCurveApiResponse | null,
    events: readonly BookingCurveRankStatusEvent[],
    segment: CurveSegment
): BookingCurveReferenceRankMarker[] {
    if (response === null) {
        return [];
    }
    return events.flatMap((event) => {
        const value = resolveMetricAtDate(response, event.reflectedDate, segment, false);
        return value === null
            ? []
            : [{
                afterRankName: event.afterRankName,
                beforeRankName: event.beforeRankName,
                daysBeforeStay: event.daysBeforeStay,
                reflectedDate: event.reflectedDate,
                signature: event.signature,
                value
            }];
    });
}

function buildCurrentSeries(
    record: BookingCurveRawSourceRecord | null,
    stayDate: string,
    asOfDate: string,
    segment: CurveSegment
): BookingCurveReferenceSeries {
    const response = record?.response ?? null;
    const observationLeadDays = getDaysBetweenDateKeys(stayDate, asOfDate);
    const zeroDayTrusted = record !== null && isZeroDayObservationTrusted(record);
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
                    : record === null
                        ? null
                        : resolveLandingRooms(record, segment)
            };
        }
        if (observationLeadDays !== null && observationLeadDays > tick) {
            return { interpolated: false, tick, value: null };
        }
        if (tick === 0 && !zeroDayTrusted) {
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
    label: string,
    zeroDay: { sourceCount: number; value: number | null },
    landing: { sourceCount: number; value: number | null }
): BookingCurveReferenceSeries {
    const valueByTick = new Map(result.points.map((point) => [point.lt, point.rooms]));
    valueByTick.set(0, zeroDay.value);
    valueByTick.set("ACT", landing.value);
    const points = LEAD_TIME_BUCKET_TICKS.map((tick): BookingCurveReferenceSeriesPoint => ({
        interpolated: false,
        tick,
        value: normalizeNonNegativeNumber(valueByTick.get(tick))
    }));
    return {
        id,
        label,
        missingReason: result.diagnostics.missingReason ?? null,
        points,
        sourceStayDateCount: Math.max(
            result.diagnostics.sourceStayDateCount,
            zeroDay.sourceCount,
            landing.sourceCount
        )
    };
}

function buildReferenceResponse(
    record: BookingCurveRawSourceRecord
): BookingCurveApiResponse {
    if (isZeroDayObservationTrusted(record)) {
        return record.response;
    }
    const stayDate = toCompactDateKey(record.stayDate);
    if (stayDate === null) {
        return record.response;
    }
    return {
        ...record.response,
        booking_curve: (record.response.booking_curve ?? []).filter((point) => (
            toCompactDateKey(point.date) !== stayDate
        ))
    };
}

function isZeroDayObservationTrusted(record: BookingCurveRawSourceRecord): boolean {
    const stayDate = toCompactDateKey(record.stayDate);
    const recordAsOfDate = toCompactDateKey(record.asOfDate);
    if (stayDate === null || recordAsOfDate === null || recordAsOfDate < stayDate) {
        return false;
    }
    if (!isNextBookingCurveRecord(record)) {
        return recordAsOfDate === stayDate;
    }
    const firstObservedAsOfDate = toCompactDateKey(record.firstObservedAsOfDate);
    return firstObservedAsOfDate !== null && firstObservedAsOfDate <= stayDate;
}

function resolveLandingRooms(
    record: BookingCurveRawSourceRecord,
    segment: CurveSegment
): number | null {
    const stayDate = toCompactDateKey(record.stayDate);
    const recordAsOfDate = toCompactDateKey(record.asOfDate);
    if (
        stayDate === null
        || recordAsOfDate === null
        || recordAsOfDate <= stayDate
    ) {
        return null;
    }
    if (isNextBookingCurveRecord(record) && record.landing !== null) {
        return normalizeNonNegativeNumber(record.landing[segment]);
    }
    const normalizedAsOfDate = normalizeDateKey(recordAsOfDate);
    return normalizedAsOfDate === null
        ? null
        : resolveMetricAtDate(record.response, normalizedAsOfDate, segment, false);
}

function buildRecentLandingReference(
    records: readonly BookingCurveRawSourceRecord[],
    segment: CurveSegment,
    targetStayDate: string,
    asOfDate: string
): { sourceCount: number; value: number | null } {
    const targetWeekday = getUtcWeekday(targetStayDate);
    if (targetWeekday === null) {
        return { sourceCount: 0, value: null };
    }
    let weightedTotal = 0;
    let totalWeight = 0;
    let sourceCount = 0;
    for (const record of records) {
        const stayDate = normalizeDateKey(record.stayDate);
        if (stayDate === null || getUtcWeekday(stayDate) !== targetWeekday) {
            continue;
        }
        const value = resolveLandingRooms(record, segment);
        const distance = getDaysBetweenDateKeys(asOfDate, stayDate);
        if (value === null || distance === null || distance <= 0) {
            continue;
        }
        const weight = getRecentReferenceWeight(distance);
        if (weight === 0) {
            continue;
        }
        weightedTotal += value * weight;
        totalWeight += weight;
        sourceCount += 1;
    }
    return {
        sourceCount,
        value: totalWeight === 0 ? null : weightedTotal / totalWeight
    };
}

function buildRecentZeroDayReference(
    records: readonly BookingCurveRawSourceRecord[],
    segment: CurveSegment,
    targetStayDate: string,
    asOfDate: string
): { sourceCount: number; value: number | null } {
    const targetWeekday = getUtcWeekday(targetStayDate);
    if (targetWeekday === null) {
        return { sourceCount: 0, value: null };
    }
    let weightedTotal = 0;
    let totalWeight = 0;
    let sourceCount = 0;
    for (const record of records) {
        const stayDate = normalizeDateKey(record.stayDate);
        if (
            stayDate === null
            || getUtcWeekday(stayDate) !== targetWeekday
            || !isZeroDayObservationTrusted(record)
        ) {
            continue;
        }
        const distance = getDaysBetweenDateKeys(asOfDate, stayDate);
        const value = resolveMetricAtDate(record.response, stayDate, segment, true);
        if (distance === null || distance <= 0 || value === null) {
            continue;
        }
        const weight = getRecentReferenceWeight(distance);
        if (weight === 0) {
            continue;
        }
        weightedTotal += value * weight;
        totalWeight += weight;
        sourceCount += 1;
    }
    return {
        sourceCount,
        value: totalWeight === 0 ? null : weightedTotal / totalWeight
    };
}

function buildSeasonalLandingReference(
    records: readonly BookingCurveRawSourceRecord[],
    segment: CurveSegment,
    targetMonth: string,
    weekday: number
): { sourceCount: number; value: number | null } {
    const match = /^(\d{4})-(\d{2})$/u.exec(targetMonth);
    if (match === null) {
        return { sourceCount: 0, value: null };
    }
    const targetYear = Number(match[1]);
    const targetMonthNumber = match[2];
    const seasonalMonths = new Set([
        `${targetYear - 1}-${targetMonthNumber}`,
        `${targetYear - 2}-${targetMonthNumber}`
    ]);
    const values: number[] = [];
    for (const record of records) {
        const stayDate = normalizeDateKey(record.stayDate);
        if (
            stayDate === null
            || !seasonalMonths.has(stayDate.slice(0, 7))
            || getUtcWeekday(stayDate) !== weekday
        ) {
            continue;
        }
        const value = resolveLandingRooms(record, segment);
        if (value !== null) {
            values.push(value);
        }
    }
    return {
        sourceCount: values.length,
        value: values.length === 0
            ? null
            : values.reduce((sum, value) => sum + value, 0) / values.length
    };
}

function buildSeasonalZeroDayReference(
    records: readonly BookingCurveRawSourceRecord[],
    segment: CurveSegment,
    targetMonth: string,
    weekday: number
): { sourceCount: number; value: number | null } {
    const match = /^(\d{4})-(\d{2})$/u.exec(targetMonth);
    if (match === null) {
        return { sourceCount: 0, value: null };
    }
    const targetYear = Number(match[1]);
    const targetMonthNumber = match[2];
    const seasonalMonths = new Set([
        `${targetYear - 1}-${targetMonthNumber}`,
        `${targetYear - 2}-${targetMonthNumber}`
    ]);
    const values: number[] = [];
    for (const record of records) {
        const stayDate = normalizeDateKey(record.stayDate);
        if (
            stayDate === null
            || !seasonalMonths.has(stayDate.slice(0, 7))
            || getUtcWeekday(stayDate) !== weekday
            || !isZeroDayObservationTrusted(record)
        ) {
            continue;
        }
        const value = resolveMetricAtDate(record.response, stayDate, segment, true);
        if (value !== null) {
            values.push(value);
        }
    }
    return {
        sourceCount: values.length,
        value: values.length === 0
            ? null
            : values.reduce((sum, value) => sum + value, 0) / values.length
    };
}

function getRecentReferenceWeight(distanceDays: number): number {
    return distanceDays <= 14
        ? 3
        : distanceDays <= 30
            ? 2
            : distanceDays <= 90
                ? 1
                : 0;
}

function isNextBookingCurveRecord(
    record: BookingCurveRawSourceRecord
): record is NextBookingCurveSourceRecord {
    const value = record as Partial<NextBookingCurveSourceRecord>;
    return value.source === "next-bounded-booking-curve"
        && typeof value.firstObservedAsOfDate === "string"
        && (value.landing === null || isNextLandingObservation(value.landing));
}

function isNextLandingObservation(
    value: unknown
): value is NextBookingCurveLandingObservation {
    return isRecord(value)
        && typeof value.observedAsOfDate === "string"
        && [value.all, value.transient, value.group].every((rooms) => (
            rooms === null
            || (
                typeof rooms === "number"
                && Number.isFinite(rooms)
                && rooms >= 0
            )
        ));
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
