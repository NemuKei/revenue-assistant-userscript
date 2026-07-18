import { renderToStaticMarkup } from "react-dom/server";
import {
    buildAllFixtureSnapshots,
    buildFixtureCalendarCueAggregates,
    buildFixtureSnapshot,
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
    const firstSnapshot = snapshots[0];
    if (firstSnapshot === undefined) {
        throw new Error("rank fixture snapshots are empty");
    }
    const loadingText = "判断データを準備しています。カレンダーはそのまま操作できます。";
    const loadingHtml = renderToStaticMarkup(renderRankRecommendationReactListElement({
        ...firstSnapshot,
        signature: "loading:fixture",
        metaText: loadingText,
        metaTitle: loadingText,
        emptyText: loadingText,
        controls: {
            targetMonth: null,
            workState: null,
            displayLimit: null,
            rankOrder: null
        },
        candidates: []
    }));
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
    assertTargetMonthCandidateContract();
    assertContains(loadingHtml, "cold-start loading copy", loadingText);
    assertContains(loadingHtml, "cold-start live region", 'role="status" aria-live="polite"');
    assertNotContains(loadingHtml, "cold-start candidate task", 'data-ra-rank-recommendation-task=""');

    console.log("rank fixture marker check passed");
    for (const metric of metrics) {
        console.log(`${metric.name}: ${metric.count}`);
    }
}

function assertTargetMonthCandidateContract(): void {
    for (const state of ["ready", "needs-evidence", "recent"] as const) {
        for (const targetMonth of ["202607", "202608", "202609"] as const) {
            const snapshot = buildFixtureSnapshot(state, targetMonth);
            if (snapshot.controls.targetMonth?.currentValue !== targetMonth) {
                throw new Error(`target month control mismatch: ${state}/${targetMonth}`);
            }
            if (
                snapshot.candidates.length === 0
                || snapshot.candidates.some((candidate) => !candidate.stayDateKey.startsWith(targetMonth))
            ) {
                throw new Error(`target month candidate mismatch: ${state}/${targetMonth}`);
            }
            const expectedCueAggregates = Array.from(
                snapshot.candidates.reduce((statesByStayDate, candidate) => {
                    const states = statesByStayDate.get(candidate.stayDateKey) ?? [];
                    states.push(candidate.workState);
                    statesByStayDate.set(candidate.stayDateKey, states);
                    return statesByStayDate;
                }, new Map<string, Array<(typeof snapshot.candidates)[number]["workState"]>>()),
                ([stayDateKey, states]) => {
                    const ready = states.filter((workState) => workState === "ready").length;
                    const needsEvidence = states.filter((workState) => workState === "needs_evidence").length;
                    const recentOrHeld = states.filter((workState) => workState === "recent_or_held").length;
                    return {
                        stayDateKey,
                        totalCount: states.length,
                        dominantState: ready > 0
                            ? "ready"
                            : needsEvidence > 0
                                ? "needs_evidence"
                                : "recent_or_held",
                        ready,
                        needsEvidence,
                        recentOrHeld,
                        label: [
                            `料金調整候補 ${states.length}件`,
                            ready > 0 ? `判断可能 ${ready}件` : null,
                            needsEvidence > 0 ? `要確認 ${needsEvidence}件` : null,
                            recentOrHeld > 0 ? `保留・直近 ${recentOrHeld}件` : null
                        ].filter((part): part is string => part !== null).join("、")
                    };
                }
            );
            const cueAggregates = buildFixtureCalendarCueAggregates(state, targetMonth).map((cue) => ({
                stayDateKey: cue.stayDateKey,
                totalCount: cue.totalCount,
                dominantState: cue.dominantState,
                ready: cue.stateCounts.ready,
                needsEvidence: cue.stateCounts.needs_evidence,
                recentOrHeld: cue.stateCounts.recent_or_held,
                label: cue.label
            }));
            if (JSON.stringify(expectedCueAggregates) !== JSON.stringify(cueAggregates)) {
                throw new Error(`target month cue mismatch: ${state}/${targetMonth}`);
            }
            const workStateTotal = snapshot.controls.workState?.options
                .reduce((total, option) => total + option.count, 0) ?? 0;
            const targetMonthOption = snapshot.controls.targetMonth?.options
                .find((option) => option.value === targetMonth);
            if (targetMonthOption === undefined || !targetMonthOption.label.endsWith(`(${workStateTotal}件)`)) {
                throw new Error(`target month count mismatch: ${state}/${targetMonth}`);
            }
        }
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
