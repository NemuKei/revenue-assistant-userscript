import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importBundledTypeScript } from "./import-typescript-module.mjs";

const runtime = await importBundledTypeScript(
    "../src/next/live/liveSimilarityLensRuntime.ts",
    import.meta.url
);
const [
    classicSource,
    nextEntrySource,
    nextRuntimeSource,
    analyzeRuntimeSource,
    bookingRuntimeSource,
    bookingRankSource,
    bookingReferenceDataSourceSource,
    priceTrendRuntimeSource,
    smokeSource
] = await Promise.all([
    readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/entry.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/live/liveSimilarityLensRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/competitorHistoryRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveRankStatusDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/bookingCurveReferenceDataSource.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/next/analyze/priceTrendComparisonRuntime.ts", import.meta.url), "utf8"),
    readFile(new URL("./run-distribution-smoke.mjs", import.meta.url), "utf8")
]);

assert.equal(runtime.isLiveSimilarityLensCalendarRoute("/"), true);
assert.equal(runtime.isLiveSimilarityLensCalendarRoute("/analyze/2026-08-01"), false);
assert.match(nextRuntimeSource, /suspendForInactiveRoute\(\)/u);
assert.match(nextRuntimeSource, /removeLiveSimilarityLensArtifacts\(documentHost\)/u);
assert.match(nextRuntimeSource, /"suspended-route"/u);
assert.doesNotMatch(
    nextEntrySource,
    /(?:from\s+["'][^"']*main|import\(["'][^"']*main)/u,
    "Next must not recover Analyze parity by importing the Classic monolith"
);
assert.match(nextEntrySource, /startCompetitorHistoryRuntime/u);
assert.match(nextEntrySource, /startBookingCurveReferenceRuntime/u);
assert.match(nextEntrySource, /startPriceTrendComparisonRuntime/u);
assert.match(analyzeRuntimeSource, /competitor-price-tax-included-text/u);
assert.match(analyzeRuntimeSource, /buildCompetitorHistoryViewModel/u);
assert.doesNotMatch(
    analyzeRuntimeSource,
    /(?:from\s+["'][^"']*main|import\(["'][^"']*main)/u,
    "Next Analyze runtime must not import the Classic monolith"
);
assert.match(bookingRuntimeSource, /booking-curve-main-chart-header/u);
assert.match(bookingRuntimeSource, /buildBookingCurveReferenceViewModel/u);
assert.match(bookingRuntimeSource, /createBookingCurveRankStatusDataSource/u);
assert.match(bookingRankSource, /kind: "rank-status"/u);
assert.doesNotMatch(
    bookingReferenceDataSourceSource,
    /rank-status|lincoln\/suggest\/status/u,
    "rank status must stay separate from the reference cache reader"
);
assert.doesNotMatch(
    bookingRuntimeSource,
    /(?:from\s+["'][^"']*main|import\(["'][^"']*main)/u,
    "Next booking curve runtime must not import the Classic monolith"
);
assert.doesNotMatch(
    bookingRuntimeSource,
    /lincoln\/suggest\/status/u,
    "rank endpoint construction must stay in the shared closed transport"
);
assert.match(priceTrendRuntimeSource, /price-trends-content/u);
assert.match(priceTrendRuntimeSource, /buildPriceTrendComparisonViewModel/u);
assert.doesNotMatch(
    priceTrendRuntimeSource,
    /(?:from\s+["'][^"']*main|import\(["'][^"']*main)/u,
    "Next price trend runtime must not import the Classic monolith"
);

const classicAnalyzeContracts = [
    [
        /SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_ATTRIBUTE/u,
        "booking curve reference toggles"
    ],
    [
        /SALES_SETTING_BOOKING_CURVE_MARKER_HITBOX_ATTRIBUTE/u,
        "booking curve rank-marker hitboxes"
    ],
    [
        /hitboxElement\.setAttribute\("tabindex", index === 0 \? "0" : "-1"\)/u,
        "booking curve keyboard tooltip access"
    ],
    [
        /titleElement\.textContent = "競合価格 最安値推移"/u,
        "competitor snapshot history title"
    ],
    [
        /for \(const guestCount of COMPETITOR_PRICE_GUEST_COUNTS\)/u,
        "competitor snapshot guest panels"
    ],
    [
        /titleElement\.textContent = "競合価格 最安値推移（90日版）"/u,
        "90-day price trend title"
    ],
    [
        /for \(const guestCount of PRICE_TREND_GUEST_COUNTS\)/u,
        "90-day price trend guest panels"
    ],
    [
        /SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE/u,
        "price-chart tooltip contract"
    ],
    [
        /SALES_SETTING_COMPETITOR_PRICE_EMPTY_ATTRIBUTE/u,
        "price-chart empty-state contract"
    ]
];

for (const [pattern, label] of classicAnalyzeContracts) {
    assert.match(classicSource, pattern, `${label} must remain explicit until Next replaces it`);
}

assert.match(smokeSource, /"competitor-prices"/u);
assert.match(smokeSource, /data-ra-sales-setting-competitor-price-overview/u);
assert.match(smokeSource, /competitor price keyboard hitbox count/u);
assert.match(smokeSource, /Analyze sales setting booking curve svg count/u);
assert.match(smokeSource, /price trends svg count/u);

console.log("Next Analyze parity contract checks passed");
