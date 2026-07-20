export type LiveSimilarityLensMode = "idle" | "armed" | "selected";

export interface LiveSimilarityLensState {
    baseDate: string | null;
    mode: LiveSimilarityLensMode;
}

export function createInitialLiveSimilarityLensState(): LiveSimilarityLensState {
    return { baseDate: null, mode: "idle" };
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
    return { ...state, baseDate: stayDate, mode: "selected" };
}

export function clearLiveSimilarityLensBaseDate(): LiveSimilarityLensState {
    return createInitialLiveSimilarityLensState();
}
