import { LEAD_TIME_BUCKET_TICKS } from "../../leadTimeBuckets";
import type {
    NextMonthlyProgressDataLoadResult,
    NextMonthlyProgressDataSource
} from "./monthlyProgressDataSource";
import {
    buildNextMonthlyProgressTargetYearMonths,
    normalizeNextMonthlyProgressYearMonth,
    type NextMonthlyProgressCompareYearsAgo,
    type NextMonthlyProgressDataSnapshot,
    type NextMonthlyProgressFixtureMode,
    type NextMonthlyProgressSnapshotPayload,
    type NextMonthlyProgressSnapshotRecord
} from "./monthlyProgressModel";
import {
    createNextMonthlyProgressSnapshotRecord
} from "./monthlyProgressStore";

export type NextMonthlyProgressDevFixtureMode = NextMonthlyProgressFixtureMode | "ready";

export function createNextMonthlyProgressFixtureDataSource(options: {
    batchDateKey?: string;
    facilityId?: string;
    facilityLabel?: string;
    mode: NextMonthlyProgressDevFixtureMode;
}): NextMonthlyProgressDataSource {
    const batchDateKey = options.batchDateKey ?? "20260810";
    const facilityId = options.facilityId ?? "yad:fixture";
    const facilityLabel = options.facilityLabel ?? "施設A（mock）";
    const listeners = new Set<() => void>();
    let current: NextMonthlyProgressDataSnapshot | null = null;
    let stopped = false;

    return {
        cancel() {},
        async load(routeYearMonth, requestedBatchDateKey, compareYearsAgo) {
            if (stopped) {
                return { status: "error", reason: "stopped" };
            }
            const normalized = normalizeNextMonthlyProgressYearMonth(routeYearMonth);
            if (normalized === null) {
                return { status: "error", reason: "year-month-invalid" };
            }
            current = buildFixtureSnapshot({
                batchDateKey: requestedBatchDateKey || batchDateKey,
                compareYearsAgo,
                facilityId,
                facilityLabel,
                mode: options.mode,
                routeYearMonth: normalized
            });
            listeners.forEach((listener) => listener());
            return { status: "ready", snapshot: current } satisfies NextMonthlyProgressDataLoadResult;
        },
        reset() {
            current = null;
        },
        snapshot() {
            return current;
        },
        stop() {
            stopped = true;
            current = null;
            listeners.clear();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
}

function buildFixtureSnapshot(options: {
    batchDateKey: string;
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo;
    facilityId: string;
    facilityLabel: string;
    mode: NextMonthlyProgressDevFixtureMode;
    routeYearMonth: string;
}): NextMonthlyProgressDataSnapshot {
    const targetYearMonths = buildNextMonthlyProgressTargetYearMonths(
        options.routeYearMonth,
        options.compareYearsAgo
    );
    const records = options.mode === "loading" || options.mode === "empty"
        ? []
        : targetYearMonths.flatMap((yearMonth, index) => {
            if (options.mode === "current-only" && yearMonth !== options.routeYearMonth) {
                return [];
            }
            if (options.mode === "partial-failure" && index % 4 === 2) {
                return [];
            }
            return [createFixtureRecord({
                ...options,
                index,
                partialCompare: options.mode === "compare-shortage",
                yearMonth
            })];
        });
    const failedCount = options.mode === "partial-failure"
        ? targetYearMonths.filter((_, index) => index % 4 === 2).length
        : 0;
    return {
        facilityId: options.facilityId,
        facilityLabel: options.facilityLabel,
        routeYearMonth: options.routeYearMonth,
        batchDateKey: options.batchDateKey,
        compareYearsAgo: options.compareYearsAgo,
        records,
        progress: {
            phase: options.mode === "loading"
                ? "loading-current"
                : options.mode === "current-only" ? "background" : "complete",
            targetYearMonths,
            processedCount: options.mode === "loading"
                ? 0
                : options.mode === "current-only" ? 1 : targetYearMonths.length,
            failedCount,
            currentYearMonth: options.mode === "current-only"
                ? targetYearMonths.find((yearMonth) => yearMonth !== options.routeYearMonth) ?? null
                : null,
            networkRequestCount: 0,
            nextRecordCount: records.length,
            classicSeedCount: 0,
            stopReason: null
        }
    };
}

function createFixtureRecord(options: {
    batchDateKey: string;
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo;
    facilityId: string;
    index: number;
    mode: NextMonthlyProgressDevFixtureMode;
    partialCompare: boolean;
    routeYearMonth: string;
    yearMonth: string;
}): NextMonthlyProgressSnapshotRecord {
    return createNextMonthlyProgressSnapshotRecord({
        facilityId: options.facilityId,
        yearMonth: options.yearMonth,
        batchDateKey: options.batchDateKey,
        fetchedAt: "2026-08-10T03:00:00.000Z",
        payload: createFixturePayload(options)
    });
}

function createFixturePayload(options: {
    index: number;
    mode: NextMonthlyProgressDevFixtureMode;
    partialCompare: boolean;
    yearMonth: string;
}): NextMonthlyProgressSnapshotPayload {
    const anchorDateKey = getMonthEndDateKey(options.yearMonth);
    const roomBase = Math.max(34, 104 - ((options.index % 5) * 9));
    const salesBase = roomBase * (12_600 + ((options.index % 5) * 430));
    return {
        yearMonth: options.yearMonth,
        updatedAt: "2026-08-10T12:00:00+09:00",
        roomBased: buildFixturePoints(anchorDateKey, roomBase, options),
        salesBased: buildFixturePoints(anchorDateKey, salesBase, options)
    };
}

function buildFixturePoints(
    anchorDateKey: string,
    baseValue: number,
    options: {
        mode: NextMonthlyProgressDevFixtureMode;
        partialCompare: boolean;
    }
): NextMonthlyProgressSnapshotPayload["roomBased"] {
    let previousValue = 0;
    return LEAD_TIME_BUCKET_TICKS.map((tick, index) => {
        const leadDays = tick === "ACT" ? 0 : tick;
        const date = shiftDate(anchorDateKey, -leadDays);
        const progress = 1 - (leadDays / 390);
        const baseline = Math.max(0, Math.round(baseValue * Math.max(0, progress)));
        const thisYearSum = index === 27
            ? Math.max(0, previousValue - Math.max(1, Math.round(baseValue * 0.05)))
            : index === 33 ? previousValue : baseline;
        previousValue = thisYearSum;
        const lastYearSum = options.mode === "current-only"
            || options.partialCompare
            ? null
            : Math.max(0, Math.round(thisYearSum * 0.91));
        return { date, thisYearSum, lastYearSum };
    });
}

function getMonthEndDateKey(yearMonth: string): string {
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4, 6));
    return `${yearMonth}${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

function shiftDate(dateKey: string, offsetDays: number): string {
    const date = new Date(Date.UTC(
        Number(dateKey.slice(0, 4)),
        Number(dateKey.slice(4, 6)) - 1,
        Number(dateKey.slice(6, 8))
    ));
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}
