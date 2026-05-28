type QueuedIntervalRequest<T> = {
    run: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

export interface IntervalRequestScheduler {
    schedule<T>(requestKey: string, run: () => Promise<T>): Promise<T>;
    setConcurrency(concurrency: number): void;
}

export interface CreateIntervalRequestSchedulerOptions {
    concurrency: number;
    intervalMs: number;
}

export function createIntervalRequestScheduler(options: CreateIntervalRequestSchedulerOptions): IntervalRequestScheduler {
    const pendingRequests = new Map<string, Promise<unknown>>();
    const queue: Array<QueuedIntervalRequest<unknown>> = [];
    let activeRequestCount = 0;
    let concurrency = Math.max(1, Math.floor(options.concurrency));
    let lastRequestStartedAt = 0;
    let drainTimeoutId: ReturnType<typeof setTimeout> | null = null;

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

            const queued = queue.shift();
            if (queued === undefined) {
                continue;
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
        schedule<T>(requestKey: string, run: () => Promise<T>): Promise<T> {
            const pending = pendingRequests.get(requestKey) as Promise<T> | undefined;
            if (pending !== undefined) {
                return pending;
            }

            const request = new Promise<T>((resolve, reject) => {
                queue.push({
                    run: run as () => Promise<unknown>,
                    resolve: resolve as (value: unknown) => void,
                    reject
                });
                drain();
            }).finally(() => {
                pendingRequests.delete(requestKey);
            });

            pendingRequests.set(requestKey, request);
            return request;
        },
        setConcurrency(nextConcurrency: number): void {
            concurrency = Math.max(1, Math.floor(nextConcurrency));
            drain();
        }
    };
}
