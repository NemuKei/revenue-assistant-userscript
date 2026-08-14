import type {
    BookingCurveReferencePanel,
    BookingCurveReferenceRankMarker,
    BookingCurveReferenceSeries,
    BookingCurveReferenceSeriesPoint,
    BookingCurveReferenceViewModel
} from "./bookingCurveReferenceModel";
import type { BookingCurveRankHistoryViewState } from "./bookingCurveRankMarkerModel";
import { positionViewportTooltip } from "./viewportTooltipPosition";

export const BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE = "data-ra-next-booking-curve-reference-root";
export const BOOKING_CURVE_REFERENCE_STYLE_ATTRIBUTE = "data-ra-next-booking-curve-reference-style";
export const BOOKING_CURVE_REFERENCE_SCOPE_ATTRIBUTE = "data-ra-next-booking-curve-reference-scope";
export const BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE = "data-ra-next-booking-curve-reference-segment";
export const BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE = "data-ra-next-booking-curve-reference-visibility";
export const BOOKING_CURVE_REFERENCE_PANEL_ATTRIBUTE = "data-ra-next-booking-curve-reference-panel";
export const BOOKING_CURVE_REFERENCE_SVG_ATTRIBUTE = "data-ra-next-booking-curve-reference-svg";
export const BOOKING_CURVE_REFERENCE_X_AXIS_LABEL_ATTRIBUTE =
    "data-ra-next-booking-curve-reference-x-axis-label";
export const BOOKING_CURVE_REFERENCE_HITBOX_ATTRIBUTE = "data-ra-next-booking-curve-reference-hitbox";
export const BOOKING_CURVE_REFERENCE_COMPONENT_ATTRIBUTE = "data-ra-next-booking-curve-reference-component";
export const BOOKING_CURVE_REFERENCE_SERIES_ATTRIBUTE = "data-ra-next-booking-curve-reference-series";
export const BOOKING_CURVE_REFERENCE_AREA_ATTRIBUTE = "data-ra-next-booking-curve-reference-area";
export const BOOKING_CURVE_REFERENCE_ACTIVE_GUIDE_ATTRIBUTE = "data-ra-next-booking-curve-reference-active-guide";
export const BOOKING_CURVE_REFERENCE_ACTIVE_POINT_ATTRIBUTE = "data-ra-next-booking-curve-reference-active-point";
export const BOOKING_CURVE_RANK_MARKER_ATTRIBUTE = "data-ra-next-booking-curve-rank-marker";
export const BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE = "data-ra-next-booking-curve-rank-marker-hitbox";
let bookingCurveChartDescriptionSequence = 0;

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

const DISPLAY_TICKS = new Set<BookingCurveReferenceSeriesPoint["tick"]>([
    360,
    270,
    180,
    90,
    60,
    45,
    30,
    21,
    14,
    7,
    3,
    0,
    "ACT"
]);
const NARROW_DISPLAY_TICKS = new Set<BookingCurveReferenceSeriesPoint["tick"]>([
    360,
    180,
    90,
    30,
    7,
    "ACT"
]);
const SERIES_STYLE = {
    current: { color: "#1f5fbf", dash: "", width: 3 },
    recent: { color: "#b7791f", dash: "8 5", width: 2.4 },
    seasonal: { color: "#c2415d", dash: "2 6", width: 2.4 }
} as const;

type RenderedBookingCurveReferenceRankMarker = BookingCurveReferenceRankMarker & {
    x: number;
    y: number;
};

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
    const header = createHeader(
        root.ownerDocument,
        state.status === "ready"
            ? state.viewModel.scope.label
            : state.status === "empty"
                ? state.controls?.scope.label
                : undefined
    );
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
            header.append(createScopeControls(root.ownerDocument, state.controls));
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
    header.append(createControls(root.ownerDocument, viewModel));
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
    const diagnostics = createSeriesDiagnostics(root.ownerDocument, viewModel.panels);
    const details = createReferenceDetails(root.ownerDocument, meta, note, diagnostics, rankHistory);
    root.replaceChildren(header, legend, grid, details);
}

