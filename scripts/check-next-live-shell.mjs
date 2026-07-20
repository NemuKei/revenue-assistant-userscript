import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as ts from "typescript";

const adapter = await importTypeScriptModule("../src/next/live/liveCalendarDomAdapter.ts");
const state = await importTypeScriptModule("../src/next/live/liveSimilarityLensState.ts");

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
