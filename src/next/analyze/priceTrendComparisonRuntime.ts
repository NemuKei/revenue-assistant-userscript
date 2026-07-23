import { detectLegacyClassicRuntime } from "../runtimeLease";
import {
    hasLiveFacilityContextLabel,
    readLiveFacilityContextHints
} from "../live/liveCalendarDomAdapter";
import {
    createPriceTrendComparisonDataSource,
    type PriceTrendComparisonDataLoadResult,
    type PriceTrendComparisonDataSource
} from "./priceTrendComparisonDataSource";
import {
    buildPriceTrendComparisonViewModel,
    type PriceTrendComparisonFilters,
    type PriceTrendComparisonGuestCount,
    type PriceTrendComparisonViewModel
} from "./priceTrendComparisonModel";
import {
    PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE,
    PRICE_TREND_COMPARISON_FILTER_VALUE_ATTRIBUTE,
    PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE,
    PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE,
    createPriceTrendComparisonRoot,
    ensurePriceTrendComparisonStyles,
    removePriceTrendComparisonArtifacts,
    renderPriceTrendComparison,
    type PriceTrendComparisonRenderState
} from "./priceTrendComparisonView";

const NEXT_PRICE_TREND_STATE_ATTRIBUTE = "data-ra-next-price-trend-state";
const PRICE_TREND_NATIVE_CONTENT_SELECTOR = '[data-testid="price-trends-content"]';

type PriceTrendComparisonRuntimeState =
    | { status: "idle" }
    | { status: "loading"; stayDate: string }
    | { status: "empty"; reason: string; stayDate: string }
    | { status: "error"; reason: string; stayDate: string }
    | { status: "ready"; viewModel: PriceTrendComparisonViewModel };

interface PriceTrendComparisonRuntimeContext {
    facilityId: string;
    facilityLabel: string;
    records: unknown[];
    stayDate: string;
}

export interface PriceTrendComparisonRuntimeHandle {
    reconcile(): void;
    stop(): void;
}

export interface StartPriceTrendComparisonRuntimeOptions {
    dataSource?: PriceTrendComparisonDataSource;
    resolveStayDate?: (location: Location) => string | null;
}

export function parsePriceTrendComparisonAnalyzeStayDate(pathname: string): string | null {
    const match = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})\/?$/u.exec(pathname.trim());
    if (match === null) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? `${match[1]}${match[2]}${match[3]}`
        : null;
}

