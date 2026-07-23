import { toCompactDateKey } from "../../curveCore";
import {
    createBrowserNextReadTransport,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    parseBookingCurveRankStatusResponse,
    type BookingCurveRankStatusSnapshot
} from "./bookingCurveRankMarkerModel";

export type BookingCurveRankStatusLoadResult =
    | {
        status: "ready";
        contextKey: string;
        facilityId: string;
        snapshot: BookingCurveRankStatusSnapshot;
        stayDate: string;
    }
    | {
        status: "error";
        contextKey: string;
        reason: "aborted" | "request-failed" | "response-invalid" | "stay-date-invalid";
    };

export interface BookingCurveRankStatusDataSource {
    cancel(): void;
    load(facilityId: string, stayDate: string): Promise<BookingCurveRankStatusLoadResult>;
    reset(): void;
    stop(): void;
}

export function createBookingCurveRankStatusDataSource(options: {
    transport?: NextReadTransport;
    windowHost?: Window;
} = {}): BookingCurveRankStatusDataSource {
    const transport = options.transport ?? createBrowserNextReadTransport(options.windowHost ?? window);
    let attempt: {
        contextKey: string;
        promise: Promise<BookingCurveRankStatusLoadResult>;
    } | null = null;
    let activeController: AbortController | null = null;
    let stopped = false;

    const cancel = (): void => {
        activeController?.abort();
        activeController = null;
    };
    const reset = (): void => {
        cancel();
        attempt = null;
    };

    return {
        cancel,
        load(facilityId, stayDate) {
            const normalizedFacilityId = facilityId.trim();
            const compactStayDate = toCompactDateKey(stayDate);
            const contextKey = `${normalizedFacilityId || "invalid"}|${compactStayDate ?? "invalid"}`;
            if (stopped) {
                return Promise.resolve({ status: "error", contextKey, reason: "aborted" });
            }
            if (normalizedFacilityId === "" || compactStayDate === null) {
                return Promise.resolve({ status: "error", contextKey, reason: "stay-date-invalid" });
            }
            if (attempt !== null) {
                return attempt.contextKey === contextKey
                    ? attempt.promise
                    : Promise.resolve({ status: "error", contextKey, reason: "request-failed" });
            }

            const controller = new AbortController();
            activeController = controller;
            const promise = loadBookingCurveRankStatus({
                contextKey,
                facilityId: normalizedFacilityId,
                signal: controller.signal,
                stayDate: compactStayDate,
                transport
            });
            attempt = { contextKey, promise };
            void promise.finally(() => {
                if (attempt?.promise === promise) {
                    activeController = null;
                }
            });
            return promise;
        },
        reset,
        stop() {
            stopped = true;
            cancel();
        }
    };
}

async function loadBookingCurveRankStatus(options: {
    contextKey: string;
    facilityId: string;
    signal: AbortSignal;
    stayDate: string;
    transport: NextReadTransport;
}): Promise<BookingCurveRankStatusLoadResult> {
    try {
        const payload = await options.transport.read({
            kind: "rank-status",
            stayDate: options.stayDate
        }, options.signal);
        if (options.signal.aborted) {
            return { status: "error", contextKey: options.contextKey, reason: "aborted" };
        }
        const snapshot = parseBookingCurveRankStatusResponse(payload, options.stayDate);
        if (snapshot === null) {
            return { status: "error", contextKey: options.contextKey, reason: "response-invalid" };
        }
        return {
            status: "ready",
            contextKey: options.contextKey,
            facilityId: options.facilityId,
            snapshot,
            stayDate: options.stayDate
        };
    } catch (error: unknown) {
        return {
            status: "error",
            contextKey: options.contextKey,
            reason: options.signal.aborted || isAbortError(error) ? "aborted" : "request-failed"
        };
    }
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object"
        && error !== null
        && "name" in error
        && error.name === "AbortError";
}
