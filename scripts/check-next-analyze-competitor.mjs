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
const writerModule = await importBundledTypeScript(
    "../src/next/analyze/competitorHistoryWriter.ts",
    import.meta.url
);
const view = await importBundledTypeScript(
    "../src/next/analyze/competitorHistoryView.ts",
    import.meta.url
);
const [entrySource, fixture, fixtureEntry, storeSource] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-competitor/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeCompetitorFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/competitorHistorySnapshotStore.ts", import.meta.url), "utf8")
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
assert.equal(seriesReads.length, 2);
assert.deepEqual(seriesReads[0].key, ["yad:fixture", "20260812"]);
assert.equal(seriesReads[0].indexName, "facility-stay-date");
assert.deepEqual(
    seriesReads.map((item) => item.databaseName).sort(),
    [
        "revenue-assistant-competitor-price-snapshots",
        "revenue-assistant-next-competitor-price-snapshots"
    ]
);
assert.equal(
    loaded.records.filter((record) => typeof record?.snapshotKey === "string").length,
    records.filter((record) => typeof record?.snapshotKey === "string").length,
    "Classic and Next duplicate snapshot keys must merge once"
);
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
assert.equal(view.formatCompetitorHistoryCaptureStatus("checking"), "本日分を確認中");
assert.equal(view.formatCompetitorHistoryCaptureStatus("stored"), "本日分を保存");
assert.equal(view.formatCompetitorHistoryCaptureStatus("already-stored"), "本日分は保存済み");
assert.match(entrySource, /startCompetitorHistoryRuntime\(document, window\)/u);
assert.match(fixture, /competitor-price-tax-included-text/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /resolveStayDate/u);
assert.match(fixtureEntry, /state=|fixtureMode/u);
assert.match(fixtureEntry, /writer: null/u);
assert.match(storeSource, /NEXT_COMPETITOR_HISTORY_RETENTION_LIMIT = 120/u);
assert.match(storeSource, /store\.add\(record\)/u);
assert.match(storeSource, /store\.delete\(snapshotKey\)/u);
assert.doesNotMatch(storeSource, /deleteDatabase|\.clear\(|\.put\(/u);

const fixedNow = new Date("2026-07-23T01:02:03.000Z");
const writerRequests = [];
const storedByKey = new Map();
const storedWrites = [];
const writer = writerModule.createCompetitorHistoryWriter({
    lockRunner: async (_name, _signal, run) => run(),
    now: () => fixedNow,
    store: {
        async addAndPrune(record) {
            if (storedByKey.has(record.snapshotKey)) {
                return { status: "already-stored", deletedCount: 0 };
            }
            storedByKey.set(record.snapshotKey, record);
            storedWrites.push(record);
            return { status: "stored", deletedCount: 0 };
        },
        async readBySnapshotKey(snapshotKey) {
            return storedByKey.get(snapshotKey) ?? null;
        }
    },
    transport: {
        async read(request) {
            writerRequests.push(request);
            if (request.kind === "competitors") {
                return [{ yad_no: "competitor-a", name: "競合A（mock）" }];
            }
            if (request.kind === "competitor-prices") {
                return {
                    own: {
                        yad_no: "own",
                        plans: [{
                            jalan_facility_room_type: "TWIN",
                            meal_type: "BREAKFAST",
                            num_guests: 2,
                            plan_name: "保存しないプラン名",
                            price: 12_300,
                            price_diff: 500,
                            url: "https://example.invalid/private"
                        }]
                    },
                    competitors: [{
                        yad_no: "competitor-a",
                        plans: [{
                            jalan_facility_room_type: "TWIN",
                            meal_type: "BREAKFAST",
                            num_guests: 2,
                            price: 12_800
                        }]
                    }]
                };
            }
            throw new Error(`unexpected writer request: ${request.kind}`);
        }
    },
    windowHost: {
        indexedDB: {},
        location: { origin: "https://ra.jalan.net" },
        navigator: {}
    }
});
const capture = await writer.capture({
    existingRecords: [],
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(capture.status, "stored");
assert.deepEqual(writerRequests.map((request) => request.kind), ["competitors", "competitor-prices"]);
assert.equal(storedWrites.length, 1);
assert.equal(storedWrites[0].source, "next-competitor-tab");
assert.equal(storedWrites[0].fetchedAt, fixedNow.toISOString());
assert.equal(storedWrites[0].searchConditionRaw.jalanRoomTypes, null);
assert.equal(storedWrites[0].payload.own.plans[0].planName, null);
assert.equal(storedWrites[0].payload.own.plans[0].url, null);
assert.equal(storedWrites[0].payload.own.plans[0].priceDiff, null);
assert.match(storedWrites[0].query, /date=20260812/u);
assert.match(storedWrites[0].query, /yad_nos%5B%5D=competitor-a/u);
const repeatedCapture = await writer.capture({
    existingRecords: [],
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(repeatedCapture.status, "skipped");
assert.equal(repeatedCapture.reason, "already-stored");
assert.equal(writerRequests.length, 2, "same JST day must not issue another request");
writer.stop();

const sameDayWriterRequests = [];
const sameDayWriter = writerModule.createCompetitorHistoryWriter({
    lockRunner: async (_name, _signal, run) => run(),
    now: () => fixedNow,
    store: {
        async addAndPrune() { throw new Error("same-day record must skip storage write"); },
        async readBySnapshotKey() { throw new Error("same-day record must skip storage open"); }
    },
    transport: {
        async read(request) {
            sameDayWriterRequests.push(request);
            throw new Error("same-day record must skip network");
        }
    },
    windowHost: { indexedDB: {}, location: { origin: "https://ra.jalan.net" }, navigator: {} }
});
const sameDayResult = await sameDayWriter.capture({
    existingRecords: [createRecord({
        fetchedAt: "2026-07-23T00:30:00.000Z",
        key: "same-day",
        maxNumGuests: 6,
        priceOffset: 0
    })],
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(sameDayResult.status, "skipped");
assert.equal(sameDayResult.reason, "already-stored");
assert.equal(sameDayWriterRequests.length, 0);
sameDayWriter.stop();

const corruptRecordWriterRequests = [];
const corruptRecordWriter = writerModule.createCompetitorHistoryWriter({
    lockRunner: async (_name, _signal, run) => run(),
    now: () => fixedNow,
    store: {
        async addAndPrune() { throw new Error("corrupt exact record must not be overwritten"); },
        async readBySnapshotKey() { return { snapshotKey: "corrupt" }; }
    },
    transport: {
        async read(request) {
            corruptRecordWriterRequests.push(request);
            throw new Error("corrupt exact record must stop before network");
        }
    },
    windowHost: { indexedDB: {}, location: { origin: "https://ra.jalan.net" }, navigator: {} }
});
const corruptRecordResult = await corruptRecordWriter.capture({
    existingRecords: [],
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(corruptRecordResult.status, "error");
assert.equal(corruptRecordResult.reason, "storage-failed");
assert.equal(corruptRecordWriterRequests.length, 0);
corruptRecordWriter.stop();

console.log("Next Analyze competitor history checks passed");

function createRecord({
    conditionSignature = "condition-main",
    fetchedAt,
    key,
    maxNumGuests = 4,
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
            maxNumGuests,
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
