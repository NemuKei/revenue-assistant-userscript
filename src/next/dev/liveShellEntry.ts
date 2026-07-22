import { createLiveSimilarityLensFixtureDataSource } from "./liveSimilarityLensFixtureDataSource";
import { startLiveSimilarityLensRuntime } from "../live/liveSimilarityLensRuntime";
import { detectLegacyClassicRuntime, startRevenueAssistantRuntime } from "../runtimeLease";
import { resolveNextRuntimeMarker } from "../runtimeMarker";

const NEXT_RUNTIME_STATE_ATTRIBUTE = "data-ra-next-runtime-state";

const runtimeResult = startRevenueAssistantRuntime({
    requestedMode: "next",
    host: window,
    legacyDomDetected: detectLegacyClassicRuntime(document),
    start() {
        startLiveSimilarityLensRuntime(document, window, {
            dataSource: createLiveSimilarityLensFixtureDataSource(window)
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
