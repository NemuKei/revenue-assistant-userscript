import {
    NextReadHttpError,
    createBrowserNextReadTransport,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    NEXT_BOOKING_CURVE_BOOTSTRAP_REQUEST_LIMIT,
    NEXT_BOOKING_CURVE_CONCURRENCY,
    NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT,
    NEXT_BOOKING_CURVE_INTERACTIVE_RESERVE,
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

const NEXT_BOOKING_CURVE_BOOTSTRAP_COVERAGE_THRESHOLD = 0.8;
const NEXT_BOOKING_CURVE_CONSECUTIVE_ERROR_LIMIT = 3;

export type NextBookingCurveAcquisitionMode = "bootstrap" | "daily-delta";

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
        scopeKeys?: readonly string[];
        signal: AbortSignal;
        stayDate: string;
    }): Promise<void>;
    readLatest(sourceKeys: readonly string[]): Promise<NextBookingCurveSourceRecord[]>;
    startBackground(context: NextBookingCurveAcquisitionContext): Promise<void>;
    startReference(options: {
        context: NextBookingCurveAcquisitionContext;
        scopeKey: string;
        targetStayDate: string;
    }): Promise<void>;
    subscribe(listener: (state: NextBookingCurveAcquisitionState) => void): () => void;
    suspend(reason: NextBookingCurveAcquisitionStopReason): void;
    stop(): void;
}

interface QueuedTask {
    completion: Promise<void>;
    priority: "background" | "interactive";
    reject: (reason?: unknown) => void;
    resolve: () => void;
    task: NextBookingCurveAcquisitionTask;
    taskKey: string;
}

export interface CreateNextBookingCurveAcquisitionCoordinatorOptions {
    now?: () => Date;
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
    const now = options.now ?? (() => new Date());
    const listeners = new Set<(state: NextBookingCurveAcquisitionState) => void>();
    const pendingByTaskKey = new Map<string, QueuedTask>();
    const queue: QueuedTask[] = [];
    let state: NextBookingCurveAcquisitionState = createInitialState();
    let activeController = new AbortController();
    let activeRequestCount = 0;
    let currentContextKey: string | null = null;
    let currentFacilityId: string | null = null;
    let drainTimer: number | null = null;
    let lastRequestStartedAt = 0;
    let stopped = false;
    let planningGeneration = 0;
    let sessionRequestLimit = NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT;
    let consecutiveErrorCount = 0;

