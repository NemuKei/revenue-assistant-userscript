import {
    COMPETITOR_PRICE_ENDPOINT,
    COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
    buildCompetitorPriceConditionSignature,
    type CompetitorPriceSnapshotCompetitor,
    type CompetitorPriceSnapshotHotel,
    type CompetitorPriceSnapshotPayload,
    type CompetitorPriceSnapshotPlan,
    type CompetitorPriceSnapshotRecord,
    type CompetitorPriceSnapshotSearchCondition
} from "../../competitorPriceSnapshotContract";
import {
    createBrowserNextReadTransport,
    buildNextReadUrl,
    type NextReadRequest,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    buildNextCompetitorHistorySnapshotKey,
    createBrowserCompetitorHistorySnapshotStore,
    type CompetitorHistorySnapshotStore
} from "./competitorHistorySnapshotStore";

const DEFAULT_MIN_NUM_GUESTS = 1;
const DEFAULT_MAX_NUM_GUESTS = 6;
const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;

export interface CompetitorHistoryCaptureOptions {
    existingRecords: readonly unknown[];
    facilityId: string;
    stayDate: string;
}

export type CompetitorHistoryCaptureResult =
    | { status: "stored"; record: CompetitorPriceSnapshotRecord; deletedCount: number }
    | {
        status: "skipped";
        reason: "already-stored" | "no-competitors";
        record: CompetitorPriceSnapshotRecord | null;
    }
    | { status: "unavailable"; reason: "indexeddb-unavailable" }
    | {
        status: "error";
        reason:
            | "aborted"
            | "competitors-response-invalid"
            | "competitor-prices-response-invalid"
            | "invalid-context"
            | "request-failed"
            | "storage-failed";
    };

export interface CompetitorHistoryWriter {
    cancel(): void;
    capture(options: CompetitorHistoryCaptureOptions): Promise<CompetitorHistoryCaptureResult>;
    stop(): void;
}

export type CompetitorHistoryCaptureLockRunner = <T>(
    lockName: string,
    signal: AbortSignal,
    run: () => Promise<T>
) => Promise<T>;

export interface CreateCompetitorHistoryWriterOptions {
    lockRunner?: CompetitorHistoryCaptureLockRunner;
    now?: () => Date;
    store?: CompetitorHistorySnapshotStore;
    transport?: NextReadTransport;
    windowHost?: Window;
}

export function createCompetitorHistoryWriter(
    options: CreateCompetitorHistoryWriterOptions = {}
): CompetitorHistoryWriter {
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const store = options.store ?? createBrowserCompetitorHistorySnapshotStore(windowHost);
    const now = options.now ?? (() => new Date());
    const lockRunner = options.lockRunner ?? createBrowserCaptureLockRunner(windowHost);
    const completedRecords = new Map<string, CompetitorPriceSnapshotRecord>();
    let activeController: AbortController | null = null;
    let activeKey: string | null = null;
    let activeCapture: Promise<CompetitorHistoryCaptureResult> | null = null;
    let stopped = false;

    const cancel = (): void => {
        activeController?.abort();
        activeController = null;
        activeKey = null;
        activeCapture = null;
    };

    return {
        cancel,
        capture(captureOptions) {
            const facilityId = captureOptions.facilityId.trim();
            const stayDate = normalizeStayDate(captureOptions.stayDate);
            if (stopped || facilityId === "" || stayDate === null) {
                return Promise.resolve({ status: "error", reason: stopped ? "aborted" : "invalid-context" });
            }

            const captureStartedAt = now();
            const observationDate = formatJstDate(captureStartedAt);
            const snapshotKey = buildNextCompetitorHistorySnapshotKey(
                facilityId,
                stayDate,
                observationDate
            );
            const existingRecord = selectSameDayUnspecifiedRecord(
                captureOptions.existingRecords,
                facilityId,
                stayDate,
                observationDate
            ) ?? completedRecords.get(snapshotKey) ?? null;
            if (existingRecord !== null) {
                return Promise.resolve({
                    status: "skipped",
                    reason: "already-stored",
                    record: existingRecord
                });
            }
            if (!("indexedDB" in windowHost)) {
                return Promise.resolve({ status: "unavailable", reason: "indexeddb-unavailable" });
            }
            if (activeKey === snapshotKey && activeCapture !== null) {
                return activeCapture;
            }

            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            activeKey = snapshotKey;
            const capture = lockRunner(
                `revenue-assistant-next:${snapshotKey}`,
                controller.signal,
                () => captureCompetitorHistorySnapshot({
                    captureStartedAt,
                    facilityId,
                    observationDate,
                    signal: controller.signal,
                    snapshotKey,
                    stayDate,
                    store,
                    transport,
                    windowHost
                })
            )
                .then((result) => {
                    if (result.status === "stored") {
                        completedRecords.set(snapshotKey, result.record);
                    } else if (result.status === "skipped" && result.record !== null) {
                        completedRecords.set(snapshotKey, result.record);
                    }
                    return result;
                })
                .catch((error: unknown): CompetitorHistoryCaptureResult => ({
                    status: "error",
                    reason: controller.signal.aborted || isAbortError(error) ? "aborted" : "request-failed"
                }))
                .finally(() => {
                    if (activeCapture !== capture) {
                        return;
                    }
                    activeController = null;
                    activeKey = null;
                    activeCapture = null;
                });
            activeCapture = capture;
            return capture;
        },
        stop() {
            stopped = true;
            cancel();
            completedRecords.clear();
        }
    };
}

