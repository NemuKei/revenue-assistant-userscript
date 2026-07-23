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
const rankModel = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveRankMarkerModel.ts",
    import.meta.url
);
const rankDataSourceModule = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveRankStatusDataSource.ts",
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
const transport = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensTransport.ts",
    import.meta.url
);
const [
    entrySource,
    fixture,
    fixtureEntry,
    runtimeSource,
    dataSourceSource,
    rankDataSourceSource,
    rankModelSource
] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-booking-curve/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeBookingCurveReferenceFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankStatusDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankMarkerModel.ts", import.meta.url), "utf8")
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
const parsedRankSnapshot = rankModel.parseBookingCurveRankStatusResponse({
    suggest_statuses: [
        {
            date: "2026-08-12",
            rm_room_group_id: "single",
            accepted_at: "2026-07-20T08:00:00+09:00",
            before_price_rank_name: "12",
            after_price_rank_name: "11",
            reflector_name: "fixture-person-must-not-be-retained"
        },
        {
            date: "2026-08-12",
            rm_room_group_id: "single",
            accepted_at: "2026-07-20T12:00:00+09:00",
            before_price_rank_name: "11",
            after_price_rank_name: "10"
        },
        {
            date: "2026-08-12",
            rm_room_group_id: "twin",
            completed_at: "2026-07-29T11:00:00+09:00",
            before_price_rank_name: "10",
            after_price_rank_name: "9"
        },
        {
            date: "2026-08-11",
            rm_room_group_id: "single",
            accepted_at: "2026-07-20T12:00:00+09:00",
            before_price_rank_name: "11",
            after_price_rank_name: "10"
        },
        {
            date: "2026-08-12",
            rm_room_group_id: 123,
            accepted_at: "2026-07-20T12:00:00+09:00",
            before_price_rank_name: "11",
            after_price_rank_name: "10"
        },
        {
            date: "2026-08-12",
            rm_room_group_id: "single",
            accepted_at: "invalid",
            before_price_rank_name: "11",
            after_price_rank_name: "10"
        }
    ]
}, "20260812");
assert.notEqual(parsedRankSnapshot, null);
assert.equal(parsedRankSnapshot.events.length, 2);
assert.equal(parsedRankSnapshot.invalidEventCount, 3);
assert.equal(parsedRankSnapshot.events[0].roomGroupId, "single");
assert.equal(parsedRankSnapshot.events[0].beforeRankName, "11", "same room/day keeps the latest event");
assert.equal("reflectorName" in parsedRankSnapshot.events[0], false);
const singleRankHistory = rankModel.buildBookingCurveRankHistoryViewState(parsedRankSnapshot, roomScope);
assert.equal(singleRankHistory.status, "ready");
assert.equal(singleRankHistory.events.length, 1);
assert.deepEqual(
    rankModel.buildBookingCurveRankHistoryViewState(parsedRankSnapshot, hotelScope),
    { status: "scope-required" }
);
assert.equal(rankModel.parseBookingCurveRankStatusResponse({}, "20260812"), null);

const rankUrl = transport.buildNextReadUrl(
    { kind: "rank-status", stayDate: "20260812" },
    "https://ra.jalan.net"
);
assert.equal(rankUrl.pathname, "/api/v3/lincoln/suggest/status");
assert.equal(rankUrl.searchParams.get("filter_type"), "stay_date");
assert.equal(rankUrl.searchParams.get("from"), "20260812");
assert.equal(rankUrl.searchParams.get("to"), "20260812");

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
assert.equal(
    built.viewModel.panels[0].seasonal.points.find((point) => point.tick === 0).value,
    null,
    "a post-stay seasonal source must not reconstruct zero-day from an earlier point"
);
assert.equal(
    built.viewModel.panels[0].seasonal.points.find((point) => point.tick === "ACT").value,
    20,
    "seasonal ACT uses the distinct post-stay landing"
);

const sameWeekdayLandingOnlyReference = createRecord({
    asOfDate: "20260723",
    scope: hotelScope,
    stayDate: "20260722",
    points: [
        ["2026-07-21", 5, 4, 1],
        ["2026-07-22", 8, 7, 1]
    ]
});
const differentWeekdayLandingReference = createRecord({
    asOfDate: "20260723",
    scope: hotelScope,
    stayDate: "20260721",
    points: [
        ["2026-07-20", 50, 40, 10],
        ["2026-07-21", 100, 80, 20]
    ]
});
const landingReferenceBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: {
        status: "ready",
        records: [
            records[0],
            sameWeekdayLandingOnlyReference,
            differentWeekdayLandingReference
        ]
    },
    records: [
        records[0],
        sameWeekdayLandingOnlyReference,
        differentWeekdayLandingReference
    ],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(landingReferenceBuilt.status, "ready");
