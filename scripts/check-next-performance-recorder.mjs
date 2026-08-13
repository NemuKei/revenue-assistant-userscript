import assert from "node:assert/strict";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const performanceModule = await importBundledTypeScript(
    "../src/next/performance/nextPerformanceRecorder.ts",
    import.meta.url
);

const documentHost = createDocumentFixture();
let currentTime = 100;
const windowHost = {
    localStorage: {
        getItem() {
            return null;
        }
    },
    performance: {
        now() {
            return currentTime;
        }
    }
};
const recorder = performanceModule.createNextPerformanceRecorder({
    documentHost,
    now: () => currentTime,
    sourceRevision: "0.2.0.25",
    windowHost
});

const topGeneration = recorder.beginContext({
    contextToken: "private-context-value-must-not-be-published",
    operation: "top-route",
    route: "top",
    warmth: "warm"
});
currentTime = 112.4;
recorder.mark(topGeneration, {
    name: "routeObserved",
    outcome: "ready",
    source: "none"
});
currentTime = 121.6;
recorder.mark(topGeneration, {
    name: "shellPainted",
    outcome: "ready",
    source: "none"
});
currentTime = 140;
recorder.mark(topGeneration, {
    counts: {
        eligibleVisibleDates: 2,
        renderedExactGroupDates: 2,
        validExactGroupSourceDates: 2
    },
    freshness: "fresh",
    name: "cachedGroupSettled",
    outcome: "ready",
    source: "cache"
});
currentTime = 200;
recorder.mark(topGeneration, {
    name: "shellPainted",
    outcome: "error",
    source: "network"
});
recorder.recordScheduler(topGeneration, { count: 3, event: "planned" });
recorder.recordScheduler(topGeneration, { count: 1, event: "interactive-queued" });
currentTime = 145;
recorder.recordScheduler(topGeneration, { activeRequestCount: 2, event: "interactive-started" });
recorder.recordScheduler(topGeneration, { count: 1, event: "aborted" });

