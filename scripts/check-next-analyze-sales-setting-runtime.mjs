import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = "/dev/fixtures/next-analyze-sales-setting/";
const rootSelector = "[data-ra-next-sales-setting-classic-root]";
const stateAttribute = "data-ra-next-sales-setting-classic-state";
const toggleSelector = "[data-ra-next-sales-setting-classic-curve-toggle]";
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
    await verifyPerformanceMarkers(origin);
    await verifyDeferredReferenceDoesNotPrematurelySettle(origin);
    await verifyRankStatusSurvivesTransientRemount(origin);
    await verifyInitialBatchStopsWithoutNativeSurface(origin);
    await verifyHiddenAndRouteTransitions(origin);
    await verifyAbsentSurfaceStayDateReset(origin);
    console.log("Next Analyze SalesSetting runtime remount checks passed");
} finally {
    await browser?.close();
    await server.close();
}

async function verifyDeferredReferenceDoesNotPrematurelySettle(origin) {
    await withFixturePage(origin, "?rank=empty&reference=deferred", async (page) => {
        await waitForRoot(page, "ready");
        await page.locator(toggleSelector).first().click();
        await drainFixtureTasks(page);
        const roomSummary = await readPerformanceSummary(page);
        assert.equal(roomSummary.operation, "room-open");
        assert.equal(roomSummary.milestones.selectedRoomCurrentSettled.outcome, "ready");
        assert.equal(
            roomSummary.milestones.selectedRoomEvidenceSettled,
            undefined,
            "deferred references must remain pending instead of first-writing a terminal partial milestone"
        );
    });
}

async function verifyPerformanceMarkers(origin) {
    await withFixturePage(origin, "?rank=empty", async (page) => {
        await waitForRoot(page, "ready");
        const surfaceSummary = await readPerformanceSummary(page);
        assert.equal(surfaceSummary.schemaVersion, "rau-next-performance-v1");
        assert.equal(surfaceSummary.requestProfile, "booking-curve-50ms-20-analyze-uncapped");
        assert.equal(surfaceSummary.operation, "analyze-surface");
        assert.equal(surfaceSummary.route, "analyze");
        assert.equal(surfaceSummary.milestones.shellPainted.outcome, "ready");
        assert.equal(surfaceSummary.milestones.overallSettled.outcome, "ready");
        assert.equal(surfaceSummary.milestones.allRoomSummarySettled.outcome, "ready");
        assert.deepEqual(surfaceSummary.counts, {
            readyRequiredRoomScopes: 2,
            requiredRoomScopes: 2
        });
        assert.equal(await page.locator("[data-ra-fetch-performance-summary]").count(), 1);

        const priorityCount = await readCount(page, "priority");
        await page.locator(toggleSelector).first().click();
        await waitForCount(page, "priority", priorityCount + 1);
        await drainFixtureTasks(page);
        const roomSummary = await readPerformanceSummary(page);
        assert.equal(roomSummary.operation, "room-open");
        assert.equal(roomSummary.milestones.selectedRoomCurrentSettled.outcome, "ready");
        assert.equal(roomSummary.milestones.selectedRoomEvidenceSettled.outcome, "ready");
        const serialized = JSON.stringify(roomSummary).toLowerCase();
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
    });
}

async function verifyRankStatusSurvivesTransientRemount(origin) {
    await withFixturePage(origin, "?rank=deferred-once", async (page) => {
        await waitForRoot(page, "ready");
        await waitForCount(page, "rank-load", 1);
        await page.locator("[data-mock-detach-sales]").click();
        await waitForMarker(page, "waiting-native-sales-setting");
        await waitForRootCount(page, 0);
        await resolveFixtureRead(page, "rank-status");
        await drainFixtureTasks(page);
        await page.locator("[data-mock-restore-sales]").click();
        await waitForRoot(page, "ready");
        await page.locator(toggleSelector).first().click();
        await drainFixtureTasks(page);
        assert.equal(
            await readCount(page, "rank-load"),
            1,
            "rank status resolved while absent must clear loading and be reused after remount"
        );
        assert.equal(await page.locator(rootSelector).count(), 1);
    });
}

async function verifyInitialBatchStopsWithoutNativeSurface(origin) {
    await withFixturePage(origin, "?state=deferred-once&rank=ready", async (page) => {
        await waitForCount(page, "load", 1);
        const cancelCountBeforeDetach = await readCount(page, "data-cancel");
        await page.locator("[data-mock-detach-sales]").click();
        await waitForMarker(page, "waiting-native-sales-setting");
        await waitForRootCount(page, 0);
        await page.waitForFunction(
            ({ attribute, minimum }) => Number(
                globalThis.document.documentElement.getAttribute(attribute) ?? "0"
            ) >= minimum,
            {
                attribute: countAttribute("data-cancel"),
                minimum: cancelCountBeforeDetach + 1
            }
        );
        await resolveFixtureRead(page, "data");
        await drainFixtureTasks(page);
        assert.equal(
            await readCount(page, "load"),
            1,
            "an absent native surface must prevent background room-scope continuation"
        );
        assert.equal(await page.locator(rootSelector).count(), 0);
    });
}

