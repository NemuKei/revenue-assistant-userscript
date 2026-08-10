import { LEAD_TIME_BUCKET_TICKS, type LeadTimeBucketTick } from "../../leadTimeBuckets";

export const NEXT_MONTHLY_PROGRESS_VISIBLE_MONTH_COUNT = 5;
export const NEXT_MONTHLY_PROGRESS_MONTH_COLORS = [
    "#1f5fbf",
    "#0f8f8f",
    "#c46b12",
    "#b84770",
    "#6f5bb5"
] as const;

export type NextMonthlyProgressCompareYearsAgo = 1 | 2 | 3;
export type NextMonthlyProgressSecondaryMetric = "unit-price" | "sales";
export type NextMonthlyProgressMetric = "room" | NextMonthlyProgressSecondaryMetric;
export type NextMonthlyProgressFixtureMode =
    | "loading"
    | "empty"
    | "current-only"
    | "compare-shortage"
    | "partial-failure";
export type NextMonthlyProgressDailyDiffDirection =
    | "increase"
    | "decrease"
    | "flat"
    | "unobserved";

export interface NextMonthlyProgressSnapshotPoint {
    date: string;
    thisYearSum: number | null;
    lastYearSum: number | null;
}

export interface NextMonthlyProgressSnapshotPayload {
    yearMonth: string;
    updatedAt: string | null;
    salesBased: NextMonthlyProgressSnapshotPoint[];
    roomBased: NextMonthlyProgressSnapshotPoint[];
}

export interface NextMonthlyProgressSnapshotRecord {
    recordKey: string;
    facilityId: string;
    yearMonth: string;
    batchDateKey: string;
    fetchedAt: string;
    endpoint: "/api/v1/booking_curve/monthly";
    query: string;
    schemaVersion: 1;
    source: "next-bounded-monthly-progress" | "classic-readonly-seed";
    payload: NextMonthlyProgressSnapshotPayload;
}

export type NextMonthlyProgressAcquisitionPhase =
    | "idle"
    | "loading-current"
    | "background"
    | "complete"
    | "stopped";

export interface NextMonthlyProgressAcquisitionProgress {
    phase: NextMonthlyProgressAcquisitionPhase;
    targetYearMonths: string[];
    processedCount: number;
    failedCount: number;
    currentYearMonth: string | null;
    networkRequestCount: number;
    nextRecordCount: number;
    classicSeedCount: number;
    stopReason: string | null;
}

export interface NextMonthlyProgressDataSnapshot {
    facilityId: string;
    facilityLabel: string;
    routeYearMonth: string;
    batchDateKey: string;
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo;
    records: NextMonthlyProgressSnapshotRecord[];
    progress: NextMonthlyProgressAcquisitionProgress;
}

export interface NextMonthlyProgressPreviewPoint {
    tick: LeadTimeBucketTick;
    currentValue: number | null;
    compareValue: number | null;
    currentDateKey: string | null;
    compareDateKey: string | null;
}

export interface NextMonthlyProgressDailyDiffItem {
    tick: LeadTimeBucketTick;
    dateKey: string | null;
    currentValue: number | null;
    previousValue: number | null;
    delta: number | null;
    direction: NextMonthlyProgressDailyDiffDirection;
    reason: string;
}

export interface NextMonthlyProgressFocusMonthPreview {
    yearMonth: string;
    label: string;
    compareLabel: string;
    color: string;
    roomPoints: NextMonthlyProgressPreviewPoint[];
    salesPoints: NextMonthlyProgressPreviewPoint[];
    unitPricePoints: NextMonthlyProgressPreviewPoint[];
    dailyDiffItems: NextMonthlyProgressDailyDiffItem[];
}

export interface NextMonthlyProgressViewModel {
    facilityId: string;
    facilityLabel: string;
    routeYearMonth: string;
    batchDateKey: string;
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo;
    compareLabel: string;
    secondaryMetric: NextMonthlyProgressSecondaryMetric;
    focusMonths: NextMonthlyProgressFocusMonthPreview[];
    statusSummary: string;
    emptyState: string | null;
    progress: NextMonthlyProgressAcquisitionProgress;
}

