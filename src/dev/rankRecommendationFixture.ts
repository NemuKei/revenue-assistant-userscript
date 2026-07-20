import {
    renderRankRecommendationReactListElement,
    syncRankRecommendationReactList,
    type RankRecommendationReactButtonSnapshot,
    type RankRecommendationReactCandidateSnapshot,
    type RankRecommendationReactListSnapshot
} from "../rankRecommendationReactIsland";
import {
    limitRankRecommendationItemsWithSelectedKey,
    resolveRankRecommendationProgressiveControlVisibility
} from "../rankRecommendationProgressiveReadiness";
import { formatRankRecommendationCoverageStatus } from "../rankRecommendationCoverage";
import { RANK_RECOMMENDATION_WORKSPACE_STYLES } from "../rankRecommendationWorkspaceStyles";
import {
    buildRankRecommendationCalendarCueSummary,
    countRankRecommendationWorkStates,
    selectRankRecommendationCalendarCueItems,
    type RankRecommendationCalendarCuePolicy,
    type RankRecommendationWorkState
} from "../rankRecommendationWorkspaceModel";
import { resolveRankRecommendationWorkspaceLayoutMode } from "../rankRecommendationWorkspaceLayout";

export type FixtureState =
    | "loading"
    | "first-task"
    | "coverage-partial"
    | "coverage-partial-empty"
    | "coverage-unavailable"
    | "ready"
    | "needs-evidence"
    | "recent"
    | "empty"
    | "missing-counts"
    | "zero-counts"
    | "large-counts"
    | "long-room-name"
    | "decision-pending"
    | "write-confirming"
    | "write-success"
    | "write-failure"
    | "current-settings-401"
    | "current-settings-403";

const FIXTURE_STATES: readonly { value: FixtureState; label: string }[] = [
    { value: "loading", label: "初回 loading" },
    { value: "first-task", label: "最初の正しい task" },
    { value: "coverage-partial", label: "確認範囲を拡張中" },
    { value: "coverage-partial-empty", label: "確認範囲を拡張中・候補0" },
    { value: "coverage-unavailable", label: "確認完了・内訳未取得日あり" },
    { value: "ready", label: "判断可能" },
    { value: "needs-evidence", label: "要確認" },
    { value: "recent", label: "保留・直近" },
    { value: "missing-counts", label: "個人・団体 未取得" },
    { value: "zero-counts", label: "OH・個人・団体 0" },
    { value: "large-counts", label: "大きい室数" },
    { value: "long-room-name", label: "長い部屋タイプ名" },
    { value: "decision-pending", label: "様子見 取消待ち" },
    { value: "write-confirming", label: "反映確認中" },
    { value: "write-success", label: "反映成功" },
    { value: "write-failure", label: "反映失敗" },
    { value: "current-settings-401", label: "current settings 401" },
    { value: "current-settings-403", label: "current settings 403" },
    { value: "empty", label: "候補なし" }
];

const FIXTURE_CALENDAR_MONTHS = ["202607", "202608", "202609"] as const;
const FIXTURE_NATIVE_HIGHLIGHT_DATES = new Set(["20260723", "20260805", "20260908"]);
const FIXTURE_CANDIDATE_DATE_KEYS_BY_MONTH = {
    "202607": {
        primary: "20260723",
        secondary: "20260724",
        needsEvidence: "20260727"
    },
    "202608": {
        primary: "20260805",
        secondary: "20260812",
        needsEvidence: "20260812"
    },
    "202609": {
        primary: "20260908",
        secondary: "20260918",
        needsEvidence: "20260918"
    }
} as const;
const FIXTURE_CALENDAR_CUE_ATTRIBUTE = "data-ra-rank-recommendation-calendar-cue";
const FIXTURE_CALENDAR_DESCRIPTION_ATTRIBUTE = "data-ra-rank-recommendation-calendar-description";
const FIXTURE_CALENDAR_STATE_ATTRIBUTE = "data-ra-rank-recommendation-calendar-state";
const FIXTURE_CALENDAR_DESCRIBEDBY_TOKEN_ATTRIBUTE = "data-ra-rank-recommendation-calendar-describedby-token";
const FIXTURE_INITIAL_DISPLAY_LIMIT = 10;
const FIXTURE_DISPLAY_LIMIT_STEP = 10;
const FIXTURE_MAX_DISPLAY_LIMIT = 50;
const FIXTURE_CALENDAR_CUE_POLICIES: readonly { value: RankRecommendationCalendarCuePolicy; label: string }[] = [
    { value: "all_active", label: "全 active（438件相当）" },
    { value: "visible_tasks", label: "表示中 task（採用案）" },
    { value: "high_priority", label: "高優先のみ" }
];

let currentFixtureState: FixtureState = "ready";
let currentFixtureTargetMonth = "202607";
let currentFixtureCalendarCuePolicy: RankRecommendationCalendarCuePolicy = "visible_tasks";
let currentFixtureDisplayLimit = FIXTURE_INITIAL_DISPLAY_LIMIT;
let currentFixtureSelectedCandidateKey: string | null = null;
let fixtureWritePostCount = 0;
let fixtureSuccessTimeoutId: number | null = null;

if (typeof document !== "undefined") {
    const rootElement = document.getElementById("rank-fixture-root");
    const detailElement = document.getElementById("rank-fixture-detail");
    const stateSelectElement = document.getElementById("rank-fixture-state");
    const cuePolicySelectElement = document.getElementById("rank-fixture-cue-policy");
    const cuePolicySummaryElement = document.getElementById("rank-fixture-cue-policy-summary");
    const nativeParentElement = document.querySelector<HTMLElement>("[data-ra-fixture-native-parent]");
    const calendarStripElement = document.querySelector<HTMLElement>("[data-ra-fixture-calendar-strip]");

    if (!(rootElement instanceof HTMLElement)
        || !(detailElement instanceof HTMLElement)
        || !(stateSelectElement instanceof HTMLSelectElement)
        || !(cuePolicySelectElement instanceof HTMLSelectElement)
        || !(cuePolicySummaryElement instanceof HTMLElement)
        || !(nativeParentElement instanceof HTMLElement)
        || !(calendarStripElement instanceof HTMLElement)) {
        throw new Error("Rank recommendation fixture root is missing.");
    }

    installFixtureStyles();
    renderFixtureCalendars(calendarStripElement);
    installFixtureWorkspaceLayoutObserver(nativeParentElement, calendarStripElement);
    installStateOptions(stateSelectElement);
    installCuePolicyOptions(cuePolicySelectElement);
    renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);

    stateSelectElement.addEventListener("change", () => {
        if (fixtureSuccessTimeoutId !== null) {
            window.clearTimeout(fixtureSuccessTimeoutId);
            fixtureSuccessTimeoutId = null;
        }
        currentFixtureState = stateSelectElement.value as FixtureState;
        resetFixtureTaskViewport();
        renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
    });

    cuePolicySelectElement.addEventListener("change", () => {
        currentFixtureCalendarCuePolicy = cuePolicySelectElement.value as RankRecommendationCalendarCuePolicy;
        renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
    });

    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const workStateButton = target.closest<HTMLElement>(
            '[data-ra-rank-recommendation-button-action="view-mode"]'
        );
        if (workStateButton !== null) {
            event.preventDefault();
            const mode = workStateButton.getAttribute("data-ra-rank-recommendation-view-mode");
            currentFixtureState = mode === "needs_evidence"
                ? "needs-evidence"
                : mode === "recent_or_held"
                    ? "recent"
                    : "ready";
            resetFixtureTaskViewport();
            stateSelectElement.value = currentFixtureState;
            renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
            return;
        }

        const displayLimitButton = target.closest<HTMLElement>(
            '[data-ra-rank-recommendation-button-action="display-more"],'
            + '[data-ra-rank-recommendation-button-action="display-reset"]'
        );
        if (displayLimitButton !== null) {
            event.preventDefault();
            currentFixtureDisplayLimit = displayLimitButton.getAttribute("data-ra-rank-recommendation-button-action") === "display-more"
                ? Math.min(FIXTURE_MAX_DISPLAY_LIMIT, currentFixtureDisplayLimit + FIXTURE_DISPLAY_LIMIT_STEP)
                : FIXTURE_INITIAL_DISPLAY_LIMIT;
            renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
            return;
        }

        const analyzeLink = target.closest<HTMLElement>(
            '[data-ra-rank-recommendation-button-action="analyze"]'
        );
        if (analyzeLink !== null) {
            event.preventDefault();
            rootElement.setAttribute("data-ra-fixture-analyze-opened", "true");
            return;
        }

        const decisionButton = target.closest<HTMLElement>(
            '[data-ra-rank-recommendation-button-action="snooze"],'
            + '[data-ra-rank-recommendation-button-action="dismiss"]'
        );
        if (decisionButton !== null) {
            event.preventDefault();
            currentFixtureState = decisionButton.getAttribute("data-ra-rank-recommendation-button-action") === "snooze"
                ? "decision-pending"
                : "empty";
            stateSelectElement.value = currentFixtureState;
            renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
            return;
        }

        const decisionCancelButton = target.closest<HTMLElement>(
            '[data-ra-rank-recommendation-button-action="decision-cancel"]'
        );
        if (decisionCancelButton !== null) {
            event.preventDefault();
            currentFixtureState = "ready";
            stateSelectElement.value = currentFixtureState;
            renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
            return;
        }

        const finalConfirmButton = target.closest<HTMLButtonElement>(
            '[data-ra-rank-recommendation-button-action="rank-change-submit"]'
        );
        if (finalConfirmButton !== null) {
            event.preventDefault();
            fixtureWritePostCount += 1;
            currentFixtureState = "write-confirming";
            stateSelectElement.value = currentFixtureState;
            renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
            if (fixtureSuccessTimeoutId !== null) {
                window.clearTimeout(fixtureSuccessTimeoutId);
            }
            fixtureSuccessTimeoutId = window.setTimeout(() => {
                fixtureSuccessTimeoutId = null;
                if (currentFixtureState !== "write-confirming") {
                    return;
                }
                currentFixtureState = "write-success";
                stateSelectElement.value = currentFixtureState;
                renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, currentFixtureState);
            }, 900);
        }
    });

    calendarStripElement.addEventListener("click", (event) => {
        event.preventDefault();
    });
}

