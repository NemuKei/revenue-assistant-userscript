import {
    detectLegacyClassicRuntime,
    startRevenueAssistantRuntime
} from "./runtimeLease";
import { resolveNextRuntimeMarker } from "./runtimeMarker";
import { startLiveSimilarityLensRuntime } from "./live/liveSimilarityLensRuntime";
import { startCompetitorHistoryRuntime } from "./analyze/competitorHistoryRuntime";

const SCRIPT_NAME = typeof GM_info === "undefined"
    ? "Revenue Assistant Next (Candidate)"
    : GM_info.script?.name ?? "Revenue Assistant Next (Candidate)";
const SCRIPT_VERSION = typeof GM_info === "undefined"
    ? "local"
    : GM_info.script?.version ?? "unknown";
const NEXT_RUNTIME_STATE_ATTRIBUTE = "data-ra-next-runtime-state";
const NEXT_RUNTIME_VERSION_ATTRIBUTE = "data-ra-next-runtime-version";

const runtimeResult = startRevenueAssistantRuntime({
    requestedMode: "next",
    host: window,
    legacyDomDetected: detectLegacyClassicRuntime(document),
    start: startNextCandidateRuntime
});

const runtimeState = resolveNextRuntimeMarker(
    runtimeResult,
    document.documentElement.getAttribute(NEXT_RUNTIME_STATE_ATTRIBUTE)
);
document.documentElement.setAttribute(NEXT_RUNTIME_STATE_ATTRIBUTE, runtimeState);

if (!runtimeResult.started) {
    console.warn(`[${SCRIPT_NAME}] did not start`, runtimeResult);
}

function startNextCandidateRuntime(): void {
    document.documentElement.setAttribute(NEXT_RUNTIME_VERSION_ATTRIBUTE, SCRIPT_VERSION);
    startLiveSimilarityLensRuntime(document, window);
    startCompetitorHistoryRuntime(document, window);
    console.info(`[${SCRIPT_NAME}] candidate runtime ready`, {
        href: window.location.href,
        mode: "server-read-only/local-bounded-history",
        version: SCRIPT_VERSION
    });
}
