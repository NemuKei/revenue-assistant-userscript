import {
    persistMonthlyBookingCurveSnapshot,
    readLatestMonthlyBookingCurveSnapshot,
    type MonthlyBookingCurveSnapshotRecord
} from "./monthlyProgressIndexedDb";
import {
    buildMonthlyProgressLeadTimeSeries,
    getYearMonthBounds,
    type MonthlyProgressLeadTimePoint,
    type MonthlyProgressLeadTimeSeries
} from "./monthlyProgressLeadTime";
import {
    LEAD_TIME_BUCKET_TICKS,
    type LeadTimeBucketTick
} from "./leadTimeBuckets";

const MONTHLY_PROGRESS_ROUTE_PATTERN = /^\/monthly-progress\/(\d{4})-(\d{2})$/;
const MONTHLY_PROGRESS_FEATURE_STORAGE_KEY = "revenue-assistant:feature:monthly-progress:enabled";
const MONTHLY_PROGRESS_STORAGE_PREFIX = "revenue-assistant:monthly-progress:v1:";
const MONTHLY_PROGRESS_PREVIEW_STYLE_ID = "revenue-assistant-monthly-progress-preview-style";
const MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE = "data-ra-monthly-progress-preview-root";
const MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE = "data-ra-monthly-progress-preview-meta";
const MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE = "data-ra-monthly-progress-preview-note";
const MONTHLY_PROGRESS_PREVIEW_CONTROLS_ATTRIBUTE = "data-ra-monthly-progress-preview-controls";
const MONTHLY_PROGRESS_PREVIEW_COMPARE_GROUP_ATTRIBUTE = "data-ra-monthly-progress-preview-compare-group";
const MONTHLY_PROGRESS_PREVIEW_COMPARE_BUTTON_ATTRIBUTE = "data-ra-monthly-progress-preview-compare-button";
const MONTHLY_PROGRESS_PREVIEW_COMPARE_BUTTON_ACTIVE_ATTRIBUTE = "data-ra-monthly-progress-preview-compare-button-active";
const MONTHLY_PROGRESS_PREVIEW_MONTH_LEGEND_ATTRIBUTE = "data-ra-monthly-progress-preview-month-legend";
const MONTHLY_PROGRESS_PREVIEW_MONTH_ITEM_ATTRIBUTE = "data-ra-monthly-progress-preview-month-item";
const MONTHLY_PROGRESS_PREVIEW_MONTH_SWATCH_ATTRIBUTE = "data-ra-monthly-progress-preview-month-swatch";
const MONTHLY_PROGRESS_PREVIEW_GRID_ATTRIBUTE = "data-ra-monthly-progress-preview-grid";
const MONTHLY_PROGRESS_PREVIEW_PANEL_ATTRIBUTE = "data-ra-monthly-progress-preview-panel";
const MONTHLY_PROGRESS_PREVIEW_PANEL_TITLE_ATTRIBUTE = "data-ra-monthly-progress-preview-panel-title";
const MONTHLY_PROGRESS_PREVIEW_PANEL_SUBTITLE_ATTRIBUTE = "data-ra-monthly-progress-preview-panel-subtitle";
const MONTHLY_PROGRESS_PREVIEW_CANVAS_ATTRIBUTE = "data-ra-monthly-progress-preview-canvas";
const MONTHLY_PROGRESS_PREVIEW_SVG_ATTRIBUTE = "data-ra-monthly-progress-preview-svg";
const MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ATTRIBUTE = "data-ra-monthly-progress-preview-tooltip";
const MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ACTIVE_ATTRIBUTE = "data-ra-monthly-progress-preview-tooltip-active";
const MONTHLY_PROGRESS_PREVIEW_TOOLTIP_TITLE_ATTRIBUTE = "data-ra-monthly-progress-preview-tooltip-title";
const MONTHLY_PROGRESS_PREVIEW_TOOLTIP_GRID_ATTRIBUTE = "data-ra-monthly-progress-preview-tooltip-grid";
const MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ROW_ATTRIBUTE = "data-ra-monthly-progress-preview-tooltip-row";
const MONTHLY_PROGRESS_PREVIEW_TOOLTIP_MONTH_ATTRIBUTE = "data-ra-monthly-progress-preview-tooltip-month";
const MONTHLY_PROGRESS_PREVIEW_TOOLTIP_VALUE_ATTRIBUTE = "data-ra-monthly-progress-preview-tooltip-value";
const MONTHLY_PROGRESS_PREVIEW_ACTIVE_GUIDE_ATTRIBUTE = "data-ra-monthly-progress-preview-active-guide";
const MONTHLY_PROGRESS_PREVIEW_ACTIVE_POINT_ATTRIBUTE = "data-ra-monthly-progress-preview-active-point";
const MONTHLY_PROGRESS_COMPARE_MODE_STORAGE_KEY = "preview-compare-mode";
const MONTHLY_PROGRESS_RESERVATION_CHART_TEST_ID = "chart-content-numberOfRoomsSold-dateOfReservationBasis";
const MONTHLY_PROGRESS_VISIBLE_MONTH_COUNT = 4;
const MONTHLY_PROGRESS_PREVIEW_LABEL_TICKS = new Set<LeadTimeBucketTick>([360, 270, 180, 120, 90, 60, 45, 30, 21, 14, 7, 3, "ACT"]);
const MONTHLY_PROGRESS_PREVIEW_MONTH_COLORS = ["#1f5fbf", "#0f8f8f", "#d37a1f", "#c14f72"] as const;

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

