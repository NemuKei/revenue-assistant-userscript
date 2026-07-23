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
const [
    entrySource,
    fixture,
    fixtureEntry,
    dataSourceSource,
    modelSource,
    runtimeSource
] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-price-trend/index.html", import.meta.url), "utf8"),
    readFile(
        new URL("../src/next/dev/analyzePriceTrendComparisonFixtureEntry.ts", import.meta.url),
        "utf8"
    ),
    readFile(new URL("../src/next/analyze/priceTrendComparisonDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/priceTrendComparisonModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/priceTrendComparisonRuntime.ts", import.meta.url), "utf8")
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
assert.equal(seriesReads[0].databaseName, "revenue-assistant-price-trends");
assert.equal(seriesReads[0].databaseVersion, 1);
assert.equal(seriesReads[0].storeName, "price-trend-records");
assert.equal(seriesReads[0].indexName, "facility-stayDate");
assert.deepEqual(seriesReads[0].key, ["yad:fixture", "20260812"]);
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

const styles = view.getPriceTrendComparisonStyles();
assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u);
assert.match(styles, /@media \(max-width: 680px\)/u);
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(styles, /max-width: calc\(100vw - 16px\)/u);
assert.match(styles, /min-height: 44px/u);
assert.match(entrySource, /startPriceTrendComparisonRuntime\(document, window\)/u);
assert.match(runtimeSource, /price-trends-content/u);
assert.match(runtimeSource, /hasLiveFacilityContextLabel/u);
assert.match(fixture, /data-testid="price-trends-content"/u);
assert.match(fixture, /data-mock-native-chart/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /createFixtureDataSource/u);
assert.match(fixtureEntry, /state === "empty"/u);
assert.match(fixtureEntry, /state === "error"/u);

for (const source of [dataSourceSource, modelSource, runtimeSource]) {
    assert.doesNotMatch(source, /priceTrendStore|src\/main|from\s+["'][^"']*main/u);
    assert.doesNotMatch(source, /\/api\/v1\/price_trends/u);
    assert.doesNotMatch(source, /\bfetch\s*\(/u);
}
for (const source of [dataSourceSource, runtimeSource]) {
    assert.doesNotMatch(
        source,
        /readwrite|(?:store|database|indexedDB)\.(?:add|put|delete)\(|deleteDatabase/u
    );
}

console.log("Next Analyze 90-day price trend checks passed");

function createRecord({
    fetchedAt = "2026-07-23T01:00:00.000Z",
    guestCount,
    key,
    mealType,
    priceOffset = 0,
    roomType = null
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
            stayDate: "20260812",
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
            stayDate: "20260812",
            yadNos: ["own", "competitor-a"]
        },
        stayDate: "20260812"
    };
}
