import type { LiveCalendarDomSnapshot } from "../live/liveCalendarDomAdapter";
import type { AdjustmentReviewDataSnapshot } from "./adjustmentReviewDataSource";
import {
    ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE
} from "./adjustmentReviewFocus";
import {
    type AdjustmentReviewDirection,
    type AdjustmentReviewFilters,
    type AdjustmentReviewHorizon,
    type AdjustmentReviewIntentAssessment,
    type AdjustmentReviewIntentState,
    type AdjustmentReviewObservation,
    type AdjustmentReviewParentRow,
    type AdjustmentReviewSort,
    type AdjustmentReviewViewModel,
    type EvaluatedAdjustmentReviewEvent,
    isSameAdjustmentReviewStayDate
} from "./adjustmentReviewModel";

export const ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE = "data-ra-next-adjustment-review-root";
export const ADJUSTMENT_REVIEW_STYLE_ID = "revenue-assistant-next-adjustment-review-style";
export const ADJUSTMENT_REVIEW_HORIZON_ATTRIBUTE = "data-ra-next-adjustment-review-horizon";
export const ADJUSTMENT_REVIEW_EXPAND_ATTRIBUTE = "data-ra-next-adjustment-review-expand";
export const ADJUSTMENT_REVIEW_MORE_ATTRIBUTE = "data-ra-next-adjustment-review-more";
export const ADJUSTMENT_REVIEW_FILTER_ATTRIBUTE = "data-ra-next-adjustment-review-filter";
export const ADJUSTMENT_REVIEW_SORT_ATTRIBUTE = "data-ra-next-adjustment-review-sort";

