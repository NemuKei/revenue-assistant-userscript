import {
    RANK_LEARNING_EVENT_BATCH_LIMIT,
    RANK_LEARNING_SCHEMA_VERSION,
    type RankLearningCaptureContext,
    type RankLearningCaptureParseResult,
    type RankLearningCoverageRecord,
    type RankLearningEventRecord
} from "./rankLearningTypes";

export const RANK_LEARNING_MAX_DAYS_BEFORE_STAY = 360;

const EVENT_RECORD_FIELDS = new Set([
    "afterRankName",
    "beforeRankName",
    "capturedAt",
    "daysBeforeStay",
    "facilityId",
    "recordKey",
    "reflectedAt",
    "reflectedDate",
    "roomGroupId",
    "schemaVersion",
    "sourceRangeFrom",
    "sourceRangeTo",
    "stayDate"
]);

const COVERAGE_RECORD_FIELDS = new Set([
    "asOfDate",
    "capturedAt",
    "facilityId",
    "invalidEventCount",
    "rangeFrom",
    "rangeTo",
    "recordKey",
    "schemaVersion",
    "validEventCount"
]);

interface NormalizedCaptureContext {
    asOfDate: string;
    capturedAt: string;
    facilityId: string;
    sourceRangeFrom: string;
    sourceRangeTo: string;
}

type ParsedEvent =
    | { status: "ready"; record: RankLearningEventRecord }
    | { status: "ignored" }
    | { status: "rejected"; reason: "event-out-of-range" | "invalid-event" };

export function parseRankLearningCapture(
    payload: unknown,
    context: RankLearningCaptureContext
): RankLearningCaptureParseResult {
    const normalizedContext = normalizeCaptureContext(context);
    if (normalizedContext === null) {
        return { status: "rejected", reason: "invalid-context" };
    }
    if (!isRecord(payload) || !Array.isArray(payload.suggest_statuses)) {
        return { status: "rejected", reason: "invalid-root" };
    }
    const events: RankLearningEventRecord[] = [];
    for (const value of payload.suggest_statuses) {
        const parsed = parseEvent(value, normalizedContext);
        if (parsed.status === "rejected") {
            return parsed;
        }
        if (parsed.status === "ignored") {
            continue;
        }
        events.push(parsed.record);
        if (events.length > RANK_LEARNING_EVENT_BATCH_LIMIT) {
            return { status: "rejected", reason: "event-limit-exceeded" };
        }
    }

    const coverageWithoutKey = {
        asOfDate: normalizedContext.asOfDate,
        capturedAt: normalizedContext.capturedAt,
        facilityId: normalizedContext.facilityId,
        invalidEventCount: 0,
        rangeFrom: normalizedContext.sourceRangeFrom,
        rangeTo: normalizedContext.sourceRangeTo,
        schemaVersion: RANK_LEARNING_SCHEMA_VERSION,
        validEventCount: events.length
    };
    const coverage: RankLearningCoverageRecord = {
        ...coverageWithoutKey,
        recordKey: buildRankLearningCoverageRecordKey({
            ...coverageWithoutKey,
            eventRecordKeys: events.map((event) => event.recordKey)
        })
    };
    return { status: "ready", coverage, events };
}

export const parseRankLearningResponse = parseRankLearningCapture;

export function buildRankLearningEventRecordKey(options: {
    afterRankName: string | null;
    beforeRankName: string | null;
    facilityId: string;
    reflectedAt: string;
    roomGroupId: string;
    stayDate: string;
}): string {
    return [
        "rank-event",
        `schema:${encodeKeyPart(RANK_LEARNING_SCHEMA_VERSION)}`,
        `facility:${encodeKeyPart(options.facilityId)}`,
        `stayDate:${options.stayDate}`,
        `roomGroup:${encodeKeyPart(options.roomGroupId)}`,
        `reflectedAt:${encodeKeyPart(options.reflectedAt)}`,
        `before:${encodeNullableKeyPart(options.beforeRankName)}`,
        `after:${encodeNullableKeyPart(options.afterRankName)}`
    ].join("|");
}

export function buildRankLearningCoverageRecordKey(options: {
    asOfDate: string;
    eventRecordKeys: readonly string[];
    facilityId: string;
    rangeFrom: string;
    rangeTo: string;
}): string {
    const eventFingerprint = buildRankLearningEventSetFingerprint(options.eventRecordKeys);
    return [
        buildRankLearningCoverageRecordKeyPrefix(options),
        `events:${eventFingerprint}`
    ].join("|");
}

export function buildRankLearningEventSetFingerprint(
    eventRecordKeys: readonly string[]
): string {
    const serialized = eventRecordKeys.slice().sort().map((key) => (
        `${key.length}:${key}`
    )).join("|");
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    for (const byte of new TextEncoder().encode(serialized)) {
        hash ^= BigInt(byte);
        hash = (hash * prime) & mask;
    }
    return hash.toString(16).padStart(16, "0");
}

