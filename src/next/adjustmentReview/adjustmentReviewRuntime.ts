import { detectLegacyClassicRuntime } from "../runtimeLease";
import { shouldReconcileForDomMutations } from "../runtimeDomMutation";
import {
    collectLiveCalendarDom,
    type LiveCalendarDomSnapshot
} from "../live/liveCalendarDomAdapter";
import type {
    AdjustmentReviewDataSnapshot,
    AdjustmentReviewDataSource
} from "./adjustmentReviewDataSource";
import {
    ADJUSTMENT_REVIEW_ANALYZE_TRIGGER_ATTRIBUTE,
    writePendingAdjustmentReviewFocus
} from "./adjustmentReviewFocus";
import {
    ADJUSTMENT_REVIEW_INITIAL_HORIZON,
    buildAdjustmentReviewScopeKey,
    buildAdjustmentReviewViewModelFromEvaluatedEvents,
    createInitialAdjustmentReviewFilters,
    evaluateAdjustmentReviewEvents,
    isSameAdjustmentReviewStayDate,
    sortEvaluatedAdjustmentReviewEvents,
    type AdjustmentReviewDirection,
    type AdjustmentReviewFilters,
    type AdjustmentReviewHorizon,
    type AdjustmentReviewObservationState,
    type AdjustmentReviewSort,
    type AdjustmentReviewViewModel,
    type EvaluatedAdjustmentReviewEvent
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
const ADJUSTMENT_REVIEW_EVALUATION_SCOPE_BATCH_SIZE = 8;

type ReadyAdjustmentReviewData = Extract<AdjustmentReviewDataSnapshot, { status: "ready" }>;

interface AdjustmentReviewEvaluationRequest {
    data: ReadyAdjustmentReviewData;
    key: string;
    scopeSignatures: ReadonlyMap<string, string>;
}

interface AdjustmentReviewEvaluationCache {
    asOfDate: string;
    contextKey: string;
    evaluatedEvents: readonly EvaluatedAdjustmentReviewEvent[];
    key: string;
    scopeSignatures: ReadonlyMap<string, string>;
}

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
    let evaluationCache: AdjustmentReviewEvaluationCache | null = null;
    let evaluationEpoch = 0;
    let evaluationQueue: AdjustmentReviewEvaluationRequest | null = null;
    let evaluationRunning = false;
    let evaluationRunningKey: string | null = null;
    let evaluationTimer: number | null = null;
    let expandedStayDates = new Set<string>();
    let filters = createInitialAdjustmentReviewFilters();
    let filtersExpanded = true;
    let horizon: AdjustmentReviewHorizon = ADJUSTMENT_REVIEW_INITIAL_HORIZON;
    let model: AdjustmentReviewViewModel | null = null;
    let modelCacheKey: string | null = null;
    let root: HTMLElement | null = null;
    let lastRenderKey: string | null = null;
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
        const existingRoot = candidates[0] ?? null;
        root = existingRoot ?? createAdjustmentReviewRoot(documentHost);
        if (existingRoot === null) {
            lastRenderKey = null;
        }
        if (
            root.parentElement !== calendarSnapshot.mountParent
            || root.previousElementSibling !== calendarSnapshot.mountBoundary
        ) {
            calendarSnapshot.mountBoundary.insertAdjacentElement("afterend", root);
        }
        const data = options.dataSource.getSnapshot();
        const nextContextKey = data.status === "ready" ? data.contextKey : null;
        if (nextContextKey !== null && currentContextKey !== nextContextKey) {
            evaluationEpoch += 1;
            currentContextKey = nextContextKey;
            expandedStayDates = new Set();
            filters = createInitialAdjustmentReviewFilters();
            horizon = ADJUSTMENT_REVIEW_INITIAL_HORIZON;
            sort = "default";
            visibleLimit = ADJUSTMENT_REVIEW_INITIAL_VISIBLE_LIMIT;
            evaluationCache = null;
            model = null;
            modelCacheKey = null;
            lastRenderKey = null;
        }
        if (data.status === "ready") {
            const evaluationRequest = createEvaluationRequest(data);
            if (evaluationCache?.key !== evaluationRequest.key) {
                scheduleEvaluation(evaluationRequest);
            }
            const availableEvaluation = evaluationCache?.contextKey === data.contextKey
                ? evaluationCache
                : null;
            if (availableEvaluation === null) {
                model = null;
                modelCacheKey = null;
            } else {
                const nextModelCacheKey = buildModelCacheKey(availableEvaluation.key);
                if (model === null || modelCacheKey !== nextModelCacheKey) {
                    model = buildAdjustmentReviewViewModelFromEvaluatedEvents({
                        evaluatedEvents: availableEvaluation.evaluatedEvents,
                        filters,
                        horizon,
                        sort
                    });
                    modelCacheKey = nextModelCacheKey;
                }
            }
        } else {
            if (
                currentContextKey !== null
                || evaluationCache !== null
                || evaluationQueue !== null
            ) {
                evaluationEpoch += 1;
                currentContextKey = null;
                evaluationCache = null;
                evaluationQueue = null;
                lastRenderKey = null;
            }
            model = null;
            modelCacheKey = null;
        }
        const nextRenderKey = buildRenderKey(data);
        if (lastRenderKey === nextRenderKey) {
            return;
        }
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
        lastRenderKey = nextRenderKey;
        restoreFocusToken(root, focusToken);
    }

    function scheduleEvaluation(request: AdjustmentReviewEvaluationRequest): void {
        if (
            stopped
            || evaluationCache?.key === request.key
            || evaluationQueue?.key === request.key
            || evaluationRunningKey === request.key
        ) {
            return;
        }
        evaluationQueue = request;
        scheduleEvaluationRun();
    }

    function scheduleEvaluationRun(): void {
        if (stopped || evaluationRunning || evaluationTimer !== null || evaluationQueue === null) {
            return;
        }
        evaluationTimer = windowHost.setTimeout(() => {
            evaluationTimer = null;
            void runEvaluationQueue();
        }, 0);
    }

    async function runEvaluationQueue(): Promise<void> {
        const request = evaluationQueue;
        if (stopped || evaluationRunning || request === null) {
            return;
        }
        evaluationQueue = null;
        evaluationRunning = true;
        evaluationRunningKey = request.key;
        const expectedEpoch = evaluationEpoch;
        try {
            const nextEvaluation = await prepareEvaluationRequest(
                request,
                evaluationCache,
                windowHost
            );
            if (!stopped && evaluationEpoch === expectedEpoch) {
                evaluationCache = nextEvaluation;
                modelCacheKey = null;
                scheduleReconcile();
            }
        } finally {
            evaluationRunning = false;
            evaluationRunningKey = null;
            scheduleEvaluationRun();
        }
    }

    function buildModelCacheKey(evaluationKey: string): string {
        return JSON.stringify([
            evaluationKey,
            filters.actorName,
            filters.adjustmentDateFrom,
            filters.adjustmentDateTo,
            filters.direction,
            filters.observation,
            filters.roomGroupId,
            filters.stayMonth,
            filters.weekday,
            horizon,
            sort
        ]);
    }

    function buildRenderKey(data: AdjustmentReviewDataSnapshot): string {
        return JSON.stringify([
            data.status,
            data.status === "error" ? data.reason : null,
            modelCacheKey,
            filtersExpanded,
            visibleLimit,
            [...expandedStayDates].sort(),
            calendarSnapshot?.dateFingerprint ?? null,
            calendarSnapshot?.cells.map((cell) => [cell.stayDate, cell.analyzeHref]) ?? []
        ]);
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
        const anchor = calendarSnapshot?.cells.find((cell) => (
            isSameAdjustmentReviewStayDate(cell.stayDate, stayDate)
        ))?.anchor;
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
        evaluationEpoch += 1;
        evaluationCache = null;
        evaluationQueue = null;
        model = null;
        modelCacheKey = null;
        currentContextKey = null;
        calendarSnapshot = null;
        root?.remove();
        root = null;
        lastRenderKey = null;
    }

    function stop(): void {
        if (stopped) {
            return;
        }
        stopped = true;
        evaluationEpoch += 1;
        evaluationQueue = null;
        if (evaluationTimer !== null) {
            windowHost.clearTimeout(evaluationTimer);
            evaluationTimer = null;
        }
        if (scheduledReconcileTimer !== null) {
            windowHost.clearTimeout(scheduledReconcileTimer);
            scheduledReconcileTimer = null;
        }
        abortController.abort();
        observer.disconnect();
        unsubscribeData();
        options.dataSource.stop();
        root?.remove();
        root = null;
    }
}

