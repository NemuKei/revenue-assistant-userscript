import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const model = await importBundledTypeScript(
    "../src/next/monthlyProgress/monthlyProgressModel.ts",
    import.meta.url
);
const storeModule = await importBundledTypeScript(
    "../src/next/monthlyProgress/monthlyProgressStore.ts",
    import.meta.url
);
const dataSourceModule = await importBundledTypeScript(
    "../src/next/monthlyProgress/monthlyProgressDataSource.ts",
    import.meta.url
);
const fixtureModule = await importBundledTypeScript(
    "../src/next/monthlyProgress/monthlyProgressFixture.ts",
    import.meta.url
);
const transportModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensTransport.ts",
    import.meta.url
);
const runtimeModule = await importBundledTypeScript(
    "../src/next/monthlyProgress/monthlyProgressRuntime.ts",
    import.meta.url
);

assert.equal(model.parseNextMonthlyProgressRoute("/monthly-progress/2026-08"), "202608");
assert.equal(model.parseNextMonthlyProgressRoute("/monthly-progress/2026-13"), null);
assert.equal(model.parseNextMonthlyProgressRoute("/analyze/2026-08-01"), null);
assert.equal(model.formatNextMonthlyProgressCompareLabel("202608", 1), "2025年");
assert.equal(model.formatNextMonthlyProgressCompareLabel("202608", 2), "2024年");
assert.equal(model.formatNextMonthlyProgressCompareLabel("202608", 3), "2023年");
assert.equal(model.formatNextMonthlyProgressCompareLabel("invalid", 1), "前年");
assert.deepEqual(model.buildNextMonthlyProgressFocusYearMonths("202611"), [
    "202611", "202612", "202701", "202702", "202703"
]);
assert.deepEqual(model.buildNextMonthlyProgressTargetYearMonths("202608", 1), [
    "202608", "202609", "202610", "202611", "202612"
]);
assert.deepEqual(model.buildNextMonthlyProgressTargetYearMonths("202608", 2), [
    "202608", "202609", "202610", "202611", "202612",
    "202508", "202509", "202510", "202511", "202512"
]);

const monthlyUrl = transportModule.buildNextReadUrl({
    kind: "monthly-booking-curve",
    yearMonth: "202608"
}, "https://example.test");
assert.equal(monthlyUrl.pathname, "/api/v1/booking_curve/monthly");
assert.equal(monthlyUrl.search, "?year_month=202608");
assert.equal(runtimeModule.resolveNextMonthlyProgressBatchDateKey({
    body: { innerText: "最終データ更新: 2026年8月10日" }
}), "20260810");
assert.equal(runtimeModule.resolveNextMonthlyProgressBatchDateKey({
    body: { innerText: "最終データ更新: 2026年13月40日" }
}), null);
assert.equal(runtimeModule.resolveNextMonthlyProgressBatchDateKey({
    body: { innerText: "更新日を確認できません" }
}), null);
assert.equal(
    model.resolveNextMonthlyProgressBatchDateKeyFromUpdatedAt("2026-08-12"),
    "20260812"
);
assert.equal(
    model.resolveNextMonthlyProgressBatchDateKeyFromUpdatedAt("2026-08-12T03:00:00Z"),
    "20260812"
);
assert.equal(model.resolveNextMonthlyProgressBatchDateKeyFromUpdatedAt("2026-02-30"), null);
assert.equal(model.resolveNextMonthlyProgressBatchDateKeyFromUpdatedAt(null), null);
assert.equal(model.compactNextMonthlyProgressResponse({
    year_month: "202608",
    room_based: []
}, "202608"), null);

const parent = {};
const root = { nextSibling: null, parentElement: parent };
assert.equal(runtimeModule.isNextMonthlyProgressRootPlaced(root, {
    insertBefore: root,
    parent
}), true);
assert.equal(runtimeModule.isNextMonthlyProgressRootPlaced(root, {
    insertBefore: null,
    parent
}), true);

