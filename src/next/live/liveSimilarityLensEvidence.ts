import {
    BOOKING_CURVE_ENDPOINT,
    BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION,
    type BookingCurveRawSourceRecord
} from "../../bookingCurveRawSourceContract";
import {
    COMPETITOR_PRICE_ENDPOINT,
    COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
    type CompetitorPriceSnapshotRecord
} from "../../competitorPriceSnapshotContract";
import { getDaysBetweenDateKeys, normalizeDateKey } from "../../curveCore";
import type { ExistingIndexedDbReadResult } from "../../indexedDbReadOnly";
import type {
    RankRecommendationCurrentSettingRoomGroup,
    RankRecommendationCurrentSettingsResponse
} from "../../rankRecommendation";
import type { SimilarityCurvePoint, SimilarityDayEvidence } from "../similarityLensModel";

type ExistingReadMissingReason = Extract<
    ExistingIndexedDbReadResult<unknown>,
    { status: "missing" }
>["reason"];
type ExistingReadUnavailableReason = Extract<
    ExistingIndexedDbReadResult<unknown>,
    { status: "unavailable" }
>["reason"];
type ExistingReadErrorReason = Extract<
    ExistingIndexedDbReadResult<unknown>,
    { status: "error" }
>["reason"];
type LiveSimilarityLensReadFailure = Exclude<
    LiveSimilarityLensEvidenceValue<never>,
    { status: "ready" } | { status: "tail-pending" }
>;

export type LiveSimilarityLensEvidenceMissingReason =
    | ExistingReadMissingReason
    | "booking-record-missing"
    | "competitor-record-missing"
    | "current-setting-conflict"
    | "max-room-missing"
    | "remaining-room-missing"
    | "invalid-room-counts"
    | "segment-points-missing";

export type LiveSimilarityLensEvidenceUnavailableReason = ExistingReadUnavailableReason;

export type LiveSimilarityLensEvidenceErrorReason =
    | ExistingReadErrorReason
    | "invalid-context";

export type LiveSimilarityLensEvidenceValue<T> =
    | { status: "ready"; value: T }
    | { status: "missing"; reason: LiveSimilarityLensEvidenceMissingReason }
    | {
        status: "tail-pending";
        reason: "past-as-of-prefix";
        sourceAsOfDate: string;
        fetchedAt: string;
    }
    | { status: "unavailable"; reason: LiveSimilarityLensEvidenceUnavailableReason }
    | { status: "error"; reason: LiveSimilarityLensEvidenceErrorReason };

export interface LiveSimilarityLensOnHandValue {
    rooms: number;
    capacityRooms: number;
    remainingRooms: number;
    source: "current-settings";
}

export interface LiveSimilarityLensCurveValue {
    points: readonly SimilarityCurvePoint[];
    source: {
        endpoint: string;
        query: string;
        asOfDate: string;
        fetchedAt: string;
        freshnessDays: number;
    };
}

export interface LiveSimilarityLensRoomGroupEvidence {
    stayDate: string;
    roomGroupId: string;
    roomGroupName: string | null;
    onHand: LiveSimilarityLensEvidenceValue<LiveSimilarityLensOnHandValue>;
    transientCurve: LiveSimilarityLensEvidenceValue<LiveSimilarityLensCurveValue>;
    groupCurve: LiveSimilarityLensEvidenceValue<LiveSimilarityLensCurveValue>;
}

export interface LiveSimilarityLensCalendarGroupEvidence {
    stayDate: string;
    groupCurve: LiveSimilarityLensEvidenceValue<LiveSimilarityLensCurveValue>;
}

export interface LiveSimilarityLensCompetitorCacheValue {
    facilityId: string;
    fetchedAtByStayDate: Readonly<Record<string, string>>;
    recordCount: number;
    stayDates: readonly string[];
    latestFetchedAt: string;
}

export type LiveSimilarityLensContextStatus =
    | { status: "ready" }
    | { status: "error"; reason: "invalid-context" };

export interface LiveSimilarityLensEvidenceViewModel {
    contextStatus: LiveSimilarityLensContextStatus;
    facilityId: string;
    asOfDate: string | null;
    visibleStayDates: readonly string[];
    calendarGroups: readonly LiveSimilarityLensCalendarGroupEvidence[];
    roomGroups: readonly LiveSimilarityLensRoomGroupEvidence[];
    competitorCache: LiveSimilarityLensEvidenceValue<LiveSimilarityLensCompetitorCacheValue>;
}

