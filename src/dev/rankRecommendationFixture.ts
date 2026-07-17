import {
    renderRankRecommendationReactListElement,
    syncRankRecommendationReactList,
    type RankRecommendationReactButtonSnapshot,
    type RankRecommendationReactCandidateSnapshot,
    type RankRecommendationReactListSnapshot
} from "../rankRecommendationReactIsland";
import { RANK_RECOMMENDATION_WORKSPACE_STYLES } from "../rankRecommendationWorkspaceStyles";
import type { RankRecommendationWorkState } from "../rankRecommendationWorkspaceModel";
import { resolveRankRecommendationWorkspaceLayoutMode } from "../rankRecommendationWorkspaceLayout";

type FixtureState =
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
const FIXTURE_CANDIDATE_DATES = new Set(["20260723", "20260724", "20260805", "20260812", "20260908", "20260918"]);
const FIXTURE_NATIVE_HIGHLIGHT_DATES = new Set(["20260723", "20260805", "20260908"]);
const FIXTURE_CALENDAR_CUE_ATTRIBUTE = "data-ra-rank-recommendation-calendar-cue";
const FIXTURE_CALENDAR_DESCRIPTION_ATTRIBUTE = "data-ra-rank-recommendation-calendar-description";
const FIXTURE_CALENDAR_STATE_ATTRIBUTE = "data-ra-rank-recommendation-calendar-state";
const FIXTURE_CALENDAR_DESCRIBEDBY_TOKEN_ATTRIBUTE = "data-ra-rank-recommendation-calendar-describedby-token";

let currentFixtureState: FixtureState = "ready";
let currentFixtureTargetMonth = "202607";
let fixtureWritePostCount = 0;
let fixtureSuccessTimeoutId: number | null = null;

