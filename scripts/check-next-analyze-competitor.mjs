import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const model = await importBundledTypeScript(
    "../src/next/analyze/competitorHistoryModel.ts",
    import.meta.url
);
const dataSourceModule = await importBundledTypeScript(
    "../src/next/analyze/competitorHistoryDataSource.ts",
    import.meta.url
);
const runtime = await importBundledTypeScript(
    "../src/next/analyze/competitorHistoryRuntime.ts",
    import.meta.url
);
const view = await importBundledTypeScript(
    "../src/next/analyze/competitorHistoryView.ts",
    import.meta.url
);
const [entrySource, fixture, fixtureEntry] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-competitor/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeCompetitorFixtureEntry.ts", import.meta.url), "utf8")
]);

assert.equal(runtime.parseCompetitorHistoryAnalyzeStayDate("/analyze/2026-08-12"), "20260812");
assert.equal(runtime.parseCompetitorHistoryAnalyzeStayDate("/analyze/2026-02-29"), null);
assert.equal(runtime.parseCompetitorHistoryAnalyzeStayDate("/"), null);

const records = [
    createRecord({ fetchedAt: "2026-07-20T00:30:00.000Z", key: "a-early", priceOffset: 0 }),
    createRecord({ fetchedAt: "2026-07-20T08:30:00.000Z", key: "a-late", priceOffset: 300 }),
    createRecord({ fetchedAt: "2026-07-21T00:30:00.000Z", key: "a-next", priceOffset: 600 }),
    createRecord({
        conditionSignature: "condition-twin",
        fetchedAt: "2026-07-21T01:30:00.000Z",
        key: "twin",
        priceOffset: 900,
        requestRoomTypes: ["TWIN"]
    }),
    createRecord({
        conditionSignature: "condition-old",
        fetchedAt: "2026-07-19T01:30:00.000Z",
        key: "old-condition",
        priceOffset: -200
    }),
    { invalid: true }
];

const unfiltered = model.buildCompetitorHistoryViewModel({
    facilityId: "yad:fixture",
    records,
    stayDate: "20260812"
});
assert.equal(unfiltered.status, "ready");
assert.equal(unfiltered.viewModel.selectedConditionRecordCount, 3);
assert.equal(unfiltered.viewModel.excludedConditionRecordCount, 2);
assert.deepEqual(unfiltered.viewModel.observationDates, ["2026-07-20", "2026-07-21"]);
assert.equal(unfiltered.viewModel.panels.length, 4);
assert.equal(unfiltered.viewModel.panels[1].guestCount, 2);
assert.equal(unfiltered.viewModel.panels[1].latestValues[0].price, 12_600);
assert.equal(unfiltered.viewModel.panels[1].latestValues[0].deltaFromPrevious, 300);
assert.equal(unfiltered.viewModel.availableFilters.roomTypes.some((item) => item.value === "TWIN"), true);
assert.equal(unfiltered.viewModel.availableFilters.mealTypes.some((item) => item.value === "BREAKFAST"), true);

const twin = model.buildCompetitorHistoryViewModel({
    facilityId: "yad:fixture",
    filters: { roomType: "TWIN" },
    records,
    stayDate: "2026-08-12"
});
assert.equal(twin.status, "ready");
assert.equal(twin.viewModel.selectedConditionRecordCount, 1);
assert.equal(twin.viewModel.filters.roomType, "TWIN");
assert.equal(twin.viewModel.panels[0].points.every((point) => point.roomTypeLabel === "ツイン"), true);

const breakfast = model.buildCompetitorHistoryViewModel({
    facilityId: "yad:fixture",
    filters: { mealType: "BREAKFAST" },
    records,
    stayDate: "20260812"
});
assert.equal(breakfast.status, "ready");
assert.equal(breakfast.viewModel.filters.mealType, "BREAKFAST");
assert.equal(
    breakfast.viewModel.panels[0].latestValues[0].price,
    unfiltered.viewModel.panels[0].latestValues[0].price + 1_000
);
assert.deepEqual(
    model.buildCompetitorHistoryViewModel({ facilityId: "yad:fixture", records: [], stayDate: "20260812" }),
    { status: "empty", reason: "no-records" }
);

