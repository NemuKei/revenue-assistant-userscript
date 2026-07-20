export type RevenueAssistantRuntimeMode = "classic" | "next";

export const REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL_KEY =
    "revenue-assistant-userscript:runtime-lease:v1";
export const REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL = Symbol.for(
    REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL_KEY
);

export const LEGACY_CLASSIC_SENTINEL_SELECTORS = [
    "#revenue-assistant-group-room-style",
    "[data-ra-group-room-toggle]",
    "[data-ra-rank-recommendation-list]",
    "[data-ra-rank-recommendation-analyze-list]",
    "[data-ra-rank-recommendation-react-island-host]",
    "[data-ra-sales-setting-current-ui-root]",
    "#revenue-assistant-monthly-progress-preview-style",
    "[data-ra-monthly-progress-preview-root]"
] as const;

export type RuntimeStartBlockReason =
    | "legacy-runtime-detected"
    | "lease-held"
    | "invalid-lease"
    | "lock-unavailable";

export type RuntimeStartResult =
    | {
        started: true;
        reason: "started";
        owner: RevenueAssistantRuntimeMode;
    }
    | {
        started: false;
        reason: RuntimeStartBlockReason;
        owner: RevenueAssistantRuntimeMode | null;
    };

interface RevenueAssistantRuntimeLease {
    schemaVersion: 1;
    owner: RevenueAssistantRuntimeMode;
}

interface QuerySelectorHost {
    querySelector(selectors: string): unknown;
}

export function detectLegacyClassicRuntime(documentHost: QuerySelectorHost): boolean {
    return LEGACY_CLASSIC_SENTINEL_SELECTORS.some(
        (selector) => documentHost.querySelector(selector) !== null
    );
}

export function startRevenueAssistantRuntime(input: {
    requestedMode: RevenueAssistantRuntimeMode;
    host: object;
    legacyDomDetected: boolean;
    start: () => void;
}): RuntimeStartResult {
    const claimResult = claimRevenueAssistantRuntime(input);
    if (!claimResult.started) {
        return claimResult;
    }

    input.start();
    return claimResult;
}

export function getRevenueAssistantRuntimeOwner(
    host: object
): RevenueAssistantRuntimeMode | "invalid" | null {
    if (!Object.prototype.hasOwnProperty.call(host, REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL)) {
        return null;
    }

    const value = (host as Record<PropertyKey, unknown>)[REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL];
    if (!isRevenueAssistantRuntimeLease(value)) {
        return "invalid";
    }
    return value.owner;
}

function claimRevenueAssistantRuntime(input: {
    requestedMode: RevenueAssistantRuntimeMode;
    host: object;
    legacyDomDetected: boolean;
}): RuntimeStartResult {
    if (input.legacyDomDetected) {
        return {
            started: false,
            reason: "legacy-runtime-detected",
            owner: getValidOwnerOrNull(input.host)
        };
    }

    const existingOwner = getRevenueAssistantRuntimeOwner(input.host);
    if (existingOwner !== null) {
        return {
            started: false,
            reason: existingOwner === "invalid" ? "invalid-lease" : "lease-held",
            owner: existingOwner === "invalid" ? null : existingOwner
        };
    }

    const lease = Object.freeze<RevenueAssistantRuntimeLease>({
        schemaVersion: 1,
        owner: input.requestedMode
    });
    try {
        Object.defineProperty(input.host, REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL, {
            value: lease,
            configurable: false,
            enumerable: false,
            writable: false
        });
    } catch {
        return {
            started: false,
            reason: "lock-unavailable",
            owner: getValidOwnerOrNull(input.host)
        };
    }

    if (getRevenueAssistantRuntimeOwner(input.host) !== input.requestedMode) {
        return {
            started: false,
            reason: "lock-unavailable",
            owner: getValidOwnerOrNull(input.host)
        };
    }

    return {
        started: true,
        reason: "started",
        owner: input.requestedMode
    };
}

function getValidOwnerOrNull(host: object): RevenueAssistantRuntimeMode | null {
    const owner = getRevenueAssistantRuntimeOwner(host);
    return owner === "invalid" ? null : owner;
}

function isRevenueAssistantRuntimeLease(value: unknown): value is RevenueAssistantRuntimeLease {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value as Partial<RevenueAssistantRuntimeLease>;
    return candidate.schemaVersion === 1
        && (candidate.owner === "classic" || candidate.owner === "next");
}
