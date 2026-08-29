import { NextReadHttpError, type NextReadTransport } from "../live/liveSimilarityLensTransport";
import { startRankStatusRangeProbeHarness } from "../rankLearning/rankStatusRangeProbeHarness";

const params = new URLSearchParams(window.location.search);
const fixtureRoute = params.get("fixture_route") === "analyze"
    ? "/analyze/20260829"
    : "/";
window.history.replaceState({}, "", `${fixtureRoute}${window.location.search}`);

let activeRequests = 0;
let requestCount = 0;
let maxConcurrency = 0;
const body = document.body;
const transport: NextReadTransport = {
    async read(request, signal) {
        if (request.kind !== "rank-status") {
            throw new Error("fixture accepts rank-status only");
        }
        requestCount += 1;
        activeRequests += 1;
        maxConcurrency = Math.max(maxConcurrency, activeRequests);
        body.setAttribute("data-mock-rank-probe-requests", String(requestCount));
        body.setAttribute("data-mock-rank-probe-max-concurrency", String(maxConcurrency));
        try {
            await waitForFixtureTurn(signal);
            const scenario = params.get("scenario") ?? "ready";
            if (scenario === "rate-limit" && requestCount === 2) {
                throw new NextReadHttpError("rank-status", 429);
            }
            if (scenario === "pagination") {
                return {
                    next_cursor: "synthetic-next",
                    suggest_statuses: [rankEvent(request.from)]
                };
            }
            return {
                suggest_statuses: [
                    rankEvent(request.from),
                    rankEvent(request.to)
                ]
            };
        } finally {
            activeRequests -= 1;
        }
    }
};

startRankStatusRangeProbeHarness(document, window, {
    asOfDate: "20260829",
    transport
});

function rankEvent(stayDate: string): Record<string, unknown> {
    return {
        accepted_at: "2026-08-29T09:00:00+09:00",
        after_price_rank_name: "2",
        before_price_rank_name: "3",
        date: stayDate,
        rm_room_group_id: "synthetic-room"
    };
}

function waitForFixtureTurn(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(resolve, 5);
        signal.addEventListener("abort", () => {
            window.clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
    });
}
