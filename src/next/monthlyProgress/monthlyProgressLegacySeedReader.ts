import {
    readExistingIndexedDbRecordsByPrimaryKeys,
    type ExistingIndexedDbPrimaryKeyReadOptions,
    type ExistingIndexedDbReadResult
} from "../../indexedDbReadOnly";
import {
    normalizeNextMonthlyProgressYearMonth,
    type NextMonthlyProgressSnapshotPayload,
    type NextMonthlyProgressSnapshotPoint,
    type NextMonthlyProgressSnapshotRecord
} from "./monthlyProgressModel";
import {
    NEXT_MONTHLY_PROGRESS_ENDPOINT,
    NEXT_MONTHLY_PROGRESS_SCHEMA_VERSION,
    buildNextMonthlyProgressQuery,
    buildNextMonthlyProgressRecordKey
} from "./monthlyProgressStore";

const CLASSIC_MONTHLY_PROGRESS_DB_NAME = "revenue-assistant-monthly-progress-history";
const CLASSIC_MONTHLY_PROGRESS_DB_VERSION = 1;
const CLASSIC_MONTHLY_PROGRESS_STORE_NAME = "monthly-booking-curve-snapshots";

export interface NextMonthlyProgressLegacySeedReadOptions {
    facilityId: string;
    yearMonths: readonly string[];
    batchDateKey: string;
}

export interface NextMonthlyProgressLegacySeedReader {
    readExact(
        options: NextMonthlyProgressLegacySeedReadOptions
    ): Promise<ExistingIndexedDbReadResult<NextMonthlyProgressSnapshotRecord>>;
}

export type ExistingMonthlyProgressPrimaryKeyReader = <T>(
    options: ExistingIndexedDbPrimaryKeyReadOptions
) => Promise<ExistingIndexedDbReadResult<T>>;

export function createNextMonthlyProgressLegacySeedReader(options: {
    reader?: ExistingMonthlyProgressPrimaryKeyReader;
} = {}): NextMonthlyProgressLegacySeedReader {
    const reader = options.reader ?? readExistingIndexedDbRecordsByPrimaryKeys;
    return {
        async readExact(readOptions) {
            const yearMonths = Array.from(new Set(readOptions.yearMonths))
                .map(normalizeNextMonthlyProgressYearMonth)
                .filter((value): value is string => value !== null);
            const result = await reader<unknown>({
                databaseName: CLASSIC_MONTHLY_PROGRESS_DB_NAME,
                databaseVersion: CLASSIC_MONTHLY_PROGRESS_DB_VERSION,
                storeName: CLASSIC_MONTHLY_PROGRESS_STORE_NAME,
                keys: yearMonths.map((yearMonth) => buildClassicRecordKey({
                    facilityId: readOptions.facilityId,
                    yearMonth,
                    batchDateKey: readOptions.batchDateKey
                }))
            });
            if (result.status !== "ready") {
                return result;
            }
            return {
                status: "ready",
                records: result.records.flatMap((record) => {
                    const compatible = toCompatibleClassicRecord({
                        batchDateKey: readOptions.batchDateKey,
                        facilityId: readOptions.facilityId,
                        allowedYearMonths: new Set(yearMonths),
                        value: record
                    });
                    return compatible === null ? [] : [compatible];
                })
            };
        }
    };
}

export function buildClassicRecordKey(options: {
    facilityId: string;
    yearMonth: string;
    batchDateKey: string;
}): string {
    return `${options.facilityId}:${options.yearMonth}:${options.batchDateKey}`;
}

function toCompatibleClassicRecord(options: {
    batchDateKey: string;
    facilityId: string;
    allowedYearMonths: ReadonlySet<string>;
    value: unknown;
}): NextMonthlyProgressSnapshotRecord | null {
    if (!isRecord(options.value) || !isRecord(options.value.payload)) {
        return null;
    }
    const yearMonth = typeof options.value.yearMonth === "string"
        ? normalizeNextMonthlyProgressYearMonth(options.value.yearMonth)
        : null;
    const payloadYearMonth = typeof options.value.payload.yearMonth === "string"
        ? normalizeNextMonthlyProgressYearMonth(options.value.payload.yearMonth)
        : null;
    if (
        yearMonth === null
        || payloadYearMonth !== yearMonth
        || !options.allowedYearMonths.has(yearMonth)
        || options.value.facilityCacheKey !== options.facilityId
        || options.value.batchDateKey !== options.batchDateKey
        || options.value.snapshotKey !== buildClassicRecordKey({
            facilityId: options.facilityId,
            yearMonth,
            batchDateKey: options.batchDateKey
        })
        || typeof options.value.fetchedAt !== "string"
        || !Number.isFinite(Date.parse(options.value.fetchedAt))
    ) {
        return null;
    }
    const payload = toCompatiblePayload(options.value.payload, yearMonth);
    if (payload === null) {
        return null;
    }
    return {
        recordKey: buildNextMonthlyProgressRecordKey({
            facilityId: options.facilityId,
            yearMonth,
            batchDateKey: options.batchDateKey
        }),
        facilityId: options.facilityId,
        yearMonth,
        batchDateKey: options.batchDateKey,
        fetchedAt: options.value.fetchedAt,
        endpoint: NEXT_MONTHLY_PROGRESS_ENDPOINT,
        query: buildNextMonthlyProgressQuery(yearMonth),
        schemaVersion: NEXT_MONTHLY_PROGRESS_SCHEMA_VERSION,
        source: "classic-readonly-seed",
        payload
    };
}

function toCompatiblePayload(
    value: Record<string, unknown>,
    yearMonth: string
): NextMonthlyProgressSnapshotPayload | null {
    if (
        !Array.isArray(value.salesBased)
        || !Array.isArray(value.roomBased)
        || !value.salesBased.every(isClassicSnapshotPoint)
        || !value.roomBased.every(isClassicSnapshotPoint)
        || (value.updatedAt !== null && typeof value.updatedAt !== "string")
    ) {
        return null;
    }
    return {
        yearMonth,
        updatedAt: value.updatedAt,
        salesBased: value.salesBased.map(copySnapshotPoint),
        roomBased: value.roomBased.map(copySnapshotPoint)
    };
}

function isClassicSnapshotPoint(value: unknown): value is NextMonthlyProgressSnapshotPoint {
    return isRecord(value)
        && typeof value.date === "string"
        && /^\d{4}-?\d{2}-?\d{2}$/u.test(value.date)
        && isNullableFiniteNumber(value.thisYearSum)
        && isNullableFiniteNumber(value.lastYearSum);
}

function copySnapshotPoint(point: NextMonthlyProgressSnapshotPoint): NextMonthlyProgressSnapshotPoint {
    return {
        date: point.date.replaceAll("-", ""),
        thisYearSum: point.thisYearSum,
        lastYearSum: point.lastYearSum
    };
}

function isNullableFiniteNumber(value: unknown): value is number | null {
    return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
