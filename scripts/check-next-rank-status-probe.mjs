import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = "/dev/fixtures/next-rank-range-probe/";
const rootSelector = "[data-ra-next-rank-range-probe-root]";
const startSelector = "[data-ra-next-rank-range-probe-start]";
const parser = await importBundledTypeScript(
    "../src/next/rankLearning/rankLearningCaptureParser.ts",
    import.meta.url
);
const probe = await importBundledTypeScript(
    "../src/next/rankLearning/rankStatusRangeProbeRunner.ts",
    import.meta.url
);

await verifyStaticBoundaries();
verifyCountOnlySummary();
verifyDateRanges();
await verifySequentialSuccessAndDuplicateGuard();
await verifyStopConditions();
await verifyCoverageJudgments();
await verifyAbortAndPreflight();
await verifyRuntimeFixture();

console.log("Next rank status range probe checks passed");

async function verifyStaticBoundaries() {
    const [harnessSource, runnerSource] = await Promise.all([
        readFile(path.join(repoRoot, "src/next/rankLearning/rankStatusRangeProbeHarness.ts"), "utf8"),
        readFile(path.join(repoRoot, "src/next/rankLearning/rankStatusRangeProbeRunner.ts"), "utf8")
    ]);
    const runtimeSource = `${harnessSource}\n${runnerSource}`;
    for (const forbiddenPattern of [
        /\bfetch\s*\(/u,
        /\bXMLHttpRequest\b/u,
        /\blocalStorage\b/u,
        /\bsessionStorage\b/u,
        /\bindexedDB\b/u,
        /\bdocument\.cookie\b/u,
        /\bconsole\./u,
        /\bperformance\.mark\b/u,
        /\bperformance\.measure\b/u
    ]) {
        assert.doesNotMatch(
            runtimeSource,
            forbiddenPattern,
            `rank range probe must not include ${forbiddenPattern}`
        );
    }
    assert.match(harnessSource, /createBrowserNextReadTransport/u);
    assert.match(harnessSource, /RANK_STATUS_RANGE_PROBE_QUERY_VALUE = "rank_status_range"/u);
}

function verifyCountOnlySummary() {
    const summary = parser.summarizeRankLearningCapture({
        suggest_statuses: [
            rankEvent("20260829"),
            rankEvent("20260901"),
            rankEvent("20260901", { after_price_rank_name: null, before_price_rank_name: null }),
            rankEvent("20260902", { rm_room_group_id: 42 })
        ]
    }, context(31));
    assert.deepEqual(Object.keys(summary).sort(), [
        "coverageEndOffsetDays",
        "coverageStartOffsetDays",
        "ignoredEventCount",
        "invalidEventCount",
        "paginationEvidence",
        "responseEventCount",
        "rootValid",
        "truncationSuspected",
        "uniqueStayDateCount",
        "validEventCount"
    ]);
    assert.deepEqual(summary, {
        coverageEndOffsetDays: 3,
        coverageStartOffsetDays: 0,
        ignoredEventCount: 1,
        invalidEventCount: 1,
        paginationEvidence: false,
        responseEventCount: 4,
        rootValid: true,
        truncationSuspected: false,
        uniqueStayDateCount: 2,
        validEventCount: 2
    });
    assert.equal(parser.summarizeRankLearningCapture({}, context(31)).rootValid, false);
    assert.equal(parser.summarizeRankLearningCapture({
        next_cursor: "synthetic",
        suggest_statuses: [rankEvent("20260829")]
    }, context(31)).paginationEvidence, true);
    assert.equal(parser.summarizeRankLearningCapture({
        total_count: 2,
        suggest_statuses: [rankEvent("20260829")]
    }, context(31)).paginationEvidence, true);
    assert.equal(parser.summarizeRankLearningCapture({
        suggest_statuses: Array.from({ length: 512 }, () => rankEvent("20260829"))
    }, context(31)).truncationSuspected, true);
    assertForbiddenFieldsAbsent(summary);
}

function verifyDateRanges() {
    assert.deepEqual(probe.buildRankStatusRangeProbeDateRange("20260829", 31), {
        from: "20260829",
        to: "20260928"
    });
    assert.deepEqual(probe.buildRankStatusRangeProbeDateRange("20260829", 184), {
        from: "20260829",
        to: "20270228"
    });
    assert.deepEqual(probe.buildRankStatusRangeProbeDateRange("20240228", 3), {
        from: "20240228",
        to: "20240301"
    });
    assert.equal(probe.buildRankStatusRangeProbeDateRange("20260229", 31), null);
    assert.equal(
        probe.getRankStatusRangeProbeJstDateKey(Date.parse("2026-08-28T15:00:00.000Z")),
        "20260829"
    );
}

async function verifySequentialSuccessAndDuplicateGuard() {
    const requests = [];
    let active = 0;
    let maxConcurrency = 0;
    const runner = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read(request) {
                requests.push(request);
                active += 1;
                maxConcurrency = Math.max(maxConcurrency, active);
                await Promise.resolve();
                active -= 1;
                return { suggest_statuses: [rankEvent(request.to)] };
            }
        }
    });
    const result = await runner.run();
    assert.equal(result.status, "complete");
    assert.equal(result.judgment, "GO_SINGLE_RANGE");
    assert.equal(result.windows.length, 4);
    assert.deepEqual(result.unexecutedRequestedDays, []);
    assert.deepEqual(requests.map((request) => request.kind), Array(4).fill("rank-status"));
    assert.deepEqual(requests.map((request) => request.from), Array(4).fill("20260829"));
    assert.deepEqual(requests.map((request) => request.to), [
        "20260928", "20261029", "20261129", "20270228"
    ]);
    assert.equal(maxConcurrency, 1);
    const duplicate = await runner.run();
    assert.equal(duplicate.status, "already-run");
    assert.equal(requests.length, 4, "the same page runner must not execute twice");
    assertForbiddenFieldsAbsent(result);
}

