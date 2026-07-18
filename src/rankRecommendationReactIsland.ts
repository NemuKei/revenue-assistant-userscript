import * as React from "react";
import { flushSync, createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { RankRecommendationWorkState } from "./rankRecommendationWorkspaceModel";

const REACT_ISLAND_HOST_ATTRIBUTE = "data-ra-rank-recommendation-react-island-host";
const REACT_ISLAND_ATTRIBUTE = "data-ra-rank-recommendation-react-island";
const BUTTON_ATTRIBUTE = "data-ra-rank-recommendation-button";
const BUTTON_ACTION_ATTRIBUTE = "data-ra-rank-recommendation-button-action";
const VIEW_MODE_ATTRIBUTE = "data-ra-rank-recommendation-view-mode";
const TARGET_MONTH_ATTRIBUTE = "data-ra-rank-recommendation-target-month";
const TARGET_MONTH_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-target-month-control";
const VIEW_MODE_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-view-mode-control";
const ORDER_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-order-control";
const ORDER_SOURCE_ATTRIBUTE = "data-ra-rank-recommendation-order-source";
const RANK_LADDER_ATTRIBUTE = "data-ra-rank-recommendation-rank-ladder";
const ORDER_INPUT_ATTRIBUTE = "data-ra-rank-recommendation-order-input";
const ORDER_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-order-status";
const PENDING_DECISION_ATTRIBUTE = "data-ra-rank-recommendation-pending-decision";
const PENDING_DECISION_KEY_ATTRIBUTE = "data-ra-rank-recommendation-pending-decision-key";
const RANK_CHANGE_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-status";
const RANK_CHANGE_TARGET_CODE_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-target-code";
const RANK_CHANGE_TARGET_NAME_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-target-name";

type RankRecommendationReactMode = "live" | "fixture";

export interface RankRecommendationReactButtonSnapshot {
    text: string;
    title?: string;
    attrs: Record<string, string>;
    disabled?: boolean;
}

export interface RankRecommendationReactStateControlSnapshot {
    options: readonly {
        mode: RankRecommendationWorkState;
        label: string;
        title: string;
        count: number;
        pressed: boolean;
    }[];
}

export interface RankRecommendationReactControlsSnapshot {
    targetMonth: {
        currentValue: string;
        options: readonly { value: string; label: string }[];
    } | null;
    workState: RankRecommendationReactStateControlSnapshot | null;
    displayLimit: {
        showMoreButton: RankRecommendationReactButtonSnapshot | null;
        resetButton: RankRecommendationReactButtonSnapshot | null;
    } | null;
    rankOrder: {
        source: string;
        ladderJson: string;
        summary: string;
        summaryTitle?: string;
        inputValue: string;
        status: string;
        saveButton: RankRecommendationReactButtonSnapshot;
        reverseButton: RankRecommendationReactButtonSnapshot;
        resetButton: RankRecommendationReactButtonSnapshot;
    } | null;
}

export interface RankRecommendationReactCandidateSnapshot {
    key: string;
    chartKey: string;
    workState: RankRecommendationWorkState;
    stayDateKey: string;
    stayDateLabel: string;
    dateGroupLabel: string;
    roomGroupName: string;
    action: string;
    actionLabel: string;
    priorityLabel: string;
    confidenceLabel: string;
    currentRankCode: string | null;
    currentRankText: string;
    recommendedRankText: string;
    occupancyText: string;
    individualText: string;
    groupText: string;
    sourceText: string;
    latestChangeText: string;
    reasonText: string;
    cautionText: string | null;
    evidenceStatusText: string;
    rankOptions: readonly { code: string; name: string }[];
    selectedRankCode: string | null;
    analyzeLink: RankRecommendationReactButtonSnapshot & { href: string };
    confirmButton: RankRecommendationReactButtonSnapshot;
    snoozeButton: RankRecommendationReactButtonSnapshot;
    dismissButton: RankRecommendationReactButtonSnapshot;
    pendingDecision: {
        key: string;
        label: string;
        cancelButton: RankRecommendationReactButtonSnapshot;
    } | null;
    rankChangeResult: {
        status: string;
        message: string;
        title: string;
    } | null;
}

export interface RankRecommendationReactListSnapshot {
    signature: string;
    mode: RankRecommendationReactMode;
    title: string;
    metaText: string;
    metaTitle?: string;
    emptyText: string | null;
    controls: RankRecommendationReactControlsSnapshot;
    candidates: readonly RankRecommendationReactCandidateSnapshot[];
}

export interface RankRecommendationReactActions {
    hydrateEvidence: (candidateKey: string, container: HTMLElement) => void;
    setTargetMonth: (value: string) => void;
}

export interface RankRecommendationReactRenderOptions {
    detailContainer: HTMLElement;
    actions: RankRecommendationReactActions;
}

const NOOP_REACT_ACTIONS: RankRecommendationReactActions = {
    hydrateEvidence: () => undefined,
    setTargetMonth: () => undefined
};

const mountedRoots = new WeakMap<HTMLElement, Root>();

export function syncRankRecommendationReactList(
    container: HTMLElement,
    snapshot: RankRecommendationReactListSnapshot,
    options: RankRecommendationReactRenderOptions
): void {
    const host = ensureRankRecommendationReactIslandHost(container);
    let root = mountedRoots.get(host) ?? null;
    if (root === null) {
        root = createRoot(host);
        mountedRoots.set(host, root);
    }

    flushSync(() => {
        root.render(renderRankRecommendationReactListElement(snapshot, options));
    });
}

export function renderRankRecommendationReactListElement(
    snapshot: RankRecommendationReactListSnapshot,
    options?: RankRecommendationReactRenderOptions
): React.ReactElement {
    return options === undefined
        ? React.createElement(RankRecommendationWorkspace, { snapshot })
        : React.createElement(RankRecommendationWorkspace, { snapshot, options });
}

export function unmountRankRecommendationReactIsland(): void {
    document.querySelectorAll<HTMLElement>(`[${REACT_ISLAND_HOST_ATTRIBUTE}]`).forEach((host) => {
        mountedRoots.get(host)?.unmount();
        mountedRoots.delete(host);
    });
}

function ensureRankRecommendationReactIslandHost(container: HTMLElement): HTMLElement {
    const existingHost = container.querySelector<HTMLElement>(`[${REACT_ISLAND_HOST_ATTRIBUTE}]`);
    if (existingHost !== null) {
        existingHost.hidden = false;
        return existingHost;
    }

    const host = document.createElement("div");
    host.setAttribute(REACT_ISLAND_HOST_ATTRIBUTE, "");
    container.append(host);
    return host;
}

function RankRecommendationWorkspace(props: {
    snapshot: RankRecommendationReactListSnapshot;
    options?: RankRecommendationReactRenderOptions;
}): React.ReactElement {
    const { snapshot, options } = props;
    const firstKey = snapshot.candidates[0]?.key ?? null;
    const [interaction, setInteraction] = React.useState(() => ({
        selectedKey: firstKey,
        reviewKey: null as string | null,
        snapshotSignature: snapshot.signature
    }));
    const selectedCandidate = snapshot.candidates.find((candidate) => candidate.key === interaction.selectedKey)
        ?? snapshot.candidates[0]
        ?? null;
    const resolvedSelectedKey = selectedCandidate?.key ?? null;
    const selectedWriteStatus = selectedCandidate?.rankChangeResult?.status ?? null;
    const shouldNormalizeInteraction = interaction.snapshotSignature !== snapshot.signature
        || interaction.selectedKey !== resolvedSelectedKey
        || (
            interaction.reviewKey === resolvedSelectedKey
            && (selectedWriteStatus === "confirming" || selectedWriteStatus === "success")
        );
    if (shouldNormalizeInteraction) {
        setInteraction({
            selectedKey: resolvedSelectedKey,
            reviewKey: null,
            snapshotSignature: snapshot.signature
        });
    }
    const effectiveReviewKey = shouldNormalizeInteraction ? null : interaction.reviewKey;

    const detailContent = selectedCandidate === null
        ? React.createElement(React.Fragment)
        : React.createElement(RankRecommendationDetail, {
            candidate: selectedCandidate,
            reviewOpen: effectiveReviewKey === selectedCandidate.key,
            onReviewOpen: () => setInteraction((current) => ({
                ...current,
                reviewKey: selectedCandidate.key
            })),
            onReviewClose: () => setInteraction((current) => ({
                ...current,
                reviewKey: null
            })),
            actions: options?.actions ?? NOOP_REACT_ACTIONS
        });
    return React.createElement(React.Fragment, null,
        React.createElement("span", {
            [REACT_ISLAND_ATTRIBUTE]: "mounted",
            "data-row-count": String(snapshot.candidates.length),
            "data-mode": snapshot.mode,
            "data-signature": snapshot.signature,
            hidden: true
        }),
        React.createElement(RankRecommendationRail, {
            snapshot,
            selectedKey: selectedCandidate?.key ?? null,
            onTargetMonthChange: (value: string) => (options?.actions ?? NOOP_REACT_ACTIONS).setTargetMonth(value),
            onSelect: (candidateKey: string) => {
                setInteraction((current) => ({
                    ...current,
                    selectedKey: candidateKey,
                    reviewKey: null
                }));
            }
        }),
        options === undefined ? detailContent : createPortal(detailContent, options.detailContainer)
    );
}

function RankRecommendationRail(props: {
    snapshot: RankRecommendationReactListSnapshot;
    selectedKey: string | null;
    onTargetMonthChange: (value: string) => void;
    onSelect: (candidateKey: string) => void;
}): React.ReactElement {
    const { snapshot } = props;
    const groupedCandidates = groupCandidatesByDate(snapshot.candidates);
    return React.createElement("div", { "data-ra-rank-recommendation-ui-component": "workspace-rail" },
        React.createElement("header", { "data-ra-rank-recommendation-ui-component": "rail-header" },
            React.createElement("h2", null, snapshot.title),
            React.createElement("p", {
                "data-ra-rank-recommendation-meta": "",
                title: snapshot.metaTitle
            }, snapshot.metaText)
        ),
        React.createElement("div", { "data-ra-rank-recommendation-ui-component": "rail-controls" },
            renderTargetMonthControl(snapshot.controls.targetMonth, props.onTargetMonthChange),
            renderWorkStateControl(snapshot.controls.workState)
        ),
        React.createElement("div", { "data-ra-rank-recommendation-ui-component": "task-list" },
            snapshot.emptyText === null
                ? groupedCandidates.flatMap((group) => [
                    React.createElement("h3", {
                        key: `${group.stayDateKey}:${group.candidates[0]?.key ?? "empty"}:heading`,
                        "data-ra-rank-recommendation-date-group": ""
                    }, group.label),
                    ...group.candidates.map((candidate) => React.createElement(RankRecommendationTask, {
                        key: candidate.key,
                        candidate,
                        selected: candidate.key === props.selectedKey,
                        onSelect: props.onSelect
                    }))
                ])
                : React.createElement("p", {
                    "data-ra-rank-recommendation-empty": "",
                    role: "status",
                    "aria-live": "polite"
                }, snapshot.emptyText)
        ),
        React.createElement("footer", { "data-ra-rank-recommendation-ui-component": "rail-footer" },
            renderDisplayLimitControl(snapshot.controls.displayLimit),
            renderRankOrderControl(snapshot.controls.rankOrder)
        )
    );
}

function RankRecommendationTask(props: {
    candidate: RankRecommendationReactCandidateSnapshot;
    selected: boolean;
    onSelect: (candidateKey: string) => void;
}): React.ReactElement {
    const candidate = props.candidate;
    return React.createElement("button", {
        type: "button",
        "data-ra-rank-recommendation-task": "",
        "data-work-state": candidate.workState,
        "aria-pressed": props.selected ? "true" : "false",
        onClick: () => props.onSelect(candidate.key)
    },
        React.createElement("span", { "data-ra-rank-recommendation-task-line": "primary" },
            React.createElement("span", { "data-ra-rank-recommendation-task-room": "" }, candidate.roomGroupName),
            React.createElement("span", {
                "data-ra-rank-recommendation-action-badge": candidate.action
            }, candidate.actionLabel)
        ),
        React.createElement("span", { "data-ra-rank-recommendation-task-line": "secondary" },
            React.createElement("span", { "data-ra-rank-recommendation-task-rank": "" },
                `${candidate.currentRankText} から ${candidate.recommendedRankText}`
            ),
            React.createElement("span", { "data-ra-rank-recommendation-task-status": "" },
                `${candidate.priorityLabel} / ${candidate.evidenceStatusText}`
            )
        )
    );
}

function RankRecommendationDetail(props: {
    candidate: RankRecommendationReactCandidateSnapshot;
    reviewOpen: boolean;
    onReviewOpen: () => void;
    onReviewClose: () => void;
    actions: RankRecommendationReactActions;
}): React.ReactElement {
    const candidate = props.candidate;
    const evidenceHostRef = React.useRef<HTMLDivElement | null>(null);
    const reviewRegionRef = React.useRef<HTMLElement | null>(null);
    const reviewOpenButtonRef = React.useRef<HTMLButtonElement | null>(null);
    const rankChangeStatusRef = React.useRef<HTMLDivElement | null>(null);
    const detailSectionRef = React.useRef<HTMLElement | null>(null);
    const actionsRef = React.useRef(props.actions);
    actionsRef.current = props.actions;
    const wasReviewOpenRef = React.useRef(false);
    const fallbackCode = candidate.selectedRankCode ?? candidate.rankOptions[0]?.code ?? "";
    const [rankSelection, setRankSelection] = React.useState(() => ({
        candidateKey: candidate.key,
        selectedCode: fallbackCode
    }));
    const canPreserveReviewSelection = props.reviewOpen
        && candidate.rankOptions.some((option) => option.code === rankSelection.selectedCode);
    const selectedCode = rankSelection.candidateKey === candidate.key && canPreserveReviewSelection
        ? rankSelection.selectedCode
        : fallbackCode;
    if (
        rankSelection.candidateKey !== candidate.key
        || rankSelection.selectedCode !== selectedCode
    ) {
        setRankSelection({
            candidateKey: candidate.key,
            selectedCode
        });
    }

    React.useLayoutEffect(() => {
        const host = evidenceHostRef.current;
        if (host !== null) {
            actionsRef.current.hydrateEvidence(candidate.key, host);
        }
    }, [candidate.key, candidate.chartKey]);

    const writeStatus = candidate.rankChangeResult?.status ?? null;
    React.useEffect(() => {
        if (props.reviewOpen) {
            reviewRegionRef.current?.focus();
        } else if (wasReviewOpenRef.current) {
            const reviewOpenButton = reviewOpenButtonRef.current;
            if (reviewOpenButton !== null && !reviewOpenButton.disabled) {
                reviewOpenButton.focus();
            } else {
                (rankChangeStatusRef.current ?? detailSectionRef.current)?.focus();
            }
        }
        wasReviewOpenRef.current = props.reviewOpen;
    }, [props.reviewOpen, writeStatus]);

    const selectedOption = candidate.rankOptions.find((option) => option.code === selectedCode) ?? null;
    const confirmAttrs = selectedOption === null
        ? candidate.confirmButton.attrs
        : {
            ...candidate.confirmButton.attrs,
            [RANK_CHANGE_TARGET_CODE_ATTRIBUTE]: selectedOption.code,
            [RANK_CHANGE_TARGET_NAME_ATTRIBUTE]: selectedOption.name
        };
    const selectedCurrentRank = selectedOption?.code === candidate.currentRankCode;
    const finalConfirmDisabled = candidate.confirmButton.disabled === true
        || selectedOption === null
        || selectedCurrentRank
        || writeStatus === "confirming"
        || writeStatus === "success";

    const decisionControls = props.reviewOpen
        ? React.createElement("section", {
            ref: reviewRegionRef,
            "data-ra-rank-recommendation-review": "",
            role: "region",
            "aria-label": "ランク変更内容の最終確認",
            tabIndex: -1
        },
            React.createElement("div", null,
                React.createElement("h3", null, "変更内容を最終確認"),
                React.createElement("p", { "data-ra-rank-recommendation-review-note": "" },
                    "確定時に現在ランクと変更履歴を再取得します。候補表示後に状態が変わっていれば送信しません。"
                )
            ),
            React.createElement("div", { "data-ra-rank-recommendation-review-summary": "" },
                React.createElement("div", null,
                    React.createElement("span", null, "対象"),
                    React.createElement("strong", null, `${candidate.stayDateLabel}・${candidate.roomGroupName}`)
                ),
                React.createElement("div", null,
                    React.createElement("span", null, "現在ランク"),
                    React.createElement("strong", null, candidate.currentRankText)
                )
            ),
            React.createElement("label", null,
                React.createElement("span", null, "変更後ランク"),
                React.createElement("select", {
                    value: selectedCode,
                    disabled: candidate.confirmButton.disabled,
                    onChange: (event) => setRankSelection({
                        candidateKey: candidate.key,
                        selectedCode: (event.currentTarget as HTMLSelectElement).value
                    })
                }, candidate.rankOptions.map((option) => React.createElement("option", {
                    key: option.code,
                    value: option.code
                }, option.code === candidate.currentRankCode
                    ? `${option.name}（現在・変更なし）`
                    : option.name)))
            ),
            selectedCurrentRank
                ? React.createElement("p", {
                    "data-ra-rank-recommendation-no-change-note": "",
                    role: "status",
                    "aria-live": "polite"
                }, "現在ランクと同じため、変更はありません。別のランクを選んでください。")
                : null,
            React.createElement("div", { "data-ra-rank-recommendation-actions": "" },
                renderButton({
                    ...candidate.confirmButton,
                    text: "この内容で変更する",
                    ...(selectedCurrentRank
                        ? { title: "現在ランクと同じため送信できません" }
                        : {}),
                    attrs: confirmAttrs,
                    disabled: finalConfirmDisabled
                }),
                renderButton({
                    text: "確認をやめる",
                    attrs: {
                        [BUTTON_ATTRIBUTE]: "",
                        [BUTTON_ACTION_ATTRIBUTE]: "review-cancel"
                    }
                }, { onClick: props.onReviewClose })
            )
        )
        : React.createElement("div", { "data-ra-rank-recommendation-actions": "" },
            renderButton({
                ...candidate.confirmButton,
                text: "変更内容を確認",
                attrs: {
                    [BUTTON_ATTRIBUTE]: "",
                    [BUTTON_ACTION_ATTRIBUTE]: "review-open"
                }
            }, { onClick: props.onReviewOpen, ref: reviewOpenButtonRef }),
            renderAnalyzeLink(candidate.analyzeLink),
            renderButton(candidate.snoozeButton),
            renderButton(candidate.dismissButton)
        );

    return React.createElement("section", {
        ref: detailSectionRef,
        "data-ra-rank-recommendation-ui-component": "detail",
        role: "region",
        "aria-label": "料金調整候補の詳細",
        tabIndex: -1
    },
        React.createElement("header", { "data-ra-rank-recommendation-detail-header": "" },
            React.createElement("div", { "data-ra-rank-recommendation-detail-heading": "" },
                React.createElement("h2", null, `${candidate.stayDateLabel}・${candidate.roomGroupName}`),
                React.createElement("p", null,
                    `${candidate.priorityLabel} / 確度 ${candidate.confidenceLabel} / ${candidate.sourceText}`
                )
            ),
            React.createElement("span", {
                "data-ra-rank-recommendation-action-badge": candidate.action
            }, candidate.actionLabel)
        ),
        React.createElement("div", { "data-ra-rank-recommendation-detail-grid": "" },
            React.createElement("section", { "data-ra-rank-recommendation-rank-card": "" },
                React.createElement("div", { "data-ra-rank-recommendation-rank-pair": "" },
                    renderRankValue("現在ランク", candidate.currentRankText, "current"),
                    renderRankValue("候補ランク", candidate.recommendedRankText, "candidate")
                ),
                React.createElement("div", { "data-ra-rank-recommendation-metrics": "" },
                    renderMetric("在庫", candidate.occupancyText, "occupancy"),
                    renderMetric("個人", candidate.individualText, "individual"),
                    renderMetric("団体", candidate.groupText, "group")
                )
            ),
            React.createElement("section", { "data-ra-rank-recommendation-evidence-card": "" },
                React.createElement("div", null,
                    React.createElement("h3", null, "判断根拠の推移"),
                    React.createElement("p", {
                        role: "status",
                        "aria-live": "polite",
                        "aria-atomic": "true"
                    }, candidate.evidenceStatusText)
                ),
                React.createElement("div", {
                    ref: evidenceHostRef,
                    "data-ra-rank-recommendation-evidence-host": "",
                    "data-candidate-key": candidate.key
                })
            ),
            React.createElement("section", { "data-ra-rank-recommendation-reason-card": "" },
                React.createElement("div", null,
                    React.createElement("h3", null, "主要根拠"),
                    React.createElement("p", null, candidate.reasonText === "" ? "根拠を取得できませんでした" : candidate.reasonText)
                ),
                React.createElement("div", null,
                    React.createElement("h3", null, "注意と更新状況"),
                    React.createElement("p", null,
                        [candidate.cautionText ?? "追加の注意なし", candidate.latestChangeText].filter((value) => value !== "").join(" / ")
                    )
                )
            )
        ),
        candidate.pendingDecision === null ? null : renderPendingDecision(candidate.pendingDecision),
        candidate.rankChangeResult === null ? null : renderRankChangeResult(candidate.rankChangeResult, rankChangeStatusRef),
        decisionControls
    );
}

function renderRankValue(label: string, value: string, kind: "current" | "candidate"): React.ReactElement {
    return React.createElement("div", { "data-ra-rank-recommendation-rank-value": kind },
        React.createElement("span", null, label),
        React.createElement("strong", null, value)
    );
}

function renderMetric(
    label: string,
    value: string,
    kind: "occupancy" | "individual" | "group"
): React.ReactElement {
    return React.createElement("div", {
        "data-ra-rank-recommendation-metric": "",
        "data-ra-rank-recommendation-metric-kind": kind
    },
        React.createElement("span", null, label),
        React.createElement("strong", null, value)
    );
}

function renderTargetMonthControl(
    control: RankRecommendationReactControlsSnapshot["targetMonth"],
    onChange: (value: string) => void
): React.ReactElement | null {
    if (control === null) {
        return null;
    }
    return React.createElement("label", { [TARGET_MONTH_CONTROL_ATTRIBUTE]: "" },
        React.createElement("span", null, "対象月"),
        React.createElement("select", {
            [TARGET_MONTH_ATTRIBUTE]: "",
            title: "料金調整候補の対象宿泊月で絞り込む",
            value: control.currentValue,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value)
        }, control.options.map((option) => React.createElement("option", {
            key: option.value,
            value: option.value
        }, option.label)))
    );
}

