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
    hasLiveFacilityContextLabel,
    readLiveFacilityContextHints
} from "../live/liveCalendarDomAdapter";
import type {
    NextBookingCurveAcquisitionContext
} from "../bookingCurve/bookingCurveAcquisitionModel";
import {
    buildNextBookingCurveCurrentTasks,
    buildNextBookingCurveReferenceTasks
} from "../bookingCurve/bookingCurveAcquisitionModel";
import type {
    NextBookingCurveAcquisitionCoordinator,
    NextBookingCurveAcquisitionDiagnostics,
    NextBookingCurveCurrentPriority,
    NextBookingCurveReferencePriority
} from "../bookingCurve/bookingCurveAcquisitionCoordinator";
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
        acquisitionDiagnostics?: {
            current: NextBookingCurveAcquisitionDiagnostics;
            reference: NextBookingCurveAcquisitionDiagnostics;
            referenceDeferred: boolean;
        };
        contextKey: string;
        facilityId: string;
        facilityLabel: string;
        readProfile: BookingCurveReferenceReadProfile;
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
            | "facility-context-mismatch"
            | "facility-response-invalid"
            | "read-failed"
            | "scope-invalid"
            | "stay-date-invalid";
    };

export interface BookingCurveReferenceDataSource {
    cancel(): void;
    load(
        stayDate: string,
        asOfDate: string,
        scopeKey: string,
        priorities?: BookingCurveReferenceLoadPriorities
    ): Promise<BookingCurveReferenceDataLoadResult>;
    prioritize?(
        stayDate: string,
        asOfDate: string,
        scopeKey: string,
        priorities?: BookingCurveReferenceLoadPriorities
    ): void;
    reset(): void;
    subscribe?(listener: (scopeKey?: string) => void): () => void;
    stop(): void;
}

export interface BookingCurveReferenceLoadPriorities {
    currentPriority?: NextBookingCurveCurrentPriority;
    readProfile?: BookingCurveReferenceReadProfile;
    referencePriority?: NextBookingCurveReferencePriority | null;
    waitForCurrent?: boolean;
}

export type BookingCurveReferenceReadProfile = "current-only" | "full";

export type ExistingIndexedDbPrimaryKeyReader = <T>(
    options: ExistingIndexedDbPrimaryKeyReadOptions
) => Promise<ExistingIndexedDbReadResult<T>>;

export interface CreateBookingCurveReferenceDataSourceOptions {
    acquisition?: NextBookingCurveAcquisitionCoordinator;
    documentHost?: Document;
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
    const activeLoads = new Map<string, {
        controller: AbortController;
        load: Promise<BookingCurveReferenceDataLoadResult>;
    }>();
    let context: BookingCurveReferenceContext | null = null;
    let priorityController: AbortController | null = null;
    let stopped = false;

    const cancel = (): void => {
        for (const active of activeLoads.values()) {
            active.controller.abort();
        }
        activeLoads.clear();
        priorityController?.abort();
        priorityController = null;
    };
    const reset = (): void => {
        cancel();
        context = null;
    };

