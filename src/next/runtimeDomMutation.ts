const NEXT_RUNTIME_OWNED_SELECTOR = [
    "[data-ra-next-similarity-lens-root]",
    "[data-ra-next-sales-setting-classic-root]",
    "[data-ra-next-sales-setting-classic-supplement]",
    "[data-ra-next-booking-curve-reference-root]",
    "[data-ra-next-competitor-history-root]",
    "[data-ra-next-price-trend-comparison-root]",
    "[data-ra-next-booking-curve-acquisition-root]",
    "[data-ra-next-monthly-progress-root]"
].join(", ");

type MutationTarget = Pick<Node, "parentElement"> & Partial<Pick<Element, "closest">>;

export function shouldReconcileForDomMutations(
    records: readonly Pick<MutationRecord, "target">[]
): boolean {
    return records.some((record) => !isNextRuntimeOwnedTarget(record.target));
}

function isNextRuntimeOwnedTarget(target: MutationTarget): boolean {
    const element = typeof target.closest === "function"
        ? target
        : target.parentElement;
    return element?.closest?.(NEXT_RUNTIME_OWNED_SELECTOR) != null;
}
