import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { build as buildBundle } from "esbuild";
import { chromium } from "playwright-core";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const model = await importBundledTypeScript(
    "../src/next/rankLearning/rankLearningCoverageModel.ts",
    import.meta.url
);
const captureParser = await importBundledTypeScript(
    "../src/next/rankLearning/rankLearningCaptureParser.ts",
    import.meta.url
);
const captureStore = await importBundledTypeScript(
    "../src/next/rankLearning/rankLearningStore.ts",
    import.meta.url
);
const captureWriter = await importBundledTypeScript(
    "../src/next/rankLearning/rankLearningCaptureWriter.ts",
    import.meta.url
);

const facilityId = "facility:fixture";
const confirmedOrder = {
    status: "confirmed",
    namesHighToLow: ["1", "2", "3", "4"]
};

const clusteredReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: confirmedOrder,
    events: [
        event({ roomGroupId: "twin", stayDate: "20260810" }),
        event({ roomGroupId: "twin", stayDate: "20260811" }),
        event({ roomGroupId: "twin", stayDate: "20260812" }),
        event({ roomGroupId: "double", stayDate: "20260810" }),
        event({
            afterRankName: "2",
            beforeRankName: "3",
            reflectedAt: "2026-08-05T09:00:00+09:00",
            reflectedDate: "20260805",
            roomGroupId: "suite",
            stayDate: "20260820"
        })
    ],
    curves: [
        curve("twin", "20260810", [["20260801", 4], ["20260804", 6], ["20260808", 9]]),
        curve("twin", "20260811", [["20260801", 5], ["20260804", 3], ["20260808", 6]]),
        curve("twin", "20260812", [["20260801", 1], ["20260804", 1], ["20260808", 2]]),
        curve("double", "20260810", [["20260801", 2], ["20260804", 3], ["20260808", 4]]),
        curve("suite", "20260820", [["20260805", 10], ["20260808", 11], ["20260812", 9]])
    ]
});

assert.equal(clusteredReport.episodeCount, 3, "continuous stay dates must form one episode per room and direction");
assert.equal(
    clusteredReport.stayDateMemberCount,
    5,
    "the same stay date in two rooms must remain two members"
);
assert.equal(
    clusteredReport.independentDecisionClusterCount,
    2,
    "multiple rooms and stay dates adjusted on one reflected date must count as one independent cluster"
);
assert.deepEqual(clusteredReport.horizons.map(pickHorizonCounts), [
    { censored: 0, days: 3, eligible: 5, excluded: 0, observed: 5 },
    { censored: 0, days: 7, eligible: 5, excluded: 0, observed: 5 }
]);
const twinEpisode = clusteredReport.episodes.find((episode) => episode.roomGroupId === "twin");
assert.notEqual(twinEpisode, undefined);
assert.equal(twinEpisode.direction, "lower");
assert.equal(twinEpisode.firstStayDate, "20260810");
assert.equal(twinEpisode.lastStayDate, "20260812");
assert.equal(twinEpisode.members.length, 3, "a three-day week block must remain one episode with three members");
assert.equal(
    twinEpisode.members[1].horizons.find((horizon) => horizon.days === 3).pickupRooms,
    -2,
    "cancellations must remain a negative pickup"
);
const suiteEpisode = clusteredReport.episodes.find((episode) => episode.roomGroupId === "suite");
assert.notEqual(suiteEpisode, undefined);
assert.equal(suiteEpisode.direction, "raise");
assert.equal(
    suiteEpisode.members[0].horizons.find((horizon) => horizon.days === 7).pickupRooms,
    -1
);
assert.equal(
    clusteredReport.byRoomTransition.find((entry) => entry.roomGroupId === "twin").episodeCount,
    1
);
assert.equal(clusteredReport.minimumSamplePolicy, "not-fixed");
assert.deepEqual(clusteredReport.noChangeControl, {
    reasons: [
        "rank-status-history-completeness-unconfirmed",
        "daily-current-rank-snapshots-not-collected",
        "unchanged-window-not-proven",
        "matching-policy-not-defined"
    ],
    status: "disabled"
});

const mixedTransitionReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: confirmedOrder,
    events: [
        event({
            afterRankName: "2",
            beforeRankName: "1",
            roomGroupId: "mixed-transition",
            stayDate: "20260810"
        }),
        event({
            afterRankName: "3",
            beforeRankName: "2",
            roomGroupId: "mixed-transition",
            stayDate: "20260811"
        })
    ],
    curves: [
        curve("mixed-transition", "20260810", [["20260801", 1], ["20260804", 2], ["20260808", 3]]),
        curve("mixed-transition", "20260811", [["20260801", 2], ["20260804", 4], ["20260808", 5]])
    ]
});
assert.equal(
    mixedTransitionReport.episodeCount,
    1,
    "one same-direction adjustment block must not split when adjacent rank pairs differ"
);
assert.equal(mixedTransitionReport.independentDecisionClusterCount, 1);
assert.deepEqual(
    mixedTransitionReport.episodes[0].members.map((member) => ({
        afterRankName: member.afterRankName,
        beforeRankName: member.beforeRankName,
        direction: member.direction,
        stayDate: member.stayDate
    })),
    [
        { afterRankName: "2", beforeRankName: "1", direction: "lower", stayDate: "20260810" },
        { afterRankName: "3", beforeRankName: "2", direction: "lower", stayDate: "20260811" }
    ]
);
assert.equal(mixedTransitionReport.episodes[0].beforeRankName, null);
assert.equal(mixedTransitionReport.episodes[0].afterRankName, null);
assert.deepEqual(
    mixedTransitionReport.byRoomTransition.map((entry) => ({
        afterRankName: entry.afterRankName,
        beforeRankName: entry.beforeRankName,
        decisionClusterCount: entry.decisionClusterCount,
        episodeCount: entry.episodeCount,
        stayDateMemberCount: entry.stayDateMemberCount
    })),
    [
        {
            afterRankName: "2",
            beforeRankName: "1",
            decisionClusterCount: 1,
            episodeCount: 1,
            stayDateMemberCount: 1
        },
        {
            afterRankName: "3",
            beforeRankName: "2",
            decisionClusterCount: 1,
            episodeCount: 1,
            stayDateMemberCount: 1
        }
    ]
);

const reflectedDateMismatchReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: confirmedOrder,
    curves: [],
    events: [event({
        reflectedAt: "2026-08-02T00:00:00+09:00",
        reflectedDate: "20260801",
        roomGroupId: "reflected-date-mismatch"
    })]
});
assert.deepEqual(reflectedDateMismatchReport.excludedEvents.byReason, [{
    count: 1,
    reason: "invalid-event"
}]);

const exclusionReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: confirmedOrder,
    curves: [],
    events: [
        event({ afterRankName: "3", beforeRankName: "1", roomGroupId: "nonadjacent" }),
        event({ afterRankName: "unknown", roomGroupId: "unknown" }),
        event({
            reflectedAt: "2026-08-02T08:00:00+09:00",
            reflectedDate: "20260802",
            roomGroupId: "same-day",
            stayDate: "20260822"
        }),
        event({
            afterRankName: "2",
            beforeRankName: "3",
            reflectedAt: "2026-08-02T12:00:00+09:00",
            reflectedDate: "20260802",
            roomGroupId: "same-day",
            stayDate: "20260822"
        }),
        event({
            reflectedAt: "2026-08-21T09:00:00+09:00",
            reflectedDate: "20260821",
            roomGroupId: "future",
            stayDate: "20260825"
        }),
        event({
            reflectedAt: "2026-08-10T09:00:00+09:00",
            reflectedDate: "20260810",
            roomGroupId: "after-stay",
            stayDate: "20260809"
        }),
        event({ afterRankName: "2", beforeRankName: "2", roomGroupId: "unchanged" }),
        event({ facilityId: "facility:other", roomGroupId: "mismatch" })
    ]
});
assert.equal(exclusionReport.episodeCount, 0);
assert.equal(exclusionReport.excludedEvents.count, 8);
assert.deepEqual(Object.fromEntries(
    exclusionReport.excludedEvents.byReason.map(({ count, reason }) => [reason, count])
), {
    "event-after-analysis-as-of": 1,
    "event-after-stay-date": 1,
    "facility-mismatch": 1,
    "rank-name-unresolved": 1,
    "same-day-multiple-changes": 2,
    "transition-non-adjacent": 1,
    "transition-unchanged": 1
});

const unconfirmedReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: { status: "unconfirmed" },
    curves: [],
    events: [event({ roomGroupId: "unconfirmed" })]
});
assert.deepEqual(unconfirmedReport.excludedEvents.byReason, [{
    count: 1,
    reason: "rank-order-unconfirmed"
}]);

const missingReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: confirmedOrder,
    events: [
        event({ roomGroupId: "missing-both", stayDate: "20260820" }),
        event({ roomGroupId: "missing-start", stayDate: "20260821" }),
        event({ roomGroupId: "missing-end", stayDate: "20260822" })
    ],
    curves: [
        curve("missing-start", "20260821", [["20260804", 4], ["20260808", 7]]),
        curve("missing-end", "20260822", [["20260801", 2]])
    ]
});
assert.deepEqual(missingReport.horizons.map((horizon) => ({
    ...pickHorizonCounts(horizon),
    reasons: Object.fromEntries(horizon.exclusionReasons.map(({ count, reason }) => [reason, count]))
})), [
    {
        censored: 0,
        days: 3,
        eligible: 3,
        excluded: 3,
        observed: 0,
        reasons: {
            "exact-end-missing": 1,
            "exact-start-and-end-missing": 1,
            "exact-start-missing": 1
        }
    },
    {
        censored: 0,
        days: 7,
        eligible: 3,
        excluded: 3,
        observed: 0,
        reasons: {
            "exact-end-missing": 1,
            "exact-start-and-end-missing": 1,
            "exact-start-missing": 1
        }
    }
]);