export interface BuildLiveSimilarityLensEvidenceOptions {
    facilityId: string;
    asOfDate: string;
    visibleStayDates: readonly string[];
    currentSettings: RankRecommendationCurrentSettingsResponse;
    bookingRawRecords: readonly BookingCurveRawSourceRecord[];
    bookingReadStatus: ExistingIndexedDbReadResult<BookingCurveRawSourceRecord>;
    competitorRecords: readonly CompetitorPriceSnapshotRecord[];
    competitorReadStatus: ExistingIndexedDbReadResult<CompetitorPriceSnapshotRecord>;
}

interface CurrentSettingBucket {
    stayDate: string;
    roomGroupId: string;
    roomGroups: RankRecommendationCurrentSettingRoomGroup[];
}

type ResolvedBookingRecord =
    | { status: "ready"; record: BookingCurveRawSourceRecord }
    | {
        status: "tail-pending";
        reason: "past-as-of-prefix";
        sourceAsOfDate: string;
        fetchedAt: string;
        record: BookingCurveRawSourceRecord;
    }
    | Exclude<
        LiveSimilarityLensEvidenceValue<never>,
        { status: "ready" } | { status: "tail-pending" }
    >;

export function buildLiveSimilarityLensEvidence(
    options: BuildLiveSimilarityLensEvidenceOptions
): LiveSimilarityLensEvidenceViewModel {
    const asOfDate = toCompactDateKey(options.asOfDate);
    const visibleStayDates = normalizeVisibleStayDates(options.visibleStayDates);
    if (options.facilityId.trim() === "" || asOfDate === null) {
        return {
            contextStatus: { status: "error", reason: "invalid-context" },
            facilityId: options.facilityId,
            asOfDate,
            visibleStayDates,
            calendarGroups: [],
            roomGroups: [],
            competitorCache: { status: "error", reason: "invalid-context" }
        };
    }

    const visibleStayDateSet = new Set(visibleStayDates);
    const bookingReadFailure = convertReadFailure(options.bookingReadStatus);
    const calendarGroups = visibleStayDates.map((stayDate): LiveSimilarityLensCalendarGroupEvidence => {
        const bookingRecord = bookingReadFailure ?? resolveBookingRecord({
            facilityId: options.facilityId,
            stayDate,
            asOfDate,
            scope: "hotel",
            roomGroupId: null,
            expectedQuery: `date=${stayDate}`,
            records: options.bookingRawRecords
        });
        return {
            stayDate,
            groupCurve: resolveCurveEvidence(bookingRecord, "group", stayDate, asOfDate)
        };
    });
    const roomGroups = collectCurrentSettingBuckets(options.currentSettings, visibleStayDateSet)
        .map((bucket): LiveSimilarityLensRoomGroupEvidence => {
            const roomGroupName = resolveRoomGroupName(bucket.roomGroups);
            const bookingRecord = bookingReadFailure ?? resolveBookingRecord({
                facilityId: options.facilityId,
                stayDate: bucket.stayDate,
                asOfDate,
                scope: "roomGroup",
                roomGroupId: bucket.roomGroupId,
                expectedQuery: `date=${bucket.stayDate}&rm_room_group_id=${bucket.roomGroupId}`,
                records: options.bookingRawRecords
            });
            return {
                stayDate: bucket.stayDate,
                roomGroupId: bucket.roomGroupId,
                roomGroupName,
                onHand: resolveOnHandEvidence(bucket.roomGroups),
                transientCurve: resolveCurveEvidence(bookingRecord, "transient", bucket.stayDate, asOfDate),
                groupCurve: resolveCurveEvidence(bookingRecord, "group", bucket.stayDate, asOfDate)
            };
        })
        .sort(compareRoomGroupEvidence);

    return {
        contextStatus: { status: "ready" },
        facilityId: options.facilityId,
        asOfDate,
        visibleStayDates,
        calendarGroups,
        roomGroups,
        competitorCache: resolveCompetitorCacheEvidence({
            facilityId: options.facilityId,
            visibleStayDates: visibleStayDateSet,
            records: options.competitorRecords,
            readStatus: options.competitorReadStatus
        })
    };
}

