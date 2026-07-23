import { LEAD_TIME_BUCKET_VISIBLE_TICKS } from "../../leadTimeBuckets";
import type {
    BookingCurveReferencePanel,
    BookingCurveReferenceRankMarker,
    BookingCurveReferenceSeries,
    BookingCurveReferenceSeriesPoint,
    BookingCurveReferenceViewModel
} from "./bookingCurveReferenceModel";
import type { BookingCurveRankHistoryViewState } from "./bookingCurveRankMarkerModel";

export const BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE = "data-ra-next-booking-curve-reference-root";
export const BOOKING_CURVE_REFERENCE_STYLE_ATTRIBUTE = "data-ra-next-booking-curve-reference-style";
export const BOOKING_CURVE_REFERENCE_SCOPE_ATTRIBUTE = "data-ra-next-booking-curve-reference-scope";
export const BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE = "data-ra-next-booking-curve-reference-segment";
export const BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE = "data-ra-next-booking-curve-reference-visibility";
export const BOOKING_CURVE_REFERENCE_PANEL_ATTRIBUTE = "data-ra-next-booking-curve-reference-panel";
export const BOOKING_CURVE_REFERENCE_SVG_ATTRIBUTE = "data-ra-next-booking-curve-reference-svg";
export const BOOKING_CURVE_REFERENCE_HITBOX_ATTRIBUTE = "data-ra-next-booking-curve-reference-hitbox";
export const BOOKING_CURVE_RANK_MARKER_ATTRIBUTE = "data-ra-next-booking-curve-rank-marker";
export const BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE = "data-ra-next-booking-curve-rank-marker-hitbox";

export type BookingCurveReferenceRenderState =
    | { status: "loading"; stayDate: string }
    | {
        status: "empty";
        controls?: Pick<BookingCurveReferenceViewModel, "scope" | "scopes">;
        rankHistory?: BookingCurveRankHistoryViewState;
        reason: string;
        stayDate: string;
    }
    | { status: "error"; reason: string; stayDate: string }
    | {
        status: "ready";
        rankHistory: BookingCurveRankHistoryViewState;
        viewModel: BookingCurveReferenceViewModel;
    };

const DISPLAY_TICKS = new Set([...LEAD_TIME_BUCKET_VISIBLE_TICKS, 0]);
const SERIES_STYLE = {
    current: { color: "#176da5", dash: "", width: 3 },
    recent: { color: "#d98200", dash: "8 5", width: 2.3 },
    seasonal: { color: "#17806f", dash: "3 5", width: 2.3 }
} as const;

export function createBookingCurveReferenceRoot(documentHost: Document): HTMLElement {
    const root = documentHost.createElement("section");
    root.setAttribute(BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE, "");
    root.setAttribute("aria-labelledby", "ra-next-booking-curve-reference-title");
    return root;
}