type MonthlyProgressCompareMode = "last-year" | "two-years-ago";
type MonthlyProgressMetricKind = "room" | "unit-price";

interface MonthlyProgressPreviewPoint {
    tick: LeadTimeBucketTick;
    currentValue: number | null;
    compareValue: number | null;
    lastYearCompareValue: number | null;
    twoYearsAgoCompareValue: number | null;
    currentDateKey: string | null;
    compareDateKey: string | null;
}

interface MonthlyProgressFocusMonthPreview {
    yearMonth: string;
    label: string;
    compareLabel: string;
    color: string;
    roomPoints: MonthlyProgressPreviewPoint[];
    unitPricePoints: MonthlyProgressPreviewPoint[];
}

interface MonthlyProgressPreviewModel {
    compareMode: MonthlyProgressCompareMode;
    focusMonths: MonthlyProgressFocusMonthPreview[];
    observationDateKey: string;
}

interface MonthlyProgressPanelModel {
    metric: MonthlyProgressMetricKind;
    title: string;
    subtitle: string;
    focusMonths: MonthlyProgressFocusMonthPreview[];
    compareMode: MonthlyProgressCompareMode;
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
        const previewModel = await buildMonthlyProgressPreviewModel(context);
        if (previewModel === null || previewModel.focusMonths.length === 0) {
            cleanupMonthlyProgressPreview();
            return;
        }

        console.info(`[${context.scriptName}] monthly-progress LT preview ready`, {
            href: context.href,
            yearMonth: context.routeState.yearMonth,
            observationDateKey: previewModel.observationDateKey,
            compareMode: previewModel.compareMode,
            focusMonths: previewModel.focusMonths.map((month) => month.yearMonth)
        });

