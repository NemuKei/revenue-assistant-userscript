import {
    NextReadHttpError,
    createBrowserNextReadTransport,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    NEXT_BOOKING_CURVE_BOOTSTRAP_REQUEST_LIMIT,
    NEXT_BOOKING_CURVE_CONCURRENCY,
    NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT,
    NEXT_BOOKING_CURVE_REQUEST_INTERVAL_MS,
    buildNextBookingCurveBackgroundTasks,
    buildNextBookingCurveCurrentTasks,
    buildNextBookingCurveReferenceTasks,
    compactNextBookingCurveResponse,
    createNextBookingCurveSourceRecord,
    selectNextBookingCurveDueTasks,
    type NextBookingCurveAcquisitionContext,
    type NextBookingCurveAcquisitionTask
} from "./bookingCurveAcquisitionModel";
import {
    createBrowserNextBookingCurveSourceStore,
    isNextBookingCurveSourceRecord,
    type NextBookingCurveSourceRecord,
    type NextBookingCurveSourceStore
} from "./bookingCurveSourceStore";
import {
    createNextBookingCurveLegacySeedReader,
    type NextBookingCurveLegacySeedReader
} from "./bookingCurveLegacySeedReader";
import type {
    NextPerformanceRecorder,
    NextPerformanceStopClassification
} from "../performance/nextPerformanceRecorder";

const NEXT_BOOKING_CURVE_BOOTSTRAP_COVERAGE_THRESHOLD = 0.8;
const NEXT_BOOKING_CURVE_CONSECUTIVE_ERROR_LIMIT = 3;

export type NextBookingCurveAcquisitionMode = "bootstrap" | "daily-delta";

export type NextBookingCurveCurrentPriority = "critical-current" | "visible-current";
export type NextBookingCurveReferencePriority = "selected-reference" | "visible-reference";
type NextBookingCurveTaskPriority =
    | NextBookingCurveCurrentPriority
    | NextBookingCurveReferencePriority
    | "background";
type NextBookingCurveTaskActivity = "background" | "interactive";
const NEXT_BOOKING_CURVE_PRIORITY_ORDER: Readonly<Record<NextBookingCurveTaskPriority, number>> = {
    "critical-current": 0,
    "visible-current": 1,
    "selected-reference": 2,
    "visible-reference": 3,
    background: 4
};

export type NextBookingCurveAcquisitionStopReason =
    | "aborted"
    | "budget-reached"
    | "consecutive-errors"
    | "document-hidden"
    | "facility-context-changed"
    | "http-401"
    | "http-403"
    | "http-429"
    | "inactive-route"
    | "stopped";

export interface NextBookingCurveAcquisitionState {
    errorCount: number;
    mode: NextBookingCurveAcquisitionMode | null;
    processedCount: number;
    requestCount: number;
    skippedCount: number;
    status: "idle" | "planning" | "running" | "complete" | "stopped";
    stopReason: NextBookingCurveAcquisitionStopReason | null;
    storedCount: number;
    totalCount: number;
}

export interface NextBookingCurveAcquisitionCoordinator {
    ensureCurrent(options: {
        context: NextBookingCurveAcquisitionContext;
        priority?: NextBookingCurveCurrentPriority;
        scopeKeys?: readonly string[];
        signal: AbortSignal;
        stayDate: string;
    }): Promise<NextBookingCurveAcquisitionDiagnostics>;
    readLatest(sourceKeys: readonly string[]): Promise<NextBookingCurveSourceRecord[]>;
    startBackground(context: NextBookingCurveAcquisitionContext): Promise<void>;
    startReference(options: {
        context: NextBookingCurveAcquisitionContext;
        priority?: NextBookingCurveReferencePriority;
        scopeKey: string;
        targetStayDate: string;
    }): Promise<NextBookingCurveAcquisitionDiagnostics>;
    subscribe(listener: (state: NextBookingCurveAcquisitionState) => void): () => void;
    suspend(reason: NextBookingCurveAcquisitionStopReason): void;
    stop(): void;
}

export interface NextBookingCurveAcquisitionDiagnostics {
    candidateTaskCount: number;
    dueTaskCount: number;
    outcome: "aborted" | "ready";
}

