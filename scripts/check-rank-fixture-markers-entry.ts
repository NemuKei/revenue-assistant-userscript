import { renderToStaticMarkup } from "react-dom/server";
import {
    buildAllFixtureSnapshots,
    buildFixtureCalendarCueAggregates,
    buildFixtureSnapshot,
    getRankRecommendationFixtureShellStyles,
    renderRankRecommendationReactListElement
} from "../src/dev/rankRecommendationFixture";
import { resolveRankRecommendationWorkspaceLayoutMode } from "../src/rankRecommendationWorkspaceLayout";
import { RANK_RECOMMENDATION_WORKSPACE_STYLES } from "../src/rankRecommendationWorkspaceStyles";
import {
    buildRankRecommendationCoverageDayFingerprint,
    buildRankRecommendationCoverageDays,
    buildRankRecommendationCoverageScopeKey,
    buildRankRecommendationWarmCacheDependencies,
    buildRankRecommendationWarmCacheDependencyKey,
    findInvalidatedRankRecommendationCoverageStayDates,
    formatRankRecommendationCoverageStatus,
    getRankRecommendationCoverageCounts,
    getRankRecommendationPartialTargetMonths,
    prioritizeRankRecommendationWarmCacheTasks,
    resolveRankRecommendationDayCoverage,
    selectRankRecommendationCoverageBatchStayDates,
    shouldResyncRankRecommendationCoverageAfterStaleWarmCacheTask
} from "../src/rankRecommendationCoverage";
import {
    buildRankRecommendationPerformanceContextSignature,
    buildRankRecommendationProgressiveContextSignature,
    createRankRecommendationProgressiveEvidenceCoordinator,
    createRankRecommendationProgressiveEvidenceRequestCache,
    limitRankRecommendationItemsWithSelectedKey,
    resolveRankRecommendationProgressiveControlVisibility,
    resolveRankRecommendationProgressiveReadinessStage,
    resolveRankRecommendationProgressiveWorkStateControlPublished,
    shouldCacheRankRecommendationProgressiveEvidence,
    shouldResetRankRecommendationPerformanceMetrics,
    type RankRecommendationProgressiveEvidenceReadiness
} from "../src/rankRecommendationProgressiveReadiness";

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

export async function runRankFixtureMarkerCheck(): Promise<void> {
    assertWorkspaceLayoutBoundaries();
    assertCalendarCueNativePositioningContract();
    assertRankRecommendationCoverageContract();
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
        emptyText: null,
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
    const snapshotsWithControls = snapshots.filter((snapshot) => snapshot.controls.workState !== null);

    const fixtureCount = countMatches(renderedHtml, /data-ra-rank-recommendation-react-island="mounted"/g);
    const taskCount = countMatches(renderedHtml, /data-ra-rank-recommendation-task=""/g);
    const detailCount = countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="detail"/g);
    const metrics: MarkerMetric[] = [
        { name: "fixture render roots", count: fixtureCount, min: snapshots.length },
        { name: "workspace rail", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="workspace-rail"/g), min: fixtureCount },
        { name: "rail controls", count: countMatches(renderedHtml, /data-ra-rank-recommendation-ui-component="rail-controls"/g), min: fixtureCount },
        { name: "work-state controls", count: countMatches(renderedHtml, /data-ra-rank-recommendation-view-mode="(?:ready|needs_evidence|recent_or_held)"/g), min: snapshotsWithControls.length * 3 },
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
    if (countMatches(loadingHtml, /role="status"/g) !== 1) {
        throw new Error("cold-start must expose exactly one rail live region");
    }
    await assertProgressiveReadinessContract();

    console.log("rank fixture marker check passed");
    for (const metric of metrics) {
        console.log(`${metric.name}: ${metric.count}`);
    }
}

