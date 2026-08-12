import type { LeadTimeBucketTick } from "../../leadTimeBuckets";
import { positionViewportTooltip } from "../analyze/viewportTooltipPosition";
import {
    formatNextMonthlyProgressCompareLabel,
    formatNextMonthlyProgressYearMonth,
    resolveNextMonthlyProgressPanelPoints,
    type NextMonthlyProgressCompareYearsAgo,
    type NextMonthlyProgressDailyDiffDirection,
    type NextMonthlyProgressDailyDiffItem,
    type NextMonthlyProgressFocusMonthPreview,
    type NextMonthlyProgressMetric,
    type NextMonthlyProgressPreviewPoint,
    type NextMonthlyProgressSecondaryMetric,
    type NextMonthlyProgressViewModel
} from "./monthlyProgressModel";

export const NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE = "data-ra-next-monthly-progress-root";
export const NEXT_MONTHLY_PROGRESS_STYLE_ID = "revenue-assistant-next-monthly-progress-style";
export const NEXT_MONTHLY_PROGRESS_PANEL_ATTRIBUTE = "data-ra-next-monthly-progress-panel";
export const NEXT_MONTHLY_PROGRESS_SVG_ATTRIBUTE = "data-ra-next-monthly-progress-svg";
export const NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE = "data-ra-next-monthly-progress-tooltip";
export const NEXT_MONTHLY_PROGRESS_HITBOX_ATTRIBUTE = "data-ra-next-monthly-progress-hitbox";
export const NEXT_MONTHLY_PROGRESS_DAILY_DIFF_ATTRIBUTE = "data-ra-next-monthly-progress-daily-diff";

const LABEL_TICKS = new Set<LeadTimeBucketTick>([
    360, 270, 180, 120, 90, 60, 45, 30, 21, 14, 7, 3, "ACT"
]);

export interface RenderNextMonthlyProgressViewOptions {
    model: NextMonthlyProgressViewModel;
    onCompareChange(compareYearsAgo: NextMonthlyProgressCompareYearsAgo): void;
    onSecondaryMetricChange(metric: NextMonthlyProgressSecondaryMetric): void;
    root: HTMLElement;
}

export type NextMonthlyProgressLoadingStage = "checking-context" | "loading-current";

export interface RenderNextMonthlyProgressLoadingOptions {
    root: HTMLElement;
    routeYearMonth: string;
    stage: NextMonthlyProgressLoadingStage;
}

interface MonthlyProgressPanelModel {
    compareLabel: string;
    focusMonths: NextMonthlyProgressFocusMonthPreview[];
    metric: NextMonthlyProgressMetric;
    title: string;
    subtitle: string;
}

export function renderNextMonthlyProgressLoadingState(
    options: RenderNextMonthlyProgressLoadingOptions
): void {
    ensureNextMonthlyProgressStyles(options.root.ownerDocument);
    options.root.setAttribute(NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE, "");
    options.root.setAttribute("data-ra-next-monthly-progress-phase", options.stage);
    options.root.setAttribute("data-ra-next-monthly-progress-network-requests", "0");
    options.root.setAttribute("data-ra-next-monthly-progress-write-count", "0");
    options.root.setAttribute("aria-busy", "true");

    const heading = createElement(options.root, "h2", "LTブッキングカーブ");
    const meta = createElement(
        options.root,
        "p",
        `予約日基準 / 対象 ${formatNextMonthlyProgressYearMonth(options.routeYearMonth)} から5か月`
    );
    meta.setAttribute("data-ra-next-monthly-progress-meta", "");

    const status = createElement(
        options.root,
        "p",
        options.stage === "checking-context"
            ? "月次データを準備しています。施設とデータ更新日を確認中です…"
            : "月次データを準備しています。現在月を取得中です…"
    );
    status.setAttribute("data-ra-next-monthly-progress-status", "");
    status.setAttribute("data-ra-next-monthly-progress-loading-status", options.stage);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const note = createElement(
        options.root,
        "p",
        "準備中も標準chartはそのまま利用できます。値が確認できるまで線や金額は表示しません。"
    );
    note.setAttribute("data-ra-next-monthly-progress-note", "");

    const grid = createElement(options.root, "div");
    grid.setAttribute("data-ra-next-monthly-progress-grid", "");
    grid.setAttribute("data-ra-next-monthly-progress-loading-grid", "");
    grid.setAttribute("aria-hidden", "true");
    grid.replaceChildren(
        createLoadingPanel(options.root, "販売客室数"),
        createLoadingPanel(options.root, "販売単価 / 売上")
    );

    options.root.replaceChildren(heading, meta, status, note, grid);
}