function installStateOptions(selectElement: HTMLSelectElement): void {
    selectElement.replaceChildren(...FIXTURE_STATES.map((state) => {
        const option = document.createElement("option");
        option.value = state.value;
        option.textContent = state.label;
        return option;
    }));
    selectElement.value = currentFixtureState;
}

function installCuePolicyOptions(selectElement: HTMLSelectElement): void {
    selectElement.replaceChildren(...FIXTURE_CALENDAR_CUE_POLICIES.map((policy) => {
        const option = document.createElement("option");
        option.value = policy.value;
        option.textContent = policy.label;
        return option;
    }));
    selectElement.value = currentFixtureCalendarCuePolicy;
}

function resetFixtureTaskViewport(): void {
    currentFixtureDisplayLimit = FIXTURE_INITIAL_DISPLAY_LIMIT;
    currentFixtureSelectedCandidateKey = null;
}

function renderFixture(
    rootElement: HTMLElement,
    detailElement: HTMLElement,
    stateSelectElement: HTMLSelectElement,
    cuePolicySummaryElement: HTMLElement,
    state: FixtureState
): void {
    stateSelectElement.value = state;
    const cuePolicySelectElement = document.getElementById("rank-fixture-cue-policy");
    if (cuePolicySelectElement instanceof HTMLSelectElement) {
        const comparisonAvailable = isFixtureCalendarCuePolicyComparisonAvailable(state);
        cuePolicySelectElement.disabled = !comparisonAvailable;
        if (!comparisonAvailable) {
            currentFixtureCalendarCuePolicy = "visible_tasks";
            cuePolicySelectElement.value = currentFixtureCalendarCuePolicy;
        }
    }
    rootElement.setAttribute("data-ra-fixture-write-post-count", String(fixtureWritePostCount));
    const snapshot = buildFixtureSnapshot(state, currentFixtureTargetMonth, {
        displayLimit: currentFixtureDisplayLimit,
        selectedCandidateKey: currentFixtureSelectedCandidateKey,
        calendarCuePolicy: currentFixtureCalendarCuePolicy
    });
    syncRankRecommendationReactList(rootElement, snapshot, {
        detailContainer: detailElement,
        actions: {
            hydrateEvidence: (_candidateKey, container) => renderFixtureEvidence(container, state),
            retryEvidence: () => undefined,
            selectCandidate: (candidateKey) => {
                currentFixtureSelectedCandidateKey = candidateKey;
            },
            setViewMode: () => undefined,
            setTargetMonth: (value) => {
                currentFixtureTargetMonth = value;
                resetFixtureTaskViewport();
                renderFixture(rootElement, detailElement, stateSelectElement, cuePolicySummaryElement, state);
            }
        }
    });
    syncFixtureCalendarMarkers(
        state,
        currentFixtureCalendarCuePolicy,
        cuePolicySummaryElement,
        snapshot.candidates
    );
}

export interface FixtureSnapshotOptions {
    displayLimit?: number;
    selectedCandidateKey?: string | null;
    calendarCuePolicy?: RankRecommendationCalendarCuePolicy;
}

export interface FixtureCalendarCueAggregateOptions extends FixtureSnapshotOptions {
    visibleCandidates?: readonly RankRecommendationReactCandidateSnapshot[];
}

