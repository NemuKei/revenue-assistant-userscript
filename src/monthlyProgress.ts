import {
    persistMonthlyBookingCurveSnapshot,
    readLatestMonthlyBookingCurveSnapshot,
    type MonthlyBookingCurveSnapshotRecord
} from "./monthlyProgressIndexedDb";
import {
    buildMonthlyProgressLeadTimeSeries,
    getYearMonthBounds,
    summarizeMonthlyProgressLeadTimeSeries,
    type MonthlyProgressLeadTimePoint,
    type MonthlyProgressLeadTimeSeries
} from "./monthlyProgressLeadTime";
import { LEAD_TIME_BUCKET_TICKS, LEAD_TIME_BUCKET_VISIBLE_TICKS } from "./leadTimeBuckets";

const MONTHLY_PROGRESS_ROUTE_PATTERN = /^\/monthly-progress\/(\d{4})-(\d{2})$/;
const MONTHLY_PROGRESS_FEATURE_STORAGE_KEY = "revenue-assistant:feature:monthly-progress:enabled";
const MONTHLY_PROGRESS_STORAGE_PREFIX = "revenue-assistant:monthly-progress:v1:";
const MONTHLY_PROGRESS_PREVIEW_STYLE_ID = "revenue-assistant-monthly-progress-preview-style";
const MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE = "data-ra-monthly-progress-preview-root";
const MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE = "data-ra-monthly-progress-preview-meta";
const MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE = "data-ra-monthly-progress-preview-note";
const MONTHLY_PROGRESS_PREVIEW_LEGEND_ATTRIBUTE = "data-ra-monthly-progress-preview-legend";
const MONTHLY_PROGRESS_PREVIEW_LEGEND_ITEM_ATTRIBUTE = "data-ra-monthly-progress-preview-legend-item";
const MONTHLY_PROGRESS_PREVIEW_SUMMARY_ATTRIBUTE = "data-ra-monthly-progress-preview-summary";
const MONTHLY_PROGRESS_PREVIEW_SUMMARY_LABEL_ATTRIBUTE = "data-ra-monthly-progress-preview-summary-label";
const MONTHLY_PROGRESS_PREVIEW_SUMMARY_VALUE_ATTRIBUTE = "data-ra-monthly-progress-preview-summary-value";
const MONTHLY_PROGRESS_PREVIEW_CANVAS_ATTRIBUTE = "data-ra-monthly-progress-preview-canvas";
const MONTHLY_PROGRESS_PREVIEW_SVG_ATTRIBUTE = "data-ra-monthly-progress-preview-svg";
const MONTHLY_PROGRESS_RESERVATION_CHART_TEST_ID = "chart-content-numberOfRoomsSold-dateOfReservationBasis";

export interface MonthlyProgressRouteState {
    year: string;
    month: string;
    yearMonth: string;
}

export interface MonthlyProgressStorageAdapter {
    namespacePrefix: string;
    readJson<T>(key: string): T | undefined;
    writeJson(key: string, value: unknown): boolean;
    remove(key: string): void;
    clearNamespace(): number;
}

interface MonthlyProgressSyncOptions {
    scriptName: string;
    href: string;
    routeState: MonthlyProgressRouteState;
    batchDateKey: string;
    resolveFacilityCacheKey: () => Promise<string>;
}

interface MonthlyProgressResolvedContext extends MonthlyProgressSyncOptions {
    facilityCacheKey: string;
}

let activeMonthlyProgressSignature = "";
let activeMonthlyProgressContext: MonthlyProgressResolvedContext | null = null;
let monthlyProgressObserver: MutationObserver | null = null;
let monthlyProgressRenderQueued = false;
let latestMonthlyProgressPreviewSignature = "";

export function getMonthlyProgressRouteState(pathname: string): MonthlyProgressRouteState | null {
    const match = MONTHLY_PROGRESS_ROUTE_PATTERN.exec(pathname);
    if (match === null) {
        return null;
    }

    const year = match[1];
    const month = match[2];
    if (year === undefined || month === undefined) {
        return null;
    }

    return {
        year,
        month,
        yearMonth: `${year}${month}`
    };
}

export function isMonthlyProgressFeatureEnabled(): boolean {
    try {
        return window.localStorage.getItem(MONTHLY_PROGRESS_FEATURE_STORAGE_KEY) !== "0";
    } catch {
        return true;
    }
}