export function renderNextMonthlyProgressView(
    options: RenderNextMonthlyProgressViewOptions
): void {
    ensureNextMonthlyProgressStyles(options.root.ownerDocument);
    options.root.setAttribute(NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE, "");
    options.root.setAttribute("data-ra-next-monthly-progress-phase", options.model.progress.phase);
    options.root.setAttribute(
        "data-ra-next-monthly-progress-network-requests",
        String(options.model.progress.networkRequestCount)
    );
    options.root.setAttribute(
        "data-ra-next-monthly-progress-write-count",
        "0"
    );
    options.root.setAttribute("aria-busy", "false");

    const heading = createElement(options.root, "h2", "LTブッキングカーブ");
    const meta = createElement(
        options.root,
        "p",
        `予約日基準 / 観測 ${formatDateKey(options.model.batchDateKey)} / 対象 ${formatNextMonthlyProgressYearMonth(options.model.routeYearMonth)} から ${options.model.focusMonths.length || 5}か月`
    );
    meta.setAttribute("data-ra-next-monthly-progress-meta", "");

    const note = createElement(
        options.root,
        "p",
        `実線 = 現年 / 破線 = ${options.model.compareLabel}。欠損区間は推測でつながず、選択したLTの値と対象日はTooltipで確認できます。`
    );
    note.setAttribute("data-ra-next-monthly-progress-note", "");

    const controls = createElement(options.root, "div");
    controls.setAttribute("data-ra-next-monthly-progress-controls", "");
    controls.replaceChildren(
        createCompareControls(options),
        createMonthLegend(options.root, options.model.focusMonths)
    );

    const status = createElement(options.root, "p", options.model.statusSummary);
    status.setAttribute("data-ra-next-monthly-progress-status", "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const content = createElement(options.root, "div");
    content.setAttribute("data-ra-next-monthly-progress-grid", "");
    if (options.model.emptyState !== null) {
        const empty = createElement(options.root, "div", options.model.emptyState);
        empty.setAttribute("data-ra-next-monthly-progress-empty", "");
        content.replaceChildren(empty);
    } else {
        const roomPanel = createPanel(options.root, {
            compareLabel: options.model.compareLabel,
            focusMonths: options.model.focusMonths,
            metric: "room",
            title: "販売客室数",
            subtitle: `対象 ${options.model.focusMonths.length}か月 / compare ${options.model.compareLabel}`
        });
        const secondaryPanel = createPanel(options.root, {
            compareLabel: options.model.compareLabel,
            focusMonths: options.model.focusMonths,
            metric: options.model.secondaryMetric,
            title: options.model.secondaryMetric === "sales" ? "売上" : "販売単価",
            subtitle: options.model.secondaryMetric === "sales"
                ? `売上 / compare ${options.model.compareLabel}`
                : `売上 ÷ 室数 / compare ${options.model.compareLabel}`
        });
        secondaryPanel.querySelector<HTMLElement>("[data-ra-next-monthly-progress-panel-header]")
            ?.append(createMetricControls(options));
        content.replaceChildren(
            roomPanel,
            secondaryPanel,
            createDailyDiffSection(options.root, options.model)
        );
    }

    const details = createElement(options.root, "details");
    details.setAttribute("data-ra-next-monthly-progress-details", "");
    const detailsSummary = createElement(options.root, "summary", "データの見方");
    const detailsBody = createElement(options.root, "p");
    detailsBody.textContent = [
        "月末をACTとして、同じLT bucketで現年と選択比較年を重ねています。",
        "未来月の未到達bucket、比較snapshot不足、取得失敗は0として描画しません。",
        `保存元: Next ${options.model.progress.nextRecordCount}件 / Classic read-only seed ${options.model.progress.classicSeedCount}件。`
    ].join(" ");
    details.replaceChildren(detailsSummary, detailsBody);

    options.root.replaceChildren(heading, meta, note, controls, status, content, details);
}

function createLoadingPanel(root: HTMLElement, titleText: string): HTMLElement {
    const panel = createElement(root, "section");
    panel.setAttribute("data-ra-next-monthly-progress-loading-panel", "");
    const title = createElement(root, "h3", titleText);
    const skeleton = createElement(root, "div");
    skeleton.setAttribute("data-ra-next-monthly-progress-skeleton", "");
    for (let index = 0; index < 4; index += 1) {
        const line = createElement(root, "span");
        line.style.width = `${88 - (index * 11)}%`;
        skeleton.append(line);
    }
    panel.replaceChildren(title, skeleton);
    return panel;
}

export function ensureNextMonthlyProgressStyles(documentHost: Document): void {
    if (documentHost.getElementById(NEXT_MONTHLY_PROGRESS_STYLE_ID) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.id = NEXT_MONTHLY_PROGRESS_STYLE_ID;
    style.textContent = getNextMonthlyProgressStyles();
    (documentHost.head ?? documentHost.documentElement).append(style);
}

export function removeNextMonthlyProgressArtifacts(documentHost: Document): void {
    documentHost.querySelectorAll<HTMLElement>(`[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}]`)
        .forEach((root) => root.remove());
}

function createCompareControls(options: RenderNextMonthlyProgressViewOptions): HTMLFieldSetElement {
    const group = options.root.ownerDocument.createElement("fieldset");
    group.setAttribute("data-ra-next-monthly-progress-compare-group", "");
    const legend = options.root.ownerDocument.createElement("legend");
    legend.textContent = "比較年（表示月基準）";
    group.append(legend);
    for (const compareYearsAgo of [1, 2, 3] as const) {
        const button = options.root.ownerDocument.createElement("button");
        button.type = "button";
        const compareLabel = formatNextMonthlyProgressCompareLabel(
            options.model.routeYearMonth,
            compareYearsAgo
        );
        button.textContent = compareLabel;
        button.setAttribute(
            "aria-label",
            `${compareLabel}（表示月の${compareYearsAgo}年前）`
        );
        button.setAttribute("aria-pressed", String(options.model.compareYearsAgo === compareYearsAgo));
        button.setAttribute("data-ra-next-monthly-progress-compare", String(compareYearsAgo));
        button.addEventListener("click", () => {
            if (options.model.compareYearsAgo !== compareYearsAgo) {
                options.onCompareChange(compareYearsAgo);
            }
        });
        group.append(button);
    }
    return group;
}

function createMetricControls(options: RenderNextMonthlyProgressViewOptions): HTMLFieldSetElement {
    const group = options.root.ownerDocument.createElement("fieldset");
    group.setAttribute("data-ra-next-monthly-progress-metric-group", "");
    const legend = options.root.ownerDocument.createElement("legend");
    legend.textContent = "表示指標";
    group.append(legend);
    for (const metric of ["unit-price", "sales"] as const) {
        const button = options.root.ownerDocument.createElement("button");
        button.type = "button";
        button.textContent = metric === "unit-price" ? "販売単価" : "売上";
        button.setAttribute("aria-pressed", String(options.model.secondaryMetric === metric));
        button.setAttribute("data-ra-next-monthly-progress-metric", metric);
        button.addEventListener("click", () => {
            if (options.model.secondaryMetric !== metric) {
                options.onSecondaryMetricChange(metric);
            }
        });
        group.append(button);
    }
    return group;
}

function createMonthLegend(
    root: HTMLElement,
    focusMonths: readonly NextMonthlyProgressFocusMonthPreview[]
): HTMLDivElement {
    const legend = createElement(root, "div");
    legend.setAttribute("data-ra-next-monthly-progress-month-legend", "");
    for (const month of focusMonths) {
        const item = createElement(root, "span");
        const swatch = createElement(root, "span");
        swatch.setAttribute("data-ra-next-monthly-progress-swatch", "");
        swatch.style.backgroundColor = month.color;
        const label = createElement(root, "span", month.label);
        item.replaceChildren(swatch, label);
        legend.append(item);
    }
    return legend;
}

function createPanel(root: HTMLElement, panel: MonthlyProgressPanelModel): HTMLElement {
    const section = createElement(root, "section");
    section.setAttribute(NEXT_MONTHLY_PROGRESS_PANEL_ATTRIBUTE, panel.metric);
    const header = createElement(root, "div");
    header.setAttribute("data-ra-next-monthly-progress-panel-header", "");
    const heading = createElement(root, "div");
    const title = createElement(root, "h3", panel.title);
    const subtitle = createElement(root, "p", panel.subtitle);
    heading.replaceChildren(title, subtitle);
    header.replaceChildren(heading);
    const canvas = createElement(root, "div");
    canvas.setAttribute("data-ra-next-monthly-progress-canvas", "");
    const tooltip = createTooltip(root, panel.title);
    canvas.replaceChildren(createPanelSvg(root, panel, tooltip), tooltip);
    section.replaceChildren(header, canvas);
    return section;
}

function createTooltip(root: HTMLElement, panelTitle: string): HTMLDivElement {
    const tooltip = createElement(root, "div");
    tooltip.setAttribute(NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE, "");
    tooltip.id = `ra-next-monthly-progress-tooltip-${panelTitle === "販売客室数" ? "room" : "secondary"}`;
    tooltip.hidden = true;
    tooltip.setAttribute("role", "status");
    tooltip.setAttribute("aria-live", "polite");
    return tooltip;
}

function createPanelSvg(
    root: HTMLElement,
    panel: MonthlyProgressPanelModel,
    tooltip: HTMLDivElement
): SVGSVGElement {
    const documentHost = root.ownerDocument;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = documentHost.createElementNS(svgNamespace, "svg");
    svg.setAttribute(NEXT_MONTHLY_PROGRESS_SVG_ATTRIBUTE, panel.metric);
    svg.setAttribute("viewBox", "0 0 600 240");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${panel.title} LTブッキングカーブ`);

    const width = 600;
    const height = 240;
    const paddingLeft = panel.metric === "room" ? 42 : 66;
    const paddingRight = 14;
    const paddingTop = 12;
    const paddingBottom = 34;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const baselineY = height - paddingBottom;
    const pointsByMonth = panel.focusMonths.map((month) => (
        resolveNextMonthlyProgressPanelPoints(month, panel.metric)
    ));
    const activeTickIndices = getActiveTickIndices(pointsByMonth);
    const xPositions = activeTickIndices.map((_, index) => (
        activeTickIndices.length <= 1
            ? paddingLeft
            : paddingLeft + ((plotWidth * index) / (activeTickIndices.length - 1))
    ));
    const maxValue = Math.max(1, getRoundedMaxValue(pointsByMonth));

    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
        const y = paddingTop + ((1 - ratio) * plotHeight);
        const line = documentHost.createElementNS(svgNamespace, "line");
        line.setAttribute("x1", String(paddingLeft));
        line.setAttribute("x2", String(width - paddingRight));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("data-ra-next-monthly-progress-grid-line", "");
        svg.append(line);
        const label = documentHost.createElementNS(svgNamespace, "text");
        label.setAttribute("x", String(paddingLeft - 7));
        label.setAttribute("y", String(y + 4));
        label.setAttribute("text-anchor", "end");
        label.textContent = formatAxisValue(maxValue * ratio, panel.metric);
        svg.append(label);
    }

    const guide = documentHost.createElementNS(svgNamespace, "line");
    guide.setAttribute("data-ra-next-monthly-progress-active-guide", "");
    guide.setAttribute("visibility", "hidden");
    svg.append(guide);
    const activePoints = panel.focusMonths.map((month) => {
        const point = documentHost.createElementNS(svgNamespace, "circle");
        point.setAttribute("data-ra-next-monthly-progress-active-point", "");
        point.setAttribute("r", "4");
        point.setAttribute("fill", "#fff");
        point.setAttribute("stroke", month.color);
        point.setAttribute("visibility", "hidden");
        svg.append(point);
        return point;
    });

    panel.focusMonths.forEach((month, monthIndex) => {
        const points = pointsByMonth[monthIndex] ?? [];
        const comparePath = buildChartPath(
            points,
            activeTickIndices,
            xPositions,
            maxValue,
            plotHeight,
            paddingTop,
            "compareValue"
        );
        if (comparePath !== "") {
            const path = documentHost.createElementNS(svgNamespace, "path");
            path.setAttribute("d", comparePath);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", withAlpha(month.color, 0.68));
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-dasharray", "7 5");
            path.setAttribute("data-ra-next-monthly-progress-series", "compare");
            svg.append(path);
        }
        const currentPath = buildChartPath(
            points,
            activeTickIndices,
            xPositions,
            maxValue,
            plotHeight,
            paddingTop,
            "currentValue"
        );
        if (currentPath !== "") {
            const path = documentHost.createElementNS(svgNamespace, "path");
            path.setAttribute("d", currentPath);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", month.color);
            path.setAttribute("stroke-width", "3");
            path.setAttribute("data-ra-next-monthly-progress-series", "current");
            svg.append(path);
        }
    });

    activeTickIndices.forEach((pointIndex, displayIndex) => {
        const point = pointsByMonth[0]?.[pointIndex];
        const x = xPositions[displayIndex];
        if (point === undefined || x === undefined) {
            return;
        }
        if (LABEL_TICKS.has(point.tick)) {
            const label = documentHost.createElementNS(svgNamespace, "text");
            label.setAttribute("x", x.toFixed(2));
            label.setAttribute("y", String(height - 10));
            label.setAttribute("text-anchor", resolveLabelAnchor(displayIndex, activeTickIndices.length));
            label.textContent = point.tick === "ACT" ? "ACT" : String(point.tick);
            svg.append(label);
        }
        const previousX = xPositions[displayIndex - 1];
        const nextX = xPositions[displayIndex + 1];
        const left = previousX === undefined ? paddingLeft : (previousX + x) / 2;
        const right = nextX === undefined ? width - paddingRight : (x + nextX) / 2;
        const hitbox = documentHost.createElementNS(svgNamespace, "rect");
        hitbox.setAttribute(NEXT_MONTHLY_PROGRESS_HITBOX_ATTRIBUTE, String(point.tick));
        hitbox.setAttribute("x", left.toFixed(2));
        hitbox.setAttribute("y", String(paddingTop));
        hitbox.setAttribute("width", Math.max(1, right - left).toFixed(2));
        hitbox.setAttribute("height", String(plotHeight));
        hitbox.setAttribute("fill", "transparent");
        hitbox.setAttribute("tabindex", "0");
        hitbox.setAttribute("role", "button");
        hitbox.setAttribute("aria-describedby", tooltip.id);
        hitbox.setAttribute("aria-label", `${panel.title} ${formatTick(point.tick)}`);
        const show = (anchorClientX: number): void => showTooltip({
            activePoints,
            anchorClientX,
            baselineY,
            guide,
            maxValue,
            panel,
            paddingTop,
            plotHeight,
            pointIndex,
            svg,
            tooltip,
            x
        });
        hitbox.addEventListener("pointerenter", (event) => show(event.clientX));
        hitbox.addEventListener("pointermove", (event) => show(event.clientX));
        hitbox.addEventListener("click", (event) => show(event.clientX));
        hitbox.addEventListener("focus", () => {
            const rect = svg.getBoundingClientRect();
            show(rect.left + ((x / width) * rect.width));
        });
        hitbox.addEventListener("pointerleave", () => hideTooltip(tooltip, guide, activePoints));
        hitbox.addEventListener("blur", () => hideTooltip(tooltip, guide, activePoints));
        svg.append(hitbox);
    });
    return svg;
}

function showTooltip(options: {
    activePoints: SVGCircleElement[];
    anchorClientX: number;
    baselineY: number;
    guide: SVGLineElement;
    maxValue: number;
    panel: MonthlyProgressPanelModel;
    paddingTop: number;
    plotHeight: number;
    pointIndex: number;
    svg: SVGSVGElement;
    tooltip: HTMLDivElement;
    x: number;
}): void {
    const referencePoint = resolveNextMonthlyProgressPanelPoints(
        options.panel.focusMonths[0] as NextMonthlyProgressFocusMonthPreview,
        options.panel.metric
    )[options.pointIndex];
    if (referencePoint === undefined) {
        return;
    }
    const title = options.tooltip.ownerDocument.createElement("strong");
    title.textContent = formatTick(referencePoint.tick);
    const table = options.tooltip.ownerDocument.createElement("table");
    const head = options.tooltip.ownerDocument.createElement("thead");
    const headRow = options.tooltip.ownerDocument.createElement("tr");
    for (const label of ["対象月", "現年", options.panel.compareLabel, "対比％"]) {
        const cell = options.tooltip.ownerDocument.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        headRow.append(cell);
    }
    head.append(headRow);
    const body = options.tooltip.ownerDocument.createElement("tbody");
    options.panel.focusMonths.forEach((month, monthIndex) => {
        const point = resolveNextMonthlyProgressPanelPoints(month, options.panel.metric)[options.pointIndex];
        if (point === undefined) {
            return;
        }
        const row = options.tooltip.ownerDocument.createElement("tr");
        const monthCell = options.tooltip.ownerDocument.createElement("td");
        const swatch = options.tooltip.ownerDocument.createElement("span");
        swatch.setAttribute("data-ra-next-monthly-progress-swatch", "");
        swatch.style.backgroundColor = month.color;
        const monthLabel = options.tooltip.ownerDocument.createElement("span");
        monthLabel.textContent = month.label;
        monthCell.append(swatch, monthLabel);
        const currentCell = createTooltipValueCell(
            options.tooltip,
            point.currentValue,
            point.currentDateKey,
            options.panel.metric
        );
        const compareCell = createTooltipValueCell(
            options.tooltip,
            point.compareValue,
            point.compareDateKey,
            options.panel.metric
        );
        const ratioCell = options.tooltip.ownerDocument.createElement("td");
        ratioCell.textContent = formatRatio(point.currentValue, point.compareValue);
        row.replaceChildren(monthCell, currentCell, compareCell, ratioCell);
        body.append(row);

        const activePoint = options.activePoints[monthIndex];
        const y = resolveY(point.currentValue, options.maxValue, options.plotHeight, options.paddingTop);
        if (activePoint !== undefined && y !== null) {
            activePoint.setAttribute("cx", options.x.toFixed(2));
            activePoint.setAttribute("cy", y.toFixed(2));
            activePoint.setAttribute("visibility", "visible");
            activePoint.parentElement?.append(activePoint);
        } else {
            activePoint?.setAttribute("visibility", "hidden");
        }
    });
    table.append(head, body);
    options.tooltip.replaceChildren(title, table);
    options.tooltip.hidden = false;
    options.guide.setAttribute("x1", options.x.toFixed(2));
    options.guide.setAttribute("x2", options.x.toFixed(2));
    options.guide.setAttribute("y1", String(options.paddingTop));
    options.guide.setAttribute("y2", String(options.baselineY));
    options.guide.setAttribute("visibility", "visible");
    const svgRect = options.svg.getBoundingClientRect();
    positionViewportTooltip(options.tooltip, {
        anchorClientX: options.anchorClientX,
        preferredClientTop: svgRect.top + 10
    });
}

function hideTooltip(
    tooltip: HTMLDivElement,
    guide: SVGLineElement,
    activePoints: readonly SVGCircleElement[]
): void {
    tooltip.hidden = true;
    guide.setAttribute("visibility", "hidden");
    activePoints.forEach((point) => point.setAttribute("visibility", "hidden"));
}

function createTooltipValueCell(
    tooltip: HTMLElement,
    value: number | null,
    dateKey: string | null,
    metric: NextMonthlyProgressMetric
): HTMLTableCellElement {
    const cell = tooltip.ownerDocument.createElement("td");
    const valueElement = tooltip.ownerDocument.createElement("span");
    valueElement.textContent = formatMetricValue(value, metric);
    const dateElement = tooltip.ownerDocument.createElement("small");
    dateElement.textContent = dateKey === null ? "対象日 -" : formatDateKey(dateKey);
    cell.replaceChildren(valueElement, dateElement);
    return cell;
}

function createDailyDiffSection(
    root: HTMLElement,
    model: NextMonthlyProgressViewModel
): HTMLElement {
    const section = createElement(root, "section");
    section.setAttribute(NEXT_MONTHLY_PROGRESS_DAILY_DIFF_ATTRIBUTE, "");
    const month = model.focusMonths.find((item) => item.yearMonth === model.routeYearMonth)
        ?? model.focusMonths[0]
        ?? null;
    const heading = createElement(root, "h3", "日次差分");
    const description = createElement(root, "p", month === null
        ? "現在表示月の販売客室数を、隣り合う観測済みLT bucketで比較します。"
        : `${month.label} の販売客室数を、隣り合う観測済みLT bucketで比較します。未来月はgraphとTooltipで確認できます。`);
    const items = month?.dailyDiffItems ?? [];
    const summary = createElement(root, "p", formatDiffSummary(items));
    summary.setAttribute("data-ra-next-monthly-progress-diff-summary", "");
    const changed = items.filter((item) => item.direction === "increase" || item.direction === "decrease");
    const unchanged = items.filter((item) => item.direction === "flat" || item.direction === "unobserved");
    const changedTable = createDailyDiffTable(
        root,
        changed,
        "増加または減少の行はありません。変化なしと未観測は下の展開欄で確認できます。"
    );
    const details = createElement(root, "details");
    const detailsSummary = createElement(root, "summary", `変化なし / 未観測 ${unchanged.length}件`);
    details.replaceChildren(
        detailsSummary,
        createDailyDiffTable(root, unchanged, "変化なしまたは未観測の行はありません。")
    );
    section.replaceChildren(heading, description, summary, changedTable, details);
    return section;
}

function createDailyDiffTable(
    root: HTMLElement,
    items: readonly NextMonthlyProgressDailyDiffItem[],
    emptyMessage: string
): HTMLElement {
    const wrap = createElement(root, "div");
    wrap.setAttribute("data-ra-next-monthly-progress-table-wrap", "");
    const table = createElement(root, "table");
    const head = createElement(root, "thead");
    const headRow = createElement(root, "tr");
    for (const label of ["LT", "対象日", "状態", "差分"]) {
        const cell = createElement(root, "th", label);
        cell.setAttribute("scope", "col");
        headRow.append(cell);
    }
    head.append(headRow);
    const body = createElement(root, "tbody");
    if (items.length === 0) {
        const row = createElement(root, "tr");
        const cell = createElement(root, "td", emptyMessage);
        cell.setAttribute("colspan", "4");
        row.append(cell);
        body.append(row);
    } else {
        for (const item of items) {
            const row = createElement(root, "tr");
            row.setAttribute("data-ra-next-monthly-progress-diff-tone", item.direction);
            row.append(
                createElement(root, "td", formatTick(item.tick)),
                createElement(root, "td", item.dateKey === null ? "-" : formatDateKey(item.dateKey)),
                createElement(root, "td", formatDiffDirection(item)),
                createElement(root, "td", formatDiffDelta(item))
            );
            body.append(row);
        }
    }
    table.append(head, body);
    wrap.append(table);
    return wrap;
}

function buildChartPath(
    points: readonly NextMonthlyProgressPreviewPoint[],
    pointIndices: readonly number[],
    xPositions: readonly number[],
    maxValue: number,
    plotHeight: number,
    paddingTop: number,
    key: "currentValue" | "compareValue"
): string {
    let path = "";
    let penDown = false;
    pointIndices.forEach((pointIndex, displayIndex) => {
        const point = points[pointIndex];
        const x = xPositions[displayIndex];
        const y = point === undefined
            ? null
            : resolveY(point[key], maxValue, plotHeight, paddingTop);
        if (x === undefined || y === null) {
            penDown = false;
            return;
        }
        path += `${penDown ? " L" : " M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        penDown = true;
    });
    return path.trim();
}

function getActiveTickIndices(
    pointsByMonth: readonly (readonly NextMonthlyProgressPreviewPoint[])[]
): number[] {
    const reference = pointsByMonth[0] ?? [];
    const firstActive = reference.findIndex((_, index) => pointsByMonth.some((points) => {
        const point = points[index];
        return point !== undefined && (point.currentValue !== null || point.compareValue !== null);
    }));
    return reference.map((_, index) => index).slice(firstActive < 0 ? 0 : firstActive);
}

function getRoundedMaxValue(
    pointsByMonth: readonly (readonly NextMonthlyProgressPreviewPoint[])[]
): number {
    const maxValue = pointsByMonth.reduce((outerMax, points) => Math.max(
        outerMax,
        ...points.flatMap((point) => [point.currentValue ?? 0, point.compareValue ?? 0])
    ), 0);
    if (maxValue <= 10) {
        return 10;
    }
    const rawStep = maxValue / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalizedStep = rawStep / magnitude;
    const stepUnit = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10]
        .find((candidate) => normalizedStep <= candidate) ?? 10;
    return stepUnit * magnitude * 4;
}

