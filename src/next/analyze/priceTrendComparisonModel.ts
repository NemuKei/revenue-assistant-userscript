export const PRICE_TREND_COMPARISON_GUEST_COUNTS = [1, 2, 3, 4] as const;

export type PriceTrendComparisonGuestCount = typeof PRICE_TREND_COMPARISON_GUEST_COUNTS[number];

export interface PriceTrendComparisonFilters {
    mealType: string | null;
    roomType: string | null;
}

export interface PriceTrendComparisonFilterOption {
    label: string;
    value: string;
}

export interface PriceTrendComparisonFacility {
    color: string;
    id: string;
    isOwn: boolean;
    label: string;
}

export interface PriceTrendComparisonPoint {
    facilityId: string;
    leadTimeDays: number;
    mealType: string;
    observedDate: string | null;
    price: number;
    roomTypeLabel: string;
    status: string | null;
}

export interface PriceTrendGuestComparison {
    competitorLabel: string | null;
    competitorMinPrice: number | null;
    gapFromCompetitor: number | null;
    guestCount: PriceTrendComparisonGuestCount;
    latestLeadTimeDays: number | null;
    observedDate: string | null;
    ownPrice: number | null;
    points: PriceTrendComparisonPoint[];
}

export interface PriceTrendComparisonViewModel {
    availableFilters: {
        mealTypes: PriceTrendComparisonFilterOption[];
        roomTypes: PriceTrendComparisonFilterOption[];
    };
    comparisons: PriceTrendGuestComparison[];
    facilities: PriceTrendComparisonFacility[];
    filters: PriceTrendComparisonFilters;
    latestFetchedAt: string;
    latestSourceUpdatedAt: string | null;
    selectedGuestCount: PriceTrendComparisonGuestCount;
    selectedRecordCount: number;
    stayDate: string;
    usesSpecificRoomTypeAggregation: boolean;
}

export type PriceTrendComparisonModelResult =
    | { status: "ready"; viewModel: PriceTrendComparisonViewModel }
    | { status: "empty"; reason: "no-records" | "no-price-points" };

interface NormalizedPriceTrendFacility {
    id: string;
    isOwn: boolean;
    label: string;
}

interface NormalizedPriceTrendPoint {
    date: string | null;
    leadTimeDays: number;
    price: number | null;
    status: string | null;
}

interface NormalizedPriceTrendSeries {
    facilityId: string;
    points: NormalizedPriceTrendPoint[];
}

interface NormalizedPriceTrendRecord {
    facilityId: string;
    facilities: NormalizedPriceTrendFacility[];
    fetchedAt: string;
    guestCount: PriceTrendComparisonGuestCount;
    latestSourceUpdatedAt: string | null;
    mealType: string;
    recordKey: string;
    roomType: string | null;
    roomTypeLabel: string | null;
    series: NormalizedPriceTrendSeries[];
    stayDate: string;
}

const PRICE_TREND_SCHEMA_VERSION = "price_trend:v1";
const EXPECTED_MEAL_TYPES = ["NONE", "BREAKFAST", "DINNER", "BREAKFAST_DINNER"] as const;
const EXPECTED_ROOM_TYPES = [
    "SINGLE",
    "DOUBLE",
    "TWIN",
    "TRIPLE",
    "FOUR_BEDS",
    "WASHITSU",
    "WAYOUSHITSU"
] as const;
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

