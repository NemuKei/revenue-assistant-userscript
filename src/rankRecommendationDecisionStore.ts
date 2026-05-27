import type { RankRecommendationAction } from "./rankRecommendation";

const RANK_RECOMMENDATION_DECISION_DB_NAME = "revenue-assistant-rank-recommendations";
const RANK_RECOMMENDATION_DECISION_DB_VERSION = 1;
const RANK_RECOMMENDATION_DECISION_STORE_NAME = "rank-recommendation-decisions";

export type RankRecommendationDecisionType = "snooze" | "dismiss";

export interface RankRecommendationDecisionKeyParts {
    facilityId: string;
    stayDate: string;
    roomGroupId: string;
    action: RankRecommendationAction;
    reasonFingerprint: string;
}

export interface RankRecommendationDecisionRecord extends RankRecommendationDecisionKeyParts {
    cacheKey: string;
    roomGroupName: string;
    decisionType: RankRecommendationDecisionType;
    decidedAt: string;
    asOfDate: string;
    cooldownUntilAsOfDate: string | null;
}

export function buildRankRecommendationDecisionCacheKey(parts: RankRecommendationDecisionKeyParts): string {
    return [
        `facility:${parts.facilityId}`,
        `stayDate:${parts.stayDate}`,
        `roomGroup:${parts.roomGroupId}`,
        `action:${parts.action}`,
        `reason:${parts.reasonFingerprint}`
    ].join("|");
}

export function buildRankRecommendationDecisionRecord(options: {
    keyParts: RankRecommendationDecisionKeyParts;
    roomGroupName: string;
    decisionType: RankRecommendationDecisionType;
    asOfDate: string;
    cooldownUntilAsOfDate: string | null;
}): RankRecommendationDecisionRecord {
    return {
        ...options.keyParts,
        cacheKey: buildRankRecommendationDecisionCacheKey(options.keyParts),
        roomGroupName: options.roomGroupName,
        decisionType: options.decisionType,
        decidedAt: new Date().toISOString(),
        asOfDate: options.asOfDate,
        cooldownUntilAsOfDate: options.cooldownUntilAsOfDate
    };
}

export async function readRankRecommendationDecisionRecords(): Promise<RankRecommendationDecisionRecord[]> {
    if (!isIndexedDbAvailable()) {
        return [];
    }

    return withRankRecommendationDecisionStore("readonly", (store) => getAllRankRecommendationDecisionRecords(store));
}

export async function writeRankRecommendationDecisionRecord(record: RankRecommendationDecisionRecord): Promise<void> {
    if (!isIndexedDbAvailable()) {
        return;
    }

    await withRankRecommendationDecisionStore("readwrite", (store) => putRankRecommendationDecisionRecord(store, record));
}

async function withRankRecommendationDecisionStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
    const database = await openRankRecommendationDecisionDatabase();
    try {
        const transaction = database.transaction(RANK_RECOMMENDATION_DECISION_STORE_NAME, mode);
        const store = transaction.objectStore(RANK_RECOMMENDATION_DECISION_STORE_NAME);
        const result = await run(store);
        await waitForTransaction(transaction);
        return result;
    } finally {
        database.close();
    }
}

function openRankRecommendationDecisionDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(RANK_RECOMMENDATION_DECISION_DB_NAME, RANK_RECOMMENDATION_DECISION_DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(RANK_RECOMMENDATION_DECISION_STORE_NAME)) {
                const store = database.createObjectStore(RANK_RECOMMENDATION_DECISION_STORE_NAME, {
                    keyPath: "cacheKey"
                });
                store.createIndex("facility-stay-room", ["facilityId", "stayDate", "roomGroupId"], {
                    unique: false
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error ?? new Error("failed to open rank recommendation decision database"));
        };

        request.onblocked = () => {
            reject(new Error("rank recommendation decision database open blocked"));
        };
    });
}

function getAllRankRecommendationDecisionRecords(store: IDBObjectStore): Promise<RankRecommendationDecisionRecord[]> {
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            resolve(request.result as RankRecommendationDecisionRecord[]);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to read rank recommendation decision records"));
        };
    });
}

function putRankRecommendationDecisionRecord(store: IDBObjectStore, record: RankRecommendationDecisionRecord): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => {
            resolve();
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to write rank recommendation decision record"));
        };
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = () => {
            reject(transaction.error ?? new Error("rank recommendation decision transaction failed"));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error("rank recommendation decision transaction aborted"));
        };
    });
}

function isIndexedDbAvailable(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
}