async function verifyStopConditions() {
    let requests = 0;
    const rateLimited = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read(request) {
                requests += 1;
                if (requests === 2) {
                    throw { name: "NextReadHttpError", status: 429 };
                }
                return { suggest_statuses: [rankEvent(request.to)] };
            }
        }
    });
    const rateLimitResult = await rateLimited.run();
    assert.equal(rateLimitResult.stopReason, "http-rate-limit");
    assert.equal(rateLimitResult.judgment, "STOP");
    assert.equal(requests, 2);
    assert.deepEqual(rateLimitResult.unexecutedRequestedDays, [93, 184]);

    for (const [status, expectedOutcome] of [
        [401, "http-auth"],
        [403, "http-auth"],
        [503, "http-server"]
    ]) {
        const httpResult = await runWithError({ name: "NextReadHttpError", status });
        assert.equal(httpResult.result.stopReason, expectedOutcome);
        assert.equal(httpResult.requests, 1);
        assert.deepEqual(httpResult.result.unexecutedRequestedDays, [62, 93, 184]);
    }
    const transportFailure = await runWithError(new Error("synthetic transport failure"));
    assert.equal(transportFailure.result.stopReason, "transport-error");
    assert.equal(transportFailure.requests, 1);

    const pagination = await runWithPayload({
        next: "synthetic",
        suggest_statuses: [rankEvent("20260829")]
    });
    assert.equal(pagination.result.judgment, "NEED_PAGINATION");
    assert.equal(pagination.requests, 1);

    const eventLimit = await runWithPayload({
        suggest_statuses: Array.from({ length: 512 }, () => rankEvent("20260829"))
    });
    assert.equal(eventLimit.result.judgment, "GO_BATCHED");
    assert.equal(eventLimit.requests, 1);

    const invalidRoot = await runWithPayload({ unexpected: [] });
    assert.equal(invalidRoot.result.stopReason, "invalid-root");
    assert.equal(invalidRoot.requests, 1);

    const invalidEvent = await runWithPayload({
        suggest_statuses: [rankEvent("20260829", { after_price_rank_name: 4 })]
    });
    assert.equal(invalidEvent.result.stopReason, "invalid-event");
    assert.equal(invalidEvent.requests, 1);

    let timeoutRequests = 0;
    const timeoutRunner = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        timeoutMs: 5,
        transport: {
            read(_request, signal) {
                timeoutRequests += 1;
                return new Promise((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(new DOMException(
                        "aborted",
                        "AbortError"
                    )), { once: true });
                });
            }
        }
    });
    const timeoutResult = await timeoutRunner.run();
    assert.equal(timeoutResult.stopReason, "timeout");
    assert.equal(timeoutRequests, 1);
}

async function verifyCoverageJudgments() {
    const unchanged = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read(request) {
                return { suggest_statuses: [rankEvent(request.from)] };
            }
        }
    });
    const unchangedResult = await unchanged.run();
    assert.equal(unchangedResult.status, "stopped");
    assert.equal(unchangedResult.stopReason, "coverage-unchanged");
    assert.equal(unchangedResult.judgment, "INSUFFICIENT");
    assert.deepEqual(
        unchangedResult.windows.map((window) => window.coverageExpansion),
        ["first", "unchanged"]
    );
    assert.deepEqual(unchangedResult.unexecutedRequestedDays, [93, 184]);

    let countOnlyGrowthRequests = 0;
    const countOnlyGrowth = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read(request) {
                countOnlyGrowthRequests += 1;
                return {
                    suggest_statuses: Array.from(
                        { length: countOnlyGrowthRequests },
                        () => rankEvent(request.from)
                    )
                };
            }
        }
    });
    const countOnlyGrowthResult = await countOnlyGrowth.run();
    assert.equal(countOnlyGrowthResult.stopReason, "coverage-unchanged");
    assert.equal(countOnlyGrowthResult.judgment, "INSUFFICIENT");
    assert.equal(countOnlyGrowthRequests, 2);

    let requests = 0;
    const contracted = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read(request) {
                requests += 1;
                return {
                    suggest_statuses: requests === 1
                        ? [rankEvent(request.from), rankEvent(request.to)]
                        : [rankEvent(request.from)]
                };
            }
        }
    });
    const contractedResult = await contracted.run();
    assert.equal(contractedResult.stopReason, "coverage-contracted");
    assert.equal(contractedResult.judgment, "INSUFFICIENT");
    assert.equal(requests, 2);
    assert.deepEqual(contractedResult.unexecutedRequestedDays, [93, 184]);
}

