import {
    type PriceConditionFilterOption,
    type PriceConditionFilters
} from "./priceConditionFilter";

export const PRICE_CONDITION_FILTERS_ATTRIBUTE = "data-ra-next-price-condition-filters";
export const PRICE_CONDITION_FILTER_GROUP_ATTRIBUTE = "data-ra-next-price-condition-filter-group";
export const PRICE_CONDITION_FILTER_KIND_ATTRIBUTE = "data-ra-next-price-condition-filter-kind";
export const PRICE_CONDITION_FILTER_VALUE_ATTRIBUTE = "data-ra-next-price-condition-filter-value";

interface PriceConditionFilterLegacyAttributes {
    container: string;
    group: string;
    kind: string;
    value: string;
}

export function createPriceConditionFilters(options: {
    availableFilters: {
        mealTypes: readonly PriceConditionFilterOption[];
        roomTypes: readonly PriceConditionFilterOption[];
    };
    documentHost: Document;
    filters: PriceConditionFilters;
    legacyAttributes: PriceConditionFilterLegacyAttributes;
}): HTMLElement {
    const container = options.documentHost.createElement("div");
    container.setAttribute(PRICE_CONDITION_FILTERS_ATTRIBUTE, "");
    container.setAttribute(options.legacyAttributes.container, "");
    container.append(
        createFilterGroup({
            ...options,
            filterOptions: options.availableFilters.roomTypes,
            kind: "roomType",
            label: "部屋タイプ"
        }),
        createFilterGroup({
            ...options,
            filterOptions: options.availableFilters.mealTypes,
            kind: "mealType",
            label: "食事"
        })
    );
    return container;
}

export function getPriceConditionFilterStyles(rootSelector: string): string {
    return `
${rootSelector} [${PRICE_CONDITION_FILTERS_ATTRIBUTE}] {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 18px;
    margin: 8px 0;
    color: #50627a;
    font-size: 12px;
    font-weight: 700;
}
${rootSelector} [${PRICE_CONDITION_FILTER_GROUP_ATTRIBUTE}] {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}
${rootSelector} [${PRICE_CONDITION_FILTER_GROUP_ATTRIBUTE}] legend {
    float: none;
    min-width: 0;
    padding: 0 2px 0 0;
    color: #50627a;
    font-size: 12px;
    font-weight: 700;
}
${rootSelector} [${PRICE_CONDITION_FILTER_KIND_ATTRIBUTE}] {
    min-height: 30px;
    padding: 4px 8px;
    border: 1px solid #c9d3df;
    border-radius: 4px;
    background: #ffffff;
    color: #385064;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
    cursor: pointer;
}
${rootSelector} [${PRICE_CONDITION_FILTER_KIND_ATTRIBUTE}][aria-pressed="true"] {
    border-color: #4b7fc7;
    background: #4b7fc7;
    color: #ffffff;
}
${rootSelector} [${PRICE_CONDITION_FILTER_KIND_ATTRIBUTE}]:focus-visible {
    outline: 3px solid #d98200;
    outline-offset: 2px;
}
@media (max-width: 680px) {
    ${rootSelector} [${PRICE_CONDITION_FILTERS_ATTRIBUTE}] { display: grid; gap: 8px; }
    ${rootSelector} [${PRICE_CONDITION_FILTER_GROUP_ATTRIBUTE}] { width: 100%; }
    ${rootSelector} [${PRICE_CONDITION_FILTER_GROUP_ATTRIBUTE}] legend {
        flex: 0 0 100%;
        min-width: 0;
        padding-bottom: 2px;
    }
    ${rootSelector} [${PRICE_CONDITION_FILTER_KIND_ATTRIBUTE}] { min-height: 44px; }
}
`;
}

function createFilterGroup(options: {
    documentHost: Document;
    filterOptions: readonly PriceConditionFilterOption[];
    filters: PriceConditionFilters;
    kind: keyof PriceConditionFilters;
    label: string;
    legacyAttributes: PriceConditionFilterLegacyAttributes;
}): HTMLElement {
    const group = options.documentHost.createElement("fieldset");
    group.setAttribute(PRICE_CONDITION_FILTER_GROUP_ATTRIBUTE, options.kind);
    group.setAttribute(options.legacyAttributes.group, options.kind);
    const legend = options.documentHost.createElement("legend");
    legend.textContent = options.label;
    group.append(legend);
    for (const option of [{ label: "指定なし", value: "" }, ...options.filterOptions]) {
        const button = options.documentHost.createElement("button");
        button.type = "button";
        button.setAttribute(PRICE_CONDITION_FILTER_KIND_ATTRIBUTE, options.kind);
        button.setAttribute(PRICE_CONDITION_FILTER_VALUE_ATTRIBUTE, option.value);
        button.setAttribute(options.legacyAttributes.kind, options.kind);
        button.setAttribute(options.legacyAttributes.value, option.value);
        button.setAttribute(
            "aria-pressed",
            String((options.filters[options.kind] ?? "") === option.value)
        );
        button.textContent = option.label;
        group.append(button);
    }
    return group;
}
