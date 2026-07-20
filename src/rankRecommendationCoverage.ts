import { toCompactDateKey } from "./curveCore";
import type { RankRecommendationCurrentSettingsResponse } from "./rankRecommendation";

export interface RankRecommendationCoverageScope {
    stayDate: string;
    roomGroupId: string;
}

export interface RankRecommendationWarmCacheDependency extends RankRecommendationCoverageScope {
    kind: "currentRaw" | "sameWeekdayRaw";
    targetStayDate: string;
}

export interface RankRecommendationWarmCacheTaskLike {
    kind: string;
    targetStayDate: string;
    stayDate: string;
    scope: string;
    roomGroupId?: string;
}

export interface RankRecommendationCoverageDay {
    stayDate: string;
    roomGroupIds: readonly string[];
    dependencies: readonly RankRecommendationWarmCacheDependency[];
}

export interface RankRecommendationCoverageCounts {
    total: number;
    covered: number;
    complete: boolean;
}

export interface RankRecommendationDayCoverage {
    checkedStayDates: Set<string>;
    completeEvidenceStayDates: Set<string>;
    readyStayDates: Set<string>;
    unavailableStayDates: Set<string>;
    pendingStayDates: Set<string>;
}

export interface RankRecommendationCoverageStatusOptions {
    targetLabel: string;
    coverageCounts: RankRecommendationCoverageCounts;
    candidateCount: number;
    visibleCandidateCount: number;
    unavailableDayCount: number;
    selectedEvidenceReadiness: "pending" | "complete" | "missing" | null;
    readFailed?: boolean;
}

export function buildRankRecommendationCoverageDays(options: {
    response: RankRecommendationCurrentSettingsResponse;
    visibleStayDates: ReadonlySet<string>;
    asOfDate: string;
    priorityMonth: string | null;
}): RankRecommendationCoverageDay[] {
    const normalizedAsOfDate = toCompactDateKey(options.asOfDate);
    if (normalizedAsOfDate === null) {
        return [];
    }

    const roomGroupIdsByStayDate = new Map<string, Set<string>>();
    for (const currentSetting of options.response.suggest_output_current_settings ?? []) {
        const stayDate = toCompactDateKey(currentSetting.stay_date ?? "");
        if (
            stayDate === null
            || stayDate < normalizedAsOfDate
            || !options.visibleStayDates.has(stayDate)
        ) {
            continue;
        }

        const roomGroupIds = roomGroupIdsByStayDate.get(stayDate) ?? new Set<string>();
        for (const roomGroup of currentSetting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            if (roomGroupId !== "") {
                roomGroupIds.add(roomGroupId);
            }
        }
        if (roomGroupIds.size > 0) {
            roomGroupIdsByStayDate.set(stayDate, roomGroupIds);
        }
    }

    return Array.from(roomGroupIdsByStayDate.entries())
        .map(([stayDate, roomGroupIds]) => {
            const orderedRoomGroupIds = Array.from(roomGroupIds);
            const requiredStayDates = buildRankRecommendationRequiredStayDates(stayDate, normalizedAsOfDate);
            return {
                stayDate,
                roomGroupIds: orderedRoomGroupIds,
                dependencies: orderedRoomGroupIds.flatMap((roomGroupId) => (
                    requiredStayDates.map((requiredStayDate) => ({
                        kind: requiredStayDate === stayDate ? "currentRaw" as const : "sameWeekdayRaw" as const,
                        targetStayDate: stayDate,
                        stayDate: requiredStayDate,
                        roomGroupId
                    }))
                ))
            } satisfies RankRecommendationCoverageDay;
        })
        .sort((left, right) => {
            const leftPriority = isPriorityMonth(left.stayDate, options.priorityMonth) ? 0 : 1;
            const rightPriority = isPriorityMonth(right.stayDate, options.priorityMonth) ? 0 : 1;
            return leftPriority - rightPriority || left.stayDate.localeCompare(right.stayDate);
        });
}

export function resolveRankRecommendationDayCoverage(options: {
    days: readonly RankRecommendationCoverageDay[];
    hasRawSource: (dependency: RankRecommendationWarmCacheDependency) => boolean;
    isPending: (dependency: RankRecommendationWarmCacheDependency) => boolean;
    warmCacheSettled: boolean;
    readFailed?: boolean;
}): RankRecommendationDayCoverage {
    const checkedStayDates = new Set<string>();
    const completeEvidenceStayDates = new Set<string>();
    const readyStayDates = new Set<string>();
    const unavailableStayDates = new Set<string>();
    const pendingStayDates = new Set<string>();

    for (const day of options.days) {
        if (day.dependencies.length === 0) {
            continue;
        }
        if (options.readFailed === true) {
            pendingStayDates.add(day.stayDate);
            continue;
        }
        const missingDependencies = day.dependencies.filter((dependency) => !options.hasRawSource(dependency));
        if (missingDependencies.length === 0) {
            checkedStayDates.add(day.stayDate);
            completeEvidenceStayDates.add(day.stayDate);
            readyStayDates.add(day.stayDate);
            continue;
        }
        if (!options.warmCacheSettled || missingDependencies.some(options.isPending)) {
            pendingStayDates.add(day.stayDate);
            continue;
        }

        checkedStayDates.add(day.stayDate);
        const hasMissingCurrentRaw = missingDependencies.some((dependency) => dependency.kind === "currentRaw");
        if (hasMissingCurrentRaw) {
            unavailableStayDates.add(day.stayDate);
        } else {
            readyStayDates.add(day.stayDate);
        }
    }

    return {
        checkedStayDates,
        completeEvidenceStayDates,
        readyStayDates,
        unavailableStayDates,
        pendingStayDates
    };
}

