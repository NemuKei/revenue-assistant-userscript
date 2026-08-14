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
const rankReadCoordinatorModule = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveRankReadCoordinator.ts",
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
const tooltipPosition = await importBundledTypeScript(
    "../src/next/analyze/viewportTooltipPosition.ts",
    import.meta.url
);
const transport = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensTransport.ts",
    import.meta.url
);

class VirtualElement {
    constructor(ownerDocument, tagName) {
        this.attributes = new Map();
        this.childNodes = [];
        this.children = [];
        this.listeners = new Map();
        this.ownerDocument = ownerDocument;
        this.parentElement = null;
        this.style = { removeProperty() {} };
        this.tagName = tagName;
        this.textContent = "";
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }

    dispatch(type, event = {}) {
        this.listeners.get(type)?.(event);
    }

    append(...nodes) {
        for (const node of nodes) {
            this.childNodes.push(node);
            if (node instanceof VirtualElement) {
                node.parentElement = this;
                this.children.push(node);
            }
        }
    }

    focus() {}

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    getBoundingClientRect() {
        return { height: 0, left: 0, top: 0, width: 0 };
    }

    querySelector(selector) {
        return this.children.find((child) => child.tagName === selector) ?? null;
    }

    replaceChildren(...nodes) {
        this.childNodes = [];
        this.children = [];
        this.append(...nodes);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }
}

class VirtualTextNode {
    constructor(textContent) {
        this.textContent = textContent;
    }
}