function assertRankRecommendationCoverageContract(): void {
    const visibleStayDates = new Set(["20260719", "20260720", "20260721", "20260801"]);
    const days = buildRankRecommendationCoverageDays({
        response: {
            suggest_output_current_settings: [
                {
                    stay_date: "2026-07-19",
                    rm_room_groups: [{ rm_room_group_id: "past" }]
                },
                {
                    stay_date: "2026-07-20",
                    rm_room_groups: [
                        { rm_room_group_id: "room-a" },
                        { rm_room_group_id: "room-a" },
                        { rm_room_group_id: " " }
                    ]
                },
                {
                    stay_date: "2026-07-21",
                    rm_room_groups: [{ rm_room_group_id: "room-b" }]
                },
                {
                    stay_date: "2026-08-01",
                    rm_room_groups: [{ rm_room_group_id: "room-c" }]
                },
                {
                    stay_date: "invalid",
                    rm_room_groups: [{ rm_room_group_id: "invalid" }]
                }
            ]
        },
        visibleStayDates,
        asOfDate: "20260720",
        priorityMonth: "202608"
    });
    if (
        days.map((day) => day.stayDate).join(",") !== "20260801,20260720,20260721"
        || days.some((day) => day.roomGroupIds.length !== 1)
        || days.some((day) => day.dependencies.some((dependency) => dependency.stayDate < "20260720"))
    ) {
        throw new Error("rank recommendation coverage ordering or normalization mismatch");
    }
    const availableStayDates = new Set(days.map((day) => day.stayDate));
    const initialBatch = selectRankRecommendationCoverageBatchStayDates({
        days,
        availableStayDates,
        committedStayDates: new Set(),
        initialBatchDayCount: 1,
        followupBatchDayCount: 7
    });
    const followupBatch = selectRankRecommendationCoverageBatchStayDates({
        days,
        availableStayDates,
        committedStayDates: new Set(initialBatch),
        initialBatchDayCount: 1,
        followupBatchDayCount: 7
    });
    if (
        initialBatch.join(",") !== "20260801"
        || followupBatch.join(",") !== "20260720,20260721"
    ) {
        throw new Error("rank recommendation day batching must publish the first task before the remaining days");
    }

    const augustDay = days[0];
    if (augustDay === undefined) {
        throw new Error("rank recommendation coverage priority day is missing");
    }
    const augustDependencies = buildRankRecommendationWarmCacheDependencies(days, "202608");
    if (
        augustDependencies.length !== augustDay.dependencies.length
        || augustDependencies.some((dependency) => dependency.targetStayDate !== "20260801")
        || augustDependencies[0]?.kind !== "currentRaw"
    ) {
        throw new Error("rank recommendation exact warm-cache dependency contract mismatch");
    }
    const unorderedTasks = [
        {
            id: "reference",
            kind: "referenceCurve",
            targetStayDate: "20260801",
            stayDate: "20260801",
            scope: "roomGroup",
            roomGroupId: "room-c"
        },
        {
            id: "past-same-weekday",
            kind: "sameWeekdayRaw",
            targetStayDate: "20260801",
            stayDate: "20260718",
            scope: "roomGroup",
            roomGroupId: "room-c"
        },
        ...augustDependencies.map((dependency, index) => ({
            id: `dependency-${index}`,
            ...dependency,
            scope: "roomGroup"
        })),
        {
            id: "hotel",
            kind: "currentRaw",
            targetStayDate: "20260801",
            stayDate: "20260801",
            scope: "hotel"
        }
    ];
    const prioritizedTasks = prioritizeRankRecommendationWarmCacheTasks(unorderedTasks, augustDependencies);
    const expectedPriorityIds = augustDependencies.map((_, index) => `dependency-${index}`);
    if (
        prioritizedTasks.slice(0, expectedPriorityIds.length).map((task) => task.id).join(",") !== expectedPriorityIds.join(",")
        || prioritizedTasks.map((task) => task.id).sort().join(",") !== unorderedTasks.map((task) => task.id).sort().join(",")
        || prioritizedTasks.findIndex((task) => task.id === "past-same-weekday") < expectedPriorityIds.length
    ) {
        throw new Error("rank recommendation warm-cache ordering must preserve the exact task multiset");
    }

    const presentDependencyKeys = new Set(augustDependencies.map(buildRankRecommendationWarmCacheDependencyKey));
    const missingSameWeekday = augustDependencies.find((dependency) => dependency.kind === "sameWeekdayRaw");
    if (missingSameWeekday === undefined) {
        throw new Error("rank recommendation same-weekday dependency is missing");
    }
    presentDependencyKeys.delete(buildRankRecommendationWarmCacheDependencyKey(missingSameWeekday));
    const hasRawSource = (dependency: (typeof augustDependencies)[number]): boolean => (
        presentDependencyKeys.has(buildRankRecommendationWarmCacheDependencyKey(dependency))
    );
    const pendingCoverage = resolveRankRecommendationDayCoverage({
        days: [augustDay],
        hasRawSource,
        isPending: (dependency) => (
            buildRankRecommendationWarmCacheDependencyKey(dependency)
            === buildRankRecommendationWarmCacheDependencyKey(missingSameWeekday)
        ),
        warmCacheSettled: true
    });
    if (!pendingCoverage.pendingStayDates.has("20260801") || pendingCoverage.checkedStayDates.size !== 0) {
        throw new Error("rank recommendation pending day must not be committed");
    }

    const terminalSameWeekdayCoverage = resolveRankRecommendationDayCoverage({
        days: [augustDay],
        hasRawSource,
        isPending: () => false,
        warmCacheSettled: true
    });
    if (
        !terminalSameWeekdayCoverage.readyStayDates.has("20260801")
        || terminalSameWeekdayCoverage.completeEvidenceStayDates.has("20260801")
        || terminalSameWeekdayCoverage.unavailableStayDates.size !== 0
    ) {
        throw new Error("terminal same-weekday absence must stay visible as ready with diagnostics");
    }

    const currentDependency = augustDependencies.find((dependency) => dependency.kind === "currentRaw");
    if (currentDependency === undefined) {
        throw new Error("rank recommendation current dependency is missing");
    }
    presentDependencyKeys.add(buildRankRecommendationWarmCacheDependencyKey(missingSameWeekday));
    presentDependencyKeys.delete(buildRankRecommendationWarmCacheDependencyKey(currentDependency));
    const unavailableCoverage = resolveRankRecommendationDayCoverage({
        days: [augustDay],
        hasRawSource,
        isPending: () => false,
        warmCacheSettled: true
    });
    if (!unavailableCoverage.unavailableStayDates.has("20260801")) {
        throw new Error("terminal current raw absence must be unavailable");
    }

    const readFailureCoverage = resolveRankRecommendationDayCoverage({
        days: [augustDay],
        hasRawSource: () => false,
        isPending: () => false,
        warmCacheSettled: true,
        readFailed: true
    });
    if (
        !readFailureCoverage.pendingStayDates.has("20260801")
        || readFailureCoverage.checkedStayDates.size !== 0
        || readFailureCoverage.unavailableStayDates.size !== 0
    ) {
        throw new Error("transient bulk read failure must remain pending and uncommitted");
    }
    const recoveredCoverage = resolveRankRecommendationDayCoverage({
        days: [augustDay],
        hasRawSource: () => true,
        isPending: () => false,
        warmCacheSettled: true
    });
    if (
        !recoveredCoverage.checkedStayDates.has("20260801")
        || !recoveredCoverage.completeEvidenceStayDates.has("20260801")
        || recoveredCoverage.pendingStayDates.size !== 0
    ) {
        throw new Error("coverage must recover after a transient bulk read failure");
    }

    const expandedAugustDays = buildRankRecommendationCoverageDays({
        response: {
            suggest_output_current_settings: [{
                stay_date: "2026-08-01",
                rm_room_groups: [
                    { rm_room_group_id: "room-c" },
                    { rm_room_group_id: "room-d" }
                ]
            }]
        },
        visibleStayDates,
        asOfDate: "20260720",
        priorityMonth: "202608"
    });
    const expandedAugustDay = expandedAugustDays[0];
    if (expandedAugustDay === undefined || expandedAugustDay.roomGroupIds.length !== 2) {
        throw new Error("expanded room-group coverage fixture is invalid");
    }
    const invalidatedStayDates = findInvalidatedRankRecommendationCoverageStayDates({
        days: expandedAugustDays,
        committedFingerprintByStayDate: new Map([[
            augustDay.stayDate,
            buildRankRecommendationCoverageDayFingerprint(augustDay)
        ]])
    });
    if (
        !invalidatedStayDates.has("20260801")
        || buildRankRecommendationCoverageDayFingerprint(expandedAugustDay)
            === buildRankRecommendationCoverageDayFingerprint(augustDay)
    ) {
        throw new Error("same-day room-group changes must invalidate committed coverage");
    }

    const retryQueue = prioritizeRankRecommendationWarmCacheTasks([
        unorderedTasks[0]!,
        {
            id: "dependency-retry",
            ...augustDependencies[0]!,
            scope: "roomGroup",
            retryCount: 1
        }
    ], augustDependencies);
    if (retryQueue[0]?.id !== "dependency-retry") {
        throw new Error("exact-priority retry must stay ahead of non-priority warm-cache tasks");
    }
    if (
        !shouldResyncRankRecommendationCoverageAfterStaleWarmCacheTask({
            sameDataContext: true,
            task: retryQueue[0]!,
            dependencies: augustDependencies
        })
        || shouldResyncRankRecommendationCoverageAfterStaleWarmCacheTask({
            sameDataContext: false,
            task: retryQueue[0]!,
            dependencies: augustDependencies
        })
        || shouldResyncRankRecommendationCoverageAfterStaleWarmCacheTask({
            sameDataContext: true,
            task: unorderedTasks[0]!,
            dependencies: augustDependencies
        })
    ) {
        throw new Error("stale exact-priority completion must resync only in the same data context");
    }

    const limitedStatus = formatRankRecommendationCoverageStatus({
        targetLabel: "2026年8月",
        coverageCounts: { total: 31, covered: 7, complete: false },
        candidateCount: 438,
        visibleCandidateCount: 10,
        unavailableDayCount: 0,
        selectedEvidenceReadiness: "complete"
    });
    if (!limitedStatus.includes("候補438件") || !limitedStatus.includes("現在10件表示")) {
        throw new Error("partial coverage status must distinguish found and visible candidate counts");
    }
    const readFailureStatus = formatRankRecommendationCoverageStatus({
        targetLabel: "2026年8月",
        coverageCounts: { total: 31, covered: 0, complete: false },
        candidateCount: 0,
        visibleCandidateCount: 0,
        unavailableDayCount: 0,
        selectedEvidenceReadiness: null,
        readFailed: true
    });
    if (!readFailureStatus.includes("確認を続けています") || !readFailureStatus.includes("未確認日は確定していません")) {
        throw new Error("transient coverage read failure status must not claim an empty or terminal result");
    }

    const coverageCounts = getRankRecommendationCoverageCounts(
        days,
        new Set(["20260801"]),
        "202608"
    );
    if (coverageCounts.total !== 1 || coverageCounts.covered !== 1 || !coverageCounts.complete) {
        throw new Error("rank recommendation target-month coverage counts mismatch");
    }
    const partialTargetMonths = getRankRecommendationPartialTargetMonths(
        days,
        new Set(["20260801"]),
        ["202607", "202608"]
    );
    if (!partialTargetMonths.has("202607") || partialTargetMonths.has("202608")) {
        throw new Error("rank recommendation partial target-month labels must be computed per month");
    }
    if (buildRankRecommendationCoverageScopeKey(currentDependency) !== "20260801:room-c") {
        throw new Error("rank recommendation coverage scope key mismatch");
    }
}

