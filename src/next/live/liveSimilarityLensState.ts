export type LiveSimilarityLensMode = "idle" | "armed" | "selected";
export const LIVE_SIMILARITY_LENS_COMPARISON_LIMIT = 3;

export interface LiveSimilarityLensState {
    baseDate: string | null;
    mode: LiveSimilarityLensMode;
    selectedComparisonDates: readonly string[];
    selectedRoomGroupId: string | null;
}

export function createInitialLiveSimilarityLensState(): LiveSimilarityLensState {
    return {
        baseDate: null,
        mode: "idle",
        selectedComparisonDates: [],
        selectedRoomGroupId: null
    };
}

export function armLiveSimilarityLens(
    state: LiveSimilarityLensState
): LiveSimilarityLensState {
    return { ...state, mode: "armed" };
}

export function cancelLiveSimilarityLensSelection(
    state: LiveSimilarityLensState
): LiveSimilarityLensState {
    return { ...state, mode: state.baseDate === null ? "idle" : "selected" };
}

export function selectLiveSimilarityLensBaseDate(
    state: LiveSimilarityLensState,
    stayDate: string
): LiveSimilarityLensState {
    return {
        ...state,
        baseDate: stayDate,
        mode: "selected",
        selectedComparisonDates: [],
        selectedRoomGroupId: null
    };
}

export function selectLiveSimilarityLensRoomGroup(
    state: LiveSimilarityLensState,
    roomGroupId: string
): LiveSimilarityLensState {
    if (state.baseDate === null) {
        return state;
    }
    const normalizedRoomGroupId = roomGroupId.trim();
    const nextRoomGroupId = normalizedRoomGroupId === "" ? null : normalizedRoomGroupId;
    if (state.selectedRoomGroupId === nextRoomGroupId) {
        return state;
    }
    return {
        ...state,
        selectedComparisonDates: [],
        selectedRoomGroupId: nextRoomGroupId
    };
}

export function toggleLiveSimilarityLensComparisonDate(
    state: LiveSimilarityLensState,
    stayDate: string
): LiveSimilarityLensState {
    if (
        state.baseDate === null
        || state.selectedRoomGroupId === null
        || normalizeDate(state.baseDate) === normalizeDate(stayDate)
    ) {
        return state;
    }
    const selectedDates = new Set(state.selectedComparisonDates);
    if (selectedDates.has(stayDate)) {
        selectedDates.delete(stayDate);
    } else if (selectedDates.size < LIVE_SIMILARITY_LENS_COMPARISON_LIMIT) {
        selectedDates.add(stayDate);
    } else {
        return state;
    }
    return {
        ...state,
        selectedComparisonDates: Array.from(selectedDates)
    };
}

function normalizeDate(value: string): string {
    return value.trim().replace(/-/gu, "");
}

export function clearLiveSimilarityLensBaseDate(): LiveSimilarityLensState {
    return createInitialLiveSimilarityLensState();
}
