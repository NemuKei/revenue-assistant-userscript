export type RankRecommendationProgressiveReadinessStage =
    | "loading"
    | "first_task"
    | "needs_evidence"
    | "complete"
    | "error";

export type RankRecommendationProgressiveEvidenceReadiness = "pending" | "complete" | "missing";

export interface RankRecommendationProgressiveControlVisibility {
    targetMonth: boolean;
    workState: boolean;
    displayLimit: boolean;
    rankOrder: boolean;
}

export interface RankRecommendationProgressiveEvidenceSeed<T> {
    key: string;
    readiness: RankRecommendationProgressiveEvidenceReadiness;
    value?: T;
}

export interface RankRecommendationProgressiveEvidenceResult<T> {
    key: string;
    readiness: RankRecommendationProgressiveEvidenceReadiness;
    value: T;
}

export interface RankRecommendationProgressiveEvidenceCoordinator<T> {
    readonly readinessByKey: ReadonlyMap<string, RankRecommendationProgressiveEvidenceReadiness>;
    readonly valueByKey: ReadonlyMap<string, T>;
    getSelectedKey: () => string | null;
    getSelectedReadiness: () => RankRecommendationProgressiveEvidenceReadiness | null;
    select: (key: string | null) => void;
    retrySelected: (key: string, isRetryable: (value: T | undefined) => boolean) => boolean;
    requestSelected: (
        key: string,
        load: () => Promise<T>,
        resolveReadiness: (value: T) => RankRecommendationProgressiveEvidenceReadiness
    ) => Promise<RankRecommendationProgressiveEvidenceResult<T>> | null;
}

export interface RankRecommendationProgressiveEvidenceRequestCache<T> {
    clear: () => void;
    getOrCreate: (key: string, load: () => Promise<T>) => Promise<T>;
}

export function resolveRankRecommendationProgressiveReadinessStage(
    selectedReadiness: RankRecommendationProgressiveEvidenceReadiness | null
): RankRecommendationProgressiveReadinessStage {
    if (selectedReadiness === null || selectedReadiness === "complete") {
        return "complete";
    }
    return selectedReadiness === "missing" ? "needs_evidence" : "first_task";
}

export function resolveRankRecommendationProgressiveControlVisibility(options: {
    readinessStage: RankRecommendationProgressiveReadinessStage;
    hasStatusText: boolean;
    targetMonthOptionCount: number;
    preserveWorkState?: boolean;
}): RankRecommendationProgressiveControlVisibility {
    const hasFullControls = options.readinessStage === "complete" && !options.hasStatusText;
    return {
        targetMonth: options.readinessStage !== "error" && options.targetMonthOptionCount > 0,
        workState: hasFullControls
            || options.readinessStage === "needs_evidence"
            || (options.readinessStage === "first_task" && options.preserveWorkState === true),
        displayLimit: hasFullControls,
        rankOrder: hasFullControls
    };
}

export function resolveRankRecommendationProgressiveWorkStateControlPublished(options: {
    wasPublished: boolean;
    readinessStage: RankRecommendationProgressiveReadinessStage;
    reset?: boolean;
}): boolean {
    if (options.reset === true) {
        return false;
    }
    return options.wasPublished
        || options.readinessStage === "complete"
        || options.readinessStage === "needs_evidence";
}

export function shouldCacheRankRecommendationProgressiveEvidence(options: {
    readiness: RankRecommendationProgressiveEvidenceReadiness;
    transientFailure: boolean;
}): boolean {
    return options.readiness !== "pending" && !options.transientFailure;
}

export function buildRankRecommendationProgressiveContextSignature(parts: {
    facilityCacheKey: string;
    batchDateKey: string;
    fromDateKey: string;
    toDateKey: string;
}): string {
    return JSON.stringify([
        parts.facilityCacheKey,
        parts.batchDateKey,
        parts.fromDateKey,
        parts.toDateKey
    ]);
}

