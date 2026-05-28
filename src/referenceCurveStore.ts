import type { CurveScope, CurveSegment, ReferenceCurveKind, ReferenceCurveResult } from "./curveCore";
import { createIntervalRequestScheduler } from "./requestScheduler";

const REFERENCE_CURVE_DB_NAME = "revenue-assistant-reference-curves";
const REFERENCE_CURVE_DB_VERSION = 1;
const REFERENCE_CURVE_STORE_NAME = "reference-curve-results";
const DEFAULT_REFERENCE_CURVE_REQUEST_CONCURRENCY = 3;
const DEFAULT_REFERENCE_CURVE_REQUEST_INTERVAL_MS = 1000;

export interface ReferenceCurveCacheKeyParts {
    facilityId: string;
    scope: CurveScope;
    roomGroupId?: string;
    targetStayDate?: string;
    targetMonth?: string;
    weekday?: number;
    asOfDate: string;
    segment: CurveSegment;
    curveKind: ReferenceCurveKind;
    algorithmVersion: string;
}

export interface ReferenceCurveRecord {
    cacheKey: string;
    facilityId: string;
    scope: CurveScope;
    roomGroupId: string | null;
    targetStayDate: string | null;
    targetMonth: string | null;
    weekday: number | null;
    asOfDate: string;
    segment: CurveSegment;
    curveKind: ReferenceCurveKind;
    algorithmVersion: string;
    storedAt: string;
    result: ReferenceCurveResult;
}

export interface GetOrComputeReferenceCurveOptions {
    cacheKey: string;
    compute: () => Promise<ReferenceCurveResult>;
}

const pendingReferenceCurveComputations = new Map<string, Promise<ReferenceCurveResult>>();
const referenceCurveRequestScheduler = createIntervalRequestScheduler({
    concurrency: DEFAULT_REFERENCE_CURVE_REQUEST_CONCURRENCY,
    intervalMs: DEFAULT_REFERENCE_CURVE_REQUEST_INTERVAL_MS
});

export function setReferenceCurveRequestConcurrency(concurrency: number): void {
    referenceCurveRequestScheduler.setConcurrency(concurrency);
}

export function buildReferenceCurveCacheKey(parts: ReferenceCurveCacheKeyParts): string {
    return [
        `facility:${parts.facilityId}`,
        `scope:${parts.scope}`,
        `roomGroup:${parts.roomGroupId ?? "-"}`,
        `targetStayDate:${parts.targetStayDate ?? "-"}`,
        `targetMonth:${parts.targetMonth ?? "-"}`,
        `weekday:${parts.weekday ?? "-"}`,
        `asOf:${parts.asOfDate}`,
        `segment:${parts.segment}`,
        `kind:${parts.curveKind}`,
        `version:${parts.algorithmVersion}`
    ].join("|");
}

export function buildReferenceCurveRecord(result: ReferenceCurveResult): ReferenceCurveRecord {
    const cacheKey = buildReferenceCurveCacheKey({
        facilityId: result.facilityId,
        scope: result.scope,
        ...(result.roomGroupId === undefined ? {} : { roomGroupId: result.roomGroupId }),
        ...(result.targetStayDate === undefined ? {} : { targetStayDate: result.targetStayDate }),
        ...(result.targetMonth === undefined ? {} : { targetMonth: result.targetMonth }),
        ...(result.weekday === undefined ? {} : { weekday: result.weekday }),
        asOfDate: result.asOfDate,
        segment: result.segment,
        curveKind: result.curveKind,
        algorithmVersion: result.algorithmVersion
    });

    return {
        cacheKey,
        facilityId: result.facilityId,
        scope: result.scope,
        roomGroupId: result.roomGroupId ?? null,
        targetStayDate: result.targetStayDate ?? null,
        targetMonth: result.targetMonth ?? null,
        weekday: result.weekday ?? null,
        asOfDate: result.asOfDate,
        segment: result.segment,
        curveKind: result.curveKind,
        algorithmVersion: result.algorithmVersion,
        storedAt: new Date().toISOString(),
        result
    };
}

export async function getOrComputeReferenceCurve(options: GetOrComputeReferenceCurveOptions): Promise<ReferenceCurveResult> {
    const pending = pendingReferenceCurveComputations.get(options.cacheKey);
    if (pending !== undefined) {
        return pending;
    }

    const request = getOrComputeReferenceCurveInternal(options)
        .finally(() => {
            pendingReferenceCurveComputations.delete(options.cacheKey);
        });

    pendingReferenceCurveComputations.set(options.cacheKey, request);
    return request;
}

export function scheduleReferenceCurveRequest<T>(requestKey: string, run: () => Promise<T>): Promise<T> {
    return referenceCurveRequestScheduler.schedule(requestKey, run);
}

export async function readReferenceCurveRecord(cacheKey: string): Promise<ReferenceCurveRecord | undefined> {
    if (!isIndexedDbAvailable()) {
        return undefined;
    }

    return withReferenceCurveStore("readonly", (store) => getReferenceCurveRecord(store, cacheKey));
}

export async function writeReferenceCurveRecord(record: ReferenceCurveRecord): Promise<void> {
    if (!isIndexedDbAvailable()) {
        return;
    }

    await withReferenceCurveStore("readwrite", (store) => putReferenceCurveRecord(store, record));
}

async function getOrComputeReferenceCurveInternal(options: GetOrComputeReferenceCurveOptions): Promise<ReferenceCurveResult> {
    const existingRecord = await readReferenceCurveRecord(options.cacheKey);
    if (existingRecord !== undefined) {
        return existingRecord.result;
    }

    const result = await options.compute();
    await writeReferenceCurveRecord(buildReferenceCurveRecord(result));
    return result;
}

async function withReferenceCurveStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
    const database = await openReferenceCurveDatabase();
    try {
        const transaction = database.transaction(REFERENCE_CURVE_STORE_NAME, mode);
        const store = transaction.objectStore(REFERENCE_CURVE_STORE_NAME);
        const result = await run(store);
        await waitForTransaction(transaction);
        return result;
    } finally {
        database.close();
    }
}

function openReferenceCurveDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(REFERENCE_CURVE_DB_NAME, REFERENCE_CURVE_DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(REFERENCE_CURVE_STORE_NAME)) {
                const store = database.createObjectStore(REFERENCE_CURVE_STORE_NAME, {
                    keyPath: "cacheKey"
                });
                store.createIndex("facility-asof", ["facilityId", "asOfDate"], {
                    unique: false
                });
                store.createIndex("facility-kind-version", ["facilityId", "curveKind", "algorithmVersion"], {
                    unique: false
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to open reference curve database"));
        };

        request.onblocked = () => {
            reject(new Error("reference curve database open blocked"));
        };
    });
}

function getReferenceCurveRecord(
    store: IDBObjectStore,
    cacheKey: string
): Promise<ReferenceCurveRecord | undefined> {
    return new Promise((resolve, reject) => {
        const request = store.get(cacheKey);

        request.onsuccess = () => {
            resolve(request.result as ReferenceCurveRecord | undefined);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to read reference curve record"));
        };
    });
}

function putReferenceCurveRecord(store: IDBObjectStore, record: ReferenceCurveRecord): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.put(record);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to write reference curve record"));
        };
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(transaction.error ?? new Error("reference curve transaction failed"));
        };

        transaction.onabort = () => {
            reject(transaction.error ?? new Error("reference curve transaction aborted"));
        };
    });
}

function isIndexedDbAvailable(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
}
