import { renderToStaticMarkup } from "react-dom/server";
import {
    buildAllFixtureSnapshots,
    renderRankRecommendationReactListElement
} from "../src/dev/rankRecommendationFixture";

interface MarkerMetric {
    name: string;
    count: number;
    min: number;
}

function countMatches(html: string, pattern: RegExp): number {
    return html.match(pattern)?.length ?? 0;
}

function assertMetric(metric: MarkerMetric): void {
    if (metric.count < metric.min) {
        throw new Error(`${metric.name}: expected at least ${metric.min}, got ${metric.count}`);
    }
}

function assertContains(renderedHtml: string, label: string, expectedText: string): void {
    if (!renderedHtml.includes(expectedText)) {
        throw new Error(`${label}: expected fixture HTML to include ${expectedText}`);
    }
}

function assertNotMatches(renderedHtml: string, label: string, pattern: RegExp): void {
    if (pattern.test(renderedHtml)) {
        throw new Error(`${label}: fixture HTML still contains a forbidden date-based latest-change display`);
    }
}

export function runRankFixtureMarkerCheck(): void {
    const renderedHtml = buildAllFixtureSnapshots()
        .map((snapshot) => (
            `<section data-ra-rank-recommendation-list>${renderToStaticMarkup(renderRankRecommendationReactListElement(snapshot))}</section>`
        ))
        .join("\n");

    const rowCount = countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="row-layout"/g);
    const fixtureCount = countMatches(renderedHtml, /data-ra-rank-recommendation-react-island="mounted"/g);
    const metrics: MarkerMetric[] = [
        { name: "fixture render roots", count: fixtureCount, min: 1 },
        { name: "React marker", count: fixtureCount, min: 1 },
        { name: "summary markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="summary"/g), min: fixtureCount },
        { name: "control group markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="control-group"/g), min: fixtureCount },
        { name: "table markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="table"/g), min: fixtureCount },
        { name: "row layout markers", count: rowCount, min: 1 },
        { name: "row actions markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="row-actions"/g), min: rowCount },
        { name: "primary actions wrappers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-primary-actions/g), min: rowCount },
        { name: "secondary action markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="secondary-actions"/g), min: rowCount },
        { name: "status badge cells", count: countMatches(renderedHtml, /data-ra-rank-recommendation-cell-role="status"/g), min: rowCount },
        { name: "history wrappers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-history=""/g), min: 1 },
        { name: "history item markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-history-item=""/g), min: 2 },
        { name: "popover markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="popover"/g), min: rowCount },
        { name: "tooltip markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="tooltip"/g), min: rowCount },
        { name: "pending notice markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="pending-notice"/g), min: 2 },
        { name: "pending progress markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-pending-progress/g), min: 2 },
        { name: "current rank occupancy markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-current-rank-occupancy/g), min: rowCount },
        { name: "status message markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="status-message"/g), min: 1 },
        { name: "rank select markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-inline-rank-select/g), min: 1 },
        { name: "curve preview buttons", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="curve-preview-toggle"/g), min: rowCount },
        { name: "rank change buttons", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="rank-change-preview-toggle"/g), min: rowCount },
        { name: "decision buttons", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="(?:snooze|dismiss)"/g), min: rowCount * 2 }
    ];

    for (const metric of metrics) {
        assertMetric(metric);
    }
    assertContains(renderedHtml, "latest-change history rank item", "ランク 11→10");
    assertContains(renderedHtml, "latest-change history freshness item", "経過 2日前");
    assertNotMatches(renderedHtml, "latest-change history date display", /前回\s+\d{1,2}\/\d{1,2}|5\/27・2日前/g);

    console.log("rank fixture marker check passed");
    for (const metric of metrics) {
        console.log(`${metric.name}: ${metric.count}`);
    }
}
