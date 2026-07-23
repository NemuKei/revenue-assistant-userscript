export const COMPETITOR_PRICE_SNAPSHOT_DB_NAME = "revenue-assistant-competitor-price-snapshots";
export const COMPETITOR_PRICE_SNAPSHOT_DB_VERSION = 1;
export const COMPETITOR_PRICE_SNAPSHOT_STORE_NAME = "competitor-price-snapshots";
export const NEXT_COMPETITOR_PRICE_SNAPSHOT_DB_NAME = "revenue-assistant-next-competitor-price-snapshots";
export const NEXT_COMPETITOR_PRICE_SNAPSHOT_DB_VERSION = 1;
export const NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME = "competitor-price-snapshots";
export const COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION = "competitor_price_snapshot:v1";
export const COMPETITOR_PRICE_ENDPOINT = "/api/v5/competitor_prices";

export type CompetitorPriceSnapshotSource = "analyze-open" | "competitor-tab" | "next-competitor-tab";

export interface CompetitorPriceSnapshotCompetitor {
    yadNo: string;
    name: string;
}

export interface CompetitorPriceSnapshotSearchCondition {
    stayDate: string;
    minNumGuests: number;
    maxNumGuests: number;
    competitorYadNos: string[];
    jalanRoomTypes?: string[] | null;
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
    source: CompetitorPriceSnapshotSource;
    endpoint: string;
    query: string;
    schemaVersion: string;
    competitorSet: CompetitorPriceSnapshotCompetitor[];
    payload: CompetitorPriceSnapshotPayload;
}

export interface PersistCompetitorPriceSnapshotOptions {
    facilityId: string;
    stayDate: string;
    source?: CompetitorPriceSnapshotSource;
    jalanRoomTypes?: string[] | null;
    requestContextBase?: CompetitorPriceRequestContextBase;
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

export interface CompetitorPriceRequestContextBase {
    competitorSet: CompetitorPriceSnapshotCompetitor[];
}

export function buildCompetitorPriceConditionSignature(condition: CompetitorPriceSnapshotSearchCondition): string {
    const signatureSource: Record<string, unknown> = {
        stayDate: condition.stayDate,
        minNumGuests: condition.minNumGuests,
        maxNumGuests: condition.maxNumGuests,
        competitorYadNos: condition.competitorYadNos.slice().sort(),
        mealTypes: condition.mealTypes === null ? null : condition.mealTypes.slice().sort(),
        planNameWords: condition.planNameWords === null ? null : condition.planNameWords.slice().sort(),
        planNameContains: condition.planNameContains
    };
    if (condition.jalanRoomTypes !== null && condition.jalanRoomTypes !== undefined) {
        signatureSource.jalanRoomTypes = condition.jalanRoomTypes.slice().sort();
    }
    return stableStringify(signatureSource);
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
