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
const adjustmentModel = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveAdjustmentResponseModel.ts",
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
const rankOrderModel = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveRankOrderModel.ts",
    import.meta.url
);
const rankOrderDataSourceModule = await importBundledTypeScript(
    "../src/next/analyze/bookingCurveRankOrderDataSource.ts",
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
const salesSettingRuntime = await importBundledTypeScript(
    "../src/next/analyze/salesSettingClassicRuntime.ts",
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
        this.ownerDocument = ownerDocument;
        this.parentElement = null;
        this.style = {};
        this.tagName = tagName;
        this.textContent = "";
    }

    addEventListener() {}

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
    rankOrderDataSourceSource,
    rankOrderModelSource,
    rankReadCoordinatorSource,
    adjustmentModelSource,
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
    readFile(new URL("../src/next/analyze/bookingCurveRankOrderDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankOrderModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankReadCoordinator.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveAdjustmentResponseModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceView.ts", import.meta.url), "utf8")
]);

assert.equal(runtime.parseBookingCurveReferenceAnalyzeStayDate("/analyze/2026-08-12"), "20260812");
assert.equal(runtime.parseBookingCurveReferenceAnalyzeStayDate("/analyze/2026-02-29"), null);
assert.equal(runtime.parseBookingCurveReferenceAnalyzeStayDate("/"), null);
assert.equal(runtime.shouldStartBookingCurveRankOrderLoad({
    hasError: false,
    hasSnapshot: false,
    loading: false,
    rankHistory: { status: "ready", events: [{ signature: "event" }] },
    scopeKind: "roomGroup"
}), true);
for (const rankHistory of [
    { status: "empty", invalidEventCount: 0 },
    { status: "error", reason: "request-failed" },
    { status: "loading" }
]) {
    assert.equal(runtime.shouldStartBookingCurveRankOrderLoad({
        hasError: false,
        hasSnapshot: false,
        loading: false,
        rankHistory,
        scopeKind: "roomGroup"
    }), false, `rank order must stay idle for rank history ${rankHistory.status}`);
}
assert.equal(runtime.shouldStartBookingCurveRankOrderLoad({
    hasError: false,
    hasSnapshot: false,
    loading: false,
    rankHistory: { status: "ready", events: [] },
    scopeKind: "roomGroup"
}), false, "rank order must stay idle when no applicable rank event exists");
assert.equal(runtime.shouldStartBookingCurveRankOrderLoad({
    hasError: false,
    hasSnapshot: false,
    loading: false,
    rankHistory: { status: "ready", events: [{ signature: "event" }] },
    scopeKind: "hotel"
}), false);

const salesRankOrderGateCases = [
    {
        expected: true,
        label: "an open room with a ready rank event",
        options: {
            active: true,
            hasError: false,
            hasSnapshot: false,
            loading: false,
            open: true,
            rankHistory: { status: "ready", events: [{ signature: "event" }] },
            scopeKind: "roomGroup"
        }
    },
    {
        expected: false,
        label: "a closed room",
        options: {
            active: true,
            hasError: false,
            hasSnapshot: false,
            loading: false,
            open: false,
            rankHistory: { status: "ready", events: [{ signature: "event" }] },
            scopeKind: "roomGroup"
        }
    },
    ...["loading", "empty", "error"].map((status) => ({
        expected: false,
        label: `rank history ${status}`,
        options: {
            active: true,
            hasError: false,
            hasSnapshot: false,
            loading: false,
            open: true,
            rankHistory: status === "empty"
                ? { status, invalidEventCount: 0 }
                : status === "error"
                    ? { status, reason: "request-failed" }
                    : { status },
            scopeKind: "roomGroup"
        }
    })),
    {
        expected: false,
        label: "hotel scope",
        options: {
            active: true,
            hasError: false,
            hasSnapshot: false,
            loading: false,
            open: true,
            rankHistory: { status: "ready", events: [{ signature: "event" }] },
            scopeKind: "hotel"
        }
    },
    {
        expected: false,
        label: "an inactive sales surface",
        options: {
            active: false,
            hasError: false,
            hasSnapshot: false,
            loading: false,
            open: true,
            rankHistory: { status: "ready", events: [{ signature: "event" }] },
            scopeKind: "roomGroup"
        }
    },
    {
        expected: false,
        label: "a second room while the facility rank order is loading",
        options: {
            active: true,
            hasError: false,
            hasSnapshot: false,
            loading: true,
            open: true,
            rankHistory: { status: "ready", events: [{ signature: "event" }] },
            scopeKind: "roomGroup"
        }
    },
    {
        expected: false,
        label: "a second room after the facility rank order is ready",
        options: {
            active: true,
            hasError: false,
            hasSnapshot: true,
            loading: false,
            open: true,
            rankHistory: { status: "ready", events: [{ signature: "event" }] },
            scopeKind: "roomGroup"
        }
    }
];
for (const testCase of salesRankOrderGateCases) {
    assert.equal(
        salesSettingRuntime.shouldStartSalesSettingRankOrderLoad(testCase.options),
        testCase.expected,
        `SalesSetting rank-order GET gate must reject ${testCase.label}`
    );
}
assert.equal(
    salesRankOrderGateCases.filter((testCase) => (
        salesSettingRuntime.shouldStartSalesSettingRankOrderLoad(testCase.options)
    )).length,
    1,
    "SalesSetting must permit one rank-order load only for an open room with a ready event"
);

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

const parsedRankOrder = rankOrderModel.parseBookingCurveRankOrderResponse({
    rank_sequences: [
        { price_rank_code: "high", price_rank_name: "A", default_sequence: 999 },
        { price_rank_code: "mid", price_rank_name: "B", default_sequence: 1 },
        { price_rank_code: "low", price_rank_name: "C", default_sequence: 2 }
    ]
});
assert.deepEqual(parsedRankOrder, {
    entries: [
        { code: "high", name: "A" },
        { code: "mid", name: "B" },
        { code: "low", name: "C" }
    ]
}, "rank order must preserve the settings-screen array order and ignore default_sequence");
assert.equal(rankOrderModel.parseBookingCurveRankOrderResponse({ rank_sequences: [] }), null);
assert.equal(rankOrderModel.parseBookingCurveRankOrderResponse({
    rank_sequences: [
        { price_rank_code: "1", price_rank_name: "A" },
        { price_rank_code: "1", price_rank_name: "B" }
    ]
}), null, "duplicate rank codes must fail closed");
assert.equal(rankOrderModel.parseBookingCurveRankOrderResponse({
    rank_sequences: [
        { price_rank_code: "1", price_rank_name: "A" },
        { price_rank_code: "2", price_rank_name: "A" }
    ]
}), null, "duplicate rank names cannot resolve name-only history safely");

