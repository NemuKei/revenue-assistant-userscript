import {
    getDaysBetweenDateKeys,
    normalizeDateKey,
    shiftDate,
    type BookingCurveApiPoint,
    type BookingCurveApiResponse,
    type ReferenceCurveResult
} from "../../curveCore";
import type { BookingCurveRankOrderEntry } from "./bookingCurveRankOrderModel";
import type { BookingCurveRankStatusEvent } from "./bookingCurveRankMarkerModel";

export type BookingCurveAdjustmentDirection = "raise" | "lower" | "unchanged" | "unresolved";
export type BookingCurveAdjustmentInterpretation =
    | "direction-unresolved"
    | "pace-down"
    | "pace-up"
    | "reference-below"
    | "restrained-with-buffer"
    | "unchanged"
    | "variation-small";
export type BookingCurveAdjustmentWindowMissingReason =
    | "event-after-observation"
    | "lead-time-out-of-range"
    | "post-observation-missing";
export type BookingCurveAdjustmentReferenceMissingReason =
    | "current-end-missing"
    | "current-start-missing"
    | "reference-end-missing"
    | "reference-start-missing";

export interface BookingCurveAdjustmentEvaluationWindow {
    endDate: string | null;
    endLeadDays: number | null;
    event: BookingCurveRankStatusEvent;
    missingReason: BookingCurveAdjustmentWindowMissingReason | null;
    startDate: string;
    startLeadDays: number;
}

export type BookingCurveAdjustmentReferenceResponse =
    | {
        status: "ready";
        endGapRooms: number;
        gapChangeRooms: number;
        interpretation: BookingCurveAdjustmentInterpretation;
        referenceId: "recent" | "seasonal";
        referenceLabel: string;
        startGapRooms: number;
    }
    | {
        status: "pending";
        missingReason: BookingCurveAdjustmentReferenceMissingReason;
        referenceId: "recent" | "seasonal";
        referenceLabel: string;
    };

export type BookingCurveAdjustmentResponse =
    | {
        status: "ready";
        afterRankName: string | null;
        beforeRankName: string | null;
        direction: BookingCurveAdjustmentDirection;
        endDate: string;
        endLeadDays: number;
        references: readonly BookingCurveAdjustmentReferenceResponse[];
        signature: string;
        startDate: string;
        startLeadDays: number;
    }
    | {
        status: "pending";
        afterRankName: string | null;
        beforeRankName: string | null;
        direction: BookingCurveAdjustmentDirection;
        endDate: string | null;
        endLeadDays: number | null;
        missingReason: BookingCurveAdjustmentWindowMissingReason;
        references: readonly [];
        signature: string;
        startDate: string;
        startLeadDays: number;
    };

export function buildBookingCurveAdjustmentEvaluationWindows(options: {
    asOfDate: string;
    events: readonly BookingCurveRankStatusEvent[];
    stayDate: string;
}): BookingCurveAdjustmentEvaluationWindow[] {
    const stayDate = normalizeDateKey(options.stayDate);
    const asOfDate = normalizeDateKey(options.asOfDate);
    if (stayDate === null || asOfDate === null) {
        return [];
    }
    const latestComparableDate = asOfDate < stayDate ? asOfDate : stayDate;
    const events = [...options.events].sort((left, right) => (
        left.reflectedDate.localeCompare(right.reflectedDate)
        || left.reflectedAt.localeCompare(right.reflectedAt)
        || left.signature.localeCompare(right.signature)
    ));

    return events.map((event, index): BookingCurveAdjustmentEvaluationWindow => {
        const startDate = normalizeDateKey(event.reflectedDate) ?? event.reflectedDate;
        const startLeadDays = getDaysBetweenDateKeys(stayDate, startDate);
        if (startLeadDays === null || startLeadDays < 0 || startLeadDays > 360) {
            return {
                endDate: null,
                endLeadDays: null,
                event,
                missingReason: "lead-time-out-of-range",
                startDate,
                startLeadDays: event.daysBeforeStay
            };
        }
        if (startDate > latestComparableDate) {
            return {
                endDate: null,
                endLeadDays: null,
                event,
                missingReason: "event-after-observation",
                startDate,
                startLeadDays
            };
        }

        const nextEvent = events.slice(index + 1).find((candidate) => (
            candidate.reflectedDate > startDate
            && candidate.reflectedDate <= latestComparableDate
        ));
        const beforeNextEvent = nextEvent === undefined
            ? null
            : shiftDate(nextEvent.reflectedDate, -1);
        const endDate = beforeNextEvent !== null && beforeNextEvent < latestComparableDate
            ? beforeNextEvent
            : latestComparableDate;
        const endLeadDays = getDaysBetweenDateKeys(stayDate, endDate);
        if (
            endDate <= startDate
            || endLeadDays === null
            || endLeadDays < 0
            || endLeadDays > 360
        ) {
            return {
                endDate,
                endLeadDays,
                event,
                missingReason: "post-observation-missing",
                startDate,
                startLeadDays
            };
        }
        return {
            endDate,
            endLeadDays,
            event,
            missingReason: null,
            startDate,
            startLeadDays
        };
    });
}

