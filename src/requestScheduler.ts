type QueuedIntervalRequest<T> = {
    requestKey: string;
    run: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
    priority: IntervalRequestPriority;
    sequence: number;
};

type PendingIntervalRequest = {
    promise: Promise<unknown>;
    queuedRequest: QueuedIntervalRequest<unknown> | null;
};

export type IntervalRequestPriority = "interactive" | "background";

export interface IntervalRequestScheduleOptions {
    priority?: IntervalRequestPriority;
}

export interface IntervalRequestScheduler {
    schedule<T>(requestKey: string, run: () => Promise<T>, options?: IntervalRequestScheduleOptions): Promise<T>;
    setConcurrency(concurrency: number): void;
}

export interface CreateIntervalRequestSchedulerOptions {
    concurrency: number;
    intervalMs: number;
}

export function createIntervalRequestScheduler(options: CreateIntervalRequestSchedulerOptions): IntervalRequestScheduler {
    const pendingRequests = new Map<string, PendingIntervalRequest>();
    const queue: Array<QueuedIntervalRequest<unknown>> = [];
    let activeRequestCount = 0;
    let concurrency = Math.max(1, Math.floor(options.concurrency));
    let lastRequestStartedAt = 0;
    let drainTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let nextSequence = 0;

    const getPriorityRank = (priority: IntervalRequestPriority): number => {
        return priority === "interactive" ? 1 : 0;
    };

    const resolvePriority = (priority: IntervalRequestPriority | undefined): IntervalRequestPriority => {
        return priority ?? "background";
    };

    const takeNextQueuedRequest = (): QueuedIntervalRequest<unknown> | undefined => {
        let selectedIndex = -1;
        for (let index = 0; index < queue.length; index += 1) {
            const candidate = queue[index];
            if (candidate === undefined) {
                continue;
            }
            const selected = selectedIndex < 0 ? undefined : queue[selectedIndex];
            if (
                selected === undefined
                || getPriorityRank(candidate.priority) > getPriorityRank(selected.priority)
                || (candidate.priority === selected.priority && candidate.sequence < selected.sequence)
            ) {
                selectedIndex = index;
            }
        }

        if (selectedIndex < 0) {
            return undefined;
        }

        return queue.splice(selectedIndex, 1)[0];
    };

    const drain = (): void => {
        if (drainTimeoutId !== null) {
            return;
        }

        while (activeRequestCount < concurrency && queue.length > 0) {
            const now = Date.now();
            const elapsedMs = now - lastRequestStartedAt;
            if (lastRequestStartedAt > 0 && elapsedMs < options.intervalMs) {
                drainTimeoutId = setTimeout(() => {
                    drainTimeoutId = null;
                    drain();
                }, options.intervalMs - elapsedMs);
                return;
            }

            const queued = takeNextQueuedRequest();
            if (queued === undefined) {
                continue;
            }
            const pending = pendingRequests.get(queued.requestKey);
            if (pending !== undefined && pending.queuedRequest === queued) {
                pending.queuedRequest = null;
            }

            activeRequestCount += 1;
            lastRequestStartedAt = now;
            queued.run()
                .then(queued.resolve)
                .catch(queued.reject)
                .finally(() => {
                    activeRequestCount -= 1;
                    drain();
                });
        }
    };

    return {
        schedule<T>(requestKey: string, run: () => Promise<T>, scheduleOptions?: IntervalRequestScheduleOptions): Promise<T> {
            const priority = resolvePriority(scheduleOptions?.priority);
            const pending = pendingRequests.get(requestKey) as PendingIntervalRequest | undefined;
            if (pending !== undefined) {
                if (
                    pending.queuedRequest !== null
                    && getPriorityRank(priority) > getPriorityRank(pending.queuedRequest.priority)
                ) {
                    pending.queuedRequest.priority = priority;
                }
                return pending.promise as Promise<T>;
            }

            let queuedRequest: QueuedIntervalRequest<unknown> | null = null;
            const request = new Promise<T>((resolve, reject) => {
                queuedRequest = {
                    requestKey,
                    run: run as () => Promise<unknown>,
                    resolve: resolve as (value: unknown) => void,
                    reject,
                    priority,
                    sequence: nextSequence
                };
                nextSequence += 1;
                queue.push(queuedRequest);
            }).finally(() => {
                pendingRequests.delete(requestKey);
            });

            pendingRequests.set(requestKey, {
                promise: request,
                queuedRequest
            });
            drain();
            return request;
        },
        setConcurrency(nextConcurrency: number): void {
            concurrency = Math.max(1, Math.floor(nextConcurrency));
            drain();
        }
    };
}
