import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const summaryModule = await importBundledTypeScript(
    "../src/next/live/liveCalendarSummaryDataSource.ts",
    import.meta.url
);
const transportModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensTransport.ts",
    import.meta.url
);
const viewModelModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensViewModel.ts",
    import.meta.url
);
const contractModule = await importBundledTypeScript(
    "../src/bookingCurveRawSourceContract.ts",
    import.meta.url
);
const entrySource = await readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8");
const acquisitionRuntimeSource = await readFile(
    new URL("../src/next/bookingCurve/bookingCurveAcquisitionRuntime.ts", import.meta.url),
    "utf8"
);
assert.equal(
    entrySource.match(/calendarSummary: liveCalendarSummary/gu)?.length,
    2,
    "the lens and acquisition runtimes must share one in-memory calendar summary"
);
assert.match(
    acquisitionRuntimeSource,
    /surface\.kind === "calendar"[\s\S]*?calendarSummary\?\.setContext\(context\)[\s\S]*?startBackground\(context\)/u,
    "the verified visible calendar context must be published before background planning"
);

const latestChanges = summaryModule.parseLiveCalendarLatestChanges({
    suggest_statuses: [
        {
            date: "2026-08-12",
            accepted_at: "2026-08-06T23:00:00+09:00",
            completed_at: "2026-08-07T10:00:00+09:00"
        },
        {
            date: "2026-08-12",
            completed_at: "2026-08-05T10:00:00+09:00"
        },
        {
            date: "2026-08-13",
            accepted_at: "invalid"
        },
        {
            date: "2026-08-14",
            accepted_at: "2026-08-09T10:00:00+09:00"
        },
        {
            date: "2026-09-01",
            accepted_at: "2026-08-08T10:00:00+09:00"
        }
    ]
}, ["20260812", "20260813", "20260814"], new Date("2026-08-08T12:00:00+09:00"));
assert.deepEqual(latestChanges, [
    { daysAgo: 2, stayDate: "20260812" },
    { daysAgo: 0, stayDate: "20260814" }
]);
assert.equal(
    summaryModule.parseLiveCalendarLatestChanges({}, ["20260812"], new Date()),
    null,
    "an unknown response shape must not be treated as no adjustment"
);

const rangeUrl = transportModule.buildNextReadUrl({
    from: "20260801",
    kind: "rank-status",
    to: "20261031"
}, "https://ra.jalan.net");
assert.equal(rangeUrl.pathname, "/api/v3/lincoln/suggest/status");
assert.equal(rangeUrl.searchParams.get("filter_type"), "stay_date");
assert.equal(rangeUrl.searchParams.get("from"), "20260801");
assert.equal(rangeUrl.searchParams.get("to"), "20261031");

const stateListeners = new Set();
const suspendedReasons = [];
let storedCount = 0;
let readLatestCount = 0;
const acquisition = createAcquisitionStub({
    readLatest() {
        readLatestCount += 1;
        return Promise.resolve([createHotelRecord("20260812", 3)]);
    },
    stateListeners,
    suspendedReasons
});
const requests = [];
const source = summaryModule.createLiveCalendarSummaryDataSource({
    acquisition,
    now: () => new Date("2026-08-08T12:00:00+09:00"),
    refreshDelayMs: 0,
    transport: {
        async read(request) {
            requests.push(request);
            return {
                suggest_statuses: [{
                    date: "2026-08-12",
                    accepted_at: "2026-08-07T10:00:00+09:00"
                }]
            };
        }
    },
    windowHost: createTimerWindow()
});
source.setContext({
    asOfDate: "20260808",
    facilityId: "yad:fixture",
    visibleStayDates: ["20260813", "20260812"]
});
await waitFor(() => source.getSnapshot().rankStatus === "ready");
const firstSnapshot = source.getSnapshot();
assert.deepEqual(requests, [{
    from: "20260812",
    kind: "rank-status",
    to: "20260813"
}], "the visible range must use one rank-status GET");
assert.equal(firstSnapshot.contextKey, "yad:fixture|20260808|20260812,20260813");
assert.deepEqual(firstSnapshot.latestChanges, [{ daysAgo: 1, stayDate: "20260812" }]);
assert.equal(
    viewModelModule.getCurveCurrentRooms(firstSnapshot.calendarGroups[0].groupCurve),
    3,
    "stored hotel-scope group rooms must be available before base-date selection"
);
source.setContext({
    asOfDate: "20260808",
    facilityId: "yad:fixture",
    visibleStayDates: ["20260812", "20260813"]
});
await flushTasks();
assert.equal(requests.length, 1, "the same visible context must not retry rank status");
storedCount += 1;
for (const listener of stateListeners) {
    listener(createCoordinatorState({ status: "complete", storedCount }));
}
await waitFor(() => readLatestCount >= 2);
assert.equal(requests.length, 1, "local booking-curve refresh must not add rank-status GETs");
source.clear();
assert.deepEqual(source.getSnapshot(), summaryModule.createIdleLiveCalendarSummarySnapshot());
source.stop();

