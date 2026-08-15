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
const snapshotStoreModule = await importBundledTypeScript(
    "../src/next/analyze/competitorHistorySnapshotStore.ts",
    import.meta.url
);
const view = await importBundledTypeScript(
    "../src/next/analyze/competitorHistoryView.ts",
    import.meta.url
);
const priceComparisonDelta = await importBundledTypeScript(
    "../src/next/analyze/priceComparisonDelta.ts",
    import.meta.url
);
const [entrySource, fixture, fixtureEntry, storeSource, viewSource] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-competitor/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeCompetitorFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/competitorHistorySnapshotStore.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/competitorHistoryView.ts", import.meta.url), "utf8")
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
assert.equal(unfiltered.viewModel.availableFilters.roomTypes.some((item) => item.value === "ツイン"), true);
assert.equal(unfiltered.viewModel.availableFilters.mealTypes.some((item) => item.value === "BREAKFAST"), true);

const twin = model.buildCompetitorHistoryViewModel({
    facilityId: "yad:fixture",
    filters: { roomType: "ツイン" },
    records,
    stayDate: "2026-08-12"
});
assert.equal(twin.status, "ready");
assert.equal(twin.viewModel.selectedConditionRecordCount, 1);
assert.equal(twin.viewModel.filters.roomType, "ツイン");
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
assert.equal(priceComparisonDelta.getPriceComparisonDeltaTone(500), "positive");
assert.equal(priceComparisonDelta.getPriceComparisonDeltaTone(-500), "negative");
assert.equal(priceComparisonDelta.getPriceComparisonDeltaTone(0), "neutral");
assert.equal(priceComparisonDelta.getPriceComparisonDeltaTone(null), "neutral");
assert.equal(priceComparisonDelta.formatPriceComparisonSignedPrice(500), "+500円");
assert.equal(priceComparisonDelta.formatPriceComparisonSignedPrice(-500), "-500円");
assert.equal(priceComparisonDelta.formatPriceComparisonSignedPrice(0), "0円");
assert.deepEqual(priceComparisonDelta.PRICE_COMPARISON_DELTA_COLORS, {
    negative: "#9b3d1c",
    positive: "#176b63"
});
assert.ok(
    contrastRatioAgainstWhite(priceComparisonDelta.PRICE_COMPARISON_DELTA_COLORS.positive) >= 4.5
);
assert.ok(
    contrastRatioAgainstWhite(priceComparisonDelta.PRICE_COMPARISON_DELTA_COLORS.negative) >= 4.5
);
assert.match(styles, /grid-template-columns: minmax\(320px, 1fr\)/u);
assert.match(styles, /max-width: 980px/u);
assert.match(styles, /@media \(max-width: 680px\)/u);
assert.match(styles, /max-width: calc\(100vw - 16px\)/u);
assert.match(styles, /min-height: 44px/u);
assert.doesNotMatch(styles, /data-mobile-active="false"/u);
assert.doesNotMatch(styles, /data-ra-next-competitor-history-guest-selector/u);
assert.match(styles, /max-width: 760px/u);
assert.match(styles, /border-radius: 2px/u);
assert.match(styles, /rgba\(47, 111, 187, 0\.08\)/u);
assert.match(styles, /data-ra-next-competitor-history-guide-line/u);
assert.match(styles, /data-ra-next-competitor-history-accessible-table/u);
assert.match(
    styles,
    /data-ra-next-competitor-history-delta="positive"\] \{ color: #176b63; \}/u
);
assert.match(
    styles,
    /data-ra-next-competitor-history-delta="negative"\] \{ color: #9b3d1c; \}/u
);
assert.doesNotMatch(styles, /data-ra-next-competitor-history-delta="up"/u);
assert.doesNotMatch(styles, /data-ra-next-competitor-history-delta="down"/u);
assert.match(styles, /focus:not\(:focus-visible\)[^{]*\{\s*outline: none;/u);
assert.match(viewSource, /title\.textContent = "競合価格 最安値推移"/u);
assert.match(viewSource, /createPriceConditionFilters/u);
assert.match(viewSource, /getPriceConditionFilterStyles/u);
assert.match(viewSource, /getPriceComparisonDeltaStyles/u);
assert.match(viewSource, /getPriceComparisonDeltaTone/u);
assert.match(viewSource, /formatPriceComparisonSignedPrice/u);
assert.match(
    viewSource,
    /root\.replaceChildren\(header, meta, filters, legend, grid\)/u
);
assert.doesNotMatch(viewSource, /createGuestSelector|competitor-history-badge/u);
assert.doesNotMatch(viewSource, /データの見方|日別の値を表で確認/u);
assert.match(viewSource, /table\.setAttribute\("data-ra-next-competitor-history-accessible-table"/u);
assert.match(viewSource, /\["施設", "部屋タイプ", "価格", "前回差分", "自社との差"\]/u);
assert.match(viewSource, /const width = 760/u);
assert.match(viewSource, /const height = 220/u);
assert.match(viewSource, /const padding = \{ top: 18, right: 24, bottom: 34, left: 54 \}/u);
assert.match(viewSource, /svg\.setAttribute\("aria-label", `\$\{panel\.guestCount\}名の競合価格保存履歴`\)/u);
assert.match(viewSource, /svg\.setAttribute\("aria-describedby", description\.id\)/u);
assert.doesNotMatch(viewSource, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "title"\)/u);
assert.match(viewSource, /resolvePanelPriceDomain\(panel\)/u);
assert.match(viewSource, /Math\.max\(160, \(Math\.max\(2, count\) - 1\) \* 140\)/u);
assert.match(viewSource, /for \(const index of observationDates\.keys\(\)\)/u);
assert.match(viewSource, /path\.setAttribute\("stroke-width", "2"\)/u);
assert.match(viewSource, /circle\.setAttribute\("r", "3"\)/u);
assert.match(viewSource, /positionTooltip\(tooltip, center, width, event\.clientX\)/u);
assert.match(viewSource, /setActiveHitbox\(hitboxes, hitbox\)/u);
assert.match(viewSource, /showGuide\(guide, center\)/u);
assert.match(viewSource, /positionTooltip\(tooltip, center, width, null\)/u);
assert.match(viewSource, /positionViewportTooltip\(tooltip, \{/u);
assert.match(viewSource, /anchorClientX: cursorClientX \?\? chartViewportLeft \+ x \* scale/u);
assert.match(viewSource, /preferredClientTop: \(chartRect\?\.top \?\? panelRect\?\.top \?\? 0\) \+ 28/u);
assert.doesNotMatch(viewSource, /panelConstrainedLeft|const xInPanel/u);
assert.match(viewSource, /max-width: min\(560px, calc\(100vw - 16px\)\)/u);
assert.match(viewSource, /position: fixed/u);
assert.match(fixture, /data-transformed-host/u);
assert.equal(model.formatCompetitorHistoryRoomType("FOUR_BEDS"), "フォース");
assert.equal(model.formatCompetitorHistoryRoomType("SEMI_DOUBLE"), "セミダブル");
assert.equal(model.formatCompetitorHistoryMealType("NONE"), "素泊まり");
assert.equal(model.formatCompetitorHistoryMealType("BREAKFAST_DINNER"), "朝夕食");
assert.equal(view.formatCompetitorHistoryCaptureStatus("checking"), "本日分を確認中");
assert.equal(view.formatCompetitorHistoryCaptureStatus("stored"), "本日分を保存");
assert.equal(view.formatCompetitorHistoryCaptureStatus("already-stored"), "本日分は保存済み");
assert.match(entrySource, /startCompetitorHistoryRuntime\(document, window, \{ performanceRecorder \}\)/u);
assert.match(fixture, /competitor-price-tax-included-text/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /resolveStayDate/u);
assert.match(fixtureEntry, /state=|fixtureMode/u);
assert.match(fixtureEntry, /performanceRecorder/u);
assert.match(fixtureEntry, /writer/u);
assert.match(storeSource, /NEXT_COMPETITOR_HISTORY_RETENTION_LIMIT = 720/u);
assert.match(storeSource, /store\.add\(record\)/u);
assert.match(storeSource, /store\.delete\(snapshotKey\)/u);
assert.doesNotMatch(storeSource, /deleteDatabase|\.clear\(|\.put\(/u);
assert.equal(
    snapshotStoreModule.buildNextCompetitorHistorySnapshotKey(
        "yad:fixture",
        "20260812",
        "2026-07-23"
    ),
    "next-competitor-history|facility:yad:fixture|stayDate:20260812|observedOn:2026-07-23"
);

assert.equal(
    snapshotStoreModule.buildNextCompetitorHistorySnapshotKey(
        "yad:fixture",
        "20260812",
        "2026-07-23",
        "TWIN"
    ),
    "next-competitor-history|facility:yad:fixture|stayDate:20260812|observedOn:2026-07-23|roomType:TWIN"
);

const fixedNow = new Date("2026-07-23T01:02:03.000Z");
const writerRequests = [];
const storedByKey = new Map();
const storedWrites = [];
let activePriceRequests = 0;
let maxActivePriceRequests = 0;
let completedPriceRequests = 0;
const writer = writerModule.createCompetitorHistoryWriter({
    lockRunner: async (_name, _signal, run) => run(),
    now: () => fixedNow,
    store: {
        async addAndPrune(record) {
            assert.equal(completedPriceRequests, 6, "all price responses must validate before the first write");
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
                activePriceRequests += 1;
                maxActivePriceRequests = Math.max(maxActivePriceRequests, activePriceRequests);
                await new Promise((resolve) => setTimeout(resolve, 2));
                activePriceRequests -= 1;
                completedPriceRequests += 1;
                return createWriterPricePayload();
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
assert.deepEqual(writerRequests.map((request) => request.kind), [
    "competitors",
    "competitor-prices",
    "competitor-prices",
    "competitor-prices",
    "competitor-prices",
    "competitor-prices",
    "competitor-prices"
]);
const priceRequests = writerRequests.filter((request) => request.kind === "competitor-prices");
assert.deepEqual(priceRequests.map((request) => request.jalanRoomTypes), [
    [],
    ["SINGLE"],
    ["DOUBLE"],
    ["TWIN"],
    ["TRIPLE"],
    ["FOUR_BEDS"]
]);
assert.equal(maxActivePriceRequests, 2);
assert.equal(storedWrites.length, 6);
assert.equal(capture.records.length, 6);
assert.equal(new Set(storedWrites.map((record) => record.snapshotKey)).size, 6);
assert.equal(storedWrites[0].source, "next-competitor-tab");
assert.equal(storedWrites[0].fetchedAt, fixedNow.toISOString());
assert.equal(storedWrites[0].searchConditionRaw.jalanRoomTypes, null);
assert.equal(storedWrites[0].payload.own.plans[0].planName, null);
assert.equal(storedWrites[0].payload.own.plans[0].url, null);
assert.equal(storedWrites[0].payload.own.plans[0].priceDiff, null);
assert.match(storedWrites[0].query, /date=20260812/u);
assert.match(storedWrites[0].query, /yad_nos%5B%5D=competitor-a/u);
assert.doesNotMatch(storedWrites[0].query, /jalan_room_types/u);
for (const record of storedWrites.slice(1)) {
    assert.match(record.query, /jalan_room_types%5B%5D=/u);
}
const repeatedCapture = await writer.capture({
    existingRecords: [],
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(repeatedCapture.status, "skipped");
assert.equal(repeatedCapture.reason, "already-stored");
assert.equal(writerRequests.length, 7, "same JST day must not issue another request");
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
    existingRecords: createSameDayCoverageRecords(),
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(sameDayResult.status, "skipped");
assert.equal(sameDayResult.reason, "already-stored");
assert.equal(sameDayResult.records.length, 6);
assert.equal(sameDayWriterRequests.length, 0);
sameDayWriter.stop();

const partialRequests = [];
const partialWrites = [];
const partialWriter = writerModule.createCompetitorHistoryWriter({
    lockRunner: async (_name, _signal, run) => run(),
    now: () => fixedNow,
    store: {
        async addAndPrune(record) {
            partialWrites.push(record);
            return { status: "stored", deletedCount: 0 };
        },
        async readBySnapshotKey() { return null; }
    },
    transport: {
        async read(request) {
            partialRequests.push(request);
            return request.kind === "competitors"
                ? [{ yad_no: "competitor-a", name: "競合A（mock）" }]
                : createWriterPricePayload();
        }
    },
    windowHost: { indexedDB: {}, location: { origin: "https://ra.jalan.net" }, navigator: {} }
});
const partialResult = await partialWriter.capture({
    existingRecords: createSameDayCoverageRecords().slice(0, 1),
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(partialResult.status, "stored");
assert.deepEqual(
    partialRequests.filter((request) => request.kind === "competitor-prices")
        .map((request) => request.jalanRoomTypes),
    [["SINGLE"], ["DOUBLE"], ["TWIN"], ["TRIPLE"], ["FOUR_BEDS"]]
);
assert.equal(partialWrites.length, 5, "only missing room-type scopes must be stored");
partialWriter.stop();

const invalidWrites = [];
const invalidWriter = writerModule.createCompetitorHistoryWriter({
    lockRunner: async (_name, _signal, run) => run(),
    now: () => fixedNow,
    store: {
        async addAndPrune(record) {
            invalidWrites.push(record);
            return { status: "stored", deletedCount: 0 };
        },
        async readBySnapshotKey() { return null; }
    },
    transport: {
        async read(request) {
            if (request.kind === "competitors") {
                return [{ yad_no: "competitor-a", name: "競合A（mock）" }];
            }
            return request.jalanRoomTypes[0] === "TWIN" ? null : createWriterPricePayload();
        }
    },
    windowHost: { indexedDB: {}, location: { origin: "https://ra.jalan.net" }, navigator: {} }
});
const invalidResult = await invalidWriter.capture({
    existingRecords: [],
    facilityId: "yad:fixture",
    stayDate: "20260812"
});
assert.equal(invalidResult.status, "error");
assert.equal(invalidResult.reason, "competitor-prices-response-invalid");
assert.equal(invalidWrites.length, 0, "invalid batch must not persist a partial scope set");
invalidWriter.stop();

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

function createSameDayCoverageRecords() {
    return [null, "SINGLE", "DOUBLE", "TWIN", "TRIPLE", "FOUR_BEDS"].map((roomType, index) => (
        createRecord({
            conditionSignature: `same-day-${roomType ?? "unspecified"}`,
            fetchedAt: "2026-07-23T00:30:00.000Z",
            key: `same-day-${roomType ?? "unspecified"}`,
            maxNumGuests: 6,
            priceOffset: index * 100,
            requestRoomTypes: roomType === null ? [] : [roomType]
        })
    ));
}

function createWriterPricePayload() {
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

function contrastRatioAgainstWhite(hexColor) {
    const channels = hexColor
        .slice(1)
        .match(/.{2}/gu)
        .map((value) => Number.parseInt(value, 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
    return 1.05 / (luminance + 0.05);
}