export function buildFixtureSnapshot(
    state: FixtureState,
    targetMonth = currentFixtureTargetMonth,
    options: FixtureSnapshotOptions = {}
): RankRecommendationReactListSnapshot {
    const displayLimit = Math.min(
        FIXTURE_MAX_DISPLAY_LIMIT,
        Math.max(FIXTURE_INITIAL_DISPLAY_LIMIT, options.displayLimit ?? FIXTURE_INITIAL_DISPLAY_LIMIT)
    );
    const candidates = buildCandidatesForState(state, targetMonth, {
        displayLimit,
        selectedCandidateKey: options.selectedCandidateKey ?? null
    });
    const densePool = state === "ready" ? buildDenseFixtureCalendarCueCandidates(targetMonth) : [];
    const effectiveCalendarCuePolicy = resolveFixtureCalendarCuePolicy(
        state,
        options.calendarCuePolicy ?? "visible_tasks"
    );
    const eligibleReadyCount = densePool.filter((candidate) => candidate.workState === "ready").length;
    const activeWorkState = resolveFixtureWorkState(state);
    const emptyText = getEmptyTextForState(state);
    const isPartialCoverageState = state === "coverage-partial"
        || state === "coverage-partial-empty"
        || state === "coverage-unavailable";
    const workStateCounts = state === "ready"
        ? countRankRecommendationWorkStates(densePool.map((candidate) => candidate.workState))
        : candidates.length === 0
        ? { ready: 0, needs_evidence: 0, recent_or_held: 0 }
        : isPartialCoverageState
            ? {
                ready: candidates.filter((candidate) => candidate.workState === "ready").length,
                needs_evidence: candidates.filter((candidate) => candidate.workState === "needs_evidence").length,
                recent_or_held: candidates.filter((candidate) => candidate.workState === "recent_or_held").length
            }
            : { ready: 3, needs_evidence: 2, recent_or_held: 1 };
    const targetMonthControl = {
        currentValue: targetMonth,
        options: ["202607", "202608", "202609"].map((monthKey) => {
            const year = Number.parseInt(monthKey.slice(0, 4), 10);
            const month = Number.parseInt(monthKey.slice(4, 6), 10);
            const count = state === "ready"
                ? buildDenseFixtureCalendarCueCandidates(monthKey).length
                : monthKey === targetMonth ? candidates.length : 0;
            const isMonthPartial = state === "coverage-partial"
                || state === "coverage-partial-empty"
                || (state === "coverage-unavailable" && monthKey !== targetMonth);
            return {
                value: monthKey,
                label: isMonthPartial
                    ? `${year}年${month}月 (確認済み ${count}件)`
                    : `${year}年${month}月 (${state === "ready" || state === "coverage-unavailable" ? count : 6}件)`
            };
        })
    };
    const workStateControl = {
        options: [
            {
                mode: "ready" as const,
                label: "判断可能",
                title: "根拠と変更候補が揃った候補",
                count: workStateCounts.ready,
                pressed: activeWorkState === "ready"
            },
            {
                mode: "needs_evidence" as const,
                label: "要確認",
                title: "不足または注意が残る候補",
                count: workStateCounts.needs_evidence,
                pressed: activeWorkState === "needs_evidence"
            },
            {
                mode: "recent_or_held" as const,
                label: "保留・直近",
                title: "保留操作中、処理中、または直近変更がある候補",
                count: workStateCounts.recent_or_held,
                pressed: activeWorkState === "recent_or_held"
            }
        ]
    };
    const readinessStage = state === "loading"
        ? "loading"
        : state === "coverage-partial-empty"
            ? "loading"
            : state === "first-task" || state === "coverage-partial"
            ? "first_task"
            : state === "missing-counts" || state === "coverage-unavailable"
                ? "needs_evidence"
                : state === "current-settings-401" || state === "current-settings-403"
                    ? "error"
                    : "complete";
    const controlVisibility = resolveRankRecommendationProgressiveControlVisibility({
        readinessStage,
        hasStatusText: readinessStage !== "complete",
        targetMonthOptionCount: state === "loading" ? 0 : targetMonthControl.options.length
    });
    const rankOrderControl = {
        source: "manual_override",
        ladderJson: JSON.stringify([
            { code: "10", name: "10" },
            { code: "11", name: "11" },
            { code: "12", name: "12" }
        ]),
        summary: "ランク順序: 手動",
        summaryTitle: "高い順 10、11、12",
        inputValue: "10, 11, 12",
        status: "保存済み",
        saveButton: buildButton("保存", "rank-order-save"),
        reverseButton: buildButton("上下を反転", "rank-order-reverse"),
        resetButton: buildButton("リセット", "rank-order-reset")
    };
    return {
        signature: `fixture:${state}:${displayLimit}:${options.selectedCandidateKey ?? "none"}:${candidates.map((candidate) => candidate.key).join("|")}`,
        mode: "fixture",
        readinessStage,
        title: "今日の判断",
        metaText: buildMetaText(state, candidates.length, targetMonth, densePool.length),
        metaTitle: "カレンダーで日付感を保ち、右の判断レールと下の詳細で一件ずつ判断する fixture",
        calendarCueLegendText: resolveFixtureCalendarCueLegend(effectiveCalendarCuePolicy),
        emptyText,
        controls: {
            targetMonth: controlVisibility.targetMonth ? targetMonthControl : null,
            workState: controlVisibility.workState ? workStateControl : null,
            displayLimit: controlVisibility.displayLimit && state === "ready"
                ? {
                    showMoreButton: displayLimit < eligibleReadyCount && displayLimit < FIXTURE_MAX_DISPLAY_LIMIT
                        ? buildButton(
                            `さらに表示 (${Math.min(FIXTURE_DISPLAY_LIMIT_STEP, eligibleReadyCount - displayLimit)}件)`,
                            "display-more"
                        )
                        : null,
                    resetButton: displayLimit > FIXTURE_INITIAL_DISPLAY_LIMIT
                        ? buildButton("10件に戻す", "display-reset")
                        : null
                }
                : null,
            rankOrder: controlVisibility.rankOrder ? rankOrderControl : null
        },
        candidates
    };
}

export function buildAllFixtureSnapshots(): readonly RankRecommendationReactListSnapshot[] {
    return FIXTURE_STATES.map((state) => buildFixtureSnapshot(state.value));
}

export function buildFixtureCalendarCueAggregates(
    state: FixtureState,
    targetMonth = currentFixtureTargetMonth,
    policy: RankRecommendationCalendarCuePolicy = "visible_tasks",
    options: FixtureCalendarCueAggregateOptions = {}
): readonly {
    stayDateKey: string;
    dominantState: RankRecommendationWorkState;
    totalCount: number;
    stateCounts: Record<RankRecommendationWorkState, number>;
    label: string;
}[] {
    const effectivePolicy = resolveFixtureCalendarCuePolicy(state, policy);
    const visibleItems = (options.visibleCandidates ?? buildCandidatesForState(state, targetMonth, options)).map((candidate) => ({
        stayDateKey: candidate.stayDateKey,
        workState: candidate.workState,
        priority: candidate.priorityLabel.endsWith("高")
            ? "high" as const
            : candidate.priorityLabel.endsWith("中")
                ? "medium" as const
                : "low" as const
    }));
    const activeItems = state === "ready" ? buildDenseFixtureCalendarCueCandidates(targetMonth) : visibleItems;
    const cueItems = selectRankRecommendationCalendarCueItems({
        activeItems,
        visibleItems,
        policy: effectivePolicy
    });
    const statesByStayDate = new Map<string, RankRecommendationWorkState[]>();
    for (const candidate of cueItems) {
        const states = statesByStayDate.get(candidate.stayDateKey) ?? [];
        states.push(candidate.workState);
        statesByStayDate.set(candidate.stayDateKey, states);
    }
    return Array.from(statesByStayDate, ([stayDateKey, states]) => {
        const summary = buildRankRecommendationCalendarCueSummary(
            states,
            resolveFixtureCalendarCueSubjectLabel(effectivePolicy)
        );
        return {
            stayDateKey,
            dominantState: summary.dominantState,
            totalCount: summary.totalCount,
            stateCounts: summary.stateCounts,
            label: summary.label
        };
    });
}

function buildDenseFixtureCalendarCueCandidates(targetMonth: string): readonly {
    key: string;
    stayDateKey: string;
    workState: RankRecommendationWorkState;
    priority: "high" | "medium" | "low";
    ordinal: number;
}[] {
    const year = Number.parseInt(targetMonth.slice(0, 4), 10);
    const month = Number.parseInt(targetMonth.slice(4, 6), 10);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const highPriorityDays = new Set([2, 5, 8, 11, 14, 17, 20, 23, 24, 26, 28, 30]
        .filter((day) => day <= daysInMonth));
    return Array.from({ length: 146 }, (_, index) => {
        const day = index % daysInMonth + 1;
        const occurrence = Math.floor(index / daysInMonth);
        const priority = highPriorityDays.has(day) && occurrence < 2
            ? "high" as const
            : index % 3 === 0
                ? "low" as const
                : "medium" as const;
        const workState: RankRecommendationWorkState = priority === "high"
            ? "ready"
            : index % 11 === 0
                ? "recent_or_held"
                : index % 7 === 0
                    ? "needs_evidence"
                    : "ready";
        return {
            key: `fixture-dense:${targetMonth}:${index + 1}`,
            stayDateKey: `${targetMonth}${String(day).padStart(2, "0")}`,
            workState,
            priority,
            ordinal: index
        };
    });
}

function resolveFixtureCalendarCueSubjectLabel(policy: RankRecommendationCalendarCuePolicy): string {
    if (policy === "all_active") {
        return "対象月の全候補";
    }
    if (policy === "high_priority") {
        return "対象月の高優先候補";
    }
    return "今日の判断に表示中";
}

export function isFixtureCalendarCuePolicyComparisonAvailable(state: FixtureState): boolean {
    return state === "ready";
}

export function resolveFixtureCalendarCuePolicy(
    state: FixtureState,
    requestedPolicy: RankRecommendationCalendarCuePolicy
): RankRecommendationCalendarCuePolicy {
    return isFixtureCalendarCuePolicyComparisonAvailable(state) ? requestedPolicy : "visible_tasks";
}