interface QueuedTask {
    activity: NextBookingCurveTaskActivity;
    backgroundPerformanceGeneration: number | null;
    completion: Promise<void>;
    interactivePerformanceGeneration: number | null;
    priority: NextBookingCurveTaskPriority;
    performanceGeneration: number | null;
    reject: (reason?: unknown) => void;
    resolve: () => void;
    task: NextBookingCurveAcquisitionTask;
    taskKey: string;
}

export interface CreateNextBookingCurveAcquisitionCoordinatorOptions {
    backgroundRequestLimits?: Partial<Record<NextBookingCurveAcquisitionMode, number>>;
    legacySeedReader?: NextBookingCurveLegacySeedReader;
    now?: () => Date;
    performanceRecorder?: NextPerformanceRecorder;
    store?: NextBookingCurveSourceStore;
    transport?: NextReadTransport;
    windowHost?: Window;
}

export function createNextBookingCurveAcquisitionCoordinator(
    options: CreateNextBookingCurveAcquisitionCoordinatorOptions = {}
): NextBookingCurveAcquisitionCoordinator {
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const store = options.store ?? createBrowserNextBookingCurveSourceStore(windowHost);
    const legacySeedReader = options.legacySeedReader
        ?? createNextBookingCurveLegacySeedReader();
    const now = options.now ?? (() => new Date());
    const listeners = new Set<(state: NextBookingCurveAcquisitionState) => void>();
    const legacySeedBySourceKey = new Map<string, NextBookingCurveSourceRecord>();
    const pendingByTaskKey = new Map<string, QueuedTask>();
    const pendingBackgroundCountByPerformanceGeneration = new Map<number, number>();
    const invalidBackgroundSettlementGenerations = new Set<number>();
    const queue: QueuedTask[] = [];
    let state: NextBookingCurveAcquisitionState = createInitialState();
    let activeController = new AbortController();
    let activeRequestCount = 0;
    let currentContextKey: string | null = null;
    let currentFacilityId: string | null = null;
    let backgroundRequestCount = 0;
    let drainTimer: number | null = null;
    let lastRequestStartedAt = 0;
    let stopped = false;
    let planningGeneration = 0;
    let backgroundRequestLimit = NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT;
    let consecutiveErrorCount = 0;

    return {
        async ensureCurrent({ context, priority = "critical-current", scopeKeys, signal, stayDate }) {
            if (stopped || signal.aborted) {
                return createAcquisitionDiagnostics(0, 0, "aborted");
            }
            await ensureContext(context);
            const tasks = buildNextBookingCurveCurrentTasks({
                context,
                ...(scopeKeys === undefined ? {} : { scopeKeys }),
                stayDate
            });
            const existing = await readExistingForTasks({ context, tasks });
            const dueTasks = selectNextBookingCurveDueTasks({
                asOfDate: context.asOfDate,
                existingRecords: existing,
                limit: tasks.length,
                tasks
            });
            const pending = dueTasks
                .map((task) => enqueueTask(task, priority, "interactive"));
            await Promise.all(pending.map((promise) => raceWithAbort(promise, signal)
                .catch(() => undefined)));
            return createAcquisitionDiagnostics(
                tasks.length,
                dueTasks.length,
                signal.aborted ? "aborted" : "ready"
            );
        },
        async readLatest(sourceKeys) {
            const nextRecords = await safeReadLatest(sourceKeys);
            const nextSourceKeys = new Set(nextRecords.map((record) => record.sourceKey));
            return [
                ...nextRecords,
                ...Array.from(new Set(sourceKeys)).flatMap((sourceKey) => {
                    if (nextSourceKeys.has(sourceKey)) {
                        return [];
                    }
                    const legacySeed = legacySeedBySourceKey.get(sourceKey);
                    return legacySeed === undefined ? [] : [legacySeed];
                })
            ];
        },
        async startBackground(context) {
            if (stopped) {
                return;
            }
            const performanceGeneration = getPerformanceGeneration();
            await ensureContext(context);
            const generation = ++planningGeneration;
            state = {
                ...state,
                status: "planning",
                stopReason: null
            };
            emit();
            const tasks = buildNextBookingCurveBackgroundTasks(context);
            const existing = await readExistingForTasks({ context, tasks });
            if (stopped || generation !== planningGeneration || !matchesContext(context)) {
                return;
            }
            const existingSourceCount = new Set(existing.map((record) => record.sourceKey)).size;
            const coverage = tasks.length === 0 ? 1 : existingSourceCount / tasks.length;
            const mode: NextBookingCurveAcquisitionMode =
                coverage < NEXT_BOOKING_CURVE_BOOTSTRAP_COVERAGE_THRESHOLD
                    ? "bootstrap"
                    : "daily-delta";
            backgroundRequestLimit = normalizeRequestLimit(
                options.backgroundRequestLimits?.[mode],
                mode === "bootstrap"
                    ? NEXT_BOOKING_CURVE_BOOTSTRAP_REQUEST_LIMIT
                    : NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT
            );
            const queuedBackgroundCount = queue.filter(
                (queued) => queued.activity === "background"
            ).length;
            const backgroundLimit = Math.max(
                0,
                backgroundRequestLimit - backgroundRequestCount - queuedBackgroundCount
            );
            const dueTasks = selectNextBookingCurveDueTasks({
                asOfDate: context.asOfDate,
                existingRecords: existing,
                limit: backgroundLimit,
                tasks
            });
            state = {
                ...state,
                mode,
                status: dueTasks.length === 0 && activeRequestCount === 0 && queue.length === 0
                    ? "complete"
                    : "running",
                stopReason: null,
                totalCount: state.processedCount + queue.length + activeRequestCount + dueTasks.length
            };
            for (const task of dueTasks) {
                void enqueueTask(
                    task,
                    task.role === "current" ? "visible-current" : "background",
                    "background",
                    performanceGeneration
                ).catch(() => undefined);
            }
            if (
                dueTasks.length === 0
                && (
                    performanceGeneration === null
                    || (
                        !pendingBackgroundCountByPerformanceGeneration.has(performanceGeneration)
                        && !invalidBackgroundSettlementGenerations.has(performanceGeneration)
                    )
                )
            ) {
                recordForGeneration(performanceGeneration, { event: "background-settled" });
            }
            emit();
            drain();
        },
        async startReference({
            context,
            priority = "selected-reference",
            scopeKey,
            targetStayDate
        }) {
            if (stopped) {
                return createAcquisitionDiagnostics(0, 0, "aborted");
            }
            await ensureContext(context);
            const tasks = buildNextBookingCurveReferenceTasks({
                context,
                scopeKey,
                targetStayDate
            });
            const existing = await readExistingForTasks({ context, tasks });
            const dueTasks = selectNextBookingCurveDueTasks({
                asOfDate: context.asOfDate,
                existingRecords: existing,
                limit: tasks.length,
                tasks
            });
            for (const task of dueTasks) {
                void enqueueTask(task, priority, "interactive").catch(() => undefined);
            }
            if (dueTasks.length > 0) {
                state = {
                    ...state,
                    status: "running",
                    stopReason: null,
                    totalCount: state.processedCount + queue.length + activeRequestCount
                };
                emit();
                drain();
            }
            return createAcquisitionDiagnostics(tasks.length, dueTasks.length, "ready");
        },
        subscribe(listener) {
            listeners.add(listener);
            listener(state);
            return () => {
                listeners.delete(listener);
            };
        },
        suspend(reason) {
            suspendRun(reason);
        },
        stop() {
            stopped = true;
            suspendRun("stopped");
            legacySeedBySourceKey.clear();
            listeners.clear();
        }
    };

    async function ensureContext(context: NextBookingCurveAcquisitionContext): Promise<void> {
        const contextKey = buildContextKey(context);
        if (currentContextKey === contextKey) {
            return;
        }
        const facilityChanged = currentFacilityId !== null
            && currentFacilityId !== context.facilityId;
        planningGeneration += 1;
        abortPending("facility-context-changed");
        activeController = new AbortController();
        currentContextKey = contextKey;
        currentFacilityId = context.facilityId;
        legacySeedBySourceKey.clear();
        if (facilityChanged) {
            state = createInitialState();
            backgroundRequestCount = 0;
        } else {
            state = {
                ...createInitialState(),
                requestCount: state.requestCount
            };
        }
        emit();
    }

    function matchesContext(context: NextBookingCurveAcquisitionContext): boolean {
        return currentContextKey === buildContextKey(context);
    }

    function enqueueTask(
        task: NextBookingCurveAcquisitionTask,
        priority: QueuedTask["priority"],
        activity: NextBookingCurveTaskActivity,
        performanceGenerationOverride?: number | null
    ): Promise<void> {
        const taskKey = `${task.sourceKey}|asOf:${currentContextKey?.split("|")[1] ?? ""}`;
        const pending = pendingByTaskKey.get(taskKey);
        if (pending !== undefined) {
            if (queue.includes(pending)) {
                const priorityRaised = isHigherPriority(priority, pending.priority);
                if (priorityRaised) {
                    pending.priority = priority;
                }
                if (
                    activity === "interactive"
                    && (pending.activity === "background" || priorityRaised)
                ) {
                    pending.activity = "interactive";
                    pending.interactivePerformanceGeneration = getPerformanceGeneration();
                    recordInteractiveQueued(pending.interactivePerformanceGeneration, 1);
                }
            }
            return pending.completion;
        }
        let resolveTask = (): void => undefined;
        let rejectTask: (reason?: unknown) => void = () => undefined;
        const completion = new Promise<void>((resolve, reject) => {
            resolveTask = resolve;
            rejectTask = reject;
        });
        const performanceGeneration = performanceGenerationOverride === undefined
            ? getPerformanceGeneration()
            : performanceGenerationOverride;
        const queued: QueuedTask = {
            activity,
            backgroundPerformanceGeneration: activity === "background"
                ? performanceGeneration
                : null,
            completion,
            interactivePerformanceGeneration: activity === "interactive"
                ? performanceGeneration
                : null,
            performanceGeneration,
            priority,
            reject: rejectTask,
            resolve: resolveTask,
            task,
            taskKey
        };
        pendingByTaskKey.set(taskKey, queued);
        queue.push(queued);
        registerBackgroundTask(queued.backgroundPerformanceGeneration);
        recordForGeneration(queued.performanceGeneration, { count: 1, event: "planned" });
        if (activity === "interactive") {
            recordInteractiveQueued(queued.performanceGeneration, 1);
        }
        state = {
            ...state,
            status: "running",
            stopReason: null,
            totalCount: Math.max(
                state.totalCount,
                state.processedCount + queue.length + activeRequestCount
            )
        };
        drain();
        return completion;
    }

    function drain(): void {
        if (
            stopped
            || state.status === "stopped"
            || drainTimer !== null
            || activeRequestCount >= NEXT_BOOKING_CURVE_CONCURRENCY
            || queue.length === 0
        ) {
            maybeComplete();
            return;
        }
        const delay = Math.max(
            0,
            NEXT_BOOKING_CURVE_REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt)
        );
        if (lastRequestStartedAt > 0 && delay > 0) {
            drainTimer = windowHost.setTimeout(() => {
                drainTimer = null;
                drain();
            }, delay);
            return;
        }
        const next = takeNextTask();
        if (next === null) {
            maybeComplete();
            return;
        }
        activeRequestCount += 1;
        lastRequestStartedAt = Date.now();
        if (next.activity === "background") {
            backgroundRequestCount += 1;
        }
        state = {
            ...state,
            requestCount: state.requestCount + 1,
            status: "running"
        };
        recordRequestStarted(next, activeRequestCount);
        emit();
        void runTask(next).finally(() => {
            activeRequestCount -= 1;
            settleBackgroundTask(next.backgroundPerformanceGeneration);
            pendingByTaskKey.delete(next.taskKey);
            drain();
        });
        drain();
    }

    function takeNextTask(): QueuedTask | null {
        const interactivePending = queue.some((queued) => queued.activity === "interactive");
        let selectedIndex = -1;
        for (let index = 0; index < queue.length; index += 1) {
            const candidate = queue[index];
            if (
                candidate === undefined
                || (interactivePending && candidate.activity !== "interactive")
            ) {
                continue;
            }
            const selected = selectedIndex < 0 ? undefined : queue[selectedIndex];
            if (
                selected === undefined
                || isHigherPriority(candidate.priority, selected.priority)
            ) {
                selectedIndex = index;
            }
        }
        if (selectedIndex < 0) {
            return null;
        }
        const selected = queue.splice(selectedIndex, 1)[0] ?? null;
        return selected;
    }

    async function runTask(queued: QueuedTask): Promise<void> {
        const signal = activeController.signal;
        try {
            const payload = await transport.read({
                kind: "booking-curve",
                roomGroupId: queued.task.roomGroupId,
                stayDate: queued.task.stayDate
            }, signal);
            const response = compactNextBookingCurveResponse(payload, queued.task.stayDate);
            if (response === null) {
                throw new Error("booking-curve-response-invalid");
            }
            const asOfDate = currentContextKey?.split("|")[1] ?? "";
            const facilityId = currentFacilityId ?? "";
            if (asOfDate === "" || facilityId === "" || signal.aborted) {
                throw new DOMException("aborted", "AbortError");
            }
            const result = await withFacilityLock(facilityId, signal, async () => {
                const previousRecord = (await readNextOrCachedLegacySeed(
                    queued.task.sourceKey
                ))[0];
                const record = createNextBookingCurveSourceRecord({
                    asOfDate,
                    facilityId,
                    fetchedAt: now().toISOString(),
                    ...(previousRecord === undefined ? {} : { previousRecord }),
                    response,
                    task: queued.task
                });
                return store.addAndPrune([record]);
            });
            state = {
                ...state,
                errorCount: state.errorCount,
                processedCount: state.processedCount + 1,
                skippedCount: state.skippedCount + (result.addedCount === 0 ? 1 : 0),
                storedCount: state.storedCount + result.addedCount
            };
            consecutiveErrorCount = 0;
            queued.resolve();
            emit();
        } catch (error: unknown) {
            if (signal.aborted || isAbortError(error)) {
                invalidateBackgroundSettlement(queued.backgroundPerformanceGeneration);
                recordForGeneration(getTaskActivityPerformanceGeneration(queued), {
                    count: 1,
                    event: "aborted"
                });
                queued.reject(error);
                return;
            }
            invalidateBackgroundSettlement(queued.backgroundPerformanceGeneration);
            state = {
                ...state,
                errorCount: state.errorCount + 1,
                processedCount: state.processedCount + 1
            };
            consecutiveErrorCount += 1;
            recordForGeneration(getTaskActivityPerformanceGeneration(queued), {
                event: "error",
                httpClassification: getPerformanceHttpClassification(error)
            });
            queued.reject(error);
            emit();
            const immediateHttpStopReason = getImmediateHttpStopReason(error);
            if (immediateHttpStopReason !== null) {
                suspendRun(immediateHttpStopReason, getTaskActivityPerformanceGeneration(queued));
                return;
            }
            if (consecutiveErrorCount >= NEXT_BOOKING_CURVE_CONSECUTIVE_ERROR_LIMIT) {
                suspendRun("consecutive-errors", getTaskActivityPerformanceGeneration(queued));
            }
        }
    }

    function suspendRun(
        reason: NextBookingCurveAcquisitionStopReason,
        performanceGeneration = getPerformanceGeneration()
    ): void {
        if (drainTimer !== null) {
            windowHost.clearTimeout(drainTimer);
            drainTimer = null;
        }
        invalidateOutstandingBackgroundSettlements();
        activeController.abort();
        abortPending(reason);
        recordForGeneration(performanceGeneration, {
            classification: mapStopClassification(reason),
            event: "stopped"
        });
        currentContextKey = null;
        state = {
            ...state,
            status: "stopped",
            stopReason: reason
        };
        emit();
    }

    function abortPending(reason: NextBookingCurveAcquisitionStopReason): void {
        activeController.abort();
        const error = new DOMException(reason, "AbortError");
        for (const queued of queue.splice(0)) {
            invalidateBackgroundSettlement(queued.backgroundPerformanceGeneration);
            recordForGeneration(getTaskActivityPerformanceGeneration(queued), {
                count: 1,
                event: "aborted"
            });
            pendingByTaskKey.delete(queued.taskKey);
            settleBackgroundTask(queued.backgroundPerformanceGeneration);
            queued.reject(error);
        }
    }

    function maybeComplete(): void {
        if (
            !stopped
            && state.status === "running"
            && queue.length === 0
            && activeRequestCount === 0
        ) {
            state = {
                ...state,
                status: "complete",
                stopReason: null,
                totalCount: state.processedCount
            };
            emit();
        }
    }

    function getPerformanceGeneration(): number | null {
        return options.performanceRecorder?.currentGeneration() ?? null;
    }

    function recordInteractiveQueued(
        performanceGeneration: number | null,
        count: number
    ): void {
        recordForGeneration(performanceGeneration, { count, event: "interactive-queued" });
    }

    function recordRequestStarted(queued: QueuedTask, concurrentRequests: number): void {
        recordForGeneration(getTaskActivityPerformanceGeneration(queued), queued.activity === "interactive"
            ? { activeRequestCount: concurrentRequests, event: "interactive-started" }
            : { activeRequestCount: concurrentRequests, event: "started" });
    }

    function getTaskActivityPerformanceGeneration(queued: QueuedTask): number | null {
        return queued.interactivePerformanceGeneration ?? queued.performanceGeneration;
    }

    function recordForGeneration(
        performanceGeneration: number | null,
        event: Parameters<NextPerformanceRecorder["recordScheduler"]>[1]
    ): void {
        if (performanceGeneration === null) {
            return;
        }
        try {
            options.performanceRecorder?.recordScheduler(performanceGeneration, event);
        } catch {
            // Performance instrumentation must never affect acquisition.
        }
    }

    function registerBackgroundTask(performanceGeneration: number | null): void {
        if (performanceGeneration === null) {
            return;
        }
        pendingBackgroundCountByPerformanceGeneration.set(
            performanceGeneration,
            (pendingBackgroundCountByPerformanceGeneration.get(performanceGeneration) ?? 0) + 1
        );
    }

    function settleBackgroundTask(performanceGeneration: number | null): void {
        if (performanceGeneration === null) {
            return;
        }
        const pendingCount = pendingBackgroundCountByPerformanceGeneration.get(performanceGeneration);
        if (pendingCount === undefined) {
            return;
        }
        if (pendingCount > 1) {
            pendingBackgroundCountByPerformanceGeneration.set(performanceGeneration, pendingCount - 1);
            return;
        }
        pendingBackgroundCountByPerformanceGeneration.delete(performanceGeneration);
        if (invalidBackgroundSettlementGenerations.has(performanceGeneration)) {
            return;
        }
        recordForGeneration(performanceGeneration, { event: "background-settled" });
    }

    function invalidateBackgroundSettlement(performanceGeneration: number | null): void {
        if (performanceGeneration !== null) {
            invalidBackgroundSettlementGenerations.add(performanceGeneration);
        }
    }

    function invalidateOutstandingBackgroundSettlements(): void {
        for (const performanceGeneration of pendingBackgroundCountByPerformanceGeneration.keys()) {
            invalidBackgroundSettlementGenerations.add(performanceGeneration);
        }
    }

    async function safeReadLatest(
        sourceKeys: readonly string[]
    ): Promise<NextBookingCurveSourceRecord[]> {
        try {
            return (await store.readLatestBySourceKeys(sourceKeys))
                .filter(isNextBookingCurveSourceRecord);
        } catch {
            return [];
        }
    }

    async function readExistingForTasks(options: {
        context: NextBookingCurveAcquisitionContext;
        tasks: readonly NextBookingCurveAcquisitionTask[];
    }): Promise<NextBookingCurveSourceRecord[]> {
        const nextRecords = await safeReadLatest(
            options.tasks.map((task) => task.sourceKey)
        );
        const nextSourceKeys = new Set(nextRecords.map((record) => record.sourceKey));
        const cachedLegacyRecords: NextBookingCurveSourceRecord[] = [];
        const missingTasks = options.tasks.filter((task) => {
            if (nextSourceKeys.has(task.sourceKey)) {
                return false;
            }
            const cachedLegacyRecord = legacySeedBySourceKey.get(task.sourceKey);
            if (cachedLegacyRecord !== undefined) {
                cachedLegacyRecords.push(cachedLegacyRecord);
                return false;
            }
            return true;
        });
        if (missingTasks.length === 0) {
            return [...nextRecords, ...cachedLegacyRecords];
        }
        try {
            const requestedSourceKeys = new Set(missingTasks.map((task) => task.sourceKey));
            const legacyRecords = (await legacySeedReader.readLatest({
                asOfDate: options.context.asOfDate,
                facilityId: options.context.facilityId,
                tasks: missingTasks
            })).filter((record) => (
                requestedSourceKeys.has(record.sourceKey)
                && record.facilityId === options.context.facilityId
                && record.asOfDate <= options.context.asOfDate
                && isNextBookingCurveSourceRecord(record)
            ));
            for (const record of legacyRecords) {
                legacySeedBySourceKey.set(record.sourceKey, record);
            }
            return [...nextRecords, ...cachedLegacyRecords, ...legacyRecords];
        } catch {
            return [...nextRecords, ...cachedLegacyRecords];
        }
    }

    async function readNextOrCachedLegacySeed(
        sourceKey: string
    ): Promise<NextBookingCurveSourceRecord[]> {
        const nextRecords = await safeReadLatest([sourceKey]);
        if (nextRecords.length > 0) {
            return nextRecords;
        }
        const legacySeed = legacySeedBySourceKey.get(sourceKey);
        return legacySeed === undefined ? [] : [legacySeed];
    }

    function withFacilityLock<T>(
        facilityId: string,
        signal: AbortSignal,
        run: () => Promise<T>
    ): Promise<T> {
        const locks = windowHost.navigator.locks;
        if (locks === undefined) {
            return run();
        }
        return locks.request(
            `revenue-assistant-next-booking-curve:${facilityId}`,
            { mode: "exclusive", signal },
            run
        );
    }

    function emit(): void {
        for (const listener of listeners) {
            listener(state);
        }
    }
}

