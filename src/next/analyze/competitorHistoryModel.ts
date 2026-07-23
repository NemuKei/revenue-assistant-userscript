import {
    COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION,
    type CompetitorPriceSnapshotPlan,
    type CompetitorPriceSnapshotRecord
} from "../../competitorPriceSnapshotContract";

export const COMPETITOR_HISTORY_GUEST_COUNTS = [1, 2, 3, 4] as const;

export type CompetitorHistoryGuestCount = typeof COMPETITOR_HISTORY_GUEST_COUNTS[number];

export interface CompetitorHistoryFilterOption {
    label: string;
    value: string;
}

export interface CompetitorHistoryFilters {
    mealType: string | null;
    roomType: string | null;
}

export interface CompetitorHistoryFacility {
    color: string;
    id: string;
    isOwn: boolean;
    label: string;
}

export interface CompetitorHistoryPoint {
    date: string;
    facilityId: string;
    price: number;
    roomTypeLabel: string;
}

export interface CompetitorHistoryLatestValue {
    deltaFromPrevious: number | null;
    facilityId: string;
    price: number;
    roomTypeLabel: string;
}

export interface CompetitorHistoryPanel {
    guestCount: CompetitorHistoryGuestCount;
    latestDate: string | null;
    latestValues: CompetitorHistoryLatestValue[];
    points: CompetitorHistoryPoint[];
}

export interface CompetitorHistoryViewModel {
    availableFilters: {
        mealTypes: CompetitorHistoryFilterOption[];
        roomTypes: CompetitorHistoryFilterOption[];
    };
    excludedConditionRecordCount: number;
    facilities: CompetitorHistoryFacility[];
    filters: CompetitorHistoryFilters;
    hasAnyPoints: boolean;
    latestFetchedAt: string;
    observationDates: string[];
    panels: CompetitorHistoryPanel[];
    selectedConditionRecordCount: number;
    stayDate: string;
}

export type CompetitorHistoryModelResult =
    | { status: "ready"; viewModel: CompetitorHistoryViewModel }
    | { status: "empty"; reason: "no-records" };

const OWN_SERIES_COLOR = "#1268a6";
const COMPETITOR_SERIES_COLORS = [
    "#b54a26",
    "#4f6f1f",
    "#7656a8",
    "#a26212",
    "#0d7a72",
    "#9b3f75",
    "#53677c"
] as const;
const JST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;

export function buildCompetitorHistoryViewModel(options: {
    facilityId: string;
    filters?: Partial<CompetitorHistoryFilters>;
    records: readonly unknown[];
    stayDate: string;
}): CompetitorHistoryModelResult {
    const stayDate = normalizeCompactDate(options.stayDate);
    const facilityId = options.facilityId.trim();
    const records = options.records
        .map(normalizeSnapshotRecord)
        .filter((record): record is CompetitorPriceSnapshotRecord => (
            record !== null
            && record.facilityId === facilityId
            && normalizeCompactDate(record.stayDate) === stayDate
        ))
        .sort(compareFetchedAt);
    if (records.length === 0) {
        return { status: "empty", reason: "no-records" };
    }

    const availableFilters = buildFilterOptions(records);
    const filters = normalizeFilters(options.filters, availableFilters);
    const candidateRecords = selectRecordsForRoomType(records, filters.roomType);
    const selectedRecords = selectLatestConditionGroup(candidateRecords);
    const dailyRecords = selectLatestRecordPerJstDate(selectedRecords);
    const facilities = buildFacilities(selectedRecords);
    const pointsByGuest = buildPointsByGuest(dailyRecords, filters);
    const panels = COMPETITOR_HISTORY_GUEST_COUNTS.map((guestCount) => buildPanel(
        guestCount,
        pointsByGuest.get(guestCount) ?? [],
        facilities
    ));
    const latestFetchedAt = selectedRecords.at(-1)?.fetchedAt ?? records.at(-1)?.fetchedAt ?? "";

    return {
        status: "ready",
        viewModel: {
            availableFilters,
            excludedConditionRecordCount: Math.max(0, records.length - selectedRecords.length),
            facilities,
            filters,
            hasAnyPoints: panels.some((panel) => panel.points.length > 0),
            latestFetchedAt,
            observationDates: dailyRecords.map((record) => formatFetchedAtAsJstDate(record.fetchedAt)),
            panels,
            selectedConditionRecordCount: selectedRecords.length,
            stayDate
        }
    };
}

