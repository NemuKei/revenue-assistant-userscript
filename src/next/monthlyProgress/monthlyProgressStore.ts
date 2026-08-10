import {
    normalizeNextMonthlyProgressYearMonth,
    type NextMonthlyProgressSnapshotPayload,
    type NextMonthlyProgressSnapshotPoint,
    type NextMonthlyProgressSnapshotRecord
} from "./monthlyProgressModel";

export const NEXT_MONTHLY_PROGRESS_DB_NAME = "revenue-assistant-next-monthly-progress";
export const NEXT_MONTHLY_PROGRESS_DB_VERSION = 1;
export const NEXT_MONTHLY_PROGRESS_STORE_NAME = "monthly-booking-curve-snapshots";
export const NEXT_MONTHLY_PROGRESS_ENDPOINT = "/api/v1/booking_curve/monthly" as const;
export const NEXT_MONTHLY_PROGRESS_SCHEMA_VERSION = 1 as const;

export interface NextMonthlyProgressStore {
    add(records: readonly NextMonthlyProgressSnapshotRecord[]): Promise<number>;
    readByRecordKeys(recordKeys: readonly string[]): Promise<NextMonthlyProgressSnapshotRecord[]>;
}

export function buildNextMonthlyProgressRecordKey(options: {
    facilityId: string;
    yearMonth: string;
    batchDateKey: string;
}): string {
    return [
        "next-monthly-progress",
        `facility:${options.facilityId}`,
        `yearMonth:${options.yearMonth}`,
        `batch:${options.batchDateKey}`,
        `schema:${NEXT_MONTHLY_PROGRESS_SCHEMA_VERSION}`
    ].join("|");
}

export function buildNextMonthlyProgressQuery(yearMonth: string): string {
    return `year_month=${yearMonth}`;
}

export function createNextMonthlyProgressSnapshotRecord(options: {
    facilityId: string;
    yearMonth: string;
    batchDateKey: string;
    fetchedAt: string;
    payload: NextMonthlyProgressSnapshotPayload;
}): NextMonthlyProgressSnapshotRecord {
    const yearMonth = normalizeNextMonthlyProgressYearMonth(options.yearMonth);
    if (
        yearMonth === null
        || options.payload.yearMonth !== yearMonth
        || !/^\d{8}$/u.test(options.batchDateKey)
        || !Number.isFinite(Date.parse(options.fetchedAt))
        || options.facilityId.trim() === ""
    ) {
        throw new Error("invalid Next monthly progress snapshot record input");
    }
    return {
        recordKey: buildNextMonthlyProgressRecordKey({
            facilityId: options.facilityId,
            yearMonth,
            batchDateKey: options.batchDateKey
        }),
        facilityId: options.facilityId,
        yearMonth,
        batchDateKey: options.batchDateKey,
        fetchedAt: options.fetchedAt,
        endpoint: NEXT_MONTHLY_PROGRESS_ENDPOINT,
        query: buildNextMonthlyProgressQuery(yearMonth),
        schemaVersion: NEXT_MONTHLY_PROGRESS_SCHEMA_VERSION,
        source: "next-bounded-monthly-progress",
        payload: options.payload
    };
}

export function isNextMonthlyProgressSnapshotRecord(
    value: unknown
): value is NextMonthlyProgressSnapshotRecord {
    if (!isRecord(value) || !isRecord(value.payload)) {
        return false;
    }
    const yearMonth = typeof value.yearMonth === "string"
        ? normalizeNextMonthlyProgressYearMonth(value.yearMonth)
        : null;
    const payloadYearMonth = typeof value.payload.yearMonth === "string"
        ? normalizeNextMonthlyProgressYearMonth(value.payload.yearMonth)
        : null;
    if (
        typeof value.recordKey !== "string"
        || typeof value.facilityId !== "string"
        || value.facilityId.trim() === ""
        || yearMonth === null
        || payloadYearMonth !== yearMonth
        || typeof value.batchDateKey !== "string"
        || !/^\d{8}$/u.test(value.batchDateKey)
        || typeof value.fetchedAt !== "string"
        || !Number.isFinite(Date.parse(value.fetchedAt))
        || value.endpoint !== NEXT_MONTHLY_PROGRESS_ENDPOINT
        || value.query !== buildNextMonthlyProgressQuery(yearMonth)
        || value.schemaVersion !== NEXT_MONTHLY_PROGRESS_SCHEMA_VERSION
        || value.source !== "next-bounded-monthly-progress"
        || value.recordKey !== buildNextMonthlyProgressRecordKey({
            facilityId: value.facilityId,
            yearMonth,
            batchDateKey: value.batchDateKey
        })
        || (value.payload.updatedAt !== null && typeof value.payload.updatedAt !== "string")
        || !Array.isArray(value.payload.salesBased)
        || !Array.isArray(value.payload.roomBased)
        || !value.payload.salesBased.every(isSnapshotPoint)
        || !value.payload.roomBased.every(isSnapshotPoint)
    ) {
        return false;
    }
    return true;
}

