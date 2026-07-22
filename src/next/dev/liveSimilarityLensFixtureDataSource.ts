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
import { buildLiveSimilarityLensEvidence } from "../live/liveSimilarityLensEvidence";
import type {
    LiveSimilarityLensDataLoadResult,
    LiveSimilarityLensDataSource
} from "../live/liveSimilarityLensDataSource";

type FixtureScenario = "ready" | "zero" | "partial" | "stale" | "missing" | "error";

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
        const asOfDate = scenario === "stale" ? "20260721" : FIXTURE_AS_OF_DATE;
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
    return value === "zero" || value === "partial" || value === "stale" || value === "missing" || value === "error"
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