export function formatCompetitorHistoryRoomType(value: string): string {
    const labels: Record<string, string> = {
        DOUBLE: "ダブル",
        FOUR_BEDS: "4ベッド",
        JAPANESE: "和室",
        SINGLE: "シングル",
        TRIPLE: "トリプル",
        TWIN: "ツイン",
        WASHITSU: "和室",
        WAYOUSHITSU: "和洋室"
    };
    const normalized = value.trim();
    return labels[normalized] ?? normalized;
}

export function formatCompetitorHistoryMealType(value: string): string {
    const labels: Record<string, string> = {
        BREAKFAST: "朝食あり",
        BREAKFAST_DINNER: "朝・夕食あり",
        DINNER: "夕食あり",
        NONE: "食事なし"
    };
    const normalized = value.trim();
    return labels[normalized] ?? normalized;
}

function normalizeSnapshotRecord(value: unknown): CompetitorPriceSnapshotRecord | null {
    if (!isRecord(value)) {
        return null;
    }
    if (
        !isNonEmptyString(value.snapshotKey)
        || !isNonEmptyString(value.facilityId)
        || !isNonEmptyString(value.stayDate)
        || !isNonEmptyString(value.conditionSignature)
        || !isNonEmptyString(value.fetchedAt)
        || value.schemaVersion !== COMPETITOR_PRICE_SNAPSHOT_SCHEMA_VERSION
        || !isRecord(value.searchConditionRaw)
        || !Array.isArray(value.competitorSet)
        || !isRecord(value.payload)
    ) {
        return null;
    }
    if (
        !value.competitorSet.every((item) => (
            isRecord(item)
            && isNonEmptyString(item.yadNo)
            && isNonEmptyString(item.name)
        ))
        || !isSnapshotHotelOrNull(value.payload.own)
        || !Array.isArray(value.payload.competitors)
        || !value.payload.competitors.every(isSnapshotHotel)
    ) {
        return null;
    }
    const jalanRoomTypes = value.searchConditionRaw.jalanRoomTypes;
    if (
        jalanRoomTypes !== undefined
        && jalanRoomTypes !== null
        && (!Array.isArray(jalanRoomTypes) || !jalanRoomTypes.every(isNonEmptyString))
    ) {
        return null;
    }
    return value as unknown as CompetitorPriceSnapshotRecord;
}

function isSnapshotHotelOrNull(value: unknown): boolean {
    return value === null || isSnapshotHotel(value);
}

function isSnapshotHotel(value: unknown): boolean {
    return isRecord(value)
        && isNonEmptyString(value.yadNo)
        && Array.isArray(value.plans)
        && value.plans.every(isSnapshotPlan);
}

function isSnapshotPlan(value: unknown): boolean {
    return isRecord(value)
        && isNonEmptyString(value.yadNo)
        && isOptionalFiniteNumber(value.numGuests)
        && isOptionalFiniteNumber(value.price)
        && isOptionalString(value.mealType)
        && isOptionalString(value.jalanFacilityRoomType);
}

function buildFilterOptions(records: readonly CompetitorPriceSnapshotRecord[]): {
    mealTypes: CompetitorHistoryFilterOption[];
    roomTypes: CompetitorHistoryFilterOption[];
} {
    const mealTypes = new Set<string>();
    const roomTypes = new Set<string>();
    for (const record of records) {
        for (const plan of flattenPlans(record)) {
            const mealType = plan.mealType?.trim() ?? "";
            const roomType = plan.jalanFacilityRoomType?.trim() ?? "";
            if (mealType !== "") {
                mealTypes.add(mealType);
            }
            if (roomType !== "") {
                roomTypes.add(roomType);
            }
        }
    }
    return {
        mealTypes: Array.from(mealTypes)
            .map((value) => ({ label: formatCompetitorHistoryMealType(value), value }))
            .sort(compareFilterOptions),
        roomTypes: Array.from(roomTypes)
            .map((value) => ({ label: formatCompetitorHistoryRoomType(value), value }))
            .sort(compareFilterOptions)
    };
}