export function selectSameDayUnspecifiedRecord(
    values: readonly unknown[],
    facilityId: string,
    stayDate: string,
    observationDate: string
): CompetitorPriceSnapshotRecord | null {
    let latest: CompetitorPriceSnapshotRecord | null = null;
    for (const value of values) {
        if (!isValidSnapshotRecord(value)) {
            continue;
        }
        const roomTypes = value.searchConditionRaw.jalanRoomTypes;
        if (
            value.facilityId !== facilityId
            || normalizeStayDate(String(value.stayDate ?? "")) !== stayDate
            || normalizeStayDate(String(value.searchConditionRaw.stayDate ?? "")) !== stayDate
            || formatJstDate(new Date(value.fetchedAt)) !== observationDate
            || value.endpoint !== COMPETITOR_PRICE_ENDPOINT
            || value.searchConditionRaw.minNumGuests !== DEFAULT_MIN_NUM_GUESTS
            || value.searchConditionRaw.maxNumGuests !== DEFAULT_MAX_NUM_GUESTS
            || value.searchConditionRaw.mealTypes !== null
            || value.searchConditionRaw.planNameWords !== null
            || value.searchConditionRaw.planNameContains !== null
            || (roomTypes !== null && roomTypes !== undefined && (!Array.isArray(roomTypes) || roomTypes.length > 0))
        ) {
            continue;
        }
        if (latest === null || value.fetchedAt.localeCompare(latest.fetchedAt) > 0) {
            latest = value;
        }
    }
    return latest;
}