const rankUrl = transport.buildNextReadUrl(
    { kind: "rank-status", from: "20260812", to: "20260812" },
    "https://ra.jalan.net"
);
assert.equal(rankUrl.pathname, "/api/v3/lincoln/suggest/status");
assert.equal(rankUrl.searchParams.get("filter_type"), "stay_date");
assert.equal(rankUrl.searchParams.get("from"), "20260812");
assert.equal(rankUrl.searchParams.get("to"), "20260812");
const rankOrderUrl = transport.buildNextReadUrl(
    { kind: "rank-sequences" },
    "https://ra.jalan.net"
);
assert.equal(rankOrderUrl.pathname, "/api/v1/rank_sequences");
assert.equal(rankOrderUrl.search, "");

const adjustmentEvents = [
    {
        afterRankName: "12",
        beforeRankName: "11",
        daysBeforeStay: 30,
        reflectedAt: "2026-07-13T03:30:00.000Z",
        reflectedDate: "2026-07-13",
        roomGroupId: "single",
        signature: "2026-07-13:11:12",
        stayDate: "20260812"
    },
    {
        afterRankName: "11",
        beforeRankName: "12",
        daysBeforeStay: 21,
        reflectedAt: "2026-07-22T03:30:00.000Z",
        reflectedDate: "2026-07-22",
        roomGroupId: "single",
        signature: "2026-07-22:12:11",
        stayDate: "20260812"
    }
];
const adjustmentWindows = adjustmentModel.buildBookingCurveAdjustmentEvaluationWindows({
    asOfDate: "20260723",
    events: adjustmentEvents,
    stayDate: "20260812"
});
assert.deepEqual(
    adjustmentWindows.map((window) => [window.startLeadDays, window.endLeadDays, window.endDate]),
    [[30, 22, "2026-07-21"], [21, 20, "2026-07-23"]],
    "each change window must stop the day before the next change, while the latest ends at current as-of"
);
assert.deepEqual(
    adjustmentModel.buildBookingCurveAdjustmentEvaluationTicks(adjustmentWindows),
    [30, 22, 21, 20]
);
const adjustmentResponse = adjustmentModel.buildBookingCurveAdjustmentResponses({
    allowZeroDayCurrent: false,
    currentResponse: {
        stay_date: "20260812",
        booking_curve: [
            ["2026-07-13", 4],
            ["2026-07-21", 8],
            ["2026-07-22", 10],
            ["2026-07-23", 11]
        ].map(([date, rooms]) => ({
            date,
            transient: { this_year_room_sum: rooms }
        }))
    },
    rankOrderEntries: Array.from({ length: 20 }, (_, index) => ({
        code: String(index + 1),
        name: String(index + 1)
    })),
    recentReference: {
        points: [
            { lt: 30, rooms: 5 },
            { lt: 22, rooms: 7 },
            { lt: 21, rooms: 8 },
            { lt: 20, rooms: 10 }
        ]
    },
    seasonalReference: {
        points: [
            { lt: 30, rooms: 4 },
            { lt: 22, rooms: 9 },
            { lt: 21, rooms: 9 },
            { lt: 20, rooms: 12 }
        ]
    },
    windows: adjustmentWindows
});
assert.equal(adjustmentResponse[0].direction, "lower");
assert.equal(adjustmentResponse[0].references[0].gapChangeRooms, 2);
assert.equal(adjustmentResponse[0].references[0].interpretation, "pace-up");
assert.equal(adjustmentResponse[0].references[1].gapChangeRooms, -1);
assert.equal(adjustmentResponse[0].references[1].interpretation, "pace-down");
assert.equal(adjustmentResponse[1].direction, "raise");
assert.equal(adjustmentResponse[1].references[0].interpretation, "restrained-with-buffer");
assert.equal(adjustmentResponse[1].references[1].interpretation, "reference-below");
const raiseBelowReferenceResponse = adjustmentModel.buildBookingCurveAdjustmentResponses({
    allowZeroDayCurrent: false,
    currentResponse: {
        stay_date: "20260812",
        booking_curve: [
            { date: "2026-07-22", transient: { this_year_room_sum: 5 } },
            { date: "2026-07-23", transient: { this_year_room_sum: 6 } }
        ]
    },
    rankOrderEntries: Array.from({ length: 20 }, (_, index) => ({
        code: String(index + 1),
        name: String(index + 1)
    })),
    recentReference: { points: [{ lt: 21, rooms: 8 }, { lt: 20, rooms: 8 }] },
    seasonalReference: { points: [{ lt: 21, rooms: 7 }, { lt: 20, rooms: 8 }] },
    windows: [adjustmentWindows[1]]
});
assert.equal(raiseBelowReferenceResponse[0].references[0].gapChangeRooms, 1);
assert.equal(raiseBelowReferenceResponse[0].references[0].interpretation, "reference-below");
assert.equal(raiseBelowReferenceResponse[0].references[1].gapChangeRooms, 0);
assert.equal(
    raiseBelowReferenceResponse[0].references[1].interpretation,
    "reference-below",
    "a raised rank that ends below reference must not be labelled as pace-up or variation-small"
);
const unresolvedAdjustmentResponse = adjustmentModel.buildBookingCurveAdjustmentResponses({
    allowZeroDayCurrent: false,
    currentResponse: {
        stay_date: "20260812",
        booking_curve: [
            { date: "2026-07-22", transient: { this_year_room_sum: 10 } },
            { date: "2026-07-23", transient: { this_year_room_sum: 11 } }
        ]
    },
    rankOrderEntries: null,
    recentReference: { points: [{ lt: 21, rooms: 8 }, { lt: 20, rooms: 10 }] },
    seasonalReference: { points: [{ lt: 21, rooms: 9 }, { lt: 20, rooms: 12 }] },
    windows: [adjustmentWindows[1]]
});
assert.equal(unresolvedAdjustmentResponse[0].direction, "unresolved");
assert.equal(
    unresolvedAdjustmentResponse[0].references[0].interpretation,
    "direction-unresolved",
    "rank-order failure must retain numeric gaps while withholding directional interpretation"
);
const missingExactResponse = adjustmentModel.buildBookingCurveAdjustmentResponses({
    allowZeroDayCurrent: false,
    currentResponse: {
        stay_date: "20260812",
        booking_curve: [{ date: "2026-07-13", transient: { this_year_room_sum: 4 } }]
    },
    rankOrderEntries: parsedRankOrder.entries,
    recentReference: { points: [{ lt: 30, rooms: 5 }, { lt: 22, rooms: 7 }] },
    seasonalReference: { points: [{ lt: 30, rooms: 4 }, { lt: 22, rooms: 9 }] },
    windows: [adjustmentWindows[0]]
});
assert.equal(missingExactResponse[0].references[0].status, "pending");
assert.equal(missingExactResponse[0].references[0].missingReason, "current-end-missing");
const postMissingWindows = adjustmentModel.buildBookingCurveAdjustmentEvaluationWindows({
    asOfDate: "20260723",
    events: [{ ...adjustmentEvents[1], reflectedDate: "2026-07-23", daysBeforeStay: 20 }],
    stayDate: "20260812"
});
assert.equal(postMissingWindows[0].missingReason, "post-observation-missing");

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
    rankOrder: {
        status: "ready",
        entries: Array.from({ length: 20 }, (_, index) => ({
            code: String(index + 1),
            name: String(index + 1)
        }))
    },
    scope: roomScope,
    scopes,
    stayDate: "20260812"
});
assert.equal(roomRankBuilt.status, "ready");
assert.equal(roomRankBuilt.viewModel.panels[0].rankMarkers.length, 1);
assert.equal(roomRankBuilt.viewModel.panels[0].rankMarkers[0].value, 4);
assert.equal(roomRankBuilt.viewModel.panels[1].rankMarkers[0].value, 3);
assert.equal(roomRankBuilt.viewModel.adjustmentResponse.status, "ready");
assert.equal(roomRankBuilt.viewModel.adjustmentResponse.events[0].direction, "raise");
assert.equal(
    roomRankBuilt.viewModel.adjustmentResponse.events[0].references[0].missingReason,
    "current-start-missing",
    "a marker may use the prior point, but response evaluation must require an exact adjustment-day point"
);
assert.equal(built.viewModel.panels.every((panel) => panel.rankMarkers.length === 0), true);
assert.deepEqual(built.viewModel.adjustmentResponse, { status: "scope-required" });

