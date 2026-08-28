import { toCompactDateKey } from "../../curveCore";

export const ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE =
    "data-ra-next-adjustment-review-analyze";
export const ADJUSTMENT_REVIEW_EVENT_KEY_ATTRIBUTE =
    "data-ra-next-adjustment-review-event-key";
export const ADJUSTMENT_REVIEW_FOCUS_HIGHLIGHT_ATTRIBUTE =
    "data-ra-next-adjustment-review-focus";
export const ADJUSTMENT_REVIEW_PENDING_FOCUS_STORAGE_KEY =
    "revenue-assistant-next:adjustment-review-focus:v1";

const ADJUSTMENT_REVIEW_PENDING_FOCUS_MAX_AGE_MS = 15 * 60 * 1_000;

export interface PendingAdjustmentReviewFocus {
    createdAt: string;
    eventKey: string;
    roomGroupId: string;
    schemaVersion: 1;
    stayDate: string;
}

export function writePendingAdjustmentReviewFocus(
    windowHost: Window,
    options: Omit<PendingAdjustmentReviewFocus, "createdAt" | "schemaVersion">
): boolean {
    const stayDate = toCompactDateKey(options.stayDate);
    if (stayDate === null || options.roomGroupId.trim() === "" || options.eventKey === "") {
        return false;
    }
    const value: PendingAdjustmentReviewFocus = {
        createdAt: new Date().toISOString(),
        eventKey: options.eventKey,
        roomGroupId: options.roomGroupId,
        schemaVersion: 1,
        stayDate
    };
    try {
        windowHost.sessionStorage.setItem(
            ADJUSTMENT_REVIEW_PENDING_FOCUS_STORAGE_KEY,
            JSON.stringify(value)
        );
        return true;
    } catch {
        return false;
    }
}

export function readPendingAdjustmentReviewFocus(
    windowHost: Window,
    stayDate: string
): PendingAdjustmentReviewFocus | null {
    const normalizedStayDate = toCompactDateKey(stayDate);
    if (normalizedStayDate === null) {
        return null;
    }
    let raw: string | null;
    try {
        raw = windowHost.sessionStorage.getItem(ADJUSTMENT_REVIEW_PENDING_FOCUS_STORAGE_KEY);
    } catch {
        return null;
    }
    if (raw === null) {
        return null;
    }
    const parsed = parsePendingFocus(raw);
    if (parsed === null || isExpired(parsed.createdAt)) {
        clearPendingAdjustmentReviewFocus(windowHost);
        return null;
    }
    return parsed.stayDate === normalizedStayDate ? parsed : null;
}

export function clearPendingAdjustmentReviewFocus(windowHost: Window): void {
    try {
        windowHost.sessionStorage.removeItem(ADJUSTMENT_REVIEW_PENDING_FOCUS_STORAGE_KEY);
    } catch {
        // Focus is an optional one-shot enhancement and must not break Analyze.
    }
}

function parsePendingFocus(raw: string): PendingAdjustmentReviewFocus | null {
    try {
        const value: unknown = JSON.parse(raw);
        if (!isRecord(value)) {
            return null;
        }
        const stayDate = typeof value.stayDate === "string"
            ? toCompactDateKey(value.stayDate)
            : null;
        if (
            value.schemaVersion !== 1
            || stayDate === null
            || typeof value.roomGroupId !== "string"
            || value.roomGroupId.trim() === ""
            || typeof value.eventKey !== "string"
            || value.eventKey === ""
            || value.eventKey.length > 4_096
            || typeof value.createdAt !== "string"
            || !Number.isFinite(Date.parse(value.createdAt))
        ) {
            return null;
        }
        return {
            createdAt: value.createdAt,
            eventKey: value.eventKey,
            roomGroupId: value.roomGroupId,
            schemaVersion: 1,
            stayDate
        };
    } catch {
        return null;
    }
}

function isExpired(createdAt: string): boolean {
    const age = Date.now() - Date.parse(createdAt);
    return age < 0 || age > ADJUSTMENT_REVIEW_PENDING_FOCUS_MAX_AGE_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
