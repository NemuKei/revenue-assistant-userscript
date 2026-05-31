import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

const RANK_RECOMMENDATION_REACT_ISLAND_HOST_ATTRIBUTE = "data-ra-rank-recommendation-react-island-host";
const RANK_RECOMMENDATION_REACT_ISLAND_ATTRIBUTE = "data-ra-rank-recommendation-react-island";
const RANK_RECOMMENDATION_RANK_LADDER_ATTRIBUTE = "data-ra-rank-recommendation-rank-ladder";
const RANK_RECOMMENDATION_ORDER_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-order-control";
const RANK_RECOMMENDATION_ORDER_SOURCE_ATTRIBUTE = "data-ra-rank-recommendation-order-source";
const RANK_RECOMMENDATION_ORDER_INPUT_ATTRIBUTE = "data-ra-rank-recommendation-order-input";
const RANK_RECOMMENDATION_ORDER_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-order-status";
const RANK_RECOMMENDATION_VIEW_MODE_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-view-mode-control";
const RANK_RECOMMENDATION_VIEW_MODE_ATTRIBUTE = "data-ra-rank-recommendation-view-mode";
const RANK_RECOMMENDATION_TARGET_MONTH_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-target-month-control";
const RANK_RECOMMENDATION_TARGET_MONTH_ATTRIBUTE = "data-ra-rank-recommendation-target-month";
const RANK_RECOMMENDATION_ROW_ATTRIBUTE = "data-ra-rank-recommendation-row";
const RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE = "data-ra-rank-recommendation-priority";
const RANK_RECOMMENDATION_ACTION_ATTRIBUTE = "data-ra-rank-recommendation-action";
const RANK_RECOMMENDATION_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-status";
const RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE = "data-ra-rank-recommendation-rank-gap";
const RANK_RECOMMENDATION_RANK_GAP_TRIGGER_ATTRIBUTE = "data-ra-rank-recommendation-rank-gap-trigger";
const RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE = "data-ra-rank-recommendation-rank-gap-tooltip";
const RANK_RECOMMENDATION_CURVE_POPOVER_ATTRIBUTE = "data-ra-rank-recommendation-curve-popover";
const RANK_RECOMMENDATION_INLINE_RANK_CHANGE_ATTRIBUTE = "data-ra-rank-recommendation-inline-rank-change";
const RANK_RECOMMENDATION_INLINE_RANK_SELECT_ATTRIBUTE = "data-ra-rank-recommendation-inline-rank-select";
const RANK_RECOMMENDATION_BUTTON_ATTRIBUTE = "data-ra-rank-recommendation-button";
const RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE = "data-ra-rank-recommendation-button-action";
const RANK_RECOMMENDATION_UI_PRIMITIVE_ATTRIBUTE = "data-ra-rank-recommendation-ui-primitive";
const RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE = "data-ra-rank-recommendation-pending-decision";
const RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE = "data-ra-rank-recommendation-pending-decision-key";
const RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_ROW_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-preview-row";
const RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_CELL_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-preview-cell";
const RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-status";
const RANK_RECOMMENDATION_RANK_CHANGE_TARGET_CODE_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-target-code";
const RANK_RECOMMENDATION_RANK_CHANGE_TARGET_NAME_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-target-name";
const RANK_RECOMMENDATION_PENDING_RANK_CHANGE_ATTRIBUTE = "data-ra-rank-recommendation-pending-rank-change";
const RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE = "data-ra-rank-recommendation-pending-rank-change-key";
const RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE = "data-ra-rank-recommendation-curve-preview-row";
const RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE = "data-ra-rank-recommendation-curve-preview-cell";
const RANK_RECOMMENDATION_CURVE_PREVIEW_KEY_ATTRIBUTE = "data-ra-rank-recommendation-curve-preview-key";

type RankRecommendationReactMode = "live" | "fixture";

export interface RankRecommendationReactButtonSnapshot {
    text: string;
    title?: string;
    attrs: Record<string, string>;
    disabled?: boolean;
}

