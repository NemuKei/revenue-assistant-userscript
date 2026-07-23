import {
    COMPETITOR_HISTORY_GUEST_COUNTS,
    type CompetitorHistoryFacility,
    type CompetitorHistoryFilters,
    type CompetitorHistoryGuestCount,
    type CompetitorHistoryPanel,
    type CompetitorHistoryPoint,
    type CompetitorHistoryViewModel
} from "./competitorHistoryModel";

export const COMPETITOR_HISTORY_ROOT_ATTRIBUTE = "data-ra-next-competitor-history-root";
export const COMPETITOR_HISTORY_STYLE_ATTRIBUTE = "data-ra-next-competitor-history-style";
export const COMPETITOR_HISTORY_FILTER_KIND_ATTRIBUTE = "data-ra-next-competitor-history-filter";
export const COMPETITOR_HISTORY_FILTER_VALUE_ATTRIBUTE = "data-ra-next-competitor-history-filter-value";
export const COMPETITOR_HISTORY_GUEST_ATTRIBUTE = "data-ra-next-competitor-history-guest";
export const COMPETITOR_HISTORY_PANEL_ATTRIBUTE = "data-ra-next-competitor-history-panel";
export const COMPETITOR_HISTORY_SVG_ATTRIBUTE = "data-ra-next-competitor-history-svg";
export const COMPETITOR_HISTORY_HITBOX_ATTRIBUTE = "data-ra-next-competitor-history-hitbox";

export type CompetitorHistoryRenderState =
    | { status: "loading"; stayDate: string }
    | { status: "empty"; stayDate: string; reason: string }
    | { status: "error"; stayDate: string; reason: string }
    | {
        status: "ready";
        selectedGuestCount: CompetitorHistoryGuestCount;
        viewModel: CompetitorHistoryViewModel;
    };

export function createCompetitorHistoryRoot(documentHost: Document): HTMLElement {
    const root = documentHost.createElement("section");
    root.setAttribute(COMPETITOR_HISTORY_ROOT_ATTRIBUTE, "");
    root.setAttribute("aria-labelledby", "ra-next-competitor-history-title");
    return root;
}

