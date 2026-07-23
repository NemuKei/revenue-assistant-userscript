import {
    createBrowserNextReadTransport,
    type NextReadRequest,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    NEXT_PRICE_TREND_CAPTURE_SCOPE_COUNT,
    buildNextPriceTrendRecordKey,
    createBrowserPriceTrendCaptureStore,
    type NextPriceTrendFacility,
    type NextPriceTrendPoint,
    type NextPriceTrendRecord,
    type NextPriceTrendYadSeries,
    type PriceTrendCaptureStore
} from "./priceTrendCaptureStore";

const PRICE_TRENDS_ENDPOINT = "/api/v1/price_trends";
const PRICE_TREND_SCHEMA_VERSION = "price_trend:v1";
const PRICE_TREND_CAPTURE_CONCURRENCY = 2;
const PRICE_TREND_MAX_LEAD_TIME_DAYS = 90;
const PRICE_TREND_MAX_STAY_DATE_OFFSET_DAYS = 89;
const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export const PRICE_TREND_CAPTURE_GUEST_COUNTS = [1, 2, 3, 4] as const;
export const PRICE_TREND_CAPTURE_MEAL_TYPES = [
    "NONE",
    "BREAKFAST",
    "DINNER",
    "BREAKFAST_DINNER"
] as const;

export type PriceTrendCaptureGuestCount = typeof PRICE_TREND_CAPTURE_GUEST_COUNTS[number];
export type PriceTrendCaptureMealType = typeof PRICE_TREND_CAPTURE_MEAL_TYPES[number];

interface PriceTrendCaptureScope {
    mealType: PriceTrendCaptureMealType;
    numGuests: PriceTrendCaptureGuestCount;
}

export interface PriceTrendCaptureOptions {
    existingRecords: readonly unknown[];
    facilityId: string;
    facilityLabel: string;
    stayDate: string;
}

export type PriceTrendCaptureResult =
    | {
        status: "stored";
        addedCount: number;
        deletedCount: number;
        hasPriceData: boolean;
        records: unknown[];
        requestedCount: number;
    }
    | {
        status: "skipped";
        reason: "already-stored" | "out-of-range";
        hasPriceData: boolean;
        records: unknown[];
        requestedCount: number;
    }
    | { status: "unavailable"; reason: "indexeddb-unavailable" }
    | {
        status: "error";
        reason:
            | "aborted"
            | "competitors-response-invalid"
            | "invalid-context"
            | "price-trends-response-invalid"
            | "request-failed"
            | "storage-failed";
    };

export interface PriceTrendCaptureWriter {
    cancel(): void;
    capture(options: PriceTrendCaptureOptions): Promise<PriceTrendCaptureResult>;
    stop(): void;
}

export type PriceTrendCaptureLockRunner = <T>(
    lockName: string,
    signal: AbortSignal,
    run: () => Promise<T>
) => Promise<T>;

export interface CreatePriceTrendCaptureWriterOptions {
    lockRunner?: PriceTrendCaptureLockRunner;
    now?: () => Date;
    store?: PriceTrendCaptureStore;
    transport?: NextReadTransport;
    windowHost?: Window;
}

