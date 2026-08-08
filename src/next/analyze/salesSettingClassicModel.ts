import { getDaysBetweenDateKeys, normalizeDateKey } from "../../curveCore";
import type { BookingCurveReferenceScope } from "./bookingCurveReferenceDataSource";
import type {
    BookingCurveReferenceCurrentSummary,
    BookingCurveReferenceMetricSummary,
    BookingCurveReferenceViewModel
} from "./bookingCurveReferenceModel";
import {
    buildBookingCurveRankHistoryViewState,
    type BookingCurveRankHistoryViewState,
    type BookingCurveRankStatusSnapshot
} from "./bookingCurveRankMarkerModel";
import type { BookingCurveRankStatusLoadResult } from "./bookingCurveRankStatusDataSource";

export interface SalesSettingClassicRankSummary {
    afterRankName: string | null;
    beforeRankName: string | null;
    daysAgo: number | null;
    reflectedAt: string;
    roomDelta: number | null;
}

export interface SalesSettingClassicCardViewModel {
    curve: BookingCurveReferenceViewModel | null;
    rankHistory: BookingCurveRankHistoryViewState;
    rankSummary: SalesSettingClassicRankSummary | null;
    scope: BookingCurveReferenceScope;
}

export interface SalesSettingClassicOverallViewModel {
    capacityRooms: number | null;
    curve: BookingCurveReferenceViewModel | null;
    summary: BookingCurveReferenceCurrentSummary;
}

export interface SalesSettingClassicViewModel {
    cards: readonly SalesSettingClassicCardViewModel[];
    overall: SalesSettingClassicOverallViewModel;
    scopes: readonly BookingCurveReferenceScope[];
    stayDate: string;
}

export interface SalesSettingClassicRankState {
    error: Extract<BookingCurveRankStatusLoadResult, { status: "error" }>["reason"] | null;
    loading: boolean;
    snapshot: BookingCurveRankStatusSnapshot | null;
}

export function buildSalesSettingClassicViewModel(options: {
    curves: readonly BookingCurveReferenceViewModel[];
    rankState: SalesSettingClassicRankState;
    scopes: readonly BookingCurveReferenceScope[];
    stayDate: string;
    todayDate: string;
}): SalesSettingClassicViewModel {
    const curveByScope = new Map(options.curves.map((curve) => [curve.scope.key, curve]));
    const hotelCurve = curveByScope.get("hotel") ?? null;
    const roomScopes = options.scopes.filter((scope) => scope.kind === "roomGroup");
    const cards = roomScopes.map((scope): SalesSettingClassicCardViewModel => {
        const curve = curveByScope.get(scope.key) ?? null;
        const rankHistory = resolveRankHistory(scope, options.rankState);
        const latestEvent = rankHistory.status === "ready"
            ? rankHistory.events.slice().sort((left, right) => right.reflectedAt.localeCompare(left.reflectedAt))[0] ?? null
            : null;
        const markerValue = latestEvent === null || curve === null
            ? null
            : curve.panels
                .find((panel) => panel.segment === "all")
                ?.rankMarkers.find((marker) => marker.signature === latestEvent.signature)?.value ?? null;
        const currentValue = curve?.currentSummary.all.currentValue ?? null;
        return {
            curve,
            rankHistory,
            rankSummary: latestEvent === null
                ? null
                : {
                    afterRankName: latestEvent.afterRankName,
                    beforeRankName: latestEvent.beforeRankName,
                    daysAgo: resolveDaysAgo(options.todayDate, latestEvent.reflectedDate),
                    reflectedAt: latestEvent.reflectedAt,
                    roomDelta: currentValue === null || markerValue === null
                        ? null
                        : currentValue - markerValue
                },
            scope
        };
    });
    return {
        cards,
        overall: {
            capacityRooms: sumComplete(cards.map((card) => card.curve?.capacityRooms ?? null)),
            curve: hotelCurve,
            summary: {
                all: sumMetricSummaries(cards.map((card) => card.curve?.currentSummary.all ?? null)),
                group: hotelCurve?.currentSummary.group ?? createEmptyMetricSummary(),
                transient: hotelCurve?.currentSummary.transient ?? createEmptyMetricSummary()
            }
        },
        scopes: options.scopes,
        stayDate: options.stayDate
    };
}

function resolveRankHistory(
    scope: BookingCurveReferenceScope,
    state: SalesSettingClassicRankState
): BookingCurveRankHistoryViewState {
    if (state.snapshot !== null) {
        return buildBookingCurveRankHistoryViewState(state.snapshot, scope);
    }
    if (state.error !== null) {
        return { status: "error", reason: state.error };
    }
    return state.loading ? { status: "loading" } : { status: "empty", invalidEventCount: 0 };
}

function sumMetricSummaries(
    summaries: readonly (BookingCurveReferenceMetricSummary | null)[]
): BookingCurveReferenceMetricSummary {
    return {
        currentValue: sumComplete(summaries.map((summary) => summary?.currentValue ?? null)),
        previousDayValue: sumComplete(summaries.map((summary) => summary?.previousDayValue ?? null)),
        previousMonthValue: sumComplete(summaries.map((summary) => summary?.previousMonthValue ?? null)),
        previousWeekValue: sumComplete(summaries.map((summary) => summary?.previousWeekValue ?? null))
    };
}

function sumComplete(values: readonly (number | null)[]): number | null {
    return values.length === 0 || values.some((value) => value === null)
        ? null
        : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function createEmptyMetricSummary(): BookingCurveReferenceMetricSummary {
    return {
        currentValue: null,
        previousDayValue: null,
        previousMonthValue: null,
        previousWeekValue: null
    };
}

function resolveDaysAgo(todayDate: string, reflectedDate: string): number | null {
    const today = normalizeDateKey(todayDate);
    const reflected = normalizeDateKey(reflectedDate);
    if (today === null || reflected === null) {
        return null;
    }
    const value = getDaysBetweenDateKeys(today, reflected);
    return value === null || value < 0 ? null : value;
}
