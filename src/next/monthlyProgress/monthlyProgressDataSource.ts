import { readLiveFacilityContextHints, hasLiveFacilityContextLabel } from "../live/liveCalendarDomAdapter";
import {
    NextReadHttpError,
    createBrowserNextReadTransport,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import { parseNextFacilityContext, type NextFacilityContext } from "../facilityContext";
import {
    buildNextMonthlyProgressTargetYearMonths,
    compactNextMonthlyProgressResponse,
    normalizeNextMonthlyProgressYearMonth,
    type NextMonthlyProgressAcquisitionProgress,
    type NextMonthlyProgressCompareYearsAgo,
    type NextMonthlyProgressDataSnapshot,
    type NextMonthlyProgressSnapshotRecord
} from "./monthlyProgressModel";
import {
    buildNextMonthlyProgressRecordKey,
    createBrowserNextMonthlyProgressStore,
    createNextMonthlyProgressSnapshotRecord,
    type NextMonthlyProgressStore
} from "./monthlyProgressStore";
import {
    createNextMonthlyProgressLegacySeedReader,
    type NextMonthlyProgressLegacySeedReader
} from "./monthlyProgressLegacySeedReader";

const MONTHLY_PROGRESS_MINIMUM_START_INTERVAL_MS = 100;
const MONTHLY_PROGRESS_SESSION_REQUEST_LIMIT = 15;

export type NextMonthlyProgressDataLoadResult =
    | { status: "ready"; snapshot: NextMonthlyProgressDataSnapshot }
    | {
        status: "error";
        reason:
            | "aborted"
            | "batch-date-invalid"
            | "facility-context-mismatch"
            | "facility-response-invalid"
            | "request-failed"
            | "stopped"
            | "year-month-invalid";
    };

export interface NextMonthlyProgressDataSource {
    cancel(): void;
    load(
        routeYearMonth: string,
        batchDateKey: string,
        compareYearsAgo: NextMonthlyProgressCompareYearsAgo
    ): Promise<NextMonthlyProgressDataLoadResult>;
    reset(): void;
    stop(): void;
    subscribe(listener: () => void): () => void;
    snapshot(): NextMonthlyProgressDataSnapshot | null;
}

export interface CreateNextMonthlyProgressDataSourceOptions {
    documentHost?: Document;
    legacySeedReader?: NextMonthlyProgressLegacySeedReader;
    now?: () => number;
    readFacilityContextHints?: () => readonly string[];
    schedule?: (task: () => void) => void;
    store?: NextMonthlyProgressStore;
    transport?: NextReadTransport;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    windowHost?: Window;
}

export function createNextMonthlyProgressDataSource(
    options: CreateNextMonthlyProgressDataSourceOptions = {}
): NextMonthlyProgressDataSource {
    const windowHost = options.windowHost ?? window;
    const documentHost = options.documentHost ?? document;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const store = options.store ?? createBrowserNextMonthlyProgressStore(windowHost);
    const legacySeedReader = options.legacySeedReader
        ?? createNextMonthlyProgressLegacySeedReader();
    const now = options.now ?? (() => Date.now());
    const readFacilityContextHints = options.readFacilityContextHints
        ?? (() => readLiveFacilityContextHints(documentHost));
    const schedule = options.schedule ?? ((task: () => void) => {
        windowHost.setTimeout(task, 0);
    });
    const wait = options.wait ?? waitForDelay;
    const listeners = new Set<() => void>();
    const recordsByYearMonth = new Map<string, NextMonthlyProgressSnapshotRecord>();
    const attemptedYearMonths = new Set<string>();
    const failedYearMonthReasons = new Map<string, string>();
    let activeContextKey: string | null = null;
    let activeCompareYearsAgo: NextMonthlyProgressCompareYearsAgo = 1;
    let activeRouteYearMonth: string | null = null;
    let activeBatchDateKey: string | null = null;
    let facility: NextFacilityContext | null = null;
    let facilityRequestCount = 0;
    let monthlyRequestCount = 0;
    let lastMonthlyRequestStartedAt = 0;
    let progress = createIdleProgress();
    let activeController: AbortController | null = null;
    let loadGeneration = 0;
    let stopped = false;

    const cancel = (): void => {
        loadGeneration += 1;
        activeController?.abort();
        activeController = null;
    };

    const reset = (): void => {
        cancel();
        activeContextKey = null;
        activeRouteYearMonth = null;
        activeBatchDateKey = null;
        facility = null;
        facilityRequestCount = 0;
        monthlyRequestCount = 0;
        lastMonthlyRequestStartedAt = 0;
        recordsByYearMonth.clear();
        attemptedYearMonths.clear();
        failedYearMonthReasons.clear();
        progress = createIdleProgress();
    };

    return {
        cancel,
        async load(routeYearMonth, batchDateKey, compareYearsAgo) {
            if (stopped) {
                return { status: "error", reason: "stopped" };
            }
            const normalizedRouteYearMonth = normalizeNextMonthlyProgressYearMonth(routeYearMonth);
            if (normalizedRouteYearMonth === null) {
                return { status: "error", reason: "year-month-invalid" };
            }
            if (!isValidBatchDateKey(batchDateKey)) {
                return { status: "error", reason: "batch-date-invalid" };
            }
            const contextKey = `${normalizedRouteYearMonth}|${batchDateKey}`;
            if (activeContextKey !== contextKey) {
                reset();
                activeContextKey = contextKey;
                activeRouteYearMonth = normalizedRouteYearMonth;
                activeBatchDateKey = batchDateKey;
            } else {
                cancel();
            }
            activeCompareYearsAgo = compareYearsAgo;
            const generation = ++loadGeneration;
            const controller = new AbortController();
            activeController = controller;

            try {
                if (facility === null) {
                    if (facilityRequestCount >= 1) {
                        return { status: "error", reason: "request-failed" };
                    }
                    facilityRequestCount += 1;
                    const payload = await transport.read({ kind: "facility" }, controller.signal);
                    if (!isCurrent(generation, controller.signal)) {
                        return { status: "error", reason: "aborted" };
                    }
                    const resolvedFacility = parseNextFacilityContext(payload);
                    if (resolvedFacility === null) {
                        return { status: "error", reason: "facility-response-invalid" };
                    }
                    const facilityHints = readFacilityContextHints();
                    if (!hasLiveFacilityContextLabel(facilityHints, resolvedFacility.facilityLabel)) {
                        return { status: "error", reason: "facility-context-mismatch" };
                    }
                    facility = resolvedFacility;
                }

                const targetYearMonths = buildNextMonthlyProgressTargetYearMonths(
                    normalizedRouteYearMonth,
                    compareYearsAgo
                );
                await loadStoredRecords(facility.facilityId, batchDateKey, targetYearMonths);
                if (!isCurrent(generation, controller.signal)) {
                    return { status: "error", reason: "aborted" };
                }

                const unresolvedYearMonths = targetYearMonths.filter(
                    (yearMonth) => !recordsByYearMonth.has(yearMonth)
                );
                const missingYearMonths = unresolvedYearMonths.filter(
                    (yearMonth) => !attemptedYearMonths.has(yearMonth)
                );
                const priorFailureCount = unresolvedYearMonths.filter(
                    (yearMonth) => failedYearMonthReasons.has(yearMonth)
                ).length;
                progress = createProgress({
                    phase: missingYearMonths.includes(normalizedRouteYearMonth)
                        ? "loading-current"
                        : missingYearMonths.length > 0 ? "background" : "complete",
                    failedCount: priorFailureCount,
                    processedCount: unresolvedYearMonths.length - missingYearMonths.length,
                    targetYearMonths: unresolvedYearMonths
                });
                progress.networkRequestCount = monthlyRequestCount;
                notify();

                let consecutiveErrors = 0;
                if (missingYearMonths.includes(normalizedRouteYearMonth)) {
                    progress.currentYearMonth = normalizedRouteYearMonth;
                    notify();
                    const currentResult = await acquireYearMonth(
                        facility.facilityId,
                        normalizedRouteYearMonth,
                        batchDateKey,
                        controller.signal
                    );
                    progress.processedCount += 1;
                    progress.currentYearMonth = null;
                    if (currentResult !== null) {
                        progress.failedCount += 1;
                        consecutiveErrors = 1;
                        if (shouldStopImmediately(currentResult)) {
                            progress.phase = "stopped";
                            progress.stopReason = currentResult;
                            notify();
                            return { status: "ready", snapshot: requireSnapshot() };
                        }
                    }
                    notify();
                }

                const backgroundYearMonths = missingYearMonths.filter(
                    (yearMonth) => yearMonth !== normalizedRouteYearMonth
                );
                if (backgroundYearMonths.length === 0) {
                    progress.phase = "complete";
                    progress.currentYearMonth = null;
                    notify();
                } else {
                    progress.phase = "background";
                    notify();
                    const facilityId = facility.facilityId;
                    schedule(() => {
                        if (!isCurrent(generation, controller.signal)) {
                            return;
                        }
                        void runBackgroundQueue({
                            batchDateKey,
                            controller,
                            facilityId,
                            generation,
                            initialConsecutiveErrors: consecutiveErrors,
                            yearMonths: backgroundYearMonths
                        });
                    });
                }
                return { status: "ready", snapshot: requireSnapshot() };
            } catch (error: unknown) {
                if (!isCurrent(generation, controller.signal)) {
                    return { status: "error", reason: "aborted" };
                }
                progress.phase = "stopped";
                progress.stopReason = toStopReason(error);
                notify();
                return { status: "error", reason: "request-failed" };
            }
        },
        reset,
        snapshot: currentSnapshot,
        stop() {
            stopped = true;
            reset();
            listeners.clear();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };

    async function loadStoredRecords(
        facilityId: string,
        batchDateKey: string,
        targetYearMonths: readonly string[]
    ): Promise<void> {
        const recordKeys = targetYearMonths.map((yearMonth) => (
            buildNextMonthlyProgressRecordKey({ facilityId, yearMonth, batchDateKey })
        ));
        const [nextRecords, classicResult] = await Promise.all([
            store.readByRecordKeys(recordKeys).catch(() => []),
            legacySeedReader.readExact({
                facilityId,
                yearMonths: targetYearMonths,
                batchDateKey
            }).catch(() => ({ status: "error" as const, reason: "read-failed" as const }))
        ]);
        for (const record of nextRecords) {
            recordsByYearMonth.set(record.yearMonth, record);
        }
        if (classicResult.status === "ready") {
            for (const record of classicResult.records) {
                if (!recordsByYearMonth.has(record.yearMonth)) {
                    recordsByYearMonth.set(record.yearMonth, record);
                }
            }
        }
    }

    async function runBackgroundQueue(options: {
        batchDateKey: string;
        controller: AbortController;
        facilityId: string;
        generation: number;
        initialConsecutiveErrors: number;
        yearMonths: readonly string[];
    }): Promise<void> {
        let consecutiveErrors = options.initialConsecutiveErrors;
        for (const yearMonth of options.yearMonths) {
            if (!isCurrent(options.generation, options.controller.signal)) {
                return;
            }
            progress.currentYearMonth = yearMonth;
            notify();
            const failureReason = await acquireYearMonth(
                options.facilityId,
                yearMonth,
                options.batchDateKey,
                options.controller.signal
            );
            if (!isCurrent(options.generation, options.controller.signal)) {
                return;
            }
            progress.processedCount += 1;
            if (failureReason === null) {
                consecutiveErrors = 0;
            } else {
                consecutiveErrors += 1;
                progress.failedCount += 1;
                if (shouldStopImmediately(failureReason) || consecutiveErrors >= 3) {
                    progress.phase = "stopped";
                    progress.stopReason = failureReason;
                    progress.currentYearMonth = null;
                    notify();
                    return;
                }
            }
            notify();
        }
        progress.phase = "complete";
        progress.currentYearMonth = null;
        notify();
    }

    async function acquireYearMonth(
        facilityId: string,
        yearMonth: string,
        batchDateKey: string,
        signal: AbortSignal
    ): Promise<string | null> {
        if (attemptedYearMonths.has(yearMonth)) {
            return recordsByYearMonth.has(yearMonth)
                ? null
                : failedYearMonthReasons.get(yearMonth) ?? "already-attempted";
        }
        const elapsed = now() - lastMonthlyRequestStartedAt;
        if (lastMonthlyRequestStartedAt > 0 && elapsed < MONTHLY_PROGRESS_MINIMUM_START_INTERVAL_MS) {
            await wait(MONTHLY_PROGRESS_MINIMUM_START_INTERVAL_MS - elapsed, signal);
        }
        if (signal.aborted) {
            return "aborted";
        }
        if (attemptedYearMonths.size >= MONTHLY_PROGRESS_SESSION_REQUEST_LIMIT) {
            return "request-budget-exceeded";
        }
        attemptedYearMonths.add(yearMonth);
        lastMonthlyRequestStartedAt = now();
        monthlyRequestCount += 1;
        progress.networkRequestCount = monthlyRequestCount;
        try {
            const payload = await transport.read({
                kind: "monthly-booking-curve",
                yearMonth
            }, signal);
            if (signal.aborted) {
                return "aborted";
            }
            const compactPayload = compactNextMonthlyProgressResponse(payload, yearMonth);
            if (compactPayload === null) {
                return rememberFailure(yearMonth, "response-invalid");
            }
            const record = createNextMonthlyProgressSnapshotRecord({
                facilityId,
                yearMonth,
                batchDateKey,
                fetchedAt: new Date(now()).toISOString(),
                payload: compactPayload
            });
            let resolvedRecord = record;
            try {
                const addedCount = await store.add([record]);
                if (addedCount === 0) {
                    const storedRecords = await store.readByRecordKeys([record.recordKey]);
                    const storedRecord = storedRecords[0];
                    if (storedRecord === undefined) {
                        return rememberFailure(yearMonth, "store-write-conflict");
                    }
                    resolvedRecord = storedRecord;
                }
            } catch {
                return rememberFailure(yearMonth, "store-write-failed");
            }
            if (signal.aborted) {
                return "aborted";
            }
            recordsByYearMonth.set(yearMonth, resolvedRecord);
            failedYearMonthReasons.delete(yearMonth);
            updateSourceCounts();
            return null;
        } catch (error: unknown) {
            const reason = toStopReason(error);
            return reason === "aborted" ? reason : rememberFailure(yearMonth, reason);
        }
    }

    function rememberFailure(yearMonth: string, reason: string): string {
        failedYearMonthReasons.set(yearMonth, reason);
        return reason;
    }

    function isCurrent(generation: number, signal: AbortSignal): boolean {
        return !stopped && !signal.aborted && generation === loadGeneration;
    }

    function currentSnapshot(): NextMonthlyProgressDataSnapshot | null {
        if (
            facility === null
            || activeRouteYearMonth === null
            || activeBatchDateKey === null
        ) {
            return null;
        }
        return {
            facilityId: facility.facilityId,
            facilityLabel: facility.facilityLabel,
            routeYearMonth: activeRouteYearMonth,
            batchDateKey: activeBatchDateKey,
            compareYearsAgo: activeCompareYearsAgo,
            records: Array.from(recordsByYearMonth.values()),
            progress: cloneProgress(progress)
        };
    }

    function requireSnapshot(): NextMonthlyProgressDataSnapshot {
        const snapshot = currentSnapshot();
        if (snapshot === null) {
            throw new Error("Next monthly progress snapshot unavailable");
        }
        return snapshot;
    }

    function notify(): void {
        updateSourceCounts();
        for (const listener of listeners) {
            listener();
        }
    }

    function updateSourceCounts(): void {
        progress.nextRecordCount = Array.from(recordsByYearMonth.values()).filter(
            (record) => record.source === "next-bounded-monthly-progress"
        ).length;
        progress.classicSeedCount = Array.from(recordsByYearMonth.values()).filter(
            (record) => record.source === "classic-readonly-seed"
        ).length;
    }
}

function createIdleProgress(): NextMonthlyProgressAcquisitionProgress {
    return {
        phase: "idle",
        targetYearMonths: [],
        processedCount: 0,
        failedCount: 0,
        currentYearMonth: null,
        networkRequestCount: 0,
        nextRecordCount: 0,
        classicSeedCount: 0,
        stopReason: null
    };
}

function createProgress(options: {
    failedCount?: number;
    phase: NextMonthlyProgressAcquisitionProgress["phase"];
    processedCount?: number;
    targetYearMonths: string[];
}): NextMonthlyProgressAcquisitionProgress {
    return {
        ...createIdleProgress(),
        failedCount: options.failedCount ?? 0,
        phase: options.phase,
        processedCount: options.processedCount ?? 0,
        targetYearMonths: options.targetYearMonths.slice()
    };
}

function isValidBatchDateKey(value: string): boolean {
    if (!/^\d{8}$/u.test(value)) {
        return false;
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

function shouldStopImmediately(reason: string): boolean {
    return reason === "aborted"
        || reason === "http-401"
        || reason === "http-403"
        || reason === "http-429"
        || reason === "request-budget-exceeded"
        || reason === "store-write-conflict"
        || reason === "store-write-failed";
}

function cloneProgress(
    progress: NextMonthlyProgressAcquisitionProgress
): NextMonthlyProgressAcquisitionProgress {
    return {
        ...progress,
        targetYearMonths: progress.targetYearMonths.slice()
    };
}

function toStopReason(error: unknown): string {
    if (error instanceof NextReadHttpError) {
        return `http-${error.status}`;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
        return "aborted";
    }
    return "request-failed";
}

function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
        }
        const timeout = window.setTimeout(resolve, milliseconds);
        signal.addEventListener("abort", () => {
            window.clearTimeout(timeout);
            reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
    });
}
