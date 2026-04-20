import type { MonthlyBookingCurveSnapshotPayload, MonthlyBookingCurveSnapshotPoint } from "./monthlyProgressIndexedDb";
import { LEAD_TIME_BUCKET_TICKS, type LeadTimeBucketTick } from "./leadTimeBuckets";

export interface MonthlyProgressLeadTimePoint {
    tick: LeadTimeBucketTick;
    targetDateKey: string | null;
    leadTimeDays: number | null;
    thisYearValue: number | null;
    lastYearValue: number | null;
}

export interface MonthlyProgressLeadTimeSeries {
    yearMonth: string;
    anchorDateKey: string;
    observationDateKey: string;
    points: MonthlyProgressLeadTimePoint[];
}

export function getYearMonthBounds(yearMonth: string): { firstDateKey: string; lastDateKey: string } | null {
    if (!/^\d{6}$/.test(yearMonth)) {
        return null;
    }

    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4, 6));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    const firstDateKey = `${yearMonth}01`;
    const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
        firstDateKey,
        lastDateKey: `${yearMonth}${String(lastDate).padStart(2, "0")}`
    };
}

export function buildMonthlyProgressLeadTimeSeries(
    payload: MonthlyBookingCurveSnapshotPayload,
    metric: "sales" | "room",
    anchorDateKey: string,
    observationDateKey: string
): MonthlyProgressLeadTimeSeries {
    const sourcePoints = metric === "sales" ? payload.salesBased : payload.roomBased;
    const observationLeadDays = getDaysBetweenDateKeys(anchorDateKey, observationDateKey);
    const points = LEAD_TIME_BUCKET_TICKS.map((tick) => buildBucketedLeadTimePoint(sourcePoints, anchorDateKey, observationDateKey, observationLeadDays, tick));

    return {
        yearMonth: payload.yearMonth,
        anchorDateKey,
        observationDateKey,
        points
    };
}

export function summarizeMonthlyProgressLeadTimeSeries(series: MonthlyProgressLeadTimeSeries): {
    pointCount: number;
    nonNullThisYearCount: number;
    nonNullLastYearCount: number;
    actThisYearValue: number | null;
    actLastYearValue: number | null;
} {
    const actPoint = series.points.find((point) => point.tick === "ACT") ?? null;

    return {
        pointCount: series.points.length,
        nonNullThisYearCount: series.points.filter((point) => point.thisYearValue !== null).length,
        nonNullLastYearCount: series.points.filter((point) => point.lastYearValue !== null).length,
        actThisYearValue: actPoint?.thisYearValue ?? null,
        actLastYearValue: actPoint?.lastYearValue ?? null
    };
}

function buildBucketedLeadTimePoint(
    sourcePoints: MonthlyBookingCurveSnapshotPoint[],
    anchorDateKey: string,
    observationDateKey: string,
    observationLeadDays: number | null,
    tick: LeadTimeBucketTick
): MonthlyProgressLeadTimePoint {
    if (tick === "ACT") {
        return {
            tick,
            targetDateKey: observationDateKey,
            leadTimeDays: observationLeadDays,
            thisYearValue: resolveExactMetricAtDate(sourcePoints, observationDateKey, "thisYear"),
            lastYearValue: resolveExactMetricAtDate(sourcePoints, observationDateKey, "lastYear")
        };
    }

    const targetDateKey = shiftDate(anchorDateKey, -tick);
    if (targetDateKey === null) {
        return {
            tick,
            targetDateKey: null,
            leadTimeDays: tick,
            thisYearValue: null,
            lastYearValue: null
        };
    }

    if (observationLeadDays !== null && observationLeadDays > tick) {
        return {
            tick,
            targetDateKey,
            leadTimeDays: tick,
            thisYearValue: null,
            lastYearValue: null
        };
    }

    return {
        tick,
        targetDateKey,
        leadTimeDays: tick,
        thisYearValue: resolveMetricAtDate(sourcePoints, targetDateKey, "thisYear"),
        lastYearValue: resolveMetricAtDate(sourcePoints, targetDateKey, "lastYear")
    };
}

function resolveMetricAtDate(
    points: MonthlyBookingCurveSnapshotPoint[],
    lookupDateKey: string,
    variant: "thisYear" | "lastYear"
): number | null {
    let latestMatchedDate = "";
    let latestMatchedValue: number | null = null;

    for (const point of points) {
        const pointDateKey = point.date.replace(/-/g, "");
        const value = variant === "thisYear" ? point.thisYearSum : point.lastYearSum;
        if (pointDateKey > lookupDateKey || value === null) {
            continue;
        }

        if (pointDateKey >= latestMatchedDate) {
            latestMatchedDate = pointDateKey;
            latestMatchedValue = value;
        }
    }

    return latestMatchedValue;
}

function resolveExactMetricAtDate(
    points: MonthlyBookingCurveSnapshotPoint[],
    targetDateKey: string,
    variant: "thisYear" | "lastYear"
): number | null {
    for (const point of points) {
        if (point.date.replace(/-/g, "") !== targetDateKey) {
            continue;
        }

        return variant === "thisYear" ? point.thisYearSum : point.lastYearSum;
    }

    return null;
}

function shiftDate(dateKey: string, offsetDays: number): string | null {
    if (!/^\d{8}$/.test(dateKey)) {
        return null;
    }

    const year = Number(dateKey.slice(0, 4));
    const month = Number(dateKey.slice(4, 6));
    const day = Number(dateKey.slice(6, 8));
    const value = new Date(Date.UTC(year, month - 1, day));
    value.setUTCDate(value.getUTCDate() + offsetDays);
    return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
}

function getDaysBetweenDateKeys(laterDateKey: string, earlierDateKey: string): number | null {
    if (!/^\d{8}$/.test(laterDateKey) || !/^\d{8}$/.test(earlierDateKey)) {
        return null;
    }

    const laterYear = Number(laterDateKey.slice(0, 4));
    const laterMonth = Number(laterDateKey.slice(4, 6));
    const laterDay = Number(laterDateKey.slice(6, 8));
    const earlierYear = Number(earlierDateKey.slice(0, 4));
    const earlierMonth = Number(earlierDateKey.slice(4, 6));
    const earlierDay = Number(earlierDateKey.slice(6, 8));

    const laterDate = Date.UTC(laterYear, laterMonth - 1, laterDay);
    const earlierDate = Date.UTC(earlierYear, earlierMonth - 1, earlierDay);
    return Math.floor((laterDate - earlierDate) / 86400000);
}