const [
    entrySource,
    fixture,
    fixtureEntry,
    runtimeSource,
    salesSettingRuntimeSource,
    dataSourceSource,
    rankDataSourceSource,
    rankModelSource,
    rankLearningCaptureParserSource,
    rankReadCoordinatorSource,
    viewSource
] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-booking-curve/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeBookingCurveReferenceFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/salesSettingClassicRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankStatusDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankMarkerModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/rankLearning/rankLearningCaptureParser.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankReadCoordinator.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceView.ts", import.meta.url), "utf8")
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
            reflector_name: "older-person"
        },
        {
            date: "2026-08-12",
            rm_room_group_id: "single",
            accepted_at: "2026-07-20T12:00:00+09:00",
            before_price_rank_name: "11",
            after_price_rank_name: "10",
            reflector_name: "  latest-person  "
        },
        {
            date: "2026-08-12",
            rm_room_group_id: "twin",
            completed_at: "2026-07-29T11:00:00+09:00",
            before_price_rank_name: "10",
            after_price_rank_name: "9",
            reflector_name: 123
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
assert.equal(parsedRankSnapshot.events[0].reflectorName, "latest-person", "same room/day keeps the latest reflector");
assert.equal(parsedRankSnapshot.events[1].reflectorName, null, "a non-string reflector must not discard its event");
const emptyReflectorSnapshot = rankModel.parseBookingCurveRankStatusResponse({
    suggest_statuses: [{
        date: "2026-08-12",
        rm_room_group_id: "single",
        accepted_at: "2026-07-20T12:00:00+09:00",
        before_price_rank_name: "11",
        after_price_rank_name: "10",
        reflector_name: "   "
    }]
}, "20260812");
assert.notEqual(emptyReflectorSnapshot, null);
assert.equal(emptyReflectorSnapshot.events[0].reflectorName, null, "an empty reflector must not discard its event");
const singleRankHistory = rankModel.buildBookingCurveRankHistoryViewState(parsedRankSnapshot, roomScope);
assert.equal(singleRankHistory.status, "ready");
assert.equal(singleRankHistory.events.length, 1);
assert.deepEqual(
    rankModel.buildBookingCurveRankHistoryViewState(parsedRankSnapshot, hotelScope),
    { status: "scope-required" }
);
assert.equal(rankModel.parseBookingCurveRankStatusResponse({}, "20260812"), null);

const rankUrl = transport.buildNextReadUrl(
    { kind: "rank-status", from: "20260812", to: "20260812" },
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
const currentOnlyRoomKeys = dataSourceModule.buildBookingCurveReferencePrimaryKeys({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readProfile: "current-only",
    scope: roomScope,
    stayDate: "20260812"
});
assert.equal(currentOnlyRoomKeys.length, 1, "a closed room summary must read only its target current source");
assert.equal(currentOnlyRoomKeys[0].includes("stayDate:20260812"), true);

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
assert.equal(built.viewModel.capacityRooms, 40);
assert.deepEqual(built.viewModel.currentSummary.all, {
    currentValue: 8,
    previousDayValue: null,
    previousMonthValue: null,
    previousWeekValue: null
});
assert.equal(built.viewModel.currentSummary.transient.currentValue, 7);
assert.equal(built.viewModel.currentSummary.group.currentValue, 1);
assert.equal(built.viewModel.panels[0].current.points.find((point) => point.tick === 20).value, 8);
assert.equal(built.viewModel.panels[0].current.points.find((point) => point.tick === 14).value, null);
assert.equal(built.viewModel.panels[0].current.points.find((point) => point.tick === "ACT").value, null);
assert.deepEqual(built.viewModel.visibility, { recent: true, seasonal: true });
assert.equal(built.viewModel.panels[0].recent.sourceStayDateCount >= 1, true);
assert.equal(built.viewModel.panels[0].seasonal.sourceStayDateCount >= 1, true);
const seasonalZeroPoint = built.viewModel.panels[0].seasonal.points.find((point) => point.tick === 0);
assert.notEqual(
    seasonalZeroPoint.value,
    null,
    "the seasonal model's own zero-day estimate must remain visible"
);
assert.equal(seasonalZeroPoint.interpolated, false);
assert.equal(
    built.viewModel.panels[0].seasonal.points.find((point) => point.tick === "ACT").value,
    20,
    "seasonal ACT uses the distinct post-stay landing"
);

const nextSeasonalRecords = [
    {
        ...createRecord({
            asOfDate: "20260723",
            scope: hotelScope,
            stayDate: "20250813",
            points: [
                ["2025-08-12", 18, 15, 3],
                ["2025-08-13", 20, 17, 3]
            ]
        }),
        firstObservedAsOfDate: "20260723",
        landing: {
            all: 20,
            transient: 17,
            group: 3,
            observedAsOfDate: "20260723"
        },
        source: "next-bounded-booking-curve"
    },
    {
        ...createRecord({
            asOfDate: "20260723",
            scope: hotelScope,
            stayDate: "20240814",
            points: [
                ["2024-08-13", 24, 20, 4],
                ["2024-08-14", 30, 25, 5]
            ]
        }),
        firstObservedAsOfDate: "20260723",
        landing: {
            all: 30,
            transient: 25,
            group: 5,
            observedAsOfDate: "20260723"
        },
        source: "next-bounded-booking-curve"
    }
];
const nextSeasonalBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: { status: "ready", records: [records[0], ...nextSeasonalRecords] },
    records: [records[0], ...nextSeasonalRecords],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(nextSeasonalBuilt.status, "ready");
const nextSeasonalPanel = nextSeasonalBuilt.viewModel.panels[0].seasonal;
assert.equal(nextSeasonalPanel.missingReason, null);
assert.equal(
    nextSeasonalPanel.points.find((point) => point.tick === 0).value,
    25,
    "Next seasonal zero-day uses the landing-based final rooms estimate"
);
assert.equal(
    nextSeasonalPanel.points.find((point) => point.tick === "ACT").value,
    25,
    "Next seasonal zero-day and ACT stay aligned to the same landing cohort"
);
assert.equal(
    nextSeasonalPanel.points.find((point) => point.tick === 1).value < 25,
    true,
    "Next seasonal prefix keeps its historical pace ratio below the landing estimate"
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
    7,
    "a reference-only zero-day display point bridges one-day and ACT when both exist"
);
assert.equal(
    landingReferenceBuilt.viewModel.panels[0].recent.points
        .find((point) => point.tick === 0).interpolated,
    true,
    "a display-only reference bridge must remain distinguishable from an observation"
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
assert.equal(roomRankBuilt.viewModel.panels[0].rankMarkers[0].reflectorName, "latest-person");
assert.equal(roomRankBuilt.viewModel.panels[1].rankMarkers[0].value, 3);
assert.equal(built.viewModel.panels.every((panel) => panel.rankMarkers.length === 0), true);
assert.equal("adjustmentResponse" in roomRankBuilt.viewModel, false);
assert.equal("adjustmentResponse" in built.viewModel, false);

const embeddedDocument = createVirtualDocument();
const embeddedRoomCurve = view.createEmbeddedBookingCurveReference(
    embeddedDocument,
    roomRankBuilt.viewModel,
    singleRankHistory,
    { narrow: false, titleId: "room-booking-curve-title" }
);
assert.equal(
    findVirtualElementsByAttribute(embeddedRoomCurve, "data-ra-next-booking-curve-adjustment-response").length,
    0,
    "embedded room booking curve must not duplicate the rank history in an adjustment-response block"
);
const rankMarkerHitboxes = findVirtualElementsByAttribute(
    embeddedRoomCurve,
    "data-ra-next-booking-curve-rank-marker-hitbox"
);
assert.equal(rankMarkerHitboxes.length, 2);
assert.match(rankMarkerHitboxes[0].getAttribute("aria-label"), /変更者 latest-person/u);
const tooltip = findVirtualElementsByAttribute(
    embeddedRoomCurve,
    "data-ra-next-booking-curve-reference-tooltip"
)[0];
rankMarkerHitboxes[0].dispatch("focus");
assert.match(collectVirtualText(tooltip), /変更者: latest-person/u, "marker focus must show the reflector");
const leadTimeHitbox = findVirtualElementsByAttribute(
    embeddedRoomCurve,
    "data-ra-next-booking-curve-reference-hitbox"
).find((element) => /変更者 latest-person/u.test(element.getAttribute("aria-label") ?? ""));
assert.notEqual(leadTimeHitbox, undefined);
leadTimeHitbox.dispatch("focus");
assert.match(collectVirtualText(tooltip), /変更者: latest-person/u, "lead-time focus must show the reflector");
const nullReflectorCurve = view.createEmbeddedBookingCurveReference(
    embeddedDocument,
    {
        ...roomRankBuilt.viewModel,
        panels: roomRankBuilt.viewModel.panels.map((panel) => ({
            ...panel,
            rankMarkers: panel.rankMarkers.map((marker) => ({ ...marker, reflectorName: null }))
        }))
    },
    singleRankHistory,
    { narrow: false, titleId: "null-reflector-booking-curve-title" }
);
const nullReflectorTooltip = findVirtualElementsByAttribute(
    nullReflectorCurve,
    "data-ra-next-booking-curve-reference-tooltip"
)[0];
findVirtualElementsByAttribute(
    nullReflectorCurve,
    "data-ra-next-booking-curve-rank-marker-hitbox"
)[0].dispatch("focus");
assert.doesNotMatch(collectVirtualText(nullReflectorTooltip), /変更者:/u, "a null reflector must omit only its row");

const embeddedHotelCurve = view.createEmbeddedBookingCurveReference(
    embeddedDocument,
    built.viewModel,
    { status: "scope-required" },
    { narrow: false, titleId: "hotel-booking-curve-title" }
);
assert.equal(
    findVirtualElementsByAttribute(embeddedHotelCurve, "data-ra-next-booking-curve-adjustment-response").length,
    0,
    "embedded hotel booking curve must not render an empty adjustment-response placeholder"
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
        .find((point) => point.tick === 0).interpolated,
    false,
    "an exact reference zero-day must not be labelled as display interpolation"
);
assert.equal(
    separatedReferenceBuilt.viewModel.panels[0].recent.points
        .find((point) => point.tick === "ACT").value,
    8,
    "recent ACT remains distinct from preserved zero-day"
);

const unmatchedZeroDayRecord = {
    ...createRecord({
        asOfDate: "20260715",
        scope: hotelScope,
        stayDate: "20260715",
        points: [
            ["2026-07-14", 120, 105, 15],
            ["2026-07-15", 153, 138, 15]
        ]
    }),
    firstObservedAsOfDate: "20260715",
    landing: null,
    source: "next-bounded-booking-curve"
};
const unmatchedLandingRecord = {
    ...createRecord({
        asOfDate: "20260723",
        scope: hotelScope,
        stayDate: "20260722",
        points: [
            ["2026-07-21", 127, 112, 15],
            ["2026-07-22", 128, 113, 15]
        ]
    }),
    firstObservedAsOfDate: "20260723",
    landing: {
        all: 128,
        transient: 113,
        group: 15,
        observedAsOfDate: "20260723"
    },
    source: "next-bounded-booking-curve"
};
const unmatchedTerminalBuilt = model.buildBookingCurveReferenceViewModel({
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    readStatus: {
        status: "ready",
        records: [records[0], unmatchedZeroDayRecord, unmatchedLandingRecord]
    },
    records: [records[0], unmatchedZeroDayRecord, unmatchedLandingRecord],
    scope: hotelScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(unmatchedTerminalBuilt.status, "ready");
const unmatchedRecent = unmatchedTerminalBuilt.viewModel.panels[0].recent;
const unmatchedRecentOneDay = unmatchedRecent.points.find((point) => point.tick === 1).value;
const unmatchedRecentZeroDay = unmatchedRecent.points.find((point) => point.tick === 0);
const unmatchedRecentAct = unmatchedRecent.points.find((point) => point.tick === "ACT").value;
assert.equal(unmatchedRecentZeroDay.interpolated, true);
assert.equal(
    unmatchedRecentZeroDay.value,
    Math.round(unmatchedRecentOneDay + ((unmatchedRecentAct - unmatchedRecentOneDay) / 2)),
    "a zero-day aggregate from a different stay-date cohort must not create a terminal spike"
);
assert.notEqual(
    unmatchedRecentZeroDay.value,
    153,
    "the unmatched sparse zero-day observation must not override the reference line"
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
                        rm_room_groups: [
                            { rm_room_group_id: "single", rm_room_group_name: "シングル（mock）" },
                            { rm_room_group_id: "twin", rm_room_group_name: "ツイン（mock）" }
                        ]
                    }]
                };
            }
            throw new Error(`unexpected request ${request.kind}`);
        }
    },
    windowHost: {}
});
const hotelLoad = await dataSource.load("20260812", "20260723", "hotel");
const [roomLoad, fullRoomLoad, twinLoad] = await Promise.all([
    dataSource.load("20260812", "20260723", "room:single", { readProfile: "current-only" }),
    dataSource.load("20260812", "20260723", "room:single", { readProfile: "full" }),
    dataSource.load("20260812", "20260723", "room:twin")
]);
assert.equal(hotelLoad.status, "ready");
assert.equal(roomLoad.status, "ready");
assert.equal(roomLoad.readProfile, "current-only");
assert.equal(fullRoomLoad.status, "ready");
assert.equal(fullRoomLoad.readProfile, "full", "current-only and full reads must not dedupe each other");
assert.equal(twinLoad.status, "ready", "same-context room loads must not abort each other");
assert.deepEqual(transportRequests, [
    { kind: "facility" },
    { kind: "current-settings", from: "20260812", to: "20260812" }
]);
assert.equal(primaryReads.length, 4);
assert.equal(primaryReads[0].databaseName, "revenue-assistant-booking-curve-sources");
assert.equal(primaryReads[0].keys.every((key) => key.includes("scope:hotel")), true);
const singleRoomReads = primaryReads.filter((read) => (
    read.keys.every((key) => key.includes("roomGroup:single"))
));
assert.equal(singleRoomReads.length, 2);
assert.deepEqual(
    singleRoomReads.map((read) => read.keys.length).sort((left, right) => left - right),
    [1, roomKeys.length],
    "current-only must keep the full reference key set available for an opened room"
);
assert.equal(primaryReads.some((read) => read.keys.every((key) => key.includes("roomGroup:twin"))), true);
dataSource.stop();
assert.equal((await dataSource.load("20260812", "20260723", "hotel")).reason, "aborted");

