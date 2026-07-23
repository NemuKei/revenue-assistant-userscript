export const NEXT_PRICE_TREND_DB_NAME = "revenue-assistant-next-price-trends";
export const NEXT_PRICE_TREND_DB_VERSION = 1;
export const NEXT_PRICE_TREND_STORE_NAME = "price-trend-records";
export const NEXT_PRICE_TREND_RETENTION_LIMIT = 1_440;
export const NEXT_PRICE_TREND_CAPTURE_SCOPE_COUNT = 16;

const NEXT_PRICE_TREND_FACILITY_INDEX = "facility";
const NEXT_PRICE_TREND_FACILITY_STAY_DATE_INDEX = "facility-stayDate";
const NEXT_PRICE_TREND_SERIES_READ_LIMIT = 512;

export interface NextPriceTrendFacility {
    name: string;
    role: "own" | "competitor";
    yadNo: string;
}

export interface NextPriceTrendPoint {
    date: string | null;
    leadTimeDays: number;
    priceIncludingTax: number | null;
    status: string | null;
}

export interface NextPriceTrendYadSeries {
    points: NextPriceTrendPoint[];
    yadNo: string;
}

export interface NextPriceTrendRecord {
    endpoint: "/api/v1/price_trends";
    facilities: NextPriceTrendFacility[];
    facilityId: string;
    fetchedAt: string;
    mealType: string;
    numGuests: 1 | 2 | 3 | 4;
    payload: {
        latestSourceUpdatedAt: string | null;
        stayDate: string;
        yads: NextPriceTrendYadSeries[];
    };
    query: null;
    recordKey: string;
    roomType: null;
    roomTypeLabel: null;
    schemaVersion: "price_trend:v1";
    scope: {
        mealType: string;
        numGuests: 1 | 2 | 3 | 4;
        roomType: null;
        roomTypeLabel: null;
        source: "next-price-trends-tab";
        stayDate: string;
        yadNos: string[];
    };
    stayDate: string;
}

export interface PriceTrendCaptureRetentionWindow {
    maxStayDate: string;
    minStayDate: string;
}

export interface PriceTrendCaptureStoreWriteResult {
    addedCount: number;
    deletedCount: number;
    records: NextPriceTrendRecord[];
}

export interface PriceTrendCaptureStore {
    addAndPrune(
        records: readonly NextPriceTrendRecord[],
        retentionWindow: PriceTrendCaptureRetentionWindow
    ): Promise<PriceTrendCaptureStoreWriteResult>;
    readByFacilityStayDate(
        facilityId: string,
        stayDate: string
    ): Promise<NextPriceTrendRecord[]>;
}

export function createBrowserPriceTrendCaptureStore(
    windowHost: Window = window
): PriceTrendCaptureStore {
    return {
        async addAndPrune(records, retentionWindow) {
            const firstRecord = records[0];
            if (firstRecord === undefined) {
                return { addedCount: 0, deletedCount: 0, records: [] };
            }
            if (!records.every((record) => record.facilityId === firstRecord.facilityId)) {
                throw new Error("Next price trend batch contains multiple facilities");
            }

            const database = await openNextPriceTrendDatabase(windowHost);
            try {
                const transaction = database.transaction(NEXT_PRICE_TREND_STORE_NAME, "readwrite");
                const completion = waitForTransaction(transaction);
                try {
                    const store = transaction.objectStore(NEXT_PRICE_TREND_STORE_NAME);
                    const added = await Promise.all(records.map((record) => addRecord(store, record)));
                    const facilityIndex = store.index(NEXT_PRICE_TREND_FACILITY_INDEX);
                    const facilityRecords = await readRecordsByIndex(
                        facilityIndex,
                        firstRecord.facilityId,
                        NEXT_PRICE_TREND_RETENTION_LIMIT + NEXT_PRICE_TREND_CAPTURE_SCOPE_COUNT + 1
                    );
                    const deletedKeys = selectNextPriceTrendPruneKeys(
                        facilityRecords,
                        retentionWindow
                    );
                    await Promise.all(Array.from(deletedKeys, (recordKey) => (
                        deleteRecord(store, recordKey)
                    )));
                    await completion;
                    return {
                        addedCount: added.filter(Boolean).length,
                        deletedCount: deletedKeys.size,
                        records: facilityRecords.filter((record) => (
                            record.stayDate === firstRecord.stayDate
                            && !deletedKeys.has(record.recordKey)
                        ))
                    };
                } catch (error: unknown) {
                    try {
                        transaction.abort();
                    } catch {
                        // The transaction may already have completed or aborted.
                    }
                    await completion.catch(() => undefined);
                    throw error;
                }
            } finally {
                database.close();
            }
        },
        async readByFacilityStayDate(facilityId, stayDate) {
            const database = await openNextPriceTrendDatabase(windowHost);
            try {
                const transaction = database.transaction(NEXT_PRICE_TREND_STORE_NAME, "readonly");
                const completion = waitForTransaction(transaction);
                const store = transaction.objectStore(NEXT_PRICE_TREND_STORE_NAME);
                const index = store.index(NEXT_PRICE_TREND_FACILITY_STAY_DATE_INDEX);
                const records = await readRecordsByIndex(
                    index,
                    [facilityId, stayDate],
                    NEXT_PRICE_TREND_SERIES_READ_LIMIT
                );
                await completion;
                return records;
            } finally {
                database.close();
            }
        }
    };
}

