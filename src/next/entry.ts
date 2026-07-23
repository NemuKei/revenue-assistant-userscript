import {
    detectLegacyClassicRuntime,
    startRevenueAssistantRuntime
} from "./runtimeLease";
import { resolveNextRuntimeMarker } from "./runtimeMarker";
import { startLiveSimilarityLensRuntime } from "./live/liveSimilarityLensRuntime";
import { createLiveSimilarityLensDataSource } from "./live/liveSimilarityLensDataSource";
import { startCompetitorHistoryRuntime } from "./analyze/competitorHistoryRuntime";
import { startBookingCurveReferenceRuntime } from "./analyze/bookingCurveReferenceRuntime";
import { createBookingCurveReferenceDataSource } from "./analyze/bookingCurveReferenceDataSource";
import { startPriceTrendComparisonRuntime } from "./analyze/priceTrendComparisonRuntime";
import { createNextBookingCurveAcquisitionCoordinator } from "./bookingCurve/bookingCurveAcquisitionCoordinator";
import { startBookingCurveAcquisitionRuntime } from "./bookingCurve/bookingCurveAcquisitionRuntime";

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
    const bookingCurveAcquisition = createNextBookingCurveAcquisitionCoordinator({ windowHost: window });
    startLiveSimilarityLensRuntime(document, window, {
        dataSource: createLiveSimilarityLensDataSource({
            acquisition: bookingCurveAcquisition,
            documentHost: document,
            windowHost: window
        })
    });
    startCompetitorHistoryRuntime(document, window);
    startBookingCurveReferenceRuntime(document, window, {
        dataSource: createBookingCurveReferenceDataSource({
            acquisition: bookingCurveAcquisition,
            documentHost: document,
            windowHost: window
        })
    });
    startPriceTrendComparisonRuntime(document, window);
    startBookingCurveAcquisitionRuntime(document, window, {
        coordinator: bookingCurveAcquisition
    });
    console.info(`[${SCRIPT_NAME}] candidate runtime ready`, {
        href: window.location.href,
        mode: "server-read-only/local-bounded-history",
        version: SCRIPT_VERSION
    });
}