async function assertProgressiveReadinessContract(): Promise<void> {
    const performanceContextSignature = buildRankRecommendationPerformanceContextSignature({
        facilityCacheKey: "facility-a",
        batchDateKey: "20260720"
    });
    if (
        shouldResetRankRecommendationPerformanceMetrics(performanceContextSignature, performanceContextSignature)
        || !shouldResetRankRecommendationPerformanceMetrics("", performanceContextSignature)
        || !shouldResetRankRecommendationPerformanceMetrics(
            performanceContextSignature,
            buildRankRecommendationPerformanceContextSignature({
                facilityCacheKey: "facility-a",
                batchDateKey: "20260721"
            })
        )
    ) {
        throw new Error("rank recommendation performance metrics context latch mismatch");
    }
    const readinessByCandidate = new Map([
        ["candidate-a", "pending" as const],
        ["candidate-b", "pending" as const]
    ]);
    readinessByCandidate.set("candidate-a", "complete");
    if (resolveRankRecommendationProgressiveReadinessStage(readinessByCandidate.get("candidate-b") ?? null) !== "first_task") {
        throw new Error("non-selected completion must not complete the selected task stage");
    }
    readinessByCandidate.set("candidate-b", "missing");
    if (resolveRankRecommendationProgressiveReadinessStage(readinessByCandidate.get("candidate-b") ?? null) !== "needs_evidence") {
        throw new Error("missing selected evidence must not be marked complete");
    }
    readinessByCandidate.set("candidate-b", "complete");
    if (resolveRankRecommendationProgressiveReadinessStage(readinessByCandidate.get("candidate-b") ?? null) !== "complete") {
        throw new Error("selected evidence completion must complete the stage");
    }
    const loadingSnapshot = buildFixtureSnapshot("loading", "202607");
    if (
        loadingSnapshot.readinessStage !== "loading"
        || loadingSnapshot.candidates.length !== 0
        || loadingSnapshot.controls.targetMonth !== null
        || loadingSnapshot.controls.workState !== null
    ) {
        throw new Error("loading readiness contract mismatch");
    }

    const firstTaskSnapshot = buildFixtureSnapshot("first-task", "202607");
    const candidate = firstTaskSnapshot.candidates[0];
    const firstTaskHtml = renderToStaticMarkup(renderRankRecommendationReactListElement(firstTaskSnapshot));
    if (
        firstTaskSnapshot.readinessStage !== "first_task"
        || firstTaskSnapshot.candidates.length !== 1
        || candidate === undefined
        || candidate.evidenceReadiness !== "pending"
        || candidate.occupancyText !== "OH 7 / キャパ 18"
        || candidate.individualText !== "5"
        || candidate.groupText !== "2"
        || candidate.confirmButton.disabled !== true
        || candidate.snoozeButton.disabled !== true
        || candidate.dismissButton.disabled !== true
        || firstTaskSnapshot.controls.targetMonth?.currentValue !== "202607"
        || firstTaskSnapshot.controls.workState !== null
        || firstTaskSnapshot.controls.displayLimit !== null
        || firstTaskSnapshot.controls.rankOrder !== null
    ) {
        throw new Error("first-task readiness contract mismatch");
    }
    if (countMatches(firstTaskHtml, /role="status"/g) !== 1) {
        throw new Error("first-task must expose exactly one rail live region");
    }
    assertContains(firstTaskHtml, "first-task evidence busy state", 'aria-busy="true"');

    const partialCoverageSnapshot = buildFixtureSnapshot("coverage-partial", "202607");
    const partialCoverageHtml = renderToStaticMarkup(renderRankRecommendationReactListElement(partialCoverageSnapshot));
    const partialCandidate = partialCoverageSnapshot.candidates[0];
    if (
        partialCoverageSnapshot.readinessStage !== "first_task"
        || partialCoverageSnapshot.candidates.length !== 1
        || partialCandidate === undefined
        || !partialCoverageSnapshot.metaText.includes("1/31日を確認済み")
        || !partialCoverageSnapshot.metaText.includes("候補1件")
        || partialCoverageSnapshot.controls.targetMonth?.options[0]?.label !== "2026年7月 (確認済み 1件)"
        || !partialCandidate.confirmButton.disabled
        || !partialCandidate.snoozeButton.disabled
        || !partialCandidate.dismissButton.disabled
        || countMatches(partialCoverageHtml, /data-ra-rank-recommendation-task=""/g) !== 1
    ) {
        throw new Error("partial coverage task/status/option/action contract mismatch");
    }

    const partialEmptySnapshot = buildFixtureSnapshot("coverage-partial-empty", "202607");
    const partialEmptyHtml = renderToStaticMarkup(renderRankRecommendationReactListElement(partialEmptySnapshot));
    if (
        partialEmptySnapshot.readinessStage !== "loading"
        || partialEmptySnapshot.candidates.length !== 0
        || !partialEmptySnapshot.metaText.includes("確認を続けています")
        || partialEmptySnapshot.metaText.includes("候補はありません")
        || partialEmptySnapshot.controls.targetMonth?.options[0]?.label !== "2026年7月 (確認済み 0件)"
        || countMatches(partialEmptyHtml, /data-ra-rank-recommendation-task=""/g) !== 0
    ) {
        throw new Error("partial empty coverage must remain non-terminal");
    }

    const unavailableCoverageSnapshot = buildFixtureSnapshot("coverage-unavailable", "202607");
    const unavailableCandidate = unavailableCoverageSnapshot.candidates[0];
    if (
        unavailableCoverageSnapshot.readinessStage !== "needs_evidence"
        || unavailableCoverageSnapshot.candidates.length !== 1
        || unavailableCandidate === undefined
        || !unavailableCoverageSnapshot.metaText.includes("うち1日は個人・団体を取得できませんでした")
        || unavailableCoverageSnapshot.controls.targetMonth?.options[0]?.label !== "2026年7月 (1件)"
        || unavailableCoverageSnapshot.controls.targetMonth?.options[1]?.label !== "2026年8月 (確認済み 0件)"
        || unavailableCandidate.occupancyText !== "OH 未取得 / キャパ 未取得"
        || unavailableCandidate.individualText !== "未取得"
        || unavailableCandidate.groupText !== "未取得"
        || !unavailableCandidate.confirmButton.disabled
        || !unavailableCandidate.snoozeButton.disabled
        || !unavailableCandidate.dismissButton.disabled
    ) {
        throw new Error("terminal unavailable coverage must stay separated and non-actionable");
    }

    const monthTransitionSnapshot = {
        ...loadingSnapshot,
        signature: "loading:target-month:fixture:202608",
        metaText: "2026年8月の候補判定を準備しています。カレンダーはそのまま操作できます。",
        controls: {
            ...loadingSnapshot.controls,
            targetMonth: buildFixtureSnapshot("first-task", "202608").controls.targetMonth
        }
    };
    const monthTransitionHtml = renderToStaticMarkup(renderRankRecommendationReactListElement(monthTransitionSnapshot));
    if (
        monthTransitionSnapshot.controls.targetMonth?.currentValue !== "202608"
        || monthTransitionSnapshot.candidates.length !== 0
        || !monthTransitionHtml.includes('<option value="202608" selected="">')
        || countMatches(monthTransitionHtml, /role="status"/g) !== 1
    ) {
        throw new Error("target-month loading transition contract mismatch");
    }
    const firstTaskCue = buildFixtureCalendarCueAggregates("first-task", "202607");
    if (
        firstTaskCue.length !== 1
        || firstTaskCue[0]?.stayDateKey !== candidate.stayDateKey
    ) {
        throw new Error("first-task rail/detail/calendar cue mismatch");
    }
    const augustFirstTaskSnapshot = buildFixtureSnapshot("first-task", "202608");
    if (
        !augustFirstTaskSnapshot.metaText.startsWith("2026年8月の候補判定は完了")
        || augustFirstTaskSnapshot.controls.targetMonth?.currentValue !== "202608"
        || augustFirstTaskSnapshot.candidates.some((item) => !item.stayDateKey.startsWith("202608"))
    ) {
        throw new Error("first-task target month messaging mismatch");
    }

    const completeSnapshot = buildFixtureSnapshot("ready", "202607");
    if (
        completeSnapshot.readinessStage !== "complete"
        || completeSnapshot.candidates.length === 0
        || completeSnapshot.candidates.some((item) => item.evidenceReadiness !== "complete")
    ) {
        throw new Error("complete readiness contract mismatch");
    }
    const missingSnapshot = buildFixtureSnapshot("missing-counts", "202607");
    const missingCandidates = missingSnapshot.candidates.filter((item) => item.evidenceReadiness === "missing");
    if (
        missingSnapshot.readinessStage !== "needs_evidence"
        || missingSnapshot.controls.targetMonth?.currentValue !== "202607"
        || missingSnapshot.controls.workState === null
        || missingSnapshot.controls.displayLimit !== null
        || missingSnapshot.controls.rankOrder !== null
        || missingCandidates.length === 0
        || missingCandidates.some((item) => (
            item.workState !== "needs_evidence"
        || item.confirmButton.disabled !== true
        || item.snoozeButton.disabled !== true
        || item.dismissButton.disabled !== true
        ))
    ) {
        throw new Error("missing evidence must remain needs-evidence and non-actionable");
    }
    const permanentMissingHtml = renderToStaticMarkup(renderRankRecommendationReactListElement(missingSnapshot));
    assertNotContains(
        permanentMissingHtml,
        "permanent missing retry action",
        'data-ra-rank-recommendation-button-action="evidence-retry"'
    );
    const retryableMissingSnapshot = {
        ...missingSnapshot,
        candidates: missingSnapshot.candidates.map((item, index) => index === 0
            ? { ...item, evidenceRetryAvailable: true }
            : item)
    };
    const retryableMissingHtml = renderToStaticMarkup(renderRankRecommendationReactListElement(retryableMissingSnapshot));
    assertContains(
        retryableMissingHtml,
        "transient missing retry action",
        'data-ra-rank-recommendation-button-action="evidence-retry"'
    );

    assertProgressiveControlPolicy();
    assertProgressiveContextAndSelectionPolicy();
    await assertSelectedOnlyEvidenceCoordinator();
}