export function ensureBookingCurveReferenceStyles(documentHost: Document): void {
    if (documentHost.querySelector(`[${BOOKING_CURVE_REFERENCE_STYLE_ATTRIBUTE}]`) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.setAttribute(BOOKING_CURVE_REFERENCE_STYLE_ATTRIBUTE, "");
    style.textContent = getBookingCurveReferenceStyles();
    documentHost.head.append(style);
}

export function removeBookingCurveReferenceArtifacts(documentHost: Document): void {
    for (const element of documentHost.querySelectorAll(
        `[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}], [${BOOKING_CURVE_REFERENCE_STYLE_ATTRIBUTE}]`
    )) {
        element.remove();
    }
}

export function renderBookingCurveReference(
    root: HTMLElement,
    state: BookingCurveReferenceRenderState,
    options: { narrow: boolean }
): void {
    root.setAttribute("data-ra-next-booking-curve-reference-state", state.status);
    const header = createHeader(root.ownerDocument);
    if (state.status === "loading") {
        root.replaceChildren(
            header,
            createMessage(root.ownerDocument, "既存cacheから選択中のカーブを読み込んでいます。", "loading")
        );
        return;
    }
    if (state.status === "error") {
        root.replaceChildren(
            header,
            createMessage(
                root.ownerDocument,
                formatErrorReason(state.reason),
                "error"
            )
        );
        return;
    }
    if (state.status === "empty") {
        const children = [header];
        if (state.controls !== undefined) {
            children.push(createScopeControls(root.ownerDocument, state.controls));
        }
        if (state.rankHistory !== undefined && state.controls !== undefined) {
            children.push(createRankHistorySummary(
                root.ownerDocument,
                state.rankHistory,
                state.controls.scope.label
            ));
        }
        children.push(createMessage(root.ownerDocument, formatEmptyReason(state.reason), "empty"));
        root.replaceChildren(...children);
        return;
    }

    const { viewModel } = state;
    const controls = createControls(root.ownerDocument, viewModel);
    const meta = root.ownerDocument.createElement("p");
    meta.setAttribute("data-ra-next-booking-curve-reference-meta", "");
    meta.textContent = [
        `対象宿泊日 ${formatDate(viewModel.stayDate)}`,
        `データ更新 ${formatDate(viewModel.asOfDate)}`,
        `選択 ${viewModel.scope.label}`,
        `利用cache ${viewModel.sourceRecordCount}日分`,
        viewModel.reusedRecordCount > 0 ? `保存済み履歴点を再利用 ${viewModel.reusedRecordCount}件` : null,
        viewModel.futureRecordCount > 0 ? `未来as-of ${viewModel.futureRecordCount}件は除外` : null,
        viewModel.invalidRecordCount > 0 ? `契約不一致 ${viewModel.invalidRecordCount}件は除外` : null
    ].filter((item): item is string => item !== null).join(" / ");

    const legend = createLegend(root.ownerDocument, viewModel);
    const note = root.ownerDocument.createElement("p");
    note.setAttribute("data-ra-next-booking-curve-reference-note", "");
    note.textContent =
        "上の標準グラフはそのままです。ここでは現在と2つの基準線を同じLT軸で比較します。rank変更は確認済みroom scopeだけに表示し、欠損位置は推測しません。";
    const rankHistory = createRankHistorySummary(
        root.ownerDocument,
        state.rankHistory,
        viewModel.scope.label
    );
    const grid = root.ownerDocument.createElement("div");
    grid.setAttribute("data-ra-next-booking-curve-reference-grid", "");
    const domain = resolveSharedDomain(viewModel);
    for (const panel of viewModel.panels) {
        grid.append(createPanel(root.ownerDocument, panel, viewModel, domain, options.narrow));
    }
    root.replaceChildren(header, controls, meta, legend, note, rankHistory, grid);
}

function createHeader(documentHost: Document): HTMLElement {
    const header = documentHost.createElement("div");
    header.setAttribute("data-ra-next-booking-curve-reference-header", "");
    const titleWrap = documentHost.createElement("div");
    const title = documentHost.createElement("h2");
    title.id = "ra-next-booking-curve-reference-title";
    title.textContent = "ブッキングカーブ 基準比較";
    const kicker = documentHost.createElement("p");
    kicker.textContent = "選択した範囲だけ、browser内の既存cacheを読みます。";
    titleWrap.append(title, kicker);
    const badge = documentHost.createElement("span");
    badge.setAttribute("data-ra-next-booking-curve-reference-badge", "");
    badge.textContent = "read-only";
    header.append(titleWrap, badge);
    return header;
}

function createControls(documentHost: Document, viewModel: BookingCurveReferenceViewModel): HTMLElement {
    const controls = documentHost.createElement("div");
    controls.setAttribute("data-ra-next-booking-curve-reference-controls", "");
    controls.append(
        createScopeButtonGroup(documentHost, viewModel),
        createButtonGroup(
            documentHost,
            "2枚目",
            [
                { label: "個人", value: "transient" },
                { label: "団体", value: "group" }
            ],
            viewModel.secondarySegment,
            BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE
        ),
        createButtonGroup(
            documentHost,
            "基準線",
            [
                { label: "直近型", value: "recent" },
                { label: "季節型", value: "seasonal" }
            ],
            null,
            BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE,
            (value) => value === "recent" ? viewModel.visibility.recent : viewModel.visibility.seasonal
        )
    );
    return controls;
}

function createScopeControls(
    documentHost: Document,
    controlsModel: Pick<BookingCurveReferenceViewModel, "scope" | "scopes">
): HTMLElement {
    const controls = documentHost.createElement("div");
    controls.setAttribute("data-ra-next-booking-curve-reference-controls", "");
    controls.append(createScopeButtonGroup(documentHost, controlsModel));
    return controls;
}

function createScopeButtonGroup(
    documentHost: Document,
    controlsModel: Pick<BookingCurveReferenceViewModel, "scope" | "scopes">
): HTMLElement {
    return createButtonGroup(
        documentHost,
        "表示範囲",
        controlsModel.scopes.map((scope) => ({ label: scope.label, value: scope.key })),
        controlsModel.scope.key,
        BOOKING_CURVE_REFERENCE_SCOPE_ATTRIBUTE
    );
}

function createButtonGroup(
    documentHost: Document,
    label: string,
    items: readonly { label: string; value: string }[],
    selectedValue: string | null,
    attribute: string,
    resolvePressed?: (value: string) => boolean
): HTMLElement {
    const group = documentHost.createElement("fieldset");
    group.setAttribute("data-ra-next-booking-curve-reference-control-group", attribute);
    const legend = documentHost.createElement("legend");
    legend.textContent = label;
    group.append(legend);
    for (const item of items) {
        const button = documentHost.createElement("button");
        button.type = "button";
        button.setAttribute(attribute, item.value);
        button.setAttribute("aria-pressed", String(resolvePressed?.(item.value) ?? item.value === selectedValue));
        button.textContent = item.label;
        group.append(button);
    }
    return group;
}

function createLegend(documentHost: Document, viewModel: BookingCurveReferenceViewModel): HTMLElement {
    const legend = documentHost.createElement("div");
    legend.setAttribute("data-ra-next-booking-curve-reference-legend", "");
    legend.setAttribute("aria-label", "系列の凡例");
    for (const series of [
        { id: "current", label: "現在", visible: true },
        { id: "recent", label: "直近型", visible: viewModel.visibility.recent },
        { id: "seasonal", label: "季節型", visible: viewModel.visibility.seasonal }
    ] as const) {
        const item = documentHost.createElement("span");
        item.setAttribute("data-ra-next-booking-curve-reference-legend-item", series.id);
        item.setAttribute("data-series-visible", String(series.visible));
        const swatch = documentHost.createElement("span");
        swatch.style.backgroundColor = SERIES_STYLE[series.id].color;
        item.append(swatch, documentHost.createTextNode(series.visible ? series.label : `${series.label}（非表示）`));
        legend.append(item);
    }
    if (viewModel.scope.kind === "roomGroup") {
        const rankItem = documentHost.createElement("span");
        rankItem.setAttribute("data-ra-next-booking-curve-reference-legend-item", "rank");
        rankItem.setAttribute("data-series-visible", "true");
        rankItem.setAttribute("data-ra-next-booking-curve-rank-legend", "");
        rankItem.textContent = "◆ ランク変更";
        legend.append(rankItem);
    }
    return legend;
}

function createPanel(
    documentHost: Document,
    panel: BookingCurveReferencePanel,
    viewModel: BookingCurveReferenceViewModel,
    domain: { max: number; min: number },
    narrow: boolean
): HTMLElement {
    const element = documentHost.createElement("section");
    element.setAttribute(BOOKING_CURVE_REFERENCE_PANEL_ATTRIBUTE, panel.segment);
    const title = documentHost.createElement("h3");
    title.textContent = panel.title;
    const diagnostics = documentHost.createElement("p");
    diagnostics.setAttribute("data-ra-next-booking-curve-reference-diagnostics", "");
    diagnostics.textContent = [
        formatSeriesDiagnostic(panel.current),
        formatSeriesDiagnostic(panel.recent),
        formatSeriesDiagnostic(panel.seasonal)
    ].join(" / ");
    element.append(
        title,
        diagnostics,
        createChart(documentHost, panel, viewModel, domain, narrow),
        createAccessibleTable(documentHost, panel, viewModel)
    );
    return element;
}

function createChart(
    documentHost: Document,
    panel: BookingCurveReferencePanel,
    viewModel: BookingCurveReferenceViewModel,
    domain: { max: number; min: number },
    narrow: boolean
): HTMLElement {
    const width = narrow ? 380 : 680;
    const height = narrow ? 270 : 260;
    const padding = { top: 18, right: 18, bottom: 40, left: 48 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const wrapper = documentHost.createElement("div");
    wrapper.setAttribute("data-ra-next-booking-curve-reference-chart-wrap", "");
    const tooltip = documentHost.createElement("div");
    tooltip.setAttribute("data-ra-next-booking-curve-reference-tooltip", "");
    tooltip.setAttribute("role", "status");
    tooltip.hidden = true;
    const svg = documentHost.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute(BOOKING_CURVE_REFERENCE_SVG_ATTRIBUTE, panel.segment);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    const svgTitle = documentHost.createElementNS("http://www.w3.org/2000/svg", "title");
    svgTitle.textContent = `${viewModel.scope.label} ${panel.title}のブッキングカーブ基準比較`;
    const description = documentHost.createElementNS("http://www.w3.org/2000/svg", "desc");
    description.textContent = "360日前から0日前とACTまでの現在、直近型、季節型。全値はグラフ下の表でも確認できます。";
    svg.append(svgTitle, description);

    for (const tick of buildYTicks(domain.max, 4)) {
        const y = scaleY(tick, domain, padding.top, plotHeight);
        const line = documentHost.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(padding.left));
        line.setAttribute("x2", String(width - padding.right));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("data-ra-next-booking-curve-reference-grid-line", "");
        const label = documentHost.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(padding.left - 7));
        label.setAttribute("y", String(y + 4));
        label.setAttribute("text-anchor", "end");
        label.textContent = formatRooms(tick);
        svg.append(line, label);
    }
    if (viewModel.capacityRooms !== null) {
        const capacityY = scaleY(viewModel.capacityRooms, domain, padding.top, plotHeight);
        const capacityLine = documentHost.createElementNS("http://www.w3.org/2000/svg", "line");
        capacityLine.setAttribute("x1", String(padding.left));
        capacityLine.setAttribute("x2", String(width - padding.right));
        capacityLine.setAttribute("y1", capacityY.toFixed(2));
        capacityLine.setAttribute("y2", capacityY.toFixed(2));
        capacityLine.setAttribute("data-ra-next-booking-curve-reference-capacity", "");
        svg.append(capacityLine);
    }

    for (const [index, point] of panel.current.points.entries()) {
        if (!DISPLAY_TICKS.has(point.tick as never)) {
            continue;
        }
        const label = documentHost.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", scaleX(index, panel.current.points.length, padding.left, plotWidth).toFixed(2));
        label.setAttribute("y", String(height - 12));
        label.setAttribute("text-anchor", "middle");
        label.textContent = formatTick(point.tick);
        svg.append(label);
    }

    const visibleSeries = resolveVisibleSeries(panel, viewModel);
    for (const series of visibleSeries) {
        const style = SERIES_STYLE[series.id];
        const path = documentHost.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", buildLinePath(series.points, domain, padding, plotWidth, plotHeight));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", style.color);
        path.setAttribute("stroke-width", String(style.width));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        if (style.dash !== "") {
            path.setAttribute("stroke-dasharray", style.dash);
        }
        svg.append(path);
        for (const [index, point] of series.points.entries()) {
            if (point.value === null) {
                continue;
            }
            const circle = documentHost.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", scaleX(index, series.points.length, padding.left, plotWidth).toFixed(2));
            circle.setAttribute("cy", scaleY(point.value, domain, padding.top, plotHeight).toFixed(2));
            circle.setAttribute("r", series.id === "current" ? "3" : "2.4");
            circle.setAttribute("fill", style.color);
            svg.append(circle);
        }
    }

    for (const [index, point] of panel.current.points.entries()) {
        if (!visibleSeries.some((series) => series.points[index]?.value !== null)) {
            continue;
        }
        const hitbox = documentHost.createElementNS("http://www.w3.org/2000/svg", "rect");
        const step = plotWidth / Math.max(1, panel.current.points.length - 1);
        const center = scaleX(index, panel.current.points.length, padding.left, plotWidth);
        hitbox.setAttribute("x", String(Math.max(padding.left, center - Math.max(12, step / 2))));
        hitbox.setAttribute("y", String(padding.top));
        hitbox.setAttribute("width", String(Math.max(24, step)));
        hitbox.setAttribute("height", String(plotHeight));
        hitbox.setAttribute("fill", "transparent");
        hitbox.setAttribute(BOOKING_CURVE_REFERENCE_HITBOX_ATTRIBUTE, String(point.tick));
        hitbox.setAttribute("aria-label", buildTickAriaLabel(point.tick, visibleSeries, index));
        if (DISPLAY_TICKS.has(point.tick as never)) {
            hitbox.setAttribute("tabindex", "0");
        }
        const show = (): void => showTooltip(tooltip, point.tick, visibleSeries, index);
        const hide = (): void => { tooltip.hidden = true; };
        hitbox.addEventListener("mouseenter", show);
        hitbox.addEventListener("focus", show);
        hitbox.addEventListener("mouseleave", hide);
        hitbox.addEventListener("blur", hide);
        svg.append(hitbox);
    }
    for (const marker of panel.rankMarkers) {
        const x = scaleRankMarkerX(
            marker.daysBeforeStay,
            panel.current.points,
            padding.left,
            plotWidth
        );
        if (x === null) {
            continue;
        }
        const y = scaleY(marker.value, domain, padding.top, plotHeight);
        const guide = documentHost.createElementNS("http://www.w3.org/2000/svg", "line");
        guide.setAttribute("x1", x.toFixed(2));
        guide.setAttribute("x2", x.toFixed(2));
        guide.setAttribute("y1", String(padding.top));
        guide.setAttribute("y2", String(padding.top + plotHeight));
        guide.setAttribute("data-ra-next-booking-curve-rank-guide", "");
        const point = documentHost.createElementNS("http://www.w3.org/2000/svg", "polygon");
        point.setAttribute(BOOKING_CURVE_RANK_MARKER_ATTRIBUTE, marker.signature);
        point.setAttribute("points", [
            `${x.toFixed(2)},${(y - 5).toFixed(2)}`,
            `${(x + 5).toFixed(2)},${y.toFixed(2)}`,
            `${x.toFixed(2)},${(y + 5).toFixed(2)}`,
            `${(x - 5).toFixed(2)},${y.toFixed(2)}`
        ].join(" "));
        const hitbox = documentHost.createElementNS("http://www.w3.org/2000/svg", "circle");
        hitbox.setAttribute(BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE, marker.signature);
        hitbox.setAttribute("cx", x.toFixed(2));
        hitbox.setAttribute("cy", y.toFixed(2));
        hitbox.setAttribute("r", "22");
        hitbox.setAttribute("tabindex", "0");
        hitbox.setAttribute("role", "img");
        hitbox.setAttribute("aria-label", buildRankMarkerAriaLabel(marker));
        const show = (): void => showRankMarkerTooltip(tooltip, marker);
        const hide = (): void => { tooltip.hidden = true; };
        hitbox.addEventListener("mouseenter", show);
        hitbox.addEventListener("focus", show);
        hitbox.addEventListener("click", () => {
            (hitbox as SVGCircleElement & { focus: () => void }).focus();
            show();
        });
        hitbox.addEventListener("mouseleave", hide);
        hitbox.addEventListener("blur", hide);
        svg.append(guide, point, hitbox);
    }
    wrapper.append(svg, tooltip);
    return wrapper;
}

