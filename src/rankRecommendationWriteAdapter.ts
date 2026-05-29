export const LINCOLN_CUSTOM_RANK_SUGGEST_ENDPOINT = "/api/v1/lincoln/suggest";

export type RankRecommendationWriteFailureType =
    | "http_error"
    | "network_error"
    | "unexpected_error";

export interface SubmitLincolnCustomRankSuggestionInput {
    stayDate: string;
    roomGroupId: string;
    targetRankCode: string;
    targetRankName: string;
}

export interface SubmitLincolnCustomRankSuggestionResult {
    ok: boolean;
    status: number | null;
    failureType: RankRecommendationWriteFailureType | null;
}

export async function submitLincolnCustomRankSuggestion(
    input: SubmitLincolnCustomRankSuggestionInput,
    fetchFn: typeof fetch = fetch
): Promise<SubmitLincolnCustomRankSuggestionResult> {
    try {
        const response = await fetchFn(new URL(LINCOLN_CUSTOM_RANK_SUGGEST_ENDPOINT, window.location.origin).toString(), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify({
                date: input.stayDate,
                rm_room_group_id: input.roomGroupId,
                price_rank_code: input.targetRankCode,
                price_rank_name: input.targetRankName
            })
        });

        return {
            ok: response.ok,
            status: response.status,
            failureType: response.ok ? null : "http_error"
        };
    } catch (error: unknown) {
        return {
            ok: false,
            status: null,
            failureType: error instanceof TypeError ? "network_error" : "unexpected_error"
        };
    }
}
