import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as ts from "typescript";

const source = await readFile(new URL("../src/requestScheduler.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022
    }
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { createIntervalRequestScheduler } = await import(moduleUrl);

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function verifyInteractivePriority() {
    const scheduler = createIntervalRequestScheduler({ concurrency: 1, intervalMs: 5 });
    const starts = [];
    const task = (label, durationMs = 1) => async () => {
        starts.push(label);
        await delay(durationMs);
        return label;
    };

    const blocker = scheduler.schedule("blocker", task("blocker", 15));
    const background = scheduler.schedule("background", task("background"));
    const interactive = scheduler.schedule("interactive", task("interactive"), { priority: "interactive" });
    await Promise.all([blocker, background, interactive]);

    assert.deepEqual(starts, ["blocker", "interactive", "background"]);
}

async function verifyQueuedDedupePriorityUpgrade() {
    const scheduler = createIntervalRequestScheduler({ concurrency: 1, intervalMs: 5 });
    const starts = [];
    let sameRunCount = 0;
    const task = (label, durationMs = 1) => async () => {
        starts.push(label);
        if (label === "same") {
            sameRunCount += 1;
        }
        await delay(durationMs);
        return label;
    };

    const blocker = scheduler.schedule("blocker", task("blocker", 15));
    const other = scheduler.schedule("other", task("other"));
    const sameBackground = scheduler.schedule("same", task("same"));
    const sameInteractive = scheduler.schedule("same", task("same-duplicate"), { priority: "interactive" });
    const results = await Promise.all([blocker, other, sameBackground, sameInteractive]);

    assert.deepEqual(starts, ["blocker", "same", "other"]);
    assert.equal(sameRunCount, 1);
    assert.equal(results[2], "same");
    assert.equal(results[3], "same");
}

async function verifyIntervalAndConcurrency() {
    const scheduler = createIntervalRequestScheduler({ concurrency: 3, intervalMs: 20 });
    const starts = [];
    let activeCount = 0;
    let maxActiveCount = 0;
    const task = (label) => async () => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        starts.push({ label, startedAt: Date.now() });
        await delay(35);
        activeCount -= 1;
        return label;
    };

    await Promise.all([
        scheduler.schedule("a", task("a")),
        scheduler.schedule("b", task("b")),
        scheduler.schedule("c", task("c")),
        scheduler.schedule("d", task("d")),
        scheduler.schedule("e", task("e"))
    ]);

    assert(maxActiveCount <= 3, `max active count must stay <= 3, got ${maxActiveCount}`);
    for (let index = 1; index < starts.length; index += 1) {
        const intervalMs = starts[index].startedAt - starts[index - 1].startedAt;
        assert(intervalMs >= 15, `start interval must stay near configured interval, got ${intervalMs}ms`);
    }
}

await verifyInteractivePriority();
await verifyQueuedDedupePriorityUpgrade();
await verifyIntervalAndConcurrency();

console.log("request scheduler priority checks passed");