const embeddedDocument = createVirtualDocument();
const embeddedRoomCurve = view.createEmbeddedBookingCurveReference(
    embeddedDocument,
    roomRankBuilt.viewModel,
    singleRankHistory,
    { narrow: false, titleId: "room-booking-curve-title" }
);
const embeddedRoomAdjustmentSections = findVirtualElementsByAttribute(
    embeddedRoomCurve,
    "data-ra-next-booking-curve-adjustment-response"
);
assert.equal(
    embeddedRoomAdjustmentSections.length,
    1,
    "embedded room booking curve must preserve the adjustment-response section"
);
assert.equal(embeddedRoomAdjustmentSections[0].parentElement, embeddedRoomCurve);
assert.equal(embeddedRoomAdjustmentSections[0].getAttribute(
    "data-ra-next-booking-curve-adjustment-response"
), "ready");
assert.match(readVirtualText(embeddedRoomAdjustmentSections[0]), /調整後のペース/u);
assert.equal(
    findVirtualElementsByAttribute(
        embeddedRoomAdjustmentSections[0],
        "data-ra-next-booking-curve-adjustment-response-event"
    ).length,
    roomRankBuilt.viewModel.adjustmentResponse.events.length
);

const embeddedRankOrderFailureCurve = view.createEmbeddedBookingCurveReference(
    embeddedDocument,
    {
        ...roomRankBuilt.viewModel,
        adjustmentResponse: {
            status: "ready",
            events: unresolvedAdjustmentResponse,
            rankOrderStatus: "error"
        }
    },
    singleRankHistory,
    { narrow: false, titleId: "room-booking-curve-rank-order-error-title" }
);
const embeddedRankOrderFailureSection = findVirtualElementsByAttribute(
    embeddedRankOrderFailureCurve,
    "data-ra-next-booking-curve-adjustment-response"
)[0];
assert.notEqual(embeddedRankOrderFailureSection, undefined);
assert.equal(findVirtualElementsByAttribute(
    embeddedRankOrderFailureSection,
    "data-ra-next-booking-curve-adjustment-rank-order"
)[0]?.getAttribute("data-ra-next-booking-curve-adjustment-rank-order"), "error");
assert.match(readVirtualText(embeddedRankOrderFailureSection), /ランク方向は未確認/u);
assert.match(
    readVirtualText(embeddedRankOrderFailureSection),
    /参考線との差 \+2室 → \+1室/u,
    "rank-order failure must preserve the embedded numeric gap comparison"
);

const embeddedHotelCurve = view.createEmbeddedBookingCurveReference(
    embeddedDocument,
    built.viewModel,
    { status: "scope-required" },
    { narrow: false, titleId: "hotel-booking-curve-title" }
);
const embeddedHotelAdjustmentSections = findVirtualElementsByAttribute(
    embeddedHotelCurve,
    "data-ra-next-booking-curve-adjustment-response"
);
assert.equal(embeddedHotelAdjustmentSections.length, 1);
assert.equal(embeddedHotelAdjustmentSections[0].getAttribute(
    "data-ra-next-booking-curve-adjustment-response"
), "scope-required");
assert.equal(
    findVirtualElementsByAttribute(
        embeddedHotelAdjustmentSections[0],
        "data-ra-next-booking-curve-adjustment-response-event"
    ).length,
    0,
    "embedded hotel booking curve must not show room adjustment events"
);
assert.match(readVirtualText(embeddedHotelAdjustmentSections[0]), /部屋タイプを選ぶ/u);

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

const rankOrderRequests = [];
const rankOrderDataSource = rankOrderDataSourceModule.createBookingCurveRankOrderDataSource({
    transport: {
        async read(request) {
            rankOrderRequests.push(request);
            return {
                rank_sequences: [
                    { price_rank_code: "1", price_rank_name: "1" },
                    { price_rank_code: "2", price_rank_name: "2" }
                ]
            };
        }
    },
    windowHost: {}
});
const firstRankOrderLoad = await rankOrderDataSource.load("yad:fixture");
const reusedRankOrderLoad = await rankOrderDataSource.load("yad:fixture");
assert.equal(firstRankOrderLoad.status, "ready");
assert.equal(reusedRankOrderLoad.status, "ready");
assert.deepEqual(rankOrderRequests, [{ kind: "rank-sequences" }]);
rankOrderDataSource.stop();