function createEvaluationRequest(
    data: ReadyAdjustmentReviewData
): AdjustmentReviewEvaluationRequest {
    const eventsByScope = new Map<string, typeof data.events[number][]>();
    const recordsByScope = new Map<string, typeof data.records[number][]>();
    const roomById = new Map(data.rooms.map((room) => [room.roomGroupId, room]));

    for (const event of data.events) {
        const scopeKey = buildAdjustmentReviewScopeKey(event);
        const scoped = eventsByScope.get(scopeKey) ?? [];
        scoped.push(event);
        eventsByScope.set(scopeKey, scoped);
    }
    for (const record of data.records) {
        if (record.scope !== "roomGroup" || record.roomGroupId === null) {
            continue;
        }
        const scopeKey = buildAdjustmentReviewScopeKey({
            roomGroupId: record.roomGroupId,
            stayDate: record.stayDate
        });
        const scoped = recordsByScope.get(scopeKey) ?? [];
        scoped.push(record);
        recordsByScope.set(scopeKey, scoped);
    }

    const scopeSignatures = new Map(Array.from(eventsByScope.keys()).sort().map((scopeKey) => {
        const events = [...(eventsByScope.get(scopeKey) ?? [])]
            .sort((left, right) => left.eventKey.localeCompare(right.eventKey));
        const records = [...(recordsByScope.get(scopeKey) ?? [])]
            .sort((left, right) => left.recordKey.localeCompare(right.recordKey));
        const room = roomById.get(events[0]?.roomGroupId ?? "") ?? null;
        return [scopeKey, JSON.stringify([
            room === null ? null : [room.roomGroupId, room.roomGroupName, room.order],
            events.map((event) => [
                event.eventKey,
                event.actorName,
                event.afterRankName,
                event.beforeRankName,
                event.daysBeforeStay,
                event.direction,
                event.directionSource,
                event.reflectedAt,
                event.reflectedDate,
                event.roomGroupId,
                event.stayDate
            ]),
            records.map((record) => [
                record.recordKey,
                record.sourceKey,
                record.asOfDate,
                record.fetchedAt,
                record.response.booking_curve?.length ?? 0
            ])
        ])] as const;
    }));

    return {
        data,
        key: JSON.stringify([
            data.contextKey,
            data.asOfDate,
            Array.from(scopeSignatures)
        ]),
        scopeSignatures
    };
}

