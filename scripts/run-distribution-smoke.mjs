import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const DEFAULT_DIST_PATH = "dist/revenue-assistant-userscript.user.js";
const DEFAULT_PUBLISHED_URL = "https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js";
const DEFAULT_URL = "https://ra.jalan.net/";
const DEFAULT_SECONDS = 20;
const SMOKE_MODES = new Set(["top", "price-trends", "analyze-recommendations", "monthly-progress"]);
const VERSION_POLICIES = new Set(["warn", "fail"]);
const CDP_CONNECTION_MODES = new Set(["auto", "browser", "page"]);
const WRITE_ENDPOINTS = [
    "/api/v1/lincoln/suggest",
    "/api/v1/lincoln/price_ranks",
    "/api/v1/tema/price_ranks",
    "/api/v1/neppan/price_ranks"
];

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cdpUrl = args["cdp-url"] ?? process.env.CHROME_CDP_URL ?? DEFAULT_CDP_URL;
    const distPath = args["dist"] ?? DEFAULT_DIST_PATH;
    const publishedUrl = args["published-url"] ?? DEFAULT_PUBLISHED_URL;
    const installedVersion = args["installed-version"] ?? "manual-check-required";
    const mode = parseMode(args.mode ?? "top");
    const targetUrl = args["url"] ?? DEFAULT_URL;
    const seconds = parsePositiveInteger(args["seconds"], DEFAULT_SECONDS);
    const versionPolicy = parseVersionPolicy(args["version-policy"] ?? (args["allow-version-mismatch"] === "true" ? "warn" : "warn"));
    const cdpConnectionMode = parseCdpConnectionMode(args["cdp-connection"] ?? "auto");
    const allowEmptyPriceTrends = args["allow-empty-price-trends"] === "true";

    const localText = await readFile(resolve(distPath), "utf8");
    const localVersion = extractUserscriptMetadata(localText, "version") ?? "unknown";
    const localUpdateUrl = extractUserscriptMetadata(localText, "updateURL") ?? "none";
    const localDownloadUrl = extractUserscriptMetadata(localText, "downloadURL") ?? "none";
    const publishedVersionResult = await readPublishedVersion(publishedUrl);
    const smokeResult = await runChromeSmoke({ cdpUrl, targetUrl, seconds, mode, cdpConnectionMode });
    const assessment = assessSmokeResult({
        localVersion,
        publishedVersionResult,
        installedVersion,
        mode,
        targetUrl,
        smokeResult,
        versionPolicy,
        allowEmptyPriceTrends
    });

    console.log(`local version: ${localVersion}`);
    console.log(`published version: ${publishedVersionResult.version}`);
    if (publishedVersionResult.error !== null) {
        console.log(`published fetch error: ${publishedVersionResult.error}`);
    }
    console.log(`installed version: ${installedVersion}`);
    console.log(`local updateURL: ${localUpdateUrl}`);
    console.log(`local downloadURL: ${localDownloadUrl}`);
    console.log(`published URL: ${publishedUrl}`);
    console.log(`smoke mode: ${mode}`);
    console.log(`smoke URL: ${smokeResult.url}`);
    console.log(`duration seconds: ${seconds}`);
    for (const [label, value] of Object.entries(smokeResult.modeMetrics)) {
        console.log(`${label}: ${value}`);
    }
    for (const message of assessment.preflightMessages) {
        console.log(`preflight: ${message}`);
    }
    console.log(`console error count: ${smokeResult.consoleErrorCount}`);
    console.log(`page error count: ${smokeResult.pageErrorCount}`);
    console.log(`write endpoints: ${WRITE_ENDPOINTS.join(", ")}`);
    console.log(`POST count: ${smokeResult.writePostCount}`);
    for (const request of smokeResult.writePosts) {
        console.log(`- ${request.method} ${request.url} at ${request.observedAt}`);
    }
    for (const warning of assessment.warnings) {
        console.log(`warning: ${warning}`);
    }
    if (assessment.failures.length > 0) {
        console.log("smoke result: fail");
        for (const failure of assessment.failures) {
            console.log(`failure: ${failure}`);
        }
        process.exitCode = 1;
    } else {
        console.log("smoke result: pass");
    }
    console.log(`confirmed at: ${new Date().toISOString()}`);
}

