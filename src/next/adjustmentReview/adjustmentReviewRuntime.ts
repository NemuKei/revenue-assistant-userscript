import { detectLegacyClassicRuntime } from "../runtimeLease";
import { shouldReconcileForDomMutations } from "../runtimeDomMutation";
import {
    collectLiveCalendarDom,
    type LiveCalendarDomSnapshot
} from "../live/liveCalendarDomAdapter";
import type { AdjustmentReviewDataSource } from "./adjustmentReviewDataSource";
import {
    ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE,
    writePendingAdjustmentReviewFocus
} from "./adjustmentReviewFocus";
import {
    ADJUSTMENT_REVIEW_INITIAL_HORIZON,
    buildAdjustmentReviewViewModel,
    createInitialAdjustmentReviewFilters,
    type AdjustmentReviewDirection,
    type AdjustmentReviewFilters,
    type AdjustmentReviewHorizon,
    type AdjustmentReviewObservationState,
    type AdjustmentReviewSort,
    type AdjustmentReviewViewModel
} from "./adjustmentReviewModel";
import {
    ADJUSTMENT_REVIEW_EXPAND_ATTRIBUTE,
    ADJUSTMENT_REVIEW_FILTER_ATTRIBUTE,
    ADJUSTMENT_REVIEW_HORIZON_ATTRIBUTE,
    ADJUSTMENT_REVIEW_MORE_ATTRIBUTE,
    ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE,
    ADJUSTMENT_REVIEW_SORT_ATTRIBUTE,
    createAdjustmentReviewRoot,
    ensureAdjustmentReviewStyles,
    renderAdjustmentReview
} from "./adjustmentReviewView";

const ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT = 10;

export interface AdjustmentReviewRuntimeHandle {
    reconcile(): void;
    stop(): void;
}