interface MonthlyProgressLeadTimePoint {
    tick: LeadTimeBucketTick;
    targetDateKey: string | null;
    thisYearValue: number | null;
    lastYearValue: number | null;
}

interface MonthlyProgressLeadTimeSeries {
    points: MonthlyProgressLeadTimePoint[];
}

export function normalizeNextMonthlyProgressYearMonth(value: string): string | null {
    const normalized = value.replace("-", "");
    if (!/^\d{6}$/u.test(normalized)) {
        return null;
    }
    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(4, 6));
    return Number.isInteger(year) && month >= 1 && month <= 12 ? normalized : null;
}

export function parseNextMonthlyProgressRoute(pathname: string): string | null {
    const match = /^\/monthly-progress\/(\d{4})-(\d{2})\/?$/u.exec(pathname.trim());
    return match === null
        ? null
        : normalizeNextMonthlyProgressYearMonth(`${match[1]}${match[2]}`);
}

export function shiftNextMonthlyProgressYearMonth(
    yearMonth: string,
    offsetMonths: number
): string | null {
    const normalized = normalizeNextMonthlyProgressYearMonth(yearMonth);
    if (normalized === null) {
        return null;
    }
    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(4, 6));
    const shifted = new Date(Date.UTC(year, month - 1 + offsetMonths, 1));
    return `${shifted.getUTCFullYear()}${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildNextMonthlyProgressFocusYearMonths(routeYearMonth: string): string[] {
    return Array.from({ length: NEXT_MONTHLY_PROGRESS_VISIBLE_MONTH_COUNT }, (_, index) => (
        shiftNextMonthlyProgressYearMonth(routeYearMonth, index)
    )).filter((value): value is string => value !== null);
}

export function buildNextMonthlyProgressTargetYearMonths(
    routeYearMonth: string,
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo
): string[] {
    const focusYearMonths = buildNextMonthlyProgressFocusYearMonths(routeYearMonth);
    const targets = new Set(focusYearMonths);
    if (compareYearsAgo > 1) {
        for (const focusYearMonth of focusYearMonths) {
            const comparisonSourceMonth = shiftNextMonthlyProgressYearMonth(
                focusYearMonth,
                -12 * (compareYearsAgo - 1)
            );
            if (comparisonSourceMonth !== null) {
                targets.add(comparisonSourceMonth);
            }
        }
    }
    return Array.from(targets);
}

export function compactNextMonthlyProgressResponse(
    value: unknown,
    expectedYearMonth: string
): NextMonthlyProgressSnapshotPayload | null {
    const normalizedExpected = normalizeNextMonthlyProgressYearMonth(expectedYearMonth);
    if (
        !isRecord(value)
        || normalizedExpected === null
        || !Array.isArray(value.sales_based)
        || !Array.isArray(value.room_based)
    ) {
        return null;
    }
    const responseYearMonth = typeof value.year_month === "string"
        ? normalizeNextMonthlyProgressYearMonth(value.year_month)
        : normalizedExpected;
    if (responseYearMonth !== normalizedExpected) {
        return null;
    }
    const updatedAt = value.updated_at === null || value.updated_at === undefined
        ? null
        : typeof value.updated_at === "string"
            ? value.updated_at
            : null;
    if (value.updated_at !== null && value.updated_at !== undefined && updatedAt === null) {
        return null;
    }
    return {
        yearMonth: normalizedExpected,
        updatedAt,
        salesBased: compactSnapshotPoints(value.sales_based),
        roomBased: compactSnapshotPoints(value.room_based)
    };
}

export function buildNextMonthlyProgressViewModel(options: {
    data: NextMonthlyProgressDataSnapshot;
    secondaryMetric: NextMonthlyProgressSecondaryMetric;
}): NextMonthlyProgressViewModel {
    const recordsByYearMonth = new Map<string, NextMonthlyProgressSnapshotRecord>();
    for (const record of options.data.records) {
        const previous = recordsByYearMonth.get(record.yearMonth);
        if (
            previous === undefined
            || (
                previous.source === "classic-readonly-seed"
                && record.source === "next-bounded-monthly-progress"
            )
            || (
                record.source === previous.source
                && record.fetchedAt > previous.fetchedAt
            )
        ) {
            recordsByYearMonth.set(record.yearMonth, record);
        }
    }

    const focusYearMonths = buildNextMonthlyProgressFocusYearMonths(options.data.routeYearMonth);
    const focusMonths = focusYearMonths.flatMap((focusYearMonth, index) => {
        const primaryRecord = recordsByYearMonth.get(focusYearMonth);
        if (primaryRecord === undefined) {
            return [];
        }
        const comparisonSourceMonth = options.data.compareYearsAgo === 1
            ? focusYearMonth
            : shiftNextMonthlyProgressYearMonth(
                focusYearMonth,
                -12 * (options.data.compareYearsAgo - 1)
            );
        const comparisonRecord = comparisonSourceMonth === null
            ? undefined
            : recordsByYearMonth.get(comparisonSourceMonth);
        return [buildFocusMonthPreview({
            batchDateKey: options.data.batchDateKey,
            color: NEXT_MONTHLY_PROGRESS_MONTH_COLORS[
                index % NEXT_MONTHLY_PROGRESS_MONTH_COLORS.length
            ] ?? NEXT_MONTHLY_PROGRESS_MONTH_COLORS[0],
            compareYearsAgo: options.data.compareYearsAgo,
            comparisonRecord,
            primaryRecord
        })];
    });

    const currentMonth = focusMonths.find(
        (month) => month.yearMonth === options.data.routeYearMonth
    ) ?? null;
    const comparisonShortageCount = focusMonths.filter((month) => (
        [...month.roomPoints, ...month.salesPoints].some((point) => point.compareValue === null)
    )).length;
    const currentStatus = currentMonth === null
        ? options.data.progress.phase === "stopped" || options.data.progress.failedCount > 0
            ? `${formatNextMonthlyProgressYearMonth(options.data.routeYearMonth)} 取得失敗`
            : options.data.progress.phase === "complete"
                ? `${formatNextMonthlyProgressYearMonth(options.data.routeYearMonth)} snapshotなし`
                : `${formatNextMonthlyProgressYearMonth(options.data.routeYearMonth)} 取得中`
        : comparisonShortageCount > 0
            ? `${currentMonth.label} 保存済み・比較不足あり`
            : `${currentMonth.label} 保存済み`;
    const displayStatus = `表示 ${focusMonths.length} / ${focusYearMonths.length}か月`;
    const backgroundStatus = formatProgressSummary(options.data.progress);
    const emptyState = currentMonth === null
        ? buildEmptyState(options.data.progress, options.data.routeYearMonth)
        : null;

    return {
        facilityId: options.data.facilityId,
        facilityLabel: options.data.facilityLabel,
        routeYearMonth: options.data.routeYearMonth,
        batchDateKey: options.data.batchDateKey,
        compareYearsAgo: options.data.compareYearsAgo,
        compareLabel: formatNextMonthlyProgressCompareLabel(options.data.routeYearMonth, options.data.compareYearsAgo),
        secondaryMetric: options.secondaryMetric,
        focusMonths,
        statusSummary: [currentStatus, displayStatus, backgroundStatus].join(" / "),
        emptyState,
        progress: options.data.progress
    };
}

export function buildNextMonthlyProgressDailyDiffItems(
    points: readonly NextMonthlyProgressPreviewPoint[]
): NextMonthlyProgressDailyDiffItem[] {
    let previousObservedValue: number | null = null;
    return points.map((point) => {
        if (point.currentValue === null) {
            return {
                tick: point.tick,
                dateKey: point.currentDateKey,
                currentValue: null,
                previousValue: previousObservedValue,
                delta: null,
                direction: "unobserved",
                reason: point.currentDateKey === null ? "対象日未解決" : "未観測"
            };
        }
        if (previousObservedValue === null) {
            previousObservedValue = point.currentValue;
            return {
                tick: point.tick,
                dateKey: point.currentDateKey,
                currentValue: point.currentValue,
                previousValue: null,
                delta: null,
                direction: "unobserved",
                reason: "比較前 bucket なし"
            };
        }
        const previousValue = previousObservedValue;
        const delta = point.currentValue - previousValue;
        previousObservedValue = point.currentValue;
        return {
            tick: point.tick,
            dateKey: point.currentDateKey,
            currentValue: point.currentValue,
            previousValue,
            delta,
            direction: delta > 0 ? "increase" : delta < 0 ? "decrease" : "flat",
            reason: "観測済み"
        };
    });
}

export function formatNextMonthlyProgressYearMonth(yearMonth: string): string {
    const normalized = normalizeNextMonthlyProgressYearMonth(yearMonth);
    return normalized === null
        ? yearMonth
        : `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}`;
}

export function formatNextMonthlyProgressCompareLabel(
    routeYearMonth: string,
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo
): string {
    const normalized = normalizeNextMonthlyProgressYearMonth(routeYearMonth);
    return normalized === null
        ? compareYearsAgo === 1 ? "前年" : compareYearsAgo === 2 ? "前々年" : "3年前"
        : String(Number(normalized.slice(0, 4)) - compareYearsAgo);
}

export function resolveNextMonthlyProgressPanelPoints(
    month: NextMonthlyProgressFocusMonthPreview,
    metric: NextMonthlyProgressMetric
): NextMonthlyProgressPreviewPoint[] {
    if (metric === "room") {
        return month.roomPoints;
    }
    return metric === "sales" ? month.salesPoints : month.unitPricePoints;
}

function buildFocusMonthPreview(options: {
    batchDateKey: string;
    color: string;
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo;
    comparisonRecord: NextMonthlyProgressSnapshotRecord | undefined;
    primaryRecord: NextMonthlyProgressSnapshotRecord;
}): NextMonthlyProgressFocusMonthPreview {
    const primaryBounds = getYearMonthBounds(options.primaryRecord.yearMonth);
    const comparisonBounds = options.comparisonRecord === undefined
        ? null
        : getYearMonthBounds(options.comparisonRecord.yearMonth);
    const primaryRoom = buildLeadTimeSeries(
        options.primaryRecord.payload,
        "room",
        primaryBounds?.lastDateKey ?? "",
        options.batchDateKey
    );
    const primarySales = buildLeadTimeSeries(
        options.primaryRecord.payload,
        "sales",
        primaryBounds?.lastDateKey ?? "",
        options.batchDateKey
    );
    const comparisonRoom = options.comparisonRecord === undefined || comparisonBounds === null
        ? null
        : buildLeadTimeSeries(
            options.comparisonRecord.payload,
            "room",
            comparisonBounds.lastDateKey,
            options.batchDateKey
        );
    const comparisonSales = options.comparisonRecord === undefined || comparisonBounds === null
        ? null
        : buildLeadTimeSeries(
            options.comparisonRecord.payload,
            "sales",
            comparisonBounds.lastDateKey,
            options.batchDateKey
        );
    const roomPoints = buildMetricPoints(
        primaryRoom,
        comparisonRoom,
        options.compareYearsAgo
    );
    const salesPoints = buildMetricPoints(
        primarySales,
        comparisonSales,
        options.compareYearsAgo
    );
    return {
        yearMonth: options.primaryRecord.yearMonth,
        label: formatNextMonthlyProgressYearMonth(options.primaryRecord.yearMonth),
        compareLabel: formatNextMonthlyProgressYearMonth(
            shiftNextMonthlyProgressYearMonth(
                options.primaryRecord.yearMonth,
                -12 * options.compareYearsAgo
            ) ?? options.primaryRecord.yearMonth
        ),
        color: options.color,
        roomPoints,
        salesPoints,
        unitPricePoints: salesPoints.map((salesPoint, index) => {
            const roomPoint = roomPoints[index];
            return {
                tick: salesPoint.tick,
                currentValue: divideNullable(salesPoint.currentValue, roomPoint?.currentValue ?? null),
                compareValue: divideNullable(salesPoint.compareValue, roomPoint?.compareValue ?? null),
                currentDateKey: salesPoint.currentDateKey,
                compareDateKey: salesPoint.compareDateKey
            };
        }),
        dailyDiffItems: buildNextMonthlyProgressDailyDiffItems(roomPoints)
    };
}

function buildMetricPoints(
    primarySeries: MonthlyProgressLeadTimeSeries,
    comparisonSeries: MonthlyProgressLeadTimeSeries | null,
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo
): NextMonthlyProgressPreviewPoint[] {
    return LEAD_TIME_BUCKET_TICKS.map((tick) => {
        const primaryPoint = primarySeries.points.find((point) => point.tick === tick);
        const comparisonPoint = comparisonSeries?.points.find((point) => point.tick === tick);
        const comparisonSourcePoint = compareYearsAgo === 1 ? primaryPoint : comparisonPoint;
        return {
            tick,
            currentValue: primaryPoint?.thisYearValue ?? null,
            compareValue: comparisonSourcePoint?.lastYearValue ?? null,
            currentDateKey: primaryPoint?.targetDateKey ?? null,
            compareDateKey: shiftDateByYears(
                comparisonSourcePoint?.targetDateKey ?? null,
                -1
            )
        };
    });
}

function buildLeadTimeSeries(
    payload: NextMonthlyProgressSnapshotPayload,
    metric: "sales" | "room",
    anchorDateKey: string,
    observationDateKey: string
): MonthlyProgressLeadTimeSeries {
    const sourcePoints = metric === "sales" ? payload.salesBased : payload.roomBased;
    const observationLeadDays = getDaysBetweenDateKeys(anchorDateKey, observationDateKey);
    return {
        points: LEAD_TIME_BUCKET_TICKS.map((tick) => {
            if (tick === "ACT") {
                return {
                    tick,
                    targetDateKey: anchorDateKey,
                    thisYearValue: observationDateKey >= anchorDateKey
                        ? resolveExactMetricAtDate(sourcePoints, anchorDateKey, "thisYear")
                        : null,
                    lastYearValue: resolveExactMetricAtDate(sourcePoints, anchorDateKey, "lastYear")
                };
            }
            const targetDateKey = shiftDate(anchorDateKey, -tick);
            return {
                tick,
                targetDateKey,
                thisYearValue: targetDateKey === null
                    || observationLeadDays === null
                    || observationLeadDays > tick
                    ? null
                    : resolveMetricAtDate(sourcePoints, targetDateKey, "thisYear"),
                lastYearValue: targetDateKey === null
                    ? null
                    : resolveMetricAtDate(sourcePoints, targetDateKey, "lastYear")
            };
        })
    };
}

function compactSnapshotPoints(value: unknown): NextMonthlyProgressSnapshotPoint[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        if (!isRecord(item) || typeof item.date !== "string") {
            return [];
        }
        const date = normalizeDateKey(item.date);
        if (date === null) {
            return [];
        }
        const thisYearSum = normalizeNullableNumber(item.this_year_sum);
        const lastYearSum = normalizeNullableNumber(item.last_year_sum);
        if (thisYearSum === undefined || lastYearSum === undefined) {
            return [];
        }
        return [{ date, thisYearSum, lastYearSum }];
    });
}

function normalizeNullableNumber(value: unknown): number | null | undefined {
    return value === null || value === undefined
        ? null
        : typeof value === "number" && Number.isFinite(value)
            ? value
            : undefined;
}

function normalizeDateKey(value: string): string | null {
    const compact = value.replaceAll("-", "");
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

function getYearMonthBounds(yearMonth: string): { firstDateKey: string; lastDateKey: string } | null {
    const normalized = normalizeNextMonthlyProgressYearMonth(yearMonth);
    if (normalized === null) {
        return null;
    }
    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(4, 6));
    return {
        firstDateKey: `${normalized}01`,
        lastDateKey: `${normalized}${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`
    };
}

function resolveMetricAtDate(
    points: readonly NextMonthlyProgressSnapshotPoint[],
    lookupDateKey: string,
    variant: "thisYear" | "lastYear"
): number | null {
    let latestMatchedDate = "";
    let latestMatchedValue: number | null = null;
    for (const point of points) {
        const value = variant === "thisYear" ? point.thisYearSum : point.lastYearSum;
        if (point.date > lookupDateKey || value === null || point.date < latestMatchedDate) {
            continue;
        }
        latestMatchedDate = point.date;
        latestMatchedValue = value;
    }
    return latestMatchedValue;
}

function resolveExactMetricAtDate(
    points: readonly NextMonthlyProgressSnapshotPoint[],
    targetDateKey: string,
    variant: "thisYear" | "lastYear"
): number | null {
    const point = points.find((item) => item.date === targetDateKey);
    return point === undefined
        ? null
        : variant === "thisYear" ? point.thisYearSum : point.lastYearSum;
}

function shiftDate(dateKey: string, offsetDays: number): string | null {
    const normalized = normalizeDateKey(dateKey);
    if (normalized === null) {
        return null;
    }
    const value = new Date(Date.UTC(
        Number(normalized.slice(0, 4)),
        Number(normalized.slice(4, 6)) - 1,
        Number(normalized.slice(6, 8))
    ));
    value.setUTCDate(value.getUTCDate() + offsetDays);
    return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
}

function shiftDateByYears(dateKey: string | null, offsetYears: number): string | null {
    if (dateKey === null) {
        return null;
    }
    const normalized = normalizeDateKey(dateKey);
    if (normalized === null) {
        return null;
    }
    const year = Number(normalized.slice(0, 4)) + offsetYears;
    const month = Number(normalized.slice(4, 6));
    const day = Number(normalized.slice(6, 8));
    const maximumDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}${String(month).padStart(2, "0")}${String(Math.min(day, maximumDay)).padStart(2, "0")}`;
}