export function buildRankRecommendationCoverageDayFingerprint(
    day: RankRecommendationCoverageDay
): string {
    return day.dependencies
        .map(buildRankRecommendationWarmCacheDependencyKey)
        .sort((left, right) => left.localeCompare(right))
        .join("|");
}

export function findInvalidatedRankRecommendationCoverageStayDates(options: {
    days: readonly RankRecommendationCoverageDay[];
    committedFingerprintByStayDate: ReadonlyMap<string, string>;
}): Set<string> {
    const currentFingerprintByStayDate = new Map(options.days.map((day) => [
        day.stayDate,
        buildRankRecommendationCoverageDayFingerprint(day)
    ]));
    const invalidatedStayDates = new Set<string>();
    for (const [stayDate, fingerprint] of options.committedFingerprintByStayDate.entries()) {
        if (currentFingerprintByStayDate.get(stayDate) !== fingerprint) {
            invalidatedStayDates.add(stayDate);
        }
    }
    return invalidatedStayDates;
}

export function formatRankRecommendationCoverageStatus(
    options: RankRecommendationCoverageStatusOptions
): string {
    const resultLabel = options.candidateCount === 0
        ? (options.coverageCounts.complete
            ? "確認済み範囲に候補はありません。"
            : "確認を続けています。")
        : options.visibleCandidateCount < options.candidateCount
            ? `確認済み範囲で候補${options.candidateCount}件が見つかっています（現在${options.visibleCandidateCount}件表示）。`
            : `確認済み範囲で候補${options.candidateCount}件が見つかっています。`;
    const unavailableLabel = options.unavailableDayCount > 0
        ? ` うち${options.unavailableDayCount}日は個人・団体を取得できませんでした。`
        : "";
    const evidenceLabel = options.selectedEvidenceReadiness === "pending"
        ? " 選択中の推移グラフも準備中です。"
        : options.selectedEvidenceReadiness === "missing"
            ? " 選択中の推移グラフは取得できませんでした。"
            : "";
    const readFailureLabel = options.readFailed === true
        ? " ブラウザ内の保存データを読み取れなかったため、未確認日は確定していません。画面操作または再読み込みで再確認します。"
        : "";
    return `${options.targetLabel} ${options.coverageCounts.covered}/${options.coverageCounts.total}日を確認済み。${resultLabel}${unavailableLabel}${evidenceLabel}${readFailureLabel}`;
}

export function buildRankRecommendationWarmCachePriorityScopes(
    days: readonly RankRecommendationCoverageDay[],
    priorityMonth: string | null
): RankRecommendationCoverageScope[] {
    const seen = new Set<string>();
    const scopes: RankRecommendationCoverageScope[] = [];
    for (const day of days) {
        if (!isPriorityMonth(day.stayDate, priorityMonth)) {
            continue;
        }
        for (const roomGroupId of day.roomGroupIds) {
            const key = buildRankRecommendationCoverageScopeKey({
                stayDate: day.stayDate,
                roomGroupId
            });
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            scopes.push({
                stayDate: day.stayDate,
                roomGroupId
            });
        }
    }
    return scopes;
}

export function buildRankRecommendationWarmCacheDependencies(
    days: readonly RankRecommendationCoverageDay[],
    priorityMonth: string | null
): RankRecommendationWarmCacheDependency[] {
    const seen = new Set<string>();
    const dependencies: RankRecommendationWarmCacheDependency[] = [];
    for (const day of days) {
        if (!isPriorityMonth(day.stayDate, priorityMonth)) {
            continue;
        }
        for (const dependency of day.dependencies) {
            const key = buildRankRecommendationWarmCacheDependencyKey(dependency);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            dependencies.push(dependency);
        }
    }
    return dependencies;
}

export function getRankRecommendationCoverageCounts(
    days: readonly RankRecommendationCoverageDay[],
    coveredStayDates: ReadonlySet<string>,
    targetMonth: string | null
): RankRecommendationCoverageCounts {
    const targetDays = targetMonth === null
        ? days
        : days.filter((day) => day.stayDate.startsWith(targetMonth));
    const covered = targetDays.filter((day) => coveredStayDates.has(day.stayDate)).length;
    return {
        total: targetDays.length,
        covered,
        complete: covered >= targetDays.length
    };
}