export interface AdjustmentReviewRenderState {
    data: AdjustmentReviewDataSnapshot;
    expandedStayDates: ReadonlySet<string>;
    filtersExpanded: boolean;
    filters: AdjustmentReviewFilters;
    horizon: AdjustmentReviewHorizon;
    model: AdjustmentReviewViewModel | null;
    sort: AdjustmentReviewSort;
    visibleLimit: number;
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
type PaceTone = "decrease" | "increase" | "neutral" | "unavailable";

export function createAdjustmentReviewRoot(documentHost: Document): HTMLElement {
    const root = documentHost.createElement("section");
    root.setAttribute(ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE, "");
    root.setAttribute("aria-labelledby", "ra-next-adjustment-review-title");
    return root;
}

export function ensureAdjustmentReviewStyles(documentHost: Document): void {
    if (documentHost.getElementById(ADJUSTMENT_REVIEW_STYLE_ID) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.id = ADJUSTMENT_REVIEW_STYLE_ID;
    style.textContent = getAdjustmentReviewStyles();
    (documentHost.head ?? documentHost.documentElement).append(style);
}

export function renderAdjustmentReview(
    root: HTMLElement,
    state: AdjustmentReviewRenderState,
    calendar: LiveCalendarDomSnapshot | null
): void {
    const renderStatus = state.data.status === "ready" && state.model === null
        ? "loading"
        : state.data.status;
    root.setAttribute("data-ra-next-adjustment-review-state", renderStatus);
    const documentHost = root.ownerDocument;
    const header = createHeader(documentHost, state.horizon);
    const content = documentHost.createElement("div");
    content.setAttribute("data-ra-next-adjustment-review-content", "");

    if (state.data.status === "idle" || state.data.status === "loading") {
        content.append(createMessage(documentHost, "調整履歴と保存済み観測を確認しています。", "status"));
    } else if (state.data.status === "error") {
        content.append(createMessage(
            documentHost,
            state.data.reason === "rank-status-failed"
                ? "調整履歴を確認できませんでした。標準画面を操作して再確認してください。"
                : "保存済み観測を読み込めませんでした。標準画面はそのまま使えます。",
            "error"
        ));
    } else if (state.model === null) {
        content.append(createMessage(
            documentHost,
            "保存済み観測を小分けに計算しています。",
            "status"
        ));
    } else {
        content.append(createFilters(documentHost, state));
        if (state.model.parentRows.length === 0) {
            content.append(createMessage(
                documentHost,
                state.model.totalEventCount === 0
                    ? "表示中の宿泊日には確認できる調整履歴がありません。"
                    : "現在の条件に合う宿泊日はありません。",
                "status"
            ));
        } else {
            content.append(createSummary(documentHost, state));
            content.append(createParentTable(documentHost, state, calendar));
            if (state.visibleLimit < state.model.parentRows.length) {
                const more = documentHost.createElement("button");
                more.type = "button";
                more.setAttribute(ADJUSTMENT_REVIEW_MORE_ATTRIBUTE, "");
                more.textContent = `さらに表示（残り${state.model.parentRows.length - state.visibleLimit}日）`;
                content.append(more);
            }
        }
    }
    root.replaceChildren(header, content);
}

function createHeader(documentHost: Document, horizon: AdjustmentReviewHorizon): HTMLElement {
    const header = documentHost.createElement("header");
    header.setAttribute("data-ra-next-adjustment-review-header", "");
    const copy = documentHost.createElement("div");
    const title = documentHost.createElement("h2");
    title.id = "ra-next-adjustment-review-title";
    title.textContent = "調整前後レビュー";
    const note = documentHost.createElement("p");
    note.textContent = "上げはペース減、下げはペース増を意図として、観測変化と次の確認優先度を示します。因果効果、正解・失敗、具体的なランクや金額の判定ではありません。";
    copy.append(title, note);
    const switcher = documentHost.createElement("div");
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "比較期間");
    switcher.setAttribute("data-ra-next-adjustment-review-horizon-group", "");
    for (const value of [3, 7] as const) {
        const button = documentHost.createElement("button");
        button.type = "button";
        button.setAttribute(ADJUSTMENT_REVIEW_HORIZON_ATTRIBUTE, String(value));
        button.setAttribute("aria-pressed", String(value === horizon));
        button.textContent = `${value}日`;
        switcher.append(button);
    }
    header.append(copy, switcher);
    return header;
}

function createFilters(
    documentHost: Document,
    state: AdjustmentReviewRenderState
): HTMLElement {
    const details = documentHost.createElement("details");
    details.open = state.filtersExpanded;
    details.setAttribute("data-ra-next-adjustment-review-filters", "");
    const summary = documentHost.createElement("summary");
    summary.textContent = "絞り込みと並び替え";
    const grid = documentHost.createElement("div");
    grid.setAttribute("data-ra-next-adjustment-review-filter-grid", "");
    grid.append(
        createSelect(documentHost, "担当者", "actorName", state.filters.actorName ?? "", [
            { label: "すべて", value: "" },
            ...state.model!.actorOptions.map((option) => ({
                label: `${option.label}（${option.count}）`,
                value: option.value
            }))
        ]),
        createSelect(documentHost, "宿泊月", "stayMonth", state.filters.stayMonth ?? "", [
            { label: "すべて", value: "" },
            ...state.model!.stayMonths.map((month) => ({
                label: `${month.slice(0, 4)}年${Number(month.slice(4, 6))}月`,
                value: month
            }))
        ]),
        createSelect(documentHost, "曜日", "weekday", state.filters.weekday?.toString() ?? "", [
            { label: "すべて", value: "" },
            ...WEEKDAY_LABELS.map((label, value) => ({ label: `${label}曜日`, value: String(value) }))
        ]),
        createSelect(documentHost, "部屋タイプ", "roomGroupId", state.filters.roomGroupId ?? "", [
            { label: "すべて", value: "" },
            ...state.model!.roomOptions.map((option) => ({
                label: `${option.label}（${option.count}）`,
                value: option.value
            }))
        ]),
        createSelect(documentHost, "ランク方向", "direction", state.filters.direction ?? "", [
            { label: "すべて", value: "" },
            { label: "上げ", value: "raise" },
            { label: "下げ", value: "lower" },
            { label: "方向未確認", value: "unknown" }
        ]),
        createSelect(documentHost, "観測状態", "observation", state.filters.observation ?? "", [
            { label: "すべて", value: "" },
            { label: "比較可", value: "ready" },
            { label: "観測不足", value: "missing" },
            { label: "観測待ち", value: "pending" },
            { label: "再調整あり", value: "censored" },
            { label: "比較対象外", value: "excluded" }
        ]),
        createDateInput(documentHost, "調整日（開始）", "adjustmentDateFrom", state.filters.adjustmentDateFrom),
        createDateInput(documentHost, "調整日（終了）", "adjustmentDateTo", state.filters.adjustmentDateTo),
        createSelect(documentHost, "並び替え", "sort", state.sort, [
            { label: "比較可・変化量順", value: "default" },
            { label: "宿泊日順", value: "stay-date" },
            { label: "最終調整日順", value: "adjustment-date" },
            { label: "担当者順", value: "actor" },
            { label: "変化量順", value: "pace-delta" },
            { label: "部屋数順", value: "room-count" }
        ], ADJUSTMENT_REVIEW_SORT_ATTRIBUTE)
    );
    details.append(summary, grid);
    return details;
}

function createSelect(
    documentHost: Document,
    labelText: string,
    name: string,
    selectedValue: string,
    options: readonly { label: string; value: string }[],
    attribute = ADJUSTMENT_REVIEW_FILTER_ATTRIBUTE
): HTMLElement {
    const label = documentHost.createElement("label");
    const span = documentHost.createElement("span");
    span.textContent = labelText;
    const select = documentHost.createElement("select");
    select.setAttribute(attribute, name);
    for (const item of options) {
        const option = documentHost.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        option.selected = item.value === selectedValue;
        select.append(option);
    }
    label.append(span, select);
    return label;
}

function createDateInput(
    documentHost: Document,
    labelText: string,
    name: string,
    compactValue: string | null
): HTMLElement {
    const label = documentHost.createElement("label");
    const span = documentHost.createElement("span");
    span.textContent = labelText;
    const input = documentHost.createElement("input");
    input.type = "date";
    input.setAttribute(ADJUSTMENT_REVIEW_FILTER_ATTRIBUTE, name);
    input.value = compactValue === null ? "" : formatInputDate(compactValue);
    label.append(span, input);
    return label;
}

function createSummary(documentHost: Document, state: AdjustmentReviewRenderState): HTMLElement {
    const summary = documentHost.createElement("p");
    summary.setAttribute("data-ra-next-adjustment-review-summary", "");
    const shown = Math.min(state.visibleLimit, state.model!.parentRows.length);
    summary.textContent = `${state.model!.parentRows.length}宿泊日のうち${shown}件を表示。${state.horizon}日比較の値だけを集計しています。`;
    return summary;
}

function createParentTable(
    documentHost: Document,
    state: AdjustmentReviewRenderState,
    calendar: LiveCalendarDomSnapshot | null
): HTMLElement {
    const wrap = documentHost.createElement("div");
    wrap.setAttribute("data-ra-next-adjustment-review-table-wrap", "");
    const table = documentHost.createElement("table");
    table.setAttribute("data-ra-next-adjustment-review-table", "");
    const caption = documentHost.createElement("caption");
    caption.textContent = `宿泊日別の調整前後${state.horizon}日ペース比較`;
    const thead = documentHost.createElement("thead");
    const header = documentHost.createElement("tr");
    for (const label of ["宿泊日", "調整", "担当者", "ランク方向", "意図 / 次アクション", "観測", "個人予約ペース"]) {
        const cell = documentHost.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        header.append(cell);
    }
    thead.append(header);
    const tbody = documentHost.createElement("tbody");
    for (const row of state.model!.parentRows.slice(0, state.visibleLimit)) {
        const expanded = state.expandedStayDates.has(row.stayDate);
        tbody.append(
            createParentSummaryRow(documentHost, row, state.model!.maxAbsPace, expanded),
            createParentDetailRow(documentHost, row, state.horizon, expanded, calendar)
        );
    }
    table.append(caption, thead, tbody);
    wrap.append(table);
    return wrap;
}

function createParentSummaryRow(
    documentHost: Document,
    row: AdjustmentReviewParentRow,
    maxAbsPace: number,
    expanded: boolean
): HTMLTableRowElement {
    const tr = documentHost.createElement("tr");
    tr.setAttribute("data-ra-next-adjustment-review-parent", row.stayDate);
    tr.append(
        createDataCell(documentHost, "宿泊日", createExpandButton(documentHost, row, expanded)),
        createDataCell(documentHost, "調整", createAdjustmentSummary(documentHost, row)),
        createDataCell(documentHost, "担当者", createActorSummary(documentHost, row)),
        createDataCell(documentHost, "ランク方向", createDirectionSummary(documentHost, row)),
        createDataCell(documentHost, "意図 / 次アクション", createIntentSummary(documentHost, row)),
        createDataCell(documentHost, "観測", createObservationSummary(documentHost, row)),
        createDataCell(documentHost, "個人予約ペース", createPaceSummary(documentHost, row, maxAbsPace))
    );
    return tr;
}

function createExpandButton(
    documentHost: Document,
    row: AdjustmentReviewParentRow,
    expanded: boolean
): HTMLElement {
    const wrap = documentHost.createElement("div");
    const button = documentHost.createElement("button");
    button.type = "button";
    button.setAttribute(ADJUSTMENT_REVIEW_EXPAND_ATTRIBUTE, row.stayDate);
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-controls", `ra-next-adjustment-review-detail-${row.stayDate}`);
    button.textContent = `${expanded ? "閉じる" : "詳細"} ${formatDate(row.stayDate)}（${WEEKDAY_LABELS[row.weekday]}）`;
    const rooms = documentHost.createElement("small");
    rooms.textContent = `${row.roomCount}部屋`;
    wrap.append(button, rooms);
    return wrap;
}

function createAdjustmentSummary(documentHost: Document, row: AdjustmentReviewParentRow): HTMLElement {
    const wrap = documentHost.createElement("div");
    wrap.append(row.adjustmentDateFrom === row.adjustmentDateTo
        ? formatDate(row.adjustmentDateFrom)
        : `${formatDate(row.adjustmentDateFrom)}〜${formatDate(row.adjustmentDateTo)}`);
    const meta = documentHost.createElement("small");
    meta.textContent = `${row.timestampCount}回 / LT ${row.leadTimeFrom === row.leadTimeTo
        ? row.leadTimeFrom
        : `${row.leadTimeFrom}〜${row.leadTimeTo}`}日`;
    wrap.append(meta);
    return wrap;
}

function createActorSummary(documentHost: Document, row: AdjustmentReviewParentRow): HTMLElement {
    const wrap = documentHost.createElement("div");
    wrap.append(row.actorNames.length === 0 ? "担当者不明" : row.actorNames.join("、"));
    const coverage = documentHost.createElement("small");
    coverage.textContent = `確認 ${row.actorCoverageCount}/${row.roomCount}`;
    wrap.append(coverage);
    return wrap;
}

function createDirectionSummary(documentHost: Document, row: AdjustmentReviewParentRow): HTMLElement {
    const wrap = documentHost.createElement("span");
    wrap.setAttribute("data-ra-next-adjustment-review-direction-summary", "");
    for (const direction of ["raise", "lower", "unknown"] as const) {
        if (row.directionCounts[direction] > 0) {
            wrap.append(createDirectionBadge(documentHost, direction, row.directionCounts[direction]));
        }
    }
    if (row.numericDirectionCount > 0) {
        const fallback = documentHost.createElement("small");
        fallback.textContent = `数値名から仮判定 ${row.numericDirectionCount}`;
        wrap.append(fallback);
    }
    return wrap;
}

function createIntentSummary(documentHost: Document, row: AdjustmentReviewParentRow): HTMLElement {
    const wrap = documentHost.createElement("span");
    wrap.setAttribute("data-ra-next-adjustment-review-intent-summary", "");
    for (const state of ["aligned", "opposed", "unchanged", "unavailable"] as const) {
        if (row.intentCounts[state] > 0) {
            wrap.append(createIntentBadge(documentHost, state, row.intentCounts[state]));
        }
    }
    return wrap;
}

function createObservationSummary(documentHost: Document, row: AdjustmentReviewParentRow): HTMLElement {
    const wrap = documentHost.createElement("div");
    const main = documentHost.createElement("span");
    main.textContent = `比較可 ${row.readyCount}/${row.roomCount}`;
    const detail = documentHost.createElement("small");
    detail.textContent = [
        ["不足", row.observationCounts.missing],
        ["待ち", row.observationCounts.pending],
        ["再調整", row.observationCounts.censored],
        ["対象外", row.observationCounts.excluded]
    ].filter(([, count]) => count !== 0).map(([label, count]) => `${label} ${count}`).join(" / ") || "全室比較可";
    wrap.append(main, detail);
    return wrap;
}

function createPaceSummary(
    documentHost: Document,
    row: AdjustmentReviewParentRow,
    maxAbsPace: number
): HTMLElement {
    const wrap = documentHost.createElement("div");
    wrap.setAttribute("data-ra-next-adjustment-review-pace", "");
    wrap.append(
        createPaceLine(documentHost, "調整前", row.beforePaceTotal, "before", maxAbsPace),
        createPaceLine(documentHost, "調整後", row.afterPaceTotal, "after", maxAbsPace)
    );
    wrap.append(createPaceDelta(documentHost, row.deltaTotal, row.readyCount > 0));
    return wrap;
}

function createPaceLine(
    documentHost: Document,
    label: string,
    value: number,
    kind: "after" | "before",
    maxAbsPace: number
): HTMLElement {
    const line = documentHost.createElement("div");
    line.setAttribute("data-ra-next-adjustment-review-pace-line", kind);
    const name = documentHost.createElement("span");
    name.textContent = label;
    const track = documentHost.createElement("span");
    track.setAttribute("data-ra-next-adjustment-review-pace-track", "");
    const bar = documentHost.createElement("span");
    bar.setAttribute("data-ra-next-adjustment-review-pace-bar", kind);
    bar.style.width = `${Math.min(100, Math.abs(value) / maxAbsPace * 100).toFixed(1)}%`;
    track.append(bar);
    const number = documentHost.createElement("span");
    number.setAttribute("data-ra-next-adjustment-review-value-tone", getPaceTone(value));
    number.textContent = formatSigned(value);
    line.append(name, track, number);
    return line;
}

function createDirectionBadge(
    documentHost: Document,
    direction: AdjustmentReviewDirection,
    count?: number
): HTMLElement {
    const badge = documentHost.createElement("span");
    badge.setAttribute("data-ra-next-adjustment-review-direction", direction);
    const icon = documentHost.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = direction === "raise" ? "↑" : direction === "lower" ? "↓" : "?";
    const label = documentHost.createElement("span");
    label.textContent = `${formatDirection(direction)}${count === undefined ? "" : ` ${count}`}`;
    badge.append(icon, label);
    return badge;
}

function createIntentBadge(
    documentHost: Document,
    state: AdjustmentReviewIntentState,
    count?: number
): HTMLElement {
    const badge = documentHost.createElement("span");
    badge.setAttribute("data-ra-next-adjustment-review-intent", state);
    const icon = documentHost.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = state === "aligned"
        ? "↔"
        : state === "opposed"
            ? "⇄"
            : state === "unchanged" ? "0" : "?";
    const label = documentHost.createElement("span");
    label.textContent = `${formatIntentSummary(state)}${count === undefined ? "" : ` ${count}`}`;
    badge.append(icon, label);
    return badge;
}

function createIntentAssessment(
    documentHost: Document,
    assessment: AdjustmentReviewIntentAssessment
): HTMLElement {
    const wrap = documentHost.createElement("span");
    wrap.setAttribute("data-ra-next-adjustment-review-intent-assessment", assessment.state);
    wrap.append(createIntentBadge(documentHost, assessment.state));
    const action = documentHost.createElement("small");
    action.setAttribute("data-ra-next-adjustment-review-next-action", assessment.nextAction);
    action.textContent = formatNextAction(assessment);
    wrap.append(action);
    return wrap;
}

function createEventPace(
    documentHost: Document,
    observation: AdjustmentReviewObservation
): HTMLElement {
    const wrap = documentHost.createElement("span");
    wrap.setAttribute("data-ra-next-adjustment-review-event-pace", "");
    if (observation.state !== "ready") {
        wrap.textContent = "—";
        return wrap;
    }
    const values = documentHost.createElement("span");
    values.append(
        "前 ",
        createSignedValue(documentHost, observation.beforePace),
        " / 後 ",
        createSignedValue(documentHost, observation.afterPace)
    );
    wrap.append(values, createPaceDelta(documentHost, observation.delta, true, "変化"));
    return wrap;
}

function createSignedValue(documentHost: Document, value: number): HTMLElement {
    const span = documentHost.createElement("span");
    span.setAttribute("data-ra-next-adjustment-review-value-tone", getPaceTone(value));
    span.textContent = formatSigned(value);
    return span;
}

function createPaceDelta(
    documentHost: Document,
    value: number,
    ready: boolean,
    label = "変化量"
): HTMLElement {
    const tone: PaceTone = ready ? getPaceTone(value) : "unavailable";
    const delta = documentHost.createElement("strong");
    delta.setAttribute("data-ra-next-adjustment-review-pace-tone", tone);
    delta.textContent = ready
        ? `${label} ${formatSigned(value)}（${formatPaceTone(tone)}）`
        : `${label} —（比較可データなし）`;
    return delta;
}

function createParentDetailRow(
    documentHost: Document,
    row: AdjustmentReviewParentRow,
    horizon: AdjustmentReviewHorizon,
    expanded: boolean,
    calendar: LiveCalendarDomSnapshot | null
): HTMLTableRowElement {
    const tr = documentHost.createElement("tr");
    tr.id = `ra-next-adjustment-review-detail-${row.stayDate}`;
    tr.hidden = !expanded;
    tr.setAttribute("data-ra-next-adjustment-review-detail", row.stayDate);
    const cell = documentHost.createElement("td");
    cell.colSpan = 7;
    if (!expanded) {
        tr.append(cell);
        return tr;
    }
    const table = documentHost.createElement("table");
    table.setAttribute("data-ra-next-adjustment-review-event-table", "");
    const caption = documentHost.createElement("caption");
    caption.textContent = `${formatDate(row.stayDate)}の部屋タイプ別調整履歴`;
    const thead = documentHost.createElement("thead");
    const header = documentHost.createElement("tr");
    for (const label of ["部屋タイプ", "調整", "担当者", "ランク", "意図 / 次アクション", "観測", "ペース", "確認"]) {
        const th = documentHost.createElement("th");
        th.scope = "col";
        th.textContent = label;
        header.append(th);
    }
    thead.append(header);
    const tbody = documentHost.createElement("tbody");
    const adoptedKeys = new Set(row.latestEvents.map((event) => event.eventKey));
    for (const event of row.detailEvents) {
        tbody.append(createEventRow(
            documentHost,
            event,
            horizon,
            adoptedKeys.has(event.eventKey),
            calendar
        ));
    }
    table.append(caption, thead, tbody);
    cell.append(table);
    tr.append(cell);
    return tr;
}

function createEventRow(
    documentHost: Document,
    event: EvaluatedAdjustmentReviewEvent,
    horizon: AdjustmentReviewHorizon,
    adopted: boolean,
    calendar: LiveCalendarDomSnapshot | null
): HTMLTableRowElement {
    const tr = documentHost.createElement("tr");
    tr.setAttribute("data-ra-next-adjustment-review-event", event.eventKey);
    const observation = event.observations[horizon];
    const room = documentHost.createElement("span");
    room.textContent = event.roomGroupName ?? "部屋タイプ不明";
    if (adopted) {
        const mark = documentHost.createElement("small");
        mark.textContent = "親行採用";
        room.append(mark);
    }
    const adjustment = documentHost.createElement("span");
    adjustment.textContent = `${formatDate(event.reflectedDate)} / LT ${event.daysBeforeStay}日`;
    const actor = documentHost.createElement("span");
    actor.textContent = event.actorName ?? "担当者不明";
    const rank = documentHost.createElement("span");
    rank.setAttribute("data-ra-next-adjustment-review-rank", "");
    const transition = documentHost.createElement("span");
    transition.textContent = `${formatRank(event.beforeRankName)} → ${formatRank(event.afterRankName)}`;
    rank.append(transition, createDirectionBadge(documentHost, event.direction));
    if (event.direction !== "unknown" && event.directionSource === "numeric_rank_name") {
        const fallback = documentHost.createElement("small");
        fallback.textContent = "数値名から仮判定";
        rank.append(fallback);
    }
    const status = documentHost.createElement("span");
    status.textContent = formatObservation(observation);
    const intent = createIntentAssessment(documentHost, event.intentAssessments[horizon]);
    const pace = createEventPace(documentHost, observation);
    const action = createAnalyzeAction(documentHost, event, calendar);
    tr.append(
        createDataCell(documentHost, "部屋タイプ", room),
        createDataCell(documentHost, "調整", adjustment),
        createDataCell(documentHost, "担当者", actor),
        createDataCell(documentHost, "ランク", rank),
        createDataCell(documentHost, "意図 / 次アクション", intent),
        createDataCell(documentHost, "観測", status),
        createDataCell(documentHost, "ペース", pace),
        createDataCell(documentHost, "確認", action)
    );
    return tr;
}

function createAnalyzeAction(
    documentHost: Document,
    event: EvaluatedAdjustmentReviewEvent,
    calendar: LiveCalendarDomSnapshot | null
): HTMLElement {
    const cell = calendar?.cells.find((candidate) => (
        isSameAdjustmentReviewStayDate(candidate.stayDate, event.stayDate)
    ));
    const action = cell?.analyzeHref === null || cell?.analyzeHref === undefined
        ? documentHost.createElement("button")
        : documentHost.createElement("a");
    if (action.tagName === "BUTTON") {
        (action as HTMLButtonElement).type = "button";
    } else {
        (action as HTMLAnchorElement).href = cell?.analyzeHref ?? "";
    }
    action.setAttribute(ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE, "");
    action.setAttribute("data-stay-date", event.stayDate);
    action.setAttribute("data-room-group-id", event.roomGroupId);
    action.setAttribute("data-event-key", event.eventKey);
    action.textContent = "Analyzeで確認";
    return action;
}

function createDataCell(
    documentHost: Document,
    label: string,
    content: HTMLElement
): HTMLTableCellElement {
    const cell = documentHost.createElement("td");
    cell.setAttribute("data-label", label);
    cell.append(content);
    return cell;
}

function createMessage(documentHost: Document, text: string, tone: "error" | "status"): HTMLElement {
    const message = documentHost.createElement("p");
    message.setAttribute("data-ra-next-adjustment-review-message", tone);
    message.setAttribute("role", tone === "error" ? "alert" : "status");
    message.textContent = text;
    return message;
}

function formatObservation(observation: AdjustmentReviewObservation): string {
    switch (observation.state) {
        case "ready": return "比較可";
        case "missing": return "観測不足（exact pointなし）";
        case "pending": return "観測待ち";
        case "censored": return "再調整あり";
        case "excluded": return observation.reason === "same-day-multiple"
            ? "比較対象外（同日複数調整）"
            : "比較対象外（宿泊日を越える期間）";
    }
}

function formatIntentSummary(state: AdjustmentReviewIntentState): string {
    switch (state) {
        case "aligned": return "同方向・様子見";
        case "opposed": return "逆方向・追加確認";
        case "unchanged": return "変化なし・反応確認";
        case "unavailable": return "判定材料待ち";
    }
}

function formatNextAction(assessment: AdjustmentReviewIntentAssessment): string {
    switch (assessment.nextAction) {
        case "monitor": return "様子見・追加調整の緊急度低";
        case "review-adjustment": return `${formatFollowUpDirection(assessment)}方向の追加調整余地を確認`;
        case "review-response": return `${formatFollowUpDirection(assessment)}方向の反応と追加調整余地を確認`;
        case "needs-evidence": return "観測状態またはランク方向を確認";
    }
}

function formatFollowUpDirection(assessment: AdjustmentReviewIntentAssessment): string {
    return assessment.followUpDirection === null
        ? "同じ"
        : formatDirection(assessment.followUpDirection);
}

function formatDirection(value: EvaluatedAdjustmentReviewEvent["direction"]): string {
    return value === "raise" ? "上げ" : value === "lower" ? "下げ" : "方向未確認";
}

function formatRank(value: string | null): string {
    return value ?? "未確認";
}

function formatSigned(value: number): string {
    return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function getPaceTone(value: number): Exclude<PaceTone, "unavailable"> {
    return value > 0 ? "increase" : value < 0 ? "decrease" : "neutral";
}

function formatPaceTone(value: PaceTone): string {
    switch (value) {
        case "increase": return "増加";
        case "decrease": return "減少";
        case "neutral": return "変化なし";
        case "unavailable": return "比較不可";
    }
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string): string {
    return /^\d{8}$/u.test(value)
        ? `${Number(value.slice(4, 6))}/${Number(value.slice(6, 8))}`
        : value;
}

function formatInputDate(value: string): string {
    return /^\d{8}$/u.test(value)
        ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
        : "";
}

function getAdjustmentReviewStyles(): string {
    return `
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] {
    --ra-review-border: #d8e0e8;
    --ra-review-ink: #1f2a37;
    --ra-review-muted: #5f6b78;
    --ra-review-increase-ink: #075985;
    --ra-review-increase-bg: #e0f2fe;
    --ra-review-increase-border: #7dd3fc;
    --ra-review-decrease-ink: #9a3412;
    --ra-review-decrease-bg: #fff7ed;
    --ra-review-decrease-border: #fdba74;
    --ra-review-neutral-ink: #475569;
    --ra-review-neutral-bg: #f1f5f9;
    --ra-review-neutral-border: #cbd5e1;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    margin: 18px 0;
    padding: 18px;
    color: var(--ra-review-ink);
    background: #fff;
    border: 1px solid var(--ra-review-border);
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(31, 42, 55, .06);
    font-family: inherit;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] *,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] *::before,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] *::after { box-sizing: border-box; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-header] {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] h2 { margin: 0 0 4px; font-size: 20px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] p { margin: 4px 0; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-header] p {
    max-width: 74ch; color: var(--ra-review-muted); font-size: 13px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] button,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] select,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] input,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] a[${ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE}] {
    min-height: 44px; font: inherit;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] button,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] a[${ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE}] {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 8px 12px; color: #174a78; background: #f5f9fd;
    border: 1px solid #a9bfd2; border-radius: 8px; cursor: pointer; text-decoration: none;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] button:focus-visible,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] select:focus-visible,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] input:focus-visible,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] a:focus-visible {
    outline: 3px solid rgba(25, 103, 168, .35); outline-offset: 2px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-horizon-group] {
    display: inline-flex; flex: 0 0 auto;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-horizon-group] button {
    border-radius: 0;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-horizon-group] button:first-child { border-radius: 8px 0 0 8px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-horizon-group] button:last-child { border-radius: 0 8px 8px 0; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] button[aria-pressed="true"] { color: #fff; background: #1967a8; border-color: #1967a8; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-filters] {
    margin-top: 16px; padding: 0 12px 12px; background: #f7f9fb; border-radius: 8px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-filters] > summary {
    min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 700;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-filter-grid] {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-filter-grid] label {
    display: grid; gap: 4px; min-width: 0; color: var(--ra-review-muted); font-size: 12px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] select,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] input { width: 100%; padding: 8px; color: var(--ra-review-ink); background: #fff; border: 1px solid #b8c3cf; border-radius: 6px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-summary] { margin: 14px 0 8px; color: var(--ra-review-muted); font-size: 13px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-table-wrap] { width: 100%; overflow-x: auto; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] table { width: 100%; border-collapse: collapse; font-size: 13px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] th,
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] td { padding: 10px 8px; vertical-align: top; text-align: left; border-bottom: 1px solid var(--ra-review-border); }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] th { color: #465466; background: #f7f9fb; font-size: 12px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] td small { display: block; margin-top: 3px; color: var(--ra-review-muted); }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-detail] > td { padding: 10px 14px 18px; background: #fbfcfd; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-table] { background: #fff; border: 1px solid var(--ra-review-border); }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-direction-summary],
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent-summary] {
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 132px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-direction-summary] > small { flex-basis: 100%; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-direction],
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent] {
    display: inline-flex; align-items: center; gap: 4px; width: fit-content;
    padding: 2px 7px; border: 1px solid; border-radius: 999px;
    font-size: 12px; font-weight: 700; line-height: 1.35; white-space: nowrap;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-direction="raise"] {
    color: var(--ra-review-increase-ink); background: var(--ra-review-increase-bg); border-color: var(--ra-review-increase-border);
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-direction="lower"] {
    color: var(--ra-review-decrease-ink); background: var(--ra-review-decrease-bg); border-color: var(--ra-review-decrease-border);
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-direction="unknown"] {
    color: var(--ra-review-neutral-ink); background: var(--ra-review-neutral-bg); border-color: var(--ra-review-neutral-border);
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent="aligned"] {
    color: #155e75; background: #ecfeff; border-color: #67e8f9;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent="opposed"] {
    color: #6b21a8; background: #faf5ff; border-color: #d8b4fe;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent="unchanged"] {
    color: #92400e; background: #fffbeb; border-color: #fcd34d;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent="unavailable"] {
    color: var(--ra-review-neutral-ink); background: #f8fafc; border-color: var(--ra-review-neutral-border); border-style: dashed;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-rank] {
    display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-rank] > small { flex-basis: 100%; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent-assessment] {
    display: grid; align-items: start; gap: 3px; min-width: 150px;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-intent-assessment] > small { margin-top: 0; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace] { min-width: 180px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-line] {
    display: grid; grid-template-columns: 42px minmax(52px, 1fr) 34px; gap: 6px; align-items: center;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-track] { height: 7px; overflow: hidden; background: #edf1f5; border-radius: 99px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-bar] { display: block; height: 100%; min-width: 1px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-bar="before"] { background: #8a949e; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-bar="after"] { background: #2879bd; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-value-tone] { font-weight: 700; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-value-tone="increase"] { color: var(--ra-review-increase-ink); }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-value-tone="decrease"] { color: var(--ra-review-decrease-ink); }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-value-tone="neutral"] { color: var(--ra-review-neutral-ink); }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-tone] {
    display: inline-flex; width: fit-content; margin-top: 4px; padding: 2px 7px;
    border: 1px solid; border-radius: 999px; font-size: 12px; line-height: 1.35;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-tone="increase"] {
    color: var(--ra-review-increase-ink); background: var(--ra-review-increase-bg); border-color: var(--ra-review-increase-border);
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-tone="decrease"] {
    color: var(--ra-review-decrease-ink); background: var(--ra-review-decrease-bg); border-color: var(--ra-review-decrease-border);
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-tone="neutral"] {
    color: var(--ra-review-neutral-ink); background: var(--ra-review-neutral-bg); border-color: var(--ra-review-neutral-border);
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace-tone="unavailable"] {
    color: var(--ra-review-neutral-ink); background: #f8fafc; border-color: var(--ra-review-neutral-border); border-style: dashed;
}
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-pace] { display: grid; gap: 2px; min-width: 150px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [${ADJUSTMENT_REVIEW_MORE_ATTRIBUTE}] { width: 100%; margin-top: 12px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-message] { margin-top: 16px; padding: 14px; background: #f7f9fb; border-radius: 8px; }
[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-message="error"] { border-left: 4px solid #8b6670; }
@media (max-width: 720px) {
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] { margin: 12px 0; padding: 14px 12px; border-radius: 8px; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-header] { display: grid; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-horizon-group],
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-horizon-group] button { width: 100%; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-filter-grid] { grid-template-columns: 1fr; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-table-wrap] { overflow: visible; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-table] > thead,
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-table] > thead { display: none; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-table],
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-table] > tbody,
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-table] > tbody > tr,
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-table] > tbody > tr > td,
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-table],
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-table] > tbody,
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-table] > tbody > tr,
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-table] > tbody > tr > td { display: block; width: 100%; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-parent] { margin: 10px 0; padding: 8px; border: 1px solid var(--ra-review-border); border-radius: 8px; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] td { display: grid !important; grid-template-columns: minmax(84px, 34%) minmax(0, 1fr); gap: 8px; padding: 8px 4px; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] td::before { content: attr(data-label); color: var(--ra-review-muted); font-size: 12px; font-weight: 700; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-detail] > td { display: block !important; padding: 8px 0 16px; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-detail] > td::before { content: none; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-event-table] tr { margin: 8px 0; padding: 8px; border: 1px solid var(--ra-review-border); border-radius: 6px; }
    [${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}] [data-ra-next-adjustment-review-pace] { min-width: 0; }
}
`;
}
