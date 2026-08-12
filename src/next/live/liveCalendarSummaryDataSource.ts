import {
    getDaysBetweenDateKeys,
    toCompactDateKey
} from "../../curveCore";
import type {
    NextBookingCurveAcquisitionCoordinator,
    NextBookingCurveAcquisitionState,
    NextBookingCurveAcquisitionStopReason
} from "../bookingCurve/bookingCurveAcquisitionCoordinator";
import { buildNextBookingCurveSourceKey } from "../bookingCurve/bookingCurveSourceStore";
import {
    buildLiveCalendarGroupEvidence,
    type LiveSimilarityLensCalendarGroupEvidence
} from "./liveSimilarityLensEvidence";
import {
    NextReadHttpError,
    createBrowserNextReadTransport,
    type NextReadTransport
} from "./liveSimilarityLensTransport";
import type { RankLearningCaptureWriter } from "../rankLearning/rankLearningCaptureWriter";

const LIVE_CALENDAR_GROUP_REFRESH_DELAY_MS = 1_000;
const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
});

export interface LiveCalendarLatestChange {
    daysAgo: number;
    stayDate: string;
}

export interface LiveCalendarSummaryContext {
    asOfDate: string;
    facilityId: string;
    visibleStayDates: readonly string[];
}

export interface LiveCalendarSummarySnapshot {
    calendarGroups: readonly LiveSimilarityLensCalendarGroupEvidence[];
    contextKey: string | null;
    latestChanges: readonly LiveCalendarLatestChange[];
    rankStatus: "error" | "idle" | "loading" | "ready";
    rankStatusError: LiveCalendarSummaryRankStatusError | null;
}

export type LiveCalendarSummaryRankStatusError =
    | "aborted"
    | "http-401"
    | "http-403"
    | "http-429"
    | "request-failed"
    | "response-invalid";

export interface LiveCalendarSummaryDataSource {
    clear(): void;
    getSnapshot(): LiveCalendarSummarySnapshot;
    setContext(context: LiveCalendarSummaryContext): void;
    stop(): void;
    subscribe(listener: () => void): () => void;
}

export function createIdleLiveCalendarSummarySnapshot(): LiveCalendarSummarySnapshot {
    return {
        calendarGroups: [],
        contextKey: null,
        latestChanges: [],
        rankStatus: "idle",
        rankStatusError: null
    };
}

