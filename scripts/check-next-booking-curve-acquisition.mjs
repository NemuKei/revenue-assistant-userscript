import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const coordinatorSource = await readFile(
    new URL("../src/next/bookingCurve/bookingCurveAcquisitionCoordinator.ts", import.meta.url),
    "utf8"
);
const model = await importBundledTypeScript(
    "../src/next/bookingCurve/bookingCurveAcquisitionModel.ts",
    import.meta.url
);
const storeModule = await importBundledTypeScript(
    "../src/next/bookingCurve/bookingCurveSourceStore.ts",
    import.meta.url
);
const coordinatorModule = await importBundledTypeScript(
    "../src/next/bookingCurve/bookingCurveAcquisitionCoordinator.ts",
    import.meta.url
);
const runtimeModule = await importBundledTypeScript(
    "../src/next/bookingCurve/bookingCurveAcquisitionRuntime.ts",
    import.meta.url
);
const transportModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensTransport.ts",
    import.meta.url
);

assert.equal(model.NEXT_BOOKING_CURVE_BOOTSTRAP_REQUEST_LIMIT, 800);
assert.equal(model.NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT, 200);
assert.equal(model.NEXT_BOOKING_CURVE_REQUEST_INTERVAL_MS, 250);
assert.equal(model.NEXT_BOOKING_CURVE_CONCURRENCY, 2);
assert.match(
    coordinatorSource,
    /const NEXT_BOOKING_CURVE_BOOTSTRAP_COVERAGE_THRESHOLD = 0\.8;/u
);
assert.equal(storeModule.NEXT_BOOKING_CURVE_SOURCE_RETENTION_LIMIT, 4_096);
assert.equal(
    runtimeModule.formatNextBookingCurveAcquisitionState({
        errorCount: 0,
        mode: "bootstrap",
        processedCount: 768,
        requestCount: 768,
        skippedCount: 0,
        status: "complete",
        stopReason: null,
        storedCount: 768,
        totalCount: 768
    }),
    "今回分完了 768/768（保存 768・重複回避 0・エラー 0・残りは次回確認）",
    "bounded bootstrap completion must not imply that every source is ready"
);
assert.equal(
    runtimeModule.formatNextBookingCurveAcquisitionState({
        errorCount: 0,
        mode: "daily-delta",
        processedCount: 0,
        requestCount: 0,
        skippedCount: 0,
        status: "complete",
        stopReason: null,
        storedCount: 0,
        totalCount: 0
    }),
    "完了 0/0（保存 0・重複回避 0・エラー 0）"
);

const roomScopes = [
    { key: "hotel", kind: "hotel", roomGroupId: null },
    { key: "room:a", kind: "roomGroup", roomGroupId: "a" },
    { key: "room:b", kind: "roomGroup", roomGroupId: "b" }
];
const context = {
    asOfDate: "20260723",
    facilityId: "yad:fixture",
    roomScopes,
    visibleStayDates: ["20260723", "20260724", "20260725"]
};
const backgroundTasks = model.buildNextBookingCurveBackgroundTasks(context);
assert.equal(
    backgroundTasks.filter((task) => task.role === "current").length,
    9,
    "bootstrap must include visible stay dates across hotel and all confirmed room scopes"
);
assert.equal(
    backgroundTasks.some((task) => task.role === "recent-reference"),
    true,
    "bootstrap must include bounded hotel recent-reference sources"
);
assert.equal(new Set(backgroundTasks.map((task) => task.sourceKey)).size, backgroundTasks.length);

const recentCandidates = model.getNextRecentReferenceCandidateStayDates("20260812", "20260723");
assert.equal(recentCandidates.length >= 63 && recentCandidates.length <= 65, true);
assert.equal(recentCandidates.every((stayDate) => stayDate >= "20260424" && stayDate <= "20270718"), true);
assert.equal(
    recentCandidates.some((stayDate) => stayDate > "20261021"),
    true,
    "long lead-time reference ticks require bounded sources beyond as-of +90 days"
);
assert.equal(
    recentCandidates.every((stayDate) => new Date(
        Date.UTC(
            Number(stayDate.slice(0, 4)),
            Number(stayDate.slice(4, 6)) - 1,
            Number(stayDate.slice(6, 8))
        )
    ).getUTCDay() === 3),
    true,
    "recent reference keeps the target weekday without a separate +/-7 or +/-14 queue"
);

