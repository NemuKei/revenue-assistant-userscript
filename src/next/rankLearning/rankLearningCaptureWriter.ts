import { parseRankLearningCapture } from "./rankLearningCaptureParser";
import { createBrowserRankLearningStore } from "./rankLearningStore";
import type {
    RankLearningCaptureInput,
    RankLearningCaptureResult,
    RankLearningCaptureWriter,
    RankLearningStore
} from "./rankLearningTypes";

const fallbackLockTails = new Map<string, Promise<void>>();

export type {
    RankLearningCaptureInput,
    RankLearningCaptureResult,
    RankLearningCaptureWriter
} from "./rankLearningTypes";

export type RankLearningCaptureLockRunner = <T>(
    lockName: string,
    signal: AbortSignal,
    run: () => Promise<T>
) => Promise<T>;

export interface CreateRankLearningCaptureWriterOptions {
    lockRunner?: RankLearningCaptureLockRunner;
    store?: RankLearningStore;
    windowHost?: Window;
}

export function createRankLearningCaptureWriter(
    options: CreateRankLearningCaptureWriterOptions = {}
): RankLearningCaptureWriter {
    const windowHost = options.windowHost
        ?? (typeof window === "undefined" ? null : window);
    if (options.store === undefined && windowHost === null) {
        throw new Error("Next rank learning capture requires a browser store");
    }
    const store = options.store
        ?? createBrowserRankLearningStore(windowHost as Window);
    const lockRunner = options.lockRunner
        ?? (windowHost === null
            ? createFallbackRankLearningLockRunner()
            : createBrowserRankLearningLockRunner(windowHost));

    return {
        capture(input) {
            return captureRankLearningResponse(input, { lockRunner, store });
        }
    };
}

export async function captureRankLearningResponse(
    input: RankLearningCaptureInput,
    dependencies: {
        lockRunner: RankLearningCaptureLockRunner;
        store: RankLearningStore;
    }
): Promise<RankLearningCaptureResult> {
    throwIfAborted(input.signal);
    const parsed = parseRankLearningCapture(input.payload, {
        asOfDate: input.asOfDate,
        capturedAt: input.capturedAt,
        facilityId: input.facilityId,
        sourceRangeFrom: input.sourceRangeFrom,
        sourceRangeTo: input.sourceRangeTo
    });
    if (parsed.status === "rejected") {
        return parsed;
    }
    throwIfAborted(input.signal);

    return dependencies.lockRunner(
        buildRankLearningFacilityLockName(parsed.coverage.facilityId),
        input.signal,
        async () => {
            throwIfAborted(input.signal);
            const result = await dependencies.store.addAndPrune(
                parsed.events,
                parsed.coverage,
                input.signal
            );
            const changed = result.addedCoverageCount > 0
                || result.addedEventCount > 0
                || result.deletedCoverageCount > 0
                || result.deletedEventCount > 0;
            return {
                ...result,
                status: changed ? "stored" : "duplicate"
            };
        }
    );
}

export function buildRankLearningFacilityLockName(facilityId: string): string {
    return `revenue-assistant-next:rank-learning:${encodeURIComponent(facilityId)}`;
}

export function createBrowserRankLearningLockRunner(
    windowHost: Window
): RankLearningCaptureLockRunner {
    return async <T>(
        lockName: string,
        signal: AbortSignal,
        run: () => Promise<T>
    ): Promise<T> => {
        const locks = windowHost.navigator.locks;
        if (locks === undefined) {
            return runWithFallbackRankLearningLock(lockName, signal, run);
        }
        return locks.request(lockName, { mode: "exclusive", signal }, run);
    };
}

export function createFallbackRankLearningLockRunner(): RankLearningCaptureLockRunner {
    return runWithFallbackRankLearningLock;
}

async function runWithFallbackRankLearningLock<T>(
    lockName: string,
    signal: AbortSignal,
    run: () => Promise<T>
): Promise<T> {
    const previous = fallbackLockTails.get(lockName) ?? Promise.resolve();
    let release = (): void => undefined;
    const completion = new Promise<void>((resolve) => {
        release = resolve;
    });
    const tail = previous.then(() => completion);
    fallbackLockTails.set(lockName, tail);

    try {
        await raceWithAbort(previous, signal);
        throwIfAborted(signal);
        return await run();
    } finally {
        release();
        void tail.then(() => {
            if (fallbackLockTails.get(lockName) === tail) {
                fallbackLockTails.delete(lockName);
            }
        });
    }
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        return Promise.reject(createAbortError());
    }
    return new Promise((resolve, reject) => {
        const handleAbort = (): void => {
            reject(createAbortError());
        };
        signal.addEventListener("abort", handleAbort, { once: true });
        promise.then((value) => {
            signal.removeEventListener("abort", handleAbort);
            resolve(value);
        }, (error: unknown) => {
            signal.removeEventListener("abort", handleAbort);
            reject(error);
        });
    });
}

function throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        throw createAbortError();
    }
}

function createAbortError(): DOMException {
    return new DOMException("Next rank learning capture aborted", "AbortError");
}
