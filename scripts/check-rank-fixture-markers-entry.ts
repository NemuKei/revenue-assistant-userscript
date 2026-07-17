import { renderToStaticMarkup } from "react-dom/server";
import {
    buildAllFixtureSnapshots,
    renderRankRecommendationReactListElement
} from "../src/dev/rankRecommendationFixture";
import { resolveRankRecommendationWorkspaceLayoutMode } from "../src/rankRecommendationWorkspaceLayout";

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

function assertNotContains(renderedHtml: string, label: string, forbiddenText: string): void {
    if (renderedHtml.includes(forbiddenText)) {
        throw new Error(`${label}: fixture HTML still contains ${forbiddenText}`);
    }
}

export function runRankFixtureMarkerCheck(): void {
    assertWorkspaceLayoutBoundaries();
    const snapshots = buildAllFixtureSnapshots();
    const renderedHtml = snapshots
        .map((snapshot) => (
            `<section data-ra-rank-recommendation-list>${renderToStaticMarkup(renderRankRecommendationReactListElement(snapshot))}</section>`
        ))
        .join("\n");

    const fixtureCount = countMatches(renderedHtml, /data-ra-rank-recommendation-react-island="mounted"/g);
    const taskCount = countMatches(renderedHtml, /data-ra-rank-recommendation-task=""/g);
    const detailCount = countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="detail"/g);
    const metrics: MarkerMetric[] = [
        { name: "fixture render roots", count: fixtureCount, min: snapshots.length },
        { name: "workspace rail", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="workspace-rail"/g), min: fixtureCount },
        { name: "rail controls", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="rail-controls"/g), min: fixtureCount },
        { name: "work-state controls", count: countMatches(renderedHtml, /data-ra-rank-recommendation-view-mode="(?:ready|needs_evidence|recent_or_held)"/g), min: fixtureCount * 3 },
        { name: "task list", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="task-list"/g), min: fixtureCount },
        { name: "candidate tasks", count: taskCount, min: 3 },
        { name: "selected detail", count: detailCount, min: 3 },
        { name: "OH metrics", count: countMatches(renderedHtml, /OH (?:\d+|未取得)/g), min: 3 },
        { name: "individual labels", count: countMatches(renderedHtml, />個人</g), min: 3 },
        { name: "group labels", count: countMatches(renderedHtml, />団体</g), min: 3 },
        { name: "evidence host", count: countMatches(renderedHtml, /data-ra-rank-recommendation-evidence-host=""/g), min: 3 },
        { name: "review-open CTA", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="review-open"/g), min: 3 },
        { name: "Analyze links", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="analyze"/g), min: 3 },
        { name: "decision buttons", count: countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="(?:snooze|dismiss)"/g), min: detailCount * 2 },
        { name: "pending decision state", count: countMatches(renderedHtml, /data-ra-rank-recommendation-pending-decision=""/g), min: 1 },
        { name: "write result states", count: countMatches(renderedHtml, /data-ra-rank-recommendation-rank-change-status="(?:confirming|success|failed)"/g), min: 3 }
    ];

    for (const metric of metrics) {
        assertMetric(metric);
    }

    const allCandidates = snapshots.flatMap((snapshot) => snapshot.candidates);
    const confirmButtons = allCandidates.map((candidate) => candidate.confirmButton);
    if (!confirmButtons.some((button) => button.attrs["data-ra-rank-recommendation-button-action"] === "rank-change-submit")) {
        throw new Error("explicit final confirm contract is missing");
    }
    if (countMatches(renderedHtml, /data-ra-rank-recommendation-button-action="rank-change-submit"/g) !== 0) {
        throw new Error("final write CTA must stay hidden until the review step is opened");
    }

    assertContains(renderedHtml, "workspace title", "今日の判断");
    assertContains(renderedHtml, "individual and group evidence", "個人・団体を直接取得");
    assertContains(renderedHtml, "missing counts", "OH 未取得 / キャパ 未取得");
    assertContains(renderedHtml, "zero group count", "OH 0 / キャパ 18");
    assertNotContains(renderedHtml, "legacy quick-submit copy", "推奨反映");
    assertNotContains(renderedHtml, "automatic write countdown", "秒後に送信");
    assertNotContains(renderedHtml, "legacy nine-column table", "row-layout");
    assertContains(renderedHtml, "controlled target month", '<option value="202607" selected="">');

    console.log("rank fixture marker check passed");
    for (const metric of metrics) {
        console.log(`${metric.name}: ${metric.count}`);
    }
}

function assertWorkspaceLayoutBoundaries(): void {
    const wide = resolveRankRecommendationWorkspaceLayoutMode({
        containerWidth: 1920,
        calendarMinimumWidth: 1080,
        structureSafe: true
    });
    const stacked = resolveRankRecommendationWorkspaceLayoutMode({
        containerWidth: 1425,
        calendarMinimumWidth: 1080,
        structureSafe: true
    });
    const unsafe = resolveRankRecommendationWorkspaceLayoutMode({
        containerWidth: 1920,
        calendarMinimumWidth: 1080,
        structureSafe: false
    });
    if (wide !== "wide" || stacked !== "stacked" || unsafe !== "stacked") {
        throw new Error(`workspace layout boundary mismatch: ${wide}/${stacked}/${unsafe}`);
    }
}
