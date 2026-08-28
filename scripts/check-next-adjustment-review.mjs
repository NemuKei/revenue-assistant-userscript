import assert from "node:assert/strict";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const review = await importBundledTypeScript(
    "../src/next/adjustmentReview/adjustmentReviewModel.ts",
    import.meta.url
);
const dataSourceApi = await importBundledTypeScript(
    "../src/next/adjustmentReview/adjustmentReviewDataSource.ts",
    import.meta.url
);
const focusApi = await importBundledTypeScript(
    "../src/next/adjustmentReview/adjustmentReviewFocus.ts",
    import.meta.url
);

const parsed = review.parseAdjustmentReviewEvents({
    suggest_statuses: [
        {
            accepted_at: "2026-08-10T09:00:00+09:00",
            after_price_rank_name: "2",
            before_price_rank_name: "3",
            date: "20260830",
            reflector_name: "担当 A",
            rm_room_group_id: "room-a"
        },
        {
            accepted_at: "2026-08-22T09:00:00+09:00",
            after_price_rank_name: "4",
            before_price_rank_name: "3",
            date: "20260830",
            reflector_name: "担当 B",
            rm_room_group_id: "room-b"
        },
        {
            accepted_at: "invalid",
            after_price_rank_name: "1",
            before_price_rank_name: "2",
            date: "20260830",
            rm_room_group_id: "room-invalid"
        },
        {
            accepted_at: "2026-08-10T09:00:00+09:00",
            after_price_rank_name: "1",
            before_price_rank_name: "2",
            date: "20260901",
            rm_room_group_id: "room-outside"
        }
    ]
}, {
    asOfDate: "20260825",
    rankOrder: {
        diagnostics: [],
        ranksHighToLow: ["1", "2", "3", "4"].map((name) => ({ code: name, name })),
        source: "settings_screen"
    },
    visibleStayDates: ["20260830"]
});
assert.notEqual(parsed, null);
assert.equal(parsed.length, 2, "only valid visible events belong to the review");
assert.equal(parsed[0].actorName, "担当 B");
assert.equal(parsed[0].direction, "lower");
assert.equal(parsed[0].directionSource, "settings_screen");
assert.equal(parsed[1].direction, "raise");
assert.equal(
    parsed[1].eventKey,
    review.buildAdjustmentReviewEventKey({
        afterRankName: "2",
        beforeRankName: "3",
        reflectedAt: "2026-08-10T00:00:00.000Z",
        roomGroupId: "room-a",
        stayDate: "2026-08-30"
    }),
    "event identity must be timestamp-format independent and actor-free"
);
assert.equal(review.parseAdjustmentReviewEvents({}, {
    asOfDate: "20260825",
    visibleStayDates: ["20260830"]
}), null);

const nonNumeric = review.parseAdjustmentReviewEvents({
    suggest_statuses: [{
        accepted_at: "2026-08-10T09:00:00+09:00",
        after_price_rank_name: "B",
        before_price_rank_name: "C",
        date: "20260830",
        rm_room_group_id: "room-a"
    }]
}, {
    asOfDate: "20260825",
    visibleStayDates: ["20260830"]
});
assert.equal(nonNumeric[0].direction, "unknown", "rank appearance alone must not invent direction");

const reverseOrder = review.parseAdjustmentReviewEvents({
    suggest_statuses: [{
        accepted_at: "2026-08-10T09:00:00+09:00",
        after_price_rank_name: "2",
        before_price_rank_name: "3",
        date: "20260830",
        rm_room_group_id: "room-a"
    }]
}, {
    asOfDate: "20260825",
    rankOrder: {
        diagnostics: [],
        ranksHighToLow: ["4", "3", "2", "1"].map((name) => ({ code: name, name })),
        source: "manual_override"
    },
    visibleStayDates: ["20260830"]
});
assert.equal(
    reverseOrder[0].direction,
    "lower",
    "confirmed facility rank order must override the visual direction of numeric names"
);
const numericFallback = review.parseAdjustmentReviewEvents({
    suggest_statuses: [{
        accepted_at: "2026-08-10T09:00:00+09:00",
        after_price_rank_name: "2",
        before_price_rank_name: "3",
        date: "20260830",
        rm_room_group_id: "room-a"
    }]
}, {
    asOfDate: "20260825",
    visibleStayDates: ["20260830"]
});
assert.equal(
    numericFallback[0].direction,
    "raise",
    "missing settings evidence may use only the shared numeric-rank fallback"
);
assert.equal(numericFallback[0].directionSource, "numeric_rank_name");

