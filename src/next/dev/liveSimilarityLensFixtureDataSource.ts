import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";
import {
    COMPETITOR_PRICE_ENDPOINT,
    COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
    type CompetitorPriceSnapshotRecord
} from "../../competitorPriceSnapshotContract";
import type { RankRecommendationCurrentSettingsResponse } from "../../rankRecommendation";
import {
    buildLiveCalendarGroupEvidence,
    buildLiveSimilarityLensEvidence
} from "../live/liveSimilarityLensEvidence";
import type {
    LiveCalendarSummaryDataSource,
    LiveCalendarSummarySnapshot
} from "../live/liveCalendarSummaryDataSource";
import type {
    LiveSimilarityLensDataLoadResult,
    LiveSimilarityLensDataSource
} from "../live/liveSimilarityLensDataSource";
import type { AdjustmentReviewDataSource } from "../adjustmentReview/adjustmentReviewDataSource";
import {
    buildAdjustmentReviewEventKey,
    type AdjustmentReviewEvent
} from "../adjustmentReview/adjustmentReviewModel";
import type { NextBookingCurveSourceRecord } from "../bookingCurve/bookingCurveSourceStore";

type FixtureScenario =
    | "ready"
    | "zero"
    | "partial"
    | "tail-pending"
    | "historical-prefix"
    | "missing"
    | "error";

const FIXTURE_FACILITY_ID = "yad:fixture-next";
const FIXTURE_AS_OF_DATE = "20260722";
const ROOM_GROUPS = [
    { id: "rg-twin", name: "スタンダードツイン", capacity: 32 },
    { id: "rg-japanese", name: "和室", capacity: 18 }
] as const;

export function createLiveSimilarityLensFixtureDataSource(
    windowHost: Window = window
): LiveSimilarityLensDataSource {
    let stopped = false;
    return {
        async load(visibleStayDates) {
            await new Promise<void>((resolve) => windowHost.setTimeout(resolve, 80));
            if (stopped) {
                return { status: "error", reason: "aborted", contextKey: null };
            }
            const scenario = parseFixtureScenario(windowHost.location.search);
            if (scenario === "error") {
                return { status: "error", reason: "read-failed", contextKey: "fixture:error" };
            }
            const facilityLabel = windowHost.document
                .querySelector<HTMLElement>("[data-mock-facility-context]")
                ?.textContent?.trim() ?? "";
            return buildFixtureResult(visibleStayDates, scenario, facilityLabel);
        },
        stop() {
            stopped = true;
        }
    };
}

export function createLiveCalendarSummaryFixtureDataSource(
    windowHost: Window = window
): LiveCalendarSummaryDataSource {
    let stopped = false;
    return {
        clear() {
            // The fixture keeps its synthetic context so route cleanup can be verified by the view runtime.
        },
        getSnapshot(): LiveCalendarSummarySnapshot {
            if (stopped) {
                return {
                    adjustmentEvents: [],
                    calendarGroups: [],
                    contextKey: null,
                    latestChanges: [],
                    rankStatus: "idle",
                    rankStatusError: null,
                    reviewContext: null
                };
            }
            const stayDates = Array.from(windowHost.document.querySelectorAll<HTMLElement>(
                '[data-testid^="calendar-date-"]'
            )).map((element) => (
                element.getAttribute("data-testid")?.replace(/^calendar-date-/u, "").replaceAll("-", "") ?? ""
            )).filter((stayDate) => /^\d{8}$/u.test(stayDate)).sort();
            const scenario = parseFixtureScenario(windowHost.location.search);
            const records = scenario === "missing" || scenario === "error"
                ? []
                : buildFixtureBookingRecords(stayDates, scenario);
            const adjustmentEvents = buildFixtureAdjustmentEvents(stayDates);
            return {
                adjustmentEvents,
                calendarGroups: buildLiveCalendarGroupEvidence({
                    asOfDate: FIXTURE_AS_OF_DATE,
                    bookingRawRecords: records,
                    bookingReadStatus: { status: "ready", records },
                    facilityId: FIXTURE_FACILITY_ID,
                    visibleStayDates: stayDates
                }),
                contextKey: `fixture-calendar:${scenario}:${stayDates.join(",")}`,
                latestChanges: stayDates
                    .filter((_, index) => index % 4 === 0)
                    .map((stayDate, index) => ({ daysAgo: index, stayDate })),
                rankStatus: "ready",
                rankStatusError: null,
                reviewContext: {
                    asOfDate: FIXTURE_AS_OF_DATE,
                    facilityId: FIXTURE_FACILITY_ID,
                    rooms: ROOM_GROUPS.map((room, order) => ({
                        order,
                        roomGroupId: room.id,
                        roomGroupName: room.name
                    })),
                    visibleStayDates: stayDates
                }
            };
        },
        setContext() {
            // Production context resolution is owned by the acquisition runtime; this fixture is static.
        },
        stop() {
            stopped = true;
        },
        subscribe(listener) {
            listener();
            return () => undefined;
        }
    };
}

