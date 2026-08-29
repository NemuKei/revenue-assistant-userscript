import {
    NextReadHttpError,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import { summarizeRankLearningCapture } from "./rankLearningCaptureParser";

export const RANK_STATUS_RANGE_PROBE_WINDOWS = [31, 62, 93, 184] as const;
export const RANK_STATUS_RANGE_PROBE_TIMEOUT_MS = 10_000;

export type RankStatusRangeProbeDays = typeof RANK_STATUS_RANGE_PROBE_WINDOWS[number];
export type RankStatusRangeProbeJudgment =
    | "GO_SINGLE_RANGE"
    | "GO_BATCHED"
    | "NEED_PAGINATION"
    | "INSUFFICIENT"
    | "STOP";
export type RankStatusRangeProbeOutcome =
    | "ready"
    | "timeout"
    | "aborted"
    | "http-auth"
    | "http-rate-limit"
    | "http-server"
    | "http-other"
    | "transport-error"
    | "invalid-root"
    | "invalid-event"
    | "pagination"
    | "event-limit"
    | "coverage-unchanged"
    | "coverage-contracted";
export type RankStatusRangeProbeCoverageExpansion =
    | "first"
    | "expanded"
    | "unchanged"
    | "contracted"
    | "not-evaluated";
export type RankStatusRangeProbePreflight = "ready" | "hidden" | "route-change";

export interface RankStatusRangeProbeWindowResult {
    coverageEndOffsetDays: number | null;
    coverageExpansion: RankStatusRangeProbeCoverageExpansion;
    coverageStartOffsetDays: number | null;
    ignoredEventCount: number | null;
    invalidEventCount: number | null;
    latencyMs: number;
    outcome: RankStatusRangeProbeOutcome;
    paginationEvidence: boolean | null;
    requestedDays: RankStatusRangeProbeDays;
    responseEventCount: number | null;
    rootValid: boolean | null;
    truncationSuspected: boolean | null;
    uniqueStayDateCount: number | null;
    validEventCount: number | null;
}

export interface RankStatusRangeProbeRunResult {
    judgment: RankStatusRangeProbeJudgment;
    status: "complete" | "stopped" | "already-run";
    stopReason: RankStatusRangeProbeOutcome | RankStatusRangeProbePreflight | "already-run" | null;
    unexecutedRequestedDays: readonly RankStatusRangeProbeDays[];
    windows: readonly RankStatusRangeProbeWindowResult[];
}

export interface RankStatusRangeProbeRunner {
    abort(): void;
    run(signal?: AbortSignal): Promise<RankStatusRangeProbeRunResult>;
}

interface RankStatusRangeProbeRunnerOptions {
    asOfDate: string;
    canContinue?: () => RankStatusRangeProbePreflight;
    clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
    now?: () => number;
    setTimer?: (
        callback: () => void,
        timeoutMs: number
    ) => ReturnType<typeof setTimeout>;
    timeoutMs?: number;
    transport: NextReadTransport;
}

export function createRankStatusRangeProbeRunner(
    options: RankStatusRangeProbeRunnerOptions
): RankStatusRangeProbeRunner {
    const canContinue = options.canContinue ?? (() => "ready");
    const clearTimer = options.clearTimer ?? clearTimeout;
    const now = options.now ?? (() => performance.now());
    const setTimer = options.setTimer ?? setTimeout;
    const timeoutMs = options.timeoutMs ?? RANK_STATUS_RANGE_PROBE_TIMEOUT_MS;
    let activeController: AbortController | null = null;
    let hasRun = false;

    return {
        abort() {
            activeController?.abort();
        },
        async run(signal = new AbortController().signal) {
            if (hasRun) {
                return {
                    judgment: "STOP",
                    status: "already-run",
                    stopReason: "already-run",
                    unexecutedRequestedDays: RANK_STATUS_RANGE_PROBE_WINDOWS,
                    windows: []
                };
            }
            hasRun = true;
            const windows: RankStatusRangeProbeWindowResult[] = [];
            let stopReason: RankStatusRangeProbeRunResult["stopReason"] = null;
            for (const requestedDays of RANK_STATUS_RANGE_PROBE_WINDOWS) {
                if (signal.aborted) {
                    stopReason = readProbeAbortReason(signal) ?? "aborted";
                    break;
                }
                const preflight = canContinue();
                if (preflight !== "ready") {
                    stopReason = preflight;
                    break;
                }
                const range = buildRankStatusRangeProbeDateRange(options.asOfDate, requestedDays);
                if (range === null) {
                    stopReason = "transport-error";
                    break;
                }
                const controller = new AbortController();
                activeController = controller;
                let timedOut = false;
                const relayAbort = (): void => controller.abort();
                signal.addEventListener("abort", relayAbort, { once: true });
                const timer = setTimer(() => {
                    timedOut = true;
                    controller.abort();
                }, timeoutMs);
                const startedAt = now();
                let payload: unknown;
                try {
                    payload = await options.transport.read({
                        from: range.from,
                        kind: "rank-status",
                        to: range.to
                    }, controller.signal);
                } catch (error) {
                    const outcome = classifyProbeReadError(error, {
                        parentAborted: signal.aborted,
                        timedOut
                    });
                    windows.push(emptyWindowResult(
                        requestedDays,
                        outcome,
                        elapsed(now(), startedAt)
                    ));
                    stopReason = readProbeAbortReason(signal) ?? outcome;
                    clearTimer(timer);
                    signal.removeEventListener("abort", relayAbort);
                    activeController = null;
                    break;
                }
                clearTimer(timer);
                signal.removeEventListener("abort", relayAbort);
                activeController = null;
                const summary = summarizeRankLearningCapture(payload, {
                    asOfDate: options.asOfDate,
                    sourceRangeFrom: range.from,
                    sourceRangeTo: range.to
                });
                const coverageExpansion = resolveCoverageExpansion(
                    windows.at(-1) ?? null,
                    summary
                );
                const outcome = resolveSummaryOutcome(summary, coverageExpansion);
                windows.push({
                    ...summary,
                    coverageExpansion,
                    latencyMs: elapsed(now(), startedAt),
                    outcome,
                    requestedDays
                });
                if (outcome !== "ready") {
                    stopReason = outcome;
                    break;
                }
            }
            const unexecutedRequestedDays = RANK_STATUS_RANGE_PROBE_WINDOWS.slice(windows.length);
            const judgment = resolveProbeJudgment(windows, stopReason);
            return {
                judgment,
                status: stopReason === null && windows.length === RANK_STATUS_RANGE_PROBE_WINDOWS.length
                    ? "complete"
                    : "stopped",
                stopReason,
                unexecutedRequestedDays,
                windows
            };
        }
    };
}

export function buildRankStatusRangeProbeDateRange(
    asOfDate: string,
    requestedDays: number
): { from: string; to: string } | null {
    const normalized = normalizeDateKey(asOfDate);
    if (normalized === null || !Number.isInteger(requestedDays) || requestedDays < 1) {
        return null;
    }
    const timestamp = Date.UTC(
        Number(normalized.slice(0, 4)),
        Number(normalized.slice(4, 6)) - 1,
        Number(normalized.slice(6, 8))
    );
    return {
        from: normalized,
        to: new Date(timestamp + (requestedDays - 1) * 24 * 60 * 60 * 1_000)
            .toISOString()
            .slice(0, 10)
            .replaceAll("-", "")
    };
}

export function getRankStatusRangeProbeJstDateKey(timestamp = Date.now()): string {
    return new Date(timestamp + 9 * 60 * 60 * 1_000)
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "");
}