const acquisitionPriorityCalls = [];
const visibleFacilityElement = {
    closest() {
        return null;
    },
    getBoundingClientRect() {
        return { height: 20, width: 120 };
    },
    hidden: false,
    ownerDocument: { defaultView: undefined },
    parentElement: null,
    textContent: "施設A（mock）"
};
const priorityDataSource = dataSourceModule.createBookingCurveReferenceDataSource({
    acquisition: {
        async ensureCurrent(options) {
            acquisitionPriorityCalls.push({
                kind: "current",
                priority: options.priority,
                scopeKeys: options.scopeKeys,
                waitForCompletion: options.waitForCompletion
            });
            return { candidateTaskCount: 1, dueTaskCount: 0, outcome: "ready" };
        },
        async readLatest() {
            return [];
        },
        async startBackground() {
            acquisitionPriorityCalls.push({ kind: "background" });
        },
        async startReference(options) {
            acquisitionPriorityCalls.push({ kind: "reference", priority: options.priority, scopeKey: options.scopeKey });
            return { candidateTaskCount: 1, dueTaskCount: 0, outcome: "ready" };
        },
        subscribe() {
            return () => undefined;
        },
        suspend() {},
        stop() {}
    },
    documentHost: {
        querySelectorAll() {
            return [visibleFacilityElement];
        }
    },
    primaryKeyReader: async () => ({ status: "ready", records: [] }),
    transport: {
        async read(request) {
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
const hotelPriorityLoad = await priorityDataSource.load("20260812", "20260723", "hotel", {
    currentPriority: "critical-current",
    referencePriority: null,
    waitForCurrent: false
});
const roomPriorityLoad = await priorityDataSource.load("20260812", "20260723", "room:single", {
    currentPriority: "visible-current",
    readProfile: "current-only",
    referencePriority: null
});
assert.equal(hotelPriorityLoad.status, "ready");
assert.equal(hotelPriorityLoad.acquisitionDiagnostics?.referenceDeferred, true);
assert.equal(roomPriorityLoad.status, "ready");
assert.equal(roomPriorityLoad.acquisitionDiagnostics?.referenceDeferred, true);
priorityDataSource.prioritize("20260812", "20260723", "hotel", {
    currentPriority: "critical-current",
    referencePriority: "visible-reference"
});
await new Promise((resolve) => setTimeout(resolve, 0));
priorityDataSource.prioritize("20260812", "20260723", "room:single");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(acquisitionPriorityCalls, [
    { kind: "current", priority: "critical-current", scopeKeys: ["hotel"], waitForCompletion: false },
    { kind: "current", priority: "visible-current", scopeKeys: ["room:single"], waitForCompletion: true },
    { kind: "current", priority: "critical-current", scopeKeys: ["hotel"], waitForCompletion: undefined },
    { kind: "reference", priority: "visible-reference", scopeKey: "hotel" },
    { kind: "current", priority: "critical-current", scopeKeys: ["room:single"], waitForCompletion: undefined },
    { kind: "reference", priority: "selected-reference", scopeKey: "room:single" }
], "Analyze foreground must use the five-level queue contract without starting background work or extra context reads");
priorityDataSource.stop();

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
assert.deepEqual(rankRequests, [{ kind: "rank-status", from: "20260812", to: "20260812" }]);
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

const sharedRankStatusHarness = createControlledRankDataSourceHarness("status");
const sharedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankStatusDataSource: sharedRankStatusHarness.createSource
});
const sharedStandaloneRankReads = sharedRankCoordinator.createConsumer("standalone");
const sharedSalesRankReads = sharedRankCoordinator.createConsumer("sales");
const sharedStatusLoads = [
    sharedStandaloneRankReads.rankStatusDataSource.load("yad:shared", "20260812"),
    sharedSalesRankReads.rankStatusDataSource.load("yad:shared", "2026-08-12")
];
assert.equal(sharedRankStatusHarness.sources.length, 1);
assert.equal(sharedRankStatusHarness.sources[0].calls.length, 1);
sharedRankStatusHarness.sources[0].calls[0].resolve(createReadyRankStatusResult(
    "yad:shared",
    "20260812"
));
assert.deepEqual(
    (await Promise.all(sharedStatusLoads)).map((result) => result.status),
    ["ready", "ready"]
);
const lateRankConsumer = sharedRankCoordinator.createConsumer("late-consumer");
assert.equal(
    (await lateRankConsumer.rankStatusDataSource.load("yad:shared", "20260812")).status,
    "ready"
);
assert.equal(
    sharedRankStatusHarness.sources.length,
    1,
    "sequential and concurrent consumers must share one rank-status GET per facility/stay key"
);
sharedStandaloneRankReads.rankStatusDataSource.reset();
assert.equal(
    (await sharedSalesRankReads.rankStatusDataSource.load("yad:shared", "20260812")).status,
    "ready",
    "one consumer reset must not invalidate a settled result still leased by another"
);
sharedSalesRankReads.rankStatusDataSource.reset();
lateRankConsumer.rankStatusDataSource.reset();
const reenteredLoads = [
    sharedStandaloneRankReads.rankStatusDataSource.load("yad:shared", "20260812"),
    sharedSalesRankReads.rankStatusDataSource.load("yad:shared", "20260812")
];
assert.equal(sharedRankStatusHarness.sources.length, 2);
sharedRankStatusHarness.sources[1].calls[0].resolve(createReadyRankStatusResult(
    "yad:shared",
    "20260812"
));
assert.deepEqual(
    (await Promise.all(reenteredLoads)).map((result) => result.status),
    ["ready", "ready"]
);
sharedRankCoordinator.stop();
assert.equal(sharedRankStatusHarness.sources[1].stopCount, 1);
assert.equal(
    (await lateRankConsumer.rankStatusDataSource.load("yad:shared", "20260812")).reason,
    "aborted"
);
sharedRankCoordinator.stop();
assert.equal(sharedRankStatusHarness.sources[1].stopCount, 1, "coordinator stop must be idempotent");

const retainedRankStatusHarness = createControlledRankDataSourceHarness("status");
const retainedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankStatusDataSource: retainedRankStatusHarness.createSource
});
const releasingRankConsumer = retainedRankCoordinator.createConsumer("releasing");
const retainedRankConsumer = retainedRankCoordinator.createConsumer("retained");
const releasedStatusLoad = releasingRankConsumer.rankStatusDataSource.load("yad:retained", "20260812");
const retainedStatusLoad = retainedRankConsumer.rankStatusDataSource.load("yad:retained", "20260812");
releasingRankConsumer.rankStatusDataSource.cancel();
assert.equal((await releasedStatusLoad).reason, "aborted");
assert.equal(
    retainedRankStatusHarness.sources[0].cancelCount,
    0,
    "one consumer cancel must not abort another consumer's active rank-status read"
);
retainedRankStatusHarness.sources[0].calls[0].resolve(createReadyRankStatusResult(
    "yad:retained",
    "20260812"
));
assert.equal((await retainedStatusLoad).status, "ready");
retainedRankCoordinator.stop();

