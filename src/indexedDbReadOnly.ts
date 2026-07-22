export type ExistingIndexedDbReadResult<T> =
    | { status: "ready"; records: T[] }
    | { status: "missing"; reason: "database-missing" | "store-missing" | "index-missing" | "version-mismatch" }
    | { status: "unavailable"; reason: "indexeddb-unavailable" | "database-list-unavailable" }
    | { status: "error"; reason: "database-list-failed" | "database-open-failed" | "database-open-blocked" | "read-failed" };

export interface ExistingIndexedDbReadOptions {
    databaseName: string;
    databaseVersion: number;
    storeName: string;
    indexName: string;
    keys: readonly IDBValidKey[];
}

export interface ExistingIndexedDbPrimaryKeyReadOptions {
    databaseName: string;
    databaseVersion: number;
    storeName: string;
    keys: readonly IDBValidKey[];
}

const EXISTING_INDEXED_DB_RECORDS_PER_INDEX_KEY_LIMIT = 1;

export async function readExistingIndexedDbRecordsByIndexKeys<T>(
    options: ExistingIndexedDbReadOptions
): Promise<ExistingIndexedDbReadResult<T>> {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
        return { status: "unavailable", reason: "indexeddb-unavailable" };
    }
    if (typeof window.indexedDB.databases !== "function") {
        return { status: "unavailable", reason: "database-list-unavailable" };
    }

    let databases: IDBDatabaseInfo[];
    try {
        databases = await window.indexedDB.databases();
    } catch {
        return { status: "error", reason: "database-list-failed" };
    }
    const databaseInfo = databases.find((database) => database.name === options.databaseName);
    if (databaseInfo === undefined) {
        return { status: "missing", reason: "database-missing" };
    }
    if (
        typeof databaseInfo.version === "number"
        && databaseInfo.version !== options.databaseVersion
    ) {
        return { status: "missing", reason: "version-mismatch" };
    }

    let databaseResult: Awaited<ReturnType<typeof openExistingDatabase>>;
    try {
        databaseResult = await openExistingDatabase(options.databaseName);
    } catch {
        return { status: "error", reason: "database-open-failed" };
    }
    if (!databaseResult.ok) {
        return databaseResult.result;
    }
    const database = databaseResult.database;
    try {
        if (database.version !== options.databaseVersion) {
            return { status: "missing", reason: "version-mismatch" };
        }
        if (!database.objectStoreNames.contains(options.storeName)) {
            return { status: "missing", reason: "store-missing" };
        }

        const transaction = database.transaction(options.storeName, "readonly");
        const completion = waitForReadonlyTransaction(transaction);
        const store = transaction.objectStore(options.storeName);
        if (!store.indexNames.contains(options.indexName)) {
            transaction.abort();
            await completion.catch(() => undefined);
            return { status: "missing", reason: "index-missing" };
        }
        const index = store.index(options.indexName);
        const uniqueKeys = deduplicateKeys(options.keys);
        const recordsPromise = Promise.all(uniqueKeys.map(
            (key) => readRecordsByKey<T>(index, key)
        ));
        const [recordsByKey] = await Promise.all([recordsPromise, completion]);
        const records = recordsByKey.flat();
        return { status: "ready", records };
    } catch {
        return { status: "error", reason: "read-failed" };
    } finally {
        database.close();
    }
}

export async function readExistingIndexedDbRecordsByPrimaryKeys<T>(
    options: ExistingIndexedDbPrimaryKeyReadOptions
): Promise<ExistingIndexedDbReadResult<T>> {
    return readExistingIndexedDbStore<T>(options, async (store) => {
        const uniqueKeys = deduplicateKeys(options.keys);
        const records = await Promise.all(
            uniqueKeys.map((key) => readRecordByPrimaryKey<T>(store, key))
        ) as Array<T | undefined>;
        return records.filter((record): record is T => record !== undefined);
    });
}