function createRankHistorySummary(
    documentHost: Document,
    state: BookingCurveRankHistoryViewState,
    scopeLabel: string
): HTMLElement {
    const section = documentHost.createElement("section");
    section.setAttribute("data-ra-next-booking-curve-rank-history", state.status);
    const message = documentHost.createElement("p");
    message.setAttribute("data-ra-next-booking-curve-rank-history-message", "");
    if (state.status === "scope-required") {
        message.textContent = "部屋タイプを選ぶと、そのroom IDに一致するランク変更履歴を確認できます。ホテル全体へは集約しません。";
        section.append(message);
        return section;
    }
    if (state.status === "loading") {
        message.setAttribute("role", "status");
        message.textContent = `${scopeLabel}のランク変更履歴を、この宿泊日だけ確認しています。`;
        section.append(message);
        return section;
    }
    if (state.status === "error") {
        message.setAttribute("role", "status");
        message.textContent = state.reason === "aborted"
            ? "表示切替でランク履歴の取得を中断しました。同じ表示contextでは自動再取得しません。"
            : state.reason === "response-invalid"
                ? "ランク履歴のresponse契約を確認できないため、markerを表示しません。"
                : "ランク変更履歴を取得できませんでした。current / reference表示には影響しません。";
        section.append(message);
        return section;
    }
    if (state.status === "empty") {
        message.textContent = `${scopeLabel}に一致するランク変更履歴はありません。`;
        if (state.invalidEventCount > 0) {
            message.textContent += ` 契約不一致 ${state.invalidEventCount}件は除外しました。`;
        }
        section.append(message);
        return section;
    }

    message.textContent = `${scopeLabel}のランク変更 ${state.events.length}件。marker位置が欠損するeventも履歴表には残します。`;
    if (state.invalidEventCount > 0) {
        message.textContent += ` 契約不一致 ${state.invalidEventCount}件は除外しました。`;
    }
    const details = documentHost.createElement("details");
    details.setAttribute("data-ra-next-booking-curve-rank-history-details", "");
    const summary = documentHost.createElement("summary");
    summary.textContent = "ランク変更履歴を表で確認";
    const table = documentHost.createElement("table");
    const thead = documentHost.createElement("thead");
    const header = documentHost.createElement("tr");
    for (const label of ["反映日", "LT", "変更前", "変更後"]) {
        const cell = documentHost.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        header.append(cell);
    }
    thead.append(header);
    const tbody = documentHost.createElement("tbody");
    for (const event of state.events) {
        const row = documentHost.createElement("tr");
        for (const value of [
            formatDate(event.reflectedDate),
            `${event.daysBeforeStay}日前`,
            event.beforeRankName ?? "-",
            event.afterRankName ?? "-"
        ]) {
            const cell = documentHost.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }
        tbody.append(row);
    }
    table.append(thead, tbody);
    details.append(summary, table);
    section.append(message, details);
    return section;
}