export function buildPriceTrendComparisonViewModel(options: {
    facilityId: string;
    filters?: Partial<PriceTrendComparisonFilters>;
    records: readonly unknown[];
    selectedGuestCount?: PriceTrendComparisonGuestCount;
    stayDate: string;
}): PriceTrendComparisonModelResult {
    const facilityId = options.facilityId.trim();
    const stayDate = normalizeCompactDate(options.stayDate);
    const records = selectLatestRecordsByScope(
        options.records
            .map(normalizePriceTrendRecord)
            .filter((record): record is NormalizedPriceTrendRecord => (
                record !== null
                && record.facilityId === facilityId
                && normalizeCompactDate(record.stayDate) === stayDate
            ))
    );
    if (records.length === 0) {
        return { status: "empty", reason: "no-records" };
    }

    const availableFilters = buildFilterOptions(records);
    const filters = normalizeFilters(options.filters, availableFilters);
    const roomSelection = selectRecordsForRoomType(records, filters.roomType);
    const selectedRecords = roomSelection.records.filter((record) => (
        filters.mealType === null || record.mealType === filters.mealType
    ));
    const facilities = buildFacilities(selectedRecords);
    const pointsByGuest = buildPointsByGuest(selectedRecords);
    const comparisons = PRICE_TREND_COMPARISON_GUEST_COUNTS.map((guestCount) => (
        buildGuestComparison(guestCount, pointsByGuest.get(guestCount) ?? [], facilities)
    ));
    if (!comparisons.some((comparison) => comparison.points.length > 0)) {
        return { status: "empty", reason: "no-price-points" };
    }

    const selectedGuestCount = PRICE_TREND_COMPARISON_GUEST_COUNTS.includes(
        options.selectedGuestCount ?? 2
    )
        ? options.selectedGuestCount ?? 2
        : 2;
    const latestRecord = selectedRecords.reduce<NormalizedPriceTrendRecord | null>(
        (latest, record) => latest === null || latest.fetchedAt < record.fetchedAt ? record : latest,
        null
    );
    const latestSourceUpdatedAt = selectedRecords.reduce<string | null>((latest, record) => {
        const current = record.latestSourceUpdatedAt;
        if (current === null) {
            return latest;
        }
        return latest === null || latest < current ? current : latest;
    }, null);

    return {
        status: "ready",
        viewModel: {
            availableFilters,
            comparisons,
            facilities,
            filters,
            latestFetchedAt: latestRecord?.fetchedAt ?? "",
            latestSourceUpdatedAt,
            selectedGuestCount,
            selectedRecordCount: selectedRecords.length,
            stayDate,
            usesSpecificRoomTypeAggregation: roomSelection.usesSpecificRecords
        }
    };
}

export function formatPriceTrendComparisonMealType(value: string): string {
    const labels: Record<string, string> = {
        BREAKFAST: "朝食あり",
        BREAKFAST_DINNER: "朝・夕食あり",
        DINNER: "夕食あり",
        NONE: "食事なし"
    };
    const normalized = value.trim();
    return labels[normalized] ?? normalized;
}

export function formatPriceTrendComparisonRoomType(value: string): string {
    const labels: Record<string, string> = {
        DOUBLE: "ダブル",
        FOUR_BEDS: "4ベッド",
        SINGLE: "シングル",
        TRIPLE: "トリプル",
        TWIN: "ツイン",
        WASHITSU: "和室",
        WAYOUSHITSU: "和洋室"
    };
    const normalized = value.trim();
    return labels[normalized] ?? normalized;
}

function normalizePriceTrendRecord(value: unknown): NormalizedPriceTrendRecord | null {
    if (
        !isRecord(value)
        || value.schemaVersion !== PRICE_TREND_SCHEMA_VERSION
        || !isNonEmptyString(value.recordKey)
        || !isNonEmptyString(value.facilityId)
        || !isNonEmptyString(value.stayDate)
        || !isGuestCount(value.numGuests)
        || !isNonEmptyString(value.mealType)
        || !isNullableString(value.roomType)
        || !isNullableString(value.roomTypeLabel)
        || !isNonEmptyString(value.fetchedAt)
        || !Array.isArray(value.facilities)
        || !isRecord(value.payload)
        || !Array.isArray(value.payload.yads)
        || !isNullableString(value.payload.latestSourceUpdatedAt)
    ) {
        return null;
    }
    const facilities = value.facilities
        .map(normalizeFacility)
        .filter((facility): facility is NormalizedPriceTrendFacility => facility !== null);
    const series = value.payload.yads
        .map(normalizeSeries)
        .filter((item): item is NormalizedPriceTrendSeries => item !== null);
    if (facilities.length === 0 || series.length === 0) {
        return null;
    }
    return {
        facilityId: value.facilityId.trim(),
        facilities,
        fetchedAt: value.fetchedAt,
        guestCount: value.numGuests,
        latestSourceUpdatedAt: normalizeNullableString(value.payload.latestSourceUpdatedAt),
        mealType: value.mealType.trim(),
        recordKey: value.recordKey,
        roomType: normalizeNullableString(value.roomType),
        roomTypeLabel: normalizeNullableString(value.roomTypeLabel),
        series,
        stayDate: value.stayDate
    };
}

function normalizeFacility(value: unknown): NormalizedPriceTrendFacility | null {
    if (
        !isRecord(value)
        || !isNonEmptyString(value.yadNo)
        || !isNonEmptyString(value.name)
        || (value.role !== "own" && value.role !== "competitor")
    ) {
        return null;
    }
    return {
        id: value.yadNo.trim(),
        isOwn: value.role === "own",
        label: value.role === "own" ? "自社" : value.name.trim()
    };
}

