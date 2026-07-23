import {
    COMPETITOR_PRICE_ENDPOINT,
    COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
    COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
    COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
    COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
    buildCompetitorPriceConditionSignature,
    type CompetitorPriceRequestContextBase,
    type CompetitorPriceSnapshotCompetitor,
    type CompetitorPriceSnapshotHotel,
    type CompetitorPriceSnapshotPair,
    type CompetitorPriceSnapshotPayload,
    type CompetitorPriceSnapshotPlan,
    type CompetitorPriceSnapshotRecord,
    type CompetitorPriceSnapshotSearchCondition,
    type CompetitorPriceSnapshotSeries,
    type PersistCompetitorPriceSnapshotOptions,
    type PersistCompetitorPriceSnapshotResult
} from "./competitorPriceSnapshotContract";

export {
    COMPETITOR_PRICE_ENDPOINT,
    COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
    COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
    COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
    COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
    buildCompetitorPriceConditionSignature
} from "./competitorPriceSnapshotContract";
export type {
    CompetitorPriceRequestContextBase,
    CompetitorPriceSnapshotCompetitor,
    CompetitorPriceSnapshotHotel,
    CompetitorPriceSnapshotPair,
    CompetitorPriceSnapshotPayload,
    CompetitorPriceSnapshotPlan,
    CompetitorPriceSnapshotRecord,
    CompetitorPriceSnapshotSearchCondition,
    CompetitorPriceSnapshotSeries,
    PersistCompetitorPriceSnapshotOptions,
    PersistCompetitorPriceSnapshotResult
} from "./competitorPriceSnapshotContract";
const COMPETITORS_ENDPOINT = "/api/v2/competitors";
const DEFAULT_MIN_NUM_GUESTS = 1;
const DEFAULT_MAX_NUM_GUESTS = 6;

interface CompetitorApiEntry {
    yad_no?: string;
    name?: string;
}

interface CompetitorPriceApiPlan {
    num_guests?: number;
    meal_type?: string | null;
    plan_name?: string | null;
    jalan_facility_room_type?: string | null;
    url?: string | null;
    price?: number | null;
    price_diff?: number | null;
}

interface CompetitorPriceApiHotel {
    yad_no?: string;
    plans?: CompetitorPriceApiPlan[];
}

interface CompetitorPriceApiResponse {
    own?: CompetitorPriceApiHotel;
    competitors?: CompetitorPriceApiHotel[];
}

interface CompetitorPriceRequestContext {
    searchCondition: CompetitorPriceSnapshotSearchCondition;
    competitorSet: CompetitorPriceSnapshotCompetitor[];
    endpoint: string;
    query: string;
    url: string;
    conditionSignature: string;
}

const pendingCompetitorPriceSnapshotWrites = new Map<string, Promise<PersistCompetitorPriceSnapshotResult>>();

export async function persistCompetitorPriceSnapshot(
    options: PersistCompetitorPriceSnapshotOptions
): Promise<PersistCompetitorPriceSnapshotResult> {
    const requestContext = buildCompetitorPriceRequestContext(
        options.stayDate,
        options.jalanRoomTypes ?? null,
        options.requestContextBase ?? await loadCompetitorPriceRequestContextBase()
    );
    if (requestContext === null) {
        return {
            stored: false,
            record: null,
            previousRecord: null,
            reason: "no-competitors"
        };
    }

    const pendingKey = [
        options.facilityId,
        requestContext.conditionSignature,
        requestContext.query
    ].join("|");
    const pending = pendingCompetitorPriceSnapshotWrites.get(pendingKey);
    if (pending !== undefined) {
        return pending;
    }

    const request = persistCompetitorPriceSnapshotInternal(options, requestContext)
        .finally(() => {
            pendingCompetitorPriceSnapshotWrites.delete(pendingKey);
        });
    pendingCompetitorPriceSnapshotWrites.set(pendingKey, request);
    return request;
}