function assertProgressiveControlPolicy(): void {
    const cases = [
        {
            name: "cold loading",
            input: { readinessStage: "loading" as const, hasStatusText: true, targetMonthOptionCount: 0 },
            expected: { targetMonth: false, workState: false, displayLimit: false, rankOrder: false }
        },
        {
            name: "target month transition",
            input: { readinessStage: "loading" as const, hasStatusText: true, targetMonthOptionCount: 3 },
            expected: { targetMonth: true, workState: false, displayLimit: false, rankOrder: false }
        },
        {
            name: "first task",
            input: { readinessStage: "first_task" as const, hasStatusText: true, targetMonthOptionCount: 3 },
            expected: { targetMonth: true, workState: false, displayLimit: false, rankOrder: false }
        },
        {
            name: "first task after work-state navigation",
            input: {
                readinessStage: "first_task" as const,
                hasStatusText: true,
                targetMonthOptionCount: 3,
                preserveWorkState: true
            },
            expected: { targetMonth: true, workState: true, displayLimit: false, rankOrder: false }
        },
        {
            name: "terminal missing",
            input: { readinessStage: "needs_evidence" as const, hasStatusText: true, targetMonthOptionCount: 3 },
            expected: { targetMonth: true, workState: true, displayLimit: false, rankOrder: false }
        },
        {
            name: "complete",
            input: { readinessStage: "complete" as const, hasStatusText: false, targetMonthOptionCount: 3 },
            expected: { targetMonth: true, workState: true, displayLimit: true, rankOrder: true }
        },
        {
            name: "error",
            input: { readinessStage: "error" as const, hasStatusText: true, targetMonthOptionCount: 3 },
            expected: { targetMonth: false, workState: false, displayLimit: false, rankOrder: false }
        }
    ];
    for (const item of cases) {
        const actual = resolveRankRecommendationProgressiveControlVisibility(item.input);
        if (JSON.stringify(actual) !== JSON.stringify(item.expected)) {
            throw new Error(`progressive control policy mismatch: ${item.name}`);
        }
    }
}