export function isRankLearningEventRecord(value: unknown): value is RankLearningEventRecord {
    if (!isRecord(value) || !hasOnlyFields(value, EVENT_RECORD_FIELDS)) {
        return false;
    }
    const stayDate = normalizeDateKey(value.stayDate);
    const sourceRangeFrom = normalizeDateKey(value.sourceRangeFrom);
    const sourceRangeTo = normalizeDateKey(value.sourceRangeTo);
    const reflectedAt = normalizeTimestamp(value.reflectedAt);
    const capturedAt = normalizeTimestamp(value.capturedAt);
    const reflectedDate = normalizeDateKey(value.reflectedDate);
    if (
        !isNonEmptyTrimmedString(value.facilityId)
        || !isNonEmptyTrimmedString(value.roomGroupId)
        || stayDate === null
        || sourceRangeFrom === null
        || sourceRangeTo === null
        || reflectedAt === null
        || capturedAt === null
        || reflectedDate === null
        || stayDate !== value.stayDate
        || sourceRangeFrom !== value.sourceRangeFrom
        || sourceRangeTo !== value.sourceRangeTo
        || reflectedAt !== value.reflectedAt
        || capturedAt !== value.capturedAt
        || reflectedDate !== value.reflectedDate
        || sourceRangeFrom > sourceRangeTo
        || stayDate < sourceRangeFrom
        || stayDate > sourceRangeTo
        || value.schemaVersion !== RANK_LEARNING_SCHEMA_VERSION
        || !isStoredRankName(value.beforeRankName)
        || !isStoredRankName(value.afterRankName)
        || (value.beforeRankName === null && value.afterRankName === null)
        || !Number.isInteger(value.daysBeforeStay)
        || typeof value.daysBeforeStay !== "number"
        || value.daysBeforeStay < 0
        || value.daysBeforeStay > RANK_LEARNING_MAX_DAYS_BEFORE_STAY
    ) {
        return false;
    }
    const expectedReflectedDate = formatJstDate(Date.parse(reflectedAt));
    const expectedDaysBeforeStay = getDaysBetweenDateKeys(stayDate, reflectedDate);
    if (
        expectedReflectedDate !== reflectedDate
        || expectedDaysBeforeStay !== value.daysBeforeStay
    ) {
        return false;
    }
    return value.recordKey === buildRankLearningEventRecordKey({
        afterRankName: value.afterRankName,
        beforeRankName: value.beforeRankName,
        facilityId: value.facilityId,
        reflectedAt,
        roomGroupId: value.roomGroupId,
        stayDate
    });
}

export function isRankLearningCoverageRecord(
    value: unknown
): value is RankLearningCoverageRecord {
    if (!isRecord(value) || !hasOnlyFields(value, COVERAGE_RECORD_FIELDS)) {
        return false;
    }
    const asOfDate = normalizeDateKey(value.asOfDate);
    const rangeFrom = normalizeDateKey(value.rangeFrom);
    const rangeTo = normalizeDateKey(value.rangeTo);
    const capturedAt = normalizeTimestamp(value.capturedAt);
    if (
        !isNonEmptyTrimmedString(value.facilityId)
        || !isNonEmptyTrimmedString(value.recordKey)
        || asOfDate === null
        || rangeFrom === null
        || rangeTo === null
        || capturedAt === null
        || asOfDate !== value.asOfDate
        || rangeFrom !== value.rangeFrom
        || rangeTo !== value.rangeTo
        || capturedAt !== value.capturedAt
        || rangeFrom > rangeTo
        || typeof value.recordKey !== "string"
        || value.schemaVersion !== RANK_LEARNING_SCHEMA_VERSION
        || !Number.isInteger(value.validEventCount)
        || typeof value.validEventCount !== "number"
        || value.validEventCount < 0
        || value.validEventCount > RANK_LEARNING_EVENT_BATCH_LIMIT
        || value.invalidEventCount !== 0
    ) {
        return false;
    }
    const prefix = buildRankLearningCoverageRecordKeyPrefix({
        asOfDate,
        facilityId: value.facilityId,
        rangeFrom,
        rangeTo
    });
    return new RegExp(`^${escapeRegExp(prefix)}\\|events:[0-9a-f]{16}$`, "u")
        .test(value.recordKey);
}