export function startAdjustmentReviewRuntime(
    documentHost: Document,
    windowHost: Window,
    options: {
        dataSource: AdjustmentReviewDataSource;
        isCalendarRoute?: (location: Location) => boolean;
    }
): AdjustmentReviewRuntimeHandle {
    const isCalendarRoute = options.isCalendarRoute
        ?? ((location: Location) => location.pathname.trim() === "" || location.pathname === "/");
    const abortController = new AbortController();
    let calendarSnapshot: LiveCalendarDomSnapshot | null = null;
    let currentContextKey: string | null = null;
    let expandedStayDates = new Set<string>();
    let filters = createInitialAdjustmentReviewFilters();
    let filtersExpanded = true;
    let horizon: AdjustmentReviewHorizon = ADJUSTMENT_REVIEW_INITIAL_HORIZON;
    let model: AdjustmentReviewViewModel | null = null;
    let root: HTMLElement | null = null;
    let scheduledReconcileTimer: number | null = null;
    let sort: AdjustmentReviewSort = "default";
    let stopped = false;
    let visibleLimit = ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT;
    const observer = new MutationObserver((records) => {
        if (shouldReconcileForDomMutations(records)) {
            scheduleReconcile();
        }
    });
    const unsubscribeData = options.dataSource.subscribe(scheduleReconcile);

    documentHost.addEventListener("click", handleClick, {
        capture: true,
        signal: abortController.signal
    });
    documentHost.addEventListener("change", handleChange, {
        capture: true,
        signal: abortController.signal
    });
    documentHost.addEventListener("toggle", handleToggle, {
        capture: true,
        signal: abortController.signal
    });
    windowHost.addEventListener("popstate", scheduleReconcile, {
        signal: abortController.signal
    });
    observer.observe(documentHost.body, {
        attributeFilter: ["aria-hidden", "class", "data-testid", "hidden", "id", "inert", "style"],
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
        if (detectLegacyClassicRuntime(documentHost) || !isCalendarRoute(windowHost.location)) {
            suspend();
            return;
        }
        const candidates = Array.from(documentHost.querySelectorAll<HTMLElement>(
            `[${ADJUSTMENT_REVIEW_ROOT_ATTRIBUTE}]`
        ));
        if (candidates.length > 1) {
            stop();
            return;
        }
        const calendarResult = collectLiveCalendarDom(documentHost);
        if (!calendarResult.ok) {
            suspend();
            return;
        }
        calendarSnapshot = calendarResult.snapshot;
        ensureAdjustmentReviewStyles(documentHost);
        root = candidates[0] ?? createAdjustmentReviewRoot(documentHost);
        if (
            root.parentElement !== calendarSnapshot.mountParent
            || root.previousElementSibling !== calendarSnapshot.mountBoundary
        ) {
            calendarSnapshot.mountBoundary.insertAdjacentElement("afterend", root);
        }
        const data = options.dataSource.getSnapshot();
        const nextContextKey = data.status === "ready" ? data.contextKey : null;
        if (nextContextKey !== null && currentContextKey !== nextContextKey) {
            currentContextKey = nextContextKey;
            expandedStayDates = new Set();
            filters = createInitialAdjustmentReviewFilters();
            horizon = ADJUSTMENT_REVIEW_INITIAL_HORIZON;
            sort = "default";
            visibleLimit = ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT;
        }
        model = data.status === "ready"
            ? buildAdjustmentReviewViewModel({
                asOfDate: data.asOfDate,
                events: data.events,
                filters,
                horizon,
                records: data.records,
                rooms: data.rooms,
                sort
            })
            : null;
        const focusToken = captureFocusToken(root);
        renderAdjustmentReview(root, {
            data,
            expandedStayDates,
            filters,
            filtersExpanded,
            horizon,
            model,
            sort,
            visibleLimit
        }, calendarSnapshot);
        restoreFocusToken(root, focusToken);
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

    function handleClick(event: MouseEvent): void {
        if (!(event.target instanceof Element) || root === null || !root.contains(event.target)) {
            return;
        }
        const horizonButton = event.target.closest<HTMLElement>(
            `[${ADJUSTMENT_REVIEW_HORIZON_ATTRIBUTE}]`
        );
        if (horizonButton !== null) {
            const value = Number(horizonButton.getAttribute(ADJUSTMENT_REVIEW_HORIZON_ATTRIBUTE));
            if (value === 3 || value === 7) {
                horizon = value;
                visibleLimit = ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT;
                renderCurrent(horizonButton);
            }
            return;
        }
        const expandButton = event.target.closest<HTMLElement>(
            `[${ADJUSTMENT_REVIEW_EXPAND_ATTRIBUTE}]`
        );
        if (expandButton !== null) {
            const stayDate = expandButton.getAttribute(ADJUSTMENT_REVIEW_EXPAND_ATTRIBUTE) ?? "";
            if (expandedStayDates.has(stayDate)) {
                expandedStayDates.delete(stayDate);
            } else {
                expandedStayDates.add(stayDate);
            }
            renderCurrent(expandButton);
            return;
        }
        const moreButton = event.target.closest<HTMLElement>(`[${ADJUSTMENT_REVIEW_MORE_ATTRIBUTE}]`);
        if (moreButton !== null) {
            visibleLimit += ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT;
            renderCurrent(moreButton);
            return;
        }
        const analyze = event.target.closest<HTMLElement>(
            `[${ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE}]`
        );
        if (analyze !== null) {
            handleAnalyze(analyze, event);
        }
    }

    function handleAnalyze(element: HTMLElement, event: MouseEvent): void {
        if (
            element.tagName === "A"
            && (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        ) {
            return;
        }
        const stayDate = element.getAttribute("data-stay-date") ?? "";
        const roomGroupId = element.getAttribute("data-room-group-id") ?? "";
        const eventKey = element.getAttribute("data-event-key") ?? "";
        writePendingAdjustmentReviewFocus(windowHost, { eventKey, roomGroupId, stayDate });
        if (element.tagName === "A") {
            return;
        }
        const anchor = calendarSnapshot?.cells.find((cell) => cell.stayDate === stayDate)?.anchor;
        if (anchor !== undefined) {
            event.preventDefault();
            anchor.click();
        }
    }

    function handleChange(event: Event): void {
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) {
            return;
        }
        if (root === null || !root.contains(event.target)) {
            return;
        }
        const sortName = event.target.getAttribute(ADJUSTMENT_REVIEW_SORT_ATTRIBUTE);
        if (sortName !== null) {
            sort = normalizeSort(event.target.value);
            visibleLimit = ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT;
            renderCurrent(event.target);
            return;
        }
        const filterName = event.target.getAttribute(ADJUSTMENT_REVIEW_FILTER_ATTRIBUTE);
        if (filterName === null) {
            return;
        }
        filters = updateFilters(filters, filterName, event.target.value);
        visibleLimit = ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT;
        expandedStayDates.clear();
        renderCurrent(event.target);
    }

    function handleToggle(event: Event): void {
        if (!(event.target instanceof HTMLDetailsElement) || root === null || !root.contains(event.target)) {
            return;
        }
        if (event.target.hasAttribute("data-ra-next-adjustment-review-filters")) {
            filtersExpanded = event.target.open;
        }
    }

    function renderCurrent(focusSource: HTMLElement): void {
        const focusToken = captureElementToken(focusSource);
        reconcile();
        restoreFocusToken(root, focusToken);
    }

    function suspend(): void {
        calendarSnapshot = null;
        root?.remove();
        root = null;
    }

    function stop(): void {
        if (stopped) {
            return;
        }
        stopped = true;
        if (scheduledReconcileTimer !== null) {
            windowHost.clearTimeout(scheduledReconcileTimer);
        }
        abortController.abort();
        observer.disconnect();
        unsubscribeData();
        options.dataSource.stop();
        root?.remove();
        root = null;
    }
}

function updateFilters(
    current: AdjustmentReviewFilters,
    name: string,
    value: string
): AdjustmentReviewFilters {
    switch (name) {
        case "actorName": return { ...current, actorName: value === "" ? null : value };
        case "stayMonth": return { ...current, stayMonth: /^\d{6}$/u.test(value) ? value : null };
        case "weekday": {
            const weekday = Number(value);
            return { ...current, weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
                ? weekday
                : null };
        }
        case "roomGroupId": return { ...current, roomGroupId: value === "" ? null : value };
        case "direction": return {
            ...current,
            direction: isDirection(value) ? value : null
        };
        case "observation": return {
            ...current,
            observation: isObservation(value) ? value : null
        };
        case "adjustmentDateFrom": return {
            ...current,
            adjustmentDateFrom: normalizeInputDate(value)
        };
        case "adjustmentDateTo": return {
            ...current,
            adjustmentDateTo: normalizeInputDate(value)
        };
        default: return current;
    }
}

function normalizeSort(value: string): AdjustmentReviewSort {
    return ["actor", "adjustment-date", "default", "pace-delta", "room-count", "stay-date"]
        .includes(value)
        ? value as AdjustmentReviewSort
        : "default";
}

function isDirection(value: string): value is AdjustmentReviewDirection {
    return value === "raise" || value === "lower" || value === "unknown";
}

function isObservation(value: string): value is AdjustmentReviewObservationState {
    return value === "ready"
        || value === "missing"
        || value === "pending"
        || value === "censored"
        || value === "excluded";
}

function normalizeInputDate(value: string): string | null {
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value.replaceAll("-", "") : null;
}

interface FocusToken {
    attribute: string;
    value: string;
}

function captureFocusToken(root: HTMLElement): FocusToken | null {
    const active = root.ownerDocument.activeElement;
    return active instanceof HTMLElement && root.contains(active)
        ? captureElementToken(active)
        : null;
}

function captureElementToken(element: HTMLElement): FocusToken | null {
    for (const attribute of [
        ADJUSTMENT_REVIEW_HORIZON_ATTRIBUTE,
        ADJUSTMENT_REVIEW_EXPAND_ATTRIBUTE,
        ADJUSTMENT_REVIEW_FILTER_ATTRIBUTE,
        ADJUSTMENT_REVIEW_SORT_ATTRIBUTE,
        ADJUSTMENT_REVIEW_MORE_ATTRIBUTE
    ]) {
        if (element.hasAttribute(attribute)) {
            return { attribute, value: element.getAttribute(attribute) ?? "" };
        }
    }
    return null;
}

function restoreFocusToken(root: HTMLElement | null, token: FocusToken | null): void {
    if (root === null || token === null) {
        return;
    }
    Array.from(root.querySelectorAll<HTMLElement>(`[${token.attribute}]`))
        .find((element) => element.getAttribute(token.attribute) === token.value)
        ?.focus({ preventScroll: true });
}
