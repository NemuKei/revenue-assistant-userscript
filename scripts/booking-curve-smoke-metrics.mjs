export const BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";

const BOOKING_CURVE_THROUGHPUT_MIN_REQUESTS = 5;
const BOOKING_CURVE_MIN_AVERAGE_STARTS_PER_SECOND = 1;
const BOOKING_CURVE_UNSAFE_MIN_START_INTERVAL_MS = 300;
const BOOKING_CURVE_MAX_EXPECTED_CONCURRENCY = 3;

export function getBookingCurveRequestSource(headers) {
    const source = getHeaderValue(headers, "x-rau-request");
    return source === "booking-curve" ? "rau-warm-cache" : "page";
}

export function summarizeBookingCurveRequests(entries) {
    return {
        ...summarizeBookingCurveRequestGroup("booking curve", entries),
        ...summarizeBookingCurveRequestGroup("RAU warm cache", entries.filter((entry) => entry.source === "rau-warm-cache"))
    };
}

export function assessBookingCurveThroughputFailures(metrics) {
    const bookingCurveRequestCount = Number(metrics["RAU warm cache request count"]);
    const bookingCurveHttpErrorCount = Number(metrics["RAU warm cache HTTP error count"]);
    const bookingCurveAverageStartsPerSecond = Number(metrics["RAU warm cache average starts per second"]);
    const bookingCurveMinStartIntervalMs = Number(metrics["RAU warm cache min start interval ms"]);
    const bookingCurveMaxConcurrentRequests = Number(metrics["RAU warm cache max concurrent requests"]);
    const bookingCurveHasEnoughRequests = Number.isFinite(bookingCurveRequestCount)
        && bookingCurveRequestCount >= BOOKING_CURVE_THROUGHPUT_MIN_REQUESTS;
    if (!bookingCurveHasEnoughRequests) {
        return [];
    }
    return [
        bookingCurveHttpErrorCount === 0 ? null : `RAU warm cache HTTP error count must be 0, got ${bookingCurveHttpErrorCount}`,
        Number.isFinite(bookingCurveAverageStartsPerSecond) && bookingCurveAverageStartsPerSecond >= BOOKING_CURVE_MIN_AVERAGE_STARTS_PER_SECOND
            ? null
            : `RAU warm cache average starts per second must be at least ${BOOKING_CURVE_MIN_AVERAGE_STARTS_PER_SECOND} when request count is ${bookingCurveRequestCount}, got ${metrics["RAU warm cache average starts per second"]}`,
        Number.isFinite(bookingCurveMinStartIntervalMs) && bookingCurveMinStartIntervalMs >= BOOKING_CURVE_UNSAFE_MIN_START_INTERVAL_MS
            ? null
            : `RAU warm cache min start interval must be at least ${BOOKING_CURVE_UNSAFE_MIN_START_INTERVAL_MS}ms when request count is ${bookingCurveRequestCount}, got ${metrics["RAU warm cache min start interval ms"]}`,
        Number.isFinite(bookingCurveMaxConcurrentRequests) && bookingCurveMaxConcurrentRequests <= BOOKING_CURVE_MAX_EXPECTED_CONCURRENCY
            ? null
            : `RAU warm cache max concurrent requests must be at most ${BOOKING_CURVE_MAX_EXPECTED_CONCURRENCY}, got ${metrics["RAU warm cache max concurrent requests"]}`
    ].filter((failure) => failure !== null);
}

function summarizeBookingCurveRequestGroup(prefix, entries) {
    const sortedEntries = entries.slice().sort((left, right) => left.startedAtMs - right.startedAtMs);
    const statuses = new Map();
    for (const entry of sortedEntries) {
        const statusKey = entry.failed ? "failed" : entry.status === null ? "pending" : String(entry.status);
        statuses.set(statusKey, (statuses.get(statusKey) ?? 0) + 1);
    }
    const intervals = [];
    for (let index = 1; index < sortedEntries.length; index += 1) {
        intervals.push(sortedEntries[index].startedAtMs - sortedEntries[index - 1].startedAtMs);
    }
    const observedSpanMs = sortedEntries.length >= 2
        ? sortedEntries[sortedEntries.length - 1].startedAtMs - sortedEntries[0].startedAtMs
        : 0;
    const averageStartsPerSecond = observedSpanMs > 0
        ? sortedEntries.length / (observedSpanMs / 1000)
        : 0;
    const maxConcurrent = sortedEntries.reduce((max, entry) => Math.max(max, entry.maxConcurrentAtStart), 0);
    const hasEnoughRequests = sortedEntries.length >= BOOKING_CURVE_THROUGHPUT_MIN_REQUESTS;
    const httpErrorCount = sortedEntries.filter((entry) => entry.failed || (entry.status !== null && entry.status >= 400)).length;
    const fallbackReason = hasEnoughRequests
        ? "none"
        : `${prefix} request count ${sortedEntries.length} is below ${BOOKING_CURVE_THROUGHPUT_MIN_REQUESTS}; cache may already be warm, no monthly priority fetch was active, or no RAU-tagged request was observed`;

    return {
        [`${prefix} request count`]: sortedEntries.length,
        [`${prefix} status counts`]: formatStatusCounts(statuses),
        [`${prefix} HTTP error count`]: httpErrorCount,
        [`${prefix} average starts per second`]: averageStartsPerSecond.toFixed(2),
        [`${prefix} min start interval ms`]: intervals.length === 0 ? "n/a" : Math.min(...intervals),
        [`${prefix} max concurrent requests`]: maxConcurrent,
        [`${prefix} throughput fallback reason`]: fallbackReason
    };
}

function getHeaderValue(headers, name) {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers ?? {})) {
        if (key.toLowerCase() === lowerName) {
            return Array.isArray(value) ? String(value[0] ?? "") : String(value);
        }
    }
    return "";
}

function formatStatusCounts(statuses) {
    if (statuses.size === 0) {
        return "none";
    }
    return Array.from(statuses.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => `${status}=${count}`)
        .join(",");
}
