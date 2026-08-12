import { detectLegacyClassicRuntime } from "../runtimeLease";
import { shouldReconcileForDomMutations } from "../runtimeDomMutation";
import {
    buildNextMonthlyProgressViewModel,
    parseNextMonthlyProgressRoute,
    type NextMonthlyProgressCompareYearsAgo,
    type NextMonthlyProgressSecondaryMetric
} from "./monthlyProgressModel";
import {
    createNextMonthlyProgressDataSource,
    type NextMonthlyProgressDataSource,
    type NextMonthlyProgressDataLoadResult
} from "./monthlyProgressDataSource";
import {
    NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE,
    removeNextMonthlyProgressArtifacts,
    renderNextMonthlyProgressLoadingState,
    renderNextMonthlyProgressView
} from "./monthlyProgressView";

const NEXT_MONTHLY_PROGRESS_STATE_ATTRIBUTE = "data-ra-next-monthly-progress-state";
const MONTHLY_PROGRESS_RESERVATION_CHART_TEST_ID =
    "chart-content-numberOfRoomsSold-dateOfReservationBasis";
const MONTHLY_PROGRESS_PREFERENCE_PREFIX = "revenue-assistant:next:monthly-progress:v1:";

export interface NextMonthlyProgressRuntimeHandle {
    reconcile(): void;
    stop(): void;
}

export interface StartNextMonthlyProgressRuntimeOptions {
    dataSource?: NextMonthlyProgressDataSource;
    resolveBatchDateKey?: (documentHost: Document) => string | null;
    resolveYearMonth?: (location: Location) => string | null;
}

interface MonthlyProgressMountTarget {
    insertBefore: ChildNode | null;
    parent: HTMLElement;
}

