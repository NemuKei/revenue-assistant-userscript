import {
    createAdjustmentReviewFixtureDataSource,
    createLiveCalendarSummaryFixtureDataSource,
    createLiveSimilarityLensFixtureDataSource
} from "./liveSimilarityLensFixtureDataSource";
import { startLiveSimilarityLensRuntime } from "../live/liveSimilarityLensRuntime";
import { detectLegacyClassicRuntime, startRevenueAssistantRuntime } from "../runtimeLease";
import { resolveNextRuntimeMarker } from "../runtimeMarker";
import { createNextPerformanceRecorder } from "../performance/nextPerformanceRecorder";
import { startAdjustmentReviewRuntime } from "../adjustmentReview/adjustmentReviewRuntime";

const NEXT_RUNTIME_STATE_ATTRIBUTE = "data-ra-next-runtime-state";

const runtimeResult = startRevenueAssistantRuntime({
    requestedMode: "next",
    host: window,
    legacyDomDetected: detectLegacyClassicRuntime(document),
    start() {
        const performanceRecorder = createNextPerformanceRecorder({
            documentHost: document,
            sourceRevision: "fixture",
            windowHost: window
        });
        const calendarSummary = createLiveCalendarSummaryFixtureDataSource(window);
        startAdjustmentReviewRuntime(document, window, {
            dataSource: createAdjustmentReviewFixtureDataSource(calendarSummary),
            isCalendarRoute: (location) => location.pathname === "/"
                || location.pathname === "/dev/fixtures/next-live-shell/"
        });
        startLiveSimilarityLensRuntime(document, window, {
            calendarSummary,
            dataSource: createLiveSimilarityLensFixtureDataSource(window),
            isCalendarRoute: (location) => location.pathname === "/"
                || location.pathname === "/dev/fixtures/next-live-shell/",
            performanceRecorder
        });
    }
});

document.documentElement.setAttribute(
    NEXT_RUNTIME_STATE_ATTRIBUTE,
    resolveNextRuntimeMarker(
        runtimeResult,
        document.documentElement.getAttribute(NEXT_RUNTIME_STATE_ATTRIBUTE)
    )
);