async function readExistingIndexedDbStore<T>(
    options: ExistingIndexedDbPrimaryKeyReadOptions,
    read: (store: IDBObjectStore) => Promise<T[]>
): Promise<ExistingIndexedDbReadResult<T>> {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
        return { status: "unavailable", reason: "indexeddb-unavailable" };
    }
    if (typeof window.indexedDB.databases !== "function") {
        return { status: "unavailable", reason: "database-list-unavailable" };
    }

    let databases: IDBDatabaseInfo[];
    try {
        databases = await window.indexedDB.databases();
    } catch {
        return { status: "error", reason: "database-list-failed" };
    }
    const databaseInfo = databases.find((database) => database.name === options.databaseName);
    if (databaseInfo === undefined) {
        return { status: "missing", reason: "database-missing" };
    }
    if (
        typeof databaseInfo.version === "number"
        && databaseInfo.version !== options.databaseVersion
    ) {
        return { status: "missing", reason: "version-mismatch" };
    }

    let databaseResult: Awaited<ReturnType<typeof openExistingDatabase>>;
    try {
        databaseResult = await openExistingDatabase(options.databaseName);
    } catch {
        return { status: "error", reason: "database-open-failed" };
    }
    if (!databaseResult.ok) {
        return databaseResult.result;
    }
    const database = databaseResult.database;
    try {
        if (database.version !== options.databaseVersion) {
            return { status: "missing", reason: "version-mismatch" };
        }
        if (!database.objectStoreNames.contains(options.storeName)) {
            return { status: "missing", reason: "store-missing" };
        }
        const transaction = database.transaction(options.storeName, "readonly");
        const completion = waitForReadonlyTransaction(transaction);
        const recordsPromise = read(transaction.objectStore(options.storeName));
        const [records] = await Promise.all([recordsPromise, completion]);
        return { status: "ready", records };
    } catch {
        return { status: "error", reason: "read-failed" };
    } finally {
        database.close();
    }
}

async function openExistingDatabase(databaseName: string): Promise<
    | { ok: true; database: IDBDatabase }
    | { ok: false; result: Extract<ExistingIndexedDbReadResult<never>, { status: "error" | "missing" }> }
> {
    return new Promise((resolve) => {
        const request = window.indexedDB.open(databaseName);
        let upgradeDetected = false;
        let settled = false;

        const finish = (
            result:
                | { ok: true; database: IDBDatabase }
                | { ok: false; result: Extract<ExistingIndexedDbReadResult<never>, { status: "error" | "missing" }> }
        ): void => {
            if (settled) {
                if (result.ok) {
                    result.database.close();
                }
                return;
            }
            settled = true;
            resolve(result);
        };

        request.onupgradeneeded = () => {
            upgradeDetected = true;
            request.transaction?.abort();
        };
        request.onsuccess = () => {
            if (upgradeDetected) {
                request.result.close();
                finish({
                    ok: false,
                    result: { status: "missing", reason: "database-missing" }
                });
                return;
            }
            finish({ ok: true, database: request.result });
        };
        request.onerror = () => {
            if (upgradeDetected) {
                finish({
                    ok: false,
                    result: { status: "missing", reason: "database-missing" }
                });
                return;
            }
            finish({
                ok: false,
                result: { status: "error", reason: "database-open-failed" }
            });
        };
        request.onblocked = () => {
            finish({
                ok: false,
                result: { status: "error", reason: "database-open-blocked" }
            });
        };
    });
}

function readRecordsByKey<T>(index: IDBIndex, key: IDBValidKey): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const request = index.getAll(
            IDBKeyRange.only(key),
            EXISTING_INDEXED_DB_RECORDS_PER_INDEX_KEY_LIMIT
        );
        request.onsuccess = () => {
            resolve(request.result as T[]);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("readonly IndexedDB request failed"));
        };
    });
}

function readRecordByPrimaryKey<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => {
            resolve(request.result as T | undefined);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("readonly IndexedDB request failed"));
        };
    });
}

function deduplicateKeys(keys: readonly IDBValidKey[]): IDBValidKey[] {
    const seen = new Set<string>();
    const unique: IDBValidKey[] = [];
    for (const key of keys) {
        const fingerprint = fingerprintIndexedDbKey(key);
        if (seen.has(fingerprint)) {
            continue;
        }
        seen.add(fingerprint);
        unique.push(key);
    }
    return unique;
}

function fingerprintIndexedDbKey(key: IDBValidKey): string {
    if (Array.isArray(key)) {
        return `array:${key.map(fingerprintIndexedDbKey).join("|")}`;
    }
    if (key instanceof Date) {
        return `date:${key.toISOString()}`;
    }
    if (typeof key === "string") {
        return `string:${key}`;
    }
    if (typeof key === "number") {
        return `number:${String(key)}`;
    }
    return `binary:${String(key.byteLength)}`;
}

function waitForReadonlyTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onerror = () => {
            reject(transaction.error ?? new Error("readonly IndexedDB transaction failed"));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error("readonly IndexedDB transaction aborted"));
        };
    });
}
