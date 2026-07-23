export interface NextFacilityContext {
    facilityId: string;
    facilityLabel: string;
}

export function parseNextFacilityContext(payload: unknown): NextFacilityContext | null {
    if (!isRecord(payload)) {
        return null;
    }
    const yadNo = typeof payload.yad_no === "string" ? payload.yad_no.trim() : "";
    const facilityLabel = typeof payload.name === "string" ? payload.name.trim() : "";
    return yadNo === "" || facilityLabel === ""
        ? null
        : { facilityId: `yad:${yadNo}`, facilityLabel };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
