import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_DIST_PATH = "dist/revenue-assistant-userscript.user.js";
const DEFAULT_PUBLISHED_URL = "https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js";
const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const REVENUE_ASSISTANT_ORIGIN = "https://ra.jalan.net";

const args = parseArgs(process.argv.slice(2));
const distPath = args["dist"] ?? DEFAULT_DIST_PATH;
const publishedUrl = args["published-url"] ?? DEFAULT_PUBLISHED_URL;
const cdpUrl = args["cdp-url"] ?? process.env.CHROME_CDP_URL ?? DEFAULT_CDP_URL;
const installedVersion = args["installed-version"] ?? null;
const openUrl = args["open-url"] ?? null;

const localText = await readFile(resolve(distPath), "utf8");
const localVersion = extractUserscriptVersion(localText);
const localUpdateUrl = extractUserscriptMetadata(localText, "updateURL");
const localDownloadUrl = extractUserscriptMetadata(localText, "downloadURL");

let publishedVersion = "unavailable";
let publishedError = null;
try {
    const response = await fetch(publishedUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    publishedVersion = extractUserscriptVersion(await response.text());
} catch (error) {
    publishedError = error instanceof Error ? error.message : String(error);
}

const chromeState = await readChromeState(cdpUrl, openUrl).catch((error) => ({
    reachable: false,
    error: error instanceof Error ? error.message : String(error),
    revenueAssistantPages: []
}));

console.log(`local version: ${localVersion}`);
console.log(`published version: ${publishedVersion}`);
console.log(`installed version: ${installedVersion ?? "manual-check-required"}`);
console.log(`local updateURL: ${localUpdateUrl ?? "none"}`);
console.log(`local downloadURL: ${localDownloadUrl ?? "none"}`);
console.log(`published URL: ${publishedUrl}`);
console.log(`Chrome CDP: ${chromeState.reachable ? "reachable" : "unreachable"}`);
if (chromeState.error) {
    console.log(`Chrome CDP error: ${chromeState.error}`);
}
if (publishedError !== null) {
    console.log(`published fetch error: ${publishedError}`);
}
if (chromeState.revenueAssistantPages.length === 0) {
    console.log("Revenue Assistant pages: none");
} else {
    console.log("Revenue Assistant pages:");
    for (const page of chromeState.revenueAssistantPages) {
        console.log(`- ${page.title} | ${page.url}`);
        console.log(`  login form candidate: ${page.diagnostics.loginFormCandidate}`);
        console.log(`  calendar candidate: ${page.diagnostics.calendarCandidate}`);
        console.log(`  RAU userscript root count: ${page.diagnostics.rauUserscriptRootCount}`);
        console.log(`  React marker mounted: ${page.diagnostics.reactMarkerMounted}`);
    }
}
console.log(`opened Revenue Assistant URL: ${openUrl ?? "none"}`);
console.log(`confirmed at: ${new Date().toISOString()}`);

function extractUserscriptVersion(text) {
    return extractUserscriptMetadata(text, "version") ?? "unknown";
}

function extractUserscriptMetadata(text, key) {
    const pattern = new RegExp(`^//\\s*@${escapeRegExp(key)}\\s+(.+)$`, "m");
    const match = text.match(pattern);
    return match?.[1]?.trim() ?? null;
}

async function readChromeState(endpoint, urlToOpen) {
    const browser = await chromium.connectOverCDP(endpoint);
    try {
        const context = browser.contexts()[0];
        if (!context) {
            throw new Error("Chrome context not found");
        }
        if (urlToOpen) {
            const page = await context.newPage();
            await page.goto(urlToOpen, { waitUntil: "domcontentloaded" });
        }
        const revenueAssistantPages = [];
        for (const page of context.pages()) {
            const url = page.url();
            if (!url.startsWith(REVENUE_ASSISTANT_ORIGIN)) {
                continue;
            }
            await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
            let title = "(title unavailable)";
            let diagnostics = {
                loginFormCandidate: "unknown",
                calendarCandidate: "unknown",
                rauUserscriptRootCount: "unknown",
                reactMarkerMounted: "unknown"
            };
            try {
                title = await page.title();
            } catch {
                title = "(title unavailable)";
            }
            try {
                diagnostics = await page.evaluate(() => {
                    const doc = globalThis.document;
                    return {
                        loginFormCandidate: doc.querySelector("input[type=\"password\"], form[action*=\"login\" i], [data-testid*=\"login\" i]") !== null ? "yes" : "no",
                        calendarCandidate: doc.querySelector("[data-testid*=\"calendar\" i], [class*=\"calendar\" i], a[href^=\"/analyze/\"], a[href*=\"/analyze/\"]") !== null ? "yes" : "no",
                        rauUserscriptRootCount: String(doc.querySelectorAll("[data-ra-rank-recommendation-list], [data-ra-rank-recommendation-react-island], [data-ra-rank-recommendation-react-island-host]").length),
                        reactMarkerMounted: doc.querySelector("[data-ra-rank-recommendation-react-island=\"mounted\"]") !== null ? "yes" : "no"
                    };
                });
            } catch {
                diagnostics = {
                    loginFormCandidate: "unknown",
                    calendarCandidate: "unknown",
                    rauUserscriptRootCount: "unknown",
                    reactMarkerMounted: "unknown"
                };
            }
            revenueAssistantPages.push({ title, url, diagnostics });
        }
        return { reachable: true, error: null, revenueAssistantPages };
    } finally {
        await browser.close();
    }
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