        renderMonthlyProgressPreview({
            context,
            previewModel
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

async function buildMonthlyProgressPreviewModel(context: MonthlyProgressResolvedContext): Promise<MonthlyProgressPreviewModel | null> {
    const storage = createMonthlyProgressStorageAdapter(context.facilityCacheKey);
    const compareMode = resolveMonthlyProgressCompareMode(storage);
    const focusYearMonths = buildFutureYearMonths(context.routeState.yearMonth, MONTHLY_PROGRESS_VISIBLE_MONTH_COUNT);
    const focusMonths: MonthlyProgressFocusMonthPreview[] = [];

    for (const [index, focusYearMonth] of focusYearMonths.entries()) {
        if (focusYearMonth === null || focusYearMonth === undefined) {
            continue;
        }

        const primarySnapshot = await ensureMonthlyProgressSnapshotRecord(context, focusYearMonth);
        if (primarySnapshot === undefined) {
            continue;
        }

        const primaryMonthBounds = getYearMonthBounds(primarySnapshot.yearMonth);
        if (primaryMonthBounds === null) {
            continue;
        }

        const primaryRoomSeries = buildMonthlyProgressLeadTimeSeries(
            primarySnapshot.payload,
            "room",
            primaryMonthBounds.lastDateKey,
            context.batchDateKey
        );
        const primarySalesSeries = buildMonthlyProgressLeadTimeSeries(
            primarySnapshot.payload,
            "sales",
            primaryMonthBounds.lastDateKey,
            context.batchDateKey
        );

        let previousYearRoomSeries: MonthlyProgressLeadTimeSeries | null = null;
        let previousYearSalesSeries: MonthlyProgressLeadTimeSeries | null = null;

        const previousYearMonth = shiftYearMonth(focusYearMonth, -12);
        if (previousYearMonth !== null) {
            const previousYearSnapshot = await ensureMonthlyProgressSnapshotRecord(context, previousYearMonth);
            if (previousYearSnapshot !== undefined) {
                const previousYearMonthBounds = getYearMonthBounds(previousYearSnapshot.yearMonth);
                if (previousYearMonthBounds !== null) {
                    previousYearRoomSeries = buildMonthlyProgressLeadTimeSeries(
                        previousYearSnapshot.payload,
                        "room",
                        previousYearMonthBounds.lastDateKey,
                        context.batchDateKey
                    );
                    previousYearSalesSeries = buildMonthlyProgressLeadTimeSeries(
                        previousYearSnapshot.payload,
                        "sales",
                        previousYearMonthBounds.lastDateKey,
                        context.batchDateKey
                    );
                }
            }
        }

        focusMonths.push(buildMonthlyProgressFocusMonthPreview({
            yearMonth: focusYearMonth,
            index,
            compareMode,
            primaryRoomSeries,
            primarySalesSeries,
            previousYearRoomSeries,
            previousYearSalesSeries
        }));
    }

    if (focusMonths.length === 0) {
        return null;
    }

    return {
        compareMode,
        focusMonths,
        observationDateKey: context.batchDateKey
    };
}

async function ensureMonthlyProgressSnapshotRecord(
    context: MonthlyProgressResolvedContext,
    yearMonth: string
): Promise<MonthlyBookingCurveSnapshotRecord | undefined> {
    await persistMonthlyBookingCurveSnapshot({
        scriptName: context.scriptName,
        facilityCacheKey: context.facilityCacheKey,
        yearMonth,
        batchDateKey: context.batchDateKey
    }).catch((error: unknown) => {
        console.warn(`[${context.scriptName}] failed to persist monthly-progress booking-curve snapshot`, {
            href: context.href,
            yearMonth,
            batchDateKey: context.batchDateKey,
            facilityCacheKey: context.facilityCacheKey,
            error
        });
    });

    return readLatestMonthlyBookingCurveSnapshot(context.facilityCacheKey, yearMonth);
}

function buildMonthlyProgressFocusMonthPreview(options: {
    yearMonth: string;
    index: number;
    compareMode: MonthlyProgressCompareMode;
    primaryRoomSeries: MonthlyProgressLeadTimeSeries;
    primarySalesSeries: MonthlyProgressLeadTimeSeries;
    previousYearRoomSeries: MonthlyProgressLeadTimeSeries | null;
    previousYearSalesSeries: MonthlyProgressLeadTimeSeries | null;
}): MonthlyProgressFocusMonthPreview {
    const roomPoints = buildMonthlyProgressMetricPoints(
        options.primaryRoomSeries,
        options.compareMode,
        options.previousYearRoomSeries
    );
    const salesPoints = buildMonthlyProgressMetricPoints(
        options.primarySalesSeries,
        options.compareMode,
        options.previousYearSalesSeries
    );

    return {
        yearMonth: options.yearMonth,
        label: formatYearMonthLabel(options.yearMonth),
        compareLabel: formatYearMonthLabel(
            options.compareMode === "last-year"
                ? shiftYearMonth(options.yearMonth, -12) ?? options.yearMonth
                : shiftYearMonth(options.yearMonth, -24) ?? options.yearMonth
        ),
        color: MONTHLY_PROGRESS_PREVIEW_MONTH_COLORS[options.index % MONTHLY_PROGRESS_PREVIEW_MONTH_COLORS.length] ?? "#1f5fbf",
        roomPoints,
        unitPricePoints: salesPoints.map((salesPoint, index) => {
            const roomPoint = roomPoints[index];
            return {
                tick: salesPoint.tick,
                currentValue: divideNullable(salesPoint.currentValue, roomPoint?.currentValue ?? null),
                compareValue: divideNullable(salesPoint.compareValue, roomPoint?.compareValue ?? null),
                lastYearCompareValue: divideNullable(salesPoint.lastYearCompareValue, roomPoint?.lastYearCompareValue ?? null),
                twoYearsAgoCompareValue: divideNullable(salesPoint.twoYearsAgoCompareValue, roomPoint?.twoYearsAgoCompareValue ?? null),
                currentDateKey: salesPoint.currentDateKey,
                compareDateKey: salesPoint.compareDateKey
            };
        })
    };
}

function buildMonthlyProgressMetricPoints(
    primarySeries: MonthlyProgressLeadTimeSeries,
    compareMode: MonthlyProgressCompareMode,
    previousYearSeries: MonthlyProgressLeadTimeSeries | null
): MonthlyProgressPreviewPoint[] {
    return LEAD_TIME_BUCKET_TICKS.map((tick) => {
        const primaryPoint = findMonthlyProgressLeadTimePoint(primarySeries, tick);
        const previousYearPoint = findMonthlyProgressLeadTimePoint(previousYearSeries, tick);
        const lastYearCompareValue = primaryPoint?.lastYearValue ?? null;
        const twoYearsAgoCompareValue = previousYearPoint?.lastYearValue ?? null;

        return {
            tick,
            currentValue: primaryPoint?.thisYearValue ?? null,
            compareValue: compareMode === "last-year"
                ? lastYearCompareValue
                : twoYearsAgoCompareValue,
            lastYearCompareValue,
            twoYearsAgoCompareValue,
            currentDateKey: primaryPoint?.targetDateKey ?? null,
            compareDateKey: compareMode === "last-year"
                ? primaryPoint?.targetDateKey ?? null
                : previousYearPoint?.targetDateKey ?? null
        };
    });
}

function findMonthlyProgressLeadTimePoint(
    series: MonthlyProgressLeadTimeSeries | null,
    tick: LeadTimeBucketTick
): MonthlyProgressLeadTimePoint | undefined {
    return series?.points.find((point) => point.tick === tick);
}

function renderMonthlyProgressPreview(options: {
    context: MonthlyProgressResolvedContext;
    previewModel: MonthlyProgressPreviewModel;
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

    const previewSignature = JSON.stringify({
        route: options.context.routeState.yearMonth,
        batch: options.context.batchDateKey,
        compareMode: options.previewModel.compareMode,
        focusMonths: options.previewModel.focusMonths.map((month) => ({
            yearMonth: month.yearMonth,
            room: month.roomPoints.map((point) => [point.tick, point.currentValue, point.compareValue]),
            unitPrice: month.unitPricePoints.map((point) => [point.tick, point.currentValue, point.compareValue])
        }))
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
    meta.textContent = `予約日基準 / 観測 ${formatDateKey(options.previewModel.observationDateKey)} / 対象 ${options.previewModel.focusMonths[0]?.label ?? formatYearMonthLabel(options.context.routeState.yearMonth)} から ${options.previewModel.focusMonths.length}か月`;

    const note = document.createElement("p");
    note.setAttribute(MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE, "");
    note.textContent = `実線 = 現年 / 破線 = ${formatCompareModeLabel(options.previewModel.compareMode)}。hover 時だけ詳細表示し、現年は未観測 bucket と ACT を打ち切る。`;

    const controls = document.createElement("div");
    controls.setAttribute(MONTHLY_PROGRESS_PREVIEW_CONTROLS_ATTRIBUTE, "");
    controls.replaceChildren(
        createMonthlyProgressCompareGroup(options.context, options.previewModel.compareMode),
        createMonthlyProgressMonthLegend(options.previewModel.focusMonths)
    );

    const grid = document.createElement("div");
    grid.setAttribute(MONTHLY_PROGRESS_PREVIEW_GRID_ATTRIBUTE, "");
    grid.replaceChildren(
        createMonthlyProgressPanel({
            metric: "room",
            title: "販売客室数",
            subtitle: `対象 ${options.previewModel.focusMonths.length} か月 / compare ${formatCompareModeLabel(options.previewModel.compareMode)}`,
            focusMonths: options.previewModel.focusMonths,
            compareMode: options.previewModel.compareMode
        }),
        createMonthlyProgressPanel({
            metric: "unit-price",
            title: "販売単価",
            subtitle: `売上 ÷ 室数 / compare ${formatCompareModeLabel(options.previewModel.compareMode)}`,
            focusMonths: options.previewModel.focusMonths,
            compareMode: options.previewModel.compareMode
        })
    );

    root.replaceChildren(heading, meta, note, controls, grid);

    if (root.parentElement !== chartGroup || root.previousElementSibling !== chartContainer) {
        root.remove();
        chartContainer.insertAdjacentElement("afterend", root);
    }
}

function createMonthlyProgressCompareGroup(
    context: MonthlyProgressResolvedContext,
    activeMode: MonthlyProgressCompareMode
): HTMLDivElement {
    const group = document.createElement("div");
    group.setAttribute(MONTHLY_PROGRESS_PREVIEW_COMPARE_GROUP_ATTRIBUTE, "");

    const lastYearButton = createMonthlyProgressCompareButton(context, activeMode, "last-year", "前年");
    const twoYearsAgoButton = createMonthlyProgressCompareButton(context, activeMode, "two-years-ago", "前々年");
    group.replaceChildren(lastYearButton, twoYearsAgoButton);
    return group;
}

function createMonthlyProgressCompareButton(
    context: MonthlyProgressResolvedContext,
    activeMode: MonthlyProgressCompareMode,
    mode: MonthlyProgressCompareMode,
    label: string
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(MONTHLY_PROGRESS_PREVIEW_COMPARE_BUTTON_ATTRIBUTE, "");
    button.setAttribute(MONTHLY_PROGRESS_PREVIEW_COMPARE_BUTTON_ACTIVE_ATTRIBUTE, activeMode === mode ? "true" : "false");
    button.textContent = label;
    button.addEventListener("click", () => {
        if (activeMode === mode) {
            return;
        }

        const storage = createMonthlyProgressStorageAdapter(context.facilityCacheKey);
        storage.writeJson(MONTHLY_PROGRESS_COMPARE_MODE_STORAGE_KEY, mode);
        latestMonthlyProgressPreviewSignature = "";
        void syncMonthlyProgressPreview(context);
    });
    return button;
}

function createMonthlyProgressMonthLegend(focusMonths: MonthlyProgressFocusMonthPreview[]): HTMLDivElement {
    const legend = document.createElement("div");
    legend.setAttribute(MONTHLY_PROGRESS_PREVIEW_MONTH_LEGEND_ATTRIBUTE, "");

    for (const month of focusMonths) {
        const item = document.createElement("div");
        item.setAttribute(MONTHLY_PROGRESS_PREVIEW_MONTH_ITEM_ATTRIBUTE, "");

        const swatch = document.createElement("span");
        swatch.setAttribute(MONTHLY_PROGRESS_PREVIEW_MONTH_SWATCH_ATTRIBUTE, "");
        swatch.style.background = month.color;

        const label = document.createElement("span");
        label.textContent = month.label;
        item.replaceChildren(swatch, label);
        legend.append(item);
    }

    return legend;
}

function createMonthlyProgressPanel(panel: MonthlyProgressPanelModel): HTMLElement {
    const panelElement = document.createElement("section");
    panelElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_PANEL_ATTRIBUTE, "");

    const title = document.createElement("div");
    title.setAttribute(MONTHLY_PROGRESS_PREVIEW_PANEL_TITLE_ATTRIBUTE, "");
    title.textContent = panel.title;

    const subtitle = document.createElement("div");
    subtitle.setAttribute(MONTHLY_PROGRESS_PREVIEW_PANEL_SUBTITLE_ATTRIBUTE, "");
    subtitle.textContent = panel.subtitle;

    const canvas = document.createElement("div");
    canvas.setAttribute(MONTHLY_PROGRESS_PREVIEW_CANVAS_ATTRIBUTE, "");

    const tooltip = createMonthlyProgressTooltip();
    const svg = createMonthlyProgressPanelSvg(panel, tooltip);
    canvas.replaceChildren(tooltip, svg);

    panelElement.replaceChildren(title, subtitle, canvas);
    return panelElement;
}

function createMonthlyProgressTooltip(): HTMLDivElement {
    const tooltip = document.createElement("div");
    tooltip.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ATTRIBUTE, "");
    tooltip.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ACTIVE_ATTRIBUTE, "false");

    const title = document.createElement("div");
    title.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_TITLE_ATTRIBUTE, "");

    const grid = document.createElement("div");
    grid.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_GRID_ATTRIBUTE, "");

    tooltip.replaceChildren(title, grid);
    return tooltip;
}

function createMonthlyProgressPanelSvg(
    panel: MonthlyProgressPanelModel,
    tooltipElement: HTMLDivElement
): SVGSVGElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svgElement = document.createElementNS(svgNamespace, "svg");
    svgElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_SVG_ATTRIBUTE, "");
    svgElement.setAttribute("viewBox", "0 0 360 196");
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute("aria-label", `${panel.title} LTブッキングカーブ`);

    const width = 360;
    const height = 196;
    const paddingLeft = 36;
    const paddingRight = 12;
    const paddingTop = 12;
    const paddingBottom = 28;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const baselineY = height - paddingBottom;

    const pointsByMonth = panel.focusMonths.map((month) => panel.metric === "room" ? month.roomPoints : month.unitPricePoints);
    const axisTickIndices = getMonthlyProgressActiveTickIndices(pointsByMonth);
    const axisTicks = axisTickIndices.map((index) => pointsByMonth[0]?.[index]).filter((point): point is MonthlyProgressPreviewPoint => point !== undefined);
    const tickCount = axisTicks.length;
    const maxValue = Math.max(1, getMonthlyProgressPanelRoundedMaxValue(pointsByMonth));
    const xPositions = axisTicks.map((_, index) => tickCount <= 1
        ? paddingLeft
        : paddingLeft + ((plotWidth * index) / Math.max(1, tickCount - 1)));

    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
        const y = paddingTop + ((1 - ratio) * plotHeight);
        const lineElement = document.createElementNS(svgNamespace, "line");
        lineElement.setAttribute("x1", String(paddingLeft));
        lineElement.setAttribute("x2", String(width - paddingRight));
        lineElement.setAttribute("y1", y.toFixed(2));
        lineElement.setAttribute("y2", y.toFixed(2));
        lineElement.setAttribute("stroke", ratio === 0 ? "#cfd8e7" : "#e7edf7");
        lineElement.setAttribute("stroke-width", "1");
        svgElement.append(lineElement);

        const labelElement = document.createElementNS(svgNamespace, "text");
        labelElement.setAttribute("x", String(paddingLeft - 6));
        labelElement.setAttribute("y", String(y + 3));
        labelElement.setAttribute("text-anchor", "end");
        labelElement.setAttribute("fill", "#8a9cb4");
        labelElement.setAttribute("font-size", "8");
        labelElement.textContent = panel.metric === "room"
            ? formatMetricValue(Math.round(maxValue * ratio))
            : formatCurrencyValue(Math.round(maxValue * ratio));
        svgElement.append(labelElement);
    }

    const xAxis = document.createElementNS(svgNamespace, "line");
    xAxis.setAttribute("x1", String(paddingLeft));
    xAxis.setAttribute("x2", String(width - paddingRight));
    xAxis.setAttribute("y1", String(baselineY));
    xAxis.setAttribute("y2", String(baselineY));
    xAxis.setAttribute("stroke", "#cfd8e7");
    xAxis.setAttribute("stroke-width", "1");
    svgElement.append(xAxis);

    const guideLineElement = document.createElementNS(svgNamespace, "line");
    guideLineElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_ACTIVE_GUIDE_ATTRIBUTE, "");
    guideLineElement.setAttribute("visibility", "hidden");
    svgElement.append(guideLineElement);

    const activePointElements = panel.focusMonths.map((month) => {
        const pointElement = document.createElementNS(svgNamespace, "circle");
        pointElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_ACTIVE_POINT_ATTRIBUTE, "");
        pointElement.setAttribute("r", "3.2");
        pointElement.setAttribute("fill", "#ffffff");
        pointElement.setAttribute("stroke", month.color);
        pointElement.setAttribute("stroke-width", "1.6");
        pointElement.setAttribute("visibility", "hidden");
        svgElement.append(pointElement);
        return pointElement;
    });

    panel.focusMonths.forEach((month, monthIndex) => {
        const monthPoints = pointsByMonth[monthIndex] ?? [];
        const comparePath = buildMonthlyProgressChartPath(monthPoints, axisTickIndices, xPositions, maxValue, plotHeight, paddingTop, "compareValue");
        if (comparePath !== "") {
            const compareElement = document.createElementNS(svgNamespace, "path");
            compareElement.setAttribute("d", comparePath);
            compareElement.setAttribute("fill", "none");
            compareElement.setAttribute("stroke", withAlpha(month.color, 0.52));
            compareElement.setAttribute("stroke-width", "1.5");
            compareElement.setAttribute("stroke-dasharray", "5 4");
            compareElement.setAttribute("stroke-linejoin", "round");
            compareElement.setAttribute("stroke-linecap", "round");
            svgElement.append(compareElement);
        }

        const currentPath = buildMonthlyProgressChartPath(monthPoints, axisTickIndices, xPositions, maxValue, plotHeight, paddingTop, "currentValue");
        if (currentPath !== "") {
            const currentElement = document.createElementNS(svgNamespace, "path");
            currentElement.setAttribute("d", currentPath);
            currentElement.setAttribute("fill", "none");
            currentElement.setAttribute("stroke", month.color);
            currentElement.setAttribute("stroke-width", "2.2");
            currentElement.setAttribute("stroke-linejoin", "round");
            currentElement.setAttribute("stroke-linecap", "round");
            svgElement.append(currentElement);
        }
    });

    axisTicks.forEach((point, index) => {
        const x = xPositions[index];
        if (x === undefined) {
            return;
        }

        const tickLineElement = document.createElementNS(svgNamespace, "line");
        tickLineElement.setAttribute("x1", x.toFixed(2));
        tickLineElement.setAttribute("x2", x.toFixed(2));
        tickLineElement.setAttribute("y1", String(baselineY));
        tickLineElement.setAttribute("y2", String(baselineY + 5));
        tickLineElement.setAttribute("stroke", "#9fb0c8");
        tickLineElement.setAttribute("stroke-width", "1");
        svgElement.append(tickLineElement);

        if (MONTHLY_PROGRESS_PREVIEW_LABEL_TICKS.has(point.tick)) {
            const labelElement = document.createElementNS(svgNamespace, "text");
            labelElement.setAttribute("x", x.toFixed(2));
            labelElement.setAttribute("y", String(height - 10));
            labelElement.setAttribute("text-anchor", resolveMonthlyProgressPreviewLabelAnchor(point.tick, x, paddingLeft, width - paddingRight));
            labelElement.setAttribute("fill", "#70839c");
            labelElement.setAttribute("font-size", "8");
            labelElement.textContent = formatMonthlyProgressPreviewTickLabel(point.tick);
            svgElement.append(labelElement);
        }

        const previousX = index > 0 ? xPositions[index - 1] : undefined;
        const nextX = index < xPositions.length - 1 ? xPositions[index + 1] : undefined;
        const leftEdge = previousX === undefined ? paddingLeft : (previousX + x) / 2;
        const rightEdge = nextX === undefined ? width - paddingRight : (x + nextX) / 2;
        const hitbox = document.createElementNS(svgNamespace, "rect");
        hitbox.setAttribute("x", leftEdge.toFixed(2));
        hitbox.setAttribute("y", String(paddingTop));
        hitbox.setAttribute("width", Math.max(1, rightEdge - leftEdge).toFixed(2));
        hitbox.setAttribute("height", String(plotHeight));
        hitbox.setAttribute("fill", "transparent");
        hitbox.setAttribute("tabindex", "0");
        hitbox.setAttribute("role", "button");
        hitbox.setAttribute("aria-label", `${panel.title} ${formatMonthlyProgressTooltipTickLabel(point.tick)}`);
        hitbox.addEventListener("mouseenter", () => {
            showMonthlyProgressTooltip(tooltipElement, guideLineElement, activePointElements, panel, axisTickIndices[index] ?? index, x, maxValue, plotHeight, width, paddingTop, baselineY);
        });
        hitbox.addEventListener("focus", () => {
            showMonthlyProgressTooltip(tooltipElement, guideLineElement, activePointElements, panel, axisTickIndices[index] ?? index, x, maxValue, plotHeight, width, paddingTop, baselineY);
        });
        hitbox.addEventListener("mouseleave", () => {
            hideMonthlyProgressTooltip(tooltipElement, guideLineElement, activePointElements);
        });
        hitbox.addEventListener("blur", () => {
            hideMonthlyProgressTooltip(tooltipElement, guideLineElement, activePointElements);
        });
        svgElement.append(hitbox);
    });

    return svgElement;
}