export function createMonthlyProgressStorageAdapter(facilityCacheKey: string): MonthlyProgressStorageAdapter {
    const namespacePrefix = `${MONTHLY_PROGRESS_STORAGE_PREFIX}${facilityCacheKey}:`;

    return {
        namespacePrefix,
        readJson<T>(key: string): T | undefined {
            try {
                const raw = window.localStorage.getItem(`${namespacePrefix}${key}`);
                if (raw === null) {
                    return undefined;
                }

                return JSON.parse(raw) as T;
            } catch {
                return undefined;
            }
        },
        writeJson(key: string, value: unknown): boolean {
            try {
                window.localStorage.setItem(`${namespacePrefix}${key}`, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },
        remove(key: string): void {
            try {
                window.localStorage.removeItem(`${namespacePrefix}${key}`);
            } catch {
                // Ignore storage cleanup failures.
            }
        },
        clearNamespace(): number {
            try {
                const keysToRemove: string[] = [];
                for (let index = 0; index < window.localStorage.length; index += 1) {
                    const key = window.localStorage.key(index);
                    if (key !== null && key.startsWith(namespacePrefix)) {
                        keysToRemove.push(key);
                    }
                }

                for (const key of keysToRemove) {
                    window.localStorage.removeItem(key);
                }

                return keysToRemove.length;
            } catch {
                return 0;
            }
        }
    };
}

export function syncMonthlyProgressPage(options: MonthlyProgressSyncOptions): void {
    const enabled = isMonthlyProgressFeatureEnabled();
    const nextSignature = `${options.href}:${options.routeState.yearMonth}:${options.batchDateKey}:${enabled ? "enabled" : "disabled"}`;
    if (nextSignature === activeMonthlyProgressSignature) {
        return;
    }

    activeMonthlyProgressSignature = nextSignature;

    if (!enabled) {
        cleanupMonthlyProgressPage();
        console.info(`[${options.scriptName}] monthly-progress feature disabled`, {
            href: options.href,
            yearMonth: options.routeState.yearMonth,
            killSwitchStorageKey: MONTHLY_PROGRESS_FEATURE_STORAGE_KEY
        });
        return;
    }

    void options.resolveFacilityCacheKey()
        .then((facilityCacheKey) => {
            if (activeMonthlyProgressSignature !== nextSignature) {
                return;
            }

            const resolvedContext: MonthlyProgressResolvedContext = {
                ...options,
                facilityCacheKey
            };
            activeMonthlyProgressContext = resolvedContext;
            ensureMonthlyProgressObserver();

            const storage = createMonthlyProgressStorageAdapter(facilityCacheKey);
            void persistMonthlyBookingCurveSnapshot({
                scriptName: options.scriptName,
                facilityCacheKey,
                yearMonth: options.routeState.yearMonth,
                batchDateKey: options.batchDateKey
            }).catch((error: unknown) => {
                console.warn(`[${options.scriptName}] failed to persist monthly-progress booking-curve snapshot`, {
                    href: options.href,
                    yearMonth: options.routeState.yearMonth,
                    batchDateKey: options.batchDateKey,
                    facilityCacheKey,
                    error
                });
            });

            void syncMonthlyProgressPreview(resolvedContext);

            console.info(`[${options.scriptName}] monthly-progress route ready`, {
                href: options.href,
                yearMonth: options.routeState.yearMonth,
                batchDateKey: options.batchDateKey,
                facilityCacheKey,
                storageNamespace: storage.namespacePrefix,
                killSwitchStorageKey: MONTHLY_PROGRESS_FEATURE_STORAGE_KEY
            });
        })
        .catch((error: unknown) => {
            console.warn(`[${options.scriptName}] failed to prepare monthly-progress route`, {
                href: options.href,
                yearMonth: options.routeState.yearMonth,
                error
            });
        });
}

export function cleanupMonthlyProgressPage(): void {
    activeMonthlyProgressSignature = "";
    activeMonthlyProgressContext = null;
    latestMonthlyProgressPreviewSignature = "";
    cleanupMonthlyProgressObserver();
    cleanupMonthlyProgressPreview();
}

export function getMonthlyProgressFeatureStorageKey(): string {
    return MONTHLY_PROGRESS_FEATURE_STORAGE_KEY;
}

function ensureMonthlyProgressObserver(): void {
    if (monthlyProgressObserver !== null) {
        return;
    }

    const root = document.querySelector("#root") ?? document.body;
    monthlyProgressObserver = new MutationObserver((mutations) => {
        if (mutations.every((mutation) => isMonthlyProgressManagedMutation(mutation))) {
            return;
        }

        queueMonthlyProgressPreviewSync();
    });
    monthlyProgressObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-selected"],
        childList: true,
        subtree: true
    });
}

