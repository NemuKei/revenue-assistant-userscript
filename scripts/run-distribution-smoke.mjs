import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const DEFAULT_DIST_PATH = "dist/revenue-assistant-userscript.user.js";
const DEFAULT_PUBLISHED_URL = "https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js";
const DEFAULT_URL = "https://ra.jalan.net/";
const DEFAULT_SECONDS = 20;
const SMOKE_MODES = new Set(["top", "price-trends", "monthly-progress"]);
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

const localText = await readFile(resolve(distPath), "utf8");
const localVersion = extractUserscriptMetadata(localText, "version") ?? "unknown";
const localUpdateUrl = extractUserscriptMetadata(localText, "updateURL") ?? "none";
const localDownloadUrl = extractUserscriptMetadata(localText, "downloadURL") ?? "none";
const publishedVersionResult = await readPublishedVersion(publishedUrl);
const smokeResult = await runChromeSmoke({ cdpUrl, targetUrl, seconds, mode });

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
        if (selectedMode === "top") {
            return {
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