export function projectLiveSimilarityLensEvidenceForRoomGroup(
    viewModel: LiveSimilarityLensEvidenceViewModel,
    roomGroupId: string
): SimilarityDayEvidence[] {
    const normalizedRoomGroupId = roomGroupId.trim();
    if (normalizedRoomGroupId === "") {
        return [];
    }

    return viewModel.roomGroups
        .filter((evidence) => evidence.roomGroupId === normalizedRoomGroupId)
        .map(projectLiveSimilarityLensRoomGroupEvidence)
        .sort((left, right) => left.stayDate.localeCompare(right.stayDate));
}

export function projectLiveSimilarityLensRoomGroupEvidence(
    evidence: LiveSimilarityLensRoomGroupEvidence
): SimilarityDayEvidence {
    return {
        stayDate: evidence.stayDate,
        roomGroupId: evidence.roomGroupId,
        onHandRooms: evidence.onHand.status === "ready"
            ? evidence.onHand.value.rooms
            : null,
        transientCurve: evidence.transientCurve.status === "ready"
            ? evidence.transientCurve.value.points
            : null,
        groupCurve: evidence.groupCurve.status === "ready"
            ? evidence.groupCurve.value.points
            : null,
        competitorPriceIndex: null
    };
}

function collectCurrentSettingBuckets(
    response: RankRecommendationCurrentSettingsResponse,
    visibleStayDates: ReadonlySet<string>
): CurrentSettingBucket[] {
    const bucketsByKey = new Map<string, CurrentSettingBucket>();
    for (const currentSetting of response.suggest_output_current_settings ?? []) {
        const stayDate = toCompactDateKey(currentSetting.stay_date ?? "");
        if (stayDate === null || !visibleStayDates.has(stayDate)) {
            continue;
        }
        for (const roomGroup of currentSetting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            if (roomGroupId === "") {
                continue;
            }
            const key = `${stayDate}:${roomGroupId}`;
            const bucket = bucketsByKey.get(key) ?? {
                stayDate,
                roomGroupId,
                roomGroups: []
            };
            bucket.roomGroups.push(roomGroup);
            bucketsByKey.set(key, bucket);
        }
    }
    return Array.from(bucketsByKey.values());
}

function resolveRoomGroupName(roomGroups: readonly RankRecommendationCurrentSettingRoomGroup[]): string | null {
    const names = new Set(roomGroups
        .map((roomGroup) => roomGroup.rm_room_group_name?.trim() ?? "")
        .filter((name) => name !== ""));
    return names.size === 1 ? names.values().next().value ?? null : null;
}

function resolveOnHandEvidence(
    roomGroups: readonly RankRecommendationCurrentSettingRoomGroup[]
): LiveSimilarityLensEvidenceValue<LiveSimilarityLensOnHandValue> {
    const firstRoomGroup = roomGroups[0];
    if (firstRoomGroup === undefined) {
        return { status: "missing", reason: "current-setting-conflict" };
    }
    if (roomGroups.some((roomGroup) => (
        !Object.is(roomGroup.max_num_room, firstRoomGroup.max_num_room)
        || !Object.is(roomGroup.remaining_num_room, firstRoomGroup.remaining_num_room)
    ))) {
        return { status: "missing", reason: "current-setting-conflict" };
    }

    const maxRooms = firstRoomGroup.max_num_room;
    const remainingRooms = firstRoomGroup.remaining_num_room;
    if (maxRooms === undefined) {
        return { status: "missing", reason: "max-room-missing" };
    }
    if (remainingRooms === undefined) {
        return { status: "missing", reason: "remaining-room-missing" };
    }
    if (
        !Number.isInteger(maxRooms)
        || !Number.isInteger(remainingRooms)
        || maxRooms <= 0
        || remainingRooms < 0
        || remainingRooms > maxRooms
    ) {
        return { status: "missing", reason: "invalid-room-counts" };
    }

    return {
        status: "ready",
        value: {
            rooms: maxRooms - remainingRooms,
            capacityRooms: maxRooms,
            remainingRooms,
            source: "current-settings"
        }
    };
}

