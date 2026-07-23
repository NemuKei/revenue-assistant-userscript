import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const model = await importBundledTypeScript(
    "../src/next/analyze/priceTrendComparisonModel.ts",
    import.meta.url
);
const dataSourceModule = await importBundledTypeScript(
    "../src/next/analyze/priceTrendComparisonDataSource.ts",
    import.meta.url
);
const runtime = await importBundledTypeScript(
    "../src/next/analyze/priceTrendComparisonRuntime.ts",
    import.meta.url
);
const view = await importBundledTypeScript(
    "../src/next/analyze/priceTrendComparisonView.ts",
    import.meta.url
);
const writerModule = await importBundledTypeScript(
    "../src/next/analyze/priceTrendCaptureWriter.ts",
    import.meta.url
);
const storeModule = await importBundledTypeScript(
    "../src/next/analyze/priceTrendCaptureStore.ts",
    import.meta.url
);
const transportModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensTransport.ts",
    import.meta.url
);
const [
    entrySource,
    fixture,
    fixtureEntry,
    dataSourceSource,
    modelSource,
    runtimeSource,
    storeSource,
    writerSource
] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-price-trend/index.html", import.meta.url), "utf8"),
    readFile(
        new URL("../src/next/dev/analyzePriceTrendComparisonFixtureEntry.ts", import.meta.url),
        "utf8"
    ),
    readFile(new URL("../src/next/analyze/priceTrendComparisonDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/priceTrendComparisonModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/priceTrendComparisonRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/priceTrendCaptureStore.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/priceTrendCaptureWriter.ts", import.meta.url), "utf8")
]);

assert.equal(runtime.parsePriceTrendComparisonAnalyzeStayDate("/analyze/2026-08-12"), "20260812");
assert.equal(runtime.parsePriceTrendComparisonAnalyzeStayDate("/analyze/2026-02-29"), null);
assert.equal(runtime.parsePriceTrendComparisonAnalyzeStayDate("/"), null);

const records = [
    ...[1, 2, 3, 4].flatMap((guestCount) => [
        createRecord({ guestCount, key: `${guestCount}-none`, mealType: "NONE" }),
        createRecord({
            guestCount,
            key: `${guestCount}-breakfast`,
            mealType: "BREAKFAST",
            priceOffset: 1_000
        }),
        createRecord({
            guestCount,
            key: `${guestCount}-twin`,
            mealType: "NONE",
            priceOffset: 700,
            roomType: "TWIN"
        })
    ]),
    createRecord({
        fetchedAt: "2026-07-22T00:00:00.000Z",
        guestCount: 2,
        key: "older-two",
        mealType: "NONE",
        priceOffset: 9_000
    }),
    { invalid: true }
];

const defaultResult = model.buildPriceTrendComparisonViewModel({
    facilityId: "yad:fixture",
    records,
    selectedGuestCount: 2,
    stayDate: "20260812"
});
assert.equal(defaultResult.status, "ready");
assert.equal(defaultResult.viewModel.comparisons.length, 4);
assert.equal(defaultResult.viewModel.selectedGuestCount, 2);
assert.equal(defaultResult.viewModel.usesSpecificRoomTypeAggregation, false);
assert.equal(defaultResult.viewModel.selectedRecordCount, 8);
assert.equal(defaultResult.viewModel.comparisons[1].latestLeadTimeDays, 1);
assert.equal(defaultResult.viewModel.comparisons[1].ownPrice, 15_400);
assert.equal(defaultResult.viewModel.comparisons[1].competitorMinPrice, 14_900);
assert.equal(defaultResult.viewModel.comparisons[1].gapFromCompetitor, 500);
assert.equal(defaultResult.viewModel.availableFilters.roomTypes[0].label, "ツイン");