const topSnapshot = recorder.snapshot();
assert.notEqual(topSnapshot, null);
assert.equal(topSnapshot.milestones.routeObserved.elapsedMs, 12);
assert.equal(topSnapshot.milestones.shellPainted.elapsedMs, 22);
assert.equal(topSnapshot.milestones.shellPainted.outcome, "ready", "first write must win");
assert.equal(topSnapshot.scheduler.plannedRequestCount, 3);
assert.equal(topSnapshot.scheduler.interactiveQueuedRequestCount, 1);
assert.equal(topSnapshot.scheduler.interactiveStartedAtMs, 45);
assert.equal(topSnapshot.scheduler.maxConcurrentRequests, 2);
assert.equal(topSnapshot.scheduler.abortedRequestCount, 1);
assert.equal(documentHost.markers.length, 1, "only one DOM marker may exist");
assert.equal(
    documentHost.markers[0].attributes.has(performanceModule.NEXT_PERFORMANCE_MARKER_ATTRIBUTE),
    true
);
const markerText = documentHost.markers[0].textContent;
assert.equal(markerText.includes("private-context-value-must-not-be-published"), false);
for (const forbidden of [
    "facilityId",
    "stayDate",
    "roomGroupId",
    "roomGroupName",
    "price",
    "inventory",
    "requestBody",
    "responseBody",
    "storageKey",
    "cookie",
    "token",
    "credential",
    "url"
]) {
    assert.equal(markerText.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
}

currentTime = 300;
const analyzeGeneration = recorder.beginContext({
    contextToken: "another-private-value",
    operation: "analyze-surface",
    roomBand: "1-6",
    route: "analyze",
    warmth: "revalidate"
});
assert.notEqual(analyzeGeneration, topGeneration);
recorder.mark(topGeneration, {
    name: "rankSettled",
    outcome: "ready",
    source: "network"
});
assert.equal(recorder.snapshot().milestones.rankSettled, undefined, "stale generation must be ignored");
currentTime = 320;
recorder.mark(analyzeGeneration, {
    name: "surfaceObserved",
    outcome: "ready",
    source: "none"
});
currentTime = 350;
recorder.mark(analyzeGeneration, {
    counts: {
        readyRequiredRoomScopes: 0,
        requiredRoomScopes: 0
    },
    name: "allRoomSummarySettled",
    outcome: "partial",
    source: "mixed"
});
const parsed = performanceModule.parseNextPerformanceSummary(
    JSON.parse(documentHost.markers[0].textContent)
);
assert.notEqual(parsed, null);
assert.equal(parsed.warmth, "revalidate");

const invalidWithForbiddenField = {
    ...parsed,
    facilityId: "must-be-rejected"
};
assert.equal(performanceModule.parseNextPerformanceSummary(invalidWithForbiddenField), null);
assert.equal(
    performanceModule.parseNextPerformanceSummary({
        ...parsed,
        operation: "competitor-surface"
    }),
    null,
    "route and operation must remain a fixed valid pair"
);
const invalidReadyNone = structuredClone(parsed);
invalidReadyNone.milestones.overallSettled = {
    elapsedMs: 1,
    freshness: "fresh",
    outcome: "ready",
    source: "none"
};
assert.equal(performanceModule.parseNextPerformanceSummary(invalidReadyNone), null);

const measuredSamples = Array.from({ length: 20 }, (_, index) => ({
    ...structuredClone(parsed),
    generation: index + 1,
    milestones: {
        overallSettled: {
            elapsedMs: index + 1,
            freshness: "fresh",
            outcome: "ready",
            source: "network"
        }
    }
}));
const measuredSummary = performanceModule.summarizeNextPerformanceSamples(measuredSamples);
assert.equal(measuredSummary.sampleCount, 20);
assert.equal(measuredSummary.invalidSampleCount, 0);
const overall = measuredSummary.cohorts[0].milestones.overallSettled;
assert.equal(overall.status, "measured");
assert.equal(overall.p95Ms, 19, "p95 must use nearest-rank ceil(.95 * N)");
assert.equal(overall.medianMs, 10.5);
assert.equal(overall.maxMs, 20);
assert.equal(
    measuredSummary.cohorts[0].milestones.surfaceObserved.exclusions.notObserved,
    20,
    "missing milestones must remain explicit exclusions"
);

const noSourceSummary = performanceModule.summarizeNextPerformanceSamples([parsed]);
const allRooms = noSourceSummary.cohorts[0].milestones.allRoomSummarySettled;
assert.equal(allRooms.eligibleSampleCount, 0);
assert.equal(allRooms.coverage, null);
assert.equal(allRooms.coverageNoSourceSampleCount, 1);
assert.equal(allRooms.exclusions.noSource, 1, "0 / 0 must stay no-source");
assert.equal(allRooms.status, "provisional");

const emptyRankSample = {
    ...structuredClone(parsed),
    counts: {
        renderedRankEventDates: 0,
        validRankEventDates: 0
    },
    operation: "top-route",
    route: "top",
    milestones: {
        rankSettled: {
            elapsedMs: 47,
            freshness: "fresh",
            outcome: "empty",
            source: "network"
        }
    }
};
const emptyRank = performanceModule.summarizeNextPerformanceSamples([emptyRankSample])
    .cohorts[0].milestones.rankSettled;
assert.equal(emptyRank.eligibleSampleCount, 1, "a settled empty rank range remains latency-eligible");
assert.equal(emptyRank.p95Ms, 47);
assert.equal(emptyRank.coverage, null, "event coverage must remain unavailable for 0 / 0");
assert.equal(emptyRank.coverageNoSourceSampleCount, 1);
assert.equal(emptyRank.exclusions.noSource, 0, "rank empty is not a latency no-source exclusion");

const outcomeSamples = ["partial", "error", "aborted"].map((outcome, index) => ({
    ...structuredClone(parsed),
    generation: index + 1,
    counts: { readyRequiredRoomScopes: 1, requiredRoomScopes: 1 },
    milestones: {
        allRoomSummarySettled: {
            elapsedMs: 10 + index,
            freshness: "unknown",
            outcome,
            source: "mixed"
        }
    }
}));
const outcomeSummary = performanceModule.summarizeNextPerformanceSamples(outcomeSamples);
const excludedRooms = outcomeSummary.cohorts[0].milestones.allRoomSummarySettled;
assert.equal(excludedRooms.exclusions.notDecisionReady, 2);
assert.equal(excludedRooms.exclusions.aborted, 1);

const schedulerSamples = measuredSamples.map((sample, index) => ({
    ...sample,
    scheduler: {
        ...sample.scheduler,
        interactiveQueuedAtMs: 10,
        interactiveStartedAtMs: 11 + index,
        maxConcurrentRequests: Math.min(30, index + 1),
        plannedRequestCount: 2,
        startedRequestCount: 1
    }
}));
const schedulerSummary = performanceModule.summarizeNextPerformanceSamples(schedulerSamples)
    .cohorts[0].scheduler;
assert.equal(schedulerSummary.interactiveWait.status, "measured");
assert.equal(schedulerSummary.interactiveWait.p95Ms, 19);
assert.equal(schedulerSummary.interactiveWait.medianMs, 10.5);
assert.equal(schedulerSummary.plannedRequestCount, 40);
assert.equal(schedulerSummary.startedRequestCount, 20);
assert.equal(schedulerSummary.maxConcurrentRequests, 20);

recorder.clear(topGeneration);
assert.equal(
    documentHost.markers.length,
    1,
    "a stale runtime must not clear the current operation marker"
);
recorder.clear(analyzeGeneration);
assert.equal(documentHost.markers.length, 0, "the owning generation must clear its marker");
assert.equal(recorder.snapshot(), null);
const resumedGeneration = recorder.beginContext({
    contextToken: "resumed-private-value",
    operation: "competitor-surface",
    route: "competitor"
});
assert.equal(resumedGeneration > analyzeGeneration, true);
assert.equal(documentHost.markers.length, 1, "a later context may publish a fresh marker");
recorder.recordScheduler(resumedGeneration, { count: 1, event: "planned" });
recorder.recordScheduler(resumedGeneration, { count: 2, event: "planned" });
assert.equal(
    JSON.parse(documentHost.markers[0].textContent).scheduler.plannedRequestCount,
    0,
    "synchronous planning bursts must not rewrite the DOM marker per task"
);
await Promise.resolve();
assert.equal(
    JSON.parse(documentHost.markers[0].textContent).scheduler.plannedRequestCount,
    3,
    "the coalesced marker must still publish the complete planned count"
);

assert.equal(performanceModule.resolveNextPerformanceRoomBand(0), "none");
assert.equal(performanceModule.resolveNextPerformanceRoomBand(6), "1-6");
assert.equal(performanceModule.resolveNextPerformanceRoomBand(12), "7-12");
assert.equal(performanceModule.resolveNextPerformanceRoomBand(20), "13-20");
assert.equal(performanceModule.resolveNextPerformanceRoomBand(21), "21-plus");

recorder.stop();
assert.equal(documentHost.markers.length, 0);

console.log("next performance recorder check passed");

function createDocumentFixture() {
    const markers = [];
    const parent = {
        append(element) {
            if (!markers.includes(element)) {
                markers.push(element);
            }
            element.isConnected = true;
        }
    };
    return {
        markers,
        head: parent,
        documentElement: parent,
        createElement(tagName) {
            assert.equal(tagName, "script");
            const attributes = new Map();
            const element = {
                attributes,
                isConnected: false,
                textContent: "",
                type: "",
                setAttribute(name, value) {
                    attributes.set(name, value);
                },
                remove() {
                    const index = markers.indexOf(element);
                    if (index >= 0) {
                        markers.splice(index, 1);
                    }
                    element.isConnected = false;
                }
            };
            return element;
        },
        querySelectorAll() {
            return markers.slice();
        }
    };
}