function showMonthlyProgressTooltip(
    tooltipElement: HTMLDivElement,
    guideLineElement: SVGLineElement,
    activePointElements: SVGCircleElement[],
    panel: MonthlyProgressPanelModel,
    pointIndex: number,
    x: number,
    maxValue: number,
    plotHeight: number,
    width: number,
    paddingTop: number,
    baselineY: number
): void {
    const titleElement = tooltipElement.querySelector<HTMLElement>(`[${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_TITLE_ATTRIBUTE}]`);
    const gridElement = tooltipElement.querySelector<HTMLElement>(`[${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_GRID_ATTRIBUTE}]`);
    if (titleElement === null || gridElement === null) {
        return;
    }

    const referencePoint = (panel.metric === "room" ? panel.focusMonths[0]?.roomPoints : panel.focusMonths[0]?.unitPricePoints)?.[pointIndex];
    if (referencePoint === undefined) {
        hideMonthlyProgressTooltip(tooltipElement, guideLineElement, activePointElements);
        return;
    }

    titleElement.textContent = `${formatMonthlyProgressTooltipTickLabel(referencePoint.tick)}  現年 / ${formatCompareModeLabel(panel.compareMode)}`;
    const rows = panel.focusMonths
        .map((month) => {
            const point = panel.metric === "room" ? month.roomPoints[pointIndex] : month.unitPricePoints[pointIndex];
            if (point === undefined) {
                return null;
            }

            const row = document.createElement("div");
            row.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ROW_ATTRIBUTE, "");

            const monthElement = document.createElement("div");
            monthElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_MONTH_ATTRIBUTE, "");

            const swatch = document.createElement("span");
            swatch.setAttribute(MONTHLY_PROGRESS_PREVIEW_MONTH_SWATCH_ATTRIBUTE, "");
            swatch.style.background = month.color;
            const monthLabel = document.createElement("span");
            monthLabel.textContent = `${month.label} / ${month.compareLabel}`;
            monthElement.replaceChildren(swatch, monthLabel);

            const valueElement = document.createElement("div");
            valueElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_VALUE_ATTRIBUTE, "");
            valueElement.textContent = panel.metric === "room"
                ? `${formatMetricValue(point.currentValue)} / ${formatMetricValue(point.compareValue)}`
                : `${formatCurrencyValue(point.currentValue)} / ${formatCurrencyValue(point.compareValue)}`;

            row.replaceChildren(monthElement, valueElement);
            return row;
        })
        .filter((row): row is HTMLDivElement => row !== null);
    gridElement.replaceChildren(...rows);

    const canvasWidth = tooltipElement.parentElement?.clientWidth ?? width;
    const tooltipWidth = tooltipElement.offsetWidth > 0 ? tooltipElement.offsetWidth : 176;
    const xRatio = width <= 0 ? 0 : (x / width);
    const anchorLeft = xRatio * canvasWidth;
    const desiredLeft = anchorLeft + 14;
    const maxLeft = Math.max(8, canvasWidth - tooltipWidth - 8);
    tooltipElement.style.left = `${Math.max(8, Math.min(maxLeft, desiredLeft))}px`;
    tooltipElement.style.transform = "none";
    tooltipElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ACTIVE_ATTRIBUTE, "true");

    guideLineElement.setAttribute("x1", x.toFixed(2));
    guideLineElement.setAttribute("x2", x.toFixed(2));
    guideLineElement.setAttribute("y1", String(paddingTop));
    guideLineElement.setAttribute("y2", String(baselineY));
    guideLineElement.setAttribute("visibility", "visible");

    panel.focusMonths.forEach((month, monthIndex) => {
        const pointElement = activePointElements[monthIndex];
        if (pointElement === undefined) {
            return;
        }

        const point = panel.metric === "room" ? month.roomPoints[pointIndex] : month.unitPricePoints[pointIndex];
        const y = resolveMonthlyProgressChartY(point?.currentValue ?? null, maxValue, plotHeight, paddingTop);
        if (y === null) {
            pointElement.setAttribute("visibility", "hidden");
            return;
        }

        pointElement.setAttribute("cx", x.toFixed(2));
        pointElement.setAttribute("cy", y.toFixed(2));
        pointElement.setAttribute("visibility", "visible");
        pointElement.parentElement?.appendChild(pointElement);
    });
}

