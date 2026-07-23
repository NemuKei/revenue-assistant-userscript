import { findSimilarDays, type SimilarityMatch } from "../similarityLensModel";
import {
    projectLiveSimilarityLensEvidenceForRoomGroup,
    type LiveSimilarityLensEvidenceValue,
    type LiveSimilarityLensEvidenceViewModel,
    type LiveSimilarityLensRoomGroupEvidence
} from "./liveSimilarityLensEvidence";
import type { LiveSimilarityLensDataLoadErrorReason } from "./liveSimilarityLensDataSource";
import type { LiveSimilarityLensState } from "./liveSimilarityLensState";

export type LiveSimilarityLensEvidenceLoadState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; evidence: LiveSimilarityLensEvidenceViewModel; contextKey: string }
    | { status: "error"; reason: LiveSimilarityLensDataLoadErrorReason };

export interface LiveSimilarityLensRoomGroupOption {
    id: string;
    name: string;
}

export interface LiveSimilarityLensMatchViewModel {
    evidence: LiveSimilarityLensRoomGroupEvidence;
    match: SimilarityMatch;
}

export interface LiveSimilarityLensReadyViewModel {
    asOfDate: string;
    baseEvidence: LiveSimilarityLensRoomGroupEvidence | null;
    comparableDayCount: number;
    comparisonEvidence: readonly LiveSimilarityLensRoomGroupEvidence[];
    competitorCache: LiveSimilarityLensEvidenceViewModel["competitorCache"];
    matches: readonly LiveSimilarityLensMatchViewModel[];
    roomGroups: readonly LiveSimilarityLensRoomGroupOption[];
    totalDayCount: number;
}

export function buildLiveSimilarityLensReadyViewModel(
    state: LiveSimilarityLensState,
    evidence: LiveSimilarityLensEvidenceViewModel
): LiveSimilarityLensReadyViewModel {
    const baseDate = normalizeCompactDate(state.baseDate);
    const roomGroups = baseDate === null
        ? []
        : getNamedRoomGroupsForDate(evidence, baseDate);
    const selectedRoomGroupId = roomGroups.some((roomGroup) => roomGroup.id === state.selectedRoomGroupId)
        ? state.selectedRoomGroupId
        : null;
    const roomGroupEvidence = selectedRoomGroupId === null
        ? []
        : evidence.roomGroups.filter((item) => item.roomGroupId === selectedRoomGroupId);
    const baseEvidence = baseDate === null
        ? null
        : roomGroupEvidence.find((item) => item.stayDate === baseDate) ?? null;
    const similarityEvidence = selectedRoomGroupId === null
        ? []
        : projectLiveSimilarityLensEvidenceForRoomGroup(evidence, selectedRoomGroupId);
    const baseSimilarityEvidence = baseDate === null
        ? null
        : similarityEvidence.find((item) => item.stayDate === baseDate) ?? null;
    const matches = baseSimilarityEvidence === null
        ? []
        : findSimilarDays(baseSimilarityEvidence, similarityEvidence, { maximumResults: 6 })
            .flatMap((match): LiveSimilarityLensMatchViewModel[] => {
                const matchingEvidence = roomGroupEvidence.find((item) => item.stayDate === match.stayDate);
                return matchingEvidence === undefined ? [] : [{ evidence: matchingEvidence, match }];
            });
    const matchDates = new Set(matches.map((item) => item.match.stayDate));
    const selectedDates = state.selectedComparisonDates
        .map(normalizeCompactDate)
        .filter((stayDate): stayDate is string => stayDate !== null && matchDates.has(stayDate));
    const comparisonEvidence = selectedDates.flatMap((stayDate) => {
        const item = roomGroupEvidence.find((candidate) => candidate.stayDate === stayDate);
        return item === undefined ? [] : [item];
    });
    const comparableDayCount = roomGroupEvidence.filter(isComparableEvidence).length;

    return {
        asOfDate: evidence.asOfDate ?? "",
        baseEvidence,
        comparableDayCount,
        comparisonEvidence,
        competitorCache: evidence.competitorCache,
        matches,
        roomGroups,
        totalDayCount: roomGroupEvidence.length
    };
}

export function formatEvidenceMetric(
    evidence: LiveSimilarityLensEvidenceValue<unknown>,
    readyValue: string
): { label: string; tone: "ready" | "muted" | "warning" } {
    if (evidence.status === "ready") {
        return { label: readyValue, tone: "ready" };
    }
    if (evidence.status === "tail-pending") {
        return { label: "差分補充中", tone: "warning" };
    }
    if (evidence.status === "error") {
        return { label: "読取失敗", tone: "warning" };
    }
    if (evidence.status === "unavailable") {
        return { label: "未接続", tone: "muted" };
    }
    return { label: "未取得", tone: "muted" };
}

export function getCurveCurrentRooms(
    evidence: LiveSimilarityLensRoomGroupEvidence["transientCurve"]
): number | null {
    if (evidence.status !== "ready") {
        return null;
    }
    const currentPoint = [...evidence.value.points]
        .sort((left, right) => left.leadDays - right.leadDays)[0];
    return currentPoint?.value ?? null;
}

function getNamedRoomGroupsForDate(
    evidence: LiveSimilarityLensEvidenceViewModel,
    stayDate: string
): LiveSimilarityLensRoomGroupOption[] {
    const roomGroupsById = new Map<string, LiveSimilarityLensRoomGroupOption>();
    for (const item of evidence.roomGroups) {
        const name = item.roomGroupName?.trim() ?? "";
        if (item.stayDate !== stayDate || name === "") {
            continue;
        }
        roomGroupsById.set(item.roomGroupId, { id: item.roomGroupId, name });
    }
    return Array.from(roomGroupsById.values()).sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    );
}

function isComparableEvidence(evidence: LiveSimilarityLensRoomGroupEvidence): boolean {
    return evidence.onHand.status === "ready"
        && evidence.transientCurve.status === "ready"
        && evidence.groupCurve.status === "ready";
}

function normalizeCompactDate(value: string | null): string | null {
    if (value === null) {
        return null;
    }
    const compact = value.trim().replace(/-/gu, "");
    return /^\d{8}$/u.test(compact) ? compact : null;
}
