import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const model = await importBundledTypeScript(
    "../src/next/analyze/salesSettingClassicModel.ts",
    import.meta.url
);
const [
    entrySource,
    runtimeSource,
    viewSource,
    fixture,
    fixtureEntry,
    classicSource
] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/salesSettingClassicRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/salesSettingClassicView.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-sales-setting/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeSalesSettingClassicFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/main.ts", import.meta.url), "utf8")
]);

const hotelScope = { key: "hotel", kind: "hotel", label: "ホテル全体", roomGroupId: null };
const singleScope = { key: "room:single", kind: "roomGroup", label: "シングル", roomGroupId: "single" };
const twinScope = { key: "room:twin", kind: "roomGroup", label: "ツイン", roomGroupId: "twin" };
const scopes = [hotelScope, singleScope, twinScope];
const hotelSummary = summary([18, 17, 14, 9], [15, 14, 12, 8], [3, 3, 2, 1]);
const singleSummary = summary([8, 7, 5, 3], [7, 6, 4, 3], [1, 1, 1, 0]);
const twinSummary = summary([10, 9, 8, 5], [8, 7, 6, 4], [2, 2, 2, 1]);
const rankSnapshot = {
    stayDate: "20260812",
    invalidEventCount: 0,
    events: [
        rankEvent("single", "2026-07-20", "12", "11", "single-event"),
        rankEvent("twin", "2026-07-29", "10", "9", "twin-event")
    ]
};
const built = model.buildSalesSettingClassicViewModel({
    curves: [
        curve(hotelScope, 42, hotelSummary, null),
        curve(singleScope, 18, singleSummary, { signature: "single-event", value: 4 }),
        curve(twinScope, 24, twinSummary, { signature: "twin-event", value: 6 })
    ],
    rankState: { error: null, loading: false, snapshot: rankSnapshot },
    scopes,
    stayDate: "20260812",
    todayDate: "20260808"
});

assert.equal(built.overall.capacityRooms, 42);
assert.deepEqual(built.overall.summary.all, {
    currentValue: 18,
    previousDayValue: 16,
    previousMonthValue: 8,
    previousWeekValue: 13
});
assert.deepEqual(built.overall.summary.transient, hotelSummary.transient);
assert.deepEqual(built.overall.summary.group, hotelSummary.group);
assert.deepEqual(built.cards.map((card) => card.scope.key), ["room:single", "room:twin"]);
assert.equal(built.cards[0].rankSummary.daysAgo, 19);
assert.equal(built.cards[0].rankSummary.roomDelta, 4);
assert.equal(built.cards[1].rankSummary.roomDelta, 4);

const incomplete = model.buildSalesSettingClassicViewModel({
    curves: [
        curve(hotelScope, 42, hotelSummary, null),
        curve(singleScope, 18, singleSummary, null)
    ],
    rankState: { error: null, loading: false, snapshot: null },
    scopes,
    stayDate: "20260812",
    todayDate: "20260808"
});
assert.equal(incomplete.overall.capacityRooms, null, "missing room scope must not be treated as zero");
assert.equal(incomplete.overall.summary.all.currentValue, null, "partial total must remain comparison-preparing");

