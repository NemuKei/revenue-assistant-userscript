import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const model = await importBundledTypeScript(
    "../src/next/analyze/salesSettingClassicModel.ts",
    import.meta.url
);
const view = await importBundledTypeScript(
    "../src/next/analyze/salesSettingClassicView.ts",
    import.meta.url
);
const [
    entrySource,
    runtimeSource,
    viewSource,
    fixture,
    fixtureEntry,
    classicSource,
    referenceModelSource,
    curveCoreSource
] = await Promise.all([
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/salesSettingClassicRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/salesSettingClassicView.ts", import.meta.url), "utf8"),
    readFile(new URL("../dev/fixtures/next-analyze-sales-setting/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/next/dev/analyzeSalesSettingClassicFixtureEntry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceModel.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/curveCore.ts", import.meta.url), "utf8")
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
        rankEvent("single", "2026-07-10", "13", "12", "single-old-event"),
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
assert.deepEqual(
    built.rankOverviewCards.map((card) => card.scope.key),
    ["room:single", "room:twin"],
    "rank overview must preserve native room scope order instead of sorting by latest change"
);
assert.equal(built.cards[0].rankSummary.daysAgo, 19);
assert.equal(built.cards[0].rankSummary.beforeRankName, "12");
assert.equal(built.cards[0].rankSummary.afterRankName, "11");
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
assert.match(
    runtimeSource,
    /const roomScopes = activeScopes\.filter[\s\S]*await Promise\.all\(roomScopes\.map\(async \(scope\) => \{[\s\S]*dataSource\.load/u,
    "room current loads must enter the shared queue concurrently after the hotel is ready"
);
assert.doesNotMatch(runtimeSource, /for \(const scope of activeScopes\)[\s\S]*await dataSource\.load/u);
assert.match(
    runtimeSource,
    /dataSource\.load\(stayDate, asOfDate, "hotel", \{\s*currentPriority: "critical-current",\s*referencePriority: null/u,
    "hotel current must load without starting reference work ahead of room current"
);
assert.match(
    runtimeSource,
    /dataSource\.prioritize\?\.\(stayDate, asOfDate, "hotel", \{\s*currentPriority: "critical-current",\s*referencePriority: "visible-reference"\s*\}\);\s*scopeBatchLoading = false/u,
    "hotel reference must be admitted only after the room-current batch"
);
assert.match(
    runtimeSource,
    /dataSource\.load\(stayDate, asOfDate, scope\.key, \{\s*currentPriority: "visible-current",\s*readProfile: openScopes\.has\(scope\.key\) \? "full" : "current-only",\s*referencePriority: openScopes\.has\(scope\.key\) \? "selected-reference" : null/u,
    "remaining room current must read only its target source and must not enqueue unopened room reference work"
);
assert.match(
    runtimeSource,
    /beginAnalyzePerformance\("room-open", scopeKey\);[\s\S]*hydrateOpenedScope\(activeStayDate, activeAsOfDate, scopeKey\)/u,
    "opening a room must hydrate its full local reference set and selected queue only"
);
assert.match(runtimeSource, /dataSource\.cancel\(\);\s*dirtyScopeKeys\.clear\(\);\s*dataRefreshPending = false;\s*scopeBatchLoading = true;/u);
assert.match(runtimeSource, /addEventListener\("load", scheduleReconcile/u);
assert.match(runtimeSource, /addEventListener\("pageshow", scheduleReconcile/u);
assert.doesNotMatch(runtimeSource, /seasonal:\s*false/u);
const roomScopeBatch = runtimeSource.match(
    /const roomScopes = activeScopes\.filter[\s\S]*await Promise\.all\(roomScopes\.map\(async \(scope\) => \{([\s\S]*?)\n {8}\}\)\);\n {8}if \(!isCurrentLoad/u
);
assert.notEqual(roomScopeBatch, null, "room scopes must load concurrently after the hotel result");
assert.match(
    roomScopeBatch?.[1] ?? "",
    /activeData\.set\(scope\.key, result\);[\s\S]*updateAnalyzePerformanceCohort\(result\);\s*return;/u,
    "ready rooms must update the batch without rebuilding every graph per scope"
);
assert.doesNotMatch(
    roomScopeBatch?.[1] ?? "",
    /rebuildCurves\(\)|renderCurrentState\(\)/u,
    "the initial parallel room batch must render once after all cache reads settle"
);
assert.match(
    runtimeSource,
    /scopeBatchLoading = false;\s*initialScopeBatchLoading = false;\s*rebuildCurves\(new Set\(roomScopes\.map\(\(scope\) => scope\.key\)\)\);\s*renderCurrentState\(\);/u,
    "a completed initial room batch must rebuild only room summaries and preserve the already-built hotel curve"
);
assert.match(
    runtimeSource,
    /function startRankLoad[\s\S]*rankLoading = true;\s*if \(!scopeBatchLoading\) \{\s*rebuildOpenRoomCurves\(\);\s*renderCurrentState\(\);[\s\S]*function rebuildOpenRoomCurves[\s\S]*openScopes\.has\(scope\.key\)/u,
    "rank state changes must rebuild only curves that are actually open"
);
assert.doesNotMatch(
    runtimeSource.match(/function startRankLoad[\s\S]*?function rebuildOpenRoomCurves/u)?.[0] ?? "",
    /rebuildCurves\(\);/u,
    "rank loading must not rebuild the hotel and every closed room curve"
);
assert.match(
    referenceModelSource,
    /segments: \["all", secondarySegment\]/u,
    "Analyze must materialize only the two segments displayed by the curve"
);
assert.match(
    curveCoreSource,
    /const requestedLeadTimes = new Set\(options\.ticks\.filter[\s\S]*const observationsByLt = new Map<number, CurveObservation\[\]>\(\);[\s\S]*!requestedLeadTimes\.has\(observation\.lt\)[\s\S]*buildRecentWeightedSamplesForLt\(observationsByLt\.get\(tick\) \?\? \[\], asOfDate, tick\)/u,
    "recent reference ticks must reuse one lead-time index instead of rescanning every observation per tick"
);
assert.match(runtimeSource, /hotelResult\.status === "error"\) \{\s*scopeBatchLoading = false;/u);
assert.match(runtimeSource, /referencePriority: null,\s*waitForCurrent: false/u);
assert.match(runtimeSource, /readProfile: openScopes\.has\(scope\.key\) \? "full" : "current-only",\s*referencePriority: openScopes\.has\(scope\.key\) \? "selected-reference" : null,\s*waitForCurrent: false/u);
assert.match(
    runtimeSource,
    /function hydrateOpenedScope[\s\S]*readProfile: "full",\s*referencePriority: "selected-reference",\s*waitForCurrent: false[\s\S]*rebuildCurves\(changedScopeKeys\);\s*renderCurrentState\(changedScopeKeys\)/u,
    "an opened room must upgrade from current-only to full without a global rebuild"
);
assert.match(runtimeSource, /if \(scopeBatchLoading\) \{\s*dataRefreshPending = true;\s*return;/u);
assert.match(runtimeSource, /subscribe\?\.\(\(scopeKey\) => \{\s*scheduleDataRefresh\(scopeKey \?\? null\);/u);
assert.match(
    runtimeSource,
    /scheduledDataRefreshTimer !== null\s*&& shouldTrailPendingReferenceRefresh\(\)[\s\S]*clearTimeout\(scheduledDataRefreshTimer\)[\s\S]*function shouldTrailPendingReferenceRefresh[\s\S]*data\?\.readProfile === "full"[\s\S]*current\.dueTaskCount === 0[\s\S]*reference\.dueTaskCount \?\? 0\) > 0/u,
    "settled-current full reference batches must reset the shared timer until store notifications become quiet"
);
assert.match(runtimeSource, /function startScopeRefresh\([\s\S]*void refreshScopes/u);
assert.match(runtimeSource, /const requested = new Set\(scopeKeys\);\s*const scopes = activeScopes\.filter\(\(scope\) => requested\.has\(scope\.key\)\)/u);
assert.doesNotMatch(
    runtimeSource.match(/function startScopeRefresh[\s\S]*?async function refreshScopes/u)?.[0] ?? "",
    /dataSource\.cancel\(\)/u,
    "a stored-source refresh must not abort in-flight Analyze acquisition"
);
assert.match(runtimeSource, /\}, 250\);/u);
assert.match(runtimeSource, /!isCurrentRevalidating\(hotelData\)/u);
assert.match(runtimeSource, /!isCurrentRevalidating\(activeData\.get\(card\.scope\.key\)\)/u);
assert.match(runtimeSource, /function cancelScopeBatchForInactiveSurface\(\): void/u);
assert.match(
    runtimeSource,
    /const clearInitialBatch = initialScopeBatchLoading;[\s\S]*loadGeneration \+= 1;\s*dataSource\.cancel\(\);\s*scopeBatchLoading = false;\s*initialScopeBatchLoading = false;[\s\S]*if \(clearInitialBatch\) \{[\s\S]*state = "idle";[\s\S]*activeData = new Map\(\);[\s\S]*activeCurves = new Map\(\);[\s\S]*activeScopes = \[\];/u,
    "an absent native surface must abort an initial partial scope batch without retaining partial room data"
);
assert.match(
    runtimeSource,
    /activeStayDate !== null && activeStayDate !== stayDate\) \{\s*resetContext\(stayDate, null\);\s*\}[\s\S]*const nextSurface/u,
    "a stay-date change must reset rank and data context even while the native surface is absent"
);
assert.match(runtimeSource, /rankFacilityId !== facilityId/u);
assert.doesNotMatch(runtimeSource, /rankOrder|rank-order|rank_sequences/u);
assert.doesNotMatch(runtimeSource, /\bfetch\s*\(|XMLHttpRequest|POST|PUT|PATCH|DELETE/u);
assert.match(viewSource, /"ランク変更履歴"/u);
const rankOverviewSource = viewSource.match(/function createRankOverview[\s\S]*?\n\}\n\nfunction renderNativeCard/u)?.[0] ?? "";
assert.notEqual(rankOverviewSource, "", "rank overview renderer must remain independently checkable");
assert.doesNotMatch(
    rankOverviewSource,
    /\.sort\(/u,
    "rank overview renderer must not override the canonical room scope order"
);
for (const segmentLabel of ["全体", "個人", "団体"]) {
    assert.match(viewSource, new RegExp(`"${segmentLabel}"`, "u"));
}
assert.match(viewSource, /"区分", "室数", "1日前", "7日前", "30日前"/u);
assert.match(viewSource, /"ブッキングカーブを開く"/u);
assert.match(viewSource, /"ブッキングカーブを閉じる"/u);
assert.match(viewSource, /message\.textContent = "比較準備中"/u);
assert.match(viewSource, /message\.textContent = "最新データを更新中（保存済みデータを表示）"/u);
assert.match(viewSource, /createEmbeddedBookingCurveReference/u);
assert.match(viewSource, /replaceAll\([\s\S]*BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE/u);
assert.notEqual(
    view.encodeSalesSettingScopeId("room:a/b"),
    view.encodeSalesSettingScopeId("room:a:b"),
    "distinct room scope keys must retain distinct embedded ARIA ids"
);
assert.match(view.encodeSalesSettingScopeId("room:和室"), /^[0-9a-f-]+$/u);
assert.match(fixture, /data-mock-route-away/u);
assert.match(fixtureEntry, /fixtureMode === "missing"/u);
assert.match(fixtureEntry, /fixtureMode === "deferred-once"/u);
assert.match(fixtureEntry, /rankMode === "empty"/u);
assert.match(fixtureEntry, /rankMode === "deferred-once"/u);
assert.doesNotMatch(fixtureEntry, /rankOrder|rank-order|adjustment-response/u);
for (const control of ["detach-sales", "restore-sales", "stay-next"]) {
    assert.match(fixture, new RegExp(`data-mock-${control}`, "u"));
}
for (const counter of ["data-cancel", "data-reset", "rank-cancel", "rank-reset"]) {
    assert.match(fixtureEntry, new RegExp(`setFixtureCount\\("${counter}"`, "u"));
}

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
        visibility: { recent: true, seasonal: true }
    };
}