function normalizeSeries(value: unknown): NormalizedPriceTrendSeries | null {
    if (!isRecord(value) || !isNonEmptyString(value.yadNo) || !Array.isArray(value.points)) {
        return null;
    }
    return {
        facilityId: value.yadNo.trim(),
        points: value.points
            .map(normalizePoint)
            .filter((point): point is NormalizedPriceTrendPoint => point !== null)
    };
}

function normalizePoint(value: unknown): NormalizedPriceTrendPoint | null {
    if (
        !isRecord(value)
        || typeof value.leadTimeDays !== "number"
        || !Number.isInteger(value.leadTimeDays)
        || value.leadTimeDays < 0
        || !isNullableFiniteNumber(value.priceIncludingTax)
        || !isNullableString(value.date)
        || !isNullableString(value.status)
    ) {
        return null;
    }
    return {
        date: normalizeNullableString(value.date),
        leadTimeDays: value.leadTimeDays,
        price: value.priceIncludingTax,
        status: normalizeNullableString(value.status)
    };
}

function selectLatestRecordsByScope(
    records: readonly NormalizedPriceTrendRecord[]
): NormalizedPriceTrendRecord[] {
    const latest = new Map<string, NormalizedPriceTrendRecord>();
    for (const record of records) {
        const key = [
            record.guestCount,
            record.mealType,
            record.roomType ?? "unspecified"
        ].join("\u001f");
        const current = latest.get(key);
        if (current === undefined || current.fetchedAt < record.fetchedAt) {
            latest.set(key, record);
        }
    }
    return Array.from(latest.values()).sort((left, right) => (
        left.guestCount - right.guestCount
        || left.mealType.localeCompare(right.mealType)
        || (left.roomType ?? "").localeCompare(right.roomType ?? "")
    ));
}

function buildFilterOptions(records: readonly NormalizedPriceTrendRecord[]): {
    mealTypes: PriceTrendComparisonFilterOption[];
    roomTypes: PriceTrendComparisonFilterOption[];
} {
    const mealTypes = new Set<string>();
    const roomTypes = new Set<string>();
    for (const record of records) {
        mealTypes.add(record.mealType);
        if (record.roomType !== null) {
            roomTypes.add(record.roomType);
        }
    }
    return {
        mealTypes: Array.from(mealTypes)
            .map((value) => ({ label: formatPriceTrendComparisonMealType(value), value }))
            .sort(compareFilterOptions),
        roomTypes: Array.from(roomTypes)
            .map((value) => ({ label: formatPriceTrendComparisonRoomType(value), value }))
            .sort(compareFilterOptions)
    };
}

function normalizeFilters(
    filters: Partial<PriceTrendComparisonFilters> | undefined,
    available: PriceTrendComparisonViewModel["availableFilters"]
): PriceTrendComparisonFilters {
    return {
        mealType: available.mealTypes.some((option) => option.value === filters?.mealType)
            ? filters?.mealType ?? null
            : null,
        roomType: available.roomTypes.some((option) => option.value === filters?.roomType)
            ? filters?.roomType ?? null
            : null
    };
}

function selectRecordsForRoomType(
    records: readonly NormalizedPriceTrendRecord[],
    roomType: string | null
): { records: NormalizedPriceTrendRecord[]; usesSpecificRecords: boolean } {
    if (roomType !== null) {
        return {
            records: records.filter((record) => record.roomType === roomType),
            usesSpecificRecords: true
        };
    }
    const specificRecordsComplete = hasCompleteSpecificRoomTypeRecords(records);
    if (specificRecordsComplete) {
        return {
            records: records.filter((record) => record.roomType !== null),
            usesSpecificRecords: true
        };
    }
    const unspecified = records.filter((record) => record.roomType === null);
    return {
        records: unspecified.length > 0 ? unspecified : [...records],
        usesSpecificRecords: unspecified.length === 0
    };
}

function hasCompleteSpecificRoomTypeRecords(records: readonly NormalizedPriceTrendRecord[]): boolean {
    const keys = new Set(records
        .filter((record) => record.roomType !== null)
        .map((record) => `${record.guestCount}|${record.mealType}|${record.roomType}`));
    for (const roomType of EXPECTED_ROOM_TYPES) {
        for (const mealType of EXPECTED_MEAL_TYPES) {
            for (const guestCount of PRICE_TREND_COMPARISON_GUEST_COUNTS) {
                if (!keys.has(`${guestCount}|${mealType}|${roomType}`)) {
                    return false;
                }
            }
        }
    }
    return true;
}