let abortRankOrderRequestCount = 0;
const abortingRankOrderDataSource = rankOrderDataSourceModule.createBookingCurveRankOrderDataSource({
    transport: {
        async read(_request, signal) {
            abortRankOrderRequestCount += 1;
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    reject(new DOMException("aborted", "AbortError"));
                }, { once: true });
            });
        }
    },
    windowHost: {}
});
const abortedRankOrderLoadPromise = abortingRankOrderDataSource.load("yad:fixture");
abortingRankOrderDataSource.cancel();
assert.equal((await abortedRankOrderLoadPromise).reason, "aborted");
assert.equal((await abortingRankOrderDataSource.load("yad:fixture")).reason, "aborted");
assert.equal(abortRankOrderRequestCount, 1, "aborted rank order context must not retry automatically");
abortingRankOrderDataSource.stop();

const sharedRankStatusHarness = createControlledRankDataSourceHarness("status");
const sharedRankOrderHarness = createControlledRankDataSourceHarness("order");
const sharedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: sharedRankOrderHarness.createSource,
    createRankStatusDataSource: sharedRankStatusHarness.createSource
});
const sharedStandaloneRankReads = sharedRankCoordinator.createConsumer("standalone");
const sharedSalesRankReads = sharedRankCoordinator.createConsumer("sales");
const sharedStatusLoads = [
    sharedStandaloneRankReads.rankStatusDataSource.load("yad:shared", "20260812"),
    sharedSalesRankReads.rankStatusDataSource.load("yad:shared", "2026-08-12")
];
const sharedOrderLoads = [
    sharedStandaloneRankReads.rankOrderDataSource.load("yad:shared"),
    sharedSalesRankReads.rankOrderDataSource.load(" yad:shared ")
];
assert.equal(sharedRankStatusHarness.sources.length, 1);
assert.equal(sharedRankStatusHarness.sources[0].calls.length, 1);
assert.equal(sharedRankOrderHarness.sources.length, 1);
assert.equal(sharedRankOrderHarness.sources[0].calls.length, 1);
sharedRankStatusHarness.sources[0].calls[0].resolve(createReadyRankStatusResult(
    "yad:shared",
    "20260812"
));
sharedRankOrderHarness.sources[0].calls[0].resolve(createReadyRankOrderResult("yad:shared"));
assert.deepEqual(
    (await Promise.all(sharedStatusLoads)).map((result) => result.status),
    ["ready", "ready"]
);
assert.deepEqual(
    (await Promise.all(sharedOrderLoads)).map((result) => result.status),
    ["ready", "ready"]
);
const lateRankConsumer = sharedRankCoordinator.createConsumer("late-consumer");
assert.equal(
    (await lateRankConsumer.rankStatusDataSource.load("yad:shared", "20260812")).status,
    "ready"
);
assert.equal(
    (await lateRankConsumer.rankOrderDataSource.load("yad:shared")).status,
    "ready"
);
assert.equal(
    sharedRankStatusHarness.sources.length,
    1,
    "sequential and concurrent consumers must share one rank-status GET per facility/stay key"
);
assert.equal(
    sharedRankOrderHarness.sources.length,
    1,
    "sequential and concurrent consumers must share one rank-sequences GET per facility key"
);
sharedRankCoordinator.stop();
assert.equal(sharedRankStatusHarness.sources[0].stopCount, 1);
assert.equal(sharedRankOrderHarness.sources[0].stopCount, 1);
assert.equal(
    (await lateRankConsumer.rankStatusDataSource.load("yad:shared", "20260812")).reason,
    "aborted"
);
assert.equal(
    (await lateRankConsumer.rankOrderDataSource.load("yad:shared")).reason,
    "aborted"
);
sharedRankCoordinator.stop();
assert.equal(sharedRankStatusHarness.sources[0].stopCount, 1, "coordinator stop must be idempotent");
assert.equal(sharedRankOrderHarness.sources[0].stopCount, 1, "coordinator stop must be idempotent");

const sequentialRankStatusHarness = createControlledRankDataSourceHarness("status");
const sequentialRankOrderHarness = createControlledRankDataSourceHarness("order");
const sequentialRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: sequentialRankOrderHarness.createSource,
    createRankStatusDataSource: sequentialRankStatusHarness.createSource
});
const sequentialA = sequentialRankCoordinator.createConsumer("sequential-a");
const sequentialB = sequentialRankCoordinator.createConsumer("sequential-b");
const sequentialStatusLoads = [
    sequentialA.rankStatusDataSource.load("yad:sequential", "20260812"),
    sequentialB.rankStatusDataSource.load("yad:sequential", "20260812")
];
sequentialRankStatusHarness.sources[0].calls[0].resolve(createReadyRankStatusResult(
    "yad:sequential",
    "20260812"
));
assert.deepEqual(
    (await Promise.all(sequentialStatusLoads)).map((result) => result.status),
    ["ready", "ready"]
);
sequentialA.rankStatusDataSource.reset();
assert.equal(
    (await sequentialB.rankStatusDataSource.load("yad:sequential", "20260812")).status,
    "ready",
    "one consumer reset must not invalidate a settled success still leased by the other"
);
assert.equal(sequentialRankStatusHarness.sources.length, 1);
assert.equal(sequentialRankStatusHarness.sources[0].calls.length, 1);
sequentialB.rankStatusDataSource.reset();
const reenteredStatusLoads = [
    sequentialA.rankStatusDataSource.load("yad:sequential", "20260812"),
    sequentialB.rankStatusDataSource.load("yad:sequential", "20260812")
];
assert.equal(
    sequentialRankStatusHarness.sources.length,
    2,
    "after both route resets, same-key status re-entry must create one fresh source"
);
assert.deepEqual(sequentialRankStatusHarness.sources.map((source) => source.calls.length), [1, 1]);
sequentialRankStatusHarness.sources[1].calls[0].resolve(createReadyRankStatusResult(
    "yad:sequential",
    "20260812"
));
assert.deepEqual(
    (await Promise.all(reenteredStatusLoads)).map((result) => result.status),
    ["ready", "ready"]
);