export function createEmbeddedBookingCurveReference(
    documentHost: Document,
    viewModel: BookingCurveReferenceViewModel,
    rankHistory: BookingCurveRankHistoryViewState,
    options: { narrow: boolean; titleId: string }
): HTMLElement {
    const component = documentHost.createElement("section");
    component.setAttribute(BOOKING_CURVE_REFERENCE_COMPONENT_ATTRIBUTE, viewModel.scope.key);
    component.setAttribute("aria-labelledby", options.titleId);
    const header = createHeader(documentHost, viewModel.scope.label, options.titleId);
    header.append(createControls(documentHost, viewModel, false));
    const meta = documentHost.createElement("p");
    meta.setAttribute("data-ra-next-booking-curve-reference-meta", "");
    meta.textContent = [
        `対象宿泊日 ${formatDate(viewModel.stayDate)}`,
        `データ更新 ${formatDate(viewModel.asOfDate)}`,
        `利用cache ${viewModel.sourceRecordCount}日分`
    ].join(" / ");
    const note = documentHost.createElement("p");
    note.setAttribute("data-ra-next-booking-curve-reference-note", "");
    note.textContent = "欠損位置は推測せず、保存済みsourceと不足tailだけで描画します。";
    const legend = createLegend(documentHost, viewModel);
    const grid = documentHost.createElement("div");
    grid.setAttribute("data-ra-next-booking-curve-reference-grid", "");
    const domain = resolveSharedDomain(viewModel);
    for (const panel of viewModel.panels) {
        grid.append(createPanel(documentHost, panel, viewModel, domain, options.narrow));
    }
    const diagnostics = createSeriesDiagnostics(documentHost, viewModel.panels);
    const details = createReferenceDetails(documentHost, meta, note, diagnostics, createRankHistorySummary(
        documentHost,
        rankHistory,
        viewModel.scope.label
    ));
    component.replaceChildren(header, legend, grid, details);
    return component;
}

function createHeader(documentHost: Document, scopeLabel?: string, titleId = "ra-next-booking-curve-reference-title"): HTMLElement {
    const header = documentHost.createElement("div");
    header.setAttribute("data-ra-next-booking-curve-reference-header", "");
    const titleWrap = documentHost.createElement("div");
    titleWrap.setAttribute("data-ra-next-booking-curve-reference-title-wrap", "");
    const title = documentHost.createElement("h2");
    title.id = titleId;
    title.textContent = scopeLabel === undefined
        ? "ブッキングカーブ"
        : `ブッキングカーブ（${scopeLabel}）`;
    const note = documentHost.createElement("span");
    note.setAttribute("data-ra-next-booking-curve-reference-header-note", "");
    note.textContent = "booking_curve実データ + 参考線";
    titleWrap.append(title, note);
    header.append(titleWrap);
    return header;
}

