import type { BookingCurveApiResponse, CurveScope } from "./curveCore";

const BOOKING_CURVE_RAW_SOURCE_DB_NAME = "revenue-assistant-booking-curve-sources";
const BOOKING_CURVE_RAW_SOURCE_DB_VERSION = 1;
const BOOKING_CURVE_RAW_SOURCE_STORE_NAME = "booking-curve-raw-sources";
const BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION = "booking_curve_raw_source:v1";

export interface BookingCurveRawSourceKeyParts {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    scope: CurveScope;
    roomGroupId?: string;
    endpoint: string;
    query: string;
}

export interface BookingCurveRawSourceRecord {
    cacheKey: string;
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    scope: CurveScope;
    roomGroupId: string | null;
    endpoint: string;
    query: string;
    fetchedAt: string;
    schemaVersion: string;
    response: BookingCurveApiResponse;
}

export type BookingCurveRawSourceStoredStayDateStatus = "currentAsOf" | "pastAsOf";

export function buildBookingCurveRawSourceCacheKey(parts: BookingCurveRawSourceKeyParts): string {
    return [
        `facility:${parts.facilityId}`,
        `stayDate:${parts.stayDate}`,
        `asOf:${parts.asOfDate}`,
        `scope:${parts.scope}`,
        `roomGroup:${parts.roomGroupId ?? "-"}`,
        `endpoint:${parts.endpoint}`,
        `query:${parts.query}`,
        `schema:${BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION}`
    ].join("|");
}

export function buildBookingCurveRawSourceRecord(
    parts: BookingCurveRawSourceKeyParts,
    response: BookingCurveApiResponse
): BookingCurveRawSourceRecord {
    return {
        ...parts,
        cacheKey: buildBookingCurveRawSourceCacheKey(parts),
        roomGroupId: parts.roomGroupId ?? null,
        fetchedAt: new Date().toISOString(),
        schemaVersion: BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
        response
    };
}

export async function readBookingCurveRawSourceRecord(cacheKey: string): Promise<BookingCurveRawSourceRecord | undefined> {
    if (!isIndexedDbAvailable()) {
        return undefined;
    }

    return withBookingCurveRawSourceStore("readonly", (store) => getBookingCurveRawSourceRecord(store, cacheKey));
}

export async function readBookingCurveRawSourceStoredStayDateStatuses(
    facilityId: string,
    stayDates: string[],
    currentAsOfDate: string
): Promise<Record<string, BookingCurveRawSourceStoredStayDateStatus>> {
    if (!isIndexedDbAvailable()) {
        return {};
    }

    const uniqueStayDates = Array.from(new Set(stayDates)).sort();
    return withBookingCurveRawSourceStore("readonly", async (store) => {
        const results = await Promise.all(uniqueStayDates.map(async (stayDate) => ({
            stayDate,
            status: await getBookingCurveRawSourceStoredStayDateStatus(store, facilityId, stayDate, currentAsOfDate)
        })));
        return Object.fromEntries(results
            .filter((result): result is { stayDate: string; status: BookingCurveRawSourceStoredStayDateStatus } => result.status !== null)
            .map((result) => [result.stayDate, result.status]));
    });
}

export async function writeBookingCurveRawSourceRecord(record: BookingCurveRawSourceRecord): Promise<void> {
    if (!isIndexedDbAvailable()) {
        return;
    }

    await withBookingCurveRawSourceStore("readwrite", (store) => putBookingCurveRawSourceRecord(store, record));
}

async function withBookingCurveRawSourceStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
    const database = await openBookingCurveRawSourceDatabase();
    try {
        const transaction = database.transaction(BOOKING_CURVE_RAW_SOURCE_STORE_NAME, mode);
        const store = transaction.objectStore(BOOKING_CURVE_RAW_SOURCE_STORE_NAME);
        const result = await run(store);
        await waitForTransaction(transaction);
        return result;
    } finally {
        database.close();
    }
}

function openBookingCurveRawSourceDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(BOOKING_CURVE_RAW_SOURCE_DB_NAME, BOOKING_CURVE_RAW_SOURCE_DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(BOOKING_CURVE_RAW_SOURCE_STORE_NAME)) {
                const store = database.createObjectStore(BOOKING_CURVE_RAW_SOURCE_STORE_NAME, {
                    keyPath: "cacheKey"
                });
                store.createIndex("facility-asof", ["facilityId", "asOfDate"], {
                    unique: false
                });
                store.createIndex("facility-stay-scope", ["facilityId", "stayDate", "scope"], {
                    unique: false
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to open booking curve raw source database"));
        };

        request.onblocked = () => {
            reject(new Error("booking curve raw source database open blocked"));
        };
    });
}

function getBookingCurveRawSourceRecord(
    store: IDBObjectStore,
    cacheKey: string
): Promise<BookingCurveRawSourceRecord | undefined> {
    return new Promise((resolve, reject) => {
        const request = store.get(cacheKey);

        request.onsuccess = () => {
            resolve(request.result as BookingCurveRawSourceRecord | undefined);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to read booking curve raw source record"));
        };
    });
}

function getBookingCurveRawSourceStoredStayDateStatus(
    store: IDBObjectStore,
    facilityId: string,
    stayDate: string,
    currentAsOfDate: string
): Promise<BookingCurveRawSourceStoredStayDateStatus | null> {
    return new Promise((resolve, reject) => {
        const index = store.index("facility-stay-scope");
        const request = index.openCursor(IDBKeyRange.bound(
            [facilityId, stayDate],
            [facilityId, stayDate, "\uffff"]
        ));
        let hasPastAsOfRecord = false;

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor === null) {
                resolve(hasPastAsOfRecord ? "pastAsOf" : null);
                return;
            }

            const record = cursor.value as BookingCurveRawSourceRecord;
            if (record.asOfDate === currentAsOfDate) {
                resolve("currentAsOf");
                return;
            }

            hasPastAsOfRecord = true;
            cursor.continue();
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to query booking curve raw source records for stay date"));
        };
    });
}

function putBookingCurveRawSourceRecord(store: IDBObjectStore, record: BookingCurveRawSourceRecord): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.put(record);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to write booking curve raw source record"));
        };
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(transaction.error ?? new Error("booking curve raw source transaction failed"));
        };

        transaction.onabort = () => {
            reject(transaction.error ?? new Error("booking curve raw source transaction aborted"));
        };
    });
}

function isIndexedDbAvailable(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
}
