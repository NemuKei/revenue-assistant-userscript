import type {
    NextBookingCurveAcquisitionCoordinator,
    NextBookingCurveStoredSourceEvent
} from "../bookingCurve/bookingCurveAcquisitionCoordinator";
import { buildNextBookingCurveSourceKey } from "../bookingCurve/bookingCurveSourceStore";
import type { NextBookingCurveSourceRecord } from "../bookingCurve/bookingCurveSourceStore";
import type {
    LiveCalendarSummaryDataSource,
    LiveCalendarSummarySnapshot
} from "../live/liveCalendarSummaryDataSource";
import type {
    AdjustmentReviewEvent,
    AdjustmentReviewRoom
} from "./adjustmentReviewModel";

const ADJUSTMENT_REVIEW_READ_BATCH_SIZE = 32;

export type AdjustmentReviewDataSnapshot =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; reason: "local-read-failed" | "rank-status-failed" }
    | {
        asOfDate: string;
        contextKey: string;
        events: readonly AdjustmentReviewEvent[];
        records: readonly NextBookingCurveSourceRecord[];
        rooms: readonly AdjustmentReviewRoom[];
        status: "ready";
    };

export interface AdjustmentReviewDataSource {
    getSnapshot(): AdjustmentReviewDataSnapshot;
    stop(): void;
    subscribe(listener: () => void): () => void;
}

