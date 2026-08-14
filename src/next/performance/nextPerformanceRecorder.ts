export const NEXT_PERFORMANCE_MARKER_ATTRIBUTE = "data-ra-fetch-performance-summary";
export const NEXT_PERFORMANCE_SCHEMA_VERSION = "rau-next-performance-v1";
export const NEXT_PERFORMANCE_DEBUG_STORAGE_KEY = "revenue-assistant:debug:fetch-performance";
export const NEXT_PERFORMANCE_REQUEST_PROFILE = "booking-curve-top-50ms-20-foreground-35ms-20";

export type NextPerformanceRoute = "analyze" | "competitor" | "top";
export type NextPerformanceOperation =
    | "analyze-surface"
    | "competitor-surface"
    | "room-open"
    | "top-base-decision"
    | "top-route";
export type NextPerformanceSource = "cache" | "mixed" | "network" | "none";
export type NextPerformanceOutcome = "aborted" | "empty" | "error" | "partial" | "ready";
export type NextPerformanceFreshness = "fresh" | "stale-revalidating" | "unknown";
export type NextPerformanceWarmth = "revalidate" | "unknown" | "warm";
export type NextPerformanceRoomBand = "1-6" | "7-12" | "13-20" | "21-plus" | "none";
export type NextPerformanceMilestoneName =
    | "allRoomSummarySettled"
    | "baseDecisionSettled"
    | "cachedGroupSettled"
    | "competitorCachePainted"
    | "competitorFreshSettled"
    | "overallSettled"
    | "rankSettled"
    | "routeObserved"
    | "selectedRoomCurrentSettled"
    | "selectedRoomEvidenceSettled"
    | "shellPainted"
    | "surfaceObserved";

export interface NextPerformanceCounts {
    eligibleVisibleDates?: number;
    readyRequiredRoomScopes?: number;
    renderedExactGroupDates?: number;
    renderedRankEventDates?: number;
    requiredRoomScopes?: number;
    validExactGroupSourceDates?: number;
    validRankEventDates?: number;
}

export type NextPerformanceHttpClassification =
    | "http-401"
    | "http-403"
    | "http-429"
    | "none"
    | "other";
export type NextPerformanceStopClassification =
    | "aborted"
    | "auth"
    | "budget"
    | "consecutive-errors"
    | "context-changed"
    | "hidden"
    | "inactive-route"
    | "none"
    | "permission"
    | "rate-limit"
    | "stopped";

export interface NextPerformanceMilestone {
    elapsedMs: number;
    freshness: NextPerformanceFreshness;
    outcome: NextPerformanceOutcome;
    source: NextPerformanceSource;
}

export interface NextPerformanceSchedulerSummary {
    abortedRequestCount: number;
    backgroundPausedAtMs: number | null;
    backgroundSettledAtMs: number | null;
    errorCount: number;
    httpClassification: NextPerformanceHttpClassification;
    interactiveQueuedAtMs: number | null;
    interactiveQueuedRequestCount: number;
    interactiveStartedAtMs: number | null;
    maxConcurrentRequests: number;
    plannedRequestCount: number;
    startedRequestCount: number;
    stopClassification: NextPerformanceStopClassification;
}

export interface NextPerformanceSummary {
    counts: NextPerformanceCounts;
    generation: number;
    milestones: Partial<Record<NextPerformanceMilestoneName, NextPerformanceMilestone>>;
    operation: NextPerformanceOperation;
    requestProfile: typeof NEXT_PERFORMANCE_REQUEST_PROFILE;
    roomBand: NextPerformanceRoomBand;
    route: NextPerformanceRoute;
    scheduler: NextPerformanceSchedulerSummary;
    schemaVersion: typeof NEXT_PERFORMANCE_SCHEMA_VERSION;
    sourceRevision: string;
    warmth: NextPerformanceWarmth;
}

export interface NextPerformanceRecorder {
    beginContext(input: {
        contextToken: string;
        operation: NextPerformanceOperation;
        roomBand?: NextPerformanceRoomBand;
        route: NextPerformanceRoute;
        warmth?: NextPerformanceWarmth;
    }): number;
    clear(generation: number): void;
    currentGeneration(): number | null;
    mark(generation: number, input: {
        counts?: NextPerformanceCounts;
        freshness?: NextPerformanceFreshness;
        name: NextPerformanceMilestoneName;
        outcome: NextPerformanceOutcome;
        source: NextPerformanceSource;
    }): void;
    recordScheduler(generation: number, input: NextPerformanceSchedulerEvent): void;
    setCohort(generation: number, input: {
        roomBand?: NextPerformanceRoomBand;
        warmth?: NextPerformanceWarmth;
    }): void;
    snapshot(): NextPerformanceSummary | null;
    stop(): void;
}

