import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const contract = await importBundledTypeScript(
    "../src/bookingCurveRawSourceContract.ts",
    import.meta.url
);
const dataSourceModule = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveReferenceDataSource.ts",
    import.meta.url
);
const model = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveReferenceModel.ts",
    import.meta.url
);
const runtime = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveReferenceRuntime.ts",
    import.meta.url
);
const view = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveReferenceView.ts",
    import.meta.url
);
const [entrySource, fixture, fixtureEntry, runtimeSource, dataSourceSource] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-booking-curve/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeBookingCurveReferenceFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceDataSource.ts", import.meta.url), "utf8")
]);

assert.equal(runtime.parseBookingCurveReferenceAnalyzeStayDate("/analyze/2026-08-12"), "20260812");
assert.equal(runtime.parseBookingCurveReferenceAnalyzeStayDate("/analyze/2026-02-29"), null);
assert.equal(runtime.parseBookingCurveReferenceAnalyzeStayDate("/"), null);

const scopes = dataSourceModule.parseBookingCurveReferenceScopes({
    suggest_output_current_settings: [{
        stay_date: "2026-08-12",
        rm_room_groups: [
            { rm_room_group_id: "single", rm_room_group_name: "シングル（mock）" },
            { rm_room_group_id: "single", rm_room_group_name: "重複" },
            { rm_room_group_id: "", rm_room_group_name: "invalid" }
        ]
    }]
}, "20260812");
assert.deepEqual(scopes, [
    { key: "hotel", kind: "hotel", label: "ホテル全体", roomGroupId: null },
    { key: "room:single", kind: "roomGroup", label: "シングル（mock）", roomGroupId: "single" }
]);
assert.equal(dataSourceModule.parseBookingCurveReferenceScopes({}, "20260812"), null);

const roomScope = scopes[1];
const hotelScope = scopes[0];
const roomKeys = dataSourceModule.buildBookingCurveReferencePrimaryKeys({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    scope: roomScope,
    stayDate: "20260812"
});
assert.equal(roomKeys.length > 20, true, "reference read must be bounded exact keys, not a broad scan");
assert.equal(roomKeys.every((key) => key.includes("scope:roomGroup")), true);
assert.equal(roomKeys.every((key) => key.includes("roomGroup:single")), true);
assert.equal(roomKeys.some((key) => key.includes("stayDate:20260812")), true);
assert.equal(new Set(roomKeys).size, roomKeys.length);

const records = [
    createRecord({ scope: hotelScope, stayDate: "20260812", points: [["2026-07-23", 8, 7, 1]] }),
    createRecord({ scope: hotelScope, stayDate: "20260805", points: [["2026-07-23", 6, 5, 1]] }),
    createRecord({ scope: hotelScope, stayDate: "20250813", points: [
        ["2024-08-18", 0, 0, 0],
        ["2025-08-12", 18, 15, 3],
        ["2025-08-13", 20, 17, 3]
    ] })
];
const built = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records },
    records,
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(built.status, "ready");
assert.equal(built.viewModel.panels.length, 2);
assert.equal(built.viewModel.panels[0].title, "全体");
assert.equal(built.viewModel.panels[1].title, "個人");
assert.equal(built.viewModel.panels[0].current.points.find((point) => point.tick === 20).value, 8);
assert.equal(built.viewModel.panels[0].current.points.find((point) => point.tick === 14).value, null);
assert.equal(built.viewModel.panels[0].current.points.find((point) => point.tick === "ACT").value, null);
assert.equal(built.viewModel.panels[0].recent.sourceStayDateCount >= 1, true);
assert.equal(built.viewModel.panels[0].seasonal.sourceStayDateCount >= 1, true);

