import {
    createBrowserNextReadTransport,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    createRankStatusRangeProbeRunner,
    getRankStatusRangeProbeJstDateKey,
    type RankStatusRangeProbeRunResult,
    type RankStatusRangeProbeWindowResult
} from "./rankStatusRangeProbeRunner";

export const RANK_STATUS_RANGE_PROBE_QUERY_KEY = "ra_next_live_check";
export const RANK_STATUS_RANGE_PROBE_QUERY_VALUE = "rank_status_range";
export const RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE = "data-ra-next-rank-range-probe-root";
export const RANK_STATUS_RANGE_PROBE_STATE_ATTRIBUTE = "data-ra-next-rank-range-probe-state";
export const RANK_STATUS_RANGE_PROBE_JUDGMENT_ATTRIBUTE = "data-ra-next-rank-range-probe-judgment";
export const RANK_STATUS_RANGE_PROBE_START_ATTRIBUTE = "data-ra-next-rank-range-probe-start";

export interface RankStatusRangeProbeHarnessOptions {
    asOfDate?: string;
    transport?: NextReadTransport;
}

export interface RankStatusRangeProbeHarness {
    stop(): void;
}

export function startRankStatusRangeProbeHarness(
    documentHost: Document = document,
    windowHost: Window = window,
    options: RankStatusRangeProbeHarnessOptions = {}
): RankStatusRangeProbeHarness {
    if (!shouldMountRankStatusRangeProbeHarness(windowHost.location)) {
        return { stop() {} };
    }
    const root = documentHost.createElement("aside");
    root.setAttribute(RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE, "");
    root.setAttribute(RANK_STATUS_RANGE_PROBE_STATE_ATTRIBUTE, "idle");
    root.setAttribute("aria-label", "開発確認 rank履歴range");
    const style = documentHost.createElement("style");
    style.textContent = getRankStatusRangeProbeStyles();
    const title = documentHost.createElement("strong");
    title.textContent = "開発確認: rank履歴range";
    const description = documentHost.createElement("p");
    description.textContent = "31・62・93・184日を既存read-only経路で直列確認します。";
    const status = documentHost.createElement("p");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("data-ra-next-rank-range-probe-status", "");
    status.textContent = "通信は開始されていません。";
    const startButton = documentHost.createElement("button");
    startButton.type = "button";
    startButton.setAttribute(RANK_STATUS_RANGE_PROBE_START_ATTRIBUTE, "");
    startButton.textContent = "一度だけ計測する";
    const results = documentHost.createElement("ol");
    results.setAttribute("data-ra-next-rank-range-probe-results", "");
    root.append(style, title, description, status, startButton, results);
    documentHost.body.append(root);

    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const asOfDate = options.asOfDate ?? getRankStatusRangeProbeJstDateKey();
    const runController = new AbortController();
    let stopped = false;
    let running = false;
    const runner = createRankStatusRangeProbeRunner({
        asOfDate,
        canContinue: () => {
            if (documentHost.visibilityState !== "visible") {
                return "hidden";
            }
            return shouldMountRankStatusRangeProbeHarness(windowHost.location)
                ? "ready"
                : "route-change";
        },
        transport
    });

    const abortForContextChange = (): void => {
        if (running && documentHost.visibilityState !== "visible") {
            runController.abort("hidden");
        }
        if (!shouldMountRankStatusRangeProbeHarness(windowHost.location)) {
            runController.abort("route-change");
            if (!stopped) {
                stop();
            }
        }
    };
    const observer = new MutationObserver(abortForContextChange);
    observer.observe(documentHost.documentElement, { childList: true, subtree: true });
    documentHost.addEventListener("visibilitychange", abortForContextChange);
    windowHost.addEventListener("popstate", abortForContextChange);

    startButton.addEventListener("click", () => {
        if (running || stopped) {
            return;
        }
        running = true;
        startButton.disabled = true;
        root.setAttribute(RANK_STATUS_RANGE_PROBE_STATE_ATTRIBUTE, "running");
        status.textContent = "計測中です。画面を移動すると停止します。";
        void runner.run(runController.signal).then((result) => {
            if (stopped) {
                return;
            }
            renderProbeResult(documentHost, root, status, results, result);
        });
    });

    function stop(): void {
        if (stopped) {
            return;
        }
        stopped = true;
        runController.abort();
        runner.abort();
        observer.disconnect();
        documentHost.removeEventListener("visibilitychange", abortForContextChange);
        windowHost.removeEventListener("popstate", abortForContextChange);
        root.remove();
    }

    return { stop };
}