async function captureCompetitorHistorySnapshot(options: {
    captureStartedAt: Date;
    facilityId: string;
    observationDate: string;
    signal: AbortSignal;
    snapshotKey: string;
    stayDate: string;
    store: CompetitorHistorySnapshotStore;
    transport: NextReadTransport;
    windowHost: Window;
}): Promise<CompetitorHistoryCaptureResult> {
    let storedRecord: CompetitorPriceSnapshotRecord | null;
    try {
        storedRecord = await options.store.readBySnapshotKey(options.snapshotKey);
    } catch {
        return { status: "error", reason: "storage-failed" };
    }
    if (options.signal.aborted) {
        return { status: "error", reason: "aborted" };
    }
    const matchingStoredRecord = selectSameDayUnspecifiedRecord(
        storedRecord === null ? [] : [storedRecord],
        options.facilityId,
        options.stayDate,
        options.observationDate
    );
    if (matchingStoredRecord !== null) {
        return {
            status: "skipped",
            reason: "already-stored",
            record: matchingStoredRecord
        };
    }
    if (storedRecord !== null) {
        return { status: "error", reason: "storage-failed" };
    }

    let competitorsPayload: unknown;
    try {
        competitorsPayload = await options.transport.read({ kind: "competitors" }, options.signal);
    } catch (error: unknown) {
        return {
            status: "error",
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "request-failed"
        };
    }
    const competitorSet = parseCompetitorSet(competitorsPayload);
    if (competitorSet === null) {
        return { status: "error", reason: "competitors-response-invalid" };
    }
    if (competitorSet.length === 0) {
        return { status: "skipped", reason: "no-competitors", record: null };
    }

    const searchCondition: CompetitorPriceSnapshotSearchCondition = {
        stayDate: options.stayDate,
        minNumGuests: DEFAULT_MIN_NUM_GUESTS,
        maxNumGuests: DEFAULT_MAX_NUM_GUESTS,
        competitorYadNos: competitorSet.map((competitor) => competitor.yadNo),
        jalanRoomTypes: null,
        mealTypes: null,
        planNameWords: null,
        planNameContains: null
    };
    const priceRequest: NextReadRequest = {
        kind: "competitor-prices",
        competitorYadNos: searchCondition.competitorYadNos,
        maxNumGuests: searchCondition.maxNumGuests,
        minNumGuests: searchCondition.minNumGuests,
        stayDate: searchCondition.stayDate
    };
    let pricesPayload: unknown;
    try {
        pricesPayload = await options.transport.read(priceRequest, options.signal);
    } catch (error: unknown) {
        return {
            status: "error",
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "request-failed"
        };
    }
    const payload = compactCompetitorPricePayload(pricesPayload);
    if (payload === null) {
        return { status: "error", reason: "competitor-prices-response-invalid" };
    }

    const requestUrl = buildNextReadUrl(priceRequest, options.windowHost.location.origin);
    const record: CompetitorPriceSnapshotRecord = {
        snapshotKey: options.snapshotKey,
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        conditionSignature: buildCompetitorPriceConditionSignature(searchCondition),
        searchConditionRaw: searchCondition,
        fetchedAt: options.captureStartedAt.toISOString(),
        source: "next-competitor-tab",
        endpoint: COMPETITOR_PRICE_ENDPOINT,
        query: requestUrl.searchParams.toString(),
        schemaVersion: COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
        competitorSet,
        payload
    };

    if (options.signal.aborted) {
        return { status: "error", reason: "aborted" };
    }
    try {
        const result = await options.store.addAndPrune(record);
        if (result.status === "already-stored") {
            const existing = await options.store.readBySnapshotKey(options.snapshotKey);
            const matchingExisting = selectSameDayUnspecifiedRecord(
                existing === null ? [] : [existing],
                options.facilityId,
                options.stayDate,
                options.observationDate
            );
            if (matchingExisting === null) {
                return { status: "error", reason: "storage-failed" };
            }
            return {
                status: "skipped",
                reason: "already-stored",
                record: matchingExisting
            };
        }
        return {
            status: "stored",
            record,
            deletedCount: result.deletedCount
        };
    } catch {
        return { status: "error", reason: "storage-failed" };
    }
}

function createBrowserCaptureLockRunner(windowHost: Window): CompetitorHistoryCaptureLockRunner {
    return async <T>(lockName: string, signal: AbortSignal, run: () => Promise<T>): Promise<T> => {
        const locks = windowHost.navigator.locks;
        if (locks === undefined) {
            return run();
        }
        return locks.request(lockName, { mode: "exclusive", signal }, run);
    };
}

function parseCompetitorSet(payload: unknown): CompetitorPriceSnapshotCompetitor[] | null {
    if (!Array.isArray(payload)) {
        return null;
    }
    return payload
        .map((value): CompetitorPriceSnapshotCompetitor | null => {
            if (!isRecord(value)) {
                return null;
            }
            const yadNo = normalizeString(value.yad_no);
            const name = normalizeString(value.name);
            return yadNo === null || name === null ? null : { yadNo, name };
        })
        .filter((value): value is CompetitorPriceSnapshotCompetitor => value !== null);
}

function compactCompetitorPricePayload(payload: unknown): CompetitorPriceSnapshotPayload | null {
    if (!isRecord(payload)) {
        return null;
    }
    const own = compactHotel(payload.own);
    const competitors = Array.isArray(payload.competitors)
        ? payload.competitors
            .map(compactHotel)
            .filter((hotel): hotel is CompetitorPriceSnapshotHotel => hotel !== null)
        : [];
    return { own, competitors };
}