const compactResponse = model.compactNextBookingCurveResponse({
    stay_date: "2026-07-23",
    max_room_count: 30,
    secret_field: "must-not-survive",
    booking_curve: [{
        date: "2026-07-22",
        all: { this_year_room_sum: 12, this_year_sales_sum: 999_999 },
        transient: { this_year_room_sum: 10, this_year_adr: 99_999 },
        group: { this_year_room_sum: 2, customer_name: "must-not-survive" }
    }]
}, "20260723");
assert.notEqual(compactResponse, null);
assert.deepEqual(compactResponse, {
    stay_date: "20260723",
    max_room_count: 30,
    booking_curve: [{
        date: "2026-07-22",
        all: { this_year_room_sum: 12 },
        transient: { this_year_room_sum: 10 },
        group: { this_year_room_sum: 2 }
    }]
});
assert.equal(
    model.compactNextBookingCurveResponse(
        { stay_date: "20260724", booking_curve: [] },
        "20260723"
    ),
    null
);
assert.equal(
    model.compactNextBookingCurveResponse({
        stay_date: "20260723",
        booking_curve: Array.from({ length: 513 }, () => ({ date: "2026-07-22" }))
    }, "20260723"),
    null
);

const currentTask = model.buildNextBookingCurveCurrentTasks({
    context,
    scopeKeys: ["room:a"],
    stayDate: "20260723"
})[0];
assert.notEqual(currentTask, undefined);
const freshRecord = model.createNextBookingCurveSourceRecord({
    asOfDate: "20260723",
    facilityId: context.facilityId,
    fetchedAt: "2026-07-23T01:00:00.000Z",
    response: compactResponse,
    task: currentTask
});
assert.equal(storeModule.isNextBookingCurveSourceRecord(freshRecord), true);
assert.equal(freshRecord.firstObservedAsOfDate, "20260723");
assert.equal(freshRecord.landing, null);
assert.equal(model.isNextBookingCurveRecordUsable(freshRecord, "20260723"), true);
assert.equal(model.isNextBookingCurveRecordUsable(freshRecord, "20260724"), false);
assert.equal(
    model.selectNextBookingCurveDueTasks({
        asOfDate: "20260723",
        existingRecords: [freshRecord],
        limit: 10,
        tasks: [currentTask]
    }).length,
    0
);
const overdueRecord = {
    ...freshRecord,
    asOfDate: "20260701",
    firstObservedAsOfDate: "20260701",
    recordKey: storeModule.buildNextBookingCurveRecordKey(freshRecord.sourceKey, "20260701"),
    cacheKey: freshRecord.cacheKey.replace("asOf:20260723", "asOf:20260701")
};
assert.equal(
    model.selectNextBookingCurveDueTasks({
        asOfDate: "20260723",
        existingRecords: [overdueRecord],
        limit: 10,
        tasks: [currentTask]
    }).length,
    1
);
const completedTask = {
    ...currentTask,
    query: "date=20260722&rm_room_group_id=a",
    sourceKey: storeModule.buildNextBookingCurveSourceKey({
        facilityId: context.facilityId,
        roomGroupId: "a",
        scope: "roomGroup",
        stayDate: "20260722"
    }),
    stayDate: "20260722"
};
const completedRecord = model.createNextBookingCurveSourceRecord({
    asOfDate: "20260723",
    facilityId: context.facilityId,
    fetchedAt: "2026-07-23T01:00:00.000Z",
    response: {
        stay_date: "20260722",
        booking_curve: [{
            date: "2026-07-22",
            all: { this_year_room_sum: 9 },
            transient: { this_year_room_sum: 7 },
            group: { this_year_room_sum: 2 }
        }]
    },
    task: completedTask
});
assert.deepEqual(completedRecord.response.booking_curve, []);
assert.deepEqual(completedRecord.landing, {
    all: 9,
    group: 2,
    observedAsOfDate: "20260723",
    transient: 7
});
assert.equal(model.isNextBookingCurveRecordUsable(completedRecord, "20260820"), true);
assert.equal(
    model.selectNextBookingCurveDueTasks({
        asOfDate: "20260820",
        existingRecords: [completedRecord],
        limit: 10,
        tasks: [completedTask]
    }).length,
    0,
    "a completed source with a separate landing is never age-refreshed"
);