assert.equal(
    landingReferenceBuilt.viewModel.panels[0].recent.points
        .find((point) => point.tick === 0).value,
    null,
    "recent zero-day remains missing without an exact day-zero observation"
);
assert.equal(
    landingReferenceBuilt.viewModel.panels[0].recent.points
        .find((point) => point.tick === "ACT").value,
    8,
    "recent ACT uses only same-weekday landing evidence"
);

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

const roomRankRecord = createRecord({
    scope: roomScope,
    stayDate: "20260812",
    points: [
        ["2026-07-19", 4, 3, 1],
        ["2026-07-23", 8, 7, 1]
    ]
});
const roomRankBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [roomRankRecord] },
    records: [roomRankRecord],
    rankEvents: singleRankHistory.events,
    scope: roomScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(roomRankBuilt.status, "ready");
assert.equal(roomRankBuilt.viewModel.panels[0].rankMarkers.length, 1);
assert.equal(roomRankBuilt.viewModel.panels[0].rankMarkers[0].value, 4);
assert.equal(roomRankBuilt.viewModel.panels[1].rankMarkers[0].value, 3);
assert.equal(built.viewModel.panels.every((panel) => panel.rankMarkers.length === 0), true);

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

const reusedRecord = createRecord({
    asOfDate: "20260722",
    scope: hotelScope,
    stayDate: "20260805",
    points: [["2026-07-22", 6, 5, 1]]
});
const reusedBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [reusedRecord] },
    records: [reusedRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(reusedBuilt.status, "ready");
assert.equal(reusedBuilt.viewModel.reusedRecordCount, 1);
assert.equal(
    reusedBuilt.viewModel.panels[0].current.points.every((point) => point.value === null),
    true,
    "a reused source may inform references but must not masquerade as the selected day's exact current curve"
);

const olderHistoricalRecord = createRecord({
    asOfDate: "20260708",
    scope: hotelScope,
    stayDate: "20260805",
    points: [["2026-07-08", 4, 3, 1]]
});
const olderHistoricalBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [olderHistoricalRecord] },
    records: [olderHistoricalRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(olderHistoricalBuilt.status, "ready");
assert.equal(olderHistoricalBuilt.viewModel.reusedRecordCount, 1);
assert.equal(
    olderHistoricalBuilt.viewModel.panels[0].recent.points
        .some((point) => point.value !== null),
    true,
    "immutable historical points never expire from a reference curve"
);

const completedRecord = createRecord({
    asOfDate: "20260722",
    scope: hotelScope,
    stayDate: "20260722",
    points: [
        ["2026-07-20", 4, 3, 1],
        ["2026-07-22", 6, 5, 1]
    ]
});
const completedBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [completedRecord] },
    records: [completedRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(completedBuilt.status, "ready");
assert.equal(completedBuilt.viewModel.reusedRecordCount, 1);

const separatedCurrentRecord = {
    ...createRecord({
        asOfDate: "20260723",
        scope: hotelScope,
        stayDate: "20260722",
        points: [
            ["2026-07-21", 5, 4, 1],
            ["2026-07-22", 6, 5, 1]
        ]
    }),
    firstObservedAsOfDate: "20260722",
    landing: {
        all: 8,
        transient: 7,
        group: 1,
        observedAsOfDate: "20260723"
    },
    source: "next-bounded-booking-curve"
};
const separatedCurrentBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [separatedCurrentRecord] },
    records: [separatedCurrentRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260722"
});
assert.equal(separatedCurrentBuilt.status, "ready");
assert.equal(
    separatedCurrentBuilt.viewModel.panels[0].current.points
        .find((point) => point.tick === 0).value,
    6
);
assert.equal(
    separatedCurrentBuilt.viewModel.panels[0].current.points
        .find((point) => point.tick === "ACT").value,
    8,
    "zero-day and the first post-stay landing remain distinct"
);
const separatedReferenceBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [records[0], separatedCurrentRecord] },
    records: [records[0], separatedCurrentRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(separatedReferenceBuilt.status, "ready");
assert.equal(
    separatedReferenceBuilt.viewModel.panels[0].recent.points
        .find((point) => point.tick === 0).value,
    6,
    "recent zero-day uses the exact preserved day-zero observation"
);
assert.equal(
    separatedReferenceBuilt.viewModel.panels[0].recent.points
        .find((point) => point.tick === "ACT").value,
    8,
    "recent ACT remains distinct from preserved zero-day"
);

const landingOnlyRecord = createRecord({
    asOfDate: "20260723",
    scope: hotelScope,
    stayDate: "20260722",
    points: [
        ["2026-07-21", 5, 4, 1],
        ["2026-07-22", 8, 7, 1]
    ]
});
const landingOnlyBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [landingOnlyRecord] },
    records: [landingOnlyRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260722"
});
assert.equal(landingOnlyBuilt.status, "ready");
assert.equal(
    landingOnlyBuilt.viewModel.panels[0].current.points
        .find((point) => point.tick === 0).value,
    null,
    "a source first observed after stay must not backfill zero-day"
);
assert.equal(
    landingOnlyBuilt.viewModel.panels[0].current.points
        .find((point) => point.tick === "ACT").value,
    8,
    "a post-stay source contributes landing only"
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

let guardedAcquisitionStartCount = 0;
const guardedDataSource = dataSourceModule.createBookingCurveReferenceDataSource({
    acquisition: {
        async ensureCurrent() {
            guardedAcquisitionStartCount += 1;
        },
        async readLatest() {
            return [];
        },
        async startBackground() {
            guardedAcquisitionStartCount += 1;
        },
        async startReference() {
            guardedAcquisitionStartCount += 1;
        },
        subscribe() {
            return () => undefined;
        },
        suspend() {},
        stop() {}
    },
    documentHost: {
        querySelectorAll() {
            return [];
        }
    },
    primaryKeyReader: async () => {
        throw new Error("facility mismatch must not reach IndexedDB");
    },
    transport: {
        async read(request) {
            if (request.kind === "facility") {
                return { yad_no: "fixture", name: "施設A（mock）" };
            }
            return {
                suggest_output_current_settings: [{
                    stay_date: "20260812",
                    rm_room_groups: []
                }]
            };
        }
    },
    windowHost: {}
});
const guardedLoad = await guardedDataSource.load("20260812", "20260723", "hotel");
assert.equal(guardedLoad.status, "error");
assert.equal(guardedLoad.reason, "facility-context-mismatch");
assert.equal(
    guardedAcquisitionStartCount,
    0,
    "Analyze acquisition must not start before the visible facility label guard passes"
);
guardedDataSource.stop();

const rankRequests = [];
const rankDataSource = rankDataSourceModule.createBookingCurveRankStatusDataSource({
    transport: {
        async read(request) {
            rankRequests.push(request);
            return {
                suggest_statuses: [{
                    date: "2026-08-12",
                    rm_room_group_id: "single",
                    accepted_at: "2026-07-20T12:00:00+09:00",
                    before_price_rank_name: "11",
                    after_price_rank_name: "10"
                }]
            };
        }
    },
    windowHost: {}
});
const firstRankLoad = await rankDataSource.load("yad:fixture", "20260812");
const reusedRankLoad = await rankDataSource.load("yad:fixture", "20260812");
assert.equal(firstRankLoad.status, "ready");
assert.equal(reusedRankLoad.status, "ready");
assert.deepEqual(rankRequests, [{ kind: "rank-status", stayDate: "20260812" }]);
rankDataSource.stop();

let abortRequestCount = 0;
const abortingRankDataSource = rankDataSourceModule.createBookingCurveRankStatusDataSource({
    transport: {
        async read(_request, signal) {
            abortRequestCount += 1;
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    reject(new DOMException("aborted", "AbortError"));
                }, { once: true });
            });
        }
    },
    windowHost: {}
});
const abortedLoadPromise = abortingRankDataSource.load("yad:fixture", "20260812");
abortingRankDataSource.cancel();
assert.equal((await abortedLoadPromise).reason, "aborted");
assert.equal((await abortingRankDataSource.load("yad:fixture", "20260812")).reason, "aborted");
assert.equal(abortRequestCount, 1, "aborted context must not retry automatically");
abortingRankDataSource.stop();