export type NextPerformanceSchedulerEvent =
    | { count: number; event: "aborted" }
    | { event: "background-paused" }
    | { event: "background-settled" }
    | { count?: number; event: "error"; httpClassification?: NextPerformanceHttpClassification }
    | { count: number; event: "interactive-queued" }
    | { activeRequestCount: number; event: "interactive-started" }
    | { count: number; event: "planned" }
    | { activeRequestCount: number; event: "started" }
    | { classification: NextPerformanceStopClassification; event: "stopped" };

export interface NextPerformanceCollectorSummary {
    cohorts: Array<{
        cohort: {
            operation: NextPerformanceOperation;
            requestProfile: typeof NEXT_PERFORMANCE_REQUEST_PROFILE;
            roomBand: NextPerformanceRoomBand;
            route: NextPerformanceRoute;
            schemaVersion: typeof NEXT_PERFORMANCE_SCHEMA_VERSION;
            sourceRevision: string;
            warmth: NextPerformanceWarmth;
        };
        milestones: Partial<Record<NextPerformanceMilestoneName, {
            coverage: number | null;
            coverageNoSourceSampleCount: number;
            eligibleSampleCount: number;
            exclusions: {
                aborted: number;
                noSource: number;
                notObserved: number;
                notDecisionReady: number;
            };
            maxMs: number | null;
            medianMs: number | null;
            p95Ms: number | null;
            status: "measured" | "provisional";
        }>>;
        scheduler: {
            abortedRequestCount: number;
            errorCount: number;
            httpClassifications: Record<NextPerformanceHttpClassification, number>;
            interactiveWait: {
                eligibleSampleCount: number;
                exclusions: { invalid: number; notObserved: number };
                maxMs: number | null;
                medianMs: number | null;
                p95Ms: number | null;
                status: "measured" | "provisional";
            };
            maxConcurrentRequests: number;
            plannedRequestCount: number;
            startedRequestCount: number;
            stopClassifications: Record<NextPerformanceStopClassification, number>;
        };
    }>;
    invalidSampleCount: number;
    sampleCount: number;
}

interface CreateNextPerformanceRecorderOptions {
    documentHost?: Document;
    now?: () => number;
    sourceRevision: string;
    windowHost?: Window;
}

const MILESTONE_NAMES: readonly NextPerformanceMilestoneName[] = [
    "routeObserved",
    "surfaceObserved",
    "shellPainted",
    "cachedGroupSettled",
    "rankSettled",
    "baseDecisionSettled",
    "overallSettled",
    "selectedRoomCurrentSettled",
    "selectedRoomEvidenceSettled",
    "allRoomSummarySettled",
    "competitorCachePainted",
    "competitorFreshSettled"
];
const SHELL_MILESTONES = new Set<NextPerformanceMilestoneName>([
    "routeObserved",
    "surfaceObserved",
    "shellPainted"
]);
const EXPECTED_MILESTONES: Record<NextPerformanceOperation, readonly NextPerformanceMilestoneName[]> = {
    "top-route": ["routeObserved", "shellPainted", "cachedGroupSettled", "rankSettled"],
    "top-base-decision": ["routeObserved", "baseDecisionSettled"],
    "analyze-surface": ["surfaceObserved", "shellPainted", "overallSettled", "allRoomSummarySettled"],
    "room-open": [
        "surfaceObserved",
        "shellPainted",
        "selectedRoomCurrentSettled",
        "selectedRoomEvidenceSettled"
    ],
    "competitor-surface": [
        "surfaceObserved",
        "shellPainted",
        "competitorCachePainted",
        "competitorFreshSettled"
    ]
};

