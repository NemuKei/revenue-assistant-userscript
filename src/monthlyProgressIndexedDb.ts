const MONTHLY_PROGRESS_HISTORY_DB_NAME = "revenue-assistant-monthly-progress-history";
const MONTHLY_PROGRESS_HISTORY_DB_VERSION = 1;
const MONTHLY_BOOKING_CURVE_STORE_NAME = "monthly-booking-curve-snapshots";
const MONTHLY_BOOKING_CURVE_ENDPOINT = "/api/v1/booking_curve/monthly";

interface MonthlyBookingCurvePoint {
    date?: string;
    this_year_sum?: number;
    last_year_sum?: number;
}

interface MonthlyBookingCurveResponse {
    year_month?: string;
    sales_based?: MonthlyBookingCurvePoint[];
    room_based?: MonthlyBookingCurvePoint[];
    updated_at?: string | null;
}

interface MonthlyBookingCurveSnapshotPoint {
    date: string;
    thisYearSum: number | null;
    lastYearSum: number | null;
}

interface MonthlyBookingCurveSnapshotPayload {
    yearMonth: string;
    updatedAt: string | null;
    salesBased: MonthlyBookingCurveSnapshotPoint[];
    roomBased: MonthlyBookingCurveSnapshotPoint[];
}

interface MonthlyBookingCurveSnapshotRecord {
    snapshotKey: string;
    facilityCacheKey: string;
    yearMonth: string;
    batchDateKey: string;
    fetchedAt: string;
    payload: MonthlyBookingCurveSnapshotPayload;
}

interface PersistMonthlyBookingCurveSnapshotOptions {
    scriptName: string;
    facilityCacheKey: string;
    yearMonth: string;
    batchDateKey: string;
}

const pendingMonthlyBookingCurveSnapshotWrites = new Map<string, Promise<void>>();

export function persistMonthlyBookingCurveSnapshot(options: PersistMonthlyBookingCurveSnapshotOptions): Promise<void> {
    const snapshotKey = buildMonthlyBookingCurveSnapshotKey(
        options.facilityCacheKey,
        options.yearMonth,
        options.batchDateKey
    );
    const pending = pendingMonthlyBookingCurveSnapshotWrites.get(snapshotKey);
    if (pending !== undefined) {
        return pending;
    }

    const request = persistMonthlyBookingCurveSnapshotInternal(options, snapshotKey)
        .finally(() => {
            pendingMonthlyBookingCurveSnapshotWrites.delete(snapshotKey);
        });

    pendingMonthlyBookingCurveSnapshotWrites.set(snapshotKey, request);
    return request;
}

function buildMonthlyBookingCurveSnapshotKey(
    facilityCacheKey: string,
    yearMonth: string,
    batchDateKey: string
): string {
    return `${facilityCacheKey}:${yearMonth}:${batchDateKey}`;
}

async function persistMonthlyBookingCurveSnapshotInternal(
    options: PersistMonthlyBookingCurveSnapshotOptions,
    snapshotKey: string
): Promise<void> {
    if (!("indexedDB" in window)) {
        console.warn(`[${options.scriptName}] indexedDB unavailable for monthly-progress history`, {
            yearMonth: options.yearMonth,
            batchDateKey: options.batchDateKey
        });
        return;
    }

    const existingSnapshot = await withMonthlyBookingCurveStore("readonly", (store) => getSnapshotRecord(store, snapshotKey));
    if (existingSnapshot !== undefined) {
        return;
    }

    const response = await loadMonthlyBookingCurve(options.yearMonth);
    const snapshotRecord: MonthlyBookingCurveSnapshotRecord = {
        snapshotKey,
        facilityCacheKey: options.facilityCacheKey,
        yearMonth: options.yearMonth,
        batchDateKey: options.batchDateKey,
        fetchedAt: new Date().toISOString(),
        payload: compactMonthlyBookingCurveResponse(options.yearMonth, response)
    };

    await withMonthlyBookingCurveStore("readwrite", (store) => putSnapshotRecord(store, snapshotRecord));

    console.info(`[${options.scriptName}] monthly-progress booking-curve snapshot stored`, {
        yearMonth: options.yearMonth,
        batchDateKey: options.batchDateKey,
        facilityCacheKey: options.facilityCacheKey,
        snapshotKey
    });
}