export { renderRankRecommendationReactListElement };

function buildDenseFixtureTaskCandidates(targetMonth: string): RankRecommendationReactCandidateSnapshot[] {
    const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
    return [...buildDenseFixtureCalendarCueCandidates(targetMonth)]
        .filter((candidate) => candidate.workState === "ready")
        .sort((left, right) => (
            priorityWeight[left.priority] - priorityWeight[right.priority]
            || left.ordinal - right.ordinal
        ))
        .map((candidate, index) => {
            const stayDateLabel = formatFixtureStayDateLabel(candidate.stayDateKey);
            const roomGroupName = index === 0
                ? "キャンプ、ツインS"
                : ["スタンダードツイン", "ファミリールーム", "シングル", "和洋室"][index % 4]
                    ?? "スタンダードツイン";
            const individualCount = index === 0 ? 5 : 2 + index % 7;
            const groupCount = index === 0 ? 2 : index % 4;
            return buildCandidate({
                key: candidate.key,
                stayDateKey: candidate.stayDateKey,
                stayDateLabel,
                dateGroupLabel: stayDateLabel,
                roomGroupName,
                action: index % 3 === 1 ? "lower_watch" : "raise_watch",
                actionLabel: index % 3 === 1 ? "下げ注意" : "上げ検討",
                priorityLabel: candidate.priority === "high"
                    ? "優先度 高"
                    : candidate.priority === "medium"
                        ? "優先度 中"
                        : "優先度 低",
                currentRankText: String(8 + index % 5),
                recommendedRankText: String(7 + index % 5),
                occupancyText: index === 0 ? "OH 7 / キャパ 18" : `OH ${individualCount + groupCount} / キャパ 20`,
                individualText: String(individualCount),
                groupText: String(groupCount),
                reasonText: index === 0
                    ? "個人の予約ペースが基準を上回り、団体を除いても需要の強さを確認"
                    : "個人需要と団体需要を分けて確認した合成候補",
                evidenceStatusText: "個人・団体を直接取得 / 最新基準日あり"
            });
        });
}

function buildCandidatesForState(
    state: FixtureState,
    targetMonth: string,
    options: FixtureSnapshotOptions = {}
): RankRecommendationReactCandidateSnapshot[] {
    if (
        state === "loading"
        || state === "coverage-partial-empty"
        || state === "empty"
        || state === "current-settings-401"
        || state === "current-settings-403"
    ) {
        return [];
    }

    if (state === "ready") {
        const displayLimit = Math.min(
            FIXTURE_MAX_DISPLAY_LIMIT,
            Math.max(FIXTURE_INITIAL_DISPLAY_LIMIT, options.displayLimit ?? FIXTURE_INITIAL_DISPLAY_LIMIT)
        );
        const candidates = buildDenseFixtureTaskCandidates(targetMonth);
        return [...limitRankRecommendationItemsWithSelectedKey({
            items: candidates,
            limit: displayLimit,
            selectedKey: options.selectedCandidateKey ?? null,
            getKey: (candidate) => candidate.key
        })];
    }

    const baseOverrides: Partial<RankRecommendationReactCandidateSnapshot> = {};
    if (state === "missing-counts" || state === "coverage-unavailable") {
        Object.assign(baseOverrides, {
            evidenceReadiness: "missing" as const,
            workState: "needs_evidence" as const,
            occupancyText: "OH 未取得 / キャパ 未取得",
            individualText: "未取得",
            groupText: "未取得",
            reasonText: "個人・団体の内訳を取得できず、現時点では判断を確定できません",
            cautionText: "個人・団体の内訳を取得できていません",
            evidenceStatusText: "個人・団体は未取得 / 判断根拠の推移は未取得 / 未保存",
            snoozeButton: buildButton("様子見", "snooze", true),
            dismissButton: buildButton("対応不要", "dismiss", true)
        });
    }
    if (state === "zero-counts") {
        Object.assign(baseOverrides, {
            occupancyText: "OH 0 / キャパ 18",
            individualText: "0",
            groupText: "0"
        });
    }
    if (state === "large-counts") {
        Object.assign(baseOverrides, {
            occupancyText: "OH 118 / キャパ 240",
            individualText: "104",
            groupText: "14"
        });
    }
    if (state === "long-room-name") {
        Object.assign(baseOverrides, {
            roomGroupName: "本館高層階プレミアムコーナーツイン・エキストラベッド対応・禁煙"
        });
    }
    if (state === "decision-pending") {
        Object.assign(baseOverrides, {
            workState: "ready" as const,
            snoozeButton: buildButton("様子見", "snooze", true),
            dismissButton: buildButton("対応不要", "dismiss", true),
            pendingDecision: {
                key: "fixture-pending-decision",
                label: "様子見: 4秒後に確定",
                cancelButton: buildButton("取消", "decision-cancel")
            }
        });
    }
    if (state === "write-confirming") {
        Object.assign(baseOverrides, {
            workState: "recent_or_held" as const,
            snoozeButton: buildButton("様子見", "snooze", true),
            dismissButton: buildButton("対応不要", "dismiss", true),
            rankChangeResult: {
                status: "confirming",
                message: "送信は完了しました。Revenue Assistant の反映結果を確認中です。",
                title: "合成 fixture の確認中 state"
            }
        });
    }
    if (state === "write-success") {
        Object.assign(baseOverrides, {
            workState: "recent_or_held" as const,
            snoozeButton: buildButton("様子見", "snooze", true),
            dismissButton: buildButton("対応不要", "dismiss", true),
            rankChangeResult: {
                status: "success",
                message: "ランク 11 から 10 への反映を確認しました。",
                title: "合成 fixture の成功 state"
            }
        });
    }
    if (state === "write-failure") {
        Object.assign(baseOverrides, {
            workState: "needs_evidence" as const,
            rankChangeResult: {
                status: "failed",
                message: "反映結果を確認できませんでした。Revenue Assistant の現在値を確認してください。",
                title: "合成 fixture の失敗 state"
            }
        });
    }

    const candidateDateKeys = resolveFixtureCandidateDateKeys(targetMonth);
    const primaryDateLabel = formatFixtureStayDateLabel(candidateDateKeys.primary);
    const secondaryDateLabel = formatFixtureStayDateLabel(candidateDateKeys.secondary);
    const needsEvidenceDateLabel = formatFixtureStayDateLabel(candidateDateKeys.needsEvidence);
    const primary: RankRecommendationReactCandidateSnapshot = {
        ...buildCandidate({
            key: `fixture:${candidateDateKeys.primary}:camp-twin-s`,
            stayDateKey: candidateDateKeys.primary,
            stayDateLabel: primaryDateLabel,
            dateGroupLabel: primaryDateLabel,
            roomGroupName: "キャンプ、ツインS",
            action: "raise_watch",
            actionLabel: "上げ検討",
            currentRankText: "11",
            recommendedRankText: "10",
            occupancyText: "OH 7 / キャパ 18",
            individualText: "5",
            groupText: "2",
            reasonText: "個人の予約ペースが基準を上回り、団体を除いても需要の強さを確認",
            evidenceStatusText: "個人・団体を直接取得 / 最新基準日あり"
        }),
        ...baseOverrides
    };

    if (state === "first-task" || state === "coverage-partial") {
        return [{
            ...primary,
            chartKey: `${primary.chartKey}:pending`,
            evidenceReadiness: "pending",
            evidenceStatusText: "個人・団体を直接取得 / 判断根拠の推移を取得中",
            confirmButton: { ...primary.confirmButton, disabled: true },
            snoozeButton: { ...primary.snoozeButton, disabled: true },
            dismissButton: { ...primary.dismissButton, disabled: true }
        }];
    }
    if (state === "coverage-unavailable") {
        return [{
            ...primary,
            workState: "needs_evidence",
            action: "watch",
            actionLabel: "要確認",
            recommendedRankText: "未確定",
            confirmButton: { ...primary.confirmButton, disabled: true }
        }];
    }
    if (
        state === "needs-evidence"
        || state === "missing-counts"
        || state === "write-failure"
    ) {
        return [
            {
                ...primary,
                workState: "needs_evidence",
                action: "watch",
                actionLabel: "要確認",
                recommendedRankText: "未確定",
                cautionText: primary.cautionText ?? "基準線が不足しているためランク変更はまだ確定できません",
                evidenceStatusText: state === "missing-counts"
                    ? primary.evidenceStatusText
                    : "季節基準線は未取得 / 現在値のみ取得",
                confirmButton: { ...primary.confirmButton, disabled: true }
            },
            buildCandidate({
                key: `fixture:${candidateDateKeys.needsEvidence}:single`,
                stayDateKey: candidateDateKeys.needsEvidence,
                stayDateLabel: needsEvidenceDateLabel,
                dateGroupLabel: needsEvidenceDateLabel,
                roomGroupName: "シングル",
                workState: "needs_evidence",
                action: "lower_watch",
                actionLabel: "下げ注意",
                currentRankText: "9",
                recommendedRankText: "10",
                occupancyText: "OH 2 / キャパ 24",
                individualText: "2",
                groupText: "0",
                reasonText: "個人の予約ペースが基準を下回るが、競合価格の部屋タイプ対応は未確認",
                cautionText: "競合価格の部屋タイプ対応未確認",
                evidenceStatusText: "個人・団体を直接取得 / 競合対応は要確認"
            })
        ];
    }

    if (state === "recent" || state === "decision-pending" || state === "write-confirming" || state === "write-success") {
        return [{
            ...primary,
            workState: state === "decision-pending" ? "ready" : "recent_or_held",
            latestChangeText: state === "decision-pending" ? "前回変更 なし" : "前回変更 2日前・11から10",
            confirmButton: {
                ...primary.confirmButton,
                disabled: true
            }
        }];
    }

    return [
        primary,
        buildCandidate({
            key: `fixture:${candidateDateKeys.secondary}:standard-twin`,
            stayDateKey: candidateDateKeys.secondary,
            stayDateLabel: secondaryDateLabel,
            dateGroupLabel: secondaryDateLabel,
            roomGroupName: "スタンダードツイン",
            action: "lower_watch",
            actionLabel: "下げ注意",
            currentRankText: "8",
            recommendedRankText: "9",
            occupancyText: "OH 3 / キャパ 20",
            individualText: "3",
            groupText: "0",
            reasonText: "個人の予約ペースが基準を下回り、団体要因はありません",
            evidenceStatusText: "個人・団体を直接取得 / 最新基準日あり"
        }),
        buildCandidate({
            key: `fixture:${candidateDateKeys.secondary}:family`,
            stayDateKey: candidateDateKeys.secondary,
            stayDateLabel: secondaryDateLabel,
            dateGroupLabel: secondaryDateLabel,
            roomGroupName: "ファミリールーム",
            action: "raise_watch",
            actionLabel: "上げ検討",
            currentRankText: "12",
            recommendedRankText: "11",
            occupancyText: "OH 12 / キャパ 16",
            individualText: "7",
            groupText: "5",
            reasonText: "個人需要を直接確認し、団体比率も許容範囲内",
            evidenceStatusText: "個人・団体を直接取得 / 最新基準日あり"
        })
    ];
}