const styles = view.getBookingCurveReferenceStyles();
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(styles, /@media \(max-width: 680px\)/u);
assert.match(styles, /max-width: calc\(100vw - 48px\)/u);
assert.match(styles, /min-height: 44px/u);
assert.match(styles, /data-ra-next-booking-curve-rank-marker-hitbox/u);
assert.match(entrySource, /startBookingCurveReferenceRuntime\(document, window, \{/u);
assert.match(entrySource, /createBookingCurveReferenceDataSource\(\{[\s\S]*acquisition: bookingCurveAcquisition/u);
assert.match(runtimeSource, /booking-curve-main-chart-header/u);
assert.match(runtimeSource, /booking-curve-sub-chart-header/u);
assert.match(dataSourceSource, /readExistingIndexedDbRecordsByPrimaryKeys/u);
assert.doesNotMatch(dataSourceSource, /rank|lincoln\/suggest\/status|booking_curve\?date/u);
assert.match(rankDataSourceSource, /kind: "rank-status"/u);
assert.doesNotMatch(rankDataSourceSource, /indexedDB|localStorage|sessionStorage|fetch\s*\(/u);
assert.doesNotMatch(rankModelSource, /reflector_name|reflectorName/u);
assert.match(fixture, /booking-curve-main-chart-header/u);
assert.match(fixture, /booking-curve-sub-chart-header/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /state=|fixtureMode/u);
assert.match(fixtureEntry, /fixtureMode === "future"/u);
assert.match(fixtureEntry, /fixtureMode === "history"/u);
assert.match(fixtureEntry, /rankFixtureMode/u);

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