export interface RankRecommendationReactTextCellSnapshot {
    kind: "text";
    value: string;
    title?: string;
    attribute?: string;
}

export interface RankRecommendationReactRankGapCellSnapshot {
    kind: "rankGap";
    currentRankText: string;
    title: string;
    entries: readonly {
        values: readonly string[];
        isTarget: boolean;
    }[];
}

export type RankRecommendationReactCellSnapshot =
    | RankRecommendationReactTextCellSnapshot
    | RankRecommendationReactRankGapCellSnapshot;

export interface RankRecommendationReactRowSnapshot {
    key: string;
    priority: string;
    action: string;
    status: string;
    cells: readonly RankRecommendationReactCellSnapshot[];
    analyzeLink: RankRecommendationReactButtonSnapshot & { href: string };
    curvePreviewButton: RankRecommendationReactButtonSnapshot & { expanded: boolean };
    curvePopoverItems: readonly { label: string; value: string }[];
    inlineRankChange: {
        options: readonly { code: string; name: string }[];
        selectedCode: string | null;
        disabled: boolean;
        submitButton: RankRecommendationReactButtonSnapshot;
    };
    rankChangeButton: RankRecommendationReactButtonSnapshot & { expanded: boolean };
    snoozeButton: RankRecommendationReactButtonSnapshot;
    dismissButton: RankRecommendationReactButtonSnapshot;
    pendingDecision: {
        key: string;
        label: string;
        cancelButton: RankRecommendationReactButtonSnapshot;
    } | null;
    pendingRankChange: {
        key: string;
        label: string;
        cancelButton: RankRecommendationReactButtonSnapshot;
    } | null;
    rankChangeResult: {
        status: string;
        message: string;
        title: string;
    } | null;
    curvePreview: {
        key: string;
        open: boolean;
    };
    rankChangePreview: {
        key: string;
        open: boolean;
    };
}

export interface RankRecommendationReactControlsSnapshot {
    targetMonth: {
        currentValue: string;
        options: readonly { value: string; label: string }[];
    } | null;
    viewMode: {
        options: readonly {
            mode: string;
            label: string;
            title: string;
            pressed: boolean;
        }[];
    } | null;
    displayLimit: {
        showMoreButton: RankRecommendationReactButtonSnapshot | null;
        resetButton: RankRecommendationReactButtonSnapshot | null;
    } | null;
    rankOrder: {
        source: string;
        ladderJson: string;
        summary: string;
        inputValue: string;
        status: string;
        saveButton: RankRecommendationReactButtonSnapshot;
        reverseButton: RankRecommendationReactButtonSnapshot;
        resetButton: RankRecommendationReactButtonSnapshot;
    } | null;
}

export interface RankRecommendationReactListSnapshot {
    signature: string;
    mode: RankRecommendationReactMode;
    title: string;
    metaText: string;
    columns: readonly string[];
    emptyText: string | null;
    controls: RankRecommendationReactControlsSnapshot;
    rows: readonly RankRecommendationReactRowSnapshot[];
}

let mountedHost: HTMLElement | null = null;
let mountedRoot: Root | null = null;

export function syncRankRecommendationReactList(
    container: HTMLElement,
    snapshot: RankRecommendationReactListSnapshot
): void {
    const host = ensureRankRecommendationReactIslandHost(container);
    let root = mountedRoot;
    if (mountedHost !== host || root === null) {
        mountedRoot?.unmount();
        mountedHost = host;
        root = createRoot(host);
        mountedRoot = root;
    }

    flushSync(() => {
        root.render(React.createElement(RankRecommendationReactList, { snapshot }));
    });
}

export function unmountRankRecommendationReactIsland(): void {
    mountedRoot?.unmount();
    mountedRoot = null;
    mountedHost = null;
}

