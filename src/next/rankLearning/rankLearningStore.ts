import {
    buildRankLearningCoverageRecordKey,
    buildRankLearningEventRecordKey,
    isRankLearningCoverageRecord,
    isRankLearningEventRecord
} from "./rankLearningCaptureParser";
import {
    RANK_LEARNING_COVERAGE_FACILITY_LIMIT,
    RANK_LEARNING_COVERAGE_STORE_NAME,
    RANK_LEARNING_DATABASE_NAME,
    RANK_LEARNING_DATABASE_VERSION,
    RANK_LEARNING_EVENT_BATCH_LIMIT,
    RANK_LEARNING_EVENT_FACILITY_LIMIT,
    RANK_LEARNING_EVENT_STORE_NAME,
    type RankLearningCoverageRecord,
    type RankLearningEventRecord,
    type RankLearningFacilityRecords,
    type RankLearningStore,
    type RankLearningStoreWriteResult
} from "./rankLearningTypes";

export type {
    RankLearningCoverageRecord,
    RankLearningEventRecord,
    RankLearningFacilityRecords,
    RankLearningStore,
    RankLearningStoreWriteResult
} from "./rankLearningTypes";

const RANK_LEARNING_FACILITY_INDEX = "facility";

export const RANK_LEARNING_EVENT_RETENTION_READ_LIMIT =
    RANK_LEARNING_EVENT_FACILITY_LIMIT + RANK_LEARNING_EVENT_BATCH_LIMIT + 1;
export const RANK_LEARNING_COVERAGE_RETENTION_READ_LIMIT =
    RANK_LEARNING_COVERAGE_FACILITY_LIMIT + 1;

interface RetainedRecord {
    capturedAt: string;
    recordKey: string;
}

export function createBrowserRankLearningStore(
    windowHost: Window = window
): RankLearningStore {
    return {
        async addAndPrune(events, coverage, signal) {
            validateWriteBatch(events, coverage);
            throwIfAborted(signal);
            if (!("indexedDB" in windowHost)) {
                throw new Error("IndexedDB unavailable for Next rank learning");
            }

            const database = await openRankLearningDatabase(windowHost, signal);
            try {
                return await writeAndPrune(database, events, coverage, signal);
            } finally {
                database.close();
            }
        },
        async readByFacility(facilityId, signal) {
            const normalizedFacilityId = facilityId.trim();
            if (normalizedFacilityId === "") {
                throw new Error("Next rank learning read requires a facility");
            }
            throwIfAborted(signal);
            if (!("indexedDB" in windowHost)) {
                throw new Error("IndexedDB unavailable for Next rank learning");
            }

            const database = await openRankLearningDatabase(windowHost, signal);
            try {
                return await readFacilityRecords(database, normalizedFacilityId, signal);
            } finally {
                database.close();
            }
        }
    };
}

export function selectRankLearningPruneKeys<T extends RetainedRecord>(
    records: readonly T[],
    limit: number
): Set<string> {
    if (!Number.isInteger(limit) || limit < 0) {
        throw new Error("Next rank learning retention limit must be a non-negative integer");
    }
    const retained = records.slice().sort(compareNewestFirst);
    return new Set(retained.slice(limit).map((record) => record.recordKey));
}

