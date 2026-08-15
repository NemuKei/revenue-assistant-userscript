const NEXT_FACILITY_ENDPOINT = "/api/v2/yad/info";
const NEXT_CURRENT_SETTINGS_ENDPOINT = "/api/v1/suggest/output/current_settings";
const NEXT_COMPETITORS_ENDPOINT = "/api/v2/competitors";
const NEXT_COMPETITOR_PRICES_ENDPOINT = "/api/v5/competitor_prices";
const NEXT_PRICE_TRENDS_ENDPOINT = "/api/v1/price_trends";
const NEXT_RANK_STATUS_ENDPOINT = "/api/v3/lincoln/suggest/status";
const NEXT_BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";
const NEXT_MONTHLY_BOOKING_CURVE_ENDPOINT = "/api/v1/booking_curve/monthly";

export type NextReadRequest =
    | { kind: "facility" }
    | { kind: "current-settings"; from: string; to: string }
    | { kind: "competitors" }
    | { kind: "rank-status"; from: string; to: string }
    | {
        kind: "booking-curve";
        roomGroupId: string | null;
        stayDate: string;
    }
    | {
        kind: "monthly-booking-curve";
        yearMonth: string;
    }
    | {
        kind: "price-trends";
        mealType: string;
        numGuests: 1 | 2 | 3 | 4;
        roomType: string | null;
        stayDate: string;
        yadNos: readonly string[];
    }
    | {
        kind: "competitor-prices";
        competitorYadNos: readonly string[];
        jalanRoomTypes: readonly string[];
        maxNumGuests: number;
        minNumGuests: number;
        stayDate: string;
    };

export interface NextReadTransport {
    read(
        request: NextReadRequest,
        signal: AbortSignal,
        diagnostics?: NextReadResponseDiagnostics
    ): Promise<unknown>;
}

export interface NextReadResponseDiagnostics {
    recordPhase(phase: "responseParse" | "responseRead", elapsedMs: number): void;
}

export interface NextReadSession {
    read(request: NextReadRequest): Promise<unknown>;
    usedRequestCount(): number;
}

export class NextReadHttpError extends Error {
    readonly status: number;

    constructor(kind: NextReadRequest["kind"], status: number) {
        super(`Next read request failed: ${kind} (${status})`);
        this.name = "NextReadHttpError";
        this.status = status;
    }
}

export function createBrowserNextReadTransport(windowHost: Window = window): NextReadTransport {
    return {
        async read(request, signal, diagnostics) {
            const url = buildNextReadUrl(request, windowHost.location.origin);
            const response = await windowHost.fetch(url.toString(), {
                method: "GET",
                credentials: "include",
                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                },
                signal
            });
            if (!response.ok) {
                throw new NextReadHttpError(request.kind, response.status);
            }
            if (diagnostics === undefined) {
                return response.json() as Promise<unknown>;
            }
            const readStartedAt = safePerformanceNow(windowHost);
            const body = await response.text();
            recordResponsePhase(
                diagnostics,
                "responseRead",
                safePerformanceNow(windowHost) - readStartedAt
            );
            const parseStartedAt = safePerformanceNow(windowHost);
            try {
                return JSON.parse(body) as unknown;
            } finally {
                recordResponsePhase(
                    diagnostics,
                    "responseParse",
                    safePerformanceNow(windowHost) - parseStartedAt
                );
            }
        }
    };
}

function safePerformanceNow(windowHost: Window): number {
    const value = windowHost.performance.now();
    return Number.isFinite(value) ? value : 0;
}

function recordResponsePhase(
    diagnostics: NextReadResponseDiagnostics,
    phase: Parameters<NextReadResponseDiagnostics["recordPhase"]>[0],
    elapsedMs: number
): void {
    try {
        diagnostics.recordPhase(phase, elapsedMs);
    } catch {
        // Diagnostics must never turn a successful read into an acquisition error.
    }
}

export function createNextReadSession(
    transport: NextReadTransport,
    signal: AbortSignal
): NextReadSession {
    const usedKinds = new Set<NextReadRequest["kind"]>();

    return {
        read(request) {
            if (usedKinds.has(request.kind) || usedKinds.size >= 2) {
                throw new Error(`Next read budget exceeded: ${request.kind}`);
            }
            usedKinds.add(request.kind);
            return transport.read(request, signal);
        },
        usedRequestCount() {
            return usedKinds.size;
        }
    };
}

export function buildNextReadUrl(request: NextReadRequest, origin: string): URL {
    if (request.kind === "facility") {
        return new URL(NEXT_FACILITY_ENDPOINT, origin);
    }
    if (request.kind === "current-settings") {
        const url = new URL(NEXT_CURRENT_SETTINGS_ENDPOINT, origin);
        url.searchParams.set("from", request.from);
        url.searchParams.set("to", request.to);
        return url;
    }
    if (request.kind === "competitors") {
        return new URL(NEXT_COMPETITORS_ENDPOINT, origin);
    }
    if (request.kind === "rank-status") {
        const url = new URL(NEXT_RANK_STATUS_ENDPOINT, origin);
        url.searchParams.set("filter_type", "stay_date");
        url.searchParams.set("from", request.from);
        url.searchParams.set("to", request.to);
        return url;
    }
    if (request.kind === "booking-curve") {
        const url = new URL(NEXT_BOOKING_CURVE_ENDPOINT, origin);
        url.searchParams.set("date", request.stayDate);
        if (request.roomGroupId !== null) {
            url.searchParams.set("rm_room_group_id", request.roomGroupId);
        }
        return url;
    }
    if (request.kind === "monthly-booking-curve") {
        const url = new URL(NEXT_MONTHLY_BOOKING_CURVE_ENDPOINT, origin);
        url.searchParams.set("year_month", request.yearMonth);
        return url;
    }
    if (request.kind === "price-trends") {
        const url = new URL(NEXT_PRICE_TRENDS_ENDPOINT, origin);
        url.searchParams.set("stay_date", request.stayDate);
        url.searchParams.set("num_guests", String(request.numGuests));
        url.searchParams.set("meal_type", request.mealType);
        if (request.roomType !== null) {
            url.searchParams.append("room_type_options[]", request.roomType);
        }
        for (const yadNo of request.yadNos) {
            url.searchParams.append("yad_nos[]", yadNo);
        }
        return url;
    }
    const url = new URL(NEXT_COMPETITOR_PRICES_ENDPOINT, origin);
    url.searchParams.set("date", request.stayDate);
    url.searchParams.set("min_num_guests", String(request.minNumGuests));
    url.searchParams.set("max_num_guests", String(request.maxNumGuests));
    for (const yadNo of request.competitorYadNos) {
        url.searchParams.append("yad_nos[]", yadNo);
    }
    for (const roomType of request.jalanRoomTypes) {
        url.searchParams.append("jalan_room_types[]", roomType);
    }
    return url;
}
