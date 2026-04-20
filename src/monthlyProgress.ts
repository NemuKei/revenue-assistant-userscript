import {
    persistMonthlyBookingCurveSnapshot,
    readLatestMonthlyBookingCurveSnapshot
} from "./monthlyProgressIndexedDb";
import {
    buildMonthlyProgressLeadTimeSeries,
    getYearMonthBounds,
    summarizeMonthlyProgressLeadTimeSeries
} from "./monthlyProgressLeadTime";

const MONTHLY_PROGRESS_ROUTE_PATTERN = /^\/monthly-progress\/(\d{4})-(\d{2})$/;
const MONTHLY_PROGRESS_FEATURE_STORAGE_KEY = "revenue-assistant:feature:monthly-progress:enabled";
const MONTHLY_PROGRESS_STORAGE_PREFIX = "revenue-assistant:monthly-progress:v1:";

export interface MonthlyProgressRouteState {
    year: string;
    month: string;
    yearMonth: string;
}

export interface MonthlyProgressStorageAdapter {
    namespacePrefix: string;
    readJson<T>(key: string): T | undefined;
    writeJson(key: string, value: unknown): boolean;
    remove(key: string): void;
    clearNamespace(): number;
}

interface MonthlyProgressSyncOptions {
    scriptName: string;
    href: string;
    routeState: MonthlyProgressRouteState;
    batchDateKey: string;
    resolveFacilityCacheKey: () => Promise<string>;
}

let activeMonthlyProgressSignature = "";

export function getMonthlyProgressRouteState(pathname: string): MonthlyProgressRouteState | null {
    const match = MONTHLY_PROGRESS_ROUTE_PATTERN.exec(pathname);
    if (match === null) {
        return null;
    }

    const year = match[1];
    const month = match[2];
    if (year === undefined || month === undefined) {
        return null;
    }

    return {
        year,
        month,
        yearMonth: `${year}${month}`
    };
}

export function isMonthlyProgressFeatureEnabled(): boolean {
    try {
        return window.localStorage.getItem(MONTHLY_PROGRESS_FEATURE_STORAGE_KEY) !== "0";
    } catch {
        return true;
    }
}

export function createMonthlyProgressStorageAdapter(facilityCacheKey: string): MonthlyProgressStorageAdapter {
    const namespacePrefix = `${MONTHLY_PROGRESS_STORAGE_PREFIX}${facilityCacheKey}:`;

    return {
        namespacePrefix,
        readJson<T>(key: string): T | undefined {
            try {
                const raw = window.localStorage.getItem(`${namespacePrefix}${key}`);
                if (raw === null) {
                    return undefined;
                }

                return JSON.parse(raw) as T;
            } catch {
                return undefined;
            }
        },
        writeJson(key: string, value: unknown): boolean {
            try {
                window.localStorage.setItem(`${namespacePrefix}${key}`, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },
        remove(key: string): void {
            try {
                window.localStorage.removeItem(`${namespacePrefix}${key}`);
            } catch {
                // Ignore storage cleanup failures.
            }
        },
        clearNamespace(): number {
            try {
                const keysToRemove: string[] = [];
                for (let index = 0; index < window.localStorage.length; index += 1) {
                    const key = window.localStorage.key(index);
                    if (key !== null && key.startsWith(namespacePrefix)) {
                        keysToRemove.push(key);
                    }
                }

                for (const key of keysToRemove) {
                    window.localStorage.removeItem(key);
                }

                return keysToRemove.length;
            } catch {
                return 0;
            }
        }
    };
}

export function syncMonthlyProgressPage(options: MonthlyProgressSyncOptions): void {
    const enabled = isMonthlyProgressFeatureEnabled();
    const nextSignature = `${options.href}:${options.routeState.yearMonth}:${options.batchDateKey}:${enabled ? "enabled" : "disabled"}`;
    if (nextSignature === activeMonthlyProgressSignature) {
        return;
    }

    activeMonthlyProgressSignature = nextSignature;

    if (!enabled) {
        console.info(`[${options.scriptName}] monthly-progress feature disabled`, {
            href: options.href,
            yearMonth: options.routeState.yearMonth,
            killSwitchStorageKey: MONTHLY_PROGRESS_FEATURE_STORAGE_KEY
        });
        return;
    }

    void options.resolveFacilityCacheKey()
        .then((facilityCacheKey) => {
            if (activeMonthlyProgressSignature !== nextSignature) {
                return;
            }

            const storage = createMonthlyProgressStorageAdapter(facilityCacheKey);
            void persistMonthlyBookingCurveSnapshot({
                scriptName: options.scriptName,
                facilityCacheKey,
                yearMonth: options.routeState.yearMonth,
                batchDateKey: options.batchDateKey
            }).catch((error: unknown) => {
                console.warn(`[${options.scriptName}] failed to persist monthly-progress booking-curve snapshot`, {
                    href: options.href,
                    yearMonth: options.routeState.yearMonth,
                    batchDateKey: options.batchDateKey,
                    facilityCacheKey,
                    error
                });
            });

            void readLatestMonthlyBookingCurveSnapshot(facilityCacheKey, options.routeState.yearMonth)
                .then((snapshot) => {
                    if (snapshot === undefined) {
                        return;
                    }

                    const monthBounds = getYearMonthBounds(snapshot.yearMonth);
                    if (monthBounds === null) {
                        return;
                    }

                    const roomSeries = buildMonthlyProgressLeadTimeSeries(
                        snapshot.payload,
                        "room",
                        monthBounds.firstDateKey,
                        snapshot.batchDateKey
                    );
                    const salesSeries = buildMonthlyProgressLeadTimeSeries(
                        snapshot.payload,
                        "sales",
                        monthBounds.firstDateKey,
                        snapshot.batchDateKey
                    );
                    console.info(`[${options.scriptName}] monthly-progress LT preview ready`, {
                        href: options.href,
                        yearMonth: options.routeState.yearMonth,
                        snapshotBatchDateKey: snapshot.batchDateKey,
                        anchorDateKey: monthBounds.firstDateKey,
                        room: summarizeMonthlyProgressLeadTimeSeries(roomSeries),
                        sales: summarizeMonthlyProgressLeadTimeSeries(salesSeries)
                    });
                })
                .catch((error: unknown) => {
                    console.warn(`[${options.scriptName}] failed to prepare monthly-progress LT preview`, {
                        href: options.href,
                        yearMonth: options.routeState.yearMonth,
                        facilityCacheKey,
                        error
                    });
                });

            console.info(`[${options.scriptName}] monthly-progress route ready`, {
                href: options.href,
                yearMonth: options.routeState.yearMonth,
                batchDateKey: options.batchDateKey,
                facilityCacheKey,
                storageNamespace: storage.namespacePrefix,
                killSwitchStorageKey: MONTHLY_PROGRESS_FEATURE_STORAGE_KEY
            });
        })
        .catch((error: unknown) => {
            console.warn(`[${options.scriptName}] failed to prepare monthly-progress route`, {
                href: options.href,
                yearMonth: options.routeState.yearMonth,
                error
            });
        });
}

export function cleanupMonthlyProgressPage(): void {
    activeMonthlyProgressSignature = "";
}

export function getMonthlyProgressFeatureStorageKey(): string {
    return MONTHLY_PROGRESS_FEATURE_STORAGE_KEY;
}