function createAccessibleTable(
    documentHost: Document,
    panel: BookingCurveReferencePanel,
    viewModel: BookingCurveReferenceViewModel
): HTMLElement {
    const details = documentHost.createElement("details");
    const summary = documentHost.createElement("summary");
    summary.textContent = "全データを表で確認";
    const table = documentHost.createElement("table");
    const thead = documentHost.createElement("thead");
    const header = documentHost.createElement("tr");
    for (const label of ["LT", "現在", "直近型", "季節型"]) {
        const cell = documentHost.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        header.append(cell);
    }
    thead.append(header);
    const tbody = documentHost.createElement("tbody");
    for (const [index, current] of panel.current.points.entries()) {
        const row = documentHost.createElement("tr");
        const tick = documentHost.createElement("th");
        tick.scope = "row";
        tick.textContent = formatTick(current.tick);
        row.append(
            tick,
            createValueCell(documentHost, current),
            createValueCell(documentHost, panel.recent.points[index], !viewModel.visibility.recent),
            createValueCell(documentHost, panel.seasonal.points[index], !viewModel.visibility.seasonal)
        );
        tbody.append(row);
    }
    table.append(thead, tbody);
    details.append(summary, table);
    return details;
}

function createValueCell(
    documentHost: Document,
    point: BookingCurveReferenceSeriesPoint | undefined,
    hiddenSeries = false
): HTMLTableCellElement {
    const cell = documentHost.createElement("td");
    cell.textContent = hiddenSeries
        ? "非表示"
        : point?.value === null || point === undefined
            ? "-"
            : `${formatRooms(point.value)}${point.interpolated ? "（補間）" : ""}`;
    return cell;
}