const events = [
    event("room-a", "20260810", "2026-08-10T09:00:00+09:00", "担当 A"),
    event("room-b", "20260822", "2026-08-22T09:00:00+09:00", "担当 B"),
    event("room-c", "20260810", "2026-08-10T09:00:00+09:00", "担当 A"),
    event("room-c", "20260812", "2026-08-12T09:00:00+09:00", "担当 C"),
    event("room-d", "20260810", "2026-08-10T09:00:00+09:00", null),
    event("room-d", "20260810", "2026-08-10T18:00:00+09:00", null),
    event("room-e", "20260827", "2026-08-27T09:00:00+09:00", "担当 E"),
    event("room-f", "20260810", "2026-08-10T09:00:00+09:00", "担当 F"),
    event("room-f", "20260818", "2026-08-18T09:00:00+09:00", "担当 F")
];
const records = [
    record("room-a", {
        "20260803": 10,
        "20260807": 11,
        "20260810": 13,
        "20260813": 14,
        "20260817": 18
    }),
    record("room-b", {
        "20260819": 8,
        "20260822": 7,
        "20260825": 9
    }),
    record("room-c", {
        "20260803": 2,
        "20260807": 3,
        "20260810": 4,
        "20260812": 5,
        "20260815": 8,
        "20260817": 9,
        "20260819": 10
    }),
    record("room-d", {
        "20260803": 1,
        "20260810": 2,
        "20260817": 3
    }),
    record("room-e", {
        "20260820": 1,
        "20260827": 2
    }),
    record("room-f", {
        "20260803": 2,
        "20260810": 4,
        "20260817": 6,
        "20260818": 7
    })
];
const rooms = ["room-a", "room-b", "room-c", "room-d", "room-e", "room-f"]
    .map((roomGroupId, order) => ({
        order,
        roomGroupId,
        roomGroupName: `部屋 ${order + 1}`
    }));

const evaluated = review.evaluateAdjustmentReviewEvents({
    asOfDate: "20260825",
    events,
    records,
    rooms
});
const byKey = new Map(evaluated.map((item) => [
    `${item.roomGroupId}|${item.reflectedDate}|${item.reflectedAt}`,
    item
]));
assert.deepEqual(findEvent(evaluated, "room-a", "20260810").observations, {
    3: { afterPace: 1, beforePace: 2, delta: -1, state: "ready" },
    7: { afterPace: 5, beforePace: 3, delta: 2, state: "ready" }
}, "3-day and 7-day windows must use their own exact points without fallback");
assert.deepEqual(findEvent(evaluated, "room-b", "20260822").observations[3], {
    afterPace: 2,
    beforePace: -1,
    delta: 3,
    state: "ready"
}, "signed cancellations must stay signed instead of being clamped to zero");
assert.equal(findEvent(evaluated, "room-b", "20260822").observations[7].state, "pending");
assert.equal(findEvent(evaluated, "room-c", "20260810").observations[3].state, "censored");
assert.equal(findEvent(evaluated, "room-c", "20260810").observations[7].state, "censored");
assert.equal(findEvent(evaluated, "room-d", "20260810", 0).observations[7].state, "excluded");
assert.equal(findEvent(evaluated, "room-d", "20260810", 1).observations[7].state, "excluded");
assert.equal(findEvent(evaluated, "room-e", "20260827").observations[7].state, "excluded");
assert.equal(findEvent(evaluated, "room-f", "20260818").observations[7].state, "missing");
assert.equal(byKey.size, evaluated.length);

const baseFilters = review.createInitialAdjustmentReviewFilters();
assert.equal(review.isSameAdjustmentReviewStayDate("2026-08-30", "20260830"), true);
assert.equal(review.isSameAdjustmentReviewStayDate("2026-08-30", "20260831"), false);
assert.equal(review.isSameAdjustmentReviewStayDate("invalid", "20260830"), false);
const sevenDay = review.buildAdjustmentReviewViewModel({
    asOfDate: "20260825",
    events,
    filters: baseFilters,
    horizon: 7,
    records,
    rooms,
    sort: "default"
});
assert.deepEqual(
    review.buildAdjustmentReviewViewModelFromEvaluatedEvents({
        evaluatedEvents: evaluated,
        filters: baseFilters,
        horizon: 7,
        sort: "default"
    }),
    sevenDay,
    "UI-only changes must reuse evaluated observations without rebuilding curve indexes"
);
assert.equal(sevenDay.parentRows.length, 1);
const parent = sevenDay.parentRows[0];
assert.equal(parent.roomCount, 6, "one latest filtered event per room must feed the parent");
assert.equal(parent.readyCount, 1, "only selected-horizon ready rooms contribute to totals");
assert.deepEqual(
    [parent.beforePaceTotal, parent.afterPaceTotal, parent.deltaTotal],
    [3, 5, 2]
);
assert.equal(parent.detailEvents.length, events.length, "older events must remain in detail");