function resolveFixtureCandidateDateKeys(
    targetMonth: string
): (typeof FIXTURE_CANDIDATE_DATE_KEYS_BY_MONTH)[keyof typeof FIXTURE_CANDIDATE_DATE_KEYS_BY_MONTH] {
    if (targetMonth in FIXTURE_CANDIDATE_DATE_KEYS_BY_MONTH) {
        return FIXTURE_CANDIDATE_DATE_KEYS_BY_MONTH[
            targetMonth as keyof typeof FIXTURE_CANDIDATE_DATE_KEYS_BY_MONTH
        ];
    }
    return FIXTURE_CANDIDATE_DATE_KEYS_BY_MONTH["202607"];
}

function buildCandidate(
    overrides: Partial<RankRecommendationReactCandidateSnapshot> & Pick<
        RankRecommendationReactCandidateSnapshot,
        | "key"
        | "stayDateKey"
        | "stayDateLabel"
        | "dateGroupLabel"
        | "roomGroupName"
        | "action"
        | "actionLabel"
        | "currentRankText"
        | "recommendedRankText"
        | "occupancyText"
        | "individualText"
        | "groupText"
        | "reasonText"
        | "evidenceStatusText"
    >
): RankRecommendationReactCandidateSnapshot {
    const confirmButton = buildRankChangeButton({
        candidateKey: overrides.key,
        stayDateKey: overrides.stayDateKey,
        roomGroupName: overrides.roomGroupName,
        currentRank: overrides.currentRankText,
        targetRank: overrides.recommendedRankText
    });
    return {
        chartKey: `${overrides.key}:chart`,
        evidenceReadiness: "complete",
        workState: "ready",
        priorityLabel: "優先度 高",
        confidenceLabel: "高",
        currentRankCode: overrides.currentRankText === "未取得" ? null : overrides.currentRankText,
        sourceText: "最新基準日あり・基準日 2026-07-17",
        latestChangeText: "前回変更 なし",
        cautionText: null,
        rankOptions: buildFixtureRankOptions(overrides.currentRankText, overrides.recommendedRankText),
        selectedRankCode: overrides.recommendedRankText === "未確定" ? null : overrides.recommendedRankText,
        analyzeLink: {
            href: `/analyze/${formatFixtureStayDatePath(overrides.stayDateKey)}`,
            text: "Analyzeで詳しく見る",
            attrs: {
                "data-ra-rank-recommendation-button": "",
                "data-ra-rank-recommendation-button-action": "analyze"
            }
        },
        confirmButton,
        snoozeButton: buildButton("様子見", "snooze"),
        dismissButton: buildButton("対応不要", "dismiss"),
        pendingDecision: null,
        rankChangeResult: null,
        ...overrides,
        evidenceRetryAvailable: overrides.evidenceRetryAvailable ?? false
    };
}

function buildButton(
    text: string,
    action: string,
    disabled = false
): RankRecommendationReactButtonSnapshot {
    return {
        text,
        disabled,
        attrs: {
            "data-ra-rank-recommendation-button": "",
            "data-ra-rank-recommendation-button-action": action
        }
    };
}

function buildRankChangeButton(options: {
    candidateKey: string;
    stayDateKey: string;
    roomGroupName: string;
    currentRank: string;
    targetRank: string;
}): RankRecommendationReactButtonSnapshot {
    return {
        text: "この内容で変更する",
        title: "合成 fixture の明示確定。外部 API へは接続しません。",
        disabled: options.targetRank === "未確定",
        attrs: {
            "data-ra-rank-recommendation-button": "",
            "data-ra-rank-recommendation-button-action": "rank-change-submit",
            "data-ra-rank-recommendation-facility-id": "fixture-hotel",
            "data-ra-rank-recommendation-stay-date": options.stayDateKey,
            "data-ra-rank-recommendation-as-of-date": "20260717",
            "data-ra-rank-recommendation-room-group-id": options.candidateKey,
            "data-ra-rank-recommendation-room-group-name": options.roomGroupName,
            "data-ra-rank-recommendation-reason-fingerprint": `fixture-reason:${options.candidateKey}`,
            "data-ra-rank-recommendation-confidence-level": "high",
            "data-ra-rank-recommendation-rank-change-generated-at": "2026-07-17T09:00:00.000Z",
            "data-ra-rank-recommendation-rank-change-disabled-reasons": "",
            "data-ra-rank-recommendation-rank-change-current-code": options.currentRank,
            "data-ra-rank-recommendation-rank-change-current-name": options.currentRank,
            "data-ra-rank-recommendation-rank-change-target-code": options.targetRank,
            "data-ra-rank-recommendation-rank-change-target-name": options.targetRank
        }
    };
}

