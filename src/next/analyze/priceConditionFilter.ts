export const PRICE_CONDITION_MEAL_TYPES = [
    "NONE",
    "BREAKFAST",
    "DINNER",
    "BREAKFAST_DINNER"
] as const;

export const PRICE_CONDITION_PRIMARY_ROOM_TYPES = [
    "SINGLE",
    "DOUBLE",
    "TWIN",
    "TRIPLE",
    "FOUR_BEDS"
] as const;

export const PRICE_CONDITION_ROOM_TYPES = [
    ...PRICE_CONDITION_PRIMARY_ROOM_TYPES,
    "WASHITSU",
    "WAYOUSHITSU"
] as const;

export interface PriceConditionFilters {
    mealType: string | null;
    roomType: string | null;
}

export interface PriceConditionFilterOption {
    label: string;
    value: string;
}

const FILTER_LABEL_ORDER = [
    "素泊まり",
    "朝食",
    "夕食",
    "朝夕食",
    "シングル",
    "セミダブル",
    "ダブル",
    "ツイン",
    "トリプル",
    "フォース",
    "スイート",
    "和室",
    "和洋室"
] as const;

export function formatPriceConditionRoomType(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (/four_beds|4_beds|quad|フォース/u.test(normalized)) {
        return "フォース";
    }
    if (/single|シングル/u.test(normalized)) {
        return "シングル";
    }
    if (/semi_double|semidouble|セミダブル/u.test(normalized)) {
        return "セミダブル";
    }
    if (/double|ダブル/u.test(normalized)) {
        return "ダブル";
    }
    if (/twin|ツイン/u.test(normalized)) {
        return "ツイン";
    }
    if (/triple|トリプル/u.test(normalized)) {
        return "トリプル";
    }
    if (/suite|スイート/u.test(normalized)) {
        return "スイート";
    }
    if (/和室|washitsu|japanese/u.test(normalized)) {
        return "和室";
    }
    if (/wayoushitsu|wayo|和洋/u.test(normalized)) {
        return "和洋室";
    }
    return value.trim();
}

export function formatPriceConditionMealType(value: string): string {
    const labels: Record<string, string> = {
        BREAKFAST: "朝食",
        BREAKFAST_DINNER: "朝夕食",
        DINNER: "夕食",
        NONE: "素泊まり"
    };
    const normalized = value.trim();
    return labels[normalized] ?? normalized;
}

export function comparePriceConditionFilterOptions(
    left: PriceConditionFilterOption,
    right: PriceConditionFilterOption
): number {
    const leftIndex = FILTER_LABEL_ORDER.indexOf(
        left.label as typeof FILTER_LABEL_ORDER[number]
    );
    const rightIndex = FILTER_LABEL_ORDER.indexOf(
        right.label as typeof FILTER_LABEL_ORDER[number]
    );
    if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? FILTER_LABEL_ORDER.length : leftIndex)
            - (rightIndex === -1 ? FILTER_LABEL_ORDER.length : rightIndex);
    }
    return left.label.localeCompare(right.label, "ja") || left.value.localeCompare(right.value);
}