async function writeAndPrune(
    database: IDBDatabase,
    events: readonly RankLearningEventRecord[],
    coverage: RankLearningCoverageRecord,
    signal: AbortSignal
): Promise<RankLearningStoreWriteResult> {
    throwIfAborted(signal);
    const transaction = database.transaction(
        [RANK_LEARNING_EVENT_STORE_NAME, RANK_LEARNING_COVERAGE_STORE_NAME],
        "readwrite"
    );
    const completion = waitForTransaction(transaction, signal);
    const abortTransaction = (): void => abortActiveTransaction(transaction);
    signal.addEventListener("abort", abortTransaction, { once: true });

    try {
        const eventStore = transaction.objectStore(RANK_LEARNING_EVENT_STORE_NAME);
        const coverageStore = transaction.objectStore(RANK_LEARNING_COVERAGE_STORE_NAME);
        const [eventAdds, coverageAdded] = await Promise.all([
            Promise.all(events.map((event) => addRecord(eventStore, event))),
            addRecord(coverageStore, coverage)
        ]);
        throwIfAborted(signal);

        const [facilityEvents, facilityCoverages] = await Promise.all([
            readRetentionRecordsByFacility<RankLearningEventRecord>(
                eventStore,
                coverage.facilityId,
                RANK_LEARNING_EVENT_RETENTION_READ_LIMIT
            ),
            readRetentionRecordsByFacility<RankLearningCoverageRecord>(
                coverageStore,
                coverage.facilityId,
                RANK_LEARNING_COVERAGE_RETENTION_READ_LIMIT
            )
        ]);
        const eventPruneKeys = selectRankLearningPruneKeys(
            facilityEvents,
            RANK_LEARNING_EVENT_FACILITY_LIMIT
        );
        const coveragePruneKeys = selectRankLearningPruneKeys(
            facilityCoverages,
            RANK_LEARNING_COVERAGE_FACILITY_LIMIT
        );
        await Promise.all([
            ...Array.from(eventPruneKeys, (recordKey) => deleteRecord(eventStore, recordKey)),
            ...Array.from(coveragePruneKeys, (recordKey) => deleteRecord(coverageStore, recordKey))
        ]);
        await completion;
        return {
            addedCoverageCount: coverageAdded ? 1 : 0,
            addedEventCount: eventAdds.filter(Boolean).length,
            deletedCoverageCount: coveragePruneKeys.size,
            deletedEventCount: eventPruneKeys.size
        };
    } catch (error: unknown) {
        abortActiveTransaction(transaction);
        await completion.catch(() => undefined);
        if (signal.aborted) {
            throw createAbortError();
        }
        throw error;
    } finally {
        signal.removeEventListener("abort", abortTransaction);
    }
}

async function readFacilityRecords(
    database: IDBDatabase,
    facilityId: string,
    signal?: AbortSignal
): Promise<RankLearningFacilityRecords> {
    throwIfAborted(signal);
    const transaction = database.transaction(
        [RANK_LEARNING_EVENT_STORE_NAME, RANK_LEARNING_COVERAGE_STORE_NAME],
        "readonly"
    );
    const completion = waitForTransaction(transaction, signal);
    const abortTransaction = (): void => abortActiveTransaction(transaction);
    signal?.addEventListener("abort", abortTransaction, { once: true });
    try {
        const [events, coverages] = await Promise.all([
            readBoundedByFacility<RankLearningEventRecord>(
                transaction.objectStore(RANK_LEARNING_EVENT_STORE_NAME),
                facilityId,
                RANK_LEARNING_EVENT_FACILITY_LIMIT
            ),
            readBoundedByFacility<RankLearningCoverageRecord>(
                transaction.objectStore(RANK_LEARNING_COVERAGE_STORE_NAME),
                facilityId,
                RANK_LEARNING_COVERAGE_FACILITY_LIMIT
            )
        ]);
        await completion;
        return {
            coverages: coverages.filter(isRankLearningCoverageRecord).sort(compareNewestFirst),
            events: events.filter(isRankLearningEventRecord).sort(compareNewestFirst)
        };
    } catch (error: unknown) {
        abortActiveTransaction(transaction);
        await completion.catch(() => undefined);
        if (signal?.aborted === true) {
            throw createAbortError();
        }
        throw error;
    } finally {
        signal?.removeEventListener("abort", abortTransaction);
    }
}

function validateWriteBatch(
    events: readonly RankLearningEventRecord[],
    coverage: RankLearningCoverageRecord
): void {
    if (!isRankLearningCoverageRecord(coverage)) {
        throw new Error("Next rank learning coverage record is invalid");
    }
    if (events.length > RANK_LEARNING_EVENT_BATCH_LIMIT) {
        throw new Error("Next rank learning event batch exceeds the fixed limit");
    }
    if (coverage.validEventCount !== events.length) {
        throw new Error("Next rank learning event count does not match coverage");
    }
    for (const event of events) {
        if (
            !isRankLearningEventRecord(event)
            || event.facilityId !== coverage.facilityId
            || event.capturedAt !== coverage.capturedAt
            || event.sourceRangeFrom !== coverage.rangeFrom
            || event.sourceRangeTo !== coverage.rangeTo
            || event.reflectedDate > coverage.asOfDate
            || event.recordKey !== buildRankLearningEventRecordKey(event)
        ) {
            throw new Error("Next rank learning event batch is invalid");
        }
    }
    if (coverage.recordKey !== buildRankLearningCoverageRecordKey({
        ...coverage,
        eventRecordKeys: events.map((event) => event.recordKey)
    })) {
        throw new Error("Next rank learning coverage key is invalid");
    }
}

