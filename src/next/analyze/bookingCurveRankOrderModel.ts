export interface BookingCurveRankOrderEntry {
    code: string;
    name: string;
}

export interface BookingCurveRankOrderSnapshot {
    entries: readonly BookingCurveRankOrderEntry[];
}

/**
 * Parses the saved order from Revenue Assistant's rank-sequence settings.
 * The array order is intentionally preserved: callers treat it as high-to-low.
 */
export function parseBookingCurveRankOrderResponse(
    payload: unknown
): BookingCurveRankOrderSnapshot | null {
    if (!isRecord(payload) || !Array.isArray(payload.rank_sequences)) {
        return null;
    }

    const codes = new Set<string>();
    const names = new Set<string>();
    const entries: BookingCurveRankOrderEntry[] = [];
    for (const value of payload.rank_sequences) {
        const entry = parseEntry(value);
        if (entry === null || codes.has(entry.code) || names.has(entry.name)) {
            return null;
        }
        codes.add(entry.code);
        names.add(entry.name);
        entries.push(entry);
    }
    return entries.length === 0 ? null : { entries };
}

function parseEntry(value: unknown): BookingCurveRankOrderEntry | null {
    if (!isRecord(value)) {
        return null;
    }
    const code = typeof value.price_rank_code === "string"
        ? value.price_rank_code.trim()
        : "";
    const name = typeof value.price_rank_name === "string"
        ? value.price_rank_name.trim()
        : "";
    return code === "" || name === "" ? null : { code, name };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
