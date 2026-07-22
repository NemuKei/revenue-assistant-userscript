import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const adapter = await importBundledTypeScript("../src/next/live/liveCalendarDomAdapter.ts", import.meta.url);
const state = await importBundledTypeScript("../src/next/live/liveSimilarityLensState.ts", import.meta.url);
const view = await importBundledTypeScript("../src/next/live/liveSimilarityLensView.ts", import.meta.url);
const runtime = await importBundledTypeScript("../src/next/live/liveSimilarityLensRuntime.ts", import.meta.url);
const fixture = await readFile(
    new URL("../dev/fixtures/next-live-shell/index.html", import.meta.url),
    "utf8"
);

assert.equal(adapter.parseStayDateFromCalendarTestId("calendar-date-2026-08-12"), "2026-08-12");
assert.equal(adapter.parseStayDateFromCalendarTestId("calendar-date-2026-02-29"), null);
assert.equal(adapter.parseStayDateFromCalendarTestId("calendar-date-2024-02-29"), "2024-02-29");
assert.equal(adapter.parseStayDateFromCalendarTestId("room-num-2026-08-12"), null);
assert.equal(adapter.parseStayDateFromCalendarTestId("calendar-date-2026-8-12"), null);

const initial = state.createInitialLiveSimilarityLensState();
assert.deepEqual(initial, {
    baseDate: null,
    mode: "idle",
    selectedComparisonDates: [],
    selectedRoomGroupId: null
});
const armed = state.armLiveSimilarityLens(initial);
assert.deepEqual(armed, { ...initial, mode: "armed" });
const selected = state.selectLiveSimilarityLensBaseDate(armed, "2026-08-12");
assert.deepEqual(selected, {
    baseDate: "2026-08-12",
    mode: "selected",
    selectedComparisonDates: [],
    selectedRoomGroupId: null
});
assert.deepEqual(
    state.armLiveSimilarityLens(selected),
    { ...selected, mode: "armed" }
);
assert.deepEqual(
    state.cancelLiveSimilarityLensSelection(state.armLiveSimilarityLens(selected)),
    selected
);
assert.deepEqual(state.clearLiveSimilarityLensBaseDate(), initial);
const selectedRoomGroup = state.selectLiveSimilarityLensRoomGroup(selected, "room-a");
assert.equal(selectedRoomGroup.selectedRoomGroupId, "room-a");
const comparisonOne = state.toggleLiveSimilarityLensComparisonDate(selectedRoomGroup, "20260819");
const comparisonThree = ["20260826", "20260902"].reduce(
    (current, stayDate) => state.toggleLiveSimilarityLensComparisonDate(current, stayDate),
    comparisonOne
);
assert.deepEqual(comparisonThree.selectedComparisonDates, ["20260819", "20260826", "20260902"]);
assert.deepEqual(
    state.toggleLiveSimilarityLensComparisonDate(comparisonThree, "20260909"),
    comparisonThree,
    "comparison selection must stop at three dates"
);
assert.deepEqual(
    state.selectLiveSimilarityLensRoomGroup(comparisonThree, "room-b").selectedComparisonDates,
    [],
    "room-group changes must clear comparisons"
);
const invalidated = runtime.invalidateLiveSimilarityLensRuntimeSelection(7);
assert.deepEqual(invalidated.state, initial, "calendar loss must clear base, room type, and comparisons");
assert.deepEqual(invalidated.evidenceState, { status: "idle" });
assert.equal(invalidated.generation, 8, "calendar loss must invalidate in-flight evidence");
assert.equal(
    adapter.hasLiveFacilityContextLabel(["施設A（mock）", "メニュー"], "施設A（mock）"),
    true
);
assert.equal(
    adapter.hasLiveFacilityContextLabel(["施設B（mock）", "メニュー"], "施設A（mock）"),
    false,
    "facility context must not accept a different visible facility"
);
assert.equal(
    adapter.hasLiveFacilityContextLabel(["ホテル東京別館"], "ホテル東京"),
    false,
    "facility context must not accept a longer facility name by substring"
);
const focusOrigin = {};
assert.equal(runtime.shouldFocusRoomGroupAfterLoad(focusOrigin, focusOrigin, "selected"), true);
assert.equal(
    runtime.shouldFocusRoomGroupAfterLoad(focusOrigin, {}, "selected"),
    false,
    "async evidence completion must not steal focus after the user moves elsewhere"
);
assert.equal(
    runtime.shouldFocusRoomGroupAfterLoad(focusOrigin, focusOrigin, "armed"),
    false,
    "re-arming during a load must prevent focus from moving to the room selector"
);
assert.match(
    await readFile(new URL("../src/next/live/liveSimilarityLensRuntime.ts", import.meta.url), "utf8"),
    /characterData:\s*true/u,
    "facility label text-node changes must schedule runtime reconciliation"
);