function getDaysBetweenDateKeys(laterDateKey: string, earlierDateKey: string): number | null {
    const later = normalizeDateKey(laterDateKey);
    const earlier = normalizeDateKey(earlierDateKey);
    if (later === null || earlier === null) {
        return null;
    }
    const laterTime = Date.UTC(
        Number(later.slice(0, 4)),
        Number(later.slice(4, 6)) - 1,
        Number(later.slice(6, 8))
    );
    const earlierTime = Date.UTC(
        Number(earlier.slice(0, 4)),
        Number(earlier.slice(4, 6)) - 1,
        Number(earlier.slice(6, 8))
    );
    return Math.floor((laterTime - earlierTime) / 86_400_000);
}

function divideNullable(numerator: number | null, denominator: number | null): number | null {
    return numerator === null || denominator === null || denominator <= 0
        ? null
        : numerator / denominator;
}

function formatProgressSummary(progress: NextMonthlyProgressAcquisitionProgress): string {
    if (progress.phase === "loading-current") {
        return "現在月を取得中";
    }
    if (progress.phase === "idle") {
        return "background 待機中";
    }
    const current = progress.currentYearMonth === null
        ? "-"
        : formatNextMonthlyProgressYearMonth(progress.currentYearMonth);
    if (progress.phase === "background") {
        return `background 取得中 ${progress.processedCount} / ${progress.targetYearMonths.length}・現在 ${current}・失敗 ${progress.failedCount}`;
    }
    if (progress.phase === "stopped") {
        return `background 停止 ${progress.processedCount} / ${progress.targetYearMonths.length}・失敗 ${progress.failedCount}`;
    }
    return `background 完了 ${progress.processedCount} / ${progress.targetYearMonths.length}・失敗 ${progress.failedCount}`;
}

function buildEmptyState(
    progress: NextMonthlyProgressAcquisitionProgress,
    routeYearMonth: string
): string {
    const label = formatNextMonthlyProgressYearMonth(routeYearMonth);
    if (progress.phase === "stopped") {
        if (progress.stopReason === "http-401") {
            return `${label} を取得できませんでした。Revenue Assistantへ再ログインして再表示してください。`;
        }
        if (progress.stopReason === "http-403") {
            return `${label} を取得できませんでした。月次実績の閲覧権限を確認してください。`;
        }
        if (progress.stopReason === "http-429") {
            return `${label} の取得が制限されました。時間を置いてから再表示してください。`;
        }
        return `${label} のsnapshotを取得できませんでした。通信状態を確認して再表示してください。`;
    }
    if (progress.phase === "complete" && progress.failedCount > 0) {
        return `${label} のsnapshot取得に失敗しました。標準chartはそのまま利用できます。`;
    }
    if (progress.phase === "complete") {
        return `${label} に利用できるsnapshotがありません。標準chartはそのまま利用できます。`;
    }
    return `${label} のsnapshotを取得中です。標準chartはそのまま利用できます。`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