function assertProgressiveContextAndSelectionPolicy(): void {
    const context = buildRankRecommendationProgressiveContextSignature({
        facilityCacheKey: "facility-a",
        batchDateKey: "20260718",
        fromDateKey: "20260701",
        toDateKey: "20260930"
    });
    const sameContext = buildRankRecommendationProgressiveContextSignature({
        facilityCacheKey: "facility-a",
        batchDateKey: "20260718",
        fromDateKey: "20260701",
        toDateKey: "20260930"
    });
    const nextFacilityContext = buildRankRecommendationProgressiveContextSignature({
        facilityCacheKey: "facility-b",
        batchDateKey: "20260718",
        fromDateKey: "20260701",
        toDateKey: "20260930"
    });
    if (context !== sameContext || context === nextFacilityContext) {
        throw new Error("progressive context signature must isolate facility/batch/date-range options");
    }
    if (resolveRankRecommendationProgressiveWorkStateControlPublished({
        wasPublished: true,
        readinessStage: "first_task",
        reset: true
    })) {
        throw new Error("work-state navigation publication must reset with a new progressive context");
    }

    const items = Array.from({ length: 12 }, (_, index) => ({ key: `candidate-${index + 1}` }));
    const limited = limitRankRecommendationItemsWithSelectedKey({
        items,
        limit: 10,
        selectedKey: "candidate-11",
        getKey: (item) => item.key
    });
    if (
        limited.length !== 10
        || !limited.some((item) => item.key === "candidate-11")
        || limited.some((item) => item.key === "candidate-10")
    ) {
        throw new Error("selected candidate outside the display limit must stay pinned without expanding the list");
    }
}

