import { chromium } from "playwright-core";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const DEFAULT_SECONDS = 30;
const DEFAULT_ENDPOINTS = [
    "/api/v1/lincoln/suggest",
    "/api/v1/lincoln/price_ranks",
    "/api/v1/tema/price_ranks",
    "/api/v1/neppan/price_ranks"
];

const args = parseArgs(process.argv.slice(2));
const cdpUrl = args["cdp-url"] ?? process.env.CHROME_CDP_URL ?? DEFAULT_CDP_URL;
const seconds = parsePositiveInteger(args["seconds"], DEFAULT_SECONDS);
const pageIndex = parsePositiveInteger(args["page-index"], 0);
const targetUrl = args["url"] ?? null;
const operation = args["operation"] ?? "manual-smoke";
const endpoints = args["endpoints"]
    ? args["endpoints"].split(",").map((endpoint) => endpoint.trim()).filter(Boolean)
    : DEFAULT_ENDPOINTS;

const browser = await chromium.connectOverCDP(cdpUrl);
const observedRequests = [];
let observedUrl;

try {
    const context = browser.contexts()[0];
    if (!context) {
        throw new Error("Chrome context not found. Start Chrome with remote debugging port first.");
    }
    const page = await resolvePage(context, pageIndex, targetUrl);
    observedUrl = page.url();

    const onRequest = (request) => {
        if (request.method() !== "POST") {
            return;
        }
        const requestUrl = request.url();
        if (!endpoints.some((endpoint) => requestUrl.includes(endpoint))) {
            return;
        }
        observedRequests.push({
            url: sanitizeUrl(requestUrl),
            method: request.method(),
            observedAt: new Date().toISOString()
        });
    };
    page.on("request", onRequest);

    console.log(`monitor target URL: ${observedUrl}`);
    console.log(`operation: ${operation}`);
    console.log(`duration seconds: ${seconds}`);
    console.log(`write endpoints: ${endpoints.join(", ")}`);
    await page.waitForTimeout(seconds * 1000);
    page.off("request", onRequest);
} finally {
    await browser.close();
}

console.log(`POST count: ${observedRequests.length}`);
for (const request of observedRequests) {
    console.log(`- ${request.method} ${request.url} at ${request.observedAt}`);
}
console.log(`confirmed at: ${new Date().toISOString()}`);

async function resolvePage(context, index, url) {
    if (url) {
        const existing = context.pages().find((page) => page.url() === url);
        if (existing) {
            return existing;
        }
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return page;
    }

    const page = context.pages()[index];
    if (!page) {
        throw new Error(`Chrome page index ${index} not found`);
    }
    return page;
}

function sanitizeUrl(value) {
    const url = new URL(value);
    url.search = "";
    return url.toString();
}

function parsePositiveInteger(value, fallback) {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
