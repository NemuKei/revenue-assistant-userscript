import {
    createNextMonthlyProgressFixtureDataSource,
    type NextMonthlyProgressDevFixtureMode
} from "../monthlyProgress/monthlyProgressFixture";
import { startNextMonthlyProgressRuntime } from "../monthlyProgress/monthlyProgressRuntime";

const fixtureParams = new URLSearchParams(window.location.search);
const rawMode = fixtureParams.get("state");
const fixtureMode: NextMonthlyProgressDevFixtureMode = rawMode === "loading"
    || rawMode === "bootstrap-loading"
    || rawMode === "empty"
    || rawMode === "current-only"
    || rawMode === "compare-shortage"
    || rawMode === "partial-failure"
    ? rawMode
    : "ready";

const runtime = startNextMonthlyProgressRuntime(document, window, {
    dataSource: createNextMonthlyProgressFixtureDataSource({
        batchDateKey: "20260810",
        mode: fixtureMode
    }),
    resolveBatchDateKey: () => fixtureMode === "bootstrap-loading" ? null : "20260810",
    resolveYearMonth: (location) => location.pathname.includes("next-monthly-progress")
        ? "202608"
        : null
});

document.querySelector<HTMLButtonElement>("[data-mock-route-away]")
    ?.addEventListener("click", () => {
        history.pushState({}, "", "/dev/fixtures/monthly-away/");
        runtime.reconcile();
    });

document.querySelector<HTMLButtonElement>("[data-mock-route-back]")
    ?.addEventListener("click", () => {
        history.pushState({}, "", `/dev/fixtures/next-monthly-progress/?state=${fixtureMode}`);
        runtime.reconcile();
    });

document.querySelector<HTMLButtonElement>("[data-mock-rerender-native]")
    ?.addEventListener("click", () => {
        const host = document.querySelector<HTMLElement>("[data-native-chart-host]");
        if (host === null) {
            return;
        }
        const replacement = host.cloneNode(true) as HTMLElement;
        host.replaceWith(replacement);
    });
