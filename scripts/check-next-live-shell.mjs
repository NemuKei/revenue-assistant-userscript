import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as ts from "typescript";

const adapter = await importTypeScriptModule("../src/next/live/liveCalendarDomAdapter.ts");
const state = await importTypeScriptModule("../src/next/live/liveSimilarityLensState.ts");
const view = await importTypeScriptModule("../src/next/live/liveSimilarityLensView.ts");
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
assert.deepEqual(initial, { baseDate: null, mode: "idle" });
const armed = state.armLiveSimilarityLens(initial);
assert.deepEqual(armed, { baseDate: null, mode: "armed" });
const selected = state.selectLiveSimilarityLensBaseDate(armed, "2026-08-12");
assert.deepEqual(selected, { baseDate: "2026-08-12", mode: "selected" });
assert.deepEqual(
    state.armLiveSimilarityLens(selected),
    { baseDate: "2026-08-12", mode: "armed" }
);
assert.deepEqual(
    state.cancelLiveSimilarityLensSelection(state.armLiveSimilarityLens(selected)),
    selected
);
assert.deepEqual(state.clearLiveSimilarityLensBaseDate(), initial);

const styles = view.getLiveSimilarityLensStyles();
assert.match(
    styles,
    /\[data-ra-next-similarity-lens-root\] \{[^}]*max-width: calc\(100vw - 64px\);[^}]*min-width: 0;/
);
assert.match(
    styles,
    /@media \(max-width: 680px\) \{[\s\S]*?\[data-ra-next-similarity-lens-root\] \{[^}]*max-width: calc\(100vw - 32px\);[^}]*margin: 0 8px 8px;/
);
assert.doesNotMatch(styles, /(?<!max-)width: calc\(100vw - 32px\)/);
assert.match(fixture, /\[data-mock-ra-shell\]\[data-mock-fixed-width-host\] \{ min-width: 1200px; \}/);
assert.match(
    fixture,
    /URLSearchParams\(window\.location\.search\)\.get\("fixed-host"\) === "1"/
);

console.log("Next live shell checks passed");

async function importTypeScriptModule(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ES2022,
            target: ts.ScriptTarget.ES2022
        }
    }).outputText;
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
    return import(moduleUrl);
}