function buildFixtureRankOptions(
    currentRank: string,
    targetRank: string
): readonly { code: string; name: string }[] {
    const currentValue = Number(currentRank);
    const targetValue = Number(targetRank);
    if (Number.isFinite(currentValue) && Number.isFinite(targetValue)) {
        const start = Math.max(1, Math.min(currentValue, targetValue) - 1);
        const end = Math.max(currentValue, targetValue) + 1;
        return Array.from({ length: end - start + 1 }, (_, index) => String(start + index))
            .map((value) => ({ code: value, name: value }));
    }
    return Array.from(new Set([targetRank, currentRank].filter((value) => value !== "未確定")))
        .map((value) => ({ code: value, name: value }));
}

function formatFixtureStayDatePath(stayDateKey: string): string {
    return /^\d{8}$/.test(stayDateKey)
        ? `${stayDateKey.slice(0, 4)}-${stayDateKey.slice(4, 6)}-${stayDateKey.slice(6, 8)}`
        : stayDateKey;
}

function formatFixtureStayDateLabel(stayDateKey: string): string {
    const year = Number(stayDateKey.slice(0, 4));
    const month = Number(stayDateKey.slice(4, 6));
    const day = Number(stayDateKey.slice(6, 8));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][
        new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    ];
    return `${formatFixtureStayDatePath(stayDateKey)}（${weekday}）`;
}

function resolveFixtureWorkState(state: FixtureState): RankRecommendationWorkState {
    if (
        state === "needs-evidence"
        || state === "missing-counts"
        || state === "coverage-unavailable"
        || state === "write-failure"
    ) {
        return "needs_evidence";
    }
    if (state === "recent" || state === "write-confirming" || state === "write-success") {
        return "recent_or_held";
    }
    return "ready";
}

function getEmptyTextForState(state: FixtureState): string | null {
    if (state === "empty") {
        return "現在の判断状態に該当する料金調整候補はありません";
    }
    return null;
}

function buildMetaText(
    state: FixtureState,
    count: number,
    targetMonth: string,
    totalCandidateCount = count
): string {
    const year = Number.parseInt(targetMonth.slice(0, 4), 10);
    const month = Number.parseInt(targetMonth.slice(4, 6), 10);
    const targetLabel = `${year}年${month}月`;
    if (state === "loading") {
        return "判断データを準備しています。カレンダーはそのまま操作できます。";
    }
    if (state === "first-task") {
        return `${targetLabel}の候補判定は完了しました。選択中の推移グラフを準備しています。`;
    }
    if (state === "coverage-partial" || state === "coverage-partial-empty" || state === "coverage-unavailable") {
        return formatRankRecommendationCoverageStatus({
            targetLabel,
            coverageCounts: {
                total: 31,
                covered: state === "coverage-unavailable" ? 31 : 1,
                complete: state === "coverage-unavailable"
            },
            candidateCount: count,
            visibleCandidateCount: count,
            unavailableDayCount: state === "coverage-unavailable" ? 1 : 0,
            selectedEvidenceReadiness: state === "coverage-partial"
                ? "pending"
                : state === "coverage-unavailable"
                    ? "missing"
                    : null
        });
    }
    if (state === "missing-counts") {
        return `${targetLabel}の候補判定は完了しました。選択中の推移グラフを取得できませんでした。`;
    }
    if (state === "ready") {
        return `候補${totalCandidateCount}件が見つかっています（現在${count}件表示） / 基準日 7月17日 / 個人・団体を分離表示`;
    }
    if (state === "current-settings-401") {
        return "候補の現在設定を取得できませんでした（HTTP 401）。ログイン状態を確認してください。";
    }
    if (state === "current-settings-403") {
        return "候補の現在設定を取得できませんでした（HTTP 403）。施設権限を確認してください。";
    }
    return `${count}件 / 基準日 7月17日 / 個人・団体を分離表示`;
}

function renderFixtureCalendars(calendarStripElement: HTMLElement): void {
    calendarStripElement.replaceChildren(...FIXTURE_CALENDAR_MONTHS.map((monthKey) => createFixtureMonthCalendar(monthKey)));
}

function createFixtureMonthCalendar(monthKey: string): HTMLElement {
    const year = Number.parseInt(monthKey.slice(0, 4), 10);
    const monthIndex = Number.parseInt(monthKey.slice(4, 6), 10) - 1;
    const monthElement = document.createElement("section");
    monthElement.setAttribute("data-testid", "monthly-calendar");
    monthElement.setAttribute("data-ra-fixture-calendar", "");
    monthElement.setAttribute("aria-label", `${year}年${monthIndex + 1}月カレンダー`);

    const headerElement = document.createElement("header");
    headerElement.setAttribute("data-ra-fixture-calendar-header", "");
    headerElement.textContent = `${year}年${monthIndex + 1}月`;

    const gridElement = document.createElement("div");
    gridElement.setAttribute("data-ra-fixture-calendar-grid", "");
    for (const weekday of ["日", "月", "火", "水", "木", "金", "土"]) {
        const weekdayElement = document.createElement("div");
        weekdayElement.setAttribute("data-ra-fixture-weekday", "");
        weekdayElement.textContent = weekday;
        gridElement.append(weekdayElement);
    }

    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    for (let index = 0; index < firstWeekday; index += 1) {
        const blankElement = document.createElement("div");
        blankElement.setAttribute("data-ra-fixture-calendar-blank", "");
        gridElement.append(blankElement);
    }

    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
        gridElement.append(createFixtureCalendarCell(year, monthIndex + 1, day));
    }

    monthElement.append(headerElement, gridElement);
    return monthElement;
}

function createFixtureCalendarCell(year: number, month: number, day: number): HTMLElement {
    const dateWithHyphen = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const compactDate = dateWithHyphen.replaceAll("-", "");
    const roomCount = 2 + ((day * 3 + month) % 11);
    const groupCount = day % 5 === 0 ? 0 : (day + month) % 4;
    const cellElement = document.createElement("div");
    cellElement.setAttribute("data-ra-fixture-calendar-slot", "");
    const anchorElement = document.createElement("a");
    anchorElement.href = "#";
    anchorElement.setAttribute("data-testid", `calendar-date-${dateWithHyphen}`);
    anchorElement.setAttribute("data-ra-fixture-calendar-cell", "");
    anchorElement.setAttribute("data-ra-fixture-stay-date", compactDate);
    anchorElement.setAttribute("data-ra-fixture-stay-month", compactDate.slice(0, 6));
    if (FIXTURE_NATIVE_HIGHLIGHT_DATES.has(compactDate)) {
        anchorElement.setAttribute("data-ra-fixture-native-highlight", "");
    }

    const dateElement = document.createElement("span");
    dateElement.setAttribute("data-ra-fixture-date", "");
    dateElement.textContent = String(day);

    const roomLineElement = document.createElement("span");
    roomLineElement.setAttribute("data-ra-fixture-room-line", "");
    const roomElement = document.createElement("span");
    roomElement.setAttribute("data-testid", `room-num-${dateWithHyphen}`);
    roomElement.setAttribute("data-ra-fixture-room", "");
    roomElement.textContent = String(roomCount);
    const groupElement = document.createElement("span");
    groupElement.setAttribute("data-ra-fixture-group", "");
    groupElement.textContent = `団${groupCount}`;
    roomLineElement.append(roomElement, groupElement);

    const nativeDescriptionElement = document.createElement("span");
    const nativeDescriptionId = `fixture-native-calendar-description-${compactDate}`;
    nativeDescriptionElement.id = nativeDescriptionId;
    nativeDescriptionElement.setAttribute("data-ra-fixture-native-description", "");
    nativeDescriptionElement.textContent = "Revenue Assistant 標準カレンダー値";
    anchorElement.setAttribute("aria-describedby", nativeDescriptionId);
    anchorElement.append(dateElement, roomLineElement);
    cellElement.append(anchorElement, nativeDescriptionElement);
    return cellElement;
}

