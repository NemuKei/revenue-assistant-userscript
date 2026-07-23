import type { CompetitorPriceSnapshotRecord } from "../../competitorPriceSnapshotContract";
import type {
    CompetitorHistoryDataLoadResult,
    CompetitorHistoryDataSource
} from "../analyze/competitorHistoryDataSource";
import { startCompetitorHistoryRuntime } from "../analyze/competitorHistoryRuntime";

const FACILITY_ID = "yad:fixture";
const FACILITY_LABEL = "施設A（mock）";
const STAY_DATE = "20260812";
const fixtureMode = new URLSearchParams(window.location.search).get("state") ?? "ready";
const records = buildFixtureRecords(fixtureMode === "sparse" ? 1 : 8);

const dataSource: CompetitorHistoryDataSource = {
    cancel() {},
    async load(stayDate): Promise<CompetitorHistoryDataLoadResult> {
        if (fixtureMode === "error") {
            return { status: "error", contextKey: stayDate, reason: "read-failed" };
        }
        if (fixtureMode === "missing") {
            return {
                status: "missing",
                contextKey: `${FACILITY_ID}|${stayDate}`,
                facilityId: FACILITY_ID,
                facilityLabel: FACILITY_LABEL,
                reason: "database-missing"
            };
        }
        return {
            status: "ready",
            contextKey: `${FACILITY_ID}|${stayDate}`,
            facilityId: FACILITY_ID,
            facilityLabel: FACILITY_LABEL,
            records: fixtureMode === "empty" ? [] : records
        };
    },
    stop() {}
};

startCompetitorHistoryRuntime(document, window, {
    dataSource,
    resolveStayDate: (location) => location.pathname.includes("/dev/fixtures/next-analyze-competitor/")
        ? STAY_DATE
        : null
});

function buildFixtureRecords(dayCount: number): CompetitorPriceSnapshotRecord[] {
    const output: CompetitorPriceSnapshotRecord[] = [];
    for (let day = 0; day < dayCount; day += 1) {
        output.push(createRecord(day, null, "condition-unspecified"));
        if (day >= Math.max(0, dayCount - 4)) {
            output.push(createRecord(day, "TWIN", "condition-twin"));
        }
    }
    output.push({
        ...createRecord(Math.max(0, dayCount - 2), null, "condition-legacy"),
        fetchedAt: "2026-07-15T01:30:00.000Z",
        snapshotKey: "fixture:legacy-condition"
    });
    return output;
}

function createRecord(
    day: number,
    requestRoomType: string | null,
    conditionSignature: string
): CompetitorPriceSnapshotRecord {
    const observedDay = String(14 + day).padStart(2, "0");
    const fetchedAt = `2026-07-${observedDay}T01:30:00.000Z`;
    const roomTypes = requestRoomType === null ? ["SINGLE", "TWIN"] : [requestRoomType];
    const competitorSet = [
        { yadNo: "competitor-a", name: "競合A（mock）" },
        { yadNo: "competitor-b", name: "競合B（mock）" },
        { yadNo: "competitor-c", name: "競合C（mock）" }
    ];
    return {
        snapshotKey: `fixture:${conditionSignature}:${fetchedAt}`,
        facilityId: FACILITY_ID,
        stayDate: STAY_DATE,
        conditionSignature,
        searchConditionRaw: {
            stayDate: STAY_DATE,
            minNumGuests: 1,
            maxNumGuests: 4,
            competitorYadNos: competitorSet.map((item) => item.yadNo),
            jalanRoomTypes: requestRoomType === null ? [] : [requestRoomType],
            mealTypes: null,
            planNameWords: null,
            planNameContains: null
        },
        fetchedAt,
        source: "competitor-tab",
        endpoint: "/api/v5/competitor_prices",
        query: "fixture=true",
        schemaVersion: "competitor_price_snapshot:v1",
        competitorSet,
        payload: {
            own: {
                yadNo: "own-fixture",
                plans: buildPlans("own-fixture", day, 0, roomTypes)
            },
            competitors: competitorSet.map((competitor, index) => ({
                yadNo: competitor.yadNo,
                plans: buildPlans(competitor.yadNo, day, index + 1, roomTypes)
            }))
        }
    };
}

function buildPlans(
    yadNo: string,
    day: number,
    facilityIndex: number,
    roomTypes: readonly string[]
) {
    return roomTypes.flatMap((roomType, roomIndex) => [1, 2, 3, 4].flatMap((guestCount) => (
        ["NONE", "BREAKFAST"].map((mealType, mealIndex) => ({
            yadNo,
            numGuests: guestCount,
            mealType,
            planName: `合成プラン ${guestCount}`,
            jalanFacilityRoomType: roomType,
            url: null,
            price: 8_000
                + guestCount * 2_400
                + facilityIndex * 700
                + roomIndex * 500
                + mealIndex * 1_000
                + day * (facilityIndex % 2 === 0 ? 240 : -120),
            priceDiff: null
        }))
    )));
}
