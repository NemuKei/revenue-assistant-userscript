import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    buildBookingCurveRawSourceCacheKey,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";

export const NEXT_BOOKING_CURVE_SOURCE_DB_NAME = "revenue-assistant-next-booking-curve-sources";
export const NEXT_BOOKING_CURVE_SOURCE_DB_VERSION = 1;
export const NEXT_BOOKING_CURVE_SOURCE_STORE_NAME = "booking-curve-sources";
export const NEXT_BOOKING_CURVE_SOURCE_RETENTION_LIMIT = 4_096;
export const NEXT_BOOKING_CURVE_SOURCE_BATCH_LIMIT = 32;

export const NEXT_BOOKING_CURVE_SOURCE_KEY_INDEX = "source-key";
const NEXT_BOOKING_CURVE_FACILITY_INDEX = "facility";
const NEXT_BOOKING_CURVE_FACILITY_READ_LIMIT =
    NEXT_BOOKING_CURVE_SOURCE_RETENTION_LIMIT + NEXT_BOOKING_CURVE_SOURCE_BATCH_LIMIT + 1;

export interface NextBookingCurveLandingObservation {
    all: number | null;
    group: number | null;
    observedAsOfDate: string;
    transient: number | null;
}

export interface NextBookingCurveSourceRecord extends BookingCurveRawSourceRecord {
    firstObservedAsOfDate: string;
    landing: NextBookingCurveLandingObservation | null;
    recordKey: string;
    source: "next-bounded-booking-curve";
    sourceKey: string;
}

export interface NextBookingCurveSourceStoreWriteResult {
    addedCount: number;
    deletedCount: number;
}

export interface NextBookingCurveSourceStore {
    addAndPrune(
        records: readonly NextBookingCurveSourceRecord[]
    ): Promise<NextBookingCurveSourceStoreWriteResult>;
    readLatestBySourceKeys(
        sourceKeys: readonly string[]
    ): Promise<NextBookingCurveSourceRecord[]>;
}