export function createNextPerformanceRecorder(
    options: CreateNextPerformanceRecorderOptions
): NextPerformanceRecorder {
    const documentHost = options.documentHost ?? document;
    const windowHost = options.windowHost ?? window;
    const now = options.now ?? (() => windowHost.performance.now());
    const sourceRevision = sanitizeSourceRevision(options.sourceRevision);
    let contextKey: string | null = null;
    let generation = 0;
    let origin = 0;
    let summary: NextPerformanceSummary | null = null;
    let marker: HTMLScriptElement | null = null;
    let schedulerPublishGeneration: number | null = null;
    let stopped = false;

    return {
        beginContext(input) {
            if (stopped) {
                return generation;
            }
            const nextContextKey = `${input.route}|${input.operation}|${input.contextToken}`;
            if (summary !== null && contextKey === nextContextKey) {
                return summary.generation;
            }
            generation += 1;
            origin = safeNow(now);
            contextKey = nextContextKey;
            summary = {
                counts: {},
                generation,
                milestones: {},
                operation: input.operation,
                requestProfile: NEXT_PERFORMANCE_REQUEST_PROFILE,
                roomBand: input.roomBand ?? "none",
                route: input.route,
                scheduler: createSchedulerSummary(),
                schemaVersion: NEXT_PERFORMANCE_SCHEMA_VERSION,
                sourceRevision,
                warmth: input.warmth ?? "unknown"
            };
            publish();
            return generation;
        },
        clear(expectedGeneration) {
            if (!isCurrent(expectedGeneration)) {
                return;
            }
            contextKey = null;
            summary = null;
            marker?.remove();
            marker = null;
        },
        currentGeneration: () => summary?.generation ?? null,
        mark(expectedGeneration, input) {
            if (!isCurrent(expectedGeneration) || summary === null || summary.milestones[input.name] !== undefined) {
                return;
            }
            summary.milestones[input.name] = {
                elapsedMs: elapsedMs(),
                freshness: input.freshness ?? "unknown",
                outcome: input.outcome,
                source: input.source
            };
            if (input.counts !== undefined) {
                summary.counts = mergeCounts(summary.counts, input.counts);
            }
            publish();
        },
        recordScheduler(expectedGeneration, input) {
            if (!isCurrent(expectedGeneration) || summary === null) {
                return;
            }
            const scheduler = summary.scheduler;
            let shouldPublish = false;
            switch (input.event) {
                case "planned":
                    scheduler.plannedRequestCount += safeCount(input.count);
                    scheduleSchedulerPublish();
                    break;
                case "interactive-queued":
                    scheduler.interactiveQueuedRequestCount += safeCount(input.count);
                    if (scheduler.interactiveQueuedAtMs === null) {
                        scheduler.interactiveQueuedAtMs = elapsedMs();
                        shouldPublish = true;
                    }
                    break;
                case "interactive-started":
                    if (scheduler.interactiveStartedAtMs === null) {
                        scheduler.interactiveStartedAtMs = elapsedMs();
                        shouldPublish = true;
                    }
                    scheduler.startedRequestCount += 1;
                    shouldPublish = shouldPublish
                        || safeCount(input.activeRequestCount) > scheduler.maxConcurrentRequests;
                    scheduler.maxConcurrentRequests = Math.max(
                        scheduler.maxConcurrentRequests,
                        safeCount(input.activeRequestCount)
                    );
                    break;
                case "started":
                    scheduler.startedRequestCount += 1;
                    shouldPublish = safeCount(input.activeRequestCount) > scheduler.maxConcurrentRequests;
                    scheduler.maxConcurrentRequests = Math.max(
                        scheduler.maxConcurrentRequests,
                        safeCount(input.activeRequestCount)
                    );
                    break;
                case "aborted":
                    scheduler.abortedRequestCount += safeCount(input.count);
                    scheduleSchedulerPublish();
                    break;
                case "error":
                    scheduler.errorCount += safeCount(input.count ?? 1);
                    scheduler.httpClassification = input.httpClassification ?? "other";
                    shouldPublish = true;
                    break;
                case "background-paused":
                    if (scheduler.backgroundPausedAtMs === null) {
                        scheduler.backgroundPausedAtMs = elapsedMs();
                        shouldPublish = true;
                    }
                    break;
                case "background-settled":
                    if (scheduler.backgroundSettledAtMs === null) {
                        scheduler.backgroundSettledAtMs = elapsedMs();
                    }
                    shouldPublish = true;
                    break;
                case "stopped":
                    scheduler.stopClassification = input.classification;
                    if (input.classification === "auth") {
                        scheduler.httpClassification = "http-401";
                    } else if (input.classification === "permission") {
                        scheduler.httpClassification = "http-403";
                    } else if (input.classification === "rate-limit") {
                        scheduler.httpClassification = "http-429";
                    }
                    shouldPublish = true;
                    break;
            }
            if (shouldPublish) {
                publish();
            }
        },
        setCohort(expectedGeneration, input) {
            if (!isCurrent(expectedGeneration) || summary === null) {
                return;
            }
            if (input.roomBand !== undefined) {
                summary.roomBand = input.roomBand;
            }
            if (input.warmth !== undefined) {
                summary.warmth = input.warmth;
            }
            publish();
        },
        snapshot: () => summary === null ? null : copySummary(summary),
        stop() {
            stopped = true;
            contextKey = null;
            summary = null;
            marker?.remove();
            marker = null;
        }
    };

    function isCurrent(expectedGeneration: number): boolean {
        return !stopped && summary?.generation === expectedGeneration;
    }

    function elapsedMs(): number {
        return Math.max(0, Math.round(safeNow(now) - origin));
    }

    function publish(): void {
        if (summary === null || stopped) {
            return;
        }
        marker = ensureMarker(documentHost, marker);
        marker.textContent = JSON.stringify(summary);
        if (isDebugEnabled(windowHost)) {
            console.debug("[Revenue Assistant Next] fetch performance", copySummary(summary));
        }
    }

    function scheduleSchedulerPublish(): void {
        const expectedGeneration = summary?.generation ?? null;
        if (
            expectedGeneration === null
            || stopped
            || schedulerPublishGeneration === expectedGeneration
        ) {
            return;
        }
        schedulerPublishGeneration = expectedGeneration;
        queueMicrotask(() => {
            if (schedulerPublishGeneration === expectedGeneration) {
                schedulerPublishGeneration = null;
            }
            if (summary?.generation === expectedGeneration && !stopped) {
                publish();
            }
        });
    }
}

