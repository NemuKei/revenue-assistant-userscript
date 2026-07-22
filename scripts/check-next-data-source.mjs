import assert from "node:assert/strict";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const dataSourceModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensDataSource.ts",
    import.meta.url
);
const transportModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensTransport.ts",
    import.meta.url
);
const requests = [];
const indexReads = [];
const primaryKeyReads = [];
let facilityYadNo = "fixture";
let facilityName = "施設A（mock）";
const settingsPayload = {
    suggest_output_current_settings: [{
        stay_date: "20260812",
        rm_room_groups: [{
            rm_room_group_id: "room-1",
            rm_room_group_name: "Fixture room",
            remaining_num_room: 3,
            max_num_room: 10
        }]
    }]
};
const transport = {
    async read(request) {
        requests.push(request);
        if (request.kind === "facility") {
            return { yad_no: facilityYadNo, name: facilityName };
        }
        return settingsPayload;
    }
};
const indexReader = async (options) => {
    indexReads.push(options);
    return { status: "ready", records: [] };
};
const documentHost = {
    body: { innerText: "最終データ更新: 2026年7月22日" },
    querySelectorAll() {
        return [];
    },
    querySelector() {
        return null;
    }
};
const dataSource = dataSourceModule.createLiveSimilarityLensDataSource({
    documentHost,
    indexReader,
    primaryKeyReader: async (options) => {
        primaryKeyReads.push(options);
        return { status: "ready", records: [] };
    },
    transport,
    windowHost: {}
});
assert.equal(requests.length, 0, "creating the data source must not perform a request");

const visibleDates = ["2026-08-12", "2026-08-13", "2026-09-30"];
const first = await dataSource.load(visibleDates);
assert.equal(first.status, "ready");
assert.equal(first.facilityLabel, "施設A（mock）");
assert.deepEqual(requests.map((request) => request.kind), ["facility", "current-settings"]);
assert.deepEqual(requests[1], {
    kind: "current-settings",
    from: "20260812",
    to: "20260930"
});
assert.equal(primaryKeyReads.length, 1);
assert.equal(primaryKeyReads[0].keys.length, 4);
const firstHotelKeys = primaryKeyReads[0].keys.filter((key) => key.includes("|scope:hotel|"));
const firstRoomGroupKeys = primaryKeyReads[0].keys.filter((key) => key.includes("|scope:roomGroup|"));
assert.equal(firstHotelKeys.length, 3, "every visible date must read its exact hotel-scope cache key");
assert.equal(firstRoomGroupKeys.length, 1, "room-group evidence must retain exact current-setting keys");
assert.match(
    firstRoomGroupKeys[0],
    /^facility:yad:fixture\|stayDate:20260812\|asOf:20260722\|scope:roomGroup\|roomGroup:room-1\|/u
);
assert.match(
    firstHotelKeys[0],
    /^facility:yad:fixture\|stayDate:20260812\|asOf:20260722\|scope:hotel\|roomGroup:-\|endpoint:\/api\/v4\/booking_curve\|query:date=20260812\|/u
);
assert.equal(indexReads.length, 1);
assert.deepEqual(indexReads[0].keys[0], ["yad:fixture", "20260812"]);

facilityYadNo = "fixture-b";
facilityName = "施設B（mock）";
const second = await dataSource.load(visibleDates);
assert.equal(second.status, "ready");
assert.equal(second.evidence.facilityId, "yad:fixture-b");
assert.equal(second.facilityLabel, "施設B（mock）");
assert.notEqual(second, first, "a completed load must be revalidated on explicit reselection");
assert.equal(requests.length, 4, "explicit reselection must revalidate both read endpoints");
assert.equal(primaryKeyReads.length, 2);
assert.equal(primaryKeyReads[1].keys.length, 4);
assert.equal(
    primaryKeyReads[1].keys.every((key) => key.startsWith("facility:yad:fixture-b|")),
    true
);
dataSource.stop();
const stopped = await dataSource.load(visibleDates);
assert.equal(stopped.status, "error");
assert.equal(stopped.reason, "aborted");
assert.equal(requests.length, 4);