let rankRequestAborted = false;
const abortSource = summaryModule.createLiveCalendarSummaryDataSource({
    acquisition: createAcquisitionStub({
        readLatest: () => Promise.resolve([]),
        stateListeners: new Set(),
        suspendedReasons: []
    }),
    transport: {
        read(_request, signal) {
            return new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    rankRequestAborted = true;
                    reject(new DOMException("aborted", "AbortError"));
                }, { once: true });
            });
        }
    },
    windowHost: createTimerWindow()
});
abortSource.setContext({
    asOfDate: "20260808",
    facilityId: "yad:fixture",
    visibleStayDates: ["20260812", "20260813"]
});
abortSource.clear();
await flushTasks();
assert.equal(rankRequestAborted, true, "route or calendar cleanup must abort the in-flight range GET");
assert.deepEqual(abortSource.getSnapshot(), summaryModule.createIdleLiveCalendarSummarySnapshot());
abortSource.stop();

for (const status of [401, 403, 429]) {
    const authStopReasons = [];
    let fetchCount = 0;
    const authSource = summaryModule.createLiveCalendarSummaryDataSource({
        acquisition: createAcquisitionStub({
            readLatest: () => Promise.resolve([]),
            stateListeners: new Set(),
            suspendedReasons: authStopReasons
        }),
        windowHost: createTimerWindow({
            async fetch() {
                fetchCount += 1;
                return {
                    ok: false,
                    status
                };
            }
        })
    });
    authSource.setContext({
        asOfDate: "20260808",
        facilityId: "yad:fixture",
        visibleStayDates: ["20260812", "20260813"]
    });
    await waitFor(() => authSource.getSnapshot().rankStatus === "error");
    assert.equal(authSource.getSnapshot().rankStatusError, `http-${status}`);
    assert.deepEqual(authStopReasons, [`http-${status}`]);
    authSource.setContext({
        asOfDate: "20260808",
        facilityId: "yad:fixture",
        visibleStayDates: ["20260812", "20260813"]
    });
    await flushTasks();
    assert.equal(fetchCount, 1, `${status} must stop without an automatic retry in the same context`);
    authSource.stop();
}

function createAcquisitionStub(options) {
    const initialState = createCoordinatorState({ status: "idle", storedCount: 0 });
    return {
        ensureCurrent: async () => undefined,
        readLatest: options.readLatest,
        startBackground: async () => undefined,
        startReference: async () => undefined,
        subscribe(listener) {
            options.stateListeners.add(listener);
            listener(initialState);
            return () => options.stateListeners.delete(listener);
        },
        suspend(reason) {
            options.suspendedReasons.push(reason);
        },
        stop() {}
    };
}

function createCoordinatorState(overrides) {
    return {
        errorCount: 0,
        mode: null,
        processedCount: 0,
        requestCount: 0,
        skippedCount: 0,
        status: "idle",
        stopReason: null,
        storedCount: 0,
        totalCount: 0,
        ...overrides
    };
}

function createHotelRecord(stayDate, groupRooms) {
    return {
        asOfDate: "20260808",
        cacheKey: `fixture:${stayDate}`,
        endpoint: contractModule.BOOKING_CURVE_ENDPOINT,
        facilityId: "yad:fixture",
        fetchedAt: "2026-08-08T03:00:00.000Z",
        query: `date=${stayDate}`,
        response: {
            booking_curve: [{
                date: "20260808",
                group: { this_year_room_sum: groupRooms }
            }],
            stay_date: stayDate
        },
        roomGroupId: null,
        schemaVersion: contractModule.BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
        scope: "hotel",
        stayDate
    };
}

function createTimerWindow(overrides = {}) {
    return {
        clearTimeout(handle) {
            clearTimeout(handle);
        },
        fetch: async () => ({
            ok: true,
            async json() {
                return { suggest_statuses: [] };
            }
        }),
        location: { origin: "https://ra.jalan.net" },
        setTimeout(callback, delay) {
            return setTimeout(callback, delay);
        },
        ...overrides
    };
}

async function waitFor(predicate) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > 2_000) {
            throw new Error("timed out waiting for calendar summary state");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

async function flushTasks() {
    await new Promise((resolve) => setTimeout(resolve, 10));
}

console.log("Next calendar summary checks passed");