function ensureRankRecommendationReactIslandHost(container: HTMLElement): HTMLElement {
    const existingHost = container.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_REACT_ISLAND_HOST_ATTRIBUTE}]`);
    if (existingHost !== null) {
        existingHost.hidden = false;
        return existingHost;
    }

    const host = document.createElement("div");
    host.setAttribute(RANK_RECOMMENDATION_REACT_ISLAND_HOST_ATTRIBUTE, "");
    container.append(host);
    return host;
}

function RankRecommendationReactList(props: { snapshot: RankRecommendationReactListSnapshot }): React.ReactElement {
    const snapshot = props.snapshot;
    return React.createElement(React.Fragment, null,
        React.createElement(RankRecommendationReactMountMarker, { snapshot }),
        React.createElement(RankRecommendationReactSummary, { snapshot }),
        React.createElement(RankRecommendationReactControls, { controls: snapshot.controls }),
        React.createElement(RankRecommendationReactTable, { snapshot })
    );
}

function RankRecommendationReactMountMarker(props: { snapshot: RankRecommendationReactListSnapshot }): React.ReactElement {
    const snapshot = props.snapshot;
    return (
        React.createElement("span", {
            [RANK_RECOMMENDATION_REACT_ISLAND_ATTRIBUTE]: "mounted",
            "data-row-count": String(snapshot.rows.length),
            "data-mode": snapshot.mode,
            "data-signature": snapshot.signature,
            hidden: true
        })
    );
}

function RankRecommendationReactSummary(props: { snapshot: RankRecommendationReactListSnapshot }): React.ReactElement {
    const snapshot = props.snapshot;
    return React.createElement(React.Fragment, null,
        React.createElement("h2", null, snapshot.title),
        React.createElement("div", { "data-ra-rank-recommendation-meta": "" }, snapshot.metaText)
    );
}

function RankRecommendationReactControls(props: { controls: RankRecommendationReactControlsSnapshot }): React.ReactElement {
    const controls = props.controls;
    return React.createElement(React.Fragment, null,
        renderTargetMonthControl(controls.targetMonth),
        renderViewModeControl(controls.viewMode),
        renderDisplayLimitControl(controls.displayLimit),
        renderRankOrderControl(controls.rankOrder)
    );
}

function renderTargetMonthControl(control: RankRecommendationReactControlsSnapshot["targetMonth"]): React.ReactElement | null {
    if (control === null) {
        return null;
    }

    return React.createElement("label", { [RANK_RECOMMENDATION_TARGET_MONTH_CONTROL_ATTRIBUTE]: "" },
        React.createElement("span", null, "対象月"),
        React.createElement("select", {
            [RANK_RECOMMENDATION_TARGET_MONTH_ATTRIBUTE]: "",
            title: "料金調整候補の対象宿泊月で絞り込む",
            defaultValue: control.currentValue
        }, control.options.map((option) => React.createElement("option", { key: option.value, value: option.value }, option.label)))
    );
}

function renderViewModeControl(control: RankRecommendationReactControlsSnapshot["viewMode"]): React.ReactElement | null {
    if (control === null) {
        return null;
    }

    return React.createElement("div", { [RANK_RECOMMENDATION_VIEW_MODE_CONTROL_ATTRIBUTE]: "" },
        React.createElement("span", null, "表示"),
        ...control.options.map((option) => React.createElement("button", {
            key: option.mode,
            type: "button",
            [RANK_RECOMMENDATION_BUTTON_ATTRIBUTE]: "",
            [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "view-mode",
            [RANK_RECOMMENDATION_VIEW_MODE_ATTRIBUTE]: option.mode,
            "aria-pressed": option.pressed ? "true" : "false",
            title: option.title
        }, option.label))
    );
}

function renderDisplayLimitControl(control: RankRecommendationReactControlsSnapshot["displayLimit"]): React.ReactElement | null {
    if (control === null || (control.showMoreButton === null && control.resetButton === null)) {
        return null;
    }

    return React.createElement("div", { "data-ra-rank-recommendation-display-limit-control": "" },
        control.showMoreButton === null ? null : renderButton(control.showMoreButton),
        control.resetButton === null ? null : renderButton(control.resetButton)
    );
}

function renderRankOrderControl(control: RankRecommendationReactControlsSnapshot["rankOrder"]): React.ReactElement | null {
    if (control === null) {
        return null;
    }

    return React.createElement("div", {
        [RANK_RECOMMENDATION_ORDER_CONTROL_ATTRIBUTE]: "",
        [RANK_RECOMMENDATION_ORDER_SOURCE_ATTRIBUTE]: control.source,
        [RANK_RECOMMENDATION_RANK_LADDER_ATTRIBUTE]: control.ladderJson
    },
        React.createElement("div", { "data-ra-rank-recommendation-order-summary": "" }, control.summary),
        React.createElement("details", null,
            React.createElement("summary", null, "ランク順序を調整"),
            React.createElement("textarea", {
                [RANK_RECOMMENDATION_ORDER_INPUT_ATTRIBUTE]: "",
                rows: 2,
                defaultValue: control.inputValue,
                title: "高いrankから低いrankの順に、rank名またはrank codeを区切って入力"
            }),
            React.createElement("div", { "data-ra-rank-recommendation-order-actions": "" },
                renderButton(control.saveButton),
                renderButton(control.reverseButton),
                renderButton(control.resetButton),
                React.createElement("span", { [RANK_RECOMMENDATION_ORDER_STATUS_ATTRIBUTE]: "" }, control.status)
            )
        )
    );
}

function RankRecommendationReactTable(props: { snapshot: RankRecommendationReactListSnapshot }): React.ReactElement {
    const snapshot = props.snapshot;
    return React.createElement("table", null,
        React.createElement(RankRecommendationReactTableHeader, { columns: snapshot.columns }),
        React.createElement(RankRecommendationReactTableBody, { snapshot })
    );
}

function RankRecommendationReactTableHeader(props: { columns: readonly string[] }): React.ReactElement {
    return React.createElement("thead", null,
        React.createElement("tr", null, props.columns.map((label) => React.createElement("th", { key: label, scope: "col" }, label)))
    );
}

function RankRecommendationReactTableBody(props: { snapshot: RankRecommendationReactListSnapshot }): React.ReactElement {
    const snapshot = props.snapshot;
    return React.createElement("tbody", null,
        snapshot.emptyText === null
            ? snapshot.rows.flatMap((row) => [
                React.createElement(RankRecommendationReactRow, { key: `${row.key}:main`, row }),
                React.createElement(RankRecommendationReactPreviewRows, { key: `${row.key}:preview`, row, colSpan: snapshot.columns.length })
            ])
            : React.createElement("tr", null,
                React.createElement("td", { colSpan: snapshot.columns.length }, snapshot.emptyText)
            )
    );
}

function RankRecommendationReactRow(props: { row: RankRecommendationReactRowSnapshot }): React.ReactElement {
    const row = props.row;
    return React.createElement("tr", {
        [RANK_RECOMMENDATION_ROW_ATTRIBUTE]: "",
        [RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE]: row.priority,
        [RANK_RECOMMENDATION_ACTION_ATTRIBUTE]: row.action,
        [RANK_RECOMMENDATION_STATUS_ATTRIBUTE]: row.status
    },
        ...row.cells.map((cell, index) => React.createElement(RankRecommendationReactCell, { key: `cell:${index}`, cell })),
        React.createElement(RankRecommendationReactRowActions, { row })
    );
}

function RankRecommendationReactCell(props: { cell: RankRecommendationReactCellSnapshot }): React.ReactElement {
    const { cell } = props;
    if (cell.kind === "rankGap") {
        return React.createElement("td", { [RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE]: "" },
            React.createElement("span", { [RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE]: "" },
                React.createElement("button", {
                    type: "button",
                    [RANK_RECOMMENDATION_RANK_GAP_TRIGGER_ATTRIBUTE]: "",
                    title: cell.title,
                    onClick: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }, cell.currentRankText),
                React.createElement("div", { [RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE]: "" },
                    React.createElement("table", null,
                        React.createElement("thead", null,
                            React.createElement("tr", null, ["部屋タイプ", "現ランク", "OH/キャパ", "対象候補との差", "備考"].map((label) => (
                                React.createElement("th", { key: label, scope: "col" }, label)
                            )))
                        ),
                        React.createElement("tbody", null, cell.entries.map((entry, entryIndex) => (
                            React.createElement("tr", {
                                key: `entry:${entryIndex}`,
                                "data-ra-rank-recommendation-rank-gap-target": entry.isTarget ? "true" : undefined
                            }, entry.values.map((value, valueIndex) => React.createElement("td", { key: `value:${valueIndex}` }, value)))
                        )))
                    )
                )
            )
        );
    }

    const attrs = cell.attribute === undefined ? {} : { [cell.attribute]: "" };
    return React.createElement("td", {
        title: cell.title,
        ...attrs
    }, cell.value);
}

function RankRecommendationReactRowActions(props: { row: RankRecommendationReactRowSnapshot }): React.ReactElement {
    const row = props.row;
    const curvePreviewId = buildRankRecommendationPreviewRowId("curve", row.curvePreview.key);
    const rankChangePreviewId = buildRankRecommendationPreviewRowId("rank-change", row.rankChangePreview.key);
    return React.createElement("td", null,
        renderAnalyzeLink(row.analyzeLink),
        renderButton(row.curvePreviewButton, {
            "aria-expanded": row.curvePreviewButton.expanded ? "true" : "false",
            "aria-controls": curvePreviewId
        }),
        renderCurvePopover(row.curvePopoverItems),
        renderButton(row.rankChangeButton, {
            "aria-expanded": row.rankChangeButton.expanded ? "true" : "false",
            "aria-controls": rankChangePreviewId
        }),
        React.createElement(InlineRankChange, { inlineRankChange: row.inlineRankChange }),
        renderButton(row.snoozeButton),
        renderButton(row.dismissButton),
        renderPendingDecision(row.pendingDecision),
        renderPendingRankChange(row.pendingRankChange),
        row.pendingRankChange === null ? renderRankChangeResult(row.rankChangeResult) : null
    );
}

function RankRecommendationReactPreviewRows(props: { row: RankRecommendationReactRowSnapshot; colSpan: number }): React.ReactElement[] {
    const row = props.row;
    return [
        React.createElement("tr", {
            key: "curve",
            id: buildRankRecommendationPreviewRowId("curve", row.curvePreview.key),
            [RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE]: "",
            [RANK_RECOMMENDATION_CURVE_PREVIEW_KEY_ATTRIBUTE]: row.curvePreview.key,
            hidden: !row.curvePreview.open
        }, React.createElement("td", {
            colSpan: props.colSpan,
            [RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE]: ""
        })),
        React.createElement("tr", {
            key: "rankChange",
            id: buildRankRecommendationPreviewRowId("rank-change", row.rankChangePreview.key),
            [RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_ROW_ATTRIBUTE]: "",
            [RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE]: row.rankChangePreview.key,
            hidden: !row.rankChangePreview.open
        }, React.createElement("td", {
            colSpan: props.colSpan,
            [RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_CELL_ATTRIBUTE]: ""
        }))
    ];
}

function renderAnalyzeLink(link: RankRecommendationReactButtonSnapshot & { href: string }): React.ReactElement {
    return React.createElement("a", {
        href: link.href,
        title: link.title,
        ...link.attrs
    }, link.text);
}

function renderButton(button: RankRecommendationReactButtonSnapshot, extraAttrs: Record<string, string> = {}): React.ReactElement {
    return React.createElement(RankRecommendationButtonPrimitive, { button, extraAttrs });
}

function RankRecommendationButtonPrimitive(props: {
    button: RankRecommendationReactButtonSnapshot;
    extraAttrs?: Record<string, string>;
}): React.ReactElement {
    const { button, extraAttrs = {} } = props;
    return React.createElement("button", {
        type: "button",
        title: button.title,
        disabled: button.disabled,
        [RANK_RECOMMENDATION_UI_PRIMITIVE_ATTRIBUTE]: "button",
        ...button.attrs,
        ...extraAttrs
    }, button.text);
}

function renderCurvePopover(items: readonly { label: string; value: string }[]): React.ReactElement {
    return React.createElement("details", { [RANK_RECOMMENDATION_CURVE_POPOVER_ATTRIBUTE]: "" },
        React.createElement("summary", {
            title: "候補行内でブッキングカーブの要点を確認"
        }, "要点"),
        React.createElement("div", null, items.map((item) => React.createElement("div", { key: item.label },
            React.createElement("span", null, item.label),
            React.createElement("strong", null, item.value)
        )))
    );
}

function InlineRankChange(props: { inlineRankChange: RankRecommendationReactRowSnapshot["inlineRankChange"] }): React.ReactElement {
    const inlineRankChange = props.inlineRankChange;
    const initialValue = inlineRankChange.selectedCode ?? inlineRankChange.options[0]?.code ?? "";
    const [selectedCode, setSelectedCode] = React.useState(initialValue);
    const selectedOption = inlineRankChange.options.find((option) => option.code === selectedCode) ?? null;
    const submitAttrs = {
        ...inlineRankChange.submitButton.attrs,
        ...(selectedOption === null
            ? {}
            : {
                [RANK_RECOMMENDATION_RANK_CHANGE_TARGET_CODE_ATTRIBUTE]: selectedOption.code,
                [RANK_RECOMMENDATION_RANK_CHANGE_TARGET_NAME_ATTRIBUTE]: selectedOption.name
            })
    };

    return React.createElement("span", { [RANK_RECOMMENDATION_INLINE_RANK_CHANGE_ATTRIBUTE]: "" },
        React.createElement("select", {
            [RANK_RECOMMENDATION_INLINE_RANK_SELECT_ATTRIBUTE]: "",
            title: "この候補行で反映候補にするrankを選ぶ",
            disabled: inlineRankChange.disabled,
            value: selectedCode,
            onChange: (event) => {
                setSelectedCode((event.currentTarget as HTMLSelectElement).value);
            }
        }, inlineRankChange.options.map((option) => React.createElement("option", {
            key: option.code,
            value: option.code,
            "data-rank-name": option.name
        }, option.name))),
        renderButton({
            ...inlineRankChange.submitButton,
            attrs: submitAttrs,
            disabled: inlineRankChange.submitButton.disabled === true || selectedOption === null
        })
    );
}

function renderPendingDecision(pendingDecision: RankRecommendationReactRowSnapshot["pendingDecision"]): React.ReactElement | null {
    if (pendingDecision === null) {
        return null;
    }

    return React.createElement("div", {
        [RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE]: "",
        [RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE]: pendingDecision.key
    }, React.createElement(RankRecommendationPendingNotice, {
        label: pendingDecision.label,
        cancelButton: pendingDecision.cancelButton
    }));
}

function renderPendingRankChange(pendingRankChange: RankRecommendationReactRowSnapshot["pendingRankChange"]): React.ReactElement | null {
    if (pendingRankChange === null) {
        return null;
    }

    return React.createElement("div", {
        [RANK_RECOMMENDATION_PENDING_RANK_CHANGE_ATTRIBUTE]: "",
        [RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE]: pendingRankChange.key
    }, React.createElement(RankRecommendationPendingNotice, {
        label: pendingRankChange.label,
        cancelButton: pendingRankChange.cancelButton
    }));
}

function RankRecommendationPendingNotice(props: {
    label: string;
    cancelButton: RankRecommendationReactButtonSnapshot;
}): React.ReactElement {
    return React.createElement(React.Fragment, null,
        React.createElement("span", null, props.label),
        renderButton(props.cancelButton)
    );
}

function renderRankChangeResult(result: RankRecommendationReactRowSnapshot["rankChangeResult"]): React.ReactElement | null {
    if (result === null) {
        return null;
    }

    return React.createElement("div", {
        [RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE]: result.status,
        title: result.title
    }, result.message);
}

function buildRankRecommendationPreviewRowId(kind: "curve" | "rank-change", key: string): string {
    return `ra-rank-recommendation-${kind}-${key.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
