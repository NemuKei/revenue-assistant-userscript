export type CurveScope = "hotel" | "roomGroup";
export type CurveSegment = "all" | "transient" | "group";
export type CurveTick = number | "ACT";
export type ReferenceCurveKind = "recent_weighted_90" | "seasonal_component";
export type RoomsOnlyForecastModelId = "seasonal_ratio_baseline" | "recent_deviation_adjusted_seasonal";

export const RECENT_WEIGHTED_90_ALGORITHM_VERSION = "recent_weighted_90:v3";
export const SEASONAL_COMPONENT_ALGORITHM_VERSION = "seasonal_component:v2";
export const SEASONAL_RATIO_BASELINE_FORECAST_VERSION = "seasonal_ratio_baseline:v1";
export const RECENT_DEVIATION_ADJUSTED_SEASONAL_FORECAST_VERSION = "recent_deviation_adjusted_seasonal:v1";

export interface CurveObservation {
    scope: CurveScope;
    roomGroupId?: string;
    segment: CurveSegment;
    stayDate: string;
    observedDate: string;
    lt: number;
    rooms: number | null;
    capacity?: number | null;
}

export interface CurveInput {
    facilityId: string;
    asOfDate: string;
    observations: CurveObservation[];
}

export interface CurvePoint {
    lt: CurveTick;
    rooms: number | null;
    sourceCount: number;
}

export interface ReferenceCurveDiagnostics {
    sourceStayDateCount: number;
    missingReason?: string;
    warnings: string[];
    actComparison?: ReferenceCurveActComparisonDiagnostics;
}

export interface ReferenceCurveActComparisonDiagnostics {
    zeroLeadRooms: number | null;
    zeroLeadSourceCount: number;
    actRooms: number | null;
    actSourceCount: number;
    differenceRooms: number | null;
}

export interface ReferenceCurveResult {
    curveKind: ReferenceCurveKind;
    algorithmVersion: string;
    facilityId: string;
    scope: CurveScope;
    roomGroupId?: string;
    segment: CurveSegment;
    targetStayDate?: string;
    targetMonth?: string;
    weekday?: number;
    asOfDate: string;
    points: CurvePoint[];
    diagnostics: ReferenceCurveDiagnostics;
}

export interface ForecastResultV1Candidate {
    modelId: string;
    modelVersion: string;
    facilityId: string;
    targetStayDate: string;
    asOfDate: string;
    scope: CurveScope;
    roomGroupId?: string;
    segment: CurveSegment;
    observedLt: number | null;
    currentRooms: number | null;
    capacityRooms?: number | null;
    predictedFinalRooms: number | null;
    expectedOccupancyRatio?: number | null;
    predictedCurve?: CurvePoint[];
    diagnostics: ForecastResultDiagnostics;
}

export interface ForecastResultDiagnostics {
    featureNames: string[];
    missingReason?: string;
    warnings: string[];
    sourceCounts: {
        observedPrefixPointCount: number;
        recentReferenceSourceCount?: number;
        seasonalReferenceSourceCount?: number;
    };
    constraints: {
        actSeparated: boolean;
        smallCapacity: boolean;
        groupDriven: boolean;
    };
}

export interface ForecastEvaluationLabels {
    snoozedByUser?: boolean;
    dismissedByUser?: boolean;
    resolvedByRankChange?: boolean;
}

export type ForecastEvaluationMissingReason =
    | "invalid_target_or_as_of_date"
    | "actual_final_missing"
    | "observed_prefix_missing"
    | "future_info_required"
    | "act_not_separated"
    | "room_group_id_missing"
    | "segment_unknown";

export interface ForecastEvaluationCase {
    facilityId: string;
    targetStayDate: string;
    asOfDate: string;
    scope: CurveScope;
    roomGroupId?: string;
    segment: CurveSegment;
    observedLt: number | null;
    observedPrefix: CurveObservation[];
    referenceCurves: {
        recentWeighted90?: ReferenceCurveResult;
        seasonalComponent?: ReferenceCurveResult;
    };
    capacityRooms?: number | null;
    actualFinalRooms: number | null;
    labels: ForecastEvaluationLabels;
    diagnostics: {
        missingReason?: ForecastEvaluationMissingReason;
        warnings: string[];
    };
}

export interface BuildForecastEvaluationCaseOptions {
    targetStayDate: string;
    asOfDate: string;
    scope: CurveScope;
    roomGroupId?: string;
    segment: CurveSegment;
    referenceCurves?: {
        recentWeighted90?: ReferenceCurveResult | null;
        seasonalComponent?: ReferenceCurveResult | null;
    };
    capacityRooms?: number | null;
    labels?: ForecastEvaluationLabels;
    groupDriven?: boolean;
    smallCapacityThreshold?: number;
}

export interface ForecastEvaluationResult {
    modelId: string;
    modelVersion: string;
    segment: CurveSegment;
    scope: CurveScope;
    caseCount: number;
    excludedCaseCount: number;
    metrics: {
        maeRooms?: number;
        smape?: number;
        biasRooms?: number;
    };
    impactProxy?: {
        priorityOrderChangedCount: number;
        dismissedProxyCount: number;
        snoozedProxyCount: number;
        resolvedByRankChangeProxyCount: number;
    };
    warnings: string[];
}

export interface ForecastEvaluationResultInput {
    case: ForecastEvaluationCase;
    result: ForecastResultV1Candidate;
    priorityOrderChanged?: boolean;
}

export interface BuildRoomsOnlyForecastOptions {
    evaluationCase: ForecastEvaluationCase;
    modelId?: RoomsOnlyForecastModelId;
    modelVersion?: string;
}