export function shouldResetRankRecommendationPerformanceMetrics(
    currentContextSignature: string,
    nextContextSignature: string
): boolean {
    return currentContextSignature !== nextContextSignature;
}

export function buildRankRecommendationPerformanceContextSignature(parts: {
    facilityCacheKey: string;
    batchDateKey: string;
}): string {
    return JSON.stringify([parts.facilityCacheKey, parts.batchDateKey]);
}

export function limitRankRecommendationItemsWithSelectedKey<T>(options: {
    items: readonly T[];
    limit: number;
    selectedKey: string | null;
    getKey: (item: T) => string;
}): T[] {
    const limit = Math.max(0, Math.floor(options.limit));
    if (limit === 0) {
        return [];
    }

    const limitedItems = options.items.slice(0, limit);
    if (
        options.selectedKey === null
        || limitedItems.some((item) => options.getKey(item) === options.selectedKey)
    ) {
        return limitedItems;
    }

    const selectedItem = options.items.find((item) => options.getKey(item) === options.selectedKey);
    if (selectedItem === undefined) {
        return limitedItems;
    }
    if (limitedItems.length < limit) {
        return [...limitedItems, selectedItem];
    }
    return [...limitedItems.slice(0, -1), selectedItem];
}

export function createRankRecommendationProgressiveEvidenceCoordinator<T>(
    seeds: readonly RankRecommendationProgressiveEvidenceSeed<T>[]
): RankRecommendationProgressiveEvidenceCoordinator<T> {
    const readinessByKey = new Map<string, RankRecommendationProgressiveEvidenceReadiness>();
    const valueByKey = new Map<string, T>();
    const inFlightKeys = new Set<string>();
    let selectedKey: string | null = null;

    for (const seed of seeds) {
        readinessByKey.set(seed.key, seed.readiness);
        if (seed.value !== undefined) {
            valueByKey.set(seed.key, seed.value);
        }
    }

    return {
        readinessByKey,
        valueByKey,
        getSelectedKey: () => selectedKey,
        getSelectedReadiness: () => selectedKey === null
            ? null
            : readinessByKey.get(selectedKey) ?? null,
        select: (key) => {
            selectedKey = key !== null && readinessByKey.has(key) ? key : null;
        },
        retrySelected: (key, isRetryable) => {
            if (
                key !== selectedKey
                || inFlightKeys.has(key)
                || readinessByKey.get(key) === "pending"
                || !readinessByKey.has(key)
                || !isRetryable(valueByKey.get(key))
            ) {
                return false;
            }
            readinessByKey.set(key, "pending");
            return true;
        },
        requestSelected: (key, load, resolveReadiness) => {
            if (
                key !== selectedKey
                || readinessByKey.get(key) !== "pending"
                || inFlightKeys.has(key)
            ) {
                return null;
            }

            inFlightKeys.add(key);
            return load()
                .then((value) => {
                    const readiness = resolveReadiness(value);
                    valueByKey.set(key, value);
                    readinessByKey.set(key, readiness);
                    return { key, readiness, value };
                })
                .finally(() => {
                    inFlightKeys.delete(key);
                });
        }
    };
}

export function createRankRecommendationProgressiveEvidenceRequestCache<T>(): RankRecommendationProgressiveEvidenceRequestCache<T> {
    const requestByKey = new Map<string, Promise<T>>();
    return {
        clear: () => requestByKey.clear(),
        getOrCreate: (key, load) => {
            const existing = requestByKey.get(key);
            if (existing !== undefined) {
                return existing;
            }

            let loaded: Promise<T>;
            try {
                loaded = load();
            } catch (error: unknown) {
                loaded = Promise.reject(error);
            }
            const request = loaded.finally(() => {
                if (requestByKey.get(key) === request) {
                    requestByKey.delete(key);
                }
            });
            requestByKey.set(key, request);
            return request;
        }
    };
}