function resolveBookingRecord(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    scope: "hotel" | "roomGroup";
    roomGroupId: string | null;
    expectedQuery: string;
    records: readonly BookingCurveRawSourceRecord[];
}): ResolvedBookingRecord {
    const matchingRecords = options.records.filter((record) => isMatchingBookingRecord(
        record,
        options.facilityId,
        options.stayDate,
        options.scope,
        options.roomGroupId,
        options.expectedQuery
    ));
    const exactRecords = matchingRecords.filter((record) => toCompactDateKey(record.asOfDate) === options.asOfDate);
    const exactRecord = selectLatestFetchedRecord(exactRecords);
    if (exactRecord !== null) {
        return { status: "ready", record: exactRecord };
    }

    const pastRecord = matchingRecords
        .filter((record) => {
            const recordAsOfDate = toCompactDateKey(record.asOfDate);
            return recordAsOfDate !== null && recordAsOfDate < options.asOfDate;
        })
        .sort(compareBookingRecordRecency)
        .at(-1) ?? null;
    if (pastRecord !== null) {
        const sourceAsOfDate = toCompactDateKey(pastRecord.asOfDate);
        if (sourceAsOfDate !== null) {
            return {
                status: "tail-pending",
                reason: "past-as-of-prefix",
                sourceAsOfDate,
                fetchedAt: pastRecord.fetchedAt,
                record: pastRecord
            };
        }
    }
    return { status: "missing", reason: "booking-record-missing" };
}

function isMatchingBookingRecord(
    record: BookingCurveRawSourceRecord,
    facilityId: string,
    stayDate: string,
    scope: "hotel" | "roomGroup",
    roomGroupId: string | null,
    expectedQuery: string
): boolean {
    return record.facilityId === facilityId
        && toCompactDateKey(record.stayDate) === stayDate
        && record.scope === scope
        && record.roomGroupId === roomGroupId
        && record.schemaVersion === BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION
        && record.endpoint === BOOKING_CURVE_ENDPOINT
        && record.query === expectedQuery
        && typeof record.response?.stay_date === "string"
        && toCompactDateKey(record.response.stay_date) === stayDate
        && parseTimestamp(record.fetchedAt) !== null;
}

function selectLatestFetchedRecord(
    records: readonly BookingCurveRawSourceRecord[]
): BookingCurveRawSourceRecord | null {
    return records.reduce<BookingCurveRawSourceRecord | null>((latest, record) => {
        if (latest === null) {
            return record;
        }
        return compareFetchedAt(latest.fetchedAt, record.fetchedAt) <= 0 ? record : latest;
    }, null);
}

function compareBookingRecordRecency(
    left: BookingCurveRawSourceRecord,
    right: BookingCurveRawSourceRecord
): number {
    const leftAsOfDate = toCompactDateKey(left.asOfDate) ?? "";
    const rightAsOfDate = toCompactDateKey(right.asOfDate) ?? "";
    return leftAsOfDate.localeCompare(rightAsOfDate)
        || compareFetchedAt(left.fetchedAt, right.fetchedAt)
        || left.cacheKey.localeCompare(right.cacheKey);
}

function resolveCurveEvidence(
    bookingRecord: ResolvedBookingRecord,
    segment: "transient" | "group",
    stayDate: string,
    asOfDate: string
): LiveSimilarityLensEvidenceValue<LiveSimilarityLensCurveValue> {
    if (
        bookingRecord.status !== "ready"
        && bookingRecord.status !== "tail-pending"
    ) {
        return bookingRecord;
    }
    const sourceAsOfDate = bookingRecord.status === "ready"
        ? asOfDate
        : bookingRecord.sourceAsOfDate;
    const freshnessDays = getDaysBetweenDateKeys(asOfDate, sourceAsOfDate);
    if (bookingRecord.status === "tail-pending") {
        return {
            status: "tail-pending",
            reason: bookingRecord.reason,
            sourceAsOfDate: bookingRecord.sourceAsOfDate,
            fetchedAt: bookingRecord.fetchedAt
        };
    }
    if (freshnessDays !== 0) {
        return { status: "missing", reason: "booking-record-missing" };
    }
    const pointsByLeadDays = new Map<number, SimilarityCurvePoint>();
    for (const point of bookingRecord.record.response.booking_curve ?? []) {
        const observedDate = normalizeDateKey(point.date);
        if (observedDate === null) {
            continue;
        }
        const observedDateCompact = toCompactDateKey(observedDate);
        if (observedDateCompact === null || observedDateCompact > asOfDate) {
            continue;
        }
        const leadDays = getDaysBetweenDateKeys(stayDate, observedDate);
        const value = point[segment]?.this_year_room_sum;
        if (leadDays === null || leadDays < 0 || typeof value !== "number" || !Number.isFinite(value)) {
            continue;
        }
        pointsByLeadDays.set(leadDays, { leadDays, value });
    }
    const points = Array.from(pointsByLeadDays.values())
        .sort((left, right) => right.leadDays - left.leadDays);
    if (points.length === 0) {
        return { status: "missing", reason: "segment-points-missing" };
    }

    return {
        status: "ready",
        value: {
            points,
            source: {
                endpoint: bookingRecord.record.endpoint,
                query: bookingRecord.record.query,
                asOfDate: sourceAsOfDate,
                fetchedAt: bookingRecord.record.fetchedAt,
                freshnessDays
            }
        }
    };
}