export interface BookingCurveApiScopeCounts {
    this_year_room_sum?: number | null;
    last_year_room_sum?: number | null;
    two_years_ago_room_sum?: number | null;
    three_years_ago_room_sum?: number | null;
    this_year_sales_sum?: number | null;
    last_year_sales_sum?: number | null;
    two_years_ago_sales_sum?: number | null;
    three_years_ago_sales_sum?: number | null;
    this_year_adr?: number | null;
    last_year_adr?: number | null;
    two_years_ago_adr?: number | null;
    three_years_ago_adr?: number | null;
}

export interface BookingCurveApiPoint {
    date: string;
    last_year_date?: string;
    all?: BookingCurveApiScopeCounts;
    transient?: BookingCurveApiScopeCounts;
    group?: BookingCurveApiScopeCounts;
}

export interface BookingCurveApiResponse {
    stay_date: string;
    last_year_stay_date?: string;
    max_room_count?: number;
    booking_curve?: BookingCurveApiPoint[];
}

export type BookingCurveRoomSumKey =
    | "this_year_room_sum"
    | "last_year_room_sum"
    | "two_years_ago_room_sum"
    | "three_years_ago_room_sum";

export interface BookingCurveResponseSource {
    response: BookingCurveApiResponse;
    scope: CurveScope;
    roomGroupId?: string;
    roomSumKey?: BookingCurveRoomSumKey;
}

export interface BuildCurveInputOptions {
    facilityId: string;
    asOfDate: string;
    sources: BookingCurveResponseSource[];
    segments?: readonly CurveSegment[];
}

export interface ReferenceCurveBaseOptions {
    scope: CurveScope;
    roomGroupId?: string;
    segment: CurveSegment;
    ticks: readonly CurveTick[];
}

export interface RecentWeighted90Options extends ReferenceCurveBaseOptions {
    targetStayDate: string;
    asOfDate: string;
}

export interface SeasonalComponentOptions extends ReferenceCurveBaseOptions {
    targetMonth: string;
    weekday: number;
    asOfDate: string;
}

interface WeightedSample {
    value: number;
    weight: number;
}

interface SeasonalRatioBucket {
    ratio: number;
    sourceCount: number;
}

export function buildCurveInputFromBookingCurveResponses(options: BuildCurveInputOptions): CurveInput {
    const observations: CurveObservation[] = [];
    const asOfDate = normalizeDateKey(options.asOfDate) ?? options.asOfDate;
    const segments = options.segments ?? (["all", "transient", "group"] as const);

    for (const source of options.sources) {
        const stayDate = normalizeDateKey(source.response.stay_date);
        if (stayDate === null) {
            continue;
        }

        const roomSumKey = source.roomSumKey ?? "this_year_room_sum";
        const capacity = typeof source.response.max_room_count === "number"
            ? source.response.max_room_count
            : undefined;

        for (const point of source.response.booking_curve ?? []) {
            const observedDate = normalizeDateKey(point.date);
            if (observedDate === null) {
                continue;
            }

            const lt = getDaysBetweenDateKeys(stayDate, observedDate);
            if (lt === null) {
                continue;
            }

            for (const segment of segments) {
                const rooms = point[segment]?.[roomSumKey];
                const observationBase = {
                    scope: source.scope,
                    segment,
                    stayDate,
                    observedDate,
                    lt,
                    rooms: typeof rooms === "number" ? rooms : null
                };

                observations.push({
                    ...observationBase,
                    ...(source.roomGroupId === undefined ? {} : { roomGroupId: source.roomGroupId }),
                    ...(capacity === undefined ? {} : { capacity })
                });
            }
        }
    }

    return {
        facilityId: options.facilityId,
        asOfDate,
        observations
    };
}

export function buildRecentWeighted90ReferenceCurve(input: CurveInput, options: RecentWeighted90Options): ReferenceCurveResult {
    const targetStayDate = normalizeDateKey(options.targetStayDate);
    const asOfDate = normalizeDateKey(options.asOfDate);
    const warnings: string[] = [];

    if (targetStayDate === null || asOfDate === null) {
        return createEmptyReferenceCurveResult(input, options, "recent_weighted_90", RECENT_WEIGHTED_90_ALGORITHM_VERSION, {
            targetStayDate: options.targetStayDate,
            missingReason: "invalid_target_or_as_of_date"
        });
    }

    const targetWeekday = getUtcWeekday(targetStayDate);
    const scopedObservations = selectObservations(input.observations, options)
        .filter((observation) => getUtcWeekday(observation.stayDate) === targetWeekday);
    const sourceStayDates = new Set(scopedObservations.map((observation) => observation.stayDate));

    const points = options.ticks.map((tick): CurvePoint => {
        if (tick === "ACT") {
            const samples = buildRecentFinalWeightedSamples(scopedObservations, asOfDate);
            return {
                lt: tick,
                rooms: weightedAverage(samples),
                sourceCount: samples.length
            };
        }

        const samples = buildRecentWeightedSamplesForLt(scopedObservations, asOfDate, tick);
        return {
            lt: tick,
            rooms: weightedAverage(samples),
            sourceCount: samples.length
        };
    });

    if (scopedObservations.length === 0) {
        warnings.push("no_matching_recent_observations");
    }
    const actComparison = buildActComparisonDiagnostics(points);
    if (actComparison.differenceRooms !== null && actComparison.differenceRooms < 0) {
        warnings.push("act_below_zero_lead_recent_reference");
    }

    return {
        curveKind: "recent_weighted_90",
        algorithmVersion: RECENT_WEIGHTED_90_ALGORITHM_VERSION,
        facilityId: input.facilityId,
        scope: options.scope,
        ...(options.roomGroupId === undefined ? {} : { roomGroupId: options.roomGroupId }),
        segment: options.segment,
        targetStayDate,
        asOfDate,
        points,
        diagnostics: {
            sourceStayDateCount: sourceStayDates.size,
            ...(scopedObservations.length === 0 ? { missingReason: "no_matching_recent_observations" } : {}),
            warnings,
            actComparison
        }
    };
}

