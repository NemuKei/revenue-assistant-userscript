const PRICE_TREND_DB_NAME = "revenue-assistant-price-trends";
const PRICE_TREND_DB_VERSION = 1;
const PRICE_TREND_STORE_NAME = "price-trend-records";
const PRICE_TREND_SCHEMA_VERSION = "price_trend:v1";
const PRICE_TRENDS_ENDPOINT = "/api/v1/price_trends";
const YAD_INFO_ENDPOINT = "/api/v2/yad/info";
const COMPETITORS_ENDPOINT = "/api/v2/competitors";

export const PRICE_TREND_GUEST_COUNTS = [1, 2, 3, 4] as const;
export type PriceTrendGuestCount = typeof PRICE_TREND_GUEST_COUNTS[number];
export const PRICE_TREND_MEAL_TYPE_REQUESTS = ["NONE", "BREAKFAST", "DINNER", "BREAKFAST_DINNER"] as const;
export type PriceTrendMealTypeRequest = typeof PRICE_TREND_MEAL_TYPE_REQUESTS[number];
export const PRICE_TREND_ROOM_TYPE_REQUESTS = ["SINGLE", "DOUBLE", "TWIN", "TRIPLE", "FOUR_BEDS", "WASHITSU", "WAYOUSHITSU"] as const;
export type PriceTrendRoomTypeRequest = typeof PRICE_TREND_ROOM_TYPE_REQUESTS[number];

export interface PriceTrendRequestScope {
    numGuests: PriceTrendGuestCount;
    mealType: PriceTrendMealTypeRequest;
    roomType: PriceTrendRoomTypeRequest | null;
}

interface PriceTrendYadInfoApiResponse {
    yad_no?: string | number | null;
    name?: string | null;
    yad_name?: string | null;
}

interface PriceTrendCompetitorApiEntry {
    yad_no?: string | number | null;
    name?: string | null;
}

interface PriceTrendApiPoint {
    date?: string | null;
    lead_time_days?: number | null;
    jalan_min_price?: number | null;
    jalan_min_price_status?: string | null;
}

interface PriceTrendApiYad {
    yad_no?: string | number | null;
    price_trends?: PriceTrendApiPoint[] | null;
}

interface PriceTrendApiResponse {
    stay_date?: string | null;
    latest_source_updated_at?: string | null;
    yads?: PriceTrendApiYad[] | null;
}

export interface PriceTrendFacility {
    yadNo: string;
    name: string;
    role: "own" | "competitor";
}

export interface PriceTrendScope {
    stayDate: string;
    numGuests: PriceTrendGuestCount;
    mealType: string;
    roomType: string | null;
    roomTypeLabel: string | null;
    yadNos: string[];
    source: "price-trends-tab";
}

export interface PriceTrendPoint {
    date: string | null;
    leadTimeDays: number;
    priceIncludingTax: number | null;
    status: string | null;
}

export interface PriceTrendYadSeries {
    yadNo: string;
    points: PriceTrendPoint[];
}

export interface PriceTrendPayload {
    stayDate: string;
    latestSourceUpdatedAt: string | null;
    yads: PriceTrendYadSeries[];
}

export interface PriceTrendRecord {
    recordKey: string;
    facilityId: string;
    stayDate: string;
    numGuests: PriceTrendGuestCount;
    mealType: string;
    roomType: string | null;
    roomTypeLabel: string | null;
    fetchedAt: string;
    endpoint: string;
    query: string;
    schemaVersion: string;
    facilities: PriceTrendFacility[];
    scope: PriceTrendScope;
    payload: PriceTrendPayload;
}

export interface FetchAndPersistPriceTrendOptions {
    facilityId: string;
    stayDate: string;
    scopes?: readonly PriceTrendRequestScope[];
    requestContext?: PriceTrendRequestContext;
}

export interface FetchAndPersistPriceTrendResult {
    stored: boolean;
    records: PriceTrendRecord[];
    reason?: "indexeddb-unavailable" | "no-yad-nos" | "unsupported-stay-date";
}

export interface PriceTrendRequestContext {
    facilities: PriceTrendFacility[];
    ownYadNo: string;
    competitorYadNos: string[];
}

const pendingPriceTrendWrites = new Map<string, Promise<FetchAndPersistPriceTrendResult>>();

