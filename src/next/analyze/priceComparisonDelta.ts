export const PRICE_COMPARISON_DELTA_COLORS = {
    negative: "#9b3d1c",
    positive: "#176b63"
} as const;

export type PriceComparisonDeltaTone = "negative" | "neutral" | "positive";

export function getPriceComparisonDeltaTone(value: number | null): PriceComparisonDeltaTone {
    if (value === null || value === 0) {
        return "neutral";
    }
    return value > 0 ? "positive" : "negative";
}

export function formatPriceComparisonSignedPrice(value: number): string {
    return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("ja-JP").format(Math.round(value))}円`;
}

export function getPriceComparisonDeltaStyles(
    rootSelector: string,
    attribute: string
): string {
    return `
${rootSelector} [${attribute}="positive"] { color: ${PRICE_COMPARISON_DELTA_COLORS.positive}; }
${rootSelector} [${attribute}="negative"] { color: ${PRICE_COMPARISON_DELTA_COLORS.negative}; }
`;
}