export function buildSeasonalComponentReferenceCurve(input: CurveInput, options: SeasonalComponentOptions): ReferenceCurveResult {
    const targetMonth = normalizeYearMonth(options.targetMonth);
    const asOfDate = normalizeDateKey(options.asOfDate);
    const warnings: string[] = [];

    if (targetMonth === null || asOfDate === null || !isValidWeekday(options.weekday)) {
        return createEmptyReferenceCurveResult(input, options, "seasonal_component", SEASONAL_COMPONENT_ALGORITHM_VERSION, {
            targetMonth: options.targetMonth,
            weekday: options.weekday,
            missingReason: "invalid_target_month_weekday_or_as_of_date"
        });
    }

    const seasonalMonths = new Set([
        shiftYearMonth(targetMonth, -12),
        shiftYearMonth(targetMonth, -24)
    ].filter((value): value is string => value !== null));
    const scopedObservations = selectObservations(input.observations, options)
        .filter((observation) => seasonalMonths.has(observation.stayDate.slice(0, 7)))
        .filter((observation) => getUtcWeekday(observation.stayDate) === options.weekday);
    const observationsByStayDate = groupObservationsByStayDate(scopedObservations);
    const finalRoomsByStayDate = resolveFinalRoomsByStayDate(observationsByStayDate);
    const finalRooms = Array.from(finalRoomsByStayDate.values());
    const finalEstimate = average(finalRooms);

    if (observationsByStayDate.size === 0) {
        warnings.push("no_matching_seasonal_observations");
    }
    if (finalRooms.length === 0) {
        warnings.push("no_seasonal_final_rooms");
    }

    const ratioByLt = buildSeasonalRatioByLt(options.ticks, observationsByStayDate, finalRoomsByStayDate);
    const shapedRatioByLt = enforceSeasonalMonotonicShape(ratioByLt);
    const points = options.ticks.map((tick): CurvePoint => {
        if (tick === "ACT") {
            return {
                lt: tick,
                rooms: finalEstimate,
                sourceCount: finalRooms.length
            };
        }

        const bucket = shapedRatioByLt.get(tick);
        return {
            lt: tick,
            rooms: bucket === undefined || finalEstimate === null ? null : finalEstimate * bucket.ratio,
            sourceCount: bucket?.sourceCount ?? 0
        };
    });
    const actComparison = buildActComparisonDiagnostics(points);
    if (actComparison.differenceRooms !== null && actComparison.differenceRooms < 0) {
        warnings.push("act_below_zero_lead_seasonal_reference");
    }

    return {
        curveKind: "seasonal_component",
        algorithmVersion: SEASONAL_COMPONENT_ALGORITHM_VERSION,
        facilityId: input.facilityId,
        scope: options.scope,
        ...(options.roomGroupId === undefined ? {} : { roomGroupId: options.roomGroupId }),
        segment: options.segment,
        targetMonth,
        weekday: options.weekday,
        asOfDate,
        points,
        diagnostics: {
            sourceStayDateCount: finalRoomsByStayDate.size,
            ...(finalRooms.length === 0 ? { missingReason: "no_seasonal_final_rooms" } : {}),
            warnings,
            actComparison
        }
    };
}