async function assertSelectedOnlyEvidenceCoordinator(): Promise<void> {
    type Evidence = {
        readiness: RankRecommendationProgressiveEvidenceReadiness;
        transientFailure?: boolean;
    };
    let resolveA: ((value: Evidence) => void) | null = null;
    let resolveB: ((value: Evidence) => void) | null = null;
    const loadCounts = new Map<string, number>();
    const coordinator = createRankRecommendationProgressiveEvidenceCoordinator<Evidence>([
        { key: "candidate-a", readiness: "pending" },
        { key: "candidate-b", readiness: "pending" },
        { key: "candidate-c", readiness: "pending" }
    ]);
    const createDeferredLoad = (
        key: string,
        capture: (resolve: (value: Evidence) => void) => void
    ): (() => Promise<Evidence>) => () => {
        loadCounts.set(key, (loadCounts.get(key) ?? 0) + 1);
        return new Promise((resolve) => capture(resolve));
    };

    coordinator.select("candidate-a");
    const requestA = coordinator.requestSelected(
        "candidate-a",
        createDeferredLoad("candidate-a", (resolve) => { resolveA = resolve; }),
        (value) => value.readiness
    );
    coordinator.select("candidate-b");
    const requestB = coordinator.requestSelected(
        "candidate-b",
        createDeferredLoad("candidate-b", (resolve) => { resolveB = resolve; }),
        (value) => value.readiness
    );
    const requestC = coordinator.requestSelected(
        "candidate-c",
        createDeferredLoad("candidate-c", () => undefined),
        (value) => value.readiness
    );
    if (requestA === null || requestB === null || requestC !== null || resolveA === null || resolveB === null) {
        throw new Error("selected-only evidence coordinator did not start the expected requests");
    }

    resolveA({ readiness: "complete" });
    await requestA;
    if (
        coordinator.getSelectedKey() !== "candidate-b"
        || resolveRankRecommendationProgressiveReadinessStage(coordinator.getSelectedReadiness()) !== "first_task"
    ) {
        throw new Error("A completion must not complete or replace selected candidate B");
    }

    resolveB({ readiness: "missing", transientFailure: true });
    await requestB;
    if (
        resolveRankRecommendationProgressiveReadinessStage(coordinator.getSelectedReadiness()) !== "needs_evidence"
        || loadCounts.get("candidate-a") !== 1
        || loadCounts.get("candidate-b") !== 1
        || (loadCounts.get("candidate-c") ?? 0) !== 0
    ) {
        throw new Error("missing B must stop at needs-evidence without hydrating candidate C");
    }

    if (
        coordinator.retrySelected("candidate-c", (value) => value?.transientFailure === true)
        || !coordinator.retrySelected("candidate-b", (value) => value?.transientFailure === true)
        || resolveRankRecommendationProgressiveReadinessStage(coordinator.getSelectedReadiness()) !== "first_task"
    ) {
        throw new Error("only the selected transient candidate may return to pending for retry");
    }
    const publishedAfterMissing = resolveRankRecommendationProgressiveWorkStateControlPublished({
        wasPublished: false,
        readinessStage: "needs_evidence"
    });
    const publishedDuringRetry = resolveRankRecommendationProgressiveWorkStateControlPublished({
        wasPublished: publishedAfterMissing,
        readinessStage: "first_task"
    });
    if (
        !publishedDuringRetry
        || !resolveRankRecommendationProgressiveControlVisibility({
            readinessStage: "first_task",
            hasStatusText: true,
            targetMonthOptionCount: 3,
            preserveWorkState: publishedDuringRetry
        }).workState
    ) {
        throw new Error("published work-state navigation must remain mounted during selected retry");
    }
    const retryB = coordinator.requestSelected(
        "candidate-b",
        () => {
            loadCounts.set("candidate-b", (loadCounts.get("candidate-b") ?? 0) + 1);
            return Promise.resolve({ readiness: "complete" });
        },
        (value) => value.readiness
    );
    if (retryB === null) {
        throw new Error("selected transient candidate retry did not start");
    }
    await retryB;
    if (
        coordinator.getSelectedReadiness() !== "complete"
        || loadCounts.get("candidate-b") !== 2
        || (loadCounts.get("candidate-c") ?? 0) !== 0
    ) {
        throw new Error("retry must hydrate only selected candidate B and leave C untouched");
    }

    const restored = createRankRecommendationProgressiveEvidenceCoordinator<Evidence>([
        { key: "candidate-b", readiness: "missing", value: { readiness: "missing" } }
    ]);
    restored.select("candidate-b");
    if (
        resolveRankRecommendationProgressiveReadinessStage(restored.getSelectedReadiness()) !== "needs_evidence"
        || restored.retrySelected("candidate-b", (value) => value?.transientFailure === true)
    ) {
        throw new Error("terminal evidence readiness must survive a same-context coordinator rebuild");
    }

    const sharedRequestCache = createRankRecommendationProgressiveEvidenceRequestCache<Evidence>();
    let resolveShared: ((value: Evidence) => void) | null = null;
    let sharedLoadCount = 0;
    const loadShared = (): Promise<Evidence> => sharedRequestCache.getOrCreate("context-a:candidate-b", () => {
        sharedLoadCount += 1;
        return new Promise((resolve) => { resolveShared = resolve; });
    });
    const beforeRebuild = createRankRecommendationProgressiveEvidenceCoordinator<Evidence>([
        { key: "candidate-b", readiness: "pending" }
    ]);
    beforeRebuild.select("candidate-b");
    const beforeRebuildRequest = beforeRebuild.requestSelected(
        "candidate-b",
        loadShared,
        (value) => value.readiness
    );
    const afterRebuild = createRankRecommendationProgressiveEvidenceCoordinator<Evidence>([
        { key: "candidate-b", readiness: "pending" }
    ]);
    afterRebuild.select("candidate-b");
    const afterRebuildRequest = afterRebuild.requestSelected(
        "candidate-b",
        loadShared,
        (value) => value.readiness
    );
    if (
        beforeRebuildRequest === null
        || afterRebuildRequest === null
        || resolveShared === null
        || sharedLoadCount !== 1
    ) {
        throw new Error("same-context coordinator rebuild must reuse the selected in-flight request");
    }
    resolveShared({ readiness: "complete" });
    await Promise.all([beforeRebuildRequest, afterRebuildRequest]);
    if (
        beforeRebuild.getSelectedKey() !== "candidate-b"
        || afterRebuild.getSelectedKey() !== "candidate-b"
        || afterRebuild.getSelectedReadiness() !== "complete"
    ) {
        throw new Error("same-context coordinator rebuild must retain selection and reach terminal readiness");
    }

    if (
        !shouldCacheRankRecommendationProgressiveEvidence({ readiness: "missing", transientFailure: false })
        || shouldCacheRankRecommendationProgressiveEvidence({ readiness: "complete", transientFailure: true })
        || shouldCacheRankRecommendationProgressiveEvidence({ readiness: "missing", transientFailure: true })
    ) {
        throw new Error("terminal missing may persist, but transient preview failures must remain retryable");
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
        containerWidth: 2560,
        calendarMinimumWidth: 1080,
        calendarMonthCount: 3,
        structureSafe: true
    });
    const standardDesktop = resolveRankRecommendationWorkspaceLayoutMode({
        containerWidth: 1920,
        calendarMinimumWidth: 1080,
        calendarMonthCount: 3,
        structureSafe: true
    });
    const stacked = resolveRankRecommendationWorkspaceLayoutMode({
        containerWidth: 1425,
        calendarMinimumWidth: 1080,
        calendarMonthCount: 3,
        structureSafe: true
    });
    const unsafe = resolveRankRecommendationWorkspaceLayoutMode({
        containerWidth: 1920,
        calendarMinimumWidth: 1080,
        calendarMonthCount: 3,
        structureSafe: false
    });
    if (wide !== "wide" || standardDesktop !== "stacked" || stacked !== "stacked" || unsafe !== "stacked") {
        throw new Error(`workspace layout boundary mismatch: ${wide}/${standardDesktop}/${stacked}/${unsafe}`);
    }
}

