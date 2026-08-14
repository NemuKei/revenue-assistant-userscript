import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    buildBookingCurveRawSourceCacheKey,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";
import {
    getRecentWeighted90CandidateStayDates,
    getSeasonalComponentCandidateStayDates,
    getDaysBetweenDateKeys,
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
import { startSalesSettingClassicRuntime } from "../analyze/salesSettingClassicRuntime";
import { createNextPerformanceRecorder } from "../performance/nextPerformanceRecorder";

const FACILITY_ID = "yad:fixture";
const FACILITY_LABEL = "施設A（mock）";
const STAY_DATE = "20260812";
const AS_OF_DATE = "20260808";
const SCOPES: readonly BookingCurveReferenceScope[] = [
    { key: "hotel", kind: "hotel", label: "ホテル全体", roomGroupId: null },
    { key: "room:single", kind: "roomGroup", label: "シングル（mock）", roomGroupId: "single" },
    { key: "room:twin", kind: "roomGroup", label: "ツイン（mock）", roomGroupId: "twin" }
];
const params = new URLSearchParams(window.location.search);
const fixtureMode = params.get("state") ?? "ready";
const rankMode = params.get("rank") ?? "ready";
const referenceMode = params.get("reference") ?? "ready";
let loadCount = 0;
let dataCancelCount = 0;
let dataResetCount = 0;
let priorityCount = 0;
let rankLoadCount = 0;
let rankCancelCount = 0;
let rankResetCount = 0;
let revalidationResolved = false;
const loadCountByScope = new Map<string, number>();

const dataSource: BookingCurveReferenceDataSource = {
    cancel() {
        dataCancelCount += 1;
        setFixtureCount("data-cancel", dataCancelCount);
    },
    async load(stayDate, asOfDate, scopeKey, options): Promise<BookingCurveReferenceDataLoadResult> {
        loadCount += 1;
        document.documentElement.setAttribute("data-mock-sales-setting-load-count", String(loadCount));
        const scopeLoadCount = (loadCountByScope.get(scopeKey) ?? 0) + 1;
        loadCountByScope.set(scopeKey, scopeLoadCount);
        document.documentElement.setAttribute(
            `data-mock-sales-setting-load-${scopeKey.replace(/[^a-z0-9]+/giu, "-")}-count`,
            String(scopeLoadCount)
        );
        const scope = SCOPES.find((item) => item.key === scopeKey);
        if (scope === undefined) {
            return { status: "error", contextKey: `${stayDate}|${asOfDate}`, reason: "scope-invalid" };
        }
        if (fixtureMode === "error") {
            return { status: "error", contextKey: `${stayDate}|${asOfDate}`, reason: "read-failed" };
        }
        if (fixtureMode === "deferred-once" && loadCount === 1) {
            await waitForFixtureSignal("data");
        }
        if (fixtureMode === "missing" && scope.kind === "roomGroup") {
            return buildReadyResult(scope, { status: "missing", reason: "database-missing" }, []);
        }
        const referenceDeferred = options?.referencePriority === null;
        const records = referenceMode === "deferred" && referenceDeferred
            ? [createRawRecord(scope, STAY_DATE)]
            : buildFixtureRecords(scope);
        return buildReadyResult(
            scope,
            { status: "ready", records },
            records,
            referenceMode === "deferred" ? referenceDeferred : undefined,
            fixtureMode === "revalidate" && !revalidationResolved ? 1 : 0
        );
    },
    prioritize() {
        priorityCount += 1;
        setFixtureCount("priority", priorityCount);
    },
    reset() {
        dataResetCount += 1;
        setFixtureCount("data-reset", dataResetCount);
    },
    subscribe(listener) {
        const handleRevalidate = (): void => {
            revalidationResolved = true;
            listener();
        };
        const handleSingleScopeRefresh = (): void => {
            listener("room:single");
        };
        document.addEventListener("mock-resolve-revalidate", handleRevalidate);
        document.addEventListener("mock-refresh-room-single", handleSingleScopeRefresh);
        return () => {
            document.removeEventListener("mock-resolve-revalidate", handleRevalidate);
            document.removeEventListener("mock-refresh-room-single", handleSingleScopeRefresh);
        };
    },
    stop() {}
};

const rankStatusDataSource: BookingCurveRankStatusDataSource = {
    cancel() {
        rankCancelCount += 1;
        setFixtureCount("rank-cancel", rankCancelCount);
    },
    async load(facilityId, stayDate): Promise<BookingCurveRankStatusLoadResult> {
        rankLoadCount += 1;
        document.documentElement.setAttribute("data-mock-sales-setting-rank-load-count", String(rankLoadCount));
        const contextKey = `${facilityId}|${stayDate}`;
        if (rankMode === "deferred-once" && rankLoadCount === 1) {
            await waitForFixtureSignal("rank-status");
        }
        if (rankMode === "error") {
            return { status: "error", contextKey, reason: "request-failed" };
        }
        return {
            status: "ready",
            contextKey,
            facilityId,
            stayDate,
            snapshot: {
                stayDate,
                invalidEventCount: 0,
                events: rankMode === "empty"
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
    reset() {
        rankResetCount += 1;
        setFixtureCount("rank-reset", rankResetCount);
    },
    stop() {}
};

const performanceRecorder = createNextPerformanceRecorder({
    documentHost: document,
    sourceRevision: "fixture",
    windowHost: window
});

startSalesSettingClassicRuntime(document, window, {
    dataSource,
    performanceRecorder,
    rankStatusDataSource,
    resolveAsOfDate: () => AS_OF_DATE,
    resolveStayDate: (location) => {
        if (!location.pathname.includes("/dev/fixtures/next-analyze-sales-setting/")) {
            return null;
        }
        return location.pathname.endsWith("/2026-08-13") ? "20260813" : STAY_DATE;
    }
});

function setFixtureCount(name: string, value: number): void {
    document.documentElement.setAttribute(`data-mock-sales-setting-${name}-count`, String(value));
}

function waitForFixtureSignal(name: "data" | "rank-status"): Promise<void> {
    return new Promise((resolve) => {
        document.addEventListener(`mock-resolve-${name}`, () => resolve(), { once: true });
    });
}

function buildReadyResult(
    scope: BookingCurveReferenceScope,
    readStatus: Extract<BookingCurveReferenceDataLoadResult, { status: "ready" }>["readStatus"],
    records: readonly BookingCurveRawSourceRecord[],
    referenceDeferred?: boolean,
    currentDueTaskCount = 0
): Extract<BookingCurveReferenceDataLoadResult, { status: "ready" }> {
    return {
        status: "ready",
        ...(referenceDeferred === undefined && currentDueTaskCount === 0
            ? {}
            : {
                acquisitionDiagnostics: {
                    current: {
                        candidateTaskCount: 1,
                        dueTaskCount: currentDueTaskCount,
                        outcome: "ready" as const
                    },
                    reference: { candidateTaskCount: 0, dueTaskCount: 0, outcome: "ready" as const },
                    referenceDeferred: referenceDeferred ?? true
                }
            }),
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

function buildFixtureRecords(scope: BookingCurveReferenceScope): BookingCurveRawSourceRecord[] {
    const stayDate = normalizeDateKey(STAY_DATE);
    const asOfDate = normalizeDateKey(AS_OF_DATE);
    const weekday = stayDate === null ? null : getUtcWeekday(stayDate);
    if (stayDate === null || asOfDate === null || weekday === null) {
        return [];
    }
    const stayDates = new Set<string>([stayDate]);
    for (const candidate of getRecentWeighted90CandidateStayDates({
        asOfDate,
        targetStayDate: stayDate,
        ticks: LEAD_TIME_BUCKET_TICKS
    })) {
        stayDates.add(candidate);
    }
    for (const candidate of getSeasonalComponentCandidateStayDates({
        targetMonth: stayDate.slice(0, 7),
        weekday
    })) {
        stayDates.add(candidate);
    }
    return Array.from(stayDates).map((candidate) => (
        createRawRecord(scope, toCompactDateKey(candidate) ?? candidate)
    ));
}

function createRawRecord(
    scope: BookingCurveReferenceScope,
    stayDate: string
): BookingCurveRawSourceRecord {
    const roomGroupId = scope.kind === "roomGroup" ? scope.roomGroupId : null;
    const query = roomGroupId === null
        ? `date=${stayDate}`
        : `date=${stayDate}&rm_room_group_id=${roomGroupId}`;
    return {
        cacheKey: buildBookingCurveRawSourceCacheKey({
            facilityId: FACILITY_ID,
            stayDate,
            asOfDate: AS_OF_DATE,
            scope: scope.kind,
            ...(roomGroupId === null ? {} : { roomGroupId }),
            endpoint: BOOKING_CURVE_ENDPOINT,
            query
        }),
        facilityId: FACILITY_ID,
        stayDate,
        asOfDate: AS_OF_DATE,
        scope: scope.kind,
        roomGroupId,
        endpoint: BOOKING_CURVE_ENDPOINT,
        query,
        fetchedAt: "2026-08-08T01:30:00.000Z",
        schemaVersion: BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
        response: createResponse(scope, stayDate)
    };
}

function createResponse(scope: BookingCurveReferenceScope, compactStayDate: string): BookingCurveApiResponse {
    const stayDate = normalizeDateKey(compactStayDate);
    const asOfDate = normalizeDateKey(AS_OF_DATE);
    if (stayDate === null || asOfDate === null) {
        return { stay_date: compactStayDate, max_room_count: 0, booking_curve: [] };
    }
    const scale = scope.kind === "hotel" ? 2.3 : scope.roomGroupId === "twin" ? 1.3 : 1;
    const capacity = scope.kind === "hotel" ? 42 : scope.roomGroupId === "twin" ? 24 : 18;
    const finalRooms = Math.round(17 * scale);
    const maxLeadDays = 390;
    const bookingCurve: BookingCurveApiResponse["booking_curve"] = [];
    for (let leadDays = maxLeadDays; leadDays >= 0; leadDays -= 1) {
        const observedDate = shiftDate(stayDate, -leadDays);
        if (observedDate === null || observedDate > asOfDate) {
            continue;
        }
        const progress = Math.max(0, Math.min(1, 1 - (leadDays / 420)));
        const all = Math.round(finalRooms * progress);
        const group = Math.round(all * (scope.kind === "hotel" ? 0.18 : 0.12));
        bookingCurve.push({
            date: observedDate,
            all: { this_year_room_sum: all },
            transient: { this_year_room_sum: Math.max(0, all - group) },
            group: { this_year_room_sum: group }
        });
    }
    const daysAfterStay = getDaysBetweenDateKeys(asOfDate, stayDate);
    if (daysAfterStay !== null && daysAfterStay < 0 && bookingCurve.length > 0) {
        const last = bookingCurve.at(-1);
        if (last !== undefined && last.date !== stayDate) {
            bookingCurve.push({ ...last, date: stayDate });
        }
    }
    return {
        stay_date: toCompactDateKey(stayDate) ?? compactStayDate,
        max_room_count: capacity,
        booking_curve: bookingCurve
    };
}