export function createBrowserNextBookingCurveSourceStore(
    windowHost: Window = window
): NextBookingCurveSourceStore {
    return {
        async addAndPrune(records) {
            if (records.length === 0) {
                return { addedCount: 0, deletedCount: 0 };
            }
            if (records.length > NEXT_BOOKING_CURVE_SOURCE_BATCH_LIMIT) {
                throw new Error("Next booking curve store batch exceeds the fixed limit");
            }
            const facilityId = records[0]?.facilityId ?? "";
            if (
                facilityId === ""
                || !records.every((record) => record.facilityId === facilityId)
            ) {
                throw new Error("Next booking curve store batch must contain one facility");
            }

            const database = await openNextBookingCurveDatabase(windowHost);
            try {
                const transaction = database.transaction(
                    NEXT_BOOKING_CURVE_SOURCE_STORE_NAME,
                    "readwrite"
                );
                const completion = waitForTransaction(transaction);
                try {
                    const store = transaction.objectStore(NEXT_BOOKING_CURVE_SOURCE_STORE_NAME);
                    const added = await Promise.all(records.map((record) => addRecord(store, record)));
                    const sourceIndex = store.index(NEXT_BOOKING_CURVE_SOURCE_KEY_INDEX);
                    const sourceRecords = (await Promise.all(Array.from(
                        new Set(records.map((record) => record.sourceKey)),
                        (sourceKey) => readRecordsByIndex(sourceIndex, sourceKey, 2, "prev")
                    ))).flat();
                    const deletedKeys = selectNextBookingCurveSourcePruneKeys(sourceRecords);

                    const facilityIndex = store.index(NEXT_BOOKING_CURVE_FACILITY_INDEX);
                    const facilityCount = await countRecordsByIndex(facilityIndex, facilityId);
                    if (facilityCount - deletedKeys.size > NEXT_BOOKING_CURVE_SOURCE_RETENTION_LIMIT) {
                        const facilityRecords = await readRecordsByIndex(
                            facilityIndex,
                            facilityId,
                            NEXT_BOOKING_CURVE_FACILITY_READ_LIMIT
                        );
                        for (const recordKey of selectNextBookingCurveFacilityPruneKeys(
                            facilityRecords,
                            deletedKeys
                        )) {
                            deletedKeys.add(recordKey);
                        }
                    }
                    await Promise.all(Array.from(deletedKeys, (recordKey) => (
                        deleteRecord(store, recordKey)
                    )));
                    await completion;
                    return {
                        addedCount: added.filter(Boolean).length,
                        deletedCount: deletedKeys.size
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
        async readLatestBySourceKeys(sourceKeys) {
            if (sourceKeys.length === 0) {
                return [];
            }
            const database = await openNextBookingCurveDatabase(windowHost);
            try {
                const transaction = database.transaction(
                    NEXT_BOOKING_CURVE_SOURCE_STORE_NAME,
                    "readonly"
                );
                const completion = waitForTransaction(transaction);
                const index = transaction.objectStore(
                    NEXT_BOOKING_CURVE_SOURCE_STORE_NAME
                ).index(NEXT_BOOKING_CURVE_SOURCE_KEY_INDEX);
                const records = (await Promise.all(Array.from(
                    new Set(sourceKeys),
                    (sourceKey) => readRecordsByIndex(index, sourceKey, 1, "prev")
                ))).flat();
                await completion;
                return records;
            } finally {
                database.close();
            }
        }
    };
}

export function buildNextBookingCurveSourceKey(options: {
    facilityId: string;
    roomGroupId: string | null;
    scope: "hotel" | "roomGroup";
    stayDate: string;
}): string {
    return [
        "next-booking-curve-source",
        `facility:${options.facilityId}`,
        `stayDate:${options.stayDate}`,
        `scope:${options.scope}`,
        `roomGroup:${options.roomGroupId ?? "-"}`
    ].join("|");
}

export function buildNextBookingCurveRecordKey(sourceKey: string, asOfDate: string): string {
    return `${sourceKey}|asOf:${asOfDate}|schema:${BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION}`;
}

export function selectNextBookingCurveSourcePruneKeys(
    records: readonly NextBookingCurveSourceRecord[]
): Set<string> {
    const deletedKeys = new Set<string>();
    const recordsBySource = new Map<string, NextBookingCurveSourceRecord[]>();
    for (const record of records) {
        const bucket = recordsBySource.get(record.sourceKey) ?? [];
        bucket.push(record);
        recordsBySource.set(record.sourceKey, bucket);
    }
    for (const bucket of recordsBySource.values()) {
        const sorted = bucket.slice().sort(compareNewestFirst);
        for (const record of sorted.slice(1)) {
            deletedKeys.add(record.recordKey);
        }
    }
    return deletedKeys;
}

export function selectNextBookingCurveFacilityPruneKeys(
    records: readonly NextBookingCurveSourceRecord[],
    alreadyDeleted: ReadonlySet<string> = new Set()
): Set<string> {
    const retained = records
        .filter((record) => !alreadyDeleted.has(record.recordKey))
        .slice()
        .sort(compareNewestFirst);
    return new Set(
        retained.slice(NEXT_BOOKING_CURVE_SOURCE_RETENTION_LIMIT)
            .map((record) => record.recordKey)
    );
}

export function isNextBookingCurveSourceRecord(
    value: unknown
): value is NextBookingCurveSourceRecord {
    if (!isRecord(value) || !isRecord(value.response)) {
        return false;
    }
    if (!(typeof value.recordKey === "string"
        && typeof value.sourceKey === "string"
        && value.source === "next-bounded-booking-curve"
        && typeof value.firstObservedAsOfDate === "string"
        && (value.landing === null || isNextBookingCurveLandingObservation(value.landing))
        && typeof value.cacheKey === "string"
        && typeof value.facilityId === "string"
        && typeof value.stayDate === "string"
        && typeof value.asOfDate === "string"
        && (value.scope === "hotel" || value.scope === "roomGroup")
        && (value.roomGroupId === null || typeof value.roomGroupId === "string")
        && value.endpoint === BOOKING_CURVE_ENDPOINT
        && typeof value.query === "string"
        && typeof value.fetchedAt === "string"
        && Number.isFinite(Date.parse(value.fetchedAt))
        && value.schemaVersion === BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION
        && typeof value.response.stay_date === "string"
        && Array.isArray(value.response.booking_curve))) {
        return false;
    }
    const record = value as unknown as NextBookingCurveSourceRecord;
    const expectedQuery = record.scope === "hotel"
        ? `date=${record.stayDate}`
        : `date=${record.stayDate}&rm_room_group_id=${record.roomGroupId ?? ""}`;
    const expectedSourceKey = buildNextBookingCurveSourceKey({
        facilityId: record.facilityId,
        roomGroupId: record.roomGroupId,
        scope: record.scope,
        stayDate: record.stayDate
    });
    const expectedCacheKey = buildBookingCurveRawSourceCacheKey({
        facilityId: record.facilityId,
        stayDate: record.stayDate,
        asOfDate: record.asOfDate,
        scope: record.scope,
        ...(record.roomGroupId === null ? {} : { roomGroupId: record.roomGroupId }),
        endpoint: BOOKING_CURVE_ENDPOINT,
        query: expectedQuery
    });
    return /^\d{8}$/u.test(record.stayDate)
        && /^\d{8}$/u.test(record.asOfDate)
        && /^\d{8}$/u.test(record.firstObservedAsOfDate)
        && record.firstObservedAsOfDate <= record.asOfDate
        && (
            record.landing === null
            || (
                record.landing.observedAsOfDate > record.stayDate
                && record.landing.observedAsOfDate <= record.asOfDate
            )
        )
        && (record.scope === "hotel"
            ? record.roomGroupId === null
            : typeof record.roomGroupId === "string" && record.roomGroupId !== "")
        && record.query === expectedQuery
        && record.sourceKey === expectedSourceKey
        && record.recordKey === buildNextBookingCurveRecordKey(expectedSourceKey, record.asOfDate)
        && record.cacheKey === expectedCacheKey
        && record.response.stay_date.replaceAll("-", "") === record.stayDate
        && record.response.booking_curve?.every((point) => (
            isValidBookingCurvePoint(point)
            && isValidStoredObservationDate(
                point.date,
                record.stayDate,
                record.asOfDate,
                record.firstObservedAsOfDate
            )
        )) === true;
}

function isNextBookingCurveLandingObservation(
    value: unknown
): value is NextBookingCurveLandingObservation {
    return isRecord(value)
        && /^\d{8}$/u.test(typeof value.observedAsOfDate === "string"
            ? value.observedAsOfDate
            : "")
        && [value.all, value.transient, value.group].every((rooms) => (
            rooms === null
            || (
                typeof rooms === "number"
                && Number.isFinite(rooms)
                && rooms >= 0
            )
        ));
}

function isValidBookingCurvePoint(value: unknown): boolean {
    if (!isRecord(value) || typeof value.date !== "string") {
        return false;
    }
    return [value.all, value.transient, value.group].every((segment) => (
        segment === undefined
        || (
            isRecord(segment)
            && (
                segment.this_year_room_sum === undefined
                || segment.this_year_room_sum === null
                || (
                    typeof segment.this_year_room_sum === "number"
                    && Number.isFinite(segment.this_year_room_sum)
                    && segment.this_year_room_sum >= 0
                )
            )
        )
    ));
}

function isValidStoredObservationDate(
    value: string,
    stayDate: string,
    asOfDate: string,
    firstObservedAsOfDate: string
): boolean {
    const observedDate = value.replaceAll("-", "");
    return /^\d{8}$/u.test(observedDate)
        && observedDate <= stayDate
        && observedDate <= asOfDate
        && (
            observedDate !== stayDate
            || firstObservedAsOfDate <= stayDate
        );
}

function openNextBookingCurveDatabase(windowHost: Window): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = windowHost.indexedDB.open(
            NEXT_BOOKING_CURVE_SOURCE_DB_NAME,
            NEXT_BOOKING_CURVE_SOURCE_DB_VERSION
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
            if (database.objectStoreNames.contains(NEXT_BOOKING_CURVE_SOURCE_STORE_NAME)) {
                return;
            }
            const store = database.createObjectStore(NEXT_BOOKING_CURVE_SOURCE_STORE_NAME, {
                keyPath: "recordKey"
            });
            store.createIndex(
                NEXT_BOOKING_CURVE_SOURCE_KEY_INDEX,
                "sourceKey",
                { unique: false }
            );
            store.createIndex(NEXT_BOOKING_CURVE_FACILITY_INDEX, "facilityId", { unique: false });
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
            fail(request.error ?? new Error("failed to open Next booking curve database"));
        };
        request.onblocked = () => {
            fail(new Error("Next booking curve database open blocked"));
        };
    });
}

function addRecord(
    store: IDBObjectStore,
    record: NextBookingCurveSourceRecord
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
            reject(request.error ?? new Error("failed to add Next booking curve record"));
        };
    });
}

