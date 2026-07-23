import { detectLegacyClassicRuntime } from "../runtimeLease";
import {
    hasLiveFacilityContextLabel,
    readLiveFacilityContextHints
} from "../live/liveCalendarDomAdapter";
import { parseLiveSimilarityLensAsOfDate } from "../live/liveSimilarityLensDataSource";
import {
    createBookingCurveReferenceDataSource,
    type BookingCurveReferenceDataLoadResult,
    type BookingCurveReferenceDataSource
} from "./bookingCurveReferenceDataSource";
import {
    buildBookingCurveReferenceViewModel,
    type BookingCurveReferenceSecondarySegment,
    type BookingCurveReferenceVisibility,
    type BookingCurveReferenceViewModel
} from "./bookingCurveReferenceModel";
import {
    buildBookingCurveRankHistoryViewState,
    type BookingCurveRankHistoryViewState,
    type BookingCurveRankStatusSnapshot
} from "./bookingCurveRankMarkerModel";
import {
    createBookingCurveRankStatusDataSource,
    type BookingCurveRankStatusDataSource,
    type BookingCurveRankStatusLoadResult
} from "./bookingCurveRankStatusDataSource";
import {
    BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE,
    BOOKING_CURVE_REFERENCE_SCOPE_ATTRIBUTE,
    BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE,
    BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE,
    createBookingCurveReferenceRoot,
    ensureBookingCurveReferenceStyles,
    removeBookingCurveReferenceArtifacts,
    renderBookingCurveReference,
    type BookingCurveReferenceRenderState
} from "./bookingCurveReferenceView";

const NEXT_BOOKING_CURVE_STATE_ATTRIBUTE = "data-ra-next-booking-curve-state";
const BOOKING_CURVE_MAIN_HEADER_SELECTOR = '[data-testid="booking-curve-main-chart-header"]';
const BOOKING_CURVE_SUB_HEADER_SELECTOR = '[data-testid="booking-curve-sub-chart-header"]';

type BookingCurveReferenceRuntimeState =
    | { status: "idle" }
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

export interface BookingCurveReferenceRuntimeHandle {
    reconcile(): void;
    stop(): void;
}

export interface StartBookingCurveReferenceRuntimeOptions {
    dataSource?: BookingCurveReferenceDataSource;
    rankStatusDataSource?: BookingCurveRankStatusDataSource;
    resolveAsOfDate?: (documentHost: Document) => string | null;
    resolveStayDate?: (location: Location) => string | null;
}