export function startPriceTrendComparisonRuntime(
    documentHost: Document = document,
    windowHost: Window = window,
    options: StartPriceTrendComparisonRuntimeOptions = {}
): PriceTrendComparisonRuntimeHandle {
    const dataSource = options.dataSource ?? createPriceTrendComparisonDataSource({ windowHost });
    const resolveStayDate = options.resolveStayDate
        ?? ((location: Location) => parsePriceTrendComparisonAnalyzeStayDate(location.pathname));
    let state: PriceTrendComparisonRuntimeState = { status: "idle" };
    let activeContext: PriceTrendComparisonRuntimeContext | null = null;
    let activeStayDate: string | null = null;
    let filters: PriceTrendComparisonFilters = { mealType: null, roomType: null };
    let selectedGuestCount: PriceTrendComparisonGuestCount = 2;
    let root: HTMLElement | null = null;
    let mountTarget: HTMLElement | null = null;
    let blockedFacilityLabel: string | null = null;
    let loadGeneration = 0;
    let scheduledReconcileTimer: number | null = null;
    let narrow = windowHost.innerWidth <= 680;
    let stopped = false;
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
    documentHost.addEventListener("visibilitychange", scheduleReconcile, {
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
            resetContext(stayDate);
        }
        if (blockedFacilityLabel !== null) {
            if (!hasLiveFacilityContextLabel(
                readLiveFacilityContextHints(documentHost),
                blockedFacilityLabel
            )) {
                removeMountedRoot();
                documentHost.documentElement.setAttribute(
                    NEXT_PRICE_TREND_STATE_ATTRIBUTE,
                    "suspended-facility-context-mismatch"
                );
                return;
            }
            blockedFacilityLabel = null;
            state = { status: "idle" };
        }
        const target = resolvePriceTrendComparisonMountTarget(documentHost);
        if (documentHost.visibilityState === "hidden" || target === null) {
            suspendForInactiveSurface(
                target === null ? "waiting-native-price-trend-tab" : "suspended-hidden"
            );
            return;
        }
        if (
            activeContext !== null
            && !hasLiveFacilityContextLabel(
                readLiveFacilityContextHints(documentHost),
                activeContext.facilityLabel
            )
        ) {
            resetContext(stayDate);
        }
        const mounted = ensureMountedRoot(target);
        if (state.status === "idle") {
            startLoad(stayDate);
        } else if (mounted) {
            renderCurrentState();
        }
    }

    function resetContext(stayDate: string): void {
        loadGeneration += 1;
        dataSource.reset();
        activeStayDate = stayDate;
        activeContext = null;
        blockedFacilityLabel = null;
        filters = { mealType: null, roomType: null };
        selectedGuestCount = 2;
        state = { status: "idle" };
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

    function applyLoadResult(
        result: PriceTrendComparisonDataLoadResult,
        stayDate: string
    ): void {
        if (result.status === "error") {
            if (result.reason === "aborted") {
                return;
            }
            activeContext = null;
            state = { status: "error", reason: result.reason, stayDate };
            renderCurrentState();
            return;
        }
        const facilityHints = readLiveFacilityContextHints(documentHost);
        if (!hasLiveFacilityContextLabel(facilityHints, result.facilityLabel)) {
            activeContext = null;
            blockedFacilityLabel = result.facilityLabel;
            state = { status: "error", reason: "facility-context-mismatch", stayDate };
            removeMountedRoot();
            documentHost.documentElement.setAttribute(
                NEXT_PRICE_TREND_STATE_ATTRIBUTE,
                "suspended-facility-context-mismatch"
            );
            return;
        }
        activeContext = {
            facilityId: result.facilityId,
            facilityLabel: result.facilityLabel,
            records: result.status === "ready" ? result.records.slice() : [],
            stayDate
        };
        if (result.status === "missing" || result.status === "unavailable") {
            state = { status: "empty", reason: result.reason, stayDate };
            renderCurrentState();
            return;
        }
        rebuildState();
    }

    function rebuildState(): void {
        if (activeContext === null) {
            return;
        }
        const model = buildPriceTrendComparisonViewModel({
            facilityId: activeContext.facilityId,
            filters,
            records: activeContext.records,
            selectedGuestCount,
            stayDate: activeContext.stayDate
        });
        if (model.status === "empty") {
            state = {
                status: "empty",
                reason: model.reason,
                stayDate: activeContext.stayDate
            };
        } else {
            filters = model.viewModel.filters;
            selectedGuestCount = model.viewModel.selectedGuestCount;
            state = { status: "ready", viewModel: model.viewModel };
        }
        renderCurrentState();
    }

    function ensureMountedRoot(target: HTMLElement): boolean {
        const candidates = Array.from(documentHost.querySelectorAll<HTMLElement>(
            `[${PRICE_TREND_COMPARISON_ROOT_ATTRIBUTE}]`
        ));
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
                : createPriceTrendComparisonRoot(documentHost);
            target.append(root);
            mountTarget = target;
            ensurePriceTrendComparisonStyles(documentHost);
            return true;
        }
        ensurePriceTrendComparisonStyles(documentHost);
        return false;
    }

    function renderCurrentState(): void {
        if (root === null || !root.isConnected || mountTarget === null) {
            return;
        }
        const renderState: PriceTrendComparisonRenderState = state.status === "idle"
            ? { status: "loading", stayDate: activeStayDate ?? "" }
            : state;
        renderPriceTrendComparison(root, renderState, { narrow });
        documentHost.documentElement.setAttribute(
            NEXT_PRICE_TREND_STATE_ATTRIBUTE,
            state.status === "ready" ? "mounted-local-comparison" : state.status
        );
    }

    function handleDocumentClick(event: MouseEvent): void {
        if (stopped || root === null || !(event.target instanceof Element) || !root.contains(event.target)) {
            return;
        }
        const filterButton = event.target.closest<HTMLElement>(
            `[${PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE}]`
        );
        if (filterButton !== null) {
            event.preventDefault();
            const kind = filterButton.getAttribute(PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE);
            const value = filterButton.getAttribute(PRICE_TREND_COMPARISON_FILTER_VALUE_ATTRIBUTE) ?? "";
            if (kind === "roomType" || kind === "mealType") {
                filters = { ...filters, [kind]: value === "" ? null : value };
                rebuildState();
                root.querySelector<HTMLElement>(
                    `[${PRICE_TREND_COMPARISON_FILTER_KIND_ATTRIBUTE}="${kind}"]`
                    + `[${PRICE_TREND_COMPARISON_FILTER_VALUE_ATTRIBUTE}="${escapeAttributeValue(value)}"]`
                )?.focus({ preventScroll: true });
            }
            return;
        }
        const guestButton = event.target.closest<HTMLElement>(
            `[${PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE}]`
        );
        if (guestButton === null) {
            return;
        }
        const guestCount = Number(guestButton.getAttribute(PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE));
        if (guestCount !== 1 && guestCount !== 2 && guestCount !== 3 && guestCount !== 4) {
            return;
        }
        event.preventDefault();
        selectedGuestCount = guestCount;
        rebuildState();
        root.querySelector<HTMLElement>(
            `[${PRICE_TREND_COMPARISON_GUEST_ATTRIBUTE}="${guestCount}"]`
        )?.focus({ preventScroll: true });
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

    function suspendForInactiveSurface(finalState: string): void {
        if (state.status === "loading") {
            loadGeneration += 1;
            dataSource.cancel();
            state = { status: "idle" };
        }
        removeMountedRoot();
        documentHost.documentElement.setAttribute(NEXT_PRICE_TREND_STATE_ATTRIBUTE, finalState);
    }

    function suspendForInactiveRoute(): void {
        loadGeneration += 1;
        dataSource.reset();
        activeContext = null;
        activeStayDate = null;
        blockedFacilityLabel = null;
        filters = { mealType: null, roomType: null };
        selectedGuestCount = 2;
        state = { status: "idle" };
        removePriceTrendComparisonArtifacts(documentHost);
        root = null;
        mountTarget = null;
        documentHost.documentElement.setAttribute(NEXT_PRICE_TREND_STATE_ATTRIBUTE, "suspended-route");
    }

    function removeMountedRoot(): void {
        root?.remove();
        root = null;
        mountTarget = null;
    }

    function stop(finalState = "stopped-local-comparison"): void {
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
        removePriceTrendComparisonArtifacts(documentHost);
        root = null;
        mountTarget = null;
        documentHost.documentElement.setAttribute(NEXT_PRICE_TREND_STATE_ATTRIBUTE, finalState);
    }
}

export function resolvePriceTrendComparisonMountTarget(
    documentHost: Document
): HTMLElement | null {
    const content = documentHost.querySelector<HTMLElement>(PRICE_TREND_NATIVE_CONTENT_SELECTOR);
    return content !== null && isVisiblyRendered(content) ? content : null;
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
    return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