function openRankLearningDatabase(
    windowHost: Window,
    signal?: AbortSignal
): Promise<IDBDatabase> {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const request = windowHost.indexedDB.open(
            RANK_LEARNING_DATABASE_NAME,
            RANK_LEARNING_DATABASE_VERSION
        );
        let settled = false;

        const cleanup = (): void => {
            signal?.removeEventListener("abort", handleAbort);
        };
        const fail = (error: Error): void => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(error);
        };
        const handleAbort = (): void => {
            try {
                request.transaction?.abort();
            } catch {
                // The versionchange transaction may not be active.
            }
            fail(createAbortError());
        };

        signal?.addEventListener("abort", handleAbort, { once: true });
        request.onupgradeneeded = () => {
            if (settled || signal?.aborted === true) {
                abortActiveTransaction(request.transaction);
                return;
            }
            createRankLearningSchema(request.result);
        };
        request.onsuccess = () => {
            if (settled) {
                request.result.close();
                return;
            }
            settled = true;
            cleanup();
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
        request.onerror = () => {
            fail(request.error ?? new Error("failed to open Next rank learning database"));
        };
        request.onblocked = () => {
            fail(new Error("Next rank learning database open blocked"));
        };
    });
}

function createRankLearningSchema(database: IDBDatabase): void {
    createRankLearningStore(database, RANK_LEARNING_EVENT_STORE_NAME);
    createRankLearningStore(database, RANK_LEARNING_COVERAGE_STORE_NAME);
}

function createRankLearningStore(database: IDBDatabase, storeName: string): void {
    if (database.objectStoreNames.contains(storeName)) {
        return;
    }
    const store = database.createObjectStore(storeName, { keyPath: "recordKey" });
    store.createIndex(RANK_LEARNING_FACILITY_INDEX, "facilityId", { unique: false });
}

function addRecord(store: IDBObjectStore, record: unknown): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => {
            if (request.error?.name === "ConstraintError") {
                event.preventDefault();
                event.stopPropagation();
                resolve(false);
                return;
            }
            reject(request.error ?? new Error("failed to add Next rank learning record"));
        };
    });
}

function readRetentionRecordsByFacility<T>(
    store: IDBObjectStore,
    facilityId: string,
    limit: number
): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const request = store.index(RANK_LEARNING_FACILITY_INDEX).getAll(
            IDBKeyRange.only(facilityId),
            limit
        );
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(
            request.error ?? new Error("failed to read Next rank learning retention records")
        );
    });
}

function readBoundedByFacility<T>(
    store: IDBObjectStore,
    facilityId: string,
    limit: number
): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const request = store.index(RANK_LEARNING_FACILITY_INDEX).getAll(
            IDBKeyRange.only(facilityId),
            limit
        );
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(
            request.error ?? new Error("failed to read Next rank learning facility records")
        );
    });
}

function deleteRecord(store: IDBObjectStore, recordKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.delete(recordKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(
            request.error ?? new Error("failed to prune Next rank learning record")
        );
    });
}

function waitForTransaction(
    transaction: IDBTransaction,
    signal?: AbortSignal
): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const succeed = (): void => {
            if (settled) {
                return;
            }
            settled = true;
            resolve();
        };
        const fail = (): void => {
            if (settled) {
                return;
            }
            settled = true;
            reject(signal?.aborted === true
                ? createAbortError()
                : transaction.error ?? new Error("Next rank learning transaction failed"));
        };
        transaction.oncomplete = succeed;
        transaction.onerror = fail;
        transaction.onabort = fail;
    });
}

function abortActiveTransaction(transaction: IDBTransaction | null): void {
    if (transaction === null) {
        return;
    }
    try {
        transaction.abort();
    } catch {
        // The transaction may already have completed or aborted.
    }
}

function compareNewestFirst<T extends RetainedRecord>(left: T, right: T): number {
    return right.capturedAt.localeCompare(left.capturedAt)
        || right.recordKey.localeCompare(left.recordKey);
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted === true) {
        throw createAbortError();
    }
}

function createAbortError(): DOMException {
    return new DOMException("Next rank learning capture aborted", "AbortError");
}