function createControls(
    documentHost: Document,
    viewModel: BookingCurveReferenceViewModel,
    includeScope = true
): HTMLElement {
    const controls = documentHost.createElement("div");
    controls.setAttribute("data-ra-next-booking-curve-reference-controls", "");
    controls.append(
        ...(includeScope ? [createScopeButtonGroup(documentHost, viewModel)] : []),
        createButtonGroup(
            documentHost,
            "内訳",
            [
                { label: "個人", value: "transient" },
                { label: "団体", value: "group" }
            ],
            viewModel.secondarySegment,
            BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE
        ),
        createButtonGroup(
            documentHost,
            "参考線",
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

function createReferenceDetails(
    documentHost: Document,
    meta: HTMLElement,
    note: HTMLElement,
    diagnostics: HTMLElement,
    rankHistory: HTMLElement
): HTMLElement {
    const details = documentHost.createElement("details");
    details.setAttribute("data-ra-next-booking-curve-reference-details", "");
    const summary = documentHost.createElement("summary");
    summary.textContent = "データ条件とランク履歴";
    const body = documentHost.createElement("div");
    body.setAttribute("data-ra-next-booking-curve-reference-details-body", "");
    body.append(meta, note, diagnostics, rankHistory);
    details.append(summary, body);
    return details;
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
    legend.setAttribute("data-ra-next-booking-curve-reference-control-label", "");
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

function createSeriesDiagnostics(
    documentHost: Document,
    panels: readonly BookingCurveReferencePanel[]
): HTMLElement {
    const diagnostics = documentHost.createElement("div");
    diagnostics.setAttribute("data-ra-next-booking-curve-reference-diagnostics", "");
    for (const panel of panels) {
        const line = documentHost.createElement("p");
        const title = documentHost.createElement("strong");
        title.textContent = panel.title;
        line.append(
            title,
            documentHost.createTextNode(` / ${[
                formatSeriesDiagnostic(panel.current),
                formatSeriesDiagnostic(panel.recent),
                formatSeriesDiagnostic(panel.seasonal)
            ].join(" / ")}`)
        );
        diagnostics.append(line);
    }
    return diagnostics;
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
        const style = SERIES_STYLE[series.id];
        if (style.dash === "") {
            swatch.style.backgroundColor = style.color;
        } else {
            const dashLength = series.id === "recent" ? 8 : 2;
            const gapLength = series.id === "recent" ? 5 : 6;
            swatch.style.backgroundColor = "transparent";
            swatch.style.backgroundImage = `repeating-linear-gradient(90deg, ${style.color} 0 ${dashLength}px, transparent ${dashLength}px ${dashLength + gapLength}px)`;
        }
        item.append(swatch, documentHost.createTextNode(series.visible ? series.label : `${series.label}（非表示）`));
        legend.append(item);
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
    element.append(
        title,
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
    const displayTicks = narrow ? NARROW_DISPLAY_TICKS : DISPLAY_TICKS;
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
    svg.setAttribute("aria-label", `${viewModel.scope.label} ${panel.title}のブッキングカーブ基準比較`);
    const description = documentHost.createElementNS("http://www.w3.org/2000/svg", "desc");
    const descriptionId = `ra-next-booking-curve-reference-chart-description-${++bookingCurveChartDescriptionSequence}`;
    description.setAttribute("id", descriptionId);
    description.textContent = "360日前から0日前とACTまでの現在、直近型、季節型。全値はグラフ下の表でも確認できます。";
    svg.setAttribute("aria-describedby", descriptionId);
    svg.append(description);

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
        if (!displayTicks.has(point.tick)) {
            continue;
        }
        const label = documentHost.createElementNS("http://www.w3.org/2000/svg", "text");
        const labelX = scaleX(index, panel.current.points.length, padding.left, plotWidth) + (point.tick === 0 ? 2 : 0);
        label.setAttribute(BOOKING_CURVE_REFERENCE_X_AXIS_LABEL_ATTRIBUTE, String(point.tick));
        label.setAttribute("x", labelX.toFixed(2));
        label.setAttribute("y", String(height - 12));
        label.setAttribute("text-anchor", point.tick === 0 ? "end" : point.tick === "ACT" ? "start" : "middle");
        label.textContent = formatTick(point.tick);
        svg.append(label);
    }

    const visibleSeries = resolveVisibleSeries(panel, viewModel);
    const currentColor = resolveCurrentSeriesColor(panel.segment);
    const currentArea = documentHost.createElementNS("http://www.w3.org/2000/svg", "path");
    currentArea.setAttribute(
        "d",
        buildAreaPath(panel.current.points, domain, padding, plotWidth, plotHeight)
    );
    currentArea.setAttribute(
        "fill",
        panel.segment === "all" ? "rgba(31, 95, 191, 0.08)" : "rgba(67, 160, 71, 0.10)"
    );
    currentArea.setAttribute(BOOKING_CURVE_REFERENCE_AREA_ATTRIBUTE, panel.segment);
    svg.append(currentArea);
    for (const series of visibleSeries) {
        const style = series.id === "current"
            ? { ...SERIES_STYLE.current, color: currentColor }
            : SERIES_STYLE[series.id];
        const path = documentHost.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", buildLinePath(series.points, domain, padding, plotWidth, plotHeight));
        path.setAttribute(BOOKING_CURVE_REFERENCE_SERIES_ATTRIBUTE, series.id);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", style.color);
        path.setAttribute("stroke-width", String(style.width));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        if (style.dash !== "") {
            path.setAttribute("stroke-dasharray", style.dash);
        }
        svg.append(path);
    }

    const activeGuide = documentHost.createElementNS("http://www.w3.org/2000/svg", "line");
    activeGuide.setAttribute("x1", String(padding.left));
    activeGuide.setAttribute("x2", String(padding.left));
    activeGuide.setAttribute("y1", String(padding.top));
    activeGuide.setAttribute("y2", String(padding.top + plotHeight));
    activeGuide.setAttribute("visibility", "hidden");
    activeGuide.setAttribute(BOOKING_CURVE_REFERENCE_ACTIVE_GUIDE_ATTRIBUTE, "");
    const activePoint = documentHost.createElementNS("http://www.w3.org/2000/svg", "circle");
    activePoint.setAttribute("r", "4.5");
    activePoint.setAttribute("stroke", currentColor);
    activePoint.setAttribute("visibility", "hidden");
    activePoint.setAttribute(BOOKING_CURVE_REFERENCE_ACTIVE_POINT_ATTRIBUTE, "");
    svg.append(activeGuide, activePoint);

    const renderedRankMarkers = buildRenderedBookingCurveRankMarkers(
        panel.rankMarkers,
        panel.current.points,
        domain,
        padding,
        plotWidth,
        plotHeight
    );

    for (const [index, point] of panel.current.points.entries()) {
        if (!visibleSeries.some((series) => series.points[index]?.value !== null)) {
            continue;
        }
        const hitbox = documentHost.createElementNS("http://www.w3.org/2000/svg", "rect");
        const center = scaleX(index, panel.current.points.length, padding.left, plotWidth);
        const previousCenter = index > 0
            ? scaleX(index - 1, panel.current.points.length, padding.left, plotWidth)
            : null;
        const nextCenter = index < panel.current.points.length - 1
            ? scaleX(index + 1, panel.current.points.length, padding.left, plotWidth)
            : null;
        const leftEdge = previousCenter === null ? padding.left : (previousCenter + center) / 2;
        const rightEdge = nextCenter === null ? width - padding.right : (center + nextCenter) / 2;
        const activeMarker = findBookingCurveRankMarkerInRange(
            renderedRankMarkers,
            leftEdge,
            rightEdge,
            center
        );
        hitbox.setAttribute("x", leftEdge.toFixed(2));
        hitbox.setAttribute("y", String(padding.top));
        hitbox.setAttribute("width", Math.max(1, rightEdge - leftEdge).toFixed(2));
        hitbox.setAttribute("height", String(plotHeight));
        hitbox.setAttribute("fill", "transparent");
        hitbox.setAttribute(BOOKING_CURVE_REFERENCE_HITBOX_ATTRIBUTE, String(point.tick));
        hitbox.setAttribute("aria-label", buildTickAriaLabel(point.tick, visibleSeries, index, activeMarker));
        if (displayTicks.has(point.tick as never)) {
            hitbox.setAttribute("tabindex", "0");
        }
        const currentValue = panel.current.points[index]?.value ?? null;
        const show = (cursorClientX: number | null): void => showTooltip(
            tooltip,
            activeGuide,
            activePoint,
            point.tick,
            visibleSeries,
            index,
            center,
            currentValue,
            domain,
            padding,
            plotHeight,
            width,
            cursorClientX,
            activeMarker,
            viewModel.capacityRooms
        );
        const hide = (): void => hideTooltip(tooltip, activeGuide, activePoint);
        hitbox.addEventListener("mouseenter", (event) => show(event.clientX));
        hitbox.addEventListener("focus", () => show(null));
        hitbox.addEventListener("click", () => {
            (hitbox as SVGRectElement & { focus: () => void }).focus();
            show(null);
        });
        hitbox.addEventListener("mouseleave", hide);
        hitbox.addEventListener("blur", hide);
        svg.append(hitbox);
    }
    for (const marker of renderedRankMarkers) {
        const point = documentHost.createElementNS("http://www.w3.org/2000/svg", "circle");
        point.setAttribute(BOOKING_CURVE_RANK_MARKER_ATTRIBUTE, marker.signature);
        point.setAttribute("cx", marker.x.toFixed(2));
        point.setAttribute("cy", marker.y.toFixed(2));
        point.setAttribute("r", "3.5");
        point.setAttribute("fill", currentColor);
        point.setAttribute("stroke", "#fff");
        point.setAttribute("stroke-width", "1.5");
        const hitbox = documentHost.createElementNS("http://www.w3.org/2000/svg", "circle");
        hitbox.setAttribute(BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE, marker.signature);
        hitbox.setAttribute("cx", marker.x.toFixed(2));
        hitbox.setAttribute("cy", marker.y.toFixed(2));
        hitbox.setAttribute("r", "8");
        hitbox.setAttribute("tabindex", "0");
        hitbox.setAttribute("role", "button");
        hitbox.setAttribute("aria-label", buildRankMarkerAriaLabel(marker, viewModel.capacityRooms));
        const show = (cursorClientX: number | null): void => showRankMarkerTooltip(
            tooltip,
            activeGuide,
            activePoint,
            marker,
            width,
            cursorClientX,
            viewModel.capacityRooms
        );
        const hide = (): void => hideTooltip(tooltip, activeGuide, activePoint);
        hitbox.addEventListener("mouseenter", (event) => show(event.clientX));
        hitbox.addEventListener("focus", () => show(null));
        hitbox.addEventListener("click", () => {
            (hitbox as SVGCircleElement & { focus: () => void }).focus();
            show(null);
        });
        hitbox.addEventListener("mouseleave", hide);
        hitbox.addEventListener("blur", hide);
        svg.append(point, hitbox);
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

function buildAreaPath(
    points: readonly BookingCurveReferenceSeriesPoint[],
    domain: { max: number; min: number },
    padding: { left: number; top: number },
    plotWidth: number,
    plotHeight: number
): string {
    const commands: string[] = [];
    let segment: Array<{ x: number; y: number }> = [];
    const closeSegment = (): void => {
        const first = segment[0];
        const last = segment[segment.length - 1];
        if (first === undefined || last === undefined) {
            segment = [];
            return;
        }
        const baseline = padding.top + plotHeight;
        commands.push(
            `M ${first.x.toFixed(2)} ${baseline.toFixed(2)}`,
            ...segment.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
            `L ${last.x.toFixed(2)} ${baseline.toFixed(2)} Z`
        );
        segment = [];
    };
    for (const [index, point] of points.entries()) {
        if (point.value === null) {
            closeSegment();
            continue;
        }
        segment.push({
            x: scaleX(index, points.length, padding.left, plotWidth),
            y: scaleY(point.value, domain, padding.top, plotHeight)
        });
    }
    closeSegment();
    return commands.join(" ");
}

function showTooltip(
    tooltip: HTMLElement,
    guide: SVGLineElement,
    activePoint: SVGCircleElement,
    tick: BookingCurveReferenceSeriesPoint["tick"],
    series: readonly BookingCurveReferenceSeries[],
    index: number,
    x: number,
    currentValue: number | null,
    domain: { max: number; min: number },
    padding: { left: number; top: number },
    plotHeight: number,
    chartViewBoxWidth: number,
    cursorClientX: number | null,
    marker: BookingCurveReferenceRankMarker | null,
    capacityRooms: number | null
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
    appendCapacityTooltipRow(list, currentValue, capacityRooms);
    appendRankMarkerTooltipRows(list, marker);
    tooltip.append(strong, list);
    tooltip.hidden = false;
    showActivePosition(
        guide,
        activePoint,
        x,
        currentValue === null ? null : scaleY(currentValue, domain, padding.top, plotHeight)
    );
    positionBookingCurveTooltip(tooltip, x, chartViewBoxWidth, cursorClientX);
}

function showRankMarkerTooltip(
    tooltip: HTMLElement,
    guide: SVGLineElement,
    activePoint: SVGCircleElement,
    marker: RenderedBookingCurveReferenceRankMarker,
    chartViewBoxWidth: number,
    cursorClientX: number | null,
    capacityRooms: number | null
): void {
    tooltip.replaceChildren();
    const strong = tooltip.ownerDocument.createElement("strong");
    strong.textContent = `${marker.daysBeforeStay}日前`;
    const list = tooltip.ownerDocument.createElement("ul");
    const currentRow = tooltip.ownerDocument.createElement("li");
    currentRow.textContent = `現在: ${formatRooms(marker.value)}室`;
    list.append(currentRow);
    appendCapacityTooltipRow(list, marker.value, capacityRooms);
    appendRankMarkerTooltipRows(list, marker);
    tooltip.append(strong, list);
    tooltip.hidden = false;
    showActivePosition(guide, activePoint, marker.x, marker.y);
    positionBookingCurveTooltip(tooltip, marker.x, chartViewBoxWidth, cursorClientX);
}

function appendCapacityTooltipRow(
    list: HTMLUListElement,
    value: number | null,
    capacityRooms: number | null
): void {
    if (capacityRooms === null) {
        return;
    }
    const row = list.ownerDocument.createElement("li");
    row.textContent = value === null
        ? `上限: ${formatRooms(capacityRooms)}室`
        : `稼働率: ${formatOccupancyRate(value, capacityRooms)} / 上限: ${formatRooms(capacityRooms)}室`;
    list.append(row);
}

function appendRankMarkerTooltipRows(
    list: HTMLUListElement,
    marker: BookingCurveReferenceRankMarker | null
): void {
    if (marker === null) {
        return;
    }
    for (const text of [
        `ランク変更（${marker.daysBeforeStay}日前）: ${formatRankTransition(marker.beforeRankName, marker.afterRankName)}`,
        `反映日: ${formatDate(marker.reflectedDate)}`,
        marker.reflectorName === null ? null : `変更者: ${marker.reflectorName}`
    ].filter((item): item is string => item !== null)) {
        const row = list.ownerDocument.createElement("li");
        row.textContent = text;
        list.append(row);
    }
}

function showActivePosition(
    guide: SVGLineElement,
    activePoint: SVGCircleElement,
    x: number,
    y: number | null
): void {
    guide.setAttribute("visibility", "visible");
    guide.setAttribute("x1", x.toFixed(2));
    guide.setAttribute("x2", x.toFixed(2));
    if (y === null) {
        activePoint.setAttribute("visibility", "hidden");
        return;
    }
    activePoint.setAttribute("visibility", "visible");
    activePoint.setAttribute("cx", x.toFixed(2));
    activePoint.setAttribute("cy", y.toFixed(2));
}

function hideTooltip(
    tooltip: HTMLElement,
    guide: SVGLineElement,
    activePoint: SVGCircleElement
): void {
    tooltip.hidden = true;
    guide.setAttribute("visibility", "hidden");
    activePoint.setAttribute("visibility", "hidden");
}

function positionBookingCurveTooltip(
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
        preferredClientTop: (chartRect?.top ?? panelRect?.top ?? 0) + 10
    });
}

function resolveCurrentSeriesColor(segment: BookingCurveReferencePanel["segment"]): string {
    if (segment === "transient") {
        return "#2f8f5b";
    }
    if (segment === "group") {
        return "#8b6f2a";
    }
    return SERIES_STYLE.current.color;
}

function buildRankMarkerAriaLabel(
    marker: BookingCurveReferenceRankMarker,
    capacityRooms: number | null
): string {
    return [
        `${marker.daysBeforeStay}日前 ランク変更`,
        formatRankTransition(marker.beforeRankName, marker.afterRankName),
        `反映日 ${formatDate(marker.reflectedDate)}`,
        marker.reflectorName === null ? null : `変更者 ${marker.reflectorName}`,
        `${formatRooms(marker.value)}室`,
        capacityRooms === null
            ? null
            : `稼働率 ${formatOccupancyRate(marker.value, capacityRooms)} 上限 ${formatRooms(capacityRooms)}室`
    ].filter((item): item is string => item !== null).join("、");
}

function buildTickAriaLabel(
    tick: BookingCurveReferenceSeriesPoint["tick"],
    series: readonly BookingCurveReferenceSeries[],
    index: number,
    marker: BookingCurveReferenceRankMarker | null
): string {
    return [
        formatTick(tick),
        ...series.map((item) => {
            const point = item.points[index];
            return `${item.label} ${point?.value === null || point === undefined
                ? "データなし"
                : `${formatRooms(point.value)}室${point.interpolated ? " 表示補間" : ""}`}`;
        }),
        marker === null
            ? null
            : [
                `ランク変更 ${formatRankTransition(marker.beforeRankName, marker.afterRankName)}`,
                `反映日 ${formatDate(marker.reflectedDate)}`,
                marker.reflectorName === null ? null : `変更者 ${marker.reflectorName}`
            ].filter((item): item is string => item !== null).join(" ")
    ].filter((item): item is string => item !== null).join("、");
}

function buildRenderedBookingCurveRankMarkers(
    markers: readonly BookingCurveReferenceRankMarker[],
    points: readonly BookingCurveReferenceSeriesPoint[],
    domain: { max: number; min: number },
    padding: { left: number; top: number },
    plotWidth: number,
    plotHeight: number
): RenderedBookingCurveReferenceRankMarker[] {
    const renderedMarkers: RenderedBookingCurveReferenceRankMarker[] = [];
    for (const marker of markers) {
        const x = scaleRankMarkerX(marker.daysBeforeStay, points, padding.left, plotWidth);
        if (x === null) {
            continue;
        }
        renderedMarkers.push({
            ...marker,
            x,
            y: scaleY(marker.value, domain, padding.top, plotHeight)
        });
    }
    return renderedMarkers;
}

function findBookingCurveRankMarkerInRange(
    renderedMarkers: readonly RenderedBookingCurveReferenceRankMarker[],
    leftEdge: number,
    rightEdge: number,
    targetX: number
): BookingCurveReferenceRankMarker | null {
    let matchedMarker: BookingCurveReferenceRankMarker | null = null;
    let smallestDistance = Number.POSITIVE_INFINITY;
    for (const marker of renderedMarkers) {
        if (marker.x < leftEdge || marker.x > rightEdge) {
            continue;
        }
        const distance = Math.abs(marker.x - targetX);
        if (distance <= smallestDistance) {
            matchedMarker = marker;
            smallestDistance = distance;
        }
    }
    return matchedMarker;
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

function formatOccupancyRate(value: number, capacityRooms: number): string {
    const rate = (value / Math.max(1, capacityRooms)) * 100;
    return `${rate.toFixed(1).replace(/\.0$/u, "")}%`;
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
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-sizing: border-box;
    width: 100%;
    max-width: calc(100vw - 48px);
    min-width: 0;
    margin: 0 0 14px;
    padding: 10px 12px 12px;
    overflow: visible;
    border: 1px solid #dfe7f5;
    border-radius: 12px;
    background: #fafcff;
    color: #263a4d;
    font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] *,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] *::before,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] *::after { box-sizing: border-box; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-header] {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-title-wrap] {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] h2 {
    margin: 0; color: #243447; font-size: 14px; line-height: 1.35;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-header-note] {
    display: inline-flex; align-items: center; justify-content: center; padding: 5px 8px;
    border-radius: 999px; background: #eef4ff; color: #5878a5;
    font-size: 11px; font-weight: 700; line-height: 1; white-space: nowrap;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-controls] {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;
    gap: 4px 8px; min-width: 0; margin-left: auto;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-control-group] {
    display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;
    gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-control-label] {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button {
    min-height: 28px; padding: 5px 8px; border: 1px solid #d4deed; border-radius: 999px;
    background: #fff; color: #58708f; font: inherit; font-size: 11px; font-weight: 700;
    line-height: 1; white-space: nowrap; cursor: pointer;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button[aria-pressed="true"] {
    border-color: #9fb7d4; background: #f7fbff; color: #243447;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button:focus-visible,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_HITBOX_ATTRIBUTE}]:focus-visible,
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE}]:focus-visible {
    outline: 3px solid #d98200; outline-offset: 2px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-meta],
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-note] {
    margin: 8px 0 0; color: #5c7081; font-size: 12px; line-height: 1.65;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-legend] {
    display: flex; flex-wrap: wrap; gap: 8px 12px; color: #58708f; font-size: 11px; font-weight: 700;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-legend-item] {
    display: inline-flex; align-items: center; gap: 6px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-legend-item] span {
    width: 18px; height: 3px; border-radius: 2px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-series-visible="false"] { opacity: .48; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-history] {
    margin-top: 9px; padding: 9px 10px; border: 1px solid #d8e1e8; border-radius: 7px;
    background: #f8fafb; color: #496174;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-history-message] {
    margin: 0; font-size: 12px; line-height: 1.55;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-rank-history="error"] {
    border-color: #e6c7be; background: #fff7f4; color: #82452f;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-grid] {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_PANEL_ATTRIBUTE}] {
    display: flex; flex-direction: column; gap: 6px; min-width: 0;
    padding: 10px 10px 8px; border: 1px solid #d8e2f1; border-radius: 10px; background: #fff;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] h3 { margin: 0; color: #243447; font-size: 13px; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-diagnostics] {
    margin-top: 8px; color: #687d8e; font-size: 11px; line-height: 1.5;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-diagnostics] p {
    margin: 3px 0 0;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-chart-wrap] {
    position: relative; min-width: 0;
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
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_ACTIVE_GUIDE_ATTRIBUTE}] {
    stroke: rgba(95, 118, 148, .42); stroke-width: 1.5; stroke-dasharray: 4 4;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_ACTIVE_POINT_ATTRIBUTE}] {
    fill: #fff; stroke-width: 2.5;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_REFERENCE_HITBOX_ATTRIBUTE}] {
    cursor: crosshair;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_RANK_MARKER_ATTRIBUTE}] {
    pointer-events: none;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [${BOOKING_CURVE_RANK_MARKER_HITBOX_ATTRIBUTE}] {
    fill: transparent; cursor: pointer;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-tooltip] {
    position: fixed; z-index: 10;
    width: max-content; max-width: min(300px, calc(100vw - 16px));
    padding: 7px 9px; border: 1px solid #d7e0ef; border-radius: 10px; background: rgba(255,255,255,.96);
    box-shadow: 0 8px 24px rgba(80,98,122,.12); color: #243447; font-size: 11px; line-height: 1.5;
    pointer-events: none;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-tooltip][hidden] { display: none; }
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-tooltip] ul {
    display: grid; gap: 3px; margin: 5px 0 0; padding: 0; list-style: none;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-details] {
    margin-top: 0; padding-top: 8px; border-top: 1px solid #dfe7f5;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-details] > summary {
    color: #456792; font-size: 12px; font-weight: 700; cursor: pointer;
}
[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-details-body] {
    padding-bottom: 2px;
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
        width: 100%; max-width: calc(100vw - 48px); margin-top: 0; padding: 10px;
    }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-header] { align-items: flex-start; }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-controls] {
        width: 100%; justify-content: flex-start; margin-left: 0;
    }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-control-group] { width: 100%; }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] button { min-height: 44px; }
    [${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}] [data-ra-next-booking-curve-reference-grid] { grid-template-columns: 1fr; }
}
`;
}