function normalizeFilters(
    filters: Partial<CompetitorHistoryFilters> | undefined,
    available: CompetitorHistoryViewModel["availableFilters"]
): CompetitorHistoryFilters {
    const roomType = available.roomTypes.some((option) => option.value === filters?.roomType)
        ? filters?.roomType ?? null
        : null;
    const mealType = available.mealTypes.some((option) => option.value === filters?.mealType)
        ? filters?.mealType ?? null
        : null;
    return { mealType, roomType };
}

function selectRecordsForRoomType(
    records: readonly CompetitorPriceSnapshotRecord[],
    roomType: string | null
): CompetitorPriceSnapshotRecord[] {
    const unspecified: CompetitorPriceSnapshotRecord[] = [];
    const matching: CompetitorPriceSnapshotRecord[] = [];
    for (const record of records) {
        const requestRoomTypes = record.searchConditionRaw.jalanRoomTypes ?? [];
        if (requestRoomTypes.length === 0) {
            unspecified.push(record);
        }
        if (roomType !== null && requestRoomTypes.includes(roomType)) {
            matching.push(record);
        }
    }
    if (roomType === null) {
        return unspecified.length > 0 ? unspecified : [...records];
    }
    return matching.length > 0 ? matching : unspecified;
}

function selectLatestConditionGroup(
    records: readonly CompetitorPriceSnapshotRecord[]
): CompetitorPriceSnapshotRecord[] {
    const groups = new Map<string, CompetitorPriceSnapshotRecord[]>();
    for (const record of records) {
        const group = groups.get(record.conditionSignature) ?? [];
        group.push(record);
        groups.set(record.conditionSignature, group);
    }
    return Array.from(groups.values())
        .map((group) => group.sort(compareFetchedAt))
        .sort((left, right) => {
            const latestComparison = compareFetchedAt(right.at(-1), left.at(-1));
            return latestComparison !== 0 ? latestComparison : right.length - left.length;
        })[0] ?? [];
}

function selectLatestRecordPerJstDate(
    records: readonly CompetitorPriceSnapshotRecord[]
): CompetitorPriceSnapshotRecord[] {
    const byDate = new Map<string, CompetitorPriceSnapshotRecord>();
    for (const record of records) {
        const date = formatFetchedAtAsJstDate(record.fetchedAt);
        const current = byDate.get(date);
        if (current === undefined || compareFetchedAt(current, record) < 0) {
            byDate.set(date, record);
        }
    }
    return Array.from(byDate.values()).sort(compareFetchedAt);
}

function buildFacilities(
    records: readonly CompetitorPriceSnapshotRecord[]
): CompetitorHistoryFacility[] {
    const labels = new Map<string, { isOwn: boolean; label: string }>();
    for (const record of records) {
        if (record.payload.own !== null) {
            labels.set(record.payload.own.yadNo, { isOwn: true, label: "自社" });
        }
        for (const competitor of record.competitorSet) {
            if (!labels.has(competitor.yadNo)) {
                labels.set(competitor.yadNo, { isOwn: false, label: competitor.name });
            }
        }
    }
    let competitorIndex = 0;
    return Array.from(labels.entries())
        .sort(([, left], [, right]) => Number(right.isOwn) - Number(left.isOwn))
        .map(([id, item]) => {
            const color = item.isOwn
                ? OWN_SERIES_COLOR
                : COMPETITOR_SERIES_COLORS[competitorIndex++ % COMPETITOR_SERIES_COLORS.length] ?? "#53677c";
            return { color, id, isOwn: item.isOwn, label: item.label };
        });
}

