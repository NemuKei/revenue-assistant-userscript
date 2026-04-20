import type { MonthlyBookingCurveSnapshotPayload, MonthlyBookingCurveSnapshotPoint } from "./monthlyProgressIndexedDb";

export interface MonthlyProgressLeadTimePoint {
    reservationDate: string;
    leadTimeDays: number;
    thisYearValue: number | null;
    lastYearValue: number | null;
}

export interface MonthlyProgressLeadTimeSeries {
    yearMonth: string;
    anchorDateKey: string;
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
    anchorDateKey: string
): MonthlyProgressLeadTimeSeries {
    const sourcePoints = metric === "sales" ? payload.salesBased : payload.roomBased;
    const points = sourcePoints
        .map((point) => buildLeadTimePoint(point, anchorDateKey))
        .filter((point): point is MonthlyProgressLeadTimePoint => point !== null)
        .sort((left, right) => right.leadTimeDays - left.leadTimeDays || left.reservationDate.localeCompare(right.reservationDate));

    return {
        yearMonth: payload.yearMonth,
        anchorDateKey,
        points
    };
}

export function summarizeMonthlyProgressLeadTimeSeries(series: MonthlyProgressLeadTimeSeries): {
    pointCount: number;
    maxLeadTimeDays: number | null;
    minLeadTimeDays: number | null;
    latestThisYearValue: number | null;
    latestLastYearValue: number | null;
} {
    const firstPoint = series.points[0] ?? null;
    const lastPoint = series.points.at(-1) ?? null;

    return {
        pointCount: series.points.length,
        maxLeadTimeDays: firstPoint?.leadTimeDays ?? null,
        minLeadTimeDays: lastPoint?.leadTimeDays ?? null,
        latestThisYearValue: lastPoint?.thisYearValue ?? null,
        latestLastYearValue: lastPoint?.lastYearValue ?? null
    };
}

function buildLeadTimePoint(
    point: MonthlyBookingCurveSnapshotPoint,
    anchorDateKey: string
): MonthlyProgressLeadTimePoint | null {
    const reservationDateKey = point.date.replace(/-/g, "");
    const leadTimeDays = getDaysBetweenDateKeys(anchorDateKey, reservationDateKey);
    if (leadTimeDays === null) {
        return null;
    }

    return {
        reservationDate: point.date,
        leadTimeDays,
        thisYearValue: point.thisYearSum,
        lastYearValue: point.lastYearSum
    };
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