export function buildBookingCurveAdjustmentEvaluationTicks(
    windows: readonly BookingCurveAdjustmentEvaluationWindow[]
): number[] {
    return Array.from(new Set(windows.flatMap((window) => (
        window.missingReason === null && window.endLeadDays !== null
            ? [window.startLeadDays, window.endLeadDays]
            : []
    )))).sort((left, right) => right - left);
}

export function buildBookingCurveAdjustmentResponses(options: {
    allowZeroDayCurrent: boolean;
    currentResponse: BookingCurveApiResponse | null;
    rankOrderEntries: readonly BookingCurveRankOrderEntry[] | null;
    recentReference: ReferenceCurveResult;
    seasonalReference: ReferenceCurveResult;
    windows: readonly BookingCurveAdjustmentEvaluationWindow[];
}): BookingCurveAdjustmentResponse[] {
    return options.windows.map((window): BookingCurveAdjustmentResponse => {
        const direction = resolveBookingCurveAdjustmentDirection(
            window.event,
            options.rankOrderEntries
        );
        const common = {
            afterRankName: window.event.afterRankName,
            beforeRankName: window.event.beforeRankName,
            direction,
            endDate: window.endDate,
            endLeadDays: window.endLeadDays,
            signature: window.event.signature,
            startDate: window.startDate,
            startLeadDays: window.startLeadDays
        };
        if (window.missingReason !== null || window.endDate === null || window.endLeadDays === null) {
            return {
                ...common,
                status: "pending",
                missingReason: window.missingReason ?? "post-observation-missing",
                references: []
            };
        }

        const currentStartRooms = resolveExactTransientRooms(
            options.currentResponse,
            window.startDate,
            window.startLeadDays,
            options.allowZeroDayCurrent
        );
        const currentEndRooms = resolveExactTransientRooms(
            options.currentResponse,
            window.endDate,
            window.endLeadDays,
            options.allowZeroDayCurrent
        );
        return {
            ...common,
            status: "ready",
            endDate: window.endDate,
            endLeadDays: window.endLeadDays,
            references: [
                buildReferenceResponse({
                    currentEndRooms,
                    currentStartRooms,
                    direction,
                    endLeadDays: window.endLeadDays,
                    reference: options.recentReference,
                    referenceId: "recent",
                    referenceLabel: "直近型",
                    startLeadDays: window.startLeadDays
                }),
                buildReferenceResponse({
                    currentEndRooms,
                    currentStartRooms,
                    direction,
                    endLeadDays: window.endLeadDays,
                    reference: options.seasonalReference,
                    referenceId: "seasonal",
                    referenceLabel: "季節型",
                    startLeadDays: window.startLeadDays
                })
            ]
        };
    });
}

