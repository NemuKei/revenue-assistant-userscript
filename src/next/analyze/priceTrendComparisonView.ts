import {
    PRICE_TREND_COMPARISON_GUEST_COUNTS,
    formatPriceTrendComparisonMealType,
    type PriceTrendComparisonFacility,
    type PriceTrendComparisonPoint,
    type PriceTrendComparisonViewModel,
    type PriceTrendGuestComparison
} from "./priceTrendComparisonModel";
import {
    createPriceConditionFilters,
    getPriceConditionFilterStyles
} from "./priceConditionFilterView";
import { positionViewportTooltip } from "./viewportTooltipPosition";

export const PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE = "data-ra-next-price-trend-comparison-root";
export const PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE = "data-ra-next-price-trend-filter-kind";
export const PRICE_TREND_COMPARISON_FILTER_VALUE_ATTRIBUTE = "data-ra-next-price-trend-filter-value";
export const PRICE_TREND_COMPARISON_SVG_ATTRIBUTE = "data-ra-next-price-trend-svg";
export const PRICE_TREND_COMPARISON_HITBOX_ATTRIBUTE = "data-ra-next-price-trend-hitbox";
export const PRICE_TREND_COMPARISON_GUIDE_ATTRIBUTE = "data-ra-next-price-trend-guide";
export const PRICE_TREND_COMPARISON_HITBOX_ACTIVE_ATTRIBUTE = "data-ra-next-price-trend-hitbox-active";

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
    const filters = createFilters(documentHost, viewModel);
    const allPoints = viewModel.comparisons.flatMap((comparison) => comparison.points);
    const panels = documentHost.createElement("div");
    panels.setAttribute("data-ra-next-price-trend-panels", "");
    for (const guestCount of PRICE_TREND_COMPARISON_GUEST_COUNTS) {
        panels.append(createGuestPanel(
            documentHost,
            guestCount,
            viewModel.comparisons.find((comparison) => comparison.guestCount === guestCount),
            viewModel.facilities,
            options.narrow
        ));
    }
    const emptyMessage = viewModel.hasAnyPoints
        ? null
        : createMessage(
            documentHost,
            options.captureStatus === "capturing"
                ? "選択した部屋タイプの90日価格推移を取得しています。"
                : "この絞り込み条件に一致する90日価格推移はありません。",
            "empty"
        );
    root.replaceChildren(
        header,
        filters,
        ...(emptyMessage === null ? [] : [emptyMessage]),
        createLegend(documentHost, viewModel.facilities, allPoints),
        panels
    );
}