function classifyProbeReadError(
    error: unknown,
    state: { parentAborted: boolean; timedOut: boolean }
): RankStatusRangeProbeOutcome {
    if (state.timedOut) {
        return "timeout";
    }
    if (state.parentAborted) {
        return "aborted";
    }
    const httpStatus = readHttpStatus(error);
    if (httpStatus !== null) {
        if (httpStatus === 401 || httpStatus === 403) {
            return "http-auth";
        }
        if (httpStatus === 429) {
            return "http-rate-limit";
        }
        if (httpStatus >= 500) {
            return "http-server";
        }
        return "http-other";
    }
    return "transport-error";
}

function readHttpStatus(error: unknown): number | null {
    if (error instanceof NextReadHttpError) {
        return error.status;
    }
    if (
        error !== null
        && typeof error === "object"
        && "name" in error
        && error.name === "NextReadHttpError"
        && "status" in error
        && typeof error.status === "number"
        && Number.isInteger(error.status)
    ) {
        return error.status;
    }
    return null;
}

function readProbeAbortReason(signal: AbortSignal): RankStatusRangeProbePreflight | null {
    return signal.reason === "hidden" || signal.reason === "route-change"
        ? signal.reason
        : null;
}

function resolveSummaryOutcome(
    summary: ReturnType<typeof summarizeRankLearningCapture>,
    coverageExpansion: RankStatusRangeProbeCoverageExpansion
): RankStatusRangeProbeOutcome {
    if (!summary.rootValid) {
        return "invalid-root";
    }
    if (summary.invalidEventCount > 0) {
        return "invalid-event";
    }
    if (summary.paginationEvidence) {
        return "pagination";
    }
    if (summary.responseEventCount >= 512) {
        return "event-limit";
    }
    if (coverageExpansion === "contracted") {
        return "coverage-contracted";
    }
    if (coverageExpansion === "unchanged") {
        return "coverage-unchanged";
    }
    return "ready";
}