const releasedRankStatusHarness = createControlledRankDataSourceHarness("status");
const releasedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankStatusDataSource: releasedRankStatusHarness.createSource
});
const releaseA = releasedRankCoordinator.createConsumer("release-a");
const releaseB = releasedRankCoordinator.createConsumer("release-b");
const releaseStatusLoads = [
    releaseA.rankStatusDataSource.load("yad:release", "20260812"),
    releaseB.rankStatusDataSource.load("yad:release", "20260812")
];
releaseA.rankStatusDataSource.cancel();
assert.equal(releasedRankStatusHarness.sources[0].cancelCount, 0);
releaseB.rankStatusDataSource.reset();
assert.equal(
    releasedRankStatusHarness.sources[0].cancelCount,
    1,
    "the last rank-status lease release must abort the in-flight underlying read"
);
assert.deepEqual(
    (await Promise.all(releaseStatusLoads)).map((result) => result.reason),
    ["aborted", "aborted"]
);
releasedRankCoordinator.stop();

const mismatchedRankStatusHarness = createControlledRankDataSourceHarness("status");
const mismatchedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankStatusDataSource: mismatchedRankStatusHarness.createSource
});
const mismatchedRankConsumer = mismatchedRankCoordinator.createConsumer("mismatched-result");
const mismatchedStatusLoad = mismatchedRankConsumer.rankStatusDataSource.load(
    "yad:expected",
    "20260812"
);
mismatchedRankStatusHarness.sources[0].calls[0].resolve(createReadyRankStatusResult(
    "yad:stale",
    "20260811"
));
assert.deepEqual(await mismatchedStatusLoad, {
    status: "error",
    contextKey: "yad:expected|20260812",
    reason: "request-failed"
});
mismatchedRankCoordinator.stop();