export function getPriceTrendComparisonStyles(): string {
    return `
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] {
    --ra-next-price-blue: #4b7fc7;
    box-sizing: border-box;
    width: 100%;
    max-width: calc(100vw - 48px);
    min-width: 0;
    margin: 12px 0 8px;
    padding: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #263a4d;
    font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
}
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] * { box-sizing: border-box; }
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] h3,
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] h4,
[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}] p { margin: 0; }
[data-ra-next-price-trend-header] { display: grid; gap: 6px; margin-bottom: 8px; }
[data-ra-next-price-trend-header] h3 {
    color: #243447;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.35;
}
[data-ra-next-price-trend-meta] {
    color: #50627a;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
}
[data-ra-next-price-trend-message] {
    padding: 18px;
    border-radius: 8px;
    background: #f3f6f8;
    color: #526576;
    line-height: 1.6;
}
[data-ra-next-price-trend-message="error"] { background: #fff1ef; color: #8d3428; }
[${PRICE_TREND_COMPARISON_HITBOX_ATTRIBUTE}]:focus-visible {
    outline: 3px solid #d98200;
    outline-offset: 2px;
}
[data-ra-next-price-trend-panels] {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    max-width: 980px;
    min-width: 0;
}
[data-ra-next-price-trend-panel] {
    display: block;
    position: relative;
    min-width: 0;
    padding: 12px 14px 10px;
    border: 1px solid #d8e0ea;
    border-radius: 6px;
    background: #fff;
}
[data-ra-next-price-trend-panel-header] {
    margin-bottom: 2px;
}
[data-ra-next-price-trend-panel-header] h4 {
    color: #243447;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.35;
}
[data-ra-next-price-trend-panel-empty] {
    padding: 18px;
    border-radius: 7px;
    background: #f3f6f8;
    color: #526576;
}
[data-ra-next-price-trend-legend] {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-bottom: 8px;
}
[data-ra-next-price-trend-legend-item] {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    color: #50627a;
    font-size: 12px;
    font-weight: 700;
}
[data-ra-next-price-trend-swatch] {
    width: 10px;
    height: 10px;
    flex: 0 0 auto;
    border-radius: 2px;
}
[data-ra-next-price-trend-chart-wrap] { position: relative; min-width: 0; }
[${PRICE_TREND_COMPARISON_SVG_ATTRIBUTE}] {
    display: block;
    width: 100%;
    max-width: 760px;
    height: auto;
    overflow: visible;
}
[${PRICE_TREND_COMPARISON_SVG_ATTRIBUTE}] text {
    fill: #50627a;
    font-family: inherit;
    font-size: 10px;
}
[data-ra-next-price-trend-grid] { stroke: #dbe3e9; stroke-width: 1; }
[${PRICE_TREND_COMPARISON_GUIDE_ATTRIBUTE}] {
    stroke: #8fa1b8;
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
    pointer-events: none;
}
[${PRICE_TREND_COMPARISON_HITBOX_ATTRIBUTE}] { cursor: crosshair; }
[${PRICE_TREND_COMPARISON_HITBOX_ATTRIBUTE}][${PRICE_TREND_COMPARISON_HITBOX_ACTIVE_ATTRIBUTE}="true"] {
    fill: rgba(47, 111, 187, .08);
}
[data-ra-next-price-trend-tooltip] {
    position: fixed;
    z-index: 10;
    width: max-content;
    min-width: 220px;
    max-width: min(560px, calc(100vw - 16px));
    max-height: 220px;
    overflow: auto;
    padding: 6px 8px;
    border: 1px solid #cbd7e8;
    border-radius: 6px;
    background: rgba(255,255,255,.98);
    box-shadow: 0 8px 24px rgba(32,50,76,.14);
    color: #29384d;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.45;
    pointer-events: none;
}
[data-ra-next-price-trend-tooltip] table {
    min-width: 430px;
    margin-top: 4px;
    border-collapse: collapse;
    font-size: 11px;
}
[data-ra-next-price-trend-tooltip] th,
[data-ra-next-price-trend-tooltip] td {
    padding: 2px 6px;
    border-bottom: 1px solid #e5ebf2;
    text-align: right;
    white-space: nowrap;
}
[data-ra-next-price-trend-tooltip] th:first-child,
[data-ra-next-price-trend-tooltip] td:first-child {
    max-width: 240px;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
}
[data-ra-next-price-trend-tooltip] th { color: #50627a; font-weight: 800; }
[data-ra-next-price-trend-tooltip] tr:last-child td { border-bottom: 0; }
[data-ra-next-price-trend-tooltip] [data-ra-next-price-trend-delta="negative"] { color: #c93a3a; }
[data-ra-next-price-trend-tooltip-facility] {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: top;
}
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
        width: 100%;
        max-width: calc(100vw - 16px);
        margin-top: 14px;
        padding: 0;
    }
    [data-ra-next-price-trend-panel] { padding: 10px; }
    [${PRICE_TREND_COMPARISON_SVG_ATTRIBUTE}] { min-width: 0; }
}
${getPriceConditionFilterStyles(`[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}]`)}
`;
}

function createHeader(
    documentHost: Document,
    state: PriceTrendComparisonRenderState,
    captureStatus: PriceTrendCaptureStatus
): HTMLElement {
    const header = documentHost.createElement("header");
    header.setAttribute("data-ra-next-price-trend-header", "");
    const title = documentHost.createElement("h3");
    title.textContent = "競合価格 最安値推移（90日版）";
    const meta = documentHost.createElement("p");
    meta.setAttribute("data-ra-next-price-trend-meta", "");
    const context = state.status === "ready"
        ? formatMeta(state.viewModel)
        : `対象宿泊日 ${formatStayDate(state.stayDate)} / 保存済み履歴を確認`;
    meta.setAttribute("role", captureStatus === "error" ? "alert" : "status");
    meta.textContent = `${context} / 保存状態 ${formatCaptureStatus(captureStatus)}`;
    header.append(title, meta);
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
        viewModel.selectedRecordCount === 0
            ? "選択条件 未取得"
            : `保存 ${formatDateTime(viewModel.latestFetchedAt)}`,
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
    return createPriceConditionFilters({
        availableFilters: viewModel.availableFilters,
        documentHost,
        filters: viewModel.filters,
        legacyAttributes: {
            container: "data-ra-next-price-trend-filters",
            group: "data-ra-next-price-trend-filter-group",
            kind: PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE,
            value: PRICE_TREND_COMPARISON_FILTER_VALUE_ATTRIBUTE
        }
    });
}