function buildFacilities(
    records: readonly NormalizedPriceTrendRecord[]
): PriceTrendComparisonFacility[] {
    const facilities = new Map<string, NormalizedPriceTrendFacility>();
    for (const record of records) {
        for (const facility of record.facilities) {
            const current = facilities.get(facility.id);
            if (current === undefined || (!current.isOwn && facility.isOwn)) {
                facilities.set(facility.id, facility);
            }
        }
    }
    let competitorIndex = 0;
    return Array.from(facilities.values())
        .sort((left, right) => (
            Number(right.isOwn) - Number(left.isOwn)
            || left.label.localeCompare(right.label, "ja")
            || left.id.localeCompare(right.id)
        ))
        .map((facility) => ({
            color: facility.isOwn
                ? OWN_SERIES_COLOR
                : COMPETITOR_SERIES_COLORS[
                    competitorIndex++ % COMPETITOR_SERIES_COLORS.length
                ] ?? "#53677c",
            id: facility.id,
            isOwn: facility.isOwn,
            label: facility.label
        }));
}

function buildPointsByGuest(
    records: readonly NormalizedPriceTrendRecord[]
): Map<PriceTrendComparisonGuestCount, PriceTrendComparisonPoint[]> {
    const minima = new Map<PriceTrendComparisonGuestCount, Map<string, PriceTrendComparisonPoint>>(
        PRICE_TREND_COMPARISON_GUEST_COUNTS.map((guestCount) => [guestCount, new Map()])
    );
    for (const record of records) {
        const roomTypeLabel = record.roomTypeLabel
            ?? (record.roomType === null ? "指定なし" : formatPriceTrendComparisonRoomType(record.roomType));
        const guestMinima = minima.get(record.guestCount);
        if (guestMinima === undefined) {
            continue;
        }
        for (const series of record.series) {
            for (const point of series.points) {
                if (point.price === null || point.price < 0) {
                    continue;
                }
                const candidate: PriceTrendComparisonPoint = {
                    facilityId: series.facilityId,
                    leadTimeDays: point.leadTimeDays,
                    mealType: record.mealType,
                    observedDate: point.date,
                    price: point.price,
                    roomTypeLabel,
                    status: point.status
                };
                const key = `${series.facilityId}\u001f${point.leadTimeDays}`;
                const current = guestMinima.get(key);
                if (current === undefined || candidate.price < current.price) {
                    guestMinima.set(key, candidate);
                }
            }
        }
    }
    return new Map(PRICE_TREND_COMPARISON_GUEST_COUNTS.map((guestCount) => [
        guestCount,
        Array.from(minima.get(guestCount)?.values() ?? []).sort((left, right) => (
            right.leadTimeDays - left.leadTimeDays
            || left.facilityId.localeCompare(right.facilityId)
        ))
    ]));
}

function buildGuestComparison(
    guestCount: PriceTrendComparisonGuestCount,
    points: readonly PriceTrendComparisonPoint[],
    facilities: readonly PriceTrendComparisonFacility[]
): PriceTrendGuestComparison {
    const latestLeadTimeDays = points.reduce<number | null>((latest, point) => (
        latest === null || point.leadTimeDays < latest ? point.leadTimeDays : latest
    ), null);
    const currentPoints = latestLeadTimeDays === null
        ? []
        : points.filter((point) => point.leadTimeDays === latestLeadTimeDays);
    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    const ownPoint = currentPoints.find((point) => facilityById.get(point.facilityId)?.isOwn) ?? null;
    const competitorPoint = currentPoints
        .filter((point) => facilityById.get(point.facilityId)?.isOwn === false)
        .sort((left, right) => left.price - right.price)[0] ?? null;
    return {
        competitorLabel: competitorPoint === null
            ? null
            : facilityById.get(competitorPoint.facilityId)?.label ?? "競合施設",
        competitorMinPrice: competitorPoint?.price ?? null,
        gapFromCompetitor: ownPoint === null || competitorPoint === null
            ? null
            : ownPoint.price - competitorPoint.price,
        guestCount,
        latestLeadTimeDays,
        observedDate: ownPoint?.observedDate ?? competitorPoint?.observedDate ?? null,
        ownPrice: ownPoint?.price ?? null,
        points: [...points]
    };
}

function compareFilterOptions(
    left: PriceTrendComparisonFilterOption,
    right: PriceTrendComparisonFilterOption
): number {
    return left.label.localeCompare(right.label, "ja") || left.value.localeCompare(right.value);
}

function normalizeCompactDate(value: string): string {
    return value.trim().replaceAll("-", "");
}

function normalizeNullableString(value: string | null): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

function isGuestCount(value: unknown): value is PriceTrendComparisonGuestCount {
    return typeof value === "number"
        && PRICE_TREND_COMPARISON_GUEST_COUNTS.includes(value as PriceTrendComparisonGuestCount);
}

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
    return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