function renderWorkStateControl(
    control: RankRecommendationReactControlsSnapshot["workState"]
): React.ReactElement | null {
    if (control === null) {
        return null;
    }
    return React.createElement("div", {
        [VIEW_MODE_CONTROL_ATTRIBUTE]: "",
        role: "group",
        "aria-label": "判断状態"
    }, ...control.options.map((option) => React.createElement("button", {
        key: option.mode,
        type: "button",
        [BUTTON_ATTRIBUTE]: "",
        [BUTTON_ACTION_ATTRIBUTE]: "view-mode",
        [VIEW_MODE_ATTRIBUTE]: option.mode,
        "aria-pressed": option.pressed ? "true" : "false",
        title: option.count === 0 ? `${option.title}（候補なし）` : option.title,
        disabled: option.count === 0 && !option.pressed
    },
        React.createElement("strong", null, String(option.count)),
        React.createElement("span", null, option.label)
    )));
}

function renderDisplayLimitControl(
    control: RankRecommendationReactControlsSnapshot["displayLimit"]
): React.ReactElement | null {
    if (control === null || (control.showMoreButton === null && control.resetButton === null)) {
        return null;
    }
    return React.createElement("div", { "data-ra-rank-recommendation-display-limit-control": "" },
        control.showMoreButton === null ? null : renderButton(control.showMoreButton),
        control.resetButton === null ? null : renderButton(control.resetButton)
    );
}