export function parseNextPerformanceSummary(value: unknown): NextPerformanceSummary | null {
    if (!isRecord(value)) {
        return null;
    }
    if (
        value.schemaVersion !== NEXT_PERFORMANCE_SCHEMA_VERSION
        || value.requestProfile !== NEXT_PERFORMANCE_REQUEST_PROFILE
        || !isSafeRevision(value.sourceRevision)
        || !Number.isSafeInteger(value.generation)
        || Number(value.generation) < 1
        || !isOneOf(value.route, ["top", "analyze", "competitor"])
        || !isOneOf(value.operation, [
            "top-route",
            "top-base-decision",
            "analyze-surface",
            "room-open",
            "competitor-surface"
        ])
        || !isOneOf(value.warmth, ["warm", "revalidate", "unknown"])
        || !isOneOf(value.roomBand, ["none", "1-6", "7-12", "13-20", "21-plus"])
        || !isValidRouteOperation(value.route, value.operation)
        || !isExactRecord(value, [
            "counts",
            "generation",
            "milestones",
            "operation",
            "requestProfile",
            "roomBand",
            "route",
            "scheduler",
            "schemaVersion",
            "sourceRevision",
            "warmth"
        ])
        || !isValidCounts(value.counts)
        || !isValidCoverageCounts(value.counts)
        || !isValidMilestones(value.milestones)
        || !isValidScheduler(value.scheduler)
    ) {
        return null;
    }
    return copySummary(value as unknown as NextPerformanceSummary);
}