const transportRequests = [];
const seriesReads = [];
const dataSource = dataSourceModule.createCompetitorHistoryDataSource({
    seriesReader: async (options) => {
        seriesReads.push(options);
        return { status: "ready", records };
    },
    transport: {
        async read(request) {
            transportRequests.push(request);
            return { yad_no: "fixture", name: "施設A（mock）" };
        }
    },
    windowHost: {}
});
const loaded = await dataSource.load("2026-08-12");
assert.equal(loaded.status, "ready");
assert.deepEqual(transportRequests, [{ kind: "facility" }]);
assert.equal(seriesReads.length, 1);
assert.deepEqual(seriesReads[0].key, ["yad:fixture", "20260812"]);
assert.equal(seriesReads[0].indexName, "facility-stay-date");
dataSource.stop();
assert.equal((await dataSource.load("20260812")).reason, "aborted");

const invalidFacilityDataSource = dataSourceModule.createCompetitorHistoryDataSource({
    seriesReader: async () => { throw new Error("invalid facility must not read IndexedDB"); },
    transport: { async read() { return { yad_no: "missing-name" }; } },
    windowHost: {}
});
assert.equal((await invalidFacilityDataSource.load("20260812")).reason, "facility-response-invalid");
invalidFacilityDataSource.stop();

const styles = view.getCompetitorHistoryStyles();
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(styles, /@media \(max-width: 680px\)/u);
assert.match(styles, /max-width: calc\(100vw - 16px\)/u);
assert.match(styles, /min-height: 44px/u);
assert.match(styles, /data-mobile-active="false"/u);
assert.match(entrySource, /startCompetitorHistoryRuntime\(document, window\)/u);
assert.match(fixture, /competitor-price-tax-included-text/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /resolveStayDate/u);
assert.match(fixtureEntry, /state=|fixtureMode/u);

console.log("Next Analyze competitor history checks passed");

function createRecord({
    conditionSignature = "condition-main",
    fetchedAt,
    key,
    priceOffset,
    requestRoomTypes = []
}) {
    const competitorSet = [{ yadNo: "competitor-a", name: "競合A（mock）" }];
    return {
        snapshotKey: key,
        facilityId: "yad:fixture",
        stayDate: "20260812",
        conditionSignature,
        searchConditionRaw: {
            stayDate: "20260812",
            minNumGuests: 1,
            maxNumGuests: 4,
            competitorYadNos: ["competitor-a"],
            jalanRoomTypes: requestRoomTypes,
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
            own: { yadNo: "own", plans: buildPlans("own", priceOffset, requestRoomTypes) },
            competitors: [{
                yadNo: "competitor-a",
                plans: buildPlans("competitor-a", priceOffset + 500, requestRoomTypes)
            }]
        }
    };
}

function buildPlans(yadNo, priceOffset, requestRoomTypes) {
    const roomTypes = requestRoomTypes.length === 0 ? ["SINGLE", "TWIN"] : requestRoomTypes;
    return roomTypes.flatMap((roomType, roomIndex) => [1, 2, 3, 4].flatMap((numGuests) => ([
        {
            yadNo,
            numGuests,
            mealType: "NONE",
            planName: "fixture",
            jalanFacilityRoomType: roomType,
            url: null,
            price: 7_500 + numGuests * 2_250 + roomIndex * 500 + priceOffset,
            priceDiff: null
        },
        {
            yadNo,
            numGuests,
            mealType: "BREAKFAST",
            planName: "fixture breakfast",
            jalanFacilityRoomType: roomType,
            url: null,
            price: 8_500 + numGuests * 2_250 + roomIndex * 500 + priceOffset,
            priceDiff: null
        }
    ])));
}
