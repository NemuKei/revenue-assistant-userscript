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
        { name: "popover markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="popover"/g), min: rowCount },
        { name: "tooltip markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="tooltip"/g), min: rowCount },
        { name: "pending notice markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="pending-notice"/g), min: 2 },
        { name: "status message markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="status-message"/g), min: 1 },
        { name: "rank select markers", count: countMatches(renderedHtml, /data-ra-rank-recommendation-inline-rank-select/g), min: 1 },
        { name: "curve preview buttons", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="curve-preview-toggle"/g), min: rowCount },
        { name: "rank change buttons", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="rank-change-preview-toggle"/g), min: rowCount },
        { name: "decision buttons", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="(?:snooze|dismiss)"/g), min: rowCount * 2 }
    ];

    for (const metric of metrics) {
        assertMetric(metric);
    }

    console.log("rank fixture marker check passed");
    for (const metric of metrics) {
        console.log(`${metric.name}: ${metric.count}`);
    }
}