const competitorCache = {
    status: "ready",
    value: {
        facilityId: "yad:fixture",
        latestFetchedAt: "2026-07-22T01:00:00.000Z",
        fetchedAtByStayDate: { 20260812: "2026-07-22T01:00:00.000Z" },
        recordCount: 1,
        stayDates: ["20260812"]
    }
};
assert.equal(view.hasLiveSimilarityLensCompetitorCacheForStayDate(competitorCache, "2026-08-12"), true);
assert.equal(
    view.hasLiveSimilarityLensCompetitorCacheForStayDate(competitorCache, "2026-08-13"),
    false,
    "another visible date's cache must not be shown as the selected date's cache"
);

const styles = view.getLiveSimilarityLensStyles();
const analyzeSnapshot = {
    cells: [{ analyzeHref: "/analyze/20260812", stayDate: "2026-08-12" }]
};
assert.deepEqual(
    view.resolveLiveSimilarityLensAnalyzeTarget(analyzeSnapshot, "20260812"),
    { href: "/analyze/20260812", kind: "href" }
);
assert.deepEqual(
    view.resolveLiveSimilarityLensAnalyzeTarget({
        cells: [{ analyzeHref: null, stayDate: "2026-08-12" }]
    }, "20260812"),
    { kind: "native-calendar", stayDate: "2026-08-12" },
    "SPA calendar cells without href must delegate to the verified native date action"
);
assert.equal(view.resolveLiveSimilarityLensAnalyzeTarget(analyzeSnapshot, "20260813"), null);
assert.match(
    styles,
    /\[data-ra-next-similarity-lens-root\] \{[^}]*width: calc\(100% - 48px\);[^}]*max-width: calc\(100vw - 48px\);[^}]*min-width: 0;/
);
assert.match(
    styles,
    /@media \(max-width: 680px\) \{[\s\S]*?\[data-ra-next-similarity-lens-root\] \{[^}]*width: calc\(100% - 16px\);[^}]*max-width: calc\(100vw - 16px\);[^}]*margin: 0 8px 8px;/
);
assert.doesNotMatch(styles, /(?<!max-)width: calc\(100vw - 32px\)/);
assert.match(styles, /data-ra-next-lens-match-list[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(fixture, /\[data-mock-header\] \{[^}]*flex-wrap: wrap;/);
assert.match(fixture, /\[data-mock-ra-shell\]\[data-mock-fixed-width-host\] \{ min-width: 1200px; \}/);
assert.match(fixture, /data-mock-remount/);
assert.match(fixture, /replaceChildren\(\);[\s\S]*?window\.setTimeout\(renderCalendar, 120\)/);
assert.match(fixture, /data-mock-facility-context/);
assert.match(fixture, /data-mock-root-remount/);
assert.match(fixture, /data-ra-next-similarity-lens-root/);
assert.match(
    fixture,
    /URLSearchParams\(window\.location\.search\)\.get\("fixed-host"\) === "1"/
);
assert.match(fixture, /anchor\.href = `\/analyze\/\$\{stayDate\.replaceAll\("-", ""\)\}`/);
assert.match(fixture, /src="\/src\/next\/dev\/liveShellEntry\.ts"/);
assert.match(styles, /data-ra-next-lens-similar-date/);
assert.match(styles, /content: "類似"/);
assert.match(styles, /data-ra-next-lens-analyze-trigger/);
assert.match(
    await readFile(new URL("../src/next/live/liveSimilarityLensRuntime.ts", import.meta.url), "utf8"),
    /nativeCell\.anchor\.click\(\)/u,
    "SPA Analyze fallback must delegate to the existing native calendar action"
);

console.log("Next live shell checks passed");