function assertCalendarCueNativePositioningContract(): void {
    const calendarStateRule = /\[data-ra-rank-recommendation-calendar-state\]\s*\{[^}]*position\s*:/s;
    if (calendarStateRule.test(RANK_RECOMMENDATION_WORKSPACE_STYLES)) {
        throw new Error("calendar cue must not override the native date link positioning");
    }
    const calendarCueRule = /\[data-ra-rank-recommendation-calendar-cue\]\s*\{[^}]*position\s*:\s*absolute/s;
    if (!calendarCueRule.test(RANK_RECOMMENDATION_WORKSPACE_STYLES)) {
        throw new Error("calendar cue must remain an absolute child of the native date link");
    }
    const fixtureStyles = getRankRecommendationFixtureShellStyles();
    const fixtureSlotRule = /\[data-ra-fixture-calendar-slot\]\s*\{[^}]*position\s*:\s*relative/s;
    const fixtureDateLinkRule = /\[data-ra-fixture-calendar-cell\]\s*\{[^}]*position\s*:\s*absolute/s;
    if (!fixtureSlotRule.test(fixtureStyles) || !fixtureDateLinkRule.test(fixtureStyles)) {
        throw new Error("calendar fixture must preserve the native absolute date-link geometry");
    }
    const stackedParentRule = /\[data-ra-fixture-native-parent\]\[data-ra-rank-recommendation-workspace-layout="stacked"\]\s*\{[^}]*flex-direction\s*:\s*column/s;
    if (!stackedParentRule.test(fixtureStyles)) {
        throw new Error("stacked fixture must keep the native calendar before the rail without horizontal compression");
    }
}