const sequentialOrderLoads = [
    sequentialA.rankOrderDataSource.load("yad:sequential"),
    sequentialB.rankOrderDataSource.load("yad:sequential")
];
sequentialRankOrderHarness.sources[0].calls[0].resolve(createReadyRankOrderResult("yad:sequential"));
assert.deepEqual(
    (await Promise.all(sequentialOrderLoads)).map((result) => result.status),
    ["ready", "ready"]
);
sequentialA.rankOrderDataSource.cancel();
assert.equal(
    (await sequentialB.rankOrderDataSource.load("yad:sequential")).status,
    "ready",
    "one consumer release must not invalidate a settled order result still leased by the other"
);
assert.equal(sequentialRankOrderHarness.sources.length, 1);
assert.equal(sequentialRankOrderHarness.sources[0].calls.length, 1);
sequentialA.rankOrderDataSource.reset();
sequentialB.rankOrderDataSource.reset();
const reenteredOrderLoads = [
    sequentialA.rankOrderDataSource.load("yad:sequential"),
    sequentialB.rankOrderDataSource.load("yad:sequential")
];
assert.equal(
    sequentialRankOrderHarness.sources.length,
    2,
    "after both route resets, same-key order re-entry must create one fresh source"
);
assert.deepEqual(sequentialRankOrderHarness.sources.map((source) => source.calls.length), [1, 1]);
sequentialRankOrderHarness.sources[1].calls[0].resolve(createReadyRankOrderResult("yad:sequential"));
assert.deepEqual(
    (await Promise.all(reenteredOrderLoads)).map((result) => result.status),
    ["ready", "ready"]
);
sequentialRankCoordinator.stop();

const cancelResetRankStatusHarness = createControlledRankDataSourceHarness("status");
const cancelResetRankOrderHarness = createControlledRankDataSourceHarness("order");
const cancelResetRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: cancelResetRankOrderHarness.createSource,
    createRankStatusDataSource: cancelResetRankStatusHarness.createSource
});
const cancelResetConsumer = cancelResetRankCoordinator.createConsumer("cancel-reset");
const firstCancelResetStatusLoad = cancelResetConsumer.rankStatusDataSource.load(
    "yad:cancel-reset",
    "20260812"
);
cancelResetRankStatusHarness.sources[0].calls[0].resolve(createReadyRankStatusResult(
    "yad:cancel-reset",
    "20260812"
));
assert.equal((await firstCancelResetStatusLoad).status, "ready");
cancelResetConsumer.rankStatusDataSource.cancel();
cancelResetConsumer.rankStatusDataSource.reset();
const freshCancelResetStatusLoad = cancelResetConsumer.rankStatusDataSource.load(
    "yad:cancel-reset",
    "20260812"
);
assert.equal(
    cancelResetRankStatusHarness.sources.length,
    2,
    "cancel followed by a route reset must invalidate the released status cache"
);
assert.equal(cancelResetRankStatusHarness.sources[0].stopCount, 1);
cancelResetRankStatusHarness.sources[1].calls[0].resolve(createReadyRankStatusResult(
    "yad:cancel-reset",
    "20260812"
));
assert.equal((await freshCancelResetStatusLoad).status, "ready");

const firstCancelResetOrderLoad = cancelResetConsumer.rankOrderDataSource.load("yad:cancel-reset");
cancelResetRankOrderHarness.sources[0].calls[0].resolve(createReadyRankOrderResult("yad:cancel-reset"));
assert.equal((await firstCancelResetOrderLoad).status, "ready");
cancelResetConsumer.rankOrderDataSource.cancel();
cancelResetConsumer.rankOrderDataSource.reset();
const freshCancelResetOrderLoad = cancelResetConsumer.rankOrderDataSource.load("yad:cancel-reset");
assert.equal(
    cancelResetRankOrderHarness.sources.length,
    2,
    "cancel followed by a route reset must invalidate the released rank-order cache"
);
assert.equal(cancelResetRankOrderHarness.sources[0].stopCount, 1);
cancelResetRankOrderHarness.sources[1].calls[0].resolve(createReadyRankOrderResult("yad:cancel-reset"));
assert.equal((await freshCancelResetOrderLoad).status, "ready");
cancelResetRankCoordinator.stop();

const salesRoomRankOrderHarness = createControlledRankDataSourceHarness("order");
const salesRoomRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: salesRoomRankOrderHarness.createSource
});
const salesRoomRankReads = salesRoomRankCoordinator.createConsumer("sales-room-sequence");
let salesRoomRankOrderLoading = false;
let salesRoomRankOrderSnapshot = null;
let salesRoomRankOrderLoad = null;
const reconcileSalesRoomRankOrder = (signature) => {
    const shouldLoad = salesSettingRuntime.shouldStartSalesSettingRankOrderLoad({
        active: true,
        hasError: false,
        hasSnapshot: salesRoomRankOrderSnapshot !== null,
        loading: salesRoomRankOrderLoading,
        open: true,
        rankHistory: { status: "ready", events: [{ signature }] },
        scopeKind: "roomGroup"
    });
    if (!shouldLoad) {
        return;
    }
    salesRoomRankOrderLoading = true;
    salesRoomRankOrderLoad = salesRoomRankReads.rankOrderDataSource.load("yad:sales-room-sequence")
        .then((result) => {
            salesRoomRankOrderLoading = false;
            if (result.status === "ready") {
                salesRoomRankOrderSnapshot = result.snapshot;
            }
            return result;
        });
};
reconcileSalesRoomRankOrder("room-a-event");
assert.equal(salesRoomRankOrderHarness.sources.length, 1);
reconcileSalesRoomRankOrder("room-b-event");
assert.equal(
    salesRoomRankOrderHarness.sources.length,
    1,
    "a transient Sales remount and second room open must retain the pending facility rank-order read"
);
salesRoomRankOrderHarness.sources[0].calls[0].resolve(createReadyRankOrderResult(
    "yad:sales-room-sequence"
));
assert.equal((await salesRoomRankOrderLoad).status, "ready");
reconcileSalesRoomRankOrder("room-b-event");
assert.equal(
    salesRoomRankOrderHarness.sources.length,
    1,
    "a later room rebuild must reuse the ready facility rank-order result"
);
assert.equal(salesRoomRankOrderHarness.sources[0].calls.length, 1);
salesRoomRankCoordinator.stop();

