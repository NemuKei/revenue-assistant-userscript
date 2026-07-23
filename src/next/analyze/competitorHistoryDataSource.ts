import {
    COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
    COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
    COMPETITOR_PRICE_SNAPSHOT_STORE_NAME
} from "../../competitorPriceSnapshotContract";
import {
    readExistingIndexedDbRecordSeriesByIndexKey,
    type ExistingIndexedDbReadResult,
    type ExistingIndexedDbSeriesReadOptions
} from "../../indexedDbReadOnly";
import { parseNextFacilityContext } from "../facilityContext";
import {
    createBrowserNextReadTransport,
    createNextReadSession,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";

export type CompetitorHistoryDataLoadResult =
    | {
        status: "ready";
        contextKey: string;
        facilityId: string;
        facilityLabel: string;
        records: unknown[];
    }
    | {
        status: "missing";
        contextKey: string;
        facilityId: string;
        facilityLabel: string;
        reason: string;
    }
    | {
        status: "unavailable";
        contextKey: string;
        facilityId: string;
        facilityLabel: string;
        reason: string;
    }
    | {
        status: "error";
        contextKey: string;
        reason: "aborted" | "facility-response-invalid" | "read-failed";
    };

export interface CompetitorHistoryDataSource {
    cancel(): void;
    load(stayDate: string): Promise<CompetitorHistoryDataLoadResult>;
    stop(): void;
}

export type ExistingIndexedDbSeriesReader = <T>(
    options: ExistingIndexedDbSeriesReadOptions
) => Promise<ExistingIndexedDbReadResult<T>>;

export interface CreateCompetitorHistoryDataSourceOptions {
    seriesReader?: ExistingIndexedDbSeriesReader;
    transport?: NextReadTransport;
    windowHost?: Window;
}

export function createCompetitorHistoryDataSource(
    options: CreateCompetitorHistoryDataSourceOptions = {}
): CompetitorHistoryDataSource {
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const seriesReader = options.seriesReader ?? readExistingIndexedDbRecordSeriesByIndexKey;
    let activeController: AbortController | null = null;
    let activeKey: string | null = null;
    let activeLoad: Promise<CompetitorHistoryDataLoadResult> | null = null;
    let stopped = false;
    const cancel = (): void => {
        activeController?.abort();
        activeController = null;
        activeKey = null;
        activeLoad = null;
    };

    return {
        cancel,
        load(stayDate) {
            const normalizedStayDate = normalizeStayDate(stayDate);
            if (stopped || normalizedStayDate === null) {
                return Promise.resolve({
                    status: "error",
                    contextKey: normalizedStayDate ?? "invalid-stay-date",
                    reason: "aborted"
                });
            }
            if (activeKey === normalizedStayDate && activeLoad !== null) {
                return activeLoad;
            }
            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            activeKey = normalizedStayDate;
            const load = loadCompetitorHistory({
                seriesReader,
                signal: controller.signal,
                stayDate: normalizedStayDate,
                transport
            });
            activeLoad = load;
            void load.finally(() => {
                if (activeLoad !== load) {
                    return;
                }
                activeController = null;
                activeKey = null;
                activeLoad = null;
            });
            return load;
        },
        stop() {
            stopped = true;
            cancel();
        }
    };
}

async function loadCompetitorHistory(options: {
    seriesReader: ExistingIndexedDbSeriesReader;
    signal: AbortSignal;
    stayDate: string;
    transport: NextReadTransport;
}): Promise<CompetitorHistoryDataLoadResult> {
    const contextKey = options.stayDate;
    try {
        const session = createNextReadSession(options.transport, options.signal);
        const facilityPayload = await session.read({ kind: "facility" });
        if (session.usedRequestCount() !== 1) {
            return { status: "error", contextKey, reason: "read-failed" };
        }
        const facility = parseNextFacilityContext(facilityPayload);
        if (facility === null) {
            return { status: "error", contextKey, reason: "facility-response-invalid" };
        }
        const readResult = await options.seriesReader<unknown>({
            databaseName: COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
            databaseVersion: COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
            storeName: COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
            indexName: "facility-stay-date",
            key: [facility.facilityId, options.stayDate]
        });
        if (options.signal.aborted) {
            return { status: "error", contextKey, reason: "aborted" };
        }
        if (readResult.status === "ready") {
            return {
                status: "ready",
                contextKey: `${facility.facilityId}|${contextKey}`,
                facilityId: facility.facilityId,
                facilityLabel: facility.facilityLabel,
                records: readResult.records
            };
        }
        if (readResult.status === "missing" || readResult.status === "unavailable") {
            return {
                status: readResult.status,
                contextKey: `${facility.facilityId}|${contextKey}`,
                facilityId: facility.facilityId,
                facilityLabel: facility.facilityLabel,
                reason: readResult.reason
            };
        }
        return {
            status: "error",
            contextKey: `${facility.facilityId}|${contextKey}`,
            reason: "read-failed"
        };
    } catch (error: unknown) {
        return {
            status: "error",
            contextKey,
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "read-failed"
        };
    }
}

function normalizeStayDate(value: string): string | null {
    const compact = value.trim().replaceAll("-", "");
    if (!/^\d{8}$/u.test(compact)) {
        return null;
    }
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? compact
        : null;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}