function renderRankOrderControl(
    control: RankRecommendationReactControlsSnapshot["rankOrder"]
): React.ReactElement | null {
    if (control === null) {
        return null;
    }
    return React.createElement("div", {
        [ORDER_CONTROL_ATTRIBUTE]: "",
        [ORDER_SOURCE_ATTRIBUTE]: control.source,
        [RANK_LADDER_ATTRIBUTE]: control.ladderJson
    },
        React.createElement("details", null,
            React.createElement("summary", { title: control.summaryTitle }, control.summary),
            React.createElement("div", { "data-ra-rank-recommendation-order-editor": "" },
                React.createElement("textarea", {
                    [ORDER_INPUT_ATTRIBUTE]: "",
                    rows: 2,
                    defaultValue: control.inputValue,
                    title: "高いランクから低いランクの順に入力"
                }),
                React.createElement("div", { "data-ra-rank-recommendation-display-limit-control": "" },
                    renderButton(control.saveButton),
                    renderButton(control.reverseButton),
                    renderButton(control.resetButton)
                ),
                React.createElement("span", { [ORDER_STATUS_ATTRIBUTE]: "" }, control.status)
            )
        )
    );
}

function renderAnalyzeLink(link: RankRecommendationReactButtonSnapshot & { href: string }): React.ReactElement {
    return React.createElement("a", {
        href: link.href,
        title: link.title,
        ...link.attrs
    }, link.text);
}