async function prepareEvaluationRequest(
    request: AdjustmentReviewEvaluationRequest,
    previous: AdjustmentReviewEvaluationCache | null,
    windowHost: Window
): Promise<AdjustmentReviewEvaluationCache> {
    const canReuse = previous !== null
        && previous.contextKey === request.data.contextKey
        && previous.asOfDate === request.data.asOfDate;
    const changedScopes = new Set<string>();
    if (canReuse) {
        for (const [scopeKey, signature] of request.scopeSignatures) {
            if (previous.scopeSignatures.get(scopeKey) !== signature) {
                changedScopes.add(scopeKey);
            }
        }
        for (const scopeKey of previous.scopeSignatures.keys()) {
            if (!request.scopeSignatures.has(scopeKey)) {
                changedScopes.add(scopeKey);
            }
        }
    } else {
        for (const scopeKey of request.scopeSignatures.keys()) {
            changedScopes.add(scopeKey);
        }
    }

    const eventsByScope = new Map<string, typeof request.data.events[number][]>();
    const recordsByScope = new Map<string, typeof request.data.records[number][]>();
    for (const event of request.data.events) {
        const scopeKey = buildAdjustmentReviewScopeKey(event);
        const scoped = eventsByScope.get(scopeKey) ?? [];
        scoped.push(event);
        eventsByScope.set(scopeKey, scoped);
    }
    for (const record of request.data.records) {
        if (record.scope !== "roomGroup" || record.roomGroupId === null) {
            continue;
        }
        const scopeKey = buildAdjustmentReviewScopeKey({
            roomGroupId: record.roomGroupId,
            stayDate: record.stayDate
        });
        const scoped = recordsByScope.get(scopeKey) ?? [];
        scoped.push(record);
        recordsByScope.set(scopeKey, scoped);
    }

    const retained = canReuse
        ? previous.evaluatedEvents.filter((event) => (
            !changedScopes.has(buildAdjustmentReviewScopeKey(event))
        ))
        : [];
    const evaluated: EvaluatedAdjustmentReviewEvent[] = [];
    const currentChangedScopes = Array.from(request.scopeSignatures.keys())
        .filter((scopeKey) => changedScopes.has(scopeKey))
        .sort();
    for (
        let offset = 0;
        offset < currentChangedScopes.length;
        offset += ADJUSTMENT_REVIEW_EVALUATION_SCOPE_BATCH_SIZE
    ) {
        const batchScopes = currentChangedScopes.slice(
            offset,
            offset + ADJUSTMENT_REVIEW_EVALUATION_SCOPE_BATCH_SIZE
        );
        const batchEvents = batchScopes.flatMap((scopeKey) => eventsByScope.get(scopeKey) ?? []);
        const batchRecords = batchScopes.flatMap((scopeKey) => recordsByScope.get(scopeKey) ?? []);
        const roomGroupIds = new Set(batchEvents.map((event) => event.roomGroupId));
        evaluated.push(...evaluateAdjustmentReviewEvents({
            asOfDate: request.data.asOfDate,
            events: batchEvents,
            records: batchRecords,
            rooms: request.data.rooms.filter((room) => roomGroupIds.has(room.roomGroupId))
        }));
        if (offset + ADJUSTMENT_REVIEW_EVALUATION_SCOPE_BATCH_SIZE < currentChangedScopes.length) {
            await yieldToAdjustmentReviewEvaluation(windowHost);
        }
    }

    return {
        asOfDate: request.data.asOfDate,
        contextKey: request.data.contextKey,
        evaluatedEvents: sortEvaluatedAdjustmentReviewEvents([...retained, ...evaluated]),
        key: request.key,
        scopeSignatures: request.scopeSignatures
    };
}

function yieldToAdjustmentReviewEvaluation(windowHost: Window): Promise<void> {
    return new Promise((resolve) => windowHost.setTimeout(resolve, 0));
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