const actorFiltered = review.buildAdjustmentReviewViewModel({
    asOfDate: "20260825",
    events,
    filters: { ...baseFilters, actorName: "担当 A" },
    horizon: 7,
    records,
    rooms,
    sort: "default"
});
assert.deepEqual(
    actorFiltered.parentRows[0].latestEvents.map((item) => item.roomGroupId),
    ["room-a", "room-c"],
    "latest selection happens after actor and other pre-filters"
);
assert.equal(
    sevenDay.actorOptions.find((option) => option.value === "担当 F").count,
    1,
    "actor option counts unique stay-date x room candidates, not raw events"
);

const readyOnly = review.buildAdjustmentReviewViewModel({
    asOfDate: "20260825",
    events,
    filters: { ...baseFilters, observation: "ready" },
    horizon: 7,
    records,
    rooms,
    sort: "default"
});
assert.deepEqual(
    readyOnly.parentRows[0].latestEvents.map((item) => item.roomGroupId),
    ["room-a"],
    "observation filtering must not replace a latest missing event with an older ready event"
);
assert.equal(
    readyOnly.actorOptions.some((option) => option.value === "担当 F"),
    false,
    "actor option counts must apply observation state after selecting that actor's latest event"
);
assert.equal(
    readyOnly.roomOptions.some((option) => option.value === "room-f"),
    false,
    "room option counts must apply observation state after selecting that room's latest event"
);

const threeDay = review.buildAdjustmentReviewViewModel({
    asOfDate: "20260825",
    events,
    filters: baseFilters,
    horizon: 3,
    records,
    rooms,
    sort: "default"
});
assert.notDeepEqual(
    [threeDay.parentRows[0].beforePaceTotal, threeDay.parentRows[0].afterPaceTotal],
    [parent.beforePaceTotal, parent.afterPaceTotal],
    "switching horizon must recompute the selected horizon instead of retaining 7-day values"
);

const updatedRecords = records.map((item) => item.roomGroupId === "room-a"
    ? record("room-a", {
        "20260803": 10,
        "20260807": 11,
        "20260810": 13,
        "20260813": 17,
        "20260817": 22
    })
    : item);
const updatedEvaluation = review.evaluateAdjustmentReviewEvents({
    asOfDate: "20260825",
    events,
    records: updatedRecords,
    rooms
});
const updatedRoomAEvaluation = review.evaluateAdjustmentReviewEvents({
    asOfDate: "20260825",
    events: events.filter((item) => item.roomGroupId === "room-a"),
    records: updatedRecords.filter((item) => item.roomGroupId === "room-a"),
    rooms: rooms.filter((item) => item.roomGroupId === "room-a")
});
const incrementallyUpdated = review.sortEvaluatedAdjustmentReviewEvents([
    ...evaluated.filter((item) => item.roomGroupId !== "room-a"),
    ...updatedRoomAEvaluation
]);
assert.deepEqual(
    incrementallyUpdated,
    updatedEvaluation,
    "a changed stay-date x room scope must be independently replaceable without changing results"
);
assert.deepEqual(
    review.buildAdjustmentReviewViewModelFromEvaluatedEvents({
        evaluatedEvents: incrementallyUpdated,
        filters: baseFilters,
        horizon: 7,
        sort: "default"
    }),
    review.buildAdjustmentReviewViewModel({
        asOfDate: "20260825",
        events,
        filters: baseFilters,
        horizon: 7,
        records: updatedRecords,
        rooms,
        sort: "default"
    }),
    "incremental evaluation must preserve the full view-model contract"
);

const calendarListeners = new Set();
const storedListeners = new Set();
const sourceReadBatches = [];
const sourceEvents = Array.from({ length: 33 }, (_, index) => ({
    ...event(`batch-room-${index}`, "20260810", "2026-08-10T09:00:00+09:00", null),
    stayDate: "20260830"
}));
let calendarState = {
    adjustmentEvents: sourceEvents,
    calendarGroups: [],
    contextKey: "fixture|20260825|20260830",
    latestChanges: [],
    rankStatus: "ready",
    rankStatusError: null,
    reviewContext: {
        asOfDate: "20260825",
        facilityId: "facility:fixture",
        rooms: sourceEvents.map((item, order) => ({
            order,
            roomGroupId: item.roomGroupId,
            roomGroupName: `fixture room ${order}`
        })),
        visibleStayDates: ["20260830"]
    }
};
const reviewDataSource = dataSourceApi.createAdjustmentReviewDataSource({
    acquisition: {
        async readLatest(sourceKeys) {
            sourceReadBatches.push([...sourceKeys]);
            return sourceKeys.map((sourceKey) => ({ sourceKey }));
        },
        subscribe() {
            return () => undefined;
        },
        subscribeStored(listener) {
            storedListeners.add(listener);
            return () => storedListeners.delete(listener);
        }
    },
    calendarSummary: {
        getSnapshot: () => calendarState,
        subscribe(listener) {
            calendarListeners.add(listener);
            return () => calendarListeners.delete(listener);
        }
    },
    windowHost: { setTimeout }
});
await waitFor(() => reviewDataSource.getSnapshot().status === "ready");
assert.deepEqual(
    sourceReadBatches.map((batch) => batch.length),
    [32, 1],
    "browser-local reads must yield in fixed batches instead of one synchronous all-event read"
);
for (const listener of storedListeners) {
    listener({ scopeKey: "room:batch-room-0", stayDate: "20260830" });
}
await waitFor(() => sourceReadBatches.length === 3);
assert.equal(sourceReadBatches[2].length, 1, "a stored source refresh must reread only its stay-room key");
calendarState = {
    adjustmentEvents: [],
    calendarGroups: [],
    contextKey: null,
    latestChanges: [],
    rankStatus: "idle",
    rankStatusError: null,
    reviewContext: null
};
for (const listener of calendarListeners) {
    listener();
}
assert.equal(reviewDataSource.getSnapshot().status, "idle");
reviewDataSource.stop();