export function createLiveCalendarSummaryDataSource(options: {
    acquisition: NextBookingCurveAcquisitionCoordinator;
    documentHost?: Pick<Document, "visibilityState">;
    now?: () => Date;
    rankLearningCaptureWriter?: RankLearningCaptureWriter;
    refreshDelayMs?: number;
    transport?: NextReadTransport;
    windowHost?: Window;
}): LiveCalendarSummaryDataSource {
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const now = options.now ?? (() => new Date());
    const refreshDelayMs = options.refreshDelayMs ?? LIVE_CALENDAR_GROUP_REFRESH_DELAY_MS;
    const listeners = new Set<() => void>();
    let activeContext: NormalizedLiveCalendarSummaryContext | null = null;
    let activeController: AbortController | null = null;
    let coordinatorState: NextBookingCurveAcquisitionState | null = null;
    let generation = 0;
    let groupRefreshTimer: number | null = null;
    let lastGroupRefreshStoredCount = 0;
    let snapshot = createIdleLiveCalendarSummarySnapshot();
    let stopped = false;
    const unsubscribeAcquisition = options.acquisition.subscribe((state) => {
        const previousStatus = coordinatorState?.status ?? null;
        coordinatorState = state;
        if (activeContext === null || stopped) {
            return;
        }
        const planningCompleted = previousStatus === "planning" && state.status !== "planning";
        if (state.storedCount !== lastGroupRefreshStoredCount || planningCompleted) {
            scheduleGroupRefresh(state.status === "complete" || state.status === "stopped" ? 0 : refreshDelayMs);
        }
    });

    return {
        clear,
        getSnapshot: () => copySnapshot(snapshot),
        setContext,
        stop,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        }
    };

    function setContext(context: LiveCalendarSummaryContext): void {
        if (stopped) {
            return;
        }
        const normalized = normalizeContext(context);
        if (normalized === null) {
            clear();
            return;
        }
        if (activeContext?.contextKey === normalized.contextKey) {
            return;
        }
        resetActiveWork();
        const currentGeneration = ++generation;
        const controller = new AbortController();
        activeContext = normalized;
        activeController = controller;
        lastGroupRefreshStoredCount = coordinatorState?.storedCount ?? 0;
        snapshot = {
            calendarGroups: [],
            contextKey: normalized.contextKey,
            latestChanges: [],
            rankStatus: "loading",
            rankStatusError: null
        };
        emit();
        void refreshGroups(currentGeneration, normalized);
        void loadLatestChanges(currentGeneration, normalized, controller.signal);
    }

    function clear(): void {
        if (stopped && snapshot.contextKey === null) {
            return;
        }
        generation += 1;
        resetActiveWork();
        activeContext = null;
        const nextSnapshot = createIdleLiveCalendarSummarySnapshot();
        const changed = snapshot.contextKey !== null
            || snapshot.calendarGroups.length > 0
            || snapshot.latestChanges.length > 0
            || snapshot.rankStatus !== "idle";
        snapshot = nextSnapshot;
        if (changed) {
            emit();
        }
    }

    function stop(): void {
        if (stopped) {
            return;
        }
        clear();
        stopped = true;
        unsubscribeAcquisition();
        listeners.clear();
    }

    function resetActiveWork(): void {
        activeController?.abort();
        activeController = null;
        if (groupRefreshTimer !== null) {
            windowHost.clearTimeout(groupRefreshTimer);
            groupRefreshTimer = null;
        }
    }

    function scheduleGroupRefresh(delayMs: number): void {
        if (groupRefreshTimer !== null || activeContext === null || stopped) {
            return;
        }
        groupRefreshTimer = windowHost.setTimeout(() => {
            groupRefreshTimer = null;
            const context = activeContext;
            if (context !== null) {
                void refreshGroups(generation, context);
            }
        }, Math.max(0, delayMs));
    }

    async function refreshGroups(
        expectedGeneration: number,
        context: NormalizedLiveCalendarSummaryContext
    ): Promise<void> {
        const observedStoredCount = coordinatorState?.storedCount ?? 0;
        const sourceKeys = context.visibleStayDates.map((stayDate) => (
            buildNextBookingCurveSourceKey({
                facilityId: context.facilityId,
                roomGroupId: null,
                scope: "hotel",
                stayDate
            })
        ));
        const records = await options.acquisition.readLatest(sourceKeys).catch(() => []);
        if (
            stopped
            || expectedGeneration !== generation
            || activeContext?.contextKey !== context.contextKey
        ) {
            return;
        }
        lastGroupRefreshStoredCount = observedStoredCount;
        snapshot = {
            ...snapshot,
            calendarGroups: buildLiveCalendarGroupEvidence({
                asOfDate: context.asOfDate,
                bookingRawRecords: records,
                bookingReadStatus: { status: "ready", records },
                facilityId: context.facilityId,
                visibleStayDates: context.visibleStayDates
            })
        };
        emit();
        if ((coordinatorState?.storedCount ?? 0) !== lastGroupRefreshStoredCount) {
            scheduleGroupRefresh(refreshDelayMs);
        }
    }

    async function loadLatestChanges(
        expectedGeneration: number,
        context: NormalizedLiveCalendarSummaryContext,
        signal: AbortSignal
    ): Promise<void> {
        const firstDate = context.visibleStayDates[0];
        const lastDate = context.visibleStayDates.at(-1);
        if (firstDate === undefined || lastDate === undefined) {
            publishRankError(expectedGeneration, context.contextKey, "response-invalid");
            return;
        }
        try {
            const payload = await transport.read({
                from: firstDate,
                kind: "rank-status",
                to: lastDate
            }, signal);
            if (signal.aborted) {
                return;
            }
            const observedAt = now();
            const latestChanges = parseLiveCalendarLatestChanges(
                payload,
                context.visibleStayDates,
                observedAt
            );
            if (latestChanges === null) {
                publishRankError(expectedGeneration, context.contextKey, "response-invalid");
                return;
            }
            if (!isCurrent(expectedGeneration, context.contextKey)) {
                return;
            }
            snapshot = {
                ...snapshot,
                latestChanges,
                rankStatus: "ready",
                rankStatusError: null
            };
            emit();
            if (
                options.rankLearningCaptureWriter !== undefined
                && options.documentHost?.visibilityState === "visible"
            ) {
                try {
                    void options.rankLearningCaptureWriter.capture({
                        asOfDate: context.asOfDate,
                        capturedAt: observedAt.toISOString(),
                        facilityId: context.facilityId,
                        payload,
                        signal,
                        sourceRangeFrom: firstDate,
                        sourceRangeTo: lastDate
                    }).catch(() => undefined);
                } catch {
                    // Learning capture is non-blocking evidence and must not fail the calendar badge.
                }
            }
        } catch (error: unknown) {
            if (signal.aborted || isAbortError(error)) {
                return;
            }
            const errorReason = getRankStatusError(error);
            const stopReason = getImmediateStopReason(error);
            if (stopReason !== null) {
                options.acquisition.suspend(stopReason);
            }
            publishRankError(expectedGeneration, context.contextKey, errorReason);
        }
    }

    function publishRankError(
        expectedGeneration: number,
        contextKey: string,
        reason: LiveCalendarSummaryRankStatusError
    ): void {
        if (!isCurrent(expectedGeneration, contextKey)) {
            return;
        }
        snapshot = {
            ...snapshot,
            latestChanges: [],
            rankStatus: "error",
            rankStatusError: reason
        };
        emit();
    }

    function isCurrent(expectedGeneration: number, contextKey: string): boolean {
        return !stopped
            && expectedGeneration === generation
            && activeContext?.contextKey === contextKey;
    }

    function emit(): void {
        for (const listener of listeners) {
            listener();
        }
    }
}