export function resolveBookingCurveAdjustmentDirection(
    event: Pick<BookingCurveRankStatusEvent, "afterRankName" | "beforeRankName">,
    rankOrderEntries: readonly BookingCurveRankOrderEntry[] | null
): BookingCurveAdjustmentDirection {
    if (
        event.beforeRankName === null
        || event.afterRankName === null
        || rankOrderEntries === null
    ) {
        return "unresolved";
    }
    if (event.beforeRankName === event.afterRankName) {
        return "unchanged";
    }
    const beforeIndex = rankOrderEntries.findIndex((entry) => entry.name === event.beforeRankName);
    const afterIndex = rankOrderEntries.findIndex((entry) => entry.name === event.afterRankName);
    if (beforeIndex < 0 || afterIndex < 0) {
        return "unresolved";
    }
    return afterIndex < beforeIndex ? "raise" : "lower";
}

function buildReferenceResponse(options: {
    currentEndRooms: number | null;
    currentStartRooms: number | null;
    direction: BookingCurveAdjustmentDirection;
    endLeadDays: number;
    reference: ReferenceCurveResult;
    referenceId: "recent" | "seasonal";
    referenceLabel: string;
    startLeadDays: number;
}): BookingCurveAdjustmentReferenceResponse {
    if (options.currentStartRooms === null) {
        return pendingReference(options, "current-start-missing");
    }
    if (options.currentEndRooms === null) {
        return pendingReference(options, "current-end-missing");
    }
    const referenceStartRooms = resolveReferenceRooms(options.reference, options.startLeadDays);
    if (referenceStartRooms === null) {
        return pendingReference(options, "reference-start-missing");
    }
    const referenceEndRooms = resolveReferenceRooms(options.reference, options.endLeadDays);
    if (referenceEndRooms === null) {
        return pendingReference(options, "reference-end-missing");
    }
    const startGapRooms = normalizeSignedZero(options.currentStartRooms - referenceStartRooms);
    const endGapRooms = normalizeSignedZero(options.currentEndRooms - referenceEndRooms);
    const gapChangeRooms = normalizeSignedZero(endGapRooms - startGapRooms);
    return {
        status: "ready",
        endGapRooms,
        gapChangeRooms,
        interpretation: interpretGapChange(options.direction, gapChangeRooms, endGapRooms),
        referenceId: options.referenceId,
        referenceLabel: options.referenceLabel,
        startGapRooms
    };
}

function pendingReference(
    options: { referenceId: "recent" | "seasonal"; referenceLabel: string },
    missingReason: BookingCurveAdjustmentReferenceMissingReason
): BookingCurveAdjustmentReferenceResponse {
    return {
        status: "pending",
        missingReason,
        referenceId: options.referenceId,
        referenceLabel: options.referenceLabel
    };
}

function interpretGapChange(
    direction: BookingCurveAdjustmentDirection,
    gapChangeRooms: number,
    endGapRooms: number
): BookingCurveAdjustmentInterpretation {
    if (direction === "unresolved") {
        return "direction-unresolved";
    }
    if (direction === "unchanged") {
        return "unchanged";
    }
    if (direction === "lower") {
        if (gapChangeRooms === 0) {
            return "variation-small";
        }
        return gapChangeRooms > 0 ? "pace-up" : "pace-down";
    }
    if (endGapRooms < 0) {
        return "reference-below";
    }
    if (gapChangeRooms === 0) {
        return "variation-small";
    }
    if (gapChangeRooms > 0) {
        return "pace-up";
    }
    return "restrained-with-buffer";
}

function resolveExactTransientRooms(
    response: BookingCurveApiResponse | null,
    lookupDate: string,
    leadDays: number,
    allowZeroDayCurrent: boolean
): number | null {
    if (response === null || (leadDays === 0 && !allowZeroDayCurrent)) {
        return null;
    }
    let matched: BookingCurveApiPoint | null = null;
    for (const point of response.booking_curve ?? []) {
        if (normalizeDateKey(point.date) === lookupDate) {
            matched = point;
        }
    }
    return normalizeNonNegativeNumber(matched?.transient?.this_year_room_sum);
}

function resolveReferenceRooms(result: ReferenceCurveResult, leadDays: number): number | null {
    const point = result.points.find((candidate) => candidate.lt === leadDays);
    return normalizeNonNegativeNumber(point?.rooms);
}

function normalizeNonNegativeNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeSignedZero(value: number): number {
    return Math.abs(value) < 1e-9 ? 0 : value;
}