const futureHorizonReport = singleEventReport({
    analysisAsOfDate: "20260810",
    event: event({
        reflectedAt: "2026-08-09T09:00:00+09:00",
        reflectedDate: "20260809",
        roomGroupId: "future-horizon",
        stayDate: "20260825"
    })
});
assert.deepEqual(futureHorizonReport.horizons.map(singleCensorReason), [
    { count: 1, days: 3, reason: "horizon-after-analysis-as-of" },
    { count: 1, days: 7, reason: "horizon-after-analysis-as-of" }
]);

const stayOverrunReport = singleEventReport({
    analysisAsOfDate: "20260820",
    event: event({ roomGroupId: "stay-overrun", stayDate: "20260802" })
});
assert.deepEqual(stayOverrunReport.horizons.map(singleCensorReason), [
    { count: 1, days: 3, reason: "horizon-after-stay-date" },
    { count: 1, days: 7, reason: "horizon-after-stay-date" }
]);

const subsequentChangeReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: confirmedOrder,
    curves: [curve("changed-again", "20260825", [
        ["20260801", 2],
        ["20260803", 3],
        ["20260804", 4],
        ["20260806", 5],
        ["20260808", 6],
        ["20260810", 7]
    ])],
    events: [
        event({ roomGroupId: "changed-again", stayDate: "20260825" }),
        event({
            afterRankName: "2",
            beforeRankName: "3",
            reflectedAt: "2026-08-03T09:00:00+09:00",
            reflectedDate: "20260803",
            roomGroupId: "changed-again",
            stayDate: "20260825"
        })
    ]
});
const interruptedEpisode = subsequentChangeReport.episodes.find((episode) => episode.reflectedDate === "20260801");
assert.notEqual(interruptedEpisode, undefined);
assert.deepEqual(interruptedEpisode.members[0].horizons.map((horizon) => ({
    days: horizon.days,
    reason: horizon.reason,
    status: horizon.status
})), [
    { days: 3, reason: "rank-change-before-horizon", status: "censored" },
    { days: 7, reason: "rank-change-before-horizon", status: "censored" }
]);

const duplicate = event({ roomGroupId: "duplicate" });
const duplicateReport = model.buildRankLearningCoverageReport({
    analysisAsOfDate: "20260820",
    facilityId,
    rankOrder: confirmedOrder,
    curves: [],
    events: [duplicate, { ...duplicate }]
});
assert.equal(duplicateReport.episodeCount, 1);
assert.deepEqual(duplicateReport.excludedEvents.byReason, [{ count: 1, reason: "duplicate-event" }]);

const captureContext = {
    asOfDate: "20260812",
    capturedAt: "2026-08-12T03:00:00.000Z",
    facilityId,
    sourceRangeFrom: "20260820",
    sourceRangeTo: "20260821"
};
const firstCapturePayload = {
    suggest_statuses: [
        rankStatusEvent({
            accepted_at: "2026-08-01T08:00:00+09:00",
            reflector_name: "must-not-be-retained",
            unknown_private_field: { value: "must-not-be-retained" }
        }),
        rankStatusEvent({
            accepted_at: "2026-08-01T12:00:00+09:00",
            after_price_rank_name: "1",
            before_price_rank_name: "2"
        }),
        { reflector_name: "rankless-row-must-be-ignored" }
    ]
};
const parsedCapture = captureParser.parseRankLearningCapture(
    firstCapturePayload,
    captureContext
);
assert.equal(parsedCapture.status, "ready");
assert.equal(parsedCapture.events.length, 2, "same room and reflected day must retain distinct changes");
assert.equal(parsedCapture.coverage.validEventCount, 2);
assert.equal(parsedCapture.coverage.invalidEventCount, 0);
assert.notEqual(parsedCapture.events[0].recordKey, parsedCapture.events[1].recordKey);
assert.deepEqual(Object.keys(parsedCapture.events[0]).sort(), [
    "afterRankName",
    "beforeRankName",
    "capturedAt",
    "daysBeforeStay",
    "facilityId",
    "recordKey",
    "reflectedAt",
    "reflectedDate",
    "roomGroupId",
    "schemaVersion",
    "sourceRangeFrom",
    "sourceRangeTo",
    "stayDate"
].sort());
assert.deepEqual(Object.keys(parsedCapture.coverage).sort(), [
    "asOfDate",
    "capturedAt",
    "facilityId",
    "invalidEventCount",
    "rangeFrom",
    "rangeTo",
    "recordKey",
    "schemaVersion",
    "validEventCount"
].sort());
assert.equal(JSON.stringify(parsedCapture).includes("must-not-be-retained"), false);
assert.equal(captureParser.isRankLearningEventRecord(parsedCapture.events[0]), true);
assert.equal(captureParser.isRankLearningCoverageRecord(parsedCapture.coverage), true);