const retryRankStatusHarness = createControlledRankDataSourceHarness("status");
const retryRankOrderHarness = createControlledRankDataSourceHarness("order");
const retryRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: retryRankOrderHarness.createSource,
    createRankStatusDataSource: retryRankStatusHarness.createSource
});
const retryA = retryRankCoordinator.createConsumer("retry-a");
const retryB = retryRankCoordinator.createConsumer("retry-b");
const failedStatusLoads = [
    retryA.rankStatusDataSource.load("yad:retry", "20260812"),
    retryB.rankStatusDataSource.load("yad:retry", "20260812")
];
retryRankStatusHarness.sources[0].calls[0].resolve(createFailedRankStatusResult(
    "yad:retry",
    "20260812"
));
assert.deepEqual(
    (await Promise.all(failedStatusLoads)).map((result) => result.reason),
    ["request-failed", "request-failed"]
);
retryA.rankStatusDataSource.reset();
assert.equal(
    (await retryB.rankStatusDataSource.load("yad:retry", "20260812")).reason,
    "request-failed",
    "one reset must not replace a settled failure still leased by the other consumer"
);
assert.equal(retryRankStatusHarness.sources.length, 1);
retryB.rankStatusDataSource.reset();
const retriedStatusLoads = [
    retryA.rankStatusDataSource.load("yad:retry", "20260812"),
    retryB.rankStatusDataSource.load("yad:retry", "20260812")
];
assert.equal(
    retryRankStatusHarness.sources.length,
    2,
    "a settled status failure must not become permanent after both consumers reset"
);
assert.deepEqual(retryRankStatusHarness.sources.map((source) => source.calls.length), [1, 1]);
retryRankStatusHarness.sources[1].calls[0].resolve(createReadyRankStatusResult(
    "yad:retry",
    "20260812"
));
assert.deepEqual(
    (await Promise.all(retriedStatusLoads)).map((result) => result.status),
    ["ready", "ready"]
);

const failedOrderLoads = [
    retryA.rankOrderDataSource.load("yad:retry"),
    retryB.rankOrderDataSource.load("yad:retry")
];
retryRankOrderHarness.sources[0].calls[0].resolve(createFailedRankOrderResult("yad:retry"));
assert.deepEqual(
    (await Promise.all(failedOrderLoads)).map((result) => result.reason),
    ["request-failed", "request-failed"]
);
retryA.rankOrderDataSource.reset();
assert.equal(
    (await retryB.rankOrderDataSource.load("yad:retry")).reason,
    "request-failed",
    "one reset must not replace a settled order failure still leased by the other consumer"
);
assert.equal(retryRankOrderHarness.sources.length, 1);
retryB.rankOrderDataSource.reset();
const retriedOrderLoads = [
    retryA.rankOrderDataSource.load("yad:retry"),
    retryB.rankOrderDataSource.load("yad:retry")
];
assert.equal(
    retryRankOrderHarness.sources.length,
    2,
    "a settled order failure must not become permanent after both consumers reset"
);
assert.deepEqual(retryRankOrderHarness.sources.map((source) => source.calls.length), [1, 1]);
retryRankOrderHarness.sources[1].calls[0].resolve(createReadyRankOrderResult("yad:retry"));
assert.deepEqual(
    (await Promise.all(retriedOrderLoads)).map((result) => result.status),
    ["ready", "ready"]
);
retryRankCoordinator.stop();

const retainedRankStatusHarness = createControlledRankDataSourceHarness("status");
const retainedRankOrderHarness = createControlledRankDataSourceHarness("order");
const retainedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: retainedRankOrderHarness.createSource,
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
const releasedOrderLoad = releasingRankConsumer.rankOrderDataSource.load("yad:retained");
const retainedOrderLoad = retainedRankConsumer.rankOrderDataSource.load("yad:retained");
releasingRankConsumer.rankOrderDataSource.reset();
assert.equal((await releasedOrderLoad).reason, "aborted");
assert.equal(
    retainedRankOrderHarness.sources[0].cancelCount,
    0,
    "one consumer reset must not abort another consumer's active rank-sequences read"
);
retainedRankOrderHarness.sources[0].calls[0].resolve(createReadyRankOrderResult("yad:retained"));
assert.equal((await retainedOrderLoad).status, "ready");
retainedRankCoordinator.stop();

const releasedRankStatusHarness = createControlledRankDataSourceHarness("status");
const releasedRankOrderHarness = createControlledRankDataSourceHarness("order");
const releasedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: releasedRankOrderHarness.createSource,
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
const releaseOrderLoads = [
    releaseA.rankOrderDataSource.load("yad:release"),
    releaseB.rankOrderDataSource.load("yad:release")
];
releaseA.rankOrderDataSource.reset();
assert.equal(releasedRankOrderHarness.sources[0].cancelCount, 0);
releaseB.stop();
assert.equal(
    releasedRankOrderHarness.sources[0].cancelCount,
    1,
    "the last rank-sequences lease release must abort the in-flight underlying read"
);
assert.deepEqual(
    (await Promise.all(releaseOrderLoads)).map((result) => result.reason),
    ["aborted", "aborted"]
);
assert.equal(
    (await releaseB.rankOrderDataSource.load("yad:release")).reason,
    "aborted",
    "a stopped consumer must remain stopped"
);
releasedRankCoordinator.stop();

const handoffRankStatusHarness = createControlledRankDataSourceHarness("status");
const handoffRankOrderHarness = createControlledRankDataSourceHarness("order");
const handoffRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: handoffRankOrderHarness.createSource,
    createRankStatusDataSource: handoffRankStatusHarness.createSource
});
const handoffA = handoffRankCoordinator.createConsumer("handoff-a");
const handoffB = handoffRankCoordinator.createConsumer("handoff-b");
const oldStatusLoads = [
    handoffA.rankStatusDataSource.load("yad:old", "20260812"),
    handoffB.rankStatusDataSource.load("yad:old", "20260812")
];
const newStatusA = handoffA.rankStatusDataSource.load("yad:new", "20260813");
assert.equal(
    handoffRankStatusHarness.sources.length,
    2,
    "a consumer may begin the new status key while another consumer still releases the old key"
);
assert.deepEqual(
    handoffRankStatusHarness.sources.map((source) => source.calls.length),
    [1, 1],
    "status handoff must create one underlying call per key"
);
assert.equal((await oldStatusLoads[0]).reason, "aborted");
assert.equal(handoffRankStatusHarness.sources[0].cancelCount, 0);
handoffRankStatusHarness.sources[1].calls[0].resolve(createReadyRankStatusResult(
    "yad:new",
    "20260813"
));
assert.equal((await newStatusA).status, "ready");
const newStatusB = handoffB.rankStatusDataSource.load("yad:new", "20260813");
assert.equal(
    handoffRankStatusHarness.sources[0].cancelCount,
    1,
    "the old in-flight status read must abort when its final consumer switches keys"
);
assert.equal((await oldStatusLoads[1]).reason, "aborted");
assert.equal((await newStatusB).status, "ready");
assert.equal(handoffRankStatusHarness.sources.length, 2);
assert.deepEqual(handoffRankStatusHarness.sources.map((source) => source.calls.length), [1, 1]);