function parseEvent(
    value: unknown,
    context: NormalizedCaptureContext
): ParsedEvent {
    if (!isRecord(value)) {
        return { status: "rejected", reason: "invalid-event" };
    }
    const beforeRankName = readRankName(value.before_price_rank_name);
    const afterRankName = readRankName(value.after_price_rank_name);
    if (beforeRankName === undefined || afterRankName === undefined) {
        return { status: "rejected", reason: "invalid-event" };
    }
    if (beforeRankName === null && afterRankName === null) {
        return { status: "ignored" };
    }
    const stayDate = normalizeDateKey(value.date);
    if (stayDate === null) {
        return { status: "rejected", reason: "invalid-event" };
    }
    if (stayDate < context.sourceRangeFrom || stayDate > context.sourceRangeTo) {
        return { status: "rejected", reason: "event-out-of-range" };
    }
    const roomGroupId = normalizeRequiredString(value.rm_room_group_id);
    const reflectedAt = resolveStatusTimestamp(value);
    if (
        roomGroupId === null
        || reflectedAt === null
    ) {
        return { status: "rejected", reason: "invalid-event" };
    }
    const reflectedDate = formatJstDate(Date.parse(reflectedAt));
    const daysBeforeStay = reflectedDate === null
        ? null
        : getDaysBetweenDateKeys(stayDate, reflectedDate);
    if (
        reflectedDate === null
        || reflectedDate > context.asOfDate
        || daysBeforeStay === null
        || daysBeforeStay < 0
        || daysBeforeStay > RANK_LEARNING_MAX_DAYS_BEFORE_STAY
    ) {
        return { status: "rejected", reason: "invalid-event" };
    }
    const recordWithoutKey = {
        afterRankName,
        beforeRankName,
        capturedAt: context.capturedAt,
        daysBeforeStay,
        facilityId: context.facilityId,
        reflectedAt,
        reflectedDate,
        roomGroupId,
        schemaVersion: RANK_LEARNING_SCHEMA_VERSION,
        sourceRangeFrom: context.sourceRangeFrom,
        sourceRangeTo: context.sourceRangeTo,
        stayDate
    };
    const record: RankLearningEventRecord = {
        ...recordWithoutKey,
        recordKey: buildRankLearningEventRecordKey(recordWithoutKey)
    };
    return { status: "ready", record };
}

function normalizeCaptureContext(
    context: RankLearningCaptureContext
): NormalizedCaptureContext | null {
    const facilityId = normalizeRequiredString(context.facilityId);
    const asOfDate = normalizeDateKey(context.asOfDate);
    const sourceRangeFrom = normalizeDateKey(context.sourceRangeFrom);
    const sourceRangeTo = normalizeDateKey(context.sourceRangeTo);
    const capturedAt = normalizeTimestamp(context.capturedAt);
    if (
        facilityId === null
        || asOfDate === null
        || sourceRangeFrom === null
        || sourceRangeTo === null
        || sourceRangeFrom > sourceRangeTo
        || capturedAt === null
    ) {
        return null;
    }
    return {
        asOfDate,
        capturedAt,
        facilityId,
        sourceRangeFrom,
        sourceRangeTo
    };
}

function resolveStatusTimestamp(value: Record<string, unknown>): string | null {
    for (const key of ["accepted_at", "completed_at", "suggest_calc_datetime"] as const) {
        const candidate = value[key];
        if (candidate === null || candidate === undefined || candidate === "") {
            continue;
        }
        return normalizeTimestamp(candidate);
    }
    return null;
}

function readRankName(value: unknown): string | null | undefined {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
}

function normalizeRequiredString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
}

function normalizeDateKey(value: unknown): string | null {
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

function normalizeTimestamp(value: unknown): string | null {
    if (typeof value !== "string" || value.trim() === "") {
        return null;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function formatJstDate(timestamp: number): string | null {
    if (!Number.isFinite(timestamp)) {
        return null;
    }
    return new Date(timestamp + 9 * 60 * 60 * 1_000)
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "");
}

function getDaysBetweenDateKeys(laterDate: string, earlierDate: string): number | null {
    const laterTimestamp = parseCompactDate(laterDate);
    const earlierTimestamp = parseCompactDate(earlierDate);
    return laterTimestamp === null || earlierTimestamp === null
        ? null
        : Math.round((laterTimestamp - earlierTimestamp) / (24 * 60 * 60 * 1_000));
}

function parseCompactDate(value: string): number | null {
    const normalized = normalizeDateKey(value);
    if (normalized === null) {
        return null;
    }
    return Date.UTC(
        Number(normalized.slice(0, 4)),
        Number(normalized.slice(4, 6)) - 1,
        Number(normalized.slice(6, 8))
    );
}

function encodeNullableKeyPart(value: string | null): string {
    return value === null ? "null" : `string:${encodeKeyPart(value)}`;
}

function buildRankLearningCoverageRecordKeyPrefix(options: {
    asOfDate: string;
    facilityId: string;
    rangeFrom: string;
    rangeTo: string;
}): string {
    return [
        "rank-status-coverage",
        `schema:${encodeKeyPart(RANK_LEARNING_SCHEMA_VERSION)}`,
        `facility:${encodeKeyPart(options.facilityId)}`,
        `asOfDate:${options.asOfDate}`,
        `range:${options.rangeFrom}-${options.rangeTo}`
    ].join("|");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function encodeKeyPart(value: string): string {
    return encodeURIComponent(value);
}

function isStoredRankName(value: unknown): value is string | null {
    return value === null || isNonEmptyTrimmedString(value);
}

function isNonEmptyTrimmedString(value: unknown): value is string {
    return typeof value === "string" && value !== "" && value.trim() === value;
}

function hasOnlyFields(value: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
    const keys = Object.keys(value);
    return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