    return {
        async ensureCurrent({ context, scopeKeys, signal, stayDate }) {
            if (stopped || signal.aborted) {
                return;
            }
            await ensureContext(context);
            const tasks = buildNextBookingCurveCurrentTasks({
                context,
                ...(scopeKeys === undefined ? {} : { scopeKeys }),
                stayDate
            });
            const existing = await safeReadLatest(tasks.map((task) => task.sourceKey));
            const dueTasks = selectNextBookingCurveDueTasks({
                asOfDate: context.asOfDate,
                existingRecords: existing,
                limit: tasks.length,
                tasks
            });
            const pending = dueTasks
                .map((task) => enqueueTask(task, "interactive"));
            await Promise.all(pending.map((promise) => raceWithAbort(promise, signal)
                .catch(() => undefined)));
        },
        readLatest(sourceKeys) {
            return safeReadLatest(sourceKeys);
        },
        async startBackground(context) {
            if (stopped) {
                return;
            }
            await ensureContext(context);
            const generation = ++planningGeneration;
            state = {
                ...state,
                status: "planning",
                stopReason: null
            };
            emit();
            const tasks = buildNextBookingCurveBackgroundTasks(context);
            const existing = await safeReadLatest(tasks.map((task) => task.sourceKey));
            if (stopped || generation !== planningGeneration || !matchesContext(context)) {
                return;
            }
            const existingSourceCount = new Set(existing.map((record) => record.sourceKey)).size;
            const coverage = tasks.length === 0 ? 1 : existingSourceCount / tasks.length;
            const mode: NextBookingCurveAcquisitionMode =
                coverage < NEXT_BOOKING_CURVE_BOOTSTRAP_COVERAGE_THRESHOLD
                    ? "bootstrap"
                    : "daily-delta";
            sessionRequestLimit = mode === "bootstrap"
                ? NEXT_BOOKING_CURVE_BOOTSTRAP_REQUEST_LIMIT
                : NEXT_BOOKING_CURVE_DAILY_REQUEST_LIMIT;
            const backgroundLimit = Math.max(
                0,
                sessionRequestLimit - NEXT_BOOKING_CURVE_INTERACTIVE_RESERVE - state.requestCount
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
                void enqueueTask(task, "background").catch(() => undefined);
            }
            emit();
            drain();
        },
        async startReference({ context, scopeKey, targetStayDate }) {
            if (stopped) {
                return;
            }
            await ensureContext(context);
            const tasks = buildNextBookingCurveReferenceTasks({
                context,
                scopeKey,
                targetStayDate
            });
            const existing = await safeReadLatest(tasks.map((task) => task.sourceKey));
            const remainingBudget = Math.max(0, sessionRequestLimit - state.requestCount);
            const dueTasks = selectNextBookingCurveDueTasks({
                asOfDate: context.asOfDate,
                existingRecords: existing,
                limit: remainingBudget,
                tasks
            });
            for (const task of dueTasks) {
                void enqueueTask(task, "interactive").catch(() => undefined);
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
        if (facilityChanged) {
            state = createInitialState();
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
        priority: QueuedTask["priority"]
    ): Promise<void> {
        const taskKey = `${task.sourceKey}|asOf:${currentContextKey?.split("|")[1] ?? ""}`;
        const pending = pendingByTaskKey.get(taskKey);
        if (pending !== undefined) {
            if (priority === "interactive") {
                pending.priority = "interactive";
            }
            return pending.completion;
        }
        let resolveTask = (): void => undefined;
        let rejectTask: (reason?: unknown) => void = () => undefined;
        const completion = new Promise<void>((resolve, reject) => {
            resolveTask = resolve;
            rejectTask = reject;
        });
        const queued: QueuedTask = {
            completion,
            priority,
            reject: rejectTask,
            resolve: resolveTask,
            task,
            taskKey
        };
        pendingByTaskKey.set(taskKey, queued);
        queue.push(queued);
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
        if (state.requestCount >= sessionRequestLimit) {
            suspendRun("budget-reached");
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
        state = {
            ...state,
            requestCount: state.requestCount + 1,
            status: "running"
        };
        emit();
        void runTask(next).finally(() => {
            activeRequestCount -= 1;
            pendingByTaskKey.delete(next.taskKey);
            drain();
        });
        drain();
    }

    function takeNextTask(): QueuedTask | null {
        let selectedIndex = -1;
        for (let index = 0; index < queue.length; index += 1) {
            const candidate = queue[index];
            if (candidate === undefined) {
                continue;
            }
            const selected = selectedIndex < 0 ? undefined : queue[selectedIndex];
            if (
                selected === undefined
                || (candidate.priority === "interactive" && selected.priority === "background")
            ) {
                selectedIndex = index;
            }
        }
        return selectedIndex < 0 ? null : queue.splice(selectedIndex, 1)[0] ?? null;
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
                const previousRecord = (await safeReadLatest([queued.task.sourceKey]))[0];
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
                queued.reject(error);
                return;
            }
            state = {
                ...state,
                errorCount: state.errorCount + 1,
                processedCount: state.processedCount + 1
            };
            consecutiveErrorCount += 1;
            queued.reject(error);
            emit();
            const immediateHttpStopReason = getImmediateHttpStopReason(error);
            if (immediateHttpStopReason !== null) {
                suspendRun(immediateHttpStopReason);
                return;
            }
            if (consecutiveErrorCount >= NEXT_BOOKING_CURVE_CONSECUTIVE_ERROR_LIMIT) {
                suspendRun("consecutive-errors");
            }
        }
    }

    function suspendRun(reason: NextBookingCurveAcquisitionStopReason): void {
        if (drainTimer !== null) {
            windowHost.clearTimeout(drainTimer);
            drainTimer = null;
        }
        activeController.abort();
        abortPending(reason);
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
            pendingByTaskKey.delete(queued.taskKey);
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