export function createBrowserNextMonthlyProgressStore(
    windowHost: Window = window
): NextMonthlyProgressStore {
    return {
        async add(records) {
            if (records.length === 0) {
                return 0;
            }
            if (!records.every(isNextMonthlyProgressSnapshotRecord)) {
                throw new Error("invalid Next monthly progress snapshot batch");
            }
            const database = await openDatabase(windowHost);
            try {
                const transaction = database.transaction(
                    NEXT_MONTHLY_PROGRESS_STORE_NAME,
                    "readwrite"
                );
                const completion = waitForTransaction(transaction);
                try {
                    const store = transaction.objectStore(NEXT_MONTHLY_PROGRESS_STORE_NAME);
                    const added = await Promise.all(records.map((record) => addRecord(store, record)));
                    await completion;
                    return added.filter(Boolean).length;
                } catch (error: unknown) {
                    try {
                        transaction.abort();
                    } catch {
                        // Transaction may already be complete or aborted.
                    }
                    await completion.catch(() => undefined);
                    throw error;
                }
            } finally {
                database.close();
            }
        },
        async readByRecordKeys(recordKeys) {
            if (recordKeys.length === 0) {
                return [];
            }
            const database = await openDatabase(windowHost);
            try {
                const transaction = database.transaction(
                    NEXT_MONTHLY_PROGRESS_STORE_NAME,
                    "readonly"
                );
                const completion = waitForTransaction(transaction);
                const store = transaction.objectStore(NEXT_MONTHLY_PROGRESS_STORE_NAME);
                const records = await Promise.all(
                    Array.from(new Set(recordKeys), (recordKey) => readRecord(store, recordKey))
                );
                await completion;
                return records.filter(isNextMonthlyProgressSnapshotRecord);
            } finally {
                database.close();
            }
        }
    };
}

function openDatabase(windowHost: Window): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = windowHost.indexedDB.open(
            NEXT_MONTHLY_PROGRESS_DB_NAME,
            NEXT_MONTHLY_PROGRESS_DB_VERSION
        );
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(NEXT_MONTHLY_PROGRESS_STORE_NAME)) {
                database.createObjectStore(NEXT_MONTHLY_PROGRESS_STORE_NAME, {
                    keyPath: "recordKey"
                });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(
            request.error ?? new Error("failed to open Next monthly progress database")
        );
        request.onblocked = () => reject(new Error("Next monthly progress database open blocked"));
    });
}

function addRecord(
    store: IDBObjectStore,
    record: NextMonthlyProgressSnapshotRecord
): Promise<boolean> {
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
            reject(request.error ?? new Error("failed to add Next monthly progress snapshot"));
        };
    });
}

function readRecord(store: IDBObjectStore, recordKey: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const request = store.get(recordKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(
            request.error ?? new Error("failed to read Next monthly progress snapshot")
        );
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(
            transaction.error ?? new Error("Next monthly progress transaction failed")
        );
        transaction.onabort = () => reject(
            transaction.error ?? new Error("Next monthly progress transaction aborted")
        );
    });
}

function isSnapshotPoint(value: unknown): value is NextMonthlyProgressSnapshotPoint {
    return isRecord(value)
        && typeof value.date === "string"
        && /^\d{8}$/u.test(value.date)
        && isNullableFiniteNumber(value.thisYearSum)
        && isNullableFiniteNumber(value.lastYearSum);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
    return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