function resolveCompetitorCacheEvidence(options: {
    facilityId: string;
    visibleStayDates: ReadonlySet<string>;
    records: readonly CompetitorPriceSnapshotRecord[];
    readStatus: ExistingIndexedDbReadResult<CompetitorPriceSnapshotRecord>;
}): LiveSimilarityLensEvidenceValue<LiveSimilarityLensCompetitorCacheValue> {
    const readFailure = convertReadFailure(options.readStatus);
    if (readFailure !== null) {
        return readFailure;
    }

    const recordsBySnapshotKey = new Map<string, CompetitorPriceSnapshotRecord>();
    for (const record of options.records) {
        const stayDate = toCompactDateKey(record.stayDate);
        if (
            record.facilityId !== options.facilityId
            || stayDate === null
            || !options.visibleStayDates.has(stayDate)
            || record.schemaVersion !== COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION
            || record.endpoint !== COMPETITOR_PRICE_ENDPOINT
            || toCompactDateKey(record.searchConditionRaw?.stayDate ?? "") !== stayDate
            || parseTimestamp(record.fetchedAt) === null
        ) {
            continue;
        }
        const previous = recordsBySnapshotKey.get(record.snapshotKey);
        if (previous === undefined || compareFetchedAt(previous.fetchedAt, record.fetchedAt) <= 0) {
            recordsBySnapshotKey.set(record.snapshotKey, record);
        }
    }
    const records = Array.from(recordsBySnapshotKey.values());
    if (records.length === 0) {
        return { status: "missing", reason: "competitor-record-missing" };
    }
    const latestRecord = records.reduce((latest, record) => (
        compareFetchedAt(latest.fetchedAt, record.fetchedAt) <= 0 ? record : latest
    ));
    const fetchedAtByStayDate = new Map<string, string>();
    for (const record of records) {
        const stayDate = toCompactDateKey(record.stayDate);
        if (stayDate === null) {
            continue;
        }
        const previous = fetchedAtByStayDate.get(stayDate);
        if (previous === undefined || compareFetchedAt(previous, record.fetchedAt) <= 0) {
            fetchedAtByStayDate.set(stayDate, record.fetchedAt);
        }
    }

    return {
        status: "ready",
        value: {
            facilityId: options.facilityId,
            fetchedAtByStayDate: Object.fromEntries(fetchedAtByStayDate),
            recordCount: records.length,
            stayDates: Array.from(fetchedAtByStayDate.keys()).sort(),
            latestFetchedAt: latestRecord.fetchedAt
        }
    };
}

function convertReadFailure<T>(
    readStatus: ExistingIndexedDbReadResult<T>
): LiveSimilarityLensReadFailure | null {
    if (readStatus.status === "ready") {
        return null;
    }
    if (readStatus.status === "missing") {
        return { status: "missing", reason: readStatus.reason };
    }
    if (readStatus.status === "unavailable") {
        return { status: "unavailable", reason: readStatus.reason };
    }
    return { status: "error", reason: readStatus.reason };
}

function normalizeVisibleStayDates(stayDates: readonly string[]): string[] {
    return Array.from(new Set(stayDates
        .map(toCompactDateKey)
        .filter((stayDate): stayDate is string => stayDate !== null)))
        .sort();
}

function toCompactDateKey(value: string): string | null {
    const normalized = normalizeDateKey(value);
    return normalized === null ? null : normalized.replace(/-/gu, "");
}

function parseTimestamp(value: string): number | null {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function compareFetchedAt(left: string, right: string): number {
    return (parseTimestamp(left) ?? Number.NEGATIVE_INFINITY)
        - (parseTimestamp(right) ?? Number.NEGATIVE_INFINITY);
}

function compareRoomGroupEvidence(
    left: LiveSimilarityLensRoomGroupEvidence,
    right: LiveSimilarityLensRoomGroupEvidence
): number {
    return left.stayDate.localeCompare(right.stayDate)
        || (left.roomGroupName ?? "").localeCompare(right.roomGroupName ?? "")
        || left.roomGroupId.localeCompare(right.roomGroupId);
}
