import { detectLegacyClassicRuntime } from "../runtimeLease";
import { shouldReconcileForDomMutations } from "../runtimeDomMutation";
import {
    hasLiveFacilityContextLabel,
    readLiveFacilityContextHints
} from "../live/liveCalendarDomAdapter";
import { parseLiveSimilarityLensAsOfDate } from "../live/liveSimilarityLensDataSource";
import {
    createBookingCurveReferenceDataSource,
    type BookingCurveReferenceDataLoadResult,
    type BookingCurveReferenceDataSource,
    type BookingCurveReferenceScope
} from "./bookingCurveReferenceDataSource";
import {
    buildBookingCurveReferenceViewModel,
    type BookingCurveAdjustmentRankOrderState,
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
    createBookingCurveRankOrderDataSource,
    type BookingCurveRankOrderDataSource,
    type BookingCurveRankOrderLoadResult
} from "./bookingCurveRankOrderDataSource";
import type { BookingCurveRankOrderSnapshot } from "./bookingCurveRankOrderModel";
import {
    createBookingCurveRankStatusDataSource,
    type BookingCurveRankStatusDataSource,
    type BookingCurveRankStatusLoadResult
} from "./bookingCurveRankStatusDataSource";
import {
    parseBookingCurveReferenceAnalyzeStayDate,
    shouldStartBookingCurveRankOrderLoad
} from "./bookingCurveReferenceRuntime";
import {
    BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE,
    BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE
} from "./bookingCurveReferenceView";
import {
    buildSalesSettingClassicViewModel,
    type SalesSettingClassicRankState
} from "./salesSettingClassicModel";
import {
    SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE,
    SALES_SETTING_CLASSIC_ROOT_ATTRIBUTE,
    SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE,
    SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE,
    createSalesSettingClassicRoot,
    ensureSalesSettingClassicStyles,
    removeSalesSettingClassicArtifacts,
    renderSalesSettingClassic,
    type SalesSettingClassicNativeCard
} from "./salesSettingClassicView";

const NEXT_SALES_SETTING_STATE_ATTRIBUTE = "data-ra-next-sales-setting-classic-state";
const SALES_SETTING_HEADING_SELECTOR = '[data-testid="suggestions-heading"]';
const SALES_SETTING_ROOM_LABEL_SELECTOR = '[data-testid="suggestions-room-type-name"]';
const SALES_SETTING_LATEST_REFLECTION_SELECTOR = '[data-testid="suggestions-latest-reflection-at"]';
const SALES_SETTING_DETAIL_SELECTOR = '[data-testid="suggestions-detail-wrapper"]';

type SalesSettingClassicRuntimeState = "idle" | "loading" | "ready";

export interface SalesSettingClassicRuntimeHandle {
    reconcile(): void;
    stop(): void;
}

export interface StartSalesSettingClassicRuntimeOptions {
    dataSource?: BookingCurveReferenceDataSource;
    rankOrderDataSource?: BookingCurveRankOrderDataSource;
    rankStatusDataSource?: BookingCurveRankStatusDataSource;
    resolveAsOfDate?: (documentHost: Document) => string | null;
    resolveStayDate?: (location: Location) => string | null;
}

export function shouldStartSalesSettingRankOrderLoad(options: {
    active: boolean;
    hasError: boolean;
    hasSnapshot: boolean;
    loading: boolean;
    open: boolean;
    rankHistory: BookingCurveRankHistoryViewState;
    scopeKind: BookingCurveReferenceViewModel["scope"]["kind"];
}): boolean {
    return options.active && options.open && shouldStartBookingCurveRankOrderLoad(options);
}

export interface SalesSettingClassicSurface {
    insertionAnchor: HTMLElement;
    mountTarget: HTMLElement;
    nativeCards: readonly Omit<SalesSettingClassicNativeCard, "scopeKey">[];
}