const oldOrderLoads = [
    handoffA.rankOrderDataSource.load("yad:old"),
    handoffB.rankOrderDataSource.load("yad:old")
];
const newOrderA = handoffA.rankOrderDataSource.load("yad:new");
assert.equal(
    handoffRankOrderHarness.sources.length,
    2,
    "a consumer may begin the new rank-sequences key while another consumer still releases the old key"
);
assert.deepEqual(
    handoffRankOrderHarness.sources.map((source) => source.calls.length),
    [1, 1],
    "rank-sequences handoff must create one underlying call per key"
);
assert.equal((await oldOrderLoads[0]).reason, "aborted");
assert.equal(handoffRankOrderHarness.sources[0].cancelCount, 0);
handoffRankOrderHarness.sources[1].calls[0].resolve(createReadyRankOrderResult("yad:new"));
assert.equal((await newOrderA).status, "ready");
const newOrderB = handoffB.rankOrderDataSource.load("yad:new");
assert.equal(
    handoffRankOrderHarness.sources[0].cancelCount,
    1,
    "the old in-flight rank-sequences read must abort when its final consumer switches keys"
);
assert.equal((await oldOrderLoads[1]).reason, "aborted");
assert.equal((await newOrderB).status, "ready");
assert.equal(handoffRankOrderHarness.sources.length, 2);
assert.deepEqual(handoffRankOrderHarness.sources.map((source) => source.calls.length), [1, 1]);
handoffRankCoordinator.stop();

const mismatchedRankStatusHarness = createControlledRankDataSourceHarness("status");
const mismatchedRankOrderHarness = createControlledRankDataSourceHarness("order");
const mismatchedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: mismatchedRankOrderHarness.createSource,
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
const mismatchedOrderLoad = mismatchedRankConsumer.rankOrderDataSource.load("yad:expected");
mismatchedRankOrderHarness.sources[0].calls[0].resolve(createReadyRankOrderResult("yad:stale"));
assert.deepEqual(await mismatchedOrderLoad, {
    status: "error",
    contextKey: "yad:expected",
    reason: "request-failed"
});
mismatchedRankCoordinator.stop();