function cleanupMonthlyProgressObserver(): void {
    if (monthlyProgressObserver === null) {
        return;
    }

    monthlyProgressObserver.disconnect();
    monthlyProgressObserver = null;
    monthlyProgressRenderQueued = false;
}

function isMonthlyProgressManagedMutation(mutation: MutationRecord): boolean {
    if (mutation.type === "attributes") {
        return isMonthlyProgressManagedNode(mutation.target);
    }

    if (isMonthlyProgressManagedNode(mutation.target)) {
        return true;
    }

    const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return changedNodes.length > 0 && changedNodes.every((node) => isMonthlyProgressManagedNode(node));
}

function isMonthlyProgressManagedNode(node: Node | null): boolean {
    if (node === null) {
        return false;
    }

    if (node instanceof Element) {
        return node.matches(`#${MONTHLY_PROGRESS_PREVIEW_STYLE_ID}, [${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`)
            || node.closest(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`) !== null;
    }

    return node.parentElement?.closest(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`) !== null;
}

function queueMonthlyProgressPreviewSync(): void {
    if (monthlyProgressRenderQueued) {
        return;
    }

    monthlyProgressRenderQueued = true;
    window.requestAnimationFrame(() => {
        monthlyProgressRenderQueued = false;
        const context = activeMonthlyProgressContext;
        if (context === null) {
            cleanupMonthlyProgressPreview();
            return;
        }

        void syncMonthlyProgressPreview(context);
    });
}

async function syncMonthlyProgressPreview(context: MonthlyProgressResolvedContext): Promise<void> {
    try {
        const snapshot = await readLatestMonthlyBookingCurveSnapshot(context.facilityCacheKey, context.routeState.yearMonth);
        if (snapshot === undefined) {
            cleanupMonthlyProgressPreview();
            return;
        }

        const monthBounds = getYearMonthBounds(snapshot.yearMonth);
        if (monthBounds === null) {
            cleanupMonthlyProgressPreview();
            return;
        }

        const roomSeries = buildMonthlyProgressLeadTimeSeries(
            snapshot.payload,
            "room",
            monthBounds.firstDateKey,
            snapshot.batchDateKey
        );
        const salesSeries = buildMonthlyProgressLeadTimeSeries(
            snapshot.payload,
            "sales",
            monthBounds.firstDateKey,
            snapshot.batchDateKey
        );
        console.info(`[${context.scriptName}] monthly-progress LT preview ready`, {
            href: context.href,
            yearMonth: context.routeState.yearMonth,
            snapshotBatchDateKey: snapshot.batchDateKey,
            anchorDateKey: monthBounds.firstDateKey,
            room: summarizeMonthlyProgressLeadTimeSeries(roomSeries),
            sales: summarizeMonthlyProgressLeadTimeSeries(salesSeries)
        });

        renderMonthlyProgressPreview({
            context,
            snapshot,
            anchorDateKey: monthBounds.firstDateKey,
            roomSeries
        });
    } catch (error: unknown) {
        cleanupMonthlyProgressPreview();
        console.warn(`[${context.scriptName}] failed to prepare monthly-progress LT preview`, {
            href: context.href,
            yearMonth: context.routeState.yearMonth,
            facilityCacheKey: context.facilityCacheKey,
            error
        });
    }
}

function renderMonthlyProgressPreview(options: {
    context: MonthlyProgressResolvedContext;
    snapshot: MonthlyBookingCurveSnapshotRecord;
    anchorDateKey: string;
    roomSeries: MonthlyProgressLeadTimeSeries;
}): void {
    const chart = document.querySelector<HTMLElement>(`[data-testid="${MONTHLY_PROGRESS_RESERVATION_CHART_TEST_ID}"]`);
    if (chart === null) {
        cleanupMonthlyProgressPreview();
        return;
    }

    const chartContainer = chart.parentElement;
    const chartGroup = chartContainer?.parentElement;
    if (!(chartContainer instanceof HTMLElement) || !(chartGroup instanceof HTMLElement)) {
        cleanupMonthlyProgressPreview();
        return;
    }

    ensureMonthlyProgressPreviewStyles();

    const visiblePoints = LEAD_TIME_BUCKET_TICKS
        .filter((tick) => LEAD_TIME_BUCKET_VISIBLE_TICKS.has(tick))
        .map((tick) => options.roomSeries.points.find((point) => point.tick === tick) ?? null);
    const previewSignature = JSON.stringify({
        route: options.context.routeState.yearMonth,
        batch: options.context.batchDateKey,
        snapshotBatch: options.snapshot.batchDateKey,
        points: visiblePoints.map((point) => point === null ? null : [point.tick, point.thisYearValue, point.lastYearValue])
    });

    const existingRoot = chartGroup.querySelector<HTMLElement>(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`);
    if (existingRoot !== null && latestMonthlyProgressPreviewSignature === previewSignature && existingRoot.previousElementSibling === chartContainer) {
        return;
    }

    latestMonthlyProgressPreviewSignature = previewSignature;

    const root = existingRoot ?? document.createElement("section");
    root.setAttribute(MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE, "");

    const heading = document.createElement("h3");
    heading.textContent = "LTブッキングカーブ";

    const meta = document.createElement("p");
    meta.setAttribute(MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE, "");
    meta.textContent = `予約日基準 / 観測 ${formatDateKey(options.snapshot.batchDateKey)} / anchor ${formatDateKey(options.anchorDateKey)}`;

    const note = document.createElement("p");
    note.setAttribute(MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE, "");
    note.textContent = "日別と同じ LT バケット集約で、現年と前年同時点の販売客室数を 2 本線で表示。";

    const legend = document.createElement("div");
    legend.setAttribute(MONTHLY_PROGRESS_PREVIEW_LEGEND_ATTRIBUTE, "");
    legend.replaceChildren(
        createMonthlyProgressLegendItem("現年", "this-year"),
        createMonthlyProgressLegendItem("前年", "last-year")
    );

    const summary = document.createElement("div");
    summary.setAttribute(MONTHLY_PROGRESS_PREVIEW_SUMMARY_ATTRIBUTE, "");
    summary.replaceChildren(
        createMonthlyProgressSummaryItem("ACT 現年", formatMetricValue(resolveLeadTimeSeriesActValue(options.roomSeries, "thisYear"))),
        createMonthlyProgressSummaryItem("ACT 前年", formatMetricValue(resolveLeadTimeSeriesActValue(options.roomSeries, "lastYear"))),
        createMonthlyProgressSummaryItem("終点", resolveLeadTimeSeriesActDateLabel(options.roomSeries))
    );

    const canvas = document.createElement("div");
    canvas.setAttribute(MONTHLY_PROGRESS_PREVIEW_CANVAS_ATTRIBUTE, "");
    canvas.replaceChildren(createMonthlyProgressPreviewSvg(visiblePoints));

    root.replaceChildren(heading, meta, note, legend, summary, canvas);

    if (root.parentElement !== chartGroup || root.previousElementSibling !== chartContainer) {
        root.remove();
        chartContainer.insertAdjacentElement("afterend", root);
    }
}

function createMonthlyProgressLegendItem(label: string, tone: "this-year" | "last-year"): HTMLSpanElement {
    const item = document.createElement("span");
    item.setAttribute(MONTHLY_PROGRESS_PREVIEW_LEGEND_ITEM_ATTRIBUTE, tone);
    item.textContent = label;
    return item;
}

function createMonthlyProgressSummaryItem(label: string, value: string): HTMLDivElement {
    const item = document.createElement("div");
    const labelElement = document.createElement("div");
    labelElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_SUMMARY_LABEL_ATTRIBUTE, "");
    labelElement.textContent = label;

    const valueElement = document.createElement("div");
    valueElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_SUMMARY_VALUE_ATTRIBUTE, "");
    valueElement.textContent = value;

    item.append(labelElement, valueElement);
    return item;
}

function createMonthlyProgressPreviewSvg(points: Array<MonthlyProgressLeadTimePoint | null>): SVGSVGElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute(MONTHLY_PROGRESS_PREVIEW_SVG_ATTRIBUTE, "");
    svg.setAttribute("viewBox", "0 0 720 220");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "月次実績 LT ブッキングカーブ");

    const width = 720;
    const height = 220;
    const paddingLeft = 46;
    const paddingRight = 16;
    const paddingTop = 16;
    const paddingBottom = 34;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const maxValue = getMonthlyProgressPreviewRoundedMaxValue(points);
    const safeMaxValue = Math.max(1, maxValue);
    const baselineY = height - paddingBottom;
    const samples = points.map((point, index) => {
        const x = points.length === 1
            ? paddingLeft
            : paddingLeft + ((plotWidth * index) / Math.max(1, points.length - 1));
        const thisYearY = point?.thisYearValue === null || point?.thisYearValue === undefined
            ? null
            : paddingTop + ((1 - (point.thisYearValue / safeMaxValue)) * plotHeight);
        const lastYearY = point?.lastYearValue === null || point?.lastYearValue === undefined
            ? null
            : paddingTop + ((1 - (point.lastYearValue / safeMaxValue)) * plotHeight);
        return {
            point,
            x,
            thisYearY,
            lastYearY
        };
    });

    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
        const y = paddingTop + ((1 - ratio) * plotHeight);
        const line = document.createElementNS(svgNamespace, "line");
        line.setAttribute("x1", String(paddingLeft));
        line.setAttribute("x2", String(width - paddingRight));
        line.setAttribute("y1", y.toFixed(2));
        line.setAttribute("y2", y.toFixed(2));
        line.setAttribute("stroke", ratio === 0 ? "#cfd8e7" : "#e7edf7");
        line.setAttribute("stroke-width", "1");
        svg.append(line);

        const label = document.createElementNS(svgNamespace, "text");
        label.setAttribute("x", String(paddingLeft - 6));
        label.setAttribute("y", String(y + 3));
        label.setAttribute("text-anchor", "end");
        label.setAttribute("fill", "#8a9cb4");
        label.setAttribute("font-size", "10");
        label.textContent = formatMetricValue(Math.round(safeMaxValue * ratio));
        svg.append(label);
    }

    const xAxis = document.createElementNS(svgNamespace, "line");
    xAxis.setAttribute("x1", String(paddingLeft));
    xAxis.setAttribute("x2", String(width - paddingRight));
    xAxis.setAttribute("y1", String(baselineY));
    xAxis.setAttribute("y2", String(baselineY));
    xAxis.setAttribute("stroke", "#cfd8e7");
    xAxis.setAttribute("stroke-width", "1");
    svg.append(xAxis);

    const thisYearAreaPath = buildMonthlyProgressPreviewAreaPath(samples, baselineY, "thisYearY");
    if (thisYearAreaPath !== "") {
        const area = document.createElementNS(svgNamespace, "path");
        area.setAttribute("d", thisYearAreaPath);
        area.setAttribute("fill", "rgba(31, 95, 191, 0.10)");
        svg.append(area);
    }

    const lastYearPath = buildMonthlyProgressPreviewLinePath(samples, "lastYearY");
    if (lastYearPath !== "") {
        const path = document.createElementNS(svgNamespace, "path");
        path.setAttribute("d", lastYearPath);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#93a4b8");
        path.setAttribute("stroke-width", "3");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        svg.append(path);
    }

    const thisYearPath = buildMonthlyProgressPreviewLinePath(samples, "thisYearY");
    if (thisYearPath !== "") {
        const path = document.createElementNS(svgNamespace, "path");
        path.setAttribute("d", thisYearPath);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#1f5fbf");
        path.setAttribute("stroke-width", "3.5");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        svg.append(path);
    }

    for (const sample of samples) {
        const tickLine = document.createElementNS(svgNamespace, "line");
        tickLine.setAttribute("x1", sample.x.toFixed(2));
        tickLine.setAttribute("x2", sample.x.toFixed(2));
        tickLine.setAttribute("y1", String(baselineY));
        tickLine.setAttribute("y2", String(baselineY + 5));
        tickLine.setAttribute("stroke", "#9fb0c8");
        tickLine.setAttribute("stroke-width", "1");
        svg.append(tickLine);

        const label = document.createElementNS(svgNamespace, "text");
        label.setAttribute("x", sample.x.toFixed(2));
        label.setAttribute("y", String(height - 10));
        label.setAttribute("text-anchor", resolveMonthlyProgressPreviewLabelAnchor(sample.point?.tick ?? "ACT", sample.x, paddingLeft, width - paddingRight));
        label.setAttribute("fill", "#70839c");
        label.setAttribute("font-size", "10");
        label.textContent = formatMonthlyProgressPreviewTickLabel(sample.point?.tick ?? "ACT");
        svg.append(label);

        if (sample.lastYearY !== null) {
            const point = document.createElementNS(svgNamespace, "circle");
            point.setAttribute("cx", sample.x.toFixed(2));
            point.setAttribute("cy", sample.lastYearY.toFixed(2));
            point.setAttribute("r", "3");
            point.setAttribute("fill", "#ffffff");
            point.setAttribute("stroke", "#93a4b8");
            point.setAttribute("stroke-width", "2");
            svg.append(point);
        }

        if (sample.thisYearY !== null) {
            const point = document.createElementNS(svgNamespace, "circle");
            point.setAttribute("cx", sample.x.toFixed(2));
            point.setAttribute("cy", sample.thisYearY.toFixed(2));
            point.setAttribute("r", "3.2");
            point.setAttribute("fill", "#ffffff");
            point.setAttribute("stroke", "#1f5fbf");
            point.setAttribute("stroke-width", "2.2");
            svg.append(point);
        }
    }

    return svg;
}

function buildMonthlyProgressPreviewLinePath(
    samples: Array<{ x: number; thisYearY: number | null; lastYearY: number | null }>,
    key: "thisYearY" | "lastYearY"
): string {
    let path = "";
    for (const sample of samples) {
        const y = sample[key];
        if (y === null) {
            continue;
        }

        path += path === "" ? `M ${sample.x.toFixed(2)} ${y.toFixed(2)}` : ` L ${sample.x.toFixed(2)} ${y.toFixed(2)}`;
    }

    return path;
}

function buildMonthlyProgressPreviewAreaPath(
    samples: Array<{ x: number; thisYearY: number | null }>,
    baselineY: number,
    key: "thisYearY"
): string {
    const plotted = samples.filter((sample) => sample[key] !== null);
    if (plotted.length === 0) {
        return "";
    }

    const first = plotted[0];
    const last = plotted[plotted.length - 1];
    if (first === undefined || last === undefined || first[key] === null || last[key] === null) {
        return "";
    }

    let path = `M ${first.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${first[key].toFixed(2)}`;
    for (const sample of plotted.slice(1)) {
        if (sample[key] === null) {
            continue;
        }

        path += ` L ${sample.x.toFixed(2)} ${sample[key].toFixed(2)}`;
    }

    path += ` L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
    return path;
}

function getMonthlyProgressPreviewRoundedMaxValue(points: Array<MonthlyProgressLeadTimePoint | null>): number {
    const maxValue = points.reduce((currentMax, point) => {
        const candidate = Math.max(point?.thisYearValue ?? 0, point?.lastYearValue ?? 0);
        return Math.max(currentMax, candidate);
    }, 0);

    if (maxValue <= 10) {
        return 10;
    }

    const magnitude = 10 ** Math.floor(Math.log10(maxValue));
    return Math.ceil(maxValue / magnitude) * magnitude;
}

function resolveMonthlyProgressPreviewLabelAnchor(tick: number | "ACT", x: number, minX: number, maxX: number): "start" | "middle" | "end" {
    if (tick === LEAD_TIME_BUCKET_TICKS[0] || x <= minX + 16) {
        return "start";
    }

    if (tick === "ACT" || x >= maxX - 16) {
        return "end";
    }

    return "middle";
}

function formatMonthlyProgressPreviewTickLabel(tick: number | "ACT"): string {
    return tick === "ACT" ? "ACT" : `${tick}`;
}

function resolveLeadTimeSeriesActValue(series: MonthlyProgressLeadTimeSeries, variant: "thisYear" | "lastYear"): number | null {
    const actPoint = series.points.find((point) => point.tick === "ACT");
    if (actPoint === undefined) {
        return null;
    }

    return variant === "thisYear" ? actPoint.thisYearValue : actPoint.lastYearValue;
}

function resolveLeadTimeSeriesActDateLabel(series: MonthlyProgressLeadTimeSeries): string {
    const actPoint = series.points.find((point) => point.tick === "ACT");
    if (actPoint?.targetDateKey === null || actPoint?.targetDateKey === undefined) {
        return "-";
    }

    return formatDateKey(actPoint.targetDateKey);
}

function cleanupMonthlyProgressPreview(): void {
    document.querySelector<HTMLElement>(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`)?.remove();
    document.getElementById(MONTHLY_PROGRESS_PREVIEW_STYLE_ID)?.remove();
}

function ensureMonthlyProgressPreviewStyles(): void {
    if (document.getElementById(MONTHLY_PROGRESS_PREVIEW_STYLE_ID) !== null) {
        return;
    }

    const style = document.createElement("style");
    style.id = MONTHLY_PROGRESS_PREVIEW_STYLE_ID;
    style.textContent = `
      [${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}] {
        margin-top: 16px;
        border: 1px solid #d7e1f0;
        border-radius: 12px;
        background: linear-gradient(180deg, #fbfdff 0%, #f2f7fc 100%);
        padding: 16px 18px;
        box-shadow: 0 10px 24px rgba(49, 94, 148, 0.08);
      }
      [${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}] h3 {
        margin: 0;
        color: #183b63;
        font-size: 16px;
        font-weight: 700;
      }
      [${MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE}] {
        margin: 6px 0 0;
        color: #55708f;
        font-size: 12px;
        line-height: 1.5;
      }
      [${MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE}] {
        margin: 8px 0 0;
        color: #315375;
        font-size: 12px;
        line-height: 1.6;
      }
            [${MONTHLY_PROGRESS_PREVIEW_LEGEND_ATTRIBUTE}] {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 12px;
      }
            [${MONTHLY_PROGRESS_PREVIEW_LEGEND_ITEM_ATTRIBUTE}] {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 5px 9px;
                border-radius: 999px;
                border: 1px solid #dbe5f2;
                background: #ffffff;
                color: #315375;
                font-size: 11px;
                font-weight: 700;
      }
            [${MONTHLY_PROGRESS_PREVIEW_LEGEND_ITEM_ATTRIBUTE}="this-year"]::before,
            [${MONTHLY_PROGRESS_PREVIEW_LEGEND_ITEM_ATTRIBUTE}="last-year"]::before {
                content: "";
                width: 14px;
                height: 0;
                border-top: 3px solid #1f5fbf;
                border-radius: 999px;
            }
            [${MONTHLY_PROGRESS_PREVIEW_LEGEND_ITEM_ATTRIBUTE}="last-year"]::before {
                border-top-color: #93a4b8;
            }
            [${MONTHLY_PROGRESS_PREVIEW_SUMMARY_ATTRIBUTE}] {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
                margin-top: 12px;
            }
            [${MONTHLY_PROGRESS_PREVIEW_SUMMARY_ATTRIBUTE}] > div {
                border-radius: 10px;
                border: 1px solid #d8e5f2;
                background: #ffffff;
                padding: 8px 10px;
            }
            [${MONTHLY_PROGRESS_PREVIEW_SUMMARY_LABEL_ATTRIBUTE}] {
                color: #5b7594;
        font-size: 11px;
        font-weight: 700;
      }
            [${MONTHLY_PROGRESS_PREVIEW_SUMMARY_VALUE_ATTRIBUTE}] {
                margin-top: 4px;
        color: #17324f;
                font-size: 14px;
        font-weight: 700;
            }
            [${MONTHLY_PROGRESS_PREVIEW_CANVAS_ATTRIBUTE}] {
                margin-top: 14px;
                border-radius: 12px;
                border: 1px solid #d8e5f2;
                background: #ffffff;
                padding: 10px 10px 4px;
            }
            [${MONTHLY_PROGRESS_PREVIEW_SVG_ATTRIBUTE}] {
                display: block;
                width: 100%;
                height: auto;
                overflow: visible;
            }
            @media (max-width: 720px) {
                [${MONTHLY_PROGRESS_PREVIEW_SUMMARY_ATTRIBUTE}] {
                    grid-template-columns: 1fr;
                }
      }
    `;
    document.head.append(style);
}

function formatMetricValue(value: number | null): string {
    return value === null ? "-" : value.toLocaleString("ja-JP");
}

function formatDateKey(dateKey: string): string {
    if (!/^\d{8}$/.test(dateKey)) {
        return dateKey;
    }

    return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}