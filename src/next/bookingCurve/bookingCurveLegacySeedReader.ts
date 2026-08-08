import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_DB_NAME,
    BOOKING_CURVE_RAW_SOURCE_DB_VERSION,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    BOOKING_CURVE_RAW_SOURCE_STORE_NAME,
    buildBookingCurveRawSourceCacheKey
} from "../../bookingCurveRawSourceContract";
import { toCompactDateKey } from "../../curveCore";
import {
    readExistingIndexedDbLatestRecordsByIndexRange,
    type ExistingIndexedDbReadResult
} from "../../indexedDbReadOnly";
import {
    compactNextBookingCurveResponse,
    createNextBookingCurveSourceRecord,
    type NextBookingCurveAcquisitionTask
} from "./bookingCurveAcquisitionModel";
import {
    buildNextBookingCurveSourceKey,
    type NextBookingCurveSourceRecord
} from "./bookingCurveSourceStore";

const CLASSIC_BOOKING_CURVE_FACILITY_AS_OF_INDEX = "facility-asof";

export interface NextBookingCurveLegacySeedReadOptions {
    asOfDate: string;
    facilityId: string;
    tasks: readonly NextBookingCurveAcquisitionTask[];
}

export interface NextBookingCurveLegacySeedReader {
    readLatest(
        options: NextBookingCurveLegacySeedReadOptions
    ): Promise<NextBookingCurveSourceRecord[]>;
}

export type ExistingIndexedDbLatestRangeReader = <T>(options: {
    databaseName: string;
    databaseVersion: number;
    storeName: string;
    indexName: string;
    lowerBound: IDBValidKey;
    upperBound: IDBValidKey;
}) => Promise<ExistingIndexedDbReadResult<T>>;

export interface CreateNextBookingCurveLegacySeedReaderOptions {
    rangeReader?: ExistingIndexedDbLatestRangeReader;
}

export function createNextBookingCurveLegacySeedReader(
    options: CreateNextBookingCurveLegacySeedReaderOptions = {}
): NextBookingCurveLegacySeedReader {
    const rangeReader = options.rangeReader
        ?? readExistingIndexedDbLatestRecordsByIndexRange;
    let cachedFacilityId: string | null = null;
    let cachedRead: Promise<ExistingIndexedDbReadResult<unknown>> | null = null;

    return {
        async readLatest(readOptions) {
            if (readOptions.tasks.length === 0) {
                return [];
            }
            if (cachedFacilityId !== readOptions.facilityId || cachedRead === null) {
                cachedFacilityId = readOptions.facilityId;
                cachedRead = rangeReader<unknown>({
                    databaseName: BOOKING_CURVE_RAW_SOURCE_DB_NAME,
                    databaseVersion: BOOKING_CURVE_RAW_SOURCE_DB_VERSION,
                    storeName: BOOKING_CURVE_RAW_SOURCE_STORE_NAME,
                    indexName: CLASSIC_BOOKING_CURVE_FACILITY_AS_OF_INDEX,
                    lowerBound: [readOptions.facilityId, ""],
                    upperBound: [readOptions.facilityId, "\uffff"]
                });
            }
            const result = await cachedRead;
            if (result.status !== "ready") {
                return [];
            }
            return buildNextBookingCurveLegacySeedRecords({
                ...readOptions,
                records: result.records
            });
        }
    };
}

export function buildNextBookingCurveLegacySeedRecords(options: {
    asOfDate: string;
    facilityId: string;
    records: readonly unknown[];
    tasks: readonly NextBookingCurveAcquisitionTask[];
}): NextBookingCurveSourceRecord[] {
    const requestedAsOfDate = toCompactDateKey(options.asOfDate);
    if (requestedAsOfDate === null) {
        return [];
    }
    const taskBySourceKey = new Map(options.tasks.map((task) => [task.sourceKey, task]));
    const latestBySourceKey = new Map<string, CompatibleClassicBookingCurveSource>();
    for (const value of options.records) {
        const compatible = toCompatibleClassicBookingCurveSource({
            facilityId: options.facilityId,
            requestedAsOfDate,
            taskBySourceKey,
            value
        });
        if (compatible === null) {
            continue;
        }
        const previous = latestBySourceKey.get(compatible.task.sourceKey);
        if (
            previous === undefined
            || compatible.asOfDate > previous.asOfDate
            || (
                compatible.asOfDate === previous.asOfDate
                && compatible.fetchedAt > previous.fetchedAt
            )
        ) {
            latestBySourceKey.set(compatible.task.sourceKey, compatible);
        }
    }
    return Array.from(latestBySourceKey.values())
        .sort((left, right) => left.task.sourceKey.localeCompare(right.task.sourceKey))
        .flatMap((source) => {
            try {
                return [createNextBookingCurveSourceRecord({
                    asOfDate: source.asOfDate,
                    facilityId: options.facilityId,
                    fetchedAt: source.fetchedAt,
                    response: source.response,
                    task: source.task
                })];
            } catch {
                return [];
            }
        });
}

interface CompatibleClassicBookingCurveSource {
    asOfDate: string;
    fetchedAt: string;
    response: NonNullable<ReturnType<typeof compactNextBookingCurveResponse>>;
    task: NextBookingCurveAcquisitionTask;
}

function toCompatibleClassicBookingCurveSource(options: {
    facilityId: string;
    requestedAsOfDate: string;
    taskBySourceKey: ReadonlyMap<string, NextBookingCurveAcquisitionTask>;
    value: unknown;
}): CompatibleClassicBookingCurveSource | null {
    if (!isRecord(options.value)) {
        return null;
    }
    const facilityId = typeof options.value.facilityId === "string"
        ? options.value.facilityId
        : "";
    const stayDate = toCompactDateKey(
        typeof options.value.stayDate === "string" ? options.value.stayDate : ""
    );
    const asOfDate = toCompactDateKey(
        typeof options.value.asOfDate === "string" ? options.value.asOfDate : ""
    );
    const scope = options.value.scope;
    const roomGroupId = options.value.roomGroupId === null
        ? null
        : typeof options.value.roomGroupId === "string"
            ? options.value.roomGroupId.trim()
            : "";
    if (
        facilityId !== options.facilityId
        || stayDate === null
        || asOfDate === null
        || asOfDate > options.requestedAsOfDate
        || (scope !== "hotel" && scope !== "roomGroup")
        || (scope === "hotel" ? roomGroupId !== null : roomGroupId === "")
        || options.value.endpoint !== BOOKING_CURVE_ENDPOINT
        || options.value.schemaVersion !== BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION
    ) {
        return null;
    }
    const sourceKey = buildNextBookingCurveSourceKey({
        facilityId,
        roomGroupId,
        scope,
        stayDate
    });
    const task = options.taskBySourceKey.get(sourceKey);
    if (task === undefined) {
        return null;
    }
    const expectedQuery = task.query;
    const expectedCacheKey = buildBookingCurveRawSourceCacheKey({
        facilityId,
        stayDate,
        asOfDate,
        scope,
        ...(roomGroupId === null ? {} : { roomGroupId }),
        endpoint: BOOKING_CURVE_ENDPOINT,
        query: expectedQuery
    });
    const fetchedAt = typeof options.value.fetchedAt === "string"
        && Number.isFinite(Date.parse(options.value.fetchedAt))
        ? options.value.fetchedAt
        : null;
    if (
        options.value.query !== expectedQuery
        || options.value.cacheKey !== expectedCacheKey
        || fetchedAt === null
    ) {
        return null;
    }
    const response = compactNextBookingCurveResponse(options.value.response, stayDate);
    return response === null ? null : { asOfDate, fetchedAt, response, task };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
