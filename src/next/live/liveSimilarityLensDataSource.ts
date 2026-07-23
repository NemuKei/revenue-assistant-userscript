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
import { parseNextFacilityContext } from "../facilityContext";
import {
    createNextBookingCurveScopes,
    type NextBookingCurveAcquisitionContext
} from "../bookingCurve/bookingCurveAcquisitionModel";
import type {
    NextBookingCurveAcquisitionCoordinator
} from "../bookingCurve/bookingCurveAcquisitionCoordinator";
import { buildNextBookingCurveSourceKey } from "../bookingCurve/bookingCurveSourceStore";
import {
    buildLiveSimilarityLensEvidence,
    type LiveSimilarityLensEvidenceViewModel
} from "./liveSimilarityLensEvidence";
import {
    hasLiveFacilityContextLabel,
    readLiveFacilityContextHints
} from "./liveCalendarDomAdapter";
import {
    createBrowserNextReadTransport,
    createNextReadSession,
    type NextReadTransport
} from "./liveSimilarityLensTransport";

export type LiveSimilarityLensDataLoadErrorReason =
    | "as-of-missing"
    | "visible-dates-invalid"
    | "facility-response-invalid"
    | "facility-context-mismatch"
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
    load(
        visibleStayDates: readonly string[],
        selectedStayDate?: string
    ): Promise<LiveSimilarityLensDataLoadResult>;
    refresh?(): Promise<LiveSimilarityLensDataLoadResult>;
    subscribe?(listener: () => void): () => void;
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
    acquisition?: NextBookingCurveAcquisitionCoordinator;
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
    let resolvedContext: LiveSimilarityLensResolvedContext | null = null;
    let stopped = false;

    return {
        load(visibleStayDates, selectedStayDate) {
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
            const facilityContextHints = readLiveFacilityContextHints(documentHost);
            const facilityContextFingerprint = facilityContextHints.join("\u001f")
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
                facilityContextHints,
                ...(options.acquisition === undefined ? {} : { acquisition: options.acquisition }),
                indexReader,
                primaryKeyReader,
                ...(selectedStayDate === undefined ? {} : { selectedStayDate }),
                onResolvedContext(context) {
                    resolvedContext = context;
                },
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
        refresh() {
            if (stopped || resolvedContext === null) {
                return Promise.resolve({ status: "error", reason: "aborted", contextKey: null });
            }
            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            const load = readLiveSimilarityLensStoredData({
                context: resolvedContext,
                indexReader,
                primaryKeyReader,
                signal: controller.signal,
                ...(options.acquisition === undefined ? {} : { acquisition: options.acquisition })
            });
            activeLoad = load;
            void load.finally(() => {
                if (activeLoad === load) {
                    activeController = null;
                    activeLoad = null;
                }
            });
            return load;
        },
        subscribe(listener) {
            if (options.acquisition === undefined) {
                return () => undefined;
            }
            let storedCount = -1;
            return options.acquisition.subscribe((nextState) => {
                if (storedCount < 0) {
                    storedCount = nextState.storedCount;
                    return;
                }
                if (nextState.storedCount !== storedCount) {
                    storedCount = nextState.storedCount;
                    listener();
                }
            });
        },
        stop() {
            stopped = true;
            activeController?.abort();
            activeController = null;
            activeLoad = null;
            activeRequestKey = null;
            resolvedContext = null;
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
    acquisition?: NextBookingCurveAcquisitionCoordinator;
    asOfDate: string;
    compactDates: readonly string[];
    contextKey: string;
    facilityContextHints: readonly string[];
    indexReader: ExistingIndexedDbIndexReader;
    onResolvedContext?: (context: LiveSimilarityLensResolvedContext) => void;
    primaryKeyReader: ExistingIndexedDbPrimaryKeyReader;
    selectedStayDate?: string;
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
        const facilityContext = parseNextFacilityContext(facilityPayload);
        if (facilityContext === null) {
            return { status: "error", reason: "facility-response-invalid", contextKey: options.contextKey };
        }
        const { facilityId, facilityLabel } = facilityContext;
        if (
            options.acquisition !== undefined
            && !hasLiveFacilityContextLabel(options.facilityContextHints, facilityLabel)
        ) {
            return {
                status: "error",
                reason: "facility-context-mismatch",
                contextKey: options.contextKey
            };
        }
        const currentSettings = parseLiveSimilarityLensCurrentSettings(currentSettingsPayload);
        if (currentSettings === null) {
            return { status: "error", reason: "current-settings-response-invalid", contextKey: options.contextKey };
        }
        const acquisitionContext: NextBookingCurveAcquisitionContext = {
            asOfDate: options.asOfDate,
            facilityId,
            roomScopes: createNextBookingCurveScopes(currentSettings),
            visibleStayDates: options.compactDates
        };
        const resolvedContext: LiveSimilarityLensResolvedContext = {
            acquisitionContext,
            asOfDate: options.asOfDate,
            compactDates: options.compactDates,
            contextKey: options.contextKey,
            currentSettings,
            facilityId,
            facilityLabel
        };
        options.onResolvedContext?.(resolvedContext);
        if (options.acquisition !== undefined) {
            await options.acquisition.startBackground(acquisitionContext);
            const selectedStayDate = options.selectedStayDate === undefined
                ? null
                : normalizeVisibleStayDates([options.selectedStayDate])[0] ?? null;
            if (selectedStayDate !== null && options.compactDates.includes(selectedStayDate)) {
                await options.acquisition.ensureCurrent({
                    context: acquisitionContext,
                    signal: options.signal,
                    stayDate: selectedStayDate
                });
            }
        }

        return readLiveSimilarityLensStoredData({
            ...(options.acquisition === undefined ? {} : { acquisition: options.acquisition }),
            context: resolvedContext,
            indexReader: options.indexReader,
            primaryKeyReader: options.primaryKeyReader,
            signal: options.signal
        });
    } catch (error: unknown) {
        return {
            status: "error",
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "read-failed",
            contextKey: options.contextKey
        };
    }
}

interface LiveSimilarityLensResolvedContext {
    acquisitionContext: NextBookingCurveAcquisitionContext;
    asOfDate: string;
    compactDates: readonly string[];
    contextKey: string;
    currentSettings: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    facilityLabel: string;
}

async function readLiveSimilarityLensStoredData(options: {
    acquisition?: NextBookingCurveAcquisitionCoordinator;
    context: LiveSimilarityLensResolvedContext;
    indexReader: ExistingIndexedDbIndexReader;
    primaryKeyReader: ExistingIndexedDbPrimaryKeyReader;
    signal: AbortSignal;
}): Promise<LiveSimilarityLensDataLoadResult> {
    try {
        const {
            asOfDate,
            compactDates,
            contextKey,
            currentSettings,
            facilityId,
            facilityLabel
        } = options.context;
        const bookingPrimaryKeys = buildCurrentBookingCurvePrimaryKeys({
            asOfDate,
            currentSettings,
            facilityId,
            visibleStayDates: compactDates
        });
        const bookingSourceKeys = buildCurrentBookingCurveSourceKeys({
            currentSettings,
            facilityId,
            visibleStayDates: compactDates
        });
        const [classicBookingReadStatus, nextBookingRecords, competitorReadStatus] = await Promise.all([
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
            options.acquisition?.readLatest(bookingSourceKeys) ?? Promise.resolve([]),
            options.indexReader<CompetitorPriceSnapshotRecord>({
                databaseName: COMPETITOR_PRICE_SNAPSHOT_DB_NAME,
                databaseVersion: COMPETITOR_PRICE_SNAPSHOT_DB_VERSION,
                storeName: COMPETITOR_PRICE_SNAPSHOT_STORE_NAME,
                indexName: "facility-stay-date",
                keys: compactDates.map((stayDate) => [facilityId, stayDate])
            })
        ]);
        if (options.signal.aborted) {
            return { status: "error", reason: "aborted", contextKey };
        }
        const bookingRecords = [
            ...(classicBookingReadStatus.status === "ready"
                ? classicBookingReadStatus.records
                : []),
            ...nextBookingRecords
        ];
        const bookingReadStatus: ExistingIndexedDbReadResult<BookingCurveRawSourceRecord> =
            bookingRecords.length > 0
                ? { status: "ready", records: bookingRecords }
                : classicBookingReadStatus;
        return {
            status: "ready",
            contextKey: `${facilityId}|${contextKey}`,
            facilityLabel,
            evidence: buildLiveSimilarityLensEvidence({
                facilityId,
                asOfDate,
                visibleStayDates: compactDates,
                currentSettings,
                bookingRawRecords: bookingRecords,
                bookingReadStatus,
                competitorRecords: competitorReadStatus.status === "ready"
                    ? competitorReadStatus.records
                    : [],
                competitorReadStatus
            })
        };
    } catch (error: unknown) {
        return {
            status: "error",
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "read-failed",
            contextKey: options.context.contextKey
        };
    }
}

export function buildCurrentBookingCurveSourceKeys(options: {
    currentSettings: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    visibleStayDates: readonly string[];
}): string[] {
    const visibleStayDates = new Set(normalizeVisibleStayDates(options.visibleStayDates));
    const keys = new Set<string>();
    for (const stayDate of visibleStayDates) {
        keys.add(buildNextBookingCurveSourceKey({
            facilityId: options.facilityId,
            roomGroupId: null,
            scope: "hotel",
            stayDate
        }));
    }
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
            keys.add(buildNextBookingCurveSourceKey({
                facilityId: options.facilityId,
                roomGroupId,
                scope: "roomGroup",
                stayDate
            }));
        }
    }
    return Array.from(keys).sort();
}

export function buildCurrentBookingCurvePrimaryKeys(options: {
    asOfDate: string;
    currentSettings: RankRecommendationCurrentSettingsResponse;
    facilityId: string;
    visibleStayDates: readonly string[];
}): string[] {
    const visibleStayDates = new Set(normalizeVisibleStayDates(options.visibleStayDates));
    const keys = new Set<string>();
    for (const stayDate of visibleStayDates) {
        keys.add(buildBookingCurveRawSourceCacheKey({
            facilityId: options.facilityId,
            stayDate,
            asOfDate: options.asOfDate,
            scope: "hotel",
            endpoint: BOOKING_CURVE_ENDPOINT,
            query: `date=${stayDate}`
        }));
    }
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

export function parseLiveSimilarityLensCurrentSettings(
    payload: unknown
): RankRecommendationCurrentSettingsResponse | null {
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
