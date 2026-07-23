import { detectLegacyClassicRuntime } from "../runtimeLease";
import {
    hasLiveFacilityContextLabel,
    readLiveFacilityContextHints
} from "../live/liveCalendarDomAdapter";
import {
    createCompetitorHistoryDataSource,
    type CompetitorHistoryDataLoadResult,
    type CompetitorHistoryDataSource
} from "./competitorHistoryDataSource";
import {
    buildCompetitorHistoryViewModel,
    type CompetitorHistoryFilters,
    type CompetitorHistoryGuestCount,
    type CompetitorHistoryViewModel
} from "./competitorHistoryModel";
import {
    COMPETITOR_HISTORY_FILTER_KIND_ATTRIBUTE,
    COMPETITOR_HISTORY_FILTER_VALUE_ATTRIBUTE,
    COMPETITOR_HISTORY_GUEST_ATTRIBUTE,
    COMPETITOR_HISTORY_ROOT_ATTRIBUTE,
    createCompetitorHistoryRoot,
    ensureCompetitorHistoryStyles,
    removeCompetitorHistoryArtifacts,
    renderCompetitorHistory,
    type CompetitorHistoryRenderState
} from "./competitorHistoryView";

const NEXT_ANALYZE_STATE_ATTRIBUTE = "data-ra-next-analyze-state";
const COMPETITOR_PRICE_NATIVE_CONTEXT_SELECTOR = '[data-testid="competitor-price-tax-included-text"]';

type CompetitorHistoryRuntimeState =
    | { status: "idle" }
    | { status: "loading"; stayDate: string }
    | { status: "empty"; stayDate: string; reason: string }
    | { status: "error"; stayDate: string; reason: string }
    | {
        status: "ready";
        facilityId: string;
        facilityLabel: string;
        records: unknown[];
        stayDate: string;
        viewModel: CompetitorHistoryViewModel;
    };

export interface CompetitorHistoryRuntimeHandle {
    reconcile(): void;
    stop(): void;
}

export interface StartCompetitorHistoryRuntimeOptions {
    dataSource?: CompetitorHistoryDataSource;
    resolveStayDate?: (location: Location) => string | null;
}

export function parseCompetitorHistoryAnalyzeStayDate(pathname: string): string | null {
    const match = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})\/?$/u.exec(pathname.trim());
    if (match === null) {
        return null;
    }
    const compact = `${match[1]}${match[2]}${match[3]}`;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1])
        && date.getUTCMonth() === Number(match[2]) - 1
        && date.getUTCDate() === Number(match[3])
        ? compact
        : null;
}