export function createAdjustmentReviewFixtureDataSource(
    calendarSummary: LiveCalendarSummaryDataSource
): AdjustmentReviewDataSource {
    let stopped = false;
    return {
        getSnapshot() {
            const calendar = calendarSummary.getSnapshot();
            if (stopped || calendar.contextKey === null || calendar.reviewContext === null) {
                return { status: "idle" } as const;
            }
            return {
                asOfDate: calendar.reviewContext.asOfDate,
                contextKey: calendar.contextKey,
                events: calendar.adjustmentEvents,
                records: buildFixtureAdjustmentRecords(calendar.adjustmentEvents),
                rooms: calendar.reviewContext.rooms,
                status: "ready"
            } as const;
        },
        stop() {
            stopped = true;
        },
        subscribe(listener) {
            listener();
            return () => undefined;
        }
    };
}

function buildFixtureAdjustmentEvents(
    stayDates: readonly string[]
): AdjustmentReviewEvent[] {
    return stayDates
        .filter((stayDate) => stayDate > FIXTURE_AS_OF_DATE)
        .filter((_, index) => index % 5 === 0)
        .slice(0, 12)
        .flatMap((stayDate) => ROOM_GROUPS.map((room, roomIndex) => {
            const reflectedDate = roomIndex === 0 ? "20260715" : "20260720";
            const reflectedAt = roomIndex === 0
                ? "2026-07-15T03:00:00.000Z"
                : "2026-07-20T03:00:00.000Z";
            const beforeRankName = roomIndex === 0 ? "8" : "6";
            const afterRankName = roomIndex === 0 ? "7" : "7";
            const daysBeforeStay = Math.round((
                Date.UTC(
                    Number(stayDate.slice(0, 4)),
                    Number(stayDate.slice(4, 6)) - 1,
                    Number(stayDate.slice(6, 8))
                ) - Date.UTC(
                    Number(reflectedDate.slice(0, 4)),
                    Number(reflectedDate.slice(4, 6)) - 1,
                    Number(reflectedDate.slice(6, 8))
                )
            ) / 86_400_000);
            return {
                actorName: roomIndex === 0 ? "担当A（mock）" : "担当B（mock）",
                afterRankName,
                beforeRankName,
                daysBeforeStay,
                direction: roomIndex === 0 ? "raise" as const : "lower" as const,
                directionSource: roomIndex === 0
                    ? "settings_screen" as const
                    : "numeric_rank_name" as const,
                eventKey: buildAdjustmentReviewEventKey({
                    afterRankName,
                    beforeRankName,
                    reflectedAt,
                    roomGroupId: room.id,
                    stayDate
                }),
                reflectedAt,
                reflectedDate,
                roomGroupId: room.id,
                stayDate
            };
        }));
}