function resolveVisibleSeries(
    panel: BookingCurveReferencePanel,
    viewModel: BookingCurveReferenceViewModel
): BookingCurveReferenceSeries[] {
    return [
        panel.current,
        ...(viewModel.visibility.recent ? [panel.recent] : []),
        ...(viewModel.visibility.seasonal ? [panel.seasonal] : [])
    ];
}

function resolveSharedDomain(viewModel: BookingCurveReferenceViewModel): { max: number; min: number } {
    const values = viewModel.panels.flatMap((panel) => resolveVisibleSeries(panel, viewModel)
        .flatMap((series) => series.points.map((point) => point.value))
        .filter((value): value is number => value !== null)
        .concat(panel.rankMarkers.map((marker) => marker.value)));
    if (viewModel.capacityRooms !== null) {
        values.push(viewModel.capacityRooms);
    }
    const maximum = Math.max(1, ...values);
    const step = maximum <= 10 ? 2 : maximum <= 30 ? 5 : maximum <= 80 ? 10 : 20;
    return { min: 0, max: Math.ceil(maximum / step) * step };
}

function buildLinePath(
    points: readonly BookingCurveReferenceSeriesPoint[],
    domain: { max: number; min: number },
    padding: { left: number; top: number },
    plotWidth: number,
    plotHeight: number
): string {
    let open = false;
    const commands: string[] = [];
    for (const [index, point] of points.entries()) {
        if (point.value === null) {
            open = false;
            continue;
        }
        const x = scaleX(index, points.length, padding.left, plotWidth);
        const y = scaleY(point.value, domain, padding.top, plotHeight);
        commands.push(`${open ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`);
        open = true;
    }
    return commands.join(" ");
}