function createInitialState(): NextBookingCurveAcquisitionState {
    return {
        errorCount: 0,
        mode: null,
        processedCount: 0,
        requestCount: 0,
        skippedCount: 0,
        status: "idle",
        stopReason: null,
        storedCount: 0,
        totalCount: 0
    };
}

function isHigherPriority(
    candidate: NextBookingCurveTaskPriority,
    current: NextBookingCurveTaskPriority
): boolean {
    return NEXT_BOOKING_CURVE_PRIORITY_ORDER[candidate]
        < NEXT_BOOKING_CURVE_PRIORITY_ORDER[current];
}

function createAcquisitionDiagnostics(
    candidateTaskCount: number,
    dueTaskCount: number,
    outcome: NextBookingCurveAcquisitionDiagnostics["outcome"]
): NextBookingCurveAcquisitionDiagnostics {
    return {
        candidateTaskCount: Math.max(0, Math.trunc(candidateTaskCount)),
        dueTaskCount: Math.max(0, Math.trunc(dueTaskCount)),
        outcome
    };
}

function normalizeRequestLimit(value: number | undefined, fallback: number): number {
    return Number.isFinite(value)
        ? Math.max(0, Math.floor(value ?? fallback))
        : fallback;
}

function getPerformanceHttpClassification(
    error: unknown
): "http-401" | "http-403" | "http-429" | "other" {
    const stopReason = getImmediateHttpStopReason(error);
    return stopReason === "http-401"
        ? "http-401"
        : stopReason === "http-403"
            ? "http-403"
            : stopReason === "http-429"
                ? "http-429"
                : "other";
}