export function summarizeNextPerformanceSamples(
    samples: readonly unknown[]
): NextPerformanceCollectorSummary {
    const validSamples = samples
        .map(parseNextPerformanceSummary)
        .filter((sample): sample is NextPerformanceSummary => sample !== null);
    const grouped = new Map<string, NextPerformanceSummary[]>();
    for (const sample of validSamples) {
        const key = [
            sample.schemaVersion,
            sample.sourceRevision,
            sample.requestProfile,
            sample.route,
            sample.operation,
            sample.warmth,
            sample.roomBand
        ].join("|");
        const cohort = grouped.get(key) ?? [];
        cohort.push(sample);
        grouped.set(key, cohort);
    }
    return {
        cohorts: Array.from(grouped.values()).map((cohortSamples) => {
            const first = cohortSamples[0];
            if (first === undefined) {
                throw new Error("performance cohort unexpectedly empty");
            }
            const milestones: NextPerformanceCollectorSummary["cohorts"][number]["milestones"] = {};
            for (const name of EXPECTED_MILESTONES[first.operation]) {
                const observed = cohortSamples.flatMap((sample) => {
                    const milestone = sample.milestones[name];
                    return milestone === undefined ? [] : [{ milestone, sample }];
                });
                const exclusions = {
                    aborted: 0,
                    noSource: 0,
                    notObserved: cohortSamples.length - observed.length,
                    notDecisionReady: 0
                };
                const eligible: number[] = [];
                const coverages: number[] = [];
                let coverageNoSourceSampleCount = 0;
                for (const item of observed) {
                    const coverage = getCoverage(name, item.sample.counts);
                    if (coverage === "no-source") {
                        coverageNoSourceSampleCount += 1;
                    }
                    if (item.milestone.outcome === "aborted") {
                        exclusions.aborted += 1;
                        continue;
                    }
                    const isSettledEmptyRankRange = name === "rankSettled"
                        && item.milestone.outcome === "empty";
                    if (coverage === "no-source" && !isSettledEmptyRankRange) {
                        exclusions.noSource += 1;
                        continue;
                    }
                    if (
                        item.milestone.outcome !== "ready"
                        && item.milestone.outcome !== "empty"
                    ) {
                        exclusions.notDecisionReady += 1;
                        continue;
                    }
                    eligible.push(item.milestone.elapsedMs);
                    if (typeof coverage === "number") {
                        coverages.push(coverage);
                    }
                }
                eligible.sort((left, right) => left - right);
                milestones[name] = {
                    coverage: coverages.length === 0
                        ? null
                        : Math.min(...coverages),
                    coverageNoSourceSampleCount,
                    eligibleSampleCount: eligible.length,
                    exclusions,
                    maxMs: eligible.at(-1) ?? null,
                    medianMs: median(eligible),
                    p95Ms: nearestRank(eligible, 0.95),
                    status: eligible.length >= 20 ? "measured" : "provisional"
                };
            }
            return {
                cohort: {
                    operation: first.operation,
                    requestProfile: first.requestProfile,
                    roomBand: first.roomBand,
                    route: first.route,
                    schemaVersion: first.schemaVersion,
                    sourceRevision: first.sourceRevision,
                    warmth: first.warmth
                },
                milestones,
                scheduler: summarizeScheduler(cohortSamples)
            };
        }),
        invalidSampleCount: samples.length - validSamples.length,
        sampleCount: validSamples.length
    };
}

export function resolveNextPerformanceRoomBand(roomCount: number): NextPerformanceRoomBand {
    const count = safeCount(roomCount);
    if (count === 0) {
        return "none";
    }
    if (count <= 6) {
        return "1-6";
    }
    if (count <= 12) {
        return "7-12";
    }
    if (count <= 20) {
        return "13-20";
    }
    return "21-plus";
}

function createSchedulerSummary(): NextPerformanceSchedulerSummary {
    return {
        abortedRequestCount: 0,
        backgroundPausedAtMs: null,
        backgroundSettledAtMs: null,
        errorCount: 0,
        httpClassification: "none",
        interactiveQueuedAtMs: null,
        interactiveQueuedRequestCount: 0,
        interactiveStartedAtMs: null,
        maxConcurrentRequests: 0,
        plannedRequestCount: 0,
        startedRequestCount: 0,
        stopClassification: "none"
    };
}

function ensureMarker(documentHost: Document, current: HTMLScriptElement | null): HTMLScriptElement {
    if (current?.isConnected === true) {
        return current;
    }
    const candidates = Array.from(documentHost.querySelectorAll<HTMLScriptElement>(
        `script[${NEXT_PERFORMANCE_MARKER_ATTRIBUTE}]`
    ));
    const marker = candidates.shift() ?? documentHost.createElement("script");
    for (const duplicate of candidates) {
        duplicate.remove();
    }
    marker.type = "application/json";
    marker.setAttribute(NEXT_PERFORMANCE_MARKER_ATTRIBUTE, "");
    if (!marker.isConnected) {
        (documentHost.head ?? documentHost.documentElement).append(marker);
    }
    return marker;
}

function mergeCounts(current: NextPerformanceCounts, next: NextPerformanceCounts): NextPerformanceCounts {
    const output = { ...current };
    for (const key of Object.keys(next) as Array<keyof NextPerformanceCounts>) {
        const value = next[key];
        if (value !== undefined) {
            output[key] = safeCount(value);
        }
    }
    return output;
}