export function startNextMonthlyProgressRuntime(
    documentHost: Document = document,
    windowHost: Window = window,
    options: StartNextMonthlyProgressRuntimeOptions = {}
): NextMonthlyProgressRuntimeHandle {
    const dataSource = options.dataSource ?? createNextMonthlyProgressDataSource({
        documentHost,
        windowHost
    });
    const resolveYearMonth = options.resolveYearMonth
        ?? ((location: Location) => parseNextMonthlyProgressRoute(location.pathname));
    const resolveBatchDateKey = options.resolveBatchDateKey
        ?? resolveNextMonthlyProgressBatchDateKey;
    let activeYearMonth: string | null = null;
    let activeBatchDateKey: string | null = null;
    let activeFacilityId: string | null = null;
    let compareYearsAgo: NextMonthlyProgressCompareYearsAgo = 1;
    let secondaryMetric: NextMonthlyProgressSecondaryMetric = "unit-price";
    let preferencesLoaded = false;
    let root: HTMLElement | null = null;
    let loadGeneration = 0;
    let loadPending = false;
    let reconcileTimer: number | null = null;
    let refreshTimer: number | null = null;
    let stopped = false;
    const abortController = new AbortController();
    const observer = new MutationObserver((records) => {
        if (shouldReconcileForDomMutations(records)) {
            scheduleReconcile();
        }
    });
    const unsubscribe = dataSource.subscribe(scheduleRefresh);

    documentHost.addEventListener("click", scheduleReconcile, {
        capture: true,
        signal: abortController.signal
    });
    documentHost.addEventListener("visibilitychange", scheduleReconcile, {
        signal: abortController.signal
    });
    windowHost.addEventListener("load", scheduleReconcile, { signal: abortController.signal });
    windowHost.addEventListener("pageshow", scheduleReconcile, { signal: abortController.signal });
    windowHost.addEventListener("popstate", scheduleReconcile, { signal: abortController.signal });
    observer.observe(documentHost.body, {
        attributeFilter: ["aria-hidden", "class", "data-testid", "hidden", "inert", "style"],
        attributes: true,
        childList: true,
        subtree: true
    });
    reconcile();

    return { reconcile, stop };

    function reconcile(): void {
        if (stopped) {
            return;
        }
        if (detectLegacyClassicRuntime(documentHost)) {
            stop("suspended-classic-detected");
            return;
        }
        const yearMonth = resolveYearMonth(windowHost.location);
        if (yearMonth === null) {
            suspendRoute("suspended-route");
            return;
        }
        const target = resolveNextMonthlyProgressMountTarget(documentHost);
        if (documentHost.visibilityState === "hidden" || target === null) {
            loadGeneration += 1;
            loadPending = false;
            dataSource.cancel();
            removeRoot();
            setState(target === null ? "waiting-native-monthly-chart" : "suspended-hidden");
            return;
        }
        ensureRoot(target);
        const observedBatchDateKey = resolveBatchDateKey(documentHost);
        const contextChanged = activeYearMonth !== yearMonth
            || (observedBatchDateKey !== null && activeBatchDateKey !== observedBatchDateKey);
        if (contextChanged) {
            loadGeneration += 1;
            loadPending = false;
            dataSource.reset();
            activeYearMonth = yearMonth;
            activeBatchDateKey = observedBatchDateKey;
            activeFacilityId = null;
            compareYearsAgo = 1;
            secondaryMetric = "unit-price";
            preferencesLoaded = false;
        }
        if (contextChanged || dataSource.snapshot() === null) {
            renderLoadingState();
            loadData();
        } else {
            renderSnapshot();
        }
    }

    function loadData(): void {
        if (activeYearMonth === null || loadPending) {
            return;
        }
        const yearMonth = activeYearMonth;
        const batchDateKey = activeBatchDateKey;
        const requestedCompare = compareYearsAgo;
        const generation = ++loadGeneration;
        loadPending = true;
        setState("loading");
        if (dataSource.snapshot() === null) {
            renderLoadingState();
        }
        void dataSource.load(yearMonth, batchDateKey, requestedCompare).then((result) => {
            if (
                stopped
                || generation !== loadGeneration
                || activeYearMonth !== yearMonth
            ) {
                return;
            }
            loadPending = false;
            applyLoadResult(result);
        }).finally(() => {
            if (generation === loadGeneration) {
                loadPending = false;
            }
        });
    }

    function applyLoadResult(result: NextMonthlyProgressDataLoadResult): void {
        if (result.status === "error") {
            if (result.reason !== "aborted") {
                renderRuntimeError(result.reason);
                setState(`error-${result.reason}`);
            }
            return;
        }
        activeBatchDateKey = result.snapshot.batchDateKey;
        activeFacilityId = result.snapshot.facilityId;
        if (!preferencesLoaded) {
            preferencesLoaded = true;
            const preferences = readNextMonthlyProgressPreferences(
                windowHost.localStorage,
                result.snapshot.facilityId
            );
            secondaryMetric = preferences.secondaryMetric;
            if (preferences.compareYearsAgo !== compareYearsAgo) {
                compareYearsAgo = preferences.compareYearsAgo;
                renderSnapshot();
                loadData();
                return;
            }
        }
        renderSnapshot();
    }

    function renderSnapshot(): void {
        const snapshot = dataSource.snapshot();
        if (root === null || snapshot === null) {
            return;
        }
        const model = buildNextMonthlyProgressViewModel({
            data: snapshot,
            secondaryMetric
        });
        renderNextMonthlyProgressView({
            model,
            onCompareChange(nextCompare) {
                compareYearsAgo = nextCompare;
                if (activeFacilityId !== null) {
                    writeNextMonthlyProgressPreferences(windowHost.localStorage, activeFacilityId, {
                        compareYearsAgo,
                        secondaryMetric
                    });
                }
                loadData();
            },
            onSecondaryMetricChange(nextMetric) {
                secondaryMetric = nextMetric;
                if (activeFacilityId !== null) {
                    writeNextMonthlyProgressPreferences(windowHost.localStorage, activeFacilityId, {
                        compareYearsAgo,
                        secondaryMetric
                    });
                }
                renderSnapshot();
            },
            root
        });
        setState(model.progress.phase === "complete" ? "ready" : `ready-${model.progress.phase}`);
    }

    function renderLoadingState(): void {
        if (root === null || activeYearMonth === null) {
            return;
        }
        renderNextMonthlyProgressLoadingState({
            root,
            routeYearMonth: activeYearMonth,
            stage: activeBatchDateKey === null ? "checking-context" : "loading-current"
        });
        setState(activeBatchDateKey === null ? "loading-context" : "loading-current");
    }

    function ensureRoot(target: MonthlyProgressMountTarget): void {
        const candidates = Array.from(documentHost.querySelectorAll<HTMLElement>(
            `[${NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE}]`
        ));
        for (const duplicate of candidates.slice(1)) {
            duplicate.remove();
        }
        root = candidates[0] ?? documentHost.createElement("section");
        root.setAttribute(NEXT_MONTHLY_PROGRESS_ROOT_ATTRIBUTE, "");
        if (!isNextMonthlyProgressRootPlaced(root, target)) {
            const insertBefore = target.insertBefore === root
                ? root.nextSibling
                : target.insertBefore;
            root.remove();
            target.parent.insertBefore(root, insertBefore);
        }
    }

    function scheduleReconcile(): void {
        if (stopped || reconcileTimer !== null) {
            return;
        }
        reconcileTimer = windowHost.setTimeout(() => {
            reconcileTimer = null;
            reconcile();
        }, 0);
    }

    function scheduleRefresh(): void {
        if (stopped || refreshTimer !== null) {
            return;
        }
        refreshTimer = windowHost.setTimeout(() => {
            refreshTimer = null;
            renderSnapshot();
        }, 0);
    }

    function renderRuntimeError(reason: string): void {
        if (root === null) {
            return;
        }
        root.setAttribute("aria-busy", "false");
        const heading = documentHost.createElement("h2");
        heading.textContent = "LTブッキングカーブ";
        const message = documentHost.createElement("p");
        message.setAttribute("data-ra-next-monthly-progress-empty", "");
        message.textContent = reason === "facility-context-mismatch"
            ? "表示中の施設を確認できないため、月次補助表示を停止しました。施設を再選択して再表示してください。"
            : reason === "batch-date-unavailable"
                ? "月次データの更新日を確認できないため、日付を推測せず停止しました。標準chartはそのまま利用できます。"
            : "月次補助表示を準備できませんでした。標準chartはそのまま利用できます。";
        root.replaceChildren(heading, message);
    }

    function suspendRoute(finalState: string): void {
        loadGeneration += 1;
        dataSource.reset();
        activeYearMonth = null;
        activeBatchDateKey = null;
        activeFacilityId = null;
        preferencesLoaded = false;
        loadPending = false;
        removeRoot();
        setState(finalState);
    }

    function removeRoot(): void {
        root?.remove();
        root = null;
        removeNextMonthlyProgressArtifacts(documentHost);
    }

    function stop(finalState = "stopped-local-monthly-progress"): void {
        if (stopped) {
            return;
        }
        stopped = true;
        loadGeneration += 1;
        loadPending = false;
        unsubscribe();
        dataSource.stop();
        abortController.abort();
        observer.disconnect();
        if (reconcileTimer !== null) {
            windowHost.clearTimeout(reconcileTimer);
            reconcileTimer = null;
        }
        if (refreshTimer !== null) {
            windowHost.clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        removeRoot();
        setState(finalState);
    }

    function setState(value: string): void {
        documentHost.documentElement.setAttribute(NEXT_MONTHLY_PROGRESS_STATE_ATTRIBUTE, value);
    }
}

export function isNextMonthlyProgressRootPlaced(
    root: Pick<HTMLElement, "nextSibling" | "parentElement">,
    target: MonthlyProgressMountTarget
): boolean {
    return root.parentElement === target.parent
        && (target.insertBefore === root || root.nextSibling === target.insertBefore);
}

export function resolveNextMonthlyProgressMountTarget(
    documentHost: Document
): MonthlyProgressMountTarget | null {
    const preferredChart = documentHost.querySelector<HTMLElement>(
        `[data-testid="${MONTHLY_PROGRESS_RESERVATION_CHART_TEST_ID}"]`
    );
    const visibleChart = preferredChart ?? findVisibleMonthlyProgressChart(documentHost);
    if (visibleChart !== null) {
        const chartContainer = visibleChart.parentElement instanceof HTMLElement
            ? visibleChart.parentElement
            : visibleChart;
        const parent = chartContainer.parentElement;
        if (parent instanceof HTMLElement) {
            return {
                insertBefore: chartContainer.nextSibling,
                parent
            };
        }
    }
    const chartTabs = documentHost.querySelector<HTMLElement>('[data-testid="chart-tabs"]');
    const parent = chartTabs?.parentElement;
    return parent instanceof HTMLElement
        ? { insertBefore: null, parent }
        : null;
}

export function resolveNextMonthlyProgressBatchDateKey(documentHost: Document): string | null {
    const text = documentHost.body?.innerText ?? "";
    const match = /最終データ更新[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/u.exec(text);
    if (match === null) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day
        ? `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`
        : null;
}

export function readNextMonthlyProgressPreferences(
    storage: Pick<Storage, "getItem">,
    facilityId: string
): {
    compareYearsAgo: NextMonthlyProgressCompareYearsAgo;
    secondaryMetric: NextMonthlyProgressSecondaryMetric;
} {
    const prefix = buildPreferencePrefix(facilityId);
    try {
        const compare = storage.getItem(`${prefix}compare-years-ago`);
        const metric = storage.getItem(`${prefix}secondary-metric`);
        return {
            compareYearsAgo: compare === "2" ? 2 : compare === "3" ? 3 : 1,
            secondaryMetric: metric === "sales" ? "sales" : "unit-price"
        };
    } catch {
        return { compareYearsAgo: 1, secondaryMetric: "unit-price" };
    }
}

export function writeNextMonthlyProgressPreferences(
    storage: Pick<Storage, "setItem">,
    facilityId: string,
    preferences: {
        compareYearsAgo: NextMonthlyProgressCompareYearsAgo;
        secondaryMetric: NextMonthlyProgressSecondaryMetric;
    }
): boolean {
    const prefix = buildPreferencePrefix(facilityId);
    try {
        storage.setItem(`${prefix}compare-years-ago`, String(preferences.compareYearsAgo));
        storage.setItem(`${prefix}secondary-metric`, preferences.secondaryMetric);
        return true;
    } catch {
        return false;
    }
}

function buildPreferencePrefix(facilityId: string): string {
    return `${MONTHLY_PROGRESS_PREFERENCE_PREFIX}${encodeURIComponent(facilityId)}:`;
}

function findVisibleMonthlyProgressChart(documentHost: Document): HTMLElement | null {
    const charts = Array.from(documentHost.querySelectorAll<HTMLElement>(
        '[data-testid^="chart-content-"]'
    ));
    return charts.find((chart) => isVisible(chart)) ?? charts[0] ?? null;
}

function isVisible(element: HTMLElement): boolean {
    if (
        element.hidden
        || element.closest('[hidden], [aria-hidden="true"], [inert]') !== null
    ) {
        return false;
    }
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return style?.display !== "none"
        && style?.visibility !== "hidden"
        && style?.visibility !== "collapse"
        && Number(style?.opacity ?? "1") > 0;
}