function showTooltip(
    tooltip: HTMLElement,
    tick: BookingCurveReferenceSeriesPoint["tick"],
    series: readonly BookingCurveReferenceSeries[],
    index: number
): void {
    tooltip.replaceChildren();
    const strong = tooltip.ownerDocument.createElement("strong");
    strong.textContent = formatTick(tick);
    const list = tooltip.ownerDocument.createElement("ul");
    for (const item of series) {
        const point = item.points[index];
        const row = tooltip.ownerDocument.createElement("li");
        row.textContent = `${item.label}: ${point?.value === null || point === undefined
            ? "データなし"
            : `${formatRooms(point.value)}室${point.interpolated ? "（表示補間）" : ""}`}`;
        list.append(row);
    }
    tooltip.append(strong, list);
    tooltip.hidden = false;
}

function showRankMarkerTooltip(
    tooltip: HTMLElement,
    marker: BookingCurveReferenceRankMarker
): void {
    tooltip.replaceChildren();
    const strong = tooltip.ownerDocument.createElement("strong");
    strong.textContent = `${marker.daysBeforeStay}日前 ランク変更`;
    const list = tooltip.ownerDocument.createElement("ul");
    for (const text of [
        `ランク: ${formatRankTransition(marker.beforeRankName, marker.afterRankName)}`,
        `反映日: ${formatDate(marker.reflectedDate)}`,
        `該当時点: ${formatRooms(marker.value)}室`
    ]) {
        const row = tooltip.ownerDocument.createElement("li");
        row.textContent = text;
        list.append(row);
    }
    tooltip.append(strong, list);
    tooltip.hidden = false;
}

function buildRankMarkerAriaLabel(marker: BookingCurveReferenceRankMarker): string {
    return [
        `${marker.daysBeforeStay}日前 ランク変更`,
        formatRankTransition(marker.beforeRankName, marker.afterRankName),
        `反映日 ${formatDate(marker.reflectedDate)}`,
        `${formatRooms(marker.value)}室`
    ].join("、");
}

function buildTickAriaLabel(
    tick: BookingCurveReferenceSeriesPoint["tick"],
    series: readonly BookingCurveReferenceSeries[],
    index: number
): string {
    return [
        formatTick(tick),
        ...series.map((item) => {
            const point = item.points[index];
            return `${item.label} ${point?.value === null || point === undefined
                ? "データなし"
                : `${formatRooms(point.value)}室${point.interpolated ? " 表示補間" : ""}`}`;
        })
    ].join("、");
}