export async function fetchAndPersistPriceTrendRecords(
    options: FetchAndPersistPriceTrendOptions
): Promise<FetchAndPersistPriceTrendResult> {
    const pendingKey = `${options.facilityId}|${options.stayDate}|${buildPriceTrendScopeListKey(options.scopes)}`;
    const pending = pendingPriceTrendWrites.get(pendingKey);
    if (pending !== undefined) {
        return pending;
    }

    const request = fetchAndPersistPriceTrendRecordsInternal(options)
        .finally(() => {
            pendingPriceTrendWrites.delete(pendingKey);
        });
    pendingPriceTrendWrites.set(pendingKey, request);
    return request;
}

export async function readLatestPriceTrendRecordsForStayDate(
    facilityId: string,
    stayDate: string
): Promise<PriceTrendRecord[]> {
    if (!isIndexedDbAvailable()) {
        return [];
    }

    return withPriceTrendStore("readonly", async (store) => {
        const index = store.index("facility-stayDate");
        const records = await getPriceTrendRecordsByFacilityAndStayDate(index, facilityId, stayDate);
        return selectLatestPriceTrendRecords(records);
    });
}

async function fetchAndPersistPriceTrendRecordsInternal(
    options: FetchAndPersistPriceTrendOptions
): Promise<FetchAndPersistPriceTrendResult> {
    const requestContext = options.requestContext ?? await loadPriceTrendRequestContext();
    const yadNos = [requestContext.ownYadNo, ...requestContext.competitorYadNos].filter((yadNo) => yadNo !== "");
    if (yadNos.length === 0) {
        return {
            stored: false,
            records: [],
            reason: "no-yad-nos"
        };
    }

    const fetchedAt = new Date().toISOString();
    const records: PriceTrendRecord[] = [];
    const scopes = options.scopes ?? buildAllPriceTrendRequestScopes();
    for (const scope of scopes) {
        const request = buildPriceTrendRequest(options.stayDate, scope.numGuests, scope.mealType, scope.roomType, yadNos);
        const response = await fetch(request.url, {
            credentials: "include",
            headers: {
                "x-requested-with": "XMLHttpRequest"
            }
        });
        if (!response.ok) {
            throw new Error(`price trends request failed: ${response.status}`);
        }
        const apiResponse = await response.json() as PriceTrendApiResponse;
        records.push(buildPriceTrendRecord({
            facilityId: options.facilityId,
            stayDate: options.stayDate,
            numGuests: scope.numGuests,
            mealType: scope.mealType,
            roomType: scope.roomType,
            roomTypeLabel: formatPriceTrendRoomTypeRequestLabel(scope.roomType),
            fetchedAt,
            endpoint: PRICE_TRENDS_ENDPOINT,
            query: request.query,
            facilities: requestContext.facilities,
            scopeYadNos: yadNos,
            apiResponse
        }));
    }

    const hasAnyYads = records.some((record) => record.payload.yads.length > 0);
    if (!hasAnyYads) {
        return {
            stored: false,
            records,
            reason: "unsupported-stay-date"
        };
    }

    if (!isIndexedDbAvailable()) {
        return {
            stored: false,
            records,
            reason: "indexeddb-unavailable"
        };
    }

    await withPriceTrendStore("readwrite", async (store) => {
        for (const record of records) {
            await putPriceTrendRecord(store, record);
        }
    });

    return {
        stored: true,
        records
    };
}

export function buildAllPriceTrendRequestScopes(): PriceTrendRequestScope[] {
    const scopes: PriceTrendRequestScope[] = [];
    for (const mealType of PRICE_TREND_MEAL_TYPE_REQUESTS) {
        for (const roomType of [null, ...PRICE_TREND_ROOM_TYPE_REQUESTS] as const) {
            for (const numGuests of PRICE_TREND_GUEST_COUNTS) {
                scopes.push({
                    numGuests,
                    mealType,
                    roomType
                });
            }
        }
    }
    return scopes;
}

function buildPriceTrendScopeListKey(scopes: readonly PriceTrendRequestScope[] | undefined): string {
    if (scopes === undefined) {
        return "all";
    }
    return scopes.map(buildPriceTrendScopeKey).join(",");
}

function buildPriceTrendScopeKey(scope: PriceTrendRequestScope): string {
    return [
        `guest:${scope.numGuests}`,
        `meal:${scope.mealType}`,
        `room:${scope.roomType ?? "unspecified"}`
    ].join("|");
}

