import assert from "node:assert/strict";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const evidenceModule = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensEvidence.ts",
    import.meta.url
);
const {
    buildLiveSimilarityLensEvidence,
    projectLiveSimilarityLensEvidenceForRoomGroup
} = evidenceModule;

const facilityId = "yad:test";
const asOfDate = "20260722";
const stayDate = "20260812";
const roomGroupId = "room-a";
const exactRecord = bookingRecord({
    facilityId,
    stayDate,
    asOfDate,
    roomGroupId,
    transient: 0,
    group: 0
});
const ready = buildEvidence({
    currentSettings: currentSettings(10, 10),
    records: [exactRecord]
});
const readyRoom = ready.roomGroups[0];
assert.equal(readyRoom?.onHand.status, "ready");
assert.equal(readyRoom?.onHand.value.rooms, 0, "OH zero must remain a ready value");
assert.equal(readyRoom?.transientCurve.status, "ready");
assert.equal(readyRoom?.transientCurve.value.points[0]?.value, 0, "transient zero must remain ready");
assert.equal(readyRoom?.groupCurve.status, "ready");
assert.equal(readyRoom?.groupCurve.value.points[0]?.value, 0, "group zero must remain ready");
const projected = projectLiveSimilarityLensEvidenceForRoomGroup(ready, roomGroupId);
assert.equal(projected[0]?.onHandRooms, 0);
assert.equal(projected[0]?.competitorPriceIndex, null, "unverified competitor cache must never score");

const partial = buildEvidence({
    currentSettings: currentSettings(10, 4),
    records: [bookingRecord({
        facilityId,
        stayDate,
        asOfDate,
        roomGroupId,
        transient: 4
    })]
});
assert.equal(partial.roomGroups[0]?.transientCurve.status, "ready");
assert.equal(partial.roomGroups[0]?.groupCurve.status, "missing");
assert.equal(partial.roomGroups[0]?.groupCurve.reason, "segment-points-missing");

const stale = buildEvidence({
    currentSettings: currentSettings(10, 4),
    records: [bookingRecord({
        facilityId,
        stayDate,
        asOfDate: "20260721",
        roomGroupId,
        transient: 4,
        group: 1
    })]
});
assert.equal(stale.roomGroups[0]?.transientCurve.status, "stale");
assert.equal(projectLiveSimilarityLensEvidenceForRoomGroup(stale, roomGroupId)[0]?.transientCurve, null);

const wrongQuery = buildEvidence({
    currentSettings: currentSettings(10, 4),
    records: [{ ...exactRecord, query: `date=${stayDate}` }]
});
assert.equal(wrongQuery.roomGroups[0]?.transientCurve.status, "missing");
assert.equal(wrongQuery.roomGroups[0]?.transientCurve.reason, "booking-record-missing");

const invalidOh = buildEvidence({
    currentSettings: currentSettings(10, 11),
    records: [exactRecord]
});
assert.equal(invalidOh.roomGroups[0]?.onHand.status, "missing");
assert.equal(invalidOh.roomGroups[0]?.onHand.reason, "invalid-room-counts");

const databaseMissing = buildLiveSimilarityLensEvidence({
    facilityId,
    asOfDate,
    visibleStayDates: [stayDate],
    currentSettings: currentSettings(10, 4),
    bookingRawRecords: [],
    bookingReadStatus: { status: "missing", reason: "database-missing" },
    competitorRecords: [],
    competitorReadStatus: { status: "missing", reason: "database-missing" }
});
assert.equal(databaseMissing.roomGroups[0]?.transientCurve.status, "missing");
assert.equal(databaseMissing.roomGroups[0]?.transientCurve.reason, "database-missing");
assert.equal(databaseMissing.competitorCache.status, "missing");

console.log("Next live evidence checks passed");

function buildEvidence({ currentSettings: settings, records }) {
    return buildLiveSimilarityLensEvidence({
        facilityId,
        asOfDate,
        visibleStayDates: [stayDate],
        currentSettings: settings,
        bookingRawRecords: records,
        bookingReadStatus: { status: "ready", records },
        competitorRecords: [],
        competitorReadStatus: { status: "ready", records: [] }
    });
}

function currentSettings(maxRooms, remainingRooms) {
    return {
        suggest_output_current_settings: [{
            stay_date: stayDate,
            rm_room_groups: [{
                rm_room_group_id: roomGroupId,
                rm_room_group_name: "テスト客室",
                max_num_room: maxRooms,
                remaining_num_room: remainingRooms
            }]
        }]
    };
}

function bookingRecord(options) {
    const query = `date=${options.stayDate}&rm_room_group_id=${options.roomGroupId}`;
    return {
        cacheKey: `test:${options.stayDate}:${options.roomGroupId}:${options.asOfDate}`,
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        asOfDate: options.asOfDate,
        scope: "roomGroup",
        roomGroupId: options.roomGroupId,
        endpoint: "/api/v4/booking_curve",
        query,
        fetchedAt: "2026-07-22T05:00:00.000Z",
        schemaVersion: "booking_curve_raw_source:v2",
        response: {
            stay_date: options.stayDate,
            booking_curve: [{
                date: "20260720",
                ...(options.transient === undefined ? {} : {
                    transient: { this_year_room_sum: options.transient }
                }),
                ...(options.group === undefined ? {} : {
                    group: { this_year_room_sum: options.group }
                })
            }]
        }
    };
}