export function buildForecastEvaluationCase(
    input: CurveInput,
    options: BuildForecastEvaluationCaseOptions
): ForecastEvaluationCase {
    const targetStayDate = normalizeDateKey(options.targetStayDate);
    const asOfDate = normalizeDateKey(options.asOfDate);
    const warnings: string[] = [];
    const normalizedRoomGroupId = options.roomGroupId?.trim();
    const roomGroupId = normalizedRoomGroupId === "" ? undefined : normalizedRoomGroupId;
    const labels = options.labels ?? {};
    const smallCapacityThreshold = options.smallCapacityThreshold ?? 2;

    const invalidDates = targetStayDate === null || asOfDate === null;
    const observedLt = invalidDates ? null : getDaysBetweenDateKeys(targetStayDate, asOfDate);
    const missingReasonOptions = {
        targetStayDate: targetStayDate ?? options.targetStayDate,
        asOfDate: asOfDate ?? options.asOfDate,
        scope: options.scope,
        ...(roomGroupId === undefined ? {} : { roomGroupId }),
        segment: options.segment,
        ...(options.referenceCurves === undefined ? {} : { referenceCurves: options.referenceCurves }),
        ...(options.capacityRooms === undefined ? {} : { capacityRooms: options.capacityRooms }),
        ...(options.labels === undefined ? {} : { labels: options.labels }),
        ...(options.groupDriven === undefined ? {} : { groupDriven: options.groupDriven }),
        ...(options.smallCapacityThreshold === undefined ? {} : { smallCapacityThreshold: options.smallCapacityThreshold }),
        observedLt
    };
    const missingReason = invalidDates
        ? "invalid_target_or_as_of_date"
        : getForecastEvaluationMissingReason(input, missingReasonOptions);

    const scopedObservations = invalidDates
        ? []
        : selectEvaluationObservations(input.observations, {
            targetStayDate,
            scope: options.scope,
            ...(roomGroupId === undefined ? {} : { roomGroupId }),
            segment: options.segment
        });
    const observedPrefix = asOfDate === null
        ? []
        : scopedObservations.filter((observation) => observation.observedDate <= asOfDate);
    const actualFinalRooms = resolveActualFinalRooms(scopedObservations);
    const capacityRooms = options.capacityRooms ?? resolveCapacityRooms(scopedObservations);
    const actSeparated = hasActSeparatedEvidence(scopedObservations, asOfDate);

    if (missingReason !== undefined) {
        warnings.push(missingReason);
    }
    if (!actSeparated) {
        warnings.push("act_not_separated");
    }
    if (capacityRooms !== null && capacityRooms !== undefined && capacityRooms > 0 && capacityRooms <= smallCapacityThreshold) {
        warnings.push("small_capacity");
    }
    if (options.groupDriven === true) {
        warnings.push("group_driven");
    }

    return {
        facilityId: input.facilityId,
        targetStayDate: targetStayDate ?? options.targetStayDate,
        asOfDate: asOfDate ?? options.asOfDate,
        scope: options.scope,
        ...(roomGroupId === undefined ? {} : { roomGroupId }),
        segment: options.segment,
        observedLt,
        observedPrefix,
        referenceCurves: {
            ...(options.referenceCurves?.recentWeighted90 == null ? {} : { recentWeighted90: options.referenceCurves.recentWeighted90 }),
            ...(options.referenceCurves?.seasonalComponent == null ? {} : { seasonalComponent: options.referenceCurves.seasonalComponent })
        },
        ...(capacityRooms === undefined ? {} : { capacityRooms }),
        actualFinalRooms,
        labels,
        diagnostics: {
            ...(missingReason === undefined ? {} : { missingReason }),
            warnings: Array.from(new Set(warnings))
        }
    };
}

export function summarizeForecastEvaluationResults(options: {
    modelId: string;
    modelVersion: string;
    scope: CurveScope;
    segment: CurveSegment;
    inputs: readonly ForecastEvaluationResultInput[];
}): ForecastEvaluationResult {
    const usableInputs = options.inputs.filter((input) => (
        input.case.diagnostics.missingReason === undefined
        && typeof input.case.actualFinalRooms === "number"
        && typeof input.result.predictedFinalRooms === "number"
    ));
    const errors = usableInputs.map((input) => {
        const predicted = input.result.predictedFinalRooms as number;
        const actual = input.case.actualFinalRooms as number;
        return {
            predicted,
            actual,
            error: predicted - actual,
            absoluteError: Math.abs(predicted - actual),
            smape: calculateSmape(predicted, actual)
        };
    });
    const warnings = Array.from(new Set(options.inputs.flatMap((input) => [
        ...input.case.diagnostics.warnings,
        ...input.result.diagnostics.warnings
    ])));
    const impactProxy = buildForecastEvaluationImpactProxy(usableInputs);
    const metrics = errors.length === 0 ? {} : {
        maeRooms: errors.reduce((sum, error) => sum + error.absoluteError, 0) / errors.length,
        smape: errors.reduce((sum, error) => sum + error.smape, 0) / errors.length,
        biasRooms: errors.reduce((sum, error) => sum + error.error, 0) / errors.length
    };

    return {
        modelId: options.modelId,
        modelVersion: options.modelVersion,
        segment: options.segment,
        scope: options.scope,
        caseCount: usableInputs.length,
        excludedCaseCount: options.inputs.length - usableInputs.length,
        metrics,
        impactProxy,
        warnings
    };
}

