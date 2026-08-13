import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = "/dev/fixtures/next-live-shell/?state=ready";
const server = await createServer({
    configFile: path.join(repoRoot, "vite.next-fixture.config.mjs"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false }
});
let browser;

try {
    await server.listen();
    const origin = server.resolvedUrls?.local[0];
    assert.notEqual(origin, undefined, "Vite did not expose a local fixture URL");
    browser = await launchBrowser();
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
        await page.goto(new URL(fixturePath, origin).href, { waitUntil: "networkidle" });
        await page.waitForFunction(() => {
            const text = globalThis.document.querySelector(
                "[data-ra-fetch-performance-summary]"
            )?.textContent ?? "";
            if (text === "") {
                return false;
            }
            const summary = JSON.parse(text);
            return summary.operation === "top-route"
                && summary.milestones?.shellPainted?.outcome === "ready"
                && summary.milestones?.cachedGroupSettled?.outcome === "ready"
                && (summary.milestones?.rankSettled?.outcome === "ready"
                    || summary.milestones?.rankSettled?.outcome === "empty");
        });
        const topSummary = await readPerformanceSummary(page);
        assert.equal(topSummary.schemaVersion, "rau-next-performance-v1");
        assert.equal(topSummary.requestProfile, "booking-curve-100ms-30");
        assert.equal(topSummary.route, "top");
        assert.equal(topSummary.counts.eligibleVisibleDates > 0, true);
        assert.equal(
            topSummary.counts.renderedExactGroupDates,
            topSummary.counts.validExactGroupSourceDates
        );
        assert.equal(
            topSummary.counts.renderedRankEventDates,
            topSummary.counts.validRankEventDates
        );
        assert.equal(await page.locator("[data-ra-fetch-performance-summary]").count(), 1);

        await page.locator("[data-mock-route-analyze]").click();
        await page.waitForFunction(() => (
            globalThis.document.querySelectorAll("[data-ra-fetch-performance-summary]").length === 0
        ));
        await page.locator("[data-mock-route-calendar]").click();
        await page.waitForFunction(() => {
            const text = globalThis.document.querySelector(
                "[data-ra-fetch-performance-summary]"
            )?.textContent ?? "";
            return text !== "" && JSON.parse(text).operation === "top-route";
        });

        await page.locator("[data-ra-next-lens-arm]").click();
        await page.locator('[data-testid^="calendar-date-"]').nth(4).click();
        const roomSelect = page.locator("[data-ra-next-lens-room-group]");
        await roomSelect.waitFor({ state: "visible" });
        await roomSelect.selectOption("rg-twin");
        await page.waitForFunction(() => {
            const text = globalThis.document.querySelector(
                "[data-ra-fetch-performance-summary]"
            )?.textContent ?? "";
            if (text === "") {
                return false;
            }
            const summary = JSON.parse(text);
            const outcome = summary.milestones?.baseDecisionSettled?.outcome;
            return summary.operation === "top-base-decision"
                && (outcome === "ready" || outcome === "empty");
        });
        const decisionSummary = await readPerformanceSummary(page);
        assert.equal(decisionSummary.operation, "top-base-decision");
        assert.equal(["ready", "empty"].includes(
            decisionSummary.milestones.baseDecisionSettled.outcome
        ), true);
        assert.equal(decisionSummary.milestones.baseDecisionSettled.source, "mixed");
        assert.equal(decisionSummary.milestones.baseDecisionSettled.elapsedMs >= 0, true);
        assertForbiddenFieldsAbsent(decisionSummary);
        await page.evaluate(() => {
            globalThis.document.querySelector("[data-mock-calendar-host]")?.replaceChildren();
        });
        await page.waitForFunction(() => (
            globalThis.document.querySelectorAll("[data-ra-fetch-performance-summary]").length === 0
        ));
        await page.locator("[data-mock-rerender]").click();
        await page.waitForFunction(() => {
            const text = globalThis.document.querySelector(
                "[data-ra-fetch-performance-summary]"
            )?.textContent ?? "";
            return text !== "" && JSON.parse(text).operation === "top-route";
        });
        await page.locator("[data-mock-classic]").click();
        await page.waitForFunction(() => (
            globalThis.document.querySelectorAll("[data-ra-fetch-performance-summary]").length === 0
        ));
        assert.deepEqual(pageErrors, [], "fixture page must not emit runtime errors");
    } finally {
        await page.close();
    }
    await verifyCompetitorPerformance(browser, origin);
    console.log("Next live performance runtime check passed");
} finally {
    await browser?.close();
    await server.close();
}

async function verifyCompetitorPerformance(activeBrowser, origin) {
    const page = await activeBrowser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
        await page.goto(new URL(
            "/dev/fixtures/next-analyze-competitor/?state=ready",
            origin
        ).href, { waitUntil: "networkidle" });
        await page.waitForFunction(() => {
            const text = globalThis.document.querySelector(
                "[data-ra-fetch-performance-summary]"
            )?.textContent ?? "";
            if (text === "") {
                return false;
            }
            const summary = JSON.parse(text);
            return summary.operation === "competitor-surface"
                && summary.milestones?.competitorCachePainted?.outcome === "ready"
                && summary.milestones?.competitorFreshSettled?.outcome === "ready";
        });
        const summary = await readPerformanceSummary(page);
        assert.equal(summary.route, "competitor");
        assert.equal(summary.warmth, "warm");
        assert.equal(summary.milestones.shellPainted.outcome, "ready");
        assert.equal(summary.milestones.competitorCachePainted.source, "cache");
        assert.equal(summary.milestones.competitorFreshSettled.source, "cache");
        assert.equal(await page.locator("[data-ra-fetch-performance-summary]").count(), 1);
        assertForbiddenFieldsAbsent(summary);
        await page.evaluate(() => {
            globalThis.history.pushState({}, "", "/inactive-route");
            globalThis.dispatchEvent(new globalThis.PopStateEvent("popstate"));
        });
        await page.waitForFunction(() => (
            globalThis.document.querySelectorAll("[data-ra-fetch-performance-summary]").length === 0
        ));
        assert.deepEqual(pageErrors, [], "competitor fixture page must not emit runtime errors");
    } finally {
        await page.close();
    }
}

async function readPerformanceSummary(page) {
    return page.evaluate(() => JSON.parse(
        globalThis.document.querySelector("[data-ra-fetch-performance-summary]")?.textContent ?? "{}"
    ));
}

function assertForbiddenFieldsAbsent(summary) {
    const serialized = JSON.stringify(summary).toLowerCase();
    for (const forbidden of [
        "facilityid",
        "staydate",
        "roomgroupid",
        "price",
        "inventory",
        "requestbody",
        "responsebody",
        "storagekey",
        "cookie",
        "token",
        "credential",
        "url"
    ]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
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
    assert.notEqual(executablePaths.length, 0, "no Chromium or Chrome executable found for runtime fixture");
    return chromium.launch({
        args: ["--no-sandbox"],
        executablePath: executablePaths[0],
        headless: true
    });
}