function resolveCoverageExpansion(
    previous: RankStatusRangeProbeWindowResult | null,
    current: ReturnType<typeof summarizeRankLearningCapture>
): RankStatusRangeProbeCoverageExpansion {
    if (!current.rootValid) {
        return "not-evaluated";
    }
    if (previous === null || previous.rootValid !== true) {
        return "first";
    }
    const previousMetrics = [
        previous.responseEventCount,
        previous.uniqueStayDateCount,
        previous.coverageEndOffsetDays
    ];
    const currentMetrics = [
        current.responseEventCount,
        current.uniqueStayDateCount,
        current.coverageEndOffsetDays
    ];
    if (currentMetrics.some((value, index) => (
        typeof value === "number"
        && typeof previousMetrics[index] === "number"
        && value < previousMetrics[index]
    ))) {
        return "contracted";
    }
    const previousCoverageEnd = previous.coverageEndOffsetDays;
    const currentCoverageEnd = current.coverageEndOffsetDays;
    if (previousCoverageEnd === null) {
        return currentCoverageEnd === null ? "unchanged" : "expanded";
    }
    return currentCoverageEnd !== null && currentCoverageEnd > previousCoverageEnd
        ? "expanded"
        : "unchanged";
}

function resolveProbeJudgment(
    windows: readonly RankStatusRangeProbeWindowResult[],
    stopReason: RankStatusRangeProbeRunResult["stopReason"]
): RankStatusRangeProbeJudgment {
    if (windows.some((window) => window.outcome === "pagination")) {
        return "NEED_PAGINATION";
    }
    if (windows.some((window) => window.outcome === "event-limit")) {
        return "GO_BATCHED";
    }
    if (stopReason !== null) {
        return stopReason === "coverage-contracted" || stopReason === "coverage-unchanged"
            ? "INSUFFICIENT"
            : "STOP";
    }
    if (windows.length !== RANK_STATUS_RANGE_PROBE_WINDOWS.length) {
        return "STOP";
    }
    const first = windows[0];
    const last = windows.at(-1);
    if (
        first === undefined
        || last === undefined
        || last.responseEventCount === 0
        || !windows.slice(1).some((window) => window.coverageExpansion === "expanded")
    ) {
        return "INSUFFICIENT";
    }
    return "GO_SINGLE_RANGE";
}

function emptyWindowResult(
    requestedDays: RankStatusRangeProbeDays,
    outcome: RankStatusRangeProbeOutcome,
    latencyMs: number
): RankStatusRangeProbeWindowResult {
    return {
        coverageEndOffsetDays: null,
        coverageExpansion: "not-evaluated",
        coverageStartOffsetDays: null,
        ignoredEventCount: null,
        invalidEventCount: null,
        latencyMs,
        outcome,
        paginationEvidence: null,
        requestedDays,
        responseEventCount: null,
        rootValid: null,
        truncationSuspected: null,
        uniqueStayDateCount: null,
        validEventCount: null
    };
}

function elapsed(finishedAt: number, startedAt: number): number {
    const value = finishedAt - startedAt;
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function normalizeDateKey(value: string): string | null {
    const compact = value.trim().replaceAll("-", "");
    if (!/^\d{8}$/u.test(compact)) {
        return null;
    }
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? compact
        : null;
}