export function parseBookingCurveReferenceAnalyzeStayDate(pathname: string): string | null {
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

export function startBookingCurveReferenceRuntime(
    documentHost: Document = document,
    windowHost: Window = window,
    options: StartBookingCurveReferenceRuntimeOptions = {}
): BookingCurveReferenceRuntimeHandle {
    const dataSource = options.dataSource ?? createBookingCurveReferenceDataSource({ windowHost });
    const rankStatusDataSource = options.rankStatusDataSource
        ?? createBookingCurveRankStatusDataSource({ windowHost });
    const resolveStayDate = options.resolveStayDate
        ?? ((location: Location) => parseBookingCurveReferenceAnalyzeStayDate(location.pathname));
    const resolveAsOfDate = options.resolveAsOfDate ?? parseLiveSimilarityLensAsOfDate;
    let state: BookingCurveReferenceRuntimeState = { status: "idle" };
    let activeData: Extract<BookingCurveReferenceDataLoadResult, { status: "ready" }> | null = null;
    let activeStayDate: string | null = null;
    let activeAsOfDate: string | null = null;
    let activeRankSnapshot: BookingCurveRankStatusSnapshot | null = null;
    let rankLoadError: Extract<BookingCurveRankStatusLoadResult, { status: "error" }>["reason"] | null = null;
    let rankLoading = false;
    let selectedScopeKey = "hotel";
    let secondarySegment: BookingCurveReferenceSecondarySegment = "transient";
    let visibility: BookingCurveReferenceVisibility = { recent: true, seasonal: false };
    let root: HTMLElement | null = null;
    let mountTarget: HTMLElement | null = null;
    let contextBlocked = false;
    let loadGeneration = 0;
    let rankLoadGeneration = 0;
    let scheduledReconcileTimer: number | null = null;
    let scheduledDataRefreshTimer: number | null = null;
    let narrow = windowHost.innerWidth <= 680;
    let stopped = false;
    const abortController = new AbortController();
    const observer = new MutationObserver(scheduleReconcile);
    const unsubscribeDataSource = dataSource.subscribe?.(scheduleDataRefresh)
        ?? (() => undefined);

    documentHost.addEventListener("click", handleDocumentClick, {
        capture: true,
        signal: abortController.signal
    });
    windowHost.addEventListener("popstate", scheduleReconcile, { signal: abortController.signal });
    windowHost.addEventListener("resize", handleResize, { signal: abortController.signal });
    documentHost.addEventListener("visibilitychange", scheduleReconcile, { signal: abortController.signal });
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
        const target = resolveBookingCurveReferenceMountTarget(documentHost);
        if (documentHost.visibilityState === "hidden" || target === null) {
            suspendForInactiveSurface(target === null ? "waiting-native-booking-tab" : "suspended-hidden");
            return;
        }
        const asOfDate = resolveAsOfDate(documentHost);
        if (activeStayDate !== stayDate || activeAsOfDate !== asOfDate) {
            resetContext(stayDate, asOfDate);
        }
        if (contextBlocked) {
            removeBookingCurveReferenceArtifacts(documentHost);
            root = null;
            mountTarget = null;
            documentHost.documentElement.setAttribute(
                NEXT_BOOKING_CURVE_STATE_ATTRIBUTE,
                "suspended-facility-context-mismatch"
            );
            return;
        }
        ensureMountedRoot(target);
        if (asOfDate === null) {
            state = { status: "error", reason: "as-of-missing", stayDate };
            renderCurrentState();
            return;
        }
        if (state.status === "idle") {
            startLoad(stayDate, asOfDate, selectedScopeKey);
        }
    }

    function resetContext(stayDate: string, asOfDate: string | null): void {
        loadGeneration += 1;
        rankLoadGeneration += 1;
        dataSource.reset();
        rankStatusDataSource.reset();
        activeStayDate = stayDate;
        activeAsOfDate = asOfDate;
        activeData = null;
        activeRankSnapshot = null;
        rankLoadError = null;
        rankLoading = false;
        contextBlocked = false;
        selectedScopeKey = "hotel";
        secondarySegment = "transient";
        visibility = { recent: true, seasonal: false };
        state = { status: "idle" };
        removeMountedRoot();
    }

    function startLoad(stayDate: string, asOfDate: string, scopeKey: string): void {
        const generation = ++loadGeneration;
        dataSource.cancel();
        state = { status: "loading", stayDate };
        renderCurrentState();
        void dataSource.load(stayDate, asOfDate, scopeKey).then((result) => {
            if (
                stopped
                || generation !== loadGeneration
                || activeStayDate !== stayDate
                || activeAsOfDate !== asOfDate
            ) {
                return;
            }
            applyLoadResult(result, stayDate);
        });
    }

    function applyLoadResult(result: BookingCurveReferenceDataLoadResult, stayDate: string): void {
        if (result.status === "error") {
            if (result.reason === "aborted") {
                return;
            }
            activeData = null;
            state = { status: "error", stayDate, reason: result.reason };
            renderCurrentState();
            return;
        }
        const facilityHints = readLiveFacilityContextHints(documentHost);
        if (!hasLiveFacilityContextLabel(facilityHints, result.facilityLabel)) {
            activeData = null;
            activeRankSnapshot = null;
            rankLoadError = null;
            rankLoading = false;
            rankLoadGeneration += 1;
            rankStatusDataSource.reset();
            contextBlocked = true;
            state = { status: "error", stayDate, reason: "facility-context-mismatch" };
            removeBookingCurveReferenceArtifacts(documentHost);
            root = null;
            mountTarget = null;
            documentHost.documentElement.setAttribute(
                NEXT_BOOKING_CURVE_STATE_ATTRIBUTE,
                "suspended-facility-context-mismatch"
            );
            return;
        }
        contextBlocked = false;
        activeData = result;
        selectedScopeKey = result.scope.key;
        rebuildState();
    }

    function rebuildState(): void {
        if (activeData === null) {
            return;
        }
        const rankHistory = resolveRankHistory(activeData.scope);
        const model = buildBookingCurveReferenceViewModel({
            asOfDate: activeData.asOfDate,
            facilityId: activeData.facilityId,
            readStatus: activeData.readStatus,
            records: activeData.records,
            rankEvents: rankHistory.status === "ready" ? rankHistory.events : [],
            scope: activeData.scope,
            scopes: activeData.scopes,
            secondarySegment,
            stayDate: activeData.stayDate,
            visibility
        });
        state = model.status === "ready"
            ? { status: "ready", rankHistory, viewModel: model.viewModel }
            : {
                status: "empty",
                controls: { scope: activeData.scope, scopes: activeData.scopes },
                rankHistory,
                stayDate: activeData.stayDate,
                reason: model.reason
            };
        renderCurrentState();
        if (
            activeData.scope.kind === "roomGroup"
            && activeRankSnapshot === null
            && rankLoadError === null
            && !rankLoading
        ) {
            startRankLoad(activeData.facilityId, activeData.stayDate);
        }
    }

    function resolveRankHistory(
        scope: BookingCurveReferenceViewModel["scope"]
    ): BookingCurveRankHistoryViewState {
        if (scope.kind !== "roomGroup") {
            return { status: "scope-required" };
        }
        if (activeRankSnapshot !== null) {
            return buildBookingCurveRankHistoryViewState(activeRankSnapshot, scope);
        }
        if (rankLoadError !== null) {
            return { status: "error", reason: rankLoadError };
        }
        return { status: "loading" };
    }

    function startRankLoad(facilityId: string, stayDate: string): void {
        const generation = ++rankLoadGeneration;
        rankLoading = true;
        rankLoadError = null;
        rebuildState();
        void rankStatusDataSource.load(facilityId, stayDate).then((result) => {
            if (
                stopped
                || generation !== rankLoadGeneration
                || activeStayDate !== stayDate
                || activeData?.facilityId !== facilityId
            ) {
                return;
            }
            rankLoading = false;
            if (result.status === "error") {
                rankLoadError = result.reason;
                activeRankSnapshot = null;
            } else {
                activeRankSnapshot = result.snapshot;
                rankLoadError = null;
            }
            rebuildState();
        });
    }

    function ensureMountedRoot(target: HTMLElement): void {
        const candidates = Array.from(
            documentHost.querySelectorAll<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_ROOT_ATTRIBUTE}]`)
        );
        if (candidates.length > 1) {
            stop("suspended-duplicate-root");
            return;
        }
        const candidate = candidates[0] ?? null;
        if (candidate !== null && candidate.parentElement !== target) {
            candidate.remove();
        }
        if (root?.isConnected !== true || root.parentElement !== target) {
            root = candidate?.parentElement === target
                ? candidate
                : createBookingCurveReferenceRoot(documentHost);
            target.append(root);
            mountTarget = target;
            ensureBookingCurveReferenceStyles(documentHost);
            renderCurrentState();
            return;
        }
        ensureBookingCurveReferenceStyles(documentHost);
    }

    function renderCurrentState(): void {
        if (root === null || !root.isConnected || mountTarget === null) {
            return;
        }
        const renderState: BookingCurveReferenceRenderState = state.status === "idle"
            ? { status: "loading", stayDate: activeStayDate ?? "" }
            : state;
        renderBookingCurveReference(root, renderState, { narrow });
        documentHost.documentElement.setAttribute(
            NEXT_BOOKING_CURVE_STATE_ATTRIBUTE,
            state.status === "ready" ? "mounted-local-reference" : state.status
        );
    }

    function handleDocumentClick(event: MouseEvent): void {
        if (stopped || root === null || !(event.target instanceof Element) || !root.contains(event.target)) {
            return;
        }
        const scopeButton = event.target.closest<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_SCOPE_ATTRIBUTE}]`);
        if (scopeButton !== null) {
            const scopeKey = scopeButton.getAttribute(BOOKING_CURVE_REFERENCE_SCOPE_ATTRIBUTE) ?? "";
            if (
                scopeKey !== ""
                && scopeKey !== selectedScopeKey
                && activeStayDate !== null
                && activeAsOfDate !== null
            ) {
                event.preventDefault();
                selectedScopeKey = scopeKey;
                startLoad(activeStayDate, activeAsOfDate, selectedScopeKey);
            }
            return;
        }
        const segmentButton = event.target.closest<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE}]`);
        if (segmentButton !== null) {
            const value = segmentButton.getAttribute(BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE);
            if (value === "transient" || value === "group") {
                event.preventDefault();
                secondarySegment = value;
                rebuildState();
                root?.querySelector<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE}="${value}"]`)
                    ?.focus({ preventScroll: true });
            }
            return;
        }
        const visibilityButton = event.target.closest<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE}]`);
        if (visibilityButton === null) {
            return;
        }
        const value = visibilityButton.getAttribute(BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE);
        if (value !== "recent" && value !== "seasonal") {
            return;
        }
        event.preventDefault();
        visibility = { ...visibility, [value]: !visibility[value] };
        rebuildState();
        root?.querySelector<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE}="${value}"]`)
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

    function scheduleDataRefresh(): void {
        if (
            stopped
            || activeStayDate === null
            || activeAsOfDate === null
            || scheduledDataRefreshTimer !== null
        ) {
            return;
        }
        scheduledDataRefreshTimer = windowHost.setTimeout(() => {
            scheduledDataRefreshTimer = null;
            if (stopped || activeStayDate === null || activeAsOfDate === null) {
                return;
            }
            const stayDate = activeStayDate;
            const asOfDate = activeAsOfDate;
            const generation = ++loadGeneration;
            void dataSource.load(stayDate, asOfDate, selectedScopeKey).then((result) => {
                if (
                    stopped
                    || generation !== loadGeneration
                    || activeStayDate !== stayDate
                    || activeAsOfDate !== asOfDate
                    || result.status !== "ready"
                ) {
                    return;
                }
                applyLoadResult(result, stayDate);
            });
        }, 1_500);
    }

    function suspendForInactiveRoute(): void {
        loadGeneration += 1;
        rankLoadGeneration += 1;
        dataSource.reset();
        rankStatusDataSource.reset();
        activeData = null;
        activeRankSnapshot = null;
        rankLoadError = null;
        rankLoading = false;
        contextBlocked = false;
        activeStayDate = null;
        activeAsOfDate = null;
        selectedScopeKey = "hotel";
        secondarySegment = "transient";
        visibility = { recent: true, seasonal: false };
        state = { status: "idle" };
        removeBookingCurveReferenceArtifacts(documentHost);
        root = null;
        mountTarget = null;
        documentHost.documentElement.setAttribute(NEXT_BOOKING_CURVE_STATE_ATTRIBUTE, "suspended-route");
    }

    function suspendForInactiveSurface(finalState: string): void {
        loadGeneration += 1;
        rankLoadGeneration += 1;
        dataSource.cancel();
        rankStatusDataSource.cancel();
        activeData = null;
        rankLoading = false;
        contextBlocked = false;
        state = { status: "idle" };
        removeBookingCurveReferenceArtifacts(documentHost);
        root = null;
        mountTarget = null;
        documentHost.documentElement.setAttribute(NEXT_BOOKING_CURVE_STATE_ATTRIBUTE, finalState);
    }

    function removeMountedRoot(): void {
        root?.remove();
        root = null;
        mountTarget = null;
    }

    function stop(finalState = "stopped-local-reference"): void {
        if (stopped) {
            return;
        }
        stopped = true;
        loadGeneration += 1;
        rankLoadGeneration += 1;
        unsubscribeDataSource();
        dataSource.stop();
        rankStatusDataSource.stop();
        abortController.abort();
        observer.disconnect();
        if (scheduledReconcileTimer !== null) {
            windowHost.clearTimeout(scheduledReconcileTimer);
            scheduledReconcileTimer = null;
        }
        if (scheduledDataRefreshTimer !== null) {
            windowHost.clearTimeout(scheduledDataRefreshTimer);
            scheduledDataRefreshTimer = null;
        }
        removeBookingCurveReferenceArtifacts(documentHost);
        root = null;
        mountTarget = null;
        documentHost.documentElement.setAttribute(NEXT_BOOKING_CURVE_STATE_ATTRIBUTE, finalState);
    }
}

export function resolveBookingCurveReferenceMountTarget(documentHost: Document): HTMLElement | null {
    const mainHeader = documentHost.querySelector<HTMLElement>(BOOKING_CURVE_MAIN_HEADER_SELECTOR);
    if (mainHeader === null || !isVisiblyRendered(mainHeader)) {
        return null;
    }
    const target = mainHeader.parentElement;
    if (!(target instanceof HTMLElement)) {
        return null;
    }
    const subHeader = target.querySelector<HTMLElement>(BOOKING_CURVE_SUB_HEADER_SELECTOR);
    return subHeader !== null && isVisiblyRendered(subHeader) ? target : null;
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
