import type {
    BookingCurveReferenceCurrentSummary,
    BookingCurveReferenceMetricSummary
} from "./bookingCurveReferenceModel";
import {
    BOOKING_CURVE_REFERENCE_COMPONENT_ATTRIBUTE,
    BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE,
    BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE,
    BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE,
    createEmbeddedBookingCurveReference,
    getBookingCurveReferenceStyles
} from "./bookingCurveReferenceView";
import type {
    SalesSettingClassicCardViewModel,
    SalesSettingClassicViewModel
} from "./salesSettingClassicModel";

export const SALES_SETTING_CLASSIC_ROOT_ATTRIBUTE = "data-ra-next-sales-setting-classic-root";
export const SALES_SETTING_CLASSIC_STYLE_ATTRIBUTE = "data-ra-next-sales-setting-classic-style";
export const SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE = "data-ra-next-sales-setting-classic-supplement";
export const SALES_SETTING_CLASSIC_RANK_DETAIL_ATTRIBUTE = "data-ra-next-sales-setting-classic-rank-detail";
export const SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE = "data-ra-next-sales-setting-classic-scope";
export const SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE = "data-ra-next-sales-setting-classic-curve-toggle";

const OVERALL_ATTRIBUTE = "data-ra-next-sales-setting-overall-summary";
const RANK_OVERVIEW_ATTRIBUTE = "data-ra-next-sales-setting-rank-overview";
const SUMMARY_TABLE_ATTRIBUTE = "data-ra-next-sales-setting-summary-table";
const SUMMARY_ROW_ATTRIBUTE = "data-ra-next-sales-setting-summary-row";
const SUMMARY_TONE_ATTRIBUTE = "data-ra-next-sales-setting-summary-tone";
const PREPARING_ATTRIBUTE = "data-ra-next-sales-setting-comparison-preparing";
const CURVE_SECTION_ATTRIBUTE = "data-ra-next-sales-setting-curve-section";

export interface SalesSettingClassicNativeCard {
    cardElement: HTMLElement;
    detailWrapperElement: HTMLElement | null;
    latestReflectionElement: HTMLElement | null;
    roomLabel: string;
    scopeKey: string;
}

export type SalesSettingClassicRenderState =
    | { status: "loading"; stayDate: string }
    | { status: "ready"; viewModel: SalesSettingClassicViewModel };

export function createSalesSettingClassicRoot(documentHost: Document): HTMLElement {
    const root = documentHost.createElement("div");
    root.setAttribute(SALES_SETTING_CLASSIC_ROOT_ATTRIBUTE, "");
    root.setAttribute("aria-live", "polite");
    return root;
}