function compactHotel(value: unknown): CompetitorPriceSnapshotHotel | null {
    if (!isRecord(value)) {
        return null;
    }
    const yadNo = normalizeString(value.yad_no);
    if (yadNo === null) {
        return null;
    }
    const plans = Array.isArray(value.plans)
        ? value.plans
            .map((plan) => compactPlan(yadNo, plan))
            .filter((plan): plan is CompetitorPriceSnapshotPlan => plan !== null)
        : [];
    return { yadNo, plans };
}

function compactPlan(yadNo: string, value: unknown): CompetitorPriceSnapshotPlan | null {
    if (!isRecord(value)) {
        return null;
    }
    return {
        yadNo,
        numGuests: isFiniteNumber(value.num_guests) ? value.num_guests : null,
        mealType: normalizeString(value.meal_type),
        planName: null,
        jalanFacilityRoomType: normalizeString(value.jalan_facility_room_type),
        url: null,
        price: isFiniteNumber(value.price) ? value.price : null,
        priceDiff: null
    };
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

function formatJstDate(value: Date): string {
    if (!Number.isFinite(value.getTime())) {
        return "invalid-date";
    }
    return new Date(value.getTime() + JST_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isValidSnapshotRecord(value: unknown): value is CompetitorPriceSnapshotRecord {
    if (
        !isRecord(value)
        || value.schemaVersion !== COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION
        || !isNonEmptyString(value.snapshotKey)
        || !isNonEmptyString(value.facilityId)
        || !isNonEmptyString(value.stayDate)
        || !isNonEmptyString(value.conditionSignature)
        || !isNonEmptyString(value.fetchedAt)
        || !isSnapshotSource(value.source)
        || !isNonEmptyString(value.endpoint)
        || typeof value.query !== "string"
        || !isRecord(value.searchConditionRaw)
        || !isNonEmptyString(value.searchConditionRaw.stayDate)
        || !isFiniteNumber(value.searchConditionRaw.minNumGuests)
        || !isFiniteNumber(value.searchConditionRaw.maxNumGuests)
        || !Array.isArray(value.searchConditionRaw.competitorYadNos)
        || !value.searchConditionRaw.competitorYadNos.every(isNonEmptyString)
        || !isNullableStringArray(value.searchConditionRaw.jalanRoomTypes, true)
        || !isNullableStringArray(value.searchConditionRaw.mealTypes)
        || !isNullableStringArray(value.searchConditionRaw.planNameWords)
        || (value.searchConditionRaw.planNameContains !== null
            && typeof value.searchConditionRaw.planNameContains !== "boolean")
        || !Array.isArray(value.competitorSet)
        || !value.competitorSet.every(isValidSnapshotCompetitor)
        || !isRecord(value.payload)
        || (value.payload.own !== null && !isValidSnapshotHotel(value.payload.own))
        || !Array.isArray(value.payload.competitors)
        || !value.payload.competitors.every(isValidSnapshotHotel)
    ) {
        return false;
    }
    return true;
}

function isValidSnapshotCompetitor(value: unknown): boolean {
    return isRecord(value) && isNonEmptyString(value.yadNo) && isNonEmptyString(value.name);
}

function isValidSnapshotHotel(value: unknown): boolean {
    return isRecord(value)
        && isNonEmptyString(value.yadNo)
        && Array.isArray(value.plans)
        && value.plans.every(isValidSnapshotPlan);
}

function isValidSnapshotPlan(value: unknown): boolean {
    return isRecord(value)
        && isNonEmptyString(value.yadNo)
        && (value.numGuests === null || isFiniteNumber(value.numGuests))
        && isNullableString(value.mealType)
        && isNullableString(value.planName)
        && isNullableString(value.jalanFacilityRoomType)
        && isNullableString(value.url)
        && (value.price === null || isFiniteNumber(value.price))
        && (value.priceDiff === null || isFiniteNumber(value.priceDiff));
}

function isSnapshotSource(value: unknown): boolean {
    return value === "analyze-open" || value === "competitor-tab" || value === "next-competitor-tab";
}

function isNullableString(value: unknown): boolean {
    return value === null || typeof value === "string";
}

function isNullableStringArray(value: unknown, allowUndefined = false): boolean {
    return (allowUndefined && value === undefined)
        || value === null
        || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}