const directSegmentRecord = createRecord({
    scope: hotelScope,
    stayDate: "20260812",
    points: [["2026-07-23", 8, 7, 1]]
});
delete directSegmentRecord.response.booking_curve[0].transient;
const directSegmentBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [directSegmentRecord] },
    records: [directSegmentRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(directSegmentBuilt.status, "ready");
assert.equal(
    directSegmentBuilt.viewModel.panels[1].current.points.find((point) => point.tick === 20).value,
    null,
    "individual curve must not infer transient as all minus group"
);

const zeroRecord = createRecord({
    scope: hotelScope,
    stayDate: "20260812",
    points: [["2025-08-17", 0, 0, 0]]
});
const zeroBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [zeroRecord] },
    records: [zeroRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(zeroBuilt.status, "ready", "zero is data and must not collapse into empty");
assert.equal(zeroBuilt.viewModel.panels[0].current.points.find((point) => point.tick === 360).value, 0);

const staleRecord = { ...records[0], asOfDate: "20260722" };
assert.deepEqual(
    model.buildBookingCurveReferenceViewModel({
        asOfDate: "20260723",
        facilityId: "yad:fixture",
        readStatus: { status: "ready", records: [staleRecord] },
        records: [staleRecord],
        scope: hotelScope,
        scopes,
        stayDate: "20260812"
    }),
    { status: "empty", reason: "stale-records-only" }
);
assert.deepEqual(
    model.buildBookingCurveReferenceViewModel({
        asOfDate: "20260723",
        facilityId: "yad:fixture",
        readStatus: { status: "missing", reason: "database-missing" },
        records: [],
        scope: hotelScope,
        scopes,
        stayDate: "20260812"
    }),
    { status: "empty", reason: "database-missing" }
);

const transportRequests = [];
const primaryReads = [];
const dataSource = dataSourceModule.createBookingCurveReferenceDataSource({
    primaryKeyReader: async (options) => {
        primaryReads.push(options);
        return { status: "ready", records: [] };
    },
    transport: {
        async read(request) {
            transportRequests.push(request);
            if (request.kind === "facility") {
                return { yad_no: "fixture", name: "施設A（mock）" };
            }
            if (request.kind === "current-settings") {
                return {
                    suggest_output_current_settings: [{
                        stay_date: "20260812",
                        rm_room_groups: [{ rm_room_group_id: "single", rm_room_group_name: "シングル（mock）" }]
                    }]
                };
            }
            throw new Error(`unexpected request ${request.kind}`);
        }
    },
    windowHost: {}
});
const hotelLoad = await dataSource.load("20260812", "20260723", "hotel");
const roomLoad = await dataSource.load("20260812", "20260723", "room:single");
assert.equal(hotelLoad.status, "ready");
assert.equal(roomLoad.status, "ready");
assert.deepEqual(transportRequests, [
    { kind: "facility" },
    { kind: "current-settings", from: "20260812", to: "20260812" }
]);
assert.equal(primaryReads.length, 2);
assert.equal(primaryReads[0].databaseName, "revenue-assistant-booking-curve-sources");
assert.equal(primaryReads[0].keys.every((key) => key.includes("scope:hotel")), true);
assert.equal(primaryReads[1].keys.every((key) => key.includes("scope:roomGroup")), true);
dataSource.stop();
assert.equal((await dataSource.load("20260812", "20260723", "hotel")).reason, "aborted");

const styles = view.getBookingCurveReferenceStyles();
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(styles, /@media \(max-width: 680px\)/u);
assert.match(styles, /max-width: calc\(100vw - 48px\)/u);
assert.match(styles, /min-height: 44px/u);
assert.match(entrySource, /startBookingCurveReferenceRuntime\(document, window\)/u);
assert.match(runtimeSource, /booking-curve-main-chart-header/u);
assert.match(runtimeSource, /booking-curve-sub-chart-header/u);
assert.match(dataSourceSource, /readExistingIndexedDbRecordsByPrimaryKeys/u);
assert.doesNotMatch(dataSourceSource, /rank|lincoln\/suggest\/status|booking_curve\?date/u);
assert.match(fixture, /booking-curve-main-chart-header/u);
assert.match(fixture, /booking-curve-sub-chart-header/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /state=|fixtureMode/u);
assert.match(fixtureEntry, /state.*stale|"stale"/u);

console.log("Next Analyze booking curve reference checks passed");

function createRecord({ asOfDate = "20260723", points, scope, stayDate }) {
    const roomGroupId = scope.roomGroupId;
    const query = roomGroupId === null
        ? `date=${stayDate}`
        : `date=${stayDate}&rm_room_group_id=${roomGroupId}`;
    return {
        cacheKey: contract.buildBookingCurveRawSourceCacheKey({
            facilityId: "yad:fixture",
            stayDate,
            asOfDate,
            scope: scope.kind,
            ...(roomGroupId === null ? {} : { roomGroupId }),
            endpoint: contract.BOOKING_CURVE_ENDPOINT,
            query
        }),
        facilityId: "yad:fixture",
        stayDate,
        asOfDate,
        scope: scope.kind,
        roomGroupId,
        endpoint: contract.BOOKING_CURVE_ENDPOINT,
        query,
        fetchedAt: "2026-07-23T01:30:00.000Z",
        schemaVersion: contract.BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
        response: {
            stay_date: stayDate,
            max_room_count: 40,
            booking_curve: points.map(([date, all, transient, group]) => ({
                date,
                all: { this_year_room_sum: all },
                transient: { this_year_room_sum: transient },
                group: { this_year_room_sum: group }
            }))
        }
    };
}