export function shouldMountRankStatusRangeProbeHarness(locationHost: Location): boolean {
    return isRankStatusRangeProbeTopLocation(locationHost)
        && new URLSearchParams(locationHost.search).get(RANK_STATUS_RANGE_PROBE_QUERY_KEY)
            === RANK_STATUS_RANGE_PROBE_QUERY_VALUE;
}

export function isRankStatusRangeProbeTopLocation(locationHost: Location): boolean {
    return locationHost.pathname === "/" || locationHost.pathname === "";
}

export function getRankStatusRangeProbeStyles(): string {
    return `
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 2147483000;
    box-sizing: border-box;
    width: min(440px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    overflow: auto;
    padding: 14px;
    border: 2px solid #986400;
    border-radius: 10px;
    background: #fffaf0;
    color: #263a4d;
    box-shadow: 0 8px 24px rgba(31, 47, 61, .22);
    font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
    font-size: 12px;
    line-height: 1.5;
}
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] * { box-sizing: border-box; }
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] strong { display: block; font-size: 14px; }
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] p { margin: 6px 0; }
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] button {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid #795100;
    border-radius: 7px;
    background: #fff;
    color: #5f4000;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
}
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] button:focus-visible {
    outline: 3px solid rgba(23, 103, 165, .55);
    outline-offset: 2px;
}
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] button:disabled { cursor: default; opacity: .65; }
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] ol { margin: 10px 0 0; padding-left: 22px; }
[${RANK_STATUS_RANGE_PROBE_ROOT_ATTRIBUTE}] li { margin: 5px 0; overflow-wrap: anywhere; }
`;
}

function renderProbeResult(
    documentHost: Document,
    root: HTMLElement,
    status: HTMLElement,
    results: HTMLOListElement,
    result: RankStatusRangeProbeRunResult
): void {
    root.setAttribute(
        RANK_STATUS_RANGE_PROBE_STATE_ATTRIBUTE,
        result.status === "complete" ? "complete" : "stopped"
    );
    root.setAttribute(RANK_STATUS_RANGE_PROBE_JUDGMENT_ATTRIBUTE, result.judgment);
    root.setAttribute("data-ra-next-rank-range-probe-window-count", String(result.windows.length));
    status.textContent = `判定: ${result.judgment} / 実行 ${result.windows.length} window / 未実行 ${result.unexecutedRequestedDays.length} window`;
    results.replaceChildren(...result.windows.map((windowResult) => (
        createWindowResultItem(documentHost, windowResult)
    )));
}

function createWindowResultItem(
    documentHost: Document,
    result: RankStatusRangeProbeWindowResult
): HTMLLIElement {
    const item = documentHost.createElement("li");
    item.setAttribute("data-ra-next-rank-range-probe-window", String(result.requestedDays));
    item.setAttribute("data-ra-next-rank-range-probe-outcome", result.outcome);
    const counts = result.responseEventCount === null
        ? "件数未取得"
        : `event ${result.responseEventCount} / valid ${result.validEventCount} / invalid ${result.invalidEventCount} / ignored ${result.ignoredEventCount} / stay日数 ${result.uniqueStayDateCount}`;
    const coverage = result.coverageStartOffsetDays === null || result.coverageEndOffsetDays === null
        ? "coverageなし"
        : `coverage +${result.coverageStartOffsetDays}〜+${result.coverageEndOffsetDays}日`;
    item.textContent = `${result.requestedDays}日: ${result.outcome} / ${result.latencyMs}ms / ${counts} / ${coverage} / ${result.coverageExpansion}`;
    return item;
}