async function readPublishedVersion(url) {
    try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        return {
            version: extractUserscriptMetadata(text, "version") ?? "unknown",
            error: null
        };
    } catch (error) {
        return {
            version: "unavailable",
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

async function runChromeSmoke(options) {
    const cdpTimeoutMs = Math.max(30_000, options.seconds * 1000 + 15_000);
    if (options.cdpConnectionMode === "page") {
        return await runChromeSmokeWithPageCdp(options, new Error("browser-level CDP skipped by --cdp-connection page"));
    }
    let browser;
    try {
        browser = await chromium.connectOverCDP(options.cdpUrl, { timeout: cdpTimeoutMs });
    } catch (error) {
        if (options.cdpConnectionMode === "browser") {
            throw error;
        }
        return await runChromeSmokeWithPageCdp(options, error);
    }
    const writePosts = [];
    const consoleErrors = [];
    const pageErrors = [];
    try {
        const context = browser.contexts()[0];
        if (!context) {
            throw new Error("Chrome context not found. Start Chrome with remote debugging port first.");
        }
        const page = await resolvePage(context, options.targetUrl);
        page.on("request", (request) => {
            if (request.method() !== "POST") {
                return;
            }
            const requestUrl = request.url();
            if (!matchesWriteEndpoint(requestUrl)) {
                return;
            }
            writePosts.push({
                method: request.method(),
                url: sanitizeUrl(requestUrl),
                observedAt: new Date().toISOString()
            });
        });
        page.on("console", (message) => {
            if (message.type() === "error") {
                consoleErrors.push(message.text());
            }
        });
        page.on("pageerror", (error) => {
            pageErrors.push(error.message);
        });

        const navigationTimeoutMs = Math.max(30_000, options.seconds * 1000 + 15_000);
        const navigationWarning = await navigateOrReloadForSmoke(page, options.targetUrl, navigationTimeoutMs);
        await prepareMode(page, options.mode);
        const waitResult = await waitForModeReady(page, options.mode, options.seconds);
        const modeMetrics = {
            "navigation warning": navigationWarning ?? "none",
            ...waitResult.metrics,
            "state wait satisfied": waitResult.ready ? "yes" : "no",
            "state wait elapsed ms": waitResult.elapsedMs
        };

        return {
            url: page.url(),
            modeMetrics,
            consoleErrorCount: consoleErrors.length,
            pageErrorCount: pageErrors.length,
            writePostCount: writePosts.length,
            writePosts
        };
    } finally {
        await browser.close();
    }
}

async function runChromeSmokeWithPageCdp(options, connectionError) {
    const pageTarget = await resolvePageTarget(options.cdpUrl, options.targetUrl);
    const client = await PageCdpClient.connect(pageTarget.webSocketDebuggerUrl);
    const writePosts = [];
    const consoleErrors = [];
    const pageErrors = [];
    const connectionErrorMessage = formatErrorMessage(connectionError);
    try {
        client.on("Network.requestWillBeSent", (event) => {
            const request = event.params?.request;
            if (request?.method !== "POST") {
                return;
            }
            const requestUrl = request.url ?? "";
            if (!matchesWriteEndpoint(requestUrl)) {
                return;
            }
            writePosts.push({
                method: request.method,
                url: sanitizeUrl(requestUrl),
                observedAt: new Date().toISOString()
            });
        });
        client.on("Runtime.consoleAPICalled", (event) => {
            if (event.params?.type === "error") {
                consoleErrors.push(formatRuntimeConsoleText(event.params.args));
            }
        });
        client.on("Runtime.exceptionThrown", (event) => {
            pageErrors.push(event.params?.exceptionDetails?.text ?? "Runtime exception");
        });
        client.on("Log.entryAdded", (event) => {
            if (event.params?.entry?.level === "error") {
                consoleErrors.push(event.params.entry.text ?? "Log error");
            }
        });

        await client.send("Runtime.enable");
        await client.send("Page.enable");
        await client.send("Network.enable");
        await client.send("Log.enable").catch(() => undefined);

        const navigationTimeoutMs = Math.max(30_000, options.seconds * 1000 + 15_000);
        const currentUrl = await getPageUrlViaCdp(client);
        const navigationWarning = await navigateOrReloadForSmokeViaCdp(client, currentUrl, options.targetUrl, navigationTimeoutMs);
        await prepareModeViaCdp(client, options.mode);
        const waitResult = await waitForModeReadyViaCdp(client, options.mode, options.seconds);
        const finalUrl = await getPageUrlViaCdp(client);
        const modeMetrics = {
            "CDP connection method": "page websocket fallback",
            "Playwright CDP error": connectionErrorMessage,
            "page target id": pageTarget.id,
            "navigation warning": navigationWarning ?? "none",
            ...waitResult.metrics,
            "state wait satisfied": waitResult.ready ? "yes" : "no",
            "state wait elapsed ms": waitResult.elapsedMs
        };

        return {
            url: finalUrl,
            modeMetrics,
            consoleErrorCount: consoleErrors.length,
            pageErrorCount: pageErrors.length,
            writePostCount: writePosts.length,
            writePosts
        };
    } finally {
        await client.close();
    }
}

async function navigateOrReloadForSmoke(page, targetUrl, timeoutMs) {
    try {
        if (page.url() !== targetUrl) {
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        } else {
            await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
        }
        return null;
    } catch (error) {
        return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 240) : String(error);
    }
}

async function navigateOrReloadForSmokeViaCdp(client, currentUrl, targetUrl, timeoutMs) {
    try {
        if (currentUrl === targetUrl) {
            return "skipped reload because page websocket fallback is observing an already-open target page";
        }
        const loadPromise = waitForCdpEvent(client, "Page.domContentEventFired", timeoutMs);
        await client.send("Page.navigate", { url: targetUrl });
        await loadPromise;
        return null;
    } catch (error) {
        return formatErrorMessage(error).replace(/\s+/g, " ").slice(0, 240);
    }
}

function assessSmokeResult(options) {
    const failures = [];
    const warnings = [];
    const metrics = options.smokeResult.modeMetrics;

    if (options.smokeResult.writePostCount > 0) {
        failures.push(`write API POST count must be 0, got ${options.smokeResult.writePostCount}`);
    }
    if (options.smokeResult.consoleErrorCount > 0) {
        failures.push(`console error count must be 0, got ${options.smokeResult.consoleErrorCount}`);
    }
    if (options.smokeResult.pageErrorCount > 0) {
        failures.push(`page error count must be 0, got ${options.smokeResult.pageErrorCount}`);
    }

    for (const failure of assessModeMetrics(options.mode, metrics, {
        allowEmptyPriceTrends: options.allowEmptyPriceTrends
    })) {
        failures.push(failure);
    }

    const versionAssessment = assessVersionRelationship({
        localVersion: options.localVersion,
        publishedVersionResult: options.publishedVersionResult,
        installedVersion: options.installedVersion
    });
    if (options.versionPolicy === "fail") {
        failures.push(...versionAssessment.failures);
        warnings.push(...versionAssessment.warnings);
    } else {
        warnings.push(...versionAssessment.failures, ...versionAssessment.warnings);
    }

    if (!isExpectedModeUrl(options.mode, options.smokeResult.url)) {
        failures.push(`smoke mode ${options.mode} does not match final URL ${options.smokeResult.url}`);
    }

    if (!isExpectedModeUrl(options.mode, options.targetUrl)) {
        warnings.push(`smoke mode ${options.mode} does not match requested URL ${options.targetUrl}`);
    }

    const preflightMessages = buildPreflightMessages({
        metrics,
        installedVersion: options.installedVersion,
        publishedVersion: options.publishedVersionResult.version
    });

    return { failures, warnings, preflightMessages };
}

function buildPreflightMessages(options) {
    const messages = [
        `page title=${options.metrics["page title"] ?? "unknown"}, login form candidate=${options.metrics["login form candidate"] ?? "unknown"}, calendar candidate=${options.metrics["calendar candidate"] ?? "unknown"}, RAU userscript root count=${options.metrics["RAU userscript root count"] ?? "unknown"}, React marker mounted=${options.metrics["React marker mounted"] ?? "unknown"}, installed version=${options.installedVersion}`
    ];
    const rootCount = Number(options.metrics["RAU userscript root count"]);
    const loginCandidate = options.metrics["login form candidate"];
    const calendarCandidate = options.metrics["calendar candidate"];
    if (loginCandidate === "yes") {
        messages.push("login form candidate is present; confirm Revenue Assistant login before treating selector failures as userscript failures.");
    } else if (rootCount === 0 && calendarCandidate === "yes") {
        messages.push(`calendar candidate is present but RAU userscript root count is 0; confirm Tampermonkey is enabled on ra.jalan.net, installed version ${options.installedVersion} matches published version ${options.publishedVersion}, and update the script from the Tampermonkey dashboard if needed.`);
    } else if (rootCount === 0) {
        messages.push("RAU userscript root count is 0; confirm requested URL, Revenue Assistant login state, Tampermonkey enabled state, and installed userscript version.");
    } else if (options.metrics["React marker mounted"] !== "yes") {
        messages.push("RAU userscript root exists but React marker is not mounted; check installed build freshness and userscript runtime errors.");
    } else {
        messages.push("Revenue Assistant page, RAU root, and React marker are present.");
    }
    return messages;
}

function assessModeMetrics(mode, metrics, options) {
    if (mode === "top") {
        const rowCount = Number(metrics["top row count"]);
        const perRowMinimum = Number.isFinite(rowCount) && rowCount > 0 ? rowCount : 1;
        return [
            minCountFailure("top row count", metrics["top row count"], 1),
            yesFailure("React marker mounted", metrics["React marker mounted"]),
            yesFailure("target month select", metrics["target month select"]),
            minCountFailure("view mode buttons", metrics["view mode buttons"], 1),
            minCountFailure("display limit buttons", metrics["display limit buttons"], 1),
            yesFailure("rank order control", metrics["rank order control"]),
            minCountFailure("primary actions wrappers", metrics["primary actions wrappers"], perRowMinimum),
            minCountFailure("secondary action markers", metrics["secondary action markers"], perRowMinimum),
            minCountFailure("status badge cells", metrics["status badge cells"], perRowMinimum),
            minCountFailure("curve preview buttons", metrics["curve preview buttons"], 1),
            minCountFailure("rank change buttons", metrics["rank change buttons"], 1),
            minCountFailure("decision buttons", metrics["decision buttons"], 1),
            minCountFailure("UI component markers", metrics["UI component markers"], 1),
            minCountFailure("UI control markers", metrics["UI control markers"], 1),
            minCountFailure("UI row layout markers", metrics["UI row layout markers"], 1),
            minCountFailure("UI popover markers", metrics["UI popover markers"], 1)
        ].filter((failure) => failure !== null);
    }
    if (mode === "price-trends") {
        const failures = [
            yesFailure("price trends tab", metrics["price trends tab"]),
            yesFailure("price trends content", metrics["price trends content"]),
            minCountFailure("price trends overview count", metrics["price trends overview count"], 1)
        ].filter((failure) => failure !== null);
        if (options.allowEmptyPriceTrends) {
            return failures;
        }
        return [
            ...failures,
            minCountFailure("price trends panel count", metrics["price trends panel count"], 1),
            minCountFailure("price trends svg count", metrics["price trends svg count"], 1)
        ].filter((failure) => failure !== null);
    }
    if (mode === "analyze-recommendations") {
        return [
            yesFailure("Analyze page candidate", metrics["Analyze page candidate"]),
            minCountFailure("Analyze recommendation root count", metrics["Analyze recommendation root count"], 1),
            yesFailure("Analyze recommendation read-only state", metrics["Analyze recommendation read-only state"])
        ].filter((failure) => failure !== null);
    }
    return [
        minCountFailure("monthly preview root count", metrics["monthly preview root count"], 1),
        minCountFailure("monthly preview panel count", metrics["monthly preview panel count"], 1),
        minCountFailure("monthly preview svg count", metrics["monthly preview svg count"], 1),
        minCountFailure("monthly daily diff count", metrics["monthly daily diff count"], 1),
        minCountFailure("monthly daily diff rows", metrics["monthly daily diff rows"], 1)
    ].filter((failure) => failure !== null);
}

function assessVersionRelationship(options) {
    const failures = [];
    const warnings = [];
    if (options.publishedVersionResult.error !== null) {
        failures.push(`published version is unavailable: ${options.publishedVersionResult.error}`);
    } else if (options.localVersion !== "unknown" && options.publishedVersionResult.version !== "unknown" && options.localVersion !== options.publishedVersionResult.version) {
        warnings.push(`local version ${options.localVersion} differs from published version ${options.publishedVersionResult.version}`);
    }

    const installedVersionKnown = options.installedVersion !== "manual-check-required" && options.installedVersion !== "unknown";
    if (installedVersionKnown && options.publishedVersionResult.version !== "unavailable" && options.installedVersion !== options.publishedVersionResult.version) {
        failures.push(`installed version ${options.installedVersion} differs from published version ${options.publishedVersionResult.version}`);
    }

    return { failures, warnings };
}

function minCountFailure(label, value, minimum) {
    const count = Number(value);
    if (Number.isFinite(count) && count >= minimum) {
        return null;
    }
    return `${label} must be at least ${minimum}, got ${value}`;
}

function yesFailure(label, value) {
    return value === "yes" ? null : `${label} must be yes, got ${value}`;
}

function isExpectedModeUrl(mode, value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    if (url.origin !== "https://ra.jalan.net") {
        return false;
    }
    if (mode === "top") {
        return url.pathname === "/" || url.pathname === "";
    }
    if (mode === "price-trends" || mode === "analyze-recommendations") {
        return /^\/analyze\/\d{4}-\d{2}-\d{2}$/.test(url.pathname);
    }
    return /^\/monthly-progress\/\d{4}-\d{2}$/.test(url.pathname);
}

async function prepareMode(page, mode) {
    if (mode !== "price-trends") {
        return;
    }
    try {
        const tab = page.locator("[data-testid=\"tab-priceTrends\"]").first();
        await tab.waitFor({ state: "attached", timeout: 15000 });
        await tab.click({ force: true });
    } catch {
        // The selector counts below make the missing tab visible in the smoke output.
    }
}

async function prepareModeViaCdp(client, mode) {
    if (mode !== "price-trends") {
        return;
    }
    try {
        await waitForSelectorViaCdp(client, "[data-testid=\"tab-priceTrends\"]", 15000);
        await evaluateViaCdp(client, `
            (() => {
                const tab = document.querySelector("[data-testid=\\"tab-priceTrends\\"]");
                if (tab instanceof HTMLElement) {
                    tab.click();
                    return true;
                }
                return false;
            })()
        `);
    } catch {
        // The selector counts below make the missing tab visible in the smoke output.
    }
}

async function waitForModeReady(page, mode, seconds) {
    const startedAt = Date.now();
    const timeoutAt = startedAt + seconds * 1000;
    let metrics = await collectModeMetrics(page, mode);
    while (!isModeReady(mode, metrics) && Date.now() < timeoutAt) {
        await page.waitForTimeout(1000);
        metrics = await collectModeMetrics(page, mode);
    }
    return {
        ready: isModeReady(mode, metrics),
        elapsedMs: Date.now() - startedAt,
        metrics
    };
}

async function waitForModeReadyViaCdp(client, mode, seconds) {
    const startedAt = Date.now();
    const timeoutAt = startedAt + seconds * 1000;
    let metrics = await collectModeMetricsViaCdp(client, mode);
    while (!isModeReady(mode, metrics) && Date.now() < timeoutAt) {
        await sleep(1000);
        metrics = await collectModeMetricsViaCdp(client, mode);
    }
    return {
        ready: isModeReady(mode, metrics),
        elapsedMs: Date.now() - startedAt,
        metrics
    };
}

function isModeReady(mode, metrics) {
    return assessModeMetrics(mode, metrics, { allowEmptyPriceTrends: false }).length === 0;
}

async function collectModeMetrics(page, mode) {
    return await page.evaluate(collectModeMetricsInPage, mode);
}

async function collectModeMetricsViaCdp(client, mode) {
    return await evaluateViaCdp(client, `(${collectModeMetricsInPage.toString()})(${JSON.stringify(mode)})`);
}

function collectModeMetricsInPage(selectedMode) {
        const doc = globalThis.document;
        const textFrom = (selector) => doc.querySelector(selector)?.textContent?.trim() ?? "none";
        const commonPageDiagnostics = () => ({
            "page title": doc.title || "none",
            "login form candidate": doc.querySelector("input[type=\"password\"], form[action*=\"login\" i], [data-testid*=\"login\" i]") !== null ? "yes" : "no",
            "calendar candidate": doc.querySelector("[data-testid*=\"calendar\" i], [class*=\"calendar\" i], a[href^=\"/analyze/\"], a[href*=\"/analyze/\"]") !== null ? "yes" : "no",
            "RAU userscript root": doc.querySelector("[data-ra-rank-recommendation-list], [data-ra-rank-recommendation-analyze-list], [data-ra-rank-recommendation-react-island], [data-ra-rank-recommendation-react-island-host]") !== null ? "yes" : "no",
            "RAU userscript root count": doc.querySelectorAll("[data-ra-rank-recommendation-list], [data-ra-rank-recommendation-analyze-list], [data-ra-rank-recommendation-react-island], [data-ra-rank-recommendation-react-island-host]").length,
            "React marker mounted": doc.querySelector("[data-ra-rank-recommendation-react-island=\"mounted\"]") !== null ? "yes" : "no"
        });
        if (selectedMode === "top") {
            return {
                ...commonPageDiagnostics(),
                "top row count": doc.querySelectorAll("[data-ra-rank-recommendation-row]").length,
                "React marker mounted": doc.querySelector("[data-ra-rank-recommendation-react-island=\"mounted\"]") !== null ? "yes" : "no",
                "target month select": doc.querySelector("[data-ra-rank-recommendation-target-month]") !== null ? "yes" : "no",
                "view mode buttons": doc.querySelectorAll("[data-ra-rank-recommendation-button-action=\"view-mode\"]").length,
                "display limit buttons": doc.querySelectorAll("[data-ra-rank-recommendation-display-limit-control] button").length,
                "rank order control": doc.querySelector("[data-ra-rank-recommendation-order-control]") !== null ? "yes" : "no",
                "primary actions wrappers": doc.querySelectorAll("[data-ra-rank-recommendation-primary-actions]").length,
                "secondary action markers": doc.querySelectorAll("[data-ra-rank-recommendation-ui-component=\"secondary-actions\"]").length,
                "status badge cells": doc.querySelectorAll("[data-ra-rank-recommendation-cell-role=\"status\"]").length,
                "curve preview buttons": doc.querySelectorAll("[data-ra-rank-recommendation-button-action=\"curve-preview-toggle\"]").length,
                "rank change buttons": doc.querySelectorAll("[data-ra-rank-recommendation-button-action=\"rank-change-preview-toggle\"]").length,
                "decision buttons": doc.querySelectorAll("[data-ra-rank-recommendation-button-action=\"snooze\"], [data-ra-rank-recommendation-button-action=\"dismiss\"]").length,
                "UI component markers": doc.querySelectorAll("[data-ra-rank-recommendation-ui-component]").length,
                "UI control markers": doc.querySelectorAll("[data-ra-rank-recommendation-ui-component=\"control-group\"]").length,
                "UI row layout markers": doc.querySelectorAll("[data-ra-rank-recommendation-ui-component=\"row-layout\"]").length,
                "UI popover markers": doc.querySelectorAll("[data-ra-rank-recommendation-ui-component=\"popover\"]").length,
                "UI pending markers": doc.querySelectorAll("[data-ra-rank-recommendation-ui-component=\"pending-notice\"]").length
            };
        }
        if (selectedMode === "price-trends") {
            return {
                ...commonPageDiagnostics(),
                "price trends tab": doc.querySelector("[data-testid=\"tab-priceTrends\"]") !== null ? "yes" : "no",
                "price trends content": doc.querySelector("[data-testid=\"price-trends-content\"]") !== null ? "yes" : "no",
                "price trends overview count": doc.querySelectorAll("[data-ra-sales-setting-price-trend-overview]").length,
                "price trends panel count": doc.querySelectorAll("[data-ra-sales-setting-price-trend-overview] [data-ra-sales-setting-competitor-price-chart-panel]").length,
                "price trends svg count": doc.querySelectorAll("[data-ra-sales-setting-price-trend-overview] [data-ra-sales-setting-competitor-price-chart-svg]").length,
                "price trends background text": textFrom("[data-ra-sales-setting-price-trend-overview] [data-ra-sales-setting-competitor-price-overview-meta]")
            };
        }
        if (selectedMode === "analyze-recommendations") {
            const rootCount = doc.querySelectorAll("[data-ra-rank-recommendation-analyze-list]").length;
            const rowCount = doc.querySelectorAll("[data-ra-rank-recommendation-analyze-row]").length;
            const emptyCount = doc.querySelectorAll("[data-ra-rank-recommendation-analyze-empty]").length;
            const writeButtonCount = doc.querySelectorAll(
                "[data-ra-rank-recommendation-analyze-list] [data-ra-rank-recommendation-button-action=\"rank-change-submit\"],"
                + "[data-ra-rank-recommendation-analyze-list] [data-ra-rank-recommendation-button-action=\"rank-change-preview-toggle\"],"
                + "[data-ra-rank-recommendation-analyze-list] [data-ra-rank-recommendation-button-action=\"snooze\"],"
                + "[data-ra-rank-recommendation-analyze-list] [data-ra-rank-recommendation-button-action=\"dismiss\"]"
            ).length;
            return {
                ...commonPageDiagnostics(),
                "Analyze page candidate": /^\/analyze\/\d{4}-\d{2}-\d{2}$/.test(globalThis.location.pathname) ? "yes" : "no",
                "Analyze recommendation root count": rootCount,
                "Analyze recommendation row count": rowCount,
                "Analyze recommendation empty count": emptyCount,
                "Analyze recommendation highlight count": doc.querySelectorAll("[data-ra-rank-recommendation-analyze-highlight=\"true\"]").length,
                "Analyze recommendation write button count": writeButtonCount,
                "Analyze recommendation read-only state": rootCount > 0 && writeButtonCount === 0 && (rowCount > 0 || emptyCount > 0) ? "yes" : "no"
            };
        }
        return {
            ...commonPageDiagnostics(),
            "monthly preview root count": doc.querySelectorAll("[data-ra-monthly-progress-preview-root]").length,
            "monthly preview panel count": doc.querySelectorAll("[data-ra-monthly-progress-preview-panel]").length,
            "monthly preview svg count": doc.querySelectorAll("[data-ra-monthly-progress-preview-svg]").length,
            "monthly daily diff count": doc.querySelectorAll("[data-ra-monthly-progress-daily-diff]").length,
            "monthly daily diff rows": doc.querySelectorAll("[data-ra-monthly-progress-daily-diff-row]").length,
            "monthly daily diff main rows": doc.querySelectorAll("[data-ra-monthly-progress-daily-diff] > table [data-ra-monthly-progress-daily-diff-row]").length,
            "monthly daily diff details rows": doc.querySelectorAll("[data-ra-monthly-progress-daily-diff] details [data-ra-monthly-progress-daily-diff-row]").length,
            "monthly daily diff details summary": textFrom("[data-ra-monthly-progress-daily-diff] details summary"),
            "monthly daily diff details initially open": doc.querySelector("[data-ra-monthly-progress-daily-diff] details")?.open === true ? "yes" : "no",
            "monthly status text": textFrom("[data-ra-monthly-progress-preview-status]")
        };
}

async function resolvePageTarget(cdpUrl, targetUrl) {
    const targets = await readCdpJson(cdpUrl, "/json/list");
    const pages = targets.filter((target) => target.type === "page");
    const exact = pages.find((target) => target.url === targetUrl);
    if (exact) {
        return exact;
    }
    const sameOrigin = pages.find((target) => target.url?.startsWith("https://ra.jalan.net/"));
    if (sameOrigin) {
        return sameOrigin;
    }
    const created = await createPageTarget(cdpUrl, targetUrl);
    if (created?.webSocketDebuggerUrl) {
        return created;
    }
    throw new Error("Chrome page target not found and new target could not be created.");
}

async function readCdpJson(cdpUrl, path) {
    const response = await fetch(`${cdpUrl.replace(/\/$/, "")}${path}`);
    if (!response.ok) {
        throw new Error(`CDP ${path} failed: HTTP ${response.status}`);
    }
    return await response.json();
}

async function createPageTarget(cdpUrl, targetUrl) {
    const endpoint = `${cdpUrl.replace(/\/$/, "")}/json/new?${encodeURIComponent(targetUrl)}`;
    let response = await fetch(endpoint, { method: "PUT" });
    if (!response.ok) {
        response = await fetch(endpoint);
    }
    if (!response.ok) {
        throw new Error(`CDP /json/new failed: HTTP ${response.status}`);
    }
    return await response.json();
}

class PageCdpClient {
    static async connect(webSocketUrl) {
        const socket = new WebSocket(webSocketUrl);
        const client = new PageCdpClient(socket);
        await new Promise((resolveConnection, rejectConnection) => {
            const timer = setTimeout(() => rejectConnection(new Error("page websocket connection timed out")), 15000);
            socket.addEventListener("open", () => {
                clearTimeout(timer);
                resolveConnection();
            }, { once: true });
            socket.addEventListener("error", () => {
                clearTimeout(timer);
                rejectConnection(new Error("page websocket connection failed"));
            }, { once: true });
        });
        return client;
    }

    constructor(socket) {
        this.socket = socket;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        this.socket.addEventListener("message", (event) => this.handleMessage(event));
        this.socket.addEventListener("close", () => this.rejectPending(new Error("page websocket closed")));
        this.socket.addEventListener("error", () => this.rejectPending(new Error("page websocket error")));
    }

    send(method, params = {}) {
        const id = this.nextId++;
        const payload = { id, method, params };
        return new Promise((resolveCommand, rejectCommand) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                rejectCommand(new Error(`CDP command timed out: ${method}`));
            }, 15000);
            this.pending.set(id, {
                resolve: (value) => {
                    clearTimeout(timer);
                    resolveCommand(value);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    rejectCommand(error);
                }
            });
            this.socket.send(JSON.stringify(payload));
        });
    }

    on(method, listener) {
        const existing = this.listeners.get(method) ?? [];
        existing.push(listener);
        this.listeners.set(method, existing);
    }

    off(method, listener) {
        const existing = this.listeners.get(method) ?? [];
        this.listeners.set(method, existing.filter((candidate) => candidate !== listener));
    }

    handleMessage(event) {
        const message = JSON.parse(event.data);
        if (typeof message.id === "number") {
            const pendingCommand = this.pending.get(message.id);
            if (!pendingCommand) {
                return;
            }
            this.pending.delete(message.id);
            if (message.error) {
                pendingCommand.reject(new Error(message.error.message ?? "CDP command failed"));
            } else {
                pendingCommand.resolve(message.result ?? {});
            }
            return;
        }
        if (message.method) {
            for (const listener of this.listeners.get(message.method) ?? []) {
                listener(message);
            }
        }
    }

    async close() {
        this.rejectPending(new Error("page websocket closed"));
        this.socket.close();
    }

    rejectPending(error) {
        for (const pendingCommand of this.pending.values()) {
            pendingCommand.reject(error);
        }
        this.pending.clear();
    }
}