export function ensureSalesSettingClassicStyles(documentHost: Document): void {
    if (documentHost.querySelector(`[${SALES_SETTING_CLASSIC_STYLE_ATTRIBUTE}]`) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.setAttribute(SALES_SETTING_CLASSIC_STYLE_ATTRIBUTE, "");
    const embeddedCurveStyles = getBookingCurveReferenceStyles().replaceAll(
        `[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}]`,
        `[${BOOKING_CURVE_REFERENCE_COMPONENT_ATTRIBUTE}]`
    );
    style.textContent = `${getSalesSettingClassicStyles()}\n${embeddedCurveStyles}`;
    documentHost.head.append(style);
}

export function removeSalesSettingClassicArtifacts(documentHost: Document): void {
    for (const element of documentHost.querySelectorAll([
        `[${SALES_SETTING_CLASSIC_ROOT_ATTRIBUTE}]`,
        `[${SALES_SETTING_CLASSIC_STYLE_ATTRIBUTE}]`,
        `[${SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE}]`,
        `[${SALES_SETTING_CLASSIC_RANK_DETAIL_ATTRIBUTE}]`
    ].join(", "))) {
        element.remove();
    }
}

export function renderSalesSettingClassic(
    root: HTMLElement,
    state: SalesSettingClassicRenderState,
    nativeCards: readonly SalesSettingClassicNativeCard[],
    options: { narrow: boolean; openScopes: ReadonlySet<string> }
): void {
    root.setAttribute("data-ra-next-sales-setting-classic-state", state.status);
    if (state.status === "loading") {
        root.replaceChildren(createLoadingOverall(root.ownerDocument));
        renderLoadingSupplements(nativeCards);
        return;
    }

    const { viewModel } = state;
    const cardByScope = new Map(viewModel.cards.map((card) => [card.scope.key, card]));
    const children: HTMLElement[] = [];
    const rankOverview = createRankOverview(root.ownerDocument, viewModel.cards);
    if (rankOverview !== null) {
        children.push(rankOverview);
    }
    children.push(createOverallSummary(root.ownerDocument, viewModel, options.narrow));
    root.replaceChildren(...children);

    const currentCardElements = new Set(nativeCards.map((card) => card.cardElement));
    for (const stale of root.ownerDocument.querySelectorAll<HTMLElement>(`[${SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE}]`)) {
        if (stale.parentElement === null || !currentCardElements.has(stale.parentElement)) {
            stale.remove();
        }
    }
    for (const detail of root.ownerDocument.querySelectorAll<HTMLElement>(`[${SALES_SETTING_CLASSIC_RANK_DETAIL_ATTRIBUTE}]`)) {
        detail.remove();
    }
    for (const nativeCard of nativeCards) {
        renderNativeCard(
            nativeCard,
            cardByScope.get(nativeCard.scopeKey) ?? null,
            options.openScopes.has(nativeCard.scopeKey),
            options.narrow
        );
    }
}

function createLoadingOverall(documentHost: Document): HTMLElement {
    const section = documentHost.createElement("section");
    section.setAttribute(OVERALL_ATTRIBUTE, "");
    const row = documentHost.createElement("div");
    row.setAttribute("data-ra-next-sales-setting-overall-sales-row", "");
    const title = documentHost.createElement("span");
    title.setAttribute("data-ra-next-sales-setting-overall-title", "");
    title.textContent = "全体";
    row.append(title);
    section.append(row, createPreparingMessage(documentHost));
    return section;
}

function renderLoadingSupplements(nativeCards: readonly SalesSettingClassicNativeCard[]): void {
    for (const nativeCard of nativeCards) {
        const supplement = ensureNativeSupplement(nativeCard);
        supplement.replaceChildren(createPreparingMessage(supplement.ownerDocument));
    }
}

function createOverallSummary(
    documentHost: Document,
    viewModel: SalesSettingClassicViewModel,
    narrow: boolean
): HTMLElement {
    const section = documentHost.createElement("section");
    section.setAttribute(OVERALL_ATTRIBUTE, "");
    section.setAttribute(SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE, "hotel");
    const row = documentHost.createElement("div");
    row.setAttribute("data-ra-next-sales-setting-overall-sales-row", "");
    const title = documentHost.createElement("span");
    title.setAttribute("data-ra-next-sales-setting-overall-title", "");
    title.textContent = "全体";
    const metric = documentHost.createElement("span");
    metric.setAttribute("data-ra-next-sales-setting-overall-metric", "");
    metric.textContent = `販売室数 : ${formatCapacity(
        viewModel.overall.summary.all.currentValue,
        viewModel.overall.capacityRooms
    )}`;
    row.append(title, metric);
    section.append(row, createSummaryTable(documentHost, viewModel.overall.summary));
    if (hasMissingSummaryValue(viewModel.overall.summary)) {
        section.append(createPreparingMessage(documentHost));
    }
    if (viewModel.overall.curve !== null) {
        const curveSection = documentHost.createElement("div");
        curveSection.setAttribute(CURVE_SECTION_ATTRIBUTE, "overall");
        curveSection.append(createEmbeddedBookingCurveReference(
            documentHost,
            viewModel.overall.curve,
            { status: "scope-required" },
            { narrow, titleId: "ra-next-sales-setting-overall-curve-title" }
        ));
        section.append(curveSection);
    }
    return section;
}

function createRankOverview(
    documentHost: Document,
    cards: readonly SalesSettingClassicCardViewModel[]
): HTMLElement | null {
    const rankedCards = cards
        .filter((card) => card.rankSummary !== null)
        .slice()
        .sort((left, right) => {
            const leftDays = left.rankSummary?.daysAgo ?? Number.POSITIVE_INFINITY;
            const rightDays = right.rankSummary?.daysAgo ?? Number.POSITIVE_INFINITY;
            return leftDays - rightDays || left.scope.label.localeCompare(right.scope.label, "ja");
        });
    if (rankedCards.length === 0) {
        return null;
    }
    const section = documentHost.createElement("section");
    section.setAttribute(RANK_OVERVIEW_ATTRIBUTE, "");
    const title = documentHost.createElement("div");
    title.setAttribute("data-ra-next-sales-setting-rank-overview-title", "");
    title.textContent = "ランク変更履歴";
    const table = documentHost.createElement("table");
    table.setAttribute("data-ra-next-sales-setting-rank-overview-table", "");
    table.append(createTableHead(documentHost, ["部屋タイプ", "最終変更", "ランク", "増減"]));
    const body = documentHost.createElement("tbody");
    for (const card of rankedCards) {
        const summary = card.rankSummary;
        if (summary === null) {
            continue;
        }
        const row = documentHost.createElement("tr");
        row.append(
            createCell(documentHost, "td", card.scope.label),
            createCell(documentHost, "td", formatDaysAgo(summary.daysAgo)),
            createCell(documentHost, "td", formatRankTransition(summary.beforeRankName, summary.afterRankName)),
            createToneCell(documentHost, formatSigned(summary.roomDelta), toneFromDelta(summary.roomDelta))
        );
        body.append(row);
    }
    table.append(body);
    section.append(title, table);
    return section;
}

function renderNativeCard(
    nativeCard: SalesSettingClassicNativeCard,
    card: SalesSettingClassicCardViewModel | null,
    isOpen: boolean,
    narrow: boolean
): void {
    const supplement = ensureNativeSupplement(nativeCard);
    supplement.setAttribute(SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE, nativeCard.scopeKey);
    if (card?.curve === null || card === null) {
        supplement.replaceChildren(createPreparingMessage(supplement.ownerDocument));
        return;
    }
    const children: HTMLElement[] = [createSummaryTable(supplement.ownerDocument, card.curve.currentSummary)];
    if (hasMissingSummaryValue(card.curve.currentSummary)) {
        children.push(createPreparingMessage(supplement.ownerDocument));
    }
    const toggleRow = supplement.ownerDocument.createElement("div");
    toggleRow.setAttribute("data-ra-next-sales-setting-curve-toggle-row", "");
    const toggle = supplement.ownerDocument.createElement("button");
    toggle.type = "button";
    toggle.setAttribute(SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE, nativeCard.scopeKey);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("data-active", String(isOpen));
    toggle.textContent = isOpen ? "ブッキングカーブを閉じる" : "ブッキングカーブを開く";
    toggleRow.append(toggle);
    children.push(toggleRow);
    if (isOpen) {
        const curveSection = supplement.ownerDocument.createElement("div");
        curveSection.setAttribute(CURVE_SECTION_ATTRIBUTE, "card");
        curveSection.append(createEmbeddedBookingCurveReference(
            supplement.ownerDocument,
            card.curve,
            card.rankHistory,
            { narrow, titleId: `ra-next-sales-setting-curve-${safeId(nativeCard.scopeKey)}` }
        ));
        children.push(curveSection);
    }
    supplement.replaceChildren(...children);
    renderRankDetail(nativeCard, card);
}

function ensureNativeSupplement(nativeCard: SalesSettingClassicNativeCard): HTMLElement {
    const existing = Array.from(nativeCard.cardElement.children).find((element) => (
        element instanceof HTMLElement && element.hasAttribute(SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE)
    ));
    const supplement = existing instanceof HTMLElement
        ? existing
        : nativeCard.cardElement.ownerDocument.createElement("div");
    supplement.setAttribute(SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE, "");
    if (supplement.parentElement !== nativeCard.cardElement) {
        nativeCard.cardElement.insertBefore(supplement, nativeCard.detailWrapperElement);
    } else if (
        nativeCard.detailWrapperElement !== null
        && supplement.nextElementSibling !== nativeCard.detailWrapperElement
    ) {
        nativeCard.cardElement.insertBefore(supplement, nativeCard.detailWrapperElement);
    }
    return supplement;
}

function renderRankDetail(
    nativeCard: SalesSettingClassicNativeCard,
    card: SalesSettingClassicCardViewModel
): void {
    const container = nativeCard.latestReflectionElement?.parentElement ?? null;
    if (container === null || card.rankSummary === null) {
        return;
    }
    const detail = container.ownerDocument.createElement("div");
    detail.setAttribute(SALES_SETTING_CLASSIC_RANK_DETAIL_ATTRIBUTE, "");
    detail.textContent = `ランク：${formatRankTransition(
        card.rankSummary.beforeRankName,
        card.rankSummary.afterRankName
    )}`;
    container.append(detail);
}

function createSummaryTable(
    documentHost: Document,
    summary: BookingCurveReferenceCurrentSummary
): HTMLTableElement {
    const table = documentHost.createElement("table");
    table.setAttribute(SUMMARY_TABLE_ATTRIBUTE, "");
    table.append(createTableHead(documentHost, ["区分", "室数", "1日前", "7日前", "30日前"]));
    const body = documentHost.createElement("tbody");
    body.append(
        createSummaryRow(documentHost, "全体", summary.all, true),
        createSummaryRow(documentHost, "個人", summary.transient),
        createSummaryRow(documentHost, "団体", summary.group)
    );
    table.append(body);
    return table;
}

function createSummaryRow(
    documentHost: Document,
    label: string,
    metric: BookingCurveReferenceMetricSummary,
    emphasize = false
): HTMLTableRowElement {
    const row = documentHost.createElement("tr");
    row.setAttribute(SUMMARY_ROW_ATTRIBUTE, "");
    if (emphasize) {
        row.setAttribute("data-emphasis", "true");
    }
    const labelCell = createCell(documentHost, "th", label);
    labelCell.scope = "row";
    row.append(
        labelCell,
        createCell(documentHost, "td", formatNumber(metric.currentValue)),
        createDeltaCell(documentHost, metric.currentValue, metric.previousDayValue),
        createDeltaCell(documentHost, metric.currentValue, metric.previousWeekValue),
        createDeltaCell(documentHost, metric.currentValue, metric.previousMonthValue)
    );
    return row;
}

function createDeltaCell(
    documentHost: Document,
    current: number | null,
    previous: number | null
): HTMLTableCellElement {
    const delta = current === null || previous === null ? null : current - previous;
    return createToneCell(documentHost, formatSigned(delta), toneFromDelta(delta));
}

function createToneCell(documentHost: Document, text: string, tone: string): HTMLTableCellElement {
    const cell = createCell(documentHost, "td", text);
    cell.setAttribute(SUMMARY_TONE_ATTRIBUTE, tone);
    return cell;
}

function createCell<T extends "td" | "th">(
    documentHost: Document,
    kind: T,
    text: string
): T extends "td" ? HTMLTableCellElement : HTMLTableCellElement {
    const cell = documentHost.createElement(kind);
    cell.textContent = text;
    return cell as T extends "td" ? HTMLTableCellElement : HTMLTableCellElement;
}

function createTableHead(documentHost: Document, labels: readonly string[]): HTMLTableSectionElement {
    const head = documentHost.createElement("thead");
    const row = documentHost.createElement("tr");
    for (const label of labels) {
        const cell = documentHost.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        row.append(cell);
    }
    head.append(row);
    return head;
}

function createPreparingMessage(documentHost: Document): HTMLElement {
    const message = documentHost.createElement("p");
    message.setAttribute(PREPARING_ATTRIBUTE, "");
    message.textContent = "比較準備中";
    return message;
}

function hasMissingSummaryValue(summary: BookingCurveReferenceCurrentSummary): boolean {
    return [summary.all, summary.transient, summary.group].some((metric) => (
        metric.currentValue === null
        || metric.previousDayValue === null
        || metric.previousWeekValue === null
        || metric.previousMonthValue === null
    ));
}

function formatCapacity(current: number | null, capacity: number | null): string {
    return `${formatNumber(current)} / ${formatNumber(capacity)}`;
}

function formatNumber(value: number | null): string {
    return value === null ? "-" : value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

function formatSigned(value: number | null): string {
    if (value === null) {
        return "-";
    }
    return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function toneFromDelta(value: number | null): string {
    return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function formatDaysAgo(value: number | null): string {
    return value === null ? "-" : `${value}日前`;
}

function formatRankTransition(before: string | null, after: string | null): string {
    if (before !== null && after !== null) {
        return `${before}→${after}`;
    }
    return after ?? before ?? "-";
}

function safeId(value: string): string {
    return value.replaceAll(/[^a-zA-Z0-9_-]/gu, "-");
}

function getSalesSettingClassicStyles(): string {
    return `
[${SALES_SETTING_CLASSIC_ROOT_ATTRIBUTE}] {
    display: contents;
    color: #243447;
    font-family: inherit;
}
[${SALES_SETTING_CLASSIC_ROOT_ATTRIBUTE}] *,
[${SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE}] * { box-sizing: border-box; }
[${OVERALL_ATTRIBUTE}] {
    display: flex; flex-direction: column; gap: 8px;
    margin: 8px 0 10px; padding: 0; border: 0; background: transparent;
    user-select: text; -webkit-user-select: text;
}
[${RANK_OVERVIEW_ATTRIBUTE}] {
    display: flex; flex-direction: column; gap: 4px;
    margin: 0 0 12px; padding: 0; border: 0; background: transparent;
}
[data-ra-next-sales-setting-rank-overview-title] {
    color: #243447; font-size: 15px; font-weight: 700; line-height: 1.35;
}
[data-ra-next-sales-setting-overall-sales-row] {
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px;
}
[data-ra-next-sales-setting-overall-title] {
    padding-left: 8px; border-left: 3px solid #1f5fbf;
    color: #243447; font-size: 18px; font-weight: 700; line-height: 1.35;
}
[data-ra-next-sales-setting-overall-metric] {
    color: #243447; font-size: 16px; font-weight: 700; line-height: 1.4; white-space: nowrap;
}
[${SUMMARY_TABLE_ATTRIBUTE}],
[data-ra-next-sales-setting-rank-overview-table] {
    width: fit-content; max-width: 100%; border-collapse: collapse;
}
[${SUMMARY_TABLE_ATTRIBUTE}] th,
[${SUMMARY_TABLE_ATTRIBUTE}] td,
[data-ra-next-sales-setting-rank-overview-table] th,
[data-ra-next-sales-setting-rank-overview-table] td {
    padding: 1px 16px 1px 0; text-align: left; vertical-align: top; white-space: nowrap;
}
[${SUMMARY_TABLE_ATTRIBUTE}] tr > :not(:first-child),
[data-ra-next-sales-setting-rank-overview-table] tr > :last-child { text-align: right; }
[${SUMMARY_TABLE_ATTRIBUTE}] th:last-child,
[${SUMMARY_TABLE_ATTRIBUTE}] td:last-child,
[data-ra-next-sales-setting-rank-overview-table] th:last-child,
[data-ra-next-sales-setting-rank-overview-table] td:last-child { padding-right: 0; }
[${SUMMARY_TABLE_ATTRIBUTE}] thead th,
[data-ra-next-sales-setting-rank-overview-table] th {
    color: #50627a; font-size: 14px; font-weight: 600; line-height: 1.35;
}
[${SUMMARY_ROW_ATTRIBUTE}] {
    color: #50627a; font-size: 13px; font-weight: 700; line-height: 1.4;
}
[${SUMMARY_ROW_ATTRIBUTE}] > th,
[${SUMMARY_ROW_ATTRIBUTE}][data-emphasis="true"] { color: #243447; }
[data-ra-next-sales-setting-rank-overview-table] td {
    color: #243447; font-size: 14px; font-weight: 600; line-height: 1.4;
}
[${SUMMARY_TONE_ATTRIBUTE}="positive"] { color: #24734b !important; }
[${SUMMARY_TONE_ATTRIBUTE}="negative"] { color: #b34040 !important; }
[${PREPARING_ATTRIBUTE}] {
    width: fit-content; margin: 2px 0 8px; padding: 5px 8px;
    border-radius: 5px; background: #f2f5f7; color: #65788a;
    font-size: 12px; font-weight: 700; line-height: 1.4;
}
[${SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE}] {
    display: flex; flex-direction: column; gap: 6px; min-width: 0;
    margin: 4px 0 0; color: #243447; font-family: inherit;
}
[data-ra-next-sales-setting-curve-toggle-row] {
    display: flex; justify-content: flex-end; margin: 2px 0 8px;
}
[${SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE}] {
    padding: 7px 11px; border: 1px solid #c9d7ef; border-radius: 999px;
    background: #fff; color: #456792; cursor: pointer;
    font: inherit; font-size: 12px; font-weight: 700; line-height: 1;
}
[${SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE}][data-active="true"] {
    border-color: #8fb2ea; background: #eef4ff; color: #1f5fbf;
}
[${SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE}]:focus-visible { outline: 3px solid #d98200; outline-offset: 2px; }
[${SALES_SETTING_CLASSIC_RANK_DETAIL_ATTRIBUTE}] {
    margin-top: 2px; color: #50627a; font-size: 13px; font-weight: 700; line-height: 1.4; white-space: nowrap;
}
[${CURVE_SECTION_ATTRIBUTE}] { min-width: 0; }
[${BOOKING_CURVE_REFERENCE_COMPONENT_ATTRIBUTE}] { max-width: 100%; }
@media (max-width: 680px) {
    [${SUMMARY_TABLE_ATTRIBUTE}], [data-ra-next-sales-setting-rank-overview-table] {
        display: block; max-width: 100%; overflow-x: auto;
    }
    [${SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE}] { min-height: 44px; }
}
`;
}

export const SALES_SETTING_CLASSIC_CURVE_CONTROL_ATTRIBUTES = {
    segment: BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE,
    visibility: BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE
} as const;