function buildFixtureAdjustmentRecords(
    events: readonly AdjustmentReviewEvent[]
): NextBookingCurveSourceRecord[] {
    const records = new Map<string, NextBookingCurveSourceRecord>();
    for (const event of events) {
        const sourceKey = `fixture-adjustment:${event.stayDate}:${event.roomGroupId}`;
        if (records.has(sourceKey)) {
            continue;
        }
        const ready = event.roomGroupId === ROOM_GROUPS[0].id;
        const response = {
            stay_date: event.stayDate,
            booking_curve: ready
                ? [
                    { date: "20260708", transient: { this_year_room_sum: 4 } },
                    { date: "20260712", transient: { this_year_room_sum: 5 } },
                    { date: "20260715", transient: { this_year_room_sum: 7 } },
                    { date: "20260718", transient: { this_year_room_sum: 8 } },
                    { date: "20260722", transient: { this_year_room_sum: 11 } }
                ]
                : []
        };
        records.set(sourceKey, {
            asOfDate: FIXTURE_AS_OF_DATE,
            cacheKey: sourceKey,
            endpoint: BOOKING_CURVE_ENDPOINT,
            facilityId: FIXTURE_FACILITY_ID,
            fetchedAt: "2026-07-22T05:00:00.000Z",
            firstObservedAsOfDate: "20260708",
            landing: null,
            query: `date=${event.stayDate}&rm_room_group_id=${event.roomGroupId}`,
            recordKey: `${sourceKey}:20260722`,
            response,
            roomGroupId: event.roomGroupId,
            schemaVersion: BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
            scope: "roomGroup",
            source: "next-bounded-booking-curve",
            sourceKey,
            stayDate: event.stayDate
        });
    }
    return Array.from(records.values());
}

function buildFixtureResult(
    visibleStayDates: readonly string[],
    scenario: Exclude<FixtureScenario, "error">,
    facilityLabel: string
): LiveSimilarityLensDataLoadResult {
    const stayDates = Array.from(new Set(visibleStayDates
        .map((stayDate) => stayDate.replace(/-/gu, ""))
        .filter((stayDate) => /^\d{8}$/u.test(stayDate))))
        .sort();
    const currentSettings = buildFixtureCurrentSettings(stayDates, scenario);
    const records = scenario === "missing" ? [] : buildFixtureBookingRecords(stayDates, scenario);
    const bookingReadStatus = scenario === "missing"
        ? { status: "missing" as const, reason: "database-missing" as const }
        : { status: "ready" as const, records };
    const competitorRecords = scenario === "missing" ? [] : buildFixtureCompetitorRecords(stayDates);
    const competitorReadStatus = scenario === "missing"
        ? { status: "missing" as const, reason: "database-missing" as const }
        : { status: "ready" as const, records: competitorRecords };
    const contextKey = `fixture:${scenario}:${stayDates.join(",")}`;

    return {
        status: "ready",
        contextKey,
        facilityLabel,
        evidence: buildLiveSimilarityLensEvidence({
            facilityId: FIXTURE_FACILITY_ID,
            asOfDate: FIXTURE_AS_OF_DATE,
            visibleStayDates: stayDates,
            currentSettings,
            bookingRawRecords: records,
            bookingReadStatus,
            competitorRecords,
            competitorReadStatus
        })
    };
}

function buildFixtureCurrentSettings(
    stayDates: readonly string[],
    scenario: Exclude<FixtureScenario, "error">
): RankRecommendationCurrentSettingsResponse {
    return {
        suggest_output_current_settings: stayDates.map((stayDate) => ({
            stay_date: stayDate,
            rm_room_groups: ROOM_GROUPS.map((roomGroup, index) => {
                const occupied = scenario === "zero"
                    ? 0
                    : 5 + ((Number(stayDate.slice(-2)) + index * 4) % Math.max(6, roomGroup.capacity - 5));
                return {
                    rm_room_group_id: roomGroup.id,
                    rm_room_group_name: roomGroup.name,
                    max_num_room: roomGroup.capacity,
                    remaining_num_room: roomGroup.capacity - occupied
                };
            })
        }))
    };
}