function installFixtureWorkspaceLayoutObserver(parentElement: HTMLElement, calendarElement: HTMLElement): void {
    const syncLayout = (): void => {
        const monthlyCalendarElements = Array.from(
            calendarElement.querySelectorAll<HTMLElement>(':scope > [data-testid="monthly-calendar"]')
        );
        const monthlyMinimumWidths = monthlyCalendarElements.map((element) => {
            const minWidth = window.getComputedStyle(element).minWidth;
            if (!minWidth.endsWith("px")) {
                return null;
            }
            const parsed = Number.parseFloat(minWidth);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        });
        const calendarMinimumWidth = monthlyMinimumWidths.some((minWidth) => minWidth === null)
            ? 0
            : monthlyMinimumWidths.reduce<number>((total, minWidth) => total + (minWidth ?? 0), 0);
        const mode = resolveRankRecommendationWorkspaceLayoutMode({
            containerWidth: parentElement.getBoundingClientRect().width,
            calendarMinimumWidth,
            calendarMonthCount: monthlyCalendarElements.length,
            structureSafe: calendarElement.parentElement === parentElement
                && monthlyCalendarElements.length === FIXTURE_CALENDAR_MONTHS.length
                && parentElement.querySelector(':scope > [data-ra-rank-recommendation-list]') !== null
                && parentElement.querySelector(':scope > [data-ra-rank-recommendation-detail]') !== null
        });
        parentElement.setAttribute("data-ra-rank-recommendation-workspace-layout", mode);
    };
    const resizeObserver = new ResizeObserver(syncLayout);
    resizeObserver.observe(parentElement);
    resizeObserver.observe(calendarElement);
    syncLayout();
}

function syncFixtureCalendarMarkers(
    state: FixtureState,
    policy: RankRecommendationCalendarCuePolicy,
    summaryElement: HTMLElement,
    visibleCandidates: readonly RankRecommendationReactCandidateSnapshot[]
): void {
    cleanupFixtureCalendarMarkers();
    const effectivePolicy = resolveFixtureCalendarCuePolicy(state, policy);
    const cues = buildFixtureCalendarCueAggregates(
        state,
        currentFixtureTargetMonth,
        effectivePolicy,
        {
            displayLimit: currentFixtureDisplayLimit,
            selectedCandidateKey: currentFixtureSelectedCandidateKey,
            visibleCandidates
        }
    );
    const totalCandidateCount = cues.reduce((total, cue) => total + cue.totalCount, 0);
    const scopeLabel = effectivePolicy === "all_active"
        ? "全 active"
        : effectivePolicy === "high_priority"
            ? "高優先"
            : "表示中 task";
    const correspondenceLabel = effectivePolicy === "visible_tasks"
        ? "。rail と cue は同じ候補集合です"
        : "。比較用の候補集合です";
    summaryElement.textContent = `${scopeLabel}: ${totalCandidateCount}候補 / ${cues.length}日${correspondenceLabel}`;
    const cueByStayDate = new Map(
        cues.map((cue) => [cue.stayDateKey, cue] as const)
    );
    document.querySelectorAll<HTMLElement>("[data-ra-fixture-calendar-cell]").forEach((element) => {
        const stayDate = element.getAttribute("data-ra-fixture-stay-date");
        const cue = stayDate === null ? undefined : cueByStayDate.get(stayDate);
        if (stayDate === null || cue === undefined) {
            return;
        }
        element.setAttribute(FIXTURE_CALENDAR_STATE_ATTRIBUTE, cue.dominantState);
        const cueElement = document.createElement("span");
        cueElement.setAttribute(FIXTURE_CALENDAR_CUE_ATTRIBUTE, "");
        cueElement.setAttribute("aria-hidden", "true");
        const descriptionElement = document.createElement("span");
        const descriptionId = `fixture-rank-calendar-description-${stayDate}`;
        descriptionElement.id = descriptionId;
        descriptionElement.setAttribute(FIXTURE_CALENDAR_DESCRIPTION_ATTRIBUTE, "");
        descriptionElement.textContent = cue.label;
        const describedByTokens = (element.getAttribute("aria-describedby") ?? "")
            .split(/\s+/u)
            .filter((token) => token !== "");
        describedByTokens.push(descriptionId);
        const descriptionHost = element.closest<HTMLElement>('[data-testid="monthly-calendar"]')
            ?? element.parentElement;
        if (descriptionHost === null) {
            return;
        }
        descriptionHost.append(descriptionElement);
        element.setAttribute("aria-describedby", describedByTokens.join(" "));
        element.setAttribute(FIXTURE_CALENDAR_DESCRIBEDBY_TOKEN_ATTRIBUTE, descriptionId);
        element.append(cueElement);
    });
}

export function resolveFixtureCalendarCueLegend(policy: RankRecommendationCalendarCuePolicy): string {
    if (policy === "all_active") {
        return "カレンダー左線：対象月の全候補日（比較）";
    }
    if (policy === "high_priority") {
        return "カレンダー左線：対象月の高優先候補日（比較）";
    }
    return "カレンダー左線：今日の判断に表示中の候補日";
}