function hideMonthlyProgressTooltip(
    tooltipElement: HTMLDivElement,
    guideLineElement: SVGLineElement,
    activePointElements: SVGCircleElement[]
): void {
    tooltipElement.setAttribute(MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ACTIVE_ATTRIBUTE, "false");
    guideLineElement.setAttribute("visibility", "hidden");
    activePointElements.forEach((pointElement) => {
        pointElement.setAttribute("visibility", "hidden");
    });
}

function buildMonthlyProgressChartPath(
    points: MonthlyProgressPreviewPoint[],
    pointIndices: number[],
    xPositions: number[],
    maxValue: number,
    plotHeight: number,
    paddingTop: number,
    key: "currentValue" | "compareValue"
): string {
    let path = "";
    pointIndices.forEach((pointIndex, displayIndex) => {
        const point = points[pointIndex];
        const x = xPositions[displayIndex];
        if (point === undefined) {
            return;
        }
        const y = resolveMonthlyProgressChartY(point[key], maxValue, plotHeight, paddingTop);
        if (x === undefined || y === null) {
            return;
        }

        path += path === "" ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    });
    return path;
}

function getMonthlyProgressActiveTickIndices(pointsByMonth: MonthlyProgressPreviewPoint[][]): number[] {
    const referencePoints = pointsByMonth[0] ?? [];
    if (referencePoints.length === 0) {
        return [];
    }

    const firstActiveIndex = referencePoints.findIndex((_, index) => pointsByMonth.some((monthPoints) => {
        const point = monthPoints[index];
        return point !== undefined && (point.currentValue !== null || point.compareValue !== null);
    }));

    const safeFirstIndex = firstActiveIndex === -1 ? 0 : firstActiveIndex;
    return referencePoints.map((_, index) => index).slice(safeFirstIndex);
}