let releaseConcurrentLoad;
const concurrentGate = new Promise((resolve) => {
    releaseConcurrentLoad = resolve;
});
const concurrentRequests = [];
const concurrentDataSource = dataSourceModule.createLiveSimilarityLensDataSource({
    documentHost,
    indexReader: async () => ({ status: "ready", records: [] }),
    primaryKeyReader: async () => ({ status: "ready", records: [] }),
    transport: {
        async read(request) {
            concurrentRequests.push(request);
            await concurrentGate;
            return request.kind === "facility"
                ? { yad_no: "concurrent", name: "並行施設（mock）" }
                : settingsPayload;
        }
    },
    windowHost: {}
});
const concurrentFirst = concurrentDataSource.load(visibleDates);
const concurrentSecond = concurrentDataSource.load(visibleDates);
assert.equal(concurrentSecond, concurrentFirst, "only the same in-flight context may be deduplicated");
releaseConcurrentLoad();
assert.equal((await concurrentFirst).status, "ready");
assert.equal(concurrentRequests.length, 2, "in-flight deduplication must retain the two-request budget");
concurrentDataSource.stop();

const budgetCalls = [];
const session = transportModule.createNextReadSession({
    read(request) {
        budgetCalls.push(request);
        return Promise.resolve({});
    }
}, new AbortController().signal);
await session.read({ kind: "facility" });
assert.throws(
    () => session.read({ kind: "facility" }),
    /budget exceeded/u,
    "duplicate request kinds must fail before reaching transport"
);
assert.equal(budgetCalls.length, 1);

assert.equal(
    dataSourceModule.parseLiveSimilarityLensAsOfDate({ body: { innerText: "更新日なし" } }),
    null,
    "as-of must not fall back to today"
);
assert.equal(
    dataSourceModule.parseLiveSimilarityLensAsOfDate({ body: { innerText: "最終データ更新: 2026年2月29日" } }),
    null,
    "invalid dates must fail closed"
);

async function loadCurrentSettingsPayload(payload) {
    const payloadRequests = [];
    let payloadIndexReadCount = 0;
    const payloadDataSource = dataSourceModule.createLiveSimilarityLensDataSource({
        documentHost,
        indexReader: async () => {
            payloadIndexReadCount += 1;
            return { status: "ready", records: [] };
        },
        transport: {
            async read(request) {
                payloadRequests.push(request);
                return request.kind === "facility"
                    ? { yad_no: "fixture", name: "施設A（mock）" }
                    : payload;
            }
        },
        windowHost: {}
    });
    const result = await payloadDataSource.load(["2026-08-12"]);
    return { payloadIndexReadCount, payloadRequests, result };
}

const invalidCurrentSettingsPayloads = [
    { suggest_output_current_settings: [null] },
    {
        suggest_output_current_settings: [{
            stay_date: "20260812",
            rm_room_groups: [null]
        }]
    },
    {
        suggest_output_current_settings: [{
            stay_date: "20260812",
            rm_room_groups: [{
                rm_room_group_id: 42,
                rm_room_group_name: "Fixture room",
                remaining_num_room: 3,
                max_num_room: 10
            }]
        }]
    },
    {
        suggest_output_current_settings: [{
            stay_date: "20260812",
            rm_room_groups: { rm_room_group_id: "room-1" }
        }]
    }
];

for (const invalidPayload of invalidCurrentSettingsPayloads) {
    const invalidLoad = await loadCurrentSettingsPayload(invalidPayload);
    assert.equal(invalidLoad.result.status, "error");
    assert.equal(
        invalidLoad.result.reason,
        "current-settings-response-invalid",
        "invalid array members must fail at the payload boundary"
    );
    assert.deepEqual(
        invalidLoad.payloadRequests.map((request) => request.kind),
        ["facility", "current-settings"],
        "payload validation must not change the two-request budget"
    );
    assert.equal(
        invalidLoad.payloadIndexReadCount,
        0,
        "invalid API payloads must not reach the IndexedDB read boundary"
    );
}

const invalidFacilityDataSource = dataSourceModule.createLiveSimilarityLensDataSource({
    documentHost,
    indexReader: async () => {
        throw new Error("invalid facility must not reach IndexedDB");
    },
    primaryKeyReader: async () => {
        throw new Error("invalid facility must not reach IndexedDB");
    },
    transport: {
        async read(request) {
            return request.kind === "facility" ? { yad_no: "missing-name" } : settingsPayload;
        }
    },
    windowHost: {}
});
const invalidFacility = await invalidFacilityDataSource.load(["2026-08-12"]);
assert.equal(invalidFacility.status, "error");
assert.equal(invalidFacility.reason, "facility-response-invalid");
invalidFacilityDataSource.stop();

console.log("Next data source checks passed");
