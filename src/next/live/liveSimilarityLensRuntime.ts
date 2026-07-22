import { detectLegacyClassicRuntime } from "../runtimeLease";
import {
    collectLiveCalendarDom,
    hasLiveFacilityContextLabel,
    parseStayDateFromCalendarTestId,
    type LiveCalendarDomSnapshot
} from "./liveCalendarDomAdapter";
import {
    createLiveSimilarityLensDataSource,
    type LiveSimilarityLensDataSource
} from "./liveSimilarityLensDataSource";
import {
    armLiveSimilarityLens,
    cancelLiveSimilarityLensSelection,
    clearLiveSimilarityLensBaseDate,
    createInitialLiveSimilarityLensState,
    selectLiveSimilarityLensBaseDate,
    selectLiveSimilarityLensRoomGroup,
    toggleLiveSimilarityLensComparisonDate,
    type LiveSimilarityLensState
} from "./liveSimilarityLensState";
import type {
    LiveSimilarityLensEvidenceLoadState,
    LiveSimilarityLensReadyViewModel
} from "./liveSimilarityLensViewModel";
import {
    createLiveSimilarityLensRoot,
    ensureLiveSimilarityLensStyles,
    LIVE_SIMILARITY_LENS_ANALYZE_TRIGGER_ATTRIBUTE,
    LIVE_SIMILARITY_LENS_INSTRUCTION_ID,
    LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE,
    removeLiveSimilarityLensArtifacts,
    renderLiveSimilarityLens,
    syncLiveCalendarDecorations,
    type LiveSimilarityLensDisclosureState
} from "./liveSimilarityLensView";

const NEXT_LIVE_STATE_ATTRIBUTE = "data-ra-next-live-state";

export interface LiveSimilarityLensRuntimeHandle {
    getState(): LiveSimilarityLensState;
    reconcile(): void;
    stop(): void;
}

export interface StartLiveSimilarityLensRuntimeOptions {
    dataSource?: LiveSimilarityLensDataSource;
    isCalendarRoute?: (location: Location) => boolean;
}

export function isLiveSimilarityLensCalendarRoute(pathname: string): boolean {
    return pathname.trim() === "" || pathname === "/";
}

export function invalidateLiveSimilarityLensRuntimeSelection(
    currentGeneration: number
): {
    evidenceState: LiveSimilarityLensEvidenceLoadState;
    generation: number;
    state: LiveSimilarityLensState;
} {
    return {
        evidenceState: { status: "idle" },
        generation: currentGeneration + 1,
        state: clearLiveSimilarityLensBaseDate()
    };
}