async function evaluateViaCdp(client, expression) {
    const result = await client.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
    }
    return result.result?.value;
}

async function getPageUrlViaCdp(client) {
    return await evaluateViaCdp(client, "globalThis.location.href");
}

async function waitForSelectorViaCdp(client, selector, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const found = await evaluateViaCdp(client, `document.querySelector(${JSON.stringify(selector)}) !== null`);
        if (found) {
            return;
        }
        await sleep(500);
    }
    throw new Error(`selector not found: ${selector}`);
}

async function waitForCdpEvent(client, method, timeoutMs) {
    await new Promise((resolveEvent, rejectEvent) => {
        const timer = setTimeout(() => {
            client.off(method, listener);
            rejectEvent(new Error(`${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        const listener = () => {
            clearTimeout(timer);
            client.off(method, listener);
            resolveEvent();
        };
        client.on(method, listener);
    });
}

function sleep(ms) {
    return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function formatErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function formatRuntimeConsoleText(args = []) {
    return args.map((arg) => arg.value ?? arg.description ?? "").filter(Boolean).join(" ");
}

async function resolvePage(context, url) {
    const exact = context.pages().find((page) => page.url() === url);
    if (exact) {
        return exact;
    }
    const sameOrigin = context.pages().find((page) => page.url().startsWith("https://ra.jalan.net/"));
    if (sameOrigin) {
        return sameOrigin;
    }
    return await context.newPage();
}

function extractUserscriptMetadata(text, key) {
    const pattern = new RegExp(`^//\\s*@${escapeRegExp(key)}\\s+(.+)$`, "m");
    const match = text.match(pattern);
    return match?.[1]?.trim() ?? null;
}

function sanitizeUrl(value) {
    const url = new URL(value);
    url.search = "";
    return url.toString();
}

function matchesWriteEndpoint(value) {
    try {
        const url = new URL(value);
        return WRITE_ENDPOINTS.some((endpoint) => url.pathname.includes(endpoint));
    } catch {
        return WRITE_ENDPOINTS.some((endpoint) => value.includes(endpoint));
    }
}

function parsePositiveInteger(value, fallback) {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseMode(value) {
    if (SMOKE_MODES.has(value)) {
        return value;
    }
    throw new Error(`unsupported smoke mode: ${value}. Expected one of: ${[...SMOKE_MODES].join(", ")}`);
}

function parseVersionPolicy(value) {
    if (VERSION_POLICIES.has(value)) {
        return value;
    }
    throw new Error(`unsupported version policy: ${value}. Expected one of: ${[...VERSION_POLICIES].join(", ")}`);
}

function parseCdpConnectionMode(value) {
    if (CDP_CONNECTION_MODES.has(value)) {
        return value;
    }
    throw new Error(`unsupported CDP connection mode: ${value}. Expected one of: ${[...CDP_CONNECTION_MODES].join(", ")}`);
}

function parseArgs(values) {
    const parsed = {};
    for (let index = 0; index < values.length; index += 1) {
        const current = values[index];
        if (!current?.startsWith("--")) {
            continue;
        }
        const [rawKey, rawValue] = current.slice(2).split("=", 2);
        if (!rawKey) {
            continue;
        }
        if (rawValue !== undefined) {
            parsed[rawKey] = rawValue;
            continue;
        }
        const next = values[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
            parsed[rawKey] = next;
            index += 1;
        } else {
            parsed[rawKey] = "true";
        }
    }
    return parsed;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

await main();