const futureTask = {
    ...currentTask,
    query: "date=20260725&rm_room_group_id=a",
    sourceKey: storeModule.buildNextBookingCurveSourceKey({
        facilityId: context.facilityId,
        roomGroupId: "a",
        scope: "roomGroup",
        stayDate: "20260725"
    }),
    stayDate: "20260725"
};
const firstFutureRecord = model.createNextBookingCurveSourceRecord({
    asOfDate: "20260723",
    facilityId: context.facilityId,
    fetchedAt: "2026-07-23T01:00:00.000Z",
    response: {
        stay_date: "20260725",
        booking_curve: [
            {
                date: "2026-07-22",
                all: { this_year_room_sum: 4 },
                transient: { this_year_room_sum: 3 },
                group: { this_year_room_sum: 1 }
            },
            {
                date: "2026-07-23",
                all: { this_year_room_sum: 5 },
                transient: { this_year_room_sum: 4 },
                group: { this_year_room_sum: 1 }
            }
        ]
    },
    task: futureTask
});
const appendedFutureRecord = model.createNextBookingCurveSourceRecord({
    asOfDate: "20260724",
    facilityId: context.facilityId,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    previousRecord: firstFutureRecord,
    response: {
        stay_date: "20260725",
        booking_curve: [
            {
                date: "2026-07-22",
                all: { this_year_room_sum: 99 },
                transient: { this_year_room_sum: 99 },
                group: { this_year_room_sum: 99 }
            },
            {
                date: "2026-07-23",
                all: { this_year_room_sum: 98 },
                transient: { this_year_room_sum: 98 },
                group: { this_year_room_sum: 98 }
            },
            {
                date: "2026-07-24",
                all: { this_year_room_sum: 7 },
                transient: { this_year_room_sum: 5 },
                group: { this_year_room_sum: 2 }
            }
        ]
    },
    task: futureTask
});
assert.deepEqual(
    appendedFutureRecord.response.booking_curve?.map((point) => [
        point.date,
        point.all?.this_year_room_sum
    ]),
    [
        ["2026-07-22", 4],
        ["2026-07-23", 5],
        ["2026-07-24", 7]
    ],
    "past observations stay immutable and only the missing tail is appended"
);
assert.equal(appendedFutureRecord.firstObservedAsOfDate, "20260723");

const laggingFutureRecord = {
    ...firstFutureRecord,
    response: {
        ...firstFutureRecord.response,
        booking_curve: firstFutureRecord.response.booking_curve?.slice(0, 1)
    }
};
const appendedLaggingTailRecord = model.createNextBookingCurveSourceRecord({
    asOfDate: "20260724",
    facilityId: context.facilityId,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    previousRecord: laggingFutureRecord,
    response: {
        stay_date: "20260725",
        booking_curve: [
            {
                date: "2026-07-22",
                all: { this_year_room_sum: 99 },
                transient: { this_year_room_sum: 99 },
                group: { this_year_room_sum: 99 }
            },
            {
                date: "2026-07-23",
                all: { this_year_room_sum: 5 },
                transient: { this_year_room_sum: 4 },
                group: { this_year_room_sum: 1 }
            },
            {
                date: "2026-07-24",
                all: { this_year_room_sum: 7 },
                transient: { this_year_room_sum: 5 },
                group: { this_year_room_sum: 2 }
            }
        ]
    },
    task: futureTask
});
assert.deepEqual(
    appendedLaggingTailRecord.response.booking_curve?.map((point) => [
        point.date,
        point.all?.this_year_room_sum
    ]),
    [
        ["2026-07-22", 4],
        ["2026-07-23", 5],
        ["2026-07-24", 7]
    ],
    "a late-arriving tail is appended after the last stored observation date, not the prior source as-of"
);

const longLeadReferenceTask = model.buildNextBookingCurveReferenceTasks({
    context,
    scopeKey: "room:a",
    targetStayDate: "20260812"
}).at(-1);
assert.notEqual(longLeadReferenceTask, undefined);
const longLeadReferenceRecord = model.createNextBookingCurveSourceRecord({
    asOfDate: "20260723",
    facilityId: context.facilityId,
    fetchedAt: "2026-07-23T01:00:00.000Z",
    response: {
        stay_date: longLeadReferenceTask.stayDate,
        booking_curve: []
    },
    task: longLeadReferenceTask
});
assert.equal(
    model.selectNextBookingCurveDueTasks({
        asOfDate: "20260724",
        existingRecords: [longLeadReferenceRecord],
        limit: 10,
        tasks: [longLeadReferenceTask]
    }).length,
    0,
    "a reference source is not refreshed daily before another configured lead-time tick is observable"
);
assert.equal(
    model.selectNextBookingCurveDueTasks({
        asOfDate: "20260820",
        existingRecords: [longLeadReferenceRecord],
        limit: 10,
        tasks: [longLeadReferenceTask]
    }).length,
    1,
    "a reference source becomes due when the next configured lead-time tick is observable"
);

const olderSameSource = {
    ...freshRecord,
    asOfDate: "20260722",
    fetchedAt: "2026-07-22T01:00:00.000Z",
    recordKey: storeModule.buildNextBookingCurveRecordKey(freshRecord.sourceKey, "20260722")
};
assert.deepEqual(
    storeModule.selectNextBookingCurveSourcePruneKeys([olderSameSource, freshRecord]),
    new Set([olderSameSource.recordKey])
);

