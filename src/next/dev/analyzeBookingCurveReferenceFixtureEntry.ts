import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    buildBookingCurveRawSourceCacheKey,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";
import {
    getRecentWeighted90CandidateStayDates,
    getSeasonalComponentCandidateStayDates,
    getUtcWeekday,
    normalizeDateKey,
    shiftDate,
    toCompactDateKey,
    type BookingCurveApiResponse
} from "../../curveCore";
import { LEAD_TIME_BUCKET_TICKS } from "../../leadTimeBuckets";
import type {
    BookingCurveReferenceDataLoadResult,
    BookingCurveReferenceDataSource,
    BookingCurveReferenceScope
} from "../analyze/bookingCurveReferenceDataSource";
import type {
    BookingCurveRankStatusDataSource,
    BookingCurveRankStatusLoadResult
} from "../analyze/bookingCurveRankStatusDataSource";
import { startBookingCurveReferenceRuntime } from "../analyze/bookingCurveReferenceRuntime";

const FACILITY_ID = "yad:fixture";
const FACILITY_LABEL = "施設A（mock）";
const STAY_DATE = "20260812";
const AS_OF_DATE = "20260723";
const SCOPES: readonly BookingCurveReferenceScope[] = [
    { key: "hotel", kind: "hotel", label: "ホテル全体", roomGroupId: null },
    { key: "room:single", kind: "roomGroup", label: "シングル（mock）", roomGroupId: "single" },
    { key: "room:twin", kind: "roomGroup", label: "ツイン（mock）", roomGroupId: "twin" }
];
const fixtureParams = new URLSearchParams(window.location.search);
const fixtureMode = fixtureParams.get("state") ?? "ready";
const rankFixtureMode = fixtureParams.get("rank") ?? "ready";
let rankLoadCount = 0;

const dataSource: BookingCurveReferenceDataSource = {
    cancel() {},
    async load(stayDate, asOfDate, scopeKey): Promise<BookingCurveReferenceDataLoadResult> {
        const scope = SCOPES.find((item) => item.key === scopeKey);
        if (fixtureMode === "error") {
            return { status: "error", contextKey: `${stayDate}|${asOfDate}`, reason: "read-failed" };
        }
        if (scope === undefined) {
            return { status: "error", contextKey: `${stayDate}|${asOfDate}`, reason: "scope-invalid" };
        }
        if (fixtureMode === "missing") {
            return buildReadyResult(scope, {
                status: "missing",
                reason: "database-missing"
            }, []);
        }
        const recordAsOfDate = fixtureMode === "stale" ? "20260722" : AS_OF_DATE;
        const allRecords = buildFixtureRecords(scope, recordAsOfDate);
        const records = fixtureMode === "sparse"
            ? allRecords.filter((record) => record.stayDate === STAY_DATE)
            : allRecords;
        return buildReadyResult(scope, { status: "ready", records }, records);
    },
    reset() {},
    stop() {}
};

const rankStatusDataSource: BookingCurveRankStatusDataSource = {
    cancel() {},
    async load(facilityId, stayDate): Promise<BookingCurveRankStatusLoadResult> {
        rankLoadCount += 1;
        document.documentElement.setAttribute("data-mock-rank-load-count", String(rankLoadCount));
        const contextKey = `${facilityId}|${stayDate}`;
        if (rankFixtureMode === "error" || rankFixtureMode === "aborted") {
            return {
                status: "error",
                contextKey,
                reason: rankFixtureMode === "aborted" ? "aborted" : "request-failed"
            };
        }
        return {
            status: "ready",
            contextKey,
            facilityId,
            stayDate,
            snapshot: {
                stayDate,
                invalidEventCount: 0,
                events: rankFixtureMode === "empty"
                    ? []
                    : [
                        {
                            afterRankName: "11",
                            beforeRankName: "12",
                            daysBeforeStay: 23,
                            reflectedAt: "2026-07-20T03:30:00.000Z",
                            reflectedDate: "2026-07-20",
                            roomGroupId: "single",
                            signature: "2026-07-20:12:11",
                            stayDate
                        },
                        {
                            afterRankName: "9",
                            beforeRankName: "10",
                            daysBeforeStay: 14,
                            reflectedAt: "2026-07-29T02:00:00.000Z",
                            reflectedDate: "2026-07-29",
                            roomGroupId: "twin",
                            signature: "2026-07-29:10:9",
                            stayDate
                        }
                    ]
            }
        };
    },
    reset() {},
    stop() {}
};

startBookingCurveReferenceRuntime(document, window, {
    dataSource,
    rankStatusDataSource,
    resolveAsOfDate: () => AS_OF_DATE,
    resolveStayDate: (location) => location.pathname.includes("/dev/fixtures/next-analyze-booking-curve/")
        ? STAY_DATE
        : null
});