function scaleRankMarkerX(
    daysBeforeStay: number,
    points: readonly BookingCurveReferenceSeriesPoint[],
    left: number,
    width: number
): number | null {
    const numericTicks = points.flatMap((point, index) => (
        typeof point.tick === "number" ? [{ index, tick: point.tick }] : []
    ));
    for (let index = 0; index < numericTicks.length; index += 1) {
        const current = numericTicks[index];
        if (current === undefined) {
            continue;
        }
        if (current.tick === daysBeforeStay) {
            return scaleX(current.index, points.length, left, width);
        }
        const next = numericTicks[index + 1];
        if (
            next === undefined
            || current.tick < daysBeforeStay
            || next.tick > daysBeforeStay
        ) {
            continue;
        }
        const tickSpan = current.tick - next.tick;
        const ratio = tickSpan === 0 ? 0 : (current.tick - daysBeforeStay) / tickSpan;
        const interpolatedIndex = current.index + ((next.index - current.index) * ratio);
        return left + (interpolatedIndex / Math.max(1, points.length - 1)) * width;
    }
    return null;
}

function scaleX(index: number, count: number, left: number, width: number): number {
    return count <= 1 ? left + width / 2 : left + (index / (count - 1)) * width;
}

function scaleY(
    value: number,
    domain: { max: number; min: number },
    top: number,
    height: number
): number {
    return top + ((domain.max - value) / Math.max(1, domain.max - domain.min)) * height;
}

function buildYTicks(maximum: number, count: number): number[] {
    return Array.from({ length: count + 1 }, (_, index) => (maximum * index) / count);
}

function formatRankTransition(beforeRankName: string | null, afterRankName: string | null): string {
    if (beforeRankName === null && afterRankName === null) {
        return "-";
    }
    if (beforeRankName === null) {
        return afterRankName ?? "-";
    }
    if (afterRankName === null || beforeRankName === afterRankName) {
        return beforeRankName;
    }
    return `${beforeRankName}→${afterRankName}`;
}

function formatSeriesDiagnostic(series: BookingCurveReferenceSeries): string {
    if (series.id === "current") {
        return series.missingReason === null ? "現在 cacheあり" : "現在 cacheなし";
    }
    if (series.missingReason !== null) {
        return `${series.label} ${formatMissingReason(series.missingReason)}`;
    }
    return `${series.label} ${series.sourceStayDateCount ?? 0}日`;
}

function formatMissingReason(reason: string): string {
    if (reason.includes("no_matching")) {
        return "一致sourceなし";
    }
    if (reason.includes("no_seasonal_final")) {
        return "着地source不足";
    }
    return "source不足";
}

function formatEmptyReason(reason: string): string {
    switch (reason) {
        case "database-missing":
        case "store-missing":
            return "既存のbooking curve cacheがありません。上の標準グラフはそのまま利用できます。";
        case "version-mismatch":
            return "booking curve cacheのversionが一致しないため読みませんでした。";
        case "indexeddb-unavailable":
            return "browser内のbooking curve cacheを利用できません。";
        case "future-records-only":
            return "画面の最終データ更新日より未来のcacheだけだったため読みませんでした。";
        case "read-failed":
            return "booking curve cacheの読み込みに失敗しました。標準グラフには影響しません。";
        default:
            return "この範囲のcurrent / reference sourceはまだcacheされていません。標準グラフには影響しません。";
    }
}

function formatErrorReason(reason: string): string {
    switch (reason) {
        case "as-of-missing":
        case "as-of-invalid":
            return "画面の最終データ更新日を確認できないため、cacheを推測で結び付けませんでした。";
        case "facility-context-mismatch":
            return "表示中施設と取得した施設が一致しないため停止しました。";
        case "current-settings-response-invalid":
            return "room-group mappingを確認できないため停止しました。";
        default:
            return "基準比較を読み込めませんでした。上の標準グラフや操作には影響しません。";
    }
}

function createMessage(documentHost: Document, text: string, tone: string): HTMLElement {
    const message = documentHost.createElement("p");
    message.setAttribute("data-ra-next-booking-curve-reference-message", tone);
    message.setAttribute("role", tone === "error" ? "alert" : "status");
    message.textContent = text;
    return message;
}

function formatTick(tick: BookingCurveReferenceSeriesPoint["tick"]): string {
    return tick === "ACT" ? "ACT" : `${tick}日前`;
}

function formatRooms(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string): string {
    const compact = value.replace(/-/g, "");
    return /^\d{8}$/u.test(compact)
        ? `${compact.slice(0, 4)}/${compact.slice(4, 6)}/${compact.slice(6, 8)}`
        : value;
}