const stoppedRankStatusHarness = createControlledRankDataSourceHarness("status");
const stoppedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankStatusDataSource: stoppedRankStatusHarness.createSource
});
const stoppedRankConsumer = stoppedRankCoordinator.createConsumer("stopped-in-flight");
const stoppedStatusLoad = stoppedRankConsumer.rankStatusDataSource.load("yad:stop", "20260812");
stoppedRankCoordinator.stop();
assert.equal(stoppedRankStatusHarness.sources[0].stopCount, 1);
assert.equal((await stoppedStatusLoad).reason, "aborted");
assert.equal(
    (await stoppedRankConsumer.rankStatusDataSource.load("yad:after-stop", "20260814")).reason,
    "aborted"
);
assert.equal(stoppedRankStatusHarness.sources.length, 1);
const styles = view.getBookingCurveReferenceStyles();
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(styles, /@media \(max-width: 680px\)/u);
assert.match(styles, /max-width: calc\(100vw - 48px\)/u);
assert.match(styles, /min-height: 44px/u);
assert.match(styles, /data-ra-next-booking-curve-rank-marker-hitbox/u);
assert.match(styles, /font-size: 14px/u);
assert.match(styles, /data-ra-next-booking-curve-reference-control-label/u);
assert.match(styles, /data-ra-next-booking-curve-reference-active-guide/u);
assert.match(styles, /data-ra-next-booking-curve-reference-active-point/u);
assert.match(styles, /cursor: crosshair/u);
assert.doesNotMatch(styles, /data-ra-next-booking-curve-adjustment-response/u);
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(viewSource, /header\.append\(createControls\(root\.ownerDocument, viewModel\)\)/u);
assert.match(viewSource, /export function createEmbeddedBookingCurveReference/u);
assert.match(viewSource, /createControls\(documentHost, viewModel, false\)/u);
assert.match(viewSource, /root\.replaceChildren\(header, legend, grid, details\)/u);
assert.doesNotMatch(viewSource, /調整後のペース|adjustment-response/u);
assert.match(viewSource, /body\.append\(meta, note, diagnostics, rankHistory\)/u);
assert.match(viewSource, /（補間）/u);
assert.match(viewSource, /（表示補間）/u);
assert.match(viewSource, /表示補間/u);
assert.match(viewSource, /recent: \{ color: "#b7791f", dash: "8 5", width: 2\.4 \}/u);
assert.match(viewSource, /seasonal: \{ color: "#c2415d", dash: "2 6", width: 2\.4 \}/u);
assert.match(viewSource, /repeating-linear-gradient\(90deg/u);
assert.match(viewSource, /buildAreaPath\(panel\.current\.points/u);
assert.match(viewSource, /BOOKING_CURVE_REFERENCE_AREA_ATTRIBUTE/u);
assert.match(viewSource, /showActivePosition\(/u);
assert.match(viewSource, /findBookingCurveRankMarkerInRange\(/u);
assert.match(viewSource, /const activeMarker = findBookingCurveRankMarkerInRange\(/u);
assert.match(viewSource, /marker: BookingCurveReferenceRankMarker \| null/u);
assert.match(viewSource, /capacityRooms: number \| null/u);
assert.match(viewSource, /稼働率/u);
assert.match(viewSource, /上限/u);
assert.match(viewSource, /point\.setAttribute\("r", "3\.5"\)/u);
assert.match(viewSource, /point\.setAttribute\("fill", currentColor\)/u);
assert.match(viewSource, /point\.setAttribute\("stroke", "#fff"\)/u);
assert.match(viewSource, /hitbox\.setAttribute\("r", "8"\)/u);
assert.doesNotMatch(viewSource, /data-ra-next-booking-curve-rank-guide|createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "polygon"\)/u);
assert.doesNotMatch(viewSource, /◆ ランク変更|data-ra-next-booking-curve-rank-legend/u);
assert.match(viewSource, /positionBookingCurveTooltip\(tooltip, x, chartViewBoxWidth, cursorClientX\)/u);
assert.match(viewSource, /positionViewportTooltip\(tooltip, \{/u);
assert.match(viewSource, /anchorClientX: cursorClientX \?\? chartViewportLeft \+ x \* scale/u);
assert.match(viewSource, /preferredClientTop: \(chartRect\?\.top \?\? panelRect\?\.top \?\? 0\) \+ 10/u);
assert.doesNotMatch(viewSource, /tooltipHalfWidth|panelConstrainedLeft|const xInPanel/u);
assert.match(styles, /max-width: min\(300px, calc\(100vw - 16px\)\)/u);
assert.match(styles, /position: fixed; z-index: 10/u);
assert.doesNotMatch(styles, /translateX\(-50%\)/u);
assert.match(fixture, /data-transformed-host/u);
assert.equal(tooltipPosition.resolveFixedCssCoordinate(500, 80, 1), 420);
assert.equal(tooltipPosition.resolveFixedCssCoordinate(500, 80, 0.8), 525);
assert.equal(tooltipPosition.resolveFixedCssCoordinate(500, 80, 0), 420);
assert.match(viewSource, /show\(event\.clientX\)/u);
assert.doesNotMatch(viewSource, /circle\.setAttribute\("r", series\.id === "current"/u);
assert.doesNotMatch(viewSource, /閲覧のみ|booking-curve-reference-badge/u);
assert.doesNotMatch(viewSource, /element\.append\(\s*title,\s*diagnostics,/u);
assert.match(entrySource, /startBookingCurveReferenceRuntime\(document, window, \{/u);
assert.match(entrySource, /createBookingCurveReferenceDataSource\(\{[\s\S]*acquisition: bookingCurveAcquisition/u);
assert.match(entrySource, /const rankReads = createBookingCurveRankReadCoordinator\(\{ windowHost: window \}\)/u);
assert.match(
    entrySource,
    /const bookingCurveReferenceRankReads = rankReads\.createConsumer\("booking-curve-reference"\)/u
);
assert.match(
    entrySource,
    /const salesSettingRankReads = rankReads\.createConsumer\("sales-setting"\)/u
);
assert.match(
    entrySource,
    /startBookingCurveReferenceRuntime\(document, window, \{[\s\S]*rankStatusDataSource: bookingCurveReferenceRankReads\.rankStatusDataSource/u,
    "the standalone runtime must receive its own shared rank-status consumer adapter"
);
assert.match(
    entrySource,
    /startSalesSettingClassicRuntime\(document, window, \{[\s\S]*rankStatusDataSource: salesSettingRankReads\.rankStatusDataSource/u,
    "the SalesSetting runtime must receive a distinct shared rank-status consumer adapter"
);
assert.match(runtimeSource, /booking-curve-main-chart-header/u);
assert.match(runtimeSource, /booking-curve-sub-chart-header/u);
assert.match(runtimeSource, /addEventListener\("load", scheduleReconcile/u);
assert.match(runtimeSource, /addEventListener\("pageshow", scheduleReconcile/u);
assert.doesNotMatch(runtimeSource, /seasonal:\s*false/u);
assert.match(
    salesSettingRuntimeSource,
    /rankEvents: rankHistory\.status === "ready" \? rankHistory\.events : \[\],[\s\S]*rankHistory,/u,
    "SalesSetting must retain rank history for markers and collapsed details"
);
assert.doesNotMatch(salesSettingRuntimeSource, /rankOrder|rank-order|rank_sequences/u);
const salesSurfaceReconcileSource = sliceSourceBetween(
    salesSettingRuntimeSource,
    "        const nextSurface = resolveSalesSettingClassicSurface(documentHost);",
    "        const asOfDate = resolveAsOfDate(documentHost);"
);
assert.match(
    salesSurfaceReconcileSource,
    /if \(documentHost\.visibilityState === "hidden"\) \{\s*suspendForInactiveSurface\("suspended-hidden"\);\s*return;\s*\}\s*if \(nextSurface === null\) \{\s*waitForNativeSalesSettingSurface\(\);\s*return;/u,
    "a transient missing native surface must remain distinct from a hidden document"
);
const inactiveSalesSurfaceSource = sliceSourceBetween(
    salesSettingRuntimeSource,
    "    function suspendForInactiveSurface(finalState: string): void {",
    "    function waitForNativeSalesSettingSurface(): void {"
);
const hiddenRankStatusLoadingSource = sliceSourceBetween(
    inactiveSalesSurfaceSource,
    "        if (rankLoading) {",
    "        rankStatusDataSource.cancel();\n        cancelScopeBatchForInactiveSurface();"
);
assert.match(
    hiddenRankStatusLoadingSource,
    /rankStatusDataSource\.cancel\(\);[\s\S]*rankLoadError = null;[\s\S]*rankLoading = false;/u,
    "hiding the Sales surface must release an in-flight rank-status lease without invalidating its cache"
);
assert.doesNotMatch(hiddenRankStatusLoadingSource, /rankStatusDataSource\.reset\(\)/u);
assert.match(
    inactiveSalesSurfaceSource,
    /rankStatusDataSource\.cancel\(\);\s*cancelScopeBatchForInactiveSurface\(\);[\s\S]*if \(root === null\)/u,
    "an inactive Sales surface must release its shared rank-status lease even without a mounted root"
);
const waitingNativeSalesSurfaceSource = sliceSourceBetween(
    salesSettingRuntimeSource,
    "    function waitForNativeSalesSettingSurface(): void {",
    "    function removeMountedArtifacts(): void {"
);
assert.match(
    waitingNativeSalesSurfaceSource,
    /removeMountedArtifacts\(\);\s*setRuntimeMarker\("waiting-native-sales-setting"\);/u,
    "a transient native Sales remount must preserve the in-flight rank state and lease"
);
assert.doesNotMatch(
    waitingNativeSalesSurfaceSource,
    /rank(?:Generation|Loading|Status)|rankStatusDataSource\.(?:cancel|reset)\(\)/u
);
const resetSalesContextSource = sliceSourceBetween(
    salesSettingRuntimeSource,
    "    function resetContext(stayDate: string, asOfDate: string | null): void {",
    "    function startLoadAll(stayDate: string, asOfDate: string, showLoading: boolean): void {"
);
assert.match(resetSalesContextSource, /rankStatusDataSource\.reset\(\);/u);
assert.doesNotMatch(resetSalesContextSource, /rankOrder/u);
const inactiveSalesRouteSource = sliceSourceBetween(
    salesSettingRuntimeSource,
    "    function suspendForInactiveRoute(): void {",
    "    function suspendForInactiveSurface(finalState: string): void {"
);
assert.match(
    inactiveSalesRouteSource,
    /rankStatusDataSource\.reset\(\);/u,
    "a real route exit must still invalidate the bounded rank-status cache"
);
assert.doesNotMatch(inactiveSalesRouteSource, /rankOrder/u);
assert.match(dataSourceSource, /readExistingIndexedDbRecordsByPrimaryKeys/u);
assert.doesNotMatch(dataSourceSource, /rank|lincoln\/suggest\/status|booking_curve\?date/u);
assert.match(rankDataSourceSource, /kind: "rank-status"/u);
assert.doesNotMatch(rankDataSourceSource, /indexedDB|localStorage|sessionStorage|fetch\s*\(/u);
assert.match(rankModelSource, /reflector_name/u);
assert.match(rankModelSource, /reflectorName\?: string \| null/u);
assert.doesNotMatch(rankLearningCaptureParserSource, /reflector_name|reflectorName/u);
assert.match(viewSource, /変更者: \$\{marker\.reflectorName\}/u);
assert.match(viewSource, /変更者 \$\{marker\.reflectorName\}/u);
assert.match(rankReadCoordinatorSource, /createConsumer\(consumerId/u);
assert.match(rankReadCoordinatorSource, /entry\.leases\.size > 0/u);
assert.doesNotMatch(
    rankReadCoordinatorSource,
    /indexedDB|localStorage|sessionStorage|fetch\s*\(/u,
    "the cross-runtime coordinator must remain memory-only and reuse injected read sources"
);
assert.match(fixture, /booking-curve-main-chart-header/u);
assert.match(fixture, /booking-curve-sub-chart-header/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /state=|fixtureMode/u);
assert.match(fixtureEntry, /fixtureMode === "future"/u);
assert.match(fixtureEntry, /fixtureMode === "history"/u);
assert.match(fixtureEntry, /rankFixtureMode/u);
assert.doesNotMatch(fixtureEntry, /rankOrder|rank-order|adjustment-response/u);

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

function createVirtualDocument() {
    const documentHost = {
        defaultView: {
            getComputedStyle() {
                return { maxWidth: "" };
            },
            innerHeight: 800,
            innerWidth: 1200
        },
        documentElement: { clientHeight: 800, clientWidth: 1200 },
        createElement(tagName) {
            return new VirtualElement(documentHost, tagName);
        },
        createElementNS(_namespace, tagName) {
            return new VirtualElement(documentHost, tagName);
        },
        createTextNode(textContent) {
            return new VirtualTextNode(textContent);
        }
    };
    return documentHost;
}

function findVirtualElementsByAttribute(root, attribute) {
    return [
        ...(root.getAttribute(attribute) === null ? [] : [root]),
        ...root.children.flatMap((child) => findVirtualElementsByAttribute(child, attribute))
    ];
}

function collectVirtualText(root) {
    return [
        root.textContent,
        ...root.childNodes.map((child) => collectVirtualText(child))
    ].join(" ");
}

function createControlledRankDataSourceHarness(kind) {
    const sources = [];
    return {
        createSource() {
            const source = {
                calls: [],
                cancelCount: 0,
                resetCount: 0,
                stopCount: 0,
                cancel() {
                    source.cancelCount += 1;
                    abortControlledRankCalls(source.calls);
                },
                load(...args) {
                    const contextKey = kind === "status"
                        ? `${String(args[0]).trim()}|${String(args[1]).replaceAll("-", "")}`
                        : String(args[0]).trim();
                    const deferred = createDeferredResult();
                    const call = {
                        args,
                        contextKey,
                        promise: deferred.promise,
                        resolve: deferred.resolve,
                        settled: deferred.isSettled
                    };
                    source.calls.push(call);
                    return call.promise;
                },
                reset() {
                    source.resetCount += 1;
                    abortControlledRankCalls(source.calls);
                },
                stop() {
                    source.stopCount += 1;
                    abortControlledRankCalls(source.calls);
                }
            };
            sources.push(source);
            return source;
        },
        sources
    };
}

function abortControlledRankCalls(calls) {
    for (const call of calls) {
        if (!call.settled()) {
            call.resolve({
                status: "error",
                contextKey: call.contextKey,
                reason: "aborted"
            });
        }
    }
}

function createDeferredResult() {
    let settled = false;
    let resolvePromise;
    const promise = new Promise((resolve) => {
        resolvePromise = resolve;
    });
    return {
        isSettled() {
            return settled;
        },
        promise,
        resolve(value) {
            if (settled) {
                return;
            }
            settled = true;
            resolvePromise(value);
        }
    };
}

function createReadyRankStatusResult(facilityId, stayDate) {
    const compactStayDate = stayDate.replaceAll("-", "");
    return {
        status: "ready",
        contextKey: `${facilityId}|${compactStayDate}`,
        facilityId,
        snapshot: {
            events: [],
            invalidEventCount: 0,
            stayDate: compactStayDate
        },
        stayDate: compactStayDate
    };
}

function sliceSourceBetween(source, startMarker, endMarker) {
    const startIndex = source.indexOf(startMarker);
    assert.notEqual(startIndex, -1, `source start marker not found: ${startMarker}`);
    const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
    assert.notEqual(endIndex, -1, `source end marker not found: ${endMarker}`);
    return source.slice(startIndex, endIndex);
}