const sameCaptureLater = captureParser.parseRankLearningCapture(
    firstCapturePayload,
    { ...captureContext, capturedAt: "2026-08-12T04:00:00.000Z" }
);
assert.equal(sameCaptureLater.status, "ready");
assert.deepEqual(
    sameCaptureLater.events.map((record) => record.recordKey),
    parsedCapture.events.map((record) => record.recordKey),
    "event keys must not depend on capture time"
);
assert.equal(
    sameCaptureLater.coverage.recordKey,
    parsedCapture.coverage.recordKey,
    "the same normalized event set and range must reuse its coverage key"
);
const reorderedCapture = captureParser.parseRankLearningCapture({
    suggest_statuses: [...firstCapturePayload.suggest_statuses].reverse()
}, captureContext);
assert.equal(reorderedCapture.status, "ready");
assert.equal(
    reorderedCapture.coverage.recordKey,
    parsedCapture.coverage.recordKey,
    "coverage fingerprint must be independent of response ordering"
);
const changedCapture = captureParser.parseRankLearningCapture({
    suggest_statuses: [
        ...firstCapturePayload.suggest_statuses,
        rankStatusEvent({
            accepted_at: "2026-08-02T08:00:00+09:00",
            after_price_rank_name: "2",
            before_price_rank_name: "3",
            date: "20260821",
            rm_room_group_id: "room-b"
        })
    ]
}, captureContext);
assert.equal(changedCapture.status, "ready");
assert.notEqual(
    changedCapture.coverage.recordKey,
    parsedCapture.coverage.recordKey,
    "a changed event set in the same range must create a new coverage observation"
);

const emptyCapture = captureParser.parseRankLearningCapture(
    { suggest_statuses: [] },
    captureContext
);
assert.equal(emptyCapture.status, "ready");
assert.equal(emptyCapture.events.length, 0);
assert.equal(emptyCapture.coverage.validEventCount, 0);
assert.equal(emptyCapture.coverage.invalidEventCount, 0);
const ignoredOnlyCapture = captureParser.parseRankLearningCapture({
    suggest_statuses: Array.from({ length: 600 }, () => ({}))
}, captureContext);
assert.equal(ignoredOnlyCapture.status, "ready", "ignored rows must not count toward the 512 event limit");
assert.equal(ignoredOnlyCapture.events.length, 0);

assert.deepEqual(captureParser.parseRankLearningCapture({}, captureContext), {
    reason: "invalid-root",
    status: "rejected"
});
assert.deepEqual(captureParser.parseRankLearningCapture({
    suggest_statuses: [rankStatusEvent({ rm_room_group_id: 123 })]
}, captureContext), {
    reason: "invalid-event",
    status: "rejected"
});
assert.deepEqual(captureParser.parseRankLearningCapture({
    suggest_statuses: [rankStatusEvent({ accepted_at: "not-a-timestamp" })]
}, captureContext), {
    reason: "invalid-event",
    status: "rejected"
});
assert.deepEqual(captureParser.parseRankLearningCapture({
    suggest_statuses: [rankStatusEvent({ after_price_rank_name: 3 })]
}, captureContext), {
    reason: "invalid-event",
    status: "rejected"
});
assert.deepEqual(captureParser.parseRankLearningCapture({
    suggest_statuses: [rankStatusEvent({ date: "20260822" })]
}, captureContext), {
    reason: "event-out-of-range",
    status: "rejected"
});
assert.deepEqual(captureParser.parseRankLearningCapture({
    suggest_statuses: [rankStatusEvent({ accepted_at: "2026-08-13T01:00:00+09:00" })]
}, captureContext), {
    reason: "invalid-event",
    status: "rejected"
});
assert.deepEqual(captureParser.parseRankLearningCapture({
    suggest_statuses: Array.from(
        { length: captureStore.RANK_LEARNING_EVENT_RETENTION_READ_LIMIT - 4_096 },
        (_, index) => rankStatusEvent({ rm_room_group_id: `room-${index}` })
    )
}, captureContext), {
    reason: "event-limit-exceeded",
    status: "rejected"
});

