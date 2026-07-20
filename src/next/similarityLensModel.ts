export interface SimilarityCurvePoint {
    leadDays: number;
    value: number;
}

export interface SimilarityDayEvidence {
    stayDate: string;
    onHandRooms: number | null;
    transientCurve: readonly SimilarityCurvePoint[] | null;
    groupCurve: readonly SimilarityCurvePoint[] | null;
    competitorPriceIndex: number | null;
}

export interface SimilarityDimensionScores {
    transientPace: number | null;
    groupPace: number | null;
    onHandRooms: number | null;
    competitorPosition: number | null;
}

export type SimilarityTier = "very_similar" | "similar";

export interface SimilarityMatch {
    stayDate: string;
    score: number;
    tier: SimilarityTier;
    sameWeekday: boolean;
    dimensions: SimilarityDimensionScores;
    availableDimensionCount: number;
    evidenceCoverage: number;
    reasonLabels: readonly string[];
}

export interface SimilarityLensOptions {
    maximumResults?: number;
    minimumScore?: number;
}

const DIMENSION_WEIGHTS = {
    transientPace: 0.4,
    groupPace: 0.2,
    onHandRooms: 0.2,
    competitorPosition: 0.2
} as const;
const DEFAULT_MINIMUM_SCORE = 0.68;
const VERY_SIMILAR_SCORE = 0.82;
const MINIMUM_TRANSIENT_SCORE = 0.6;
const TOTAL_DIMENSION_COUNT = 4;
const DEFAULT_MAXIMUM_RESULTS = 8;

export function findSimilarDays(
    base: SimilarityDayEvidence,
    candidates: readonly SimilarityDayEvidence[],
    options: SimilarityLensOptions = {}
): SimilarityMatch[] {
    const minimumScore = clamp01(options.minimumScore ?? DEFAULT_MINIMUM_SCORE);
    const maximumResults = Math.max(0, Math.floor(options.maximumResults ?? DEFAULT_MAXIMUM_RESULTS));

    return candidates
        .filter((candidate) => candidate.stayDate !== base.stayDate)
        .map((candidate) => compareSimilarityDayEvidence(base, candidate))
        .filter((match): match is SimilarityMatch => match !== null && match.score >= minimumScore)
        .sort((left, right) => right.score - left.score || left.stayDate.localeCompare(right.stayDate))
        .slice(0, maximumResults);
}

export function compareSimilarityDayEvidence(
    base: SimilarityDayEvidence,
    candidate: SimilarityDayEvidence
): SimilarityMatch | null {
    const dimensions: SimilarityDimensionScores = {
        transientPace: compareCurves(base.transientCurve, candidate.transientCurve),
        groupPace: compareCurves(base.groupCurve, candidate.groupCurve),
        onHandRooms: compareNumbers(base.onHandRooms, candidate.onHandRooms, 12),
        competitorPosition: compareNumbers(base.competitorPriceIndex, candidate.competitorPriceIndex, 0.2)
    };
    const weightedDimensions = (Object.keys(DIMENSION_WEIGHTS) as Array<keyof SimilarityDimensionScores>)
        .flatMap((key) => {
            const value = dimensions[key];
            return value === null ? [] : [{ value, weight: DIMENSION_WEIGHTS[key], key }];
        });
    if (
        weightedDimensions.length < 3
        || dimensions.transientPace === null
        || dimensions.transientPace < MINIMUM_TRANSIENT_SCORE
    ) {
        return null;
    }

    const totalWeight = weightedDimensions.reduce((total, dimension) => total + dimension.weight, 0);
    const score = weightedDimensions.reduce(
        (total, dimension) => total + dimension.value * dimension.weight,
        0
    ) / totalWeight;
    const closeReasons = [...weightedDimensions]
        .filter((dimension) => dimension.value >= 0.72)
        .sort((left, right) => right.value - left.value || right.weight - left.weight)
        .slice(0, 2)
        .map((dimension) => getReasonLabel(dimension.key));
    const sortedReasons = closeReasons.length === 0
        ? ["複数軸がほどよく近い"]
        : closeReasons;
    const baseWeekday = getUtcWeekday(base.stayDate);
    const candidateWeekday = getUtcWeekday(candidate.stayDate);
    const sameWeekday = baseWeekday !== null && baseWeekday === candidateWeekday;
    const evidenceCoverage = weightedDimensions.length / TOTAL_DIMENSION_COUNT;

    return {
        stayDate: candidate.stayDate,
        score: roundScore(score),
        tier: score >= VERY_SIMILAR_SCORE && evidenceCoverage === 1 ? "very_similar" : "similar",
        sameWeekday,
        dimensions,
        availableDimensionCount: weightedDimensions.length,
        evidenceCoverage: roundScore(evidenceCoverage),
        reasonLabels: sameWeekday ? [...sortedReasons, "同曜日"] : sortedReasons
    };
}

function compareCurves(
    left: readonly SimilarityCurvePoint[] | null,
    right: readonly SimilarityCurvePoint[] | null
): number | null {
    if (left === null || right === null || left.length === 0 || right.length === 0) {
        return null;
    }
    const rightByLeadDays = new Map(
        right
            .filter(isUsableCurvePoint)
            .map((point) => [point.leadDays, point.value] as const)
    );
    const pointScores = left
        .filter(isUsableCurvePoint)
        .flatMap((point) => {
            const other = rightByLeadDays.get(point.leadDays);
            return other === undefined ? [] : [relativeSimilarity(point.value, other, 4)];
        });
    if (pointScores.length === 0) {
        return null;
    }
    return roundScore(pointScores.reduce((total, score) => total + score, 0) / pointScores.length);
}

function isUsableCurvePoint(point: SimilarityCurvePoint): boolean {
    return Number.isFinite(point.leadDays) && Number.isFinite(point.value);
}

function compareNumbers(left: number | null, right: number | null, scale: number): number | null {
    if (left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right)) {
        return null;
    }
    return roundScore(relativeSimilarity(left, right, scale));
}

function relativeSimilarity(left: number, right: number, minimumScale: number): number {
    const scale = Math.max(minimumScale, Math.abs(left), Math.abs(right));
    return clamp01(1 - Math.abs(left - right) / scale);
}

function getReasonLabel(key: keyof SimilarityDimensionScores): string {
    if (key === "transientPace") {
        return "個人ペースが近い";
    }
    if (key === "groupPace") {
        return "団体ペースが近い";
    }
    if (key === "onHandRooms") {
        return "OHが近い";
    }
    return "競合位置が近い";
}

function getUtcWeekday(compactDate: string): number | null {
    if (!/^\d{8}$/u.test(compactDate)) {
        return null;
    }
    const year = Number(compactDate.slice(0, 4));
    const month = Number(compactDate.slice(4, 6));
    const day = Number(compactDate.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date.getUTCDay();
}

function roundScore(value: number): number {
    return Math.round(clamp01(value) * 1000) / 1000;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}