    return {
        cancel,
        load(stayDate, asOfDate, scopeKey, priorities = {}) {
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
            const readProfile = priorities.readProfile ?? "full";
            const loadKey = `${contextKey}|${scopeKey}|${readProfile}`;
            const existingLoad = activeLoads.get(loadKey);
            if (existingLoad !== undefined) {
                return existingLoad.load;
            }
            if (context !== null && context.contextKey !== contextKey) {
                for (const active of activeLoads.values()) {
                    active.controller.abort();
                }
                activeLoads.clear();
                priorityController?.abort();
                priorityController = null;
            }
            const controller = new AbortController();
            const load = loadBookingCurveReferenceData({
                asOfDate: compactAsOfDate,
                ...(options.acquisition === undefined ? {} : { acquisition: options.acquisition }),
                context,
                currentPriority: priorities.currentPriority ?? "critical-current",
                facilityContextHints: options.acquisition === undefined
                    ? null
                    : options.documentHost === undefined
                        ? []
                        : readLiveFacilityContextHints(options.documentHost),
                primaryKeyReader,
                readProfile,
                referencePriority: priorities.referencePriority === undefined
                    ? "selected-reference"
                    : priorities.referencePriority,
                scopeKey,
                signal: controller.signal,
                stayDate: compactStayDate,
                transport,
                waitForCurrent: priorities.waitForCurrent ?? true
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
            activeLoads.set(loadKey, { controller, load });
            void load.finally(() => {
                if (activeLoads.get(loadKey)?.load !== load) {
                    return;
                }
                activeLoads.delete(loadKey);
            });
            return load;
        },
        prioritize(stayDate, asOfDate, scopeKey, priorities = {}) {
            const acquisition = options.acquisition;
            const compactStayDate = toCompactDateKey(stayDate);
            const compactAsOfDate = toCompactDateKey(asOfDate);
            const resolvedContext = context;
            if (
                stopped
                || acquisition === undefined
                || compactStayDate === null
                || compactAsOfDate === null
                || resolvedContext === null
                || resolvedContext.contextKey !== `${compactStayDate}|${compactAsOfDate}`
                || options.documentHost === undefined
                || !hasLiveFacilityContextLabel(
                    readLiveFacilityContextHints(options.documentHost),
                    resolvedContext.facilityLabel
                )
                || !resolvedContext.scopes.some((scope) => scope.key === scopeKey)
            ) {
                return;
            }
            if (priorityController === null || priorityController.signal.aborted) {
                priorityController = new AbortController();
            }
            const signal = priorityController.signal;
            const currentPriority = priorities.currentPriority ?? "critical-current";
            const referencePriority = priorities.referencePriority === undefined
                ? "selected-reference"
                : priorities.referencePriority;
            const acquisitionContext = buildAcquisitionContext(
                resolvedContext,
                compactAsOfDate,
                compactStayDate
            );
            void acquisition.ensureCurrent({
                context: acquisitionContext,
                priority: currentPriority,
                scopeKeys: [scopeKey],
                signal,
                stayDate: compactStayDate
            }).then(async (current) => {
                if (signal.aborted || current.outcome === "aborted") {
                    return;
                }
                if (referencePriority === null) {
                    return;
                }
                await acquisition.startReference({
                    context: acquisitionContext,
                    priority: referencePriority,
                    scopeKey,
                    targetStayDate: compactStayDate
                });
            }).catch(() => undefined);
        },
        reset,
        subscribe(listener) {
            if (options.acquisition === undefined) {
                return () => undefined;
            }
            if (options.acquisition.subscribeStored !== undefined) {
                return options.acquisition.subscribeStored(({ scopeKey }) => {
                    listener(scopeKey);
                });
            }
            let storedCount = -1;
            return options.acquisition.subscribe((nextState) => {
                if (storedCount < 0) {
                    storedCount = nextState.storedCount;
                    return;
                }
                if (nextState.storedCount !== storedCount) {
                    storedCount = nextState.storedCount;
                    listener(undefined);
                }
            });
        },
        stop() {
            stopped = true;
            reset();
        }
    };
}

async function loadBookingCurveReferenceData(options: {
    acquisition?: NextBookingCurveAcquisitionCoordinator;
    asOfDate: string;
    context: BookingCurveReferenceContext | null;
    currentPriority: NextBookingCurveCurrentPriority;
    facilityContextHints: readonly string[] | null;
    primaryKeyReader: ExistingIndexedDbPrimaryKeyReader;
    readProfile: BookingCurveReferenceReadProfile;
    referencePriority: NextBookingCurveReferencePriority | null;
    scopeKey: string;
    signal: AbortSignal;
    stayDate: string;
    transport: NextReadTransport;
    waitForCurrent: boolean;
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
        if (
            options.acquisition !== undefined
            && (
                options.facilityContextHints === null
                || !hasLiveFacilityContextLabel(
                    options.facilityContextHints,
                    resolvedContext.facilityLabel
                )
            )
        ) {
            return { status: "error", contextKey, reason: "facility-context-mismatch" };
        }
        const scope = resolvedContext.scopes.find((item) => item.key === options.scopeKey) ?? null;
        if (scope === null) {
            return { status: "error", contextKey, reason: "scope-invalid" };
        }
        const keys = buildBookingCurveReferencePrimaryKeys({
            asOfDate: options.asOfDate,
            facilityId: resolvedContext.facilityId,
            readProfile: options.readProfile,
            scope,
            stayDate: options.stayDate
        });
        const acquisition = options.acquisition;
        const acquisitionContext = buildAcquisitionContext(
            resolvedContext,
            options.asOfDate,
            options.stayDate
        );
        let acquisitionDiagnostics: Extract<
            BookingCurveReferenceDataLoadResult,
            { status: "ready" }
        >["acquisitionDiagnostics"];
        if (acquisition !== undefined) {
            const current = await acquisition.ensureCurrent({
                context: acquisitionContext,
                priority: options.currentPriority,
                scopeKeys: [scope.key],
                signal: options.signal,
                stayDate: options.stayDate,
                waitForCompletion: options.waitForCurrent
            });
            const reference: NextBookingCurveAcquisitionDiagnostics =
                options.referencePriority === null
                    ? { candidateTaskCount: 0, dueTaskCount: 0, outcome: "ready" }
                    : await acquisition.startReference({
                        context: acquisitionContext,
                        priority: options.referencePriority,
                        scopeKey: scope.key,
                        targetStayDate: options.stayDate
                    });
            if (isAcquisitionDiagnostics(current) && isAcquisitionDiagnostics(reference)) {
                acquisitionDiagnostics = {
                    current,
                    reference,
                    referenceDeferred: options.referencePriority === null
                };
            }
        }
        const nextSourceKeys = buildBookingCurveReferenceSourceKeys({
            context: acquisitionContext,
            readProfile: options.readProfile,
            scopeKey: scope.key,
            stayDate: options.stayDate
        });
        const [classicReadStatus, nextRecords] = await Promise.all([
            options.primaryKeyReader<BookingCurveRawSourceRecord>({
                databaseName: BOOKING_CURVE_RAW_SOURCE_DB_NAME,
                databaseVersion: BOOKING_CURVE_RAW_SOURCE_DB_VERSION,
                storeName: BOOKING_CURVE_RAW_SOURCE_STORE_NAME,
                keys
            }),
            acquisition?.readLatest(nextSourceKeys) ?? Promise.resolve([])
        ]);
        if (options.signal.aborted) {
            return { status: "error", contextKey, reason: "aborted" };
        }
        const records = [
            ...(classicReadStatus.status === "ready" ? classicReadStatus.records : []),
            ...nextRecords
        ];
        const readStatus: ExistingIndexedDbReadResult<BookingCurveRawSourceRecord> =
            records.length > 0 ? { status: "ready", records } : classicReadStatus;
        return {
            status: "ready",
            ...(acquisitionDiagnostics === undefined ? {} : { acquisitionDiagnostics }),
            asOfDate: options.asOfDate,
            contextKey,
            facilityId: resolvedContext.facilityId,
            facilityLabel: resolvedContext.facilityLabel,
            readProfile: options.readProfile,
            readStatus,
            records,
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

function isAcquisitionDiagnostics(
    value: unknown
): value is NextBookingCurveAcquisitionDiagnostics {
    return typeof value === "object"
        && value !== null
        && "candidateTaskCount" in value
        && Number.isInteger(value.candidateTaskCount)
        && "dueTaskCount" in value
        && Number.isInteger(value.dueTaskCount)
        && "outcome" in value
        && (value.outcome === "ready" || value.outcome === "aborted");
}

function buildAcquisitionContext(
    context: BookingCurveReferenceContext,
    asOfDate: string,
    stayDate: string
): NextBookingCurveAcquisitionContext {
    return {
        asOfDate,
        facilityId: context.facilityId,
        roomScopes: context.scopes.map((scope) => ({
            key: scope.key,
            kind: scope.kind,
            roomGroupId: scope.roomGroupId
        })),
        visibleStayDates: [stayDate]
    };
}

export function buildBookingCurveReferenceSourceKeys(options: {
    context: NextBookingCurveAcquisitionContext;
    readProfile?: BookingCurveReferenceReadProfile;
    scopeKey: string;
    stayDate: string;
}): string[] {
    const tasks = [
        ...buildNextBookingCurveCurrentTasks({
            context: options.context,
            scopeKeys: [options.scopeKey],
            stayDate: options.stayDate
        }),
        ...(options.readProfile === "current-only"
            ? []
            : buildNextBookingCurveReferenceTasks({
                context: options.context,
                scopeKey: options.scopeKey,
                targetStayDate: options.stayDate
            }))
    ];
    return Array.from(new Set(tasks.map((task) => task.sourceKey))).sort();
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
    readProfile?: BookingCurveReferenceReadProfile;
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
    if (options.readProfile !== "current-only") {
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