const fakeStorage = createFakeRankLearningStore();
const lockNames = [];
const writer = captureWriter.createRankLearningCaptureWriter({
    lockRunner: async (lockName, signal, run) => {
        assert.equal(signal.aborted, false);
        lockNames.push(lockName);
        return run();
    },
    store: fakeStorage.store
});
const firstWrite = await writer.capture({
    ...captureContext,
    payload: firstCapturePayload,
    signal: new AbortController().signal
});
assert.deepEqual(firstWrite, {
    addedCoverageCount: 1,
    addedEventCount: 2,
    deletedCoverageCount: 0,
    deletedEventCount: 0,
    status: "stored"
});
const duplicateWrite = await writer.capture({
    ...captureContext,
    capturedAt: "2026-08-12T04:00:00.000Z",
    payload: firstCapturePayload,
    signal: new AbortController().signal
});
assert.equal(duplicateWrite.status, "duplicate");
assert.equal(fakeStorage.writeCount, 2);
const changedWrite = await writer.capture({
    ...captureContext,
    capturedAt: "2026-08-12T05:00:00.000Z",
    payload: {
        suggest_statuses: [
            ...firstCapturePayload.suggest_statuses,
            rankStatusEvent({
                accepted_at: "2026-08-02T08:00:00+09:00",
                date: "20260821",
                rm_room_group_id: "room-b"
            })
        ]
    },
    signal: new AbortController().signal
});
assert.equal(changedWrite.status, "stored");
assert.equal(changedWrite.addedCoverageCount, 1);
assert.equal(changedWrite.addedEventCount, 1);
assert.equal(lockNames.every((name) => name === lockNames[0]), true);

const writesBeforeReject = fakeStorage.writeCount;
const rejectedWrite = await writer.capture({
    ...captureContext,
    payload: { suggest_statuses: [rankStatusEvent({ date: "20260822" })] },
    signal: new AbortController().signal
});
assert.equal(rejectedWrite.status, "rejected");
assert.equal(fakeStorage.writeCount, writesBeforeReject, "invalid input must write zero records");
const preAborted = new AbortController();
preAborted.abort();
await assert.rejects(writer.capture({
    ...captureContext,
    payload: firstCapturePayload,
    signal: preAborted.signal
}), (error) => error?.name === "AbortError");
assert.equal(fakeStorage.writeCount, writesBeforeReject, "pre-aborted capture must write zero records");

await assertFallbackLockSerializes(captureWriter);

const eventRetentionRecords = Array.from(
    { length: 4_098 },
    (_, index) => retentionRecord(index)
);
assert.equal(
    captureStore.selectRankLearningPruneKeys(eventRetentionRecords, 4_096).size,
    2
);
const coverageRetentionRecords = Array.from(
    { length: 122 },
    (_, index) => retentionRecord(index)
);
assert.equal(
    captureStore.selectRankLearningPruneKeys(coverageRetentionRecords, 120).size,
    2
);
assert.equal(captureStore.RANK_LEARNING_EVENT_RETENTION_READ_LIMIT, 4_609);
assert.equal(captureStore.RANK_LEARNING_COVERAGE_RETENTION_READ_LIMIT, 121);

await verifyBrowserRankLearningStore();

console.info("Next rank-learning coverage and capture checks passed");

function event(overrides = {}) {
    return {
        afterRankName: "3",
        beforeRankName: "2",
        facilityId,
        reflectedAt: "2026-08-01T09:00:00+09:00",
        reflectedDate: "20260801",
        roomGroupId: "default-room",
        stayDate: "20260820",
        ...overrides
    };
}

function curve(roomGroupId, stayDate, points) {
    return {
        facilityId,
        roomGroupId,
        stayDate,
        points: points.map(([observedDate, rooms]) => ({ observedDate, rooms }))
    };
}

function pickHorizonCounts(horizon) {
    return {
        censored: horizon.censoredCount,
        days: horizon.days,
        eligible: horizon.eligibleCount,
        excluded: horizon.excludedCount,
        observed: horizon.observedCount
    };
}

function singleEventReport(options) {
    return model.buildRankLearningCoverageReport({
        analysisAsOfDate: options.analysisAsOfDate,
        facilityId,
        rankOrder: confirmedOrder,
        curves: [],
        events: [options.event]
    });
}

function singleCensorReason(horizon) {
    assert.equal(horizon.censorReasons.length, 1);
    return {
        count: horizon.censorReasons[0].count,
        days: horizon.days,
        reason: horizon.censorReasons[0].reason
    };
}

function rankStatusEvent(overrides = {}) {
    return {
        accepted_at: "2026-08-01T09:00:00+09:00",
        after_price_rank_name: "3",
        before_price_rank_name: "2",
        date: "20260820",
        rm_room_group_id: "room-a",
        ...overrides
    };
}

function retentionRecord(index) {
    return {
        capturedAt: new Date(Date.UTC(2026, 0, 1) + index * 1_000).toISOString(),
        recordKey: `record-${String(index).padStart(5, "0")}`
    };
}