function resolveY(
    value: number | null,
    maxValue: number,
    plotHeight: number,
    paddingTop: number
): number | null {
    return value === null
        ? null
        : paddingTop + ((1 - (value / Math.max(1, maxValue))) * plotHeight);
}

function formatAxisValue(value: number, metric: NextMonthlyProgressMetric): string {
    if (metric === "room") {
        return Math.round(value).toLocaleString("ja-JP");
    }
    if (metric === "sales") {
        return `${Math.round(value / 10_000).toLocaleString("ja-JP")}万`;
    }
    return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatMetricValue(value: number | null, metric: NextMonthlyProgressMetric): string {
    if (value === null) {
        return "-";
    }
    return metric === "room"
        ? `${Math.round(value).toLocaleString("ja-JP")}室`
        : `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatRatio(current: number | null, compare: number | null): string {
    return current === null || compare === null || compare <= 0
        ? "-"
        : `${((current / compare) * 100).toLocaleString("ja-JP", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        })}%`;
}

function formatDiffSummary(items: readonly NextMonthlyProgressDailyDiffItem[]): string {
    const counts: Record<NextMonthlyProgressDailyDiffDirection, number> = {
        increase: 0,
        decrease: 0,
        flat: 0,
        unobserved: 0
    };
    for (const item of items) {
        counts[item.direction] += 1;
    }
    return `増加 ${counts.increase} / 減少 ${counts.decrease} / 変化なし ${counts.flat} / 未観測 ${counts.unobserved}`;
}

function formatDiffDirection(item: NextMonthlyProgressDailyDiffItem): string {
    return item.direction === "increase"
        ? "増加"
        : item.direction === "decrease"
            ? "減少"
            : item.direction === "flat" ? "変化なし" : item.reason;
}

function formatDiffDelta(item: NextMonthlyProgressDailyDiffItem): string {
    return item.delta === null
        ? "-"
        : item.delta === 0
            ? "0室"
            : `${item.delta > 0 ? "+" : ""}${item.delta.toLocaleString("ja-JP")}室`;
}

function formatTick(tick: LeadTimeBucketTick): string {
    return tick === "ACT" ? "ACT" : `${tick}日前`;
}

function formatDateKey(dateKey: string): string {
    return /^\d{8}$/u.test(dateKey)
        ? `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`
        : dateKey;
}

function resolveLabelAnchor(index: number, count: number): "start" | "middle" | "end" {
    return index === 0 ? "start" : index === count - 1 ? "end" : "middle";
}

function withAlpha(hexColor: string, alpha: number): string {
    const normalized = hexColor.replace("#", "");
    if (normalized.length !== 6) {
        return hexColor;
    }
    return `rgba(${Number.parseInt(normalized.slice(0, 2), 16)}, ${Number.parseInt(normalized.slice(2, 4), 16)}, ${Number.parseInt(normalized.slice(4, 6), 16)}, ${alpha})`;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
    root: HTMLElement,
    tagName: K,
    text?: string
): HTMLElementTagNameMap[K] {
    const element = root.ownerDocument.createElement(tagName);
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

function getNextMonthlyProgressStyles(): string {
    return `
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] {
    display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 100%; min-width: 0;
    margin: 14px 0 18px; padding: 12px; overflow: visible; box-sizing: border-box;
    border: 1px solid #dfe7f5; border-radius: 12px; background: #fafcff; color: #263a4d;
    font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] *,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] *::before,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] *::after { box-sizing: border-box; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] h2,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] h3,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] p { margin: 0; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] h2 { font-size: 15px; color: #243447; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] h3 { font-size: 13px; color: #243447; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-meta],
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-note],
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-status] {
    color: #5c7081; font-size: 12px; line-height: 1.6;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-controls],
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-panel-header] {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] fieldset {
    display: inline-flex; flex-wrap: wrap; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] fieldset legend {
    position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0);
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] button {
    min-height: 30px; padding: 5px 9px; border: 1px solid #d4deed; border-radius: 999px;
    background: #fff; color: #58708f; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] button[aria-pressed="true"] {
    border-color: #89a8cf; background: #eaf2ff; color: #243447;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] button:focus-visible,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_HITBOX_ATTRIBUTE}]:focus-visible {
    outline: 3px solid #d98200; outline-offset: 2px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-month-legend] {
    display: flex; flex-wrap: wrap; gap: 7px 12px; color: #58708f; font-size: 11px; font-weight: 700;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-month-legend] > span,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-swatch] + span {
    display: inline-flex; align-items: center; gap: 5px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-swatch] {
    display: inline-block; flex: 0 0 auto; width: 10px; height: 10px; margin-right: 5px; border-radius: 3px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-grid] {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-loading-panel] {
    min-width: 0; min-height: 150px; padding: 10px; border: 1px solid #d8e2f1;
    border-radius: 10px; background: #fff;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-skeleton] {
    display: flex; flex-direction: column; justify-content: flex-end; gap: 13px; height: 105px; margin-top: 8px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-skeleton] > span {
    display: block; height: 9px; border-radius: 999px;
    background: linear-gradient(90deg, #edf2f8 25%, #dfe8f3 50%, #edf2f8 75%);
    background-size: 200% 100%; animation: ra-next-monthly-progress-loading 1.4s ease-in-out infinite;
}
@keyframes ra-next-monthly-progress-loading {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_PANEL_ATTRIBUTE}],
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_DAILY_DIFF_ATTRIBUTE}] {
    min-width: 0; padding: 10px; border: 1px solid #d8e2f1; border-radius: 10px; background: #fff;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_DAILY_DIFF_ATTRIBUTE}] {
    grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-panel-header] p,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_DAILY_DIFF_ATTRIBUTE}] > p {
    margin-top: 3px; color: #687d8e; font-size: 11px; line-height: 1.5;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-canvas] {
    position: relative; min-width: 0; margin-top: 6px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_SVG_ATTRIBUTE}] {
    display: block; width: 100%; height: auto; overflow: visible;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] svg text { fill: #607486; font-family: inherit; font-size: 10px; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-grid-line] {
    stroke: #dfe7ed; stroke-width: 1;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-series] {
    stroke-linejoin: round; stroke-linecap: round;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-active-guide] {
    stroke: rgba(95,118,148,.5); stroke-width: 1.5; stroke-dasharray: 4 4;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-active-point] { stroke-width: 2.5; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_HITBOX_ATTRIBUTE}] { cursor: crosshair; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}] {
    position: fixed; z-index: 2147483646; width: max-content; max-width: min(420px, calc(100vw - 16px));
    padding: 8px 10px; border: 1px solid #d7e0ef; border-radius: 10px; background: rgba(255,255,255,.98);
    box-shadow: 0 8px 24px rgba(80,98,122,.16); color: #243447; font-size: 11px; line-height: 1.4;
    pointer-events: none;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}][hidden] { display: none; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] table { width: 100%; border-collapse: collapse; font-size: 11px; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] th,
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] td { padding: 5px 6px; border-bottom: 1px solid #dce5eb; text-align: left; vertical-align: top; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}] table { margin-top: 5px; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}] td > span:first-child { display: block; font-weight: 700; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}] td small { display: block; color: #718398; white-space: nowrap; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-table-wrap] { max-width: 100%; overflow-x: auto; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-diff-tone="increase"] td:last-child { color: #0a6f4d; font-weight: 700; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-diff-tone="decrease"] td:last-child { color: #a33c34; font-weight: 700; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-empty] {
    grid-column: 1 / -1; padding: 14px; border-radius: 8px; background: #f2f5f7; color: #52697b; font-size: 13px;
}
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] details { margin-top: 2px; color: #5c7081; font-size: 12px; line-height: 1.6; }
[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] summary { color: #315b79; font-weight: 700; cursor: pointer; }
@media (max-width: 680px) {
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] { padding: 10px; }
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-grid] { grid-template-columns: 1fr; }
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] button { min-height: 44px; padding-inline: 11px; }
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-controls],
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-panel-header] { align-items: flex-start; }
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] fieldset { width: 100%; }
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}] { font-size: 10px; }
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}] th,
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [${NEXT_MONTHLY_PROGRESS_TOOLTIP_ATTRIBUTE}] td { padding: 4px; }
}
@media (prefers-reduced-motion: reduce) {
    [${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}] [data-ra-next-monthly-progress-skeleton] > span {
        animation: none;
    }
}
`;
}