function copySummary(summary: NextPerformanceSummary): NextPerformanceSummary {
    return JSON.parse(JSON.stringify(summary)) as NextPerformanceSummary;
}

function sanitizeSourceRevision(value: string): string {
    return isSafeRevision(value) ? value : "unknown";
}

function isSafeRevision(value: unknown): value is string {
    return typeof value === "string"
        && value.length >= 1
        && value.length <= 64
        && /^[A-Za-z0-9._-]+$/u.test(value);
}

function safeNow(now: () => number): number {
    const value = now();
    return Number.isFinite(value) ? value : 0;
}

function safeCount(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function isDebugEnabled(windowHost: Window): boolean {
    try {
        return windowHost.localStorage.getItem(NEXT_PERFORMANCE_DEBUG_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(value: Record<string, unknown>, keys: readonly string[]): boolean {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
    return typeof value === "string" && values.includes(value as T);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isValidCounts(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }
    const allowed = new Set<keyof NextPerformanceCounts>([
        "eligibleVisibleDates",
        "readyRequiredRoomScopes",
        "renderedExactGroupDates",
        "renderedRankEventDates",
        "requiredRoomScopes",
        "validExactGroupSourceDates",
        "validRankEventDates"
    ]);
    return Object.entries(value).every(([key, count]) => (
        allowed.has(key as keyof NextPerformanceCounts) && isSafeNonNegativeInteger(count)
    ));
}

function isValidCoverageCounts(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }
    const counts = value as NextPerformanceCounts;
    return isValidRatio(counts.renderedExactGroupDates, counts.validExactGroupSourceDates)
        && isValidRatio(counts.renderedRankEventDates, counts.validRankEventDates)
        && isValidRatio(counts.readyRequiredRoomScopes, counts.requiredRoomScopes)
        && (
            counts.eligibleVisibleDates === undefined
            || counts.validExactGroupSourceDates === undefined
            || counts.validExactGroupSourceDates <= counts.eligibleVisibleDates
        );
}

function isValidRatio(numerator: number | undefined, denominator: number | undefined): boolean {
    return numerator === undefined
        || denominator === undefined
        || numerator <= denominator;
}

function isValidRouteOperation(route: unknown, operation: unknown): boolean {
    return (route === "top" && (operation === "top-route" || operation === "top-base-decision"))
        || (route === "analyze" && (operation === "analyze-surface" || operation === "room-open"))
        || (route === "competitor" && operation === "competitor-surface");
}

function isValidMilestones(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }
    return Object.entries(value).every(([name, milestone]) => (
        MILESTONE_NAMES.includes(name as NextPerformanceMilestoneName)
        && isRecord(milestone)
        && isExactRecord(milestone, ["elapsedMs", "freshness", "outcome", "source"])
        && isSafeNonNegativeInteger(milestone.elapsedMs)
        && isOneOf(milestone.source, ["cache", "network", "mixed", "none"])
        && isOneOf(milestone.outcome, ["ready", "empty", "partial", "error", "aborted"])
        && isOneOf(milestone.freshness, ["fresh", "stale-revalidating", "unknown"])
        && (milestone.source !== "none" || SHELL_MILESTONES.has(name as NextPerformanceMilestoneName))
    ));
}

function isValidScheduler(value: unknown): boolean {
    if (!isRecord(value) || !isExactRecord(value, [
        "abortedRequestCount",
        "backgroundPausedAtMs",
        "backgroundSettledAtMs",
        "errorCount",
        "httpClassification",
        "interactiveQueuedAtMs",
        "interactiveQueuedRequestCount",
        "interactiveStartedAtMs",
        "maxConcurrentRequests",
        "plannedRequestCount",
        "startedRequestCount",
        "stopClassification"
    ])) {
        return false;
    }
    const nullableTimes = [
        value.backgroundPausedAtMs,
        value.backgroundSettledAtMs,
        value.interactiveQueuedAtMs,
        value.interactiveStartedAtMs
    ];
    return [
        value.abortedRequestCount,
        value.errorCount,
        value.interactiveQueuedRequestCount,
        value.maxConcurrentRequests,
        value.plannedRequestCount,
        value.startedRequestCount
    ].every(isSafeNonNegativeInteger)
        && nullableTimes.every((time) => time === null || isSafeNonNegativeInteger(time))
        && isOneOf(value.httpClassification, ["none", "http-401", "http-403", "http-429", "other"])
        && isOneOf(value.stopClassification, [
            "none",
            "aborted",
            "auth",
            "permission",
            "rate-limit",
            "budget",
            "consecutive-errors",
            "hidden",
            "context-changed",
            "inactive-route",
            "stopped"
        ]);
}

function getCoverage(
    name: NextPerformanceMilestoneName,
    counts: NextPerformanceCounts
): number | "no-source" | null {
    const pair = name === "cachedGroupSettled"
        ? [counts.renderedExactGroupDates, counts.validExactGroupSourceDates]
        : name === "rankSettled"
            ? [counts.renderedRankEventDates, counts.validRankEventDates]
            : name === "allRoomSummarySettled"
                ? [counts.readyRequiredRoomScopes, counts.requiredRoomScopes]
                : null;
    if (pair === null || pair[0] === undefined || pair[1] === undefined) {
        return null;
    }
    if (pair[1] === 0) {
        return "no-source";
    }
    return Math.min(1, pair[0] / pair[1]);
}

function nearestRank(sortedValues: readonly number[], percentile: number): number | null {
    if (sortedValues.length === 0) {
        return null;
    }
    const index = Math.max(0, Math.ceil(percentile * sortedValues.length) - 1);
    return sortedValues[index] ?? null;
}

function median(sortedValues: readonly number[]): number | null {
    if (sortedValues.length === 0) {
        return null;
    }
    const middle = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 1) {
        return sortedValues[middle] ?? null;
    }
    const left = sortedValues[middle - 1];
    const right = sortedValues[middle];
    return left === undefined || right === undefined ? null : (left + right) / 2;
}

function summarizeScheduler(
    samples: readonly NextPerformanceSummary[]
): NextPerformanceCollectorSummary["cohorts"][number]["scheduler"] {
    const waits: number[] = [];
    let invalidWaitCount = 0;
    let notObservedWaitCount = 0;
    const httpClassifications = createClassificationCounts<NextPerformanceHttpClassification>([
        "none",
        "http-401",
        "http-403",
        "http-429",
        "other"
    ]);
    const stopClassifications = createClassificationCounts<NextPerformanceStopClassification>([
        "none",
        "aborted",
        "auth",
        "permission",
        "rate-limit",
        "budget",
        "consecutive-errors",
        "hidden",
        "context-changed",
        "inactive-route",
        "stopped"
    ]);
    let abortedRequestCount = 0;
    let errorCount = 0;
    let maxConcurrentRequests = 0;
    let plannedRequestCount = 0;
    let startedRequestCount = 0;
    for (const sample of samples) {
        const scheduler = sample.scheduler;
        abortedRequestCount += scheduler.abortedRequestCount;
        errorCount += scheduler.errorCount;
        maxConcurrentRequests = Math.max(maxConcurrentRequests, scheduler.maxConcurrentRequests);
        plannedRequestCount += scheduler.plannedRequestCount;
        startedRequestCount += scheduler.startedRequestCount;
        httpClassifications[scheduler.httpClassification] += 1;
        stopClassifications[scheduler.stopClassification] += 1;
        if (scheduler.interactiveQueuedAtMs === null || scheduler.interactiveStartedAtMs === null) {
            notObservedWaitCount += 1;
            continue;
        }
        const wait = scheduler.interactiveStartedAtMs - scheduler.interactiveQueuedAtMs;
        if (!Number.isSafeInteger(wait) || wait < 0) {
            invalidWaitCount += 1;
            continue;
        }
        waits.push(wait);
    }
    waits.sort((left, right) => left - right);
    return {
        abortedRequestCount,
        errorCount,
        httpClassifications,
        interactiveWait: {
            eligibleSampleCount: waits.length,
            exclusions: { invalid: invalidWaitCount, notObserved: notObservedWaitCount },
            maxMs: waits.at(-1) ?? null,
            medianMs: median(waits),
            p95Ms: nearestRank(waits, 0.95),
            status: waits.length >= 20 ? "measured" : "provisional"
        },
        maxConcurrentRequests,
        plannedRequestCount,
        startedRequestCount,
        stopClassifications
    };
}

function createClassificationCounts<T extends string>(values: readonly T[]): Record<T, number> {
    return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}