if (typeof document !== "undefined") {
    const rootElement = document.getElementById("rank-fixture-root");
    const detailElement = document.getElementById("rank-fixture-detail");
    const stateSelectElement = document.getElementById("rank-fixture-state");
    const nativeParentElement = document.querySelector<HTMLElement>("[data-ra-fixture-native-parent]");
    const calendarStripElement = document.querySelector<HTMLElement>("[data-ra-fixture-calendar-strip]");

    if (!(rootElement instanceof HTMLElement)
        || !(detailElement instanceof HTMLElement)
        || !(stateSelectElement instanceof HTMLSelectElement)
        || !(nativeParentElement instanceof HTMLElement)
        || !(calendarStripElement instanceof HTMLElement)) {
        throw new Error("Rank recommendation fixture root is missing.");
    }

    installFixtureStyles();
    renderFixtureCalendars(calendarStripElement);
    installFixtureWorkspaceLayoutObserver(nativeParentElement, calendarStripElement);
    installStateOptions(stateSelectElement);
    renderFixture(rootElement, detailElement, stateSelectElement, currentFixtureState);

    stateSelectElement.addEventListener("change", () => {
        if (fixtureSuccessTimeoutId !== null) {
            window.clearTimeout(fixtureSuccessTimeoutId);
            fixtureSuccessTimeoutId = null;
        }
        currentFixtureState = stateSelectElement.value as FixtureState;
        renderFixture(rootElement, detailElement, stateSelectElement, currentFixtureState);
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
            stateSelectElement.value = currentFixtureState;
            renderFixture(rootElement, detailElement, stateSelectElement, currentFixtureState);
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
            renderFixture(rootElement, detailElement, stateSelectElement, currentFixtureState);
            return;
        }

        const decisionCancelButton = target.closest<HTMLElement>(
            '[data-ra-rank-recommendation-button-action="decision-cancel"]'
        );
        if (decisionCancelButton !== null) {
            event.preventDefault();
            currentFixtureState = "ready";
            stateSelectElement.value = currentFixtureState;
            renderFixture(rootElement, detailElement, stateSelectElement, currentFixtureState);
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
            renderFixture(rootElement, detailElement, stateSelectElement, currentFixtureState);
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
                renderFixture(rootElement, detailElement, stateSelectElement, currentFixtureState);
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

function renderFixture(
    rootElement: HTMLElement,
    detailElement: HTMLElement,
    stateSelectElement: HTMLSelectElement,
    state: FixtureState
): void {
    stateSelectElement.value = state;
    rootElement.setAttribute("data-ra-fixture-write-post-count", String(fixtureWritePostCount));
    syncRankRecommendationReactList(rootElement, buildFixtureSnapshot(state), {
        detailContainer: detailElement,
        actions: {
            hydrateEvidence: (_candidateKey, container) => renderFixtureEvidence(container, state),
            setTargetMonth: (value) => {
                currentFixtureTargetMonth = value;
                renderFixture(rootElement, detailElement, stateSelectElement, state);
            }
        }
    });
    syncFixtureCalendarMarkers(state);
}

export function buildFixtureSnapshot(state: FixtureState): RankRecommendationReactListSnapshot {
    const candidates = buildCandidatesForState(state);
    const activeWorkState = resolveFixtureWorkState(state);
    const emptyText = getEmptyTextForState(state);
    const workStateCounts = candidates.length === 0
        ? { ready: 0, needs_evidence: 0, recent_or_held: 0 }
        : { ready: 3, needs_evidence: 2, recent_or_held: 1 };
    return {
        signature: `fixture:${state}:${candidates.map((candidate) => candidate.key).join("|")}`,
        mode: "fixture",
        title: "今日の判断",
        metaText: buildMetaText(state, candidates.length),
        metaTitle: "カレンダーで日付感を保ち、右の判断レールと下の詳細で一件ずつ判断する fixture",
        emptyText,
        controls: {
            targetMonth: {
                currentValue: currentFixtureTargetMonth,
                options: [
                    { value: "202607", label: "2026年7月 (6件)" },
                    { value: "202608", label: "2026年8月 (2件)" },
                    { value: "202609", label: "2026年9月 (2件)" }
                ]
            },
            workState: {
                options: [
                    {
                        mode: "ready",
                        label: "判断可能",
                        title: "根拠と変更候補が揃った候補",
                        count: workStateCounts.ready,
                        pressed: activeWorkState === "ready"
                    },
                    {
                        mode: "needs_evidence",
                        label: "要確認",
                        title: "不足または注意が残る候補",
                        count: workStateCounts.needs_evidence,
                        pressed: activeWorkState === "needs_evidence"
                    },
                    {
                        mode: "recent_or_held",
                        label: "保留・直近",
                        title: "保留操作中、処理中、または直近変更がある候補",
                        count: workStateCounts.recent_or_held,
                        pressed: activeWorkState === "recent_or_held"
                    }
                ]
            },
            displayLimit: state === "ready"
                ? {
                    showMoreButton: buildButton("さらに表示 (3件)", "display-more"),
                    resetButton: null
                }
                : null,
            rankOrder: {
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
            }
        },
        candidates
    };
}

export function buildAllFixtureSnapshots(): readonly RankRecommendationReactListSnapshot[] {
    return FIXTURE_STATES.map((state) => buildFixtureSnapshot(state.value));
}

export { renderRankRecommendationReactListElement };

function buildCandidatesForState(state: FixtureState): RankRecommendationReactCandidateSnapshot[] {
    if (state === "empty" || state === "current-settings-401" || state === "current-settings-403") {
        return [];
    }

    const baseOverrides: Partial<RankRecommendationReactCandidateSnapshot> = {};
    if (state === "missing-counts") {
        Object.assign(baseOverrides, {
            workState: "needs_evidence" as const,
            occupancyText: "OH 未取得 / キャパ 未取得",
            individualText: "未取得",
            groupText: "未取得",
            reasonText: "個人・団体の内訳を取得できず、現時点では判断を確定できません",
            cautionText: "個人・団体の内訳を取得できていません",
            evidenceStatusText: "個人・団体は未取得 / 未保存"
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

    const primary: RankRecommendationReactCandidateSnapshot = {
        ...buildCandidate({
        key: "fixture:20260723:camp-twin-s",
        stayDateKey: "20260723",
        stayDateLabel: "2026-07-23（木）",
        dateGroupLabel: "2026-07-23（木）",
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

    if (state === "needs-evidence" || state === "missing-counts" || state === "write-failure") {
        return [
            {
                ...primary,
                workState: "needs_evidence",
                action: "watch",
                actionLabel: "要確認",
                recommendedRankText: "未確定",
                cautionText: primary.cautionText ?? "基準線が不足しているためランク変更はまだ確定できません",
                evidenceStatusText: state === "missing-counts" ? primary.evidenceStatusText : "季節基準線は未取得 / 現在値のみ取得",
                confirmButton: { ...primary.confirmButton, disabled: true }
            },
            buildCandidate({
                key: "fixture:20260727:single",
                stayDateKey: "20260727",
                stayDateLabel: "2026-07-27（月）",
                dateGroupLabel: "2026-07-27（月）",
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
            key: "fixture:20260724:standard-twin",
            stayDateKey: "20260724",
            stayDateLabel: "2026-07-24（金）",
            dateGroupLabel: "2026-07-24（金）",
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
            key: "fixture:20260724:family",
            stayDateKey: "20260724",
            stayDateLabel: "2026-07-24（金）",
            dateGroupLabel: "2026-07-24（金）",
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
        ...overrides
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

function resolveFixtureWorkState(state: FixtureState): RankRecommendationWorkState {
    if (state === "needs-evidence" || state === "missing-counts" || state === "write-failure") {
        return "needs_evidence";
    }
    if (state === "recent" || state === "write-confirming" || state === "write-success") {
        return "recent_or_held";
    }
    return "ready";
}

function getEmptyTextForState(state: FixtureState): string | null {
    if (state === "current-settings-401") {
        return "候補の現在設定を取得できませんでした（HTTP 401）。ログイン状態を確認してください。";
    }
    if (state === "current-settings-403") {
        return "候補の現在設定を取得できませんでした（HTTP 403）。施設権限を確認してください。";
    }
    if (state === "empty") {
        return "現在の判断状態に該当する料金調整候補はありません";
    }
    return null;
}

function buildMetaText(state: FixtureState, count: number): string {
    if (state === "current-settings-401" || state === "current-settings-403") {
        return "候補データの取得に失敗";
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

function createFixtureCalendarCell(year: number, month: number, day: number): DocumentFragment {
    const dateWithHyphen = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const compactDate = dateWithHyphen.replaceAll("-", "");
    const roomCount = 2 + ((day * 3 + month) % 11);
    const groupCount = day % 5 === 0 ? 0 : (day + month) % 4;
    const anchorElement = document.createElement("a");
    anchorElement.href = "#";
    anchorElement.setAttribute("data-testid", `calendar-date-${dateWithHyphen}`);
    anchorElement.setAttribute("data-ra-fixture-calendar-cell", "");
    anchorElement.setAttribute("data-ra-fixture-stay-month", compactDate.slice(0, 6));
    if (FIXTURE_CANDIDATE_DATES.has(compactDate)) {
        anchorElement.setAttribute("data-ra-fixture-candidate-date", "");
    }
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
    const fragment = document.createDocumentFragment();
    fragment.append(anchorElement, nativeDescriptionElement);
    return fragment;
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

function syncFixtureCalendarMarkers(state: FixtureState): void {
    cleanupFixtureCalendarMarkers();
    const activeState = resolveFixtureWorkState(state);
    document.querySelectorAll<HTMLElement>("[data-ra-fixture-candidate-date]").forEach((element, index) => {
        if (
            state === "empty"
            || state === "current-settings-401"
            || state === "current-settings-403"
            || element.getAttribute("data-ra-fixture-stay-month") !== currentFixtureTargetMonth
        ) {
            return;
        }
        element.setAttribute(FIXTURE_CALENDAR_STATE_ATTRIBUTE, activeState);
        const cueElement = document.createElement("span");
        cueElement.setAttribute(FIXTURE_CALENDAR_CUE_ATTRIBUTE, "");
        cueElement.setAttribute("aria-hidden", "true");
        const descriptionElement = document.createElement("span");
        const descriptionId = `fixture-rank-calendar-description-${currentFixtureTargetMonth}-${index}`;
        descriptionElement.id = descriptionId;
        descriptionElement.setAttribute(FIXTURE_CALENDAR_DESCRIPTION_ATTRIBUTE, "");
        descriptionElement.textContent = `料金調整候補 1件、${formatFixtureWorkState(activeState)} 1件`;
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

function formatFixtureWorkState(state: RankRecommendationWorkState): string {
    if (state === "needs_evidence") {
        return "要確認";
    }
    if (state === "recent_or_held") {
        return "保留・直近";
    }
    return "判断可能";
}

function renderFixtureEvidence(container: HTMLElement, state: FixtureState): void {
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
    if (state === "missing-counts") {
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
    style.textContent = `${RANK_RECOMMENDATION_WORKSPACE_STYLES}\n${getFixtureShellStyles()}`;
    document.head.append(style);
}

function getFixtureShellStyles(): string {
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

    [data-ra-fixture-calendar-cell] {
        position: relative;
        display: grid;
        min-height: 62px;
        align-content: space-between;
        padding: 6px;
        border: 0;
        border-right: 1px solid #e4e9ef;
        border-bottom: 1px solid #e4e9ef;
        background: #ffffff;
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