const inMemoryRecords = [];
const fakeStore = {
    async addAndPrune(records) {
        let addedCount = 0;
        for (const record of records) {
            if (!inMemoryRecords.some((item) => item.recordKey === record.recordKey)) {
                inMemoryRecords.push(record);
                addedCount += 1;
            }
        }
        return { addedCount, deletedCount: 0 };
    },
    async readLatestBySourceKeys(sourceKeys) {
        return sourceKeys.flatMap((sourceKey) => {
            const record = inMemoryRecords
                .filter((item) => item.sourceKey === sourceKey)
                .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0];
            return record === undefined ? [] : [record];
        });
    }
};
const requests = [];
const fakeWindow = {
    clearTimeout,
    navigator: { locks: undefined },
    setTimeout
};
const coordinator = coordinatorModule.createNextBookingCurveAcquisitionCoordinator({
    now: () => new Date("2026-07-23T03:00:00.000Z"),
    store: fakeStore,
    transport: {
        async read(request) {
            requests.push(request);
            return {
                stay_date: request.stayDate,
                booking_curve: [{
                    date: "2026-07-23",
                    all: { this_year_room_sum: 5 },
                    transient: { this_year_room_sum: 4 },
                    group: { this_year_room_sum: 1 }
                }]
            };
        }
    },
    windowHost: fakeWindow
});
const oneScopeContext = { ...context, roomScopes: [roomScopes[0]], visibleStayDates: ["20260723"] };
const signal = new AbortController().signal;
await coordinator.ensureCurrent({
    context: oneScopeContext,
    signal,
    stayDate: "20260723"
});
await coordinator.ensureCurrent({
    context: oneScopeContext,
    signal,
    stayDate: "20260723"
});
assert.deepEqual(requests, [{
    kind: "booking-curve",
    roomGroupId: null,
    stayDate: "20260723"
}]);
assert.equal(inMemoryRecords.length, 1, "exact current record must be reused without another GET");
const nextDayContext = { ...oneScopeContext, asOfDate: "20260724" };
await coordinator.ensureCurrent({
    context: nextDayContext,
    signal,
    stayDate: "20260723"
});
await coordinator.ensureCurrent({
    context: nextDayContext,
    signal,
    stayDate: "20260723"
});
assert.equal(requests.length, 2, "the next observation day adds one bounded tail request");
assert.equal(
    inMemoryRecords
        .filter((record) => record.sourceKey === inMemoryRecords[0]?.sourceKey)
        .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0]
        ?.landing?.observedAsOfDate,
    "20260724",
    "the first post-stay observation is stored as landing, not as a replacement for zero-day"
);
coordinator.stop();

let releasePriorityRequest;
const priorityRequestGate = new Promise((resolve) => {
    releasePriorityRequest = resolve;
});
const priorityRequests = [];
const priorityCoordinator = coordinatorModule.createNextBookingCurveAcquisitionCoordinator({
    store: {
        async addAndPrune() {
            return { addedCount: 1, deletedCount: 0 };
        },
        async readLatestBySourceKeys() {
            return [];
        }
    },
    transport: {
        async read(request) {
            priorityRequests.push(request);
            if (priorityRequests.length === 1) {
                await priorityRequestGate;
            }
            return {
                stay_date: request.stayDate,
                booking_curve: []
            };
        }
    },
    windowHost: fakeWindow
});
const priorityContext = {
    ...context,
    roomScopes: roomScopes.slice(0, 2),
    visibleStayDates: ["20260723"]
};
await priorityCoordinator.startBackground(priorityContext);
await priorityCoordinator.startReference({
    context: priorityContext,
    scopeKey: "room:a",
    targetStayDate: "20260812"
});
await new Promise((resolve) => setTimeout(resolve, 320));
assert.equal(priorityRequests.length >= 2, true);
assert.equal(
    priorityRequests[1].roomGroupId,
    "a",
    "the selected room reference must run ahead of the remaining background backlog"
);
priorityCoordinator.stop();
releasePriorityRequest();

const rateLimitedStates = [];
const rateLimitedCoordinator = coordinatorModule.createNextBookingCurveAcquisitionCoordinator({
    store: {
        async addAndPrune() {
            throw new Error("must not store after 429");
        },
        async readLatestBySourceKeys() {
            return [];
        }
    },
    transport: {
        async read() {
            throw new transportModule.NextReadHttpError("booking-curve", 429);
        }
    },
    windowHost: fakeWindow
});
rateLimitedCoordinator.subscribe((state) => {
    rateLimitedStates.push({ ...state });
});
await rateLimitedCoordinator.ensureCurrent({
    context: oneScopeContext,
    signal,
    stayDate: "20260723"
});
assert.equal(rateLimitedStates.at(-1).status, "stopped");
assert.equal(rateLimitedStates.at(-1).stopReason, "http-429");
assert.equal(rateLimitedStates.at(-1).requestCount, 1, "429 must stop without an automatic retry");
rateLimitedCoordinator.stop();

console.log("Next booking curve acquisition checks passed");
