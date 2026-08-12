import {
    createBrowserNextReadTransport,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    parseBookingCurveRankOrderResponse,
    type BookingCurveRankOrderSnapshot
} from "./bookingCurveRankOrderModel";

export type BookingCurveRankOrderLoadResult =
    | {
        status: "ready";
        contextKey: string;
        facilityId: string;
        snapshot: BookingCurveRankOrderSnapshot;
    }
    | {
        status: "error";
        contextKey: string;
        reason: "aborted" | "facility-id-invalid" | "request-failed" | "response-invalid";
    };

export interface BookingCurveRankOrderDataSource {
    cancel(): void;
    load(facilityId: string): Promise<BookingCurveRankOrderLoadResult>;
    reset(): void;
    stop(): void;
}

/**
 * One bounded, memory-only read for the visible facility context.  A new
 * context needs a fresh instance (or reset), matching the rank-status seam.
 */
export function createBookingCurveRankOrderDataSource(options: {
    transport?: NextReadTransport;
    windowHost?: Window;
} = {}): BookingCurveRankOrderDataSource {
    const transport = options.transport ?? createBrowserNextReadTransport(options.windowHost ?? window);
    let attempt: {
        contextKey: string;
        promise: Promise<BookingCurveRankOrderLoadResult>;
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
        load(facilityId) {
            const normalizedFacilityId = facilityId.trim();
            const contextKey = normalizedFacilityId || "invalid";
            if (stopped) {
                return Promise.resolve({ status: "error", contextKey, reason: "aborted" });
            }
            if (normalizedFacilityId === "") {
                return Promise.resolve({ status: "error", contextKey, reason: "facility-id-invalid" });
            }
            if (attempt !== null) {
                return attempt.contextKey === contextKey
                    ? attempt.promise
                    : Promise.resolve({ status: "error", contextKey, reason: "request-failed" });
            }

            const controller = new AbortController();
            activeController = controller;
            const promise = loadBookingCurveRankOrder({
                contextKey,
                facilityId: normalizedFacilityId,
                signal: controller.signal,
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

async function loadBookingCurveRankOrder(options: {
    contextKey: string;
    facilityId: string;
    signal: AbortSignal;
    transport: NextReadTransport;
}): Promise<BookingCurveRankOrderLoadResult> {
    try {
        const payload = await options.transport.read({ kind: "rank-sequences" }, options.signal);
        if (options.signal.aborted) {
            return { status: "error", contextKey: options.contextKey, reason: "aborted" };
        }
        const snapshot = parseBookingCurveRankOrderResponse(payload);
        if (snapshot === null) {
            return { status: "error", contextKey: options.contextKey, reason: "response-invalid" };
        }
        return {
            status: "ready",
            contextKey: options.contextKey,
            facilityId: options.facilityId,
            snapshot
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