export function startLiveSimilarityLensRuntime(
    documentHost: Document = document,
    windowHost: Window = window,
    options: StartLiveSimilarityLensRuntimeOptions = {}
): LiveSimilarityLensRuntimeHandle {
    let state = createInitialLiveSimilarityLensState();
    let evidenceState: LiveSimilarityLensEvidenceLoadState = { status: "idle" };
    let evidenceGeneration = 0;
    let readyViewModel: LiveSimilarityLensReadyViewModel | null = null;
    let snapshot: LiveCalendarDomSnapshot | null = null;
    let root: HTMLElement | null = null;
    let stopped = false;
    let scheduledReconcileTimer: number | null = null;
    let rovingDate: string | null = null;
    let pendingRoomGroupFocus = false;
    let pendingRoomGroupFocusAnchor: HTMLAnchorElement | null = null;
    let activeFacilityLabel: string | null = null;
    let routeSuspended = false;
    let disclosureState: LiveSimilarityLensDisclosureState = {
        comparisonExpanded: null,
        matchListExpanded: null
    };
    let selectedFocusability: { anchor: HTMLAnchorElement; tabIndex: string | null } | null = null;
    const originalAccessibilityByCell = new Map<HTMLAnchorElement, {
        describedBy: string | null;
        role: string | null;
        tabIndex: string | null;
    }>();

    const dataSource = options.dataSource ?? createLiveSimilarityLensDataSource({ documentHost, windowHost });
    const isCalendarRoute = options.isCalendarRoute
        ?? ((location: Location) => isLiveSimilarityLensCalendarRoute(location.pathname));
    const abortController = new AbortController();
    const observer = new MutationObserver(scheduleReconcile);

    documentHost.addEventListener("click", handleDocumentClick, {
        capture: true,
        signal: abortController.signal
    });
    documentHost.addEventListener("keydown", handleDocumentKeydown, {
        capture: true,
        signal: abortController.signal
    });
    documentHost.addEventListener("change", handleDocumentChange, {
        capture: true,
        signal: abortController.signal
    });
    documentHost.addEventListener("toggle", handleDocumentToggle, {
        capture: true,
        signal: abortController.signal
    });
    windowHost.addEventListener("popstate", scheduleReconcile, {
        signal: abortController.signal
    });
    observer.observe(documentHost.body, {
        attributeFilter: [
            "aria-hidden",
            "class",
            "data-ra-group-room-toggle",
            "data-ra-monthly-progress-preview-root",
            "data-ra-rank-recommendation-analyze-list",
            "data-ra-rank-recommendation-list",
            "data-ra-rank-recommendation-react-island-host",
            "data-ra-sales-setting-current-ui-root",
            "data-testid",
            "hidden",
            "id",
            "inert",
            "style"
        ],
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true
    });
    reconcile();

    return {
        getState: () => ({
            ...state,
            selectedComparisonDates: [...state.selectedComparisonDates]
        }),
        reconcile,
        stop
    };

    function reconcile(): void {
        if (stopped) {
            return;
        }
        if (detectLegacyClassicRuntime(documentHost)) {
            stop("suspended-classic-detected");
            return;
        }
        if (!isCalendarRoute(windowHost.location)) {
            suspendForInactiveRoute();
            return;
        }
        routeSuspended = false;

        const rootCandidates = Array.from(
            documentHost.querySelectorAll<HTMLElement>(`[${LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE}]`)
        );
        if (rootCandidates.length > 1) {
            stop("suspended-duplicate-root");
            return;
        }

        const result = collectLiveCalendarDom(documentHost);
        if (!result.ok) {
            const invalidated = invalidateLiveSimilarityLensRuntimeSelection(evidenceGeneration);
            state = invalidated.state;
            evidenceState = invalidated.evidenceState;
            evidenceGeneration = invalidated.generation;
            rovingDate = null;
            snapshot = null;
            readyViewModel = null;
            pendingRoomGroupFocus = false;
            pendingRoomGroupFocusAnchor = null;
            activeFacilityLabel = null;
            resetDisclosureState();
            root?.remove();
            root = null;
            restoreCalendarTabIndexes();
            restoreSelectedBaseFocusability();
            syncLiveCalendarDecorations(documentHost, null, state, null);
            documentHost.documentElement.setAttribute(
                NEXT_LIVE_STATE_ATTRIBUTE,
                `suspended-${result.reason}`
            );
            return;
        }

        const previousSnapshot = snapshot;
        const previousFingerprint = previousSnapshot?.dateFingerprint ?? null;
        snapshot = result.snapshot;
        let stateChanged = false;
        const facilityContextChanged = previousSnapshot !== null
            && previousSnapshot.calendarStrip !== snapshot.calendarStrip;
        const activeFacilityContextMissing = activeFacilityLabel !== null
            && !hasLiveFacilityContextLabel(snapshot.facilityContextHints, activeFacilityLabel);
        if (
            state.baseDate !== null
            && (
                facilityContextChanged
                || activeFacilityContextMissing
                ||
                !snapshot.cells.some((cell) => cell.stayDate === state.baseDate)
                || (previousFingerprint !== null && previousFingerprint !== snapshot.dateFingerprint)
            )
        ) {
            const invalidated = invalidateLiveSimilarityLensRuntimeSelection(evidenceGeneration);
            state = invalidated.state;
            evidenceState = invalidated.evidenceState;
            evidenceGeneration = invalidated.generation;
            readyViewModel = null;
            rovingDate = null;
            pendingRoomGroupFocus = false;
            pendingRoomGroupFocusAnchor = null;
            activeFacilityLabel = null;
            resetDisclosureState();
            stateChanged = true;
        }
        ensureLiveSimilarityLensStyles(documentHost);
        root = rootCandidates[0] ?? createLiveSimilarityLensRoot(documentHost);
        if (root.parentElement !== snapshot.mountParent || root.nextElementSibling !== snapshot.mountBoundary) {
            snapshot.mountBoundary.insertAdjacentElement("beforebegin", root);
        }
        const focusedAction = getFocusedLensAction(documentHost, root);
        if (
            root.childElementCount === 0
            || previousFingerprint !== snapshot.dateFingerprint
            || stateChanged
        ) {
            readyViewModel = renderLiveSimilarityLens(root, state, evidenceState, snapshot, disclosureState);
            captureDisclosureState();
            if (focusedAction !== null) {
                root.querySelector<HTMLElement>(`[${focusedAction}]`)?.focus({ preventScroll: true });
            }
        }
        syncCalendarTabIndexes();
        syncLiveCalendarDecorations(
            documentHost,
            snapshot,
            state,
            readyViewModel,
            evidenceState.status === "ready" ? evidenceState.evidence.calendarGroups : []
        );
        syncSelectedBaseFocusability();
        documentHost.documentElement.setAttribute(NEXT_LIVE_STATE_ATTRIBUTE, "mounted-read-only");
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
        if (!routeSuspended) {
            const invalidated = invalidateLiveSimilarityLensRuntimeSelection(evidenceGeneration);
            state = invalidated.state;
            evidenceState = invalidated.evidenceState;
            evidenceGeneration = invalidated.generation;
            rovingDate = null;
            readyViewModel = null;
            pendingRoomGroupFocus = false;
            pendingRoomGroupFocusAnchor = null;
            activeFacilityLabel = null;
            resetDisclosureState();
            routeSuspended = true;
        }
        restoreCalendarTabIndexes();
        restoreSelectedBaseFocusability();
        removeLiveSimilarityLensArtifacts(documentHost);
        root = null;
        snapshot = null;
        documentHost.documentElement.setAttribute(NEXT_LIVE_STATE_ATTRIBUTE, "suspended-route");
    }

    function handleDocumentClick(event: MouseEvent): void {
        if (stopped || !(event.target instanceof Element)) {
            return;
        }
        const currentRoot = event.target.closest<HTMLElement>(
            `[${LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE}]`
        );
        if (currentRoot !== null) {
            const analyzeTrigger = event.target.closest<HTMLElement>(
                `[${LIVE_SIMILARITY_LENS_ANALYZE_TRIGGER_ATTRIBUTE}]`
            );
            if (analyzeTrigger !== null) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const stayDate = analyzeTrigger.getAttribute(
                    LIVE_SIMILARITY_LENS_ANALYZE_TRIGGER_ATTRIBUTE
                );
                const nativeCell = stayDate === null
                    ? undefined
                    : snapshot?.cells.find((cell) => cell.stayDate === stayDate);
                if (nativeCell === undefined) {
                    return;
                }
                if (state.mode === "armed") {
                    state = cancelLiveSimilarityLensSelection(state);
                    renderCurrentState();
                }
                nativeCell.anchor.click();
                scheduleReconcile();
                return;
            }
            const armButton = event.target.closest<HTMLElement>("[data-ra-next-lens-arm]");
            if (armButton !== null) {
                event.preventDefault();
                state = state.mode === "armed"
                    ? cancelLiveSimilarityLensSelection(state)
                    : armLiveSimilarityLens(state);
                renderCurrentState();
                if (state.mode === "armed") {
                    focusRovingCalendarCell();
                } else {
                    focusArmButton();
                }
                return;
            }
            const clearButton = event.target.closest<HTMLElement>("[data-ra-next-lens-clear]");
            if (clearButton !== null) {
                event.preventDefault();
                state = clearLiveSimilarityLensBaseDate();
                evidenceState = { status: "idle" };
                evidenceGeneration += 1;
                readyViewModel = null;
                rovingDate = null;
                pendingRoomGroupFocus = false;
                pendingRoomGroupFocusAnchor = null;
                activeFacilityLabel = null;
                resetDisclosureState();
                renderCurrentState();
                focusArmButton();
            }
            return;
        }
        if (state.mode !== "armed" || snapshot === null) {
            return;
        }
        const dateAnchor = event.target.closest<HTMLAnchorElement>(
            'a[data-testid^="calendar-date-"]'
        );
        if (dateAnchor === null || !snapshot.cells.some((cell) => cell.anchor === dateAnchor)) {
            return;
        }
        const stayDate = parseStayDateFromCalendarTestId(dateAnchor.getAttribute("data-testid"));
        if (stayDate === null) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        selectBaseDate(dateAnchor, stayDate, false);
    }

    function handleDocumentKeydown(event: KeyboardEvent): void {
        if (state.mode !== "armed") {
            return;
        }
        if (!(event.target instanceof Element)) {
            return;
        }
        const targetDateAnchor = event.target.closest<HTMLAnchorElement>(
            'a[data-testid^="calendar-date-"]'
        );
        const isCurrentCalendarCell = targetDateAnchor !== null
            && snapshot?.cells.some((cell) => cell.anchor === targetDateAnchor) === true;
        const isLensAction = root?.contains(event.target) === true;
        if (event.key === "Escape") {
            if (!isCurrentCalendarCell && !isLensAction) {
                return;
            }
            event.preventDefault();
            state = cancelLiveSimilarityLensSelection(state);
            renderCurrentState();
            focusArmButton();
            return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || snapshot === null) {
            return;
        }
        if (targetDateAnchor === null) {
            return;
        }
        const currentIndex = snapshot.cells.findIndex((cell) => cell.anchor === targetDateAnchor);
        if (currentIndex < 0) {
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            const stayDate = snapshot.cells[currentIndex]?.stayDate ?? null;
            if (stayDate === null) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            selectBaseDate(targetDateAnchor, stayDate, true);
            return;
        }
        const offset = getCalendarKeyboardOffset(event.key);
        if (offset === null) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const nextIndex = Math.max(0, Math.min(snapshot.cells.length - 1, currentIndex + offset));
        const nextCell = snapshot.cells[nextIndex];
        if (nextCell === undefined) {
            return;
        }
        rovingDate = nextCell.stayDate;
        syncCalendarTabIndexes();
        nextCell.anchor.focus();
    }

    function handleDocumentChange(event: Event): void {
        if (stopped || !(event.target instanceof Element) || root === null || !root.contains(event.target)) {
            return;
        }
        const roomGroupSelect = event.target.closest<HTMLSelectElement>("[data-ra-next-lens-room-group]");
        if (roomGroupSelect !== null) {
            state = selectLiveSimilarityLensRoomGroup(state, roomGroupSelect.value);
            renderCurrentState();
            root.querySelector<HTMLSelectElement>("[data-ra-next-lens-room-group]")?.focus({ preventScroll: true });
            return;
        }
        const comparisonInput = event.target.closest<HTMLInputElement>("[data-ra-next-lens-compare-date]");
        const stayDate = comparisonInput?.getAttribute("data-ra-next-lens-compare-date") ?? null;
        if (comparisonInput === null || stayDate === null) {
            return;
        }
        state = toggleLiveSimilarityLensComparisonDate(state, stayDate);
        renderCurrentState();
        root.querySelector<HTMLInputElement>(
            `[data-ra-next-lens-compare-date="${stayDate}"]`
        )?.focus({ preventScroll: true });
    }

    function handleDocumentToggle(event: Event): void {
        if (!(event.target instanceof HTMLDetailsElement) || root?.contains(event.target) !== true) {
            return;
        }
        if (event.target.matches("[data-ra-next-lens-results]")) {
            disclosureState.matchListExpanded = event.target.open;
        } else if (event.target.matches("[data-ra-next-lens-comparison]")) {
            disclosureState.comparisonExpanded = event.target.open;
        }
    }

    function renderCurrentState(): void {
        if (root !== null) {
            readyViewModel = renderLiveSimilarityLens(root, state, evidenceState, snapshot, disclosureState);
            captureDisclosureState();
        }
        syncCalendarTabIndexes();
        syncLiveCalendarDecorations(
            documentHost,
            snapshot,
            state,
            readyViewModel,
            evidenceState.status === "ready" ? evidenceState.evidence.calendarGroups : []
        );
        syncSelectedBaseFocusability();
    }

    function selectBaseDate(
        dateAnchor: HTMLAnchorElement,
        stayDate: string,
        focusRoomGroupWhenReady: boolean
    ): void {
        dateAnchor.focus({ preventScroll: true });
        state = selectLiveSimilarityLensBaseDate(state, stayDate);
        evidenceState = { status: "loading" };
        readyViewModel = null;
        rovingDate = stayDate;
        pendingRoomGroupFocus = focusRoomGroupWhenReady;
        pendingRoomGroupFocusAnchor = focusRoomGroupWhenReady ? dateAnchor : null;
        resetDisclosureState();
        renderCurrentState();
        dateAnchor.focus({ preventScroll: true });
        loadSelectedDateEvidence();
    }

    function loadSelectedDateEvidence(): void {
        if (snapshot === null || state.baseDate === null) {
            return;
        }
        const generation = ++evidenceGeneration;
        const expectedFingerprint = snapshot.dateFingerprint;
        const visibleStayDates = snapshot.cells.map((cell) => cell.stayDate);
        void dataSource.load(visibleStayDates).then((result) => {
            if (
                stopped
                || generation !== evidenceGeneration
                || snapshot?.dateFingerprint !== expectedFingerprint
                || state.baseDate === null
            ) {
                return;
            }
            if (
                result.status === "ready"
                && !hasLiveFacilityContextLabel(snapshot.facilityContextHints, result.facilityLabel)
            ) {
                const invalidated = invalidateLiveSimilarityLensRuntimeSelection(evidenceGeneration);
                state = invalidated.state;
                evidenceState = invalidated.evidenceState;
                evidenceGeneration = invalidated.generation;
                readyViewModel = null;
                rovingDate = null;
                pendingRoomGroupFocus = false;
                pendingRoomGroupFocusAnchor = null;
                activeFacilityLabel = null;
                resetDisclosureState();
                renderCurrentState();
                return;
            }
            activeFacilityLabel = result.status === "ready" ? result.facilityLabel : null;
            evidenceState = result.status === "ready"
                ? { status: "ready", evidence: result.evidence, contextKey: result.contextKey }
                : { status: "error", reason: result.reason };
            if (result.status !== "ready") {
                pendingRoomGroupFocus = false;
                pendingRoomGroupFocusAnchor = null;
            }
            renderCurrentState();
            if (pendingRoomGroupFocus && evidenceState.status === "ready") {
                const shouldMoveFocus = shouldFocusRoomGroupAfterLoad(
                    pendingRoomGroupFocusAnchor,
                    documentHost.activeElement,
                    state.mode
                );
                pendingRoomGroupFocus = false;
                pendingRoomGroupFocusAnchor = null;
                if (shouldMoveFocus) {
                    root?.querySelector<HTMLSelectElement>("[data-ra-next-lens-room-group]")
                        ?.focus();
                }
            }
        });
    }

    function syncCalendarTabIndexes(): void {
        if (state.mode !== "armed" || snapshot === null) {
            restoreCalendarTabIndexes();
            return;
        }
        const currentAnchors = new Set(snapshot.cells.map((cell) => cell.anchor));
        if (
            originalAccessibilityByCell.size > 0
            && Array.from(originalAccessibilityByCell.keys()).some(
                (anchor) => !currentAnchors.has(anchor)
            )
        ) {
            restoreCalendarTabIndexes();
        }
        for (const cell of snapshot.cells) {
            if (!originalAccessibilityByCell.has(cell.anchor)) {
                originalAccessibilityByCell.set(cell.anchor, {
                    describedBy: cell.anchor.getAttribute("aria-describedby"),
                    role: cell.anchor.getAttribute("role"),
                    tabIndex: cell.anchor.getAttribute("tabindex")
                });
            }
        }
        const activeCell = resolveRovingCalendarCell(snapshot, state.baseDate, rovingDate);
        rovingDate = activeCell?.stayDate ?? null;
        for (const cell of snapshot.cells) {
            const original = originalAccessibilityByCell.get(cell.anchor);
            restoreAttribute(cell.anchor, "role", original?.role ?? null);
            restoreAttribute(cell.anchor, "aria-describedby", original?.describedBy ?? null);
            cell.anchor.tabIndex = cell.anchor === activeCell?.anchor ? 0 : -1;
        }
        if (activeCell !== null && activeCell !== undefined) {
            activeCell.anchor.setAttribute("role", "button");
            appendDescriptionToken(activeCell.anchor, LIVE_SIMILARITY_LENS_INSTRUCTION_ID);
        }
    }

    function restoreCalendarTabIndexes(): void {
        for (const [anchor, original] of originalAccessibilityByCell) {
            restoreAttribute(anchor, "tabindex", original.tabIndex);
            restoreAttribute(anchor, "role", original.role);
            restoreAttribute(anchor, "aria-describedby", original.describedBy);
        }
        originalAccessibilityByCell.clear();
    }

    function focusRovingCalendarCell(): void {
        if (snapshot === null) {
            return;
        }
        const cell = snapshot.cells.find((candidate) => candidate.stayDate === rovingDate);
        cell?.anchor.focus();
    }

    function focusArmButton(): void {
        root?.querySelector<HTMLElement>("[data-ra-next-lens-arm]")?.focus();
    }

    function captureDisclosureState(): void {
        const matchList = root?.querySelector<HTMLDetailsElement>("[data-ra-next-lens-results]") ?? null;
        const comparison = root?.querySelector<HTMLDetailsElement>("[data-ra-next-lens-comparison]") ?? null;
        if (matchList !== null) {
            disclosureState.matchListExpanded = matchList.open;
        }
        if (comparison !== null) {
            disclosureState.comparisonExpanded = comparison.open;
        }
    }

    function resetDisclosureState(): void {
        disclosureState = {
            comparisonExpanded: null,
            matchListExpanded: null
        };
    }

    function syncSelectedBaseFocusability(): void {
        if (state.mode === "armed") {
            return;
        }
        const selectedCell = state.baseDate === null
            ? null
            : snapshot?.cells.find((cell) => cell.stayDate === state.baseDate) ?? null;
        if (selectedCell === null) {
            restoreSelectedBaseFocusability();
            return;
        }
        if (selectedFocusability?.anchor !== selectedCell.anchor) {
            restoreSelectedBaseFocusability();
            selectedFocusability = {
                anchor: selectedCell.anchor,
                tabIndex: selectedCell.anchor.getAttribute("tabindex")
            };
        }
        selectedCell.anchor.tabIndex = 0;
    }

    function restoreSelectedBaseFocusability(): void {
        if (selectedFocusability === null) {
            return;
        }
        restoreAttribute(
            selectedFocusability.anchor,
            "tabindex",
            selectedFocusability.tabIndex
        );
        selectedFocusability = null;
    }

    function stop(finalState = "stopped-read-only"): void {
        if (stopped) {
            return;
        }
        stopped = true;
        evidenceGeneration += 1;
        dataSource.stop();
        abortController.abort();
        observer.disconnect();
        if (scheduledReconcileTimer !== null) {
            windowHost.clearTimeout(scheduledReconcileTimer);
            scheduledReconcileTimer = null;
        }
        restoreCalendarTabIndexes();
        restoreSelectedBaseFocusability();
        removeLiveSimilarityLensArtifacts(documentHost);
        documentHost.documentElement.setAttribute(NEXT_LIVE_STATE_ATTRIBUTE, finalState);
        root = null;
        snapshot = null;
        readyViewModel = null;
        pendingRoomGroupFocus = false;
        pendingRoomGroupFocusAnchor = null;
        activeFacilityLabel = null;
    }
}