export function buildNextPriceTrendRecordKey(options: {
    facilityId: string;
    mealType: string;
    numGuests: number;
    observationDate: string;
    stayDate: string;
}): string {
    return [
        "next-price-trend",
        `facility:${options.facilityId}`,
        `stayDate:${options.stayDate}`,
        `guest:${options.numGuests}`,
        `meal:${options.mealType}`,
        "room:unspecified",
        `observedOn:${options.observationDate}`
    ].join("|");
}

function openNextPriceTrendDatabase(windowHost: Window): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = windowHost.indexedDB.open(
            NEXT_PRICE_TREND_DB_NAME,
            NEXT_PRICE_TREND_DB_VERSION
        );
        let settled = false;

        const fail = (error: Error): void => {
            if (settled) {
                return;
            }
            settled = true;
            reject(error);
        };

        request.onupgradeneeded = () => {
            const database = request.result;
            if (database.objectStoreNames.contains(NEXT_PRICE_TREND_STORE_NAME)) {
                return;
            }
            const store = database.createObjectStore(NEXT_PRICE_TREND_STORE_NAME, {
                keyPath: "recordKey"
            });
            store.createIndex(NEXT_PRICE_TREND_FACILITY_INDEX, "facilityId", { unique: false });
            store.createIndex(
                NEXT_PRICE_TREND_FACILITY_STAY_DATE_INDEX,
                ["facilityId", "stayDate"],
                { unique: false }
            );
        };
        request.onsuccess = () => {
            if (settled) {
                request.result.close();
                return;
            }
            settled = true;
            resolve(request.result);
        };
        request.onerror = () => {
            fail(request.error ?? new Error("failed to open Next price trend database"));
        };
        request.onblocked = () => {
            fail(new Error("Next price trend database open blocked"));
        };
    });
}

function addRecord(
    store: IDBObjectStore,
    record: NextPriceTrendRecord
): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const request = store.add(record);
        request.onsuccess = () => {
            resolve(true);
        };
        request.onerror = (event) => {
            if (request.error?.name === "ConstraintError") {
                event.preventDefault();
                event.stopPropagation();
                resolve(false);
                return;
            }
            reject(request.error ?? new Error("failed to add Next price trend record"));
        };
    });
}

function readRecordsByIndex(
    index: IDBIndex,
    key: IDBValidKey,
    limit: number
): Promise<NextPriceTrendRecord[]> {
    return new Promise((resolve, reject) => {
        const request = index.getAll(IDBKeyRange.only(key), limit);
        request.onsuccess = () => {
            resolve(request.result as NextPriceTrendRecord[]);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to read Next price trend records"));
        };
    });
}

function deleteRecord(store: IDBObjectStore, recordKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.delete(recordKey);
        request.onsuccess = () => {
            resolve();
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to prune Next price trend record"));
        };
    });
}

export function selectNextPriceTrendPruneKeys(
    records: readonly NextPriceTrendRecord[],
    retentionWindow: PriceTrendCaptureRetentionWindow
): Set<string> {
    const deletedKeys = new Set<string>();
    const latestByScope = new Map<string, NextPriceTrendRecord>();

    for (const record of records) {
        if (
            record.stayDate < retentionWindow.minStayDate
            || record.stayDate > retentionWindow.maxStayDate
        ) {
            deletedKeys.add(record.recordKey);
            continue;
        }
        const scopeKey = buildRetentionScopeKey(record);
        const current = latestByScope.get(scopeKey);
        if (current === undefined || compareNewestFirst(record, current) < 0) {
            if (current !== undefined) {
                deletedKeys.add(current.recordKey);
            }
            latestByScope.set(scopeKey, record);
        } else {
            deletedKeys.add(record.recordKey);
        }
    }

    const retained = Array.from(latestByScope.values())
        .filter((record) => !deletedKeys.has(record.recordKey))
        .sort(compareNewestFirst);
    for (const record of retained.slice(NEXT_PRICE_TREND_RETENTION_LIMIT)) {
        deletedKeys.add(record.recordKey);
    }
    return deletedKeys;
}

function buildRetentionScopeKey(record: NextPriceTrendRecord): string {
    return [
        record.facilityId,
        record.stayDate,
        record.numGuests,
        record.mealType,
        record.roomType ?? "unspecified"
    ].join("\u001f");
}

function compareNewestFirst(
    left: NextPriceTrendRecord,
    right: NextPriceTrendRecord
): number {
    return right.stayDate.localeCompare(left.stayDate)
        || right.fetchedAt.localeCompare(left.fetchedAt)
        || right.recordKey.localeCompare(left.recordKey);
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = () => {
            reject(transaction.error ?? new Error("Next price trend transaction failed"));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error("Next price trend transaction aborted"));
        };
    });
}
