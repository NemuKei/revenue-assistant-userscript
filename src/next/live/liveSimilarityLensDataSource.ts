import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_DB_NAME,
    BOOKING_CURVE_RAW_SOURCE_DB_VERSION,
    BOOKING_CURVE_RAW_SOURCE_STORE_NAME,
    buildBookingCurveRawSourceCacheKey,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";
import {
    COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
    COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
    COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
    type CompetitorPriceSnapshotRecord
} from "../../competitorPriceSnapshotContract";
import {
    readExistingIndexedDbRecordsByIndexKeys,
    readExistingIndexedDbRecordsByPrimaryKeys,
    type ExistingIndexedDbReadOptions,
    type ExistingIndexedDbPrimaryKeyReadOptions,
    type ExistingIndexedDbReadResult
} from "../../indexedDbReadOnly";
import type {
    RankRecommendationCurrentSettingByDate,
    RankRecommendationCurrentSettingRoomGroup,
    RankRecommendationCurrentSettingsResponse
} from "../../rankRecommendation";
import {
    buildLiveSimilarityLensEvidence,
    type LiveSimilarityLensEvidenceViewModel
} from "./liveSimilarityLensEvidence";
import { readLiveFacilityContextHints } from "./liveCalendarDomAdapter";
import {
    createBrowserNextReadTransport,
    createNextReadSession,
    type NextReadTransport
} from "./liveSimilarityLensTransport";

export type LiveSimilarityLensDataLoadErrorReason =
    | "as-of-missing"
    | "visible-dates-invalid"
    | "facility-response-invalid"
    | "current-settings-response-invalid"
    | "read-failed"
    | "aborted";

export type LiveSimilarityLensDataLoadResult =
    | {
        status: "ready";
        evidence: LiveSimilarityLensEvidenceViewModel;
        contextKey: string;
        facilityLabel: string;
    }
    | { status: "error"; reason: LiveSimilarityLensDataLoadErrorReason; contextKey: string | null };

export interface LiveSimilarityLensDataSource {
    load(visibleStayDates: readonly string[]): Promise<LiveSimilarityLensDataLoadResult>;
    stop(): void;
}

export type ExistingIndexedDbIndexReader = <T>(
    options: ExistingIndexedDbReadOptions
) => Promise<ExistingIndexedDbReadResult<T>>;

export type ExistingIndexedDbPrimaryKeyReader = <T>(
    options: ExistingIndexedDbPrimaryKeyReadOptions
) => Promise<ExistingIndexedDbReadResult<T>>;

export interface CreateLiveSimilarityLensDataSourceOptions {
    documentHost?: Document;
    indexReader?: ExistingIndexedDbIndexReader;
    primaryKeyReader?: ExistingIndexedDbPrimaryKeyReader;
    transport?: NextReadTransport;
    windowHost?: Window;
}

export function createLiveSimilarityLensDataSource(
    options: CreateLiveSimilarityLensDataSourceOptions = {}
): LiveSimilarityLensDataSource {
    const documentHost = options.documentHost ?? document;
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const indexReader = options.indexReader ?? readExistingIndexedDbRecordsByIndexKeys;
    const primaryKeyReader = options.primaryKeyReader ?? readExistingIndexedDbRecordsByPrimaryKeys;
    let activeController: AbortController | null = null;
    let activeRequestKey: string | null = null;
    let activeLoad: Promise<LiveSimilarityLensDataLoadResult> | null = null;
    let stopped = false;

    return {
        load(visibleStayDates) {
            if (stopped) {
                return Promise.resolve({ status: "error", reason: "aborted", contextKey: null });
            }
            const asOfDate = parseLiveSimilarityLensAsOfDate(documentHost);
            if (asOfDate === null) {
                return Promise.resolve({ status: "error", reason: "as-of-missing", contextKey: null });
            }
            const compactDates = normalizeVisibleStayDates(visibleStayDates);
            if (compactDates.length === 0) {
                return Promise.resolve({ status: "error", reason: "visible-dates-invalid", contextKey: null });
            }
            const contextKey = `${asOfDate}|${compactDates.join(",")}`;
            const facilityContextFingerprint = readLiveFacilityContextHints(documentHost).join("\u001f")
                || "unverified-facility";
            const requestKey = `${facilityContextFingerprint}|${contextKey}`;
            if (activeRequestKey === requestKey && activeLoad !== null) {
                return activeLoad;
            }

            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            activeRequestKey = requestKey;
            const load = loadLiveSimilarityLensData({
                asOfDate,
                compactDates,
                contextKey,
                indexReader,
                primaryKeyReader,
                signal: controller.signal,
                transport
            });
            activeLoad = load;
            void load.then(() => {
                if (activeLoad !== load) {
                    return;
                }
                activeController = null;
                activeRequestKey = null;
                activeLoad = null;
            });
            return load;
        },
        stop() {
            stopped = true;
            activeController?.abort();
            activeController = null;
            activeLoad = null;
            activeRequestKey = null;
        }
    };
}