export function getRankRecommendationPartialTargetMonths(
    days: readonly RankRecommendationCoverageDay[],
    coveredStayDates: ReadonlySet<string>,
    targetMonths: readonly string[]
): Set<string> {
    const partialTargetMonths = new Set<string>();
    for (const targetMonth of targetMonths) {
        if (!getRankRecommendationCoverageCounts(days, coveredStayDates, targetMonth).complete) {
            partialTargetMonths.add(targetMonth);
        }
    }
    return partialTargetMonths;
}

export function selectRankRecommendationCoverageBatchStayDates(options: {
    days: readonly RankRecommendationCoverageDay[];
    availableStayDates: ReadonlySet<string>;
    committedStayDates: ReadonlySet<string>;
    initialBatchDayCount: number;
    followupBatchDayCount: number;
}): string[] {
    const batchDayCount = options.committedStayDates.size === 0
        ? options.initialBatchDayCount
        : options.followupBatchDayCount;
    const normalizedBatchDayCount = Math.max(0, Math.floor(batchDayCount));
    return options.days
        .filter((day) => (
            options.availableStayDates.has(day.stayDate)
            && !options.committedStayDates.has(day.stayDate)
        ))
        .slice(0, normalizedBatchDayCount)
        .map((day) => day.stayDate);
}

export function buildRankRecommendationCoverageScopeKey(scope: RankRecommendationCoverageScope): string {
    return `${scope.stayDate}:${scope.roomGroupId}`;
}

export function buildRankRecommendationWarmCacheDependencyKey(
    dependency: RankRecommendationWarmCacheDependency
): string {
    return [
        dependency.kind,
        dependency.targetStayDate,
        dependency.stayDate,
        dependency.roomGroupId
    ].join(":");
}

export function buildRankRecommendationWarmCacheTaskDependencyKey(
    task: RankRecommendationWarmCacheTaskLike
): string | null {
    if (
        (task.kind !== "currentRaw" && task.kind !== "sameWeekdayRaw")
        || task.scope !== "roomGroup"
        || task.roomGroupId === undefined
    ) {
        return null;
    }
    return buildRankRecommendationWarmCacheDependencyKey({
        kind: task.kind,
        targetStayDate: task.targetStayDate,
        stayDate: task.stayDate,
        roomGroupId: task.roomGroupId
    });
}

export function isRankRecommendationWarmCacheDependencyTask(
    task: RankRecommendationWarmCacheTaskLike,
    dependencies: readonly RankRecommendationWarmCacheDependency[]
): boolean {
    const taskKey = buildRankRecommendationWarmCacheTaskDependencyKey(task);
    return taskKey !== null && dependencies.some((dependency) => (
        buildRankRecommendationWarmCacheDependencyKey(dependency) === taskKey
    ));
}

export function shouldResyncRankRecommendationCoverageAfterStaleWarmCacheTask(options: {
    sameDataContext: boolean;
    task: RankRecommendationWarmCacheTaskLike;
    dependencies: readonly RankRecommendationWarmCacheDependency[];
}): boolean {
    return options.sameDataContext
        && isRankRecommendationWarmCacheDependencyTask(options.task, options.dependencies);
}

export function prioritizeRankRecommendationWarmCacheTasks<T extends RankRecommendationWarmCacheTaskLike>(
    tasks: readonly T[],
    dependencies: readonly RankRecommendationWarmCacheDependency[]
): T[] {
    if (tasks.length <= 1 || dependencies.length === 0) {
        return Array.from(tasks);
    }
    const orderByDependencyKey = new Map(dependencies.map((dependency, index) => [
        buildRankRecommendationWarmCacheDependencyKey(dependency),
        index
    ]));
    return tasks
        .map((task, index) => ({ task, index }))
        .sort((left, right) => {
            const leftKey = buildRankRecommendationWarmCacheTaskDependencyKey(left.task);
            const rightKey = buildRankRecommendationWarmCacheTaskDependencyKey(right.task);
            const leftOrder = leftKey === null
                ? Number.POSITIVE_INFINITY
                : orderByDependencyKey.get(leftKey) ?? Number.POSITIVE_INFINITY;
            const rightOrder = rightKey === null
                ? Number.POSITIVE_INFINITY
                : orderByDependencyKey.get(rightKey) ?? Number.POSITIVE_INFINITY;
            return leftOrder - rightOrder || left.index - right.index;
        })
        .map(({ task }) => task);
}

function buildRankRecommendationRequiredStayDates(stayDate: string, asOfDate: string): string[] {
    const stayDates = [
        stayDate,
        ...[-14, -7, 7, 14].map((offsetDays) => shiftCompactDate(stayDate, offsetDays))
    ];
    return Array.from(new Set(stayDates.filter((candidateStayDate) => candidateStayDate >= asOfDate)));
}

function shiftCompactDate(stayDate: string, offsetDays: number): string {
    const year = Number(stayDate.slice(0, 4));
    const month = Number(stayDate.slice(4, 6));
    const day = Number(stayDate.slice(6, 8));
    const value = new Date(Date.UTC(year, month - 1, day));
    value.setUTCDate(value.getUTCDate() + offsetDays);
    return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
}

function isPriorityMonth(stayDate: string, priorityMonth: string | null): boolean {
    return priorityMonth !== null && stayDate.startsWith(priorityMonth);
}
