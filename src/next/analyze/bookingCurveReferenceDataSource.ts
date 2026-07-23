import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_DB_NAME,
    BOOKING_CURVE_RAW_SOURCE_DB_VERSION,
    BOOKING_CURVE_RAW_SOURCE_STORE_NAME,
    buildBookingCurveRawSourceCacheKey,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";
import {
    getRecentWeighted90CandidateStayDates,
    getSeasonalComponentCandidateStayDates,
    getUtcWeekday,
    normalizeDateKey,
    toCompactDateKey
} from "../../curveCore";
import {
    readExistingIndexedDbRecordsByPrimaryKeys,
    type ExistingIndexedDbPrimaryKeyReadOptions,
    type ExistingIndexedDbReadResult
} from "../../indexedDbReadOnly";
import { LEAD_TIME_BUCKET_TICKS } from "../../leadTimeBuckets";
import { parseNextFacilityContext } from "../facilityContext";
import {
    createBrowserNextReadTransport,
    createNextReadSession,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";

export interface BookingCurveReferenceScope {
    key: string;
    kind: "hotel" | "roomGroup";
    label: string;
    roomGroupId: string | null;
}

export type BookingCurveReferenceDataLoadResult =
    | {
        status: "ready";
        asOfDate: string;
        contextKey: string;
        facilityId: string;
        facilityLabel: string;
        readStatus: ExistingIndexedDbReadResult<BookingCurveRawSourceRecord>;
        records: unknown[];
        scope: BookingCurveReferenceScope;
        scopes: readonly BookingCurveReferenceScope[];
        stayDate: string;
    }
    | {
        status: "error";
        contextKey: string;
        reason:
            | "aborted"
            | "as-of-invalid"
            | "current-settings-response-invalid"
            | "facility-response-invalid"
            | "read-failed"
            | "scope-invalid"
            | "stay-date-invalid";
    };

export interface BookingCurveReferenceDataSource {
    cancel(): void;
    load(stayDate: string, asOfDate: string, scopeKey: string): Promise<BookingCurveReferenceDataLoadResult>;
    reset(): void;
    stop(): void;
}

export type ExistingIndexedDbPrimaryKeyReader = <T>(
    options: ExistingIndexedDbPrimaryKeyReadOptions
) => Promise<ExistingIndexedDbReadResult<T>>;

export interface CreateBookingCurveReferenceDataSourceOptions {
    primaryKeyReader?: ExistingIndexedDbPrimaryKeyReader;
    transport?: NextReadTransport;
    windowHost?: Window;
}

interface BookingCurveReferenceContext {
    asOfDate: string;
    contextKey: string;
    facilityId: string;
    facilityLabel: string;
    scopes: readonly BookingCurveReferenceScope[];
    stayDate: string;
}

export function createBookingCurveReferenceDataSource(
    options: CreateBookingCurveReferenceDataSourceOptions = {}
): BookingCurveReferenceDataSource {
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const primaryKeyReader = options.primaryKeyReader ?? readExistingIndexedDbRecordsByPrimaryKeys;
    let activeController: AbortController | null = null;
    let activeLoad: Promise<BookingCurveReferenceDataLoadResult> | null = null;
    let activeLoadKey: string | null = null;
    let context: BookingCurveReferenceContext | null = null;
    let stopped = false;

    const cancel = (): void => {
        activeController?.abort();
        activeController = null;
        activeLoad = null;
        activeLoadKey = null;
    };
    const reset = (): void => {
        cancel();
        context = null;
    };

    return {
        cancel,
        load(stayDate, asOfDate, scopeKey) {
            if (stopped) {
                return Promise.resolve({ status: "error", contextKey: "stopped", reason: "aborted" });
            }
            const compactStayDate = toCompactDateKey(stayDate);
            const compactAsOfDate = toCompactDateKey(asOfDate);
            const contextKey = `${compactStayDate ?? "invalid"}|${compactAsOfDate ?? "invalid"}`;
            if (compactStayDate === null) {
                return Promise.resolve({ status: "error", contextKey, reason: "stay-date-invalid" });
            }
            if (compactAsOfDate === null) {
                return Promise.resolve({ status: "error", contextKey, reason: "as-of-invalid" });
            }
            const loadKey = `${contextKey}|${scopeKey}`;
            if (activeLoadKey === loadKey && activeLoad !== null) {
                return activeLoad;
            }
            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            activeLoadKey = loadKey;
            const load = loadBookingCurveReferenceData({
                asOfDate: compactAsOfDate,
                context,
                primaryKeyReader,
                scopeKey,
                signal: controller.signal,
                stayDate: compactStayDate,
                transport
            }).then((result) => {
                if (result.status === "ready") {
                    context = {
                        asOfDate: result.asOfDate,
                        contextKey: result.contextKey,
                        facilityId: result.facilityId,
                        facilityLabel: result.facilityLabel,
                        scopes: result.scopes,
                        stayDate: result.stayDate
                    };
                }
                return result;
            });
            activeLoad = load;
            void load.finally(() => {
                if (activeLoad !== load) {
                    return;
                }
                activeController = null;
                activeLoad = null;
                activeLoadKey = null;
            });
            return load;
        },
        reset,
        stop() {
            stopped = true;
            reset();
        }
    };
}

async function loadBookingCurveReferenceData(options: {
    asOfDate: string;
    context: BookingCurveReferenceContext | null;
    primaryKeyReader: ExistingIndexedDbPrimaryKeyReader;
    scopeKey: string;
    signal: AbortSignal;
    stayDate: string;
    transport: NextReadTransport;
}): Promise<BookingCurveReferenceDataLoadResult> {
    const contextKey = `${options.stayDate}|${options.asOfDate}`;
    try {
        const reusableContext = options.context?.contextKey === contextKey ? options.context : null;
        const resolvedContext = reusableContext ?? await loadBookingCurveReferenceContext({
            asOfDate: options.asOfDate,
            signal: options.signal,
            stayDate: options.stayDate,
            transport: options.transport
        });
        if ("reason" in resolvedContext) {
            return resolvedContext;
        }
        const scope = resolvedContext.scopes.find((item) => item.key === options.scopeKey) ?? null;
        if (scope === null) {
            return { status: "error", contextKey, reason: "scope-invalid" };
        }
        const keys = buildBookingCurveReferencePrimaryKeys({
            asOfDate: options.asOfDate,
            facilityId: resolvedContext.facilityId,
            scope,
            stayDate: options.stayDate
        });
        const readStatus = await options.primaryKeyReader<BookingCurveRawSourceRecord>({
            databaseName: BOOKING_CURVE_RAW_SOURCE_DB_NAME,
            databaseVersion: BOOKING_CURVE_RAW_SOURCE_DB_VERSION,
            storeName: BOOKING_CURVE_RAW_SOURCE_STORE_NAME,
            keys
        });
        if (options.signal.aborted) {
            return { status: "error", contextKey, reason: "aborted" };
        }
        return {
            status: "ready",
            asOfDate: options.asOfDate,
            contextKey,
            facilityId: resolvedContext.facilityId,
            facilityLabel: resolvedContext.facilityLabel,
            readStatus,
            records: readStatus.status === "ready" ? readStatus.records : [],
            scope,
            scopes: resolvedContext.scopes,
            stayDate: options.stayDate
        };
    } catch (error: unknown) {
        return {
            status: "error",
            contextKey,
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "read-failed"
        };
    }
}

async function loadBookingCurveReferenceContext(options: {
    asOfDate: string;
    signal: AbortSignal;
    stayDate: string;
    transport: NextReadTransport;
}): Promise<BookingCurveReferenceContext | Extract<BookingCurveReferenceDataLoadResult, { status: "error" }>> {
    const contextKey = `${options.stayDate}|${options.asOfDate}`;
    const session = createNextReadSession(options.transport, options.signal);
    const [facilityPayload, currentSettingsPayload] = await Promise.all([
        session.read({ kind: "facility" }),
        session.read({ kind: "current-settings", from: options.stayDate, to: options.stayDate })
    ]);
    if (session.usedRequestCount() !== 2) {
        return { status: "error", contextKey, reason: "read-failed" };
    }
    const facility = parseNextFacilityContext(facilityPayload);
    if (facility === null) {
        return { status: "error", contextKey, reason: "facility-response-invalid" };
    }
    const scopes = parseBookingCurveReferenceScopes(currentSettingsPayload, options.stayDate);
    if (scopes === null) {
        return { status: "error", contextKey, reason: "current-settings-response-invalid" };
    }
    return {
        asOfDate: options.asOfDate,
        contextKey,
        facilityId: facility.facilityId,
        facilityLabel: facility.facilityLabel,
        scopes,
        stayDate: options.stayDate
    };
}

export function parseBookingCurveReferenceScopes(
    payload: unknown,
    stayDate: string
): BookingCurveReferenceScope[] | null {
    if (!isRecord(payload) || !Array.isArray(payload.suggest_output_current_settings)) {
        return null;
    }
    const compactStayDate = toCompactDateKey(stayDate);
    if (compactStayDate === null) {
        return null;
    }
    const scopes: BookingCurveReferenceScope[] = [{
        key: "hotel",
        kind: "hotel",
        label: "ホテル全体",
        roomGroupId: null
    }];
    const seenRoomGroupIds = new Set<string>();
    for (const setting of payload.suggest_output_current_settings) {
        if (!isRecord(setting) || typeof setting.stay_date !== "string") {
            return null;
        }
        if (toCompactDateKey(setting.stay_date) !== compactStayDate) {
            continue;
        }
        if (setting.rm_room_groups !== undefined && !Array.isArray(setting.rm_room_groups)) {
            return null;
        }
        for (const roomGroup of setting.rm_room_groups ?? []) {
            if (!isRecord(roomGroup)) {
                return null;
            }
            const roomGroupId = typeof roomGroup.rm_room_group_id === "string"
                ? roomGroup.rm_room_group_id.trim()
                : "";
            const roomGroupName = typeof roomGroup.rm_room_group_name === "string"
                ? roomGroup.rm_room_group_name.trim()
                : "";
            if (roomGroupId === "" || roomGroupName === "" || seenRoomGroupIds.has(roomGroupId)) {
                continue;
            }
            seenRoomGroupIds.add(roomGroupId);
            scopes.push({
                key: `room:${roomGroupId}`,
                kind: "roomGroup",
                label: roomGroupName,
                roomGroupId
            });
        }
    }
    return scopes;
}

export function buildBookingCurveReferencePrimaryKeys(options: {
    asOfDate: string;
    facilityId: string;
    scope: BookingCurveReferenceScope;
    stayDate: string;
}): string[] {
    const normalizedStayDate = normalizeDateKey(options.stayDate);
    const normalizedAsOfDate = normalizeDateKey(options.asOfDate);
    const weekday = normalizedStayDate === null ? null : getUtcWeekday(normalizedStayDate);
    if (normalizedStayDate === null || normalizedAsOfDate === null || weekday === null) {
        return [];
    }
    const stayDates = new Set<string>([normalizedStayDate]);
    for (const candidate of getRecentWeighted90CandidateStayDates({
        targetStayDate: normalizedStayDate,
        asOfDate: normalizedAsOfDate,
        ticks: LEAD_TIME_BUCKET_TICKS
    })) {
        stayDates.add(candidate);
    }
    for (const candidate of getSeasonalComponentCandidateStayDates({
        targetMonth: normalizedStayDate.slice(0, 7),
        weekday
    })) {
        stayDates.add(candidate);
    }
    const roomGroupId = options.scope.kind === "roomGroup" ? options.scope.roomGroupId : null;
    return Array.from(stayDates)
        .map((stayDate) => toCompactDateKey(stayDate))
        .filter((stayDate): stayDate is string => stayDate !== null)
        .map((stayDate) => buildBookingCurveRawSourceCacheKey({
            facilityId: options.facilityId,
            stayDate,
            asOfDate: toCompactDateKey(normalizedAsOfDate) ?? options.asOfDate,
            scope: options.scope.kind,
            ...(roomGroupId === null ? {} : { roomGroupId }),
            endpoint: BOOKING_CURVE_ENDPOINT,
            query: roomGroupId === null
                ? `date=${stayDate}`
                : `date=${stayDate}&rm_room_group_id=${roomGroupId}`
        }))
        .sort();
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