export function shouldFocusRoomGroupAfterLoad(
    initiatingAnchor: HTMLAnchorElement | null,
    activeElement: Element | null,
    stateMode: LiveSimilarityLensState["mode"]
): boolean {
    return stateMode === "selected"
        && initiatingAnchor !== null
        && activeElement === initiatingAnchor;
}

function resolveRovingCalendarCell(
    snapshot: LiveCalendarDomSnapshot,
    baseDate: string | null,
    rovingDate: string | null
) {
    const preferredDates = [rovingDate, baseDate, getLocalStayDate()];
    for (const preferredDate of preferredDates) {
        if (preferredDate === null) {
            continue;
        }
        const cell = snapshot.cells.find((candidate) => candidate.stayDate === preferredDate);
        if (cell !== undefined) {
            return cell;
        }
    }
    const today = getLocalStayDate();
    return snapshot.cells.find((cell) => cell.stayDate >= today) ?? snapshot.cells[0] ?? null;
}

function getCalendarKeyboardOffset(key: string): number | null {
    if (key === "ArrowLeft") {
        return -1;
    }
    if (key === "ArrowRight") {
        return 1;
    }
    if (key === "ArrowUp") {
        return -7;
    }
    if (key === "ArrowDown") {
        return 7;
    }
    return null;
}

function getLocalStayDate(): string {
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getFocusedLensAction(documentHost: Document, root: HTMLElement): string | null {
    const activeElement = documentHost.activeElement;
    if (!(activeElement instanceof Element) || !root.contains(activeElement)) {
        return null;
    }
    if (activeElement.hasAttribute("data-ra-next-lens-arm")) {
        return "data-ra-next-lens-arm";
    }
    if (activeElement.hasAttribute("data-ra-next-lens-clear")) {
        return "data-ra-next-lens-clear";
    }
    return null;
}

function appendDescriptionToken(element: HTMLElement, token: string): void {
    const tokens = new Set((element.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean));
    tokens.add(token);
    element.setAttribute("aria-describedby", Array.from(tokens).join(" "));
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) {
        element.removeAttribute(name);
        return;
    }
    element.setAttribute(name, value);
}