for (const selector of [
    "suggestions-heading",
    "suggestions-room-type-name",
    "suggestions-latest-reflection-at",
    "suggestions-detail-wrapper"
]) {
    assert.match(runtimeSource, new RegExp(selector, "u"));
    assert.match(fixture, new RegExp(selector, "u"));
}
assert.match(entrySource, /startSalesSettingClassicRuntime\(document, window, \{/u);
assert.match(entrySource, /startSalesSettingClassicRuntime[\s\S]*acquisition: bookingCurveAcquisition/u);
assert.match(runtimeSource, /for \(const scope of activeScopes\)[\s\S]*await dataSource\.load/u);
assert.doesNotMatch(runtimeSource, /Promise\.all\([\s\S]*dataSource\.load/u);
assert.match(runtimeSource, /dataSource\.cancel\(\);\s*scopeBatchLoading = true;/u);
const roomScopeLoop = runtimeSource.match(
    /scopeBatchLoading = true;[\s\S]*for \(const scope of activeScopes\) \{([\s\S]*?)\n {8}\}\n {8}scopeBatchLoading = false;/u
);
assert.notEqual(roomScopeLoop, null, "room scopes must remain sequential while their redraw is batched");
assert.doesNotMatch(roomScopeLoop?.[1] ?? "", /renderCurrentState\(\)/u);
assert.match(runtimeSource, /scopeBatchLoading = false;\s*rebuildCurves\(\);\s*renderCurrentState\(\);/u);
assert.match(runtimeSource, /hotelResult\.status === "error"\) \{\s*scopeBatchLoading = false;/u);
assert.match(runtimeSource, /state !== "ready"\s*\|\| scopeBatchLoading/u);
assert.doesNotMatch(runtimeSource, /\bfetch\s*\(|XMLHttpRequest|POST|PUT|PATCH|DELETE/u);
assert.match(viewSource, /"ランク変更履歴"/u);
for (const segmentLabel of ["全体", "個人", "団体"]) {
    assert.match(viewSource, new RegExp(`"${segmentLabel}"`, "u"));
}
assert.match(viewSource, /"区分", "室数", "1日前", "7日前", "30日前"/u);
assert.match(viewSource, /"ブッキングカーブを開く"/u);
assert.match(viewSource, /"ブッキングカーブを閉じる"/u);
assert.match(viewSource, /message\.textContent = "比較準備中"/u);
assert.match(viewSource, /createEmbeddedBookingCurveReference/u);
assert.match(viewSource, /replaceAll\([\s\S]*BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /fixtureMode === "missing"/u);
assert.match(fixtureEntry, /rankMode === "empty"/u);

for (const classicLabel of [
    "ランク変更履歴",
    "ブッキングカーブを開く",
    "ブッキングカーブを閉じる",
    "販売室数"
]) {
    assert.match(classicSource, new RegExp(classicLabel, "u"));
    assert.match(viewSource, new RegExp(classicLabel, "u"));
}

console.log("Next Analyze Classic sales setting checks passed");

function summary(all, transient, group) {
    return {
        all: metric(all),
        transient: metric(transient),
        group: metric(group)
    };
}

function metric([currentValue, previousDayValue, previousWeekValue, previousMonthValue]) {
    return { currentValue, previousDayValue, previousWeekValue, previousMonthValue };
}

function rankEvent(roomGroupId, reflectedDate, beforeRankName, afterRankName, signature) {
    return {
        afterRankName,
        beforeRankName,
        daysBeforeStay: 1,
        reflectedAt: `${reflectedDate}T03:00:00.000Z`,
        reflectedDate,
        roomGroupId,
        signature,
        stayDate: "20260812"
    };
}

function curve(scope, capacityRooms, currentSummary, marker) {
    return {
        asOfDate: "20260808",
        capacityRooms,
        currentSummary,
        invalidRecordCount: 0,
        panels: [
            {
                current: { id: "current", label: "現在", missingReason: null, points: [], sourceStayDateCount: 1 },
                rankMarkers: marker === null ? [] : [{ ...marker }],
                recent: { id: "recent", label: "直近", missingReason: null, points: [], sourceStayDateCount: 3 },
                seasonal: { id: "seasonal", label: "前年", missingReason: null, points: [], sourceStayDateCount: 0 },
                segment: "all",
                title: "全体"
            }
        ],
        scope,
        scopes,
        secondarySegment: "transient",
        reusedRecordCount: 0,
        sourceRecordCount: 4,
        futureRecordCount: 0,
        stayDate: "20260812",
        visibility: { recent: true, seasonal: false }
    };
}