async function verifyAbortAndPreflight() {
    let requests = 0;
    let preflights = 0;
    const hiddenRunner = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        canContinue() {
            preflights += 1;
            return preflights === 1 ? "ready" : "hidden";
        },
        transport: {
            async read(request) {
                requests += 1;
                return { suggest_statuses: [rankEvent(request.to)] };
            }
        }
    });
    const hiddenResult = await hiddenRunner.run();
    assert.equal(hiddenResult.stopReason, "hidden");
    assert.equal(requests, 1);
    assert.deepEqual(hiddenResult.unexecutedRequestedDays, [62, 93, 184]);

    const controller = new AbortController();
    controller.abort();
    const aborted = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read() {
                throw new Error("must not run");
            }
        }
    });
    const abortedResult = await aborted.run(controller.signal);
    assert.equal(abortedResult.stopReason, "aborted");
    assert.equal(abortedResult.windows.length, 0);
    assert.deepEqual(abortedResult.unexecutedRequestedDays, [31, 62, 93, 184]);

    let inFlightRequests = 0;
    const inFlightController = new AbortController();
    const inFlightAbort = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read() {
                inFlightRequests += 1;
                inFlightController.abort();
                throw new DOMException("aborted", "AbortError");
            }
        }
    });
    const inFlightResult = await inFlightAbort.run(inFlightController.signal);
    assert.equal(inFlightResult.stopReason, "aborted");
    assert.equal(inFlightRequests, 1);
    assert.deepEqual(inFlightResult.unexecutedRequestedDays, [62, 93, 184]);
}

