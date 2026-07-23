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

const PRICE_TREND_DB_NAME = "revenue-assistant-price-trends";
const PRICE_TREND_DB_VERSION = 1;
const PRICE_TREND_STORE_NAME = "price-trend-records";
const PRICE_TREND_INDEX_NAME = "facility-stayDate";

export type PriceTrendComparisonDataLoadResult =
    | {
        status: "ready";
        contextKey: string;
        facilityId: string;
        facilityLabel: string;
        records: unknown[];
    }
    | {
        status: "missing" | "unavailable";
        contextKey: string;
        facilityId: string;
        facilityLabel: string;
        reason: Extract<
            ExistingIndexedDbReadResult<unknown>,
            { status: "missing" | "unavailable" }
        >["reason"];
    }
    | {
        status: "error";
        contextKey: string;
        reason:
            | "aborted"
            | "facility-response-invalid"
            | "read-failed"
            | "stay-date-invalid";
    };

export interface PriceTrendComparisonDataSource {
    cancel(): void;
    load(stayDate: string): Promise<PriceTrendComparisonDataLoadResult>;
    reset(): void;
    stop(): void;
}

export type ExistingPriceTrendSeriesReader = <T>(
    options: ExistingIndexedDbSeriesReadOptions
) => Promise<ExistingIndexedDbReadResult<T>>;

export interface CreatePriceTrendComparisonDataSourceOptions {
    seriesReader?: ExistingPriceTrendSeriesReader;
    transport?: NextReadTransport;
    windowHost?: Window;
}

export function createPriceTrendComparisonDataSource(
    options: CreatePriceTrendComparisonDataSourceOptions = {}
): PriceTrendComparisonDataSource {
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const seriesReader = options.seriesReader ?? readExistingIndexedDbRecordSeriesByIndexKey;
    let activeController: AbortController | null = null;
    let activeLoad: Promise<PriceTrendComparisonDataLoadResult> | null = null;
    let activeStayDate: string | null = null;
    let stopped = false;

    const cancel = (): void => {
        activeController?.abort();
        activeController = null;
        activeLoad = null;
        activeStayDate = null;
    };

    return {
        cancel,
        load(stayDate) {
            if (stopped) {
                return Promise.resolve({
                    status: "error",
                    contextKey: "stopped",
                    reason: "aborted"
                });
            }
            const normalizedStayDate = normalizeStayDate(stayDate);
            if (normalizedStayDate === null) {
                return Promise.resolve({
                    status: "error",
                    contextKey: stayDate,
                    reason: "stay-date-invalid"
                });
            }
            if (activeStayDate === normalizedStayDate && activeLoad !== null) {
                return activeLoad;
            }
            cancel();
            const controller = new AbortController();
            activeController = controller;
            activeStayDate = normalizedStayDate;
            const load = loadPriceTrendComparisonData({
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
                activeLoad = null;
                activeStayDate = null;
            });
            return load;
        },
        reset: cancel,
        stop() {
            stopped = true;
            cancel();
        }
    };
}

async function loadPriceTrendComparisonData(options: {
    seriesReader: ExistingPriceTrendSeriesReader;
    signal: AbortSignal;
    stayDate: string;
    transport: NextReadTransport;
}): Promise<PriceTrendComparisonDataLoadResult> {
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
            databaseName: PRICE_TREND_DB_NAME,
            databaseVersion: PRICE_TREND_DB_VERSION,
            storeName: PRICE_TREND_STORE_NAME,
            indexName: PRICE_TREND_INDEX_NAME,
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