function createFakeRankLearningStore() {
    const coverageKeys = new Set();
    const eventKeys = new Set();
    const state = {
        writeCount: 0,
        store: {
            async addAndPrune(events, coverage, signal) {
                assert.equal(signal.aborted, false);
                state.writeCount += 1;
                let addedEventCount = 0;
                for (const record of events) {
                    if (!eventKeys.has(record.recordKey)) {
                        eventKeys.add(record.recordKey);
                        addedEventCount += 1;
                    }
                }
                const addedCoverageCount = coverageKeys.has(coverage.recordKey) ? 0 : 1;
                coverageKeys.add(coverage.recordKey);
                return {
                    addedCoverageCount,
                    addedEventCount,
                    deletedCoverageCount: 0,
                    deletedEventCount: 0
                };
            },
            async readByFacility() {
                return { coverages: [], events: [] };
            }
        }
    };
    return state;
}

async function assertFallbackLockSerializes(writerModule) {
    const lockRunner = writerModule.createFallbackRankLearningLockRunner();
    const order = [];
    let releaseFirst = () => undefined;
    const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
    });
    const first = lockRunner(
        "fixture-lock",
        new AbortController().signal,
        async () => {
            order.push("first-start");
            await firstGate;
            order.push("first-end");
        }
    );
    const second = lockRunner(
        "fixture-lock",
        new AbortController().signal,
        async () => {
            order.push("second-start");
            order.push("second-end");
        }
    );
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(order, ["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first-start", "first-end", "second-start", "second-end"]);

    let queuedRan = false;
    let releaseBlocker = () => undefined;
    const blockerGate = new Promise((resolve) => {
        releaseBlocker = resolve;
    });
    const blocker = lockRunner(
        "abort-lock",
        new AbortController().signal,
        () => blockerGate
    );
    const queuedController = new AbortController();
    const queued = lockRunner("abort-lock", queuedController.signal, async () => {
        queuedRan = true;
    });
    queuedController.abort();
    await assert.rejects(queued, (error) => error?.name === "AbortError");
    assert.equal(queuedRan, false);
    releaseBlocker();
    await blocker;
}

