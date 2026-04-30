const COMPETITOR_PRICE_SNAPSHOT_DB_NAME = "revenue-assistant-competitor-price-snapshots";
const COMPETITOR_PRICE_SNAPSHOT_DB_VERSION = 1;
const COMPETITOR_PRICE_SNAPSHOT_STORE_NAME = "competitor-price-snapshots";
const COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION = "competitor_price_snapshot:v1";
const COMPETITOR_PRICE_ENDPOINT = "/api/v5/competitor_prices";
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

export interface CompetitorPriceSnapshotCompetitor {
    yadNo: string;
    name: string;
}

export interface CompetitorPriceSnapshotSearchCondition {
    stayDate: string;
    minNumGuests: number;
    maxNumGuests: number;
    competitorYadNos: string[];
    mealTypes: string[] | null;
    planNameWords: string[] | null;
    planNameContains: boolean | null;
}

export interface CompetitorPriceSnapshotPlan {
    yadNo: string;
    numGuests: number | null;
    mealType: string | null;
    planName: string | null;
    jalanFacilityRoomType: string | null;
    url: string | null;
    price: number | null;
    priceDiff: number | null;
}

export interface CompetitorPriceSnapshotHotel {
    yadNo: string;
    plans: CompetitorPriceSnapshotPlan[];
}

export interface CompetitorPriceSnapshotPayload {
    own: CompetitorPriceSnapshotHotel | null;
    competitors: CompetitorPriceSnapshotHotel[];
}

export interface CompetitorPriceSnapshotRecord {
    snapshotKey: string;
    facilityId: string;
    stayDate: string;
    conditionSignature: string;
    searchConditionRaw: CompetitorPriceSnapshotSearchCondition;
    fetchedAt: string;
    source: "analyze-open" | "competitor-tab";
    endpoint: string;
    query: string;
    schemaVersion: string;
    competitorSet: CompetitorPriceSnapshotCompetitor[];
    payload: CompetitorPriceSnapshotPayload;
}

export interface PersistCompetitorPriceSnapshotOptions {
    facilityId: string;
    stayDate: string;
    source?: "analyze-open" | "competitor-tab";
}

export interface PersistCompetitorPriceSnapshotResult {
    stored: boolean;
    record: CompetitorPriceSnapshotRecord | null;
    previousRecord: CompetitorPriceSnapshotRecord | null;
    reason?: "indexeddb-unavailable" | "no-competitors";
}

export interface CompetitorPriceSnapshotPair {
    latestRecord: CompetitorPriceSnapshotRecord | null;
    previousRecord: CompetitorPriceSnapshotRecord | null;
}

export interface CompetitorPriceSnapshotSeries {
    records: CompetitorPriceSnapshotRecord[];
    latestRecord: CompetitorPriceSnapshotRecord | null;
    previousRecord: CompetitorPriceSnapshotRecord | null;
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

export function buildCompetitorPriceConditionSignature(condition: CompetitorPriceSnapshotSearchCondition): string {
    return stableStringify({
        stayDate: condition.stayDate,
        minNumGuests: condition.minNumGuests,
        maxNumGuests: condition.maxNumGuests,
        competitorYadNos: condition.competitorYadNos.slice().sort(),
        mealTypes: condition.mealTypes === null ? null : condition.mealTypes.slice().sort(),
        planNameWords: condition.planNameWords === null ? null : condition.planNameWords.slice().sort(),
        planNameContains: condition.planNameContains
    });
}

export async function persistCompetitorPriceSnapshot(
    options: PersistCompetitorPriceSnapshotOptions
): Promise<PersistCompetitorPriceSnapshotResult> {
    const requestContext = await buildCompetitorPriceRequestContext(options.stayDate);
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
        return snapshots
            .slice()
            .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];
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
    const latestRecord = records[records.length - 1] ?? null;
    if (latestRecord === null) {
        return {
            records,
            latestRecord: null,
            previousRecord: null
        };
    }

    const previousRecord = records
        .filter((snapshot) => (
            snapshot.snapshotKey !== latestRecord.snapshotKey
            && snapshot.conditionSignature === latestRecord.conditionSignature
        ))
        .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0] ?? null;

    return {
        records,
        latestRecord,
        previousRecord
    };
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

    const previousRecord = await readLatestCompetitorPriceSnapshot(
        options.facilityId,
        requestContext.conditionSignature
    );
    const response = await loadCompetitorPrices(requestContext.url);
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

async function buildCompetitorPriceRequestContext(stayDate: string): Promise<CompetitorPriceRequestContext | null> {
    const competitors = await loadCompetitors();
    const competitorSet = competitors
        .map((competitor) => ({
            yadNo: normalizeString(competitor.yad_no),
            name: normalizeString(competitor.name)
        }))
        .filter((competitor): competitor is CompetitorPriceSnapshotCompetitor => (
            competitor.yadNo !== null
            && competitor.name !== null
        ));

    if (competitorSet.length === 0) {
        return null;
    }

    const searchCondition: CompetitorPriceSnapshotSearchCondition = {
        stayDate,
        minNumGuests: DEFAULT_MIN_NUM_GUESTS,
        maxNumGuests: DEFAULT_MAX_NUM_GUESTS,
        competitorYadNos: competitorSet.map((competitor) => competitor.yadNo),
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

    return {
        searchCondition,
        competitorSet,
        endpoint: COMPETITOR_PRICE_ENDPOINT,
        query: url.searchParams.toString(),
        url: url.toString(),
        conditionSignature: buildCompetitorPriceConditionSignature(searchCondition)
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

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }

    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
            .join(",")}}`;
    }

    return JSON.stringify(value);
}

function isIndexedDbAvailable(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
}