async function verifyRuntimeFixture() {
    const server = await createServer({
        configFile: path.join(repoRoot, "vite.next-fixture.config.mjs"),
        logLevel: "error",
        server: { host: "127.0.0.1", port: 0, strictPort: false }
    });
    let browser;
    try {
        await server.listen();
        const origin = server.resolvedUrls?.local[0];
        assert.notEqual(origin, undefined, "Vite did not expose a fixture URL");
        browser = await launchBrowser();
        const page = await browser.newPage();
        const consoleErrors = [];
        page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text());
        });

        await page.goto(new URL(fixturePath, origin).toString());
        assert.equal(await page.locator(rootSelector).count(), 0);
        assert.equal(await page.locator("body").getAttribute("data-mock-rank-probe-requests"), "0");

        const liveCheckUrl = new URL(fixturePath, origin);
        liveCheckUrl.searchParams.set("ra_next_live_check", "rank_status_range");
        await page.goto(liveCheckUrl.toString());
        assert.equal(await page.locator(rootSelector).count(), 1);
        assert.equal(await page.locator(rootSelector).getAttribute("data-ra-next-rank-range-probe-state"), "idle");
        assert.equal(await page.locator("body").getAttribute("data-mock-rank-probe-requests"), "0");
        await page.locator(startSelector).click();
        await page.locator(`${rootSelector}[data-ra-next-rank-range-probe-state="complete"]`).waitFor();
        assert.equal(await page.locator(rootSelector).getAttribute("data-ra-next-rank-range-probe-judgment"), "GO_SINGLE_RANGE");
        assert.equal(await page.locator(rootSelector).getAttribute("data-ra-next-rank-range-probe-window-count"), "4");
        assert.equal(await page.locator("body").getAttribute("data-mock-rank-probe-requests"), "4");
        assert.equal(await page.locator("body").getAttribute("data-mock-rank-probe-max-concurrency"), "1");
        assert.equal(await page.locator("body").getAttribute("data-mock-storage-writes"), "0");
        assert.equal(await page.locator("body").getAttribute("data-mock-revenue-assistant-writes"), "0");
        assert.equal(await page.locator('[data-testid="monthly-calendar"]').innerText(), "標準UIは変更しません");
        assert.deepEqual(await page.evaluate(async () => ({
            databaseCount: typeof globalThis.indexedDB.databases === "function"
                ? (await globalThis.indexedDB.databases()).length
                : 0,
            localStorageCount: globalThis.localStorage.length,
            sessionStorageCount: globalThis.sessionStorage.length
        })), {
            databaseCount: 0,
            localStorageCount: 0,
            sessionStorageCount: 0
        });
        await page.goto(liveCheckUrl.toString());
        assert.equal(
            await page.locator(rootSelector).getAttribute("data-ra-next-rank-range-probe-state"),
            "idle"
        );
        assert.equal(await page.locator("body").getAttribute("data-mock-rank-probe-requests"), "0");
        assert.equal(await page.locator(`${rootSelector} li`).count(), 0);

        const rateLimitUrl = new URL(liveCheckUrl);
        rateLimitUrl.searchParams.set("scenario", "rate-limit");
        await page.goto(rateLimitUrl.toString());
        await page.locator(startSelector).click();
        await page.locator(`${rootSelector}[data-ra-next-rank-range-probe-state="stopped"]`).waitFor();
        assert.equal(await page.locator(rootSelector).getAttribute("data-ra-next-rank-range-probe-judgment"), "STOP");
        assert.equal(await page.locator("body").getAttribute("data-mock-rank-probe-requests"), "2");

        const analyzeUrl = new URL(liveCheckUrl);
        analyzeUrl.searchParams.set("fixture_route", "analyze");
        await page.goto(analyzeUrl.toString());
        assert.equal(await page.locator(rootSelector).count(), 0);
        assert.equal(await page.locator("body").getAttribute("data-mock-rank-probe-requests"), "0");

        await page.setViewportSize({ height: 844, width: 390 });
        await page.goto(liveCheckUrl.toString());
        const responsive = await page.evaluate((selector) => {
            const root = globalThis.document.querySelector(selector);
            const button = root?.querySelector("button");
            button?.focus();
            const rect = root?.getBoundingClientRect();
            const style = button ? globalThis.getComputedStyle(button) : null;
            return {
                fitsViewport: globalThis.document.documentElement.scrollWidth
                    <= globalThis.window.innerWidth
                    && rect !== undefined
                    && rect.left >= 0
                    && rect.right <= globalThis.window.innerWidth,
                focusVisible: style?.outlineStyle !== "none" && style?.outlineWidth !== "0px"
            };
        }, rootSelector);
        assert.deepEqual(responsive, { fitsViewport: true, focusVisible: true });

        await page.evaluate(() => {
            globalThis.history.pushState({}, "", "/analyze/20260829?ra_next_live_check=rank_status_range");
            globalThis.document.body.append(globalThis.document.createElement("span"));
        });
        await page.waitForFunction(
            (selector) => globalThis.document.querySelector(selector) === null,
            rootSelector
        );
        assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
        await page.close();
    } finally {
        await browser?.close();
        await server.close();
    }
}

async function runWithPayload(payload) {
    let requests = 0;
    const runner = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read() {
                requests += 1;
                return payload;
            }
        }
    });
    return { result: await runner.run(), requests };
}

async function runWithError(error) {
    let requests = 0;
    const runner = probe.createRankStatusRangeProbeRunner({
        asOfDate: "20260829",
        transport: {
            async read() {
                requests += 1;
                throw error;
            }
        }
    });
    return { result: await runner.run(), requests };
}

function context(days) {
    const range = probe.buildRankStatusRangeProbeDateRange("20260829", days);
    assert.notEqual(range, null);
    return {
        asOfDate: "20260829",
        sourceRangeFrom: range.from,
        sourceRangeTo: range.to
    };
}

function rankEvent(date, overrides = {}) {
    return {
        accepted_at: "2026-08-29T09:00:00+09:00",
        after_price_rank_name: "2",
        before_price_rank_name: "3",
        date,
        rm_room_group_id: "synthetic-room",
        ...overrides
    };
}

function assertForbiddenFieldsAbsent(value) {
    const serialized = JSON.stringify(value).toLowerCase();
    for (const field of [
        "facilityid",
        "roomgroupid",
        "reflector",
        "before_price_rank_name",
        "after_price_rank_name",
        "accepted_at",
        "completed_at",
        "suggest_calc_datetime",
        "price",
        "cookie",
        "authorization",
        "token",
        "credential",
        "responsebody"
    ]) {
        assert.equal(serialized.includes(field), false, field);
    }
}

async function launchBrowser() {
    const executablePaths = [
        chromium.executablePath(),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/opt/google/chrome/chrome"
    ].filter((candidate) => typeof candidate === "string" && existsSync(candidate));
    assert.notEqual(executablePaths.length, 0, "no Chromium or Chrome executable found for probe fixture");
    return chromium.launch({
        args: ["--no-sandbox"],
        executablePath: executablePaths[0],
        headless: true
    });
}
