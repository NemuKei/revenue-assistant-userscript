import {
    getDaysBetweenDateKeys,
    normalizeDateKey,
    toCompactDateKey
} from "../../curveCore";
import type { BookingCurveReferenceScope } from "./bookingCurveReferenceDataSource";

export interface BookingCurveRankStatusEvent {
    afterRankName: string | null;
    beforeRankName: string | null;
    daysBeforeStay: number;
    reflectedAt: string;
    reflectedDate: string;
    roomGroupId: string;
    signature: string;
    stayDate: string;
}

export interface BookingCurveRankStatusSnapshot {
    events: readonly BookingCurveRankStatusEvent[];
    invalidEventCount: number;
    stayDate: string;
}

export type BookingCurveRankHistoryViewState =
    | { status: "scope-required" }
    | { status: "loading" }
    | {
        status: "ready";
        events: readonly BookingCurveRankStatusEvent[];
        invalidEventCount: number;
    }
    | { status: "empty"; invalidEventCount: number }
    | {
        status: "error";
        reason: "aborted" | "request-failed" | "response-invalid" | "stay-date-invalid";
    };

interface ParsedRankEvent extends BookingCurveRankStatusEvent {
    sortValue: number;
}

const JST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
});

export function parseBookingCurveRankStatusResponse(
    payload: unknown,
    stayDate: string
): BookingCurveRankStatusSnapshot | null {
    const normalizedStayDate = normalizeDateKey(stayDate);
    const compactStayDate = toCompactDateKey(stayDate);
    if (
        normalizedStayDate === null
        || compactStayDate === null
        || !isRecord(payload)
        || !Array.isArray(payload.suggest_statuses)
    ) {
        return null;
    }

    let invalidEventCount = 0;
    const parsedEvents: ParsedRankEvent[] = [];
    for (const value of payload.suggest_statuses) {
        const parsed = parseRankEvent(value, normalizedStayDate, compactStayDate);
        if (parsed === "ignored") {
            continue;
        }
        if (parsed === null) {
            invalidEventCount += 1;
            continue;
        }
        parsedEvents.push(parsed);
    }

    parsedEvents.sort((left, right) => right.sortValue - left.sortValue);
    const seenRoomDay = new Set<string>();
    const events: BookingCurveRankStatusEvent[] = [];
    for (const parsed of parsedEvents) {
        const dailyKey = `${parsed.roomGroupId}:${parsed.reflectedDate}`;
        if (seenRoomDay.has(dailyKey)) {
            continue;
        }
        seenRoomDay.add(dailyKey);
        events.push({
            afterRankName: parsed.afterRankName,
            beforeRankName: parsed.beforeRankName,
            daysBeforeStay: parsed.daysBeforeStay,
            reflectedAt: parsed.reflectedAt,
            reflectedDate: parsed.reflectedDate,
            roomGroupId: parsed.roomGroupId,
            signature: parsed.signature,
            stayDate: parsed.stayDate
        });
    }
    events.sort((left, right) => (
        right.daysBeforeStay - left.daysBeforeStay
        || left.roomGroupId.localeCompare(right.roomGroupId)
        || left.signature.localeCompare(right.signature)
    ));

    return {
        events,
        invalidEventCount,
        stayDate: compactStayDate
    };
}

export function buildBookingCurveRankHistoryViewState(
    snapshot: BookingCurveRankStatusSnapshot,
    scope: BookingCurveReferenceScope
): BookingCurveRankHistoryViewState {
    if (scope.kind !== "roomGroup" || scope.roomGroupId === null) {
        return { status: "scope-required" };
    }
    const events = snapshot.events.filter((event) => event.roomGroupId === scope.roomGroupId);
    return events.length === 0
        ? { status: "empty", invalidEventCount: snapshot.invalidEventCount }
        : {
            status: "ready",
            events,
            invalidEventCount: snapshot.invalidEventCount
        };
}

function parseRankEvent(
    value: unknown,
    normalizedStayDate: string,
    compactStayDate: string
): ParsedRankEvent | "ignored" | null {
    if (!isRecord(value)) {
        return null;
    }
    const eventStayDate = toCompactDateKey(typeof value.date === "string" ? value.date : "");
    if (eventStayDate !== compactStayDate) {
        return null;
    }
    const roomGroupId = typeof value.rm_room_group_id === "string"
        ? value.rm_room_group_id.trim()
        : "";
    if (roomGroupId === "") {
        return null;
    }
    const timestamp = resolveStatusTimestamp(value);
    if (timestamp === null) {
        return null;
    }
    const reflectedDate = formatJstDate(timestamp.sortValue);
    if (reflectedDate === null) {
        return null;
    }
    const daysBeforeStay = getDaysBetweenDateKeys(normalizedStayDate, reflectedDate);
    if (daysBeforeStay === null || daysBeforeStay < 0 || daysBeforeStay > 360) {
        return null;
    }
    const beforeRank = readOptionalRankName(value, "before_price_rank_name");
    const afterRank = readOptionalRankName(value, "after_price_rank_name");
    if (!beforeRank.valid || !afterRank.valid) {
        return null;
    }
    if (beforeRank.value === null && afterRank.value === null) {
        return "ignored";
    }
    return {
        afterRankName: afterRank.value,
        beforeRankName: beforeRank.value,
        daysBeforeStay,
        reflectedAt: timestamp.value,
        reflectedDate,
        roomGroupId,
        signature: [
            reflectedDate,
            beforeRank.value ?? "-",
            afterRank.value ?? "-"
        ].join(":"),
        sortValue: timestamp.sortValue,
        stayDate: compactStayDate
    };
}

function resolveStatusTimestamp(
    value: Record<string, unknown>
): { sortValue: number; value: string } | null {
    for (const key of ["accepted_at", "completed_at", "suggest_calc_datetime"] as const) {
        const candidate = value[key];
        if (candidate === null || candidate === undefined || candidate === "") {
            continue;
        }
        if (typeof candidate !== "string") {
            return null;
        }
        const sortValue = Date.parse(candidate);
        if (!Number.isFinite(sortValue)) {
            return null;
        }
        return { sortValue, value: candidate };
    }
    return null;
}

function readOptionalRankName(
    value: Record<string, unknown>,
    key: "after_price_rank_name" | "before_price_rank_name"
): { valid: boolean; value: string | null } {
    const candidate = value[key];
    if (candidate === null || candidate === undefined) {
        return { valid: true, value: null };
    }
    if (typeof candidate !== "string") {
        return { valid: false, value: null };
    }
    const normalized = candidate.trim();
    return { valid: true, value: normalized === "" ? null : normalized };
}

function formatJstDate(timestamp: number): string | null {
    const parts = JST_DATE_FORMATTER.formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year === undefined || month === undefined || day === undefined
        ? null
        : normalizeDateKey(`${year}-${month}-${day}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