const twinResult = model.buildPriceTrendComparisonViewModel({
    facilityId: "yad:fixture",
    filters: { roomType: "TWIN" },
    records,
    selectedGuestCount: 4,
    stayDate: "2026-08-12"
});
assert.equal(twinResult.status, "ready");
assert.equal(twinResult.viewModel.filters.roomType, "TWIN");
assert.equal(twinResult.viewModel.selectedRecordCount, 4);
assert.equal(twinResult.viewModel.comparisons[1].ownPrice, 16_100);
assert.equal(
    twinResult.viewModel.comparisons[1].points.every((point) => point.roomTypeLabel === "ツイン"),
    true
);
assert.deepEqual(
    model.buildPriceTrendComparisonViewModel({
        facilityId: "yad:fixture",
        records: [],
        stayDate: "20260812"
    }),
    { status: "empty", reason: "no-records" }
);

const transportRequests = [];
const seriesReads = [];
const dataSource = dataSourceModule.createPriceTrendComparisonDataSource({
    seriesReader: async (options) => {
        seriesReads.push(options);
        return options.databaseName === "revenue-assistant-price-trends"
            ? { status: "ready", records }
            : { status: "missing", reason: "database-missing" };
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
assert.deepEqual(
    seriesReads.map((options) => options.databaseName).sort(),
    ["revenue-assistant-next-price-trends", "revenue-assistant-price-trends"]
);
assert.equal(seriesReads.every((options) => options.databaseVersion === 1), true);
assert.equal(seriesReads.every((options) => options.storeName === "price-trend-records"), true);
assert.equal(seriesReads.every((options) => options.indexName === "facility-stayDate"), true);
assert.equal(
    seriesReads.every((options) => (
        options.key[0] === "yad:fixture" && options.key[1] === "20260812"
    )),
    true
);
dataSource.stop();
assert.equal((await dataSource.load("20260812")).reason, "aborted");

const invalidFacilityDataSource = dataSourceModule.createPriceTrendComparisonDataSource({
    seriesReader: async () => {
        throw new Error("invalid facility must not read IndexedDB");
    },
    transport: {
        async read() {
            return { yad_no: "fixture" };
        }
    },
    windowHost: {}
});
assert.equal(
    (await invalidFacilityDataSource.load("20260812")).reason,
    "facility-response-invalid"
);
invalidFacilityDataSource.stop();

const captureNow = new Date("2026-07-23T01:00:00.000Z");
const completeSameDayRecords = createCompleteDefaultRecords({
    fetchedAt: captureNow.toISOString(),
    stayDate: "20260812"
});
const skipRequests = [];
const skipWriter = writerModule.createPriceTrendCaptureWriter({
    now: () => captureNow,
    transport: {
        async read(request) {
            skipRequests.push(request);
            throw new Error("complete same-day records must skip network");
        }
    },
    windowHost: {}
});
const skipResult = await skipWriter.capture({
    existingRecords: completeSameDayRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(skipResult.status, "skipped");
assert.equal(skipResult.reason, "already-stored");
assert.equal(skipResult.hasPriceData, true);
assert.equal(skipResult.records.length, 16);
assert.equal(skipRequests.length, 0);
skipWriter.stop();

const partialRecords = completeSameDayRecords.slice(0, -1);
const captureRequests = [];
const captureStoreWrites = [];
const captureStore = {
    async addAndPrune(recordsToStore, retentionWindow) {
        captureStoreWrites.push({ records: recordsToStore, retentionWindow });
        return {
            addedCount: recordsToStore.length,
            deletedCount: 0,
            records: recordsToStore
        };
    },
    async readByFacilityStayDate() {
        return [];
    }
};
const captureWriter = writerModule.createPriceTrendCaptureWriter({
    lockRunner: async (_lockName, _signal, run) => run(),
    now: () => captureNow,
    store: captureStore,
    transport: {
        async read(request) {
            captureRequests.push(request);
            if (request.kind === "competitors") {
                return [{ yad_no: "competitor-a", name: "競合A（mock）" }];
            }
            if (request.kind === "price-trends") {
                return createPriceTrendApiResponse(request);
            }
            throw new Error(`unexpected request kind: ${request.kind}`);
        }
    },
    windowHost: { indexedDB: {} }
});
const captureResult = await captureWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(captureResult.status, "stored");
assert.equal(captureResult.requestedCount, 1);
assert.equal(captureResult.addedCount, 1);
assert.equal(captureResult.hasPriceData, true);
assert.deepEqual(captureRequests.map((request) => request.kind), ["competitors", "price-trends"]);
assert.equal(captureStoreWrites.length, 1);
assert.equal(captureStoreWrites[0].records.length, 1);
assert.deepEqual(captureStoreWrites[0].retentionWindow, {
    minStayDate: "20260723",
    maxStayDate: "20261020"
});
const capturedRecord = captureStoreWrites[0].records[0];
assert.equal(capturedRecord.schemaVersion, "price_trend:v1");
assert.equal(capturedRecord.endpoint, "/api/v1/price_trends");
assert.equal(capturedRecord.query, null);
assert.equal(capturedRecord.roomType, null);
assert.equal(capturedRecord.scope.source, "next-price-trends-tab");
assert.equal(capturedRecord.payload.stayDate, "20260812");
assert.equal(capturedRecord.facilities.length, 2);
assert.equal(
    capturedRecord.recordKey,
    "next-price-trend|facility:yad:fixture|stayDate:20260812|guest:4"
    + "|meal:BREAKFAST_DINNER|room:unspecified|observedOn:2026-07-23"
);
const secondCapture = await captureWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(secondCapture.status, "skipped");
assert.equal(secondCapture.reason, "already-stored");
assert.equal(captureRequests.length, 2);
captureWriter.stop();

const priceTrendUrl = transportModule.buildNextReadUrl({
    kind: "price-trends",
    mealType: "BREAKFAST_DINNER",
    numGuests: 4,
    stayDate: "20260812",
    yadNos: ["fixture", "competitor-a"]
}, "https://ra.jalan.net");
assert.equal(priceTrendUrl.pathname, "/api/v1/price_trends");
assert.equal(priceTrendUrl.searchParams.get("stay_date"), "20260812");
assert.equal(priceTrendUrl.searchParams.get("num_guests"), "4");
assert.equal(priceTrendUrl.searchParams.get("meal_type"), "BREAKFAST_DINNER");
assert.deepEqual(priceTrendUrl.searchParams.getAll("yad_nos[]"), ["fixture", "competitor-a"]);
assert.equal(priceTrendUrl.searchParams.has("room_type_options[]"), false);

const outOfRangeWriter = writerModule.createPriceTrendCaptureWriter({
    now: () => captureNow,
    transport: {
        async read() {
            throw new Error("out-of-range capture must not use network");
        }
    },
    windowHost: {}
});
const outOfRange = await outOfRangeWriter.capture({
    existingRecords: [],
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20261021"
});
assert.equal(outOfRange.status, "skipped");
assert.equal(outOfRange.reason, "out-of-range");
outOfRangeWriter.stop();

let invalidStoreWriteCount = 0;
const invalidWriter = writerModule.createPriceTrendCaptureWriter({
    lockRunner: async (_lockName, _signal, run) => run(),
    now: () => captureNow,
    store: {
        async addAndPrune() {
            invalidStoreWriteCount += 1;
            return { addedCount: 0, deletedCount: 0, records: [] };
        },
        async readByFacilityStayDate() {
            return [];
        }
    },
    transport: {
        async read(request) {
            if (request.kind === "competitors") {
                return [];
            }
            return {
                ...createPriceTrendApiResponse(request),
                stay_date: "20260813"
            };
        }
    },
    windowHost: { indexedDB: {} }
});
const invalidResponse = await invalidWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(invalidResponse.status, "error");
assert.equal(invalidResponse.reason, "price-trends-response-invalid");
assert.equal(invalidStoreWriteCount, 0);
invalidWriter.stop();

const corruptCompleteRecords = structuredClone(completeSameDayRecords);
corruptCompleteRecords.at(-1).payload.stayDate = "20260813";
const corruptRecordRequests = [];
const corruptRecordWriter = writerModule.createPriceTrendCaptureWriter({
    lockRunner: async (_lockName, _signal, run) => run(),
    now: () => captureNow,
    store: {
        async addAndPrune(recordsToStore) {
            return {
                addedCount: recordsToStore.length,
                deletedCount: 0,
                records: recordsToStore
            };
        },
        async readByFacilityStayDate() {
            return [];
        }
    },
    transport: {
        async read(request) {
            corruptRecordRequests.push(request);
            return request.kind === "competitors"
                ? []
                : createPriceTrendApiResponse(request);
        }
    },
    windowHost: { indexedDB: {} }
});
const corruptRecordResult = await corruptRecordWriter.capture({
    existingRecords: corruptCompleteRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(corruptRecordResult.status, "stored");
assert.equal(corruptRecordResult.requestedCount, 1);
assert.deepEqual(
    corruptRecordRequests.map((request) => request.kind),
    ["competitors", "price-trends"]
);
corruptRecordWriter.stop();

let requestFailureStoreWriteCount = 0;
const requestFailureWriter = writerModule.createPriceTrendCaptureWriter({
    lockRunner: async (_lockName, _signal, run) => run(),
    now: () => captureNow,
    store: {
        async addAndPrune() {
            requestFailureStoreWriteCount += 1;
            return { addedCount: 0, deletedCount: 0, records: [] };
        },
        async readByFacilityStayDate() {
            return [];
        }
    },
    transport: {
        async read() {
            throw new Error("fixture request failure");
        }
    },
    windowHost: { indexedDB: {} }
});
const requestFailure = await requestFailureWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(requestFailure.status, "error");
assert.equal(requestFailure.reason, "request-failed");
assert.equal(requestFailureStoreWriteCount, 0);
requestFailureWriter.stop();

let abortRequestStartedResolve;
const abortRequestStarted = new Promise((resolve) => {
    abortRequestStartedResolve = resolve;
});
let abortObserved = false;
let abortStoreWriteCount = 0;
const abortWriter = writerModule.createPriceTrendCaptureWriter({
    lockRunner: async (_lockName, _signal, run) => run(),
    now: () => captureNow,
    store: {
        async addAndPrune() {
            abortStoreWriteCount += 1;
            return { addedCount: 0, deletedCount: 0, records: [] };
        },
        async readByFacilityStayDate() {
            return [];
        }
    },
    transport: {
        async read(request, signal) {
            if (request.kind === "competitors") {
                return [];
            }
            abortRequestStartedResolve();
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    abortObserved = true;
                    reject(new DOMException("fixture abort", "AbortError"));
                }, { once: true });
            });
        }
    },
    windowHost: { indexedDB: {} }
});
const abortCapture = abortWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
await abortRequestStarted;
abortWriter.cancel();
const abortedResult = await abortCapture;
assert.equal(abortedResult.status, "error");
assert.equal(abortedResult.reason, "aborted");
assert.equal(abortObserved, true);
assert.equal(abortStoreWriteCount, 0);
abortWriter.stop();

const noPriceWriter = writerModule.createPriceTrendCaptureWriter({
    lockRunner: async (_lockName, _signal, run) => run(),
    now: () => captureNow,
    store: {
        async addAndPrune(recordsToStore) {
            return {
                addedCount: recordsToStore.length,
                deletedCount: 0,
                records: recordsToStore
            };
        },
        async readByFacilityStayDate() {
            return [];
        }
    },
    transport: {
        async read(request) {
            if (request.kind === "competitors") {
                return [];
            }
            return {
                ...createPriceTrendApiResponse(request),
                yads: []
            };
        }
    },
    windowHost: { indexedDB: {} }
});
const noPriceResult = await noPriceWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(noPriceResult.status, "stored");
assert.equal(noPriceResult.hasPriceData, false);
assert.equal(noPriceResult.addedCount, 1);
noPriceWriter.stop();

const storageFailureWriter = writerModule.createPriceTrendCaptureWriter({
    lockRunner: async (_lockName, _signal, run) => run(),
    now: () => captureNow,
    store: {
        async addAndPrune() {
            throw new Error("must not write after read failure");
        },
        async readByFacilityStayDate() {
            throw new Error("fixture storage failure");
        }
    },
    transport: {
        async read() {
            throw new Error("storage failure must precede network");
        }
    },
    windowHost: { indexedDB: {} }
});
const storageFailure = await storageFailureWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(storageFailure.status, "error");
assert.equal(storageFailure.reason, "storage-failed");
storageFailureWriter.stop();

const unavailableWriter = writerModule.createPriceTrendCaptureWriter({
    now: () => captureNow,
    windowHost: {}
});
const unavailable = await unavailableWriter.capture({
    existingRecords: partialRecords,
    facilityId: "yad:fixture",
    facilityLabel: "施設A（mock）",
    stayDate: "20260812"
});
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.reason, "indexeddb-unavailable");
unavailableWriter.stop();

const pruneRecords = [
    createRecord({
        fetchedAt: "2026-07-23T01:00:00.000Z",
        guestCount: 1,
        key: "current",
        mealType: "NONE",
        stayDate: "20260812"
    }),
    createRecord({
        fetchedAt: "2026-07-22T01:00:00.000Z",
        guestCount: 1,
        key: "older-same-scope",
        mealType: "NONE",
        stayDate: "20260812"
    }),
    createRecord({
        fetchedAt: "2026-07-22T01:00:00.000Z",
        guestCount: 2,
        key: "past-stay",
        mealType: "NONE",
        stayDate: "20260722"
    }),
    createRecord({
        fetchedAt: "2026-07-23T01:00:00.000Z",
        guestCount: 3,
        key: "too-far",
        mealType: "NONE",
        stayDate: "20261021"
    })
];
const pruneKeys = storeModule.selectNextPriceTrendPruneKeys(pruneRecords, {
    minStayDate: "20260723",
    maxStayDate: "20261020"
});
assert.deepEqual(
    Array.from(pruneKeys).sort(),
    ["older-same-scope", "past-stay", "too-far"]
);
assert.equal(storeModule.NEXT_PRICE_TREND_DB_NAME, "revenue-assistant-next-price-trends");
assert.equal(storeModule.NEXT_PRICE_TREND_DB_VERSION, 1);
assert.equal(storeModule.NEXT_PRICE_TREND_STORE_NAME, "price-trend-records");
assert.equal(storeModule.NEXT_PRICE_TREND_RETENTION_LIMIT, 1_440);
assert.equal(storeModule.NEXT_PRICE_TREND_CAPTURE_SCOPE_COUNT, 16);

const styles = view.getPriceTrendComparisonStyles();
assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u);
assert.match(styles, /@media \(max-width: 680px\)/u);
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(styles, /max-width: calc\(100vw - 16px\)/u);
assert.match(styles, /min-height: 44px/u);
assert.match(styles, /data-ra-next-price-trend-capture/u);
assert.match(entrySource, /startPriceTrendComparisonRuntime\(document, window\)/u);
assert.match(runtimeSource, /price-trends-content/u);
assert.match(runtimeSource, /hasLiveFacilityContextLabel/u);
assert.match(runtimeSource, /createPriceTrendCaptureWriter/u);
assert.match(runtimeSource, /writer\?\.cancel/u);
assert.match(fixture, /data-testid="price-trends-content"/u);
assert.match(fixture, /data-mock-native-chart/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /createFixtureDataSource/u);
assert.match(fixtureEntry, /state === "empty"/u);
assert.match(fixtureEntry, /state === "error"/u);
assert.match(fixtureEntry, /writer: null/u);
assert.match(storeSource, /revenue-assistant-next-price-trends/u);
assert.match(storeSource, /store\.add\(record\)/u);
assert.match(storeSource, /store\.delete\(recordKey\)/u);
assert.match(writerSource, /PRICE_TREND_CAPTURE_CONCURRENCY = 2/u);
assert.match(writerSource, /NEXT_PRICE_TREND_CAPTURE_SCOPE_COUNT/u);
assert.match(writerSource, /locks\.request\(lockName, \{ mode: "exclusive", signal \}, run\)/u);
assert.doesNotMatch(writerSource, /room_type_options/u);

for (const source of [dataSourceSource, modelSource, runtimeSource, storeSource, writerSource]) {
    assert.doesNotMatch(source, /priceTrendStore|src\/main|from\s+["'][^"']*main/u);
}
for (const source of [dataSourceSource, modelSource, runtimeSource]) {
    assert.doesNotMatch(source, /\/api\/v1\/price_trends/u);
    assert.doesNotMatch(source, /\bfetch\s*\(/u);
}
for (const source of [dataSourceSource, runtimeSource, writerSource]) {
    assert.doesNotMatch(source, /(?:store|database|indexedDB)\.(?:put|clear)\(|deleteDatabase/u);
}

console.log("Next Analyze 90-day price trend checks passed");

function createCompleteDefaultRecords({ fetchedAt, stayDate }) {
    const complete = [];
    for (const mealType of ["NONE", "BREAKFAST", "DINNER", "BREAKFAST_DINNER"]) {
        for (const guestCount of [1, 2, 3, 4]) {
            complete.push(createRecord({
                fetchedAt,
                guestCount,
                key: `complete-${guestCount}-${mealType}`,
                mealType,
                stayDate
            }));
        }
    }
    return complete;
}

function createPriceTrendApiResponse(request) {
    return {
        latest_source_updated_at: "2026-07-23T00:30:00.000Z",
        stay_date: request.stayDate,
        yads: request.yadNos.map((yadNo, facilityIndex) => ({
            price_trends: [
                {
                    date: "2026-05-14",
                    lead_time_days: 90,
                    jalan_min_price: 10_000 + request.numGuests * 1_000 + facilityIndex * 300,
                    jalan_min_price_status: "available"
                },
                {
                    date: "2026-08-11",
                    lead_time_days: 1,
                    jalan_min_price: 11_000 + request.numGuests * 1_000 + facilityIndex * 300,
                    jalan_min_price_status: "available"
                }
            ],
            yad_no: yadNo
        }))
    };
}

function createRecord({
    fetchedAt = "2026-07-23T01:00:00.000Z",
    guestCount,
    key,
    mealType,
    priceOffset = 0,
    roomType = null,
    stayDate = "20260812"
}) {
    const guestOffset = (guestCount - 1) * 4_000;
    return {
        endpoint: "/api/v1/price_trends",
        facilities: [
            { yadNo: "own", name: "施設A（mock）", role: "own" },
            { yadNo: "competitor-a", name: "競合A（mock）", role: "competitor" }
        ],
        facilityId: "yad:fixture",
        fetchedAt,
        mealType,
        numGuests: guestCount,
        payload: {
            latestSourceUpdatedAt: "2026-07-23T00:30:00.000Z",
            stayDate,
            yads: [
                {
                    points: [
                        {
                            date: "2026-05-14",
                            leadTimeDays: 90,
                            priceIncludingTax: 10_000 + guestOffset + priceOffset,
                            status: "available"
                        },
                        {
                            date: "2026-08-11",
                            leadTimeDays: 1,
                            priceIncludingTax: 11_400 + guestOffset + priceOffset,
                            status: "available"
                        }
                    ],
                    yadNo: "own"
                },
                {
                    points: [
                        {
                            date: "2026-05-14",
                            leadTimeDays: 90,
                            priceIncludingTax: 9_700 + guestOffset + priceOffset,
                            status: "available"
                        },
                        {
                            date: "2026-08-11",
                            leadTimeDays: 1,
                            priceIncludingTax: 10_900 + guestOffset + priceOffset,
                            status: "available"
                        }
                    ],
                    yadNo: "competitor-a"
                }
            ]
        },
        query: `fixture:${key}`,
        recordKey: key,
        roomType,
        roomTypeLabel: roomType === "TWIN" ? "ツイン" : null,
        schemaVersion: "price_trend:v1",
        scope: {
            mealType,
            numGuests: guestCount,
            roomType,
            roomTypeLabel: roomType === "TWIN" ? "ツイン" : null,
            source: "price-trends-tab",
            stayDate,
            yadNos: ["own", "competitor-a"]
        },
        stayDate
    };
}