function countRecordsByIndex(index: IDBIndex, key: IDBValidKey): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = index.count(IDBKeyRange.only(key));
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to count Next booking curve records"));
        };
    });
}

function readRecordsByIndex(
    index: IDBIndex,
    key: IDBValidKey,
    limit: number,
    direction: IDBCursorDirection = "next"
): Promise<NextBookingCurveSourceRecord[]> {
    return new Promise((resolve, reject) => {
        const records: NextBookingCurveSourceRecord[] = [];
        const request = index.openCursor(IDBKeyRange.only(key), direction);
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor === null || records.length >= limit) {
                resolve(records);
                return;
            }
            records.push(cursor.value as NextBookingCurveSourceRecord);
            cursor.continue();
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to read Next booking curve records"));
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
            reject(request.error ?? new Error("failed to prune Next booking curve record"));
        };
    });
}

function compareNewestFirst(
    left: NextBookingCurveSourceRecord,
    right: NextBookingCurveSourceRecord
): number {
    return right.asOfDate.localeCompare(left.asOfDate)
        || right.fetchedAt.localeCompare(left.fetchedAt)
        || right.recordKey.localeCompare(left.recordKey);
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = () => {
            reject(transaction.error ?? new Error("Next booking curve transaction failed"));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error("Next booking curve transaction aborted"));
        };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
