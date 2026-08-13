import { toCompactDateKey } from "../../curveCore";
import {
    createBookingCurveRankStatusDataSource,
    type BookingCurveRankStatusDataSource,
    type BookingCurveRankStatusLoadResult
} from "./bookingCurveRankStatusDataSource";

export interface BookingCurveRankReadConsumer {
    rankStatusDataSource: BookingCurveRankStatusDataSource;
    stop(): void;
}

export interface BookingCurveRankReadCoordinator {
    createConsumer(consumerId: string): BookingCurveRankReadConsumer;
    stop(): void;
}

export interface CreateBookingCurveRankReadCoordinatorOptions {
    createRankStatusDataSource?: () => BookingCurveRankStatusDataSource;
    windowHost?: Window;
}

interface SharedSource {
    cancel(): void;
    stop(): void;
}

interface LeaseMarker {
    cancel(): void;
    isActive(): boolean;
}

interface SharedReadEntry<Result, Source extends SharedSource> {
    invalidated: boolean;
    key: string;
    leases: Set<LeaseMarker>;
    promise: Promise<Result>;
    settled: boolean;
    source: Source;
}

interface SharedReadCache<Result, Source extends SharedSource> {
    entries: Map<string, SharedReadEntry<Result, Source>>;
    newestKey: string | null;
}

interface ActiveLease<Result, Source extends SharedSource> {
    entry: SharedReadEntry<Result, Source>;
    promise: Promise<Result>;
    release(): void;
}

interface RankStatusContext {
    compactStayDate: string | null;
    facilityId: string;
    key: string;
}

/**
 * Shares the bounded rank-status read between Analyze surfaces for one page
 * runtime. Results remain memory-only while their bounded context is current;
 * an individual surface owns only its lease on an in-flight read.
 */
export function createBookingCurveRankReadCoordinator(
    options: CreateBookingCurveRankReadCoordinatorOptions = {}
): BookingCurveRankReadCoordinator {
    const createRankStatusSource = options.createRankStatusDataSource ?? (() => (
        createBookingCurveRankStatusDataSource(
            options.windowHost === undefined ? {} : { windowHost: options.windowHost }
        )
    ));
    const rankStatusCache: SharedReadCache<
        BookingCurveRankStatusLoadResult,
        BookingCurveRankStatusDataSource
    > = { entries: new Map(), newestKey: null };
    let stopped = false;

    return {
        createConsumer(consumerId) {
            if (consumerId.trim() === "") {
                throw new Error("booking-curve-rank-consumer-id-required");
            }
            const rankStatusDataSource = createRankStatusConsumer();
            return {
                rankStatusDataSource,
                stop() {
                    rankStatusDataSource.stop();
                }
            };
        },
        stop() {
            if (stopped) {
                return;
            }
            stopped = true;
            stopEntries(rankStatusCache);
        }
    };

    function createRankStatusConsumer(): BookingCurveRankStatusDataSource {
        let activeLease: ActiveLease<
            BookingCurveRankStatusLoadResult,
            BookingCurveRankStatusDataSource
        > | null = null;
        let lastEntry: SharedReadEntry<
            BookingCurveRankStatusLoadResult,
            BookingCurveRankStatusDataSource
        > | null = null;
        let consumerStopped = false;

        const release = (): void => {
            activeLease?.release();
            activeLease = null;
        };
        const reset = (): void => {
            const entry = activeLease?.entry ?? lastEntry;
            if (entry !== null) {
                entry.invalidated = true;
            }
            release();
            if (entry !== null) {
                releaseUnusedEntry(rankStatusCache, entry);
            }
            lastEntry = null;
        };

        return {
            cancel: release,
            load(facilityId, stayDate) {
                const context = createRankStatusContext(facilityId, stayDate);
                if (consumerStopped || stopped) {
                    return Promise.resolve(createAbortedRankStatusResult(context.key));
                }
                if (context.facilityId === "" || context.compactStayDate === null) {
                    if (activeLease?.entry.key !== context.key) {
                        release();
                    }
                    return Promise.resolve({
                        status: "error",
                        contextKey: context.key,
                        reason: "stay-date-invalid"
                    });
                }
                if (activeLease?.entry.key === context.key) {
                    return activeLease.promise;
                }
                release();
                const entry = getOrCreateRankStatusEntry({
                    compactStayDate: context.compactStayDate,
                    facilityId: context.facilityId,
                    key: context.key
                });
                lastEntry = entry;
                activeLease = attachLease(
                    entry,
                    createAbortedRankStatusResult(context.key),
                    () => stopped || consumerStopped,
                    () => releaseUnusedEntry(rankStatusCache, entry)
                );
                return activeLease.promise;
            },
            reset,
            stop() {
                consumerStopped = true;
                release();
            }
        };
    }

    function getOrCreateRankStatusEntry(context: {
        compactStayDate: string;
        facilityId: string;
        key: string;
    }): SharedReadEntry<BookingCurveRankStatusLoadResult, BookingCurveRankStatusDataSource> {
        const existing = rankStatusCache.entries.get(context.key);
        if (existing !== undefined) {
            selectNewestEntry(rankStatusCache, context.key);
            return existing;
        }
        selectNewestEntry(rankStatusCache, context.key);
        const source = createRankStatusSource();
        const entry: SharedReadEntry<
            BookingCurveRankStatusLoadResult,
            BookingCurveRankStatusDataSource
        > = {
            invalidated: false,
            key: context.key,
            leases: new Set(),
            promise: Promise.resolve(createAbortedRankStatusResult(context.key)),
            settled: false,
            source
        };
        entry.promise = safelyLoad(
            () => source.load(context.facilityId, context.compactStayDate),
            () => createFailedRankStatusResult(context.key)
        ).then((result) => validateRankStatusResult(result, context));
        markSettled(entry);
        rankStatusCache.entries.set(context.key, entry);
        return entry;
    }

}