export function buildRoomsOnlyForecastResult(options: BuildRoomsOnlyForecastOptions): ForecastResultV1Candidate {
    const modelId = options.modelId ?? "recent_deviation_adjusted_seasonal";
    const modelVersion = options.modelVersion ?? getDefaultRoomsOnlyForecastModelVersion(modelId);
    const currentObservation = selectCurrentEvaluationObservation(options.evaluationCase);
    const currentRooms = currentObservation?.rooms ?? null;
    const capacityRooms = options.evaluationCase.capacityRooms;
    const seasonalFinalRooms = getReferenceCurveRoomsAtTick(options.evaluationCase.referenceCurves.seasonalComponent, "ACT");
    const seasonalRoomsAtObservedLt = getReferenceCurveRoomsAtObservedLt(
        options.evaluationCase.referenceCurves.seasonalComponent,
        options.evaluationCase.observedLt
    );
    const recentRoomsAtObservedLt = getReferenceCurveRoomsAtObservedLt(
        options.evaluationCase.referenceCurves.recentWeighted90,
        options.evaluationCase.observedLt
    );
    const featureNames = getRoomsOnlyForecastFeatureNames(modelId);
    const warnings = [...options.evaluationCase.diagnostics.warnings];
    const missingReason = getRoomsOnlyForecastMissingReason({
        evaluationCase: options.evaluationCase,
        modelId,
        currentRooms,
        seasonalFinalRooms,
        seasonalRoomsAtObservedLt,
        recentRoomsAtObservedLt
    });

    if (missingReason !== undefined) {
        warnings.push(missingReason);
    }

    const predictedFinalRooms = missingReason === undefined
        ? clampForecastRooms(
            modelId === "seasonal_ratio_baseline"
                ? buildSeasonalRatioBaselineForecast(currentRooms as number, seasonalFinalRooms as number, seasonalRoomsAtObservedLt as number)
                : buildRecentDeviationAdjustedSeasonalForecast(
                    currentRooms as number,
                    seasonalFinalRooms as number,
                    recentRoomsAtObservedLt as number
                ),
            capacityRooms
        )
        : null;
    const expectedOccupancyRatio = predictedFinalRooms === null || capacityRooms == null || capacityRooms <= 0
        ? undefined
        : predictedFinalRooms / capacityRooms;

    return {
        modelId,
        modelVersion,
        facilityId: options.evaluationCase.facilityId,
        targetStayDate: options.evaluationCase.targetStayDate,
        asOfDate: options.evaluationCase.asOfDate,
        scope: options.evaluationCase.scope,
        ...(options.evaluationCase.roomGroupId === undefined ? {} : { roomGroupId: options.evaluationCase.roomGroupId }),
        segment: options.evaluationCase.segment,
        observedLt: options.evaluationCase.observedLt,
        currentRooms,
        ...(capacityRooms === undefined ? {} : { capacityRooms }),
        predictedFinalRooms,
        ...(expectedOccupancyRatio === undefined ? {} : { expectedOccupancyRatio }),
        diagnostics: {
            featureNames,
            ...(missingReason === undefined ? {} : { missingReason }),
            warnings: Array.from(new Set(warnings)),
            sourceCounts: {
                observedPrefixPointCount: options.evaluationCase.observedPrefix.length,
                ...(options.evaluationCase.referenceCurves.recentWeighted90 === undefined
                    ? {}
                    : { recentReferenceSourceCount: options.evaluationCase.referenceCurves.recentWeighted90.diagnostics.sourceStayDateCount }),
                ...(options.evaluationCase.referenceCurves.seasonalComponent === undefined
                    ? {}
                    : { seasonalReferenceSourceCount: options.evaluationCase.referenceCurves.seasonalComponent.diagnostics.sourceStayDateCount })
            },
            constraints: {
                actSeparated: !options.evaluationCase.diagnostics.warnings.includes("act_not_separated"),
                smallCapacity: capacityRooms != null && capacityRooms > 0 && capacityRooms <= 2,
                groupDriven: options.evaluationCase.diagnostics.warnings.includes("group_driven")
            }
        }
    };
}

export function getRecentWeighted90CandidateStayDates(options: {
    targetStayDate: string;
    asOfDate: string;
    ticks: readonly CurveTick[];
}): string[] {
    const targetStayDate = normalizeDateKey(options.targetStayDate);
    const asOfDate = normalizeDateKey(options.asOfDate);
    if (targetStayDate === null || asOfDate === null) {
        return [];
    }

    const targetWeekday = getUtcWeekday(targetStayDate);
    if (targetWeekday === null) {
        return [];
    }

    const numericTicks = options.ticks.filter((tick): tick is number => typeof tick === "number");
    const minStartOffset = Math.min(...numericTicks.map((tick) => -(90 - tick)), -90);
    const maxEndOffset = Math.max(...numericTicks, -1);
    const startDate = shiftDate(asOfDate, minStartOffset);
    const endDate = shiftDate(asOfDate, maxEndOffset);
    if (startDate === null || endDate === null) {
        return [];
    }

    return enumerateWeekdayDates(startDate, endDate, targetWeekday);
}

export function getSeasonalComponentCandidateStayDates(options: {
    targetMonth: string;
    weekday: number;
    yearsBack?: readonly number[];
}): string[] {
    const targetMonth = normalizeYearMonth(options.targetMonth);
    if (targetMonth === null || !isValidWeekday(options.weekday)) {
        return [];
    }

    const yearsBack = options.yearsBack ?? [1, 2];
    return yearsBack.flatMap((yearBack) => {
        const shiftedMonth = shiftYearMonth(targetMonth, -12 * yearBack);
        if (shiftedMonth === null) {
            return [];
        }

        const bounds = getYearMonthBounds(shiftedMonth);
        return bounds === null ? [] : enumerateWeekdayDates(bounds.firstDate, bounds.lastDate, options.weekday);
    });
}