export function getBookingCurveReferenceStyles(): string {
    return `
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] {
    box-sizing: border-box;
    width: 100%;
    max-width: calc(100vw - 48px);
    min-width: 0;
    margin: 24px 0 8px;
    padding: 20px;
    overflow-x: hidden;
    border: 1px solid #cbd7e2;
    border-radius: 10px;
    background: #fff;
    color: #263a4d;
    font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
    box-shadow: 0 2px 8px rgba(30, 54, 76, .08);
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] *,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] *::before,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] *::after { box-sizing: border-box; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-header] {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] h2 { margin: 0; color: #1f3548; font-size: 20px; line-height: 1.4; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-header] p {
    margin: 2px 0 0; color: #577084; font-size: 12px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-badge] {
    flex: 0 0 auto; padding: 4px 9px; border-radius: 999px; background: #e7f4ee; color: #17624f;
    font-size: 12px; font-weight: 700;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-controls] {
    display: grid; gap: 10px; margin-top: 16px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-control-group] {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; margin: 0; padding: 0; border: 0;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] legend {
    float: left; min-width: 74px; padding: 8px 8px 8px 0; color: #465d70; font-size: 12px; font-weight: 700;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button {
    min-height: 36px; padding: 7px 11px; border: 1px solid #aebfce; border-radius: 999px;
    background: #fff; color: #385064; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button[aria-pressed="true"] {
    border-color: #1268a6; background: #1268a6; color: #fff;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button:focus-visible,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_HITBOX_ATTRIBUTE}]:focus-visible,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE}]:focus-visible {
    outline: 3px solid #d98200; outline-offset: 2px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-meta],
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-note] {
    margin: 11px 0 0; color: #5c7081; font-size: 12px; line-height: 1.65;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-legend] {
    display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 12px; color: #40586b; font-size: 12px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-legend-item] {
    display: inline-flex; align-items: center; gap: 6px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-legend-item] span {
    width: 18px; height: 3px; border-radius: 2px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-legend] {
    color: #8b2f6d; font-weight: 800;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-series-visible="false"] { opacity: .48; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-history] {
    margin-top: 11px; padding: 10px 12px; border: 1px solid #d8e1e8; border-radius: 7px;
    background: #f8fafb; color: #496174;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-history-message] {
    margin: 0; font-size: 12px; line-height: 1.55;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-history="error"] {
    border-color: #e6c7be; background: #fff7f4; color: #82452f;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-grid] {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_PANEL_ATTRIBUTE}] {
    min-width: 0; padding: 14px; border: 1px solid #d6e0e8; border-radius: 8px; background: #fbfcfd;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] h3 { margin: 0; color: #263f52; font-size: 15px; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-diagnostics] {
    margin: 5px 0 0; color: #687d8e; font-size: 11px; line-height: 1.5;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-chart-wrap] {
    position: relative; min-width: 0; margin-top: 8px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_SVG_ATTRIBUTE}] {
    display: block; width: 100%; height: auto; overflow: visible;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] svg text { fill: #607486; font-family: inherit; font-size: 10px; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-grid-line] {
    stroke: #dfe7ed; stroke-width: 1;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-capacity] {
    stroke: #7b8791; stroke-width: 1.2; stroke-dasharray: 2 4;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-guide] {
    stroke: #8b2f6d; stroke-width: 1.2; stroke-dasharray: 3 4; opacity: .52;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_RANK_MARKER_ATTRIBUTE}] {
    fill: #8b2f6d; stroke: #fff; stroke-width: 1.6;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE}] {
    fill: transparent; cursor: pointer;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-tooltip] {
    position: absolute; z-index: 2; top: 8px; left: 8px; width: min(300px, calc(100% - 16px));
    padding: 9px 10px; border: 1px solid #91a8ba; border-radius: 7px; background: rgba(255,255,255,.98);
    box-shadow: 0 5px 16px rgba(25,49,67,.16); color: #2d4659; font-size: 11px; line-height: 1.5;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-tooltip][hidden] { display: none; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-tooltip] ul {
    display: grid; gap: 3px; margin: 5px 0 0; padding: 0; list-style: none;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] details { margin-top: 8px; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] summary { color: #315b79; font-size: 12px; font-weight: 700; cursor: pointer; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] table { width: 100%; margin-top: 7px; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] th,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] td { padding: 4px; border-bottom: 1px solid #dce5eb; text-align: left; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-message] {
    margin: 16px 0 0; padding: 13px 14px; border-radius: 7px; background: #f2f5f7; color: #52697b; font-size: 13px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-message="error"] {
    background: #fff2ef; color: #8c3c25;
}
@media (max-width: 680px) {
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] {
        width: 100%; max-width: calc(100vw - 48px); margin-top: 16px; padding: 14px;
    }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-header] { display: block; }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-badge] { display: inline-block; margin-top: 8px; }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] legend { float: none; flex: 0 0 100%; min-width: 0; padding-bottom: 2px; }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button { min-height: 44px; }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-grid] { grid-template-columns: 1fr; }
}
`;
}
