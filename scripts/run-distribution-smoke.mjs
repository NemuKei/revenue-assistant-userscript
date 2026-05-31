import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const DEFAULT_DIST_PATH = "dist/revenue-assistant-userscript.user.js";
const DEFAULT_PUBLISHED_URL = "https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js";
const DEFAULT_URL = "https://ra.jalan.net/";
const DEFAULT_SECONDS = 20;
const SMOKE_MODES = new Set(["top", "price-trends", "monthly-progress"]);
const VERSION_POLICIES = new Set(["warn", "fail"]);
const WRITE_ENDPOINTS = [
    "/api/v1/lincoln/suggest",
    "/api/v1/lincoln/price_ranks",
    "/api/v1/tema/price_ranks",
    "/api/v1/neppan/price_ranks"
];

const args = parseArgs(process.argv.slice(2));
const cdpUrl = args["cdp-url"] ?? process.env.CHROME_CDP_URL ?? DEFAULT_CDP_URL;
const distPath = args["dist"] ?? DEFAULT_DIST_PATH;
const publishedUrl = args["published-url"] ?? DEFAULT_PUBLISHED_URL;
const installedVersion = args["installed-version"] ?? "manual-check-required";
const mode = parseMode(args.mode ?? "top");
const targetUrl = args["url"] ?? DEFAULT_URL;
const seconds = parsePositiveInteger(args["seconds"], DEFAULT_SECONDS);
const versionPolicy = parseVersionPolicy(args["version-policy"] ?? (args["allow-version-mismatch"] === "true" ? "warn" : "warn"));
const allowEmptyPriceTrends = args["allow-empty-price-trends"] === "true";

const localText = await readFile(resolve(distPath), "utf8");
const localVersion = extractUserscriptMetadata(localText, "version") ?? "unknown";
const localUpdateUrl = extractUserscriptMetadata(localText, "updateURL") ?? "none";
const localDownloadUrl = extractUserscriptMetadata(localText, "downloadURL") ?? "none";
const publishedVersionResult = await readPublishedVersion(publishedUrl);
const smokeResult = await runChromeSmoke({ cdpUrl, targetUrl, seconds, mode });
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
    const browser = await chromium.connectOverCDP(options.cdpUrl);
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

        if (page.url() !== options.targetUrl) {
            await page.goto(options.targetUrl, { waitUntil: "domcontentloaded" });
        } else {
            await page.reload({ waitUntil: "domcontentloaded" });
        }
        await prepareMode(page, options.mode);
        await page.waitForTimeout(options.seconds * 1000);

        const modeMetrics = await collectModeMetrics(page, options.mode);

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

    return { failures, warnings };
}

function assessModeMetrics(mode, metrics, options) {
    if (mode === "top") {
        return [
            minCountFailure("top row count", metrics["top row count"], 1),
            yesFailure("React marker mounted", metrics["React marker mounted"]),
            yesFailure("target month select", metrics["target month select"]),
            minCountFailure("view mode buttons", metrics["view mode buttons"], 1),
            minCountFailure("display limit buttons", metrics["display limit buttons"], 1),
            yesFailure("rank order control", metrics["rank order control"]),
            minCountFailure("curve preview buttons", metrics["curve preview buttons"], 1),
            minCountFailure("rank change buttons", metrics["rank change buttons"], 1),
            minCountFailure("decision buttons", metrics["decision buttons"], 1)
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
    if (mode === "price-trends") {
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

async function collectModeMetrics(page, mode) {
    return await page.evaluate((selectedMode) => {
        const doc = globalThis.document;
        const textFrom = (selector) => doc.querySelector(selector)?.textContent?.trim() ?? "none";
        const commonPageDiagnostics = () => ({
            "page title": doc.title || "none",
            "login form candidate": doc.querySelector("input[type=\"password\"], form[action*=\"login\" i], [data-testid*=\"login\" i]") !== null ? "yes" : "no",
            "calendar candidate": doc.querySelector("[data-testid*=\"calendar\" i], [class*=\"calendar\" i], a[href^=\"/analyze/\"], a[href*=\"/analyze/\"]") !== null ? "yes" : "no",
            "RAU userscript root": doc.querySelector("[data-ra-rank-recommendation-list], [data-ra-rank-recommendation-react-island], [data-ra-rank-recommendation-react-island-host]") !== null ? "yes" : "no"
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
                "curve preview buttons": doc.querySelectorAll("[data-ra-rank-recommendation-button-action=\"curve-preview-toggle\"]").length,
                "rank change buttons": doc.querySelectorAll("[data-ra-rank-recommendation-button-action=\"rank-change-preview-toggle\"]").length,
                "decision buttons": doc.querySelectorAll("[data-ra-rank-recommendation-button-action=\"snooze\"], [data-ra-rank-recommendation-button-action=\"dismiss\"]").length
            };
        }
        if (selectedMode === "price-trends") {
            return {
                "price trends tab": doc.querySelector("[data-testid=\"tab-priceTrends\"]") !== null ? "yes" : "no",
                "price trends content": doc.querySelector("[data-testid=\"price-trends-content\"]") !== null ? "yes" : "no",
                "price trends overview count": doc.querySelectorAll("[data-ra-sales-setting-price-trend-overview]").length,
                "price trends panel count": doc.querySelectorAll("[data-ra-sales-setting-price-trend-overview] [data-ra-sales-setting-competitor-price-chart-panel]").length,
                "price trends svg count": doc.querySelectorAll("[data-ra-sales-setting-price-trend-overview] [data-ra-sales-setting-competitor-price-chart-svg]").length,
                "price trends background text": textFrom("[data-ra-sales-setting-price-trend-overview] [data-ra-sales-setting-competitor-price-overview-meta]")
            };
        }
        return {
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
    }, mode);
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