interface NormalizedLiveCalendarSummaryContext extends LiveCalendarSummaryContext {
    contextKey: string;
    visibleStayDates: readonly string[];
}

export function parseLiveCalendarLatestChanges(
    payload: unknown,
    visibleStayDates: readonly string[],
    now: Date
): LiveCalendarLatestChange[] | null {
    if (!isRecord(payload) || !Array.isArray(payload.suggest_statuses)) {
        return null;
    }
    const normalizedStayDates = new Set(visibleStayDates
        .map(toCompactDateKey)
        .filter((stayDate): stayDate is string => stayDate !== null));
    if (normalizedStayDates.size === 0) {
        return [];
    }
    const today = formatJstDate(now.getTime());
    if (today === null) {
        return null;
    }
    const latestTimestampByStayDate = new Map<string, number>();
    for (const value of payload.suggest_statuses) {
        if (!isRecord(value)) {
            continue;
        }
        const stayDate = toCompactDateKey(typeof value.date === "string" ? value.date : "");
        if (stayDate === null || !normalizedStayDates.has(stayDate)) {
            continue;
        }
        const timestamp = resolveStatusTimestamp(value);
        if (timestamp === null) {
            continue;
        }
        const previous = latestTimestampByStayDate.get(stayDate);
        if (previous === undefined || timestamp > previous) {
            latestTimestampByStayDate.set(stayDate, timestamp);
        }
    }
    const latestChanges: LiveCalendarLatestChange[] = [];
    for (const [stayDate, timestamp] of latestTimestampByStayDate) {
        const reflectedDate = formatJstDate(timestamp);
        const daysAgo = reflectedDate === null
            ? null
            : getDaysBetweenDateKeys(today, reflectedDate);
        if (daysAgo === null) {
            continue;
        }
        latestChanges.push({
            daysAgo: Math.max(0, daysAgo),
            stayDate
        });
    }
    return latestChanges.sort((left, right) => left.stayDate.localeCompare(right.stayDate));
}

function normalizeContext(
    context: LiveCalendarSummaryContext
): NormalizedLiveCalendarSummaryContext | null {
    const facilityId = context.facilityId.trim();
    const asOfDate = toCompactDateKey(context.asOfDate);
    const visibleStayDates = Array.from(new Set(context.visibleStayDates
        .map(toCompactDateKey)
        .filter((stayDate): stayDate is string => stayDate !== null)))
        .sort();
    if (facilityId === "" || asOfDate === null || visibleStayDates.length === 0) {
        return null;
    }
    return {
        asOfDate,
        contextKey: [facilityId, asOfDate, visibleStayDates.join(",")].join("|"),
        facilityId,
        visibleStayDates
    };
}

function resolveStatusTimestamp(value: Record<string, unknown>): number | null {
    for (const key of ["accepted_at", "completed_at", "suggest_calc_datetime"] as const) {
        const candidate = value[key];
        if (candidate === null || candidate === undefined || candidate === "") {
            continue;
        }
        if (typeof candidate !== "string") {
            return null;
        }
        const timestamp = Date.parse(candidate);
        return Number.isFinite(timestamp) ? timestamp : null;
    }
    return null;
}

function formatJstDate(timestamp: number): string | null {
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    const parts = JST_DATE_FORMATTER.formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year === undefined || month === undefined || day === undefined) {
        return null;
    }
    return `${year}${month}${day}`;
}

function getRankStatusError(error: unknown): LiveCalendarSummaryRankStatusError {
    if (error instanceof NextReadHttpError) {
        if (error.status === 401 || error.status === 403 || error.status === 429) {
            return `http-${error.status}`;
        }
    }
    return "request-failed";
}

function getImmediateStopReason(error: unknown): NextBookingCurveAcquisitionStopReason | null {
    if (!(error instanceof NextReadHttpError)) {
        return null;
    }
    if (error.status === 401 || error.status === 403 || error.status === 429) {
        return `http-${error.status}`;
    }
    return null;
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object"
        && error !== null
        && "name" in error
        && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copySnapshot(snapshot: LiveCalendarSummarySnapshot): LiveCalendarSummarySnapshot {
    return {
        ...snapshot,
        calendarGroups: [...snapshot.calendarGroups],
        latestChanges: [...snapshot.latestChanges]
    };
}