async function verifyBrowserRankLearningStore() {
    const bundle = await buildBundle({
        bundle: true,
        entryPoints: [fileURLToPath(new URL(
            "../src/next/rankLearning/index.ts",
            import.meta.url
        ))],
        format: "iife",
        globalName: "RankLearningFixture",
        platform: "browser",
        target: "chrome120",
        write: false
    });
    const bundleSource = bundle.outputFiles?.[0]?.text;
    assert.equal(typeof bundleSource, "string");
    const server = http.createServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>rank learning IndexedDB fixture</title>");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.notEqual(address, null);
    const browser = await launchBrowser();
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${address.port}/`);
        await page.addScriptTag({ content: bundleSource });
        const evidence = await page.evaluate(async () => {
            const api = globalThis.RankLearningFixture;
            await new Promise((resolve, reject) => {
                const request = globalThis.indexedDB.deleteDatabase(api.RANK_LEARNING_DATABASE_NAME);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error("rank learning fixture delete blocked"));
            });
            const writer = api.createRankLearningCaptureWriter({ windowHost: globalThis.window });
            const input = {
                asOfDate: "20260812",
                capturedAt: "2026-08-12T03:00:00.000Z",
                facilityId: "facility:browser-fixture",
                payload: {
                    suggest_statuses: [{
                        accepted_at: "2026-08-01T09:00:00+09:00",
                        after_price_rank_name: "3",
                        before_price_rank_name: "2",
                        date: "20260820",
                        reflector_name: "must-not-be-stored",
                        rm_room_group_id: "room-a",
                        unknown_private_field: "must-not-be-stored"
                    }]
                },
                signal: new AbortController().signal,
                sourceRangeFrom: "20260820",
                sourceRangeTo: "20260821"
            };
            const first = await writer.capture(input);
            const duplicate = await writer.capture({
                ...input,
                capturedAt: "2026-08-12T04:00:00.000Z"
            });
            const store = api.createBrowserRankLearningStore(globalThis.window);
            const records = await store.readByFacility(input.facilityId);
            const abortController = new AbortController();
            const abortedCapture = api.parseRankLearningCapture({
                suggest_statuses: [{
                    accepted_at: "2026-08-02T09:00:00+09:00",
                    after_price_rank_name: "2",
                    before_price_rank_name: "3",
                    date: "20260821",
                    rm_room_group_id: "room-b"
                }]
            }, {
                asOfDate: input.asOfDate,
                capturedAt: "2026-08-12T05:00:00.000Z",
                facilityId: input.facilityId,
                sourceRangeFrom: input.sourceRangeFrom,
                sourceRangeTo: input.sourceRangeTo
            });
            if (abortedCapture.status !== "ready") {
                throw new Error("active abort fixture capture did not parse");
            }
            const originalTransaction = globalThis.IDBDatabase.prototype.transaction;
            globalThis.IDBDatabase.prototype.transaction = function (...args) {
                const transaction = originalTransaction.apply(this, args);
                globalThis.IDBDatabase.prototype.transaction = originalTransaction;
                queueMicrotask(() => abortController.abort());
                return transaction;
            };
            let activeAbortName = null;
            try {
                await store.addAndPrune(
                    abortedCapture.events,
                    abortedCapture.coverage,
                    abortController.signal
                );
            } catch (error) {
                activeAbortName = error?.name ?? "unknown";
            } finally {
                globalThis.IDBDatabase.prototype.transaction = originalTransaction;
            }
            const recordsAfterAbort = await store.readByFacility(input.facilityId);
            const database = await new Promise((resolve, reject) => {
                const request = globalThis.indexedDB.open(
                    api.RANK_LEARNING_DATABASE_NAME,
                    api.RANK_LEARNING_DATABASE_VERSION
                );
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const schemaTransaction = database.transaction([
                api.RANK_LEARNING_EVENT_STORE_NAME,
                api.RANK_LEARNING_COVERAGE_STORE_NAME
            ], "readonly");
            const eventStore = schemaTransaction.objectStore(api.RANK_LEARNING_EVENT_STORE_NAME);
            const coverageStore = schemaTransaction.objectStore(api.RANK_LEARNING_COVERAGE_STORE_NAME);
            const schema = {
                coverageIndexes: Array.from(coverageStore.indexNames),
                coverageKeyPath: coverageStore.keyPath,
                eventIndexes: Array.from(eventStore.indexNames),
                eventKeyPath: eventStore.keyPath,
                storeNames: Array.from(database.objectStoreNames),
                version: database.version
            };
            const retentionEventFacilityId = "facility:event-retention-fixture";
            const seededEvents = Array.from({ length: 4_096 }, (_, index) => {
                const roomGroupId = `old-room-${String(index).padStart(4, "0")}`;
                const reflectedAt = "2026-08-01T00:00:00.000Z";
                const event = {
                    afterRankName: "1",
                    beforeRankName: "2",
                    capturedAt: "2026-08-01T00:00:00.000Z",
                    daysBeforeStay: 152,
                    facilityId: retentionEventFacilityId,
                    reflectedAt,
                    reflectedDate: "20260801",
                    roomGroupId,
                    schemaVersion: api.RANK_LEARNING_SCHEMA_VERSION,
                    sourceRangeFrom: "20261231",
                    sourceRangeTo: "20261231",
                    stayDate: "20261231"
                };
                return {
                    ...event,
                    recordKey: api.buildRankLearningEventRecordKey(event)
                };
            });
            const retentionCoverageFacilityId = "facility:coverage-retention-fixture";
            const seededCoverages = Array.from({ length: 120 }, (_, index) => {
                const asOfDate = new Date(Date.UTC(2026, 0, 1 + index))
                    .toISOString()
                    .slice(0, 10)
                    .replaceAll("-", "");
                const parsed = api.parseRankLearningCapture({ suggest_statuses: [] }, {
                    asOfDate,
                    capturedAt: new Date(Date.UTC(2026, 0, 1) + index * 1_000).toISOString(),
                    facilityId: retentionCoverageFacilityId,
                    sourceRangeFrom: "20261231",
                    sourceRangeTo: "20261231"
                });
                if (parsed.status !== "ready") {
                    throw new Error("coverage retention seed did not parse");
                }
                return parsed.coverage;
            });
            await new Promise((resolve, reject) => {
                const seedTransaction = database.transaction([
                    api.RANK_LEARNING_EVENT_STORE_NAME,
                    api.RANK_LEARNING_COVERAGE_STORE_NAME
                ], "readwrite");
                const seedEventStore = seedTransaction.objectStore(
                    api.RANK_LEARNING_EVENT_STORE_NAME
                );
                const seedCoverageStore = seedTransaction.objectStore(
                    api.RANK_LEARNING_COVERAGE_STORE_NAME
                );
                for (const event of seededEvents) {
                    seedEventStore.add(event);
                }
                for (const coverage of seededCoverages) {
                    seedCoverageStore.add(coverage);
                }
                seedTransaction.oncomplete = () => resolve();
                seedTransaction.onerror = () => reject(seedTransaction.error);
                seedTransaction.onabort = () => reject(seedTransaction.error);
            });
            database.close();

            const maximumBatch = api.parseRankLearningCapture({
                suggest_statuses: Array.from({ length: 512 }, (_, index) => ({
                    accepted_at: "2026-08-02T09:00:00+09:00",
                    after_price_rank_name: "1",
                    before_price_rank_name: "2",
                    date: "20261231",
                    rm_room_group_id: `new-room-${String(index).padStart(4, "0")}`
                }))
            }, {
                asOfDate: "20260812",
                capturedAt: "2026-08-12T06:00:00.000Z",
                facilityId: retentionEventFacilityId,
                sourceRangeFrom: "20261231",
                sourceRangeTo: "20261231"
            });
            if (maximumBatch.status !== "ready") {
                throw new Error("maximum event retention batch did not parse");
            }
            const eventRetentionWrite = await store.addAndPrune(
                maximumBatch.events,
                maximumBatch.coverage,
                new AbortController().signal
            );
            const retainedEvents = await store.readByFacility(retentionEventFacilityId);
            const retainedEventKeys = new Set(
                retainedEvents.events.map((event) => event.recordKey)
            );

            const nextCoverage = api.parseRankLearningCapture({ suggest_statuses: [] }, {
                asOfDate: "20260501",
                capturedAt: "2026-08-12T07:00:00.000Z",
                facilityId: retentionCoverageFacilityId,
                sourceRangeFrom: "20261231",
                sourceRangeTo: "20261231"
            });
            if (nextCoverage.status !== "ready") {
                throw new Error("next coverage retention record did not parse");
            }
            const coverageRetentionWrite = await store.addAndPrune(
                nextCoverage.events,
                nextCoverage.coverage,
                new AbortController().signal
            );
            const retainedCoverages = await store.readByFacility(
                retentionCoverageFacilityId
            );
            const retainedCoverageKeys = new Set(
                retainedCoverages.coverages.map((coverage) => coverage.recordKey)
            );
            return {
                activeAbortName,
                afterAbortRecordCounts: [
                    recordsAfterAbort.events.length,
                    recordsAfterAbort.coverages.length
                ],
                coverageFields: Object.keys(records.coverages[0] ?? {}).sort(),
                duplicate,
                coverageRetention: {
                    count: retainedCoverages.coverages.length,
                    newestPresent: retainedCoverageKeys.has(nextCoverage.coverage.recordKey),
                    oldestPresent: retainedCoverageKeys.has(seededCoverages[0].recordKey),
                    write: coverageRetentionWrite
                },
                eventFields: Object.keys(records.events[0] ?? {}).sort(),
                eventRetention: {
                    count: retainedEvents.events.length,
                    newestBatchKept: maximumBatch.events.every((event) => (
                        retainedEventKeys.has(event.recordKey)
                    )),
                    newestOldPresent: retainedEventKeys.has(
                        seededEvents[seededEvents.length - 1].recordKey
                    ),
                    oldestOldPresent: retainedEventKeys.has(seededEvents[0].recordKey),
                    write: eventRetentionWrite
                },
                first,
                recordCounts: [records.events.length, records.coverages.length],
                schema,
                serialized: JSON.stringify(records)
            };
        });
        assert.equal(evidence.first.status, "stored");
        assert.deepEqual(
            [evidence.first.addedEventCount, evidence.first.addedCoverageCount],
            [1, 1]
        );
        assert.equal(evidence.duplicate.status, "duplicate");
        assert.deepEqual(evidence.recordCounts, [1, 1]);
        assert.equal(evidence.activeAbortName, "AbortError");
        assert.deepEqual(
            evidence.afterAbortRecordCounts,
            evidence.recordCounts,
            "aborting an active transaction must preserve atomic write zero"
        );
        assert.deepEqual(evidence.eventRetention, {
            count: 4_096,
            newestBatchKept: true,
            newestOldPresent: true,
            oldestOldPresent: false,
            write: {
                addedCoverageCount: 1,
                addedEventCount: 512,
                deletedCoverageCount: 0,
                deletedEventCount: 512
            }
        });
        assert.deepEqual(evidence.coverageRetention, {
            count: 120,
            newestPresent: true,
            oldestPresent: false,
            write: {
                addedCoverageCount: 1,
                addedEventCount: 0,
                deletedCoverageCount: 1,
                deletedEventCount: 0
            }
        });
        assert.deepEqual(evidence.schema, {
            coverageIndexes: ["facility"],
            coverageKeyPath: "recordKey",
            eventIndexes: ["facility"],
            eventKeyPath: "recordKey",
            storeNames: ["rank-events", "rank-status-coverages"],
            version: 1
        });
        assert.equal(evidence.serialized.includes("must-not-be-stored"), false);
        assert.deepEqual(evidence.eventFields, [
            "afterRankName",
            "beforeRankName",
            "capturedAt",
            "daysBeforeStay",
            "facilityId",
            "recordKey",
            "reflectedAt",
            "reflectedDate",
            "roomGroupId",
            "schemaVersion",
            "sourceRangeFrom",
            "sourceRangeTo",
            "stayDate"
        ].sort());
        assert.deepEqual(evidence.coverageFields, [
            "asOfDate",
            "capturedAt",
            "facilityId",
            "invalidEventCount",
            "rangeFrom",
            "rangeTo",
            "recordKey",
            "schemaVersion",
            "validEventCount"
        ].sort());
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
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
    assert.notEqual(executablePaths.length, 0, "no Chromium or Chrome executable found for rank learning fixture");
    return chromium.launch({
        args: ["--no-sandbox"],
        executablePath: executablePaths[0],
        headless: true
    });
}