export async function loadPriceTrendRequestContext(): Promise<PriceTrendRequestContext> {
    const [yadInfo, competitors] = await Promise.all([
        fetchJson<PriceTrendYadInfoApiResponse>(YAD_INFO_ENDPOINT),
        fetchJson<PriceTrendCompetitorApiEntry[]>(COMPETITORS_ENDPOINT)
    ]);
    const ownYadNo = normalizeYadNo(yadInfo.yad_no);
    const competitorFacilities = competitors
        .map((entry): PriceTrendFacility | null => {
            const yadNo = normalizeYadNo(entry.yad_no);
            if (yadNo === "") {
                return null;
            }
            return {
                yadNo,
                name: normalizeFacilityName(entry.name, yadNo),
                role: "competitor"
            };
        })
        .filter((entry): entry is PriceTrendFacility => entry !== null);

    return {
        facilities: [
            {
                yadNo: ownYadNo,
                name: normalizeFacilityName(yadInfo.yad_name ?? yadInfo.name, ownYadNo, "自社"),
                role: "own" as const
            },
            ...competitorFacilities
        ].filter((facility) => facility.yadNo !== ""),
        ownYadNo,
        competitorYadNos: competitorFacilities.map((facility) => facility.yadNo)
    };
}

function buildPriceTrendRequest(
    stayDate: string,
    numGuests: PriceTrendGuestCount,
    mealType: PriceTrendMealTypeRequest,
    roomType: PriceTrendRoomTypeRequest | null,
    yadNos: string[]
): { url: string; query: string } {
    const params = new URLSearchParams();
    params.set("stay_date", compactDate(stayDate));
    params.set("num_guests", String(numGuests));
    params.set("meal_type", mealType);
    if (roomType !== null) {
        params.append("room_type_options[]", roomType);
    }
    for (const yadNo of yadNos) {
        params.append("yad_nos[]", yadNo);
    }
    const query = params.toString();
    return {
        url: `${PRICE_TRENDS_ENDPOINT}?${query}`,
        query
    };
}

function buildPriceTrendRecord(options: {
    facilityId: string;
    stayDate: string;
    numGuests: PriceTrendGuestCount;
    mealType: string;
    roomType: string | null;
    roomTypeLabel: string | null;
    fetchedAt: string;
    endpoint: string;
    query: string;
    facilities: PriceTrendFacility[];
    scopeYadNos: string[];
    apiResponse: PriceTrendApiResponse;
}): PriceTrendRecord {
    return {
        recordKey: buildPriceTrendRecordKey(options.facilityId, options.stayDate, options.numGuests, options.mealType, options.roomType, options.fetchedAt),
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        numGuests: options.numGuests,
        mealType: options.mealType,
        roomType: options.roomType,
        roomTypeLabel: options.roomTypeLabel,
        fetchedAt: options.fetchedAt,
        endpoint: options.endpoint,
        query: options.query,
        schemaVersion: PRICE_TREND_SCHEMA_VERSION,
        facilities: options.facilities,
        scope: {
            stayDate: options.stayDate,
            numGuests: options.numGuests,
            mealType: options.mealType,
            roomType: options.roomType,
            roomTypeLabel: options.roomTypeLabel,
            yadNos: options.scopeYadNos,
            source: "price-trends-tab"
        },
        payload: {
            stayDate: normalizeApiStayDate(options.apiResponse.stay_date, options.stayDate),
            latestSourceUpdatedAt: normalizeNullableString(options.apiResponse.latest_source_updated_at),
            yads: normalizePriceTrendYads(options.apiResponse.yads ?? [])
        }
    };
}

function normalizePriceTrendYads(apiYads: PriceTrendApiYad[]): PriceTrendYadSeries[] {
    const yads: PriceTrendYadSeries[] = [];
    for (const apiYad of apiYads) {
        const yad = normalizePriceTrendYad(apiYad);
        if (yad.yadNo !== "") {
            yads.push(yad);
        }
    }
    return yads;
}

function normalizePriceTrendYad(apiYad: PriceTrendApiYad): PriceTrendYadSeries {
    return {
        yadNo: normalizeYadNo(apiYad.yad_no),
        points: (apiYad.price_trends ?? [])
            .map(normalizePriceTrendPoint)
            .filter((point): point is PriceTrendPoint => point !== null)
    };
}

function normalizePriceTrendPoint(apiPoint: PriceTrendApiPoint): PriceTrendPoint | null {
    if (typeof apiPoint.lead_time_days !== "number") {
        return null;
    }
    return {
        date: normalizeNullableString(apiPoint.date),
        leadTimeDays: apiPoint.lead_time_days,
        priceIncludingTax: typeof apiPoint.jalan_min_price === "number" ? apiPoint.jalan_min_price : null,
        status: normalizeNullableString(apiPoint.jalan_min_price_status)
    };
}