function buildReadyResult(
    scope: BookingCurveReferenceScope,
    readStatus: Extract<BookingCurveReferenceDataLoadResult, { status: "ready" }>['readStatus'],
    records: readonly BookingCurveRawSourceRecord[]
): Extract<BookingCurveReferenceDataLoadResult, { status: "ready" }> {
    return {
        status: "ready",
        asOfDate: AS_OF_DATE,
        contextKey: `${STAY_DATE}|${AS_OF_DATE}`,
        facilityId: FACILITY_ID,
        facilityLabel: FACILITY_LABEL,
        readStatus,
        records: records.slice(),
        scope,
        scopes: SCOPES,
        stayDate: STAY_DATE
    };
}

function buildFixtureRecords(
    scope: BookingCurveReferenceScope,
    asOfDate: string
): BookingCurveRawSourceRecord[] {
    const normalizedStayDate = normalizeDateKey(STAY_DATE);
    const normalizedAsOfDate = normalizeDateKey(asOfDate);
    const weekday = normalizedStayDate === null ? null : getUtcWeekday(normalizedStayDate);
    if (normalizedStayDate === null || normalizedAsOfDate === null || weekday === null) {
        return [];
    }
    const stayDates = new Set<string>([normalizedStayDate]);
    for (const candidate of getRecentWeighted90CandidateStayDates({
        targetStayDate: normalizedStayDate,
        asOfDate: normalizedAsOfDate,
        ticks: LEAD_TIME_BUCKET_TICKS
    })) {
        stayDates.add(candidate);
    }
    for (const candidate of getSeasonalComponentCandidateStayDates({
        targetMonth: normalizedStayDate.slice(0, 7),
        weekday
    })) {
        stayDates.add(candidate);
    }
    return Array.from(stayDates).map((stayDate) => createRawRecord(scope, stayDate, normalizedAsOfDate));
}

function createRawRecord(
    scope: BookingCurveReferenceScope,
    stayDate: string,
    asOfDate: string
): BookingCurveRawSourceRecord {
    const compactStayDate = toCompactDateKey(stayDate) ?? stayDate.replaceAll("-", "");
    const compactAsOfDate = toCompactDateKey(asOfDate) ?? asOfDate.replaceAll("-", "");
    const roomGroupId = scope.kind === "roomGroup" ? scope.roomGroupId : null;
    const query = roomGroupId === null
        ? `date=${compactStayDate}`
        : `date=${compactStayDate}&rm_room_group_id=${roomGroupId}`;
    return {
        cacheKey: buildBookingCurveRawSourceCacheKey({
            facilityId: FACILITY_ID,
            stayDate: compactStayDate,
            asOfDate: compactAsOfDate,
            scope: scope.kind,
            ...(roomGroupId === null ? {} : { roomGroupId }),
            endpoint: BOOKING_CURVE_ENDPOINT,
            query
        }),
        facilityId: FACILITY_ID,
        stayDate: compactStayDate,
        asOfDate: compactAsOfDate,
        scope: scope.kind,
        roomGroupId,
        endpoint: BOOKING_CURVE_ENDPOINT,
        query,
        fetchedAt: "2026-07-23T01:30:00.000Z",
        schemaVersion: BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
        response: createBookingCurveResponse(scope, stayDate, asOfDate)
    };
}

function createBookingCurveResponse(
    scope: BookingCurveReferenceScope,
    stayDate: string,
    asOfDate: string
): BookingCurveApiResponse {
    const roomScale = scope.kind === "hotel" ? 3 : scope.roomGroupId === "twin" ? 1.25 : 1;
    const staySeed = Number(stayDate.slice(-2)) % 7;
    const finalRooms = Math.round((14 + staySeed) * roomScale);
    const bookingCurve = LEAD_TIME_BUCKET_TICKS.flatMap((tick) => {
        const observedDate = tick === "ACT" ? stayDate : shiftDate(stayDate, -tick);
        if (observedDate === null || observedDate > asOfDate) {
            return [];
        }
        const leadDays = tick === "ACT" ? 0 : tick;
        const progress = Math.max(0, Math.min(1, 1 - (leadDays / 390)));
        const all = Math.max(0, Math.round(finalRooms * progress));
        const group = Math.max(0, Math.round(all * (0.12 + ((staySeed % 3) * 0.04))));
        return [{
            date: observedDate,
            all: { this_year_room_sum: all },
            transient: { this_year_room_sum: Math.max(0, all - group) },
            group: { this_year_room_sum: group }
        }];
    });
    return {
        stay_date: toCompactDateKey(stayDate) ?? stayDate,
        max_room_count: Math.round(26 * roomScale),
        booking_curve: bookingCurve
    };
}