function createGuestPanel(
    documentHost: Document,
    guestCount: PriceTrendGuestComparison["guestCount"],
    comparison: PriceTrendGuestComparison | undefined,
    facilities: readonly PriceTrendComparisonFacility[],
    narrow: boolean
): HTMLElement {
    const panel = documentHost.createElement("section");
    panel.setAttribute("data-ra-next-price-trend-panel", String(guestCount));
    panel.setAttribute("aria-labelledby", `ra-next-price-trend-panel-${guestCount}`);
    const panelHeader = documentHost.createElement("div");
    panelHeader.setAttribute("data-ra-next-price-trend-panel-header", "");
    const title = documentHost.createElement("h4");
    title.id = `ra-next-price-trend-panel-${guestCount}`;
    title.textContent = `${guestCount}名 最安値`;
    panelHeader.append(title);
    if (comparison === undefined || comparison.points.length === 0) {
        const empty = documentHost.createElement("p");
        empty.setAttribute("data-ra-next-price-trend-panel-empty", "");
        empty.textContent = "対象データなし";
        panel.append(panelHeader, empty);
        return panel;
    }
    panel.append(
        panelHeader,
        createChart(documentHost, comparison, facilities, narrow),
        createAccessibleTable(documentHost, comparison, facilities)
    );
    return panel;
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
    const width = narrow ? 360 : 760;
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
    svg.setAttribute("aria-label", `${comparison.guestCount}名の施設別90日価格推移`);
    const description = documentHost.createElementNS("http://www.w3.org/2000/svg", "desc");
    description.id = `ra-next-price-trend-chart-description-${comparison.guestCount}`;
    description.textContent = "左が宿泊日の約90日前、右が宿泊日側です。全値は下の表でも確認できます。";
    svg.setAttribute("aria-describedby", description.id);
    svg.append(description);

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
    const guide = documentHost.createElementNS("http://www.w3.org/2000/svg", "line");
    guide.setAttribute("x1", String(padding.left));
    guide.setAttribute("x2", String(padding.left));
    guide.setAttribute("y1", String(padding.top));
    guide.setAttribute("y2", String(height - padding.bottom));
    guide.setAttribute("visibility", "hidden");
    guide.setAttribute(PRICE_TREND_COMPARISON_GUIDE_ATTRIBUTE, "");
    svg.append(guide);
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
    }

    const hitWidth = Math.max(28, plotWidth / Math.max(1, leadTimeDays.length));
    const hitboxes: SVGRectElement[] = [];
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
        hitbox.setAttribute(PRICE_TREND_COMPARISON_HITBOX_ACTIVE_ATTRIBUTE, "false");
        hitbox.setAttribute(
            "aria-label",
            buildLeadTimeAriaLabel(leadTime, comparison.points, facilityById)
        );
        hitboxes.push(hitbox);
        hitbox.addEventListener("mouseenter", (event) => {
            setActiveHitbox(hitboxes, hitbox);
            showLeadTimeTooltip(tooltip, leadTime, comparison.points, facilityById);
            showGuide(guide, x);
            positionTooltip(tooltip, x, width, event.clientX);
        });
        hitbox.addEventListener("focus", () => {
            setActiveHitbox(hitboxes, hitbox);
            showLeadTimeTooltip(tooltip, leadTime, comparison.points, facilityById);
            showGuide(guide, x);
            positionTooltip(tooltip, x, width, null);
        });
        const hide = (): void => {
            tooltip.hidden = true;
            guide.setAttribute("visibility", "hidden");
            clearActiveHitboxes(hitboxes);
        };
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
    const currentPoints = points.filter((candidate) => candidate.leadTimeDays === leadTime);
    const leadTimes = Array.from(new Set(points.map((point) => point.leadTimeDays)))
        .sort((left, right) => right - left);
    const leadTimeIndex = leadTimes.indexOf(leadTime);
    const previousLeadTime = leadTimeIndex > 0 ? leadTimes[leadTimeIndex - 1] : null;
    const previousPointByFacility = new Map(
        points
            .filter((point) => point.leadTimeDays === previousLeadTime)
            .map((point) => [point.facilityId, point])
    );
    const ownPoint = currentPoints.find((point) => facilityById.get(point.facilityId)?.isOwn === true);
    const table = documentHost.createElement("table");
    const head = documentHost.createElement("thead");
    const headRow = documentHost.createElement("tr");
    for (const label of ["施設", "部屋タイプ", "価格", "前回差分", "自社との差"]) {
        const cell = documentHost.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = documentHost.createElement("tbody");
    for (const point of currentPoints) {
        const facility = facilityById.get(point.facilityId);
        const previousPoint = previousPointByFacility.get(point.facilityId);
        const previousDelta = previousPoint === undefined ? null : point.price - previousPoint.price;
        const ownDelta = facility?.isOwn === true || ownPoint === undefined
            ? null
            : point.price - ownPoint.price;
        const row = documentHost.createElement("tr");
        const facilityCell = documentHost.createElement("td");
        const facilityLabel = documentHost.createElement("span");
        facilityLabel.setAttribute("data-ra-next-price-trend-tooltip-facility", "");
        const swatch = documentHost.createElement("span");
        swatch.setAttribute("data-ra-next-price-trend-swatch", "");
        swatch.style.backgroundColor = facility?.color ?? "#53677c";
        swatch.setAttribute("aria-hidden", "true");
        facilityLabel.append(
            swatch,
            documentHost.createTextNode(facility?.label ?? "競合施設")
        );
        facilityCell.append(facilityLabel);
        const roomCell = documentHost.createElement("td");
        roomCell.textContent = point.roomTypeLabel;
        const priceCell = documentHost.createElement("td");
        priceCell.textContent = formatPrice(point.price);
        const previousCell = documentHost.createElement("td");
        previousCell.textContent = previousDelta === null ? "前回なし" : formatSignedPrice(previousDelta);
        previousCell.setAttribute("data-ra-next-price-trend-delta", getDeltaTone(previousDelta));
        const ownCell = documentHost.createElement("td");
        ownCell.textContent = ownDelta === null ? "-" : formatSignedPrice(ownDelta);
        ownCell.setAttribute("data-ra-next-price-trend-delta", getDeltaTone(ownDelta));
        row.append(facilityCell, roomCell, priceCell, previousCell, ownCell);
        body.append(row);
    }
    table.append(head, body);
    tooltip.replaceChildren(title, table);
    tooltip.hidden = false;
}