export function startSalesSettingClassicRuntime(
    documentHost: Document = document,
    windowHost: Window = window,
    options: StartSalesSettingClassicRuntimeOptions = {}
): SalesSettingClassicRuntimeHandle {
    const dataSource = options.dataSource ?? createBookingCurveReferenceDataSource({
        documentHost,
        windowHost
    });
    const rankStatusDataSource = options.rankStatusDataSource
        ?? createBookingCurveRankStatusDataSource({ windowHost });
    const rankOrderDataSource = options.rankOrderDataSource
        ?? createBookingCurveRankOrderDataSource({ windowHost });
    const resolveStayDate = options.resolveStayDate
        ?? ((location: Location) => parseBookingCurveReferenceAnalyzeStayDate(location.pathname));
    const resolveAsOfDate = options.resolveAsOfDate ?? parseLiveSimilarityLensAsOfDate;
    let state: SalesSettingClassicRuntimeState = "idle";
    let activeStayDate: string | null = null;
    let activeAsOfDate: string | null = null;
    let activeScopes: readonly BookingCurveReferenceScope[] = [];
    let activeData = new Map<string, Extract<BookingCurveReferenceDataLoadResult, { status: "ready" }>>();
    let activeCurves = new Map<string, BookingCurveReferenceViewModel>();
    let activeRankSnapshot: BookingCurveRankStatusSnapshot | null = null;
    let activeRankOrderSnapshot: BookingCurveRankOrderSnapshot | null = null;
    let rankLoadError: Extract<BookingCurveRankStatusLoadResult, { status: "error" }>["reason"] | null = null;
    let rankOrderLoadError: Extract<BookingCurveRankOrderLoadResult, { status: "error" }>["reason"] | null = null;
    let rankFacilityId: string | null = null;
    let rankOrderFacilityId: string | null = null;
    let rankLoading = false;
    let rankOrderLoading = false;
    let scopeBatchLoading = false;
    let initialScopeBatchLoading = false;
    let root: HTMLElement | null = null;
    let surface: SalesSettingClassicSurface | null = null;
    let contextBlocked = false;
    let loadGeneration = 0;
    let rankGeneration = 0;
    let rankOrderGeneration = 0;
    let scheduledReconcileTimer: number | null = null;
    let scheduledDataRefreshTimer: number | null = null;
    let narrow = windowHost.innerWidth <= 680;
    let stopped = false;
    const openScopes = new Set<string>();
    const secondarySegments = new Map<string, BookingCurveReferenceSecondarySegment>();
    const visibilities = new Map<string, BookingCurveReferenceVisibility>();
    const abortController = new AbortController();
    const observer = new MutationObserver((records) => {
        if (shouldReconcileForDomMutations(records)) {
            scheduleReconcile();
        }
    });
    const unsubscribeDataSource = dataSource.subscribe?.(scheduleDataRefresh) ?? (() => undefined);

    documentHost.addEventListener("click", handleDocumentClick, {
        capture: true,
        signal: abortController.signal
    });
    windowHost.addEventListener("load", scheduleReconcile, { signal: abortController.signal });
    windowHost.addEventListener("pageshow", scheduleReconcile, { signal: abortController.signal });
    windowHost.addEventListener("popstate", scheduleReconcile, { signal: abortController.signal });
    windowHost.addEventListener("resize", handleResize, { signal: abortController.signal });
    documentHost.addEventListener("visibilitychange", scheduleReconcile, { signal: abortController.signal });
    observer.observe(documentHost.body, {
        attributeFilter: ["aria-hidden", "aria-selected", "class", "data-testid", "hidden", "inert", "style"],
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
        if (activeStayDate !== null && activeStayDate !== stayDate) {
            resetContext(stayDate, null);
        }
        const nextSurface = resolveSalesSettingClassicSurface(documentHost);
        if (documentHost.visibilityState === "hidden") {
            suspendForInactiveSurface("suspended-hidden");
            return;
        }
        if (nextSurface === null) {
            waitForNativeSalesSettingSurface();
            return;
        }
        const asOfDate = resolveAsOfDate(documentHost);
        if (activeStayDate !== stayDate || activeAsOfDate !== asOfDate) {
            resetContext(stayDate, asOfDate);
        }
        if (contextBlocked) {
            removeSalesSettingClassicArtifacts(documentHost);
            root = null;
            surface = null;
            setRuntimeMarker("suspended-facility-context-mismatch");
            return;
        }
        surface = nextSurface;
        ensureMountedRoot(nextSurface);
        if (asOfDate === null) {
            renderCurrentState();
            setRuntimeMarker("comparison-preparing");
            return;
        }
        if (state === "ready") {
            const hotelData = activeData.get("hotel");
            if (
                hotelData !== undefined
                && !rankLoading
                && activeRankSnapshot === null
                && rankLoadError === null
            ) {
                startRankLoad(hotelData.facilityId, stayDate);
            } else {
                maybeStartRankOrderLoad();
            }
        }
        if (state === "idle") {
            startLoadAll(stayDate, asOfDate, true);
            return;
        }
        if (root !== null && state === "ready") {
            const mappedCards = mapNativeCards(nextSurface.nativeCards, activeScopes);
            const expectedSupplements = mappedCards.length;
            const presentSupplements = mappedCards.filter((card) => (
                Array.from(card.cardElement.children).some((child) => (
                    child instanceof HTMLElement && child.hasAttribute(SALES_SETTING_CLASSIC_SUPPLEMENT_ATTRIBUTE)
                ))
            )).length;
            if (presentSupplements !== expectedSupplements) {
                renderCurrentState();
            }
        }
    }

    function resetContext(stayDate: string, asOfDate: string | null): void {
        loadGeneration += 1;
        rankGeneration += 1;
        rankOrderGeneration += 1;
        dataSource.reset();
        rankStatusDataSource.reset();
        rankOrderDataSource.reset();
        activeStayDate = stayDate;
        activeAsOfDate = asOfDate;
        activeScopes = [];
        activeData = new Map();
        activeCurves = new Map();
        activeRankSnapshot = null;
        activeRankOrderSnapshot = null;
        rankLoadError = null;
        rankOrderLoadError = null;
        rankFacilityId = null;
        rankOrderFacilityId = null;
        rankLoading = false;
        rankOrderLoading = false;
        scopeBatchLoading = false;
        initialScopeBatchLoading = false;
        contextBlocked = false;
        state = "idle";
        openScopes.clear();
        secondarySegments.clear();
        visibilities.clear();
        removeMountedArtifacts();
    }

    function startLoadAll(stayDate: string, asOfDate: string, showLoading: boolean): void {
        const generation = ++loadGeneration;
        dataSource.cancel();
        scopeBatchLoading = true;
        initialScopeBatchLoading = showLoading;
        if (showLoading) {
            state = "loading";
            renderCurrentState();
        }
        void loadAllScopes(generation, stayDate, asOfDate);
    }

    async function loadAllScopes(generation: number, stayDate: string, asOfDate: string): Promise<void> {
        const hotelResult = await dataSource.load(stayDate, asOfDate, "hotel");
        if (!isCurrentLoad(generation, stayDate, asOfDate)) {
            return;
        }
        if (hotelResult.status === "error") {
            scopeBatchLoading = false;
            initialScopeBatchLoading = false;
            if (hotelResult.reason !== "aborted") {
                state = "ready";
                renderCurrentState();
                setRuntimeMarker(hotelResult.reason === "facility-context-mismatch"
                    ? "suspended-facility-context-mismatch"
                    : "comparison-preparing");
            }
            return;
        }
        if (!hasLiveFacilityContextLabel(readLiveFacilityContextHints(documentHost), hotelResult.facilityLabel)) {
            blockMismatchedContext();
            return;
        }
        activeScopes = hotelResult.scopes;
        activeData.set(hotelResult.scope.key, hotelResult);
        ensurePreference(hotelResult.scope.key);
        state = "ready";
        rebuildCurves();
        renderCurrentState();
        startRankLoad(hotelResult.facilityId, stayDate);

        for (const scope of activeScopes) {
            if (scope.kind !== "roomGroup") {
                continue;
            }
            const result = await dataSource.load(stayDate, asOfDate, scope.key);
            if (!isCurrentLoad(generation, stayDate, asOfDate)) {
                return;
            }
            if (result.status === "ready") {
                activeData.set(scope.key, result);
                ensurePreference(scope.key);
            } else if (result.reason === "facility-context-mismatch") {
                blockMismatchedContext();
                return;
            }
        }
        scopeBatchLoading = false;
        initialScopeBatchLoading = false;
        rebuildCurves();
        renderCurrentState();
        maybeStartRankOrderLoad();
        setRuntimeMarker("mounted-classic-ui");
    }

    function isCurrentLoad(generation: number, stayDate: string, asOfDate: string): boolean {
        return !stopped
            && generation === loadGeneration
            && activeStayDate === stayDate
            && activeAsOfDate === asOfDate;
    }

    function ensurePreference(scopeKey: string): void {
        if (!secondarySegments.has(scopeKey)) {
            secondarySegments.set(scopeKey, "transient");
        }
        if (!visibilities.has(scopeKey)) {
            visibilities.set(scopeKey, { recent: true, seasonal: true });
        }
    }

    function rebuildCurves(): void {
        const curves = new Map<string, BookingCurveReferenceViewModel>();
        for (const [scopeKey, data] of activeData) {
            const rankHistory = resolveRankHistory(data.scope);
            const rankOrder = resolveRankOrder(data.scope);
            const result = buildBookingCurveReferenceViewModel({
                asOfDate: data.asOfDate,
                facilityId: data.facilityId,
                readStatus: data.readStatus,
                records: data.records,
                rankEvents: rankHistory.status === "ready" ? rankHistory.events : [],
                rankHistory,
                rankOrder,
                scope: data.scope,
                scopes: data.scopes,
                secondarySegment: secondarySegments.get(scopeKey) ?? "transient",
                stayDate: data.stayDate,
                visibility: visibilities.get(scopeKey) ?? { recent: true, seasonal: true }
            });
            if (result.status === "ready") {
                curves.set(scopeKey, result.viewModel);
            }
        }
        activeCurves = curves;
    }

    function resolveRankHistory(scope: BookingCurveReferenceScope): BookingCurveRankHistoryViewState {
        if (scope.kind !== "roomGroup") {
            return { status: "scope-required" } as const;
        }
        if (activeRankSnapshot !== null) {
            return buildBookingCurveRankHistoryViewState(activeRankSnapshot, scope);
        }
        if (rankLoadError !== null) {
            return { status: "error", reason: rankLoadError } as const;
        }
        return rankLoading ? { status: "loading" } as const : { status: "empty", invalidEventCount: 0 } as const;
    }

    function resolveRankOrder(scope: BookingCurveReferenceScope): BookingCurveAdjustmentRankOrderState {
        if (scope.kind !== "roomGroup") {
            return { status: "error" };
        }
        if (activeRankOrderSnapshot !== null) {
            return { status: "ready", entries: activeRankOrderSnapshot.entries };
        }
        if (rankOrderLoadError !== null) {
            return { status: "error" };
        }
        return { status: "loading" };
    }

    function startRankLoad(facilityId: string, stayDate: string): void {
        if (rankLoading || activeRankSnapshot !== null || rankLoadError !== null) {
            return;
        }
        const generation = ++rankGeneration;
        rankFacilityId = facilityId;
        rankLoading = true;
        rebuildCurves();
        if (!scopeBatchLoading) {
            renderCurrentState();
        }
        void rankStatusDataSource.load(facilityId, stayDate).then((result) => {
            if (
                stopped
                || generation !== rankGeneration
                || activeStayDate !== stayDate
                || rankFacilityId !== facilityId
            ) {
                return;
            }
            rankLoading = false;
            if (result.status === "ready") {
                activeRankSnapshot = result.snapshot;
                rankLoadError = null;
            } else if (result.reason !== "aborted") {
                activeRankSnapshot = null;
                rankLoadError = result.reason;
            }
            rebuildCurves();
            if (!scopeBatchLoading) {
                renderCurrentState();
            }
            maybeStartRankOrderLoad();
        });
    }

    function maybeStartRankOrderLoad(): void {
        const active = !stopped
            && documentHost.visibilityState !== "hidden"
            && root !== null
            && root.isConnected
            && surface !== null
            && isVisiblyRendered(surface.insertionAnchor);
        if (!active) {
            return;
        }
        for (const scopeKey of openScopes) {
            const data = activeData.get(scopeKey);
            if (data === undefined) {
                continue;
            }
            const rankHistory = resolveRankHistory(data.scope);
            if (shouldStartSalesSettingRankOrderLoad({
                active,
                hasError: rankOrderLoadError !== null,
                hasSnapshot: activeRankOrderSnapshot !== null,
                loading: rankOrderLoading,
                open: true,
                rankHistory,
                scopeKind: data.scope.kind
            })) {
                startRankOrderLoad(data.facilityId);
                return;
            }
        }
    }

    function startRankOrderLoad(facilityId: string): void {
        const generation = ++rankOrderGeneration;
        rankOrderFacilityId = facilityId;
        rankOrderLoading = true;
        rankOrderLoadError = null;
        rebuildCurves();
        if (!scopeBatchLoading) {
            renderCurrentState();
        }
        void rankOrderDataSource.load(facilityId).then((result) => {
            if (
                stopped
                || generation !== rankOrderGeneration
                || rankOrderFacilityId !== facilityId
            ) {
                return;
            }
            rankOrderLoading = false;
            if (result.status === "ready") {
                activeRankOrderSnapshot = result.snapshot;
                rankOrderLoadError = null;
            } else {
                activeRankOrderSnapshot = null;
                rankOrderLoadError = result.reason;
            }
            rebuildCurves();
            if (!scopeBatchLoading) {
                renderCurrentState();
            }
        });
    }

    function rankState(): SalesSettingClassicRankState {
        return {
            error: rankLoadError,
            loading: rankLoading,
            snapshot: activeRankSnapshot
        };
    }

    function ensureMountedRoot(nextSurface: SalesSettingClassicSurface): void {
        const candidates = Array.from(
            documentHost.querySelectorAll<HTMLElement>(`[${SALES_SETTING_CLASSIC_ROOT_ATTRIBUTE}]`)
        );
        if (candidates.length > 1) {
            stop("suspended-duplicate-root");
            return;
        }
        const candidate = candidates[0] ?? null;
        if (candidate !== null && candidate.parentElement !== nextSurface.mountTarget) {
            candidate.remove();
        }
        if (root?.isConnected !== true || root.parentElement !== nextSurface.mountTarget) {
            root = candidate?.parentElement === nextSurface.mountTarget
                ? candidate
                : createSalesSettingClassicRoot(documentHost);
            nextSurface.mountTarget.insertBefore(root, nextSurface.insertionAnchor);
            ensureSalesSettingClassicStyles(documentHost);
            renderCurrentState();
            return;
        }
        if (root.nextElementSibling !== nextSurface.insertionAnchor) {
            nextSurface.mountTarget.insertBefore(root, nextSurface.insertionAnchor);
        }
        ensureSalesSettingClassicStyles(documentHost);
    }

    function renderCurrentState(): void {
        if (root === null || !root.isConnected || surface === null) {
            return;
        }
        const nativeCards = mapNativeCards(surface.nativeCards, activeScopes);
        if (state !== "ready" || activeStayDate === null) {
            renderSalesSettingClassic(
                root,
                { status: "loading", stayDate: activeStayDate ?? "" },
                nativeCards.length > 0 ? nativeCards : surface.nativeCards.map((card, index) => ({
                    ...card,
                    scopeKey: `pending:${index}`
                })),
                { narrow, openScopes }
            );
            return;
        }
        const model = buildSalesSettingClassicViewModel({
            curves: Array.from(activeCurves.values()),
            rankState: rankState(),
            scopes: activeScopes,
            stayDate: activeStayDate,
            todayDate: getLocalTodayDate()
        });
        renderSalesSettingClassic(root, { status: "ready", viewModel: model }, nativeCards, {
            narrow,
            openScopes
        });
    }

    function handleDocumentClick(event: MouseEvent): void {
        if (stopped || !(event.target instanceof Element)) {
            return;
        }
        const curveToggle = event.target.closest<HTMLElement>(`[${SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE}]`);
        if (curveToggle !== null) {
            const scopeKey = curveToggle.getAttribute(SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE) ?? "";
            if (scopeKey !== "") {
                event.preventDefault();
                if (openScopes.has(scopeKey)) {
                    openScopes.delete(scopeKey);
                } else {
                    openScopes.add(scopeKey);
                }
                renderCurrentState();
                maybeStartRankOrderLoad();
                focusControl(SALES_SETTING_CLASSIC_CURVE_TOGGLE_ATTRIBUTE, scopeKey, scopeKey);
            }
            return;
        }
        const segmentButton = event.target.closest<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE}]`);
        if (segmentButton !== null) {
            const value = segmentButton.getAttribute(BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE);
            const scopeKey = resolveControlScope(segmentButton);
            if (scopeKey !== null && (value === "transient" || value === "group")) {
                event.preventDefault();
                secondarySegments.set(scopeKey, value);
                rebuildCurves();
                renderCurrentState();
                focusControl(BOOKING_CURVE_REFERENCE_SEGMENT_ATTRIBUTE, value, scopeKey);
            }
            return;
        }
        const visibilityButton = event.target.closest<HTMLElement>(`[${BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE}]`);
        if (visibilityButton === null) {
            return;
        }
        const value = visibilityButton.getAttribute(BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE);
        const scopeKey = resolveControlScope(visibilityButton);
        if (scopeKey === null || (value !== "recent" && value !== "seasonal")) {
            return;
        }
        event.preventDefault();
        const current = visibilities.get(scopeKey) ?? { recent: true, seasonal: true };
        visibilities.set(scopeKey, { ...current, [value]: !current[value] });
        rebuildCurves();
        renderCurrentState();
        focusControl(BOOKING_CURVE_REFERENCE_VISIBILITY_ATTRIBUTE, value, scopeKey);
    }

    function resolveControlScope(control: HTMLElement): string | null {
        return control.closest<HTMLElement>(`[${SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE}]`)
            ?.getAttribute(SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE) ?? null;
    }

    function focusControl(attribute: string, value: string, scopeKey: string): void {
        const scopeElements = documentHost.querySelectorAll<HTMLElement>(`[${SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE}]`);
        for (const scopeElement of scopeElements) {
            if (scopeElement.getAttribute(SALES_SETTING_CLASSIC_SCOPE_ATTRIBUTE) !== scopeKey) {
                continue;
            }
            for (const control of scopeElement.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
                if (control.getAttribute(attribute) === value) {
                    control.focus({ preventScroll: true });
                    return;
                }
            }
        }
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
            || state !== "ready"
            || scopeBatchLoading
            || root === null
            || !root.isConnected
            || surface === null
            || scheduledDataRefreshTimer !== null
        ) {
            return;
        }
        scheduledDataRefreshTimer = windowHost.setTimeout(() => {
            scheduledDataRefreshTimer = null;
            if (
                stopped
                || activeStayDate === null
                || activeAsOfDate === null
                || scopeBatchLoading
                || root === null
                || !root.isConnected
                || surface === null
            ) {
                return;
            }
            startLoadAll(activeStayDate, activeAsOfDate, false);
        }, 1_500);
    }

    function blockMismatchedContext(): void {
        loadGeneration += 1;
        rankGeneration += 1;
        rankOrderGeneration += 1;
        dataSource.cancel();
        rankStatusDataSource.cancel();
        rankOrderDataSource.cancel();
        rankFacilityId = null;
        rankOrderFacilityId = null;
        activeRankOrderSnapshot = null;
        rankOrderLoadError = null;
        rankOrderLoading = false;
        scopeBatchLoading = false;
        initialScopeBatchLoading = false;
        contextBlocked = true;
        removeMountedArtifacts();
        setRuntimeMarker("suspended-facility-context-mismatch");
    }

    function suspendForInactiveRoute(): void {
        if (activeStayDate === null && root === null) {
            setRuntimeMarker("suspended-route");
            return;
        }
        loadGeneration += 1;
        rankGeneration += 1;
        rankOrderGeneration += 1;
        dataSource.reset();
        rankStatusDataSource.reset();
        rankOrderDataSource.reset();
        activeStayDate = null;
        activeAsOfDate = null;
        activeScopes = [];
        activeData = new Map();
        activeCurves = new Map();
        activeRankSnapshot = null;
        activeRankOrderSnapshot = null;
        rankLoadError = null;
        rankOrderLoadError = null;
        rankFacilityId = null;
        rankOrderFacilityId = null;
        rankLoading = false;
        rankOrderLoading = false;
        scopeBatchLoading = false;
        initialScopeBatchLoading = false;
        contextBlocked = false;
        state = "idle";
        openScopes.clear();
        secondarySegments.clear();
        visibilities.clear();
        removeMountedArtifacts();
        setRuntimeMarker("suspended-route");
    }

    function suspendForInactiveSurface(finalState: string): void {
        if (rankLoading) {
            rankGeneration += 1;
            rankStatusDataSource.cancel();
            activeRankSnapshot = null;
            rankLoadError = null;
            rankFacilityId = null;
            rankLoading = false;
            rebuildCurves();
        }
        if (rankOrderLoading) {
            rankOrderGeneration += 1;
            rankOrderDataSource.cancel();
            activeRankOrderSnapshot = null;
            rankOrderLoadError = null;
            rankOrderFacilityId = null;
            rankOrderLoading = false;
            rebuildCurves();
        }
        rankStatusDataSource.cancel();
        rankOrderDataSource.cancel();
        cancelScopeBatchForInactiveSurface();
        if (root === null) {
            setRuntimeMarker(finalState);
            return;
        }
        if (state === "loading") {
            loadGeneration += 1;
            rankGeneration += 1;
            dataSource.cancel();
            rankStatusDataSource.reset();
            state = "idle";
            activeData = new Map();
            activeCurves = new Map();
            activeScopes = [];
            activeRankSnapshot = null;
            rankLoadError = null;
            rankLoading = false;
            scopeBatchLoading = false;
            initialScopeBatchLoading = false;
        }
        removeMountedArtifacts();
        setRuntimeMarker(finalState);
    }

    function waitForNativeSalesSettingSurface(): void {
        if (scheduledDataRefreshTimer !== null) {
            windowHost.clearTimeout(scheduledDataRefreshTimer);
            scheduledDataRefreshTimer = null;
        }
        cancelScopeBatchForInactiveSurface();
        removeMountedArtifacts();
        setRuntimeMarker("waiting-native-sales-setting");
    }

    function cancelScopeBatchForInactiveSurface(): void {
        if (!scopeBatchLoading) {
            return;
        }
        const clearInitialBatch = initialScopeBatchLoading;
        loadGeneration += 1;
        dataSource.cancel();
        scopeBatchLoading = false;
        initialScopeBatchLoading = false;
        if (clearInitialBatch) {
            state = "idle";
            activeData = new Map();
            activeCurves = new Map();
            activeScopes = [];
        }
    }

    function removeMountedArtifacts(): void {
        removeSalesSettingClassicArtifacts(documentHost);
        root = null;
        surface = null;
    }

    function setRuntimeMarker(value: string): void {
        documentHost.documentElement.setAttribute(NEXT_SALES_SETTING_STATE_ATTRIBUTE, value);
    }

    function stop(finalState = "stopped-classic-ui"): void {
        if (stopped) {
            return;
        }
        stopped = true;
        loadGeneration += 1;
        rankGeneration += 1;
        rankOrderGeneration += 1;
        unsubscribeDataSource();
        dataSource.stop();
        rankStatusDataSource.stop();
        rankOrderDataSource.stop();
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
        removeMountedArtifacts();
        setRuntimeMarker(finalState);
    }
}

export function resolveSalesSettingClassicSurface(documentHost: Document): SalesSettingClassicSurface | null {
    const headings = Array.from(documentHost.querySelectorAll<HTMLElement>(SALES_SETTING_HEADING_SELECTOR))
        .filter(isVisiblyRendered);
    const nativeCards: Omit<SalesSettingClassicNativeCard, "scopeKey">[] = [];
    for (const heading of headings) {
        const cardElement = resolveNativeCardElement(heading);
        if (cardElement === null) {
            continue;
        }
        const roomLabelElement = cardElement.querySelector<HTMLElement>(SALES_SETTING_ROOM_LABEL_SELECTOR);
        const roomLabel = normalizeRoomLabel(roomLabelElement?.textContent ?? "");
        if (roomLabel === "") {
            continue;
        }
        nativeCards.push({
            cardElement,
            detailWrapperElement: cardElement.querySelector<HTMLElement>(SALES_SETTING_DETAIL_SELECTOR),
            latestReflectionElement: cardElement.querySelector<HTMLElement>(SALES_SETTING_LATEST_REFLECTION_SELECTOR),
            roomLabel
        });
    }
    const distinctCards = nativeCards.filter((card, index, all) => (
        all.findIndex((candidate) => candidate.cardElement === card.cardElement) === index
    ));
    const insertionAnchor = distinctCards[0]?.cardElement ?? null;
    const mountTarget = insertionAnchor?.parentElement ?? null;
    return insertionAnchor !== null && mountTarget instanceof HTMLElement
        ? { insertionAnchor, mountTarget, nativeCards: distinctCards }
        : null;
}

function resolveNativeCardElement(heading: HTMLElement): HTMLElement | null {
    let candidate: HTMLElement | null = heading;
    while (candidate !== null && !candidate.matches("main, body, html")) {
        if (
            candidate.querySelector(SALES_SETTING_ROOM_LABEL_SELECTOR) !== null
            && candidate.querySelector(SALES_SETTING_DETAIL_SELECTOR) !== null
            && candidate.querySelectorAll(SALES_SETTING_HEADING_SELECTOR).length === 1
        ) {
            return candidate;
        }
        candidate = candidate.parentElement;
    }
    return heading.parentElement;
}

function mapNativeCards(
    cards: readonly Omit<SalesSettingClassicNativeCard, "scopeKey">[],
    scopes: readonly BookingCurveReferenceScope[]
): SalesSettingClassicNativeCard[] {
    const unmatchedScopes = scopes.filter((scope) => scope.kind === "roomGroup").slice();
    return cards.flatMap((card) => {
        const index = unmatchedScopes.findIndex((scope) => normalizeRoomLabel(scope.label) === card.roomLabel);
        if (index < 0) {
            return [];
        }
        const [scope] = unmatchedScopes.splice(index, 1);
        if (scope === undefined) {
            return [];
        }
        return [{ ...card, scopeKey: scope.key }];
    });
}

function normalizeRoomLabel(value: string): string {
    return value.replace(/\s+/gu, " ").trim();
}

function getLocalTodayDate(): string {
    const date = new Date();
    return [
        String(date.getFullYear()).padStart(4, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("");
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