export function parseLiveSimilarityLensAsOfDate(documentHost: Document): string | null {
    const text = documentHost.body?.innerText ?? "";
    const match = /最終データ更新[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/u.exec(text);
    if (match === null) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }
    return `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

async function loadLiveSimilarityLensData(options: {
    asOfDate: string;
    compactDates: readonly string[];
    contextKey: string;
    indexReader: ExistingIndexedDbIndexReader;
    primaryKeyReader: ExistingIndexedDbPrimaryKeyReader;
    signal: AbortSignal;
    transport: NextReadTransport;
}): Promise<LiveSimilarityLensDataLoadResult> {
    try {
        const session = createNextReadSession(options.transport, options.signal);
        const firstDate = options.compactDates[0];
        const lastDate = options.compactDates.at(-1);
        if (firstDate === undefined || lastDate === undefined) {
            return { status: "error", reason: "visible-dates-invalid", contextKey: options.contextKey };
        }
        const [facilityPayload, currentSettingsPayload] = await Promise.all([
            session.read({ kind: "facility" }),
            session.read({ kind: "current-settings", from: firstDate, to: lastDate })
        ]);
        if (session.usedRequestCount() !== 2) {
            return { status: "error", reason: "read-failed", contextKey: options.contextKey };
        }
        const facilityContext = parseFacilityContext(facilityPayload);
        if (facilityContext === null) {
            return { status: "error", reason: "facility-response-invalid", contextKey: options.contextKey };
        }
        const { facilityId, facilityLabel } = facilityContext;
        const currentSettings = parseCurrentSettings(currentSettingsPayload);
        if (currentSettings === null) {
            return { status: "error", reason: "current-settings-response-invalid", contextKey: options.contextKey };
        }

        const bookingPrimaryKeys = buildCurrentBookingCurvePrimaryKeys({
            asOfDate: options.asOfDate,
            currentSettings,
            facilityId,
            visibleStayDates: options.compactDates
        });
        const [bookingReadStatus, competitorReadStatus] = await Promise.all([
            bookingPrimaryKeys.length === 0
                ? Promise.resolve<ExistingIndexedDbReadResult<BookingCurveRawSourceRecord>>({
                    status: "ready",
                    records: []
                })
                : options.primaryKeyReader<BookingCurveRawSourceRecord>({
                databaseName: BOOKING_CURVE_RAW_SOURCE_DB_NAME,
                databaseVersion: BOOKING_CURVE_RAW_SOURCE_DB_VERSION,
                storeName: BOOKING_CURVE_RAW_SOURCE_STORE_NAME,
                    keys: bookingPrimaryKeys
                }),
            options.indexReader<CompetitorPriceSnapshotRecord>({
                databaseName: COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
                databaseVersion: COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
                storeName: COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
                indexName: "facility-stay-date",
                keys: options.compactDates.map((stayDate) => [facilityId, stayDate])
            })
        ]);
        if (options.signal.aborted) {
            return { status: "error", reason: "aborted", contextKey: options.contextKey };
        }
        return {
            status: "ready",
            contextKey: `${facilityId}|${options.contextKey}`,
            facilityLabel,
            evidence: buildLiveSimilarityLensEvidence({
                facilityId,
                asOfDate: options.asOfDate,
                visibleStayDates: options.compactDates,
                currentSettings,
                bookingRawRecords: bookingReadStatus.status === "ready" ? bookingReadStatus.records : [],
                bookingReadStatus,
                competitorRecords: competitorReadStatus.status === "ready" ? competitorReadStatus.records : [],
                competitorReadStatus
            })
        };
    } catch (error: unknown) {
        return {
            status: "error",
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "read-failed",
            contextKey: options.contextKey
        };
    }
}

export function buildCurrentBookingCurvePrimaryKeys(options: {
    asOfDate: string;
    currentSettings: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    visibleStayDates: readonly string[];
}): string[] {
    const visibleStayDates = new Set(normalizeVisibleStayDates(options.visibleStayDates));
    const keys = new Set<string>();
    for (const setting of options.currentSettings.suggest_output_current_settings ?? []) {
        const stayDate = normalizeVisibleStayDates([setting.stay_date ?? ""])[0];
        if (stayDate === undefined || !visibleStayDates.has(stayDate)) {
            continue;
        }
        for (const roomGroup of setting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            if (roomGroupId === "") {
                continue;
            }
            keys.add(buildBookingCurveRawSourceCacheKey({
                facilityId: options.facilityId,
                stayDate,
                asOfDate: options.asOfDate,
                scope: "roomGroup",
                roomGroupId,
                endpoint: BOOKING_CURVE_ENDPOINT,
                query: `date=${stayDate}&rm_room_group_id=${roomGroupId}`
            }));
        }
    }
    return Array.from(keys).sort();
}

function parseFacilityContext(payload: unknown): { facilityId: string; facilityLabel: string } | null {
    if (!isRecord(payload)) {
        return null;
    }
    const yadNo = typeof payload.yad_no === "string" ? payload.yad_no.trim() : "";
    const facilityLabel = typeof payload.name === "string" ? payload.name.trim() : "";
    return yadNo === "" || facilityLabel === ""
        ? null
        : { facilityId: `yad:${yadNo}`, facilityLabel };
}

function parseCurrentSettings(payload: unknown): RankRecommendationCurrentSettingsResponse | null {
    if (!isRecord(payload) || !Array.isArray(payload.suggest_output_current_settings)) {
        return null;
    }
    if (!payload.suggest_output_current_settings.every(isCurrentSettingByDate)) {
        return null;
    }
    return payload as RankRecommendationCurrentSettingsResponse;
}

function isCurrentSettingByDate(value: unknown): value is RankRecommendationCurrentSettingByDate {
    if (!isRecord(value) || !isOptionalString(value.stay_date)) {
        return false;
    }
    return value.rm_room_groups === undefined
        || (Array.isArray(value.rm_room_groups) && value.rm_room_groups.every(isCurrentSettingRoomGroup));
}

function isCurrentSettingRoomGroup(value: unknown): value is RankRecommendationCurrentSettingRoomGroup {
    if (!isRecord(value)) {
        return false;
    }
    if (
        !isOptionalString(value.rm_room_group_id)
        || !isOptionalString(value.rm_room_group_name)
        || !isOptionalNumber(value.remaining_num_room)
        || !isOptionalNumber(value.max_num_room)
    ) {
        return false;
    }
    const latestCurrent = value.latest_current;
    return latestCurrent === undefined
        || latestCurrent === null
        || (
            isRecord(latestCurrent)
            && isOptionalNullableString(latestCurrent.price_rank_code)
            && isOptionalNullableString(latestCurrent.price_rank_name)
        );
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | undefined {
    return value === undefined || typeof value === "number";
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
    return value === undefined || value === null || typeof value === "string";
}

function normalizeVisibleStayDates(stayDates: readonly string[]): string[] {
    return Array.from(new Set(stayDates.flatMap((stayDate) => {
        const compact = stayDate.trim().replace(/-/gu, "");
        return /^\d{8}$/u.test(compact) && isValidCompactDate(compact) ? [compact] : [];
    }))).sort();
}

function isValidCompactDate(compact: string): boolean {
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}
