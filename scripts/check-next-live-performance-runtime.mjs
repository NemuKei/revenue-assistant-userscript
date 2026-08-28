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
        assert.equal(topSummary.schemaVersion, "rau-next-performance-v2");
        assert.equal(topSummary.requestProfile, "booking-curve-top-50ms-20-foreground-35ms-20");
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
    await verifyAdjustmentReviewUi(browser, origin);
    await verifyCompetitorPerformance(browser, origin);
    console.log("Next live performance runtime check passed");
} finally {
    await browser?.close();
    await server.close();
}

async function verifyAdjustmentReviewUi(activeBrowser, origin) {
    const rootSelector = "[data-ra-next-adjustment-review-root]";
    const parentSelector = "[data-ra-next-adjustment-review-parent]";
    const eventSelector = "[data-ra-next-adjustment-review-event]";
    const desktop = await activeBrowser.newPage({ viewport: { width: 1280, height: 900 } });
    const desktopErrors = [];
    desktop.on("pageerror", (error) => desktopErrors.push(error.message));
    try {
        await desktop.goto(new URL(fixturePath, origin).href, { waitUntil: "networkidle" });
        await desktop.waitForFunction((selector) => (
            globalThis.document.querySelectorAll(selector).length === 1
            && globalThis.document.querySelector(selector)?.getAttribute(
                "data-ra-next-adjustment-review-state"
            ) === "ready"
        ), rootSelector);
        assert.equal(await desktop.locator('[data-testid="monthly-calendar"]').count(), 3);
        assert.equal(await desktop.locator(rootSelector).count(), 1);
        assert.equal(await desktop.locator(parentSelector).count(), 10, "initial review rows must stop at ten");
        assert.equal(await desktop.locator("[data-ra-next-adjustment-review-more]").count(), 1);
        assert.deepEqual(await desktop.evaluate(() => {
            const review = globalThis.document.querySelector("[data-ra-next-adjustment-review-root]");
            const lens = globalThis.document.querySelector("[data-ra-next-similarity-lens-root]");
            return {
                calendarImmediatelyBeforeReview: review?.previousElementSibling?.querySelector(
                    '[data-testid="monthly-calendar"]'
                ) !== null,
                reviewImmediatelyBeforeLens: lens?.previousElementSibling === review
            };
        }), {
            calendarImmediatelyBeforeReview: true,
            reviewImmediatelyBeforeLens: true
        }, "the live order must be standard calendar, review, then similarity lens");

        const selectedHorizon = desktop.locator(
            '[data-ra-next-adjustment-review-horizon][aria-pressed="true"]'
        );
        assert.equal(await selectedHorizon.getAttribute("data-ra-next-adjustment-review-horizon"), "7");
        const initialPace = await desktop.locator(
            `${parentSelector} [data-ra-next-adjustment-review-pace]`
        ).first().innerText();
        const threeDay = desktop.locator('[data-ra-next-adjustment-review-horizon="3"]');
        await threeDay.click();
        const threeDayPace = await desktop.locator(
            `${parentSelector} [data-ra-next-adjustment-review-pace]`
        ).first().innerText();
        assert.notEqual(threeDayPace, initialPace, "3-day selection must not retain or fall back to 7-day values");
        await threeDay.focus();
        await desktop.keyboard.press("Tab");
        const keyboardFocusedHorizon = desktop.locator(
            '[data-ra-next-adjustment-review-horizon="7"]'
        );
        await keyboardFocusedHorizon.waitFor({ state: "visible" });
        const horizonControlStyle = await keyboardFocusedHorizon.evaluate((element) => {
            const style = globalThis.getComputedStyle(element);
            return {
                height: element.getBoundingClientRect().height,
                isFocused: globalThis.document.activeElement === element,
                outlineStyle: style.outlineStyle
            };
        });
        assert.equal(horizonControlStyle.height >= 44, true);
        assert.equal(horizonControlStyle.isFocused, true);
        assert.notEqual(horizonControlStyle.outlineStyle, "none");

        await desktop.locator("[data-ra-next-adjustment-review-expand]").first().click();
        assert.equal(await desktop.locator(eventSelector).count(), 2);
        assert.equal(
            await desktop.locator(eventSelector).filter({ hasText: "数値名から仮判定" }).count(),
            1,
            "numeric rank-name fallback must stay visibly provisional in detail rows"
        );
        assert.equal(
            await desktop.locator('[data-ra-next-adjustment-review-filter="actorName"] option').count(),
            3,
            "unfiltered actor options must expose all plus two unique candidate actors"
        );
        await desktop.locator('[data-ra-next-adjustment-review-filter="observation"]').selectOption("ready");
        await desktop.locator("[data-ra-next-adjustment-review-expand]").first().click();
        assert.equal(
            await desktop.locator(eventSelector).count(),
            1,
            "observation filtering must keep the latest ready event without showing another state"
        );
        assert.equal(
            await desktop.locator('[data-ra-next-adjustment-review-filter="actorName"] option').count(),
            2,
            "actor option counts and choices must follow the other active filters"
        );
        await desktop.locator("[data-ra-next-adjustment-review-more]").click();
        assert.equal(await desktop.locator(parentSelector).count(), 12);

        const analyze = desktop.locator("[data-ra-next-adjustment-review-analyze]").first();
        assert.equal(
            await analyze.evaluate((element) => element.tagName),
            "A",
            "compact adjustment dates must resolve the dashed native calendar Analyze href"
        );
        await analyze.evaluate((element) => {
            element.addEventListener("click", (event) => event.preventDefault(), { once: true });
        });
        await analyze.click();
        const pending = await desktop.evaluate(() => globalThis.sessionStorage.getItem(
            "revenue-assistant-next:adjustment-review-focus:v1"
        ));
        assert.notEqual(pending, null);
        assert.deepEqual(Object.keys(JSON.parse(pending)).sort(), [
            "createdAt", "eventKey", "roomGroupId", "schemaVersion", "stayDate"
        ]);
        assert.equal(pending.includes("担当"), false, "pending focus must never carry an actor name");
        await desktop.evaluate(() => globalThis.sessionStorage.clear());

        await desktop.evaluate(() => {
            globalThis.document.querySelector("[data-ra-next-adjustment-review-root]")?.remove();
        });
        await desktop.waitForFunction((selector) => (
            globalThis.document.querySelectorAll(selector).length === 1
        ), rootSelector);
        assert.equal(await desktop.locator(rootSelector).count(), 1, "review remount must preserve one root");
        await desktop.locator("[data-mock-route-analyze]").click();
        await desktop.waitForFunction((selector) => (
            globalThis.document.querySelectorAll(selector).length === 0
        ), rootSelector);
        await desktop.locator("[data-mock-route-calendar]").click();
        await desktop.waitForFunction((selector) => (
            globalThis.document.querySelectorAll(selector).length === 1
        ), rootSelector);
        assert.deepEqual(desktopErrors, [], "desktop review fixture must not emit runtime errors");
    } finally {
        await desktop.close();
    }

    const mobile = await activeBrowser.newPage({ viewport: { width: 390, height: 844 } });
    const mobileErrors = [];
    mobile.on("pageerror", (error) => mobileErrors.push(error.message));
    try {
        await mobile.goto(new URL(fixturePath, origin).href, { waitUntil: "networkidle" });
        await mobile.waitForFunction((selector) => (
            globalThis.document.querySelector(selector)?.getAttribute(
                "data-ra-next-adjustment-review-state"
            ) === "ready"
        ), rootSelector);
        const mobileLayout = await mobile.evaluate((selector) => {
            const root = globalThis.document.querySelector(selector);
            const button = root?.querySelector("button");
            const firstCell = root?.querySelector("[data-ra-next-adjustment-review-parent] td");
            const rootRect = root?.getBoundingClientRect();
            return {
                buttonHeight: button?.getBoundingClientRect().height ?? 0,
                documentOverflow: globalThis.document.documentElement.scrollWidth
                    > globalThis.document.documentElement.clientWidth,
                firstCellDisplay: firstCell === null ? null : globalThis.getComputedStyle(firstCell).display,
                rootInsideViewport: rootRect !== undefined
                    && rootRect.left >= 0
                    && rootRect.right <= globalThis.document.documentElement.clientWidth
            };
        }, rootSelector);
        assert.deepEqual(mobileLayout, {
            buttonHeight: 44,
            documentOverflow: false,
            firstCellDisplay: "grid",
            rootInsideViewport: true
        });
        assert.equal(await mobile.locator(eventSelector).count(), 0, "collapsed mobile rows must not build all detail tables");
        await mobile.locator("[data-ra-next-adjustment-review-expand]").first().press("Enter");
        assert.equal(await mobile.locator(eventSelector).count(), 2, "mobile detail must be keyboard-expandable");
        assert.deepEqual(mobileErrors, [], "390px review fixture must not emit runtime errors");
    } finally {
        await mobile.close();
    }
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