function cleanupFixtureCalendarMarkers(): void {
    document.querySelectorAll<HTMLElement>(`[${FIXTURE_CALENDAR_DESCRIBEDBY_TOKEN_ATTRIBUTE}]`).forEach((element) => {
        const addedToken = element.getAttribute(FIXTURE_CALENDAR_DESCRIBEDBY_TOKEN_ATTRIBUTE);
        const remainingTokens = (element.getAttribute("aria-describedby") ?? "")
            .split(/\s+/u)
            .filter((token) => token !== "" && token !== addedToken);
        if (remainingTokens.length === 0) {
            element.removeAttribute("aria-describedby");
        } else {
            element.setAttribute("aria-describedby", remainingTokens.join(" "));
        }
        element.removeAttribute(FIXTURE_CALENDAR_DESCRIBEDBY_TOKEN_ATTRIBUTE);
    });
    document.querySelectorAll<HTMLElement>(`[${FIXTURE_CALENDAR_CUE_ATTRIBUTE}], [${FIXTURE_CALENDAR_DESCRIPTION_ATTRIBUTE}]`).forEach((element) => {
        element.remove();
    });
    document.querySelectorAll<HTMLElement>(`[${FIXTURE_CALENDAR_STATE_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(FIXTURE_CALENDAR_STATE_ATTRIBUTE);
    });
}

function renderFixtureEvidence(container: HTMLElement, state: FixtureState): void {
    if (state === "first-task" || state === "coverage-partial") {
        const status = document.createElement("p");
        status.setAttribute("data-ra-fixture-evidence-loading", "");
        status.textContent = "グラフを準備しています。";
        container.replaceChildren(status);
        return;
    }
    const figure = document.createElement("figure");
    figure.setAttribute("data-ra-fixture-booking-curve", "");

    const canvas = document.createElement("canvas");
    canvas.width = 760;
    canvas.height = 220;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "個人と団体を分けたブッキングカーブの合成データ");

    const caption = document.createElement("figcaption");
    caption.textContent = state === "missing-counts"
        ? "内訳データを取得できないため、推測線は表示しません。"
        : "青: 個人、橙: 団体、灰: 基準。室数は合成データです。";

    figure.append(canvas, caption);
    container.replaceChildren(figure);
    if (state === "missing-counts" || state === "coverage-unavailable") {
        return;
    }
    drawFixtureBookingCurve(canvas, state);
}

function drawFixtureBookingCurve(canvas: HTMLCanvasElement, state: FixtureState): void {
    const context = canvas.getContext("2d");
    if (context === null) {
        return;
    }
    const width = canvas.width;
    const height = canvas.height;
    const padding = { left: 42, right: 20, top: 18, bottom: 34 };
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#d9e1ea";
    context.lineWidth = 1;
    for (let index = 0; index <= 4; index += 1) {
        const y = padding.top + ((height - padding.top - padding.bottom) * index) / 4;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
    }

    const scale = state === "large-counts" ? 12 : 1;
    const individual = [1, 1, 2, 2, 3, 4, 5].map((value) => value * scale);
    const group = [0, 0, 0, 1, 1, 2, 2].map((value) => value * scale);
    const reference = [1, 1.5, 2, 2.8, 3.8, 4.8, 6].map((value) => value * scale);
    const maxValue = Math.max(...individual, ...group, ...reference, 1);
    drawFixtureSeries(context, reference, "#98a4b1", width, height, padding, maxValue, [5, 4]);
    drawFixtureSeries(context, individual, "#2d6da8", width, height, padding, maxValue);
    drawFixtureSeries(context, group, "#c28333", width, height, padding, maxValue);

    context.fillStyle = "#6c7b8c";
    context.font = "700 20px sans-serif";
    context.fillText("90日前", padding.left, height - 8);
    context.fillText("当日", width - padding.right - 42, height - 8);
}

function drawFixtureSeries(
    context: CanvasRenderingContext2D,
    values: readonly number[],
    color: string,
    width: number,
    height: number,
    padding: { left: number; right: number; top: number; bottom: number },
    maxValue: number,
    dash: readonly number[] = []
): void {
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.setLineDash([...dash]);
    context.beginPath();
    values.forEach((value, index) => {
        const x = padding.left + (plotWidth * index) / Math.max(1, values.length - 1);
        const y = padding.top + plotHeight - (plotHeight * value) / maxValue;
        if (index === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    });
    context.stroke();
    context.restore();
}

function installFixtureStyles(): void {
    const style = document.createElement("style");
    style.textContent = `${RANK_RECOMMENDATION_WORKSPACE_STYLES}\n${getRankRecommendationFixtureShellStyles()}`;
    document.head.append(style);
}

export function getRankRecommendationFixtureShellStyles(): string {
    return `
    :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Yu Gothic UI", sans-serif;
        background: #eef2f6;
        color: #263444;
    }

    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f6; }

    [data-ra-fixture-app-header] {
        display: flex;
        align-items: center;
        min-height: 58px;
        padding: 0 24px;
        background: #1767a5;
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(23, 55, 84, 0.18);
    }

    [data-ra-fixture-brand] {
        font-size: 18px;
        font-weight: 850;
        letter-spacing: 0.01em;
    }

    [data-ra-fixture-nav] {
        display: flex;
        gap: 22px;
        margin-left: 44px;
        font-size: 12px;
        font-weight: 750;
    }

    [data-ra-fixture-shell] {
        width: min(1500px, calc(100% - 32px));
        margin: 18px auto 50px;
    }

    [data-ra-fixture-native-parent][data-ra-rank-recommendation-workspace-layout="stacked"] {
        display: flex;
        min-width: 0;
        flex-direction: column;
    }

    [data-ra-fixture-toolbar] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 12px;
        padding: 11px 14px;
        border: 1px solid #d5dee8;
        border-radius: 9px;
        background: #ffffff;
    }

    [data-ra-fixture-toolbar] h1 {
        margin: 0;
        font-size: 16px;
        font-weight: 850;
    }

    [data-ra-fixture-toolbar] p {
        margin: 2px 0 0;
        color: #687789;
        font-size: 11px;
        font-weight: 700;
    }

    [data-ra-fixture-toolbar] [data-ra-fixture-cue-policy-summary] {
        color: #385069;
    }

    [data-ra-fixture-toolbar] label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #596b7e;
        font-size: 11px;
        font-weight: 800;
    }

    [data-ra-fixture-toolbar] select {
        min-height: 34px;
        padding: 5px 9px;
        border: 1px solid #aebdce;
        border-radius: 7px;
        background: #ffffff;
        color: #263444;
        font: inherit;
        font-weight: 750;
    }

    [data-ra-fixture-toolbar-actions],
    [data-testid="segmented-control"] {
        display: flex;
        align-items: center;
        gap: 7px;
    }

    [data-ra-fixture-toolbar-actions] {
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    [data-testid="segmented-control"] button,
    [data-ra-fixture-native-control] button {
        min-height: 32px;
        padding: 5px 10px;
        border: 1px solid #aebdce;
        border-radius: 7px;
        background: #ffffff;
        color: #385069;
        font: inherit;
        font-size: 11px;
        font-weight: 800;
    }

    [data-ra-fixture-calendar-strip] {
        display: flex;
        min-width: 0;
        overflow-x: auto;
    }

    [data-ra-fixture-calendar] {
        flex: 1 0 auto;
        min-width: 360px;
        overflow: hidden;
        border: 1px solid #d4dde7;
        border-radius: 0;
        background: #ffffff;
    }

    [data-ra-fixture-calendar]:first-child {
        border-radius: 10px 0 0 10px;
    }

    [data-ra-fixture-calendar]:last-child {
        border-radius: 0 10px 10px 0;
    }

    [data-ra-fixture-calendar-header] {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        border-bottom: 1px solid #dfe5ec;
        color: #2c3f54;
        font-size: 14px;
        font-weight: 850;
    }

    [data-ra-fixture-calendar-grid] {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
    }

    [data-ra-fixture-weekday] {
        padding: 7px 5px;
        border-right: 1px solid #e3e8ee;
        border-bottom: 1px solid #e3e8ee;
        background: #f6f8fb;
        color: #6a7888;
        font-size: 10px;
        font-weight: 850;
        text-align: center;
    }

    [data-ra-fixture-calendar-slot] {
        position: relative;
        min-height: 62px;
        border-right: 1px solid #e4e9ef;
        border-bottom: 1px solid #e4e9ef;
        background: #ffffff;
    }

    [data-ra-fixture-calendar-cell] {
        position: absolute;
        inset: 0;
        display: grid;
        align-content: space-between;
        padding: 6px;
        border: 0;
        background: transparent;
        color: #28394c;
        text-decoration: none;
    }

    [data-ra-fixture-calendar-blank] { min-height: 62px; border-right: 1px solid #e4e9ef; border-bottom: 1px solid #e4e9ef; background: #fafbfd; }
    [data-ra-fixture-native-highlight] { box-shadow: inset 0 0 0 2px #6a8db2; }
    [data-ra-fixture-date] { font-size: 11px; font-weight: 800; }
    [data-ra-fixture-room-line] { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 850; }
    [data-ra-fixture-room] { color: #28394c; }
    [data-ra-fixture-group] { color: #2367a7; font-size: 10px; font-weight: 850; }

    [data-ra-fixture-native-description] {
        position: absolute;
        top: 0;
        left: 0;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    [data-ra-fixture-native-control],
    [data-ra-fixture-native-status],
    [data-ra-fixture-native-footer] {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px solid #d5dee8;
        border-radius: 8px;
        background: #ffffff;
        color: #596b7e;
        font-size: 11px;
        font-weight: 750;
    }

    [data-ra-fixture-native-control] {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    [data-ra-fixture-booking-curve] { display: grid; gap: 5px; margin: 0; }
    [data-ra-fixture-booking-curve] canvas { display: block; width: 100%; height: auto; border: 1px solid #e0e6ed; border-radius: 7px; }
    [data-ra-fixture-booking-curve] figcaption { color: #647386; font-size: 10px; font-weight: 700; line-height: 1.45; }

    @media (max-width: 760px) {
        [data-ra-fixture-app-header] { padding: 0 14px; }
        [data-ra-fixture-nav] { display: none; }
        [data-ra-fixture-shell] { width: min(100% - 16px, 720px); margin-top: 8px; }
        [data-ra-fixture-toolbar] { align-items: stretch; flex-direction: column; }
        [data-ra-fixture-toolbar-actions] { align-items: stretch; flex-direction: column; }
        [data-ra-fixture-calendar] { min-width: 360px; }
    }
    `;
}