function resolveMonthlyProgressChartY(
    value: number | null,
    maxValue: number,
    plotHeight: number,
    paddingTop: number
): number | null {
    if (value === null) {
        return null;
    }

    return paddingTop + ((1 - (value / Math.max(1, maxValue))) * plotHeight);
}

function getMonthlyProgressPanelRoundedMaxValue(pointsByMonth: MonthlyProgressPreviewPoint[][]): number {
    const maxValue = pointsByMonth.reduce((currentMax, monthPoints) => {
        const monthMax = monthPoints.reduce((pointMax, point) => {
            return Math.max(
                pointMax,
                point.currentValue ?? 0,
                point.lastYearCompareValue ?? 0,
                point.twoYearsAgoCompareValue ?? 0
            );
        }, 0);
        return Math.max(currentMax, monthMax);
    }, 0);

    if (maxValue <= 10) {
        return 10;
    }

    const rawStep = maxValue / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalizedStep = rawStep / magnitude;

    let stepUnit = 10;
    for (const candidate of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10]) {
        if (normalizedStep <= candidate) {
            stepUnit = candidate;
            break;
        }
    }

    return stepUnit * magnitude * 4;
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
        padding: 14px 16px 16px;
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
        margin: 6px 0 0;
        color: #315375;
        font-size: 12px;
        line-height: 1.6;
      }
      [${MONTHLY_PROGRESS_PREVIEW_CONTROLS_ATTRIBUTE}] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 12px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_COMPARE_GROUP_ATTRIBUTE}] {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_COMPARE_BUTTON_ATTRIBUTE}] {
        border: 1px solid #c8d7ea;
        border-radius: 999px;
        background: #ffffff;
        color: #456784;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        padding: 7px 11px;
        cursor: pointer;
      }
      [${MONTHLY_PROGRESS_PREVIEW_COMPARE_BUTTON_ATTRIBUTE}][${MONTHLY_PROGRESS_PREVIEW_COMPARE_BUTTON_ACTIVE_ATTRIBUTE}="true"] {
        background: #eef4ff;
        border-color: #8fb2ea;
        color: #1f5fbf;
      }
      [${MONTHLY_PROGRESS_PREVIEW_MONTH_LEGEND_ATTRIBUTE}] {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_MONTH_ITEM_ATTRIBUTE}] {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 8px;
        border-radius: 999px;
        border: 1px solid #dbe5f2;
        background: #ffffff;
        color: #315375;
        font-size: 11px;
        font-weight: 700;
      }
      [${MONTHLY_PROGRESS_PREVIEW_MONTH_SWATCH_ATTRIBUTE}] {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        flex: 0 0 auto;
      }
      [${MONTHLY_PROGRESS_PREVIEW_GRID_ATTRIBUTE}] {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 12px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_PANEL_ATTRIBUTE}] {
        min-width: 0;
        border-radius: 12px;
        border: 1px solid #d8e5f2;
        background: #ffffff;
        padding: 10px 10px 8px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_PANEL_TITLE_ATTRIBUTE}] {
        color: #1f3856;
                font-size: 12px;
        font-weight: 700;
      }
      [${MONTHLY_PROGRESS_PREVIEW_PANEL_SUBTITLE_ATTRIBUTE}] {
        margin-top: 2px;
        color: #5c7492;
                font-size: 10px;
        font-weight: 700;
      }
      [${MONTHLY_PROGRESS_PREVIEW_CANVAS_ATTRIBUTE}] {
        position: relative;
                margin-top: 6px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_SVG_ATTRIBUTE}] {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
      }
      [${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ATTRIBUTE}] {
        position: absolute;
        top: 8px;
        min-width: 148px;
        max-width: min(240px, calc(100% - 12px));
        padding: 8px 10px;
        border: 1px solid #d7e0ef;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 8px 24px rgba(80, 98, 122, 0.12);
        color: #243447;
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease;
        z-index: 2;
      }
      [${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ATTRIBUTE}][${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ACTIVE_ATTRIBUTE}="true"] {
        opacity: 1;
      }
      [${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_TITLE_ATTRIBUTE}] {
        color: #58708f;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.25;
      }
      [${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_GRID_ATTRIBUTE}] {
        display: grid;
        gap: 6px;
        margin-top: 6px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_ROW_ATTRIBUTE}] {
        display: grid;
        gap: 2px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_MONTH_ATTRIBUTE}] {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #58708f;
        font-size: 10px;
        font-weight: 700;
      }
      [${MONTHLY_PROGRESS_PREVIEW_TOOLTIP_VALUE_ATTRIBUTE}] {
        color: #243447;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.25;
      }
            [${MONTHLY_PROGRESS_PREVIEW_ACTIVE_GUIDE_ATTRIBUTE}] {
                stroke: rgba(95, 118, 148, 0.42);
                stroke-width: 1.5;
                stroke-dasharray: 4 4;
            }
      @media (max-width: 960px) {
        [${MONTHLY_PROGRESS_PREVIEW_GRID_ATTRIBUTE}] {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.append(style);
}

function resolveMonthlyProgressCompareMode(storage: MonthlyProgressStorageAdapter): MonthlyProgressCompareMode {
    const raw = storage.readJson<string>(MONTHLY_PROGRESS_COMPARE_MODE_STORAGE_KEY);
    return raw === "two-years-ago" ? raw : "last-year";
}

function buildFutureYearMonths(baseYearMonth: string, count: number): Array<string | null> {
    return Array.from({ length: count }, (_, index) => shiftYearMonth(baseYearMonth, index));
}

function shiftYearMonth(yearMonth: string, offsetMonths: number): string | null {
    if (!/^\d{6}$/.test(yearMonth)) {
        return null;
    }

    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4, 6));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    const shifted = new Date(Date.UTC(year, month - 1 + offsetMonths, 1));
    return `${shifted.getUTCFullYear()}${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatYearMonthLabel(yearMonth: string): string {
    if (!/^\d{6}$/.test(yearMonth)) {
        return yearMonth;
    }

    return `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}`;
}

function formatMetricValue(value: number | null): string {
    return value === null ? "-" : value.toLocaleString("ja-JP");
}

function formatCurrencyValue(value: number | null): string {
    return value === null ? "-" : `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function divideNullable(numerator: number | null, denominator: number | null): number | null {
    if (numerator === null || denominator === null || denominator <= 0) {
        return null;
    }

    return numerator / denominator;
}

function formatCompareModeLabel(mode: MonthlyProgressCompareMode): string {
    return mode === "two-years-ago" ? "前々年" : "前年";
}

function formatMonthlyProgressPreviewTickLabel(tick: LeadTimeBucketTick): string {
    return tick === "ACT" ? "ACT" : `${tick}`;
}

function formatMonthlyProgressTooltipTickLabel(tick: LeadTimeBucketTick): string {
    return tick === "ACT" ? "ACT" : `${tick}日前`;
}

function resolveMonthlyProgressPreviewLabelAnchor(
    tick: LeadTimeBucketTick,
    x: number,
    minX: number,
    maxX: number
): "start" | "middle" | "end" {
    if (tick === LEAD_TIME_BUCKET_TICKS[0] || x <= minX + 14) {
        return "start";
    }

    if (tick === "ACT" || x >= maxX - 14) {
        return "end";
    }

    return "middle";
}

function withAlpha(hexColor: string, alpha: number): string {
    const normalized = hexColor.replace("#", "");
    if (normalized.length !== 6) {
        return hexColor;
    }

    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatDateKey(dateKey: string): string {
    if (!/^\d{8}$/.test(dateKey)) {
        return dateKey;
    }

    return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}