function selectLatestPriceTrendRecords(records: PriceTrendRecord[]): PriceTrendRecord[] {
    const latestByGuestAndScope = new Map<string, PriceTrendRecord>();
    for (const record of records) {
        const key = `${record.numGuests}|${record.mealType}|${record.roomType ?? ""}`;
        const existing = latestByGuestAndScope.get(key);
        if (existing === undefined || existing.fetchedAt.localeCompare(record.fetchedAt) < 0) {
            latestByGuestAndScope.set(key, record);
        }
    }
    return Array.from(latestByGuestAndScope.values())
        .sort((left, right) => left.numGuests - right.numGuests
            || left.mealType.localeCompare(right.mealType)
            || (left.roomType ?? "").localeCompare(right.roomType ?? ""));
}

function buildPriceTrendRecordKey(
    facilityId: string,
    stayDate: string,
    numGuests: PriceTrendGuestCount,
    mealType: string,
    roomType: string | null,
    fetchedAt: string
): string {
    return [
        facilityId,
        stayDate,
        `guest:${numGuests}`,
        `meal:${mealType}`,
        `room:${roomType ?? "unspecified"}`,
        fetchedAt
    ].join("|");
}

function formatPriceTrendRoomTypeRequestLabel(roomType: PriceTrendRoomTypeRequest | null): string | null {
    if (roomType === null) {
        return null;
    }
    const labels: Record<PriceTrendRoomTypeRequest, string> = {
        SINGLE: "シングル",
        DOUBLE: "ダブル",
        TWIN: "ツイン",
        TRIPLE: "トリプル",
        FOUR_BEDS: "フォース",
        WASHITSU: "和室",
        WAYOUSHITSU: "和洋室"
    };
    return labels[roomType];
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        credentials: "include",
        headers: {
            "x-requested-with": "XMLHttpRequest"
        }
    });
    if (!response.ok) {
        throw new Error(`request failed: ${url} ${response.status}`);
    }
    return await response.json() as T;
}

function normalizeYadNo(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}

function normalizeFacilityName(value: string | null | undefined, yadNo: string, fallback = yadNo): string {
    const trimmed = value?.trim() ?? "";
    if (trimmed !== "") {
        return trimmed;
    }
    return fallback;
}

function normalizeNullableString(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

function normalizeApiStayDate(value: string | null | undefined, fallback: string): string {
    const trimmed = value?.trim() ?? "";
    if (/^\d{8}$/.test(trimmed)) {
        return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
    }
    return trimmed === "" ? fallback : trimmed;
}

function compactDate(stayDate: string): string {
    return stayDate.replace(/-/g, "");
}

function isIndexedDbAvailable(): boolean {
    return typeof indexedDB !== "undefined";
}

function openPriceTrendDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(PRICE_TREND_DB_NAME, PRICE_TREND_DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(PRICE_TREND_STORE_NAME)) {
                const store = database.createObjectStore(PRICE_TREND_STORE_NAME, {
                    keyPath: "recordKey"
                });
                store.createIndex("facility-stayDate", ["facilityId", "stayDate"], { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("failed to open price trend database"));
        request.onblocked = () => reject(new Error("price trend database open blocked"));
    });
}

async function withPriceTrendStore<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
    const database = await openPriceTrendDatabase();
    try {
        const transaction = database.transaction(PRICE_TREND_STORE_NAME, mode);
        const store = transaction.objectStore(PRICE_TREND_STORE_NAME);
        const result = await callback(store);
        await waitForTransaction(transaction);
        return result;
    } finally {
        database.close();
    }
}

function putPriceTrendRecord(store: IDBObjectStore, record: PriceTrendRecord): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("failed to write price trend record"));
    });
}

function getPriceTrendRecordsByFacilityAndStayDate(
    index: IDBIndex,
    facilityId: string,
    stayDate: string
): Promise<PriceTrendRecord[]> {
    return new Promise((resolve, reject) => {
        const request = index.getAll(IDBKeyRange.only([facilityId, stayDate]));
        request.onsuccess = () => resolve((request.result as PriceTrendRecord[]).filter((record) => record.schemaVersion === PRICE_TREND_SCHEMA_VERSION));
        request.onerror = () => reject(request.error ?? new Error("failed to read price trend records"));
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("price trend transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("price trend transaction aborted"));
    });
}