export function normalizeDateKey(value: string): string | null {
    const compact = value.trim().replace(/-/g, "");
    if (!/^\d{8}$/.test(compact)) {
        return null;
    }

    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    if (!isValidUtcDate(year, month, day)) {
        return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function toCompactDateKey(value: string): string | null {
    const normalized = normalizeDateKey(value);
    return normalized === null ? null : normalized.replace(/-/g, "");
}

export function shiftDate(value: string, offsetDays: number): string | null {
    const normalized = normalizeDateKey(value);
    if (normalized === null) {
        return null;
    }

    const date = parseDateKeyToUtcDate(normalized);
    if (date === null) {
        return null;
    }

    date.setUTCDate(date.getUTCDate() + offsetDays);
    return formatUtcDate(date);
}

export function getDaysBetweenDateKeys(laterDateKey: string, earlierDateKey: string): number | null {
    const laterDate = parseDateKeyToUtcDate(laterDateKey);
    const earlierDate = parseDateKeyToUtcDate(earlierDateKey);
    if (laterDate === null || earlierDate === null) {
        return null;
    }

    return Math.round((laterDate.getTime() - earlierDate.getTime()) / 86400000);
}

export function getUtcWeekday(value: string): number | null {
    const date = parseDateKeyToUtcDate(value);
    return date === null ? null : date.getUTCDay();
}

function createEmptyReferenceCurveResult(
    input: CurveInput,
    options: ReferenceCurveBaseOptions & { asOfDate: string },
    curveKind: ReferenceCurveKind,
    algorithmVersion: string,
    extra: {
        targetStayDate?: string;
        targetMonth?: string;
        weekday?: number;
        missingReason: string;
    }
): ReferenceCurveResult {
    return {
        curveKind,
        algorithmVersion,
        facilityId: input.facilityId,
        scope: options.scope,
        ...(options.roomGroupId === undefined ? {} : { roomGroupId: options.roomGroupId }),
        segment: options.segment,
        ...(extra.targetStayDate === undefined ? {} : { targetStayDate: extra.targetStayDate }),
        ...(extra.targetMonth === undefined ? {} : { targetMonth: extra.targetMonth }),
        ...(extra.weekday === undefined ? {} : { weekday: extra.weekday }),
        asOfDate: options.asOfDate,
        points: options.ticks.map((tick) => ({
            lt: tick,
            rooms: null,
            sourceCount: 0
        })),
        diagnostics: {
            sourceStayDateCount: 0,
            missingReason: extra.missingReason,
            warnings: [extra.missingReason]
        }
    };
}

function selectObservations(observations: CurveObservation[], options: ReferenceCurveBaseOptions): CurveObservation[] {
    return observations.filter((observation) => (
        observation.scope === options.scope
        && observation.segment === options.segment
        && (options.scope === "hotel" || observation.roomGroupId === options.roomGroupId)
    ));
}

function selectEvaluationObservations(
    observations: CurveObservation[],
    options: {
        targetStayDate: string;
        scope: CurveScope;
        roomGroupId?: string;
        segment: CurveSegment;
    }
): CurveObservation[] {
    return observations.filter((observation) => (
        observation.stayDate === options.targetStayDate
        && observation.scope === options.scope
        && observation.segment === options.segment
        && (options.scope === "hotel" || observation.roomGroupId === options.roomGroupId)
    ));
}

function getForecastEvaluationMissingReason(
    input: CurveInput,
    options: BuildForecastEvaluationCaseOptions & {
        targetStayDate: string;
        asOfDate: string;
        roomGroupId?: string;
        observedLt: number | null;
    }
): ForecastEvaluationMissingReason | undefined {
    if (options.scope === "roomGroup" && options.roomGroupId === undefined) {
        return "room_group_id_missing";
    }
    if (!isKnownCurveSegment(options.segment)) {
        return "segment_unknown";
    }
    if (options.observedLt === null) {
        return "invalid_target_or_as_of_date";
    }
    if (options.observedLt < 0) {
        return "future_info_required";
    }

    const scopedObservations = selectEvaluationObservations(input.observations, options);
    const observedPrefix = scopedObservations.filter((observation) => observation.observedDate <= options.asOfDate);
    if (observedPrefix.length === 0) {
        return "observed_prefix_missing";
    }
    if (resolveActualFinalRooms(scopedObservations) === null) {
        return "actual_final_missing";
    }
    if (!hasActSeparatedEvidence(scopedObservations, options.asOfDate)) {
        return "act_not_separated";
    }
    return undefined;
}

function isKnownCurveSegment(segment: CurveSegment): boolean {
    return segment === "all" || segment === "transient" || segment === "group";
}

function resolveActualFinalRooms(observations: CurveObservation[]): number | null {
    const finalObservation = observations
        .filter((observation) => typeof observation.rooms === "number")
        .filter((observation) => observation.lt >= 0)
        .sort((left, right) => left.lt - right.lt)[0];
    return finalObservation?.rooms ?? null;
}

function resolveCapacityRooms(observations: CurveObservation[]): number | null | undefined {
    return observations.find((observation) => typeof observation.capacity === "number")?.capacity;
}

function hasActSeparatedEvidence(observations: CurveObservation[], asOfDate: string | null): boolean {
    if (asOfDate === null) {
        return false;
    }
    return observations.some((observation) => (
        observation.observedDate > asOfDate
        && observation.lt >= 0
        && typeof observation.rooms === "number"
    ));
}

function calculateSmape(predicted: number, actual: number): number {
    if (predicted === 0 && actual === 0) {
        return 0;
    }

    const denominator = (Math.abs(predicted) + Math.abs(actual)) / 2;
    if (denominator === 0) {
        return 0;
    }
    return Math.min(2, Math.abs(predicted - actual) / denominator);
}

function buildForecastEvaluationImpactProxy(
    inputs: readonly ForecastEvaluationResultInput[]
): NonNullable<ForecastEvaluationResult["impactProxy"]> {
    return {
        priorityOrderChangedCount: inputs.filter((input) => input.priorityOrderChanged === true).length,
        dismissedProxyCount: inputs.filter((input) => input.case.labels.dismissedByUser === true).length,
        snoozedProxyCount: inputs.filter((input) => input.case.labels.snoozedByUser === true).length,
        resolvedByRankChangeProxyCount: inputs.filter((input) => input.case.labels.resolvedByRankChange === true).length
    };
}

function getDefaultRoomsOnlyForecastModelVersion(modelId: RoomsOnlyForecastModelId): string {
    switch (modelId) {
        case "seasonal_ratio_baseline":
            return SEASONAL_RATIO_BASELINE_FORECAST_VERSION;
        case "recent_deviation_adjusted_seasonal":
        default:
            return RECENT_DEVIATION_ADJUSTED_SEASONAL_FORECAST_VERSION;
    }
}

function getRoomsOnlyForecastFeatureNames(modelId: RoomsOnlyForecastModelId): string[] {
    switch (modelId) {
        case "seasonal_ratio_baseline":
            return ["currentRooms", "seasonalRoomsAtObservedLt", "seasonalFinalRooms", "capacityRooms"];
        case "recent_deviation_adjusted_seasonal":
        default:
            return ["currentRooms", "recentRoomsAtObservedLt", "seasonalFinalRooms", "capacityRooms"];
    }
}

function getRoomsOnlyForecastMissingReason(options: {
    evaluationCase: ForecastEvaluationCase;
    modelId: RoomsOnlyForecastModelId;
    currentRooms: number | null;
    seasonalFinalRooms: number | null;
    seasonalRoomsAtObservedLt: number | null;
    recentRoomsAtObservedLt: number | null;
}): string | undefined {
    if (options.evaluationCase.diagnostics.missingReason !== undefined) {
        return options.evaluationCase.diagnostics.missingReason;
    }
    if (options.evaluationCase.observedLt === null) {
        return "observed_lt_missing";
    }
    if (options.currentRooms === null) {
        return "current_rooms_missing";
    }
    if (options.seasonalFinalRooms === null) {
        return "seasonal_final_missing";
    }
    if (options.modelId === "seasonal_ratio_baseline") {
        if (options.seasonalRoomsAtObservedLt === null) {
            return "seasonal_observed_lt_missing";
        }
        if (options.seasonalRoomsAtObservedLt <= 0) {
            return "seasonal_ratio_zero";
        }
    }
    if (options.modelId === "recent_deviation_adjusted_seasonal" && options.recentRoomsAtObservedLt === null) {
        return "recent_observed_lt_missing";
    }
    return undefined;
}

function selectCurrentEvaluationObservation(evaluationCase: ForecastEvaluationCase): CurveObservation | undefined {
    return evaluationCase.observedPrefix
        .filter((observation) => typeof observation.rooms === "number")
        .sort((left, right) => right.observedDate.localeCompare(left.observedDate))[0];
}

function getReferenceCurveRoomsAtObservedLt(result: ReferenceCurveResult | undefined, observedLt: number | null): number | null {
    return observedLt === null ? null : getReferenceCurveRoomsAtTick(result, observedLt);
}

function getReferenceCurveRoomsAtTick(result: ReferenceCurveResult | undefined, tick: CurveTick): number | null {
    return result?.points.find((point) => point.lt === tick)?.rooms ?? null;
}

function buildSeasonalRatioBaselineForecast(
    currentRooms: number,
    seasonalFinalRooms: number,
    seasonalRoomsAtObservedLt: number
): number {
    return currentRooms / (seasonalRoomsAtObservedLt / seasonalFinalRooms);
}

function buildRecentDeviationAdjustedSeasonalForecast(
    currentRooms: number,
    seasonalFinalRooms: number,
    recentRoomsAtObservedLt: number
): number {
    return seasonalFinalRooms + (currentRooms - recentRoomsAtObservedLt);
}

function clampForecastRooms(value: number, capacityRooms: number | null | undefined): number {
    const lowerBounded = Math.max(0, value);
    if (capacityRooms == null || capacityRooms <= 0) {
        return lowerBounded;
    }
    return Math.min(capacityRooms, lowerBounded);
}

function buildActComparisonDiagnostics(points: CurvePoint[]): ReferenceCurveActComparisonDiagnostics {
    const zeroLeadPoint = points.find((point) => point.lt === 0);
    const actPoint = points.find((point) => point.lt === "ACT");
    const zeroLeadRooms = zeroLeadPoint?.rooms ?? null;
    const actRooms = actPoint?.rooms ?? null;

    return {
        zeroLeadRooms,
        zeroLeadSourceCount: zeroLeadPoint?.sourceCount ?? 0,
        actRooms,
        actSourceCount: actPoint?.sourceCount ?? 0,
        differenceRooms: zeroLeadRooms === null || actRooms === null ? null : actRooms - zeroLeadRooms
    };
}

function buildRecentWeightedSamplesForLt(observations: CurveObservation[], asOfDate: string, lt: number): WeightedSample[] {
    const startDate = shiftDate(asOfDate, -(90 - lt));
    const endDate = shiftDate(asOfDate, lt);
    if (startDate === null || endDate === null) {
        return [];
    }

    return observations
        .filter((observation) => observation.lt === lt)
        .filter((observation) => observation.stayDate >= startDate && observation.stayDate <= endDate)
        .map((observation) => toRecentWeightedSample(observation, asOfDate))
        .filter((sample): sample is WeightedSample => sample !== null);
}

function buildRecentFinalWeightedSamples(observations: CurveObservation[], asOfDate: string): WeightedSample[] {
    const finalObservationsByStayDate = new Map<string, CurveObservation>();
    for (const observation of observations) {
        if (typeof observation.rooms !== "number" || observation.lt < 0 || observation.stayDate >= asOfDate) {
            continue;
        }

        const current = finalObservationsByStayDate.get(observation.stayDate);
        if (current === undefined || observation.lt < current.lt) {
            finalObservationsByStayDate.set(observation.stayDate, observation);
        }
    }

    return Array.from(finalObservationsByStayDate.values())
        .map((observation) => toRecentWeightedSample(observation, asOfDate))
        .filter((sample): sample is WeightedSample => sample !== null);
}

function toRecentWeightedSample(observation: CurveObservation, asOfDate: string): WeightedSample | null {
    if (typeof observation.rooms !== "number") {
        return null;
    }

    const distance = getDaysBetweenDateKeys(observation.stayDate, asOfDate);
    if (distance === null) {
        return null;
    }

    const absoluteDistance = Math.abs(distance);
    const weight = getRecentWeight(absoluteDistance);
    return weight === 0 ? null : { value: observation.rooms, weight };
}

function getRecentWeight(absoluteDistanceDays: number): number {
    if (absoluteDistanceDays <= 14) {
        return 3;
    }
    if (absoluteDistanceDays <= 30) {
        return 2;
    }
    if (absoluteDistanceDays <= 90) {
        return 1;
    }
    return 0;
}

function weightedAverage(samples: WeightedSample[]): number | null {
    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    if (totalWeight === 0) {
        return null;
    }

    return samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / totalWeight;
}

function average(values: number[]): number | null {
    return values.length === 0
        ? null
        : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupObservationsByStayDate(observations: CurveObservation[]): Map<string, CurveObservation[]> {
    const grouped = new Map<string, CurveObservation[]>();
    for (const observation of observations) {
        const current = grouped.get(observation.stayDate) ?? [];
        current.push(observation);
        grouped.set(observation.stayDate, current);
    }
    return grouped;
}

function resolveFinalRoomsByStayDate(observationsByStayDate: Map<string, CurveObservation[]>): Map<string, number> {
    const finalRoomsByStayDate = new Map<string, number>();
    for (const [stayDate, observations] of observationsByStayDate) {
        const finalObservation = observations
            .filter((observation) => typeof observation.rooms === "number")
            .filter((observation) => observation.lt >= 0)
            .sort((left, right) => left.lt - right.lt)[0];
        const finalRooms = finalObservation?.rooms;
        if (typeof finalRooms === "number" && finalRooms > 0) {
            finalRoomsByStayDate.set(stayDate, finalRooms);
        }
    }

    return finalRoomsByStayDate;
}

function buildSeasonalRatioByLt(
    ticks: readonly CurveTick[],
    observationsByStayDate: Map<string, CurveObservation[]>,
    finalRoomsByStayDate: Map<string, number>
): Map<number, SeasonalRatioBucket> {
    const ratioByLt = new Map<number, SeasonalRatioBucket>();
    const numericTicks = ticks.filter((tick): tick is number => typeof tick === "number");

    for (const tick of numericTicks) {
        if (tick === 0) {
            ratioByLt.set(tick, {
                ratio: 1,
                sourceCount: finalRoomsByStayDate.size
            });
            continue;
        }

        const ratios: number[] = [];
        for (const [stayDate, finalRooms] of finalRoomsByStayDate) {
            const observation = observationsByStayDate.get(stayDate)
                ?.find((candidate) => candidate.lt === tick && typeof candidate.rooms === "number");
            const rooms = observation?.rooms;
            if (typeof rooms !== "number") {
                continue;
            }
            ratios.push(rooms / finalRooms);
        }

        const ratio = average(ratios);
        if (ratio !== null) {
            ratioByLt.set(tick, {
                ratio,
                sourceCount: ratios.length
            });
        }
    }

    return ratioByLt;
}

function enforceSeasonalMonotonicShape(ratioByLt: Map<number, SeasonalRatioBucket>): Map<number, SeasonalRatioBucket> {
    const shaped = new Map<number, SeasonalRatioBucket>();
    const sortedLt = Array.from(ratioByLt.keys()).sort((left, right) => left - right);
    let maxAllowedRatio = 1;

    for (const lt of sortedLt) {
        const bucket = ratioByLt.get(lt);
        if (bucket === undefined) {
            continue;
        }

        const clippedRatio = Math.max(0, Math.min(1, bucket.ratio));
        const shapedRatio = Math.min(clippedRatio, maxAllowedRatio);
        shaped.set(lt, {
            ratio: shapedRatio,
            sourceCount: bucket.sourceCount
        });
        maxAllowedRatio = shapedRatio;
    }

    return shaped;
}

function enumerateWeekdayDates(startDate: string, endDate: string, weekday: number): string[] {
    const start = parseDateKeyToUtcDate(startDate);
    const end = parseDateKeyToUtcDate(endDate);
    if (start === null || end === null || !isValidWeekday(weekday) || start.getTime() > end.getTime()) {
        return [];
    }

    const dates: string[] = [];
    const cursor = new Date(start.getTime());
    while (cursor.getTime() <= end.getTime()) {
        if (cursor.getUTCDay() === weekday) {
            dates.push(formatUtcDate(cursor));
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
}

function getYearMonthBounds(yearMonth: string): { firstDate: string; lastDate: string } | null {
    const normalized = normalizeYearMonth(yearMonth);
    if (normalized === null) {
        return null;
    }

    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(5, 7));
    const lastDate = new Date(Date.UTC(year, month, 0));
    return {
        firstDate: `${normalized}-01`,
        lastDate: formatUtcDate(lastDate)
    };
}

function shiftYearMonth(yearMonth: string, offsetMonths: number): string | null {
    const normalized = normalizeYearMonth(yearMonth);
    if (normalized === null) {
        return null;
    }

    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(5, 7));
    const shifted = new Date(Date.UTC(year, month - 1 + offsetMonths, 1));
    return `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeYearMonth(value: string): string | null {
    const compact = value.trim().replace(/-/g, "");
    if (!/^\d{6}$/.test(compact)) {
        return null;
    }

    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function parseDateKeyToUtcDate(value: string): Date | null {
    const normalized = normalizeDateKey(value);
    if (normalized === null) {
        return null;
    }

    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(5, 7));
    const day = Number(normalized.slice(8, 10));
    return new Date(Date.UTC(year, month - 1, day));
}

function isValidUtcDate(year: number, month: number, day: number): boolean {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return false;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function isValidWeekday(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 6;
}

function formatUtcDate(date: Date): string {
    return [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
}