export function createPriceTrendCaptureWriter(
    options: CreatePriceTrendCaptureWriterOptions = {}
): PriceTrendCaptureWriter {
    const windowHost = options.windowHost ?? window;
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const store = options.store ?? createBrowserPriceTrendCaptureStore(windowHost);
    const now = options.now ?? (() => new Date());
    const lockRunner = options.lockRunner ?? createBrowserCaptureLockRunner(windowHost);
    const completedRecords = new Map<string, unknown[]>();
    let activeController: AbortController | null = null;
    let activeKey: string | null = null;
    let activeCapture: Promise<PriceTrendCaptureResult> | null = null;
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
            const facilityLabel = captureOptions.facilityLabel.trim();
            const ownYadNo = parseFacilityYadNo(facilityId);
            const stayDate = normalizeCompactDate(captureOptions.stayDate);
            const captureStartedAt = now();
            const observationDate = formatJstDate(captureStartedAt);
            if (
                stopped
                || ownYadNo === null
                || facilityLabel === ""
                || stayDate === null
                || observationDate === null
            ) {
                return Promise.resolve({
                    status: "error",
                    reason: stopped ? "aborted" : "invalid-context"
                });
            }
            const retentionWindow = buildRetentionWindow(captureStartedAt);
            if (
                retentionWindow === null
                || stayDate < retentionWindow.minStayDate
                || stayDate > retentionWindow.maxStayDate
            ) {
                return Promise.resolve({
                    status: "skipped",
                    reason: "out-of-range",
                    hasPriceData: false,
                    records: [],
                    requestedCount: 0
                });
            }

            const captureKey = buildCaptureKey(facilityId, stayDate, observationDate);
            const knownRecords = [
                ...captureOptions.existingRecords,
                ...(completedRecords.get(captureKey) ?? [])
            ];
            const sameDayRecords = selectSameDayRecords(
                knownRecords,
                facilityId,
                stayDate,
                observationDate
            );
            if (selectMissingScopes(knownRecords, facilityId, stayDate, observationDate).length === 0) {
                return Promise.resolve({
                    status: "skipped",
                    reason: "already-stored",
                    hasPriceData: sameDayRecords.some(hasComparablePriceData),
                    records: sameDayRecords,
                    requestedCount: 0
                });
            }
            if (!("indexedDB" in windowHost)) {
                return Promise.resolve({
                    status: "unavailable",
                    reason: "indexeddb-unavailable"
                });
            }
            if (activeKey === captureKey && activeCapture !== null) {
                return activeCapture;
            }

            activeController?.abort();
            const controller = new AbortController();
            activeController = controller;
            activeKey = captureKey;
            const capture = lockRunner(
                `revenue-assistant-next:${captureKey}`,
                controller.signal,
                () => capturePriceTrendBatch({
                    captureStartedAt,
                    existingRecords: captureOptions.existingRecords,
                    facilityId,
                    facilityLabel,
                    observationDate,
                    ownYadNo,
                    retentionWindow,
                    signal: controller.signal,
                    stayDate,
                    store,
                    transport
                })
            )
                .then((result) => {
                    if (result.status === "stored" || result.reason === "already-stored") {
                        completedRecords.set(captureKey, result.records.slice());
                    }
                    return result;
                })
                .catch((error: unknown): PriceTrendCaptureResult => ({
                    status: "error",
                    reason: controller.signal.aborted || isAbortError(error)
                        ? "aborted"
                        : "request-failed"
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

async function capturePriceTrendBatch(options: {
    captureStartedAt: Date;
    existingRecords: readonly unknown[];
    facilityId: string;
    facilityLabel: string;
    observationDate: string;
    ownYadNo: string;
    retentionWindow: { maxStayDate: string; minStayDate: string };
    signal: AbortSignal;
    stayDate: string;
    store: PriceTrendCaptureStore;
    transport: NextReadTransport;
}): Promise<PriceTrendCaptureResult> {
    let storedRecords: NextPriceTrendRecord[];
    try {
        storedRecords = await options.store.readByFacilityStayDate(
            options.facilityId,
            options.stayDate
        );
    } catch {
        return { status: "error", reason: "storage-failed" };
    }
    if (options.signal.aborted) {
        return { status: "error", reason: "aborted" };
    }

    const knownRecords = [...options.existingRecords, ...storedRecords];
    const missingScopes = selectMissingScopes(
        knownRecords,
        options.facilityId,
        options.stayDate,
        options.observationDate
    );
    if (missingScopes.length === 0) {
        return {
            status: "skipped",
            reason: "already-stored",
            hasPriceData: selectSameDayRecords(
                knownRecords,
                options.facilityId,
                options.stayDate,
                options.observationDate
            ).some(hasComparablePriceData),
            records: selectSameDayRecords(
                knownRecords,
                options.facilityId,
                options.stayDate,
                options.observationDate
            ),
            requestedCount: 0
        };
    }

    let competitorsPayload: unknown;
    try {
        competitorsPayload = await options.transport.read(
            { kind: "competitors" },
            options.signal
        );
    } catch (error: unknown) {
        return {
            status: "error",
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "request-failed"
        };
    }
    const competitors = parseCompetitors(competitorsPayload, options.ownYadNo);
    if (competitors === null) {
        return { status: "error", reason: "competitors-response-invalid" };
    }
    const facilities: NextPriceTrendFacility[] = [
        {
            name: options.facilityLabel,
            role: "own",
            yadNo: options.ownYadNo
        },
        ...competitors
    ];
    const yadNos = facilities.map((facility) => facility.yadNo);
    const fetched = await fetchMissingScopeRecords({
        captureStartedAt: options.captureStartedAt,
        facilityId: options.facilityId,
        facilities,
        missingScopes,
        observationDate: options.observationDate,
        signal: options.signal,
        stayDate: options.stayDate,
        transport: options.transport,
        yadNos
    });
    if (fetched.status === "error") {
        return fetched;
    }
    if (options.signal.aborted) {
        return { status: "error", reason: "aborted" };
    }

    let stored;
    try {
        stored = await options.store.addAndPrune(fetched.records, options.retentionWindow);
    } catch {
        return { status: "error", reason: "storage-failed" };
    }
    if (stored.addedCount === 0) {
        return {
            status: "skipped",
            reason: "already-stored",
            hasPriceData: stored.records.some(hasPriceData),
            records: stored.records,
            requestedCount: missingScopes.length
        };
    }
    return {
        status: "stored",
        addedCount: stored.addedCount,
        deletedCount: stored.deletedCount,
        hasPriceData: fetched.records.some(hasPriceData),
        records: stored.records,
        requestedCount: missingScopes.length
    };
}

async function fetchMissingScopeRecords(options: {
    captureStartedAt: Date;
    facilityId: string;
    facilities: readonly NextPriceTrendFacility[];
    missingScopes: readonly PriceTrendCaptureScope[];
    observationDate: string;
    signal: AbortSignal;
    stayDate: string;
    transport: NextReadTransport;
    yadNos: readonly string[];
}): Promise<
    | { status: "ready"; records: NextPriceTrendRecord[] }
    | Extract<PriceTrendCaptureResult, { status: "error" }>
> {
    const records: NextPriceTrendRecord[] = [];
    let nextScopeIndex = 0;
    let failure: Extract<PriceTrendCaptureResult, { status: "error" }> | null = null;

    const runWorker = async (): Promise<void> => {
        while (failure === null && nextScopeIndex < options.missingScopes.length) {
            const scopeIndex = nextScopeIndex;
            nextScopeIndex += 1;
            const scope = options.missingScopes[scopeIndex];
            if (scope === undefined) {
                failure = { status: "error", reason: "invalid-context" };
                return;
            }
            const request: NextReadRequest = {
                kind: "price-trends",
                mealType: scope.mealType,
                numGuests: scope.numGuests,
                stayDate: options.stayDate,
                yadNos: options.yadNos
            };
            let payload: unknown;
            try {
                payload = await options.transport.read(request, options.signal);
            } catch (error: unknown) {
                failure = {
                    status: "error",
                    reason: options.signal.aborted || isAbortError(error)
                        ? "aborted"
                        : "request-failed"
                };
                return;
            }
            const record = buildCaptureRecord({
                captureStartedAt: options.captureStartedAt,
                facilityId: options.facilityId,
                facilities: options.facilities,
                observationDate: options.observationDate,
                payload,
                scope,
                stayDate: options.stayDate,
                yadNos: options.yadNos
            });
            if (record === null) {
                failure = { status: "error", reason: "price-trends-response-invalid" };
                return;
            }
            records[scopeIndex] = record;
        }
    };

    await Promise.all(Array.from(
        { length: Math.min(PRICE_TREND_CAPTURE_CONCURRENCY, options.missingScopes.length) },
        () => runWorker()
    ));
    if (failure !== null) {
        return failure;
    }
    const completeRecords = records.filter(
        (record): record is NextPriceTrendRecord => record !== undefined
    );
    return completeRecords.length === options.missingScopes.length
        ? { status: "ready", records: completeRecords }
        : { status: "error", reason: "price-trends-response-invalid" };
}

function buildCaptureRecord(options: {
    captureStartedAt: Date;
    facilityId: string;
    facilities: readonly NextPriceTrendFacility[];
    observationDate: string;
    payload: unknown;
    scope: PriceTrendCaptureScope;
    stayDate: string;
    yadNos: readonly string[];
}): NextPriceTrendRecord | null {
    if (!isRecord(options.payload)) {
        return null;
    }
    const responseStayDate = normalizeCompactDate(options.payload.stay_date);
    if (responseStayDate !== options.stayDate) {
        return null;
    }
    const latestSourceUpdatedAt = normalizeNullableString(
        options.payload.latest_source_updated_at
    );
    if (
        options.payload.latest_source_updated_at !== null
        && options.payload.latest_source_updated_at !== undefined
        && latestSourceUpdatedAt === null
    ) {
        return null;
    }
    const yads = normalizeResponseYads(options.payload.yads, options.yadNos);
    if (yads === null) {
        return null;
    }

    return {
        endpoint: PRICE_TRENDS_ENDPOINT,
        facilities: options.facilities.map((facility) => ({ ...facility })),
        facilityId: options.facilityId,
        fetchedAt: options.captureStartedAt.toISOString(),
        mealType: options.scope.mealType,
        numGuests: options.scope.numGuests,
        payload: {
            latestSourceUpdatedAt,
            stayDate: options.stayDate,
            yads
        },
        query: null,
        recordKey: buildNextPriceTrendRecordKey({
            facilityId: options.facilityId,
            mealType: options.scope.mealType,
            numGuests: options.scope.numGuests,
            observationDate: options.observationDate,
            stayDate: options.stayDate
        }),
        roomType: null,
        roomTypeLabel: null,
        schemaVersion: PRICE_TREND_SCHEMA_VERSION,
        scope: {
            mealType: options.scope.mealType,
            numGuests: options.scope.numGuests,
            roomType: null,
            roomTypeLabel: null,
            source: "next-price-trends-tab",
            stayDate: options.stayDate,
            yadNos: options.yadNos.slice()
        },
        stayDate: options.stayDate
    };
}

function normalizeResponseYads(
    value: unknown,
    requestedYadNos: readonly string[]
): NextPriceTrendYadSeries[] | null {
    if (value === null || value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        return null;
    }
    const requested = new Set(requestedYadNos);
    const seen = new Set<string>();
    const yads: NextPriceTrendYadSeries[] = [];
    for (const item of value) {
        if (!isRecord(item)) {
            return null;
        }
        const yadNo = normalizeYadNo(item.yad_no);
        if (yadNo === null || !requested.has(yadNo) || seen.has(yadNo)) {
            return null;
        }
        const pointsValue = item.price_trends;
        if (pointsValue !== null && pointsValue !== undefined && !Array.isArray(pointsValue)) {
            return null;
        }
        const points: NextPriceTrendPoint[] = [];
        for (const pointValue of pointsValue ?? []) {
            const point = normalizeResponsePoint(pointValue);
            if (point === null) {
                return null;
            }
            points.push(point);
        }
        seen.add(yadNo);
        yads.push({ yadNo, points });
    }
    return yads;
}

function normalizeResponsePoint(value: unknown): NextPriceTrendPoint | null {
    if (!isRecord(value)) {
        return null;
    }
    const leadTimeDays = value.lead_time_days;
    const price = value.jalan_min_price;
    if (
        typeof leadTimeDays !== "number"
        || !Number.isInteger(leadTimeDays)
        || leadTimeDays < 0
        || leadTimeDays > PRICE_TREND_MAX_LEAD_TIME_DAYS
        || (
            price !== null
            && (
                typeof price !== "number"
                || !Number.isFinite(price)
                || price < 0
            )
        )
        || !isNullableString(value.date)
        || !isNullableString(value.jalan_min_price_status)
    ) {
        return null;
    }
    return {
        date: normalizeNullableString(value.date),
        leadTimeDays,
        priceIncludingTax: price,
        status: normalizeNullableString(value.jalan_min_price_status)
    };
}

function parseCompetitors(
    value: unknown,
    ownYadNo: string
): NextPriceTrendFacility[] | null {
    if (!Array.isArray(value)) {
        return null;
    }
    const competitors = new Map<string, NextPriceTrendFacility>();
    for (const item of value) {
        if (!isRecord(item)) {
            return null;
        }
        const yadNo = normalizeYadNo(item.yad_no);
        if (yadNo === null) {
            return null;
        }
        if (yadNo === ownYadNo) {
            continue;
        }
        const name = normalizeNullableString(item.name) ?? yadNo;
        competitors.set(yadNo, { name, role: "competitor", yadNo });
    }
    return Array.from(competitors.values());
}

function selectMissingScopes(
    values: readonly unknown[],
    facilityId: string,
    stayDate: string,
    observationDate: string
): PriceTrendCaptureScope[] {
    const presentScopeKeys = new Set(
        selectSameDayRecords(values, facilityId, stayDate, observationDate)
            .map(buildScopeKey)
    );
    return buildDefaultScopes().filter((scope) => !presentScopeKeys.has(buildScopeKey(scope)));
}

function selectSameDayRecords(
    values: readonly unknown[],
    facilityId: string,
    stayDate: string,
    observationDate: string
): NextPriceTrendRecord[] {
    const latestByScope = new Map<string, NextPriceTrendRecord>();
    for (const value of values) {
        if (!isComparableCaptureRecord(value)) {
            continue;
        }
        if (
            value.facilityId !== facilityId
            || normalizeCompactDate(value.stayDate) !== stayDate
            || formatJstDate(new Date(value.fetchedAt)) !== observationDate
        ) {
            continue;
        }
        const key = buildScopeKey(value);
        const current = latestByScope.get(key);
        if (current === undefined || current.fetchedAt < value.fetchedAt) {
            latestByScope.set(key, value);
        }
    }
    return Array.from(latestByScope.values());
}

function isComparableCaptureRecord(value: unknown): value is NextPriceTrendRecord {
    if (!isRecord(value) || !isRecord(value.payload)) {
        return false;
    }
    const stayDate = normalizeCompactDate(value.stayDate);
    return value.schemaVersion === PRICE_TREND_SCHEMA_VERSION
        && value.endpoint === PRICE_TRENDS_ENDPOINT
        && isNonEmptyString(value.recordKey)
        && isNonEmptyString(value.facilityId)
        && stayDate !== null
        && normalizeCompactDate(value.payload.stayDate) === stayDate
        && isGuestCount(value.numGuests)
        && isMealType(value.mealType)
        && value.roomType === null
        && value.roomTypeLabel === null
        && isValidDateTime(value.fetchedAt)
        && Array.isArray(value.facilities)
        && value.facilities.length > 0
        && value.facilities.every(isStoredFacility)
        && isNullableString(value.payload.latestSourceUpdatedAt)
        && Array.isArray(value.payload.yads)
        && value.payload.yads.every(isStoredYadSeries);
}

function isStoredFacility(value: unknown): boolean {
    return isRecord(value)
        && isNonEmptyString(value.yadNo)
        && isNonEmptyString(value.name)
        && (value.role === "own" || value.role === "competitor");
}

function isStoredYadSeries(value: unknown): boolean {
    return isRecord(value)
        && isNonEmptyString(value.yadNo)
        && Array.isArray(value.points)
        && value.points.every(isStoredPoint);
}

function isStoredPoint(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }
    const price = value.priceIncludingTax;
    return Number.isInteger(value.leadTimeDays)
        && typeof value.leadTimeDays === "number"
        && value.leadTimeDays >= 0
        && value.leadTimeDays <= PRICE_TREND_MAX_LEAD_TIME_DAYS
        && (
            price === null
            || (
                typeof price === "number"
                && Number.isFinite(price)
                && price >= 0
            )
        )
        && isNullableString(value.date)
        && isNullableString(value.status);
}

function buildDefaultScopes(): PriceTrendCaptureScope[] {
    const scopes: PriceTrendCaptureScope[] = [];
    for (const mealType of PRICE_TREND_CAPTURE_MEAL_TYPES) {
        for (const numGuests of PRICE_TREND_CAPTURE_GUEST_COUNTS) {
            scopes.push({ mealType, numGuests });
        }
    }
    return scopes;
}

function buildScopeKey(scope: { mealType: string; numGuests: number }): string {
    return `${scope.numGuests}\u001f${scope.mealType}\u001funspecified`;
}

function buildCaptureKey(
    facilityId: string,
    stayDate: string,
    observationDate: string
): string {
    return [
        "price-trend-capture",
        `facility:${facilityId}`,
        `stayDate:${stayDate}`,
        `observedOn:${observationDate}`,
        "room:unspecified"
    ].join("|");
}

function buildRetentionWindow(
    value: Date
): { maxStayDate: string; minStayDate: string } | null {
    const observationDate = formatJstDate(value);
    if (observationDate === null) {
        return null;
    }
    const minStayDate = normalizeCompactDate(observationDate);
    if (minStayDate === null) {
        return null;
    }
    const start = Date.UTC(
        Number(minStayDate.slice(0, 4)),
        Number(minStayDate.slice(4, 6)) - 1,
        Number(minStayDate.slice(6, 8))
    );
    const maxDate = new Date(start + PRICE_TREND_MAX_STAY_DATE_OFFSET_DAYS * DAY_MILLISECONDS);
    return {
        minStayDate,
        maxStayDate: [
            maxDate.getUTCFullYear(),
            String(maxDate.getUTCMonth() + 1).padStart(2, "0"),
            String(maxDate.getUTCDate()).padStart(2, "0")
        ].join("")
    };
}

function createBrowserCaptureLockRunner(windowHost: Window): PriceTrendCaptureLockRunner {
    return async <T>(lockName: string, signal: AbortSignal, run: () => Promise<T>): Promise<T> => {
        const locks = windowHost.navigator.locks;
        if (locks === undefined) {
            return run();
        }
        return locks.request(lockName, { mode: "exclusive", signal }, run);
    };
}

function parseFacilityYadNo(facilityId: string): string | null {
    if (!facilityId.startsWith("yad:")) {
        return null;
    }
    const yadNo = facilityId.slice("yad:".length).trim();
    return yadNo === "" ? null : yadNo;
}

function normalizeCompactDate(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
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

function formatJstDate(value: Date): string | null {
    if (!Number.isFinite(value.getTime())) {
        return null;
    }
    return new Date(value.getTime() + JST_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

function normalizeYadNo(value: unknown): string | null {
    if (typeof value !== "string" && typeof value !== "number") {
        return null;
    }
    const normalized = String(value).trim();
    return normalized === "" ? null : normalized;
}

function normalizeNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
}

function isNullableString(value: unknown): boolean {
    return value === null || value === undefined || typeof value === "string";
}

function isGuestCount(value: unknown): value is PriceTrendCaptureGuestCount {
    return value === 1 || value === 2 || value === 3 || value === 4;
}

function isMealType(value: unknown): value is PriceTrendCaptureMealType {
    return typeof value === "string"
        && PRICE_TREND_CAPTURE_MEAL_TYPES.some((mealType) => mealType === value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isValidDateTime(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function hasPriceData(record: NextPriceTrendRecord): boolean {
    return record.payload.yads.some((yad) => (
        yad.points.some((point) => point.priceIncludingTax !== null)
    ));
}

function hasComparablePriceData(record: NextPriceTrendRecord): boolean {
    return hasPriceData(record);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

if (buildDefaultScopes().length !== NEXT_PRICE_TREND_CAPTURE_SCOPE_COUNT) {
    throw new Error("Next price trend capture scope count mismatch");
}