const fixtureDataSource = fixtureModule.createNextMonthlyProgressFixtureDataSource({ mode: "ready" });
const fixtureLoad = await fixtureDataSource.load("202608", "20260810", 1);
assert.equal(fixtureLoad.status, "ready");
assert.ok(fixtureLoad.status === "ready");
const fixtureViewModel = model.buildNextMonthlyProgressViewModel({
    data: fixtureLoad.snapshot,
    secondaryMetric: "unit-price"
});
assert.equal(fixtureViewModel.focusMonths.length, 5);
assert.equal(fixtureViewModel.focusMonths[0]?.roomPoints.length, 45);
assert.equal(fixtureViewModel.focusMonths[0]?.dailyDiffItems.some(
    (item) => item.direction === "increase" || item.direction === "decrease"
), true);
assert.equal(fixtureViewModel.emptyState, null);

const loadingFixture = fixtureModule.createNextMonthlyProgressFixtureDataSource({ mode: "loading" });
const loadingLoad = await loadingFixture.load("202608", "20260810", 1);
assert.ok(loadingLoad.status === "ready");
assert.match(model.buildNextMonthlyProgressViewModel({
    data: loadingLoad.snapshot,
    secondaryMetric: "sales"
}).emptyState ?? "", /取得中/u);

const emptyFixture = fixtureModule.createNextMonthlyProgressFixtureDataSource({ mode: "empty" });
const emptyLoad = await emptyFixture.load("202608", "20260810", 1);
assert.ok(emptyLoad.status === "ready");
assert.match(model.buildNextMonthlyProgressViewModel({
    data: emptyLoad.snapshot,
    secondaryMetric: "sales"
}).emptyState ?? "", /利用できるsnapshotがありません/u);

const shortageFixture = fixtureModule.createNextMonthlyProgressFixtureDataSource({
    mode: "compare-shortage"
});
const shortageLoad = await shortageFixture.load("202608", "20260810", 3);
assert.ok(shortageLoad.status === "ready");
assert.match(model.buildNextMonthlyProgressViewModel({
    data: shortageLoad.snapshot,
    secondaryMetric: "unit-price"
}).statusSummary, /比較不足/u);

const storeRecord = storeModule.createNextMonthlyProgressSnapshotRecord({
    facilityId: "yad:fixture",
    yearMonth: "202608",
    batchDateKey: "20260810",
    fetchedAt: "2026-08-10T03:00:00.000Z",
    payload: createCompactPayload("202608")
});
assert.equal(storeModule.isNextMonthlyProgressSnapshotRecord(storeRecord), true);
assert.match(storeRecord.recordKey, /facility:yad:fixture\|yearMonth:202608\|batch:20260810/u);
assert.equal(storeRecord.source, "next-bounded-monthly-progress");
const newerClassicRecord = {
    ...storeRecord,
    fetchedAt: "2026-08-10T04:00:00.000Z",
    source: "classic-readonly-seed",
    payload: {
        ...storeRecord.payload,
        roomBased: storeRecord.payload.roomBased.map((point) => ({
            ...point,
            thisYearSum: 999
        }))
    }
};
const precedenceModel = model.buildNextMonthlyProgressViewModel({
    data: {
        facilityId: "yad:fixture",
        facilityLabel: "施設A（mock）",
        routeYearMonth: "202608",
        batchDateKey: "20260810",
        compareYearsAgo: 1,
        records: [storeRecord, newerClassicRecord],
        progress: {
            phase: "complete",
            targetYearMonths: [],
            processedCount: 0,
            failedCount: 0,
            currentYearMonth: null,
            networkRequestCount: 0,
            nextRecordCount: 1,
            classicSeedCount: 1,
            stopReason: null
        }
    },
    secondaryMetric: "unit-price"
});
assert.equal(
    precedenceModel.focusMonths[0]?.roomPoints.find((point) => point.tick === 30)?.currentValue,
    20,
    "Next record must outrank a newer Classic read-only seed"
);

const store = createMemoryStore();
const transportCalls = [];
let clock = Date.parse("2026-08-10T03:00:00.000Z");
const dataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: createEmptyLegacyReader(),
    now: () => {
        clock += 101;
        return clock;
    },
    readFacilityContextHints: () => ["施設A（mock）"],
    schedule: (task) => setTimeout(task, 0),
    store,
    transport: {
        async read(request) {
            transportCalls.push(request);
            return request.kind === "facility"
                ? { yad_no: "fixture", name: "施設A（mock）" }
                : createRawPayload(request.yearMonth);
        }
    },
    wait: async () => undefined,
    windowHost: {}
});