async function verifyHiddenAndRouteTransitions(origin) {
    await withFixturePage(origin, "?rank=deferred-once", async (page) => {
        await waitForRoot(page, "ready");
        await page.locator(toggleSelector).first().click();
        await waitForCount(page, "rank-load", 1);
        await setFixtureVisibility(page, "hidden");
        await waitForMarker(page, "suspended-hidden");
        await waitForRootCount(page, 0);
        await waitForCount(page, "rank-cancel", 1);
        await setFixtureVisibility(page, "visible");
        await waitForRoot(page, "ready");
        await waitForCount(page, "rank-load", 2);
        assert.equal(
            await page.locator(toggleSelector).first().getAttribute("aria-expanded"),
            "true",
            "hidden suspension must preserve the open room preference while retrying the aborted read"
        );

        const dataResetBeforeRoute = await readCount(page, "data-reset");
        const rankResetBeforeRoute = await readCount(page, "rank-reset");
        const rankLoadBeforeRoute = await readCount(page, "rank-load");
        await page.locator("[data-mock-route-away]").click();
        await waitForMarker(page, "suspended-route");
        await waitForRootCount(page, 0);
        assert.equal(await readCount(page, "data-reset"), dataResetBeforeRoute + 1);
        assert.equal(await readCount(page, "rank-reset"), rankResetBeforeRoute + 1);
        await page.locator("[data-mock-route-back]").click();
        await waitForRoot(page, "ready");
        await page.waitForFunction(
            ({ attribute, minimum }) => Number(
                globalThis.document.documentElement.getAttribute(attribute) ?? "0"
            ) >= minimum,
            { attribute: countAttribute("rank-load"), minimum: rankLoadBeforeRoute + 1 }
        );
        assert.equal(await page.locator(rootSelector).count(), 1);
    });
}

async function verifyAbsentSurfaceStayDateReset(origin) {
    await withFixturePage(origin, "?rank=ready", async (page) => {
        await waitForRoot(page, "ready");
        await page.locator(toggleSelector).first().click();
        await waitForCount(page, "rank-load", 1);
        await page.locator("[data-mock-detach-sales]").click();
        await waitForMarker(page, "waiting-native-sales-setting");
        const dataResetBeforeStayChange = await readCount(page, "data-reset");
        const rankResetBeforeStayChange = await readCount(page, "rank-reset");
        await page.locator("[data-mock-stay-next]").click();
        await page.waitForURL(/2026-08-13$/u);
        await page.waitForFunction(
            ({ attribute, minimum }) => Number(
                globalThis.document.documentElement.getAttribute(attribute) ?? "0"
            ) >= minimum,
            { attribute: countAttribute("data-reset"), minimum: dataResetBeforeStayChange + 1 }
        );
        assert.equal(await readCount(page, "rank-reset"), rankResetBeforeStayChange + 1);
        await page.locator("[data-mock-restore-sales]").click();
        await waitForRoot(page, "ready");
        await page.locator(toggleSelector).first().click();
        await waitForCount(page, "rank-load", 2);
        assert.equal(
            await readCount(page, "rank-load"),
            2,
            "a stay-date change while native DOM is absent must start a fresh rank context"
        );
        assert.equal(await page.locator(rootSelector).count(), 1);
    });
}

async function withFixturePage(origin, query, run) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
        await page.goto(new URL(`${fixturePath}${query}`, origin).href, { waitUntil: "networkidle" });
        await run(page);
        assert.deepEqual(pageErrors, [], "fixture page must not emit runtime errors");
    } finally {
        await page.close();
    }
}

async function waitForRoot(page, state) {
    await page.waitForFunction(
        ({ root, stateAttributeName, stateValue }) => {
            const roots = globalThis.document.querySelectorAll(root);
            return roots.length === 1 && roots[0]?.getAttribute(stateAttributeName) === stateValue;
        },
        { root: rootSelector, stateAttributeName: stateAttribute, stateValue: state }
    );
}

async function waitForRootCount(page, count) {
    await page.waitForFunction(
        ({ root, expected }) => globalThis.document.querySelectorAll(root).length === expected,
        { root: rootSelector, expected: count }
    );
}

async function waitForMarker(page, value) {
    await page.waitForFunction(
        ({ attribute, expected }) => globalThis.document.documentElement.getAttribute(attribute) === expected,
        { attribute: stateAttribute, expected: value }
    );
}

async function waitForCount(page, name, minimum) {
    await page.waitForFunction(
        ({ attribute, expected }) => Number(
            globalThis.document.documentElement.getAttribute(attribute) ?? "0"
        ) >= expected,
        { attribute: countAttribute(name), expected: minimum }
    );
}

async function readCount(page, name) {
    return page.evaluate(
        (attribute) => Number(globalThis.document.documentElement.getAttribute(attribute) ?? "0"),
        countAttribute(name)
    );
}

async function readPerformanceSummary(page) {
    return page.evaluate(() => {
        const text = globalThis.document.querySelector(
            "[data-ra-fetch-performance-summary]"
        )?.textContent ?? "";
        return JSON.parse(text);
    });
}

function countAttribute(name) {
    return `data-mock-sales-setting-${name}-count`;
}

async function resolveFixtureRead(page, name) {
    await page.evaluate((readName) => {
        globalThis.document.dispatchEvent(new Event(`mock-resolve-${readName}`));
    }, name);
}

async function drainFixtureTasks(page) {
    await page.evaluate(() => new Promise((resolve) => globalThis.window.setTimeout(resolve, 25)));
}

async function setFixtureVisibility(page, value) {
    await page.evaluate((visibility) => {
        Object.defineProperty(globalThis.document, "visibilityState", {
            configurable: true,
            get: () => visibility
        });
        globalThis.document.dispatchEvent(new Event("visibilitychange"));
    }, value);
}

async function launchBrowser() {
    const executablePaths = [
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
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