export function createAdjustmentReviewDataSource(options: {
    acquisition: NextBookingCurveAcquisitionCoordinator;
    calendarSummary: LiveCalendarSummaryDataSource;
    windowHost?: Window;
}): AdjustmentReviewDataSource {
    const windowHost = options.windowHost ?? window;
    const listeners = new Set<() => void>();
    const recordsBySourceKey = new Map<string, NextBookingCurveSourceRecord>();
    let snapshot: AdjustmentReviewDataSnapshot = { status: "idle" };
    let rankSignature: string | null = null;
    let generation = 0;
    let stopped = false;
    const unsubscribeCalendar = options.calendarSummary.subscribe(handleCalendarSummary);
    const unsubscribeStored = options.acquisition.subscribeStored?.(handleStoredSource)
        ?? (() => undefined);

    handleCalendarSummary();

    return {
        getSnapshot: copySnapshot,
        stop() {
            if (stopped) {
                return;
            }
            stopped = true;
            generation += 1;
            recordsBySourceKey.clear();
            unsubscribeCalendar();
            unsubscribeStored();
            listeners.clear();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };

    function handleCalendarSummary(): void {
        if (stopped) {
            return;
        }
        const calendar = options.calendarSummary.getSnapshot();
        const nextSignature = buildRankSignature(calendar);
        if (nextSignature === rankSignature) {
            return;
        }
        rankSignature = nextSignature;
        generation += 1;
        recordsBySourceKey.clear();
        if (calendar.contextKey === null || calendar.reviewContext === null) {
            publish({ status: "idle" });
            return;
        }
        if (calendar.rankStatus === "loading" || calendar.rankStatus === "idle") {
            publish({ status: "loading" });
            return;
        }
        if (calendar.rankStatus === "error") {
            publish({ status: "error", reason: "rank-status-failed" });
            return;
        }
        const currentGeneration = generation;
        publish({ status: "loading" });
        void refreshAll(calendar, currentGeneration);
    }

    async function refreshAll(
        calendar: LiveCalendarSummarySnapshot,
        expectedGeneration: number
    ): Promise<void> {
        const reviewContext = calendar.reviewContext;
        if (calendar.contextKey === null || reviewContext === null) {
            return;
        }
        const sourceKeys = buildRelevantSourceKeys(calendar);
        try {
            for (let offset = 0; offset < sourceKeys.length; offset += ADJUSTMENT_REVIEW_READ_BATCH_SIZE) {
                const batch = sourceKeys.slice(offset, offset + ADJUSTMENT_REVIEW_READ_BATCH_SIZE);
                const records = await options.acquisition.readLatest(batch);
                if (!isCurrent(expectedGeneration, calendar.contextKey)) {
                    return;
                }
                for (const record of records) {
                    recordsBySourceKey.set(record.sourceKey, record);
                }
                if (offset + ADJUSTMENT_REVIEW_READ_BATCH_SIZE < sourceKeys.length) {
                    await yieldToMainThread(windowHost);
                }
            }
            if (!isCurrent(expectedGeneration, calendar.contextKey)) {
                return;
            }
            publishReady(calendar);
        } catch {
            if (isCurrent(expectedGeneration, calendar.contextKey)) {
                publish({ status: "error", reason: "local-read-failed" });
            }
        }
    }

    function handleStoredSource(event: NextBookingCurveStoredSourceEvent): void {
        if (stopped || !event.scopeKey.startsWith("room:")) {
            return;
        }
        const calendar = options.calendarSummary.getSnapshot();
        const reviewContext = calendar.reviewContext;
        if (
            snapshot.status !== "ready"
            || calendar.contextKey === null
            || reviewContext === null
            || snapshot.contextKey !== calendar.contextKey
        ) {
            return;
        }
        const roomGroupId = event.scopeKey.slice("room:".length);
        if (!calendar.adjustmentEvents.some((candidate) => (
            candidate.stayDate === event.stayDate
            && candidate.roomGroupId === roomGroupId
        ))) {
            return;
        }
        const sourceKey = buildNextBookingCurveSourceKey({
            facilityId: reviewContext.facilityId,
            roomGroupId,
            scope: "roomGroup",
            stayDate: event.stayDate
        });
        const expectedGeneration = generation;
        void options.acquisition.readLatest([sourceKey]).then((records) => {
            if (!isCurrent(expectedGeneration, calendar.contextKey ?? "")) {
                return;
            }
            recordsBySourceKey.delete(sourceKey);
            for (const record of records) {
                recordsBySourceKey.set(record.sourceKey, record);
            }
            publishReady(options.calendarSummary.getSnapshot());
        }).catch(() => undefined);
    }

    function publishReady(calendar: LiveCalendarSummarySnapshot): void {
        if (calendar.contextKey === null || calendar.reviewContext === null) {
            return;
        }
        publish({
            asOfDate: calendar.reviewContext.asOfDate,
            contextKey: calendar.contextKey,
            events: [...calendar.adjustmentEvents],
            records: Array.from(recordsBySourceKey.values()),
            rooms: calendar.reviewContext.rooms.map((room) => ({ ...room })),
            status: "ready"
        });
    }

    function publish(next: AdjustmentReviewDataSnapshot): void {
        snapshot = next;
        for (const listener of listeners) {
            listener();
        }
    }

    function copySnapshot(): AdjustmentReviewDataSnapshot {
        return snapshot.status !== "ready"
            ? { ...snapshot }
            : {
                ...snapshot,
                events: [...snapshot.events],
                records: [...snapshot.records],
                rooms: snapshot.rooms.map((room) => ({ ...room }))
            };
    }

    function isCurrent(expectedGeneration: number, contextKey: string): boolean {
        const calendar = options.calendarSummary.getSnapshot();
        return !stopped
            && generation === expectedGeneration
            && calendar.contextKey === contextKey;
    }
}

function buildRelevantSourceKeys(calendar: LiveCalendarSummarySnapshot): string[] {
    const reviewContext = calendar.reviewContext;
    if (reviewContext === null) {
        return [];
    }
    return Array.from(new Set(calendar.adjustmentEvents.map((event) => (
        buildNextBookingCurveSourceKey({
            facilityId: reviewContext.facilityId,
            roomGroupId: event.roomGroupId,
            scope: "roomGroup",
            stayDate: event.stayDate
        })
    )))).sort();
}

function buildRankSignature(calendar: LiveCalendarSummarySnapshot): string {
    return [
        calendar.contextKey ?? "-",
        calendar.rankStatus,
        calendar.adjustmentEvents.map((event) => event.eventKey).sort().join("\u001f")
    ].join("|");
}

function yieldToMainThread(windowHost: Window): Promise<void> {
    return new Promise((resolve) => windowHost.setTimeout(resolve, 0));
}