let load = await dataSource.load("202608", "20260810", 1);
assert.equal(load.status, "ready");
assert.equal(transportCalls.filter((request) => request.kind === "monthly-booking-curve").length, 1);
await waitForTerminalPhase(dataSource);
assert.deepEqual(transportCalls.map(describeRequest), [
    "facility",
    "monthly:202608",
    "monthly:202609",
    "monthly:202610",
    "monthly:202611",
    "monthly:202612"
]);
assert.equal(store.records.size, 5);

load = await dataSource.load("202608", "20260810", 2);
assert.equal(load.status, "ready");
await waitForTerminalPhase(dataSource);
assert.equal(transportCalls.filter((request) => request.kind === "facility").length, 1);
assert.equal(transportCalls.filter((request) => request.kind === "monthly-booking-curve").length, 10);

load = await dataSource.load("202608", "20260810", 3);
assert.equal(load.status, "ready");
await waitForTerminalPhase(dataSource);
assert.equal(transportCalls.filter((request) => request.kind === "monthly-booking-curve").length, 15);
assert.equal(dataSource.snapshot()?.progress.networkRequestCount, 15);

load = await dataSource.load("202608", "20260810", 1);
assert.equal(load.status, "ready");
await waitForTerminalPhase(dataSource);
assert.equal(transportCalls.filter((request) => request.kind === "monthly-booking-curve").length, 15);