async function loadMonthlyBookingCurve(yearMonth: string): Promise<MonthlyBookingCurveResponse> {
    const url = new URL(MONTHLY_BOOKING_CURVE_ENDPOINT, window.location.origin);
    url.searchParams.set("year_month", yearMonth);

    const response = await fetch(url.toString(), {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new Error(`monthly booking curve request failed: ${response.status}`);
    }

    return (await response.json()) as MonthlyBookingCurveResponse;
}

function compactMonthlyBookingCurveResponse(
    fallbackYearMonth: string,
    response: MonthlyBookingCurveResponse
): MonthlyBookingCurveSnapshotPayload {
    return {
        yearMonth: response.year_month ?? fallbackYearMonth,
        updatedAt: typeof response.updated_at === "string" ? response.updated_at : null,
        salesBased: compactMonthlyBookingCurvePoints(response.sales_based),
        roomBased: compactMonthlyBookingCurvePoints(response.room_based)
    };
}

function compactMonthlyBookingCurvePoints(points: MonthlyBookingCurvePoint[] | undefined): MonthlyBookingCurveSnapshotPoint[] {
    return (points ?? [])
        .map((point) => {
            if (typeof point.date !== "string" || point.date.length === 0) {
                return null;
            }

            return {
                date: point.date,
                thisYearSum: typeof point.this_year_sum === "number" ? point.this_year_sum : null,
                lastYearSum: typeof point.last_year_sum === "number" ? point.last_year_sum : null
            };
        })
        .filter((point): point is MonthlyBookingCurveSnapshotPoint => point !== null);
}

async function withMonthlyBookingCurveStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
    const database = await openMonthlyProgressHistoryDatabase();
    try {
        const transaction = database.transaction(MONTHLY_BOOKING_CURVE_STORE_NAME, mode);
        const store = transaction.objectStore(MONTHLY_BOOKING_CURVE_STORE_NAME);
        const result = await run(store);
        await waitForTransaction(transaction);
        return result;
    } finally {
        database.close();
    }
}

function openMonthlyProgressHistoryDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(MONTHLY_PROGRESS_HISTORY_DB_NAME, MONTHLY_PROGRESS_HISTORY_DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(MONTHLY_BOOKING_CURVE_STORE_NAME)) {
                const store = database.createObjectStore(MONTHLY_BOOKING_CURVE_STORE_NAME, {
                    keyPath: "snapshotKey"
                });
                store.createIndex("facility-year-month", ["facilityCacheKey", "yearMonth"], {
                    unique: false
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to open monthly-progress history database"));
        };

        request.onblocked = () => {
            reject(new Error("monthly-progress history database open blocked"));
        };
    });
}

function getSnapshotRecord(
    store: IDBObjectStore,
    snapshotKey: string
): Promise<MonthlyBookingCurveSnapshotRecord | undefined> {
    return new Promise((resolve, reject) => {
        const request = store.get(snapshotKey);

        request.onsuccess = () => {
            resolve(request.result as MonthlyBookingCurveSnapshotRecord | undefined);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to read monthly booking-curve snapshot"));
        };
    });
}

function putSnapshotRecord(
    store: IDBObjectStore,
    snapshotRecord: MonthlyBookingCurveSnapshotRecord
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.put(snapshotRecord);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to write monthly booking-curve snapshot"));
        };
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(transaction.error ?? new Error("monthly-progress history transaction failed"));
        };

        transaction.onabort = () => {
            reject(transaction.error ?? new Error("monthly-progress history transaction aborted"));
        };
    });
}