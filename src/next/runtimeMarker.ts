import type { RuntimeStartResult } from "./runtimeLease";

export const NEXT_RUNTIME_READY_STATE = "ready-read-only";

export function resolveNextRuntimeMarker(
    result: RuntimeStartResult,
    existingState: string | null
): string {
    if (result.started) {
        return NEXT_RUNTIME_READY_STATE;
    }
    if (
        result.reason === "lease-held"
        && result.owner === "next"
        && existingState === NEXT_RUNTIME_READY_STATE
    ) {
        return existingState;
    }
    return `blocked-${result.reason}`;
}