export async function readLatestCompetitorPriceSnapshot(
    facilityId: string,
    conditionSignature: string
): Promise<CompetitorPriceSnapshotRecord | undefined> {
    if (!isIndexedDbAvailable()) {
        return undefined;
    }

    return withCompetitorPriceSnapshotStore("readonly", async (store) => {
        const index = store.index("facility-condition");
        const snapshots = await getSnapshotRecordsByFacilityAndCondition(index, facilityId, conditionSignature);
        return selectLatestCompetitorPriceSnapshotRecord(snapshots);
    });
}

export async function readLatestCompetitorPriceSnapshotPairForStayDate(
    facilityId: string,
    stayDate: string
): Promise<CompetitorPriceSnapshotPair> {
    const series = await readCompetitorPriceSnapshotSeriesForStayDate(facilityId, stayDate);
    return {
        latestRecord: series.latestRecord,
        previousRecord: series.previousRecord
    };
}

export async function readCompetitorPriceSnapshotSeriesForStayDate(
    facilityId: string,
    stayDate: string
): Promise<CompetitorPriceSnapshotSeries> {
    if (!isIndexedDbAvailable()) {
        return {
            records: [],
            latestRecord: null,
            previousRecord: null
        };
    }

    return withCompetitorPriceSnapshotStore("readonly", async (store) => {
        const index = store.index("facility-stay-date");
        const snapshots = await getSnapshotRecordsByFacilityAndStayDate(index, facilityId, stayDate);
        return buildCompetitorPriceSnapshotSeries(snapshots);
    });
}

function buildCompetitorPriceSnapshotSeries(snapshots: CompetitorPriceSnapshotRecord[]): CompetitorPriceSnapshotSeries {
    const records = snapshots
        .slice()
        .sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt));
    let latestUnspecifiedRecord: CompetitorPriceSnapshotRecord | null = null;
    for (const record of records) {
        if (
            latestUnspecifiedRecord === null
            && isUnspecifiedCompetitorPriceSnapshotRecord(record)
        ) {
            latestUnspecifiedRecord = record;
        } else if (
            latestUnspecifiedRecord !== null
            && isUnspecifiedCompetitorPriceSnapshotRecord(record)
            && record.fetchedAt.localeCompare(latestUnspecifiedRecord.fetchedAt) > 0
        ) {
            latestUnspecifiedRecord = record;
        }
    }
    const latestRecord = latestUnspecifiedRecord
        ?? records[records.length - 1]
        ?? null;
    if (latestRecord === null) {
        return {
            records,
            latestRecord: null,
            previousRecord: null
        };
    }

    let previousRecord: CompetitorPriceSnapshotRecord | null = null;
    for (const record of records) {
        if (
            record.snapshotKey === latestRecord.snapshotKey
            || record.conditionSignature !== latestRecord.conditionSignature
        ) {
            continue;
        }
        if (previousRecord === null || record.fetchedAt.localeCompare(previousRecord.fetchedAt) > 0) {
            previousRecord = record;
        }
    }

    return {
        records,
        latestRecord,
        previousRecord
    };
}

function selectLatestCompetitorPriceSnapshotRecord(
    records: CompetitorPriceSnapshotRecord[]
): CompetitorPriceSnapshotRecord | undefined {
    return records.reduce<CompetitorPriceSnapshotRecord | undefined>((latest, record) => {
        if (latest === undefined) {
            return record;
        }
        return record.fetchedAt.localeCompare(latest.fetchedAt) > 0 ? record : latest;
    }, undefined);
}

function isUnspecifiedCompetitorPriceSnapshotRecord(record: CompetitorPriceSnapshotRecord): boolean {
    return (record.searchConditionRaw.jalanRoomTypes ?? []).length === 0;
}