export function ensureCompetitorHistoryStyles(documentHost: Document): void {
    if (documentHost.querySelector(`[${COMPETITOR_HISTORY_STYLE_ATTRIBUTE}]`) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.setAttribute(COMPETITOR_HISTORY_STYLE_ATTRIBUTE, "");
    style.textContent = getCompetitorHistoryStyles();
    documentHost.head.append(style);
}

export function removeCompetitorHistoryArtifacts(documentHost: Document): void {
    for (const element of documentHost.querySelectorAll(
        `[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}], [${COMPETITOR_HISTORY_STYLE_ATTRIBUTE}]`
    )) {
        element.remove();
    }
}

export function renderCompetitorHistory(
    root: HTMLElement,
    state: CompetitorHistoryRenderState,
    options: { narrow: boolean }
): void {
    root.setAttribute("data-ra-next-competitor-history-state", state.status);
    const header = createHeader(root.ownerDocument);
    if (state.status === "loading") {
        root.replaceChildren(
            header,
            createMessage(root.ownerDocument, "保存済みの競合価格履歴を読み込んでいます。", "loading")
        );
        return;
    }
    if (state.status === "empty") {
        root.replaceChildren(
            header,
            createMessage(
                root.ownerDocument,
                state.reason === "database-missing" || state.reason === "no-records"
                    ? "この宿泊日の保存済み履歴はまだありません。標準表で現在値を確認できます。"
                    : "保存済み履歴を確認できませんでした。標準表はそのまま利用できます。",
                "empty"
            )
        );
        return;
    }
    if (state.status === "error") {
        root.replaceChildren(
            header,
            createMessage(
                root.ownerDocument,
                "保存済み履歴の読み込みに失敗しました。標準表の表示や操作には影響しません。",
                "error"
            )
        );
        return;
    }

    const { viewModel } = state;
    const meta = root.ownerDocument.createElement("p");
    meta.setAttribute("data-ra-next-competitor-history-meta", "");
    meta.textContent = [
        `対象宿泊日 ${formatStayDate(viewModel.stayDate)}`,
        `観測 ${viewModel.observationDates.length}日`,
        `最終取得 ${formatDateTime(viewModel.latestFetchedAt)}`,
        `同一検索条件 ${viewModel.selectedConditionRecordCount}件`,
        viewModel.excludedConditionRecordCount > 0
            ? `条件違い ${viewModel.excludedConditionRecordCount}件は別系列として除外`
            : null,
        "最新性は未判定"
    ].filter((value): value is string => value !== null).join(" / ");

    const filters = createFilters(root.ownerDocument, viewModel);
    const guestSelector = createGuestSelector(root.ownerDocument, state.selectedGuestCount);
    const legend = createLegend(root.ownerDocument, viewModel.facilities);
    const note = root.ownerDocument.createElement("p");
    note.setAttribute("data-ra-next-competitor-history-note", "");
    note.textContent =
        "各人数で同じ保存済み観測日・共通の価格目盛を使います。最新値と前回差分はグラフ下に常時表示しています。";

    const grid = root.ownerDocument.createElement("div");
    grid.setAttribute("data-ra-next-competitor-history-grid", "");
    const sharedDomain = resolveSharedPriceDomain(viewModel.panels);
    for (const panel of viewModel.panels) {
        grid.append(createPanel(
            root.ownerDocument,
            panel,
            viewModel.facilities,
            viewModel.observationDates,
            state.selectedGuestCount,
            sharedDomain,
            options.narrow
        ));
    }

    if (!viewModel.hasAnyPoints) {
        const filteredEmpty = createMessage(
            root.ownerDocument,
            "この絞り込み条件に一致する価格履歴はありません。条件を「すべて」に戻してください。",
            "empty"
        );
        root.replaceChildren(header, meta, filters, guestSelector, legend, note, filteredEmpty, grid);
        return;
    }
    root.replaceChildren(header, meta, filters, guestSelector, legend, note, grid);
}

export function getCompetitorHistoryStyles(): string {
    return `
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] {
    box-sizing: border-box;
    width: 100%;
    max-width: calc(100vw - 48px);
    min-width: 0;
    margin: 24px 0 8px;
    padding: 20px;
    border: 1px solid #cbd7e2;
    border-radius: 10px;
    background: #ffffff;
    color: #263a4d;
    font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
    box-shadow: 0 2px 8px rgba(30, 54, 76, 0.08);
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] *,
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] *::before,
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] *::after { box-sizing: border-box; }
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-header] {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] h2 {
    margin: 0;
    color: #1f3548;
    font-size: 20px;
    line-height: 1.4;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-kicker] {
    margin: 2px 0 0;
    color: #577084;
    font-size: 12px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-badge] {
    flex: 0 0 auto;
    padding: 4px 9px;
    border-radius: 999px;
    background: #e8f3fb;
    color: #0d5f98;
    font-size: 12px;
    font-weight: 700;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-meta] {
    margin: 12px 0 0;
    color: #5c7081;
    font-size: 12px;
    line-height: 1.7;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-filters] {
    display: grid;
    gap: 10px;
    margin: 16px 0 0;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-filter-group] {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-filter-group] legend {
    float: left;
    min-width: 72px;
    padding: 8px 8px 8px 0;
    color: #465d70;
    font-size: 12px;
    font-weight: 700;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] button {
    min-height: 36px;
    padding: 7px 11px;
    border: 1px solid #aebfce;
    border-radius: 999px;
    background: #ffffff;
    color: #385064;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] button[aria-pressed="true"] {
    border-color: #1268a6;
    background: #1268a6;
    color: #ffffff;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] button:focus-visible,
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [${COMPETITOR_HISTORY_HITBOX_ATTRIBUTE}]:focus-visible {
    outline: 3px solid #d98200;
    outline-offset: 2px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-guest-selector] {
    display: none;
    gap: 6px;
    margin: 14px 0 0;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-legend] {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin: 14px 0 0;
    color: #40586b;
    font-size: 12px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-legend-item],
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-latest-label] {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-swatch] {
    display: inline-block;
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 50%;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-note] {
    margin: 10px 0 0;
    color: #5c7081;
    font-size: 12px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-grid] {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [${COMPETITOR_HISTORY_PANEL_ATTRIBUTE}] {
    position: relative;
    min-width: 0;
    padding: 14px;
    border: 1px solid #d6e0e8;
    border-radius: 8px;
    background: #fbfcfd;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-panel-header] {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-panel-title] {
    color: #263f52;
    font-size: 15px;
    font-weight: 800;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-panel-date] {
    color: #687d8e;
    font-size: 11px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-chart-wrap] {
    position: relative;
    min-width: 0;
    margin-top: 8px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [${COMPETITOR_HISTORY_SVG_ATTRIBUTE}] {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [${COMPETITOR_HISTORY_SVG_ATTRIBUTE}] text {
    fill: #607486;
    font-family: inherit;
    font-size: 11px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-grid-line] {
    stroke: #dfe7ed;
    stroke-width: 1;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-axis-line] {
    stroke: #9fb0bd;
    stroke-width: 1;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-tooltip] {
    position: absolute;
    z-index: 2;
    top: 8px;
    left: 8px;
    width: min(330px, calc(100% - 16px));
    max-height: 185px;
    overflow: auto;
    padding: 10px;
    border: 1px solid #91a8ba;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 5px 16px rgba(25, 49, 67, 0.16);
    color: #2d4659;
    font-size: 11px;
    line-height: 1.5;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-tooltip][hidden] { display: none; }
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-tooltip] ul {
    display: grid;
    gap: 4px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-latest] {
    display: grid;
    gap: 6px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-latest] li {
    display: grid;
    grid-template-columns: minmax(90px, 1fr) auto auto;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 6px;
    background: #f0f4f7;
    font-size: 12px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-delta="up"] { color: #9b3d1c; }
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-delta="down"] { color: #176b63; }
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] details { margin-top: 9px; }
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] summary {
    color: #315b79;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] table {
    width: 100%;
    margin-top: 8px;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 11px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] th,
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] td {
    padding: 5px 4px;
    border-bottom: 1px solid #dce5eb;
    overflow-wrap: anywhere;
    text-align: left;
    vertical-align: top;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-message] {
    margin: 16px 0 0;
    padding: 13px 14px;
    border-radius: 7px;
    background: #f2f5f7;
    color: #52697b;
    font-size: 13px;
}
[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-message="error"] {
    background: #fff2ef;
    color: #8c3c25;
}
@media (max-width: 680px) {
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] {
        width: 100%;
        max-width: calc(100vw - 16px);
        margin-top: 16px;
        padding: 14px;
    }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-header] { display: block; }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-badge] {
        display: inline-block;
        margin-top: 8px;
    }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-filter-group] legend {
        float: none;
        flex: 0 0 100%;
        min-width: 0;
        padding-bottom: 2px;
    }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] button { min-height: 44px; }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-guest-selector] { display: flex; }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-guest-selector] button { flex: 1 1 0; }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-grid] { grid-template-columns: 1fr; }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [${COMPETITOR_HISTORY_PANEL_ATTRIBUTE}][data-mobile-active="false"] { display: none; }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-latest] li {
        grid-template-columns: minmax(0, 1fr) auto;
    }
    [${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}] [data-ra-next-competitor-history-latest-room] {
        grid-column: 1 / -1;
        color: #687d8e;
    }
}
`;
}

function createHeader(documentHost: Document): HTMLElement {
    const header = documentHost.createElement("div");
    header.setAttribute("data-ra-next-competitor-history-header", "");
    const titleWrap = documentHost.createElement("div");
    const title = documentHost.createElement("h2");
    title.id = "ra-next-competitor-history-title";
    title.textContent = "競合価格の保存履歴";
    const kicker = documentHost.createElement("p");
    kicker.setAttribute("data-ra-next-competitor-history-kicker", "");
    kicker.textContent = "現在値は上の標準表、ここでは取得日ごとの変化を確認します。";
    titleWrap.append(title, kicker);
    const badge = documentHost.createElement("span");
    badge.setAttribute("data-ra-next-competitor-history-badge", "");
    badge.textContent = "保存済み・read-only";
    header.append(titleWrap, badge);
    return header;
}

function createMessage(documentHost: Document, text: string, tone: string): HTMLElement {
    const message = documentHost.createElement("p");
    message.setAttribute("data-ra-next-competitor-history-message", tone);
    message.setAttribute("role", tone === "error" ? "alert" : "status");
    message.textContent = text;
    return message;
}

function createFilters(documentHost: Document, viewModel: CompetitorHistoryViewModel): HTMLElement {
    const container = documentHost.createElement("div");
    container.setAttribute("data-ra-next-competitor-history-filters", "");
    container.append(
        createFilterGroup(documentHost, "部屋タイプ", "roomType", viewModel.availableFilters.roomTypes, viewModel.filters),
        createFilterGroup(documentHost, "食事", "mealType", viewModel.availableFilters.mealTypes, viewModel.filters)
    );
    return container;
}

function createFilterGroup(
    documentHost: Document,
    label: string,
    kind: keyof CompetitorHistoryFilters,
    options: readonly { label: string; value: string }[],
    filters: CompetitorHistoryFilters
): HTMLElement {
    const group = documentHost.createElement("fieldset");
    group.setAttribute("data-ra-next-competitor-history-filter-group", kind);
    const legend = documentHost.createElement("legend");
    legend.textContent = label;
    group.append(legend);
    for (const option of [{ label: "すべて", value: "" }, ...options]) {
        const button = documentHost.createElement("button");
        button.type = "button";
        button.setAttribute(COMPETITOR_HISTORY_FILTER_KIND_ATTRIBUTE, kind);
        button.setAttribute(COMPETITOR_HISTORY_FILTER_VALUE_ATTRIBUTE, option.value);
        button.setAttribute("aria-pressed", String((filters[kind] ?? "") === option.value));
        button.textContent = option.label;
        group.append(button);
    }
    return group;
}

function createGuestSelector(
    documentHost: Document,
    selectedGuestCount: CompetitorHistoryGuestCount
): HTMLElement {
    const selector = documentHost.createElement("div");
    selector.setAttribute("data-ra-next-competitor-history-guest-selector", "");
    selector.setAttribute("role", "group");
    selector.setAttribute("aria-label", "表示する人数");
    for (const guestCount of COMPETITOR_HISTORY_GUEST_COUNTS) {
        const button = documentHost.createElement("button");
        button.type = "button";
        button.setAttribute(COMPETITOR_HISTORY_GUEST_ATTRIBUTE, String(guestCount));
        button.setAttribute("aria-pressed", String(guestCount === selectedGuestCount));
        button.textContent = `${guestCount}名`;
        selector.append(button);
    }
    return selector;
}

function createLegend(
    documentHost: Document,
    facilities: readonly CompetitorHistoryFacility[]
): HTMLElement {
    const legend = documentHost.createElement("div");
    legend.setAttribute("data-ra-next-competitor-history-legend", "");
    legend.setAttribute("aria-label", "施設の凡例");
    for (const facility of facilities) {
        const item = documentHost.createElement("span");
        item.setAttribute("data-ra-next-competitor-history-legend-item", "");
        item.append(createSwatch(documentHost, facility.color), documentHost.createTextNode(facility.label));
        legend.append(item);
    }
    return legend;
}

function createPanel(
    documentHost: Document,
    panel: CompetitorHistoryPanel,
    facilities: readonly CompetitorHistoryFacility[],
    observationDates: readonly string[],
    selectedGuestCount: CompetitorHistoryGuestCount,
    sharedDomain: { min: number; max: number },
    narrow: boolean
): HTMLElement {
    const element = documentHost.createElement("section");
    element.setAttribute(COMPETITOR_HISTORY_PANEL_ATTRIBUTE, String(panel.guestCount));
    element.setAttribute("data-mobile-active", String(panel.guestCount === selectedGuestCount));
    const header = documentHost.createElement("div");
    header.setAttribute("data-ra-next-competitor-history-panel-header", "");
    const title = documentHost.createElement("div");
    title.setAttribute("data-ra-next-competitor-history-panel-title", "");
    title.textContent = `${panel.guestCount}名 最安値`;
    const date = documentHost.createElement("div");
    date.setAttribute("data-ra-next-competitor-history-panel-date", "");
    date.textContent = panel.latestDate === null ? "観測なし" : `最新 ${formatShortDate(panel.latestDate)}`;
    header.append(title, date);
    element.append(header);
    if (panel.points.length === 0) {
        element.append(createMessage(documentHost, "対象データなし", "empty"));
        return element;
    }
    element.append(
        createChart(documentHost, panel, facilities, observationDates, sharedDomain, narrow),
        createLatestValues(documentHost, panel, facilities),
        createAccessibleTable(documentHost, panel, facilities)
    );
    return element;
}

function createChart(
    documentHost: Document,
    panel: CompetitorHistoryPanel,
    facilities: readonly CompetitorHistoryFacility[],
    observationDates: readonly string[],
    domain: { min: number; max: number },
    narrow: boolean
): HTMLElement {
    const width = narrow ? 360 : 680;
    const height = narrow ? 246 : 228;
    const padding = { top: 18, right: narrow ? 16 : 22, bottom: 34, left: narrow ? 52 : 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const wrapper = documentHost.createElement("div");
    wrapper.setAttribute("data-ra-next-competitor-history-chart-wrap", "");
    const tooltip = documentHost.createElement("div");
    tooltip.setAttribute("data-ra-next-competitor-history-tooltip", "");
    tooltip.setAttribute("role", "status");
    tooltip.hidden = true;
    const svg = documentHost.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(COMPETITOR_HISTORY_SVG_ATTRIBUTE, String(panel.guestCount));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    const title = documentHost.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${panel.guestCount}名の競合価格保存履歴`;
    const description = documentHost.createElementNS("http://www.w3.org/2000/svg", "desc");
    description.textContent = `${observationDates.length}日分の施設別最安値。最新値はグラフ下、全値は表で確認できます。`;
    svg.append(title, description);

    const ticks = buildPriceTicks(domain.min, domain.max, 4);
    for (const tick of ticks) {
        const y = scaleY(tick, domain, padding.top, plotHeight);
        const line = documentHost.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(padding.left));
        line.setAttribute("x2", String(width - padding.right));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("data-ra-next-competitor-history-grid-line", "");
        const label = documentHost.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(padding.left - 7));
        label.setAttribute("y", String(y + 4));
        label.setAttribute("text-anchor", "end");
        label.textContent = formatAxisPrice(tick);
        svg.append(line, label);
    }

    const dateIndex = new Map(observationDates.map((date, index) => [date, index]));
    const visibleTickIndexes = selectTickIndexes(observationDates.length, narrow ? 3 : 5);
    for (const index of visibleTickIndexes) {
        const date = observationDates[index];
        if (date === undefined) {
            continue;
        }
        const label = documentHost.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", scaleX(index, observationDates.length, padding.left, plotWidth).toFixed(2));
        label.setAttribute("y", String(height - 9));
        label.setAttribute("text-anchor", "middle");
        label.textContent = formatShortDate(date);
        svg.append(label);
    }

    for (const facility of facilities) {
        const facilityPoints = panel.points
            .filter((point) => point.facilityId === facility.id)
            .sort((left, right) => left.date.localeCompare(right.date));
        if (facilityPoints.length === 0) {
            continue;
        }
        const path = documentHost.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", facilityPoints.map((point, index) => {
            const x = scaleX(dateIndex.get(point.date) ?? 0, observationDates.length, padding.left, plotWidth);
            const y = scaleY(point.price, domain, padding.top, plotHeight);
            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(" "));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", facility.color);
        path.setAttribute("stroke-width", facility.isOwn ? "3" : "2");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        svg.append(path);
        for (const point of facilityPoints) {
            const circle = documentHost.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", scaleX(dateIndex.get(point.date) ?? 0, observationDates.length, padding.left, plotWidth).toFixed(2));
            circle.setAttribute("cy", scaleY(point.price, domain, padding.top, plotHeight).toFixed(2));
            circle.setAttribute("r", facility.isOwn ? "3.5" : "3");
            circle.setAttribute("fill", facility.color);
            svg.append(circle);
        }
    }

    for (const [index, date] of observationDates.entries()) {
        if (!panel.points.some((point) => point.date === date)) {
            continue;
        }
        const hitbox = documentHost.createElementNS("http://www.w3.org/2000/svg", "rect");
        const step = plotWidth / Math.max(1, observationDates.length - 1);
        const center = scaleX(index, observationDates.length, padding.left, plotWidth);
        const hitWidth = observationDates.length <= 1 ? plotWidth : Math.max(28, step);
        hitbox.setAttribute("x", String(Math.max(padding.left, center - hitWidth / 2)));
        hitbox.setAttribute("y", String(padding.top));
        hitbox.setAttribute("width", String(Math.min(hitWidth, width - padding.right - Math.max(padding.left, center - hitWidth / 2))));
        hitbox.setAttribute("height", String(plotHeight));
        hitbox.setAttribute("fill", "transparent");
        hitbox.setAttribute("tabindex", "0");
        hitbox.setAttribute(COMPETITOR_HISTORY_HITBOX_ATTRIBUTE, date);
        hitbox.setAttribute("aria-label", buildDateAriaLabel(date, panel.points, facilities));
        const show = (): void => showDateTooltip(tooltip, date, panel.points, facilities);
        const hide = (): void => { tooltip.hidden = true; };
        hitbox.addEventListener("mouseenter", show);
        hitbox.addEventListener("focus", show);
        hitbox.addEventListener("mouseleave", hide);
        hitbox.addEventListener("blur", hide);
        svg.append(hitbox);
    }
    wrapper.append(svg, tooltip);
    return wrapper;
}

function createLatestValues(
    documentHost: Document,
    panel: CompetitorHistoryPanel,
    facilities: readonly CompetitorHistoryFacility[]
): HTMLElement {
    const list = documentHost.createElement("ul");
    list.setAttribute("data-ra-next-competitor-history-latest", "");
    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    for (const value of panel.latestValues) {
        const facility = facilityById.get(value.facilityId);
        if (facility === undefined) {
            continue;
        }
        const item = documentHost.createElement("li");
        const label = documentHost.createElement("span");
        label.setAttribute("data-ra-next-competitor-history-latest-label", "");
        label.append(createSwatch(documentHost, facility.color), documentHost.createTextNode(facility.label));
        const price = documentHost.createElement("strong");
        price.textContent = formatPrice(value.price);
        const room = documentHost.createElement("span");
        room.setAttribute("data-ra-next-competitor-history-latest-room", "");
        room.textContent = value.roomTypeLabel;
        const delta = documentHost.createElement("span");
        delta.setAttribute("data-ra-next-competitor-history-delta", getDeltaTone(value.deltaFromPrevious));
        delta.textContent = value.deltaFromPrevious === null
            ? "前回なし"
            : `前回 ${formatSignedPrice(value.deltaFromPrevious)}`;
        item.append(label, price, delta, room);
        list.append(item);
    }
    return list;
}

function createAccessibleTable(
    documentHost: Document,
    panel: CompetitorHistoryPanel,
    facilities: readonly CompetitorHistoryFacility[]
): HTMLElement {
    const details = documentHost.createElement("details");
    details.setAttribute("data-ra-next-competitor-history-table-details", String(panel.guestCount));
    const summary = documentHost.createElement("summary");
    summary.textContent = "日別の値を表で確認";
    const table = documentHost.createElement("table");
    const caption = documentHost.createElement("caption");
    caption.textContent = `${panel.guestCount}名の取得日・施設別最安値`;
    const head = documentHost.createElement("thead");
    const headRow = documentHost.createElement("tr");
    for (const label of ["取得日", "施設", "部屋", "価格"]) {
        const cell = documentHost.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = documentHost.createElement("tbody");
    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    for (const point of panel.points) {
        const row = documentHost.createElement("tr");
        for (const value of [
            formatShortDate(point.date),
            facilityById.get(point.facilityId)?.label ?? "競合施設",
            point.roomTypeLabel,
            formatPrice(point.price)
        ]) {
            const cell = documentHost.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }
        body.append(row);
    }
    table.append(caption, head, body);
    details.append(summary, table);
    return details;
}

function createSwatch(documentHost: Document, color: string): HTMLElement {
    const swatch = documentHost.createElement("span");
    swatch.setAttribute("data-ra-next-competitor-history-swatch", "");
    swatch.style.backgroundColor = color;
    swatch.setAttribute("aria-hidden", "true");
    return swatch;
}

function showDateTooltip(
    tooltip: HTMLElement,
    date: string,
    points: readonly CompetitorHistoryPoint[],
    facilities: readonly CompetitorHistoryFacility[]
): void {
    const documentHost = tooltip.ownerDocument;
    const title = documentHost.createElement("strong");
    title.textContent = formatStayDate(date);
    const list = documentHost.createElement("ul");
    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    for (const point of points.filter((candidate) => candidate.date === date)) {
        const item = documentHost.createElement("li");
        item.textContent = `${facilityById.get(point.facilityId)?.label ?? "競合施設"} / ${point.roomTypeLabel} / ${formatPrice(point.price)}`;
        list.append(item);
    }
    tooltip.replaceChildren(title, list);
    tooltip.hidden = false;
}

function buildDateAriaLabel(
    date: string,
    points: readonly CompetitorHistoryPoint[],
    facilities: readonly CompetitorHistoryFacility[]
): string {
    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    const values = points
        .filter((point) => point.date === date)
        .map((point) => `${facilityById.get(point.facilityId)?.label ?? "競合施設"} ${formatPrice(point.price)}`);
    return `${formatStayDate(date)}。${values.join("、")}`;
}

function resolveSharedPriceDomain(
    panels: readonly CompetitorHistoryPanel[]
): { min: number; max: number } {
    const prices = panels.flatMap((panel) => panel.points.map((point) => point.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return { min: 0, max: 1 };
    }
    if (min === max) {
        return { min: Math.max(0, min - 1000), max: max + 1000 };
    }
    const padding = Math.max(500, (max - min) * 0.08);
    return { min: Math.max(0, min - padding), max: max + padding };
}

function buildPriceTicks(min: number, max: number, count: number): number[] {
    const step = (max - min) / Math.max(1, count - 1);
    return Array.from({ length: count }, (_, index) => max - step * index);
}

function scaleX(index: number, count: number, left: number, width: number): number {
    return count <= 1 ? left + width / 2 : left + (index * width) / (count - 1);
}

function scaleY(
    price: number,
    domain: { min: number; max: number },
    top: number,
    height: number
): number {
    return top + height - ((price - domain.min) / Math.max(1, domain.max - domain.min)) * height;
}

function selectTickIndexes(length: number, maximum: number): number[] {
    if (length <= maximum) {
        return Array.from({ length }, (_, index) => index);
    }
    return Array.from(new Set(Array.from({ length: maximum }, (_, index) => (
        Math.round((index * (length - 1)) / Math.max(1, maximum - 1))
    ))));
}

function formatPrice(value: number): string {
    return `${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

function formatSignedPrice(value: number): string {
    return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

function formatAxisPrice(value: number): string {
    return value >= 10_000
        ? `${(value / 10_000).toFixed(value % 10_000 === 0 ? 0 : 1)}万`
        : new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(value);
}

function formatStayDate(value: string): string {
    const compact = value.replaceAll("-", "");
    return /^\d{8}$/u.test(compact)
        ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
        : value;
}

function formatShortDate(value: string): string {
    const normalized = formatStayDate(value);
    return normalized.length >= 10 ? `${normalized.slice(5, 7)}/${normalized.slice(8, 10)}` : normalized;
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Tokyo"
    }).format(date);
}

function getDeltaTone(value: number | null): "down" | "neutral" | "up" {
    if (value === null || value === 0) {
        return "neutral";
    }
    return value > 0 ? "up" : "down";
}
