import {
    PRICE_TREND_COMPARISON_GUEST_COUNTS,
    formatPriceTrendComparisonMealType,
    type PriceTrendComparisonFacility,
    type PriceTrendComparisonFilters,
    type PriceTrendComparisonPoint,
    type PriceTrendComparisonViewModel,
    type PriceTrendGuestComparison
} from "./priceTrendComparisonModel";

export const PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE = "data-ra-next-price-trend-comparison-root";
export const PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE = "data-ra-next-price-trend-filter-kind";
export const PRICE_TREND_COMPARISON_FILTER_VALUE_ATTRIBUTE = "data-ra-next-price-trend-filter-value";
export const PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE = "data-ra-next-price-trend-guest";
export const PRICE_TREND_COMPARISON_SVG_ATTRIBUTE = "data-ra-next-price-trend-svg";
export const PRICE_TREND_COMPARISON_HITBOX_ATTRIBUTE = "data-ra-next-price-trend-hitbox";

const PRICE_TREND_COMPARISON_STYLE_ID = "ra-next-price-trend-comparison-styles";

export type PriceTrendComparisonRenderState =
    | { status: "loading"; stayDate: string }
    | { status: "empty"; reason: string; stayDate: string }
    | { status: "error"; reason: string; stayDate: string }
    | { status: "ready"; viewModel: PriceTrendComparisonViewModel };

export type PriceTrendCaptureStatus =
    | "already-stored"
    | "capturing"
    | "checking"
    | "disabled"
    | "error"
    | "no-price-data"
    | "out-of-range"
    | "stored"
    | "unavailable";

export function createPriceTrendComparisonRoot(documentHost: Document): HTMLElement {
    const root = documentHost.createElement("section");
    root.setAttribute(PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE, "");
    root.setAttribute("aria-label", "人数別90日価格推移");
    return root;
}

