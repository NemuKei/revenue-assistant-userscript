import { chromium } from "playwright-core";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const DEFAULT_SECONDS = 300;
const args = parseArgs(process.argv.slice(2));
const seconds = parsePositiveInteger(args.seconds, DEFAULT_SECONDS);
const cdpUrl = args["cdp-url"] ?? process.env.CHROME_CDP_URL ?? DEFAULT_CDP_URL;
const performanceModule = await importBundledTypeScript(
    "../src/next/performance/nextPerformanceRecorder.ts",
    import.meta.url
);
const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 30_000 });

try {
    const page = browser.contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => {
            try {
                return new URL(candidate.url()).hostname === "ra.jalan.net";
            } catch {
                return false;
            }
        });
    if (page === undefined) {
        throw new Error("Revenue Assistant page was not found in the connected Chrome session");
    }
    const samplesByRun = new Map();
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
        const observed = await page.evaluate(() => ({
            runtimeEpoch: globalThis.performance.timeOrigin,
            text: globalThis.document.querySelector(
                "[data-ra-fetch-performance-summary]"
            )?.textContent ?? ""
        })).catch(() => null);
        if (observed !== null && observed.text.trim() !== "") {
            try {
                const value = JSON.parse(observed.text);
                const sample = performanceModule.parseNextPerformanceSummary(value);
                if (sample !== null) {
                    const runKey = [
                        observed.runtimeEpoch,
                        sample.sourceRevision,
                        sample.schemaVersion,
                        sample.generation,
                        sample.route,
                        sample.operation
                    ].join("|");
                    samplesByRun.set(runKey, sample);
                }
            } catch {
                // A marker being replaced between reads is ignored and retried in-memory.
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const summary = performanceModule.summarizeNextPerformanceSamples(
        Array.from(samplesByRun.values())
    );
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
    await browser.close();
}

function parseArgs(values) {
    const output = {};
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (!value?.startsWith("--")) {
            continue;
        }
        const key = value.slice(2);
        const next = values[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
            output[key] = next;
            index += 1;
        } else {
            output[key] = "true";
        }
    }
    return output;
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 3_600) {
        throw new Error("--seconds must be an integer from 1 to 3600");
    }
    return parsed;
}