async function persistCompetitorPriceSnapshotInternal(
    options: PersistCompetitorPriceSnapshotOptions,
    requestContext: CompetitorPriceRequestContext
): Promise<PersistCompetitorPriceSnapshotResult> {
    if (!isIndexedDbAvailable()) {
        return {
            stored: false,
            record: null,
            previousRecord: null,
            reason: "indexeddb-unavailable"
        };
    }

    const [previousRecord, response] = await Promise.all([
        readLatestCompetitorPriceSnapshot(options.facilityId, requestContext.conditionSignature),
        loadCompetitorPrices(requestContext.url)
    ]);
    const fetchedAt = new Date().toISOString();
    const record: CompetitorPriceSnapshotRecord = {
        snapshotKey: buildCompetitorPriceSnapshotKey(options.facilityId, requestContext.conditionSignature, fetchedAt),
        facilityId: options.facilityId,
        stayDate: requestContext.searchCondition.stayDate,
        conditionSignature: requestContext.conditionSignature,
        searchConditionRaw: requestContext.searchCondition,
        fetchedAt,
        source: options.source ?? "analyze-open",
        endpoint: requestContext.endpoint,
        query: requestContext.query,
        schemaVersion: COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
        competitorSet: requestContext.competitorSet,
        payload: compactCompetitorPriceResponse(response)
    };

    await withCompetitorPriceSnapshotStore("readwrite", (store) => putSnapshotRecord(store, record));

    return {
        stored: true,
        record,
        previousRecord: previousRecord ?? null
    };
}

function buildCompetitorPriceRequestContext(
    stayDate: string,
    jalanRoomTypes: string[] | null,
    requestContextBase: CompetitorPriceRequestContextBase
): CompetitorPriceRequestContext | null {
    const { competitorSet } = requestContextBase;
    if (competitorSet.length === 0) {
        return null;
    }

    const searchCondition: CompetitorPriceSnapshotSearchCondition = {
        stayDate,
        minNumGuests: DEFAULT_MIN_NUM_GUESTS,
        maxNumGuests: DEFAULT_MAX_NUM_GUESTS,
        competitorYadNos: competitorSet.map((competitor) => competitor.yadNo),
        jalanRoomTypes,
        mealTypes: null,
        planNameWords: null,
        planNameContains: null
    };
    const url = new URL(COMPETITOR_PRICE_ENDPOINT, window.location.origin);
    url.searchParams.set("date", searchCondition.stayDate);
    url.searchParams.set("min_num_guests", String(searchCondition.minNumGuests));
    url.searchParams.set("max_num_guests", String(searchCondition.maxNumGuests));
    for (const yadNo of searchCondition.competitorYadNos) {
        url.searchParams.append("yad_nos[]", yadNo);
    }
    for (const roomType of searchCondition.jalanRoomTypes ?? []) {
        url.searchParams.append("jalan_room_types[]", roomType);
    }

    return {
        searchCondition,
        competitorSet,
        endpoint: COMPETITOR_PRICE_ENDPOINT,
        query: url.searchParams.toString(),
        url: url.toString(),
        conditionSignature: buildCompetitorPriceConditionSignature(searchCondition)
    };
}

export async function loadCompetitorPriceRequestContextBase(): Promise<CompetitorPriceRequestContextBase> {
    const competitors = await loadCompetitors();
    return {
        competitorSet: competitors
            .map((competitor) => ({
                yadNo: normalizeString(competitor.yad_no),
                name: normalizeString(competitor.name)
            }))
            .filter((competitor): competitor is CompetitorPriceSnapshotCompetitor => (
                competitor.yadNo !== null
                && competitor.name !== null
            ))
    };
}