function renderButton(
    button: RankRecommendationReactButtonSnapshot,
    reactProps: React.ComponentPropsWithRef<"button"> = {}
): React.ReactElement {
    return React.createElement("button", {
        type: "button",
        title: button.title,
        disabled: button.disabled,
        ...button.attrs,
        ...reactProps
    }, button.text);
}

function renderPendingDecision(
    pendingDecision: NonNullable<RankRecommendationReactCandidateSnapshot["pendingDecision"]>
): React.ReactElement {
    return React.createElement("div", {
        [PENDING_DECISION_ATTRIBUTE]: "",
        [PENDING_DECISION_KEY_ATTRIBUTE]: pendingDecision.key,
        role: "status",
        "aria-live": "polite"
    },
        React.createElement("span", null, pendingDecision.label),
        renderButton(pendingDecision.cancelButton)
    );
}

function renderRankChangeResult(
    result: NonNullable<RankRecommendationReactCandidateSnapshot["rankChangeResult"]>,
    ref?: React.Ref<HTMLDivElement>
): React.ReactElement {
    return React.createElement("div", {
        ref,
        [RANK_CHANGE_STATUS_ATTRIBUTE]: result.status,
        title: result.title,
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        tabIndex: -1
    }, result.message);
}

function groupCandidatesByDate(
    candidates: readonly RankRecommendationReactCandidateSnapshot[]
): Array<{
    stayDateKey: string;
    label: string;
    candidates: RankRecommendationReactCandidateSnapshot[];
}> {
    const groups: Array<{
        stayDateKey: string;
        label: string;
        candidates: RankRecommendationReactCandidateSnapshot[];
    }> = [];
    for (const candidate of candidates) {
        const currentGroup = groups[groups.length - 1];
        if (currentGroup?.stayDateKey === candidate.stayDateKey) {
            currentGroup.candidates.push(candidate);
            continue;
        }
        groups.push({
            stayDateKey: candidate.stayDateKey,
            label: candidate.dateGroupLabel,
            candidates: [candidate]
        });
    }
    return groups;
}