const stoppedRankStatusHarness = createControlledRankDataSourceHarness("status");
const stoppedRankOrderHarness = createControlledRankDataSourceHarness("order");
const stoppedRankCoordinator = rankReadCoordinatorModule.createBookingCurveRankReadCoordinator({
    createRankOrderDataSource: stoppedRankOrderHarness.createSource,
    createRankStatusDataSource: stoppedRankStatusHarness.createSource
});
const stoppedRankConsumer = stoppedRankCoordinator.createConsumer("stopped-in-flight");
const stoppedStatusLoad = stoppedRankConsumer.rankStatusDataSource.load("yad:stop", "20260812");
const stoppedOrderLoad = stoppedRankConsumer.rankOrderDataSource.load("yad:stop");
stoppedRankCoordinator.stop();
assert.equal(stoppedRankStatusHarness.sources[0].stopCount, 1);
assert.equal(stoppedRankOrderHarness.sources[0].stopCount, 1);
assert.equal((await stoppedStatusLoad).reason, "aborted");
assert.equal((await stoppedOrderLoad).reason, "aborted");
assert.equal(
    (await stoppedRankConsumer.rankStatusDataSource.load("yad:after-stop", "20260814")).reason,
    "aborted"
);
assert.equal(
    (await stoppedRankConsumer.rankOrderDataSource.load("yad:after-stop")).reason,
    "aborted"
);
assert.equal(stoppedRankStatusHarness.sources.length, 1);
assert.equal(stoppedRankOrderHarness.sources.length, 1);

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
assert.match(styles, /data-ra-next-booking-curve-adjustment-response/u);
assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
assert.match(viewSource, /header\.append\(createControls\(root\.ownerDocument, viewModel\)\)/u);
assert.match(viewSource, /export function createEmbeddedBookingCurveReference/u);
assert.match(viewSource, /createControls\(documentHost, viewModel, false\)/u);
assert.match(viewSource, /root\.replaceChildren\(header, legend, grid, adjustmentResponse, details\)/u);
assert.match(viewSource, /現在の参考線で再評価しています/u);
assert.match(viewSource, /因果効果や成功判定ではありません/u);
assert.match(viewSource, /参考線との差/u);
assert.match(viewSource, /比較準備中/u);
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
    /startBookingCurveReferenceRuntime\(document, window, \{[\s\S]*rankOrderDataSource: bookingCurveReferenceRankReads\.rankOrderDataSource,[\s\S]*rankStatusDataSource: bookingCurveReferenceRankReads\.rankStatusDataSource/u,
    "the standalone runtime must receive its own shared-rank consumer adapter"
);
assert.match(
    entrySource,
    /startSalesSettingClassicRuntime\(document, window, \{[\s\S]*rankOrderDataSource: salesSettingRankReads\.rankOrderDataSource,[\s\S]*rankStatusDataSource: salesSettingRankReads\.rankStatusDataSource/u,
    "the SalesSetting runtime must receive a distinct shared-rank consumer adapter"
);
assert.match(runtimeSource, /booking-curve-main-chart-header/u);
assert.match(runtimeSource, /booking-curve-sub-chart-header/u);
assert.match(runtimeSource, /addEventListener\("load", scheduleReconcile/u);
assert.match(runtimeSource, /addEventListener\("pageshow", scheduleReconcile/u);
assert.doesNotMatch(runtimeSource, /seasonal:\s*false/u);
assert.match(salesSettingRuntimeSource, /rankOrderDataSource\?: BookingCurveRankOrderDataSource/u);
assert.match(
    salesSettingRuntimeSource,
    /options\.rankOrderDataSource\s*\?\? createBookingCurveRankOrderDataSource\(\{ windowHost \}\)/u,
    "SalesSetting must provide an injectable rank-order source with the bounded default"
);
assert.match(
    salesSettingRuntimeSource,
    /rankEvents: rankHistory\.status === "ready" \? rankHistory\.events : \[\],[\s\S]*rankHistory,[\s\S]*rankOrder,/u,
    "SalesSetting must pass rank history and rank order into each embedded curve model"
);
assert.match(salesSettingRuntimeSource, /for \(const scopeKey of openScopes\)/u);
assert.match(salesSettingRuntimeSource, /shouldStartSalesSettingRankOrderLoad\(\{[\s\S]*active,[\s\S]*open: true,[\s\S]*rankHistory,[\s\S]*scopeKind: data\.scope\.kind/u);
assert.match(
    salesSettingRuntimeSource,
    /documentHost\.visibilityState !== "hidden"[\s\S]*root\.isConnected[\s\S]*isVisiblyRendered\(surface\.insertionAnchor\)/u,
    "rank-order GETs must be gated by the mounted visible sales surface"
);
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
    "        if (rankOrderLoading) {"
);
assert.match(
    hiddenRankStatusLoadingSource,
    /rankStatusDataSource\.cancel\(\);[\s\S]*rankLoadError = null;[\s\S]*rankLoading = false;/u,
    "hiding the Sales surface must release an in-flight rank-status lease without invalidating its cache"
);
assert.doesNotMatch(hiddenRankStatusLoadingSource, /rankStatusDataSource\.reset\(\)/u);
const hiddenRankOrderLoadingSource = sliceSourceBetween(
    inactiveSalesSurfaceSource,
    "        if (rankOrderLoading) {",
    "        rankStatusDataSource.cancel();"
);
assert.match(
    hiddenRankOrderLoadingSource,
    /rankOrderDataSource\.cancel\(\);[\s\S]*rankOrderLoadError = null;[\s\S]*rankOrderLoading = false;/u,
    "hiding the Sales surface must release an in-flight rank-order lease without a strong reset"
);
assert.doesNotMatch(hiddenRankOrderLoadingSource, /rankOrderDataSource\.reset\(\)/u);
assert.match(
    inactiveSalesSurfaceSource,
    /rankStatusDataSource\.cancel\(\);\s*rankOrderDataSource\.cancel\(\);[\s\S]*if \(root === null\)/u,
    "an inactive Sales surface must release both shared-rank consumer leases even without a mounted root"
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
    /rank(?:Generation|Loading|Order|Status)|DataSource\.(?:cancel|reset)\(\)/u
);
const resetSalesContextSource = sliceSourceBetween(
    salesSettingRuntimeSource,
    "    function resetContext(stayDate: string, asOfDate: string | null): void {",
    "    function startLoadAll(stayDate: string, asOfDate: string, showLoading: boolean): void {"
);
assert.match(resetSalesContextSource, /rankStatusDataSource\.reset\(\);\s*rankOrderDataSource\.reset\(\);/u);
const inactiveSalesRouteSource = sliceSourceBetween(
    salesSettingRuntimeSource,
    "    function suspendForInactiveRoute(): void {",
    "    function suspendForInactiveSurface(finalState: string): void {"
);
assert.match(
    inactiveSalesRouteSource,
    /rankStatusDataSource\.reset\(\);\s*rankOrderDataSource\.reset\(\);/u,
    "a real route exit must still invalidate both bounded rank caches"
);
assert.match(salesSettingRuntimeSource, /rankOrderDataSource\.reset\(\)/u);
assert.match(salesSettingRuntimeSource, /rankOrderDataSource\.cancel\(\)/u);
assert.match(salesSettingRuntimeSource, /rankOrderDataSource\.stop\(\)/u);
assert.match(dataSourceSource, /readExistingIndexedDbRecordsByPrimaryKeys/u);
assert.doesNotMatch(dataSourceSource, /rank|lincoln\/suggest\/status|booking_curve\?date/u);
assert.match(rankDataSourceSource, /kind: "rank-status"/u);
assert.doesNotMatch(rankDataSourceSource, /indexedDB|localStorage|sessionStorage|fetch\s*\(/u);
assert.doesNotMatch(rankModelSource, /reflector_name|reflectorName/u);
assert.match(rankOrderDataSourceSource, /kind: "rank-sequences"/u);
assert.doesNotMatch(rankOrderDataSourceSource, /indexedDB|localStorage|sessionStorage|fetch\s*\(/u);
assert.doesNotMatch(rankOrderModelSource, /default_sequence/u);
assert.match(rankReadCoordinatorSource, /createConsumer\(consumerId/u);
assert.match(rankReadCoordinatorSource, /entry\.leases\.size > 0/u);
assert.doesNotMatch(
    rankReadCoordinatorSource,
    /indexedDB|localStorage|sessionStorage|fetch\s*\(/u,
    "the cross-runtime coordinator must remain memory-only and reuse injected read sources"
);
assert.doesNotMatch(adjustmentModelSource, /all\s*-\s*group|localStorage|indexedDB|fetch\s*\(/u);
assert.match(fixture, /booking-curve-main-chart-header/u);
assert.match(fixture, /booking-curve-sub-chart-header/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /state=|fixtureMode/u);
assert.match(fixtureEntry, /fixtureMode === "future"/u);
assert.match(fixtureEntry, /fixtureMode === "history"/u);
assert.match(fixtureEntry, /rankFixtureMode/u);
assert.match(fixtureEntry, /rankOrderFixtureMode/u);
assert.match(fixtureEntry, /data-mock-rank-order-load-count/u);

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

function readVirtualText(root) {
    return [
        root.textContent,
        ...root.childNodes.map((child) => child instanceof VirtualElement
            ? readVirtualText(child)
            : child.textContent)
    ].join("");
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

function createFailedRankStatusResult(facilityId, stayDate) {
    return {
        status: "error",
        contextKey: `${facilityId}|${stayDate.replaceAll("-", "")}`,
        reason: "request-failed"
    };
}

function createReadyRankOrderResult(facilityId) {
    return {
        status: "ready",
        contextKey: facilityId,
        facilityId,
        snapshot: { entries: [{ code: "1", name: "1" }] }
    };
}

function createFailedRankOrderResult(facilityId) {
    return {
        status: "error",
        contextKey: facilityId,
        reason: "request-failed"
    };
}

function sliceSourceBetween(source, startMarker, endMarker) {
    const startIndex = source.indexOf(startMarker);
    assert.notEqual(startIndex, -1, `source start marker not found: ${startMarker}`);
    const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
    assert.notEqual(endIndex, -1, `source end marker not found: ${endMarker}`);
    return source.slice(startIndex, endIndex);
}