function buildFixtureBookingRecords(
    stayDates: readonly string[],
    scenario: Exclude<FixtureScenario, "missing" | "error">
): BookingCurveRawSourceRecord[] {
    return stayDates.flatMap((stayDate) => {
        const day = Number(stayDate.slice(-2));
        const weekday = new Date(Date.UTC(
            Number(stayDate.slice(0, 4)),
            Number(stayDate.slice(4, 6)) - 1,
            day
        )).getUTCDay();
        const asOfDate = scenario === "historical-prefix"
            ? "20260707"
            : scenario === "tail-pending"
                ? "20260721"
                : FIXTURE_AS_OF_DATE;
        const buildCurve = (transientPattern: number, groupPattern: number) => (
            [120, 90, 75, 60, 45, 30, 21, 14, 7, 0].flatMap((leadDays, pointIndex) => {
                const observedDate = shiftCompactDate(stayDate, -leadDays);
                if (observedDate === null) {
                    return [];
                }
                const progress = pointIndex / 9;
                return [{
                    date: observedDate,
                    transient: {
                        this_year_room_sum: scenario === "zero"
                            ? 0
                            : Math.round(transientPattern * progress)
                    },
                    ...(scenario === "partial" ? {} : {
                        group: {
                            this_year_room_sum: scenario === "zero"
                                ? 0
                                : Math.round(groupPattern * progress)
                        }
                    })
                }];
            })
        );
        const fetchedAt = `${asOfDate.slice(0, 4)}-${asOfDate.slice(4, 6)}-${asOfDate.slice(6, 8)}T05:00:00.000Z`;
        const hotelGroupPattern = (day + weekday) % 7;
        const hotelRecord: BookingCurveRawSourceRecord = {
            cacheKey: `fixture:${scenario}:${stayDate}:hotel:${asOfDate}`,
            facilityId: FIXTURE_FACILITY_ID,
            stayDate,
            asOfDate,
            scope: "hotel",
            roomGroupId: null,
            endpoint: BOOKING_CURVE_ENDPOINT,
            query: `date=${stayDate}`,
            fetchedAt,
            schemaVersion: BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
            response: {
                stay_date: stayDate,
                max_room_count: ROOM_GROUPS.reduce((sum, roomGroup) => sum + roomGroup.capacity, 0),
                booking_curve: buildCurve(10 + weekday, hotelGroupPattern)
            }
        };
        const roomGroupRecords = ROOM_GROUPS.map((roomGroup, roomGroupIndex): BookingCurveRawSourceRecord => {
            const query = `date=${stayDate}&rm_room_group_id=${roomGroup.id}`;
            return {
                cacheKey: `fixture:${scenario}:${stayDate}:${roomGroup.id}:${asOfDate}`,
                facilityId: FIXTURE_FACILITY_ID,
                stayDate,
                asOfDate,
                scope: "roomGroup",
                roomGroupId: roomGroup.id,
                endpoint: BOOKING_CURVE_ENDPOINT,
                query,
                fetchedAt,
                schemaVersion: BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
                response: {
                    stay_date: stayDate,
                    max_room_count: roomGroup.capacity,
                    booking_curve: buildCurve(4 + weekday + roomGroupIndex * 2, (day + weekday) % 4)
                }
            };
        });
        return [hotelRecord, ...roomGroupRecords];
    });
}

function buildFixtureCompetitorRecords(stayDates: readonly string[]): CompetitorPriceSnapshotRecord[] {
    return stayDates.filter((_, index) => index % 7 === 0).map((stayDate) => ({
        snapshotKey: `fixture-competitor:${stayDate}`,
        facilityId: FIXTURE_FACILITY_ID,
        stayDate,
        conditionSignature: `fixture:${stayDate}`,
        searchConditionRaw: {
            stayDate,
            minNumGuests: 1,
            maxNumGuests: 2,
            competitorYadNos: ["fixture-competitor"],
            jalanRoomTypes: null,
            mealTypes: null,
            planNameWords: null,
            planNameContains: null
        },
        fetchedAt: "2026-07-22T05:00:00.000Z",
        source: "analyze-open",
        endpoint: COMPETITOR_PRICE_ENDPOINT,
        query: `date=${stayDate}`,
        schemaVersion: COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
        competitorSet: [{ yadNo: "fixture-competitor", name: "比較ホテル" }],
        payload: {
            own: null,
            competitors: []
        }
    }));
}

function parseFixtureScenario(search: string): FixtureScenario {
    const value = new URLSearchParams(search).get("scenario");
    return value === "zero"
        || value === "partial"
        || value === "tail-pending"
        || value === "historical-prefix"
        || value === "missing"
        || value === "error"
        ? value
        : "ready";
}

function shiftCompactDate(value: string, offsetDays: number): string | null {
    const date = new Date(Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8))
    ));
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("");
}