const sessionValues = new Map();
const focusWindow = {
    sessionStorage: {
        getItem: (key) => sessionValues.get(key) ?? null,
        removeItem: (key) => sessionValues.delete(key),
        setItem: (key, value) => sessionValues.set(key, value)
    }
};
assert.equal(focusApi.writePendingAdjustmentReviewFocus(focusWindow, {
    eventKey: parsed[0].eventKey,
    roomGroupId: parsed[0].roomGroupId,
    stayDate: parsed[0].stayDate
}), true);
const pendingSerialized = sessionValues.get(focusApi.ADJUSTMENT_REVIEW_PENDING_FOCUS_STORAGE_KEY);
assert.deepEqual(
    Object.keys(JSON.parse(pendingSerialized)).sort(),
    ["createdAt", "eventKey", "roomGroupId", "schemaVersion", "stayDate"],
    "pending focus may contain only the one-shot non-actor contract"
);
assert.equal(pendingSerialized.includes("担当"), false);
assert.equal(
    focusApi.readPendingAdjustmentReviewFocus(focusWindow, "20260831"),
    null,
    "a different Analyze stay date must not consume the pending focus"
);
assert.notEqual(
    focusApi.readPendingAdjustmentReviewFocus(focusWindow, parsed[0].stayDate),
    null
);
focusApi.clearPendingAdjustmentReviewFocus(focusWindow);
assert.equal(sessionValues.size, 0);

function event(roomGroupId, reflectedDate, reflectedAt, actorName) {
    const beforeRankName = "3";
    const afterRankName = "2";
    return {
        actorName,
        afterRankName,
        beforeRankName,
        daysBeforeStay: daysBetween("20260830", reflectedDate),
        direction: "raise",
        directionSource: "settings_screen",
        eventKey: review.buildAdjustmentReviewEventKey({
            afterRankName,
            beforeRankName,
            reflectedAt,
            roomGroupId,
            stayDate: "20260830"
        }),
        reflectedAt: new Date(reflectedAt).toISOString(),
        reflectedDate,
        roomGroupId,
        stayDate: "20260830"
    };
}

function record(roomGroupId, values) {
    return {
        asOfDate: "20260825",
        facilityId: "facility:fixture",
        firstObservedAsOfDate: "20260801",
        landing: null,
        recordKey: `record:${roomGroupId}`,
        response: {
            booking_curve: Object.entries(values).map(([date, rooms]) => ({
                date,
                transient: { this_year_room_sum: rooms }
            })),
            stay_date: "20260830"
        },
        roomGroupId,
        scope: "roomGroup",
        source: "next-bounded-booking-curve",
        sourceKey: `source:${roomGroupId}`,
        stayDate: "20260830"
    };
}

function findEvent(values, roomGroupId, reflectedDate, index = 0) {
    return values.filter((item) => (
        item.roomGroupId === roomGroupId && item.reflectedDate === reflectedDate
    ))[index];
}

function daysBetween(stayDate, reflectedDate) {
    const start = Date.UTC(
        Number(reflectedDate.slice(0, 4)),
        Number(reflectedDate.slice(4, 6)) - 1,
        Number(reflectedDate.slice(6, 8))
    );
    const end = Date.UTC(
        Number(stayDate.slice(0, 4)),
        Number(stayDate.slice(4, 6)) - 1,
        Number(stayDate.slice(6, 8))
    );
    return Math.round((end - start) / 86_400_000);
}

async function waitFor(predicate, timeoutMs = 1_000) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error("timed out waiting for adjustment review fixture state");
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
