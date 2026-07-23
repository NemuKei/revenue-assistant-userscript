import {
    startPriceTrendComparisonRuntime
} from "../analyze/priceTrendComparisonRuntime";
import type {
    PriceTrendComparisonDataLoadResult,
    PriceTrendComparisonDataSource
} from "../analyze/priceTrendComparisonDataSource";

const params = new URLSearchParams(window.location.search);
const fixtureState = params.get("state") ?? "ready";
const fixtureDataSource = createFixtureDataSource(fixtureState);

startPriceTrendComparisonRuntime(document, window, {
    dataSource: fixtureDataSource,
    resolveStayDate: (location) => location.pathname === "/away" ? null : "20260812",
    writer: null
});

function createFixtureDataSource(state: string): PriceTrendComparisonDataSource {
    let stopped = false;
    return {
        cancel() {
            // The fixture has no in-flight browser work.
        },
        async load(stayDate): Promise<PriceTrendComparisonDataLoadResult> {
            if (stopped) {
                return { status: "error", contextKey: "stopped", reason: "aborted" };
            }
            if (state === "error") {
                return { status: "error", contextKey: stayDate, reason: "read-failed" };
            }
            if (state === "empty") {
                return {
                    status: "missing",
                    contextKey: `yad:fixture|${stayDate}`,
                    facilityId: "yad:fixture",
                    facilityLabel: "施設A（mock）",
                    reason: "database-missing"
                };
            }
            return {
                status: "ready",
                contextKey: `yad:fixture|${stayDate}`,
                facilityId: "yad:fixture",
                facilityLabel: "施設A（mock）",
                records: createFixtureRecords(stayDate)
            };
        },
        reset() {
            // The fixture has no persisted context.
        },
        stop() {
            stopped = true;
        }
    };
}

function createFixtureRecords(stayDate: string): unknown[] {
    const facilities = [
        { yadNo: "own", name: "施設A（mock）", role: "own" },
        { yadNo: "competitor-a", name: "競合A（mock）", role: "competitor" },
        { yadNo: "competitor-b", name: "競合B（mock）", role: "competitor" },
        { yadNo: "competitor-c", name: "競合C（mock）", role: "competitor" }
    ];
    const records: unknown[] = [];
    for (const guestCount of [1, 2, 3, 4]) {
        for (const mealType of ["NONE", "BREAKFAST"]) {
            records.push(createFixtureRecord({
                facilities,
                guestCount,
                mealType,
                roomType: null,
                stayDate
            }));
        }
        records.push(createFixtureRecord({
            facilities,
            guestCount,
            mealType: "NONE",
            roomType: "TWIN",
            stayDate
        }));
    }
    records.push({ invalid: true });
    return records;
}

function createFixtureRecord(options: {
    facilities: Array<{ name: string; role: string; yadNo: string }>;
    guestCount: number;
    mealType: string;
    roomType: string | null;
    stayDate: string;
}): unknown {
    const roomOffset = options.roomType === "TWIN" ? 900 : 0;
    const mealOffset = options.mealType === "BREAKFAST" ? 1_200 : 0;
    const guestOffset = (options.guestCount - 1) * 4_200;
    const leadTimes = [90, 60, 30, 14, 7, 1];
    return {
        endpoint: "/api/v1/price_trends",
        facilities: options.facilities,
        facilityId: "yad:fixture",
        fetchedAt: "2026-07-23T01:20:00.000Z",
        mealType: options.mealType,
        numGuests: options.guestCount,
        payload: {
            latestSourceUpdatedAt: "2026-07-23T00:50:00.000Z",
            stayDate: options.stayDate,
            yads: options.facilities.map((facility, facilityIndex) => ({
                points: leadTimes.map((leadTime, pointIndex) => {
                    const ownAdjustment = facility.role === "own" ? 1_000 : 0;
                    const competitorAdjustment = facility.role === "own"
                        ? 0
                        : facilityIndex * 650;
                    const lateAdjustment = pointIndex >= 4
                        ? (options.guestCount % 2 === 0 ? 1_100 : -500)
                        : pointIndex * 250;
                    return {
                        date: `2026-0${5 + Math.min(pointIndex, 4)}-${String(10 + pointIndex).padStart(2, "0")}`,
                        leadTimeDays: leadTime,
                        priceIncludingTax: 8_500
                            + guestOffset
                            + mealOffset
                            + roomOffset
                            + ownAdjustment
                            + competitorAdjustment
                            + lateAdjustment,
                        status: "available"
                    };
                }),
                yadNo: facility.yadNo
            }))
        },
        query: `fixture:${options.guestCount}:${options.mealType}:${options.roomType ?? "any"}`,
        recordKey: [
            "fixture",
            options.stayDate,
            options.guestCount,
            options.mealType,
            options.roomType ?? "any"
        ].join("|"),
        roomType: options.roomType,
        roomTypeLabel: options.roomType === "TWIN" ? "ツイン" : null,
        schemaVersion: "price_trend:v1",
        scope: {
            mealType: options.mealType,
            numGuests: options.guestCount,
            roomType: options.roomType,
            roomTypeLabel: options.roomType === "TWIN" ? "ツイン" : null,
            source: "price-trends-tab",
            stayDate: options.stayDate,
            yadNos: options.facilities.map((facility) => facility.yadNo)
        },
        stayDate: options.stayDate
    };
}