export function startCompetitorHistoryRuntime(
    documentHost: Document = document,
    windowHost: Window = window,
    options: StartCompetitorHistoryRuntimeOptions = {}
): CompetitorHistoryRuntimeHandle {
    let state: CompetitorHistoryRuntimeState = { status: "idle" };
    let filters: CompetitorHistoryFilters = { mealType: null, roomType: null };
    let selectedGuestCount: CompetitorHistoryGuestCount = 2;
    let activeStayDate: string | null = null;
    let loadGeneration = 0;
    let root: HTMLElement | null = null;
    let mountSection: HTMLElement | null = null;
    let scheduledReconcileTimer: number | null = null;
    let narrow = windowHost.innerWidth <= 680;
    let stopped = false;

    const dataSource = options.dataSource ?? createCompetitorHistoryDataSource({ windowHost });
    const resolveStayDate = options.resolveStayDate
        ?? ((location: Location) => parseCompetitorHistoryAnalyzeStayDate(location.pathname));
    const abortController = new AbortController();
    const observer = new MutationObserver(scheduleReconcile);

    documentHost.addEventListener("click", handleDocumentClick, {
        capture: true,
        signal: abortController.signal
    });
    windowHost.addEventListener("popstate", scheduleReconcile, {
        signal: abortController.signal
    });
    windowHost.addEventListener("resize", handleResize, {
        signal: abortController.signal
    });
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
        const stayDate = resolveStayDate(windowHost.location);
        if (stayDate === null) {
            suspendForInactiveRoute();
            return;
        }
        if (activeStayDate !== stayDate) {
            resetForStayDate(stayDate);
        }
        const target = resolveCompetitorHistoryMountTarget(documentHost);
        if (target === null) {
            removeMountedRoot();
            documentHost.documentElement.setAttribute(NEXT_ANALYZE_STATE_ATTRIBUTE, "waiting-native-competitor-tab");
            return;
        }
        const mounted = ensureMountedRoot(target);
        if (state.status === "idle") {
            startLoad(stayDate);
        } else if (mounted) {
            renderCurrentState();
        }
    }

    function resetForStayDate(stayDate: string): void {
        loadGeneration += 1;
        dataSource.cancel();
        activeStayDate = stayDate;
        state = { status: "idle" };
        filters = { mealType: null, roomType: null };
        selectedGuestCount = 2;
        removeMountedRoot();
    }

    function startLoad(stayDate: string): void {
        const generation = ++loadGeneration;
        state = { status: "loading", stayDate };
        renderCurrentState();
        void dataSource.load(stayDate).then((result) => {
            if (stopped || generation !== loadGeneration || activeStayDate !== stayDate) {
                return;
            }
            applyLoadResult(result, stayDate);
        });
    }

    function applyLoadResult(result: CompetitorHistoryDataLoadResult, stayDate: string): void {
        if (result.status === "error") {
            if (result.reason === "aborted") {
                return;
            }
            state = { status: "error", stayDate, reason: result.reason };
            renderCurrentState();
            return;
        }
        const facilityHints = readLiveFacilityContextHints(documentHost);
        if (!hasLiveFacilityContextLabel(facilityHints, result.facilityLabel)) {
            state = { status: "error", stayDate, reason: "facility-context-mismatch" };
            removeMountedRoot();
            documentHost.documentElement.setAttribute(
                NEXT_ANALYZE_STATE_ATTRIBUTE,
                "suspended-facility-context-mismatch"
            );
            return;
        }
        if (result.status === "missing" || result.status === "unavailable") {
            state = { status: "empty", stayDate, reason: result.reason };
            renderCurrentState();
            return;
        }
        const model = buildCompetitorHistoryViewModel({
            facilityId: result.facilityId,
            filters,
            records: result.records,
            stayDate
        });
        if (model.status === "empty") {
            state = { status: "empty", stayDate, reason: model.reason };
            renderCurrentState();
            return;
        }
        state = {
            status: "ready",
            facilityId: result.facilityId,
            facilityLabel: result.facilityLabel,
            records: result.records,
            stayDate,
            viewModel: model.viewModel
        };
        renderCurrentState();
    }

    function rebuildReadyViewModel(): void {
        if (state.status !== "ready") {
            return;
        }
        const model = buildCompetitorHistoryViewModel({
            facilityId: state.facilityId,
            filters,
            records: state.records,
            stayDate: state.stayDate
        });
        if (model.status === "empty") {
            state = { status: "empty", stayDate: state.stayDate, reason: model.reason };
        } else {
            filters = model.viewModel.filters;
            state = { ...state, viewModel: model.viewModel };
        }
        renderCurrentState();
    }

    function ensureMountedRoot(target: HTMLElement): boolean {
        const candidates = Array.from(
            documentHost.querySelectorAll<HTMLElement>(`[${COMPETITOR_HISTORY_ROOT_ATTRIBUTE}]`)
        );
        if (candidates.length > 1) {
            stop("suspended-duplicate-root");
            return false;
        }
        const candidate = candidates[0] ?? null;
        if (candidate !== null && candidate.parentElement !== target) {
            candidate.remove();
        }
        if (root?.isConnected !== true || root.parentElement !== target) {
            root = candidate?.parentElement === target
                ? candidate
                : createCompetitorHistoryRoot(documentHost);
            target.append(root);
            mountSection = target;
            ensureCompetitorHistoryStyles(documentHost);
            return true;
        }
        ensureCompetitorHistoryStyles(documentHost);
        return false;
    }

    function renderCurrentState(): void {
        if (root === null || !root.isConnected || mountSection === null) {
            return;
        }
        const renderState: CompetitorHistoryRenderState = state.status === "ready"
            ? { status: "ready", selectedGuestCount, viewModel: state.viewModel }
            : state.status === "idle"
                ? { status: "loading", stayDate: activeStayDate ?? "" }
                : state;
        renderCompetitorHistory(root, renderState, { narrow });
        documentHost.documentElement.setAttribute(
            NEXT_ANALYZE_STATE_ATTRIBUTE,
            state.status === "ready" ? "mounted-read-only" : state.status
        );
    }

    function handleDocumentClick(event: MouseEvent): void {
        if (stopped || root === null || !(event.target instanceof Element) || !root.contains(event.target)) {
            return;
        }
        const filterButton = event.target.closest<HTMLElement>(`[${COMPETITOR_HISTORY_FILTER_KIND_ATTRIBUTE}]`);
        if (filterButton !== null) {
            event.preventDefault();
            const kind = filterButton.getAttribute(COMPETITOR_HISTORY_FILTER_KIND_ATTRIBUTE);
            const value = filterButton.getAttribute(COMPETITOR_HISTORY_FILTER_VALUE_ATTRIBUTE) ?? "";
            if (kind === "roomType" || kind === "mealType") {
                filters = { ...filters, [kind]: value === "" ? null : value };
                rebuildReadyViewModel();
                root.querySelector<HTMLElement>(
                    `[${COMPETITOR_HISTORY_FILTER_KIND_ATTRIBUTE}="${kind}"][${COMPETITOR_HISTORY_FILTER_VALUE_ATTRIBUTE}="${escapeAttributeValue(value)}"]`
                )?.focus({ preventScroll: true });
            }
            return;
        }
        const guestButton = event.target.closest<HTMLElement>(`[${COMPETITOR_HISTORY_GUEST_ATTRIBUTE}]`);
        if (guestButton === null) {
            return;
        }
        const guestCount = Number(guestButton.getAttribute(COMPETITOR_HISTORY_GUEST_ATTRIBUTE));
        if (guestCount !== 1 && guestCount !== 2 && guestCount !== 3 && guestCount !== 4) {
            return;
        }
        event.preventDefault();
        selectedGuestCount = guestCount;
        renderCurrentState();
        root.querySelector<HTMLElement>(`[${COMPETITOR_HISTORY_GUEST_ATTRIBUTE}="${guestCount}"]`)
            ?.focus({ preventScroll: true });
    }

    function handleResize(): void {
        const nextNarrow = windowHost.innerWidth <= 680;
        if (nextNarrow === narrow) {
            return;
        }
        narrow = nextNarrow;
        renderCurrentState();
    }

    function scheduleReconcile(): void {
        if (stopped || scheduledReconcileTimer !== null) {
            return;
        }
        scheduledReconcileTimer = windowHost.setTimeout(() => {
            scheduledReconcileTimer = null;
            reconcile();
        }, 0);
    }

    function suspendForInactiveRoute(): void {
        if (activeStayDate !== null || state.status !== "idle") {
            loadGeneration += 1;
            dataSource.cancel();
            activeStayDate = null;
            state = { status: "idle" };
            filters = { mealType: null, roomType: null };
            selectedGuestCount = 2;
        }
        removeCompetitorHistoryArtifacts(documentHost);
        root = null;
        mountSection = null;
        documentHost.documentElement.setAttribute(NEXT_ANALYZE_STATE_ATTRIBUTE, "suspended-route");
    }

    function removeMountedRoot(): void {
        root?.remove();
        root = null;
        mountSection = null;
    }

    function stop(finalState = "stopped-read-only"): void {
        if (stopped) {
            return;
        }
        stopped = true;
        loadGeneration += 1;
        dataSource.stop();
        abortController.abort();
        observer.disconnect();
        if (scheduledReconcileTimer !== null) {
            windowHost.clearTimeout(scheduledReconcileTimer);
            scheduledReconcileTimer = null;
        }
        removeCompetitorHistoryArtifacts(documentHost);
        root = null;
        mountSection = null;
        documentHost.documentElement.setAttribute(NEXT_ANALYZE_STATE_ATTRIBUTE, finalState);
    }
}

export function resolveCompetitorHistoryMountTarget(documentHost: Document): HTMLElement | null {
    const context = documentHost.querySelector<HTMLElement>(COMPETITOR_PRICE_NATIVE_CONTEXT_SELECTOR);
    if (context === null || !isVisiblyRendered(context)) {
        return null;
    }
    return context.parentElement instanceof HTMLElement ? context.parentElement : null;
}

function isVisiblyRendered(element: HTMLElement): boolean {
    if (
        element.hidden
        || element.closest('[hidden], [aria-hidden="true"], [inert]') !== null
        || element.getClientRects().length === 0
    ) {
        return false;
    }
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return style?.display !== "none"
        && style?.visibility !== "hidden"
        && style?.visibility !== "collapse"
        && Number(style?.opacity ?? "1") > 0;
}

function escapeAttributeValue(value: string): string {
    return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
