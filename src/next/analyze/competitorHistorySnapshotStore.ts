import {
    NEXT_COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
    NEXT_COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
    NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
    type CompetitorPriceSnapshotRecord
} from "../../competitorPriceSnapshotContract";

export const NEXT_COMPETITOR_HISTORY_RETENTION_LIMIT = 120;

export type CompetitorHistorySnapshotStoreWriteResult =
    | { status: "stored"; deletedCount: number }
    | { status: "already-stored"; deletedCount: 0 };

export interface CompetitorHistorySnapshotStore {
    addAndPrune(record: CompetitorPriceSnapshotRecord): Promise<CompetitorHistorySnapshotStoreWriteResult>;
    readBySnapshotKey(snapshotKey: string): Promise<CompetitorPriceSnapshotRecord | null>;
}

export function createBrowserCompetitorHistorySnapshotStore(
    windowHost: Window = window
): CompetitorHistorySnapshotStore {
    return {
        async addAndPrune(record) {
            const database = await openNextCompetitorHistoryDatabase(windowHost);
            try {
                const transaction = database.transaction(
                    NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
                    "readwrite"
                );
                const completion = waitForTransaction(transaction);
                try {
                    const store = transaction.objectStore(NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME);
                    const added = await addSnapshotRecord(store, record);
                    if (!added) {
                        await completion;
                        return { status: "already-stored", deletedCount: 0 };
                    }

                    const index = store.index("facility-stay-date");
                    const records = await readRetentionWindow(index, record.facilityId, record.stayDate);
                    const overflow = records
                        .slice()
                        .sort(compareNewestFirst)
                        .slice(NEXT_COMPETITOR_HISTORY_RETENTION_LIMIT);
                    await Promise.all(overflow.map((item) => deleteSnapshotRecord(store, item.snapshotKey)));
                    await completion;
                    return { status: "stored", deletedCount: overflow.length };
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
        async readBySnapshotKey(snapshotKey) {
            const database = await openNextCompetitorHistoryDatabase(windowHost);
            try {
                const transaction = database.transaction(
                    NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
                    "readonly"
                );
                const completion = waitForTransaction(transaction);
                const store = transaction.objectStore(NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME);
                const record = await readSnapshotRecord(store, snapshotKey);
                await completion;
                return record;
            } finally {
                database.close();
            }
        }
    };
}

export function buildNextCompetitorHistorySnapshotKey(
    facilityId: string,
    stayDate: string,
    observationDate: string
): string {
    return [
        "next-competitor-history",
        `facility:${facilityId}`,
        `stayDate:${stayDate}`,
        `observedOn:${observationDate}`
    ].join("|");
}

function openNextCompetitorHistoryDatabase(windowHost: Window): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = windowHost.indexedDB.open(
            NEXT_COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
            NEXT_COMPETITOR_PRICE_SNAPSHOT_DB_VERSION
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
            if (database.objectStoreNames.contains(NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME)) {
                return;
            }
            const store = database.createObjectStore(NEXT_COMPETITOR_PRICE_SNAPSHOT_STORE_NAME, {
                keyPath: "snapshotKey"
            });
            store.createIndex("facility-stay-date", ["facilityId", "stayDate"], { unique: false });
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
            fail(request.error ?? new Error("failed to open Next competitor history database"));
        };
        request.onblocked = () => {
            fail(new Error("Next competitor history database open blocked"));
        };
    });
}

function addSnapshotRecord(
    store: IDBObjectStore,
    record: CompetitorPriceSnapshotRecord
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
            reject(request.error ?? new Error("failed to add Next competitor history record"));
        };
    });
}

function readSnapshotRecord(
    store: IDBObjectStore,
    snapshotKey: string
): Promise<CompetitorPriceSnapshotRecord | null> {
    return new Promise((resolve, reject) => {
        const request = store.get(snapshotKey);
        request.onsuccess = () => {
            resolve((request.result as CompetitorPriceSnapshotRecord | undefined) ?? null);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to read Next competitor history record"));
        };
    });
}

function readRetentionWindow(
    index: IDBIndex,
    facilityId: string,
    stayDate: string
): Promise<CompetitorPriceSnapshotRecord[]> {
    return new Promise((resolve, reject) => {
        const request = index.getAll(
            [facilityId, stayDate],
            NEXT_COMPETITOR_HISTORY_RETENTION_LIMIT + 1
        );
        request.onsuccess = () => {
            resolve(request.result as CompetitorPriceSnapshotRecord[]);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to read Next competitor history retention window"));
        };
    });
}

function deleteSnapshotRecord(store: IDBObjectStore, snapshotKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = store.delete(snapshotKey);
        request.onsuccess = () => {
            resolve();
        };
        request.onerror = () => {
            reject(request.error ?? new Error("failed to prune Next competitor history record"));
        };
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = () => {
            reject(transaction.error ?? new Error("Next competitor history transaction failed"));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error("Next competitor history transaction aborted"));
        };
    });
}

function compareNewestFirst(
    left: CompetitorPriceSnapshotRecord,
    right: CompetitorPriceSnapshotRecord
): number {
    return right.fetchedAt.localeCompare(left.fetchedAt)
        || right.snapshotKey.localeCompare(left.snapshotKey);
}