const bootstrapCalls = [];
const bootstrapStore = createMemoryStore();
const bootstrapDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: createEmptyLegacyReader(),
    readFacilityContextHints: () => ["施設A（mock）"],
    schedule: (task) => setTimeout(task, 0),
    store: bootstrapStore,
    transport: {
        async read(request) {
            bootstrapCalls.push(request);
            return request.kind === "facility"
                ? { yad_no: "fixture", name: "施設A（mock）" }
                : createRawPayload(request.yearMonth);
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
const bootstrapLoad = await bootstrapDataSource.load("202608", null, 1);
assert.equal(bootstrapLoad.status, "ready");
assert.equal(bootstrapDataSource.snapshot()?.batchDateKey, "20260810");
await waitForTerminalPhase(bootstrapDataSource);
assert.deepEqual(bootstrapCalls.map(describeRequest), [
    "facility",
    "monthly:202608",
    "monthly:202609",
    "monthly:202610",
    "monthly:202611",
    "monthly:202612"
]);
assert.equal(bootstrapStore.records.size, 5);
assert.equal(bootstrapDataSource.snapshot()?.progress.networkRequestCount, 5);

const classicSeed = {
    ...storeModule.createNextMonthlyProgressSnapshotRecord({
        facilityId: "yad:fixture",
        yearMonth: "202608",
        batchDateKey: "20260810",
        fetchedAt: "2026-08-10T02:00:00.000Z",
        payload: createCompactPayload("202608")
    }),
    source: "classic-readonly-seed"
};
const seedCalls = [];
const seedStore = createMemoryStore();
const seedDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: {
        async readExact() {
            return { status: "ready", records: [classicSeed] };
        }
    },
    now: () => Date.parse("2026-08-10T03:00:00.000Z"),
    readFacilityContextHints: () => ["施設A（mock）"],
    schedule: (task) => setTimeout(task, 0),
    store: seedStore,
    transport: {
        async read(request) {
            seedCalls.push(request);
            return request.kind === "facility"
                ? { yad_no: "fixture", name: "施設A（mock）" }
                : createRawPayload(request.yearMonth);
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
assert.equal((await seedDataSource.load("202608", "20260810", 1)).status, "ready");
await waitForTerminalPhase(seedDataSource);
assert.equal(seedCalls.some((request) => (
    request.kind === "monthly-booking-curve" && request.yearMonth === "202608"
)), false);
assert.equal(seedStore.records.has(classicSeed.recordKey), false);
assert.equal(seedDataSource.snapshot()?.progress.classicSeedCount, 1);

const bootstrapSeedCalls = [];
const bootstrapSeedStore = createMemoryStore();
const bootstrapSeedDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: {
        async readExact() {
            return { status: "ready", records: [classicSeed] };
        }
    },
    readFacilityContextHints: () => ["施設A（mock）"],
    schedule: () => undefined,
    store: bootstrapSeedStore,
    transport: {
        async read(request) {
            bootstrapSeedCalls.push(request);
            return request.kind === "facility"
                ? { yad_no: "fixture", name: "施設A（mock）" }
                : createRawPayload(request.yearMonth);
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
assert.equal((await bootstrapSeedDataSource.load("202608", null, 1)).status, "ready");
assert.deepEqual(bootstrapSeedCalls.map(describeRequest), ["facility", "monthly:202608"]);
assert.equal(bootstrapSeedDataSource.snapshot()?.records[0]?.source, "classic-readonly-seed");
assert.equal(bootstrapSeedStore.records.size, 0);

const missingGuardCalls = [];
const missingGuardDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: createEmptyLegacyReader(),
    readFacilityContextHints: () => [],
    schedule: (task) => setTimeout(task, 0),
    store: createMemoryStore(),
    transport: {
        async read(request) {
            missingGuardCalls.push(request);
            return { yad_no: "fixture", name: "施設A（mock）" };
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
const missingGuardLoad = await missingGuardDataSource.load("202608", null, 1);
assert.deepEqual(missingGuardLoad, {
    status: "error",
    reason: "facility-context-mismatch"
});
assert.deepEqual(missingGuardCalls.map(describeRequest), ["facility"]);

const invalidBatchCalls = [];
const invalidBatchDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    readFacilityContextHints: () => ["施設A（mock）"],
    transport: {
        async read(request) {
            invalidBatchCalls.push(request);
            return { yad_no: "fixture", name: "施設A（mock）" };
        }
    },
    windowHost: {}
});
assert.deepEqual(await invalidBatchDataSource.load("202608", "20261340", 1), {
    status: "error",
    reason: "batch-date-invalid"
});
assert.deepEqual(invalidBatchCalls, []);

const missingUpdatedAtCalls = [];
const missingUpdatedAtStore = createMemoryStore();
const missingUpdatedAtDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: createEmptyLegacyReader(),
    readFacilityContextHints: () => ["施設A（mock）"],
    store: missingUpdatedAtStore,
    transport: {
        async read(request) {
            missingUpdatedAtCalls.push(request);
            if (request.kind === "facility") {
                return { yad_no: "fixture", name: "施設A（mock）" };
            }
            return { ...createRawPayload(request.yearMonth), updated_at: null };
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
assert.deepEqual(await missingUpdatedAtDataSource.load("202608", null, 1), {
    status: "error",
    reason: "batch-date-unavailable"
});
assert.deepEqual(missingUpdatedAtCalls.map(describeRequest), [
    "facility",
    "monthly:202608"
]);
assert.equal(missingUpdatedAtStore.records.size, 0);

const consecutiveErrorCalls = [];
const consecutiveErrorDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: createEmptyLegacyReader(),
    readFacilityContextHints: () => ["施設A（mock）"],
    schedule: (task) => setTimeout(task, 0),
    store: createMemoryStore(),
    transport: {
        async read(request) {
            consecutiveErrorCalls.push(request);
            if (request.kind === "facility") {
                return { yad_no: "fixture", name: "施設A（mock）" };
            }
            throw new transportModule.NextReadHttpError("monthly-booking-curve", 500);
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
assert.equal((await consecutiveErrorDataSource.load("202608", "20260810", 1)).status, "ready");
await waitForTerminalPhase(consecutiveErrorDataSource);
assert.equal(consecutiveErrorCalls.filter(
    (request) => request.kind === "monthly-booking-curve"
).length, 3);
assert.equal(consecutiveErrorDataSource.snapshot()?.progress.failedCount, 3);
assert.equal(consecutiveErrorDataSource.snapshot()?.progress.stopReason, "request-failed");

const duplicateStoredRecord = storeModule.createNextMonthlyProgressSnapshotRecord({
    facilityId: "yad:fixture",
    yearMonth: "202608",
    batchDateKey: "20260810",
    fetchedAt: "2026-08-10T01:00:00.000Z",
    payload: createCompactPayload("202608")
});
let deferredDuplicateTask = null;
const duplicateDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: createEmptyLegacyReader(),
    readFacilityContextHints: () => ["施設A（mock）"],
    schedule: (task) => {
        deferredDuplicateTask = task;
    },
    store: {
        async add() {
            return 0;
        },
        async readByRecordKeys(recordKeys) {
            return recordKeys.includes(duplicateStoredRecord.recordKey)
                ? [duplicateStoredRecord]
                : [];
        }
    },
    transport: {
        async read(request) {
            if (request.kind === "facility") {
                return { yad_no: "fixture", name: "施設A（mock）" };
            }
            const payload = createRawPayload(request.yearMonth);
            payload.room_based = payload.room_based.map((point) => ({
                ...point,
                this_year_sum: 999
            }));
            return payload;
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
assert.equal((await duplicateDataSource.load("202608", "20260810", 1)).status, "ready");
assert.equal(deferredDuplicateTask instanceof Function, true);
assert.equal(
    duplicateDataSource.snapshot()?.records[0]?.payload.roomBased[0]?.thisYearSum,
    20,
    "a duplicate add must render the already-persisted record"
);
duplicateDataSource.stop();

const failingStoreDataSource = dataSourceModule.createNextMonthlyProgressDataSource({
    documentHost: {},
    legacySeedReader: createEmptyLegacyReader(),
    readFacilityContextHints: () => ["施設A（mock）"],
    schedule: (task) => setTimeout(task, 0),
    store: {
        async add() {
            throw new Error("fixture store failure");
        },
        async readByRecordKeys() {
            return [];
        }
    },
    transport: {
        async read(request) {
            return request.kind === "facility"
                ? { yad_no: "fixture", name: "施設A（mock）" }
                : createRawPayload(request.yearMonth);
        }
    },
    wait: async () => undefined,
    windowHost: {}
});
const failingStoreLoad = await failingStoreDataSource.load("202608", "20260810", 1);
assert.equal(failingStoreLoad.status, "ready");
assert.deepEqual(failingStoreDataSource.snapshot()?.records, []);
assert.equal(failingStoreDataSource.snapshot()?.progress.phase, "stopped");
assert.equal(failingStoreDataSource.snapshot()?.progress.stopReason, "store-write-failed");

const [
    dataSourceSource,
    entrySource,
    fixtureHtml,
    fixtureEntrySource,
    legacyReaderSource,
    runtimeDomMutationSource,
    runtimeSource,
    storeSource,
    transportSource,
    viewSource
] = await Promise.all([
    readFile(new URL("../src/next/monthlyProgress/monthlyProgressDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-monthly-progress/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/monthlyProgressFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/monthlyProgress/monthlyProgressLegacySeedReader.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/runtimeDomMutation.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/monthlyProgress/monthlyProgressRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/monthlyProgress/monthlyProgressStore.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/live/liveSimilarityLensTransport.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/monthlyProgress/monthlyProgressView.ts", import.meta.url), "utf8")
]);

assert.match(entrySource, /startNextMonthlyProgressRuntime/u);
assert.doesNotMatch(entrySource, /monthlyProgressFixture/u);
assert.doesNotMatch(entrySource, /fixture-mode/u);
assert.match(runtimeSource, /parseNextMonthlyProgressRoute/u);
assert.match(runtimeSource, /waiting-native-monthly-chart/u);
assert.match(runtimeSource, /visibilitychange/u);
assert.match(runtimeSource, /pageshow/u);
assert.match(runtimeSource, /removeNextMonthlyProgressArtifacts/u);
assert.match(runtimeSource, /renderNextMonthlyProgressLoadingState/u);
assert.match(runtimeSource, /ensureRoot\(target\);\s*const observedBatchDateKey/u);
assert.doesNotMatch(runtimeSource, /waiting-batch-date/u);
assert.match(runtimeSource, /revenue-assistant:next:monthly-progress:v1:/u);
assert.match(runtimeDomMutationSource, /data-ra-next-monthly-progress-root/u);
assert.match(viewSource, /販売客室数/u);
assert.match(viewSource, /販売単価/u);
assert.match(viewSource, /日次差分/u);
assert.match(viewSource, /比較年（表示月基準）/u);
assert.match(viewSource, /formatNextMonthlyProgressCompareLabel/u);
assert.match(viewSource, /月次データを準備しています/u);
assert.match(viewSource, /prefers-reduced-motion/u);
assert.match(viewSource, /positionViewportTooltip/u);
assert.match(viewSource, /pointermove/u);
assert.match(viewSource, /tabindex/u);
assert.match(viewSource, /@media \(max-width: 680px\)/u);
assert.match(fixtureHtml, /chart-content-numberOfRoomsSold-dateOfReservationBasis/u);
assert.match(fixtureHtml, /data-mock-route-away/u);
assert.match(fixtureEntrySource, /loading/u);
assert.match(fixtureEntrySource, /bootstrap-loading/u);
assert.match(fixtureEntrySource, /partial-failure/u);
assert.match(legacyReaderSource, /readExistingIndexedDbRecordsByPrimaryKeys/u);
assert.doesNotMatch(legacyReaderSource, /\.put\(|\.add\(|\.delete\(/u);
assert.match(storeSource, /store\.add\(record\)/u);
assert.doesNotMatch(storeSource, /store\.put\(|store\.delete\(|\.clear\(/u);
assert.match(dataSourceSource, /MONTHLY_PROGRESS_SESSION_REQUEST_LIMIT = 15/u);
assert.match(dataSourceSource, /MONTHLY_PROGRESS_MINIMUM_START_INTERVAL_MS = 100/u);
assert.match(dataSourceSource, /resolveNextMonthlyProgressBatchDateKeyFromUpdatedAt/u);
assert.match(dataSourceSource, /batch-date-unavailable/u);
assert.match(dataSourceSource, /http-401/u);
assert.match(dataSourceSource, /http-403/u);
assert.match(dataSourceSource, /http-429/u);
assert.match(transportSource, /method: "GET"/u);
assert.doesNotMatch(transportSource, /method: "POST"/u);

console.log("Next monthly progress checks passed");

function createMemoryStore() {
    const records = new Map();
    return {
        records,
        async add(values) {
            let added = 0;
            for (const value of values) {
                if (!records.has(value.recordKey)) {
                    records.set(value.recordKey, value);
                    added += 1;
                }
            }
            return added;
        },
        async readByRecordKeys(recordKeys) {
            return recordKeys.flatMap((recordKey) => {
                const value = records.get(recordKey);
                return value === undefined ? [] : [value];
            });
        }
    };
}

function createEmptyLegacyReader() {
    return {
        async readExact() {
            return { status: "ready", records: [] };
        }
    };
}

function createRawPayload(yearMonth) {
    const payload = createCompactPayload(yearMonth);
    return {
        year_month: yearMonth,
        updated_at: payload.updatedAt,
        room_based: payload.roomBased.map(toRawPoint),
        sales_based: payload.salesBased.map(toRawPoint)
    };
}

function createCompactPayload(yearMonth) {
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4, 6));
    const lastDay = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0");
    const dates = [`${yearMonth}01`, `${yearMonth}${lastDay}`];
    return {
        yearMonth,
        updatedAt: "2026-08-10T12:00:00+09:00",
        roomBased: dates.map((date, index) => ({
            date,
            thisYearSum: 20 + (index * 60),
            lastYearSum: 18 + (index * 54)
        })),
        salesBased: dates.map((date, index) => ({
            date,
            thisYearSum: 240_000 + (index * 760_000),
            lastYearSum: 220_000 + (index * 680_000)
        }))
    };
}

function toRawPoint(point) {
    return {
        date: point.date,
        this_year_sum: point.thisYearSum,
        last_year_sum: point.lastYearSum
    };
}

function describeRequest(request) {
    return request.kind === "monthly-booking-curve"
        ? `monthly:${request.yearMonth}`
        : request.kind;
}

async function waitForTerminalPhase(dataSource) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        const phase = dataSource.snapshot()?.progress.phase;
        if (phase === "complete" || phase === "stopped") {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail(
        `monthly progress data source did not reach a terminal phase; last phase: ${dataSource.snapshot()?.progress.phase ?? "missing"}`
    );
}