export function ensurePriceTrendComparisonStyles(documentHost: Document): void {
    if (documentHost.getElementById(PRICE_TREND_COMPARISON_STYLE_ID) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.id = PRICE_TREND_COMPARISON_STYLE_ID;
    style.textContent = getPriceTrendComparisonStyles();
    documentHost.head.append(style);
}

export function removePriceTrendComparisonArtifacts(documentHost: Document): void {
    for (const root of documentHost.querySelectorAll<HTMLElement>(
        `[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}]`
    )) {
        root.remove();
    }
    documentHost.getElementById(PRICE_TREND_COMPARISON_STYLE_ID)?.remove();
}

export function renderPriceTrendComparison(
    root: HTMLElement,
    state: PriceTrendComparisonRenderState,
    options: {
        captureStatus: PriceTrendCaptureStatus;
        narrow: boolean;
    }
): void {
    const documentHost = root.ownerDocument;
    const header = createHeader(documentHost, state, options.captureStatus);
    if (state.status !== "ready") {
        root.replaceChildren(
            header,
            createMessage(
                documentHost,
                formatStateMessage(state, options.captureStatus),
                state.status
            )
        );
        return;
    }

    const viewModel = state.viewModel;
    const selectedComparison = viewModel.comparisons.find(
        (comparison) => comparison.guestCount === viewModel.selectedGuestCount
    ) ?? viewModel.comparisons[0];
    const filters = createFilters(documentHost, viewModel);
    const summaries = createGuestSummaries(documentHost, viewModel);
    if (selectedComparison === undefined || selectedComparison.points.length === 0) {
        root.replaceChildren(
            header,
            filters,
            summaries,
            createMessage(documentHost, "選択した人数の価格推移はありません。", "empty")
        );
        return;
    }

    const detail = documentHost.createElement("section");
    detail.setAttribute("data-ra-next-price-trend-detail", "");
    const detailHeader = documentHost.createElement("div");
    detailHeader.setAttribute("data-ra-next-price-trend-detail-header", "");
    const title = documentHost.createElement("h4");
    title.textContent = `${selectedComparison.guestCount}名の施設別推移`;
    const reading = documentHost.createElement("p");
    reading.textContent = "左が90日前側、右が宿泊日側です。";
    detailHeader.append(title, reading);
    detail.append(
        detailHeader,
        createLegend(documentHost, viewModel.facilities, selectedComparison.points),
        createChart(
            documentHost,
            selectedComparison,
            viewModel.facilities,
            options.narrow
        ),
        createAccessibleTable(documentHost, selectedComparison, viewModel.facilities)
    );
    root.replaceChildren(header, filters, summaries, detail);
}

export function getPriceTrendComparisonStyles(): string {
    return `
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] {
    --ra-next-price-blue: #1268a6;
    --ra-next-price-ink: #24394b;
    --ra-next-price-muted: #617283;
    box-sizing: border-box;
    width: min(100%, 1180px);
    max-width: calc(100vw - 16px);
    margin: 22px auto 4px;
    padding: 18px;
    overflow: hidden;
    border: 1px solid #c7d3dd;
    border-radius: 10px;
    background: #ffffff;
    color: var(--ra-next-price-ink);
    font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
}
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] * { box-sizing: border-box; }
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] h3,
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] h4,
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] p { margin: 0; }
[data-ra-next-price-trend-header] { display: grid; gap: 4px; margin-bottom: 14px; }
[data-ra-next-price-trend-eyebrow] {
    color: #2e6e98;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .04em;
}
[data-ra-next-price-trend-header] h3 { font-size: 20px; line-height: 1.35; }
[data-ra-next-price-trend-meta] { color: var(--ra-next-price-muted); font-size: 12px; line-height: 1.55; }
[data-ra-next-price-trend-capture] {
    justify-self: start;
    padding: 4px 9px;
    border: 1px solid #bfd0dd;
    border-radius: 999px;
    background: #f3f7fa;
    color: #455e72;
    font-size: 12px;
    font-weight: 800;
}
[data-ra-next-price-trend-capture="capturing"],
[data-ra-next-price-trend-capture="checking"] {
    border-color: #9fc7e0;
    background: #edf7fd;
    color: #125f90;
}
[data-ra-next-price-trend-capture="stored"],
[data-ra-next-price-trend-capture="already-stored"] {
    border-color: #a9cdb8;
    background: #edf8f1;
    color: #286842;
}
[data-ra-next-price-trend-capture="error"],
[data-ra-next-price-trend-capture="unavailable"] {
    border-color: #e5b9b1;
    background: #fff1ef;
    color: #8d3428;
}
[data-ra-next-price-trend-message] {
    padding: 18px;
    border-radius: 8px;
    background: #f3f6f8;
    color: #526576;
    line-height: 1.6;
}
[data-ra-next-price-trend-message="error"] { background: #fff1ef; color: #8d3428; }
[data-ra-next-price-trend-filters] {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    margin-bottom: 14px;
}
[data-ra-next-price-trend-filter-group] {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}
[data-ra-next-price-trend-filter-group] legend {
    width: 100%;
    margin-bottom: 2px;
    color: #56697a;
    font-size: 12px;
    font-weight: 800;
}
[${PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE}] {
    min-height: 36px;
    padding: 6px 11px;
    border: 1px solid #b9c8d4;
    border-radius: 999px;
    background: #fff;
    color: #33495c;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
}
[${PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE}][aria-pressed="true"] {
    border-color: var(--ra-next-price-blue);
    background: #eaf4fb;
    color: #0d5b90;
    font-weight: 800;
}
[${PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE}]:focus-visible,
[${PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE}]:focus-visible,
[${PRICE_TREND_COMPARISON_HITBOX_ATTRIBUTE}]:focus-visible {
    outline: 3px solid #d98200;
    outline-offset: 2px;
}
[data-ra-next-price-trend-summaries] {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
    margin-bottom: 16px;
}
[${PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE}] {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 5px 8px;
    min-width: 0;
    min-height: 104px;
    padding: 11px;
    border: 1px solid #c7d3dd;
    border-radius: 8px;
    background: #f9fbfc;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
[${PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE}][aria-pressed="true"] {
    border-color: var(--ra-next-price-blue);
    box-shadow: inset 0 0 0 1px var(--ra-next-price-blue);
    background: #f0f8fd;
}
[data-ra-next-price-trend-summary-guest] { font-size: 17px; font-weight: 900; }
[data-ra-next-price-trend-summary-lt] {
    align-self: center;
    color: var(--ra-next-price-muted);
    font-size: 11px;
    font-weight: 700;
}
[data-ra-next-price-trend-summary-row] {
    display: flex;
    grid-column: 1 / -1;
    justify-content: space-between;
    gap: 8px;
    color: #536575;
    font-size: 12px;
}
[data-ra-next-price-trend-summary-row] strong { color: #20384b; font-size: 13px; }
[data-ra-next-price-trend-gap] {
    grid-column: 1 / -1;
    font-size: 12px;
    font-weight: 800;
}
[data-ra-next-price-trend-gap="above"] { color: #ae3f27; }
[data-ra-next-price-trend-gap="below"] { color: #0c766e; }
[data-ra-next-price-trend-gap="same"],
[data-ra-next-price-trend-gap="missing"] { color: #667787; }
[data-ra-next-price-trend-detail] {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding-top: 14px;
    border-top: 1px solid #d8e0e6;
}
[data-ra-next-price-trend-detail-header] {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 5px 14px;
}
[data-ra-next-price-trend-detail-header] h4 { font-size: 16px; }
[data-ra-next-price-trend-detail-header] p { color: var(--ra-next-price-muted); font-size: 12px; }
[data-ra-next-price-trend-legend] { display: flex; flex-wrap: wrap; gap: 6px 14px; }
[data-ra-next-price-trend-legend-item] {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: #435769;
    font-size: 12px;
}
[data-ra-next-price-trend-swatch] {
    width: 16px;
    height: 3px;
    flex: 0 0 auto;
    border-radius: 2px;
}
[data-ra-next-price-trend-chart-wrap] { position: relative; min-width: 0; overflow: hidden; }
[${PRICE_TREND_COMPARISON_SVG_ATTRIBUTE}] {
    display: block;
    width: 100%;
    height: auto;
    max-height: 320px;
    overflow: visible;
}
[${PRICE_TREND_COMPARISON_SVG_ATTRIBUTE}] text {
    fill: #617283;
    font-family: inherit;
    font-size: 11px;
}
[data-ra-next-price-trend-grid] { stroke: #dbe3e9; stroke-width: 1; }
[data-ra-next-price-trend-tooltip] {
    position: absolute;
    z-index: 2;
    top: 8px;
    right: 8px;
    max-width: min(340px, calc(100% - 16px));
    padding: 9px 11px;
    border: 1px solid #9fb2c1;
    border-radius: 7px;
    background: rgba(255,255,255,.98);
    box-shadow: 0 4px 16px rgba(38,58,77,.13);
    font-size: 12px;
    line-height: 1.5;
    pointer-events: none;
}
[data-ra-next-price-trend-tooltip] ul { margin: 5px 0 0; padding-left: 18px; }
[data-ra-next-price-trend-table-details] { color: #4f6272; font-size: 12px; }
[data-ra-next-price-trend-table-details] summary {
    min-height: 36px;
    padding: 8px 0;
    cursor: pointer;
    font-weight: 800;
}
[data-ra-next-price-trend-table-details] > div { max-height: 280px; overflow: auto; }
[data-ra-next-price-trend-table-details] table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
}
[data-ra-next-price-trend-table-details] th,
[data-ra-next-price-trend-table-details] td {
    padding: 7px 8px;
    border: 1px solid #dbe3e9;
    text-align: left;
    white-space: nowrap;
}
[data-ra-next-price-trend-table-details] th { background: #f3f6f8; }
@media (max-width: 680px) {
    [${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] {
        width: min(100%, calc(100vw - 16px));
        margin-top: 14px;
        padding: 13px;
    }
    [data-ra-next-price-trend-summaries] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    [${PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE}] { min-height: 112px; padding: 10px; }
    [data-ra-next-price-trend-filters] { display: grid; }
    [${PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE}] { min-height: 44px; }
    [${PRICE_TREND_COMPARISON_SVG_ATTRIBUTE}] { min-width: 0; }
}
`;
}

function createHeader(
    documentHost: Document,
    state: PriceTrendComparisonRenderState,
    captureStatus: PriceTrendCaptureStatus
): HTMLElement {
    const header = documentHost.createElement("header");
    header.setAttribute("data-ra-next-price-trend-header", "");
    const eyebrow = documentHost.createElement("span");
    eyebrow.setAttribute("data-ra-next-price-trend-eyebrow", "");
    eyebrow.textContent = "90日価格推移";
    const title = documentHost.createElement("h3");
    title.textContent = "人数差を先に確認";
    const meta = documentHost.createElement("p");
    meta.setAttribute("data-ra-next-price-trend-meta", "");
    meta.textContent = state.status === "ready"
        ? formatMeta(state.viewModel)
        : `対象宿泊日 ${formatStayDate(state.stayDate)} / 保存済み履歴を確認`;
    const capture = documentHost.createElement("span");
    capture.setAttribute("data-ra-next-price-trend-capture", captureStatus);
    capture.setAttribute("role", captureStatus === "error" ? "alert" : "status");
    capture.textContent = formatCaptureStatus(captureStatus);
    header.append(eyebrow, title, meta, capture);
    return header;
}

function formatMeta(viewModel: PriceTrendComparisonViewModel): string {
    const roomScope = viewModel.filters.roomType === null
        ? viewModel.usesSpecificRoomTypeAggregation
            ? "全部屋タイプの最安値"
            : "部屋タイプ指定なし"
        : viewModel.availableFilters.roomTypes.find(
            (option) => option.value === viewModel.filters.roomType
        )?.label ?? viewModel.filters.roomType;
    const mealScope = viewModel.filters.mealType === null
        ? "食事条件の最安値"
        : formatPriceTrendComparisonMealType(viewModel.filters.mealType);
    return [
        `対象宿泊日 ${formatStayDate(viewModel.stayDate)}`,
        roomScope,
        mealScope,
        `保存 ${formatDateTime(viewModel.latestFetchedAt)}`,
        viewModel.latestSourceUpdatedAt === null
            ? "公式更新 不明"
            : `公式更新 ${formatDateTime(viewModel.latestSourceUpdatedAt)}`,
        "保存済み履歴 / 最新性は未保証"
    ].join(" / ");
}

function formatStateMessage(
    state: Exclude<PriceTrendComparisonRenderState, { status: "ready" }>,
    captureStatus: PriceTrendCaptureStatus
): string {
    if (captureStatus === "capturing") {
        return "本日分の90日価格推移を取得しています。標準の価格推移はそのまま利用できます。";
    }
    if (captureStatus === "no-price-data") {
        return "本日の取得では公式側に表示できる価格点がありませんでした。標準の価格推移はそのまま利用できます。";
    }
    if (state.status === "loading") {
        return "保存済みの90日価格推移を確認しています。";
    }
    if (state.status === "empty") {
        if (state.reason === "no-records" || state.reason === "database-missing") {
            return "この宿泊日の保存済み90日価格推移はありません。標準の価格推移はそのまま利用できます。";
        }
        if (state.reason === "indexeddb-unavailable" || state.reason === "database-list-unavailable") {
            return "ブラウザ保存領域を読み取れないため、人数比較を表示できません。";
        }
        if (state.reason === "no-price-points") {
            return "保存レコードはありますが、表示できる価格点がありません。";
        }
        return "保存済み90日価格推移を表示できません。標準の価格推移はそのまま利用できます。";
    }
    if (state.reason === "facility-context-mismatch") {
        return "表示中施設と保存履歴の施設が一致しないため、人数比較を停止しました。";
    }
    return "保存済み90日価格推移の読み取りに失敗しました。標準の価格推移はそのまま利用できます。";
}

function formatCaptureStatus(status: PriceTrendCaptureStatus): string {
    switch (status) {
        case "checking":
            return "保存状況を確認中";
        case "capturing":
            return "本日分を取得中（最大16件）";
        case "stored":
            return "本日分を保存";
        case "already-stored":
            return "本日分は保存済み";
        case "out-of-range":
            return "90日範囲外";
        case "no-price-data":
            return "公式側データなし";
        case "unavailable":
            return "保存不可";
        case "error":
            return "取得失敗";
        case "disabled":
            return "合成fixture・取得なし";
    }
}

function createMessage(
    documentHost: Document,
    text: string,
    tone: string
): HTMLElement {
    const message = documentHost.createElement("p");
    message.setAttribute("data-ra-next-price-trend-message", tone);
    message.setAttribute("role", tone === "error" ? "alert" : "status");
    message.textContent = text;
    return message;
}

function createFilters(
    documentHost: Document,
    viewModel: PriceTrendComparisonViewModel
): HTMLElement {
    const filters = documentHost.createElement("div");
    filters.setAttribute("data-ra-next-price-trend-filters", "");
    filters.append(
        createFilterGroup(
            documentHost,
            "部屋タイプ",
            "roomType",
            viewModel.availableFilters.roomTypes,
            viewModel.filters,
            "すべて"
        ),
        createFilterGroup(
            documentHost,
            "食事",
            "mealType",
            viewModel.availableFilters.mealTypes,
            viewModel.filters,
            "指定なし"
        )
    );
    return filters;
}

function createFilterGroup(
    documentHost: Document,
    label: string,
    kind: keyof PriceTrendComparisonFilters,
    options: readonly { label: string; value: string }[],
    filters: PriceTrendComparisonFilters,
    emptyLabel: string
): HTMLElement {
    const group = documentHost.createElement("fieldset");
    group.setAttribute("data-ra-next-price-trend-filter-group", kind);
    const legend = documentHost.createElement("legend");
    legend.textContent = label;
    group.append(legend);
    for (const option of [{ label: emptyLabel, value: "" }, ...options]) {
        const button = documentHost.createElement("button");
        button.type = "button";
        button.setAttribute(PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE, kind);
        button.setAttribute(PRICE_TREND_COMPARISON_FILTER_VALUE_ATTRIBUTE, option.value);
        button.setAttribute("aria-pressed", String((filters[kind] ?? "") === option.value));
        button.textContent = option.label;
        group.append(button);
    }
    return group;
}

function createGuestSummaries(
    documentHost: Document,
    viewModel: PriceTrendComparisonViewModel
): HTMLElement {
    const summaries = documentHost.createElement("div");
    summaries.setAttribute("data-ra-next-price-trend-summaries", "");
    summaries.setAttribute("role", "group");
    summaries.setAttribute("aria-label", "人数別の直近価格差");
    for (const guestCount of PRICE_TREND_COMPARISON_GUEST_COUNTS) {
        const comparison = viewModel.comparisons.find((item) => item.guestCount === guestCount);
        const button = documentHost.createElement("button");
        button.type = "button";
        button.setAttribute(PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE, String(guestCount));
        button.setAttribute("aria-pressed", String(guestCount === viewModel.selectedGuestCount));
        const guest = documentHost.createElement("span");
        guest.setAttribute("data-ra-next-price-trend-summary-guest", "");
        guest.textContent = `${guestCount}名`;
        const leadTime = documentHost.createElement("span");
        leadTime.setAttribute("data-ra-next-price-trend-summary-lt", "");
        leadTime.textContent = comparison?.latestLeadTimeDays === null
            || comparison?.latestLeadTimeDays === undefined
            ? "データなし"
            : `${comparison.latestLeadTimeDays}日前`;
        button.append(
            guest,
            leadTime,
            createSummaryRow(documentHost, "自社", comparison?.ownPrice ?? null),
            createSummaryRow(documentHost, "競合最安", comparison?.competitorMinPrice ?? null),
            createGap(documentHost, comparison?.gapFromCompetitor ?? null)
        );
        summaries.append(button);
    }
    return summaries;
}

function createSummaryRow(
    documentHost: Document,
    label: string,
    price: number | null
): HTMLElement {
    const row = documentHost.createElement("span");
    row.setAttribute("data-ra-next-price-trend-summary-row", "");
    const labelElement = documentHost.createElement("span");
    labelElement.textContent = label;
    const value = documentHost.createElement("strong");
    value.textContent = price === null ? "—" : formatPrice(price);
    row.append(labelElement, value);
    return row;
}

function createGap(documentHost: Document, gap: number | null): HTMLElement {
    const element = documentHost.createElement("span");
    const tone = gap === null ? "missing" : gap > 0 ? "above" : gap < 0 ? "below" : "same";
    element.setAttribute("data-ra-next-price-trend-gap", tone);
    element.textContent = gap === null
        ? "自社との差 —"
        : gap === 0
            ? "自社と競合が同額"
            : `自社 ${gap > 0 ? "+" : ""}${formatPrice(gap)}`;
    return element;
}

function createLegend(
    documentHost: Document,
    facilities: readonly PriceTrendComparisonFacility[],
    points: readonly PriceTrendComparisonPoint[]
): HTMLElement {
    const pointFacilityIds = new Set(points.map((point) => point.facilityId));
    const legend = documentHost.createElement("div");
    legend.setAttribute("data-ra-next-price-trend-legend", "");
    legend.setAttribute("aria-label", "施設の凡例");
    for (const facility of facilities.filter((item) => pointFacilityIds.has(item.id))) {
        const item = documentHost.createElement("span");
        item.setAttribute("data-ra-next-price-trend-legend-item", "");
        const swatch = documentHost.createElement("span");
        swatch.setAttribute("data-ra-next-price-trend-swatch", "");
        swatch.style.backgroundColor = facility.color;
        swatch.setAttribute("aria-hidden", "true");
        item.append(swatch, documentHost.createTextNode(facility.label));
        legend.append(item);
    }
    return legend;
}

function createChart(
    documentHost: Document,
    comparison: PriceTrendGuestComparison,
    facilities: readonly PriceTrendComparisonFacility[],
    narrow: boolean
): HTMLElement {
    const width = narrow ? 360 : 860;
    const height = narrow ? 274 : 284;
    const padding = { top: 18, right: 18, bottom: 38, left: narrow ? 54 : 64 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const wrapper = documentHost.createElement("div");
    wrapper.setAttribute("data-ra-next-price-trend-chart-wrap", "");
    const tooltip = documentHost.createElement("div");
    tooltip.setAttribute("data-ra-next-price-trend-tooltip", "");
    tooltip.setAttribute("role", "status");
    tooltip.hidden = true;
    const svg = documentHost.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(PRICE_TREND_COMPARISON_SVG_ATTRIBUTE, String(comparison.guestCount));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    const title = documentHost.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${comparison.guestCount}名の施設別90日価格推移`;
    const description = documentHost.createElementNS("http://www.w3.org/2000/svg", "desc");
    description.textContent = "左が宿泊日の約90日前、右が宿泊日側です。直近価格は上の人数比較、全値は下の表でも確認できます。";
    svg.append(title, description);

    const domain = resolvePriceDomain(comparison.points);
    for (const tick of buildPriceTicks(domain.min, domain.max, 5)) {
        const y = scaleY(tick, domain, padding.top, plotHeight);
        const grid = documentHost.createElementNS("http://www.w3.org/2000/svg", "line");
        grid.setAttribute("x1", String(padding.left));
        grid.setAttribute("x2", String(width - padding.right));
        grid.setAttribute("y1", y.toFixed(2));
        grid.setAttribute("y2", y.toFixed(2));
        grid.setAttribute("data-ra-next-price-trend-grid", "");
        const label = documentHost.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(padding.left - 7));
        label.setAttribute("y", String(y + 4));
        label.setAttribute("text-anchor", "end");
        label.textContent = formatAxisPrice(tick);
        svg.append(grid, label);
    }

    const leadTimeDays = Array.from(new Set(
        comparison.points.map((point) => point.leadTimeDays)
    )).sort((left, right) => right - left);
    const maxLeadTime = Math.max(...leadTimeDays);
    const minLeadTime = Math.min(...leadTimeDays);
    for (const leadTime of selectLeadTimeTicks(maxLeadTime, minLeadTime)) {
        const label = documentHost.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute(
            "x",
            scaleX(leadTime, maxLeadTime, minLeadTime, padding.left, plotWidth).toFixed(2)
        );
        label.setAttribute("y", String(height - 11));
        label.setAttribute("text-anchor", "middle");
        label.textContent = `${leadTime}日`;
        svg.append(label);
    }

    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    for (const facility of facilities) {
        const points = comparison.points
            .filter((point) => point.facilityId === facility.id)
            .sort((left, right) => right.leadTimeDays - left.leadTimeDays);
        if (points.length === 0) {
            continue;
        }
        const path = documentHost.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", points.map((point, index) => {
            const x = scaleX(point.leadTimeDays, maxLeadTime, minLeadTime, padding.left, plotWidth);
            const y = scaleY(point.price, domain, padding.top, plotHeight);
            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(" "));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", facility.color);
        path.setAttribute("stroke-width", facility.isOwn ? "3" : "2");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        svg.append(path);
        for (const point of points) {
            const circle = documentHost.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute(
                "cx",
                scaleX(point.leadTimeDays, maxLeadTime, minLeadTime, padding.left, plotWidth).toFixed(2)
            );
            circle.setAttribute(
                "cy",
                scaleY(point.price, domain, padding.top, plotHeight).toFixed(2)
            );
            circle.setAttribute("r", facility.isOwn ? "3.4" : "2.7");
            circle.setAttribute("fill", facility.color);
            svg.append(circle);
        }
    }

    const hitWidth = Math.max(28, plotWidth / Math.max(1, leadTimeDays.length));
    for (const leadTime of leadTimeDays) {
        const x = scaleX(leadTime, maxLeadTime, minLeadTime, padding.left, plotWidth);
        const hitbox = documentHost.createElementNS("http://www.w3.org/2000/svg", "rect");
        hitbox.setAttribute("x", String(Math.max(padding.left, x - hitWidth / 2)));
        hitbox.setAttribute("y", String(padding.top));
        hitbox.setAttribute(
            "width",
            String(Math.min(hitWidth, width - padding.right - Math.max(padding.left, x - hitWidth / 2)))
        );
        hitbox.setAttribute("height", String(plotHeight));
        hitbox.setAttribute("fill", "transparent");
        hitbox.setAttribute("tabindex", "0");
        hitbox.setAttribute(PRICE_TREND_COMPARISON_HITBOX_ATTRIBUTE, String(leadTime));
        hitbox.setAttribute(
            "aria-label",
            buildLeadTimeAriaLabel(leadTime, comparison.points, facilityById)
        );
        const show = (): void => showLeadTimeTooltip(
            tooltip,
            leadTime,
            comparison.points,
            facilityById
        );
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

function createAccessibleTable(
    documentHost: Document,
    comparison: PriceTrendGuestComparison,
    facilities: readonly PriceTrendComparisonFacility[]
): HTMLElement {
    const details = documentHost.createElement("details");
    details.setAttribute("data-ra-next-price-trend-table-details", "");
    const summary = documentHost.createElement("summary");
    summary.textContent = "全価格点を表で確認";
    const scroll = documentHost.createElement("div");
    const table = documentHost.createElement("table");
    const caption = documentHost.createElement("caption");
    caption.textContent = `${comparison.guestCount}名の施設別90日価格推移`;
    const head = documentHost.createElement("thead");
    const row = documentHost.createElement("tr");
    for (const label of ["残り日数", "観測日", "施設", "部屋", "食事", "価格"]) {
        const cell = documentHost.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        row.append(cell);
    }
    head.append(row);
    const body = documentHost.createElement("tbody");
    const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
    for (const point of comparison.points) {
        const pointRow = documentHost.createElement("tr");
        for (const value of [
            `${point.leadTimeDays}日前`,
            point.observedDate ?? "不明",
            facilityById.get(point.facilityId)?.label ?? "競合施設",
            point.roomTypeLabel,
            formatPriceTrendComparisonMealType(point.mealType),
            formatPrice(point.price)
        ]) {
            const cell = documentHost.createElement("td");
            cell.textContent = value;
            pointRow.append(cell);
        }
        body.append(pointRow);
    }
    table.append(caption, head, body);
    scroll.append(table);
    details.append(summary, scroll);
    return details;
}

function showLeadTimeTooltip(
    tooltip: HTMLElement,
    leadTime: number,
    points: readonly PriceTrendComparisonPoint[],
    facilityById: ReadonlyMap<string, PriceTrendComparisonFacility>
): void {
    const documentHost = tooltip.ownerDocument;
    const title = documentHost.createElement("strong");
    title.textContent = `${leadTime}日前`;
    const list = documentHost.createElement("ul");
    for (const point of points
        .filter((candidate) => candidate.leadTimeDays === leadTime)
        .sort((left, right) => left.price - right.price)) {
        const item = documentHost.createElement("li");
        item.textContent = [
            facilityById.get(point.facilityId)?.label ?? "競合施設",
            formatPrice(point.price),
            point.roomTypeLabel,
            formatPriceTrendComparisonMealType(point.mealType)
        ].join(" / ");
        list.append(item);
    }
    tooltip.replaceChildren(title, list);
    tooltip.hidden = false;
}

function buildLeadTimeAriaLabel(
    leadTime: number,
    points: readonly PriceTrendComparisonPoint[],
    facilityById: ReadonlyMap<string, PriceTrendComparisonFacility>
): string {
    const values = points
        .filter((point) => point.leadTimeDays === leadTime)
        .map((point) => (
            `${facilityById.get(point.facilityId)?.label ?? "競合施設"} ${formatPrice(point.price)}`
        ));
    return `${leadTime}日前。${values.join("、")}`;
}

function resolvePriceDomain(
    points: readonly PriceTrendComparisonPoint[]
): { min: number; max: number } {
    const values = points.map((point) => point.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
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

function scaleX(
    leadTime: number,
    maximum: number,
    minimum: number,
    left: number,
    width: number
): number {
    return maximum === minimum
        ? left + width / 2
        : left + ((maximum - leadTime) / (maximum - minimum)) * width;
}

function scaleY(
    price: number,
    domain: { min: number; max: number },
    top: number,
    height: number
): number {
    return top + height - ((price - domain.min) / Math.max(1, domain.max - domain.min)) * height;
}

function selectLeadTimeTicks(maximum: number, minimum: number): number[] {
    const candidates = [maximum, 60, 30, 14, 7, minimum]
        .filter((value) => value <= maximum && value >= minimum);
    return Array.from(new Set(candidates)).sort((left, right) => right - left);
}

function formatPrice(value: number): string {
    return `${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

function formatAxisPrice(value: number): string {
    return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(value);
}

function formatStayDate(value: string): string {
    const compact = value.replaceAll("-", "");
    return /^\d{8}$/u.test(compact)
        ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
        : value;
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