function buildPointsByGuest(
    records: readonly CompetitorPriceSnapshotRecord[],
    filters: CompetitorHistoryFilters
): Map<CompetitorHistoryGuestCount, CompetitorHistoryPoint[]> {
    const points = new Map<CompetitorHistoryGuestCount, CompetitorHistoryPoint[]>(
        COMPETITOR_HISTORY_GUEST_COUNTS.map((guestCount) => [guestCount, []])
    );
    for (const record of records) {
        const date = formatFetchedAtAsJstDate(record.fetchedAt);
        const minima = new Map<string, CompetitorPriceSnapshotPlan>();
        for (const plan of flattenPlans(record)) {
            if (
                !isGuestCount(plan.numGuests)
                || typeof plan.price !== "number"
                || !Number.isFinite(plan.price)
                || plan.price < 0
                || (filters.roomType !== null && plan.jalanFacilityRoomType !== filters.roomType)
                || (filters.mealType !== null && plan.mealType !== filters.mealType)
            ) {
                continue;
            }
            const key = `${plan.numGuests}\u001f${plan.yadNo}`;
            const current = minima.get(key);
            if (current === undefined || (current.price ?? Number.POSITIVE_INFINITY) > plan.price) {
                minima.set(key, plan);
            }
        }
        for (const plan of minima.values()) {
            if (!isGuestCount(plan.numGuests) || typeof plan.price !== "number") {
                continue;
            }
            points.get(plan.numGuests)?.push({
                date,
                facilityId: plan.yadNo,
                price: plan.price,
                roomTypeLabel: plan.jalanFacilityRoomType === null
                    ? "不明"
                    : formatCompetitorHistoryRoomType(plan.jalanFacilityRoomType)
            });
        }
    }
    return points;
}

function buildPanel(
    guestCount: CompetitorHistoryGuestCount,
    points: CompetitorHistoryPoint[],
    facilities: readonly CompetitorHistoryFacility[]
): CompetitorHistoryPanel {
    const dates = Array.from(new Set(points.map((point) => point.date))).sort();
    const latestDate = dates.at(-1) ?? null;
    const previousDate = latestDate === null ? null : dates.at(-2) ?? null;
    const facilityOrder = new Map(facilities.map((facility, index) => [facility.id, index]));
    const latestValues = latestDate === null
        ? []
        : points
            .filter((point) => point.date === latestDate)
            .map((point) => ({
                deltaFromPrevious: previousDate === null
                    ? null
                    : point.price - (points.find((candidate) => (
                        candidate.date === previousDate
                        && candidate.facilityId === point.facilityId
                    ))?.price ?? point.price),
                facilityId: point.facilityId,
                price: point.price,
                roomTypeLabel: point.roomTypeLabel
            }))
            .map((value) => ({
                ...value,
                deltaFromPrevious: previousDate === null
                    || !points.some((point) => point.date === previousDate && point.facilityId === value.facilityId)
                    ? null
                    : value.deltaFromPrevious
            }))
            .sort((left, right) => (
                (facilityOrder.get(left.facilityId) ?? Number.MAX_SAFE_INTEGER)
                - (facilityOrder.get(right.facilityId) ?? Number.MAX_SAFE_INTEGER)
            ));
    return {
        guestCount,
        latestDate,
        latestValues,
        points: points.slice().sort((left, right) => (
            left.date.localeCompare(right.date)
            || (facilityOrder.get(left.facilityId) ?? Number.MAX_SAFE_INTEGER)
                - (facilityOrder.get(right.facilityId) ?? Number.MAX_SAFE_INTEGER)
        ))
    };
}

function flattenPlans(record: CompetitorPriceSnapshotRecord): CompetitorPriceSnapshotPlan[] {
    return [
        ...(record.payload.own?.plans ?? []),
        ...record.payload.competitors.flatMap((hotel) => hotel.plans)
    ];
}

function formatFetchedAtAsJstDate(value: string): string {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
        ? new Date(timestamp + JST_OFFSET_MILLISECONDS).toISOString().slice(0, 10)
        : value.slice(0, 10);
}

function normalizeCompactDate(value: string): string {
    return value.trim().replaceAll("-", "");
}

function compareFetchedAt(
    left: CompetitorPriceSnapshotRecord | undefined,
    right: CompetitorPriceSnapshotRecord | undefined
): number {
    return (left?.fetchedAt ?? "").localeCompare(right?.fetchedAt ?? "");
}

function compareFilterOptions(left: CompetitorHistoryFilterOption, right: CompetitorHistoryFilterOption): number {
    return left.label.localeCompare(right.label, "ja") || left.value.localeCompare(right.value);
}

function isGuestCount(value: number | null): value is CompetitorHistoryGuestCount {
    return COMPETITOR_HISTORY_GUEST_COUNTS.includes(value as CompetitorHistoryGuestCount);
}

function isOptionalFiniteNumber(value: unknown): boolean {
    return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalString(value: unknown): boolean {
    return value === null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
