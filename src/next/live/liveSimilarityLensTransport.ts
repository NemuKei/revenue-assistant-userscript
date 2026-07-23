const NEXT_FACILITY_ENDPOINT = "/api/v2/yad/info";
const NEXT_CURRENT_SETTINGS_ENDPOINT = "/api/v1/suggest/output/current_settings";
const NEXT_COMPETITORS_ENDPOINT = "/api/v2/competitors";
const NEXT_COMPETITOR_PRICES_ENDPOINT = "/api/v5/competitor_prices";

export type NextReadRequest =
    | { kind: "facility" }
    | { kind: "current-settings"; from: string; to: string }
    | { kind: "competitors" }
    | {
        kind: "competitor-prices";
        competitorYadNos: readonly string[];
        maxNumGuests: number;
        minNumGuests: number;
        stayDate: string;
    };

export interface NextReadTransport {
    read(request: NextReadRequest, signal: AbortSignal): Promise<unknown>;
}

export interface NextReadSession {
    read(request: NextReadRequest): Promise<unknown>;
    usedRequestCount(): number;
}

export function createBrowserNextReadTransport(windowHost: Window = window): NextReadTransport {
    return {
        async read(request, signal) {
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
                throw new Error(`Next read request failed: ${request.kind} (${response.status})`);
            }
            return response.json() as Promise<unknown>;
        }
    };
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
    const url = new URL(NEXT_COMPETITOR_PRICES_ENDPOINT, origin);
    url.searchParams.set("date", request.stayDate);
    url.searchParams.set("min_num_guests", String(request.minNumGuests));
    url.searchParams.set("max_num_guests", String(request.maxNumGuests));
    for (const yadNo of request.competitorYadNos) {
        url.searchParams.append("yad_nos[]", yadNo);
    }
    return url;
}