async function loadCompetitors(): Promise<CompetitorApiEntry[]> {
    const response = await fetch(new URL(COMPETITORS_ENDPOINT, window.location.origin).toString(), {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new Error(`competitors request failed: ${response.status}`);
    }

    return (await response.json()) as CompetitorApiEntry[];
}

async function loadCompetitorPrices(url: string): Promise<CompetitorPriceApiResponse> {
    const response = await fetch(url, {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new Error(`competitor prices request failed: ${response.status}`);
    }

    return (await response.json()) as CompetitorPriceApiResponse;
}

function compactCompetitorPriceResponse(response: CompetitorPriceApiResponse): CompetitorPriceSnapshotPayload {
    return {
        own: compactCompetitorPriceHotel(response.own),
        competitors: (response.competitors ?? [])
            .map(compactCompetitorPriceHotel)
            .filter((hotel): hotel is CompetitorPriceSnapshotHotel => hotel !== null)
    };
}

function compactCompetitorPriceHotel(hotel: CompetitorPriceApiHotel | undefined): CompetitorPriceSnapshotHotel | null {
    const yadNo = normalizeString(hotel?.yad_no);
    if (yadNo === null) {
        return null;
    }

    return {
        yadNo,
        plans: (hotel?.plans ?? []).map((plan) => compactCompetitorPricePlan(yadNo, plan))
    };
}

function compactCompetitorPricePlan(yadNo: string, plan: CompetitorPriceApiPlan): CompetitorPriceSnapshotPlan {
    return {
        yadNo,
        numGuests: typeof plan.num_guests === "number" ? plan.num_guests : null,
        mealType: normalizeString(plan.meal_type),
        planName: normalizeString(plan.plan_name),
        jalanFacilityRoomType: normalizeString(plan.jalan_facility_room_type),
        url: normalizeString(plan.url),
        price: typeof plan.price === "number" ? plan.price : null,
        priceDiff: typeof plan.price_diff === "number" ? plan.price_diff : null
    };
}

function buildCompetitorPriceSnapshotKey(
    facilityId: string,
    conditionSignature: string,
    fetchedAt: string
): string {
    return [
        `facility:${facilityId}`,
        `condition:${conditionSignature}`,
        `fetchedAt:${fetchedAt}`,
        `schema:${COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION}`
    ].join("|");
}

async function withCompetitorPriceSnapshotStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
    const database = await openCompetitorPriceSnapshotDatabase();
    try {
        const transaction = database.transaction(COMPETITOR_PRICE_SNAPSHOT_STORE_NAME, mode);
        const store = transaction.objectStore(COMPETITOR_PRICE_SNAPSHOT_STORE_NAME);
        const result = await run(store);
        await waitForTransaction(transaction);
        return result;
    } finally {
        database.close();
    }
}

function openCompetitorPriceSnapshotDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(COMPETITOR_PRICE_SNAPSHOT_DB_NAME, COMPETITOR_PRICE_SNAPSHOT_DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(COMPETITOR_PRICE_SNAPSHOT_STORE_NAME)) {
                const store = database.createObjectStore(COMPETITOR_PRICE_SNAPSHOT_STORE_NAME, {
                    keyPath: "snapshotKey"
                });
                store.createIndex("facility-condition", ["facilityId", "conditionSignature"], {
                    unique: false
                });
                store.createIndex("facility-stay-date", ["facilityId", "stayDate"], {
                    unique: false
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to open competitor price snapshot database"));
        };

        request.onblocked = () => {
            reject(new Error("competitor price snapshot database open blocked"));
        };
    });
}

function putSnapshotRecord(store: IDBObjectStore, record: CompetitorPriceSnapshotRecord): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.put(record);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to write competitor price snapshot record"));
        };
    });
}

function getSnapshotRecordsByFacilityAndCondition(
    index: IDBIndex,
    facilityId: string,
    conditionSignature: string
): Promise<CompetitorPriceSnapshotRecord[]> {
    return new Promise((resolve, reject) => {
        const request = index.getAll([facilityId, conditionSignature]);

        request.onsuccess = () => {
            resolve(request.result as CompetitorPriceSnapshotRecord[]);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to read competitor price snapshot records"));
        };
    });
}

function getSnapshotRecordsByFacilityAndStayDate(
    index: IDBIndex,
    facilityId: string,
    stayDate: string
): Promise<CompetitorPriceSnapshotRecord[]> {
    return new Promise((resolve, reject) => {
        const request = index.getAll([facilityId, stayDate]);

        request.onsuccess = () => {
            resolve(request.result as CompetitorPriceSnapshotRecord[]);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to read competitor price snapshot records by stay date"));
        };
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(transaction.error ?? new Error("competitor price snapshot transaction failed"));
        };

        transaction.onabort = () => {
            reject(transaction.error ?? new Error("competitor price snapshot transaction aborted"));
        };
    });
}

function normalizeString(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
}

function isIndexedDbAvailable(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
}
