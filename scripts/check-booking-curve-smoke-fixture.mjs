import {
    assessBookingCurveThroughputFailures,
    summarizeBookingCurveRequests
} from "./booking-curve-smoke-metrics.mjs";

const SCENARIOS = {
    "warm-cache": {
        description: "RAU warm cache request count is 0; fallback reason explains cache-warm or no active monthly fetch without failing throughput.",
        expectFailure: false,
        expectFallback: true,
        entries: [
            pageEntry(0, 200, 1),
            pageEntry(420, 200, 1)
        ]
    },
    "safe-active": {
        description: "Enough RAU-tagged requests with HTTP 200, high-throughput start spacing, and concurrency <= 30.",
        expectFailure: false,
        expectFallback: false,
        entries: [
            rauEntry(0, 200, 1),
            rauEntry(35, 200, 10),
            rauEntry(70, 200, 20),
            rauEntry(105, 200, 30),
            rauEntry(140, 200, 30)
        ]
    },
    "unsafe-fast": {
        description: "Enough RAU-tagged requests but start spacing is below the safety floor.",
        expectFailure: true,
        expectFallback: false,
        entries: [
            rauEntry(0, 200, 1),
            rauEntry(10, 200, 10),
            rauEntry(20, 200, 20),
            rauEntry(30, 200, 30),
            rauEntry(40, 200, 30)
        ]
    },
    "unsafe-concurrent": {
        description: "Enough RAU-tagged requests but observed concurrency exceeds the safety cap.",
        expectFailure: true,
        expectFallback: false,
        entries: [
            rauEntry(0, 200, 1),
            rauEntry(35, 200, 10),
            rauEntry(70, 200, 20),
            rauEntry(105, 200, 31),
            rauEntry(140, 200, 31)
        ]
    },
    "http-error": {
        description: "Enough RAU-tagged requests but one request has an HTTP error status.",
        expectFailure: true,
        expectFallback: false,
        entries: [
            rauEntry(0, 200, 1),
            rauEntry(35, 200, 10),
            rauEntry(70, 500, 20),
            rauEntry(105, 200, 30),
            rauEntry(140, 200, 30)
        ]
    }
};

const args = parseArgs(process.argv.slice(2));
const requestedScenario = args.scenario ?? "all";
const scenarioNames = requestedScenario === "all" ? Object.keys(SCENARIOS) : [requestedScenario];
let failed = false;

for (const scenarioName of scenarioNames) {
    const scenario = SCENARIOS[scenarioName];
    if (!scenario) {
        console.error(`unknown scenario: ${scenarioName}`);
        console.error(`available scenarios: ${Object.keys(SCENARIOS).join(", ")}, all`);
        process.exit(1);
    }
    const metrics = summarizeBookingCurveRequests(scenario.entries);
    const failures = assessBookingCurveThroughputFailures(metrics);
    const fallbackReason = String(metrics["RAU warm cache throughput fallback reason"] ?? "");
    const hasFallback = fallbackReason !== "none";
    const matchedFailureExpectation = scenario.expectFailure ? failures.length > 0 : failures.length === 0;
    const matchedFallbackExpectation = scenario.expectFallback === hasFallback;
    const passed = matchedFailureExpectation && matchedFallbackExpectation;

    console.log(`scenario: ${scenarioName}`);
    console.log(`description: ${scenario.description}`);
    console.log(`RAU warm cache request count: ${metrics["RAU warm cache request count"]}`);
    console.log(`RAU warm cache HTTP error count: ${metrics["RAU warm cache HTTP error count"]}`);
    console.log(`RAU warm cache min start interval ms: ${metrics["RAU warm cache min start interval ms"]}`);
    console.log(`RAU warm cache max concurrent requests: ${metrics["RAU warm cache max concurrent requests"]}`);
    console.log(`RAU warm cache throughput fallback reason: ${fallbackReason}`);
    console.log(`expected throughput failure: ${scenario.expectFailure ? "yes" : "no"}`);
    console.log(`observed throughput failures: ${failures.length === 0 ? "none" : failures.join(" | ")}`);
    console.log(`scenario result: ${passed ? "pass" : "fail"}`);
    if (!passed) {
        failed = true;
    }
}

if (failed) {
    process.exitCode = 1;
}

function rauEntry(startedAtMs, status, maxConcurrentAtStart) {
    return {
        startedAtMs,
        status,
        failed: false,
        maxConcurrentAtStart,
        source: "rau-warm-cache"
    };
}

function pageEntry(startedAtMs, status, maxConcurrentAtStart) {
    return {
        startedAtMs,
        status,
        failed: false,
        maxConcurrentAtStart,
        source: "page"
    };
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