function attachLease<Result, Source extends SharedSource>(
    entry: SharedReadEntry<Result, Source>,
    abortedResult: Result,
    isOwnerStopped: () => boolean,
    onRelease: () => void
): ActiveLease<Result, Source> {
    let resolveCancellation!: (result: Result) => void;
    const cancellation = new Promise<Result>((resolve) => {
        resolveCancellation = resolve;
    });
    let active = true;
    const marker: LeaseMarker = {
        cancel() {
            if (!active) {
                return;
            }
            active = false;
            resolveCancellation(abortedResult);
        },
        isActive() {
            return active;
        }
    };
    entry.leases.add(marker);
    const promise = Promise.race([entry.promise, cancellation]).then((result) => (
        marker.isActive() && !isOwnerStopped() ? result : abortedResult
    ));
    return {
        entry,
        promise,
        release() {
            marker.cancel();
            entry.leases.delete(marker);
            onRelease();
        }
    };
}

function releaseUnusedEntry<Result, Source extends SharedSource>(
    cache: SharedReadCache<Result, Source>,
    entry: SharedReadEntry<Result, Source>
): void {
    if (entry.leases.size > 0 || cache.entries.get(entry.key) !== entry) {
        return;
    }
    if (entry.settled && !entry.invalidated && cache.newestKey === entry.key) {
        return;
    }
    cache.entries.delete(entry.key);
    if (cache.newestKey === entry.key) {
        cache.newestKey = null;
    }
    if (entry.settled) {
        entry.source.stop();
    } else {
        entry.source.cancel();
    }
}

function selectNewestEntry<Result, Source extends SharedSource>(
    cache: SharedReadCache<Result, Source>,
    key: string
): void {
    cache.newestKey = key;
    for (const entry of cache.entries.values()) {
        if (entry.key === key || entry.leases.size > 0) {
            continue;
        }
        cache.entries.delete(entry.key);
        if (entry.settled) {
            entry.source.stop();
        } else {
            entry.source.cancel();
        }
    }
}

function stopEntries<Result, Source extends SharedSource>(
    cache: SharedReadCache<Result, Source>
): void {
    for (const entry of cache.entries.values()) {
        for (const lease of entry.leases) {
            lease.cancel();
        }
        entry.leases.clear();
        entry.source.stop();
    }
    cache.entries.clear();
    cache.newestKey = null;
}

function markSettled<Result, Source extends SharedSource>(
    entry: SharedReadEntry<Result, Source>
): void {
    void entry.promise.then(() => {
        entry.settled = true;
    });
}

function safelyLoad<Result>(
    load: () => Promise<Result>,
    createFailure: () => Result
): Promise<Result> {
    try {
        return load().catch(createFailure);
    } catch {
        return Promise.resolve(createFailure());
    }
}

function createRankStatusContext(facilityId: string, stayDate: string): RankStatusContext {
    const normalizedFacilityId = facilityId.trim();
    const compactStayDate = toCompactDateKey(stayDate);
    return {
        compactStayDate,
        facilityId: normalizedFacilityId,
        key: `${normalizedFacilityId || "invalid"}|${compactStayDate ?? "invalid"}`
    };
}

function validateRankStatusResult(
    result: BookingCurveRankStatusLoadResult,
    context: { compactStayDate: string; facilityId: string; key: string }
): BookingCurveRankStatusLoadResult {
    if (
        result.contextKey !== context.key
        || (
            result.status === "ready"
            && (
                result.facilityId !== context.facilityId
                || result.stayDate !== context.compactStayDate
            )
        )
    ) {
        return createFailedRankStatusResult(context.key);
    }
    return result;
}

function createAbortedRankStatusResult(contextKey: string): BookingCurveRankStatusLoadResult {
    return { status: "error", contextKey, reason: "aborted" };
}

function createFailedRankStatusResult(contextKey: string): BookingCurveRankStatusLoadResult {
    return { status: "error", contextKey, reason: "request-failed" };
}