function setActiveHitbox(hitboxes: readonly SVGRectElement[], active: SVGRectElement): void {
    for (const hitbox of hitboxes) {
        hitbox.setAttribute(
            PRICE_TREND_COMPARISON_HITBOX_ACTIVE_ATTRIBUTE,
            String(hitbox === active)
        );
    }
}

function clearActiveHitboxes(hitboxes: readonly SVGRectElement[]): void {
    for (const hitbox of hitboxes) {
        hitbox.setAttribute(PRICE_TREND_COMPARISON_HITBOX_ACTIVE_ATTRIBUTE, "false");
    }
}

function showGuide(guide: SVGLineElement, x: number): void {
    guide.setAttribute("visibility", "visible");
    guide.setAttribute("x1", x.toFixed(2));
    guide.setAttribute("x2", x.toFixed(2));
}

function positionTooltip(
    tooltip: HTMLElement,
    x: number,
    chartViewBoxWidth: number,
    cursorClientX: number | null
): void {
    const panelRect = tooltip.parentElement?.getBoundingClientRect();
    const chartRect = tooltip.parentElement?.querySelector("svg")?.getBoundingClientRect();
    const renderedChartWidth = chartRect?.width ?? panelRect?.width ?? chartViewBoxWidth;
    const chartViewportLeft = chartRect?.left ?? panelRect?.left ?? 0;
    const scale = chartViewBoxWidth > 0 ? renderedChartWidth / chartViewBoxWidth : 1;
    positionViewportTooltip(tooltip, {
        anchorClientX: cursorClientX ?? chartViewportLeft + x * scale,
        preferredClientTop: (chartRect?.top ?? panelRect?.top ?? 0) + 28
    });
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

function formatSignedPrice(value: number): string {
    return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

function getDeltaTone(value: number | null): "negative" | "neutral" | "positive" {
    if (value === null || value === 0) {
        return "neutral";
    }
    return value < 0 ? "negative" : "positive";
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