function mapStopClassification(
    reason: NextBookingCurveAcquisitionStopReason
): NextPerformanceStopClassification {
    switch (reason) {
        case "http-401":
            return "auth";
        case "http-403":
            return "permission";
        case "http-429":
            return "rate-limit";
        case "budget-reached":
            return "budget";
        case "consecutive-errors":
            return "consecutive-errors";
        case "document-hidden":
            return "hidden";
        case "facility-context-changed":
            return "context-changed";
        case "inactive-route":
            return "inactive-route";
        case "stopped":
            return "stopped";
        case "aborted":
            return "aborted";
    }
}

function buildContextKey(context: NextBookingCurveAcquisitionContext): string {
    return [
        context.facilityId,
        context.asOfDate,
        context.visibleStayDates.join(","),
        context.roomScopes.map((scope) => scope.key).join(",")
    ].join("|");
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        return Promise.reject(new DOMException("aborted", "AbortError"));
    }
    return new Promise<T>((resolve, reject) => {
        const abort = (): void => {
            reject(new DOMException("aborted", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
        void promise.then(resolve, reject).finally(() => {
            signal.removeEventListener("abort", abort);
        });
    });
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

function getImmediateHttpStopReason(
    error: unknown
): NextBookingCurveAcquisitionStopReason | null {
    if (
        !(error instanceof NextReadHttpError)
        && !(
            error instanceof Error
            && error.name === "NextReadHttpError"
            && "status" in error
            && typeof error.status === "number"
        )
    ) {
        return null;
    }
    return error.status === 401 || error.status === 403 || error.status === 429
        ? `http-${error.status}`
        : null;
}
