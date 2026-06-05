import {
    cleanupMonthlyProgressPage,
    getMonthlyProgressRouteState,
    syncMonthlyProgressPage
} from "./monthlyProgress";
import {
    syncRankRecommendationReactList,
    unmountRankRecommendationReactIsland,
    type RankRecommendationReactButtonSnapshot,
    type RankRecommendationReactCellSnapshot,
    type RankRecommendationReactControlsSnapshot,
    type RankRecommendationReactRowSnapshot
} from "./rankRecommendationReactIsland";
import {
    LEAD_TIME_BUCKET_TICKS as SALES_SETTING_BOOKING_CURVE_TICKS,
    LEAD_TIME_BUCKET_VISIBLE_TICKS as SALES_SETTING_BOOKING_CURVE_VISIBLE_AXIS_TICKS,
    type LeadTimeBucketTick as SalesSettingBookingCurveTick
} from "./leadTimeBuckets";
import {
    RECENT_WEIGHTED_90_ALGORITHM_VERSION,
    SEASONAL_COMPONENT_ALGORITHM_VERSION,
    buildForecastEvaluationCase,
    buildCurveInputFromBookingCurveResponses,
    buildRecentWeighted90ReferenceCurve,
    buildRoomsOnlyForecastResult,
    buildSalesAdrInputFromBookingCurveResponses,
    buildSeasonalComponentReferenceCurve,
    getRecentWeighted90CandidateStayDates,
    getSeasonalComponentCandidateStayDates,
    getUtcWeekday,
    normalizeDateKey,
    toCompactDateKey,
    type BookingCurveApiPoint,
    type BookingCurveApiResponse,
    type BookingCurveApiScopeCounts,
    type BookingCurveResponseSource,
    type CurvePoint,
    type CurveSegment,
    type CurveScope,
    type ForecastResultV1Candidate,
    type ReferenceCurveKind,
    type ReferenceCurveResult,
    type SalesAdrObservation
} from "./curveCore";
import {
    buildReferenceCurveCacheKey,
    getOrComputeReferenceCurve,
    readReferenceCurveRecord,
    scheduleReferenceCurveRequest
} from "./referenceCurveStore";
import { createIntervalRequestScheduler } from "./requestScheduler";
import {
    buildBookingCurveRawSourceCacheKey,
    buildBookingCurveRawSourceRecord,
    readBookingCurveRawSourceStoredRoomGroupStatus,
    readBookingCurveRawSourceStoredStayDateStatuses,
    readBookingCurveRawSourceRecord,
    type BookingCurveRawSourceRecord,
    type BookingCurveRawSourceStoredRoomGroupStatus,
    writeBookingCurveRawSourceRecord
} from "./bookingCurveRawSourceStore";
import {
    loadCompetitorPriceRequestContextBase,
    persistCompetitorPriceSnapshot,
    readCompetitorPriceSnapshotSeriesForStayDate,
    type CompetitorPriceRequestContextBase,
    type CompetitorPriceSnapshotPlan,
    type CompetitorPriceSnapshotRecord
} from "./competitorPriceSnapshotStore";
import {
    PRICE_TREND_GUEST_COUNTS,
    PRICE_TREND_MEAL_TYPE_REQUESTS,
    PRICE_TREND_ROOM_TYPE_REQUESTS,
    buildAllPriceTrendRequestScopes,
    fetchAndPersistPriceTrendRecords,
    loadPriceTrendRequestContext,
    readLatestPriceTrendRecordsForStayDate,
    type PriceTrendGuestCount,
    type PriceTrendRequestScope,
    type PriceTrendRequestContext,
    type PriceTrendRecord
} from "./priceTrendStore";
import {
    buildRankRecommendationEvidenceKey,
    buildRankRecommendationCandidates,
    buildRankRecommendationRankChangeProposal,
    resolveRankRecommendationRankOrder,
    type RankRecommendationAction,
    type RankRecommendationCandidate,
    type RankRecommendationCurveEvidence,
    type RankRecommendationCurrentSettingRoomGroup,
    type RankRecommendationCurrentSettingsResponse,
    type RankRecommendationForecastSignal,
    type RankRecommendationPriority,
    type RankRecommendationRankLadderEntry,
    type RankRecommendationRankOrderOverride,
    type RankRecommendationRankOrderResolution,
    type RankRecommendationOwnPricePositionSignal,
    type RankRecommendationOwnPricePositionScope,
    type RankRecommendationOwnPricePositionSource,
    type RankRecommendationRankChangeDisabledReason,
    type RankRecommendationRankChangeProposal,
    type RankRecommendationSalesAdrHealthSignal,
    type RankRecommendationStatus,
    type RankRecommendationWeekdayContextSignal
} from "./rankRecommendation";
import {
    buildRankRecommendationDecisionCacheKey,
    buildRankRecommendationDecisionRecord,
    readRankRecommendationDecisionRecords,
    writeRankRecommendationDecisionRecord,
    type RankRecommendationDecisionConfidenceLevel,
    type RankRecommendationDecisionRecord,
    type RankRecommendationDecisionType
} from "./rankRecommendationDecisionStore";
import {
    submitLincolnCustomRankSuggestion,
    type RankRecommendationWriteFailureType
} from "./rankRecommendationWriteAdapter";

const SCRIPT_NAME = typeof GM_info === "undefined"
    ? "Revenue Assistant Userscript"
    : (GM_info.script?.name ?? "Revenue Assistant Userscript");
const ANALYZE_DATE_PATTERN = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})$/;
const BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";
const BOOKING_CURVE_REQUEST_INTERVAL_MS = 350;
const ROOM_GROUPS_ENDPOINT = "/api/v1/booking_curve/rm_room_groups";
const CURRENT_SETTINGS_ENDPOINT = "/api/v1/suggest/output/current_settings";
const RANK_SEQUENCES_ENDPOINT = "/api/v1/rank_sequences";
const LINCOLN_SUGGEST_STATUS_ENDPOINT = "/api/v3/lincoln/suggest/status";
const YAD_INFO_ENDPOINT = "/api/v2/yad/info";

class RevenueAssistantRequestError extends Error {
    readonly endpoint: string;
    readonly status: number;

    constructor(endpoint: string, status: number) {
        super(`${endpoint} request failed: ${status}`);
        this.name = "RevenueAssistantRequestError";
        this.endpoint = endpoint;
        this.status = status;
    }
}

const SALES_SETTING_WARM_CACHE_LOOKBACK_DAYS = 1;
const SALES_SETTING_WARM_CACHE_LOOKAHEAD_MONTHS = 3;
const SALES_SETTING_WARM_CACHE_PRIORITY_MONTH_BUTTON_COUNT = 6;
const SALES_SETTING_WARM_CACHE_WORKER_COUNT = 3;
const SALES_SETTING_WARM_CACHE_REQUEST_INTERVAL_MS = 350;
const SALES_SETTING_WARM_CACHE_RUN_LIMIT_MS = 10 * 60 * 1000;
const SALES_SETTING_WARM_CACHE_COOLDOWN_MS = 3 * 60 * 1000;
const SALES_SETTING_WARM_CACHE_MAX_CONSECUTIVE_ERRORS = 3;
const SALES_SETTING_WARM_CACHE_MAX_RETRY_COUNT = 2;
const SALES_SETTING_WARM_CACHE_ALLOW_HIDDEN_TAB_STORAGE_KEY = "revenue-assistant:sales-setting-warm-cache:v1:allow-hidden-tab";
const CALENDAR_DATE_TEST_ID_PREFIX = "calendar-date-";
const GROUP_ROOM_STYLE_ID = "revenue-assistant-group-room-style";
const GROUP_ROOM_STYLE_VERSION = "20260604-inline-warm-cache-status-v1";
const GROUP_ROOM_LAYOUT_ATTRIBUTE = "data-ra-group-room-layout";
const GROUP_ROOM_BADGE_ATTRIBUTE = "data-ra-group-room-badge";
const GROUP_ROOM_ROOM_ATTRIBUTE = "data-ra-group-room-room";
const GROUP_ROOM_INDICATOR_ATTRIBUTE = "data-ra-group-room-indicator";
const SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE = "data-ra-sales-setting-warm-cache-calendar-cell";
const SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE = "data-ra-sales-setting-warm-cache-calendar-marker-state";
const SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE = "data-ra-sales-setting-warm-cache-calendar-marker-bar";
const SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_PROGRESS_PROPERTY = "--ra-sales-setting-warm-cache-calendar-marker-progress";
const SALES_SETTING_WARM_CACHE_MONTH_CONTROLS_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-controls";
const SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-control";
const SALES_SETTING_WARM_CACHE_MONTH_BUTTON_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-button";
const SALES_SETTING_WARM_CACHE_MONTH_KEY_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month";
const SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-status";
const SALES_SETTING_WARM_CACHE_MONTH_STATUS_SUMMARY_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-status-summary";
const SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-status-label";
const SALES_SETTING_WARM_CACHE_MONTH_PROGRESS_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-progress";
const SALES_SETTING_WARM_CACHE_MONTH_TITLE_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-title";
const SALES_SETTING_WARM_CACHE_HIDDEN_TAB_TOGGLE_ATTRIBUTE = "data-ra-sales-setting-warm-cache-hidden-tab-toggle";
const SALES_SETTING_WARM_CACHE_MONTH_ACTIONS_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-actions";
const SALES_SETTING_WARM_CACHE_MONTH_DETAIL_ATTRIBUTE = "data-ra-sales-setting-warm-cache-month-detail";
const SALES_SETTING_WARM_CACHE_INLINE_STATUS_ATTRIBUTE = "data-ra-sales-setting-warm-cache-inline-status";
const CALENDAR_LAST_CHANGE_ATTRIBUTE = "data-ra-calendar-last-change";
const CALENDAR_LAST_CHANGE_HOST_ATTRIBUTE = "data-ra-calendar-last-change-host";
const GROUP_ROOM_TOGGLE_ATTRIBUTE = "data-ra-group-room-toggle";
const GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE = "data-ra-group-room-toggle-button";
const GROUP_ROOM_TOGGLE_ACTIVE_ATTRIBUTE = "data-ra-group-room-toggle-active";
const RANK_RECOMMENDATION_LIST_ATTRIBUTE = "data-ra-rank-recommendation-list";
const RANK_RECOMMENDATION_LIST_SIGNATURE_ATTRIBUTE = "data-ra-rank-recommendation-list-signature";
const RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE = "data-ra-rank-recommendation-analyze-list";
const RANK_RECOMMENDATION_ANALYZE_ROW_ATTRIBUTE = "data-ra-rank-recommendation-analyze-row";
const RANK_RECOMMENDATION_ANALYZE_EMPTY_ATTRIBUTE = "data-ra-rank-recommendation-analyze-empty";
const RANK_RECOMMENDATION_ANALYZE_HIGHLIGHT_ATTRIBUTE = "data-ra-rank-recommendation-analyze-highlight";
const RANK_RECOMMENDATION_RANK_LADDER_ATTRIBUTE = "data-ra-rank-recommendation-rank-ladder";
const RANK_RECOMMENDATION_ORDER_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-order-control";
const RANK_RECOMMENDATION_ORDER_INPUT_ATTRIBUTE = "data-ra-rank-recommendation-order-input";
const RANK_RECOMMENDATION_ORDER_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-order-status";
const RANK_RECOMMENDATION_VIEW_MODE_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-view-mode-control";
const RANK_RECOMMENDATION_VIEW_MODE_ATTRIBUTE = "data-ra-rank-recommendation-view-mode";
const RANK_RECOMMENDATION_TARGET_MONTH_CONTROL_ATTRIBUTE = "data-ra-rank-recommendation-target-month-control";
const RANK_RECOMMENDATION_TARGET_MONTH_ATTRIBUTE = "data-ra-rank-recommendation-target-month";
const RANK_RECOMMENDATION_ROW_ATTRIBUTE = "data-ra-rank-recommendation-row";
const RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE = "data-ra-rank-recommendation-priority";
const RANK_RECOMMENDATION_ACTION_ATTRIBUTE = "data-ra-rank-recommendation-action";
const RANK_RECOMMENDATION_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-status";
const RANK_RECOMMENDATION_HISTORY_ATTRIBUTE = "data-ra-rank-recommendation-history";
const RANK_RECOMMENDATION_RAW_SOURCE_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-raw-source-status";
const RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE = "data-ra-rank-recommendation-rank-gap";
const RANK_RECOMMENDATION_RANK_GAP_TRIGGER_ATTRIBUTE = "data-ra-rank-recommendation-rank-gap-trigger";
const RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE = "data-ra-rank-recommendation-rank-gap-tooltip";
const RANK_RECOMMENDATION_CURVE_POPOVER_ATTRIBUTE = "data-ra-rank-recommendation-curve-popover";
const RANK_RECOMMENDATION_CURVE_POPOVER_CONTENT_ATTRIBUTE = "data-ra-rank-recommendation-curve-popover-content";
const RANK_RECOMMENDATION_INLINE_RANK_CHANGE_ATTRIBUTE = "data-ra-rank-recommendation-inline-rank-change";
const RANK_RECOMMENDATION_INLINE_RANK_SELECT_ATTRIBUTE = "data-ra-rank-recommendation-inline-rank-select";
const RANK_RECOMMENDATION_BUTTON_ATTRIBUTE = "data-ra-rank-recommendation-button";
const RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE = "data-ra-rank-recommendation-button-action";
const RANK_RECOMMENDATION_UI_COMPONENT_ATTRIBUTE = "data-ra-rank-recommendation-ui-component";
const RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE = "data-ra-rank-recommendation-cell-role";
const RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE = "data-ra-rank-recommendation-stay-date";
const RANK_RECOMMENDATION_BUTTON_AS_OF_DATE_ATTRIBUTE = "data-ra-rank-recommendation-as-of-date";
const RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE = "data-ra-rank-recommendation-room-group-id";
const RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE = "data-ra-rank-recommendation-room-group-name";
const RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE = "data-ra-rank-recommendation-reason-fingerprint";
const RANK_RECOMMENDATION_BUTTON_CONFIDENCE_LEVEL_ATTRIBUTE = "data-ra-rank-recommendation-confidence-level";
const RANK_RECOMMENDATION_BUTTON_ACTION_LABEL_ATTRIBUTE = "data-ra-rank-recommendation-action-label";
const RANK_RECOMMENDATION_BUTTON_REASON_TEXT_ATTRIBUTE = "data-ra-rank-recommendation-reason-text";
const RANK_RECOMMENDATION_BUTTON_CAUTION_TEXT_ATTRIBUTE = "data-ra-rank-recommendation-caution-text";
const RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE = "data-ra-rank-recommendation-pending-decision";
const RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE = "data-ra-rank-recommendation-pending-decision-key";
const RANK_RECOMMENDATION_PENDING_PROGRESS_ATTRIBUTE = "data-ra-rank-recommendation-pending-progress";
const RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_ROW_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-preview-row";
const RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_CELL_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-preview-cell";
const RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-status";
const RANK_RECOMMENDATION_RANK_CHANGE_TARGET_CODE_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-target-code";
const RANK_RECOMMENDATION_RANK_CHANGE_TARGET_NAME_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-target-name";
const RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_CODE_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-current-code";
const RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_NAME_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-current-name";
const RANK_RECOMMENDATION_RANK_CHANGE_GENERATED_AT_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-generated-at";
const RANK_RECOMMENDATION_RANK_CHANGE_DISABLED_REASONS_ATTRIBUTE = "data-ra-rank-recommendation-rank-change-disabled-reasons";
const RANK_RECOMMENDATION_PENDING_RANK_CHANGE_ATTRIBUTE = "data-ra-rank-recommendation-pending-rank-change";
const RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE = "data-ra-rank-recommendation-pending-rank-change-key";
const RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE = "data-ra-rank-recommendation-curve-preview-row";
const RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE = "data-ra-rank-recommendation-curve-preview-cell";
const RANK_RECOMMENDATION_CURVE_PREVIEW_KEY_ATTRIBUTE = "data-ra-rank-recommendation-curve-preview-key";
const RANK_RECOMMENDATION_CURVE_PREVIEW_DIAGNOSTICS_ATTRIBUTE = "data-ra-rank-recommendation-curve-preview-diagnostics";
const RANK_RECOMMENDATION_COMPETITOR_PREVIEW_ROW_ATTRIBUTE = "data-ra-rank-recommendation-competitor-preview-row";
const RANK_RECOMMENDATION_COMPETITOR_PREVIEW_CELL_ATTRIBUTE = "data-ra-rank-recommendation-competitor-preview-cell";
const RANK_RECOMMENDATION_COMPETITOR_PREVIEW_KEY_ATTRIBUTE = "data-ra-rank-recommendation-competitor-preview-key";
const RANK_RECOMMENDATION_COMPETITOR_PREVIEW_STATUS_ATTRIBUTE = "data-ra-rank-recommendation-competitor-preview-status";
const RANK_RECOMMENDATION_FOCUS_HIGHLIGHT_ATTRIBUTE = "data-ra-rank-recommendation-focus-highlight";
const RANK_RECOMMENDATION_FOCUS_SUMMARY_ATTRIBUTE = "data-ra-rank-recommendation-focus-summary";
const RANK_RECOMMENDATION_PENDING_FOCUS_STORAGE_KEY = "revenue-assistant:rank-recommendation:pending-focus";
const RANK_RECOMMENDATION_ORDER_OVERRIDE_STORAGE_PREFIX = "revenue-assistant:rank-recommendation:rank-order-override:";
const RANK_RECOMMENDATION_RANK_CHANGE_FAILURE_STORAGE_KEY = "revenue-assistant:rank-recommendation:rank-change-failures:v1";
const RANK_RECOMMENDATION_FIXTURE_MODE_STORAGE_KEY = "revenue-assistant:rank-recommendation:fixture-mode";
const RANK_RECOMMENDATION_DECISION_UNDO_DELAY_MS = 5000;
const RANK_RECOMMENDATION_INITIAL_DISPLAY_LIMIT = 10;
const RANK_RECOMMENDATION_DISPLAY_LIMIT_STEP = 10;
const RANK_RECOMMENDATION_MAX_DISPLAY_LIMIT = 50;
type RankRecommendationViewMode = "all" | "raise" | "lower" | "caution";
const RANK_RECOMMENDATION_VIEW_MODE_OPTIONS: readonly {
    mode: RankRecommendationViewMode;
    label: string;
    title: string;
}[] = [
    { mode: "all", label: "全て", title: "表示条件をかけず、優先度順に表示する" },
    { mode: "raise", label: "上げ検討", title: "上げ検討の候補だけを表示する" },
    { mode: "lower", label: "下げ注意", title: "下げ注意の候補だけを表示する" },
    { mode: "caution", label: "注意あり", title: "不足または注意が残る候補だけを表示する" }
];
const SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE = "data-ra-sales-setting-group-room-row";
const SALES_SETTING_GROUP_ROOM_ROW_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-group-room-row-signature";
const SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE = "data-ra-sales-setting-group-room-tone";
const SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE = "data-ra-sales-setting-overall-summary";
const SALES_SETTING_OVERALL_SUMMARY_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-overall-summary-signature";
const SALES_SETTING_OVERALL_SALES_ROW_ATTRIBUTE = "data-ra-sales-setting-overall-sales-row";
const SALES_SETTING_OVERALL_TITLE_ATTRIBUTE = "data-ra-sales-setting-overall-title";
const SALES_SETTING_OVERALL_METRIC_ATTRIBUTE = "data-ra-sales-setting-overall-metric";
const SALES_SETTING_OVERALL_GROUP_ROW_ATTRIBUTE = "data-ra-sales-setting-overall-group-row";
const SALES_SETTING_OVERALL_TABLE_ATTRIBUTE = "data-ra-sales-setting-overall-table";
const SALES_SETTING_OVERALL_ROW_ATTRIBUTE = "data-ra-sales-setting-overall-row";
const SALES_SETTING_OVERALL_LABEL_ATTRIBUTE = "data-ra-sales-setting-overall-label";
const SALES_SETTING_OVERALL_VALUE_ATTRIBUTE = "data-ra-sales-setting-overall-value";
const SALES_SETTING_OVERALL_EMPHASIS_ATTRIBUTE = "data-ra-sales-setting-overall-emphasis";
const SALES_SETTING_ROOM_DELTA_ATTRIBUTE = "data-ra-sales-setting-room-delta";
const SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE = "data-ra-sales-setting-rank-overview";
const SALES_SETTING_RANK_OVERVIEW_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-rank-overview-signature";
const SALES_SETTING_RANK_OVERVIEW_TITLE_ATTRIBUTE = "data-ra-sales-setting-rank-overview-title";
const SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE = "data-ra-sales-setting-rank-overview-table";
const SALES_SETTING_RANK_OVERVIEW_ROW_ATTRIBUTE = "data-ra-sales-setting-rank-overview-row";
const SALES_SETTING_RANK_OVERVIEW_ROOM_ATTRIBUTE = "data-ra-sales-setting-rank-overview-room";
const SALES_SETTING_RANK_OVERVIEW_META_ATTRIBUTE = "data-ra-sales-setting-rank-overview-meta";
const SALES_SETTING_RANK_OVERVIEW_VALUE_ATTRIBUTE = "data-ra-sales-setting-rank-overview-value";
const SALES_SETTING_RANK_OVERVIEW_DELTA_ATTRIBUTE = "data-ra-sales-setting-rank-overview-delta";
const SALES_SETTING_RANK_DETAIL_ATTRIBUTE = "data-ra-sales-setting-rank-detail";
const SALES_SETTING_RANK_DETAIL_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-rank-detail-signature";
const SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_ATTRIBUTE = "data-ra-sales-setting-competitor-price-overview";
const SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-competitor-price-overview-signature";
const SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_TITLE_ATTRIBUTE = "data-ra-sales-setting-competitor-price-overview-title";
const SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_META_ATTRIBUTE = "data-ra-sales-setting-competitor-price-overview-meta";
const SALES_SETTING_COMPETITOR_PRICE_CONTROLS_ATTRIBUTE = "data-ra-sales-setting-competitor-price-controls";
const SALES_SETTING_COMPETITOR_PRICE_FILTER_GROUP_ATTRIBUTE = "data-ra-sales-setting-competitor-price-filter-group";
const SALES_SETTING_COMPETITOR_PRICE_FILTER_LABEL_ATTRIBUTE = "data-ra-sales-setting-competitor-price-filter-label";
const SALES_SETTING_COMPETITOR_PRICE_FILTER_BUTTON_ATTRIBUTE = "data-ra-sales-setting-competitor-price-filter-button";
const SALES_SETTING_COMPETITOR_PRICE_FILTER_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-competitor-price-filter-active";
const SALES_SETTING_COMPETITOR_PRICE_LEGEND_ATTRIBUTE = "data-ra-sales-setting-competitor-price-legend";
const SALES_SETTING_COMPETITOR_PRICE_LEGEND_ITEM_ATTRIBUTE = "data-ra-sales-setting-competitor-price-legend-item";
const SALES_SETTING_COMPETITOR_PRICE_LEGEND_SWATCH_ATTRIBUTE = "data-ra-sales-setting-competitor-price-legend-swatch";
const SALES_SETTING_COMPETITOR_PRICE_CHART_GRID_ATTRIBUTE = "data-ra-sales-setting-competitor-price-chart-grid";
const SALES_SETTING_COMPETITOR_PRICE_CHART_PANEL_ATTRIBUTE = "data-ra-sales-setting-competitor-price-chart-panel";
const SALES_SETTING_COMPETITOR_PRICE_CHART_TITLE_ATTRIBUTE = "data-ra-sales-setting-competitor-price-chart-title";
const SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE = "data-ra-sales-setting-competitor-price-chart-svg";
const SALES_SETTING_COMPETITOR_PRICE_CHART_GUIDE_LINE_ATTRIBUTE = "data-ra-sales-setting-competitor-price-chart-guide-line";
const SALES_SETTING_COMPETITOR_PRICE_CHART_HITBOX_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-competitor-price-chart-hitbox-active";
const SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE = "data-ra-sales-setting-competitor-price-tooltip";
const SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_FACILITY_ATTRIBUTE = "data-ra-sales-setting-competitor-price-tooltip-facility";
const SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_SWATCH_ATTRIBUTE = "data-ra-sales-setting-competitor-price-tooltip-swatch";
const SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_TONE_ATTRIBUTE = "data-ra-sales-setting-competitor-price-tooltip-tone";
const SALES_SETTING_COMPETITOR_PRICE_EMPTY_ATTRIBUTE = "data-ra-sales-setting-competitor-price-empty";
const SALES_SETTING_COMPETITOR_PRICE_NEXT_ACTION_ATTRIBUTE = "data-ra-sales-setting-competitor-price-next-action";
const SALES_SETTING_PRICE_TREND_OVERVIEW_ATTRIBUTE = "data-ra-sales-setting-price-trend-overview";
const SALES_SETTING_PRICE_TREND_OVERVIEW_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-price-trend-overview-signature";
const COMPETITOR_PRICE_GUEST_COUNTS = [1, 2, 3, 4] as const;
const COMPETITOR_PRICE_OWN_SERIES_COLOR = "#2f6fbb";
const COMPETITOR_PRICE_COMPETITOR_SERIES_COLORS = [
    "#c4552d",
    "#2e7d58",
    "#7d5fb2",
    "#b47a12",
    "#5c6b7a",
    "#d14f7a",
    "#008b8b",
    "#8a5a44",
    "#6f7f22",
    "#9a4fb3",
    "#4f7f9f"
];
const COMPETITOR_PRICE_OVERVIEW_UI_VERSION = "trend-tooltip-facility-v9";
const PRICE_TREND_OVERVIEW_UI_VERSION = "price-trend-next-action-v1";
const COMPETITOR_PRICE_TOOLTIP_OFFSET_X = 8;
const COMPETITOR_PRICE_ROOM_TYPE_REQUESTS = ["SINGLE", "DOUBLE", "TWIN", "TRIPLE", "FOUR_BEDS"] as const;
const COMPETITOR_PRICE_SNAPSHOT_BACKGROUND_INTERVAL_MS = 1000;
const PRICE_TREND_BACKGROUND_QUEUE_INTERVAL_MS = 1000;
const PRICE_TREND_BACKGROUND_QUEUE_MAX_CONSECUTIVE_ERRORS = 3;
const PRICE_TREND_BACKGROUND_FIXTURE_STORAGE_KEY = "revenue-assistant:price-trends:v1:background-fixture";
const SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE = "data-ra-sales-setting-current-ui-root";
const SALES_SETTING_CURRENT_UI_CARDS_ATTRIBUTE = "data-ra-sales-setting-current-ui-cards";
const SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE = "data-ra-sales-setting-current-ui-card";
const SALES_SETTING_CURRENT_UI_CARD_ROOM_GROUP_ATTRIBUTE = "data-ra-sales-setting-current-ui-room-group";
const SALES_SETTING_CURRENT_UI_HEADING_ATTRIBUTE = "data-ra-sales-setting-current-ui-heading";
const SALES_SETTING_CURRENT_UI_TITLE_ATTRIBUTE = "data-ra-sales-setting-current-ui-title";
const SALES_SETTING_CURRENT_UI_META_ATTRIBUTE = "data-ra-sales-setting-current-ui-meta";
const SALES_SETTING_CURRENT_UI_META_LABEL_ATTRIBUTE = "data-ra-sales-setting-current-ui-meta-label";
const SALES_SETTING_CURRENT_UI_DETAIL_WRAPPER_ATTRIBUTE = "data-ra-sales-setting-current-ui-detail-wrapper";
const SALES_SETTING_CURRENT_UI_CAPACITY_ATTRIBUTE = "data-ra-sales-setting-current-ui-capacity";
const SALES_SETTING_CURRENT_UI_CAPACITY_MAX_ATTRIBUTE = "data-ra-sales-setting-current-ui-capacity-max";
const SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE = "data-ra-sales-setting-current-ui-supplements";
const SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE = "data-ra-sales-setting-booking-curve-section";
const SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE = "data-ra-sales-setting-booking-curve-kind";
const SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-signature";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-row";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-button";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_KEY_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-key";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-active";
const SALES_SETTING_BOOKING_CURVE_HEADER_ATTRIBUTE = "data-ra-sales-setting-booking-curve-header";
const SALES_SETTING_BOOKING_CURVE_NOTE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-note";
const SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_GROUP_ATTRIBUTE = "data-ra-sales-setting-booking-curve-reference-toggle-group";
const SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-reference-toggle";
const SALES_SETTING_BOOKING_CURVE_REFERENCE_KIND_ATTRIBUTE = "data-ra-sales-setting-booking-curve-reference-kind";
const SALES_SETTING_BOOKING_CURVE_REFERENCE_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-reference-active";
const SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_GROUP_ATTRIBUTE = "data-ra-sales-setting-booking-curve-helper-toggle-group";
const SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-helper-toggle";
const SALES_SETTING_BOOKING_CURVE_HELPER_KIND_ATTRIBUTE = "data-ra-sales-setting-booking-curve-helper-kind";
const SALES_SETTING_BOOKING_CURVE_HELPER_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-helper-active";
const SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_GROUP_ATTRIBUTE = "data-ra-sales-setting-booking-curve-segment-toggle-group";
const SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-segment-toggle";
const SALES_SETTING_BOOKING_CURVE_SEGMENT_ATTRIBUTE = "data-ra-sales-setting-booking-curve-segment";
const SALES_SETTING_BOOKING_CURVE_SEGMENT_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-segment-active";
const SALES_SETTING_BOOKING_CURVE_LEGEND_ATTRIBUTE = "data-ra-sales-setting-booking-curve-legend";
const SALES_SETTING_BOOKING_CURVE_LEGEND_ITEM_ATTRIBUTE = "data-ra-sales-setting-booking-curve-legend-item";
const SALES_SETTING_BOOKING_CURVE_GRID_ATTRIBUTE = "data-ra-sales-setting-booking-curve-grid";
const SALES_SETTING_BOOKING_CURVE_PANEL_ATTRIBUTE = "data-ra-sales-setting-booking-curve-panel";
const SALES_SETTING_BOOKING_CURVE_PANEL_TITLE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-panel-title";
const SALES_SETTING_BOOKING_CURVE_PANEL_METRIC_ATTRIBUTE = "data-ra-sales-setting-booking-curve-panel-metric";
const SALES_SETTING_BOOKING_CURVE_CANVAS_ATTRIBUTE = "data-ra-sales-setting-booking-curve-canvas";
const SALES_SETTING_BOOKING_CURVE_PANEL_SVG_ATTRIBUTE = "data-ra-sales-setting-booking-curve-panel-svg";
const SALES_SETTING_BOOKING_CURVE_TOOLTIP_ATTRIBUTE = "data-ra-sales-setting-booking-curve-tooltip";
const SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-tooltip-active";
const SALES_SETTING_BOOKING_CURVE_TOOLTIP_TITLE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-tooltip-title";
const SALES_SETTING_BOOKING_CURVE_TOOLTIP_VALUE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-tooltip-value";
const SALES_SETTING_BOOKING_CURVE_TOOLTIP_META_ATTRIBUTE = "data-ra-sales-setting-booking-curve-tooltip-meta";
const SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_ATTRIBUTE = "data-ra-sales-setting-booking-curve-tooltip-detail";
const SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_EMPHASIS_ATTRIBUTE = "data-ra-sales-setting-booking-curve-tooltip-detail-emphasis";
const SALES_SETTING_BOOKING_CURVE_AXIS_LABEL_ATTRIBUTE = "data-ra-sales-setting-booking-curve-axis-label";
const SALES_SETTING_BOOKING_CURVE_AXIS_LABEL_VISIBLE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-axis-label-visible";
const SALES_SETTING_BOOKING_CURVE_Y_AXIS_LABEL_ATTRIBUTE = "data-ra-sales-setting-booking-curve-y-axis-label";
const SALES_SETTING_BOOKING_CURVE_Y_AXIS_LINE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-y-axis-line";
const SALES_SETTING_BOOKING_CURVE_ACTIVE_GUIDE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-active-guide";
const SALES_SETTING_BOOKING_CURVE_ACTIVE_POINT_ATTRIBUTE = "data-ra-sales-setting-booking-curve-active-point";
const SALES_SETTING_BOOKING_CURVE_MARKER_POINT_ATTRIBUTE = "data-ra-sales-setting-booking-curve-marker-point";
const SALES_SETTING_BOOKING_CURVE_MARKER_HITBOX_ATTRIBUTE = "data-ra-sales-setting-booking-curve-marker-hitbox";
const SALES_SETTING_BOOKING_CURVE_HITBOX_ATTRIBUTE = "data-ra-sales-setting-booking-curve-hitbox";
const SALES_SETTING_CURRENT_UI_HEADER_TEST_ID = "booking-curve-main-chart-header";
const SALES_SETTING_CURRENT_UI_ROOM_GROUP_SELECTOR_TEST_ID = "highlight-filter-price-rank-rm-room-group-pulldown-form";
const GROUP_ROOM_STORAGE_PREFIX = "revenue-assistant:group-room-count:v4:";
const LEGACY_GROUP_ROOM_STORAGE_PREFIXES = [
    "revenue-assistant:group-room-count:v1:",
    "revenue-assistant:group-room-count:v2:",
    "revenue-assistant:group-room-count:v3:"
] as const;
const GROUP_ROOM_VISIBILITY_STORAGE_KEY = `${GROUP_ROOM_STORAGE_PREFIX}calendar-visible`;
const CONSISTENCY_CHECK_DEBOUNCE_MS = 250;
const CONSISTENCY_CHECK_MIN_INTERVAL_MS = 15000;
const SALES_SETTING_SUPPLEMENT_CLEANUP_DELAY_MS = 1500;
const SALES_SETTING_SUPPLEMENT_RETRY_DELAYS_MS = [150, 600, 1500, 3000, 6000] as const;
const SALES_SETTING_REFERENCE_CURVE_TICKS = SALES_SETTING_BOOKING_CURVE_TICKS;
const SALES_SETTING_REFERENCE_ZERO_DAY_DISPLAY_INTERPOLATION_RATIO = 0.5;
const SALES_SETTING_REFERENCE_ZERO_DAY_EQUALITY_EPSILON = 0.0001;
const CALENDAR_SYNC_DEBUG_STORAGE_KEY = "revenue-assistant:debug:calendar-sync";
const CALENDAR_SYNC_DEBUG_LAST_STORAGE_KEY = `${CALENDAR_SYNC_DEBUG_STORAGE_KEY}:last`;
const CALENDAR_SYNC_DEBUG_SNAPSHOT_ATTRIBUTE = "data-ra-calendar-sync-debug-snapshot";
const REVENUE_ASSISTANT_MANAGED_SELECTOR = [
    `#${GROUP_ROOM_STYLE_ID}`,
    `[${GROUP_ROOM_BADGE_ATTRIBUTE}]`,
    `[${CALENDAR_LAST_CHANGE_ATTRIBUTE}]`,
    `[${CALENDAR_LAST_CHANGE_HOST_ATTRIBUTE}]`,
    `[${GROUP_ROOM_TOGGLE_ATTRIBUTE}]`,
    `[${GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE}]`,
    `[${RANK_RECOMMENDATION_LIST_ATTRIBUTE}]`,
    `[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`,
    `[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`,
    `[${SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE}]`,
    `[${SALES_SETTING_RANK_DETAIL_ATTRIBUTE}]`,
    `[${SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_ATTRIBUTE}]`,
    `[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`,
    `[${SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE}]`,
    `[${SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE}]`,
    `[${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}]`,
    `[${CALENDAR_SYNC_DEBUG_SNAPSHOT_ATTRIBUTE}]`
].join(", ");

type BookingCurveScopeCounts = BookingCurveApiScopeCounts;

type BookingCurvePoint = BookingCurveApiPoint;

type BookingCurveCountScope = "all" | "transient" | "group";

type BookingCurveResponse = BookingCurveApiResponse;

interface YadInfoResponse {
    yad_no?: string;
    name?: string;
}

interface RoomGroup {
    id: string;
    name: string;
    sequence: number;
}

type SalesSettingWarmCacheScope = "hotel" | "roomGroup";
type SalesSettingWarmCacheStatus = "idle" | "building" | "running" | "paused" | "cooldown" | "limitReached" | "error" | "complete";
type SalesSettingWarmCacheTaskKind = "currentRaw" | "referenceCurve" | "sameWeekdayRaw";
type SalesSettingWarmCacheProgressKind = "raw" | "reference" | "sameWeekday";

interface SalesSettingWarmCacheTask {
    kind: SalesSettingWarmCacheTaskKind;
    progressKind: SalesSettingWarmCacheProgressKind;
    targetStayDate: string;
    stayDate: string;
    scope: SalesSettingWarmCacheScope;
    roomGroupId?: string;
    roomGroupName?: string;
    segment?: CurveSegment;
    curveKind?: ReferenceCurveKind;
    retryCount?: number;
}

interface SalesSettingWarmCacheDateProgress {
    rawTotal: number;
    rawDone: number;
    referenceTotal: number;
    referenceDone: number;
    sameWeekdayTotal: number;
    sameWeekdayDone: number;
    errors: number;
}

interface SalesSettingWarmCacheState {
    runId: number;
    status: SalesSettingWarmCacheStatus;
    facilityId: string | null;
    asOfDate: string | null;
    priorityStayDate: string | null;
    queue: SalesSettingWarmCacheTask[];
    dateProgress: Record<string, SalesSettingWarmCacheDateProgress>;
    targetFromDate: string | null;
    targetToDate: string | null;
    total: number;
    processed: number;
    fetched: number;
    skipped: number;
    errors: number;
    consecutiveErrors: number;
    currentTask: SalesSettingWarmCacheTask | null;
    activeTasks: SalesSettingWarmCacheTask[];
    priorityMonth: string | null;
    startedAt: number | null;
    runElapsedMs: number;
    cooldownUntil: number | null;
    lastFetchedAt: string | null;
    pauseReason: string | null;
    rankRecommendationPriorityTotal: number;
    rankRecommendationPriorityProcessed: number;
    rankRecommendationPriorityFetched: number;
    rankRecommendationPrioritySkipped: number;
    rankRecommendationPriorityErrors: number;
}

type CompetitorPriceSnapshotStatus = "idle" | "saving" | "stored" | "skipped" | "error";
type PriceTrendStatus = "idle" | "loading" | "stored" | "skipped" | "error";
type PriceTrendBackgroundFixtureMode = "failure" | "skip";

interface CompetitorPriceSnapshotUiState {
    status: CompetitorPriceSnapshotStatus;
    facilityId: string | null;
    stayDate: string | null;
    source: "analyze-open" | "competitor-tab" | null;
    records: CompetitorPriceSnapshotRecord[];
    latestRecord: CompetitorPriceSnapshotRecord | null;
    previousRecord: CompetitorPriceSnapshotRecord | null;
    reason: string | null;
    errorMessage: string | null;
    updatedAt: string | null;
}

interface PriceTrendUiState {
    status: PriceTrendStatus;
    facilityId: string | null;
    stayDate: string | null;
    records: PriceTrendRecord[];
    reason: string | null;
    errorMessage: string | null;
    updatedAt: string | null;
}

type PriceTrendBackgroundStatus = "idle" | "running" | "complete" | "stopped";

interface PriceTrendBackgroundQueueState {
    status: PriceTrendBackgroundStatus;
    facilityId: string | null;
    stayDate: string | null;
    total: number;
    processed: number;
    stored: number;
    skipped: number;
    errors: number;
    consecutiveErrors: number;
    currentScope: PriceTrendRequestScope | null;
    pauseReason: string | null;
}

interface MonthlyCalendarCell {
    stayDate: string;
    anchorElement: HTMLAnchorElement;
    containerElement: HTMLElement;
    roomElement: HTMLElement;
    indicatorElement: HTMLElement | null;
}

type SalesSettingWarmCacheStoredMarkerState = "stored-current" | "stored-past";
type SalesSettingWarmCacheDateMarkerState = "partial" | "complete" | "error" | SalesSettingWarmCacheStoredMarkerState;
type RankRecommendationRawSourceStatus = "currentAsOf" | "pastAsOf" | "missing" | "loading" | "error";
type RankRecommendationCompetitorPreviewStatus = "idle" | "loading" | "stored" | "empty" | "error";
type RankRecommendationCompetitorRoomTypeMatchStatus = "confirmed" | "ambiguous" | "unknown";

interface RankRecommendationCompetitorRoomTypeMatch {
    status: RankRecommendationCompetitorRoomTypeMatchStatus;
    filter: string | null;
    labels: string[];
}

interface RankRecommendationCompetitorPreviewState {
    status: RankRecommendationCompetitorPreviewStatus;
    records: CompetitorPriceSnapshotRecord[];
    latestRecord: CompetitorPriceSnapshotRecord | null;
    previousRecord: CompetitorPriceSnapshotRecord | null;
    message: string;
    updatedAt: string | null;
}

interface SalesSettingCard {
    roomGroupName: string;
    cardElement: HTMLElement;
    headingElement: HTMLElement;
    latestReflectionElement: HTMLElement | null;
    roomCountSummaryElement: HTMLElement | null;
    detailWrapperElement: HTMLElement | null;
}

interface SalesSettingRoomCapacity {
    currentValue: number;
    maxValue: number;
}

interface SalesSettingComparisonMetrics {
    currentValue: number | null;
    previousDayValue: number | null;
    previousWeekValue: number | null;
    previousMonthValue: number | null;
}

interface SalesSettingComparisonDateKeys {
    current: string;
    previousDay: string;
    previousWeek: string;
    previousMonth: string;
}

interface SalesSettingBookingCurveMetrics {
    bookingCurveData: BookingCurveResponse | null;
    referenceCurveData: SalesSettingBookingCurveReferenceData | null;
    sameWeekdayCurveData: SalesSettingSameWeekdayCurveData[];
    allMetrics: SalesSettingComparisonMetrics;
    transientMetrics: SalesSettingComparisonMetrics;
    groupMetrics: SalesSettingComparisonMetrics;
    privateMetrics: SalesSettingComparisonMetrics;
}

interface SalesSettingPreparedCardMetric {
    card: SalesSettingCard;
    roomGroupName: string;
    rmRoomGroupId?: string;
    metrics: SalesSettingBookingCurveMetrics | null;
}

interface SalesSettingPreparedData {
    cards: SalesSettingCard[];
    totalCapacity: SalesSettingRoomCapacity | null;
    hotelMetrics: SalesSettingBookingCurveMetrics;
    cardMetrics: SalesSettingPreparedCardMetric[];
}

interface SalesSettingCurrentSettingRoomGroup {
    rm_room_group_id?: string;
    rm_room_group_name?: string;
    remaining_num_room?: number;
    max_num_room?: number;
    latest_current?: {
        price_rank_code?: string | null;
        price_rank_name?: string | null;
    } | null;
}

interface SalesSettingCurrentSettingByDate {
    stay_date?: string;
    rm_room_groups?: SalesSettingCurrentSettingRoomGroup[];
}

interface SalesSettingCurrentSettingsResponse {
    suggest_output_current_settings?: SalesSettingCurrentSettingByDate[];
}

interface LincolnSuggestStatus {
    date?: string;
    suggest_calc_datetime?: string | null;
    reflection_type?: string | null;
    reflector_name?: string | null;
    rm_room_group_id?: string;
    rm_room_group_name?: string;
    accepted_at?: string | null;
    completed_at?: string | null;
    before_price_rank_name?: string | null;
    after_price_rank_name?: string | null;
}

interface LincolnSuggestStatusResponse {
    suggest_statuses?: LincolnSuggestStatus[];
}

interface RankRecommendationRankSequencesResponse {
    rank_sequences?: RankRecommendationRankLadderEntry[];
}

interface SalesSettingRankSummary {
    roomGroupName: string;
    displayOrder: number;
    latestReflectionAt: string | null;
    latestReflectionDaysAgo: number | null;
    beforeRankName: string | null;
    afterRankName: string | null;
    roomDelta: number | null;
}

interface SalesSettingRankHistoryEvent {
    reflectedAt: string;
    reflectedDateKey: string;
    daysBeforeStay: number;
    beforeRankName: string | null;
    afterRankName: string | null;
    reflectorName: string | null;
    signature: string;
}

interface SyncContext {
    version: number;
    analysisDate: string | null;
    batchDateKey: string;
    facilityCacheKey: string;
}

interface SalesSettingBookingCurveSample {
    tick: SalesSettingBookingCurveTick;
    daysBeforeStay: number | null;
    value: number | null;
    occupancyRate: number | null;
    x: number;
    y: number | null;
}

interface SalesSettingBookingCurveTooltipReferenceValue {
    label: string;
    value: number | null;
    interpolated: boolean;
}

interface SalesSettingBookingCurveSeries {
    values: Array<number | null>;
    interpolated?: boolean[];
    signature: string;
}

type SalesSettingBookingCurveReferenceKind = "recent" | "seasonal";
type SalesSettingBookingCurveHelperKind = "sameWeekday";
type SalesSettingBookingCurveLineKind = "current" | SalesSettingBookingCurveReferenceKind | SalesSettingBookingCurveHelperKind;
type SalesSettingBookingCurvePanelVariant = "overall" | "individual" | "group";
type SalesSettingBookingCurveSecondarySegment = "individual" | "group";

interface SalesSettingSameWeekdayCurveData {
    offsetDays: number;
    stayDate: string;
    bookingCurveData: BookingCurveResponse;
}

interface SalesSettingBookingCurveHelperSeries {
    kind: SalesSettingBookingCurveHelperKind;
    label: string;
    offsetDays: number;
    series: SalesSettingBookingCurveSeries;
}

interface SalesSettingBookingCurveReferenceData {
    recentOverall: ReferenceCurveResult | null;
    seasonalOverall: ReferenceCurveResult | null;
    recentIndividual: ReferenceCurveResult | null;
    seasonalIndividual: ReferenceCurveResult | null;
    recentGroup: ReferenceCurveResult | null;
    seasonalGroup: ReferenceCurveResult | null;
}

interface SalesSettingBookingCurvePanelData {
    current: SalesSettingBookingCurveSeries;
    recent: SalesSettingBookingCurveSeries | null;
    seasonal: SalesSettingBookingCurveSeries | null;
    sameWeekday: SalesSettingBookingCurveHelperSeries[];
    signature: string;
}

interface SalesSettingBookingCurveDrawableSeries {
    kind: SalesSettingBookingCurveLineKind;
    label: string;
    series: SalesSettingBookingCurveSeries;
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string | null;
    opacity?: number;
}

interface SalesSettingBookingCurveRenderData {
    overall: SalesSettingBookingCurvePanelData;
    secondary: SalesSettingBookingCurvePanelData;
    secondarySegment: SalesSettingBookingCurveSecondarySegment;
    overallRankMarkers: SalesSettingBookingCurveMarker[];
    secondaryRankMarkers: SalesSettingBookingCurveMarker[];
    rankSignature: string;
}

interface SalesSettingBookingCurveMarker {
    reflectedAt: string;
    reflectedDateKey: string;
    daysBeforeStay: number;
    beforeRankName: string | null;
    afterRankName: string | null;
    reflectorName: string | null;
    value: number | null;
    signature: string;
}

interface CalendarSyncDebugCounters {
    requested: number;
    scheduled: number;
    executed: number;
    skippedCompleted: number;
    skippedQueued: number;
    queuedWhileRunning: number;
    forced: number;
}

interface CalendarSyncDebugSummaryEntry extends CalendarSyncDebugCounters {
    reason: string;
}

interface CalendarSyncDebugMutationSummary {
    callbackId: number;
    mutationCount: number;
    attributeNames: string[];
    targetSummaries: string[];
}

interface CalendarSyncDebugSnapshot {
    runId: number;
    href: string;
    capturedAt: string;
    summary: CalendarSyncDebugSummaryEntry[];
    mutationObserverSummaries: CalendarSyncDebugMutationSummary[];
}

interface CompetitorPriceSnapshotBackgroundTask {
    stayDate: string;
    priorityStayDate: string;
    batchDateKey: string;
    facilityCacheKey: string;
}

interface CompetitorPriceSnapshotBackgroundProgress {
    status: "idle" | "running" | "complete" | "stopped";
    total: number;
    processed: number;
    currentTask: CompetitorPriceSnapshotBackgroundTask | null;
    targetFromDate: string | null;
    targetToDate: string | null;
    pauseReason: string | null;
}

interface PendingCompetitorPriceTabSnapshotRequest {
    analysisDate: string;
    timeoutIds: number[];
}

interface PendingPriceTrendTabRequest {
    analysisDate: string;
    timeoutIds: number[];
}

interface PendingRankRecommendationFocus {
    stayDate: string;
    roomGroupId: string;
    roomGroupName: string;
    actionLabel: string | null;
    reasonText: string | null;
    cautionText: string | null;
    createdAt: string;
}

interface PendingRankRecommendationDecisionDraft {
    cacheKey: string;
    keyParts: {
        facilityId: string;
        stayDate: string;
        roomGroupId: string;
        action: RankRecommendationAction;
        reasonFingerprint: string;
    };
    roomGroupName: string;
    decisionType: RankRecommendationDecisionType;
    asOfDate: string;
    cooldownUntilAsOfDate: string | null;
    confidenceLevel: RankRecommendationDecisionConfidenceLevel;
}

interface PendingRankRecommendationDecision {
    draft: PendingRankRecommendationDecisionDraft;
    timeoutId: number;
    commitAt: number;
}

interface PendingRankRecommendationRankChangeDraft {
    cacheKey: string;
    proposal: RankRecommendationRankChangeProposal;
    createdAt: string;
}

interface PendingRankRecommendationRankChange {
    draft: PendingRankRecommendationRankChangeDraft;
    timeoutId: number;
    commitAt: number;
}

interface ActiveRankRecommendationRankChange {
    cacheKey: string;
    proposal: RankRecommendationRankChangeProposal;
    submittedAt: string | null;
    state: "submitting" | "confirming";
}

type RankRecommendationRankChangeResultStatus = "success" | "blocked" | "failed" | "confirming";
type RankRecommendationRankChangeFailureClass =
    | "current_rank_mismatch"
    | "rank_status_changed"
    | "proposal_disabled"
    | "http_401"
    | "http_403"
    | RankRecommendationWriteFailureType
    | "reflection_unconfirmed";

interface RankRecommendationRankChangeResult {
    status: RankRecommendationRankChangeResultStatus;
    message: string;
    failureClass: RankRecommendationRankChangeFailureClass | null;
    httpStatus: number | null;
    occurredAt: string;
}

interface RankRecommendationReadFailure {
    endpointLabel: string;
    failureClass: Extract<
        RankRecommendationRankChangeFailureClass,
        "http_401" | "http_403" | "http_error" | "network_error" | "unexpected_error"
    >;
    httpStatus: number | null;
}

type RankRecommendationReflectionConfirmationResult =
    | { confirmed: true }
    | { confirmed: false; failure: RankRecommendationReadFailure | null };

interface RankRecommendationWarmCachePriorityCandidate {
    stayDate: string;
    roomGroupId: string;
}

interface RankRecommendationLatestRankChange {
    reflectedAt: string;
    reflectedDateKey: string;
    daysAgo: number | null;
    beforeRankName: string | null;
    afterRankName: string | null;
    reflectorName: string | null;
    signature: string;
}

interface RankRecommendationDisplayInfo {
    latestRankChange: RankRecommendationLatestRankChange | null;
    visibilityDiagnostics: string[];
    rankGapContext: RankRecommendationRankGapContext | null;
    signature: string;
}

interface RankRecommendationLatestChangeHistoryItem {
    label: string;
    value: string;
}

interface RankRecommendationListViewModel {
    columns: string[];
    rows: RankRecommendationListViewRow[];
}

interface RankRecommendationListViewRow {
    candidate: RankRecommendationCandidate;
    displayInfo: RankRecommendationDisplayInfo | null;
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null;
    rankOptions: readonly { code: string; name: string }[];
    actionLabel: string;
    reasonText: string;
    cautionText: string;
    rankChangeProposal: RankRecommendationRankChangeProposal;
    pendingDecision: PendingRankRecommendationDecision | null;
    pendingRankChange: PendingRankRecommendationRankChange | null;
    rankChangeResult: RankRecommendationRankChangeResult | null;
    isCurvePreviewOpen: boolean;
    isRankChangePreviewOpen: boolean;
    isRankChangeBlockedByScope: boolean;
}

interface RankRecommendationRankGapEntry {
    roomGroupId: string;
    roomGroupName: string;
    currentRankName: string | null;
    occupancyCapacity: SalesSettingRoomCapacity | null;
    rankOrderIndex: number | null;
    relativeStep: number | null;
    isTarget: boolean;
    diagnostics: string[];
}

interface RankRecommendationRankGapContext {
    entries: RankRecommendationRankGapEntry[];
    rankOrderSource: RankRecommendationRankOrderResolution["source"];
    targetRankOrderIndex: number | null;
    signature: string;
}

interface RankRecommendationCurvePreviewInfo {
    curveData: SalesSettingBookingCurveRenderData | null;
    maxValue: number | null;
    currentOverallRoomCount: number | null;
    currentSecondaryRoomCount: number | null;
    rawSourceStatus: RankRecommendationRawSourceStatus;
    segmentVariants: Partial<Record<SalesSettingBookingCurveSecondarySegment, RankRecommendationCurvePreviewSegmentVariant>>;
    diagnostics: string[];
    signature: string;
}

interface RankRecommendationCurvePreviewSegmentVariant {
    curveData: SalesSettingBookingCurveRenderData;
    maxValue: number;
    currentSecondaryRoomCount: number | null;
    signature: string;
}

interface RankRecommendationRankOrderOverrideRecord {
    facilityCacheKey: string;
    rankCodesHighToLow: string[];
    rankNamesHighToLow: string[];
    savedAt: string;
}

type RankRecommendationOwnPricePositionEvidence = {
    signal: RankRecommendationOwnPricePositionSignal | null;
    comparableGuestCount: number;
    source: RankRecommendationOwnPricePositionSource | null;
    scope: RankRecommendationOwnPricePositionScope | null;
    diagnostics: string[];
};

const groupRoomCache = new Map<string, Promise<number | null>>();
const bookingCurveCache = new Map<string, Promise<BookingCurveResponse>>();
const rankRecommendationCurrentSettingsCache = new Map<string, Promise<RankRecommendationCurrentSettingsResponse>>();
const rankRecommendationRankLadderCache = new Map<string, Promise<RankRecommendationRankLadderEntry[]>>();
const lincolnSuggestStatusCache = new Map<string, Promise<LincolnSuggestStatus[]>>();
const lincolnSuggestStatusRangeCache = new Map<string, Promise<LincolnSuggestStatus[]>>();
const bookingCurveRequestScheduler = createIntervalRequestScheduler({
    concurrency: SALES_SETTING_WARM_CACHE_WORKER_COUNT,
    intervalMs: BOOKING_CURVE_REQUEST_INTERVAL_MS
});
const interactionSyncTimeoutIds: number[] = [];
const salesSettingPrefetchKeys = new Set<string>();
const competitorPriceSnapshotAttemptKeys = new Set<string>();
const competitorPriceSnapshotPriorityAttemptKeys = new Set<string>();
const competitorPriceSnapshotBackgroundTaskKeys = new Set<string>();
const competitorPriceSnapshotBackgroundQueue: CompetitorPriceSnapshotBackgroundTask[] = [];
const salesSettingBookingCurveOpenState = new Map<string, boolean>();
const salesSettingBookingCurveReferenceVisibilityState = new Map<SalesSettingBookingCurveReferenceKind, boolean>();
const rankRecommendationCurvePreviewOpenState = new Map<string, boolean>();
const rankRecommendationCompetitorPreviewOpenState = new Map<string, boolean>();
const rankRecommendationCompetitorPreviewStateByKey = new Map<string, RankRecommendationCompetitorPreviewState>();
const rankRecommendationCompetitorPreviewRequestByKey = new Map<string, Promise<RankRecommendationCompetitorPreviewState>>();
const rankRecommendationRankChangePreviewOpenState = new Map<string, boolean>();
const pendingRankRecommendationDecisionByKey = new Map<string, PendingRankRecommendationDecision>();
const pendingRankRecommendationRankChangeByKey = new Map<string, PendingRankRecommendationRankChange>();
const activeRankRecommendationRankChangeByScopeKey = new Map<string, ActiveRankRecommendationRankChange>();
const rankRecommendationRankChangeResultByKey = new Map<string, RankRecommendationRankChangeResult>();
let salesSettingBookingCurveSameWeekdayVisible = false;
let salesSettingBookingCurveSecondarySegment: SalesSettingBookingCurveSecondarySegment = "individual";
let latestSalesSettingPreparedSnapshot: {
    analysisDate: string;
    batchDateKey: string;
    preparedData: SalesSettingPreparedData;
} | null = null;
let latestSalesSettingRankStatusesSnapshot: {
    analysisDate: string;
    statuses: LincolnSuggestStatus[];
} | null = null;
const latestRankRecommendationCurvePreviewSnapshotByKey = new Map<string, {
    candidate: RankRecommendationCandidate;
    curvePreviewInfo: RankRecommendationCurvePreviewInfo;
}>();
const latestRankRecommendationCandidateByCompetitorPreviewKey = new Map<string, RankRecommendationCandidate>();
const salesSettingCurrentSettingsPromiseCache = new Map<string, Promise<SalesSettingCurrentSettingsResponse>>();
let roomGroupListPromise: Promise<RoomGroup[]> | null = null;
let salesSettingWarmCacheTimeoutId: number | null = null;
let rankRecommendationWarmCacheSyncTimeoutId: number | null = null;
let salesSettingWarmCacheRunSeq = 0;
let competitorPriceSnapshotBackgroundTimeoutId: number | null = null;
let competitorPriceSnapshotBackgroundRunning = false;
let competitorPriceSnapshotBackgroundProgress: CompetitorPriceSnapshotBackgroundProgress = createInitialCompetitorPriceSnapshotBackgroundProgress();
let priceTrendBackgroundQueueTimeoutId: number | null = null;
let priceTrendBackgroundQueueRunning = false;
let priceTrendBackgroundQueue: PriceTrendRequestScope[] = [];
let priceTrendBackgroundQueueState: PriceTrendBackgroundQueueState = createInitialPriceTrendBackgroundQueueState();
let priceTrendRequestContext: PriceTrendRequestContext | null = null;
let pendingCompetitorPriceTabSnapshotRequest: PendingCompetitorPriceTabSnapshotRequest | null = null;
let pendingPriceTrendTabRequest: PendingPriceTrendTabRequest | null = null;
let salesSettingWarmCacheState: SalesSettingWarmCacheState = createInitialSalesSettingWarmCacheState();
let rankRecommendationWarmCachePriorityCandidates: RankRecommendationWarmCachePriorityCandidate[] = [];
let rankRecommendationDisplayLimit = RANK_RECOMMENDATION_INITIAL_DISPLAY_LIMIT;
let rankRecommendationViewMode: RankRecommendationViewMode = "all";
let rankRecommendationTargetMonth: string | null = null;
let salesSettingWarmCacheStoredCalendarMarkerSignature = "";
let salesSettingWarmCacheStoredCalendarMarkerRequestSeq = 0;
let salesSettingWarmCacheStoredCalendarMarkerStates = new Map<string, SalesSettingWarmCacheStoredMarkerState>();
let competitorPriceSnapshotUiState: CompetitorPriceSnapshotUiState = createInitialCompetitorPriceSnapshotUiState();
let priceTrendUiState: PriceTrendUiState = createInitialPriceTrendUiState();
let competitorPriceRoomTypeFilter: string | null = null;
let competitorPriceMealTypeFilter: string | null = null;
let priceTrendRoomTypeFilter: string | null = null;
let priceTrendMealTypeFilter: string | null = null;
let activeHref = "";
let activeAnalyzeDate: string | null = null;
let activeBatchDateKey: string | null = null;
let activeFacilityCacheKey: string | null = null;
let calendarObserver: MutationObserver | null = null;
let mutationObserverSyncQueued = false;
let calendarSyncQueued = false;
let calendarSyncRunning = false;
let queuedCalendarSyncSignature = "";
let completedCalendarSyncSignature = "";
let queuedCalendarSyncForce = false;
let pendingCalendarSyncSignature = "";
let pendingCalendarSyncForce = false;
let pendingCalendarScrollRestore: { x: number; y: number } | null = null;
const calendarSyncDebugCounters = new Map<string, CalendarSyncDebugCounters>();
let calendarSyncDebugDirty = false;
let calendarSyncDebugRunId = 0;
let calendarSyncDebugMutationCallbackId = 0;
const calendarSyncDebugMutationSummaries: CalendarSyncDebugMutationSummary[] = [];
let syncVersion = 0;
let consistencyCheckTimeoutId: number | null = null;
let consistencyCheckLastTriggeredAt = 0;
let consistencyCheckRunVersion = 0;
let salesSettingSupplementCleanupTimeoutId: number | null = null;
const salesSettingSupplementRetryTimeoutIds: number[] = [];
let legacyGroupRoomStorageCleanupAttempted = false;
let resolvedFacilityCacheKey: string | null = null;
let resolvedFacilityLabel: string | null = null;
let facilityCacheKeyPromise: Promise<string> | null = null;
let activeMonthlyProgressYearMonth: string | null = null;
let activeMonthlyProgressBatchDateKey: string | null = null;

function boot(): void {
    console.info(`[${SCRIPT_NAME}] initialized`, {
        href: window.location.href,
        dev: __DEV__,
        calendarSyncDebug: isCalendarSyncDebugEnabled()
    });

    installNavigationHooks();
    installInteractionHooks();
    installLifecycleConsistencyHooks();
    syncPage();
}

function installLifecycleConsistencyHooks(): void {
    window.addEventListener("pageshow", () => {
        scheduleConsistencyCheck("pageshow");
        scheduleSalesSettingWarmCacheDrain(0);
        resumePriceTrendBackgroundQueueAfterVisibility();
    });

    window.addEventListener("focus", () => {
        scheduleConsistencyCheck("focus");
        scheduleSalesSettingWarmCacheDrain(0);
        resumePriceTrendBackgroundQueueAfterVisibility();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            scheduleConsistencyCheck("visibility");
            scheduleSalesSettingWarmCacheDrain(0);
            resumePriceTrendBackgroundQueueAfterVisibility();
        } else {
            if (shouldPauseSalesSettingWarmCacheForHiddenTab()) {
                pauseSalesSettingWarmCache("タブ非表示");
            }
            stopPriceTrendBackgroundQueue("タブ非表示");
        }
    });
}

function installNavigationHooks(): void {
    const { pushState, replaceState } = window.history;

    window.history.pushState = function pushStatePatched(...args) {
        pushState.apply(window.history, args);
        queueMicrotask(syncPage);
    };

    window.history.replaceState = function replaceStatePatched(...args) {
        replaceState.apply(window.history, args);
        queueMicrotask(syncPage);
    };

    window.addEventListener("popstate", () => {
        queueMicrotask(syncPage);
    });
}

function installInteractionHooks(): void {
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof Element) {
            if (isCompetitorPriceTabTrigger(target)) {
                scheduleActiveCompetitorPriceSnapshotFromTab();
            }
            if (isPriceTrendTabTrigger(target)) {
                scheduleActivePriceTrendFromTab();
            }

            const rankRecommendationAnalyzeLink = target.closest<HTMLElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="analyze"]`
            );
            if (rankRecommendationAnalyzeLink !== null) {
                persistPendingRankRecommendationFocusFromElement(rankRecommendationAnalyzeLink);
                return;
            }

            const rankRecommendationCurvePreviewButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="curve-preview-toggle"]`
            );
            if (rankRecommendationCurvePreviewButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                toggleRankRecommendationCurvePreviewFromElement(rankRecommendationCurvePreviewButton);
                return;
            }

            const rankRecommendationCompetitorPreviewButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="competitor-preview-toggle"]`
            );
            if (rankRecommendationCompetitorPreviewButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                toggleRankRecommendationCompetitorPreviewFromElement(rankRecommendationCompetitorPreviewButton);
                return;
            }

            const rankRecommendationCompetitorPreviewRetryButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="competitor-preview-retry"]`
            );
            if (rankRecommendationCompetitorPreviewRetryButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                requestRankRecommendationCompetitorPreviewFromElement(rankRecommendationCompetitorPreviewRetryButton);
                return;
            }

            const rankRecommendationRankChangeToggleButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-change-preview-toggle"]`
            );
            if (rankRecommendationRankChangeToggleButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                toggleRankRecommendationRankChangePreviewFromElement(rankRecommendationRankChangeToggleButton);
                return;
            }

            const rankRecommendationRankChangeCancelButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-change-cancel"]`
            );
            if (rankRecommendationRankChangeCancelButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                cancelPendingRankRecommendationRankChangeFromElement(rankRecommendationRankChangeCancelButton);
                return;
            }

            const rankRecommendationRankChangeSubmitButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-change-submit"]`
            );
            if (rankRecommendationRankChangeSubmitButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                schedulePendingRankRecommendationRankChangeFromElement(rankRecommendationRankChangeSubmitButton);
                return;
            }

            const rankRecommendationDecisionCancelButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="decision-cancel"]`
            );
            if (rankRecommendationDecisionCancelButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                cancelPendingRankRecommendationDecisionFromElement(rankRecommendationDecisionCancelButton);
                return;
            }

            const rankRecommendationDecisionButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="snooze"],`
                + `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="dismiss"]`
            );
            if (rankRecommendationDecisionButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                schedulePendingRankRecommendationDecisionFromElement(rankRecommendationDecisionButton);
                return;
            }

            const rankRecommendationOrderButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-order-save"],`
                + `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-order-reverse"],`
                + `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-order-reset"]`
            );
            if (rankRecommendationOrderButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                void persistRankRecommendationRankOrderFromElement(rankRecommendationOrderButton);
                return;
            }

            const rankRecommendationViewModeButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="view-mode"]`
            );
            if (rankRecommendationViewModeButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                setRankRecommendationViewModeFromElement(rankRecommendationViewModeButton);
                return;
            }

            const rankRecommendationDisplayLimitButton = target.closest<HTMLButtonElement>(
                `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="display-more"],`
                + `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="display-reset"]`
            );
            if (rankRecommendationDisplayLimitButton !== null) {
                event.preventDefault();
                event.stopPropagation();
                const action = rankRecommendationDisplayLimitButton.getAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE);
                if (action === "display-more") {
                    increaseRankRecommendationDisplayLimit();
                } else if (action === "display-reset") {
                    resetRankRecommendationDisplayLimit();
                }
                return;
            }

            const referenceToggleButton = target.closest<HTMLButtonElement>(`[${SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_ATTRIBUTE}]`);
            if (referenceToggleButton !== null) {
                event.preventDefault();
                event.stopPropagation();

                const referenceKind = parseSalesSettingBookingCurveReferenceKind(
                    referenceToggleButton.getAttribute(SALES_SETTING_BOOKING_CURVE_REFERENCE_KIND_ATTRIBUTE)
                );
                if (referenceKind !== null) {
                    setSalesSettingBookingCurveReferenceVisible(referenceKind, !isSalesSettingBookingCurveReferenceVisible(referenceKind));
                    requestCalendarScrollRestore();
                    queueCalendarSync({ force: true, reason: "booking-curve-reference-toggle" });
                }
                return;
            }

            const helperToggleButton = target.closest<HTMLButtonElement>(`[${SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_ATTRIBUTE}]`);
            if (helperToggleButton !== null) {
                event.preventDefault();
                event.stopPropagation();

                const helperKind = helperToggleButton.getAttribute(SALES_SETTING_BOOKING_CURVE_HELPER_KIND_ATTRIBUTE);
                if (helperKind === "sameWeekday") {
                    setSalesSettingBookingCurveSameWeekdayVisible(!isSalesSettingBookingCurveSameWeekdayVisible());
                    requestCalendarScrollRestore();
                    queueCalendarSync({ force: true, reason: "booking-curve-helper-toggle" });
                }
                return;
            }

            const segmentToggleButton = target.closest<HTMLButtonElement>(`[${SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_ATTRIBUTE}]`);
            if (segmentToggleButton !== null) {
                event.preventDefault();
                event.stopPropagation();

                const segment = parseSalesSettingBookingCurveSecondarySegment(
                    segmentToggleButton.getAttribute(SALES_SETTING_BOOKING_CURVE_SEGMENT_ATTRIBUTE)
                );
                if (segment !== null && segment !== getSalesSettingBookingCurveSecondarySegment()) {
                    setSalesSettingBookingCurveSecondarySegment(segment);
                    rerenderSalesSettingBookingCurveSurfacesFromLatestSnapshot();
                    rerenderRankRecommendationCurvePreviewSurfacesFromLatestSnapshot();
                    requestCalendarScrollRestore();
                    queueCalendarSync({ force: true, reason: "booking-curve-segment-toggle" });
                }
                return;
            }

            const bookingCurveToggleButton = target.closest<HTMLButtonElement>(`[${SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE}]`);
            if (bookingCurveToggleButton !== null) {
                event.preventDefault();
                event.stopPropagation();

                const toggleKey = bookingCurveToggleButton.getAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_KEY_ATTRIBUTE);
                if (toggleKey !== null && toggleKey.length > 0) {
                    const nextOpen = bookingCurveToggleButton.getAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_ACTIVE_ATTRIBUTE) !== "true";
                    setSalesSettingBookingCurveOpen(toggleKey, nextOpen);
                    queueCalendarSync({ reason: "booking-curve-toggle" });
                }
                return;
            }

            const toggleButton = target.closest<HTMLButtonElement>(`[${GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE}]`);
            if (toggleButton !== null) {
                event.preventDefault();
                event.stopPropagation();

                const nextVisible = !isGroupRoomCalendarVisible();
                setGroupRoomCalendarVisible(nextVisible);
                updateGroupRoomToggleButton(toggleButton, nextVisible);

                if (!nextVisible) {
                    cleanupMonthlyCalendarGroupRooms();
                    clearInteractionSyncTimeouts();
                    calendarSyncQueued = false;
                    return;
                }

                queueCalendarSync({ reason: "group-room-toggle" });
                return;
            }
        }

        if (
            activeAnalyzeDate === null
            && document.querySelector(`[data-testid^="${CALENDAR_DATE_TEST_ID_PREFIX}"]`) === null
        ) {
            return;
        }

        scheduleCompetitorPriceOverviewPlacementRepair();
        scheduleInteractionSync();
    });

    document.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const targetMonthSelect = target.closest<HTMLSelectElement>(`select[${RANK_RECOMMENDATION_TARGET_MONTH_ATTRIBUTE}]`);
        if (targetMonthSelect === null) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        setRankRecommendationTargetMonthFromElement(targetMonthSelect);
    });

    document.addEventListener("keydown", (event) => {
        if (handleRankRecommendationPreviewKeydown(event)) {
            event.preventDefault();
            event.stopPropagation();
        }
    });
}

function scheduleInteractionSync(): void {
    queueCalendarSync({ reason: "interaction:immediate" });

    clearInteractionSyncTimeouts();

    for (const delay of [120, 300, 700, 1500, 3000]) {
        const timeoutId = window.setTimeout(() => {
            removeInteractionSyncTimeout(timeoutId);

            if (shouldSkipTrailingInteractionSyncs()) {
                clearInteractionSyncTimeouts();
                return;
            }

            queueCalendarSync({ reason: `interaction:${delay}` });
        }, delay);
        interactionSyncTimeoutIds.push(timeoutId);
    }
}

function removeInteractionSyncTimeout(timeoutId: number): void {
    const index = interactionSyncTimeoutIds.indexOf(timeoutId);
    if (index >= 0) {
        interactionSyncTimeoutIds.splice(index, 1);
    }
}

function shouldSkipTrailingInteractionSyncs(): boolean {
    return !calendarSyncRunning
        && !calendarSyncQueued
        && completedCalendarSyncSignature !== ""
        && getCalendarSyncSignature() === completedCalendarSyncSignature;
}

function clearInteractionSyncTimeouts(): void {
    while (interactionSyncTimeoutIds.length > 0) {
        const timeoutId = interactionSyncTimeoutIds.pop();
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
        }
    }
}

function isCompetitorPriceTabTrigger(target: Element): boolean {
    const tabElement = target.closest<HTMLElement>("button, a, [role='tab'], [data-testid]");
    const testId = tabElement?.getAttribute("data-testid") ?? "";
    const text = tabElement?.textContent?.replace(/\s+/g, "") ?? "";
    return testId === "tab-competitorPrice"
        || text.includes("競合価格");
}

function isPriceTrendTabTrigger(target: Element): boolean {
    const tabElement = target.closest<HTMLElement>("button, a, [role='tab'], [data-testid]");
    const testId = tabElement?.getAttribute("data-testid") ?? "";
    const text = tabElement?.textContent?.replace(/\s+/g, "") ?? "";
    return testId === "tab-priceTrends"
        || text.includes("価格推移");
}

function scheduleActiveCompetitorPriceSnapshotFromTab(): void {
    const analysisDate = getAnalyzeDate(window.location.pathname) ?? activeAnalyzeDate;
    if (analysisDate === null) {
        return;
    }

    requestCompetitorPriceSnapshotFromTabWhenContextReady(analysisDate);
    queueCalendarSync({ reason: "competitor-price-tab" });
}

function scheduleActivePriceTrendFromTab(): void {
    const analysisDate = getAnalyzeDate(window.location.pathname) ?? activeAnalyzeDate;
    if (analysisDate === null) {
        return;
    }

    requestPriceTrendFromTabWhenContextReady(analysisDate);
    queueCalendarSync({ reason: "price-trends-tab" });
}

function clearPendingCompetitorPriceTabSnapshotRequest(): void {
    const request = pendingCompetitorPriceTabSnapshotRequest;
    if (request === null) {
        return;
    }

    for (const timeoutId of request.timeoutIds) {
        window.clearTimeout(timeoutId);
    }
    pendingCompetitorPriceTabSnapshotRequest = null;
}

function clearPendingPriceTrendTabRequest(): void {
    const request = pendingPriceTrendTabRequest;
    if (request === null) {
        return;
    }

    for (const timeoutId of request.timeoutIds) {
        window.clearTimeout(timeoutId);
    }
    pendingPriceTrendTabRequest = null;
}

function requestCompetitorPriceSnapshotFromTabWhenContextReady(analysisDate: string): void {
    clearPendingCompetitorPriceTabSnapshotRequest();
    const request: PendingCompetitorPriceTabSnapshotRequest = {
        analysisDate,
        timeoutIds: []
    };
    pendingCompetitorPriceTabSnapshotRequest = request;

    trySchedulePendingCompetitorPriceTabSnapshotRequest();
    if (pendingCompetitorPriceTabSnapshotRequest !== request) {
        return;
    }

    for (const delay of [120, 300, 700, 1500, 3000]) {
        const timeoutId = window.setTimeout(() => {
            trySchedulePendingCompetitorPriceTabSnapshotRequest();
        }, delay);
        request.timeoutIds.push(timeoutId);
    }
}

function requestPriceTrendFromTabWhenContextReady(analysisDate: string): void {
    clearPendingPriceTrendTabRequest();
    const request: PendingPriceTrendTabRequest = {
        analysisDate,
        timeoutIds: []
    };
    pendingPriceTrendTabRequest = request;

    trySchedulePendingPriceTrendTabRequest();
    if (pendingPriceTrendTabRequest !== request) {
        return;
    }

    for (const delay of [120, 300, 700, 1500, 3000]) {
        const timeoutId = window.setTimeout(() => {
            trySchedulePendingPriceTrendTabRequest();
        }, delay);
        request.timeoutIds.push(timeoutId);
    }
}

function ensureCompetitorPriceSnapshotUiContext(facilityCacheKey: string, analysisDate: string): void {
    if (
        competitorPriceSnapshotUiState.facilityId === facilityCacheKey
        && competitorPriceSnapshotUiState.stayDate === analysisDate
    ) {
        return;
    }

    competitorPriceSnapshotUiState = {
        ...createInitialCompetitorPriceSnapshotUiState(),
        facilityId: facilityCacheKey,
        stayDate: analysisDate,
        source: "competitor-tab",
        updatedAt: new Date().toISOString()
    };
}

function ensurePriceTrendUiContext(facilityCacheKey: string, analysisDate: string): void {
    if (
        priceTrendUiState.facilityId === facilityCacheKey
        && priceTrendUiState.stayDate === analysisDate
    ) {
        return;
    }

    priceTrendUiState = {
        ...createInitialPriceTrendUiState(),
        facilityId: facilityCacheKey,
        stayDate: analysisDate,
        updatedAt: new Date().toISOString()
    };
}

function trySchedulePendingCompetitorPriceTabSnapshotRequest(): boolean {
    const request = pendingCompetitorPriceTabSnapshotRequest;
    if (request === null) {
        return false;
    }

    const batchDateKey = activeBatchDateKey;
    const facilityCacheKey = activeFacilityCacheKey;
    if (
        activeAnalyzeDate !== request.analysisDate
        || batchDateKey === null
        || facilityCacheKey === null
    ) {
        return false;
    }

    ensureCompetitorPriceSnapshotUiContext(facilityCacheKey, request.analysisDate);
    scheduleCompetitorPriceSnapshot(request.analysisDate, batchDateKey, facilityCacheKey, "competitor-tab");
    scheduleCompetitorPriceOverviewRenderRetries(facilityCacheKey, request.analysisDate);
    clearPendingCompetitorPriceTabSnapshotRequest();
    return true;
}

function trySchedulePendingPriceTrendTabRequest(): boolean {
    const request = pendingPriceTrendTabRequest;
    if (request === null) {
        return false;
    }

    const facilityCacheKey = activeFacilityCacheKey;
    if (
        activeAnalyzeDate !== request.analysisDate
        || facilityCacheKey === null
    ) {
        return false;
    }

    ensurePriceTrendUiContext(facilityCacheKey, request.analysisDate);
    void runPriceTrendFetch(request.analysisDate, facilityCacheKey);
    schedulePriceTrendOverviewRenderRetries(facilityCacheKey, request.analysisDate);
    clearPendingPriceTrendTabRequest();
    return true;
}

function persistPendingRankRecommendationFocusFromElement(element: HTMLElement): void {
    const stayDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE);
    const roomGroupId = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE);
    const roomGroupName = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE);
    const actionLabel = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_LABEL_ATTRIBUTE);
    const reasonText = element.getAttribute(RANK_RECOMMENDATION_BUTTON_REASON_TEXT_ATTRIBUTE);
    const cautionText = element.getAttribute(RANK_RECOMMENDATION_BUTTON_CAUTION_TEXT_ATTRIBUTE);
    if (stayDate === null || roomGroupId === null || roomGroupName === null) {
        return;
    }

    const focus: PendingRankRecommendationFocus = {
        stayDate,
        roomGroupId,
        roomGroupName,
        actionLabel,
        reasonText,
        cautionText,
        createdAt: new Date().toISOString()
    };
    try {
        window.sessionStorage.setItem(RANK_RECOMMENDATION_PENDING_FOCUS_STORAGE_KEY, JSON.stringify(focus));
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to persist rank recommendation focus`, {
            stayDate,
            roomGroupId,
            error
        });
    }
}

function schedulePendingRankRecommendationDecisionFromElement(element: HTMLElement): void {
    const draft = buildPendingRankRecommendationDecisionDraftFromElement(element);
    if (draft === null) {
        return;
    }

    const current = pendingRankRecommendationDecisionByKey.get(draft.cacheKey);
    if (current !== undefined) {
        window.clearTimeout(current.timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
        void commitPendingRankRecommendationDecision(draft.cacheKey);
    }, RANK_RECOMMENDATION_DECISION_UNDO_DELAY_MS);

    pendingRankRecommendationDecisionByKey.set(draft.cacheKey, {
        draft,
        timeoutId,
        commitAt: Date.now() + RANK_RECOMMENDATION_DECISION_UNDO_DELAY_MS
    });

    renderPendingRankRecommendationDecisionInline(
        element,
        pendingRankRecommendationDecisionByKey.get(draft.cacheKey) ?? null
    );
    queueCalendarSync({ force: true, reason: `rank-recommendation-pending-${draft.decisionType}` });
}

function cancelPendingRankRecommendationDecisionFromElement(element: HTMLElement): void {
    const cacheKey = element.getAttribute(RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE);
    if (cacheKey === null) {
        return;
    }

    const current = pendingRankRecommendationDecisionByKey.get(cacheKey);
    if (current === undefined) {
        return;
    }

    window.clearTimeout(current.timeoutId);
    pendingRankRecommendationDecisionByKey.delete(cacheKey);
    removePendingRankRecommendationDecisionInline(cacheKey);
    queueCalendarSync({ force: true, reason: `rank-recommendation-pending-cancel-${current.draft.decisionType}` });
}

function clearPendingRankRecommendationDecisions(): void {
    for (const pending of pendingRankRecommendationDecisionByKey.values()) {
        window.clearTimeout(pending.timeoutId);
    }
    pendingRankRecommendationDecisionByKey.clear();
    document.querySelectorAll<HTMLElement>(`[${RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE}]`).forEach((element) => {
        element.remove();
    });
}

async function commitPendingRankRecommendationDecision(cacheKey: string): Promise<void> {
    const pending = pendingRankRecommendationDecisionByKey.get(cacheKey);
    if (pending === undefined) {
        return;
    }

    pendingRankRecommendationDecisionByKey.delete(cacheKey);
    removePendingRankRecommendationDecisionInline(cacheKey);
    const record = buildRankRecommendationDecisionRecord({
        keyParts: pending.draft.keyParts,
        roomGroupName: pending.draft.roomGroupName,
        decisionType: pending.draft.decisionType,
        asOfDate: pending.draft.asOfDate,
        cooldownUntilAsOfDate: pending.draft.cooldownUntilAsOfDate,
        confidenceLevel: pending.draft.confidenceLevel
    });

    await writeRankRecommendationDecisionRecord(record).catch((error: unknown) => {
        console.warn(`[${SCRIPT_NAME}] failed to write rank recommendation decision`, {
            decisionType: pending.draft.decisionType,
            stayDate: pending.draft.keyParts.stayDate,
            roomGroupId: pending.draft.keyParts.roomGroupId,
            action: pending.draft.keyParts.action,
            error
        });
    });

    queueCalendarSync({ force: true, reason: `rank-recommendation-${pending.draft.decisionType}` });
}

function renderPendingRankRecommendationDecisionInline(
    sourceElement: HTMLElement,
    pending: PendingRankRecommendationDecision | null
): void {
    if (pending === null) {
        return;
    }

    const rowElement = findRankRecommendationCandidateRowFromElement(sourceElement);
    const actionCellElement = rowElement?.lastElementChild;
    if (!(actionCellElement instanceof HTMLTableCellElement)) {
        return;
    }

    removePendingRankRecommendationDecisionInline(pending.draft.cacheKey);
    actionCellElement.append(createRankRecommendationPendingDecisionElement(pending));
}

function removePendingRankRecommendationDecisionInline(cacheKey: string): void {
    document
        .querySelectorAll<HTMLElement>(
            `[${RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE}][${RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(cacheKey)}"]`
        )
        .forEach((element) => {
            element.remove();
        });
}

function buildPendingRankRecommendationDecisionDraftFromElement(
    element: HTMLElement
): PendingRankRecommendationDecisionDraft | null {
    const decisionType = parseRankRecommendationDecisionType(element.getAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE));
    const stayDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE);
    const asOfDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_AS_OF_DATE_ATTRIBUTE);
    const roomGroupId = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE);
    const roomGroupName = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE);
    const action = parseRankRecommendationAction(element.getAttribute(RANK_RECOMMENDATION_ACTION_ATTRIBUTE));
    const reasonFingerprint = element.getAttribute(RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE);
    const confidenceLevel = parseRankRecommendationDecisionConfidenceLevel(
        element.getAttribute(RANK_RECOMMENDATION_BUTTON_CONFIDENCE_LEVEL_ATTRIBUTE)
    );
    const facilityId = activeFacilityCacheKey;

    if (
        decisionType === null
        || stayDate === null
        || asOfDate === null
        || roomGroupId === null
        || roomGroupName === null
        || action === null
        || reasonFingerprint === null
        || confidenceLevel === null
        || facilityId === null
    ) {
        return null;
    }

    const cooldownUntilAsOfDate = decisionType === "snooze"
        ? getRankRecommendationSnoozeCooldownUntilAsOfDate(stayDate, asOfDate)
        : null;

    const keyParts = {
        facilityId,
        stayDate,
        roomGroupId,
        action,
        reasonFingerprint
    };

    return {
        cacheKey: buildRankRecommendationDecisionCacheKey(keyParts),
        keyParts,
        roomGroupName,
        decisionType,
        asOfDate,
        cooldownUntilAsOfDate,
        confidenceLevel
    };
}

async function persistRankRecommendationRankOrderFromElement(element: HTMLElement): Promise<void> {
    const action = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE);
    const controlElement = element.closest<HTMLElement>(`[${RANK_RECOMMENDATION_ORDER_CONTROL_ATTRIBUTE}]`);
    const facilityCacheKey = activeFacilityCacheKey;
    if (controlElement === null || facilityCacheKey === null) {
        return;
    }

    const statusElement = controlElement.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_ORDER_STATUS_ATTRIBUTE}]`);
    if (action === "rank-order-reset") {
        window.localStorage.removeItem(getRankRecommendationRankOrderOverrideStorageKey(facilityCacheKey));
        rankRecommendationRankLadderCache.delete("default");
        setRankRecommendationOrderControlStatus(statusElement, "推定順序へ戻しました");
        queueCalendarSync({ force: true, reason: "rank-recommendation-rank-order-reset" });
        return;
    }

    if (action !== "rank-order-save" && action !== "rank-order-reverse") {
        return;
    }

    const inputElement = controlElement.querySelector<HTMLTextAreaElement>(`[${RANK_RECOMMENDATION_ORDER_INPUT_ATTRIBUTE}]`);
    const rankLadder = parseRankRecommendationRankLadderFromElement(controlElement);
    if (inputElement === null || rankLadder.length === 0) {
        setRankRecommendationOrderControlStatus(statusElement, "rank ladder を取得できませんでした");
        return;
    }

    const parsedOrderResult = parseRankRecommendationRankOrderInput(inputElement.value, rankLadder);
    if (!parsedOrderResult.ok) {
        setRankRecommendationOrderControlStatus(statusElement, parsedOrderResult.message);
        return;
    }

    const parsedOrder = parsedOrderResult.ranks;
    const orderedRanks = action === "rank-order-reverse" ? parsedOrder.slice().reverse() : parsedOrder;
    inputElement.value = orderedRanks.map((entry) => entry.name).join(", ");
    const record: RankRecommendationRankOrderOverrideRecord = {
        facilityCacheKey,
        rankCodesHighToLow: orderedRanks.map((entry) => entry.code),
        rankNamesHighToLow: orderedRanks.map((entry) => entry.name),
        savedAt: new Date().toISOString()
    };
    window.localStorage.setItem(getRankRecommendationRankOrderOverrideStorageKey(facilityCacheKey), JSON.stringify(record));
    setRankRecommendationOrderControlStatus(statusElement, action === "rank-order-reverse"
        ? "反転した手動順序を保存しました"
        : "手動順序を保存しました");
    queueCalendarSync({ force: true, reason: action === "rank-order-reverse"
        ? "rank-recommendation-rank-order-reverse"
        : "rank-recommendation-rank-order-save" });
}

function setRankRecommendationOrderControlStatus(element: HTMLElement | null, text: string): void {
    if (element !== null) {
        element.textContent = text;
    }
}

function toggleRankRecommendationCurvePreviewFromElement(element: HTMLElement): void {
    const stayDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE);
    const roomGroupId = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE);
    if (stayDate === null || roomGroupId === null || stayDate === "" || roomGroupId === "") {
        return;
    }

    const key = buildRankRecommendationCurvePreviewKey({ stayDate, roomGroupId });
    const nextOpen = element.getAttribute("aria-expanded") !== "true";
    rankRecommendationCurvePreviewOpenState.set(key, nextOpen);
    element.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    element.textContent = nextOpen ? "曲線を閉じる" : "曲線";

    const previewRowElement = element.closest("tr")?.nextElementSibling;
    if (
        previewRowElement instanceof HTMLTableRowElement
        && previewRowElement.hasAttribute(RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE)
    ) {
        previewRowElement.hidden = !nextOpen;
    }
}

function toggleRankRecommendationCompetitorPreviewFromElement(element: HTMLElement): void {
    const stayDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE);
    const roomGroupId = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE);
    if (stayDate === null || roomGroupId === null || stayDate === "" || roomGroupId === "") {
        return;
    }

    const key = buildRankRecommendationCompetitorPreviewKey({ stayDate, roomGroupId });
    const nextOpen = element.getAttribute("aria-expanded") !== "true";
    rankRecommendationCompetitorPreviewOpenState.set(key, nextOpen);
    element.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    element.textContent = nextOpen ? "競合価格を閉じる" : "競合価格";

    const rowElement = element.closest("tr");
    const previewRowElement = rowElement?.parentElement?.querySelector<HTMLTableRowElement>(
        `tr[${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(key)}"]`
    );
    if (previewRowElement !== null && previewRowElement !== undefined) {
        previewRowElement.hidden = !nextOpen;
    }
    if (nextOpen) {
        requestRankRecommendationCompetitorPreviewFromElement(element);
    }
}

function toggleRankRecommendationRankChangePreviewFromElement(element: HTMLElement): void {
    const stayDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE);
    const roomGroupId = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE);
    const reasonFingerprint = element.getAttribute(RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE);
    const facilityId = activeFacilityCacheKey;
    if (
        facilityId === null
        || stayDate === null
        || roomGroupId === null
        || reasonFingerprint === null
        || stayDate === ""
        || roomGroupId === ""
    ) {
        return;
    }

    const key = buildRankRecommendationRankChangeKey({ facilityId, stayDate, roomGroupId, reasonFingerprint });
    const nextOpen = element.getAttribute("aria-expanded") !== "true";
    rankRecommendationRankChangePreviewOpenState.set(key, nextOpen);
    element.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    element.textContent = nextOpen ? "ランク調整を閉じる" : "ランク調整";

    const rowElement = element.closest("tr");
    const previewRowElement = rowElement?.parentElement?.querySelector<HTMLTableRowElement>(
        `tr[${RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(key)}"]`
    );
    if (previewRowElement !== null && previewRowElement !== undefined) {
        previewRowElement.hidden = !nextOpen;
    }
}

function handleRankRecommendationPreviewKeydown(event: KeyboardEvent): boolean {
    if (event.key !== "Escape" || !(event.target instanceof Element)) {
        return false;
    }

    const previewButton = event.target.closest<HTMLButtonElement>(
        `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="curve-preview-toggle"],`
        + `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="competitor-preview-toggle"],`
        + `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-change-preview-toggle"]`
    );
    if (previewButton !== null && previewButton.getAttribute("aria-expanded") === "true") {
        closeRankRecommendationPreviewFromButton(previewButton);
        previewButton.focus();
        return true;
    }

    const previewRowElement = event.target.closest<HTMLTableRowElement>(
        `tr[${RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE}],`
        + `tr[${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_ROW_ATTRIBUTE}],`
        + `tr[${RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_ROW_ATTRIBUTE}]`
    );
    if (previewRowElement === null || previewRowElement.id === "") {
        return false;
    }

    const controller = document.querySelector<HTMLButtonElement>(
        `[${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][aria-controls="${cssEscapeAttributeValue(previewRowElement.id)}"]`
    );
    if (controller === null || controller.getAttribute("aria-expanded") !== "true") {
        return false;
    }

    closeRankRecommendationPreviewFromButton(controller);
    controller.focus();
    return true;
}

function closeRankRecommendationPreviewFromButton(element: HTMLButtonElement): void {
    const action = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE);
    if (action === "curve-preview-toggle") {
        toggleRankRecommendationCurvePreviewFromElement(element);
    } else if (action === "competitor-preview-toggle") {
        toggleRankRecommendationCompetitorPreviewFromElement(element);
    } else if (action === "rank-change-preview-toggle") {
        toggleRankRecommendationRankChangePreviewFromElement(element);
    }
}

function schedulePendingRankRecommendationRankChangeFromElement(element: HTMLElement): void {
    const draft = buildPendingRankRecommendationRankChangeDraftFromElement(element);
    if (draft === null) {
        return;
    }
    if (!draft.proposal.enabled) {
        setRankRecommendationRankChangeResult(draft.cacheKey, {
            status: "blocked",
            message: "送信不可条件が残っているため送信しません",
            failureClass: "proposal_disabled",
            httpStatus: null,
            occurredAt: new Date().toISOString()
        });
        queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-disabled" });
        return;
    }

    const blockingRankChange = findBlockingRankRecommendationRankChangeByScope(draft.proposal);
    if (blockingRankChange !== null && blockingRankChange.cacheKey !== draft.cacheKey) {
        setRankRecommendationRankChangeResult(draft.cacheKey, {
            status: "blocked",
            message: "同じ宿泊日と部屋タイプで反映待ちのrank変更があるため送信しません",
            failureClass: "rank_status_changed",
            httpStatus: null,
            occurredAt: new Date().toISOString()
        });
        queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-scope-blocked" });
        return;
    }

    const current = pendingRankRecommendationRankChangeByKey.get(draft.cacheKey);
    if (current !== undefined) {
        window.clearTimeout(current.timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
        void commitPendingRankRecommendationRankChange(draft.cacheKey);
    }, RANK_RECOMMENDATION_DECISION_UNDO_DELAY_MS);

    pendingRankRecommendationRankChangeByKey.set(draft.cacheKey, {
        draft,
        timeoutId,
        commitAt: Date.now() + RANK_RECOMMENDATION_DECISION_UNDO_DELAY_MS
    });

    renderPendingRankRecommendationRankChangeInline(element, pendingRankRecommendationRankChangeByKey.get(draft.cacheKey) ?? null);
    queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-pending" });
}

function cancelPendingRankRecommendationRankChangeFromElement(element: HTMLElement): void {
    const cacheKey = element.getAttribute(RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE);
    if (cacheKey === null) {
        return;
    }

    const current = pendingRankRecommendationRankChangeByKey.get(cacheKey);
    if (current === undefined) {
        return;
    }

    window.clearTimeout(current.timeoutId);
    pendingRankRecommendationRankChangeByKey.delete(cacheKey);
    removePendingRankRecommendationRankChangeInline(cacheKey);
    queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-cancel" });
}

function clearPendingRankRecommendationRankChanges(): void {
    for (const pending of pendingRankRecommendationRankChangeByKey.values()) {
        window.clearTimeout(pending.timeoutId);
    }
    pendingRankRecommendationRankChangeByKey.clear();
    activeRankRecommendationRankChangeByScopeKey.clear();
}

function renderPendingRankRecommendationRankChangeInline(
    sourceElement: HTMLElement,
    pending: PendingRankRecommendationRankChange | null
): void {
    if (pending === null) {
        return;
    }

    const rowElement = findRankRecommendationCandidateRowFromElement(sourceElement);
    const actionCellElement = rowElement?.lastElementChild;
    if (!(actionCellElement instanceof HTMLTableCellElement)) {
        return;
    }

    removePendingRankRecommendationRankChangeInline(pending.draft.cacheKey);
    actionCellElement.append(createRankRecommendationPendingRankChangeElement(pending));
}

function removePendingRankRecommendationRankChangeInline(cacheKey: string): void {
    document
        .querySelectorAll<HTMLElement>(
            `[${RANK_RECOMMENDATION_PENDING_RANK_CHANGE_ATTRIBUTE}][${RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(cacheKey)}"]`
        )
        .forEach((element) => {
            element.remove();
        });
}

function findRankRecommendationCandidateRowFromElement(element: HTMLElement): HTMLTableRowElement | null {
    let rowElement = element.closest("tr");
    while (rowElement !== null) {
        if (rowElement.hasAttribute(RANK_RECOMMENDATION_ROW_ATTRIBUTE)) {
            return rowElement;
        }
        rowElement = rowElement.previousElementSibling instanceof HTMLTableRowElement
            ? rowElement.previousElementSibling
            : null;
    }
    return null;
}

function findBlockingRankRecommendationRankChangeByScope(
    proposal: Pick<RankRecommendationRankChangeProposal, "facilityId" | "stayDate" | "roomGroupId">
): { cacheKey: string; kind: "pending" | "active" } | null {
    for (const pending of pendingRankRecommendationRankChangeByKey.values()) {
        if (isSameRankRecommendationRankChangeScope(pending.draft.proposal, proposal)) {
            return {
                cacheKey: pending.draft.cacheKey,
                kind: "pending"
            };
        }
    }

    const active = activeRankRecommendationRankChangeByScopeKey.get(buildRankRecommendationRankChangeScopeKey(proposal));
    return active === undefined
        ? null
        : {
            cacheKey: active.cacheKey,
            kind: "active"
        };
}

function isRankRecommendationRankChangeBlockedByScope(candidate: RankRecommendationCandidate): boolean {
    return findBlockingRankRecommendationRankChangeByScope(candidate) !== null;
}

function isSameRankRecommendationRankChangeScope(
    left: Pick<RankRecommendationRankChangeProposal, "facilityId" | "stayDate" | "roomGroupId">,
    right: Pick<RankRecommendationRankChangeProposal, "facilityId" | "stayDate" | "roomGroupId">
): boolean {
    return left.facilityId === right.facilityId
        && left.stayDate === right.stayDate
        && left.roomGroupId === right.roomGroupId;
}

function buildRankRecommendationRankChangeScopeKey(
    parts: Pick<RankRecommendationRankChangeProposal, "facilityId" | "stayDate" | "roomGroupId">
): string {
    return [
        `facility:${parts.facilityId}`,
        `stayDate:${parts.stayDate}`,
        `roomGroup:${parts.roomGroupId}`
    ].join("|");
}

function buildPendingRankRecommendationRankChangeDraftFromElement(
    element: HTMLElement
): PendingRankRecommendationRankChangeDraft | null {
    const stayDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE);
    const asOfDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_AS_OF_DATE_ATTRIBUTE);
    const roomGroupId = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE);
    const roomGroupName = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE);
    const reasonFingerprint = element.getAttribute(RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE);
    const currentRankCode = element.getAttribute(RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_CODE_ATTRIBUTE);
    const currentRankName = element.getAttribute(RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_NAME_ATTRIBUTE);
    const targetRankCode = element.getAttribute(RANK_RECOMMENDATION_RANK_CHANGE_TARGET_CODE_ATTRIBUTE);
    const targetRankName = element.getAttribute(RANK_RECOMMENDATION_RANK_CHANGE_TARGET_NAME_ATTRIBUTE);
    const generatedAt = element.getAttribute(RANK_RECOMMENDATION_RANK_CHANGE_GENERATED_AT_ATTRIBUTE);
    const confidenceLevel = parseRankRecommendationDecisionConfidenceLevel(
        element.getAttribute(RANK_RECOMMENDATION_BUTTON_CONFIDENCE_LEVEL_ATTRIBUTE)
    );
    const disabledReasons = parseRankRecommendationRankChangeDisabledReasons(
        element.getAttribute(RANK_RECOMMENDATION_RANK_CHANGE_DISABLED_REASONS_ATTRIBUTE)
    );
    const facilityId = activeFacilityCacheKey;

    if (
        facilityId === null
        || stayDate === null
        || asOfDate === null
        || roomGroupId === null
        || roomGroupName === null
        || reasonFingerprint === null
        || generatedAt === null
        || confidenceLevel === null
    ) {
        return null;
    }

    const proposal: RankRecommendationRankChangeProposal = {
        facilityId,
        stayDate,
        asOfDate,
        generatedAt,
        roomGroupId,
        roomGroupName,
        currentRankCode: normalizeRankRecommendationElementText(currentRankCode),
        currentRankName: normalizeRankRecommendationElementText(currentRankName),
        targetRankCode: normalizeRankRecommendationElementText(targetRankCode),
        targetRankName: normalizeRankRecommendationElementText(targetRankName),
        reasonFingerprint,
        confidenceLevel,
        disabledReasons,
        enabled: disabledReasons.length === 0
    };

    return {
        cacheKey: buildRankRecommendationRankChangeKey({ facilityId, stayDate, roomGroupId, reasonFingerprint }),
        proposal,
        createdAt: new Date().toISOString()
    };
}

async function commitPendingRankRecommendationRankChange(cacheKey: string): Promise<void> {
    const pending = pendingRankRecommendationRankChangeByKey.get(cacheKey);
    if (pending === undefined) {
        return;
    }

    pendingRankRecommendationRankChangeByKey.delete(cacheKey);
    const proposal = pending.draft.proposal;
    if (activeFacilityCacheKey !== proposal.facilityId || activeBatchDateKey !== proposal.asOfDate) {
        return;
    }
    if (
        !proposal.enabled
        || proposal.currentRankCode === null
        || proposal.currentRankName === null
        || proposal.targetRankCode === null
        || proposal.targetRankName === null
    ) {
        setRankRecommendationRankChangeResult(cacheKey, {
            status: "blocked",
            message: "送信不可条件が残っているため送信しません",
            failureClass: "proposal_disabled",
            httpStatus: null,
            occurredAt: new Date().toISOString()
        });
        queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-proposal-disabled" });
        return;
    }

    const scopeKey = buildRankRecommendationRankChangeScopeKey(proposal);
    const blockingRankChange = findBlockingRankRecommendationRankChangeByScope(proposal);
    if (blockingRankChange !== null && blockingRankChange.cacheKey !== cacheKey) {
        setRankRecommendationRankChangeResult(cacheKey, {
            status: "blocked",
            message: "同じ宿泊日と部屋タイプで反映待ちのrank変更があるため送信しません",
            failureClass: "rank_status_changed",
            httpStatus: null,
            occurredAt: new Date().toISOString()
        });
        queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-scope-blocked" });
        return;
    }

    const preflight = await preflightRankRecommendationRankChange(pending.draft);
    if (preflight !== null) {
        setRankRecommendationRankChangeResult(cacheKey, preflight);
        recordRankRecommendationRankChangeFailure(cacheKey, preflight);
        queueCalendarSync({ force: true, reason: `rank-recommendation-rank-change-${preflight.failureClass ?? "blocked"}` });
        return;
    }

    activeRankRecommendationRankChangeByScopeKey.set(scopeKey, {
        cacheKey,
        proposal,
        submittedAt: null,
        state: "submitting"
    });
    setRankRecommendationRankChangeResult(cacheKey, {
        status: "confirming",
        message: "rank変更を送信中です。完了するまで同じ宿泊日と部屋タイプの追加送信はできません。",
        failureClass: null,
        httpStatus: null,
        occurredAt: new Date().toISOString()
    });
    queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-submitting" });

    const submitResult = await submitLincolnCustomRankSuggestion({
        stayDate: proposal.stayDate,
        roomGroupId: proposal.roomGroupId,
        targetRankCode: proposal.targetRankCode,
        targetRankName: proposal.targetRankName
    });
    clearRankRecommendationRankChangeReadCaches();

    if (!submitResult.ok) {
        clearActiveRankRecommendationRankChange(scopeKey, cacheKey);
        const result: RankRecommendationRankChangeResult = {
            status: "failed",
            message: formatRankRecommendationRankChangeSubmitFailureMessage(submitResult.failureType, submitResult.status),
            failureClass: submitResult.failureType ?? "unexpected_error",
            httpStatus: submitResult.status,
            occurredAt: new Date().toISOString()
        };
        setRankRecommendationRankChangeResult(cacheKey, result);
        recordRankRecommendationRankChangeFailure(cacheKey, result);
        queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-submit-failed" });
        return;
    }

    const submittedAt = new Date().toISOString();
    activeRankRecommendationRankChangeByScopeKey.set(scopeKey, {
        cacheKey,
        proposal,
        submittedAt,
        state: "confirming"
    });
    setRankRecommendationRankChangeResult(cacheKey, {
        status: "confirming",
        message: "送信は完了しました。Revenue Assistant の反映結果を確認中です。同じ宿泊日と部屋タイプの追加送信はできません。",
        failureClass: null,
        httpStatus: submitResult.status,
        occurredAt: submittedAt
    });
    queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-confirming" });

    const confirmation = await confirmRankRecommendationRankChangeReflection(proposal, submittedAt);
    clearActiveRankRecommendationRankChange(scopeKey, cacheKey);
    if (!confirmation.confirmed) {
        const readFailure = confirmation.failure;
        const result: RankRecommendationRankChangeResult = {
            status: "failed",
            message: readFailure === null
                ? "送信は完了しましたが、反映確認がまだ取れていません。Revenue Assistant 標準画面で対象日と部屋タイプを確認してください。"
                : formatRankRecommendationReadFailureMessage(readFailure, "confirmation"),
            failureClass: readFailure?.failureClass ?? "reflection_unconfirmed",
            httpStatus: readFailure?.httpStatus ?? submitResult.status,
            occurredAt: new Date().toISOString()
        };
        setRankRecommendationRankChangeResult(cacheKey, result);
        recordRankRecommendationRankChangeFailure(cacheKey, result);
        queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-unconfirmed" });
        return;
    }

    setRankRecommendationRankChangeResult(cacheKey, {
        status: "success",
        message: "反映を確認しました",
        failureClass: null,
        httpStatus: submitResult.status,
        occurredAt: new Date().toISOString()
    });
    clearRankRecommendationRankChangeReadCaches();
    queueCalendarSync({ force: true, reason: "rank-recommendation-rank-change-success" });
}

async function preflightRankRecommendationRankChange(
    draft: PendingRankRecommendationRankChangeDraft
): Promise<RankRecommendationRankChangeResult | null> {
    const proposal = draft.proposal;
    const [currentSettingsResult, statusesResult] = await Promise.allSettled([
        loadSalesSettingCurrentSettings(proposal.stayDate, proposal.stayDate),
        loadLincolnSuggestStatuses(proposal.stayDate)
    ] as const);

    if (currentSettingsResult.status === "rejected") {
        const readFailure = classifyRankRecommendationReadFailure(currentSettingsResult.reason, "current settings");
        console.warn(`[${SCRIPT_NAME}] failed to preflight rank recommendation rank change`, {
            stayDate: proposal.stayDate,
            roomGroupId: proposal.roomGroupId,
            endpointLabel: readFailure.endpointLabel,
            failureClass: readFailure.failureClass,
            httpStatus: readFailure.httpStatus
        });
        return {
            status: "blocked",
            message: formatRankRecommendationReadFailureMessage(readFailure, "preflight"),
            failureClass: readFailure.failureClass,
            httpStatus: readFailure.httpStatus,
            occurredAt: new Date().toISOString()
        };
    }
    if (statusesResult.status === "rejected") {
        const readFailure = classifyRankRecommendationReadFailure(statusesResult.reason, "rank status");
        console.warn(`[${SCRIPT_NAME}] failed to preflight rank recommendation rank change`, {
            stayDate: proposal.stayDate,
            roomGroupId: proposal.roomGroupId,
            endpointLabel: readFailure.endpointLabel,
            failureClass: readFailure.failureClass,
            httpStatus: readFailure.httpStatus
        });
        return {
            status: "blocked",
            message: formatRankRecommendationReadFailureMessage(readFailure, "preflight"),
            failureClass: readFailure.failureClass,
            httpStatus: readFailure.httpStatus,
            occurredAt: new Date().toISOString()
        };
    }

    const currentSettings = currentSettingsResult.value;
    const statuses = statusesResult.value;
    const currentRoomGroup = findRankRecommendationCurrentRoomGroup(currentSettings, proposal.stayDate, proposal.roomGroupId);
    const latestRankCode = normalizeRankRecommendationElementText(currentRoomGroup?.latest_current?.price_rank_code ?? null);
    const latestRankName = normalizeRankRecommendationElementText(currentRoomGroup?.latest_current?.price_rank_name ?? null);
    if (latestRankCode !== proposal.currentRankCode || latestRankName !== proposal.currentRankName) {
        return {
            status: "blocked",
            message: `現在rankが候補表示時から変わったため送信しません（表示時 ${proposal.currentRankName ?? "-"} / 現在 ${latestRankName ?? "-"}）`,
            failureClass: "current_rank_mismatch",
            httpStatus: null,
            occurredAt: new Date().toISOString()
        };
    }

    if (hasRankRecommendationStatusAfter(statuses, proposal, proposal.generatedAt)) {
        return {
            status: "blocked",
            message: "候補表示後に同じ宿泊日と部屋タイプのrank変更履歴があるため送信しません",
            failureClass: "rank_status_changed",
            httpStatus: null,
            occurredAt: new Date().toISOString()
        };
    }

    return null;
}

async function confirmRankRecommendationRankChangeReflection(
    proposal: RankRecommendationRankChangeProposal,
    submittedAt: string
): Promise<RankRecommendationReflectionConfirmationResult> {
    let firstReadFailure: RankRecommendationReadFailure | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        if (attempt > 0) {
            await delay(3000);
        }
        clearRankRecommendationRankChangeReadCaches();
        const [currentSettingsResult, statusesResult] = await Promise.allSettled([
            loadSalesSettingCurrentSettings(proposal.stayDate, proposal.stayDate),
            loadLincolnSuggestStatuses(proposal.stayDate)
        ] as const);

        if (currentSettingsResult.status === "fulfilled") {
            const currentSettings = currentSettingsResult.value;
            const currentRoomGroup = findRankRecommendationCurrentRoomGroup(currentSettings, proposal.stayDate, proposal.roomGroupId);
            const latestRankCode = normalizeRankRecommendationElementText(currentRoomGroup?.latest_current?.price_rank_code ?? null);
            const latestRankName = normalizeRankRecommendationElementText(currentRoomGroup?.latest_current?.price_rank_name ?? null);
            if (latestRankCode === proposal.targetRankCode && latestRankName === proposal.targetRankName) {
                return { confirmed: true };
            }
        } else if (firstReadFailure === null) {
            firstReadFailure = classifyRankRecommendationReadFailure(currentSettingsResult.reason, "current settings");
        }

        if (statusesResult.status === "fulfilled") {
            if (hasConfirmedRankRecommendationStatus(statusesResult.value, proposal, submittedAt)) {
                return { confirmed: true };
            }
        } else if (firstReadFailure === null) {
            firstReadFailure = classifyRankRecommendationReadFailure(statusesResult.reason, "rank status");
        }
    }

    return {
        confirmed: false,
        failure: firstReadFailure
    };
}

function classifyRankRecommendationReadFailure(error: unknown, endpointLabel: string): RankRecommendationReadFailure {
    if (error instanceof RevenueAssistantRequestError) {
        return {
            endpointLabel,
            failureClass: error.status === 401 ? "http_401" : error.status === 403 ? "http_403" : "http_error",
            httpStatus: error.status
        };
    }

    return {
        endpointLabel,
        failureClass: error instanceof TypeError ? "network_error" : "unexpected_error",
        httpStatus: null
    };
}

function formatRankRecommendationReadFailureMessage(
    failure: RankRecommendationReadFailure,
    phase: "preflight" | "confirmation"
): string {
    const actionPrefix = phase === "preflight"
        ? `送信直前の${failure.endpointLabel}再取得に失敗したため送信しません`
        : `送信は完了しましたが、${failure.endpointLabel}再取得に失敗したため反映確認ができていません`;
    const actionSuffix = phase === "confirmation"
        ? "Revenue Assistant 標準画面で対象日と部屋タイプを確認してください。"
        : "";

    switch (failure.failureClass) {
        case "http_401":
            return `${actionPrefix}（HTTP 401）。Revenue Assistant へ再ログインしてから再確認してください。${actionSuffix}`.trim();
        case "http_403":
            return `${actionPrefix}（HTTP 403）。閲覧または操作権限を確認してください。${actionSuffix}`.trim();
        case "http_error":
            return `${actionPrefix}（HTTP ${failure.httpStatus ?? "-"}）。時間を置いて再確認してください。${actionSuffix}`.trim();
        case "network_error":
            return `${actionPrefix}（network error）。通信状態を確認してから再確認してください。${actionSuffix}`.trim();
        case "unexpected_error":
        default:
            return `${actionPrefix}。${actionSuffix}`.trim();
    }
}

function findRankRecommendationCurrentRoomGroup(
    response: SalesSettingCurrentSettingsResponse,
    stayDate: string,
    roomGroupId: string
): SalesSettingCurrentSettingRoomGroup | null {
    for (const currentSetting of response.suggest_output_current_settings ?? []) {
        if (toCompactDateKey(currentSetting.stay_date ?? "") !== stayDate) {
            continue;
        }
        for (const roomGroup of currentSetting.rm_room_groups ?? []) {
            if ((roomGroup.rm_room_group_id?.trim() ?? "") === roomGroupId) {
                return roomGroup;
            }
        }
    }
    return null;
}

function hasRankRecommendationStatusAfter(
    statuses: readonly LincolnSuggestStatus[],
    proposal: RankRecommendationRankChangeProposal,
    since: string
): boolean {
    const sinceTime = Date.parse(since);
    return statuses.some((status) => {
        if (!isRankRecommendationStatusForProposal(status, proposal)) {
            return false;
        }
        const timestamp = getLincolnSuggestStatusTimestamp(status);
        if (timestamp === null) {
            return false;
        }
        const statusTime = Date.parse(timestamp);
        return Number.isFinite(statusTime) && Number.isFinite(sinceTime) && statusTime > sinceTime;
    });
}

function hasConfirmedRankRecommendationStatus(
    statuses: readonly LincolnSuggestStatus[],
    proposal: RankRecommendationRankChangeProposal,
    since: string
): boolean {
    const sinceTime = Date.parse(since);
    return statuses.some((status) => {
        if (!isRankRecommendationStatusForProposal(status, proposal)) {
            return false;
        }
        if ((status.after_price_rank_name ?? null) !== proposal.targetRankName) {
            return false;
        }
        const timestamp = getLincolnSuggestStatusTimestamp(status);
        if (timestamp === null) {
            return false;
        }
        const statusTime = Date.parse(timestamp);
        return Number.isFinite(statusTime) && Number.isFinite(sinceTime) && statusTime >= sinceTime;
    });
}

function isRankRecommendationStatusForProposal(
    status: LincolnSuggestStatus,
    proposal: RankRecommendationRankChangeProposal
): boolean {
    return toCompactDateKey(status.date ?? "") === proposal.stayDate
        && (status.rm_room_group_id?.trim() ?? "") === proposal.roomGroupId;
}

function setRankRecommendationRankChangeResult(
    cacheKey: string,
    result: RankRecommendationRankChangeResult
): void {
    rankRecommendationRankChangeResultByKey.set(cacheKey, result);
}

function clearActiveRankRecommendationRankChange(scopeKey: string, cacheKey: string): void {
    const active = activeRankRecommendationRankChangeByScopeKey.get(scopeKey);
    if (active?.cacheKey === cacheKey) {
        activeRankRecommendationRankChangeByScopeKey.delete(scopeKey);
    }
}

function clearRankRecommendationRankChangeReadCaches(): void {
    rankRecommendationCurrentSettingsCache.clear();
    salesSettingCurrentSettingsPromiseCache.clear();
    lincolnSuggestStatusCache.clear();
    lincolnSuggestStatusRangeCache.clear();
}

function recordRankRecommendationRankChangeFailure(cacheKey: string, result: RankRecommendationRankChangeResult): void {
    if (result.failureClass === null) {
        return;
    }

    try {
        const rawValue = window.localStorage.getItem(RANK_RECOMMENDATION_RANK_CHANGE_FAILURE_STORAGE_KEY);
        const current = rawValue === null ? [] : JSON.parse(rawValue);
        const records = Array.isArray(current) ? current.slice(0, 19) : [];
        records.unshift({
            cacheKey,
            failureClass: result.failureClass,
            httpStatus: result.httpStatus,
            occurredAt: result.occurredAt
        });
        window.localStorage.setItem(RANK_RECOMMENDATION_RANK_CHANGE_FAILURE_STORAGE_KEY, JSON.stringify(records));
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to store rank recommendation rank change failure`, { error });
    }
}

function parseRankRecommendationRankChangeDisabledReasons(
    value: string | null
): RankRecommendationRankChangeDisabledReason[] {
    if (value === null || value.trim() === "") {
        return [];
    }

    return value.split(",")
        .map((reason) => reason.trim())
        .filter((reason): reason is RankRecommendationRankChangeDisabledReason => isRankRecommendationRankChangeDisabledReason(reason));
}

function isRankRecommendationRankChangeDisabledReason(
    value: string
): value is RankRecommendationRankChangeDisabledReason {
    return [
        "candidate_not_active",
        "unsupported_action",
        "current_rank_missing",
        "recommended_rank_missing",
        "rank_order_untrusted",
        "low_confidence",
        "small_capacity_or_capacity_missing",
        "group_driven_raise_suppressed",
        "unsupported_provider"
    ].includes(value);
}

function normalizeRankRecommendationElementText(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

function buildRankRecommendationRankChangeKey(parts: {
    facilityId: string;
    stayDate: string;
    roomGroupId: string;
    reasonFingerprint: string;
}): string {
    return [
        `facility:${parts.facilityId}`,
        `stayDate:${parts.stayDate}`,
        `roomGroup:${parts.roomGroupId}`,
        `reason:${parts.reasonFingerprint}`
    ].join("|");
}

function formatRankRecommendationRankChangeSubmitFailureMessage(
    failureType: RankRecommendationWriteFailureType | null,
    status: number | null
): string {
    if (failureType === "http_error") {
        return `送信に失敗しました（HTTP ${status ?? "-"}）`;
    }
    if (failureType === "network_error") {
        return "送信に失敗しました（network error）";
    }
    return "送信に失敗しました";
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function cssEscapeAttributeValue(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
}

function increaseRankRecommendationDisplayLimit(): void {
    const nextLimit = Math.min(
        RANK_RECOMMENDATION_MAX_DISPLAY_LIMIT,
        rankRecommendationDisplayLimit + RANK_RECOMMENDATION_DISPLAY_LIMIT_STEP
    );
    if (nextLimit === rankRecommendationDisplayLimit) {
        return;
    }

    rankRecommendationDisplayLimit = nextLimit;
    queueCalendarSync({ force: true, reason: "rank-recommendation-display-more" });
}

function resetRankRecommendationDisplayLimit(): void {
    if (rankRecommendationDisplayLimit === RANK_RECOMMENDATION_INITIAL_DISPLAY_LIMIT) {
        return;
    }

    rankRecommendationDisplayLimit = RANK_RECOMMENDATION_INITIAL_DISPLAY_LIMIT;
    queueCalendarSync({ force: true, reason: "rank-recommendation-display-reset" });
}

function setRankRecommendationViewModeFromElement(element: HTMLElement): void {
    const viewMode = parseRankRecommendationViewMode(element.getAttribute(RANK_RECOMMENDATION_VIEW_MODE_ATTRIBUTE));
    if (viewMode === null || viewMode === rankRecommendationViewMode) {
        return;
    }

    rankRecommendationViewMode = viewMode;
    rankRecommendationDisplayLimit = RANK_RECOMMENDATION_INITIAL_DISPLAY_LIMIT;
    rankRecommendationCurvePreviewOpenState.clear();
    rankRecommendationCompetitorPreviewOpenState.clear();
    rankRecommendationRankChangePreviewOpenState.clear();
    queueCalendarSync({ force: true, reason: "rank-recommendation-view-mode" });
}

function setRankRecommendationTargetMonthFromElement(element: HTMLSelectElement): void {
    const targetMonth = parseRankRecommendationTargetMonth(element.value);
    if (targetMonth === rankRecommendationTargetMonth) {
        return;
    }

    rankRecommendationTargetMonth = targetMonth;
    rankRecommendationDisplayLimit = RANK_RECOMMENDATION_INITIAL_DISPLAY_LIMIT;
    rankRecommendationCurvePreviewOpenState.clear();
    rankRecommendationCompetitorPreviewOpenState.clear();
    rankRecommendationRankChangePreviewOpenState.clear();
    if (targetMonth !== null) {
        requestSalesSettingWarmCachePriorityMonth(targetMonth);
    }
    queueCalendarSync({ force: true, reason: "rank-recommendation-target-month" });
}

function parseRankRecommendationViewMode(value: string | null): RankRecommendationViewMode | null {
    return RANK_RECOMMENDATION_VIEW_MODE_OPTIONS.some((option) => option.mode === value)
        ? value as RankRecommendationViewMode
        : null;
}

function parseRankRecommendationTargetMonth(value: string | null): string | null {
    if (value === null || value === "all") {
        return null;
    }

    return /^\d{6}$/.test(value) ? value : null;
}

function parseRankRecommendationRankLadderFromElement(element: HTMLElement): RankRecommendationRankLadderEntry[] {
    const rawValue = element.getAttribute(RANK_RECOMMENDATION_RANK_LADDER_ATTRIBUTE);
    if (rawValue === null) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawValue) as Array<Partial<RankRecommendationRankLadderEntry>>;
        return Array.isArray(parsed)
            ? parsed.flatMap((entry) => {
                const code = entry.price_rank_code?.trim() ?? "";
                const name = entry.price_rank_name?.trim() ?? "";
                return code === "" || name === "" ? [] : [{ price_rank_code: code, price_rank_name: name }];
            })
            : [];
    } catch {
        return [];
    }
}

type RankRecommendationRankOrderInputParseResult =
    | { ok: true; ranks: Array<{ code: string; name: string }> }
    | { ok: false; message: string };

function parseRankRecommendationRankOrderInput(
    value: string,
    rankLadder: readonly RankRecommendationRankLadderEntry[]
): RankRecommendationRankOrderInputParseResult {
    const tokens = value
        .split(/[,\n>、]+/u)
        .map((token) => token.trim())
        .filter((token) => token !== "");
    const normalizedRanks: Array<{ code: string; name: string }> = [];
    for (const entry of rankLadder) {
        const code = entry.price_rank_code?.trim() ?? "";
        const name = entry.price_rank_name?.trim() ?? "";
        if (code === "" || name === "") {
            continue;
        }

        normalizedRanks.push({ code, name });
    }
    if (normalizedRanks.length === 0) {
        return {
            ok: false,
            message: "rank順序を保存できません: rank ladder 未取得"
        };
    }

    const rankByInput = new Map<string, Array<{ code: string; name: string }>>();
    for (const rank of normalizedRanks) {
        appendRankRecommendationRankOrderInputCandidate(rankByInput, rank.code, rank);
        appendRankRecommendationRankOrderInputCandidate(rankByInput, rank.name, rank);
    }

    const usedCodes = new Set<string>();
    const parsedOrder: Array<{ code: string; name: string }> = [];
    const unknownTokens: string[] = [];
    const duplicateTokens: string[] = [];
    const ambiguousTokens: string[] = [];
    for (const token of tokens) {
        const ranks = rankByInput.get(token);
        if (ranks === undefined) {
            unknownTokens.push(token);
            continue;
        }
        if (ranks.length !== 1) {
            ambiguousTokens.push(token);
            continue;
        }
        const rank = ranks[0];
        if (rank === undefined) {
            ambiguousTokens.push(token);
            continue;
        }
        if (usedCodes.has(rank.code)) {
            duplicateTokens.push(token);
            continue;
        }
        usedCodes.add(rank.code);
        parsedOrder.push(rank);
    }

    const missingRanks = normalizedRanks.filter((rank) => !usedCodes.has(rank.code));
    if (
        unknownTokens.length > 0
        || duplicateTokens.length > 0
        || ambiguousTokens.length > 0
        || missingRanks.length > 0
    ) {
        const issues = [
            tokens.length === normalizedRanks.length ? null : `件数 ${tokens.length}/${normalizedRanks.length}`,
            unknownTokens.length === 0 ? null : `未確認 ${formatRankRecommendationRankOrderIssueValues(unknownTokens)}`,
            duplicateTokens.length === 0 ? null : `重複 ${formatRankRecommendationRankOrderIssueValues(duplicateTokens)}`,
            ambiguousTokens.length === 0 ? null : `判別不可 ${formatRankRecommendationRankOrderIssueValues(ambiguousTokens)}`,
            missingRanks.length === 0
                ? null
                : `不足 ${formatRankRecommendationRankOrderIssueValues(missingRanks.map(formatRankRecommendationRankOrderLabel))}`
        ].filter((issue): issue is string => issue !== null);
        return {
            ok: false,
            message: `rank順序を保存できません: ${issues.join(" / ")}`
        };
    }

    return { ok: true, ranks: parsedOrder };
}

function appendRankRecommendationRankOrderInputCandidate(
    map: Map<string, Array<{ code: string; name: string }>>,
    value: string,
    rank: { code: string; name: string }
): void {
    const ranks = map.get(value);
    if (ranks === undefined) {
        map.set(value, [rank]);
        return;
    }
    if (!ranks.some((candidate) => candidate.code === rank.code)) {
        ranks.push(rank);
    }
}

function formatRankRecommendationRankOrderLabel(rank: { code: string; name: string }): string {
    return rank.code === rank.name ? rank.name : `${rank.name}(${rank.code})`;
}

function formatRankRecommendationRankOrderIssueValues(values: readonly string[]): string {
    const uniqueValues = Array.from(new Set(values));
    const shownValues = uniqueValues.slice(0, 5).join(", ");
    return uniqueValues.length > 5 ? `${shownValues} ほか${uniqueValues.length - 5}件` : shownValues;
}

function getRankRecommendationRankOrderOverrideStorageKey(facilityCacheKey: string): string {
    return `${RANK_RECOMMENDATION_ORDER_OVERRIDE_STORAGE_PREFIX}${facilityCacheKey}`;
}

function readRankRecommendationRankOrderOverride(facilityCacheKey: string): RankRecommendationRankOrderOverride | null {
    const rawValue = window.localStorage.getItem(getRankRecommendationRankOrderOverrideStorageKey(facilityCacheKey));
    if (rawValue === null) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue) as Partial<RankRecommendationRankOrderOverrideRecord>;
        const codes = Array.isArray(parsed.rankCodesHighToLow)
            ? parsed.rankCodesHighToLow.filter((code): code is string => typeof code === "string" && code.trim() !== "")
            : [];
        return codes.length > 0 ? { rankCodesHighToLow: codes } : null;
    } catch {
        return null;
    }
}

function parseRankRecommendationDecisionType(value: string | null): RankRecommendationDecisionType | null {
    if (value === "snooze" || value === "dismiss") {
        return value;
    }

    return null;
}

function parseRankRecommendationDecisionConfidenceLevel(value: string | null): RankRecommendationDecisionConfidenceLevel | null {
    if (value === "high" || value === "medium" || value === "low") {
        return value;
    }

    return null;
}

function formatRankRecommendationDecisionType(decisionType: RankRecommendationDecisionType): string {
    switch (decisionType) {
        case "snooze":
            return "様子見";
        case "dismiss":
        default:
            return "対応不要";
    }
}

function parseRankRecommendationAction(value: string | null): RankRecommendationAction | null {
    switch (value) {
        case "raise_watch":
        case "lower_watch":
        case "watch":
        case "not_eligible":
            return value;
        default:
            return null;
    }
}

function getRankRecommendationSnoozeCooldownUntilAsOfDate(stayDate: string, asOfDate: string): string {
    const leadDays = getDaysBetweenDateKeys(stayDate, asOfDate);
    const cooldownDays = leadDays === null || leadDays <= 14
        ? 2
        : leadDays <= 30
            ? 3
            : 7;
    return shiftDate(asOfDate, cooldownDays);
}

function readPendingRankRecommendationFocus(): PendingRankRecommendationFocus | null {
    let rawValue: string | null;
    try {
        rawValue = window.sessionStorage.getItem(RANK_RECOMMENDATION_PENDING_FOCUS_STORAGE_KEY);
    } catch {
        return null;
    }

    if (rawValue === null) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue) as Partial<PendingRankRecommendationFocus>;
        if (
            typeof parsed.stayDate !== "string"
            || typeof parsed.roomGroupId !== "string"
            || typeof parsed.roomGroupName !== "string"
            || typeof parsed.createdAt !== "string"
        ) {
            return null;
        }

        return {
            stayDate: parsed.stayDate,
            roomGroupId: parsed.roomGroupId,
            roomGroupName: parsed.roomGroupName,
            actionLabel: typeof parsed.actionLabel === "string" ? parsed.actionLabel : null,
            reasonText: typeof parsed.reasonText === "string" ? parsed.reasonText : null,
            cautionText: typeof parsed.cautionText === "string" ? parsed.cautionText : null,
            createdAt: parsed.createdAt
        };
    } catch {
        return null;
    }
}

function clearPendingRankRecommendationFocus(): void {
    try {
        window.sessionStorage.removeItem(RANK_RECOMMENDATION_PENDING_FOCUS_STORAGE_KEY);
    } catch {
        // ignore sessionStorage access failure
    }
}

function preparePendingRankRecommendationFocusForAnalyze(analysisDate: string): void {
    const focus = readPendingRankRecommendationFocus();
    if (focus === null || focus.stayDate !== analysisDate) {
        return;
    }

    setSalesSettingBookingCurveOpen(getSalesSettingBookingCurveToggleKey(focus.roomGroupName), true);
}

async function applyPendingRankRecommendationFocus(
    analysisDate: string,
    preparedData: SalesSettingPreparedData | null
): Promise<void> {
    const focus = readPendingRankRecommendationFocus();
    if (focus === null || focus.stayDate !== analysisDate || preparedData === null) {
        return;
    }

    const card = preparedData.cards.find((candidateCard) => candidateCard.roomGroupName === focus.roomGroupName)
        ?? preparedData.cards.find((candidateCard) => candidateCard.roomGroupName.includes(focus.roomGroupName));
    if (card === undefined) {
        console.warn(`[${SCRIPT_NAME}] rank recommendation focus target not found`, {
            analysisDate,
            roomGroupId: focus.roomGroupId,
            roomGroupName: focus.roomGroupName
        });
        return;
    }

    setSalesSettingBookingCurveOpen(getSalesSettingBookingCurveToggleKey(card.roomGroupName), true);
    renderPendingRankRecommendationFocusSummary(card, focus);
    card.cardElement.setAttribute(RANK_RECOMMENDATION_FOCUS_HIGHLIGHT_ATTRIBUTE, "");
    card.cardElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
    window.setTimeout(() => {
        card.cardElement.removeAttribute(RANK_RECOMMENDATION_FOCUS_HIGHLIGHT_ATTRIBUTE);
    }, 4500);
    clearPendingRankRecommendationFocus();
}

function renderPendingRankRecommendationFocusSummary(card: SalesSettingCard, focus: PendingRankRecommendationFocus): void {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${RANK_RECOMMENDATION_FOCUS_SUMMARY_ATTRIBUTE}]`))) {
        element.remove();
    }

    const parts = [
        "料金調整候補",
        normalizeRankRecommendationFocusText(focus.actionLabel),
        normalizeRankRecommendationFocusText(focus.reasonText),
        formatRankRecommendationFocusCautionText(focus.cautionText)
    ].filter((part): part is string => part !== null);
    const summaryElement = document.createElement("div");
    summaryElement.setAttribute(RANK_RECOMMENDATION_FOCUS_SUMMARY_ATTRIBUTE, "");
    summaryElement.textContent = parts.join(" / ");

    if (card.headingElement.parentElement === card.cardElement) {
        card.cardElement.insertBefore(summaryElement, card.headingElement.nextSibling);
        return;
    }

    card.cardElement.prepend(summaryElement);
}

function normalizeRankRecommendationFocusText(value: string | null): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

function formatRankRecommendationFocusCautionText(value: string | null): string | null {
    const normalized = normalizeRankRecommendationFocusText(value);
    return normalized === null ? null : `注意: ${normalized}`;
}

function scheduleCompetitorPriceOverviewRenderRetries(facilityCacheKey: string, analysisDate: string): void {
    void refreshCompetitorPriceSnapshotSeries(facilityCacheKey, analysisDate);
    for (const delay of [120, 300, 700, 1500, 3000]) {
        window.setTimeout(() => {
            if (activeAnalyzeDate !== analysisDate || activeFacilityCacheKey !== facilityCacheKey) {
                return;
            }
            renderCompetitorPriceOverviewFromState();
        }, delay);
    }
}

function schedulePriceTrendOverviewRenderRetries(facilityCacheKey: string, analysisDate: string): void {
    void refreshPriceTrendRecords(facilityCacheKey, analysisDate);
    for (const delay of [120, 300, 700, 1500, 3000]) {
        window.setTimeout(() => {
            if (activeAnalyzeDate !== analysisDate || activeFacilityCacheKey !== facilityCacheKey) {
                return;
            }
            renderPriceTrendOverviewFromState();
        }, delay);
    }
}

function maybeScheduleVisiblePriceTrendFetch(): void {
    if (
        activeAnalyzeDate === null
        || resolvePriceTrendTabSectionTarget() === null
        || priceTrendUiState.status !== "idle"
    ) {
        return;
    }

    scheduleActivePriceTrendFromTab();
}

function scheduleCompetitorPriceOverviewPlacementRepair(): void {
    if (activeAnalyzeDate === null) {
        return;
    }

    for (const delay of [120, 300, 700, 1500]) {
        window.setTimeout(() => {
            if (activeAnalyzeDate === null) {
                return;
            }

            renderCompetitorPriceOverviewFromState();
            renderPriceTrendOverviewFromState();
            maybeScheduleVisiblePriceTrendFetch();
        }, delay);
    }
}

function syncPage(): void {
    const nextHref = window.location.href;
    const previousAnalyzeDate = activeAnalyzeDate;
    const selectedDate = getAnalyzeDate(window.location.pathname);
    const monthlyProgressRouteState = getMonthlyProgressRouteState(window.location.pathname);
    const previousMonthlyProgressYearMonth = activeMonthlyProgressYearMonth;
    const previousMonthlyProgressBatchDateKey = activeMonthlyProgressBatchDateKey;
    const pendingCompetitorPriceTabAnalysisDate = pendingCompetitorPriceTabSnapshotRequest?.analysisDate ?? null;
    const pendingPriceTrendTabAnalysisDate = pendingPriceTrendTabRequest?.analysisDate ?? null;
    const returnedToCalendarTop = previousAnalyzeDate !== null && selectedDate === null;

    activeAnalyzeDate = selectedDate;
    activeMonthlyProgressYearMonth = monthlyProgressRouteState?.yearMonth ?? null;
    activeMonthlyProgressBatchDateKey = monthlyProgressRouteState === null ? null : getCurrentBatchDateKey();

    if (monthlyProgressRouteState !== null) {
        handleMonthlyProgressRoute(
            nextHref,
            monthlyProgressRouteState,
            previousMonthlyProgressYearMonth,
            previousMonthlyProgressBatchDateKey,
            activeMonthlyProgressBatchDateKey
        );
        return;
    }

    cleanupMonthlyProgressPage();

    if (selectedDate !== null && (nextHref !== activeHref || selectedDate !== previousAnalyzeDate)) {
        salesSettingBookingCurveOpenState.clear();
        competitorPriceSnapshotUiState = createInitialCompetitorPriceSnapshotUiState();
        priceTrendUiState = createInitialPriceTrendUiState();
        if (pendingCompetitorPriceTabAnalysisDate !== selectedDate) {
            clearPendingCompetitorPriceTabSnapshotRequest();
        }
        if (pendingPriceTrendTabAnalysisDate !== selectedDate) {
            clearPendingPriceTrendTabRequest();
        }
        resetCompetitorPriceSnapshotBackgroundProgress();
        resetPriceTrendBackgroundQueue("対象宿泊日変更");
        cleanupCompetitorPriceOverview();
        cleanupPriceTrendOverview();
    }

    ensureCalendarObserver();
    queueCalendarSync({ reason: "sync-page" });

    if (selectedDate === null) {
        competitorPriceSnapshotUiState = createInitialCompetitorPriceSnapshotUiState();
        priceTrendUiState = createInitialPriceTrendUiState();
        clearPendingCompetitorPriceTabSnapshotRequest();
        clearPendingPriceTrendTabRequest();
        resetCompetitorPriceSnapshotBackgroundProgress();
        resetPriceTrendBackgroundQueue("対象画面外");
        cleanupCompetitorPriceOverview();
        cleanupPriceTrendOverview();
        renderSalesSettingWarmCacheIndicator();
        clearInteractionSyncTimeouts();
        clearConsistencyCheckTimeout();

        if (returnedToCalendarTop) {
            scheduleInteractionSync();
        }

        if (nextHref !== activeHref) {
            activeHref = nextHref;
            console.info(`[${SCRIPT_NAME}] non-analyze route`, {
                href: activeHref
            });
        }

        return;
    }

    if (nextHref === activeHref) {
        return;
    }

    activeHref = nextHref;
    scheduleConsistencyCheck("route");
    void logSelectedDateGroupRooms(selectedDate);
}

function handleMonthlyProgressRoute(
    nextHref: string,
    routeState: ReturnType<typeof getMonthlyProgressRouteState>,
    previousYearMonth: string | null,
    previousBatchDateKey: string | null,
    batchDateKey: string | null
): void {
    if (routeState === null) {
        return;
    }

    if (batchDateKey === null) {
        return;
    }

    suspendCalendarFeatures();

    if (nextHref === activeHref && routeState.yearMonth === previousYearMonth && batchDateKey === previousBatchDateKey) {
        return;
    }

    activeHref = nextHref;
    syncMonthlyProgressPage({
        scriptName: SCRIPT_NAME,
        href: nextHref,
        routeState,
        batchDateKey,
        resolveFacilityCacheKey: resolveCurrentFacilityCacheKey
    });
}

function suspendCalendarFeatures(): void {
    syncVersion += 1;
    clearInteractionSyncTimeouts();
    clearConsistencyCheckTimeout();
    cleanupCalendarObserver();
    mutationObserverSyncQueued = false;
    calendarSyncQueued = false;
    queuedCalendarSyncSignature = "";
    queuedCalendarSyncForce = false;
    pendingCalendarSyncSignature = "";
    pendingCalendarSyncForce = false;
    completedCalendarSyncSignature = "";
    salesSettingBookingCurveOpenState.clear();
    cleanupMonthlyCalendarGroupRooms();
    cleanupMonthlyCalendarLatestChanges();
    cleanupSalesSettingOverallSummary();
    cleanupSalesSettingRankOverview();
    cleanupCompetitorPriceOverview();
    cleanupPriceTrendOverview();
    cleanupSalesSettingRankDetails();
    cleanupSalesSettingGroupRooms();
    cleanupSalesSettingBookingCurveCards();
    cleanupSalesSettingRoomDeltas();
    cleanupSalesSettingWarmCacheMonthControls();
    cleanupCurrentUiSalesSettingRoot();
    ensureGroupRoomToggle(false);
}

function scheduleConsistencyCheck(reason: string): void {
    if (activeAnalyzeDate === null) {
        return;
    }

    const now = Date.now();
    if (
        (reason === "focus" || reason === "visibility")
        && now - consistencyCheckLastTriggeredAt < CONSISTENCY_CHECK_MIN_INTERVAL_MS
    ) {
        return;
    }

    consistencyCheckLastTriggeredAt = now;
    clearConsistencyCheckTimeout();
    consistencyCheckTimeoutId = window.setTimeout(() => {
        consistencyCheckTimeoutId = null;
        void verifyAnalyzePageConsistency(reason);
    }, CONSISTENCY_CHECK_DEBOUNCE_MS);
}

function clearConsistencyCheckTimeout(): void {
    if (consistencyCheckTimeoutId !== null) {
        window.clearTimeout(consistencyCheckTimeoutId);
        consistencyCheckTimeoutId = null;
    }
}

function isCalendarSyncDebugEnabled(): boolean {
    if (__DEV__) {
        return true;
    }

    try {
        return window.localStorage.getItem(CALENDAR_SYNC_DEBUG_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

async function verifyAnalyzePageConsistency(reason: string): Promise<void> {
    const analysisDate = activeAnalyzeDate;
    if (analysisDate === null) {
        return;
    }

    const batchDateKey = getCurrentBatchDateKey();
    const runVersion = ++consistencyCheckRunVersion;
    const isStale = (): boolean => {
        return runVersion !== consistencyCheckRunVersion
            || activeAnalyzeDate !== analysisDate;
    };

    const freshOverallData = await loadBookingCurve(analysisDate)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] consistency check skipped: failed to load overall booking curve`, {
                analysisDate,
                batchDateKey,
                reason,
                error
            });
            return null;
        });
    if (freshOverallData === null || isStale()) {
        return;
    }

    const cachedSelectedGroup = await fetchGroupRoomCount(analysisDate, analysisDate, batchDateKey);
    if (isStale()) {
        return;
    }

    const freshSelectedGroup = findBookingCurveCount(freshOverallData, analysisDate, "group");
    const freshCurrentOverallGroup = findBookingCurveCount(freshOverallData, batchDateKey, "group");
    const cachedCurrentOverallGroup = await fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group");
    if (isStale()) {
        return;
    }

    let shouldInvalidate = !isSameMetricValue(cachedSelectedGroup, freshSelectedGroup)
        || !isSameMetricValue(cachedCurrentOverallGroup, freshCurrentOverallGroup);

    const cards = collectSalesSettingCards();
    if (!shouldInvalidate && cards.length > 0) {
        const roomGroups = await getRoomGroups()
            .catch((error: unknown) => {
                console.warn(`[${SCRIPT_NAME}] consistency check skipped: failed to load room groups`, {
                    analysisDate,
                    batchDateKey,
                    reason,
                    error
                });
                return [] as RoomGroup[];
            });
        if (isStale()) {
            return;
        }

        const roomGroupIdByName = new Map(roomGroups.map((roomGroup) => [roomGroup.name, roomGroup.id]));
        const roomGroupChecks = await Promise.all(cards.map(async (card) => {
            const rmRoomGroupId = roomGroupIdByName.get(card.roomGroupName);
            if (rmRoomGroupId === undefined) {
                return {
                    roomGroupName: card.roomGroupName,
                    freshCurrentValue: null,
                    cachedCurrentValue: null
                };
            }

            const [freshData, cachedCurrentValue] = await Promise.all([
                loadBookingCurve(analysisDate, rmRoomGroupId),
                fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group", rmRoomGroupId)
            ]);
            const freshCurrentValue = findBookingCurveCount(freshData, batchDateKey, "group");

            return {
                roomGroupName: card.roomGroupName,
                freshCurrentValue,
                cachedCurrentValue
            };
        }));
        if (isStale()) {
            return;
        }

        shouldInvalidate = roomGroupChecks.some((check) => !isSameMetricValue(check.freshCurrentValue, check.cachedCurrentValue));
        if (!shouldInvalidate && freshCurrentOverallGroup !== null) {
            shouldInvalidate = roomGroupChecks.some((check) => {
                return check.freshCurrentValue !== null && check.freshCurrentValue > freshCurrentOverallGroup;
            });
        }
    }

    if (!shouldInvalidate) {
        return;
    }

    console.warn(`[${SCRIPT_NAME}] consistency check invalidated cache`, {
        analysisDate,
        batchDateKey,
        reason,
        cachedSelectedGroup,
        freshSelectedGroup,
        cachedCurrentOverallGroup,
        freshCurrentOverallGroup
    });
    invalidateGroupRoomCaches(batchDateKey);
    queueCalendarSync({ force: true, reason: "consistency-invalidate" });
}

function isSameMetricValue(left: number | null, right: number | null): boolean {
    return left === right;
}

function getAnalyzeDate(pathname: string): string | null {
    const match = ANALYZE_DATE_PATTERN.exec(pathname);
    if (match === null) {
        return null;
    }

    const [, year, month, day] = match;
    return `${year}${month}${day}`;
}

async function logSelectedDateGroupRooms(stayDate: string): Promise<void> {
    const batchDateKey = getCurrentBatchDateKey();
    const facilityCacheKey = await resolveCurrentFacilityCacheKey();
    syncCacheBatch(batchDateKey, facilityCacheKey);

    const groupRoomCount = await fetchGroupRoomCount(stayDate, stayDate, batchDateKey);

    if (groupRoomCount === null) {
        console.warn(`[${SCRIPT_NAME}] group room count not found`, {
            stayDate
        });
        return;
    }

    console.info(`[${SCRIPT_NAME}] selected-date group rooms`, {
        stayDate,
        groupRoomCount
    });
}

function fetchGroupRoomCount(stayDate: string, lookupDate: string, batchDateKey: string): Promise<number | null> {
    return fetchScopedBookingCurveCount(stayDate, lookupDate, batchDateKey, "group");
}

function fetchScopedBookingCurveCount(
    stayDate: string,
    lookupDate: string,
    batchDateKey: string,
    countScope: BookingCurveCountScope,
    rmRoomGroupId?: string
): Promise<number | null> {
    return resolveCurrentFacilityCacheKey().then((facilityCacheKey) => {
        const cacheKey = getGroupRoomResultCacheKey(
            facilityCacheKey,
            batchDateKey,
            stayDate,
            lookupDate,
            countScope,
            rmRoomGroupId
        );
        const cached = groupRoomCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const persisted = readPersistedGroupRoomCount(facilityCacheKey, cacheKey);
        if (persisted !== undefined) {
            const request = Promise.resolve(persisted);
            groupRoomCache.set(cacheKey, request);
            return request;
        }

        const request = getBookingCurve(stayDate, batchDateKey, rmRoomGroupId)
            .then((data) => findBookingCurveCount(data, lookupDate, countScope))
            .then((roomCount) => {
                writePersistedGroupRoomCount(facilityCacheKey, cacheKey, roomCount);
                return roomCount;
            })
            .catch((error: unknown) => {
                console.error(`[${SCRIPT_NAME}] failed to load booking curve`, {
                    countScope,
                    rmRoomGroupId,
                    stayDate,
                    lookupDate,
                    error
                });
                return null;
            });

        groupRoomCache.set(cacheKey, request);
        return request;
    });
}

function getGroupRoomScopeKey(rmRoomGroupId?: string): string {
    return rmRoomGroupId === undefined ? "hotel" : `room-group:${rmRoomGroupId}`;
}

function getBookingCurve(stayDate: string, batchDateKey: string, rmRoomGroupId?: string): Promise<BookingCurveResponse> {
    return resolveCurrentFacilityCacheKey().then((facilityCacheKey) => {
        const scopeKey = getGroupRoomScopeKey(rmRoomGroupId);
        const cacheKey = `${facilityCacheKey}:${batchDateKey}:${scopeKey}:${stayDate}`;
        const cached = bookingCurveCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const request = readOrLoadBookingCurveRawSource(facilityCacheKey, stayDate, batchDateKey, rmRoomGroupId)
            .catch((error: unknown) => {
                bookingCurveCache.delete(cacheKey);
                throw error;
            });

        bookingCurveCache.set(cacheKey, request);
        return request;
    });
}

async function readOrLoadBookingCurveRawSource(
    facilityCacheKey: string,
    stayDate: string,
    batchDateKey: string,
    rmRoomGroupId?: string
): Promise<BookingCurveResponse> {
    const result = await readOrLoadBookingCurveRawSourceWithStatus(
        facilityCacheKey,
        stayDate,
        batchDateKey,
        rmRoomGroupId
    );
    return result.response;
}

async function readOrLoadBookingCurveRawSourceWithStatus(
    facilityCacheKey: string,
    stayDate: string,
    batchDateKey: string,
    rmRoomGroupId?: string
): Promise<{ response: BookingCurveResponse; source: "stored" | "fetched" }> {
    const scope: CurveScope = rmRoomGroupId === undefined ? "hotel" : "roomGroup";
    const query = buildBookingCurveQuerySignature(stayDate, rmRoomGroupId);
    const rawSourceKey = buildBookingCurveRawSourceCacheKey({
        facilityId: facilityCacheKey,
        stayDate,
        asOfDate: batchDateKey,
        scope,
        ...(rmRoomGroupId === undefined ? {} : { roomGroupId: rmRoomGroupId }),
        endpoint: BOOKING_CURVE_ENDPOINT,
        query
    });

    const storedRawSource = await readBookingCurveRawSourceRecord(rawSourceKey)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read booking curve raw source`, {
                stayDate,
                batchDateKey,
                rmRoomGroupId,
                error
            });
            return undefined;
        });
    if (storedRawSource !== undefined) {
        return {
            response: storedRawSource.response as BookingCurveResponse,
            source: "stored"
        };
    }

    const response = await loadBookingCurve(stayDate, rmRoomGroupId);
    await writeBookingCurveRawSourceRecord(buildBookingCurveRawSourceRecord({
        facilityId: facilityCacheKey,
        stayDate,
        asOfDate: batchDateKey,
        scope,
        ...(rmRoomGroupId === undefined ? {} : { roomGroupId: rmRoomGroupId }),
        endpoint: BOOKING_CURVE_ENDPOINT,
        query
    }, response)).catch((error: unknown) => {
        console.warn(`[${SCRIPT_NAME}] failed to write booking curve raw source`, {
            stayDate,
            batchDateKey,
            rmRoomGroupId,
            error
        });
    });

    return {
        response,
        source: "fetched"
    };
}

function createInitialSalesSettingWarmCacheState(): SalesSettingWarmCacheState {
    return {
        runId: salesSettingWarmCacheRunSeq,
        status: "idle",
        facilityId: null,
        asOfDate: null,
        priorityStayDate: null,
        queue: [],
        dateProgress: {},
        targetFromDate: null,
        targetToDate: null,
        total: 0,
        processed: 0,
        fetched: 0,
        skipped: 0,
        errors: 0,
        consecutiveErrors: 0,
        currentTask: null,
        activeTasks: [],
        priorityMonth: null,
        startedAt: null,
        runElapsedMs: 0,
        cooldownUntil: null,
        lastFetchedAt: null,
        pauseReason: null,
        rankRecommendationPriorityTotal: 0,
        rankRecommendationPriorityProcessed: 0,
        rankRecommendationPriorityFetched: 0,
        rankRecommendationPrioritySkipped: 0,
        rankRecommendationPriorityErrors: 0
    };
}

function createInitialCompetitorPriceSnapshotUiState(): CompetitorPriceSnapshotUiState {
    return {
        status: "idle",
        facilityId: null,
        stayDate: null,
        source: null,
        records: [],
        latestRecord: null,
        previousRecord: null,
        reason: null,
        errorMessage: null,
        updatedAt: null
    };
}

function createInitialPriceTrendUiState(): PriceTrendUiState {
    return {
        status: "idle",
        facilityId: null,
        stayDate: null,
        records: [],
        reason: null,
        errorMessage: null,
        updatedAt: null
    };
}

function createInitialPriceTrendBackgroundQueueState(): PriceTrendBackgroundQueueState {
    return {
        status: "idle",
        facilityId: null,
        stayDate: null,
        total: 0,
        processed: 0,
        stored: 0,
        skipped: 0,
        errors: 0,
        consecutiveErrors: 0,
        currentScope: null,
        pauseReason: null
    };
}

function createInitialCompetitorPriceSnapshotBackgroundProgress(): CompetitorPriceSnapshotBackgroundProgress {
    return {
        status: "idle",
        total: 0,
        processed: 0,
        currentTask: null,
        targetFromDate: null,
        targetToDate: null,
        pauseReason: null
    };
}

function resetCompetitorPriceSnapshotBackgroundProgress(): void {
    if (competitorPriceSnapshotBackgroundTimeoutId !== null) {
        window.clearTimeout(competitorPriceSnapshotBackgroundTimeoutId);
        competitorPriceSnapshotBackgroundTimeoutId = null;
    }
    competitorPriceSnapshotBackgroundQueue.length = 0;
    competitorPriceSnapshotBackgroundTaskKeys.clear();
    competitorPriceSnapshotBackgroundProgress = createInitialCompetitorPriceSnapshotBackgroundProgress();
}

function scheduleSalesSettingWarmCache(
    startDate: string,
    batchDateKey: string,
    facilityCacheKey: string,
    priorityStayDate: string | null,
    priorityMonth: string | null = salesSettingWarmCacheState.priorityMonth
): void {
    if (!hasSalesSettingWarmCacheEligiblePage()) {
        renderSalesSettingWarmCacheIndicator();
        return;
    }

    const sameContext = salesSettingWarmCacheState.facilityId === facilityCacheKey
        && salesSettingWarmCacheState.asOfDate === batchDateKey
        && salesSettingWarmCacheState.priorityStayDate === priorityStayDate
        && salesSettingWarmCacheState.priorityMonth === priorityMonth;
    if (sameContext && (salesSettingWarmCacheState.total > 0 || salesSettingWarmCacheState.status === "building")) {
        const prioritizedQueue = prioritizeSalesSettingWarmCacheQueueForRankRecommendations(salesSettingWarmCacheState.queue);
        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            queue: prioritizedQueue,
            rankRecommendationPriorityTotal: Math.max(
                salesSettingWarmCacheState.rankRecommendationPriorityTotal,
                salesSettingWarmCacheState.rankRecommendationPriorityProcessed + countRankRecommendationWarmCachePriorityTasks(prioritizedQueue)
            )
        };
        renderSalesSettingWarmCacheIndicator();
        if (canResumeSalesSettingWarmCache()) {
            scheduleSalesSettingWarmCacheDrain(0);
        }
        return;
    }

    salesSettingWarmCacheState = {
        ...createInitialSalesSettingWarmCacheState(),
        runId: ++salesSettingWarmCacheRunSeq,
        status: "building",
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey,
        priorityStayDate,
        priorityMonth,
        targetFromDate: null,
        targetToDate: null
    };
    renderSalesSettingWarmCacheIndicator();

    void buildSalesSettingWarmCacheQueue(startDate, priorityStayDate, priorityMonth)
        .then((queue) => {
            if (
                salesSettingWarmCacheState.facilityId !== facilityCacheKey
                || salesSettingWarmCacheState.asOfDate !== batchDateKey
            ) {
                return;
            }

            salesSettingWarmCacheState = {
                ...salesSettingWarmCacheState,
                status: queue.length === 0 ? "complete" : "idle",
                queue,
                dateProgress: buildSalesSettingWarmCacheDateProgress(queue),
                ...getSalesSettingWarmCacheTargetBounds(queue, startDate),
                total: queue.length,
                rankRecommendationPriorityTotal: countRankRecommendationWarmCachePriorityTasks(queue),
                rankRecommendationPriorityProcessed: 0,
                rankRecommendationPriorityFetched: 0,
                rankRecommendationPrioritySkipped: 0,
                rankRecommendationPriorityErrors: 0,
                pauseReason: null
            };
            renderSalesSettingWarmCacheIndicator();
            scheduleSalesSettingWarmCacheDrain(0);
        })
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to build sales-setting warm cache queue`, {
                startDate,
                batchDateKey,
                error
            });
            salesSettingWarmCacheState = {
                ...salesSettingWarmCacheState,
                status: "error",
                errors: salesSettingWarmCacheState.errors + 1,
                pauseReason: "queue作成失敗"
            };
            renderSalesSettingWarmCacheIndicator();
        });
}

async function buildSalesSettingWarmCacheQueue(
    startDate: string,
    priorityStayDate: string | null,
    priorityMonth: string | null
): Promise<SalesSettingWarmCacheTask[]> {
    const roomGroups = await getRoomGroups();
    const tasks: SalesSettingWarmCacheTask[] = [];
    const taskKeys = new Set<string>();
    const targetStayDates = buildSalesSettingWarmCacheTargetStayDates(startDate, priorityStayDate, priorityMonth);

    for (const targetStayDate of targetStayDates) {
        const scopeTasks = buildSalesSettingWarmCacheScopeTasks(targetStayDate, roomGroups);
        for (const scopeTask of scopeTasks) {
            addSalesSettingWarmCacheTask(tasks, taskKeys, {
                ...scopeTask,
                kind: "currentRaw",
                progressKind: "raw",
                targetStayDate,
                stayDate: targetStayDate
            });
        }

        for (const { stayDate } of getSalesSettingSameWeekdayStayDates(targetStayDate)) {
            for (const scopeTask of scopeTasks) {
                addSalesSettingWarmCacheTask(tasks, taskKeys, {
                    ...scopeTask,
                    kind: "sameWeekdayRaw",
                    progressKind: "sameWeekday",
                    targetStayDate,
                    stayDate
                });
            }
        }

        for (const scopeTask of scopeTasks) {
            for (const segment of SALES_SETTING_WARM_CACHE_REFERENCE_SEGMENTS) {
                for (const curveKind of SALES_SETTING_WARM_CACHE_REFERENCE_KINDS) {
                    addSalesSettingWarmCacheTask(tasks, taskKeys, {
                        ...scopeTask,
                        kind: "referenceCurve",
                        progressKind: "reference",
                        targetStayDate,
                        stayDate: targetStayDate,
                        segment,
                        curveKind
                    });
                }
            }
        }
    }

    return prioritizeSalesSettingWarmCacheQueueForRankRecommendations(tasks);
}

const SALES_SETTING_WARM_CACHE_REFERENCE_SEGMENTS = ["all", "transient", "group"] as const satisfies readonly CurveSegment[];
const SALES_SETTING_WARM_CACHE_REFERENCE_KINDS = ["recent_weighted_90", "seasonal_component"] as const satisfies readonly ReferenceCurveKind[];

function buildSalesSettingWarmCacheScopeTasks(targetStayDate: string, roomGroups: RoomGroup[]): Array<Pick<SalesSettingWarmCacheTask, "targetStayDate" | "stayDate" | "scope" | "roomGroupId" | "roomGroupName">> {
    return [
        {
            targetStayDate,
            stayDate: targetStayDate,
            scope: "hotel"
        },
        ...roomGroups.map((roomGroup) => ({
            targetStayDate,
            stayDate: targetStayDate,
            scope: "roomGroup" as const,
            roomGroupId: roomGroup.id,
            roomGroupName: roomGroup.name
        }))
    ];
}

function addSalesSettingWarmCacheTask(tasks: SalesSettingWarmCacheTask[], taskKeys: Set<string>, task: SalesSettingWarmCacheTask): void {
    const taskKey = buildSalesSettingWarmCacheTaskKey(task);
    if (taskKeys.has(taskKey)) {
        return;
    }

    taskKeys.add(taskKey);
    tasks.push(task);
}

function rememberRankRecommendationWarmCachePriorityCandidates(candidates: RankRecommendationCandidate[]): void {
    const seen = new Set<string>();
    const priorityCandidates: RankRecommendationWarmCachePriorityCandidate[] = [];
    for (const candidate of candidates) {
        const taskKey = buildRankRecommendationWarmCachePriorityTaskKey(candidate.stayDate, candidate.roomGroupId);
        if (seen.has(taskKey)) {
            continue;
        }

        seen.add(taskKey);
        priorityCandidates.push({
            stayDate: candidate.stayDate,
            roomGroupId: candidate.roomGroupId
        });
    }
    rankRecommendationWarmCachePriorityCandidates = priorityCandidates;
}

function clearRankRecommendationWarmCachePriorityCandidates(): void {
    rankRecommendationWarmCachePriorityCandidates = [];
}

function prioritizeSalesSettingWarmCacheQueueForRankRecommendations(tasks: SalesSettingWarmCacheTask[]): SalesSettingWarmCacheTask[] {
    if (rankRecommendationWarmCachePriorityCandidates.length === 0 || tasks.length <= 1) {
        return tasks;
    }

    const priorityOrderByTaskKey = new Map(rankRecommendationWarmCachePriorityCandidates.map((candidate, index) => [
        buildRankRecommendationWarmCachePriorityTaskKey(candidate.stayDate, candidate.roomGroupId),
        index
    ]));
    return tasks
        .map((task, index) => ({ task, index }))
        .sort((left, right) => {
            const leftOrder = priorityOrderByTaskKey.get(buildSalesSettingWarmCacheTaskKey(left.task)) ?? Number.POSITIVE_INFINITY;
            const rightOrder = priorityOrderByTaskKey.get(buildSalesSettingWarmCacheTaskKey(right.task)) ?? Number.POSITIVE_INFINITY;
            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }

            return left.index - right.index;
        })
        .map(({ task }) => task);
}

function buildRankRecommendationWarmCachePriorityTaskKey(stayDate: string, roomGroupId: string): string {
    return [
        "currentRaw",
        "raw",
        `target:${stayDate}`,
        `stay:${stayDate}`,
        "scope:roomGroup",
        `roomGroup:${roomGroupId}`,
        "segment:-",
        "curve:-"
    ].join("|");
}

function isRankRecommendationWarmCachePriorityTask(task: SalesSettingWarmCacheTask): boolean {
    return task.kind === "currentRaw"
        && task.scope === "roomGroup"
        && task.roomGroupId !== undefined
        && rankRecommendationWarmCachePriorityCandidates.some((candidate) => (
            candidate.stayDate === task.stayDate
            && candidate.roomGroupId === task.roomGroupId
        ));
}

function countRankRecommendationWarmCachePriorityTasks(tasks: readonly SalesSettingWarmCacheTask[]): number {
    return tasks.filter(isRankRecommendationWarmCachePriorityTask).length;
}

function markRankRecommendationWarmCachePriorityTask(task: SalesSettingWarmCacheTask, result: "fetched" | "skipped" | "error"): void {
    if (!isRankRecommendationWarmCachePriorityTask(task)) {
        return;
    }

    salesSettingWarmCacheState = {
        ...salesSettingWarmCacheState,
        rankRecommendationPriorityProcessed: Math.min(
            salesSettingWarmCacheState.rankRecommendationPriorityTotal,
            salesSettingWarmCacheState.rankRecommendationPriorityProcessed + 1
        ),
        rankRecommendationPriorityFetched: salesSettingWarmCacheState.rankRecommendationPriorityFetched + (result === "fetched" ? 1 : 0),
        rankRecommendationPrioritySkipped: salesSettingWarmCacheState.rankRecommendationPrioritySkipped + (result === "skipped" ? 1 : 0),
        rankRecommendationPriorityErrors: salesSettingWarmCacheState.rankRecommendationPriorityErrors + (result === "error" ? 1 : 0)
    };
}

function buildSalesSettingWarmCacheTaskKey(task: SalesSettingWarmCacheTask): string {
    return [
        task.kind,
        task.progressKind,
        `target:${task.targetStayDate}`,
        `stay:${task.stayDate}`,
        `scope:${task.scope}`,
        `roomGroup:${task.roomGroupId ?? "-"}`,
        `segment:${task.segment ?? "-"}`,
        `curve:${task.curveKind ?? "-"}`
    ].join("|");
}

function buildSalesSettingWarmCacheTargetStayDates(
    startDate: string,
    priorityStayDate: string | null,
    priorityMonth: string | null
): string[] {
    const targetStayDates: string[] = [];
    const seen = new Set<string>();
    const addDate = (stayDate: string | null): void => {
        const compactStayDate = stayDate === null ? null : toCompactDateKey(stayDate);
        if (compactStayDate === null || seen.has(compactStayDate)) {
            return;
        }
        seen.add(compactStayDate);
        targetStayDates.push(compactStayDate);
    };

    if (priorityStayDate !== null) {
        addDate(priorityStayDate);
        for (const stayDate of getSalesSettingWarmCacheWeekStayDates(priorityStayDate)) {
            addDate(stayDate);
        }
        for (const stayDate of getSalesSettingWarmCacheMonthStayDates(priorityStayDate)) {
            addDate(stayDate);
        }
    }

    if (priorityMonth !== null) {
        for (const stayDate of getSalesSettingWarmCacheMonthStayDates(`${priorityMonth}01`)) {
            addDate(stayDate);
        }
    }

    for (const stayDate of getSalesSettingWarmCacheDefaultStayDates(startDate)) {
        addDate(stayDate);
    }

    return targetStayDates;
}

function getSalesSettingWarmCacheDefaultStayDates(startDate: string): string[] {
    const compactStartDate = toCompactDateKey(startDate);
    if (compactStartDate === null) {
        return [];
    }

    const fromDate = shiftDate(compactStartDate, -SALES_SETTING_WARM_CACHE_LOOKBACK_DAYS);
    const toDate = shiftMonth(compactStartDate, SALES_SETTING_WARM_CACHE_LOOKAHEAD_MONTHS);
    if (fromDate === null || toDate === null) {
        return [];
    }

    const dates: string[] = [];
    for (let stayDate: string | null = fromDate; stayDate !== null && stayDate <= toDate; stayDate = shiftDate(stayDate, 1)) {
        dates.push(stayDate);
    }

    return dates;
}

function getSalesSettingWarmCacheWeekStayDates(stayDate: string): string[] {
    const normalizedDate = normalizeDateKey(stayDate);
    if (normalizedDate === null) {
        return [];
    }

    const weekday = getUtcWeekday(normalizedDate);
    if (weekday === null) {
        return [];
    }

    return Array.from({ length: 7 }, (_, index) => shiftDate(normalizedDate, index - weekday));
}

function getSalesSettingWarmCacheMonthStayDates(stayDate: string): string[] {
    const compactDate = toCompactDateKey(stayDate);
    if (compactDate === null) {
        return [];
    }

    const year = Number(compactDate.slice(0, 4));
    const month = Number(compactDate.slice(4, 6));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: lastDay }, (_, index) => `${compactDate.slice(0, 6)}${String(index + 1).padStart(2, "0")}`);
}

function buildSalesSettingWarmCacheDateProgress(tasks: SalesSettingWarmCacheTask[]): Record<string, SalesSettingWarmCacheDateProgress> {
    return tasks.reduce<Record<string, SalesSettingWarmCacheDateProgress>>((progressByDate, task) => {
        const progress = progressByDate[task.targetStayDate] ?? createEmptySalesSettingWarmCacheDateProgress();
        progressByDate[task.targetStayDate] = {
            ...progress,
            ...(task.progressKind === "raw" ? { rawTotal: progress.rawTotal + 1 } : {}),
            ...(task.progressKind === "reference" ? { referenceTotal: progress.referenceTotal + 1 } : {}),
            ...(task.progressKind === "sameWeekday" ? { sameWeekdayTotal: progress.sameWeekdayTotal + 1 } : {})
        };
        return progressByDate;
    }, {});
}

function getSalesSettingWarmCacheTargetBounds(tasks: SalesSettingWarmCacheTask[], fallbackStartDate: string): Pick<SalesSettingWarmCacheState, "targetFromDate" | "targetToDate"> {
    const targetStayDates = Array.from(new Set(tasks.flatMap((task) => {
        const compactStayDate = toCompactDateKey(task.targetStayDate);
        return compactStayDate === null ? [] : [compactStayDate];
    }))).sort();
    const fallbackCompactStartDate = toCompactDateKey(fallbackStartDate);
    return {
        targetFromDate: targetStayDates[0] ?? fallbackCompactStartDate,
        targetToDate: targetStayDates[targetStayDates.length - 1] ?? (fallbackCompactStartDate === null
            ? null
            : getSalesSettingWarmCacheDefaultStayDates(fallbackCompactStartDate).at(-1) ?? fallbackCompactStartDate)
    };
}

function createEmptySalesSettingWarmCacheDateProgress(): SalesSettingWarmCacheDateProgress {
    return {
        rawTotal: 0,
        rawDone: 0,
        referenceTotal: 0,
        referenceDone: 0,
        sameWeekdayTotal: 0,
        sameWeekdayDone: 0,
        errors: 0
    };
}

function markSalesSettingWarmCacheDateProgress(task: SalesSettingWarmCacheTask, hasError: boolean): void {
    const currentProgress = salesSettingWarmCacheState.dateProgress[task.targetStayDate];
    if (currentProgress === undefined) {
        return;
    }

    const doneDelta = hasError ? 0 : 1;
    salesSettingWarmCacheState = {
        ...salesSettingWarmCacheState,
        dateProgress: {
            ...salesSettingWarmCacheState.dateProgress,
            [task.targetStayDate]: {
                ...currentProgress,
                ...(task.progressKind === "raw" ? { rawDone: Math.min(currentProgress.rawTotal, currentProgress.rawDone + doneDelta) } : {}),
                ...(task.progressKind === "reference" ? { referenceDone: Math.min(currentProgress.referenceTotal, currentProgress.referenceDone + doneDelta) } : {}),
                ...(task.progressKind === "sameWeekday" ? { sameWeekdayDone: Math.min(currentProgress.sameWeekdayTotal, currentProgress.sameWeekdayDone + doneDelta) } : {}),
                errors: currentProgress.errors + (hasError ? 1 : 0)
            }
        }
    };
}

function canResumeSalesSettingWarmCache(): boolean {
    return salesSettingWarmCacheState.status === "idle"
        || salesSettingWarmCacheState.status === "running"
        || salesSettingWarmCacheState.status === "paused"
        || salesSettingWarmCacheState.status === "cooldown";
}

function isSalesSettingWarmCacheHiddenTabAllowed(): boolean {
    try {
        return window.localStorage.getItem(SALES_SETTING_WARM_CACHE_ALLOW_HIDDEN_TAB_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function setSalesSettingWarmCacheHiddenTabAllowed(allowed: boolean): void {
    try {
        window.localStorage.setItem(SALES_SETTING_WARM_CACHE_ALLOW_HIDDEN_TAB_STORAGE_KEY, allowed ? "1" : "0");
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to persist warm cache hidden-tab setting`, { error });
    }
}

function shouldPauseSalesSettingWarmCacheForHiddenTab(): boolean {
    return document.visibilityState === "hidden" && !isSalesSettingWarmCacheHiddenTabAllowed();
}

function scheduleSalesSettingWarmCacheDrain(delayMs = SALES_SETTING_WARM_CACHE_REQUEST_INTERVAL_MS): void {
    if (salesSettingWarmCacheTimeoutId !== null) {
        return;
    }

    salesSettingWarmCacheTimeoutId = window.setTimeout(() => {
        salesSettingWarmCacheTimeoutId = null;
        void drainSalesSettingWarmCacheQueue();
    }, delayMs);
}

async function drainSalesSettingWarmCacheQueue(): Promise<void> {
    const facilityId = salesSettingWarmCacheState.facilityId;
    const asOfDate = salesSettingWarmCacheState.asOfDate;
    if (facilityId === null || asOfDate === null) {
        return;
    }

    if (shouldPauseSalesSettingWarmCacheForHiddenTab()) {
        pauseSalesSettingWarmCache("タブ非表示");
        return;
    }

    const cooldownUntil = salesSettingWarmCacheState.cooldownUntil;
    const now = Date.now();
    if (cooldownUntil !== null && cooldownUntil > now) {
        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            status: "cooldown",
            pauseReason: salesSettingWarmCacheState.pauseReason ?? "今回上限到達"
        };
        renderSalesSettingWarmCacheIndicator();
        scheduleSalesSettingWarmCacheDrain(cooldownUntil - now);
        return;
    }

    if (cooldownUntil !== null) {
        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            status: "idle",
            cooldownUntil: null,
            pauseReason: null
        };
    }

    if (getActiveSalesSettingWarmCacheRunElapsedMs() >= SALES_SETTING_WARM_CACHE_RUN_LIMIT_MS) {
        startSalesSettingWarmCacheCooldown("今回上限到達");
        return;
    }

    if (salesSettingWarmCacheState.queue.length === 0 && salesSettingWarmCacheState.activeTasks.length === 0) {
        finalizeSalesSettingWarmCacheRun("complete", null);
        return;
    }

    if (salesSettingWarmCacheState.startedAt === null) {
        salesSettingWarmCacheState.startedAt = Date.now();
    }

    let startedWorkerCount = 0;
    while (
        salesSettingWarmCacheState.queue.length > 0
        && salesSettingWarmCacheState.activeTasks.length < SALES_SETTING_WARM_CACHE_WORKER_COUNT
    ) {
        const task = salesSettingWarmCacheState.queue.shift();
        if (task === undefined) {
            break;
        }

        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            status: "running",
            currentTask: task,
            activeTasks: [...salesSettingWarmCacheState.activeTasks, task],
            pauseReason: null
        };
        startedWorkerCount += 1;
        void runSalesSettingWarmCacheWorker(task, facilityId, asOfDate, salesSettingWarmCacheState.runId);
    }

    renderSalesSettingWarmCacheIndicator();

    if (startedWorkerCount === 0 && salesSettingWarmCacheState.activeTasks.length === 0) {
        scheduleSalesSettingWarmCacheDrain();
    }
}

async function runSalesSettingWarmCacheWorker(
    task: SalesSettingWarmCacheTask,
    facilityId: string,
    asOfDate: string,
    runId: number
): Promise<void> {
    try {
        const taskResult = await runSalesSettingWarmCacheTask(task, facilityId, asOfDate);
        if (!isCurrentSalesSettingWarmCacheContext(facilityId, asOfDate, runId)) {
            return;
        }
        markSalesSettingWarmCacheDateProgress(task, false);
        markRankRecommendationWarmCachePriorityTask(task, taskResult);
        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            processed: salesSettingWarmCacheState.processed + 1,
            fetched: salesSettingWarmCacheState.fetched + (taskResult === "fetched" ? 1 : 0),
            skipped: salesSettingWarmCacheState.skipped + (taskResult === "skipped" ? 1 : 0),
            consecutiveErrors: 0,
            activeTasks: removeSalesSettingWarmCacheActiveTask(salesSettingWarmCacheState.activeTasks, task),
            currentTask: getNextSalesSettingWarmCacheCurrentTaskAfterCompletion(task),
            ...(taskResult === "fetched" ? { lastFetchedAt: new Date().toISOString() } : {})
        };
        if (taskResult === "fetched" && isRankRecommendationWarmCachePriorityTask(task)) {
            queueDebouncedRankRecommendationWarmCacheSync();
        }
    } catch (error: unknown) {
        if (!isCurrentSalesSettingWarmCacheContext(facilityId, asOfDate, runId)) {
            return;
        }
        console.warn(`[${SCRIPT_NAME}] failed to warm booking curve raw source`, {
            task,
            error
        });
        const failureAction = getSalesSettingWarmCacheFailureAction(error);
        if (failureAction.kind === "pause") {
            markSalesSettingWarmCacheDateProgress(task, true);
            markRankRecommendationWarmCachePriorityTask(task, "error");
            salesSettingWarmCacheState = {
                ...salesSettingWarmCacheState,
                processed: salesSettingWarmCacheState.processed + 1,
                errors: salesSettingWarmCacheState.errors + 1,
                consecutiveErrors: salesSettingWarmCacheState.consecutiveErrors + 1,
                activeTasks: removeSalesSettingWarmCacheActiveTask(salesSettingWarmCacheState.activeTasks, task),
                currentTask: getNextSalesSettingWarmCacheCurrentTaskAfterCompletion(task)
            };
            pauseSalesSettingWarmCache(failureAction.reason, "error");
            return;
        }

        if (failureAction.kind === "cooldown") {
            const retryTask = buildSalesSettingWarmCacheRetryTask(task);
            if (retryTask !== null) {
                salesSettingWarmCacheState.queue.unshift(retryTask);
            } else {
                markSalesSettingWarmCacheDateProgress(task, true);
                markRankRecommendationWarmCachePriorityTask(task, "error");
            }
            salesSettingWarmCacheState = {
                ...salesSettingWarmCacheState,
                processed: salesSettingWarmCacheState.processed + 1,
                errors: salesSettingWarmCacheState.errors + 1,
                consecutiveErrors: salesSettingWarmCacheState.consecutiveErrors + 1,
                activeTasks: removeSalesSettingWarmCacheActiveTask(salesSettingWarmCacheState.activeTasks, task),
                currentTask: getNextSalesSettingWarmCacheCurrentTaskAfterCompletion(task)
            };
            startSalesSettingWarmCacheCooldown(failureAction.reason);
            return;
        }

        const retryTask = buildSalesSettingWarmCacheRetryTask(task);
        if (retryTask !== null) {
            salesSettingWarmCacheState.queue.push(retryTask);
        } else {
            markSalesSettingWarmCacheDateProgress(task, true);
            markRankRecommendationWarmCachePriorityTask(task, "error");
        }
        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            processed: salesSettingWarmCacheState.processed + 1,
            errors: salesSettingWarmCacheState.errors + 1,
            consecutiveErrors: salesSettingWarmCacheState.consecutiveErrors + 1,
            activeTasks: removeSalesSettingWarmCacheActiveTask(salesSettingWarmCacheState.activeTasks, task),
            currentTask: getNextSalesSettingWarmCacheCurrentTaskAfterCompletion(task)
        };

        if (salesSettingWarmCacheState.consecutiveErrors >= SALES_SETTING_WARM_CACHE_MAX_CONSECUTIVE_ERRORS) {
            pauseSalesSettingWarmCache("連続エラー", "error");
            return;
        }
    }

    renderSalesSettingWarmCacheIndicator();
    scheduleSalesSettingWarmCacheDrain(0);
}

function getSalesSettingWarmCacheFailureAction(error: unknown): { kind: "retry"; reason: string } | { kind: "pause"; reason: string } | { kind: "cooldown"; reason: string } {
    if (error instanceof RevenueAssistantRequestError) {
        if (error.status === 401) {
            return { kind: "pause", reason: "HTTP 401 ログイン確認" };
        }
        if (error.status === 403) {
            return { kind: "pause", reason: "HTTP 403 権限確認" };
        }
        if (error.status === 429) {
            return { kind: "cooldown", reason: "HTTP 429 待機" };
        }
        if (error.status >= 500) {
            return { kind: "retry", reason: `HTTP ${error.status}` };
        }
        return { kind: "pause", reason: `HTTP ${error.status}` };
    }

    return { kind: "retry", reason: "network error" };
}

function isCurrentSalesSettingWarmCacheContext(facilityId: string, asOfDate: string, runId: number): boolean {
    return salesSettingWarmCacheState.facilityId === facilityId
        && salesSettingWarmCacheState.asOfDate === asOfDate
        && salesSettingWarmCacheState.runId === runId;
}

function removeSalesSettingWarmCacheActiveTask(
    activeTasks: SalesSettingWarmCacheTask[],
    completedTask: SalesSettingWarmCacheTask
): SalesSettingWarmCacheTask[] {
    const completedTaskKey = buildSalesSettingWarmCacheTaskKey(completedTask);
    let removed = false;
    return activeTasks.filter((activeTask) => {
        if (!removed && buildSalesSettingWarmCacheTaskKey(activeTask) === completedTaskKey) {
            removed = true;
            return false;
        }
        return true;
    });
}

function getNextSalesSettingWarmCacheCurrentTaskAfterCompletion(completedTask: SalesSettingWarmCacheTask): SalesSettingWarmCacheTask | null {
    const remainingActiveTasks = removeSalesSettingWarmCacheActiveTask(salesSettingWarmCacheState.activeTasks, completedTask);
    return remainingActiveTasks[0] ?? null;
}

function queueDebouncedRankRecommendationWarmCacheSync(): void {
    if (rankRecommendationWarmCacheSyncTimeoutId !== null) {
        return;
    }

    rankRecommendationWarmCacheSyncTimeoutId = window.setTimeout(() => {
        rankRecommendationWarmCacheSyncTimeoutId = null;
        queueCalendarSync({ force: true, reason: "rank-recommendation-warm-cache" });
    }, 500);
}

function buildSalesSettingWarmCacheRetryTask(task: SalesSettingWarmCacheTask): SalesSettingWarmCacheTask | null {
    const retryCount = task.retryCount ?? 0;
    if (retryCount >= SALES_SETTING_WARM_CACHE_MAX_RETRY_COUNT) {
        return null;
    }

    return {
        ...task,
        retryCount: retryCount + 1
    };
}

async function runSalesSettingWarmCacheTask(
    task: SalesSettingWarmCacheTask,
    facilityId: string,
    asOfDate: string
): Promise<"fetched" | "skipped"> {
    if (task.kind === "referenceCurve") {
        if (task.segment === undefined || task.curveKind === undefined) {
            throw new Error("reference warm cache task is missing segment or curveKind");
        }

        const result = await loadSalesSettingReferenceCurveResult(
            task.targetStayDate,
            asOfDate,
            task.segment,
            task.curveKind,
            task.roomGroupId
        );
        if (result === null) {
            throw new Error("reference curve warm cache task returned no result");
        }
        return "fetched";
    }

    const result = await readOrLoadBookingCurveRawSourceWithStatus(
        facilityId,
        task.stayDate,
        asOfDate,
        task.roomGroupId
    );
    return result.source === "stored" ? "skipped" : "fetched";
}

function pauseSalesSettingWarmCache(reason: string, status: SalesSettingWarmCacheStatus = "paused"): void {
    finalizeSalesSettingWarmCacheRun(status, reason);
}

function startSalesSettingWarmCacheCooldown(reason: string): void {
    const cooldownUntil = Date.now() + SALES_SETTING_WARM_CACHE_COOLDOWN_MS;
    finalizeSalesSettingWarmCacheRun("cooldown", reason);
    salesSettingWarmCacheState = {
        ...salesSettingWarmCacheState,
        cooldownUntil
    };
    renderSalesSettingWarmCacheIndicator();
    scheduleSalesSettingWarmCacheDrain(SALES_SETTING_WARM_CACHE_COOLDOWN_MS);
}

function resetSalesSettingWarmCache(reason: string): void {
    if (salesSettingWarmCacheTimeoutId !== null) {
        window.clearTimeout(salesSettingWarmCacheTimeoutId);
        salesSettingWarmCacheTimeoutId = null;
    }
    salesSettingWarmCacheRunSeq += 1;
    finalizeSalesSettingWarmCacheRun("idle", reason);
    salesSettingWarmCacheState = createInitialSalesSettingWarmCacheState();
    renderSalesSettingWarmCacheIndicator();
}

function finalizeSalesSettingWarmCacheRun(status: SalesSettingWarmCacheStatus, pauseReason: string | null): void {
    const elapsedMs = getActiveSalesSettingWarmCacheRunElapsedMs();
    salesSettingWarmCacheState = {
        ...salesSettingWarmCacheState,
        runId: ++salesSettingWarmCacheRunSeq,
        status,
        startedAt: null,
        runElapsedMs: salesSettingWarmCacheState.runElapsedMs + elapsedMs,
        currentTask: null,
        activeTasks: [],
        pauseReason
    };
    renderSalesSettingWarmCacheIndicator();
}

function getActiveSalesSettingWarmCacheRunElapsedMs(): number {
    return salesSettingWarmCacheState.startedAt === null ? 0 : Date.now() - salesSettingWarmCacheState.startedAt;
}

function renderSalesSettingWarmCacheIndicator(): void {
    ensureGroupRoomStyles();
    document.querySelectorAll<HTMLElement>("[data-ra-sales-setting-warm-cache-indicator]").forEach((element) => {
        element.remove();
    });
    renderSalesSettingWarmCacheInlineStatus();
    renderSalesSettingWarmCacheCalendarMarkers();
    renderSalesSettingWarmCacheMonthControls(collectMonthlyCalendarCells());
}

function renderSalesSettingWarmCacheInlineStatus(): void {
    const existingElement = document.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_INLINE_STATUS_ATTRIBUTE}]`);
    if (!shouldShowSalesSettingWarmCacheInlineStatus()) {
        existingElement?.remove();
        return;
    }

    const host = resolveSalesSettingWarmCacheInlineStatusHost();
    if (host === null) {
        existingElement?.remove();
        return;
    }

    const statusElement = existingElement ?? document.createElement("div");
    statusElement.setAttribute(SALES_SETTING_WARM_CACHE_INLINE_STATUS_ATTRIBUTE, "");
    statusElement.textContent = [
        getSalesSettingWarmCacheStatusLabel(),
        getSalesSettingWarmCacheDetailLabel()
    ].filter((part) => part !== "").join(" / ");

    if (statusElement.parentElement !== host.parentElement || statusElement.previousElementSibling !== host.insertAfterElement) {
        statusElement.remove();
        host.parentElement.insertBefore(statusElement, host.insertAfterElement.nextSibling);
    }
}

function shouldShowSalesSettingWarmCacheInlineStatus(): boolean {
    return salesSettingWarmCacheState.status !== "idle"
        || salesSettingWarmCacheState.total > 0
        || competitorPriceSnapshotUiState.status !== "idle"
        || competitorPriceSnapshotBackgroundProgress.status !== "idle";
}

function resolveSalesSettingWarmCacheInlineStatusHost(): { parentElement: HTMLElement; insertAfterElement: HTMLElement } | null {
    const analyzeListElement = document.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}]`);
    const analyzeListParent = analyzeListElement?.parentElement ?? null;
    if (activeAnalyzeDate !== null && analyzeListElement instanceof HTMLElement && analyzeListParent instanceof HTMLElement) {
        return { parentElement: analyzeListParent, insertAfterElement: analyzeListElement };
    }

    const overallSummaryElement = document.querySelector<HTMLElement>(`[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`);
    const overallSummaryParent = overallSummaryElement?.parentElement ?? null;
    if (activeAnalyzeDate !== null && overallSummaryElement instanceof HTMLElement && overallSummaryParent instanceof HTMLElement) {
        return { parentElement: overallSummaryParent, insertAfterElement: overallSummaryElement };
    }

    const rankRecommendationElement = document.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_LIST_ATTRIBUTE}]`);
    const rankRecommendationParent = rankRecommendationElement?.parentElement ?? null;
    if (rankRecommendationElement instanceof HTMLElement && rankRecommendationParent instanceof HTMLElement) {
        return { parentElement: rankRecommendationParent, insertAfterElement: rankRecommendationElement };
    }

    const currentUiRootElement = document.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`);
    const currentUiRootParent = currentUiRootElement?.parentElement ?? null;
    if (activeAnalyzeDate !== null && currentUiRootElement instanceof HTMLElement && currentUiRootParent instanceof HTMLElement) {
        return { parentElement: currentUiRootParent, insertAfterElement: currentUiRootElement };
    }

    return null;
}

function getSalesSettingWarmCacheStatusLabel(): string {
    const dayProgress = getSalesSettingWarmCacheDayProgressSummary();
    const progressText = dayProgress.partial > 0
        ? `${dayProgress.completed} / ${dayProgress.total}日・進行 ${dayProgress.partial}日`
        : `${dayProgress.completed} / ${dayProgress.total}日`;
    const targetRangeText = getSalesSettingWarmCacheTargetDateRangeLabel("short");
    let label: string;
    switch (salesSettingWarmCacheState.status) {
        case "building":
            label = "データ取得: 準備中";
            break;
        case "running":
            label = `データ取得: 取得中 ${progressText}${targetRangeText === null ? "" : `（${targetRangeText}）`}`;
            break;
        case "paused":
            label = "データ取得: 一時停止中";
            break;
        case "cooldown":
            label = "データ取得: クールダウン中";
            break;
        case "limitReached":
            label = "データ取得: 上限到達";
            break;
        case "error":
            label = `データ取得: エラー ${salesSettingWarmCacheState.errors}`;
            break;
        case "complete":
            label = `データ取得: 完了 ${progressText}${targetRangeText === null ? "" : `（${targetRangeText}）`}`;
            break;
        case "idle":
        default:
            label = salesSettingWarmCacheState.total > 0
                ? `データ取得: 待機中 ${progressText}${targetRangeText === null ? "" : `（${targetRangeText}）`}`
                : "データ取得: 待機中";
            break;
    }

    const competitorLabel = getCompetitorPriceSnapshotStatusLabel();
    return competitorLabel === null ? label : `${label} / ${competitorLabel}`;
}

function getSalesSettingWarmCacheDetailLabel(): string {
    const task = salesSettingWarmCacheState.currentTask;
    const taskLabel = task === null
        ? salesSettingWarmCacheState.pauseReason
        : `取得中 ${formatSalesSettingWarmCacheTaskLabel(task)}`;
    const completedDateRange = getSalesSettingWarmCacheCompletedDateRangeLabel();
    const cooldownLabel = salesSettingWarmCacheState.status === "cooldown"
        ? getSalesSettingWarmCacheCooldownLabel()
        : null;
    const retryPendingCount = getSalesSettingWarmCacheRetryPendingCount();
    const parts = [
        getSalesSettingWarmCacheTargetRangeLabel(),
        `完了 ${completedDateRange}`,
        getSalesSettingWarmCachePriorityProgressLabel(),
        getRankRecommendationWarmCachePriorityProgressLabel(),
        taskLabel,
        salesSettingWarmCacheState.activeTasks.length > 1 ? `worker ${salesSettingWarmCacheState.activeTasks.length}/${SALES_SETTING_WARM_CACHE_WORKER_COUNT}` : null,
        cooldownLabel,
        retryPendingCount > 0 ? `再試行待ち ${retryPendingCount}` : null,
        `保存 ${salesSettingWarmCacheState.fetched}`,
        `skip ${salesSettingWarmCacheState.skipped}`,
        getCompetitorPriceSnapshotDetailLabel()
    ].filter((part): part is string => part !== null && part !== "");

    return parts.join(" / ");
}

function getRankRecommendationWarmCachePriorityProgressLabel(): string | null {
    const total = salesSettingWarmCacheState.rankRecommendationPriorityTotal;
    if (total <= 0) {
        return null;
    }

    const currentTask = salesSettingWarmCacheState.currentTask;
    const currentLabel = currentTask !== null && isRankRecommendationWarmCachePriorityTask(currentTask)
        ? `・取得中 ${formatSalesSettingWarmCacheTaskLabel(currentTask)}`
        : "";
    return [
        `候補優先 ${salesSettingWarmCacheState.rankRecommendationPriorityProcessed} / ${total}`,
        `保存 ${salesSettingWarmCacheState.rankRecommendationPriorityFetched}`,
        `skip ${salesSettingWarmCacheState.rankRecommendationPrioritySkipped}`,
        salesSettingWarmCacheState.rankRecommendationPriorityErrors > 0
            ? `失敗 ${salesSettingWarmCacheState.rankRecommendationPriorityErrors}`
            : null
    ].filter((part): part is string => part !== null).join(" ") + currentLabel;
}

function getCompetitorPriceSnapshotStatusLabel(): string | null {
    const backgroundLabel = getCompetitorPriceSnapshotBackgroundStatusLabel();
    if (backgroundLabel !== null) {
        return backgroundLabel;
    }

    switch (competitorPriceSnapshotUiState.status) {
        case "saving":
            return "競合価格: 保存中";
        case "stored":
            return competitorPriceSnapshotUiState.previousRecord === null
                ? "競合価格: 保存済み"
                : "競合価格: 前回あり";
        case "skipped":
            return "競合価格: skip";
        case "error":
            return "競合価格: 保存失敗";
        case "idle":
        default:
            return null;
    }
}

function getCompetitorPriceSnapshotDetailLabel(): string | null {
    const backgroundLabel = getCompetitorPriceSnapshotBackgroundDetailLabel();
    if (backgroundLabel !== null) {
        return backgroundLabel;
    }

    if (competitorPriceSnapshotUiState.status === "idle") {
        return null;
    }

    const stayDate = competitorPriceSnapshotUiState.stayDate === null
        ? "日付不明"
        : formatCompactDateForDisplay(competitorPriceSnapshotUiState.stayDate);
    if (competitorPriceSnapshotUiState.status === "saving") {
        return `競合価格 ${stayDate} 保存中`;
    }

    if (competitorPriceSnapshotUiState.status === "skipped") {
        return `競合価格 ${stayDate} skip ${formatCompetitorPriceSnapshotSkipReason(competitorPriceSnapshotUiState.reason)}`;
    }

    if (competitorPriceSnapshotUiState.status === "error") {
        return `競合価格 ${stayDate} 保存失敗 ${competitorPriceSnapshotUiState.errorMessage ?? ""}`.trim();
    }

    const latestRecord = competitorPriceSnapshotUiState.latestRecord;
    if (latestRecord === null) {
        return `競合価格 ${stayDate} 保存済み`;
    }

    const previousText = competitorPriceSnapshotUiState.previousRecord === null
        ? "前回なし"
        : `前回 ${formatDateTimeForDisplay(competitorPriceSnapshotUiState.previousRecord.fetchedAt)}`;
    return [
        `競合価格 ${stayDate}`,
        `保存 ${formatDateTimeForDisplay(latestRecord.fetchedAt)}`,
        previousText,
        `競合 ${latestRecord.competitorSet.length}`
    ].join(" ");
}

function getCompetitorPriceSnapshotBackgroundStatusLabel(): string | null {
    if (competitorPriceSnapshotBackgroundProgress.status === "idle") {
        return null;
    }

    const progressText = `${competitorPriceSnapshotBackgroundProgress.processed} / ${competitorPriceSnapshotBackgroundProgress.total}日`;
    if (competitorPriceSnapshotBackgroundProgress.status === "running") {
        return `競合価格: 周辺日程取得中 ${progressText}`;
    }
    if (competitorPriceSnapshotBackgroundProgress.status === "complete") {
        return `競合価格: 周辺日程完了 ${progressText}`;
    }
    return `競合価格: 周辺日程停止 ${progressText}`;
}

function getCompetitorPriceSnapshotBackgroundDetailLabel(): string | null {
    if (competitorPriceSnapshotBackgroundProgress.status === "idle") {
        return null;
    }

    const rangeLabel = getCompetitorPriceSnapshotBackgroundRangeLabel();
    const currentTask = competitorPriceSnapshotBackgroundProgress.currentTask;
    const currentTaskLabel = currentTask === null
        ? competitorPriceSnapshotBackgroundProgress.pauseReason
        : `取得中 ${formatCompactDateForDisplay(currentTask.stayDate)}`;
    return [
        rangeLabel === null ? null : `競合価格 周辺日程 ${rangeLabel}`,
        currentTaskLabel,
        `完了 ${competitorPriceSnapshotBackgroundProgress.processed} / ${competitorPriceSnapshotBackgroundProgress.total}日`
    ].filter((part): part is string => part !== null && part !== "").join(" / ");
}

function getCompetitorPriceSnapshotBackgroundRangeLabel(): string | null {
    const fromDate = competitorPriceSnapshotBackgroundProgress.targetFromDate;
    const toDate = competitorPriceSnapshotBackgroundProgress.targetToDate;
    if (fromDate === null || toDate === null) {
        return null;
    }
    if (fromDate === toDate) {
        return formatCompactDateForDisplay(fromDate);
    }
    return `${formatCompactDateForDisplay(fromDate)}〜${formatCompactDateForDisplay(toDate)}`;
}

function getSalesSettingWarmCacheRetryPendingCount(): number {
    return salesSettingWarmCacheState.queue.filter((task) => (task.retryCount ?? 0) > 0).length;
}

function formatSalesSettingWarmCacheTaskLabel(task: SalesSettingWarmCacheTask): string {
    const scopeLabel = task.scope === "hotel" ? "全体" : task.roomGroupName ?? task.roomGroupId ?? "室タイプ";
    const retryLabel = task.retryCount === undefined ? "" : ` 再試行${task.retryCount}/${SALES_SETTING_WARM_CACHE_MAX_RETRY_COUNT}`;
    if (task.kind === "referenceCurve") {
        const curveLabel = task.curveKind === "recent_weighted_90" ? "直近型" : "季節型";
        const segmentLabel = task.segment === "all" ? "全体" : task.segment === "transient" ? "個人" : "団体";
        return `${formatCompactDateForDisplay(task.targetStayDate)} ${scopeLabel} ${curveLabel}/${segmentLabel}${retryLabel}`;
    }

    if (task.kind === "sameWeekdayRaw") {
        return `${formatCompactDateForDisplay(task.targetStayDate)} 同曜日 ${formatCompactDateForDisplay(task.stayDate)} ${scopeLabel}${retryLabel}`;
    }

    return `${formatCompactDateForDisplay(task.stayDate)} ${scopeLabel}${retryLabel}`;
}

function getSalesSettingWarmCacheDayProgressSummary(): { total: number; completed: number; partial: number } {
    const progressList = Object.values(salesSettingWarmCacheState.dateProgress);
    return {
        total: progressList.length,
        completed: progressList.filter(isSalesSettingWarmCacheDateComplete).length,
        partial: progressList.filter(isSalesSettingWarmCacheDatePartial).length
    };
}

function isSalesSettingWarmCacheDateComplete(progress: SalesSettingWarmCacheDateProgress): boolean {
    return progress.errors === 0
        && progress.rawTotal > 0
        && progress.rawDone >= progress.rawTotal
        && progress.referenceTotal > 0
        && progress.referenceDone >= progress.referenceTotal
        && progress.sameWeekdayTotal > 0
        && progress.sameWeekdayDone >= progress.sameWeekdayTotal;
}

function isSalesSettingWarmCacheDatePartial(progress: SalesSettingWarmCacheDateProgress): boolean {
    return !isSalesSettingWarmCacheDateComplete(progress)
        && progress.errors === 0
        && (progress.rawDone > 0 || progress.referenceDone > 0 || progress.sameWeekdayDone > 0);
}

function getSalesSettingWarmCacheDateMarkerState(progress: SalesSettingWarmCacheDateProgress | undefined): SalesSettingWarmCacheDateMarkerState | null {
    if (progress === undefined) {
        return null;
    }

    if (progress.errors > 0) {
        return "error";
    }

    if (isSalesSettingWarmCacheDateComplete(progress)) {
        return "complete";
    }

    if (isSalesSettingWarmCacheDatePartial(progress)) {
        return "partial";
    }

    return null;
}

function renderSalesSettingWarmCacheCalendarMarkers(): void {
    const cells = collectMonthlyCalendarCells();
    const renderedStayDates = new Set<string>();
    const shouldShowProgressMarkers = salesSettingWarmCacheState.total > 0;

    queueSalesSettingWarmCacheStoredCalendarMarkerRefresh(cells);

    for (const cell of cells) {
        const progress = shouldShowProgressMarkers ? salesSettingWarmCacheState.dateProgress[cell.stayDate] : undefined;
        const progressState = getSalesSettingWarmCacheDateMarkerState(progress);
        const storedState = salesSettingWarmCacheStoredCalendarMarkerStates.get(cell.stayDate) ?? null;
        const state = progressState ?? storedState;
        if (state !== null) {
            renderedStayDates.add(cell.stayDate);
        }
        renderSalesSettingWarmCacheCalendarMarker(cell, progress, state);
    }

    for (const markedCell of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE}]`))) {
        const testId = markedCell.getAttribute("data-testid");
        const stayDate = testId?.startsWith(CALENDAR_DATE_TEST_ID_PREFIX) === true
            ? testId.slice(CALENDAR_DATE_TEST_ID_PREFIX.length).replaceAll("-", "")
            : null;
        if (stayDate === null || !renderedStayDates.has(stayDate)) {
            markedCell.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE);
            markedCell.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE);
            markedCell.style.removeProperty(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_PROGRESS_PROPERTY);
            markedCell.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}]`)?.remove();
            markedCell.removeAttribute("title");
        }
    }
}

function queueSalesSettingWarmCacheStoredCalendarMarkerRefresh(cells: MonthlyCalendarCell[]): void {
    const facilityId = activeFacilityCacheKey;
    const currentAsOfDate = activeBatchDateKey;
    if (facilityId === null || currentAsOfDate === null || cells.length === 0 || activeAnalyzeDate !== null) {
        clearSalesSettingWarmCacheStoredCalendarMarkers();
        return;
    }

    const stayDates = Array.from(new Set(cells.map((cell) => cell.stayDate))).sort();
    const signature = `${facilityId}:${currentAsOfDate}:${stayDates.join(",")}`;
    if (signature === salesSettingWarmCacheStoredCalendarMarkerSignature) {
        return;
    }

    salesSettingWarmCacheStoredCalendarMarkerSignature = signature;
    salesSettingWarmCacheStoredCalendarMarkerStates = new Map<string, SalesSettingWarmCacheStoredMarkerState>();
    const requestSeq = ++salesSettingWarmCacheStoredCalendarMarkerRequestSeq;

    void readBookingCurveRawSourceStoredStayDateStatuses(facilityId, stayDates, currentAsOfDate)
        .then((storedStayDateStatuses) => {
            if (requestSeq !== salesSettingWarmCacheStoredCalendarMarkerRequestSeq) {
                return;
            }

            salesSettingWarmCacheStoredCalendarMarkerStates = new Map(
                Object.entries(storedStayDateStatuses).map(([stayDate, status]) => [
                    stayDate,
                    status === "currentAsOf" ? "stored-current" : "stored-past"
                ])
            );
            renderSalesSettingWarmCacheCalendarMarkers();
        })
        .catch((error: unknown) => {
            if (requestSeq !== salesSettingWarmCacheStoredCalendarMarkerRequestSeq) {
                return;
            }
            console.warn(`[${SCRIPT_NAME}] failed to load warm cache stored calendar markers`, {
                facilityId,
                error
            });
        });
}

function clearSalesSettingWarmCacheStoredCalendarMarkers(): void {
    if (salesSettingWarmCacheStoredCalendarMarkerSignature === "" && salesSettingWarmCacheStoredCalendarMarkerStates.size === 0) {
        return;
    }

    salesSettingWarmCacheStoredCalendarMarkerSignature = "";
    salesSettingWarmCacheStoredCalendarMarkerStates = new Map<string, SalesSettingWarmCacheStoredMarkerState>();
    salesSettingWarmCacheStoredCalendarMarkerRequestSeq += 1;
}

function renderSalesSettingWarmCacheCalendarMarker(
    cell: MonthlyCalendarCell,
    progress: SalesSettingWarmCacheDateProgress | undefined,
    state: SalesSettingWarmCacheDateMarkerState | null
): void {
    if (state === null) {
        cell.anchorElement.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE);
        cell.anchorElement.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE);
        cell.anchorElement.style.removeProperty(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_PROGRESS_PROPERTY);
        cell.anchorElement.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}]`)?.remove();
        cell.anchorElement.removeAttribute("title");
        return;
    }

    cell.anchorElement.setAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE, "");
    cell.anchorElement.setAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE, state);
    cell.anchorElement.style.setProperty(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_PROGRESS_PROPERTY, `${getSalesSettingWarmCacheCalendarMarkerProgressPercent(progress, state)}%`);
    const markerBarElement = cell.anchorElement.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}]`)
        ?? document.createElement("span");
    markerBarElement.setAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE, "");
    if (markerBarElement.parentElement !== cell.anchorElement) {
        cell.anchorElement.append(markerBarElement);
    }
    cell.anchorElement.setAttribute("title", getSalesSettingWarmCacheCalendarMarkerTitle(state, progress));
}

function getSalesSettingWarmCacheCalendarMarkerProgressPercent(
    progress: SalesSettingWarmCacheDateProgress | undefined,
    state: SalesSettingWarmCacheDateMarkerState
): number {
    if (state === "complete" || state === "error") {
        return 100;
    }

    if (state === "stored-current") {
        return 24;
    }

    if (state === "stored-past") {
        return 18;
    }

    if (progress === undefined) {
        return 0;
    }

    const total = progress.rawTotal + progress.referenceTotal + progress.sameWeekdayTotal;
    const done = progress.rawDone + progress.referenceDone + progress.sameWeekdayDone;
    if (total <= 0 || done <= 0) {
        return 0;
    }

    return Math.max(8, Math.min(100, Math.round((done / total) * 100)));
}

function getSalesSettingWarmCacheCalendarMarkerTitle(
    state: SalesSettingWarmCacheDateMarkerState,
    progress: SalesSettingWarmCacheDateProgress | undefined
): string {
    const progressLabel = progress === undefined
        ? ""
        : ` ${progress.rawDone + progress.referenceDone + progress.sameWeekdayDone} / ${progress.rawTotal + progress.referenceTotal + progress.sameWeekdayTotal}`;
    switch (state) {
        case "complete":
            return "booking_curve 取得完了";
        case "error":
            return "booking_curve 取得エラーあり";
        case "stored-current":
            return "booking_curve 現在基準の保存済みデータあり";
        case "stored-past":
            return "booking_curve 過去基準の保存済みデータあり";
        case "partial":
        default:
            return `booking_curve 一部取得済み${progressLabel}`;
    }
}

function getSalesSettingWarmCacheCompletedDateRangeLabel(): string {
    const dateKeys = Object.keys(salesSettingWarmCacheState.dateProgress).sort();
    if (dateKeys.length === 0) {
        return "なし";
    }

    let rangeStart: string | null = null;
    let rangeEnd: string | null = null;
    for (const dateKey of dateKeys) {
        const progress = salesSettingWarmCacheState.dateProgress[dateKey];
        if (progress === undefined || !isSalesSettingWarmCacheDateComplete(progress)) {
            if (rangeStart !== null) {
                break;
            }
            continue;
        }

        if (rangeStart === null) {
            rangeStart = dateKey;
        }
        rangeEnd = dateKey;
    }

    if (rangeStart === null || rangeEnd === null) {
        return "なし";
    }

    return rangeStart === rangeEnd
        ? formatCompactDateForDisplay(rangeStart)
        : `${formatCompactDateForDisplay(rangeStart)}〜${formatCompactDateForDisplay(rangeEnd)}`;
}

function getSalesSettingWarmCacheTargetRangeLabel(): string | null {
    const dateRangeLabel = getSalesSettingWarmCacheTargetDateRangeLabel("long");
    if (dateRangeLabel === null) {
        return null;
    }

    return `対象 ${dateRangeLabel}`;
}

function getSalesSettingWarmCacheTargetDateRangeLabel(format: "short" | "long"): string | null {
    const fromDate = salesSettingWarmCacheState.targetFromDate;
    const toDate = salesSettingWarmCacheState.targetToDate;
    if (fromDate === null || toDate === null) {
        return null;
    }

    const fromLabel = format === "short"
        ? formatCompactMonthDayForDisplay(fromDate)
        : formatCompactDateForDisplay(fromDate);
    const toLabel = format === "short"
        ? formatCompactMonthDayForDisplay(toDate)
        : formatCompactDateForDisplay(toDate);

    if (fromLabel === null || toLabel === null) {
        return null;
    }

    return fromDate === toDate ? fromLabel : `${fromLabel}〜${toLabel}`;
}

function getSalesSettingWarmCachePriorityProgressLabel(): string | null {
    const priorityStayDate = salesSettingWarmCacheState.priorityStayDate;
    if (priorityStayDate === null) {
        return null;
    }

    const progress = salesSettingWarmCacheState.dateProgress[priorityStayDate];
    if (progress === undefined) {
        return `この日 ${formatCompactDateForDisplay(priorityStayDate)} 準備中`;
    }

    return [
        `この日 ${formatCompactDateForDisplay(priorityStayDate)}`,
        `raw ${formatSalesSettingWarmCacheProgressPercent(progress.rawDone, progress.rawTotal)}`,
        `参考線 ${formatSalesSettingWarmCacheProgressPercent(progress.referenceDone, progress.referenceTotal)}`,
        `同曜日 ${formatSalesSettingWarmCacheProgressPercent(progress.sameWeekdayDone, progress.sameWeekdayTotal)}`
    ].join(" ");
}

function formatSalesSettingWarmCacheProgressPercent(done: number, total: number): string {
    if (total <= 0) {
        return "0%（0/0）";
    }

    return `${Math.floor((done / total) * 100)}%（${done}/${total}）`;
}

function getSalesSettingWarmCacheCooldownLabel(): string | null {
    if (salesSettingWarmCacheState.cooldownUntil === null) {
        return null;
    }

    const remainingMs = salesSettingWarmCacheState.cooldownUntil - Date.now();
    if (remainingMs <= 0) {
        return "再開待ち";
    }

    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return `約${remainingMinutes}分後に再開`;
}

function formatCompactDateForDisplay(dateKey: string): string {
    const compactDateKey = dateKey.trim().replace(/-/g, "");
    if (!/^\d{8}$/.test(compactDateKey)) {
        return dateKey;
    }

    return `${compactDateKey.slice(0, 4)}-${compactDateKey.slice(4, 6)}-${compactDateKey.slice(6, 8)}`;
}

function formatDateTimeForDisplay(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${month}/${day} ${hours}:${minutes}`;
}

function formatPriceForDisplay(value: number | null): string {
    return value === null ? "-" : `${value.toLocaleString("ja-JP")}円`;
}

function shortenConditionSignature(value: string): string {
    return value.length <= 24 ? value : `${value.slice(0, 24)}...`;
}

function formatCompetitorPriceSnapshotSkipReason(reason: string | null): string {
    switch (reason) {
        case "indexeddb-unavailable":
            return "IndexedDBなし";
        case "no-competitors":
            return "競合施設なし";
        case null:
            return "理由不明";
        default:
            return reason;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function formatCompactMonthDayForDisplay(dateKey: string): string | null {
    const compactDateKey = dateKey.trim().replace(/-/g, "");
    if (!/^\d{8}$/.test(compactDateKey)) {
        return null;
    }

    return `${Number(compactDateKey.slice(4, 6))}/${Number(compactDateKey.slice(6, 8))}`;
}

function buildBookingCurveQuerySignature(stayDate: string, rmRoomGroupId?: string): string {
    return [
        `date=${stayDate}`,
        ...(rmRoomGroupId === undefined ? [] : [`rm_room_group_id=${rmRoomGroupId}`])
    ].join("&");
}

async function loadBookingCurve(stayDate: string, rmRoomGroupId?: string): Promise<BookingCurveResponse> {
    const url = new URL(BOOKING_CURVE_ENDPOINT, window.location.origin);
    url.searchParams.set("date", stayDate);

    if (rmRoomGroupId !== undefined) {
        url.searchParams.set("rm_room_group_id", rmRoomGroupId);
    }

    return bookingCurveRequestScheduler.schedule(
        url.search,
        async () => {
            const response = await fetch(url.toString(), {
                credentials: "include",
                headers: {
                    "X-RAU-Request": "booking-curve",
                    "X-Requested-With": "XMLHttpRequest"
                }
            });

            if (!response.ok) {
                throw new RevenueAssistantRequestError(BOOKING_CURVE_ENDPOINT, response.status);
            }

            return compactBookingCurveResponse((await response.json()) as BookingCurveResponse);
        }
    );
}

function compactBookingCurveScopeCounts(counts: BookingCurveScopeCounts | undefined): BookingCurveScopeCounts | undefined {
    if (counts === undefined) {
        return undefined;
    }

    const compactCounts: BookingCurveScopeCounts = {};
    const countKeys = [
        "this_year_room_sum",
        "last_year_room_sum",
        "two_years_ago_room_sum",
        "three_years_ago_room_sum",
        "this_year_sales_sum",
        "last_year_sales_sum",
        "two_years_ago_sales_sum",
        "three_years_ago_sales_sum",
        "this_year_adr",
        "last_year_adr",
        "two_years_ago_adr",
        "three_years_ago_adr"
    ] as const;

    for (const key of countKeys) {
        const value = counts[key];
        if (typeof value === "number" || value === null) {
            compactCounts[key] = value;
        }
    }

    return Object.keys(compactCounts).length === 0 ? undefined : compactCounts;
}

function compactBookingCurveResponse(data: BookingCurveResponse): BookingCurveResponse {
    const compactResponse: BookingCurveResponse = {
        stay_date: data.stay_date,
        booking_curve: (data.booking_curve ?? []).map((point) => {
            const compactPoint: BookingCurvePoint = {
                date: point.date
            };
            if (typeof point.last_year_date === "string") {
                compactPoint.last_year_date = point.last_year_date;
            }

            const allCounts = compactBookingCurveScopeCounts(point.all);
            if (allCounts !== undefined) {
                compactPoint.all = allCounts;
            }

            const transientCounts = compactBookingCurveScopeCounts(point.transient);
            if (transientCounts !== undefined) {
                compactPoint.transient = transientCounts;
            }

            const groupCounts = compactBookingCurveScopeCounts(point.group);
            if (groupCounts !== undefined) {
                compactPoint.group = groupCounts;
            }

            return compactPoint;
        })
    };

    if (typeof data.last_year_stay_date === "string") {
        compactResponse.last_year_stay_date = data.last_year_stay_date;
    }

    if (typeof data.max_room_count === "number") {
        compactResponse.max_room_count = data.max_room_count;
    }

    return compactResponse;
}

function findBookingCurveCount(data: BookingCurveResponse, lookupDate: string, countScope: BookingCurveCountScope): number | null {
    let latestMatchedDate = "";
    let latestMatchedCount: number | null = null;

    for (const point of data.booking_curve ?? []) {
        const pointDate = point.date;
        const count = point[countScope]?.this_year_room_sum;

        if (pointDate > lookupDate || typeof count !== "number") {
            continue;
        }

        if (pointDate >= latestMatchedDate) {
            latestMatchedDate = pointDate;
            latestMatchedCount = count;
        }
    }

    return latestMatchedCount;
}

function findExactBookingCurveCount(data: BookingCurveResponse, targetDate: string, countScope: BookingCurveCountScope): number | null {
    for (const point of data.booking_curve ?? []) {
        if (point.date !== targetDate) {
            continue;
        }

        const count = point[countScope]?.this_year_room_sum;
        return typeof count === "number" ? count : null;
    }

    return null;
}

function resolveSalesSettingBookingCurveMetricAtDate(
    data: BookingCurveResponse,
    lookupDate: string,
    variant: SalesSettingBookingCurvePanelVariant
): number | null {
    if (variant === "overall") {
        return findBookingCurveCount(data, lookupDate, "all");
    }

    if (variant === "group") {
        return findBookingCurveCount(data, lookupDate, "group");
    }

    return resolveSalesSettingPrivateRoomCount(
        findBookingCurveCount(data, lookupDate, "transient"),
        findBookingCurveCount(data, lookupDate, "all"),
        findBookingCurveCount(data, lookupDate, "group")
    );
}

function resolveSalesSettingBookingCurveActMetric(
    data: BookingCurveResponse,
    stayDate: string,
    batchDateKey: string,
    variant: SalesSettingBookingCurvePanelVariant
): number | null {
    const observationLeadDays = getDaysBetweenDashedDateKeys(stayDate, batchDateKey);
    if (observationLeadDays !== null && observationLeadDays >= 0) {
        return null;
    }

    if (variant === "overall") {
        return findExactBookingCurveCount(data, batchDateKey, "all");
    }

    if (variant === "group") {
        return findExactBookingCurveCount(data, batchDateKey, "group");
    }

    return resolveSalesSettingPrivateRoomCount(
        findExactBookingCurveCount(data, batchDateKey, "transient"),
        findExactBookingCurveCount(data, batchDateKey, "all"),
        findExactBookingCurveCount(data, batchDateKey, "group")
    );
}

function buildSalesSettingBookingCurveSeries(
    data: BookingCurveResponse,
    stayDate: string,
    batchDateKey: string,
    variant: SalesSettingBookingCurvePanelVariant
): SalesSettingBookingCurveSeries {
    const observationLeadDays = getDaysBetweenDashedDateKeys(stayDate, batchDateKey);
    const values = SALES_SETTING_BOOKING_CURVE_TICKS.map((tick) => {
        if (tick === "ACT") {
            return resolveSalesSettingBookingCurveActMetric(data, stayDate, batchDateKey, variant);
        }

        if (observationLeadDays !== null && observationLeadDays > tick) {
            return null;
        }

        const targetDate = shiftDate(stayDate, -tick);
        return resolveSalesSettingBookingCurveMetricAtDate(data, targetDate, variant);
    });

    return {
        values,
        signature: values
            .map((value, index) => `${SALES_SETTING_BOOKING_CURVE_TICKS[index] ?? "ACT"}:${value === null ? "-" : value}`)
            .join("|")
    };
}

function buildSalesSettingReferenceBookingCurveSeries(result: ReferenceCurveResult | null): SalesSettingBookingCurveSeries | null {
    if (result === null) {
        return null;
    }

    const valueByTick = new Map(result.points.map((point) => [point.lt, point.rooms]));
    const values = SALES_SETTING_BOOKING_CURVE_TICKS.map((tick) => valueByTick.get(tick) ?? null);
    const interpolated = applySalesSettingReferenceZeroDayDisplayInterpolation(values);

    return {
        values,
        interpolated,
        signature: [
            result.curveKind,
            result.algorithmVersion,
            result.diagnostics.sourceStayDateCount,
            result.diagnostics.missingReason ?? "-",
            ...values.map((value, index) => {
                const interpolationSignature = interpolated[index] === true ? ":display-interpolated" : "";
                return `${SALES_SETTING_BOOKING_CURVE_TICKS[index] ?? "ACT"}:${value === null ? "-" : value}${interpolationSignature}`;
            })
        ].join("|")
    };
}

function applySalesSettingReferenceZeroDayDisplayInterpolation(values: Array<number | null>): boolean[] {
    const interpolated = values.map(() => false);
    const zeroDayIndex = SALES_SETTING_BOOKING_CURVE_TICKS.indexOf(0);
    const oneDayIndex = SALES_SETTING_BOOKING_CURVE_TICKS.indexOf(1);
    const actIndex = SALES_SETTING_BOOKING_CURVE_TICKS.indexOf("ACT");

    if (zeroDayIndex < 0 || oneDayIndex < 0 || actIndex < 0) {
        return interpolated;
    }

    const zeroDayValue = values[zeroDayIndex] ?? null;
    const oneDayValue = values[oneDayIndex] ?? null;
    const actValue = values[actIndex] ?? null;

    if (shouldSuppressReferenceZeroDayForDisplay(zeroDayValue, oneDayValue, actValue)) {
        values[zeroDayIndex] = null;
    }

    if (values[zeroDayIndex] === null && typeof oneDayValue === "number" && typeof actValue === "number") {
        const interpolatedValue = oneDayValue
            + ((actValue - oneDayValue) * SALES_SETTING_REFERENCE_ZERO_DAY_DISPLAY_INTERPOLATION_RATIO);
        values[zeroDayIndex] = Math.max(0, Math.round(interpolatedValue));
        interpolated[zeroDayIndex] = true;
    }

    return interpolated;
}

function shouldSuppressReferenceZeroDayForDisplay(
    zeroDayValue: number | null,
    oneDayValue: number | null,
    actValue: number | null
): boolean {
    return typeof zeroDayValue === "number"
        && typeof oneDayValue === "number"
        && typeof actValue === "number"
        && Math.abs(zeroDayValue - actValue) <= SALES_SETTING_REFERENCE_ZERO_DAY_EQUALITY_EPSILON
        && Math.abs(oneDayValue - actValue) > SALES_SETTING_REFERENCE_ZERO_DAY_EQUALITY_EPSILON;
}

function buildSalesSettingSameWeekdayBookingCurveSeries(
    result: SalesSettingSameWeekdayCurveData,
    batchDateKey: string,
    variant: SalesSettingBookingCurvePanelVariant
): SalesSettingBookingCurveHelperSeries {
    return {
        kind: "sameWeekday",
        label: formatSalesSettingSameWeekdayCurveLabel(result),
        offsetDays: result.offsetDays,
        series: buildSalesSettingBookingCurveSeries(result.bookingCurveData, result.stayDate, batchDateKey, variant)
    };
}

function buildSalesSettingBookingCurvePanelData(
    data: BookingCurveResponse,
    referenceData: SalesSettingBookingCurveReferenceData | null,
    sameWeekdayCurveData: SalesSettingSameWeekdayCurveData[],
    stayDate: string,
    batchDateKey: string,
    variant: SalesSettingBookingCurvePanelVariant
): SalesSettingBookingCurvePanelData {
    const current = buildSalesSettingBookingCurveSeries(data, stayDate, batchDateKey, variant);
    const recent = buildSalesSettingReferenceBookingCurveSeries(
        variant === "overall"
            ? referenceData?.recentOverall ?? null
            : variant === "group"
                ? referenceData?.recentGroup ?? null
                : referenceData?.recentIndividual ?? null
    );
    const seasonal = buildSalesSettingReferenceBookingCurveSeries(
        variant === "overall"
            ? referenceData?.seasonalOverall ?? null
            : variant === "group"
                ? referenceData?.seasonalGroup ?? null
                : referenceData?.seasonalIndividual ?? null
    );
    const sameWeekday = isSalesSettingBookingCurveSameWeekdayVisible()
        ? sameWeekdayCurveData.map((result) => buildSalesSettingSameWeekdayBookingCurveSeries(result, batchDateKey, variant))
        : [];

    return {
        current,
        recent,
        seasonal,
        sameWeekday,
        signature: [
            `current:${current.signature}`,
            `recent:${recent?.signature ?? "-"}`,
            `seasonal:${seasonal?.signature ?? "-"}`,
            `sameWeekday:${sameWeekday.map((result) => `${result.label}:${result.series.signature}`).join("/")}`,
            `helpers:sameWeekday:${isSalesSettingBookingCurveSameWeekdayVisible() ? "1" : "0"}`,
            `visible:${getSalesSettingBookingCurveReferenceVisibilitySignature()}`
        ].join("|")
    };
}

function buildSalesSettingBookingCurveRenderData(
    data: BookingCurveResponse,
    referenceData: SalesSettingBookingCurveReferenceData | null,
    sameWeekdayCurveData: SalesSettingSameWeekdayCurveData[],
    stayDate: string,
    batchDateKey: string,
    rankHistory: SalesSettingRankHistoryEvent[] = [],
    secondarySegment: SalesSettingBookingCurveSecondarySegment = getSalesSettingBookingCurveSecondarySegment()
): SalesSettingBookingCurveRenderData {
    const overallRankMarkers = buildSalesSettingBookingCurveMarkers(data, rankHistory, "overall");
    const secondaryRankMarkers = buildSalesSettingBookingCurveMarkers(data, rankHistory, secondarySegment);

    return {
        overall: buildSalesSettingBookingCurvePanelData(data, referenceData, sameWeekdayCurveData, stayDate, batchDateKey, "overall"),
        secondary: buildSalesSettingBookingCurvePanelData(data, referenceData, sameWeekdayCurveData, stayDate, batchDateKey, secondarySegment),
        secondarySegment,
        overallRankMarkers,
        secondaryRankMarkers,
        rankSignature: [
            ...overallRankMarkers.map((marker) => `o:${marker.signature}:${marker.value === null ? "-" : marker.value}`),
            ...secondaryRankMarkers.map((marker) => `${secondarySegment}:${marker.signature}:${marker.value === null ? "-" : marker.value}`)
        ].join("|")
    };
}

function buildSalesSettingBookingCurveMarkers(
    data: BookingCurveResponse,
    rankHistory: SalesSettingRankHistoryEvent[],
    variant: SalesSettingBookingCurvePanelVariant
): SalesSettingBookingCurveMarker[] {
    return rankHistory.map((event) => ({
        reflectedAt: event.reflectedAt,
        reflectedDateKey: event.reflectedDateKey,
        daysBeforeStay: event.daysBeforeStay,
        beforeRankName: event.beforeRankName,
        afterRankName: event.afterRankName,
        reflectorName: event.reflectorName,
        value: resolveSalesSettingBookingCurveMetricAtDate(data, event.reflectedDateKey, variant),
        signature: event.signature
    }));
}

function ensureCalendarObserver(): void {
    if (calendarObserver !== null) {
        return;
    }

    const root = document.querySelector("#root") ?? document.body;
    if (root === null) {
        return;
    }
    calendarObserver = new MutationObserver((mutations) => {
        if (mutations.every((mutation) => isRevenueAssistantManagedMutation(mutation))) {
            return;
        }

        recordCalendarSyncMutationDebug(mutations);
        scheduleMutationObserverCalendarSync();
    });
    calendarObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-selected"],
        childList: true,
        subtree: true
    });
}

function cleanupCalendarObserver(): void {
    if (calendarObserver === null) {
        return;
    }

    calendarObserver.disconnect();
    calendarObserver = null;
}

function isRevenueAssistantManagedMutation(mutation: MutationRecord): boolean {
    if (mutation.type === "attributes") {
        return isRevenueAssistantManagedNode(mutation.target);
    }

    if (isRevenueAssistantManagedNode(mutation.target)) {
        return true;
    }

    const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return changedNodes.length > 0 && changedNodes.every((node) => isRevenueAssistantManagedNode(node));
}

function isRevenueAssistantManagedNode(node: Node | null): boolean {
    if (node === null) {
        return false;
    }

    if (node instanceof Element) {
        return node.matches(REVENUE_ASSISTANT_MANAGED_SELECTOR)
            || node.closest(REVENUE_ASSISTANT_MANAGED_SELECTOR) !== null;
    }

    return node.parentElement?.closest(REVENUE_ASSISTANT_MANAGED_SELECTOR) !== null;
}

function scheduleMutationObserverCalendarSync(): void {
    if (mutationObserverSyncQueued) {
        return;
    }

    mutationObserverSyncQueued = true;
    const flush = (): void => {
        if (calendarSyncRunning || calendarSyncQueued) {
            window.requestAnimationFrame(flush);
            return;
        }

        if (repairGroupRoomToggleLayout()) {
            mutationObserverSyncQueued = false;
            return;
        }

        const nextSignature = getCalendarSyncSignature();
        mutationObserverSyncQueued = false;

        if (nextSignature === completedCalendarSyncSignature) {
            scheduleCompetitorPriceOverviewPlacementRepair();
            return;
        }

        queueCalendarSync({ reason: "mutation-observer" });
    };

    window.requestAnimationFrame(flush);
}

function resolveGroupRoomToggleHostElement(
    segmentedControl: HTMLElement,
    toolbarElement: HTMLElement
): HTMLElement | null {
    const segmentedWrapper = segmentedControl.parentElement;
    if (segmentedWrapper?.parentElement !== toolbarElement) {
        return null;
    }

    const hostElement = segmentedWrapper.nextElementSibling;
    return hostElement instanceof HTMLElement ? hostElement : null;
}

function repairGroupRoomToggleLayout(): boolean {
    if (activeAnalyzeDate !== null) {
        return false;
    }

    const cells = collectMonthlyCalendarCells();
    if (cells.length === 0) {
        return false;
    }

    const segmentedControl = document.querySelector<HTMLElement>(`[data-testid="segmented-control"]`);
    const toolbarElement = segmentedControl?.parentElement?.parentElement ?? null;
    if (segmentedControl === null || toolbarElement === null) {
        return false;
    }

    const hostElement = resolveGroupRoomToggleHostElement(segmentedControl, toolbarElement);
    if (hostElement === null) {
        return false;
    }

    const toggleElement = document.querySelector<HTMLElement>(`[${GROUP_ROOM_TOGGLE_ATTRIBUTE}]`);
    const isMisaligned = toggleElement === null
        || toggleElement.parentElement !== hostElement
        || window.getComputedStyle(hostElement).position === "static";

    if (isMisaligned) {
        ensureGroupRoomToggle(true);
        return true;
    }

    return false;
}

function getGroupRoomToggleLayoutSignature(): string {
    const segmentedControl = document.querySelector<HTMLElement>(`[data-testid="segmented-control"]`);
    const toolbarElement = segmentedControl?.parentElement?.parentElement ?? null;
    if (toolbarElement === null) {
        return "toolbar:none";
    }

    const toggleElement = document.querySelector<HTMLElement>(`[${GROUP_ROOM_TOGGLE_ATTRIBUTE}]`);
    const hostElement = segmentedControl === null
        ? null
        : resolveGroupRoomToggleHostElement(segmentedControl, toolbarElement);

    return [
        `toggle:${toggleElement === null ? "0" : "1"}`,
        `host:${hostElement === null ? "0" : "1"}`,
        `parent:${toggleElement?.parentElement === hostElement ? "1" : "0"}`,
        `host-position:${hostElement !== null && window.getComputedStyle(hostElement).position !== "static" ? "1" : "0"}`
    ].join(",");
}

function getCalendarSyncSignature(): string {
    const analysisDate = activeAnalyzeDate ?? "-";
    const batchDateKey = getCurrentBatchDateKey();
    const calendarCells = collectMonthlyCalendarCells();
    const cards = collectSalesSettingCards();
    const firstCardParent = cards[0]?.cardElement.parentElement ?? null;

    const calendarState = calendarCells
        .map((cell) => {
            const hasLayout = cell.containerElement.hasAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE) ? "1" : "0";
            const hasBadge = cell.containerElement.querySelector<HTMLElement>(`[${GROUP_ROOM_BADGE_ATTRIBUTE}]`) === null ? "0" : "1";
            const hasLastChange = cell.anchorElement.querySelector<HTMLElement>(`[${CALENDAR_LAST_CHANGE_ATTRIBUTE}]`) === null ? "0" : "1";
            return `${cell.stayDate}:${hasLayout}:${hasBadge}:${hasLastChange}`;
        })
        .join(",");

    const cardState = cards
        .map((card) => {
            const hasGroupRow = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`) === null ? "0" : "1";
            const hasRankDetail = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_RANK_DETAIL_ATTRIBUTE}]`) === null ? "0" : "1";
            const hasCurveToggle = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE}]`) === null ? "0" : "1";
            const hasCurveSection = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE}="card"]`) === null ? "0" : "1";
            const isCurveOpen = isSalesSettingBookingCurveOpen(card.roomGroupName) ? "1" : "0";
            return `${card.roomGroupName}:${hasGroupRow}:${hasRankDetail}:${hasCurveToggle}:${hasCurveSection}:${isCurveOpen}`;
        })
        .join(",");

    const hasOverallSummary = firstCardParent?.querySelector<HTMLElement>(`[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`) === null ? "0" : "1";
    const hasOverallCurve = firstCardParent?.querySelector<HTMLElement>(`[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}] [${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE}="overall"]`) === null ? "0" : "1";
    const hasRankOverview = firstCardParent?.querySelector<HTMLElement>(`[${SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE}]`) === null ? "0" : "1";

    return [
        `href:${window.location.pathname}${window.location.search}`,
        `analysis:${analysisDate}`,
        `batch:${batchDateKey}`,
        `calendar-visible:${isGroupRoomCalendarVisible() ? "1" : "0"}`,
        `reference:${getSalesSettingBookingCurveReferenceVisibilitySignature()}`,
        `toggle-layout:${getGroupRoomToggleLayoutSignature()}`,
        `cells:${calendarState}`,
        `cards:${cardState}`,
        `overall:${hasOverallSummary}`,
        `overall-curve:${hasOverallCurve}`,
        `rank:${hasRankOverview}`
    ].join("|");
}

function getCalendarSyncDebugCounters(reason: string): CalendarSyncDebugCounters {
    const existing = calendarSyncDebugCounters.get(reason);
    if (existing !== undefined) {
        return existing;
    }

    const created: CalendarSyncDebugCounters = {
        requested: 0,
        scheduled: 0,
        executed: 0,
        skippedCompleted: 0,
        skippedQueued: 0,
        queuedWhileRunning: 0,
        forced: 0
    };
    calendarSyncDebugCounters.set(reason, created);
    return created;
}

function recordCalendarSyncMutationDebug(mutations: MutationRecord[]): void {
    if (!isCalendarSyncDebugEnabled()) {
        return;
    }

    const attributeNames = new Map<string, number>();
    const targetSummaries = new Map<string, number>();

    for (const mutation of mutations) {
        if (mutation.type === "attributes") {
            const attributeName = mutation.attributeName ?? "(unknown)";
            attributeNames.set(attributeName, (attributeNames.get(attributeName) ?? 0) + 1);
        }

        const targetSummary = summarizeCalendarSyncMutationTarget(mutation);
        targetSummaries.set(targetSummary, (targetSummaries.get(targetSummary) ?? 0) + 1);
    }

    calendarSyncDebugMutationCallbackId += 1;
    calendarSyncDebugMutationSummaries.push({
        callbackId: calendarSyncDebugMutationCallbackId,
        mutationCount: mutations.length,
        attributeNames: Array.from(attributeNames.entries())
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .map(([name, count]) => `${name}:${count}`)
            .slice(0, 5),
        targetSummaries: Array.from(targetSummaries.entries())
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .map(([name, count]) => `${name}:${count}`)
            .slice(0, 5)
    });

    while (calendarSyncDebugMutationSummaries.length > 5) {
        calendarSyncDebugMutationSummaries.shift();
    }
}

function summarizeCalendarSyncMutationTarget(mutation: MutationRecord): string {
    const targetElement = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement;

    if (!(targetElement instanceof Element)) {
        return mutation.type;
    }

    const dataTestId = targetElement.getAttribute("data-testid");
    if (typeof dataTestId === "string" && dataTestId.length > 0) {
        return `${mutation.type}:${targetElement.tagName.toLowerCase()}[data-testid=${dataTestId}]`;
    }

    const className = typeof targetElement.className === "string"
        ? targetElement.className.trim().split(/\s+/).filter((name) => name.length > 0).slice(0, 2).join(".")
        : "";
    if (className.length > 0) {
        return `${mutation.type}:${targetElement.tagName.toLowerCase()}.${className}`;
    }

    return `${mutation.type}:${targetElement.tagName.toLowerCase()}`;
}

function recordCalendarSyncDebugEvent(reason: string, kind: keyof CalendarSyncDebugCounters): void {
    if (!isCalendarSyncDebugEnabled()) {
        return;
    }

    const counters = getCalendarSyncDebugCounters(reason);
    counters[kind] += 1;
    calendarSyncDebugDirty = true;
}

function flushCalendarSyncDebugLog(): void {
    if (!isCalendarSyncDebugEnabled() || !calendarSyncDebugDirty || calendarSyncDebugCounters.size === 0) {
        return;
    }

    calendarSyncDebugRunId += 1;
    const summary = Array.from(calendarSyncDebugCounters.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([reason, counters]) => ({
            reason,
            ...counters
        }));

    const snapshot: CalendarSyncDebugSnapshot = {
        runId: calendarSyncDebugRunId,
        href: window.location.href,
        capturedAt: new Date().toISOString(),
        summary,
        mutationObserverSummaries: calendarSyncDebugMutationSummaries.slice()
    };

    console.info(`[${SCRIPT_NAME}] calendar sync debug`, snapshot);
    writeCalendarSyncDebugSnapshot(snapshot);

    calendarSyncDebugCounters.clear();
    calendarSyncDebugMutationSummaries.length = 0;
    calendarSyncDebugDirty = false;
}

function writeCalendarSyncDebugSnapshot(snapshot: CalendarSyncDebugSnapshot): void {
    writeCalendarSyncDebugSnapshotElement(snapshot);

    try {
        window.localStorage.setItem(CALENDAR_SYNC_DEBUG_LAST_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
        // Ignore debug snapshot persistence failures.
    }
}

function writeCalendarSyncDebugSnapshotElement(snapshot: CalendarSyncDebugSnapshot): void {
    if (!(document.body instanceof HTMLElement)) {
        return;
    }

    const element = document.querySelector<HTMLElement>(`[${CALENDAR_SYNC_DEBUG_SNAPSHOT_ATTRIBUTE}]`) ?? document.createElement("script");
    element.setAttribute(CALENDAR_SYNC_DEBUG_SNAPSHOT_ATTRIBUTE, "");
    element.setAttribute("type", "application/json");
    const nextText = JSON.stringify(snapshot);
    if (element.textContent !== nextText) {
        element.textContent = nextText;
    }

    if (element.parentElement !== document.body) {
        document.body.append(element);
    }
}

function queueCalendarSync(options: { force?: boolean; reason?: string } = {}): void {
    const nextSignature = getCalendarSyncSignature();
    const force = options.force === true;
    const reason = options.reason ?? "unspecified";

    recordCalendarSyncDebugEvent(reason, "requested");
    if (force) {
        recordCalendarSyncDebugEvent(reason, "forced");
    }

    if (calendarSyncRunning) {
        pendingCalendarSyncSignature = nextSignature;
        pendingCalendarSyncForce = pendingCalendarSyncForce || force;
        recordCalendarSyncDebugEvent(reason, "queuedWhileRunning");
        return;
    }

    if (calendarSyncQueued) {
        if (!force && nextSignature === queuedCalendarSyncSignature) {
            recordCalendarSyncDebugEvent(reason, "skippedQueued");
            return;
        }

        queuedCalendarSyncSignature = nextSignature;
        queuedCalendarSyncForce = queuedCalendarSyncForce || force;
        recordCalendarSyncDebugEvent(reason, "scheduled");
        return;
    }

    if (!force && nextSignature === completedCalendarSyncSignature) {
        recordCalendarSyncDebugEvent(reason, "skippedCompleted");
        return;
    }

    calendarSyncQueued = true;
    queuedCalendarSyncSignature = nextSignature;
    queuedCalendarSyncForce = force;
    recordCalendarSyncDebugEvent(reason, "scheduled");
    window.requestAnimationFrame(() => {
        void runCalendarSync();
    });
}

function requestCalendarScrollRestore(): void {
    pendingCalendarScrollRestore = {
        x: window.scrollX,
        y: window.scrollY
    };
}

function restorePendingCalendarScrollPosition(): void {
    const scrollRestore = pendingCalendarScrollRestore;
    pendingCalendarScrollRestore = null;
    if (scrollRestore === null) {
        return;
    }

    window.requestAnimationFrame(() => {
        window.scrollTo(scrollRestore.x, scrollRestore.y);
    });
}

async function runCalendarSync(): Promise<void> {
    calendarSyncRunning = true;
    calendarSyncQueued = false;
    queuedCalendarSyncForce = false;

    try {
        const batchDateKey = getCurrentBatchDateKey();
        const facilityCacheKey = await resolveCurrentFacilityCacheKey();
        syncCacheBatch(batchDateKey, facilityCacheKey);
        const syncContext = createSyncContext(batchDateKey, facilityCacheKey);
        const analysisDate = activeAnalyzeDate;

        if (analysisDate !== null) {
            preparePendingRankRecommendationFocusForAnalyze(analysisDate);
            if (!hasCurrentSalesSettingUi()) {
                cleanupCurrentUiSalesSettingRoot();
            }
            prefetchSalesSettingGroupRooms(analysisDate, batchDateKey);
            cleanupSalesSettingRoomDeltas();
        } else {
            salesSettingBookingCurveOpenState.clear();
            cleanupSalesSettingOverallSummary();
            cleanupSalesSettingRankOverview();
            cleanupSalesSettingRankDetails();
            cleanupSalesSettingGroupRooms();
            cleanupSalesSettingBookingCurveCards();
            cleanupSalesSettingRoomDeltas();
            cleanupCurrentUiSalesSettingRoot();
        }

        const salesSettingPreparedDataPromise = analysisDate === null
            ? Promise.resolve(null)
            : prepareSalesSettingSyncData(analysisDate, batchDateKey, syncContext);

        await Promise.all([
            syncMonthlyCalendarGroupRooms(batchDateKey),
            syncMonthlyCalendarLatestChanges(),
            analysisDate === null
                ? syncRankRecommendationList(batchDateKey, facilityCacheKey)
                : Promise.resolve(cleanupRankRecommendationList()),
            analysisDate === null
                ? Promise.resolve(cleanupAnalyzeRankRecommendationList())
                : syncAnalyzeRankRecommendationList(analysisDate, batchDateKey, facilityCacheKey),
            analysisDate === null
                ? Promise.resolve()
                : salesSettingPreparedDataPromise.then((preparedData) => syncSalesSettingGroupRooms(preparedData, analysisDate, batchDateKey, syncContext)),
            analysisDate === null
                ? Promise.resolve()
                : salesSettingPreparedDataPromise.then((preparedData) => syncSalesSettingOverallSummary(preparedData, analysisDate, batchDateKey, syncContext))
        ]);

        if (analysisDate !== null) {
            await salesSettingPreparedDataPromise.then((preparedData) => syncSalesSettingRankInsights(analysisDate, syncContext, preparedData));
            await salesSettingPreparedDataPromise.then((preparedData) => applyPendingRankRecommendationFocus(analysisDate, preparedData));
            scheduleCompetitorPriceSnapshot(analysisDate, batchDateKey, facilityCacheKey);
            trySchedulePendingCompetitorPriceTabSnapshotRequest();
        }

        if (hasSalesSettingWarmCacheEligiblePage()) {
            scheduleSalesSettingWarmCache(batchDateKey, batchDateKey, facilityCacheKey, analysisDate);
        } else {
            resetSalesSettingWarmCache("対象画面外");
        }
    } finally {
        calendarSyncRunning = false;
        completedCalendarSyncSignature = getCalendarSyncSignature();
        if (isCalendarSyncDebugEnabled()) {
            recordCalendarSyncDebugEvent("runCalendarSync", "executed");
            flushCalendarSyncDebugLog();
        }

        const pendingSignature = pendingCalendarSyncSignature;
        const pendingForce = pendingCalendarSyncForce;
        pendingCalendarSyncSignature = "";
        pendingCalendarSyncForce = false;

        if (pendingForce || (pendingSignature !== "" && pendingSignature !== completedCalendarSyncSignature)) {
            queueCalendarSync({ force: pendingForce, reason: "pending-flush" });
        } else {
            restorePendingCalendarScrollPosition();
        }
    }
}

function createSyncContext(batchDateKey: string, facilityCacheKey: string): SyncContext {
    syncVersion += 1;

    return {
        version: syncVersion,
        analysisDate: activeAnalyzeDate,
        batchDateKey,
        facilityCacheKey
    };
}

function scheduleCompetitorPriceSnapshot(
    analysisDate: string,
    batchDateKey: string,
    facilityCacheKey: string,
    source: "analyze-open" | "competitor-tab" = "analyze-open"
): void {
    const attemptKey = buildCompetitorPriceSnapshotAttemptKey(facilityCacheKey, analysisDate, batchDateKey, source);
    const attemptKeys = source === "competitor-tab"
        ? competitorPriceSnapshotPriorityAttemptKeys
        : competitorPriceSnapshotAttemptKeys;
    if (attemptKeys.has(attemptKey)) {
        return;
    }

    attemptKeys.add(attemptKey);
    void runCompetitorPriceSnapshotSave(analysisDate, batchDateKey, facilityCacheKey, source, attemptKeys, attemptKey)
        .then((stored) => {
            if (stored && source === "competitor-tab") {
                scheduleCompetitorPriceSnapshotBackgroundQueue(analysisDate, batchDateKey, facilityCacheKey);
            }
        });
}

async function runCompetitorPriceSnapshotSave(
    analysisDate: string,
    batchDateKey: string,
    facilityCacheKey: string,
    source: "analyze-open" | "competitor-tab",
    attemptKeys: Set<string>,
    attemptKey: string,
    options: { updateVisibleState?: boolean } = {}
): Promise<boolean> {
    const updateVisibleState = options.updateVisibleState !== false;
    if (updateVisibleState) {
        competitorPriceSnapshotUiState = {
            ...competitorPriceSnapshotUiState,
            status: "saving",
            facilityId: facilityCacheKey,
            stayDate: analysisDate,
            source,
            reason: null,
            errorMessage: null,
            updatedAt: new Date().toISOString()
        };
        renderSalesSettingWarmCacheIndicator();
        renderCompetitorPriceOverviewFromState();
        void refreshCompetitorPriceSnapshotSeries(facilityCacheKey, analysisDate);
    }

    try {
        const result = await persistCompetitorPriceSnapshotsForSource(facilityCacheKey, analysisDate, source);
        if (!result.stored) {
            if (updateVisibleState) {
                competitorPriceSnapshotUiState = {
                    ...competitorPriceSnapshotUiState,
                    status: "skipped",
                    facilityId: facilityCacheKey,
                    stayDate: analysisDate,
                    source,
                    records: [],
                    latestRecord: null,
                    previousRecord: null,
                    reason: result.reason ?? "unknown",
                    errorMessage: null,
                    updatedAt: new Date().toISOString()
                };
                renderSalesSettingWarmCacheIndicator();
                renderCompetitorPriceOverviewFromState();
            }
            console.info(`[${SCRIPT_NAME}] competitor price snapshot skipped`, {
                analysisDate,
                batchDateKey,
                facilityCacheKey,
                reason: result.reason
            });
            return false;
        }

        if (updateVisibleState) {
            competitorPriceSnapshotUiState = {
                ...competitorPriceSnapshotUiState,
                status: "stored",
                facilityId: facilityCacheKey,
                stayDate: analysisDate,
                source,
                records: mergeCompetitorPriceSnapshotRecordList(competitorPriceSnapshotUiState.records, result.records),
                latestRecord: result.latestRecord,
                previousRecord: result.previousRecord,
                reason: null,
                errorMessage: null,
                updatedAt: new Date().toISOString()
            };
            renderSalesSettingWarmCacheIndicator();
            renderCompetitorPriceOverviewFromState();
        }
        console.info(`[${SCRIPT_NAME}] competitor price snapshot stored`, {
            analysisDate,
            batchDateKey,
            facilityCacheKey,
            storedCount: result.records.length,
            conditionSignature: result.latestRecord?.conditionSignature,
            previousFetchedAt: result.previousRecord?.fetchedAt ?? null
        });
        return true;
    } catch (error: unknown) {
        attemptKeys.delete(attemptKey);
        if (updateVisibleState) {
            competitorPriceSnapshotUiState = {
                ...competitorPriceSnapshotUiState,
                status: "error",
                facilityId: facilityCacheKey,
                stayDate: analysisDate,
                source,
                reason: null,
                errorMessage: getErrorMessage(error),
                updatedAt: new Date().toISOString()
            };
            renderSalesSettingWarmCacheIndicator();
            renderCompetitorPriceOverviewFromState();
        }
        console.warn(`[${SCRIPT_NAME}] failed to persist competitor price snapshot`, {
            analysisDate,
            batchDateKey,
            facilityCacheKey,
            error
        });
        return false;
    }
}

async function runPriceTrendFetch(
    analysisDate: string,
    facilityCacheKey: string
): Promise<boolean> {
    resetPriceTrendBackgroundQueue("初回取得を開始");
    const initialScopes = buildInitialPriceTrendRequestScopes();
    priceTrendUiState = {
        ...priceTrendUiState,
        status: "loading",
        facilityId: facilityCacheKey,
        stayDate: analysisDate,
        reason: null,
        errorMessage: null,
        updatedAt: new Date().toISOString()
    };
    renderPriceTrendOverviewFromState();
    void refreshPriceTrendRecords(facilityCacheKey, analysisDate);

    try {
        const requestContext = await loadPriceTrendRequestContext();
        priceTrendRequestContext = requestContext;
        const result = await fetchAndPersistPriceTrendRecords({
            facilityId: facilityCacheKey,
            stayDate: analysisDate,
            scopes: initialScopes,
            requestContext
        });
        if (!result.stored) {
            priceTrendUiState = {
                ...priceTrendUiState,
                status: "skipped",
                facilityId: facilityCacheKey,
                stayDate: analysisDate,
                records: result.records,
                reason: result.reason ?? "unknown",
                errorMessage: null,
                updatedAt: new Date().toISOString()
            };
            renderPriceTrendOverviewFromState();
            console.info(`[${SCRIPT_NAME}] price trend fetch skipped`, {
                analysisDate,
                facilityCacheKey,
                reason: result.reason
            });
            if (result.reason === "unsupported-stay-date" || result.reason === "indexeddb-unavailable") {
                resetPriceTrendBackgroundQueue(result.reason);
            }
            return false;
        }

        priceTrendUiState = {
            ...priceTrendUiState,
            status: "stored",
            facilityId: facilityCacheKey,
            stayDate: analysisDate,
            records: result.records,
            reason: null,
            errorMessage: null,
            updatedAt: new Date().toISOString()
        };
        renderPriceTrendOverviewFromState();
        console.info(`[${SCRIPT_NAME}] price trend records stored`, {
            analysisDate,
            facilityCacheKey,
            storedCount: result.records.length
        });
        schedulePriceTrendBackgroundQueue(analysisDate, facilityCacheKey, initialScopes);
        return true;
    } catch (error: unknown) {
        priceTrendUiState = {
            ...priceTrendUiState,
            status: "error",
            facilityId: facilityCacheKey,
            stayDate: analysisDate,
            reason: null,
            errorMessage: getErrorMessage(error),
            updatedAt: new Date().toISOString()
        };
        renderPriceTrendOverviewFromState();
        console.warn(`[${SCRIPT_NAME}] failed to fetch price trend records`, {
            analysisDate,
            facilityCacheKey,
            error
        });
        return false;
    }
}

function buildInitialPriceTrendRequestScopes(): PriceTrendRequestScope[] {
    const scopes: PriceTrendRequestScope[] = [];
    for (const mealType of PRICE_TREND_MEAL_TYPE_REQUESTS) {
        for (const numGuests of PRICE_TREND_GUEST_COUNTS) {
            scopes.push({
                numGuests,
                mealType,
                roomType: null
            });
        }
    }
    return scopes;
}

function schedulePriceTrendBackgroundQueue(
    analysisDate: string,
    facilityCacheKey: string,
    initialScopes: readonly PriceTrendRequestScope[]
): void {
    const initialScopeKeys = new Set(initialScopes.map(buildPriceTrendRequestScopeKey));
    priceTrendBackgroundQueue = buildAllPriceTrendRequestScopes()
        .filter((scope) => !initialScopeKeys.has(buildPriceTrendRequestScopeKey(scope)));
    priceTrendBackgroundQueueRunning = false;
    if (priceTrendBackgroundQueueTimeoutId !== null) {
        window.clearTimeout(priceTrendBackgroundQueueTimeoutId);
        priceTrendBackgroundQueueTimeoutId = null;
    }
    priceTrendBackgroundQueueState = {
        ...createInitialPriceTrendBackgroundQueueState(),
        status: priceTrendBackgroundQueue.length === 0 ? "complete" : "running",
        facilityId: facilityCacheKey,
        stayDate: analysisDate,
        total: priceTrendBackgroundQueue.length
    };
    renderPriceTrendOverviewFromState();
    schedulePriceTrendBackgroundQueueDrain(PRICE_TREND_BACKGROUND_QUEUE_INTERVAL_MS);
}

function resetPriceTrendBackgroundQueue(reason: string): void {
    if (priceTrendBackgroundQueueTimeoutId !== null) {
        window.clearTimeout(priceTrendBackgroundQueueTimeoutId);
        priceTrendBackgroundQueueTimeoutId = null;
    }
    priceTrendBackgroundQueueRunning = false;
    priceTrendBackgroundQueue = [];
    priceTrendRequestContext = null;
    priceTrendBackgroundQueueState = {
        ...createInitialPriceTrendBackgroundQueueState(),
        pauseReason: reason
    };
    renderPriceTrendOverviewFromState();
}

function schedulePriceTrendBackgroundQueueDrain(delayMs: number = PRICE_TREND_BACKGROUND_QUEUE_INTERVAL_MS): void {
    if (priceTrendBackgroundQueueTimeoutId !== null) {
        window.clearTimeout(priceTrendBackgroundQueueTimeoutId);
    }
    priceTrendBackgroundQueueTimeoutId = window.setTimeout(() => {
        priceTrendBackgroundQueueTimeoutId = null;
        void drainPriceTrendBackgroundQueue();
    }, delayMs);
}

async function drainPriceTrendBackgroundQueue(): Promise<void> {
    if (priceTrendBackgroundQueueRunning || priceTrendBackgroundQueueState.status !== "running") {
        return;
    }
    if (document.hidden) {
        stopPriceTrendBackgroundQueue("タブ非表示");
        return;
    }
    if (
        priceTrendBackgroundQueueState.facilityId === null
        || priceTrendBackgroundQueueState.stayDate === null
        || activeAnalyzeDate !== priceTrendBackgroundQueueState.stayDate
        || activeFacilityCacheKey !== priceTrendBackgroundQueueState.facilityId
        || resolvePriceTrendTabSectionTarget() === null
    ) {
        stopPriceTrendBackgroundQueue("対象画面外");
        return;
    }
    const facilityId = priceTrendBackgroundQueueState.facilityId;
    const stayDate = priceTrendBackgroundQueueState.stayDate;

    const scope = priceTrendBackgroundQueue.shift() ?? null;
    if (scope === null) {
        priceTrendBackgroundQueueState = {
            ...priceTrendBackgroundQueueState,
            status: "complete",
            currentScope: null,
            pauseReason: null
        };
        renderPriceTrendOverviewFromState();
        return;
    }

    priceTrendBackgroundQueueRunning = true;
    priceTrendBackgroundQueueState = {
        ...priceTrendBackgroundQueueState,
        currentScope: scope,
        pauseReason: null
    };
    renderPriceTrendOverviewFromState();

    try {
        const requestContext = priceTrendRequestContext ?? await loadPriceTrendRequestContext();
        priceTrendRequestContext = requestContext;
        const result = await fetchAndPersistPriceTrendRecords({
            facilityId,
            stayDate,
            scopes: [scope],
            requestContext
        });
        priceTrendBackgroundQueueState = {
            ...priceTrendBackgroundQueueState,
            processed: priceTrendBackgroundQueueState.processed + 1,
            stored: priceTrendBackgroundQueueState.stored + (result.stored ? 1 : 0),
            skipped: priceTrendBackgroundQueueState.skipped + (result.stored ? 0 : 1),
            consecutiveErrors: 0,
            currentScope: null
        };
        await refreshPriceTrendRecords(facilityId, stayDate);
    } catch (error: unknown) {
        const consecutiveErrors = priceTrendBackgroundQueueState.consecutiveErrors + 1;
        priceTrendBackgroundQueueState = {
            ...priceTrendBackgroundQueueState,
            processed: priceTrendBackgroundQueueState.processed + 1,
            errors: priceTrendBackgroundQueueState.errors + 1,
            consecutiveErrors,
            currentScope: null,
            pauseReason: getErrorMessage(error)
        };
        console.warn(`[${SCRIPT_NAME}] failed to fetch price trend background record`, {
            analysisDate: priceTrendBackgroundQueueState.stayDate,
            facilityCacheKey: priceTrendBackgroundQueueState.facilityId,
            scope,
            error
        });
        if (consecutiveErrors >= PRICE_TREND_BACKGROUND_QUEUE_MAX_CONSECUTIVE_ERRORS) {
            stopPriceTrendBackgroundQueue("連続エラー");
        }
    } finally {
        priceTrendBackgroundQueueRunning = false;
    }

    renderPriceTrendOverviewFromState();
    if (priceTrendBackgroundQueueState.status === "running") {
        schedulePriceTrendBackgroundQueueDrain();
    }
}

function stopPriceTrendBackgroundQueue(reason: string): void {
    if (priceTrendBackgroundQueueTimeoutId !== null) {
        window.clearTimeout(priceTrendBackgroundQueueTimeoutId);
        priceTrendBackgroundQueueTimeoutId = null;
    }
    priceTrendBackgroundQueueState = {
        ...priceTrendBackgroundQueueState,
        status: "stopped",
        currentScope: null,
        pauseReason: reason
    };
    renderPriceTrendOverviewFromState();
}

function resumePriceTrendBackgroundQueueAfterVisibility(): void {
    if (
        priceTrendBackgroundQueueState.status !== "stopped"
        || priceTrendBackgroundQueueState.pauseReason !== "タブ非表示"
        || priceTrendBackgroundQueue.length === 0
        || document.hidden
    ) {
        return;
    }
    priceTrendBackgroundQueueState = {
        ...priceTrendBackgroundQueueState,
        status: "running",
        pauseReason: null
    };
    renderPriceTrendOverviewFromState();
    schedulePriceTrendBackgroundQueueDrain(0);
}

function buildPriceTrendRequestScopeKey(scope: PriceTrendRequestScope): string {
    return [
        `guest:${scope.numGuests}`,
        `meal:${scope.mealType}`,
        `room:${scope.roomType ?? "unspecified"}`
    ].join("|");
}

async function refreshPriceTrendRecords(facilityCacheKey: string, analysisDate: string): Promise<void> {
    if (
        priceTrendUiState.facilityId !== facilityCacheKey
        || priceTrendUiState.stayDate !== analysisDate
    ) {
        priceTrendUiState = {
            ...priceTrendUiState,
            facilityId: facilityCacheKey,
            stayDate: analysisDate
        };
    }

    const records = await readLatestPriceTrendRecordsForStayDate(facilityCacheKey, analysisDate)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read price trend records`, {
                analysisDate,
                facilityCacheKey,
                error
            });
            return [];
        });
    if (
        activeAnalyzeDate !== analysisDate
        || activeFacilityCacheKey !== facilityCacheKey
        || records.length === 0
    ) {
        return;
    }

    priceTrendUiState = {
        ...priceTrendUiState,
        status: priceTrendUiState.status === "idle" ? "stored" : priceTrendUiState.status,
        records,
        reason: null,
        errorMessage: null,
        updatedAt: new Date().toISOString()
    };
    renderPriceTrendOverviewFromState();
}

function scheduleCompetitorPriceSnapshotBackgroundQueue(
    priorityStayDate: string,
    batchDateKey: string,
    facilityCacheKey: string
): void {
    competitorPriceSnapshotBackgroundQueue.length = 0;
    competitorPriceSnapshotBackgroundTaskKeys.clear();
    for (const stayDate of buildCompetitorPriceSnapshotBackgroundStayDates(priorityStayDate)) {
        if (stayDate === priorityStayDate) {
            continue;
        }
        const taskKey = buildCompetitorPriceSnapshotAttemptKey(facilityCacheKey, stayDate, batchDateKey, "competitor-tab");
        if (competitorPriceSnapshotPriorityAttemptKeys.has(taskKey) || competitorPriceSnapshotBackgroundTaskKeys.has(taskKey)) {
            continue;
        }
        competitorPriceSnapshotBackgroundTaskKeys.add(taskKey);
        competitorPriceSnapshotBackgroundQueue.push({
            stayDate,
            priorityStayDate,
            batchDateKey,
            facilityCacheKey
        });
    }

    competitorPriceSnapshotBackgroundProgress = buildCompetitorPriceSnapshotBackgroundProgress();
    renderSalesSettingWarmCacheIndicator();
    scheduleCompetitorPriceSnapshotBackgroundDrain();
}

function buildCompetitorPriceSnapshotBackgroundProgress(): CompetitorPriceSnapshotBackgroundProgress {
    const targetStayDates = competitorPriceSnapshotBackgroundQueue
        .map((task) => task.stayDate)
        .sort();
    if (targetStayDates.length === 0) {
        return createInitialCompetitorPriceSnapshotBackgroundProgress();
    }

    return {
        status: "running",
        total: targetStayDates.length,
        processed: 0,
        currentTask: null,
        targetFromDate: targetStayDates[0] ?? null,
        targetToDate: targetStayDates[targetStayDates.length - 1] ?? null,
        pauseReason: null
    };
}

function buildCompetitorPriceSnapshotBackgroundStayDates(priorityStayDate: string): string[] {
    const stayDates: string[] = [];
    const seen = new Set<string>();
    const addDate = (stayDate: string | null): void => {
        const compactStayDate = stayDate === null ? null : toCompactDateKey(stayDate);
        if (compactStayDate === null || seen.has(compactStayDate)) {
            return;
        }
        seen.add(compactStayDate);
        stayDates.push(compactStayDate);
    };

    for (const stayDate of getSalesSettingWarmCacheWeekStayDates(priorityStayDate)) {
        addDate(stayDate);
    }
    for (const stayDate of getSalesSettingWarmCacheMonthStayDates(priorityStayDate)) {
        addDate(stayDate);
    }
    return stayDates;
}

function scheduleCompetitorPriceSnapshotBackgroundDrain(delayMs = COMPETITOR_PRICE_SNAPSHOT_BACKGROUND_INTERVAL_MS): void {
    if (competitorPriceSnapshotBackgroundTimeoutId !== null || competitorPriceSnapshotBackgroundRunning) {
        return;
    }

    competitorPriceSnapshotBackgroundTimeoutId = window.setTimeout(() => {
        competitorPriceSnapshotBackgroundTimeoutId = null;
        void drainCompetitorPriceSnapshotBackgroundQueue();
    }, delayMs);
}

async function drainCompetitorPriceSnapshotBackgroundQueue(): Promise<void> {
    if (competitorPriceSnapshotBackgroundRunning) {
        return;
    }
    competitorPriceSnapshotBackgroundRunning = true;

    try {
        const task = competitorPriceSnapshotBackgroundQueue.shift();
        if (task === undefined) {
            return;
        }

        if (
            document.visibilityState === "hidden"
            || activeAnalyzeDate === null
            || activeAnalyzeDate !== task.priorityStayDate
            || activeBatchDateKey !== task.batchDateKey
            || activeFacilityCacheKey !== task.facilityCacheKey
        ) {
            competitorPriceSnapshotBackgroundQueue.length = 0;
            competitorPriceSnapshotBackgroundTaskKeys.clear();
            competitorPriceSnapshotBackgroundProgress = {
                ...competitorPriceSnapshotBackgroundProgress,
                status: "stopped",
                currentTask: null,
                pauseReason: "画面変更またはタブ非表示"
            };
            renderSalesSettingWarmCacheIndicator();
            return;
        }

        competitorPriceSnapshotBackgroundProgress = {
            ...competitorPriceSnapshotBackgroundProgress,
            status: "running",
            currentTask: task,
            pauseReason: null
        };
        renderSalesSettingWarmCacheIndicator();

        const attemptKey = buildCompetitorPriceSnapshotAttemptKey(task.facilityCacheKey, task.stayDate, task.batchDateKey, "competitor-tab");
        if (!competitorPriceSnapshotPriorityAttemptKeys.has(attemptKey)) {
            competitorPriceSnapshotPriorityAttemptKeys.add(attemptKey);
            await runCompetitorPriceSnapshotSave(
                task.stayDate,
                task.batchDateKey,
                task.facilityCacheKey,
                "competitor-tab",
                competitorPriceSnapshotPriorityAttemptKeys,
                attemptKey,
                { updateVisibleState: false }
            );
        }

        competitorPriceSnapshotBackgroundProgress = {
            ...competitorPriceSnapshotBackgroundProgress,
            processed: Math.min(competitorPriceSnapshotBackgroundProgress.total, competitorPriceSnapshotBackgroundProgress.processed + 1),
            currentTask: null,
            pauseReason: null
        };
        renderSalesSettingWarmCacheIndicator();
    } finally {
        competitorPriceSnapshotBackgroundRunning = false;
        if (competitorPriceSnapshotBackgroundQueue.length > 0) {
            scheduleCompetitorPriceSnapshotBackgroundDrain();
        } else if (competitorPriceSnapshotBackgroundProgress.status === "running") {
            competitorPriceSnapshotBackgroundProgress = {
                ...competitorPriceSnapshotBackgroundProgress,
                status: "complete",
                currentTask: null,
                pauseReason: "完了"
            };
            renderSalesSettingWarmCacheIndicator();
        }
    }
}

function buildCompetitorPriceSnapshotAttemptKey(
    facilityCacheKey: string,
    analysisDate: string,
    batchDateKey: string,
    source: "analyze-open" | "competitor-tab"
): string {
    return `${facilityCacheKey}:${analysisDate}:${batchDateKey}:${source}`;
}

interface PersistCompetitorPriceSnapshotsForSourceResult {
    stored: boolean;
    records: CompetitorPriceSnapshotRecord[];
    latestRecord: CompetitorPriceSnapshotRecord | null;
    previousRecord: CompetitorPriceSnapshotRecord | null;
    reason?: "indexeddb-unavailable" | "no-competitors";
}

async function persistCompetitorPriceSnapshotsForSource(
    facilityCacheKey: string,
    analysisDate: string,
    source: "analyze-open" | "competitor-tab"
): Promise<PersistCompetitorPriceSnapshotsForSourceResult> {
    const roomTypeRequests = [null, ...COMPETITOR_PRICE_ROOM_TYPE_REQUESTS.map((roomType) => [roomType])];
    const records: CompetitorPriceSnapshotRecord[] = [];
    let previousRecord: CompetitorPriceSnapshotRecord | null = null;
    let skipReason: "indexeddb-unavailable" | "no-competitors" | undefined;
    const requestContextBase: CompetitorPriceRequestContextBase = await loadCompetitorPriceRequestContextBase();

    for (const jalanRoomTypes of roomTypeRequests) {
        const result = await persistCompetitorPriceSnapshot({
            facilityId: facilityCacheKey,
            stayDate: analysisDate,
            source,
            jalanRoomTypes,
            requestContextBase
        });
        if (!result.stored) {
            skipReason = result.reason;
            if (records.length === 0) {
                const skippedResult: PersistCompetitorPriceSnapshotsForSourceResult = {
                    stored: false,
                    records: [],
                    latestRecord: null,
                    previousRecord: null
                };
                if (skipReason !== undefined) {
                    skippedResult.reason = skipReason;
                }
                return {
                    ...skippedResult
                };
            }
            continue;
        }

        if (result.record !== null) {
            records.push(result.record);
        }
        if (jalanRoomTypes === null) {
            previousRecord = result.previousRecord;
        }
    }

    const latestRecord = records.find((record) => isUnspecifiedCompetitorPriceRecord(record))
        ?? records[records.length - 1]
        ?? null;
    return {
        stored: records.length > 0,
        records,
        latestRecord,
        previousRecord
    };
}

async function refreshCompetitorPriceSnapshotSeries(facilityCacheKey: string, analysisDate: string): Promise<void> {
    const snapshotSeries = await readCompetitorPriceSnapshotSeriesForStayDate(facilityCacheKey, analysisDate)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read competitor price snapshot series`, {
                analysisDate,
                facilityCacheKey,
                error
            });
            return null;
        });
    if (snapshotSeries === null || snapshotSeries.latestRecord === null) {
        return;
    }

    if (
        competitorPriceSnapshotUiState.facilityId !== facilityCacheKey
        || competitorPriceSnapshotUiState.stayDate !== analysisDate
    ) {
        return;
    }

    competitorPriceSnapshotUiState = {
        ...competitorPriceSnapshotUiState,
        records: snapshotSeries.records,
        latestRecord: snapshotSeries.latestRecord,
        previousRecord: snapshotSeries.previousRecord
    };
    renderSalesSettingWarmCacheIndicator();
    renderCompetitorPriceOverviewFromState();
}

function isSyncContextStale(syncContext: SyncContext): boolean {
    return syncContext.version !== syncVersion
        || syncContext.analysisDate !== activeAnalyzeDate
        || syncContext.batchDateKey !== activeBatchDateKey
        || syncContext.facilityCacheKey !== activeFacilityCacheKey;
}

async function syncMonthlyCalendarGroupRooms(batchDateKey: string): Promise<void> {
    const cells = collectMonthlyCalendarCells();
    ensureGroupRoomStyles();
    ensureGroupRoomToggle(cells.length > 0);
    renderSalesSettingWarmCacheMonthControls(cells);

    if (cells.length === 0) {
        cleanupMonthlyCalendarGroupRooms();
        return;
    }

    if (!isGroupRoomCalendarVisible()) {
        cleanupMonthlyCalendarGroupRooms();
        return;
    }

    renderCachedMonthlyCalendarGroupRooms(batchDateKey, cells);

    await Promise.all(cells.map(async (cell) => {
        const lookupDate = getLookupDate(cell.stayDate);
        const groupRoomCount = await fetchGroupRoomCount(cell.stayDate, lookupDate, batchDateKey);

        if (!cell.anchorElement.isConnected) {
            return;
        }

        renderGroupRoomCount(cell, groupRoomCount);
    }));
}

function renderSalesSettingWarmCacheMonthControls(cells: MonthlyCalendarCell[]): void {
    const existingElement = document.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_MONTH_CONTROLS_ATTRIBUTE}]`);
    if (cells.length === 0 || activeAnalyzeDate !== null) {
        existingElement?.remove();
        return;
    }

    const calendarElement = resolveMonthlyCalendarContainerElement(cells);
    if (!(calendarElement instanceof HTMLElement)) {
        existingElement?.remove();
        return;
    }

    const monthKeys = getSalesSettingWarmCachePriorityMonthKeys(cells);
    if (monthKeys.length === 0) {
        existingElement?.remove();
        return;
    }

    const host = resolveSalesSettingWarmCacheMonthControlsHost(cells, calendarElement);
    if (host === null) {
        existingElement?.remove();
        return;
    }

    const controlsElement = existingElement ?? document.createElement("div");
    controlsElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_CONTROLS_ATTRIBUTE, "");

    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_TITLE_ATTRIBUTE, "");
    titleElement.textContent = "候補データ優先取得";

    const hiddenTabToggleElement = createSalesSettingWarmCacheHiddenTabToggleElement();

    const actionsElement = document.createElement("div");
    actionsElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_ACTIONS_ATTRIBUTE, "");
    actionsElement.replaceChildren(...monthKeys.map(createSalesSettingWarmCacheMonthControlElement));

    const inlineStatusElement = document.createElement("div");
    inlineStatusElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_DETAIL_ATTRIBUTE, "");
    inlineStatusElement.textContent = getSalesSettingWarmCacheMonthControlsStatusText();

    controlsElement.replaceChildren(titleElement, hiddenTabToggleElement, actionsElement, inlineStatusElement);

    if (controlsElement.parentElement !== host.parentElement || controlsElement.nextElementSibling !== host.insertBeforeElement) {
        host.parentElement.insertBefore(controlsElement, host.insertBeforeElement);
    }
}

function getSalesSettingWarmCacheMonthControlsStatusText(): string {
    const hiddenTabLabel = isSalesSettingWarmCacheHiddenTabAllowed() ? "非表示中も取得ON" : null;
    if (!shouldShowSalesSettingWarmCacheInlineStatus()) {
        return [
            "表示中の月に必要な根拠データを先に取得できます。",
            hiddenTabLabel
        ].filter((part): part is string => part !== null).join(" / ");
    }
    return [
        getSalesSettingWarmCacheStatusLabel(),
        getSalesSettingWarmCacheDetailLabel(),
        hiddenTabLabel
    ].filter((part): part is string => part !== null && part !== "").join(" / ");
}

function createSalesSettingWarmCacheHiddenTabToggleElement(): HTMLElement {
    const labelElement = document.createElement("label");
    labelElement.setAttribute(SALES_SETTING_WARM_CACHE_HIDDEN_TAB_TOGGLE_ATTRIBUTE, "");
    labelElement.title = "レベアシタブを開いたまま別タブを見ている間も、候補データ取得を続けます。ログアウト時は停止します。";

    const inputElement = document.createElement("input");
    inputElement.type = "checkbox";
    inputElement.checked = isSalesSettingWarmCacheHiddenTabAllowed();
    inputElement.addEventListener("change", () => {
        setSalesSettingWarmCacheHiddenTabAllowed(inputElement.checked);
        renderSalesSettingWarmCacheIndicator();
        if (inputElement.checked && canResumeSalesSettingWarmCache()) {
            scheduleSalesSettingWarmCacheDrain(0);
        }
    });

    const textElement = document.createElement("span");
    textElement.textContent = "非表示中も取得";

    labelElement.append(inputElement, textElement);
    return labelElement;
}

function resolveSalesSettingWarmCacheMonthControlsHost(
    cells: MonthlyCalendarCell[],
    calendarElement: HTMLElement
): { parentElement: HTMLElement; insertBeforeElement: ChildNode | null } | null {
    const rankRecommendationElement = document.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_LIST_ATTRIBUTE}]`);
    const rankRecommendationParentElement = rankRecommendationElement?.parentElement ?? null;
    if (rankRecommendationElement instanceof HTMLElement && rankRecommendationParentElement instanceof HTMLElement) {
        return {
            parentElement: rankRecommendationParentElement,
            insertBeforeElement: rankRecommendationElement
        };
    }

    const rankRecommendationHost = resolveRankRecommendationListHost();
    if (rankRecommendationHost !== null) {
        return {
            parentElement: rankRecommendationHost.parentElement,
            insertBeforeElement: rankRecommendationHost.insertAfterElement.nextSibling ?? null
        };
    }

    const calendarParentElement = calendarElement.parentElement;
    if (calendarParentElement instanceof HTMLElement) {
        return {
            parentElement: calendarParentElement,
            insertBeforeElement: calendarElement
        };
    }

    const firstCell = cells[0];
    const fallbackElement = firstCell?.anchorElement.parentElement ?? null;
    const fallbackParentElement = fallbackElement?.parentElement ?? null;
    if (fallbackElement instanceof HTMLElement && fallbackParentElement instanceof HTMLElement) {
        return {
            parentElement: fallbackParentElement,
            insertBeforeElement: fallbackElement
        };
    }

    return null;
}

function cleanupSalesSettingWarmCacheMonthControls(): void {
    document.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_MONTH_CONTROLS_ATTRIBUTE}]`)?.remove();
}

function getSalesSettingWarmCachePriorityMonthKeys(cells: MonthlyCalendarCell[]): string[] {
    const visibleMonthKeys = getVisibleMonthlyCalendarMonthKeys(cells);
    const firstMonthKey = visibleMonthKeys[0] ?? null;
    if (firstMonthKey === null) {
        return [];
    }

    const monthKeys: string[] = [];
    for (let index = 0; index < SALES_SETTING_WARM_CACHE_PRIORITY_MONTH_BUTTON_COUNT; index += 1) {
        const shiftedDate = shiftMonth(`${firstMonthKey}01`, index);
        if (shiftedDate === null) {
            continue;
        }
        const monthKey = shiftedDate.slice(0, 6);
        if (/^\d{6}$/.test(monthKey)) {
            monthKeys.push(monthKey);
        }
    }
    return monthKeys;
}

function getVisibleMonthlyCalendarMonthKeys(cells: MonthlyCalendarCell[]): string[] {
    const seen = new Set<string>();
    const monthKeys: string[] = [];
    for (const cell of cells) {
        const monthKey = cell.stayDate.slice(0, 6);
        if (!/^\d{6}$/.test(monthKey) || seen.has(monthKey)) {
            continue;
        }
        seen.add(monthKey);
        monthKeys.push(monthKey);
    }
    return monthKeys;
}

function createSalesSettingWarmCacheMonthControlElement(monthKey: string): HTMLElement {
    const progress = getSalesSettingWarmCacheMonthProgress(monthKey);
    const wrapperElement = document.createElement("div");
    wrapperElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE, "");
    wrapperElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_KEY_ATTRIBUTE, monthKey);
    wrapperElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE, progress.status);

    const buttonElement = document.createElement("button");
    buttonElement.type = "button";
    buttonElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_BUTTON_ATTRIBUTE, "");
    buttonElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_KEY_ATTRIBUTE, monthKey);
    const monthLabel = formatSalesSettingWarmCacheMonthLabel(monthKey);
    buttonElement.title = `${monthLabel} の料金調整候補に必要な booking_curve データを優先取得`;
    buttonElement.addEventListener("click", () => {
        requestSalesSettingWarmCachePriorityMonth(monthKey);
    });

    const progressElement = document.createElement("span");
    progressElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_PROGRESS_ATTRIBUTE, "");
    progressElement.setAttribute("role", "progressbar");
    progressElement.setAttribute("aria-label", `${monthLabel} ${progress.label}`);
    progressElement.setAttribute("aria-valuemin", "0");
    progressElement.setAttribute("aria-valuemax", "100");
    progressElement.setAttribute("aria-valuenow", String(progress.percent));
    progressElement.setAttribute("aria-valuetext", progress.label);
    progressElement.style.setProperty("--ra-sales-setting-warm-cache-month-progress", `${progress.percent}%`);

    const labelElement = document.createElement("span");
    labelElement.textContent = `${monthLabel} 取得`;

    buttonElement.append(labelElement);

    const statusElement = document.createElement("span");
    statusElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_STATUS_SUMMARY_ATTRIBUTE, "");
    statusElement.setAttribute("aria-label", `${monthLabel} ${progress.label}`);

    const statusLabelElement = document.createElement("span");
    statusLabelElement.setAttribute(SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE, "");
    statusLabelElement.textContent = progress.label;

    statusElement.append(statusLabelElement, progressElement);

    wrapperElement.append(buttonElement, statusElement);
    return wrapperElement;
}

function requestSalesSettingWarmCachePriorityMonth(monthKey: string): void {
    if (!/^\d{6}$/.test(monthKey)) {
        return;
    }

    const batchDateKey = getCurrentBatchDateKey();
    void resolveCurrentFacilityCacheKey()
        .then((facilityCacheKey) => {
            syncCacheBatch(batchDateKey, facilityCacheKey);
            scheduleSalesSettingWarmCache(batchDateKey, batchDateKey, facilityCacheKey, activeAnalyzeDate, monthKey);
            renderSalesSettingWarmCacheIndicator();
            renderSalesSettingWarmCacheMonthControls(collectMonthlyCalendarCells());
        })
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to request monthly warm cache priority`, {
                monthKey,
                error
            });
        });
}

function getSalesSettingWarmCacheMonthProgress(monthKey: string): { status: string; label: string; percent: number } {
    const monthProgress = Object.entries(salesSettingWarmCacheState.dateProgress)
        .filter(([stayDate]) => stayDate.startsWith(monthKey))
        .map(([, progress]) => progress);
    const total = monthProgress.reduce((sum, progress) => sum + progress.rawTotal + progress.referenceTotal + progress.sameWeekdayTotal, 0);
    const done = monthProgress.reduce((sum, progress) => sum + progress.rawDone + progress.referenceDone + progress.sameWeekdayDone, 0);
    const errors = monthProgress.reduce((sum, progress) => sum + progress.errors, 0);
    const percent = total <= 0 ? 0 : Math.floor((done / total) * 100);
    const isPriorityMonth = salesSettingWarmCacheState.priorityMonth === monthKey;

    if (errors > 0) {
        return { status: "error", label: `エラー ${errors}`, percent: 100 };
    }

    if (total > 0 && done >= total) {
        return { status: "complete", label: "完了", percent: 100 };
    }

    if (salesSettingWarmCacheState.status === "cooldown" && isPriorityMonth) {
        return { status: "cooldown", label: "クールダウン中", percent };
    }

    if (total > 0 && done > 0) {
        return { status: "running", label: `取得中 ${percent}%`, percent: Math.max(8, percent) };
    }

    if (isPriorityMonth && (salesSettingWarmCacheState.status === "building" || salesSettingWarmCacheState.status === "running" || salesSettingWarmCacheState.status === "idle")) {
        return { status: "queued", label: "待機中", percent: 0 };
    }

    return { status: "idle", label: "未優先", percent: 0 };
}

function formatSalesSettingWarmCacheMonthLabel(monthKey: string): string {
    if (!/^\d{6}$/.test(monthKey)) {
        return monthKey;
    }
    return `${monthKey.slice(0, 4)}-${monthKey.slice(4, 6)}`;
}

async function syncMonthlyCalendarLatestChanges(): Promise<void> {
    const cells = collectMonthlyCalendarCells();
    if (cells.length === 0 || activeAnalyzeDate !== null) {
        cleanupMonthlyCalendarLatestChanges();
        return;
    }

    const dateRange = getMonthlyCalendarDateRange(cells);
    if (dateRange === null) {
        cleanupMonthlyCalendarLatestChanges();
        return;
    }

    ensureGroupRoomStyles();

    const statuses = await getLincolnSuggestStatusesForRange(dateRange.fromDateKey, dateRange.toDateKey)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to load calendar latest changes`, {
                fromDateKey: dateRange.fromDateKey,
                toDateKey: dateRange.toDateKey,
                error
            });
            return [] as LincolnSuggestStatus[];
        });
    const latestDaysAgoByStayDate = buildCalendarLatestChangeDaysAgoByStayDate(statuses);

    for (const cell of cells) {
        if (!cell.anchorElement.isConnected) {
            continue;
        }

        renderCalendarLatestChange(cell, latestDaysAgoByStayDate.get(cell.stayDate) ?? null);
    }
}

function getMonthlyCalendarDateRange(cells: MonthlyCalendarCell[]): { fromDateKey: string; toDateKey: string } | null {
    const sortedDates = cells
        .map((cell) => cell.stayDate)
        .sort((left, right) => left.localeCompare(right));
    const fromDateKey = sortedDates[0];
    const toDateKey = sortedDates[sortedDates.length - 1];

    if (fromDateKey === undefined || toDateKey === undefined) {
        return null;
    }

    return { fromDateKey, toDateKey };
}

function isRankRecommendationFixtureModeEnabled(): boolean {
    try {
        return window.localStorage.getItem(RANK_RECOMMENDATION_FIXTURE_MODE_STORAGE_KEY) === "basic";
    } catch {
        return false;
    }
}

function renderRankRecommendationListFixture(
    batchDateKey: string,
    facilityCacheKey: string,
    cells: readonly MonthlyCalendarCell[]
): void {
    const firstStayDate = cells[0]?.stayDate ?? batchDateKey;
    const secondStayDate = cells.find((cell) => cell.stayDate > firstStayDate)?.stayDate ?? firstStayDate;
    const generatedAt = new Date().toISOString();
    const candidates: RankRecommendationCandidate[] = [
        {
            facilityId: facilityCacheKey,
            stayDate: firstStayDate,
            asOfDate: batchDateKey,
            roomGroupId: "fixture-room-a",
            roomGroupName: "fixture room A",
            currentRankCode: "11",
            currentRankName: "11",
            recommendedRankCode: "10",
            recommendedRankName: "10",
            recommendedRankUnavailableReason: null,
            rankOrderSource: "numeric_rank_name",
            action: "raise_watch",
            priority: "high",
            confidence: 0.66,
            reasonCodes: ["fixture: 上げ検討"],
            reasonFingerprint: "fixture-raise-watch",
            diagnostics: ["booking_curve_source_missing"],
            status: "active",
            generatedAt
        },
        {
            facilityId: facilityCacheKey,
            stayDate: secondStayDate,
            asOfDate: batchDateKey,
            roomGroupId: "fixture-room-b",
            roomGroupName: "fixture room B",
            currentRankCode: "10",
            currentRankName: "10",
            recommendedRankCode: "11",
            recommendedRankName: "11",
            recommendedRankUnavailableReason: null,
            rankOrderSource: "numeric_rank_name",
            action: "lower_watch",
            priority: "medium",
            confidence: 0.48,
            reasonCodes: ["fixture: 下げ注意"],
            reasonFingerprint: "fixture-lower-watch",
            diagnostics: ["sales_adr_current_sales_missing"],
            status: "active",
            generatedAt
        }
    ];
    const rankLadder: RankRecommendationRankLadderEntry[] = [
        { price_rank_code: "10", price_rank_name: "10" },
        { price_rank_code: "11", price_rank_name: "11" },
        { price_rank_code: "12", price_rank_name: "12" }
    ];
    const rankOrder = resolveRankRecommendationRankOrder({
        rankLadder,
        override: null
    });
    renderRankRecommendationList(candidates, {
        signature: `fixture:${facilityCacheKey}:${batchDateKey}:${firstStayDate}:${secondStayDate}`,
        statusText: null,
        facilityCacheKey,
        rankLadder,
        rankOrder,
        viewMode: "all",
        targetMonth: null,
        targetMonthOptions: buildRankRecommendationTargetMonthOptions(candidates, getSalesSettingWarmCachePriorityMonthKeys([...cells])),
        hiddenSummary: {
            userDecision: 0,
            resolvedRankChange: 0,
            targetMonth: 0,
            viewMode: 0,
            overflow: 0
        },
        displayInfoByKey: new Map(),
        curvePreviewInfoByKey: new Map(),
        canShowMore: false,
        canResetDisplayLimit: false
    });
}

function buildCalendarLatestChangeDaysAgoByStayDate(statuses: LincolnSuggestStatus[]): Map<string, number> {
    const latestTimestampByStayDate = new Map<string, string>();

    for (const status of statuses) {
        const stayDate = status.date?.trim();
        if (stayDate === undefined || stayDate === "") {
            continue;
        }

        const timestamp = getLincolnSuggestStatusTimestamp(status);
        if (timestamp === null) {
            continue;
        }

        const previousTimestamp = latestTimestampByStayDate.get(stayDate);
        if (previousTimestamp === undefined || Date.parse(timestamp) > Date.parse(previousTimestamp)) {
            latestTimestampByStayDate.set(stayDate, timestamp);
        }
    }

    const daysAgoByStayDate = new Map<string, number>();
    for (const [stayDate, timestamp] of latestTimestampByStayDate.entries()) {
        const daysAgo = getDaysAgo(timestamp);
        if (daysAgo !== null) {
            daysAgoByStayDate.set(stayDate, daysAgo);
        }
    }

    return daysAgoByStayDate;
}

function renderCalendarLatestChange(cell: MonthlyCalendarCell, daysAgo: number | null): void {
    const hostElement = cell.anchorElement;
    const existingElement = hostElement.querySelector<HTMLElement>(`[${CALENDAR_LAST_CHANGE_ATTRIBUTE}]`);

    if (daysAgo === null) {
        existingElement?.remove();
        hostElement?.removeAttribute(CALENDAR_LAST_CHANGE_HOST_ATTRIBUTE);
        return;
    }

    hostElement.setAttribute(CALENDAR_LAST_CHANGE_HOST_ATTRIBUTE, "");
    const nextLabel = formatSalesSettingDaysAgo(daysAgo);
    const labelElement = existingElement ?? document.createElement("div");
    labelElement.setAttribute(CALENDAR_LAST_CHANGE_ATTRIBUTE, "");
    if (labelElement.textContent !== nextLabel) {
        labelElement.textContent = nextLabel;
    }

    if (existingElement === null) {
        hostElement.append(labelElement);
    }
}

function cleanupMonthlyCalendarLatestChanges(): void {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${CALENDAR_LAST_CHANGE_ATTRIBUTE}]`))) {
        element.remove();
    }

    for (const hostElement of Array.from(document.querySelectorAll<HTMLElement>(`[${CALENDAR_LAST_CHANGE_HOST_ATTRIBUTE}]`))) {
        hostElement.removeAttribute(CALENDAR_LAST_CHANGE_HOST_ATTRIBUTE);
    }
}

async function syncRankRecommendationList(batchDateKey: string, facilityCacheKey: string): Promise<void> {
    const cells = collectMonthlyCalendarCells();
    if (cells.length === 0 || activeAnalyzeDate !== null) {
        clearRankRecommendationWarmCachePriorityCandidates();
        cleanupRankRecommendationList();
        return;
    }

    const dateRange = getMonthlyCalendarDateRange(cells);
    if (dateRange === null) {
        clearRankRecommendationWarmCachePriorityCandidates();
        cleanupRankRecommendationList();
        return;
    }

    ensureGroupRoomStyles();
    if (isRankRecommendationFixtureModeEnabled()) {
        renderRankRecommendationListFixture(batchDateKey, facilityCacheKey, cells);
        return;
    }

    const generatedAt = new Date().toISOString();
    let currentSettingsLoadError: unknown = null;
    const [response, rankLadder] = await Promise.all([
        getRankRecommendationCurrentSettingsForRange(dateRange.fromDateKey, dateRange.toDateKey)
            .catch((error: unknown) => {
                currentSettingsLoadError = error;
                console.warn(`[${SCRIPT_NAME}] failed to load rank recommendation current settings`, {
                    fromDateKey: dateRange.fromDateKey,
                    toDateKey: dateRange.toDateKey,
                    error
                });
                return null;
            }),
        getRankRecommendationRankLadder()
            .catch((error: unknown) => {
                console.warn(`[${SCRIPT_NAME}] failed to load rank recommendation rank ladder`, { error });
                return [] as RankRecommendationRankLadderEntry[];
            })
    ]);

    if (activeAnalyzeDate !== null || activeBatchDateKey !== batchDateKey || activeFacilityCacheKey !== facilityCacheKey) {
        return;
    }

    if (response === null) {
        clearRankRecommendationWarmCachePriorityCandidates();
        renderRankRecommendationList([], {
            signature: `error:${facilityCacheKey}:${batchDateKey}:${dateRange.fromDateKey}:${dateRange.toDateKey}`,
            statusText: formatRankRecommendationCurrentSettingsErrorStatus(currentSettingsLoadError)
        });
        return;
    }

    const decisionRecordsRequest = readRankRecommendationDecisionRecords()
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read rank recommendation decisions`, { error });
            return [] as RankRecommendationDecisionRecord[];
        });
    const statusesRequest = getLincolnSuggestStatusesForRange(dateRange.fromDateKey, dateRange.toDateKey)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to load rank recommendation resolved statuses`, {
                fromDateKey: dateRange.fromDateKey,
                toDateKey: dateRange.toDateKey,
                error
            });
            return [] as LincolnSuggestStatus[];
        });
    const rawSourceReader = createRankRecommendationRawSourceRecordReader({
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey
    });
    const curveEvidenceByKey = await buildRankRecommendationCurveEvidenceByKey(response, {
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey,
        visibleStayDates: new Set(cells.map((cell) => cell.stayDate)),
        rawSourceReader
    });

    const rankOrderOverride = readRankRecommendationRankOrderOverride(facilityCacheKey);
    const rankOrderResolution = resolveRankRecommendationRankOrder({
        rankLadder,
        override: rankOrderOverride
    });
    const rankGapContextByScope = buildRankRecommendationRankGapContextByScope(response, rankOrderResolution);
    const candidates = buildRankRecommendationCandidates({
        response,
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey,
        visibleStayDates: new Set(cells.map((cell) => cell.stayDate)),
        generatedAt,
        curveEvidenceByKey,
        rankLadder,
        rankOrderOverride
    });
    const [decisionRecords, statuses] = await Promise.all([decisionRecordsRequest, statusesRequest]);
    const decisionFilterResult = applyRankRecommendationDecisionFilter(candidates, decisionRecords, batchDateKey);
    const resolvedFilterResult = applyResolvedRankRecommendationFilter(
        decisionFilterResult.candidates,
        statuses,
        batchDateKey
    );
    const targetMonthOptions = buildRankRecommendationTargetMonthOptions(
        resolvedFilterResult.candidates,
        getSalesSettingWarmCachePriorityMonthKeys(collectMonthlyCalendarCells())
    );
    const effectiveTargetMonth = resolveRankRecommendationEffectiveTargetMonth(rankRecommendationTargetMonth, targetMonthOptions);
    if (effectiveTargetMonth !== rankRecommendationTargetMonth) {
        rankRecommendationTargetMonth = effectiveTargetMonth;
    }
    const targetMonthFilterResult = applyRankRecommendationTargetMonthFilter(resolvedFilterResult.candidates, effectiveTargetMonth);
    const viewModeFilterResult = applyRankRecommendationViewModeFilter(targetMonthFilterResult.candidates, rankRecommendationViewMode);
    const visibleCandidates = viewModeFilterResult.candidates.slice(0, rankRecommendationDisplayLimit);
    const displayInfoByKey = buildRankRecommendationDisplayInfoByKey(
        visibleCandidates,
        decisionRecords,
        statuses,
        batchDateKey,
        rankGapContextByScope
    );
    const curvePreviewInfoByKey = await buildRankRecommendationCurvePreviewInfoByKey(visibleCandidates, {
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey,
        statuses,
        rawSourceReader
    });
    rememberRankRecommendationCurvePreviewSnapshot(visibleCandidates, curvePreviewInfoByKey);
    const hiddenSummary = {
        userDecision: decisionFilterResult.hiddenCount,
        resolvedRankChange: resolvedFilterResult.hiddenCount,
        targetMonth: targetMonthFilterResult.hiddenCount,
        viewMode: viewModeFilterResult.hiddenCount,
        overflow: Math.max(0, viewModeFilterResult.candidates.length - visibleCandidates.length)
    };

    rememberRankRecommendationWarmCachePriorityCandidates(visibleCandidates);
    renderRankRecommendationList(visibleCandidates, {
        signature: [
            facilityCacheKey,
            batchDateKey,
            dateRange.fromDateKey,
            dateRange.toDateKey,
            rankOrderResolution.source,
            rankOrderResolution.ranksHighToLow.map((rank) => rank.code).join(">"),
            `hidden-user:${hiddenSummary.userDecision}`,
            `hidden-resolved:${hiddenSummary.resolvedRankChange}`,
            `hidden-target-month:${hiddenSummary.targetMonth}`,
            `hidden-view-mode:${hiddenSummary.viewMode}`,
            `target-month:${effectiveTargetMonth ?? "all"}`,
            `target-month-options:${targetMonthOptions.map((option) => `${option.month}=${option.count}`).join(",")}`,
            `view-mode:${rankRecommendationViewMode}`,
            `overflow:${hiddenSummary.overflow}`,
            `display-limit:${rankRecommendationDisplayLimit}`,
            visibleCandidates.map((candidate) => [
                candidate.reasonFingerprint,
                candidate.action,
                candidate.priority,
                formatRankRecommendationConfidence(candidate.confidence),
                candidate.currentRankName ?? "",
                candidate.recommendedRankName ?? "",
                candidate.recommendedRankUnavailableReason ?? "",
                candidate.rankOrderSource,
                formatRankRecommendationRankChangeProposalSignature(
                    buildRankRecommendationRankChangeProposal({
                        candidate,
                        provider: "lincoln_custom_suggest"
                    })
                ),
                displayInfoByKey.get(buildRankRecommendationCandidateDisplayInfoKey(candidate))?.signature ?? "",
                curvePreviewInfoByKey.get(buildRankRecommendationCandidateDisplayInfoKey(candidate))?.signature ?? "",
                isRankRecommendationCurvePreviewOpen(candidate) ? "preview-open" : "preview-closed",
                isRankRecommendationRankChangePreviewOpen(candidate) ? "rank-change-open" : "rank-change-closed",
                getPendingRankRecommendationRankChange(candidate) === null ? "rank-change-no-pending" : "rank-change-pending",
                getRankRecommendationRankChangeResult(candidate)?.message ?? ""
            ].join(",")).join("|")
        ].join(":"),
        statusText: null,
        facilityCacheKey,
        rankLadder,
        rankOrder: rankOrderResolution,
        viewMode: rankRecommendationViewMode,
        targetMonth: effectiveTargetMonth,
        targetMonthOptions,
        hiddenSummary,
        displayInfoByKey,
        curvePreviewInfoByKey,
        canShowMore: hiddenSummary.overflow > 0 && rankRecommendationDisplayLimit < RANK_RECOMMENDATION_MAX_DISPLAY_LIMIT,
        canResetDisplayLimit: rankRecommendationDisplayLimit > RANK_RECOMMENDATION_INITIAL_DISPLAY_LIMIT
    });
}

async function syncAnalyzeRankRecommendationList(
    analysisDate: string,
    batchDateKey: string,
    facilityCacheKey: string
): Promise<void> {
    const generatedAt = new Date().toISOString();
    let currentSettingsLoadError: unknown = null;
    const [response, rankLadder] = await Promise.all([
        getRankRecommendationCurrentSettingsForRange(analysisDate, analysisDate)
            .catch((error: unknown) => {
                currentSettingsLoadError = error;
                console.warn(`[${SCRIPT_NAME}] failed to load analyze rank recommendation current settings`, {
                    analysisDate,
                    error
                });
                return null;
            }),
        getRankRecommendationRankLadder()
            .catch((error: unknown) => {
                console.warn(`[${SCRIPT_NAME}] failed to load analyze rank recommendation rank ladder`, { error });
                return [] as RankRecommendationRankLadderEntry[];
            })
    ]);

    if (activeAnalyzeDate !== analysisDate || activeBatchDateKey !== batchDateKey || activeFacilityCacheKey !== facilityCacheKey) {
        return;
    }

    if (response === null) {
        renderAnalyzeRankRecommendationList([], {
            signature: `analyze-error:${facilityCacheKey}:${batchDateKey}:${analysisDate}`,
            statusText: formatRankRecommendationCurrentSettingsErrorStatus(currentSettingsLoadError),
            displayInfoByKey: new Map()
        });
        return;
    }

    const visibleStayDates = new Set([analysisDate]);
    const decisionRecordsRequest = readRankRecommendationDecisionRecords()
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read analyze rank recommendation decisions`, { error });
            return [] as RankRecommendationDecisionRecord[];
        });
    const statusesRequest = getLincolnSuggestStatuses(analysisDate)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to load analyze rank recommendation resolved statuses`, {
                analysisDate,
                error
            });
            return [] as LincolnSuggestStatus[];
        });
    const rawSourceReader = createRankRecommendationRawSourceRecordReader({
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey
    });
    const curveEvidenceByKey = await buildRankRecommendationCurveEvidenceByKey(response, {
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey,
        visibleStayDates,
        rawSourceReader
    });
    const rankOrderOverride = readRankRecommendationRankOrderOverride(facilityCacheKey);
    const rankOrderResolution = resolveRankRecommendationRankOrder({
        rankLadder,
        override: rankOrderOverride
    });
    const rankGapContextByScope = buildRankRecommendationRankGapContextByScope(response, rankOrderResolution);
    const candidates = buildRankRecommendationCandidates({
        response,
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey,
        visibleStayDates,
        generatedAt,
        curveEvidenceByKey,
        rankLadder,
        rankOrderOverride
    });
    const [decisionRecords, statuses] = await Promise.all([decisionRecordsRequest, statusesRequest]);
    const decisionFilterResult = applyRankRecommendationDecisionFilter(candidates, decisionRecords, batchDateKey);
    const resolvedFilterResult = applyResolvedRankRecommendationFilter(decisionFilterResult.candidates, statuses, batchDateKey);
    const displayInfoByKey = buildRankRecommendationDisplayInfoByKey(
        resolvedFilterResult.candidates,
        decisionRecords,
        statuses,
        batchDateKey,
        rankGapContextByScope
    );
    renderAnalyzeRankRecommendationList(resolvedFilterResult.candidates, {
        signature: [
            "analyze",
            facilityCacheKey,
            batchDateKey,
            analysisDate,
            rankOrderResolution.source,
            `hidden-user:${decisionFilterResult.hiddenCount}`,
            `hidden-resolved:${resolvedFilterResult.hiddenCount}`,
            resolvedFilterResult.candidates.map((candidate) => [
                candidate.roomGroupId,
                candidate.reasonFingerprint,
                candidate.action,
                candidate.priority,
                candidate.currentRankName ?? "",
                candidate.recommendedRankName ?? "",
                displayInfoByKey.get(buildRankRecommendationCandidateDisplayInfoKey(candidate))?.signature ?? ""
            ].join(",")).join("|")
        ].join(":"),
        statusText: null,
        displayInfoByKey
    });
}

function renderAnalyzeRankRecommendationList(
    candidates: readonly RankRecommendationCandidate[],
    options: {
        signature: string;
        statusText: string | null;
        displayInfoByKey: ReadonlyMap<string, RankRecommendationDisplayInfo>;
    }
): void {
    const host = resolveAnalyzeRankRecommendationListHost();
    if (host === null) {
        cleanupAnalyzeRankRecommendationList();
        return;
    }

    const rootElement = document.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}]`) ?? document.createElement("section");
    rootElement.setAttribute(RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE, "");
    rootElement.setAttribute(RANK_RECOMMENDATION_LIST_SIGNATURE_ATTRIBUTE, options.signature);

    if (rootElement.parentElement !== host.parentElement || rootElement.previousElementSibling !== host.insertAfterElement) {
        rootElement.remove();
        host.parentElement.insertBefore(rootElement, host.insertAfterElement.nextSibling);
    }

    const titleElement = document.createElement("h2");
    titleElement.textContent = "この日の料金調整候補";
    const metaElement = document.createElement("div");
    metaElement.textContent = options.statusText ?? `候補 ${candidates.length}件 / read-only`;

    if (options.statusText !== null || candidates.length === 0) {
        const emptyElement = document.createElement("p");
        emptyElement.setAttribute(RANK_RECOMMENDATION_ANALYZE_EMPTY_ATTRIBUTE, "");
        emptyElement.textContent = options.statusText ?? "この日付に表示できる料金調整候補はありません。";
        rootElement.replaceChildren(titleElement, metaElement, emptyElement);
        renderSalesSettingWarmCacheInlineStatus();
        return;
    }

    const focus = readPendingRankRecommendationFocus();
    const focusedCandidates = focus === null
        ? []
        : candidates.filter((candidate) => focus.stayDate === candidate.stayDate && focus.roomGroupId === candidate.roomGroupId);
    if (focusedCandidates.length > 0) {
        const otherCandidates = candidates.filter((candidate) => !focusedCandidates.includes(candidate));
        const focusedTitleElement = document.createElement("h3");
        focusedTitleElement.textContent = "遷移元候補の確認";
        const focusedMetaElement = document.createElement("p");
        focusedMetaElement.textContent = "top 画面で選んだ候補です。まずこの行の根拠と状態を確認します。";
        const otherTitleElement = document.createElement("h3");
        otherTitleElement.textContent = "同日他候補の確認";
        const otherMetaElement = document.createElement("p");
        otherMetaElement.textContent = otherCandidates.length === 0
            ? "同じ宿泊日に他の候補はありません。"
            : "同じ宿泊日の他の部屋タイプ候補です。必要に応じて比較します。";
        rootElement.replaceChildren(
            titleElement,
            metaElement,
            focusedTitleElement,
            focusedMetaElement,
            createAnalyzeRankRecommendationTable(focusedCandidates, options.displayInfoByKey, focus),
            otherTitleElement,
            otherMetaElement,
            ...(otherCandidates.length === 0 ? [] : [createAnalyzeRankRecommendationTable(otherCandidates, options.displayInfoByKey, focus)])
        );
        renderSalesSettingWarmCacheInlineStatus();
        return;
    }

    rootElement.replaceChildren(
        titleElement,
        metaElement,
        createAnalyzeRankRecommendationTable(candidates, options.displayInfoByKey, focus)
    );
    renderSalesSettingWarmCacheInlineStatus();
}

function createAnalyzeRankRecommendationTable(
    candidates: readonly RankRecommendationCandidate[],
    displayInfoByKey: ReadonlyMap<string, RankRecommendationDisplayInfo>,
    focus: { stayDate: string; roomGroupId: string } | null
): HTMLTableElement {
    const tableElement = document.createElement("table");
    const headerRowElement = document.createElement("tr");
    for (const label of ["部屋タイプ", "現ランク", "推奨", "根拠", "状態", "前回変更"]) {
        const headerElement = document.createElement("th");
        headerElement.scope = "col";
        headerElement.textContent = label;
        headerRowElement.append(headerElement);
    }
    const theadElement = document.createElement("thead");
    theadElement.append(headerRowElement);
    const tbodyElement = document.createElement("tbody");
    for (const candidate of candidates) {
        const displayInfo = displayInfoByKey.get(buildRankRecommendationCandidateDisplayInfoKey(candidate)) ?? null;
        const rowElement = document.createElement("tr");
        rowElement.setAttribute(RANK_RECOMMENDATION_ANALYZE_ROW_ATTRIBUTE, "");
        const isHighlighted = focus !== null
            && focus.stayDate === candidate.stayDate
            && focus.roomGroupId === candidate.roomGroupId;
        if (isHighlighted) {
            rowElement.setAttribute(RANK_RECOMMENDATION_ANALYZE_HIGHLIGHT_ATTRIBUTE, "true");
        }
        appendAnalyzeRankRecommendationCell(rowElement, candidate.roomGroupName);
        appendAnalyzeRankRecommendationCell(rowElement, candidate.currentRankName ?? "-");
        appendAnalyzeRankRecommendationCell(rowElement, formatRankRecommendationAction(candidate));
        appendAnalyzeRankRecommendationCell(rowElement, candidate.reasonCodes.join(" / ") || "-");
        appendAnalyzeRankRecommendationCell(rowElement, formatRankRecommendationStatus(candidate.status));
        appendAnalyzeRankRecommendationCell(rowElement, formatRankRecommendationLatestChangeCellText(displayInfo));
        tbodyElement.append(rowElement);
    }
    tableElement.append(theadElement, tbodyElement);
    return tableElement;
}

function appendAnalyzeRankRecommendationCell(rowElement: HTMLTableRowElement, text: string): void {
    const cellElement = document.createElement("td");
    cellElement.textContent = text;
    rowElement.append(cellElement);
}

function resolveAnalyzeRankRecommendationListHost(): { parentElement: HTMLElement; insertAfterElement: HTMLElement } | null {
    const overallSummary = document.querySelector<HTMLElement>(`[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`);
    const overallParent = overallSummary?.parentElement ?? null;
    if (overallSummary instanceof HTMLElement && overallParent instanceof HTMLElement) {
        return { parentElement: overallParent, insertAfterElement: overallSummary };
    }

    const currentUiRoot = document.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`);
    const currentUiParent = currentUiRoot?.parentElement ?? null;
    if (currentUiRoot instanceof HTMLElement && currentUiParent instanceof HTMLElement) {
        return { parentElement: currentUiParent, insertAfterElement: currentUiRoot };
    }

    const mainElement = document.querySelector<HTMLElement>("main");
    const firstChild = mainElement?.firstElementChild;
    if (mainElement instanceof HTMLElement && firstChild instanceof HTMLElement) {
        return { parentElement: mainElement, insertAfterElement: firstChild };
    }

    const bodyFirstChild = document.body.firstElementChild;
    if (bodyFirstChild instanceof HTMLElement) {
        return { parentElement: document.body, insertAfterElement: bodyFirstChild };
    }

    return null;
}

function cleanupAnalyzeRankRecommendationList(): void {
    document.querySelectorAll<HTMLElement>(`[${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}]`).forEach((element) => {
        element.remove();
    });
}

function getRankRecommendationCurrentSettingsForRange(
    fromDateKey: string,
    toDateKey: string
): Promise<RankRecommendationCurrentSettingsResponse> {
    const cacheKey = `${fromDateKey}:${toDateKey}`;
    const cached = rankRecommendationCurrentSettingsCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const request = loadSalesSettingCurrentSettings(fromDateKey, toDateKey)
        .catch((error: unknown) => {
            rankRecommendationCurrentSettingsCache.delete(cacheKey);
            throw error;
        });
    rankRecommendationCurrentSettingsCache.set(cacheKey, request);
    return request;
}

function getRankRecommendationRankLadder(): Promise<RankRecommendationRankLadderEntry[]> {
    const cacheKey = "default";
    const cached = rankRecommendationRankLadderCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const request = loadRankRecommendationRankLadder()
        .catch((error: unknown) => {
            rankRecommendationRankLadderCache.delete(cacheKey);
            throw error;
        });
    rankRecommendationRankLadderCache.set(cacheKey, request);
    return request;
}

async function loadRankRecommendationRankLadder(): Promise<RankRecommendationRankLadderEntry[]> {
    const response = await fetch(new URL(RANK_SEQUENCES_ENDPOINT, window.location.origin).toString(), {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new RevenueAssistantRequestError(RANK_SEQUENCES_ENDPOINT, response.status);
    }

    const payload = (await response.json()) as RankRecommendationRankSequencesResponse;
    return payload.rank_sequences ?? [];
}

function formatRankRecommendationCurrentSettingsErrorStatus(error: unknown): string {
    if (error instanceof RevenueAssistantRequestError) {
        if (error.status === 401) {
            return "料金調整候補: Revenue Assistant にログインし直すと再取得します";
        }
        if (error.status === 403) {
            return "料金調整候補: current settings の閲覧権限を確認してください";
        }
        return `料金調整候補: current settings を取得できませんでした (HTTP ${error.status})`;
    }
    return "料金調整候補: current settings を取得できませんでした";
}

interface RankRecommendationRawSourceRecordReader {
    (options: {
        stayDate: string;
        roomGroupId: string;
    }): Promise<BookingCurveRawSourceRecord | undefined>;
}

function createRankRecommendationRawSourceRecordReader(options: {
    facilityId: string;
    asOfDate: string;
}): RankRecommendationRawSourceRecordReader {
    const pendingByKey = new Map<string, Promise<BookingCurveRawSourceRecord | undefined>>();
    return ({ stayDate, roomGroupId }) => {
        const query = buildBookingCurveQuerySignature(stayDate, roomGroupId);
        const rawSourceKey = buildBookingCurveRawSourceCacheKey({
            facilityId: options.facilityId,
            stayDate,
            asOfDate: options.asOfDate,
            scope: "roomGroup",
            roomGroupId,
            endpoint: BOOKING_CURVE_ENDPOINT,
            query
        });
        const cached = pendingByKey.get(rawSourceKey);
        if (cached !== undefined) {
            return cached;
        }

        const request = readBookingCurveRawSourceRecord(rawSourceKey)
            .catch((error: unknown) => {
                console.warn(`[${SCRIPT_NAME}] failed to read rank recommendation booking curve raw source`, {
                    stayDate,
                    asOfDate: options.asOfDate,
                    roomGroupId,
                    error
                });
                return undefined;
            });
        pendingByKey.set(rawSourceKey, request);
        return request;
    };
}

async function buildRankRecommendationCurveEvidenceByKey(
    response: RankRecommendationCurrentSettingsResponse,
    options: {
        facilityId: string;
        asOfDate: string;
        visibleStayDates: Set<string>;
        rawSourceReader?: RankRecommendationRawSourceRecordReader;
    }
): Promise<Map<string, RankRecommendationCurveEvidence>> {
    const rawSourceReader = options.rawSourceReader ?? createRankRecommendationRawSourceRecordReader({
        facilityId: options.facilityId,
        asOfDate: options.asOfDate
    });
    const ownPricePositionEvidenceByStayDate = new Map<string, Promise<RankRecommendationOwnPricePositionEvidence>>();
    const getOwnPricePositionEvidence = (stayDate: string): Promise<RankRecommendationOwnPricePositionEvidence> => {
        const cached = ownPricePositionEvidenceByStayDate.get(stayDate);
        if (cached !== undefined) {
            return cached;
        }

        const request = buildRankRecommendationOwnPricePositionEvidence({
            facilityId: options.facilityId,
            stayDate
        });
        ownPricePositionEvidenceByStayDate.set(stayDate, request);
        return request;
    };

    const evidenceRequests: Promise<[string, RankRecommendationCurveEvidence] | null>[] = [];
    for (const currentSetting of response.suggest_output_current_settings ?? []) {
        const stayDate = toCompactDateKey(currentSetting.stay_date ?? "");
        if (stayDate === null || !options.visibleStayDates.has(stayDate)) {
            continue;
        }

        for (const roomGroup of currentSetting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            if (roomGroupId === "") {
                continue;
            }

            evidenceRequests.push(readRankRecommendationCurveEvidence({
                facilityId: options.facilityId,
                stayDate,
                asOfDate: options.asOfDate,
                roomGroupId,
                ownPricePositionEvidence: getOwnPricePositionEvidence(stayDate),
                rawSourceReader
            }));
        }
    }

    const entries = await Promise.all(evidenceRequests);

    return new Map(entries.filter((entry): entry is [string, RankRecommendationCurveEvidence] => entry !== null));
}

async function buildRankRecommendationCurvePreviewInfoByKey(
    candidates: readonly RankRecommendationCandidate[],
    options: {
        facilityId: string;
        asOfDate: string;
        statuses: readonly LincolnSuggestStatus[];
        rawSourceReader?: RankRecommendationRawSourceRecordReader;
    }
): Promise<Map<string, RankRecommendationCurvePreviewInfo>> {
    const rawSourceReader = options.rawSourceReader ?? createRankRecommendationRawSourceRecordReader({
        facilityId: options.facilityId,
        asOfDate: options.asOfDate
    });
    const rankHistoryByStayDate = new Map<string, Map<string, SalesSettingRankHistoryEvent[]>>();
    const getRankHistory = (candidate: RankRecommendationCandidate): SalesSettingRankHistoryEvent[] => {
        let historyByRoomGroupName = rankHistoryByStayDate.get(candidate.stayDate);
        if (historyByRoomGroupName === undefined) {
            historyByRoomGroupName = buildSalesSettingRankHistoryByRoomGroup(Array.from(options.statuses), candidate.stayDate);
            rankHistoryByStayDate.set(candidate.stayDate, historyByRoomGroupName);
        }
        return historyByRoomGroupName.get(candidate.roomGroupName) ?? [];
    };

    const entries = await Promise.all(candidates.map(async (candidate) => {
        const key = buildRankRecommendationCandidateDisplayInfoKey(candidate);
        const previewInfo = await readRankRecommendationCurvePreviewInfo({
            candidate,
            facilityId: options.facilityId,
            asOfDate: options.asOfDate,
            rankHistory: getRankHistory(candidate),
            rawSourceReader
        });
        return [key, previewInfo] as const;
    }));
    return new Map(entries);
}

async function readRankRecommendationCurvePreviewInfo(options: {
    candidate: RankRecommendationCandidate;
    facilityId: string;
    asOfDate: string;
    rankHistory: SalesSettingRankHistoryEvent[];
    rawSourceReader?: RankRecommendationRawSourceRecordReader;
}): Promise<RankRecommendationCurvePreviewInfo> {
    const rawSourceReader = options.rawSourceReader ?? createRankRecommendationRawSourceRecordReader({
        facilityId: options.facilityId,
        asOfDate: options.asOfDate
    });
    const record = await rawSourceReader({
        stayDate: options.candidate.stayDate,
        roomGroupId: options.candidate.roomGroupId
    });

    if (record === undefined) {
        const storedRoomGroupStatus = await readBookingCurveRawSourceStoredRoomGroupStatus(
            options.facilityId,
            options.candidate.stayDate,
            options.asOfDate,
            options.candidate.roomGroupId
        ).catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read rank recommendation raw source status`, {
                stayDate: options.candidate.stayDate,
                asOfDate: options.asOfDate,
                roomGroupId: options.candidate.roomGroupId,
                error
            });
            return "none" as BookingCurveRawSourceStoredRoomGroupStatus;
        });
        return buildMissingRankRecommendationCurvePreviewInfo(
            ["booking_curve_source_missing"],
            convertBookingCurveRawSourceStoredStatus(storedRoomGroupStatus)
        );
    }

    const response = record.response as BookingCurveResponse;
    const point = findLatestBookingCurvePoint(response, options.asOfDate);
    if (point === null) {
        return buildMissingRankRecommendationCurvePreviewInfo(["booking_curve_point_missing"], "currentAsOf");
    }

    const referenceData = await buildRankRecommendationCurvePreviewReferenceData({
        candidate: options.candidate,
        facilityId: options.facilityId,
        asOfDate: options.asOfDate,
        response,
        rawSourceReader
    });
    const currentOverallRoomCount = normalizeBookingCurveRoomCount(point.all?.this_year_room_sum);
    const diagnostics = collectRankRecommendationCurvePreviewDiagnostics(referenceData);
    const buildSegmentVariant = (secondarySegment: SalesSettingBookingCurveSecondarySegment): RankRecommendationCurvePreviewSegmentVariant => {
        const curveData = buildSalesSettingBookingCurveRenderData(
            response,
            referenceData,
            [],
            options.candidate.stayDate,
            options.asOfDate,
            options.rankHistory,
            secondarySegment
        );
        const maxValue = resolveRankRecommendationCurvePreviewMaxValue(response, curveData);
        const currentSecondaryRoomCount = normalizeBookingCurveRoomCount(
            secondarySegment === "group"
                ? point.group?.this_year_room_sum
                : point.transient?.this_year_room_sum
        );
        return {
            curveData,
            maxValue,
            currentSecondaryRoomCount,
            signature: [
                `segment:${curveData.secondarySegment}`,
                `max:${maxValue}`,
                `current:${currentSecondaryRoomCount ?? "-"}`,
                `secondary:${curveData.secondary.signature}`,
                `rank:${curveData.rankSignature}`
            ].join("|")
        };
    };
    const segmentVariants: Record<SalesSettingBookingCurveSecondarySegment, RankRecommendationCurvePreviewSegmentVariant> = {
        individual: buildSegmentVariant("individual"),
        group: buildSegmentVariant("group")
    };
    const secondarySegment = getSalesSettingBookingCurveSecondarySegment();
    const activeVariant = segmentVariants[secondarySegment];

    return {
        curveData: activeVariant.curveData,
        maxValue: activeVariant.maxValue,
        currentOverallRoomCount,
        currentSecondaryRoomCount: activeVariant.currentSecondaryRoomCount,
        rawSourceStatus: "currentAsOf",
        segmentVariants,
        diagnostics,
        signature: [
            "available",
            `active:${secondarySegment}`,
            `current-overall:${currentOverallRoomCount ?? "-"}`,
            `overall:${activeVariant.curveData.overall.signature}`,
            `individual:${segmentVariants.individual.signature}`,
            `group:${segmentVariants.group.signature}`,
            `diagnostics:${diagnostics.join("/")}`
        ].join("|")
    };
}

function buildMissingRankRecommendationCurvePreviewInfo(
    diagnostics: string[],
    rawSourceStatus: RankRecommendationRawSourceStatus = "missing"
): RankRecommendationCurvePreviewInfo {
    return {
        curveData: null,
        maxValue: null,
        currentOverallRoomCount: null,
        currentSecondaryRoomCount: null,
        rawSourceStatus,
        segmentVariants: {},
        diagnostics,
        signature: `missing:${diagnostics.join("/")}|raw:${rawSourceStatus}`
    };
}

function convertBookingCurveRawSourceStoredStatus(
    status: BookingCurveRawSourceStoredRoomGroupStatus
): RankRecommendationRawSourceStatus {
    switch (status) {
        case "currentAsOf":
            return "currentAsOf";
        case "pastAsOf":
            return "pastAsOf";
        case "none":
        default:
            return "missing";
    }
}

async function buildRankRecommendationCurvePreviewReferenceData(options: {
    candidate: RankRecommendationCandidate;
    facilityId: string;
    asOfDate: string;
    response: BookingCurveResponse;
    rawSourceReader?: RankRecommendationRawSourceRecordReader;
}): Promise<SalesSettingBookingCurveReferenceData> {
    const referenceSourcesByKind = new Map<ReferenceCurveKind, Promise<BookingCurveResponseSource[]>>();
    const getReferenceSources = (
        curveKind: ReferenceCurveKind,
        stayDates: readonly string[]
    ): Promise<BookingCurveResponseSource[]> => {
        const cached = referenceSourcesByKind.get(curveKind);
        if (cached !== undefined) {
            return cached;
        }

        const request = readRankRecommendationCurvePreviewReferenceSources({
            facilityId: options.facilityId,
            asOfDate: options.asOfDate,
            roomGroupId: options.candidate.roomGroupId,
            stayDates,
            ...(options.rawSourceReader === undefined ? {} : { rawSourceReader: options.rawSourceReader })
        });
        referenceSourcesByKind.set(curveKind, request);
        return request;
    };
    const buildReference = (segment: CurveSegment, curveKind: ReferenceCurveKind): Promise<ReferenceCurveResult | null> => (
        readRankRecommendationCurvePreviewReferenceResult({
            facilityId: options.facilityId,
            stayDate: options.candidate.stayDate,
            asOfDate: options.asOfDate,
            roomGroupId: options.candidate.roomGroupId,
            response: options.response,
            segment,
            curveKind,
            getReferenceSources
        })
    );
    const [
        recentOverall,
        seasonalOverall,
        recentIndividual,
        seasonalIndividual,
        recentGroup,
        seasonalGroup
    ] = await Promise.all([
        buildReference("all", "recent_weighted_90"),
        buildReference("all", "seasonal_component"),
        buildReference("transient", "recent_weighted_90"),
        buildReference("transient", "seasonal_component"),
        buildReference("group", "recent_weighted_90"),
        buildReference("group", "seasonal_component")
    ]);

    return {
        recentOverall,
        seasonalOverall,
        recentIndividual,
        seasonalIndividual,
        recentGroup,
        seasonalGroup
    };
}

async function readRankRecommendationCurvePreviewReferenceResult(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    response: BookingCurveResponse;
    segment: CurveSegment;
    curveKind: ReferenceCurveKind;
    getReferenceSources?: (
        curveKind: ReferenceCurveKind,
        stayDates: readonly string[]
    ) => Promise<BookingCurveResponseSource[]>;
}): Promise<ReferenceCurveResult | null> {
    const normalizedStayDate = normalizeDateKey(options.stayDate);
    const normalizedAsOfDate = normalizeDateKey(options.asOfDate);
    const weekday = normalizedStayDate === null ? null : getUtcWeekday(normalizedStayDate);
    if (normalizedStayDate === null || normalizedAsOfDate === null || weekday === null) {
        return null;
    }

    const targetMonth = normalizedStayDate.slice(0, 7);
    const algorithmVersion = options.curveKind === "recent_weighted_90"
        ? RECENT_WEIGHTED_90_ALGORITHM_VERSION
        : SEASONAL_COMPONENT_ALGORITHM_VERSION;
    const cacheKey = buildReferenceCurveCacheKey({
        facilityId: options.facilityId,
        scope: "roomGroup",
        roomGroupId: options.roomGroupId,
        ...(options.curveKind === "recent_weighted_90"
            ? { targetStayDate: normalizedStayDate }
            : { targetMonth, weekday }),
        asOfDate: normalizedAsOfDate,
        segment: options.segment,
        curveKind: options.curveKind,
        algorithmVersion
    });
    const cachedRecord = await readReferenceCurveRecord(cacheKey)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read rank recommendation preview reference curve cache`, {
                stayDate: options.stayDate,
                asOfDate: options.asOfDate,
                roomGroupId: options.roomGroupId,
                segment: options.segment,
                curveKind: options.curveKind,
                error
            });
            return undefined;
        });
    if (cachedRecord !== undefined) {
        return cachedRecord.result;
    }

    const candidateStayDates = options.curveKind === "recent_weighted_90"
        ? getRecentWeighted90CandidateStayDates({
            targetStayDate: normalizedStayDate,
            asOfDate: normalizedAsOfDate,
            ticks: SALES_SETTING_REFERENCE_CURVE_TICKS
        })
        : getSeasonalComponentCandidateStayDates({
            targetMonth,
            weekday
        });
    const sources = await (options.getReferenceSources === undefined
        ? readRankRecommendationCurvePreviewReferenceSources({
            facilityId: options.facilityId,
            asOfDate: options.asOfDate,
            roomGroupId: options.roomGroupId,
            stayDates: candidateStayDates
        })
        : options.getReferenceSources(options.curveKind, candidateStayDates));
    if (sources.length > 0) {
        const input = buildCurveInputFromBookingCurveResponses({
            facilityId: options.facilityId,
            asOfDate: normalizedAsOfDate,
            sources,
            segments: [options.segment]
        });
        return options.curveKind === "recent_weighted_90"
            ? buildRecentWeighted90ReferenceCurve(input, {
                scope: "roomGroup",
                roomGroupId: options.roomGroupId,
                segment: options.segment,
                ticks: SALES_SETTING_REFERENCE_CURVE_TICKS,
                targetStayDate: normalizedStayDate,
                asOfDate: normalizedAsOfDate
            })
            : buildSeasonalComponentReferenceCurve(input, {
                scope: "roomGroup",
                roomGroupId: options.roomGroupId,
                segment: options.segment,
                ticks: SALES_SETTING_REFERENCE_CURVE_TICKS,
                targetMonth,
                weekday,
                asOfDate: normalizedAsOfDate
            });
    }

    return options.curveKind === "seasonal_component"
        ? buildRankRecommendationHistoricalReferenceCurveResult(options)
        : null;
}

async function readRankRecommendationCurvePreviewReferenceSources(options: {
    facilityId: string;
    asOfDate: string;
    roomGroupId: string;
    stayDates: readonly string[];
    rawSourceReader?: RankRecommendationRawSourceRecordReader;
}): Promise<BookingCurveResponseSource[]> {
    const asOfDateKey = toCompactDateKey(options.asOfDate);
    if (asOfDateKey === null) {
        return [];
    }

    const uniqueStayDates = Array.from(new Set(options.stayDates.flatMap((stayDate) => {
        const compactStayDate = toCompactDateKey(stayDate);
        return compactStayDate === null ? [] : [compactStayDate];
    })));
    const rawSourceReader = options.rawSourceReader ?? createRankRecommendationRawSourceRecordReader({
        facilityId: options.facilityId,
        asOfDate: asOfDateKey
    });
    const records = await Promise.all(uniqueStayDates.map(async (stayDate) => (
        rawSourceReader({
            stayDate,
            roomGroupId: options.roomGroupId
        })
    )));

    return records
        .filter((record): record is NonNullable<typeof record> => record !== undefined)
        .map((record) => ({
            response: record.response as BookingCurveResponse,
            scope: "roomGroup",
            roomGroupId: options.roomGroupId
        }));
}

function collectRankRecommendationCurvePreviewDiagnostics(referenceData: SalesSettingBookingCurveReferenceData): string[] {
    const diagnostics = [
        referenceData.recentOverall?.diagnostics.missingReason,
        referenceData.seasonalOverall?.diagnostics.missingReason,
        referenceData.recentIndividual?.diagnostics.missingReason,
        referenceData.seasonalIndividual?.diagnostics.missingReason,
        referenceData.recentGroup?.diagnostics.missingReason,
        referenceData.seasonalGroup?.diagnostics.missingReason
    ].filter((diagnostic): diagnostic is string => diagnostic !== undefined);
    return Array.from(new Set(diagnostics));
}

function resolveRankRecommendationCurvePreviewMaxValue(
    response: BookingCurveResponse,
    curveData: SalesSettingBookingCurveRenderData
): number {
    if (typeof response.max_room_count === "number" && Number.isFinite(response.max_room_count) && response.max_room_count > 0) {
        return response.max_room_count;
    }

    const seriesValues = [
        curveData.overall.current,
        curveData.overall.recent,
        curveData.overall.seasonal,
        curveData.secondary.current,
        curveData.secondary.recent,
        curveData.secondary.seasonal
    ].flatMap((series) => series?.values ?? []);
    const markerValues = [
        ...curveData.overallRankMarkers.map((marker) => marker.value),
        ...curveData.secondaryRankMarkers.map((marker) => marker.value)
    ];
    const values = [...seriesValues, ...markerValues]
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return Math.max(1, ...values);
}

async function readRankRecommendationCurveEvidence(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    ownPricePositionEvidence: Promise<RankRecommendationOwnPricePositionEvidence>;
    rawSourceReader?: RankRecommendationRawSourceRecordReader;
}): Promise<[string, RankRecommendationCurveEvidence] | null> {
    const rawSourceReader = options.rawSourceReader ?? createRankRecommendationRawSourceRecordReader({
        facilityId: options.facilityId,
        asOfDate: options.asOfDate
    });
    const evidenceKey = buildRankRecommendationEvidenceKey(options.stayDate, options.roomGroupId);
    const record = await rawSourceReader({
        stayDate: options.stayDate,
        roomGroupId: options.roomGroupId
    });

    if (record === undefined) {
        const ownPricePositionEvidence = await options.ownPricePositionEvidence;
        return [evidenceKey, {
            currentAllRooms: null,
            referenceAllRooms: null,
            currentTransientRooms: null,
            referenceTransientRooms: null,
            currentGroupRooms: null,
            referenceGroupRooms: null,
            forecastSignal: null,
            salesAdrHealthSignal: null,
            weekdayContextSignal: null,
            ownPricePositionSignal: ownPricePositionEvidence.signal,
            ownPricePositionComparableGuestCount: ownPricePositionEvidence.comparableGuestCount,
            ownPricePositionSource: ownPricePositionEvidence.source,
            ownPricePositionScope: ownPricePositionEvidence.scope,
            diagnostics: [
                "booking_curve_source_missing",
                ...ownPricePositionEvidence.diagnostics
            ]
        }];
    }

    const point = findLatestBookingCurvePoint(record.response, options.asOfDate);
    if (point === null) {
        const ownPricePositionEvidence = await options.ownPricePositionEvidence;
        return [evidenceKey, {
            currentAllRooms: null,
            referenceAllRooms: null,
            currentTransientRooms: null,
            referenceTransientRooms: null,
            currentGroupRooms: null,
            referenceGroupRooms: null,
            forecastSignal: null,
            salesAdrHealthSignal: null,
            weekdayContextSignal: null,
            ownPricePositionSignal: ownPricePositionEvidence.signal,
            ownPricePositionComparableGuestCount: ownPricePositionEvidence.comparableGuestCount,
            ownPricePositionSource: ownPricePositionEvidence.source,
            ownPricePositionScope: ownPricePositionEvidence.scope,
            diagnostics: [
                "booking_curve_point_missing",
                ...ownPricePositionEvidence.diagnostics
            ]
        }];
    }

    const currentAllRooms = normalizeBookingCurveRoomCount(point.all?.this_year_room_sum);
    const referenceAllRooms = averageBookingCurveRoomCounts([
        point.all?.last_year_room_sum,
        point.all?.two_years_ago_room_sum,
        point.all?.three_years_ago_room_sum
    ]);
    const currentTransientRooms = normalizeBookingCurveRoomCount(point.transient?.this_year_room_sum);
    const referenceTransientRooms = averageBookingCurveRoomCounts([
        point.transient?.last_year_room_sum,
        point.transient?.two_years_ago_room_sum,
        point.transient?.three_years_ago_room_sum
    ]);
    const currentGroupRooms = normalizeBookingCurveRoomCount(point.group?.this_year_room_sum);
    const referenceGroupRooms = averageBookingCurveRoomCounts([
        point.group?.last_year_room_sum,
        point.group?.two_years_ago_room_sum,
        point.group?.three_years_ago_room_sum
    ]);
    const forecastEvidence = buildRankRecommendationForecastEvidence({
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        asOfDate: options.asOfDate,
        roomGroupId: options.roomGroupId,
        response: record.response as BookingCurveResponse,
        groupDriven: isRankRecommendationGroupDriven({
            transientDeviation: getNullableDifference(currentTransientRooms, referenceTransientRooms),
            groupDeviation: getNullableDifference(currentGroupRooms, referenceGroupRooms)
        })
    });
    const salesAdrHealthEvidence = buildRankRecommendationSalesAdrHealthEvidence({
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        asOfDate: options.asOfDate,
        roomGroupId: options.roomGroupId,
        response: record.response as BookingCurveResponse,
        point
    });
    const [weekdayContextEvidence, ownPricePositionEvidence] = await Promise.all([
        buildRankRecommendationWeekdayContextEvidence({
            facilityId: options.facilityId,
            stayDate: options.stayDate,
            asOfDate: options.asOfDate,
            roomGroupId: options.roomGroupId,
            currentTransientRooms,
            rawSourceReader
        }),
        options.ownPricePositionEvidence
    ]);

    return [evidenceKey, {
        currentAllRooms,
        referenceAllRooms,
        currentTransientRooms,
        referenceTransientRooms,
        currentGroupRooms,
        referenceGroupRooms,
        forecastSignal: forecastEvidence.signal,
        salesAdrHealthSignal: salesAdrHealthEvidence.signal,
        weekdayContextSignal: weekdayContextEvidence.signal,
        ownPricePositionSignal: ownPricePositionEvidence.signal,
        ownPricePositionComparableGuestCount: ownPricePositionEvidence.comparableGuestCount,
        ownPricePositionSource: ownPricePositionEvidence.source,
        ownPricePositionScope: ownPricePositionEvidence.scope,
        diagnostics: [
            ...forecastEvidence.diagnostics,
            ...salesAdrHealthEvidence.diagnostics,
            ...weekdayContextEvidence.diagnostics,
            ...ownPricePositionEvidence.diagnostics
        ]
    }];
}

function buildRankRecommendationForecastEvidence(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    response: BookingCurveResponse;
    groupDriven: boolean;
}): { signal: RankRecommendationForecastSignal | null; diagnostics: string[] } {
    const input = buildCurveInputFromBookingCurveResponses({
        facilityId: options.facilityId,
        asOfDate: options.asOfDate,
        sources: [{
            response: options.response,
            scope: "roomGroup",
            roomGroupId: options.roomGroupId
        }],
        segments: ["transient"]
    });
    const recentWeighted90 = buildRankRecommendationHistoricalReferenceCurveResult({
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        asOfDate: options.asOfDate,
        roomGroupId: options.roomGroupId,
        response: options.response,
        segment: "transient",
        curveKind: "recent_weighted_90"
    });
    const seasonalComponent = buildRankRecommendationHistoricalReferenceCurveResult({
        facilityId: options.facilityId,
        stayDate: options.stayDate,
        asOfDate: options.asOfDate,
        roomGroupId: options.roomGroupId,
        response: options.response,
        segment: "transient",
        curveKind: "seasonal_component"
    });
    const evaluationCase = buildForecastEvaluationCase(input, {
        targetStayDate: options.stayDate,
        asOfDate: options.asOfDate,
        scope: "roomGroup",
        roomGroupId: options.roomGroupId,
        segment: "transient",
        referenceCurves: {
            recentWeighted90,
            seasonalComponent
        },
        ...(typeof options.response.max_room_count === "number" ? { capacityRooms: options.response.max_room_count } : {}),
        groupDriven: options.groupDriven
    });
    const forecastResult = buildRoomsOnlyForecastResult({ evaluationCase });
    const signal = getRankRecommendationForecastSignal(forecastResult);
    return {
        signal,
        diagnostics: buildRankRecommendationForecastDiagnostics(forecastResult)
    };
}

function buildRankRecommendationSalesAdrHealthEvidence(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    response: BookingCurveResponse;
    point: BookingCurvePoint;
}): { signal: RankRecommendationSalesAdrHealthSignal | null; diagnostics: string[] } {
    const input = buildSalesAdrInputFromBookingCurveResponses({
        facilityId: options.facilityId,
        asOfDate: options.asOfDate,
        sources: [{
            response: options.response,
            scope: "roomGroup",
            roomGroupId: options.roomGroupId
        }],
        segments: ["transient"]
    });
    const currentObservation = findLatestSalesAdrObservation(input.observations, options.asOfDate);
    const diagnostics = currentObservation === null
        ? ["sales_adr_observation_missing"]
        : currentObservation.diagnostics.map((diagnostic) => `sales_adr:${diagnostic}`);
    const currentAdr = currentObservation?.adr ?? null;
    const currentSales = currentObservation?.sales ?? null;
    const referenceAdr = averageBookingCurveNumericValues([
        options.point.transient?.last_year_adr,
        options.point.transient?.two_years_ago_adr,
        options.point.transient?.three_years_ago_adr
    ]);
    const referenceSales = averageBookingCurveNumericValues([
        options.point.transient?.last_year_sales_sum,
        options.point.transient?.two_years_ago_sales_sum,
        options.point.transient?.three_years_ago_sales_sum
    ]);
    const adrDown = isCurrentValueDownAgainstReference({
        current: currentAdr,
        reference: referenceAdr,
        downRatioThreshold: 0.95
    });
    const salesDown = isCurrentValueDownAgainstReference({
        current: currentSales,
        reference: referenceSales,
        downRatioThreshold: 0.9
    });
    const adrComparable = isPositiveReferenceComparable(currentAdr, referenceAdr);
    const salesComparable = isPositiveReferenceComparable(currentSales, referenceSales);

    if (currentAdr === null) {
        diagnostics.push("sales_adr_current_adr_missing");
    }
    if (currentSales === null) {
        diagnostics.push("sales_adr_current_sales_missing");
    }
    if (referenceAdr === null) {
        diagnostics.push("sales_adr_reference_adr_missing");
    } else if (referenceAdr === 0) {
        diagnostics.push("sales_adr_reference_adr_zero");
    }
    if (referenceSales === null) {
        diagnostics.push("sales_adr_reference_sales_missing");
    } else if (referenceSales === 0) {
        diagnostics.push("sales_adr_reference_sales_zero");
    }

    if (!adrComparable && !salesComparable) {
        return {
            signal: null,
            diagnostics: Array.from(new Set(diagnostics))
        };
    }

    let signal: RankRecommendationSalesAdrHealthSignal = "neutral";
    if (adrDown && salesDown) {
        signal = "adr_and_sales_down";
    } else if (adrDown) {
        signal = "adr_down";
    } else if (salesDown) {
        signal = "sales_down";
    }

    diagnostics.push(`sales_adr_signal_${signal}`);
    return {
        signal,
        diagnostics: Array.from(new Set(diagnostics))
    };
}

async function buildRankRecommendationWeekdayContextEvidence(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    currentTransientRooms: number | null;
    rawSourceReader?: RankRecommendationRawSourceRecordReader;
}): Promise<{ signal: RankRecommendationWeekdayContextSignal | null; diagnostics: string[] }> {
    const diagnostics: string[] = [];
    if (options.currentTransientRooms === null) {
        diagnostics.push("weekday_context_current_transient_missing");
        return { signal: null, diagnostics };
    }

    const sourceRooms: number[] = [];
    const candidateStayDates = getRankRecommendationSameWeekdayStayDates(options.stayDate)
        .filter((stayDate) => {
            const daysFromAsOf = getDaysBetweenDateKeys(stayDate, options.asOfDate);
            return daysFromAsOf !== null && daysFromAsOf >= 0;
        });
    if (candidateStayDates.length === 0) {
        diagnostics.push("weekday_context_missing");
        return { signal: null, diagnostics };
    }

    const rawSourceReader = options.rawSourceReader ?? createRankRecommendationRawSourceRecordReader({
        facilityId: options.facilityId,
        asOfDate: options.asOfDate
    });
    await Promise.all(candidateStayDates.map(async (stayDate) => {
        const record = await rawSourceReader({
            stayDate,
            roomGroupId: options.roomGroupId
        });
        if (record === undefined) {
            return;
        }

        const point = findLatestBookingCurvePoint(record.response, options.asOfDate);
        const transientRooms = normalizeBookingCurveRoomCount(point?.transient?.this_year_room_sum);
        if (transientRooms !== null) {
            sourceRooms.push(transientRooms);
        }
    }));

    if (sourceRooms.length === 0) {
        diagnostics.push("weekday_context_missing");
        return { signal: null, diagnostics };
    }
    if (sourceRooms.length < 2) {
        diagnostics.push("weekday_reference_source_count_low");
        return { signal: null, diagnostics };
    }

    const referenceRooms = averageBookingCurveRoomCounts(sourceRooms);
    if (referenceRooms === null || referenceRooms <= 0) {
        diagnostics.push("weekday_context_missing");
        return { signal: null, diagnostics };
    }

    let signal: RankRecommendationWeekdayContextSignal = "weekday_reference_neutral";
    const difference = options.currentTransientRooms - referenceRooms;
    if (difference >= 1 && options.currentTransientRooms / referenceRooms >= 1.15) {
        signal = "weekday_reference_supports_raise";
    } else if (difference <= -1 && options.currentTransientRooms / referenceRooms <= 0.85) {
        signal = "weekday_reference_supports_lower";
    }

    diagnostics.push(`weekday_signal_${signal}`);
    return {
        signal,
        diagnostics: Array.from(new Set(diagnostics))
    };
}

function getRankRecommendationSameWeekdayStayDates(stayDate: string): string[] {
    return [-14, -7, 7, 14].map((offsetDays) => shiftDate(stayDate, offsetDays));
}

async function buildRankRecommendationOwnPricePositionEvidence(options: {
    facilityId: string;
    stayDate: string;
}): Promise<RankRecommendationOwnPricePositionEvidence> {
    const diagnostics: string[] = [];
    const series = await readCompetitorPriceSnapshotSeriesForStayDate(options.facilityId, options.stayDate)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read rank recommendation competitor price evidence`, {
                stayDate: options.stayDate,
                error
            });
            return null;
        });
    const record = series?.latestRecord ?? null;
    if (record === null) {
        return {
            signal: null,
            comparableGuestCount: 0,
            source: null,
            scope: null,
            diagnostics: ["competitor_price_snapshot_missing"]
        };
    }

    const source: RankRecommendationOwnPricePositionSource = "competitor_price_snapshot";
    const scope: RankRecommendationOwnPricePositionScope = "facility_unmapped_room_type";
    const ownYadNo = record.payload.own?.yadNo ?? null;
    if (ownYadNo === null) {
        return {
            signal: null,
            comparableGuestCount: 0,
            source,
            scope,
            diagnostics: ["competitor_price_own_missing"]
        };
    }
    if (record.competitorSet.length === 0 || record.payload.competitors.length === 0) {
        diagnostics.push("competitor_price_competitor_set_missing");
    }

    let lowCount = 0;
    let highCount = 0;
    let comparableCount = 0;
    const minimumPricesByGuestCount = buildMinimumCompetitorPricesByGuestCount(record, null, null);

    for (const guestCount of COMPETITOR_PRICE_GUEST_COUNTS) {
        const minimumPrices = minimumPricesByGuestCount.get(guestCount) ?? new Map();
        const ownPrice = minimumPrices.get(ownYadNo)?.price ?? null;
        if (ownPrice === null) {
            continue;
        }

        const competitorPrices: number[] = [];
        for (const [yadNo, value] of minimumPrices.entries()) {
            if (yadNo !== ownYadNo && Number.isFinite(value.price)) {
                competitorPrices.push(value.price);
            }
        }
        if (competitorPrices.length === 0) {
            continue;
        }

        comparableCount += 1;
        const median = getMedianNumber(competitorPrices);
        if (median === null || median <= 0) {
            continue;
        }

        const ratio = ownPrice / median;
        if (ratio <= 0.95) {
            lowCount += 1;
        } else if (ratio >= 1.05) {
            highCount += 1;
        }
    }

    if (comparableCount === 0) {
        diagnostics.push("competitor_price_comparable_plan_missing");
        return {
            signal: null,
            comparableGuestCount: comparableCount,
            source,
            scope,
            diagnostics: Array.from(new Set(diagnostics))
        };
    }
    if (comparableCount < 2) {
        diagnostics.push("competitor_price_comparable_guest_count_low");
        return {
            signal: null,
            comparableGuestCount: comparableCount,
            source,
            scope,
            diagnostics: Array.from(new Set(diagnostics))
        };
    }

    let signal: RankRecommendationOwnPricePositionSignal = "own_price_near_competitors";
    if (lowCount >= 2 && highCount === 0) {
        signal = "own_price_low_against_competitors";
    } else if (highCount >= 2 && lowCount === 0) {
        signal = "own_price_high_against_competitors";
    }

    diagnostics.push(`competitor_price_signal_${signal}`);
    return {
        signal,
        comparableGuestCount: comparableCount,
        source,
        scope,
        diagnostics: Array.from(new Set(diagnostics))
    };
}

function getMedianNumber(values: number[]): number | null {
    const sorted = values
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
    if (sorted.length === 0) {
        return null;
    }

    const middleIndex = Math.floor(sorted.length / 2);
    const upper = sorted[middleIndex];
    if (upper === undefined) {
        return null;
    }
    if (sorted.length % 2 === 1) {
        return upper;
    }

    const lower = sorted[middleIndex - 1];
    return lower === undefined ? upper : (lower + upper) / 2;
}

function buildRankRecommendationHistoricalReferenceCurveResult(options: {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    roomGroupId: string;
    response: BookingCurveResponse;
    segment: CurveSegment;
    curveKind: ReferenceCurveKind;
}): ReferenceCurveResult {
    const points: CurvePoint[] = (options.response.booking_curve ?? [])
        .map((point): CurvePoint | null => {
            const observedDate = toCompactDateKey(point.date);
            const lt = observedDate === null ? null : getDaysBetweenDateKeys(options.stayDate, observedDate);
            if (lt === null) {
                return null;
            }
            const values = [
                point[options.segment]?.last_year_room_sum,
                point[options.segment]?.two_years_ago_room_sum,
                point[options.segment]?.three_years_ago_room_sum
            ];
            return {
                lt,
                rooms: averageBookingCurveRoomCounts(values),
                sourceCount: countBookingCurveRoomCounts(values)
            };
        })
        .filter((point): point is CurvePoint => point !== null);
    const actPoint = buildRankRecommendationHistoricalReferenceActPoint(points);
    const referencePoints = actPoint === null ? points : [...points, actPoint];
    const sourceStayDateCount = Math.max(0, ...points.map((point) => point.sourceCount));

    return {
        curveKind: options.curveKind,
        algorithmVersion: `${options.curveKind}:rank_recommendation_raw_history:v1`,
        facilityId: options.facilityId,
        scope: "roomGroup",
        roomGroupId: options.roomGroupId,
        segment: options.segment,
        targetStayDate: options.stayDate,
        asOfDate: options.asOfDate,
        points: referencePoints,
        diagnostics: {
            sourceStayDateCount,
            ...(points.length === 0 || points.every((point) => point.rooms === null) ? { missingReason: "raw_history_reference_missing" } : {}),
            warnings: ["raw_history_reference"]
        }
    };
}

function buildRankRecommendationHistoricalReferenceActPoint(points: CurvePoint[]): CurvePoint | null {
    const zeroLeadPoint = points.find((point) => point.lt === 0);
    if (zeroLeadPoint === undefined || zeroLeadPoint.rooms === null) {
        return null;
    }
    return {
        lt: "ACT",
        rooms: zeroLeadPoint.rooms,
        sourceCount: zeroLeadPoint.sourceCount
    };
}

function getRankRecommendationForecastSignal(result: ForecastResultV1Candidate): RankRecommendationForecastSignal | null {
    if (result.diagnostics.missingReason !== undefined || result.expectedOccupancyRatio == null) {
        return null;
    }
    if (result.expectedOccupancyRatio >= 0.9) {
        return "high_occupancy";
    }
    if (result.expectedOccupancyRatio <= 0.45) {
        return "low_occupancy";
    }
    return "neutral";
}

function buildRankRecommendationForecastDiagnostics(result: ForecastResultV1Candidate): string[] {
    const diagnostics = [
        `forecast_model:${result.modelId}`,
        ...result.diagnostics.warnings.map((warning) => `forecast_warning:${warning}`)
    ];
    if (result.diagnostics.missingReason !== undefined) {
        diagnostics.push(`forecast_missing:${result.diagnostics.missingReason}`);
    }
    if (result.expectedOccupancyRatio == null) {
        diagnostics.push("forecast_expected_occupancy_missing");
    }
    return Array.from(new Set(diagnostics));
}

function getNullableDifference(current: number | null, reference: number | null): number | null {
    return current === null || reference === null ? null : current - reference;
}

function isRankRecommendationGroupDriven(options: {
    transientDeviation: number | null;
    groupDeviation: number | null;
}): boolean {
    return options.groupDeviation !== null
        && options.groupDeviation > 0
        && (options.transientDeviation === null || options.transientDeviation <= 0);
}

function findLatestBookingCurvePoint(response: BookingCurveResponse, asOfDate: string): BookingCurvePoint | null {
    const normalizedAsOfDate = normalizeDateKey(asOfDate) ?? asOfDate;
    let latestPoint: BookingCurvePoint | null = null;
    let latestDate = "";
    for (const point of response.booking_curve ?? []) {
        const pointDate = normalizeDateKey(point.date);
        if (pointDate === null || pointDate > normalizedAsOfDate || pointDate < latestDate) {
            continue;
        }

        latestPoint = point;
        latestDate = pointDate;
    }

    return latestPoint;
}

function normalizeBookingCurveRoomCount(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function averageBookingCurveRoomCounts(values: Array<number | null | undefined>): number | null {
    return averageBookingCurveNumericValues(values);
}

function averageBookingCurveNumericValues(values: Array<number | null | undefined>): number | null {
    const normalizedValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (normalizedValues.length === 0) {
        return null;
    }

    return normalizedValues.reduce((sum, value) => sum + value, 0) / normalizedValues.length;
}

function countBookingCurveRoomCounts(values: Array<number | null | undefined>): number {
    return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).length;
}

function findLatestSalesAdrObservation(observations: SalesAdrObservation[], asOfDate: string): SalesAdrObservation | null {
    const normalizedAsOfDate = normalizeDateKey(asOfDate) ?? asOfDate;
    let latestObservation: SalesAdrObservation | null = null;
    let latestObservedDate = "";
    for (const observation of observations) {
        if (observation.observedDate > normalizedAsOfDate || observation.observedDate < latestObservedDate) {
            continue;
        }

        latestObservation = observation;
        latestObservedDate = observation.observedDate;
    }

    return latestObservation;
}

function isPositiveReferenceComparable(current: number | null, reference: number | null): boolean {
    return current !== null && reference !== null && reference > 0;
}

function isCurrentValueDownAgainstReference(options: {
    current: number | null;
    reference: number | null;
    downRatioThreshold: number;
}): boolean {
    const { current, reference } = options;
    return current !== null
        && reference !== null
        && reference > 0
        && current / reference <= options.downRatioThreshold;
}

interface RankRecommendationCandidateFilterResult {
    candidates: RankRecommendationCandidate[];
    hiddenCount: number;
}

interface RankRecommendationTargetMonthOption {
    month: string;
    count: number;
}

interface RankRecommendationHiddenSummary {
    userDecision: number;
    resolvedRankChange: number;
    targetMonth: number;
    viewMode: number;
    overflow: number;
}

function applyRankRecommendationDecisionFilter(
    candidates: RankRecommendationCandidate[],
    decisionRecords: RankRecommendationDecisionRecord[],
    asOfDate: string
): RankRecommendationCandidateFilterResult {
    const decisionByKey = new Map(decisionRecords.map((record) => [record.cacheKey, record]));
    let hiddenCount = 0;
    const visibleCandidates = candidates.filter((candidate) => {
        const decision = decisionByKey.get(buildRankRecommendationDecisionCacheKey({
            facilityId: candidate.facilityId,
            stayDate: candidate.stayDate,
            roomGroupId: candidate.roomGroupId,
            action: candidate.action,
            reasonFingerprint: candidate.reasonFingerprint
        }));
        if (decision === undefined) {
            return true;
        }

        if (isRankRecommendationConfidenceEscalated(candidate, decision)) {
            return true;
        }

        if (decision.decisionType === "dismiss") {
            hiddenCount += 1;
            return false;
        }

        const isVisible = decision.cooldownUntilAsOfDate === null || decision.cooldownUntilAsOfDate <= asOfDate;
        if (!isVisible) {
            hiddenCount += 1;
        }
        return isVisible;
    });

    return {
        candidates: visibleCandidates,
        hiddenCount
    };
}

function applyRankRecommendationViewModeFilter(
    candidates: RankRecommendationCandidate[],
    viewMode: RankRecommendationViewMode
): RankRecommendationCandidateFilterResult {
    if (viewMode === "all") {
        return {
            candidates,
            hiddenCount: 0
        };
    }

    const visibleCandidates = candidates.filter((candidate) => isRankRecommendationVisibleInViewMode(candidate, viewMode));
    return {
        candidates: visibleCandidates,
        hiddenCount: candidates.length - visibleCandidates.length
    };
}

function buildRankRecommendationTargetMonthOptions(
    candidates: readonly RankRecommendationCandidate[],
    preferredMonthKeys: readonly string[] = []
): RankRecommendationTargetMonthOption[] {
    const countByMonth = new Map<string, number>();
    for (const candidate of candidates) {
        const month = getRankRecommendationTargetMonth(candidate);
        if (month === null) {
            continue;
        }

        countByMonth.set(month, (countByMonth.get(month) ?? 0) + 1);
    }

    if (preferredMonthKeys.length > 0) {
        return preferredMonthKeys
            .filter((month) => /^\d{6}$/.test(month))
            .map((month) => ({ month, count: countByMonth.get(month) ?? 0 }));
    }

    return Array.from(countByMonth.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([month, count]) => ({ month, count }));
}

function resolveRankRecommendationEffectiveTargetMonth(
    targetMonth: string | null,
    options: readonly RankRecommendationTargetMonthOption[]
): string | null {
    if (targetMonth === null) {
        return null;
    }

    return options.some((option) => option.month === targetMonth) ? targetMonth : null;
}

function applyRankRecommendationTargetMonthFilter(
    candidates: RankRecommendationCandidate[],
    targetMonth: string | null
): RankRecommendationCandidateFilterResult {
    if (targetMonth === null) {
        return {
            candidates,
            hiddenCount: 0
        };
    }

    const visibleCandidates = candidates.filter((candidate) => getRankRecommendationTargetMonth(candidate) === targetMonth);
    return {
        candidates: visibleCandidates,
        hiddenCount: candidates.length - visibleCandidates.length
    };
}

function getRankRecommendationTargetMonth(candidate: RankRecommendationCandidate): string | null {
    return /^\d{8}$/.test(candidate.stayDate) ? candidate.stayDate.slice(0, 6) : null;
}

function isRankRecommendationVisibleInViewMode(
    candidate: RankRecommendationCandidate,
    viewMode: RankRecommendationViewMode
): boolean {
    if (viewMode === "raise") {
        return candidate.action === "raise_watch";
    }
    if (viewMode === "lower") {
        return candidate.action === "lower_watch";
    }
    if (viewMode === "caution") {
        return summarizeRankRecommendationConfidenceCautions(candidate.diagnostics).length > 0;
    }
    return true;
}

function isRankRecommendationConfidenceEscalated(
    candidate: RankRecommendationCandidate,
    decision: RankRecommendationDecisionRecord
): boolean {
    if (decision.confidenceLevel === undefined) {
        return false;
    }

    return getRankRecommendationConfidenceLevelWeight(getRankRecommendationConfidenceLevel(candidate.confidence))
        > getRankRecommendationConfidenceLevelWeight(decision.confidenceLevel);
}

function applyResolvedRankRecommendationFilter(
    candidates: RankRecommendationCandidate[],
    statuses: LincolnSuggestStatus[],
    asOfDate: string
): RankRecommendationCandidateFilterResult {
    if (statuses.length === 0) {
        return {
            candidates,
            hiddenCount: 0
        };
    }

    const resolvedKeys = new Set<string>();
    for (const status of statuses) {
        const stayDate = status.date?.trim() ?? "";
        const roomGroupId = status.rm_room_group_id?.trim() ?? "";
        if (stayDate === "" || roomGroupId === "") {
            continue;
        }

        const timestamp = getLincolnSuggestStatusTimestamp(status);
        const reflectedDateKey = getDateKeyFromTimestamp(timestamp);
        if (reflectedDateKey === null || reflectedDateKey < asOfDate) {
            continue;
        }

        resolvedKeys.add(`${stayDate}:${roomGroupId}`);
    }

    if (resolvedKeys.size === 0) {
        return {
            candidates,
            hiddenCount: 0
        };
    }

    let hiddenCount = 0;
    const visibleCandidates = candidates.filter((candidate) => {
        const isResolved = resolvedKeys.has(`${candidate.stayDate}:${candidate.roomGroupId}`);
        if (isResolved) {
            hiddenCount += 1;
        }
        return !isResolved;
    });

    return {
        candidates: visibleCandidates,
        hiddenCount
    };
}

function buildRankRecommendationRankGapContextByScope(
    response: RankRecommendationCurrentSettingsResponse,
    rankOrder: RankRecommendationRankOrderResolution
): Map<string, RankRecommendationRankGapContext> {
    const contextByScope = new Map<string, RankRecommendationRankGapContext>();

    for (const currentSetting of response.suggest_output_current_settings ?? []) {
        const stayDate = toCompactDateKey(currentSetting.stay_date ?? "");
        if (stayDate === null) {
            continue;
        }

        const roomGroups: Array<{
            roomGroupId: string;
            roomGroupName: string;
            currentRankName: string | null;
            occupancyCapacity: SalesSettingRoomCapacity | null;
            rankOrderIndex: number | null;
        }> = [];
        for (const roomGroup of currentSetting.rm_room_groups ?? []) {
            const roomGroupId = roomGroup.rm_room_group_id?.trim() ?? "";
            const roomGroupName = roomGroup.rm_room_group_name?.trim() ?? "";
            if (roomGroupId === "" || roomGroupName === "") {
                continue;
            }

            const currentRankCode = normalizeRankRecommendationElementText(roomGroup.latest_current?.price_rank_code ?? null);
            const currentRankName = normalizeRankRecommendationElementText(roomGroup.latest_current?.price_rank_name ?? null);
            const rankOrderIndex = resolveRankRecommendationRankOrderIndex(rankOrder, currentRankCode, currentRankName);
            const occupancyCapacity = resolveRankRecommendationRankGapOccupancyCapacity(roomGroup);
            roomGroups.push({
                roomGroupId,
                roomGroupName,
                currentRankName,
                occupancyCapacity,
                rankOrderIndex
            });
        }

        for (const targetRoomGroup of roomGroups) {
            const targetRankOrderIndex = targetRoomGroup.rankOrderIndex;
            const entries = roomGroups.map((roomGroup): RankRecommendationRankGapEntry => {
                const diagnostics: string[] = [];
                if (roomGroup.currentRankName === null) {
                    diagnostics.push("current_rank_missing");
                }
                if (rankOrder.source === "unresolved") {
                    diagnostics.push("rank_order_unresolved");
                }
                if (roomGroup.rankOrderIndex === null) {
                    diagnostics.push("rank_order_index_missing");
                }
                if (targetRankOrderIndex === null) {
                    diagnostics.push("target_rank_order_missing");
                }
                if (roomGroup.occupancyCapacity === null) {
                    diagnostics.push("occupancy_capacity_missing");
                }

                return {
                    roomGroupId: roomGroup.roomGroupId,
                    roomGroupName: roomGroup.roomGroupName,
                    currentRankName: roomGroup.currentRankName,
                    occupancyCapacity: roomGroup.occupancyCapacity,
                    rankOrderIndex: roomGroup.rankOrderIndex,
                    relativeStep: rankOrder.source === "unresolved" || roomGroup.rankOrderIndex === null || targetRankOrderIndex === null
                        ? null
                        : roomGroup.rankOrderIndex - targetRankOrderIndex,
                    isTarget: roomGroup.roomGroupId === targetRoomGroup.roomGroupId,
                    diagnostics
                };
            });

            contextByScope.set(buildRankRecommendationRankGapContextScopeKey(stayDate, targetRoomGroup.roomGroupId), {
                entries,
                rankOrderSource: rankOrder.source,
                targetRankOrderIndex,
                signature: [
                    `source:${rankOrder.source}`,
                    `target:${targetRoomGroup.roomGroupId}:${targetRankOrderIndex ?? "-"}`,
                    entries.map((entry) => [
                        entry.roomGroupId,
                        entry.roomGroupName,
                        entry.currentRankName ?? "-",
                        entry.occupancyCapacity === null ? "-/-" : `${entry.occupancyCapacity.currentValue}/${entry.occupancyCapacity.maxValue}`,
                        entry.rankOrderIndex ?? "-",
                        entry.relativeStep ?? "-",
                        entry.isTarget ? "target" : "other",
                        entry.diagnostics.join("/")
                    ].join(",")).join("|")
                ].join(":")
            });
        }
    }

    return contextByScope;
}

function buildRankRecommendationRankGapContextScopeKey(stayDate: string, roomGroupId: string): string {
    return `${stayDate}:${roomGroupId}`;
}

function resolveRankRecommendationRankGapOccupancyCapacity(
    roomGroup: RankRecommendationCurrentSettingRoomGroup
): SalesSettingRoomCapacity | null {
    const maxValue = roomGroup.max_num_room;
    const remainingValue = roomGroup.remaining_num_room;
    if (
        typeof maxValue !== "number"
        || typeof remainingValue !== "number"
        || !Number.isFinite(maxValue)
        || !Number.isFinite(remainingValue)
        || maxValue <= 0
        || remainingValue < 0
    ) {
        return null;
    }

    return {
        currentValue: Math.max(0, Math.min(maxValue, maxValue - remainingValue)),
        maxValue
    };
}

function resolveRankRecommendationRankOrderIndex(
    rankOrder: RankRecommendationRankOrderResolution,
    currentRankCode: string | null,
    currentRankName: string | null
): number | null {
    if (rankOrder.source === "unresolved") {
        return null;
    }

    const index = rankOrder.ranksHighToLow.findIndex((rank) => (
        (currentRankCode !== null && rank.code === currentRankCode)
        || (currentRankName !== null && rank.name === currentRankName)
    ));
    return index < 0 ? null : index;
}

function buildRankRecommendationDisplayInfoByKey(
    candidates: readonly RankRecommendationCandidate[],
    decisionRecords: readonly RankRecommendationDecisionRecord[],
    statuses: readonly LincolnSuggestStatus[],
    asOfDate: string,
    rankGapContextByScope: ReadonlyMap<string, RankRecommendationRankGapContext>
): Map<string, RankRecommendationDisplayInfo> {
    const latestRankChangeByScope = buildLatestRankRecommendationRankChangeByScope(statuses);
    const decisionByExactKey = new Map(decisionRecords.map((record) => [record.cacheKey, record]));
    const latestDecisionByScope = buildLatestRankRecommendationDecisionByScope(decisionRecords);
    const displayInfoByKey = new Map<string, RankRecommendationDisplayInfo>();

    for (const candidate of candidates) {
        const key = buildRankRecommendationCandidateDisplayInfoKey(candidate);
        const latestRankChange = latestRankChangeByScope.get(buildRankRecommendationCandidateHistoryScopeKey(candidate)) ?? null;
        const exactDecision = decisionByExactKey.get(key) ?? null;
        const relatedDecision = latestDecisionByScope.get(buildRankRecommendationCandidateDecisionScopeKey(candidate)) ?? null;
        const rankGapContext = rankGapContextByScope.get(buildRankRecommendationRankGapContextScopeKey(candidate.stayDate, candidate.roomGroupId)) ?? null;
        const visibilityDiagnostics = buildRankRecommendationVisibilityDiagnostics({
            candidate,
            exactDecision,
            relatedDecision,
            latestRankChange,
            asOfDate
        });
        displayInfoByKey.set(key, {
            latestRankChange,
            visibilityDiagnostics,
            rankGapContext,
            signature: formatRankRecommendationDisplayInfoSignature(latestRankChange, visibilityDiagnostics, rankGapContext)
        });
    }

    return displayInfoByKey;
}

function buildLatestRankRecommendationRankChangeByScope(
    statuses: readonly LincolnSuggestStatus[]
): Map<string, RankRecommendationLatestRankChange> {
    const latestRankChangeByScope = new Map<string, RankRecommendationLatestRankChange>();

    for (const status of statuses.slice().sort(compareLincolnSuggestStatuses)) {
        const stayDate = toCompactDateKey(status.date?.trim() ?? "");
        const roomGroupId = status.rm_room_group_id?.trim() ?? "";
        if (stayDate === null || roomGroupId === "") {
            continue;
        }

        const reflectedAt = getLincolnSuggestStatusTimestamp(status);
        const reflectedDateKey = getDateKeyFromTimestamp(reflectedAt);
        if (reflectedAt === null || reflectedDateKey === null) {
            continue;
        }

        const transition = formatSalesSettingRankTransition(
            status.before_price_rank_name ?? null,
            status.after_price_rank_name ?? null
        );
        if (transition === "-") {
            continue;
        }

        const scopeKey = `${stayDate}:${roomGroupId}`;
        if (latestRankChangeByScope.has(scopeKey)) {
            continue;
        }

        latestRankChangeByScope.set(scopeKey, {
            reflectedAt,
            reflectedDateKey,
            daysAgo: getDaysAgo(reflectedAt),
            beforeRankName: status.before_price_rank_name ?? null,
            afterRankName: status.after_price_rank_name ?? null,
            reflectorName: status.reflector_name ?? null,
            signature: [
                reflectedDateKey,
                status.before_price_rank_name ?? "-",
                status.after_price_rank_name ?? "-",
                status.reflector_name ?? "-"
            ].join(":")
        });
    }

    return latestRankChangeByScope;
}

function buildLatestRankRecommendationDecisionByScope(
    decisionRecords: readonly RankRecommendationDecisionRecord[]
): Map<string, RankRecommendationDecisionRecord> {
    const latestDecisionByScope = new Map<string, RankRecommendationDecisionRecord>();
    for (const record of decisionRecords) {
        const scopeKey = buildRankRecommendationDecisionScopeKey({
            facilityId: record.facilityId,
            stayDate: record.stayDate,
            roomGroupId: record.roomGroupId,
            action: record.action
        });
        const current = latestDecisionByScope.get(scopeKey);
        if (current === undefined || getRankRecommendationDecisionSortValue(record) > getRankRecommendationDecisionSortValue(current)) {
            latestDecisionByScope.set(scopeKey, record);
        }
    }
    return latestDecisionByScope;
}

function buildRankRecommendationVisibilityDiagnostics(options: {
    candidate: RankRecommendationCandidate;
    exactDecision: RankRecommendationDecisionRecord | null;
    relatedDecision: RankRecommendationDecisionRecord | null;
    latestRankChange: RankRecommendationLatestRankChange | null;
    asOfDate: string;
}): string[] {
    const diagnostics: string[] = [];

    if (options.latestRankChange === null) {
        diagnostics.push("候補表示: 前回変更履歴はありません");
    } else if (options.latestRankChange.reflectedDateKey >= options.asOfDate) {
        diagnostics.push("候補表示: 前回変更は基準日以降です。通常は反映済みとして非表示になります");
    } else {
        diagnostics.push("候補表示: 前回変更は基準日より前です");
    }

    if (options.exactDecision !== null) {
        diagnostics.push(...formatRankRecommendationExactDecisionDiagnostics(options.candidate, options.exactDecision, options.asOfDate));
        return diagnostics;
    }

    if (options.relatedDecision !== null && options.relatedDecision.reasonFingerprint !== options.candidate.reasonFingerprint) {
        diagnostics.push(`候補表示: ${formatRankRecommendationDecisionType(options.relatedDecision.decisionType)}済みの前回判断とは別の根拠です`);
        return diagnostics;
    }

    diagnostics.push("候補表示: 利用者判断はありません");
    return diagnostics;
}

function formatRankRecommendationExactDecisionDiagnostics(
    candidate: RankRecommendationCandidate,
    decision: RankRecommendationDecisionRecord,
    asOfDate: string
): string[] {
    const decisionLabel = formatRankRecommendationDecisionType(decision.decisionType);
    const confidenceLevel = getRankRecommendationConfidenceLevel(candidate.confidence);
    const diagnostics = [`利用者判断: ${decisionLabel} (${formatCompactDateForDisplay(decision.asOfDate)})`];

    if (isRankRecommendationConfidenceEscalated(candidate, decision)) {
        const previousConfidence = decision.confidenceLevel === undefined
            ? "未記録"
            : formatRankRecommendationConfidenceLevel(decision.confidenceLevel);
        diagnostics.push(`候補表示: 前回判断後に確度が ${previousConfidence} から ${formatRankRecommendationConfidenceLevel(confidenceLevel)} に上がったため表示しています`);
        return diagnostics;
    }

    if (decision.decisionType === "snooze") {
        if (decision.cooldownUntilAsOfDate === null) {
            diagnostics.push("候補表示: 様子見期限が未設定のため表示しています");
        } else if (decision.cooldownUntilAsOfDate <= asOfDate) {
            diagnostics.push(`候補表示: 様子見期限 ${formatCompactDateForDisplay(decision.cooldownUntilAsOfDate)} を過ぎたため表示しています`);
        } else {
            diagnostics.push(`候補表示: 様子見期限 ${formatCompactDateForDisplay(decision.cooldownUntilAsOfDate)} までは通常非表示です`);
        }
        return diagnostics;
    }

    diagnostics.push("候補表示: 対応不要済みの候補ですが表示されています");
    return diagnostics;
}

function buildRankRecommendationCandidateDisplayInfoKey(candidate: RankRecommendationCandidate): string {
    return buildRankRecommendationDecisionCacheKey({
        facilityId: candidate.facilityId,
        stayDate: candidate.stayDate,
        roomGroupId: candidate.roomGroupId,
        action: candidate.action,
        reasonFingerprint: candidate.reasonFingerprint
    });
}

function buildRankRecommendationCandidateHistoryScopeKey(candidate: RankRecommendationCandidate): string {
    return `${candidate.stayDate}:${candidate.roomGroupId}`;
}

function buildRankRecommendationCandidateDecisionScopeKey(candidate: RankRecommendationCandidate): string {
    return buildRankRecommendationDecisionScopeKey({
        facilityId: candidate.facilityId,
        stayDate: candidate.stayDate,
        roomGroupId: candidate.roomGroupId,
        action: candidate.action
    });
}

function buildRankRecommendationDecisionScopeKey(parts: {
    facilityId: string;
    stayDate: string;
    roomGroupId: string;
    action: RankRecommendationAction;
}): string {
    return [
        `facility:${parts.facilityId}`,
        `stayDate:${parts.stayDate}`,
        `roomGroup:${parts.roomGroupId}`,
        `action:${parts.action}`
    ].join("|");
}

function getRankRecommendationDecisionSortValue(record: RankRecommendationDecisionRecord): number {
    const value = Date.parse(record.decidedAt);
    return Number.isNaN(value) ? 0 : value;
}

function formatRankRecommendationDisplayInfoSignature(
    latestRankChange: RankRecommendationLatestRankChange | null,
    visibilityDiagnostics: readonly string[],
    rankGapContext: RankRecommendationRankGapContext | null
): string {
    return [
        latestRankChange?.signature ?? "no-rank-change",
        visibilityDiagnostics.join("/"),
        rankGapContext?.signature ?? "no-rank-gap"
    ].join("|");
}

function renderRankRecommendationList(
    candidates: RankRecommendationCandidate[],
    options: {
        signature: string;
        statusText: string | null;
        facilityCacheKey?: string;
        rankLadder?: readonly RankRecommendationRankLadderEntry[];
        rankOrder?: RankRecommendationRankOrderResolution;
        viewMode?: RankRecommendationViewMode;
        targetMonth?: string | null;
        targetMonthOptions?: readonly RankRecommendationTargetMonthOption[];
        hiddenSummary?: RankRecommendationHiddenSummary;
        displayInfoByKey?: ReadonlyMap<string, RankRecommendationDisplayInfo>;
        curvePreviewInfoByKey?: ReadonlyMap<string, RankRecommendationCurvePreviewInfo>;
        canShowMore?: boolean;
        canResetDisplayLimit?: boolean;
    }
): void {
    const host = resolveRankRecommendationListHost();
    if (host === null) {
        cleanupRankRecommendationList();
        return;
    }

    const rootElement = document.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_LIST_ATTRIBUTE}]`) ?? document.createElement("section");
    rootElement.setAttribute(RANK_RECOMMENDATION_LIST_ATTRIBUTE, "");
    rootElement.setAttribute(RANK_RECOMMENDATION_LIST_SIGNATURE_ATTRIBUTE, options.signature);

    const metaDetailText = formatRankRecommendationListMeta(
        candidates,
        options.statusText,
        options.hiddenSummary,
        options.viewMode ?? "all",
        options.targetMonth ?? null,
        options.curvePreviewInfoByKey
    );

    const viewModel = buildRankRecommendationListViewModel(candidates, {
        displayInfoByKey: options.displayInfoByKey,
        curvePreviewInfoByKey: options.curvePreviewInfoByKey,
        rankOptions: options.rankOrder?.ranksHighToLow ?? []
    });

    const warmCacheMonthControlsElement = document.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_MONTH_CONTROLS_ATTRIBUTE}]`);
    const expectedPreviousElement = warmCacheMonthControlsElement?.parentElement === host.parentElement
        && warmCacheMonthControlsElement.previousElementSibling === host.insertAfterElement
        ? warmCacheMonthControlsElement
        : host.insertAfterElement;

    if (rootElement.parentElement !== host.parentElement || rootElement.previousElementSibling !== expectedPreviousElement) {
        rootElement.remove();
        host.parentElement.insertBefore(rootElement, expectedPreviousElement.nextSibling);
    }

    syncRankRecommendationReactList(rootElement, {
        signature: options.signature,
        mode: options.signature.startsWith("fixture:") ? "fixture" : "live",
        title: "料金調整候補",
        metaText: formatRankRecommendationListShortMeta(
            candidates,
            options.statusText,
            options.hiddenSummary,
            options.viewMode ?? "all",
            options.targetMonth ?? null,
            options.curvePreviewInfoByKey
        ),
        metaTitle: metaDetailText,
        columns: viewModel.columns,
        emptyText: candidates.length === 0
            ? (options.viewMode === undefined || options.viewMode === "all"
                ? "現在表示中のカレンダーに料金調整候補はありません"
                : "現在の表示条件に該当する料金調整候補はありません")
            : null,
        controls: buildRankRecommendationReactControlsSnapshot({
            statusText: options.statusText,
            viewMode: options.viewMode ?? "all",
            targetMonth: options.targetMonth ?? null,
            targetMonthOptions: options.targetMonthOptions ?? [],
            remainingCount: options.hiddenSummary?.overflow ?? 0,
            canShowMore: options.canShowMore === true,
            canResetDisplayLimit: options.canResetDisplayLimit === true,
            rankLadder: options.rankLadder,
            rankOrder: options.rankOrder
        }),
        rows: viewModel.rows.map(buildRankRecommendationReactRowSnapshot)
    });
    hydrateRankRecommendationReactPreviewRows(viewModel);
    renderSalesSettingWarmCacheInlineStatus();
    renderSalesSettingWarmCacheMonthControls(collectMonthlyCalendarCells());
}

function buildRankRecommendationListViewModel(
    candidates: readonly RankRecommendationCandidate[],
    options: {
        displayInfoByKey?: ReadonlyMap<string, RankRecommendationDisplayInfo> | undefined;
        curvePreviewInfoByKey?: ReadonlyMap<string, RankRecommendationCurvePreviewInfo> | undefined;
        rankOptions: readonly { code: string; name: string }[];
    }
): RankRecommendationListViewModel {
    return {
        columns: ["優先度", "判断", "宿泊日", "部屋タイプ", "現ランク", "推奨", "根拠", "状態", "操作"],
        rows: candidates.map((candidate) => {
            const displayInfoKey = buildRankRecommendationCandidateDisplayInfoKey(candidate);
            const rankChangeProposal = buildRankRecommendationRankChangeProposal({
                candidate,
                provider: "lincoln_custom_suggest"
            });
            return {
                candidate,
                displayInfo: options.displayInfoByKey?.get(displayInfoKey) ?? null,
                curvePreviewInfo: options.curvePreviewInfoByKey?.get(displayInfoKey) ?? null,
                rankOptions: options.rankOptions,
                actionLabel: formatRankRecommendationAction(candidate),
                reasonText: candidate.reasonCodes.join(" / "),
                cautionText: summarizeRankRecommendationConfidenceCautions(candidate.diagnostics).join(" / "),
                rankChangeProposal,
                pendingDecision: getPendingRankRecommendationDecision(candidate),
                pendingRankChange: getPendingRankRecommendationRankChange(candidate),
                rankChangeResult: getRankRecommendationRankChangeResult(candidate),
                isCurvePreviewOpen: isRankRecommendationCurvePreviewOpen(candidate),
                isRankChangePreviewOpen: isRankRecommendationRankChangePreviewOpen(candidate),
                isRankChangeBlockedByScope: isRankRecommendationRankChangeBlockedByScope(candidate)
            };
        })
    };
}

function buildRankRecommendationReactControlsSnapshot(options: {
    statusText: string | null;
    viewMode: RankRecommendationViewMode;
    targetMonth: string | null;
    targetMonthOptions: readonly RankRecommendationTargetMonthOption[];
    remainingCount: number;
    canShowMore: boolean;
    canResetDisplayLimit: boolean;
    rankLadder: readonly RankRecommendationRankLadderEntry[] | undefined;
    rankOrder: RankRecommendationRankOrderResolution | undefined;
}): RankRecommendationReactControlsSnapshot {
    return {
        targetMonth: options.statusText === null && options.targetMonthOptions.length > 0
            ? {
                currentValue: options.targetMonth ?? "all",
                options: [
                    {
                        value: "all",
                        label: `全ての月 (${options.targetMonthOptions.reduce((total, option) => total + option.count, 0)}件)`
                    },
                    ...options.targetMonthOptions.map((option) => ({
                        value: option.month,
                        label: `${formatRankRecommendationTargetMonthLabel(option.month)} (${option.count}件)`
                    }))
                ]
            }
            : null,
        viewMode: options.statusText === null
            ? {
                options: RANK_RECOMMENDATION_VIEW_MODE_OPTIONS.map((option) => ({
                    mode: option.mode,
                    label: option.label,
                    title: option.title,
                    pressed: option.mode === options.viewMode
                }))
            }
            : null,
        displayLimit: options.canShowMore || options.canResetDisplayLimit
            ? {
                showMoreButton: options.canShowMore
                    ? buildRankRecommendationButtonSnapshot({
                        text: `さらに表示 (${Math.min(RANK_RECOMMENDATION_DISPLAY_LIMIT_STEP, options.remainingCount)}件)`,
                        title: "表示件数を10件増やす",
                        action: "display-more"
                    })
                    : null,
                resetButton: options.canResetDisplayLimit
                    ? buildRankRecommendationButtonSnapshot({
                        text: "10件に戻す",
                        title: "表示件数を初期値の10件に戻す",
                        action: "display-reset"
                    })
                    : null
            }
            : null,
        rankOrder: options.rankLadder !== undefined && options.rankOrder !== undefined
            ? {
                source: options.rankOrder.source,
                ladderJson: JSON.stringify(options.rankLadder),
                summary: formatRankRecommendationOrderShortSummary(options.rankOrder),
                summaryTitle: formatRankRecommendationOrderSummary(options.rankOrder),
                inputValue: options.rankOrder.ranksHighToLow.map((rank) => rank.name).join(", "),
                status: formatRankRecommendationOrderDiagnosticStatus(options.rankOrder.diagnostics),
                saveButton: buildRankRecommendationButtonSnapshot({ text: "保存", action: "rank-order-save" }),
                reverseButton: buildRankRecommendationButtonSnapshot({
                    text: "上下を反転",
                    title: "現在の入力順を逆順にして手動順序として保存",
                    action: "rank-order-reverse"
                }),
                resetButton: buildRankRecommendationButtonSnapshot({ text: "リセット", action: "rank-order-reset" })
            }
            : null
    };
}

function buildRankRecommendationReactRowSnapshot(row: RankRecommendationListViewRow): RankRecommendationReactRowSnapshot {
    const {
        candidate,
        displayInfo,
        curvePreviewInfo,
        rankOptions,
        actionLabel,
        reasonText,
        cautionText,
        rankChangeProposal,
        pendingDecision,
        pendingRankChange,
        rankChangeResult,
        isCurvePreviewOpen,
        isRankChangePreviewOpen,
        isRankChangeBlockedByScope
    } = row;
    const curvePreviewKey = buildRankRecommendationCurvePreviewKey(candidate);
    const competitorPreviewKey = buildRankRecommendationCompetitorPreviewKey(candidate);
    const rankChangeKey = buildRankRecommendationRankChangeKey({
        facilityId: rankChangeProposal.facilityId,
        stayDate: rankChangeProposal.stayDate,
        roomGroupId: rankChangeProposal.roomGroupId,
        reasonFingerprint: rankChangeProposal.reasonFingerprint
    });
    const hasPendingDecision = pendingDecision !== null;
    const isRankChangeUnavailable = isRankChangeBlockedByScope || rankOptions.length === 0;

    return {
        key: `${candidate.stayDate}:${candidate.roomGroupId}:${candidate.reasonFingerprint}`,
        priority: candidate.priority,
        action: candidate.action,
        status: candidate.status,
        cells: buildRankRecommendationReactCells(
            candidate,
            displayInfo,
            curvePreviewInfo,
            actionLabel,
            reasonText,
            cautionText,
            rankChangeProposal,
            isRankChangeUnavailable
        ),
        analyzeLink: {
            href: `/analyze/${formatCompactDateForDisplay(candidate.stayDate)}`,
            text: "Analyzeで確認",
            attrs: buildRankRecommendationAnalyzeButtonAttrs(candidate, actionLabel, reasonText, cautionText)
        },
        curvePreviewButton: {
            text: isCurvePreviewOpen ? "曲線を閉じる" : "曲線",
            title: "Analyzeへ移動せずに、この候補のブッキングカーブを表示",
            expanded: isCurvePreviewOpen,
            attrs: {
                ...buildRankRecommendationBaseCandidateButtonAttrs(candidate),
                [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "curve-preview-toggle"
            }
        },
        competitorPreviewButton: {
            text: isRankRecommendationCompetitorPreviewOpen(candidate) ? "競合価格を閉じる" : "競合価格",
            title: "この候補行だけで対象日の競合価格 preview を表示",
            expanded: isRankRecommendationCompetitorPreviewOpen(candidate),
            attrs: {
                ...buildRankRecommendationBaseCandidateButtonAttrs(candidate),
                [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "competitor-preview-toggle"
            }
        },
        curvePopoverItems: buildRankRecommendationCurvePopoverSnapshot(candidate, curvePreviewInfo),
        inlineRankChange: {
            options: rankOptions,
            selectedCode: rankChangeProposal.targetRankCode,
            disabled: !rankChangeProposal.enabled || isRankChangeUnavailable,
            submitButton: buildRankRecommendationRankChangeSubmitButtonSnapshot(
                rankChangeProposal,
                "反映する",
                !rankChangeProposal.enabled || isRankChangeUnavailable
            )
        },
        rankChangeButton: {
            text: isRankChangePreviewOpen ? "ランク調整を閉じる" : "ランク調整",
            title: rankChangeProposal.enabled
                ? "Analyzeへ移動せずに、この候補のランク変更 preview を表示"
                : `ランク調整不可: ${formatRankRecommendationRankChangeDisabledReasons(rankChangeProposal.disabledReasons)}`,
            expanded: isRankChangePreviewOpen,
            attrs: {
                ...buildRankRecommendationBaseCandidateButtonAttrs(candidate),
                [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "rank-change-preview-toggle"
            }
        },
        snoozeButton: {
            text: "様子見",
            title: "同じ候補を一時的に非表示にする",
            disabled: hasPendingDecision || isRankChangeBlockedByScope,
            attrs: buildRankRecommendationDecisionButtonAttrs(candidate, "snooze")
        },
        dismissButton: {
            text: "対応不要",
            title: "同じ根拠の候補を非表示にする",
            disabled: hasPendingDecision || isRankChangeBlockedByScope,
            attrs: buildRankRecommendationDecisionButtonAttrs(candidate, "dismiss")
        },
        pendingDecision: pendingDecision === null ? null : buildRankRecommendationPendingDecisionSnapshot(pendingDecision),
        pendingRankChange: pendingRankChange === null ? null : buildRankRecommendationPendingRankChangeSnapshot(pendingRankChange),
        rankChangeResult: rankChangeResult === null ? null : buildRankRecommendationRankChangeResultSnapshot(rankChangeResult),
        curvePreview: {
            key: curvePreviewKey,
            open: isCurvePreviewOpen
        },
        competitorPreview: {
            key: competitorPreviewKey,
            open: isRankRecommendationCompetitorPreviewOpen(candidate)
        },
        rankChangePreview: {
            key: rankChangeKey,
            open: isRankChangePreviewOpen
        }
    };
}

function buildRankRecommendationReactCells(
    candidate: RankRecommendationCandidate,
    displayInfo: RankRecommendationDisplayInfo | null,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null,
    actionLabel: string,
    reasonText: string,
    cautionText: string,
    rankChangeProposal: RankRecommendationRankChangeProposal,
    isRankChangeUnavailable: boolean
): RankRecommendationReactCellSnapshot[] {
    const latestChangeHistoryItems = buildRankRecommendationLatestChangeHistoryItems(displayInfo);
    return [
        { kind: "text", value: formatRankRecommendationPriority(candidate.priority), role: "priority" },
        {
            kind: "text",
            value: formatRankRecommendationConfidenceCellText(candidate, cautionText),
            title: [
                formatRankRecommendationConfidenceTitle(candidate),
                `宿泊まで: ${formatRankRecommendationLeadDays(candidate)}`,
                `データ: ${formatRankRecommendationRawSourceStatus(getRankRecommendationRawSourceStatus(candidate, curvePreviewInfo === null
                    ? undefined
                    : new Map([[buildRankRecommendationCandidateDisplayInfoKey(candidate), curvePreviewInfo]])))}`,
                `前回変更: ${formatRankRecommendationLatestChangeCellText(displayInfo)}`
            ].join("\n"),
            role: "decision-summary"
        },
        {
            kind: "text",
            value: formatCompactMonthDayForDisplay(candidate.stayDate) ?? formatCompactDateForDisplay(candidate.stayDate),
            title: `宿泊まで: ${formatRankRecommendationLeadDays(candidate)}`,
            role: "stay-date"
        },
        {
            kind: "text",
            value: candidate.roomGroupName,
            title: [
                candidate.roomGroupName,
                `データ: ${formatRankRecommendationRawSourceStatusTitle(candidate, curvePreviewInfo)}`,
                formatRankRecommendationLatestChangeTitle(displayInfo)
            ].join("\n"),
            role: "room-group"
        },
        buildRankRecommendationReactRankGapCell(candidate, displayInfo?.rankGapContext ?? null),
        {
            kind: "recommendedAction",
            value: actionLabel,
            title: [
                `推奨: ${actionLabel}`,
                formatRankRecommendationLatestChangeTitle(displayInfo),
                rankChangeProposal.enabled
                    ? "推奨反映: 5秒の送信待ちと送信前確認を通します"
                    : `推奨反映: 非表示または無効 (${formatRankRecommendationRankChangeDisabledReasons(rankChangeProposal.disabledReasons)})`
            ].join("\n"),
            role: "recommended-action",
            historyItems: latestChangeHistoryItems,
            quickSubmitButton: rankChangeProposal.targetRankCode === null || rankChangeProposal.targetRankName === null
                ? null
                : buildRankRecommendationRankChangeSubmitButtonSnapshot(
                    rankChangeProposal,
                    "推奨反映",
                    !rankChangeProposal.enabled || isRankChangeUnavailable
                )
        },
        {
            kind: "text",
            value: reasonText,
            title: formatRankRecommendationReasonTitle(candidate),
            role: "reason"
        },
        {
            kind: "text",
            value: formatRankRecommendationStatusBadge(candidate, curvePreviewInfo, cautionText, rankChangeProposal),
            title: formatRankRecommendationStatusBadgeTitle(candidate, curvePreviewInfo, cautionText, rankChangeProposal),
            role: "status"
        }
    ];
}

function buildRankRecommendationReactRankGapCell(
    candidate: RankRecommendationCandidate,
    context: RankRecommendationRankGapContext | null
): RankRecommendationReactCellSnapshot {
    if (context === null || context.entries.length === 0) {
        return {
            kind: "rankGap",
            currentRankText: candidate.currentRankName ?? "-",
            occupancyCapacityText: null,
            title: "同一宿泊日の全部屋タイプの現ランクを取得できませんでした",
            role: "current-rank",
            entries: []
        };
    }

    const targetEntry = context.entries.find((entry) => entry.isTarget) ?? null;
    return {
        kind: "rankGap",
        currentRankText: candidate.currentRankName ?? "-",
        occupancyCapacityText: targetEntry === null
            ? null
            : `販売室数：${formatRankRecommendationRankGapOccupancyCapacity(targetEntry)}`,
        title: "同一宿泊日の全部屋タイプの現ランクを表示",
        role: "current-rank",
        entries: context.entries.map((entry) => ({
            values: [
                entry.roomGroupName,
                entry.currentRankName ?? "-",
                formatRankRecommendationRankGapOccupancyCapacity(entry),
                formatRankRecommendationRankGapRelativeStep(entry),
                formatRankRecommendationRankGapNote(entry, context)
            ],
            isTarget: entry.isTarget
        }))
    };
}

function buildRankRecommendationButtonSnapshot(options: {
    text: string;
    action: string;
    title?: string;
    disabled?: boolean;
    attrs?: Record<string, string>;
}): RankRecommendationReactButtonSnapshot {
    const snapshot: RankRecommendationReactButtonSnapshot = {
        text: options.text,
        attrs: {
            [RANK_RECOMMENDATION_BUTTON_ATTRIBUTE]: "",
            [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: options.action,
            ...(options.attrs ?? {})
        }
    };
    if (options.title !== undefined) {
        snapshot.title = options.title;
    }
    if (options.disabled !== undefined) {
        snapshot.disabled = options.disabled;
    }
    return snapshot;
}

function buildRankRecommendationBaseCandidateButtonAttrs(candidate: RankRecommendationCandidate): Record<string, string> {
    return {
        [RANK_RECOMMENDATION_BUTTON_ATTRIBUTE]: "",
        [RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE]: candidate.stayDate,
        [RANK_RECOMMENDATION_BUTTON_AS_OF_DATE_ATTRIBUTE]: candidate.asOfDate,
        [RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE]: candidate.roomGroupId,
        [RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE]: candidate.roomGroupName,
        [RANK_RECOMMENDATION_ACTION_ATTRIBUTE]: candidate.action,
        [RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE]: candidate.reasonFingerprint
    };
}

function buildRankRecommendationAnalyzeButtonAttrs(
    candidate: RankRecommendationCandidate,
    actionLabel: string,
    reasonText: string,
    cautionText: string
): Record<string, string> {
    return {
        ...buildRankRecommendationBaseCandidateButtonAttrs(candidate),
        [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "analyze",
        [RANK_RECOMMENDATION_BUTTON_ACTION_LABEL_ATTRIBUTE]: actionLabel,
        [RANK_RECOMMENDATION_BUTTON_REASON_TEXT_ATTRIBUTE]: reasonText,
        [RANK_RECOMMENDATION_BUTTON_CAUTION_TEXT_ATTRIBUTE]: cautionText
    };
}

function buildRankRecommendationDecisionButtonAttrs(
    candidate: RankRecommendationCandidate,
    action: RankRecommendationDecisionType
): Record<string, string> {
    return {
        ...buildRankRecommendationBaseCandidateButtonAttrs(candidate),
        [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: action,
        [RANK_RECOMMENDATION_BUTTON_CONFIDENCE_LEVEL_ATTRIBUTE]: getRankRecommendationConfidenceLevel(candidate.confidence)
    };
}

function buildRankRecommendationRankChangeSubmitButtonSnapshot(
    proposal: RankRecommendationRankChangeProposal,
    label: string,
    disabled: boolean
): RankRecommendationReactButtonSnapshot {
    const attrs: Record<string, string> = {
        [RANK_RECOMMENDATION_BUTTON_ATTRIBUTE]: "",
        [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "rank-change-submit",
        [RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE]: proposal.stayDate,
        [RANK_RECOMMENDATION_BUTTON_AS_OF_DATE_ATTRIBUTE]: proposal.asOfDate,
        [RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE]: proposal.roomGroupId,
        [RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE]: proposal.roomGroupName,
        [RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE]: proposal.reasonFingerprint,
        [RANK_RECOMMENDATION_BUTTON_CONFIDENCE_LEVEL_ATTRIBUTE]: proposal.confidenceLevel,
        [RANK_RECOMMENDATION_RANK_CHANGE_GENERATED_AT_ATTRIBUTE]: proposal.generatedAt,
        [RANK_RECOMMENDATION_RANK_CHANGE_DISABLED_REASONS_ATTRIBUTE]: proposal.disabledReasons.join(",")
    };
    if (proposal.currentRankCode !== null) {
        attrs[RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_CODE_ATTRIBUTE] = proposal.currentRankCode;
    }
    if (proposal.currentRankName !== null) {
        attrs[RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_NAME_ATTRIBUTE] = proposal.currentRankName;
    }
    if (proposal.targetRankCode !== null) {
        attrs[RANK_RECOMMENDATION_RANK_CHANGE_TARGET_CODE_ATTRIBUTE] = proposal.targetRankCode;
    }
    if (proposal.targetRankName !== null) {
        attrs[RANK_RECOMMENDATION_RANK_CHANGE_TARGET_NAME_ATTRIBUTE] = proposal.targetRankName;
    }

    return {
        text: label,
        title: proposal.enabled
            ? "5秒の送信待ちに入る"
            : `送信不可: ${formatRankRecommendationRankChangeDisabledReasons(proposal.disabledReasons)}`,
        disabled,
        attrs
    };
}

function buildRankRecommendationPendingDecisionSnapshot(
    pendingDecision: PendingRankRecommendationDecision
): NonNullable<RankRecommendationReactRowSnapshot["pendingDecision"]> {
    const secondsUntilCommit = Math.max(1, Math.ceil((pendingDecision.commitAt - Date.now()) / 1000));
    return {
        key: pendingDecision.draft.cacheKey,
        label: `${formatRankRecommendationDecisionType(pendingDecision.draft.decisionType)}: ${secondsUntilCommit}秒後に確定`,
        progressPercent: calculateRankRecommendationPendingProgressPercent(pendingDecision.commitAt),
        cancelButton: {
            text: "取消",
            title: `${formatRankRecommendationDecisionType(pendingDecision.draft.decisionType)}の保存を取り消す`,
            attrs: {
                [RANK_RECOMMENDATION_BUTTON_ATTRIBUTE]: "",
                [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "decision-cancel",
                [RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE]: pendingDecision.draft.cacheKey
            }
        }
    };
}

function buildRankRecommendationPendingRankChangeSnapshot(
    pendingRankChange: PendingRankRecommendationRankChange
): NonNullable<RankRecommendationReactRowSnapshot["pendingRankChange"]> {
    const secondsUntilCommit = Math.max(1, Math.ceil((pendingRankChange.commitAt - Date.now()) / 1000));
    return {
        key: pendingRankChange.draft.cacheKey,
        label: `rank変更: ${secondsUntilCommit}秒後に送信`,
        progressPercent: calculateRankRecommendationPendingProgressPercent(pendingRankChange.commitAt),
        cancelButton: {
            text: "取消",
            title: "rank変更の送信を取り消す",
            attrs: {
                [RANK_RECOMMENDATION_BUTTON_ATTRIBUTE]: "",
                [RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE]: "rank-change-cancel",
                [RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE]: pendingRankChange.draft.cacheKey
            }
        }
    };
}

function calculateRankRecommendationPendingProgressPercent(commitAt: number): number {
    const remainingMs = Math.max(0, commitAt - Date.now());
    return Math.round((remainingMs / RANK_RECOMMENDATION_DECISION_UNDO_DELAY_MS) * 100);
}

function buildRankRecommendationRankChangeResultSnapshot(
    result: RankRecommendationRankChangeResult
): NonNullable<RankRecommendationReactRowSnapshot["rankChangeResult"]> {
    return {
        status: result.status,
        message: result.message,
        title: [
            `発生時刻: ${formatDateTimeForDisplay(result.occurredAt)}`,
            result.failureClass === null ? null : `分類: ${formatRankRecommendationRankChangeFailureClass(result.failureClass)}`,
            result.httpStatus === null ? null : `HTTP status: ${result.httpStatus}`
        ].filter((part): part is string => part !== null).join("\n")
    };
}

function buildRankRecommendationCurvePopoverSnapshot(
    candidate: RankRecommendationCandidate,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null
): { label: string; value: string }[] {
    return createRankRecommendationCurvePopoverItems(candidate, curvePreviewInfo).map((element) => {
        const label = element.querySelector("span")?.textContent ?? "";
        const value = element.querySelector("strong")?.textContent ?? "";
        return { label, value };
    });
}

function hydrateRankRecommendationReactPreviewRows(viewModel: RankRecommendationListViewModel): void {
    latestRankRecommendationCandidateByCompetitorPreviewKey.clear();
    for (const row of viewModel.rows) {
        latestRankRecommendationCandidateByCompetitorPreviewKey.set(
            buildRankRecommendationCompetitorPreviewKey(row.candidate),
            row.candidate
        );
        const curveCellElement = document.querySelector<HTMLElement>(
            `[${RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_CURVE_PREVIEW_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(buildRankRecommendationCurvePreviewKey(row.candidate))}"] [${RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE}]`
        );
        if (curveCellElement !== null) {
            curveCellElement.replaceChildren(...createRankRecommendationCurvePreviewCellChildren(row.candidate, row.curvePreviewInfo));
        }

        const competitorCellElement = document.querySelector<HTMLElement>(
            `[${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(buildRankRecommendationCompetitorPreviewKey(row.candidate))}"] [${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_CELL_ATTRIBUTE}]`
        );
        if (competitorCellElement !== null) {
            competitorCellElement.replaceChildren(...createRankRecommendationCompetitorPreviewCellChildren(row.candidate));
        }

        const rankChangeKey = buildRankRecommendationRankChangeKey({
            facilityId: row.rankChangeProposal.facilityId,
            stayDate: row.rankChangeProposal.stayDate,
            roomGroupId: row.rankChangeProposal.roomGroupId,
            reasonFingerprint: row.rankChangeProposal.reasonFingerprint
        });
        const rankChangeCellElement = document.querySelector<HTMLElement>(
            `[${RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(rankChangeKey)}"] [${RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_CELL_ATTRIBUTE}]`
        );
        if (rankChangeCellElement !== null) {
            rankChangeCellElement.replaceChildren(...createRankRecommendationRankChangePreviewCellChildren(
                row.candidate,
                row.rankChangeProposal,
                row.reasonText,
                row.cautionText
            ));
        }
    }
}

function formatRankRecommendationOrderSummary(rankOrder: RankRecommendationRankOrderResolution): string {
    const orderText = rankOrder.ranksHighToLow.length > 0
        ? rankOrder.ranksHighToLow.map((rank) => rank.name).join(" > ")
        : "未取得";
    switch (rankOrder.source) {
        case "manual_override":
            return `ランク順序: 手動調整 / 高い順 ${orderText}`;
        case "numeric_rank_name":
            return `ランク順序: 数値推定 / 高い順 ${orderText}`;
        case "settings_screen":
            return `ランク順序: 設定画面 / 高い順 ${orderText}`;
        case "unresolved":
        default:
            return `ランク順序: 未推定 / ${orderText}`;
    }
}

function formatRankRecommendationOrderShortSummary(rankOrder: RankRecommendationRankOrderResolution): string {
    switch (rankOrder.source) {
        case "manual_override":
            return "ランク順序: 手動";
        case "numeric_rank_name":
            return "ランク順序: 数値推定";
        case "settings_screen":
            return "ランク順序: 確認済み";
        case "unresolved":
        default:
            return "ランク順序: 未確認";
    }
}

function formatRankRecommendationOrderDiagnosticStatus(diagnostics: readonly string[]): string {
    if (diagnostics.includes("manual_override_ignored_length_mismatch")) {
        return "保存済み手動順序は現在のrank一覧と件数が一致しないため未使用です";
    }
    if (diagnostics.includes("manual_override_ignored_unknown_rank")) {
        return "保存済み手動順序に現在のrank一覧にないrankがあるため未使用です";
    }
    if (diagnostics.includes("manual_override_ignored_duplicate_rank")) {
        return "保存済み手動順序に重複rankがあるため未使用です";
    }
    if (diagnostics.includes("manual_override_ignored_missing_rank")) {
        return "保存済み手動順序に不足rankがあるため未使用です";
    }
    return "";
}

function formatRankRecommendationListMeta(
    candidates: readonly RankRecommendationCandidate[],
    statusText: string | null,
    hiddenSummary?: RankRecommendationHiddenSummary,
    viewMode: RankRecommendationViewMode = "all",
    targetMonth: string | null = null,
    curvePreviewInfoByKey?: ReadonlyMap<string, RankRecommendationCurvePreviewInfo>
): string {
    if (statusText !== null) {
        return statusText;
    }
    const parts = [
        `優先度順 ${candidates.length}件`,
        formatRankRecommendationAsOfDateSummary(candidates),
        formatRankRecommendationActionSummary(candidates),
        formatRankRecommendationPrioritySummary(candidates),
        formatRankRecommendationConfidenceSummary(candidates),
        formatRankRecommendationRawSourceStatusSummary(candidates, curvePreviewInfoByKey),
        formatRankRecommendationCautionSummary(candidates),
        formatRankRecommendationTargetMonthSummary(hiddenSummary, targetMonth),
        formatRankRecommendationViewModeSummary(hiddenSummary, viewMode),
        formatRankRecommendationHiddenSummary(hiddenSummary),
        formatRankRecommendationOverflowSummary(hiddenSummary)
    ].filter((part): part is string => part !== null);
    return parts.join(" / ");
}

function formatRankRecommendationListShortMeta(
    candidates: readonly RankRecommendationCandidate[],
    statusText: string | null,
    hiddenSummary?: RankRecommendationHiddenSummary,
    viewMode: RankRecommendationViewMode = "all",
    targetMonth: string | null = null,
    curvePreviewInfoByKey?: ReadonlyMap<string, RankRecommendationCurvePreviewInfo>
): string {
    if (statusText !== null) {
        return statusText;
    }
    const parts = [
        `候補 ${candidates.length}件`,
        formatRankRecommendationAsOfDateSummary(candidates),
        formatRankRecommendationRawSourceStatusSummary(candidates, curvePreviewInfoByKey),
        formatRankRecommendationShortCautionSummary(candidates),
        formatRankRecommendationTargetMonthSummary(hiddenSummary, targetMonth),
        formatRankRecommendationViewModeSummary(hiddenSummary, viewMode),
        formatRankRecommendationHiddenSummary(hiddenSummary),
        formatRankRecommendationOverflowSummary(hiddenSummary)
    ].filter((part): part is string => part !== null);
    return parts.join(" / ");
}

function formatRankRecommendationTargetMonthSummary(
    hiddenSummary: RankRecommendationHiddenSummary | undefined,
    targetMonth: string | null
): string | null {
    if (targetMonth === null) {
        return null;
    }

    const filteredCount = hiddenSummary?.targetMonth ?? 0;
    const countText = filteredCount > 0 ? `・条件外 ${filteredCount}件` : "";
    return `対象月 ${formatRankRecommendationTargetMonthLabel(targetMonth)}${countText}`;
}

function formatRankRecommendationTargetMonthLabel(targetMonth: string): string {
    if (!/^\d{6}$/.test(targetMonth)) {
        return targetMonth;
    }

    return `${targetMonth.slice(0, 4)}年${Number(targetMonth.slice(4, 6))}月`;
}

function formatRankRecommendationViewModeSummary(
    hiddenSummary: RankRecommendationHiddenSummary | undefined,
    viewMode: RankRecommendationViewMode
): string | null {
    if (viewMode === "all") {
        return null;
    }

    const filteredCount = hiddenSummary?.viewMode ?? 0;
    const countText = filteredCount > 0 ? `・条件外 ${filteredCount}件` : "";
    return `表示条件 ${formatRankRecommendationViewModeLabel(viewMode)}${countText}`;
}

function formatRankRecommendationViewModeLabel(viewMode: RankRecommendationViewMode): string {
    return RANK_RECOMMENDATION_VIEW_MODE_OPTIONS.find((option) => option.mode === viewMode)?.label ?? "全て";
}

function formatRankRecommendationAsOfDateSummary(candidates: readonly RankRecommendationCandidate[]): string | null {
    const asOfDates = Array.from(new Set(candidates.map((candidate) => candidate.asOfDate)));
    if (asOfDates.length === 0) {
        return null;
    }
    if (asOfDates.length > 1) {
        return formatRankRecommendationMultipleAsOfDateSummary(asOfDates);
    }

    const asOfDate = asOfDates[0];
    if (asOfDate === undefined) {
        return null;
    }

    const displayDate = formatCompactMonthDayForDisplay(asOfDate) ?? formatCompactDateForDisplay(asOfDate);
    const freshness = formatRankRecommendationAsOfDateFreshness(asOfDate);
    return `基準日 ${displayDate}${freshness === null ? "" : `・${freshness}`}`;
}

function formatRankRecommendationMultipleAsOfDateSummary(asOfDates: readonly string[]): string {
    const sortedCompactDates = asOfDates
        .map((asOfDate) => toCompactDateKey(asOfDate))
        .filter((asOfDate): asOfDate is string => asOfDate !== null)
        .sort();
    const oldestAsOfDate = sortedCompactDates[0];
    if (oldestAsOfDate === undefined) {
        return "基準日 複数";
    }

    const freshness = formatRankRecommendationAsOfDateFreshness(oldestAsOfDate);
    if (freshness === null) {
        return "基準日 複数";
    }

    const displayDate = formatCompactMonthDayForDisplay(oldestAsOfDate) ?? formatCompactDateForDisplay(oldestAsOfDate);
    return `基準日 複数・最古 ${displayDate}・${freshness}`;
}

function formatRankRecommendationAsOfDateFreshness(asOfDate: string): string | null {
    const compactAsOfDate = toCompactDateKey(asOfDate);
    if (compactAsOfDate === null) {
        return null;
    }

    const daysFromAsOfDate = getDaysBetweenDateKeys(getLocalTodayDateKey(), compactAsOfDate);
    if (daysFromAsOfDate === null || daysFromAsOfDate <= 0) {
        return null;
    }

    return daysFromAsOfDate === 1 ? "前日" : `${daysFromAsOfDate}日前`;
}

function formatRankRecommendationOverflowSummary(hiddenSummary?: RankRecommendationHiddenSummary): string | null {
    if (hiddenSummary === undefined || hiddenSummary.overflow <= 0) {
        return null;
    }

    return `他 ${hiddenSummary.overflow}件`;
}

function formatRankRecommendationHiddenSummary(hiddenSummary?: RankRecommendationHiddenSummary): string | null {
    if (hiddenSummary === undefined) {
        return null;
    }

    const parts = [
        hiddenSummary.userDecision > 0 ? `利用者判断 ${hiddenSummary.userDecision}件` : null,
        hiddenSummary.resolvedRankChange > 0 ? `反映済み ${hiddenSummary.resolvedRankChange}件` : null
    ].filter((part): part is string => part !== null);
    return parts.length === 0 ? null : `非表示 ${parts.join("・")}`;
}

function formatRankRecommendationActionSummary(candidates: readonly RankRecommendationCandidate[]): string | null {
    return formatRankRecommendationCountSummary(
        "推奨方向",
        candidates.map((candidate) => candidate.action),
        ["raise_watch", "lower_watch", "watch", "not_eligible"],
        formatRankRecommendationActionLabel
    );
}

function formatRankRecommendationPrioritySummary(candidates: readonly RankRecommendationCandidate[]): string | null {
    return formatRankRecommendationCountSummary(
        "優先度",
        candidates.map((candidate) => candidate.priority),
        ["high", "medium", "low"],
        formatRankRecommendationPriority
    );
}

function formatRankRecommendationConfidenceSummary(candidates: readonly RankRecommendationCandidate[]): string | null {
    return formatRankRecommendationCountSummary(
        "確度",
        candidates.map((candidate) => formatRankRecommendationConfidence(candidate.confidence)),
        ["高", "中", "低"],
        (label) => label
    );
}

function formatRankRecommendationRawSourceStatusSummary(
    candidates: readonly RankRecommendationCandidate[],
    curvePreviewInfoByKey?: ReadonlyMap<string, RankRecommendationCurvePreviewInfo>
): string | null {
    return formatRankRecommendationCountSummary(
        "raw source",
        candidates.map((candidate) => getRankRecommendationRawSourceStatus(candidate, curvePreviewInfoByKey)),
        ["currentAsOf", "pastAsOf", "missing", "loading", "error"],
        formatRankRecommendationRawSourceStatus
    );
}

function getRankRecommendationRawSourceStatus(
    candidate: RankRecommendationCandidate,
    curvePreviewInfoByKey?: ReadonlyMap<string, RankRecommendationCurvePreviewInfo>
): RankRecommendationRawSourceStatus {
    if (isRankRecommendationWarmCacheTaskPending(candidate)) {
        return "loading";
    }
    if (hasRankRecommendationWarmCachePriorityError(candidate)) {
        return "error";
    }
    const previewInfo = curvePreviewInfoByKey?.get(buildRankRecommendationCandidateDisplayInfoKey(candidate));
    return previewInfo?.rawSourceStatus ?? (candidate.diagnostics.includes("booking_curve_source_missing") ? "missing" : "currentAsOf");
}

function isRankRecommendationWarmCacheTaskPending(candidate: RankRecommendationCandidate): boolean {
    const matches = (task: SalesSettingWarmCacheTask | null): boolean => task !== null
        && task.kind === "currentRaw"
        && task.scope === "roomGroup"
        && task.stayDate === candidate.stayDate
        && task.roomGroupId === candidate.roomGroupId;
    return matches(salesSettingWarmCacheState.currentTask)
        || salesSettingWarmCacheState.queue.some(matches);
}

function hasRankRecommendationWarmCachePriorityError(candidate: RankRecommendationCandidate): boolean {
    return salesSettingWarmCacheState.rankRecommendationPriorityErrors > 0
        && candidate.diagnostics.includes("booking_curve_source_missing")
        && !isRankRecommendationWarmCacheTaskPending(candidate);
}

function formatRankRecommendationRawSourceStatus(status: RankRecommendationRawSourceStatus): string {
    switch (status) {
        case "currentAsOf":
            return "最新基準日あり";
        case "pastAsOf":
            return "過去基準日あり";
        case "loading":
            return "取得中";
        case "error":
            return "取得失敗";
        case "missing":
        default:
            return "未保存";
    }
}

function formatRankRecommendationRawSourceStatusTitle(
    candidate: RankRecommendationCandidate,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null
): string {
    const status = getRankRecommendationRawSourceStatus(candidate, curvePreviewInfo === null
        ? undefined
        : new Map([[buildRankRecommendationCandidateDisplayInfoKey(candidate), curvePreviewInfo]]));
    const parts = [
        `raw source: ${formatRankRecommendationRawSourceStatus(status)}`,
        `基準日 ${formatCompactDateForDisplay(candidate.asOfDate)}`,
        curvePreviewInfo?.diagnostics.length
            ? `不足診断 ${curvePreviewInfo.diagnostics.map(formatRankRecommendationCurvePreviewDiagnostic).join(" / ")}`
            : null,
        status === "loading" ? "候補用データを優先取得中です" : null
    ].filter((part): part is string => part !== null);
    return parts.join("\n");
}

function formatRankRecommendationCautionSummary(candidates: readonly RankRecommendationCandidate[]): string | null {
    return formatRankRecommendationCountSummary(
        "注意",
        candidates.flatMap((candidate) => summarizeRankRecommendationConfidenceCautions(candidate.diagnostics)),
        [
            "booking_curve または reference 不足",
            "forecast 比較不足",
            "sales / ADR 比較不足",
            "同曜日比較不足",
            "競合価格の部屋タイプ対応未確認",
            "団体主因のため上げ判断を抑制",
            "部屋数条件により判定制限",
            "隣接ランク表示に制約あり"
        ],
        (label) => label
    );
}

function formatRankRecommendationShortCautionSummary(candidates: readonly RankRecommendationCandidate[]): string | null {
    return candidates.some((candidate) => summarizeRankRecommendationConfidenceCautions(candidate.diagnostics).length > 0)
        ? "注意あり"
        : null;
}

function formatRankRecommendationCountSummary<T extends string>(
    prefix: string,
    values: readonly T[],
    orderedValues: readonly T[],
    formatLabel: (value: T) => string
): string | null {
    if (values.length === 0) {
        return null;
    }
    const counts = new Map<T, number>();
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const parts = orderedValues
        .map((value) => {
            const count = counts.get(value) ?? 0;
            return count > 0 ? `${formatLabel(value)} ${count}件` : null;
        })
        .filter((part): part is string => part !== null);
    if (parts.length === 0) {
        return null;
    }
    return `${prefix} ${parts.join("・")}`;
}

function createRankRecommendationCurvePopoverItems(
    candidate: RankRecommendationCandidate,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null
): HTMLElement[] {
    const rawStatus = getRankRecommendationRawSourceStatus(candidate, curvePreviewInfo === null
        ? undefined
        : new Map([[buildRankRecommendationCandidateDisplayInfoKey(candidate), curvePreviewInfo]]));
    const items: Array<[string, string]> = [
        ["raw source", formatRankRecommendationRawSourceStatus(rawStatus)],
        ["全体", formatNullableRoomCount(curvePreviewInfo?.currentOverallRoomCount ?? null)],
        [getSalesSettingBookingCurveSecondarySegment() === "group" ? "団体" : "個人", formatNullableRoomCount(curvePreviewInfo?.currentSecondaryRoomCount ?? null)],
        ["参考線", formatRankRecommendationCurvePopoverReferenceStatus(curvePreviewInfo)],
        ["不足", curvePreviewInfo?.diagnostics.length
            ? curvePreviewInfo.diagnostics.map(formatRankRecommendationCurvePreviewDiagnostic).join(" / ")
            : "なし"]
    ];
    return items.map(([label, value]) => {
        const itemElement = document.createElement("div");
        const labelElement = document.createElement("span");
        labelElement.textContent = label;
        const valueElement = document.createElement("strong");
        valueElement.textContent = value;
        itemElement.append(labelElement, valueElement);
        return itemElement;
    });
}

function formatNullableRoomCount(value: number | null): string {
    return value === null ? "-" : `${value}室`;
}

function formatRankRecommendationCurvePopoverReferenceStatus(
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null
): string {
    if (curvePreviewInfo === null || curvePreviewInfo.curveData === null) {
        return "未表示";
    }
    const hasReference = curvePreviewInfo.curveData.overall.recent !== null
        || curvePreviewInfo.curveData.overall.seasonal !== null
        || curvePreviewInfo.curveData.secondary.recent !== null
        || curvePreviewInfo.curveData.secondary.seasonal !== null;
    return hasReference ? "あり" : "不足";
}

function createRankRecommendationRankChangeSubmitButton(
    proposal: RankRecommendationRankChangeProposal,
    label: string
): HTMLButtonElement {
    const submitButtonElement = document.createElement("button");
    submitButtonElement.type = "button";
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ATTRIBUTE, "");
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE, "rank-change-submit");
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE, proposal.stayDate);
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_AS_OF_DATE_ATTRIBUTE, proposal.asOfDate);
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE, proposal.roomGroupId);
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE, proposal.roomGroupName);
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE, proposal.reasonFingerprint);
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_CONFIDENCE_LEVEL_ATTRIBUTE, proposal.confidenceLevel);
    submitButtonElement.setAttribute(RANK_RECOMMENDATION_RANK_CHANGE_GENERATED_AT_ATTRIBUTE, proposal.generatedAt);
    if (proposal.currentRankCode !== null) {
        submitButtonElement.setAttribute(RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_CODE_ATTRIBUTE, proposal.currentRankCode);
    }
    if (proposal.currentRankName !== null) {
        submitButtonElement.setAttribute(RANK_RECOMMENDATION_RANK_CHANGE_CURRENT_NAME_ATTRIBUTE, proposal.currentRankName);
    }
    if (proposal.targetRankCode !== null) {
        submitButtonElement.setAttribute(RANK_RECOMMENDATION_RANK_CHANGE_TARGET_CODE_ATTRIBUTE, proposal.targetRankCode);
    }
    if (proposal.targetRankName !== null) {
        submitButtonElement.setAttribute(RANK_RECOMMENDATION_RANK_CHANGE_TARGET_NAME_ATTRIBUTE, proposal.targetRankName);
    }
    submitButtonElement.setAttribute(
        RANK_RECOMMENDATION_RANK_CHANGE_DISABLED_REASONS_ATTRIBUTE,
        proposal.disabledReasons.join(",")
    );
    submitButtonElement.textContent = label;
    submitButtonElement.title = proposal.enabled
        ? "5秒の送信待ちに入る"
        : `送信不可: ${formatRankRecommendationRankChangeDisabledReasons(proposal.disabledReasons)}`;
    return submitButtonElement;
}

function formatRankRecommendationRankGapRelativeStep(entry: RankRecommendationRankGapEntry): string {
    if (entry.relativeStep === null) {
        return "順序未確認";
    }
    if (entry.relativeStep === 0) {
        return "同ランク";
    }

    const absoluteStep = Math.abs(entry.relativeStep);
    return entry.relativeStep < 0
        ? `対象より${absoluteStep}ランク高い`
        : `対象より${absoluteStep}ランク低い`;
}

function formatRankRecommendationRankGapOccupancyCapacity(entry: RankRecommendationRankGapEntry): string {
    const capacity = entry.occupancyCapacity;
    if (capacity === null) {
        return "-/-";
    }

    return `${formatGroupRoomNumber(capacity.currentValue)}/${formatGroupRoomNumber(capacity.maxValue)}`;
}

function formatRankRecommendationRankGapNote(
    entry: RankRecommendationRankGapEntry,
    context: RankRecommendationRankGapContext
): string {
    const notes: string[] = [];
    if (entry.isTarget) {
        notes.push("対象候補");
    }
    if (entry.diagnostics.includes("current_rank_missing")) {
        notes.push("現ランク未取得");
    }
    if (context.rankOrderSource === "unresolved" || entry.relativeStep === null) {
        notes.push("順序未確認");
    }
    if (entry.diagnostics.includes("occupancy_capacity_missing")) {
        notes.push("販売室数未取得");
    }

    return notes.length === 0 ? "-" : Array.from(new Set(notes)).join(" / ");
}

function createRankRecommendationCurvePreviewCellChildren(
    candidate: RankRecommendationCandidate,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null
): Node[] {
    const activeVariant = curvePreviewInfo === null
        ? null
        : resolveRankRecommendationCurvePreviewActiveVariant(curvePreviewInfo);
    if (curvePreviewInfo === null || curvePreviewInfo.curveData === null || curvePreviewInfo.maxValue === null) {
        return [createRankRecommendationCurvePreviewDiagnostics([
            ...(curvePreviewInfo?.diagnostics ?? ["booking_curve_source_missing"])
        ])];
    }
    if (activeVariant === null) {
        return [createRankRecommendationCurvePreviewDiagnostics([
            ...curvePreviewInfo.diagnostics,
            "booking_curve_segment_missing"
        ])];
    }

    return [
        createRankRecommendationCurvePreviewSection(candidate, curvePreviewInfo, activeVariant),
        createRankRecommendationCurvePreviewDiagnostics(curvePreviewInfo.diagnostics)
    ];
}

function createRankRecommendationRankChangePreviewCellChildren(
    candidate: RankRecommendationCandidate,
    proposal: RankRecommendationRankChangeProposal,
    reasonText: string,
    cautionText: string
): Node[] {
    const sectionElement = document.createElement("section");
    sectionElement.setAttribute("data-ra-rank-recommendation-rank-change-preview", "");

    const titleElement = document.createElement("div");
    titleElement.setAttribute("data-ra-rank-recommendation-rank-change-title", "");
    titleElement.textContent = "rank変更 preview";

    const detailsElement = document.createElement("dl");
    appendRankRecommendationRankChangePreviewItem(detailsElement, "宿泊日", formatCompactDateForDisplay(proposal.stayDate));
    appendRankRecommendationRankChangePreviewItem(detailsElement, "部屋タイプ", proposal.roomGroupName);
    appendRankRecommendationRankChangePreviewItem(detailsElement, "現在rank", proposal.currentRankName ?? "-");
    appendRankRecommendationRankChangePreviewItem(detailsElement, "変更後rank", proposal.targetRankName ?? "-");
    appendRankRecommendationRankChangePreviewItem(detailsElement, "主要根拠", reasonText === "" ? "-" : reasonText);
    appendRankRecommendationRankChangePreviewItem(detailsElement, "注意", cautionText === "" ? "なし" : cautionText);
    appendRankRecommendationRankChangePreviewItem(
        detailsElement,
        "送信不可理由",
        proposal.disabledReasons.length === 0 ? "なし" : formatRankRecommendationRankChangeDisabledReasons(proposal.disabledReasons)
    );

    const noteElement = document.createElement("p");
    noteElement.textContent = "送信直前に現在rankと変更履歴を再取得し、候補表示時から変わっていた場合は送信しません。5秒の送信待ち中は取消できます。";

    const submitButtonElement = createRankRecommendationRankChangeSubmitButton(proposal, "反映する");
    submitButtonElement.disabled = !proposal.enabled || isRankRecommendationRankChangeBlockedByScope(candidate);

    const result = getRankRecommendationRankChangeResult(candidate);
    sectionElement.append(titleElement, detailsElement, noteElement, submitButtonElement);
    if (result !== null) {
        sectionElement.append(createRankRecommendationRankChangeResultElement(result));
    }
    return [sectionElement];
}

function appendRankRecommendationRankChangePreviewItem(
    element: HTMLDListElement,
    label: string,
    value: string
): void {
    const termElement = document.createElement("dt");
    termElement.textContent = label;
    const descriptionElement = document.createElement("dd");
    descriptionElement.textContent = value;
    element.append(termElement, descriptionElement);
}

function createRankRecommendationCurvePreviewSection(
    candidate: RankRecommendationCandidate,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo,
    activeVariant: RankRecommendationCurvePreviewSegmentVariant
): HTMLElement {
    const curveData = activeVariant.curveData;
    const maxValue = activeVariant.maxValue;

    const sectionElement = document.createElement("section");
    sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE, "");
    sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE, "card");

    const headerElement = document.createElement("div");
    headerElement.setAttribute(SALES_SETTING_BOOKING_CURVE_HEADER_ATTRIBUTE, "");

    const titleElement = document.createElement("span");
    titleElement.textContent = `ブッキングカーブ（${candidate.roomGroupName}）`;

    const noteElement = document.createElement("span");
    noteElement.setAttribute(SALES_SETTING_BOOKING_CURVE_NOTE_ATTRIBUTE, "");
    noteElement.textContent = "候補一覧 preview";

    headerElement.replaceChildren(
        titleElement,
        noteElement,
        createSalesSettingBookingCurveSegmentToggleGroup(),
        createSalesSettingBookingCurveReferenceToggleGroup()
    );

    const gridElement = document.createElement("div");
    gridElement.setAttribute(SALES_SETTING_BOOKING_CURVE_GRID_ATTRIBUTE, "");
    gridElement.replaceChildren(
        createSalesSettingBookingCurvePanel(
            "全体",
            maxValue,
            curvePreviewInfo.currentOverallRoomCount,
            curveData.overall,
            curveData.overallRankMarkers,
            "overall"
        ),
        createSalesSettingBookingCurvePanel(
            getSalesSettingBookingCurveSecondarySegmentLabel(curveData.secondarySegment),
            maxValue,
            activeVariant.currentSecondaryRoomCount,
            curveData.secondary,
            curveData.secondaryRankMarkers,
            curveData.secondarySegment
        )
    );

    sectionElement.replaceChildren(headerElement, createSalesSettingBookingCurveLegend(curveData), gridElement);
    return sectionElement;
}

function resolveRankRecommendationCurvePreviewActiveVariant(
    curvePreviewInfo: RankRecommendationCurvePreviewInfo
): RankRecommendationCurvePreviewSegmentVariant | null {
    return curvePreviewInfo.segmentVariants[getSalesSettingBookingCurveSecondarySegment()] ?? null;
}

function createRankRecommendationCurvePreviewDiagnostics(diagnostics: readonly string[]): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute(RANK_RECOMMENDATION_CURVE_PREVIEW_DIAGNOSTICS_ATTRIBUTE, "");
    element.textContent = diagnostics.length === 0
        ? "不足診断: なし"
        : `不足診断: ${diagnostics.map(formatRankRecommendationCurvePreviewDiagnostic).join(" / ")}`;
    return element;
}

function formatRankRecommendationCurvePreviewDiagnostic(diagnostic: string): string {
    switch (diagnostic) {
        case "booking_curve_source_missing":
            return "booking_curve raw source が未保存のため表示できません";
        case "booking_curve_point_missing":
            return "基準日以前の booking_curve 点がありません";
        case "booking_curve_segment_missing":
            return "選択中の個人 / 団体区分の preview データを取得できません";
        case "raw_history_reference_missing":
            return "前年実績から作る reference curve が不足しています";
        default:
            return diagnostic;
    }
}

function createRankRecommendationCompetitorPreviewCellChildren(candidate: RankRecommendationCandidate): Node[] {
    const state = rankRecommendationCompetitorPreviewStateByKey.get(buildRankRecommendationCompetitorPreviewKey(candidate)) ?? {
        status: "idle",
        records: [],
        latestRecord: null,
        previousRecord: null,
        message: "競合価格は必要なときだけ取得します。ボタンを押すと対象日の preview を開きます。",
        updatedAt: null
    } satisfies RankRecommendationCompetitorPreviewState;

    const sectionElement = document.createElement("section");
    sectionElement.setAttribute(RANK_RECOMMENDATION_COMPETITOR_PREVIEW_STATUS_ATTRIBUTE, state.status);
    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_TITLE_ATTRIBUTE, "");
    titleElement.textContent = `競合価格 preview（${formatCompactDateForDisplay(candidate.stayDate)} / ${candidate.roomGroupName}）`;
    const messageElement = document.createElement("p");
    messageElement.textContent = state.message;
    sectionElement.append(titleElement, messageElement);

    if (state.status === "stored" && state.records.length > 0) {
        const roomTypeMatch = resolveRankRecommendationCompetitorRoomTypeMatch(candidate.roomGroupName, state.records);
        const roomTypeFilter = roomTypeMatch.status === "confirmed" ? roomTypeMatch.filter : null;
        const dailyRecords = buildLatestCompetitorPriceRecordsByFetchDate(state.records, roomTypeFilter);
        const roomTypeNoteElement = document.createElement("p");
        roomTypeNoteElement.textContent = formatRankRecommendationCompetitorRoomTypeMatchMessage(roomTypeMatch);
        sectionElement.append(roomTypeNoteElement);

        const chartSeries = buildCompetitorPriceGuestChartSeries(dailyRecords, roomTypeFilter, null);
        const legendElement = createCompetitorPriceLegend(chartSeries.facilities);
        const gridElement = document.createElement("div");
        gridElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_GRID_ATTRIBUTE, "");
        for (const guestCount of COMPETITOR_PRICE_GUEST_COUNTS) {
            gridElement.append(createCompetitorPriceChartPanel(guestCount, chartSeries));
        }
        sectionElement.append(legendElement, gridElement);
    }

    if (state.status === "error" || state.status === "empty") {
        const retryButtonElement = document.createElement("button");
        retryButtonElement.type = "button";
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ATTRIBUTE, "");
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE, "competitor-preview-retry");
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE, candidate.stayDate);
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_AS_OF_DATE_ATTRIBUTE, candidate.asOfDate);
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE, candidate.roomGroupId);
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_NAME_ATTRIBUTE, candidate.roomGroupName);
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_ACTION_ATTRIBUTE, candidate.action);
        retryButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_REASON_FINGERPRINT_ATTRIBUTE, candidate.reasonFingerprint);
        retryButtonElement.setAttribute("aria-expanded", "true");
        retryButtonElement.textContent = "再取得";
        retryButtonElement.title = "対象日の競合価格 snapshot を再取得";
        sectionElement.append(retryButtonElement);
    }

    return [sectionElement];
}

function resolveRankRecommendationCompetitorRoomTypeMatch(
    roomGroupName: string,
    records: CompetitorPriceSnapshotRecord[]
): RankRecommendationCompetitorRoomTypeMatch {
    const roomTypeLabels = buildCompetitorPriceFilterOptions(records).roomTypes;
    if (roomTypeLabels.length === 0) {
        return {
            status: "unknown",
            filter: null,
            labels: []
        };
    }

    const normalizedRoomGroupName = normalizeTextForRoomTypeMatch(roomGroupName);
    const matchedLabels = roomTypeLabels.filter((label) => {
        const normalizedLabel = normalizeTextForRoomTypeMatch(label);
        return normalizedLabel !== "" && normalizedRoomGroupName.includes(normalizedLabel);
    });

    if (matchedLabels.length === 1) {
        return {
            status: "confirmed",
            filter: matchedLabels[0] ?? null,
            labels: matchedLabels
        };
    }

    if (matchedLabels.length > 1) {
        return {
            status: "ambiguous",
            filter: null,
            labels: matchedLabels
        };
    }

    return {
        status: "unknown",
        filter: null,
        labels: roomTypeLabels
    };
}

function formatRankRecommendationCompetitorRoomTypeMatchMessage(
    match: RankRecommendationCompetitorRoomTypeMatch
): string {
    if (match.status === "confirmed" && match.filter !== null) {
        return `部屋タイプ対応: confirmed / ${match.filter} で preview を絞り込みます。`;
    }

    if (match.status === "ambiguous") {
        return `部屋タイプ対応: ambiguous / 候補 ${match.labels.join("、")}。強い絞り込みはせず、金額推奨の主因にしません。`;
    }

    if (match.labels.length === 0) {
        return "部屋タイプ対応: unknown / snapshot 内に比較できる部屋タイプ label がありません。";
    }

    return `部屋タイプ対応: unknown / 比較可能 label ${match.labels.join("、")}。強い絞り込みはせず、金額推奨の主因にしません。`;
}

function normalizeTextForRoomTypeMatch(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[、，,・／/()（）[\]【】「」『』ー_-]/g, "");
}

function requestRankRecommendationCompetitorPreviewFromElement(element: HTMLElement): void {
    const stayDate = element.getAttribute(RANK_RECOMMENDATION_BUTTON_STAY_DATE_ATTRIBUTE);
    const roomGroupId = element.getAttribute(RANK_RECOMMENDATION_BUTTON_ROOM_GROUP_ID_ATTRIBUTE);
    const facilityId = activeFacilityCacheKey;
    if (facilityId === null || stayDate === null || roomGroupId === null || stayDate === "" || roomGroupId === "") {
        return;
    }

    const previewKey = buildRankRecommendationCompetitorPreviewKey({ stayDate, roomGroupId });
    const requestKey = `${facilityId}:${stayDate}`;
    rankRecommendationCompetitorPreviewStateByKey.set(previewKey, {
        status: "loading",
        records: [],
        latestRecord: null,
        previousRecord: null,
        message: "競合価格を取得中です。対象日の snapshot だけを確認します。",
        updatedAt: new Date().toISOString()
    });
    rerenderRankRecommendationCompetitorPreviewSurface(previewKey);

    let request = rankRecommendationCompetitorPreviewRequestByKey.get(requestKey);
    if (request === undefined) {
        request = loadRankRecommendationCompetitorPreviewState(facilityId, stayDate)
            .finally(() => {
                rankRecommendationCompetitorPreviewRequestByKey.delete(requestKey);
            });
        rankRecommendationCompetitorPreviewRequestByKey.set(requestKey, request);
    }

    void request
        .then((state) => {
            rankRecommendationCompetitorPreviewStateByKey.set(previewKey, state);
            rerenderRankRecommendationCompetitorPreviewSurface(previewKey);
        })
        .catch((error: unknown) => {
            rankRecommendationCompetitorPreviewStateByKey.set(previewKey, {
                status: "error",
                records: [],
                latestRecord: null,
                previousRecord: null,
                message: `取得に失敗しました。ログイン状態または競合施設設定を確認してください: ${formatUnknownErrorMessage(error)}`,
                updatedAt: new Date().toISOString()
            });
            rerenderRankRecommendationCompetitorPreviewSurface(previewKey);
        });
}

async function loadRankRecommendationCompetitorPreviewState(
    facilityId: string,
    stayDate: string
): Promise<RankRecommendationCompetitorPreviewState> {
    const existingSeries = await readCompetitorPriceSnapshotSeriesForStayDate(facilityId, stayDate);
    if (existingSeries.latestRecord !== null) {
        return buildRankRecommendationCompetitorPreviewStoredState(existingSeries.records, existingSeries.latestRecord, existingSeries.previousRecord, true);
    }

    const result = await persistCompetitorPriceSnapshotsForSource(facilityId, stayDate, "competitor-tab");
    if (!result.stored || result.latestRecord === null) {
        return {
            status: result.reason === undefined ? "empty" : result.reason === "no-competitors" ? "empty" : "error",
            records: [],
            latestRecord: null,
            previousRecord: null,
            message: result.reason === "no-competitors"
                ? "競合施設設定がないため preview を作成できません。Revenue Assistant の競合施設設定を確認してください。"
                : result.reason === "indexeddb-unavailable"
                    ? "ブラウザ保存を利用できないため preview を作成できません。"
                    : "対象日の競合価格データはありません。",
            updatedAt: new Date().toISOString()
        };
    }

    return buildRankRecommendationCompetitorPreviewStoredState(
        result.records,
        result.latestRecord,
        result.previousRecord,
        false
    );
}

function buildRankRecommendationCompetitorPreviewStoredState(
    records: CompetitorPriceSnapshotRecord[],
    latestRecord: CompetitorPriceSnapshotRecord,
    previousRecord: CompetitorPriceSnapshotRecord | null,
    cacheHit: boolean
): RankRecommendationCompetitorPreviewState {
    return {
        status: records.length === 0 ? "empty" : "stored",
        records,
        latestRecord,
        previousRecord,
        message: `${cacheHit ? "保存済み snapshot を表示" : "取得した snapshot を表示"} / 取得 ${formatDateTimeForDisplay(latestRecord.fetchedAt)} / 競合 ${latestRecord.competitorSet.length}件`,
        updatedAt: new Date().toISOString()
    };
}

function rerenderRankRecommendationCompetitorPreviewSurface(previewKey: string): void {
    const rowElement = document.querySelector<HTMLTableRowElement>(
        `[${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_KEY_ATTRIBUTE}="${cssEscapeAttributeValue(previewKey)}"]`
    );
    const cellElement = rowElement?.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_CELL_ATTRIBUTE}]`) ?? null;
    const candidate = findRankRecommendationCandidateFromCompetitorPreviewKey(previewKey);
    if (rowElement === null || cellElement === null || candidate === null) {
        return;
    }
    rowElement.hidden = !isRankRecommendationCompetitorPreviewOpen(candidate);
    cellElement.replaceChildren(...createRankRecommendationCompetitorPreviewCellChildren(candidate));
}

function findRankRecommendationCandidateFromCompetitorPreviewKey(previewKey: string): RankRecommendationCandidate | null {
    return latestRankRecommendationCandidateByCompetitorPreviewKey.get(previewKey) ?? null;
}

function formatUnknownErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isRankRecommendationCompetitorPreviewOpen(candidate: RankRecommendationCandidate): boolean {
    return rankRecommendationCompetitorPreviewOpenState.get(buildRankRecommendationCompetitorPreviewKey(candidate)) === true;
}

function buildRankRecommendationCompetitorPreviewKey(parts: {
    stayDate: string;
    roomGroupId: string;
}): string {
    return `${parts.stayDate}:${parts.roomGroupId}`;
}

function isRankRecommendationCurvePreviewOpen(candidate: RankRecommendationCandidate): boolean {
    return rankRecommendationCurvePreviewOpenState.get(buildRankRecommendationCurvePreviewKey(candidate)) === true;
}

function buildRankRecommendationCurvePreviewKey(parts: {
    stayDate: string;
    roomGroupId: string;
}): string {
    return `${parts.stayDate}:${parts.roomGroupId}`;
}

function rememberRankRecommendationCurvePreviewSnapshot(
    candidates: readonly RankRecommendationCandidate[],
    curvePreviewInfoByKey: ReadonlyMap<string, RankRecommendationCurvePreviewInfo>
): void {
    latestRankRecommendationCurvePreviewSnapshotByKey.clear();
    for (const candidate of candidates) {
        const curvePreviewInfo = curvePreviewInfoByKey.get(buildRankRecommendationCandidateDisplayInfoKey(candidate));
        if (curvePreviewInfo === undefined) {
            continue;
        }
        latestRankRecommendationCurvePreviewSnapshotByKey.set(buildRankRecommendationCurvePreviewKey(candidate), {
            candidate,
            curvePreviewInfo
        });
    }
}

function rerenderRankRecommendationCurvePreviewSurfacesFromLatestSnapshot(): void {
    for (const rowElement of Array.from(document.querySelectorAll<HTMLTableRowElement>(`[${RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE}]`))) {
        const previewKey = rowElement.getAttribute(RANK_RECOMMENDATION_CURVE_PREVIEW_KEY_ATTRIBUTE);
        const snapshot = previewKey === null
            ? undefined
            : latestRankRecommendationCurvePreviewSnapshotByKey.get(previewKey);
        const cellElement = rowElement.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE}]`);
        if (snapshot === undefined || cellElement === null) {
            continue;
        }

        rowElement.hidden = !isRankRecommendationCurvePreviewOpen(snapshot.candidate);
        cellElement.replaceChildren(...createRankRecommendationCurvePreviewCellChildren(
            snapshot.candidate,
            snapshot.curvePreviewInfo
        ));
    }
}

function getPendingRankRecommendationDecision(
    candidate: RankRecommendationCandidate
): PendingRankRecommendationDecision | null {
    const facilityId = activeFacilityCacheKey;
    if (facilityId === null) {
        return null;
    }

    const cacheKey = buildRankRecommendationDecisionCacheKey({
        facilityId,
        stayDate: candidate.stayDate,
        roomGroupId: candidate.roomGroupId,
        action: candidate.action,
        reasonFingerprint: candidate.reasonFingerprint
    });
    return pendingRankRecommendationDecisionByKey.get(cacheKey) ?? null;
}

function createRankRecommendationPendingDecisionElement(
    pendingDecision: PendingRankRecommendationDecision
): HTMLDivElement {
    const wrapperElement = document.createElement("div");
    wrapperElement.setAttribute(RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE, "");
    wrapperElement.setAttribute(RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE, pendingDecision.draft.cacheKey);

    const labelElement = document.createElement("span");
    const secondsUntilCommit = Math.max(1, Math.ceil((pendingDecision.commitAt - Date.now()) / 1000));
    labelElement.textContent = `${formatRankRecommendationDecisionType(pendingDecision.draft.decisionType)}: ${secondsUntilCommit}秒後に確定`;

    const progressElement = createRankRecommendationPendingProgressElement(
        calculateRankRecommendationPendingProgressPercent(pendingDecision.commitAt)
    );

    const cancelButtonElement = document.createElement("button");
    cancelButtonElement.type = "button";
    cancelButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ATTRIBUTE, "");
    cancelButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE, "decision-cancel");
    cancelButtonElement.setAttribute(RANK_RECOMMENDATION_PENDING_DECISION_KEY_ATTRIBUTE, pendingDecision.draft.cacheKey);
    cancelButtonElement.title = `${formatRankRecommendationDecisionType(pendingDecision.draft.decisionType)}の保存を取り消す`;
    cancelButtonElement.textContent = "取消";

    wrapperElement.append(progressElement, labelElement, cancelButtonElement);
    return wrapperElement;
}

function getPendingRankRecommendationRankChange(
    candidate: RankRecommendationCandidate
): PendingRankRecommendationRankChange | null {
    const cacheKey = buildRankRecommendationRankChangeKey({
        facilityId: candidate.facilityId,
        stayDate: candidate.stayDate,
        roomGroupId: candidate.roomGroupId,
        reasonFingerprint: candidate.reasonFingerprint
    });
    return pendingRankRecommendationRankChangeByKey.get(cacheKey) ?? null;
}

function getRankRecommendationRankChangeResult(
    candidate: RankRecommendationCandidate
): RankRecommendationRankChangeResult | null {
    const cacheKey = buildRankRecommendationRankChangeKey({
        facilityId: candidate.facilityId,
        stayDate: candidate.stayDate,
        roomGroupId: candidate.roomGroupId,
        reasonFingerprint: candidate.reasonFingerprint
    });
    const exactResult = rankRecommendationRankChangeResultByKey.get(cacheKey);
    if (exactResult !== undefined) {
        return exactResult;
    }

    const active = activeRankRecommendationRankChangeByScopeKey.get(buildRankRecommendationRankChangeScopeKey(candidate));
    return active === undefined
        ? null
        : rankRecommendationRankChangeResultByKey.get(active.cacheKey) ?? null;
}

function createRankRecommendationPendingRankChangeElement(
    pendingRankChange: PendingRankRecommendationRankChange
): HTMLDivElement {
    const wrapperElement = document.createElement("div");
    wrapperElement.setAttribute(RANK_RECOMMENDATION_PENDING_RANK_CHANGE_ATTRIBUTE, "");
    wrapperElement.setAttribute(RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE, pendingRankChange.draft.cacheKey);

    const labelElement = document.createElement("span");
    const secondsUntilCommit = Math.max(1, Math.ceil((pendingRankChange.commitAt - Date.now()) / 1000));
    labelElement.textContent = `rank変更: ${secondsUntilCommit}秒後に送信`;

    const progressElement = createRankRecommendationPendingProgressElement(
        calculateRankRecommendationPendingProgressPercent(pendingRankChange.commitAt)
    );

    const cancelButtonElement = document.createElement("button");
    cancelButtonElement.type = "button";
    cancelButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ATTRIBUTE, "");
    cancelButtonElement.setAttribute(RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE, "rank-change-cancel");
    cancelButtonElement.setAttribute(RANK_RECOMMENDATION_PENDING_RANK_CHANGE_KEY_ATTRIBUTE, pendingRankChange.draft.cacheKey);
    cancelButtonElement.title = "rank変更の送信を取り消す";
    cancelButtonElement.textContent = "取消";

    wrapperElement.append(progressElement, labelElement, cancelButtonElement);
    return wrapperElement;
}

function createRankRecommendationPendingProgressElement(progressPercent: number): HTMLSpanElement {
    const element = document.createElement("span");
    const safePercent = Math.max(0, Math.min(100, progressPercent));
    element.setAttribute(RANK_RECOMMENDATION_PENDING_PROGRESS_ATTRIBUTE, "");
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `残り時間 ${safePercent}%`);
    element.style.setProperty("--ra-rank-recommendation-pending-progress", `${safePercent}%`);
    return element;
}

function createRankRecommendationRankChangeResultElement(
    result: RankRecommendationRankChangeResult
): HTMLDivElement {
    const wrapperElement = document.createElement("div");
    wrapperElement.setAttribute(RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE, result.status);
    wrapperElement.textContent = result.message;
    wrapperElement.title = [
        `発生時刻: ${formatDateTimeForDisplay(result.occurredAt)}`,
        result.failureClass === null ? null : `分類: ${formatRankRecommendationRankChangeFailureClass(result.failureClass)}`,
        result.httpStatus === null ? null : `HTTP status: ${result.httpStatus}`
    ].filter((part): part is string => part !== null).join("\n");
    return wrapperElement;
}

function isRankRecommendationRankChangePreviewOpen(candidate: RankRecommendationCandidate): boolean {
    return rankRecommendationRankChangePreviewOpenState.get(buildRankRecommendationRankChangeKey({
        facilityId: candidate.facilityId,
        stayDate: candidate.stayDate,
        roomGroupId: candidate.roomGroupId,
        reasonFingerprint: candidate.reasonFingerprint
    })) === true;
}

function formatRankRecommendationRankChangeProposalSignature(
    proposal: RankRecommendationRankChangeProposal
): string {
    return [
        proposal.enabled ? "enabled" : "disabled",
        proposal.currentRankCode ?? "",
        proposal.currentRankName ?? "",
        proposal.targetRankCode ?? "",
        proposal.targetRankName ?? "",
        proposal.confidenceLevel,
        proposal.disabledReasons.join("/")
    ].join(":");
}

function resolveRankRecommendationListHost(): { parentElement: HTMLElement; insertAfterElement: HTMLElement } | null {
    const cells = collectMonthlyCalendarCells();
    const calendarElement = resolveMonthlyCalendarContainerElement(cells);
    const calendarParentElement = calendarElement?.parentElement ?? null;
    if (calendarElement instanceof HTMLElement && calendarParentElement instanceof HTMLElement) {
        return { parentElement: calendarParentElement, insertAfterElement: calendarElement };
    }

    const segmentedControl = document.querySelector<HTMLElement>(`[data-testid="segmented-control"]`);
    const toolbarElement = segmentedControl?.parentElement?.parentElement ?? null;
    const parentElement = toolbarElement?.parentElement ?? null;
    if (toolbarElement instanceof HTMLElement && parentElement instanceof HTMLElement) {
        return { parentElement, insertAfterElement: toolbarElement };
    }

    const firstCell = cells[0];
    const fallbackElement = firstCell?.anchorElement.parentElement ?? null;
    const fallbackParentElement = fallbackElement?.parentElement ?? null;
    if (fallbackElement instanceof HTMLElement && fallbackParentElement instanceof HTMLElement) {
        return { parentElement: fallbackParentElement, insertAfterElement: fallbackElement };
    }

    return null;
}

function resolveMonthlyCalendarContainerElement(cells: MonthlyCalendarCell[]): HTMLElement | null {
    const firstCell = cells[0];
    if (firstCell === undefined) {
        return null;
    }

    let candidate: HTMLElement = firstCell.anchorElement;
    for (const cell of cells.slice(1)) {
        const commonAncestor = findLowestCommonElementAncestor(candidate, cell.anchorElement);
        if (commonAncestor === null) {
            return candidate;
        }
        candidate = commonAncestor;
    }

    while (candidate.parentElement instanceof HTMLElement && candidate.parentElement !== document.body) {
        const parentElement = candidate.parentElement;
        const parentCalendarCellCount = parentElement.querySelectorAll(`[data-testid^="${CALENDAR_DATE_TEST_ID_PREFIX}"]`).length;
        const parentHasToolbar = parentElement.querySelector(`[data-testid="segmented-control"]`) !== null;
        if (parentCalendarCellCount !== cells.length || parentHasToolbar) {
            break;
        }

        candidate = parentElement;
    }

    return candidate;
}

function findLowestCommonElementAncestor(leftElement: HTMLElement, rightElement: HTMLElement): HTMLElement | null {
    const leftAncestors = new Set<HTMLElement>();
    let currentLeft: HTMLElement | null = leftElement;
    while (currentLeft !== null) {
        leftAncestors.add(currentLeft);
        currentLeft = currentLeft.parentElement;
    }

    let currentRight: HTMLElement | null = rightElement;
    while (currentRight !== null) {
        if (leftAncestors.has(currentRight)) {
            return currentRight;
        }

        currentRight = currentRight.parentElement;
    }

    return null;
}

function cleanupRankRecommendationList(): void {
    latestRankRecommendationCurvePreviewSnapshotByKey.clear();
    latestRankRecommendationCandidateByCompetitorPreviewKey.clear();
    unmountRankRecommendationReactIsland();
    document.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_LIST_ATTRIBUTE}]`)?.remove();
}

function formatRankRecommendationPriority(priority: RankRecommendationPriority): string {
    switch (priority) {
        case "high":
            return "高";
        case "medium":
            return "中";
        case "low":
        default:
            return "低";
    }
}

function formatRankRecommendationActionLabel(action: RankRecommendationAction): string {
    switch (action) {
        case "raise_watch":
            return "上げ検討";
        case "lower_watch":
            return "下げ注意";
        case "not_eligible":
            return "判定対象外";
        case "watch":
        default:
            return "監視";
    }
}

function formatRankRecommendationConfidence(confidence: number): string {
    switch (getRankRecommendationConfidenceLevel(confidence)) {
        case "high":
            return "高";
        case "medium":
            return "中";
        case "low":
        default:
            return "低";
    }
}

function formatRankRecommendationConfidenceCellText(
    candidate: RankRecommendationCandidate,
    cautionText: string
): string {
    const confidenceText = formatRankRecommendationConfidence(candidate.confidence);
    return cautionText === "" ? confidenceText : `${confidenceText}・注意あり`;
}

function formatRankRecommendationLeadDays(candidate: RankRecommendationCandidate): string {
    const leadDays = getDaysBetweenDateKeys(candidate.stayDate, candidate.asOfDate);
    if (leadDays === null || leadDays < 0) {
        return "-";
    }
    if (leadDays === 0) {
        return "当日";
    }
    return `${leadDays}日`;
}

function formatRankRecommendationLatestChangeCellText(displayInfo: RankRecommendationDisplayInfo | null): string {
    const latestRankChange = displayInfo?.latestRankChange ?? null;
    if (latestRankChange === null) {
        return "-";
    }

    const freshness = formatRankRecommendationLatestChangeFreshness(latestRankChange.daysAgo);
    return freshness === null ? "変更あり" : freshness;
}

function buildRankRecommendationLatestChangeHistoryItems(
    displayInfo: RankRecommendationDisplayInfo | null
): RankRecommendationLatestChangeHistoryItem[] {
    const latestRankChange = displayInfo?.latestRankChange ?? null;
    if (latestRankChange === null) {
        return [];
    }

    const items: RankRecommendationLatestChangeHistoryItem[] = [];
    const transition = formatSalesSettingRankTransition(latestRankChange.beforeRankName, latestRankChange.afterRankName);
    if (transition !== "-") {
        items.push({ label: "ランク", value: transition });
    }

    const freshness = formatRankRecommendationLatestChangeFreshness(latestRankChange.daysAgo);
    if (freshness !== null) {
        items.push({ label: "経過", value: freshness });
    }

    if (items.length === 0) {
        items.push({ label: "", value: "変更あり" });
    }

    return items;
}

function formatRankRecommendationLatestChangeTitle(displayInfo: RankRecommendationDisplayInfo | null): string {
    if (displayInfo === null) {
        return "前回変更: 表示情報を取得できませんでした";
    }

    const latestRankChange = displayInfo.latestRankChange;
    const parts = latestRankChange === null
        ? ["前回変更: 履歴なし"]
        : [
            `前回変更: ${formatRankRecommendationLatestChangeCellText(displayInfo)}`,
            `変更内容: ${formatSalesSettingRankTransition(latestRankChange.beforeRankName, latestRankChange.afterRankName)}`,
            ...(latestRankChange.reflectorName === null ? [] : [`実行者: ${latestRankChange.reflectorName}`])
        ];

    return [...parts, ...displayInfo.visibilityDiagnostics].join("\n");
}

function formatRankRecommendationLatestChangeFreshness(daysAgo: number | null): string | null {
    if (daysAgo === null) {
        return null;
    }
    return `${daysAgo}日前`;
}

function getRankRecommendationConfidenceLevel(confidence: number): RankRecommendationDecisionConfidenceLevel {
    if (confidence >= 0.6) {
        return "high";
    }
    if (confidence >= 0.4) {
        return "medium";
    }
    return "low";
}

function getRankRecommendationConfidenceLevelWeight(confidenceLevel: RankRecommendationDecisionConfidenceLevel): number {
    switch (confidenceLevel) {
        case "high":
            return 3;
        case "medium":
            return 2;
        case "low":
        default:
            return 1;
    }
}

function formatRankRecommendationConfidenceLevel(confidenceLevel: RankRecommendationDecisionConfidenceLevel): string {
    switch (confidenceLevel) {
        case "high":
            return "高";
        case "medium":
            return "中";
        case "low":
        default:
            return "低";
    }
}

function formatRankRecommendationConfidenceTitle(candidate: RankRecommendationCandidate): string {
    const parts = [
        `確度: ${formatRankRecommendationConfidence(candidate.confidence)}`,
        "予測精度、推奨金額の正確さ、Revenue Assistant への反映可否を保証する値ではありません。"
    ];
    const reasonText = Array.from(new Set(candidate.reasonCodes)).slice(0, 5).join(" / ");
    if (reasonText !== "") {
        parts.push(`主要根拠: ${reasonText}`);
    }
    const cautionText = summarizeRankRecommendationConfidenceCautions(candidate.diagnostics).join(" / ");
    if (cautionText !== "") {
        parts.push(`注意: ${cautionText}`);
    }
    return parts.join("\n");
}

function formatRankRecommendationReasonTitle(candidate: RankRecommendationCandidate): string {
    const parts: string[] = [];
    const reasonText = Array.from(new Set(candidate.reasonCodes)).join(" / ");
    if (reasonText !== "") {
        parts.push(`主要根拠: ${reasonText}`);
    }
    const cautionText = summarizeRankRecommendationConfidenceCautions(candidate.diagnostics).join(" / ");
    if (cautionText !== "") {
        parts.push(`注意: ${cautionText}`);
    }
    return parts.join("\n");
}

function summarizeRankRecommendationConfidenceCautions(diagnostics: readonly string[]): string[] {
    const labels: string[] = [];
    const hasDiagnostic = (pattern: string | RegExp): boolean => diagnostics.some((diagnostic) => (
        typeof pattern === "string" ? diagnostic === pattern : pattern.test(diagnostic)
    ));
    if (hasDiagnostic("booking_curve_source_missing") || hasDiagnostic("reference_deviation_missing")) {
        labels.push("booking_curve または reference 不足");
    }
    if (hasDiagnostic(/^forecast_missing:/) || hasDiagnostic("forecast_expected_occupancy_missing")) {
        labels.push("forecast 比較不足");
    }
    if (hasDiagnostic(/sales_adr.*_missing$/) || hasDiagnostic(/sales_adr_reference_.*_zero$/)) {
        labels.push("sales / ADR 比較不足");
    }
    if (hasDiagnostic(/^weekday_context_/) || hasDiagnostic("weekday_reference_source_count_low")) {
        labels.push("同曜日比較不足");
    }
    if (hasDiagnostic("competitor_price_room_group_scope_unconfirmed")) {
        labels.push("競合価格の部屋タイプ対応未確認");
    }
    if (hasDiagnostic("group_driven_raise_suppressed")) {
        labels.push("団体主因のため上げ判断を抑制");
    }
    if (
        hasDiagnostic("small_capacity")
        || hasDiagnostic("capacity_missing")
        || hasDiagnostic("small_capacity_three_review")
        || hasDiagnostic("small_capacity_reference_confirmation_required")
    ) {
        labels.push("部屋数条件により判定制限");
    }
    if (hasDiagnostic(/^recommended_rank_/)) {
        labels.push("隣接ランク表示に制約あり");
    }
    return Array.from(new Set(labels)).slice(0, 4);
}

function formatRankRecommendationAction(candidate: RankRecommendationCandidate): string {
    switch (candidate.action) {
        case "raise_watch":
            if (candidate.recommendedRankName !== null) {
                return `1段上げ検討: ${candidate.recommendedRankName}`;
            }
            if (candidate.recommendedRankUnavailableReason === "rank_ladder_boundary") {
                return "上限ランク: 上げ余地なし";
            }
            return "上げ検討";
        case "lower_watch":
            if (candidate.recommendedRankName !== null) {
                return `1段下げ注意: ${candidate.recommendedRankName}`;
            }
            if (candidate.recommendedRankUnavailableReason === "rank_ladder_boundary") {
                return "下限ランク: 下げ余地なし";
            }
            return "下げ注意";
        case "not_eligible":
            return "判定対象外";
        case "watch":
        default:
            return "監視";
    }
}

function formatRankRecommendationStatus(status: RankRecommendationStatus): string {
    return status === "active" ? "確認待ち" : "判定対象外";
}

function formatRankRecommendationStatusBadge(
    candidate: RankRecommendationCandidate,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null,
    cautionText: string,
    rankChangeProposal: RankRecommendationRankChangeProposal
): string {
    if (candidate.status !== "active") {
        return "対象外";
    }
    const rawStatus = getRankRecommendationRawSourceStatus(candidate, curvePreviewInfo === null
        ? undefined
        : new Map([[buildRankRecommendationCandidateDisplayInfoKey(candidate), curvePreviewInfo]]));
    if (rawStatus === "loading") {
        return "取得中";
    }
    if (!rankChangeProposal.enabled) {
        return "送信不可";
    }
    if (rawStatus === "missing" || rawStatus === "error" || cautionText !== "") {
        return "確認不足";
    }
    return "根拠あり";
}

function formatRankRecommendationStatusBadgeTitle(
    candidate: RankRecommendationCandidate,
    curvePreviewInfo: RankRecommendationCurvePreviewInfo | null,
    cautionText: string,
    rankChangeProposal: RankRecommendationRankChangeProposal
): string {
    const rawStatus = getRankRecommendationRawSourceStatus(candidate, curvePreviewInfo === null
        ? undefined
        : new Map([[buildRankRecommendationCandidateDisplayInfoKey(candidate), curvePreviewInfo]]));
    return [
        `候補状態: ${formatRankRecommendationStatus(candidate.status)}`,
        `raw source: ${formatRankRecommendationRawSourceStatus(rawStatus)}`,
        cautionText === "" ? "注意: なし" : `注意: ${cautionText}`,
        rankChangeProposal.enabled
            ? "rank変更: 送信候補あり"
            : `rank変更: 送信不可 (${formatRankRecommendationRankChangeDisabledReasons(rankChangeProposal.disabledReasons)})`
    ].join("\n");
}

function formatRankRecommendationRankChangeDisabledReasons(
    reasons: readonly RankRecommendationRankChangeDisabledReason[]
): string {
    if (reasons.length === 0) {
        return "なし";
    }
    return reasons.map(formatRankRecommendationRankChangeDisabledReason).join(" / ");
}

function formatRankRecommendationRankChangeDisabledReason(
    reason: RankRecommendationRankChangeDisabledReason
): string {
    switch (reason) {
        case "candidate_not_active":
            return "候補がactiveではありません";
        case "unsupported_action":
            return "上げ検討または下げ注意ではありません";
        case "current_rank_missing":
            return "現在rankを取得できません";
        case "recommended_rank_missing":
            return "隣接recommended rankがありません";
        case "rank_order_untrusted":
            return "rank順序が設定画面または手動調整で確認されていません";
        case "low_confidence":
            return "確度が低です";
        case "small_capacity_or_capacity_missing":
            return "小キャパまたは部屋数不明です";
        case "group_driven_raise_suppressed":
            return "団体主因のため上げ判断を抑制しています";
        case "unsupported_provider":
        default:
            return "観測済みのLincoln custom rank pathではありません";
    }
}

function formatRankRecommendationRankChangeFailureClass(
    failureClass: RankRecommendationRankChangeFailureClass
): string {
    switch (failureClass) {
        case "current_rank_mismatch":
            return "current rank mismatch";
        case "rank_status_changed":
            return "rank status changed";
        case "proposal_disabled":
            return "proposal disabled";
        case "http_401":
            return "HTTP 401";
        case "http_403":
            return "HTTP 403";
        case "http_error":
            return "HTTP error";
        case "network_error":
            return "network error";
        case "reflection_unconfirmed":
            return "reflection unconfirmed";
        case "unexpected_error":
        default:
            return "unexpected error";
    }
}

function renderCachedMonthlyCalendarGroupRooms(
    batchDateKey: string,
    cells: MonthlyCalendarCell[] = collectMonthlyCalendarCells()
): void {
    const facilityCacheKey = activeFacilityCacheKey;
    if (cells.length === 0 || !isGroupRoomCalendarVisible() || facilityCacheKey === null) {
        return;
    }

    for (const cell of cells) {
        const lookupDate = getLookupDate(cell.stayDate);
        const cacheKey = getGroupRoomResultCacheKey(facilityCacheKey, batchDateKey, cell.stayDate, lookupDate);
        const persisted = readPersistedGroupRoomCount(facilityCacheKey, cacheKey);

        if (persisted !== undefined) {
            renderGroupRoomCount(cell, persisted);
            continue;
        }

        const inMemory = groupRoomCache.get(cacheKey);
        if (inMemory !== undefined) {
            void inMemory.then((groupRoomCount) => {
                if (cell.anchorElement.isConnected) {
                    renderGroupRoomCount(cell, groupRoomCount);
                }
            });
        }
    }
}

async function syncSalesSettingGroupRooms(
    preparedData: SalesSettingPreparedData | null,
    analysisDate: string,
    batchDateKey: string,
    syncContext: SyncContext
): Promise<void> {
    if (preparedData === null || preparedData.cards.length === 0) {
        return;
    }

    ensureGroupRoomStyles();

    const statuses = await getLincolnSuggestStatuses(analysisDate)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to load rank history for booking curve markers`, {
                analysisDate,
                error
            });
            return [] as LincolnSuggestStatus[];
        });
    if (isSyncContextStale(syncContext)) {
        return;
    }

    latestSalesSettingRankStatusesSnapshot = {
        analysisDate,
        statuses
    };

    const renderResult = renderSalesSettingGroupRoomsFromPreparedData(preparedData, analysisDate, batchDateKey, statuses);
    if (!renderResult.ok) {
        return;
    }

    hydrateOpenSalesSettingRoomReferenceCurves(
        preparedData,
        analysisDate,
        batchDateKey,
        syncContext,
        renderResult.rankHistoryByRoomGroupName
    );

    if (hasCurrentSalesSettingUi()) {
        const latestCards = collectSalesSettingCards();
        const firstCard = latestCards[0];
        if (firstCard !== undefined && firstCard.cardElement.isConnected) {
            renderSalesSettingOverallSummaryFromPreparedData(preparedData, analysisDate, batchDateKey, firstCard);
            renderSalesSettingRankInsightsFromStatuses(latestCards, statuses, firstCard, preparedData);
        }
    }
}

function rerenderSalesSettingBookingCurveSurfacesFromLatestSnapshot(): void {
    const analysisDate = activeAnalyzeDate;
    const batchDateKey = activeBatchDateKey;
    if (analysisDate === null || batchDateKey === null) {
        return;
    }
    if (
        latestSalesSettingPreparedSnapshot === null
        || latestSalesSettingPreparedSnapshot.analysisDate !== analysisDate
        || latestSalesSettingPreparedSnapshot.batchDateKey !== batchDateKey
    ) {
        return;
    }

    const preparedData = latestSalesSettingPreparedSnapshot.preparedData;
    const statuses = latestSalesSettingRankStatusesSnapshot !== null
        && latestSalesSettingRankStatusesSnapshot.analysisDate === analysisDate
        ? latestSalesSettingRankStatusesSnapshot.statuses
        : [];
    const renderResult = renderSalesSettingGroupRoomsFromPreparedData(preparedData, analysisDate, batchDateKey, statuses);
    if (!renderResult.ok) {
        return;
    }

    if (hasCurrentSalesSettingUi()) {
        const latestCards = collectSalesSettingCards();
        const firstCard = latestCards[0] ?? preparedData.cards[0];
        if (firstCard !== undefined && firstCard.cardElement.isConnected) {
            renderSalesSettingOverallSummaryFromPreparedData(preparedData, analysisDate, batchDateKey, firstCard);
            renderSalesSettingRankInsightsFromStatuses(latestCards, statuses, firstCard, preparedData);
        }
    }
    renderCompetitorPriceOverviewFromState();
    renderPriceTrendOverviewFromState();
}

function renderSalesSettingGroupRoomsFromPreparedData(
    preparedData: SalesSettingPreparedData,
    analysisDate: string,
    batchDateKey: string,
    statuses: LincolnSuggestStatus[]
): { ok: true; rankHistoryByRoomGroupName: Map<string, SalesSettingRankHistoryEvent[]> } | { ok: false } {
    ensureGroupRoomStyles();

    const rankHistoryByRoomGroupName = buildSalesSettingRankHistoryByRoomGroup(statuses, analysisDate);
    const inconsistentRoomGroupNames = getInconsistentSalesSettingGroupNames(
        preparedData.cardMetrics.map((metric) => ({
            roomGroupName: metric.roomGroupName,
            currentValue: metric.metrics?.groupMetrics.currentValue ?? null
        })),
        preparedData.hotelMetrics.groupMetrics.currentValue
    );
    if (inconsistentRoomGroupNames.length > 0) {
        console.warn(`[${SCRIPT_NAME}] inconsistent sales-setting group counts`, {
            analysisDate,
            batchDateKey,
            currentOverallGroupRoomCount: preparedData.hotelMetrics.groupMetrics.currentValue,
            inconsistentRoomGroupNames
        });
        cleanupSalesSettingGroupRooms();
        return { ok: false };
    }

    const currentCardsByRoomGroupName = new Map(
        collectSalesSettingCards().map((card) => [card.roomGroupName, card] as const)
    );

    for (const metric of preparedData.cardMetrics) {
        const currentCard = currentCardsByRoomGroupName.get(metric.roomGroupName) ?? metric.card;
        if (metric.metrics === null) {
            clearSalesSettingGroupRoom(currentCard);
            continue;
        }

        if (!currentCard.cardElement.isConnected) {
            continue;
        }

        renderSalesSettingGroupRoom(
            currentCard,
            metric.metrics.allMetrics.currentValue,
            metric.metrics.allMetrics.previousDayValue,
            metric.metrics.allMetrics.previousWeekValue,
            metric.metrics.allMetrics.previousMonthValue,
            metric.metrics.privateMetrics.currentValue,
            metric.metrics.privateMetrics.previousDayValue,
            metric.metrics.privateMetrics.previousWeekValue,
            metric.metrics.privateMetrics.previousMonthValue,
            metric.metrics.groupMetrics.currentValue,
            metric.metrics.groupMetrics.previousDayValue,
            metric.metrics.groupMetrics.previousWeekValue,
            metric.metrics.groupMetrics.previousMonthValue,
            metric.metrics.bookingCurveData === null
                ? null
                : buildSalesSettingBookingCurveRenderData(
                    metric.metrics.bookingCurveData,
                    metric.metrics.referenceCurveData,
                    metric.metrics.sameWeekdayCurveData,
                    analysisDate,
                    batchDateKey,
                    rankHistoryByRoomGroupName.get(metric.roomGroupName) ?? []
                )
        );
    }

    return { ok: true, rankHistoryByRoomGroupName };
}

function hydrateOpenSalesSettingRoomReferenceCurves(
    preparedData: SalesSettingPreparedData,
    analysisDate: string,
    batchDateKey: string,
    syncContext: SyncContext,
    rankHistoryByRoomGroupName: Map<string, SalesSettingRankHistoryEvent[]>
): void {
    for (const metric of preparedData.cardMetrics) {
        const metrics = metric.metrics;
        if (
            metrics === null
            || metric.rmRoomGroupId === undefined
            || metrics.bookingCurveData === null
            || metrics.referenceCurveData !== null
            || !isSalesSettingBookingCurveOpen(metric.roomGroupName)
        ) {
            continue;
        }

        void loadSalesSettingBookingCurveReferenceData(analysisDate, batchDateKey, metric.rmRoomGroupId)
            .then((referenceCurveData) => {
                if (
                    referenceCurveData === null
                    || isSyncContextStale(syncContext)
                    || !isSalesSettingBookingCurveOpen(metric.roomGroupName)
                ) {
                    return;
                }

                const currentCardsByRoomGroupName = new Map<string, SalesSettingCard>();
                for (const card of collectSalesSettingCards()) {
                    if (!currentCardsByRoomGroupName.has(card.roomGroupName)) {
                        currentCardsByRoomGroupName.set(card.roomGroupName, card);
                    }
                }
                const currentCard = currentCardsByRoomGroupName.get(metric.roomGroupName) ?? metric.card;
                const currentMetrics = metric.metrics;
                if (
                    !currentCard.cardElement.isConnected
                    || currentMetrics === null
                    || currentMetrics.bookingCurveData === null
                ) {
                    return;
                }

                currentMetrics.referenceCurveData = referenceCurveData;
                renderSalesSettingBookingCurveCard(
                    currentCard,
                    currentMetrics.allMetrics.currentValue,
                    resolveSalesSettingBookingCurveSecondaryCurrentRoomCount(
                        currentMetrics.privateMetrics.currentValue,
                        currentMetrics.groupMetrics.currentValue
                    ),
                    buildSalesSettingBookingCurveRenderData(
                        currentMetrics.bookingCurveData,
                        referenceCurveData,
                        currentMetrics.sameWeekdayCurveData,
                        analysisDate,
                        batchDateKey,
                        rankHistoryByRoomGroupName.get(metric.roomGroupName) ?? []
                    )
                );
            })
            .catch((error: unknown) => {
                console.warn(`[${SCRIPT_NAME}] failed to hydrate room booking curve reference data`, {
                    analysisDate,
                    batchDateKey,
                    roomGroupName: metric.roomGroupName,
                    rmRoomGroupId: metric.rmRoomGroupId,
                    error
                });
            });
    }
}

async function syncSalesSettingOverallSummary(
    preparedData: SalesSettingPreparedData | null,
    analysisDate: string,
    batchDateKey: string,
    syncContext: SyncContext
): Promise<void> {
    if (preparedData === null || preparedData.cards.length === 0) {
        if (!hasCurrentSalesSettingUi()) {
            scheduleSalesSettingSupplementCleanup();
        }
        return;
    }

    cancelSalesSettingSupplementCleanup();
    ensureGroupRoomStyles();
    if (isSyncContextStale(syncContext)) {
        return;
    }

    const firstCard = collectSalesSettingCards()[0] ?? preparedData.cards[0];
    if (firstCard === undefined || !firstCard.cardElement.isConnected) {
        return;
    }

    renderSalesSettingOverallSummaryFromPreparedData(preparedData, analysisDate, batchDateKey, firstCard);
    hydrateSalesSettingOverallReferenceCurve(preparedData, analysisDate, batchDateKey, syncContext, firstCard);
}

function renderSalesSettingOverallSummaryFromPreparedData(
    preparedData: SalesSettingPreparedData,
    analysisDate: string,
    batchDateKey: string,
    firstCard: SalesSettingCard
): void {
    const roomDeltaMetrics = preparedData.cardMetrics.map((metric) => metric.metrics?.allMetrics ?? createEmptySalesSettingComparisonMetrics());
    const currentRoomGroupMetrics = preparedData.cardMetrics.map((metric) => ({
        roomGroupName: metric.roomGroupName,
        currentValue: metric.metrics?.groupMetrics.currentValue ?? null
    }));
    const currentOverallRoomCount = sumMetricValues(roomDeltaMetrics.map((metric) => metric.currentValue));
    const previousDayOverallRoomCount = sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousDayValue));
    const previousWeekOverallRoomCount = sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousWeekValue));
    const previousMonthOverallRoomCount = sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousMonthValue));
    const showGroupMetrics = getInconsistentSalesSettingGroupNames(currentRoomGroupMetrics, preparedData.hotelMetrics.groupMetrics.currentValue).length === 0;
    if (!showGroupMetrics) {
        console.warn(`[${SCRIPT_NAME}] skipped overall group summary because room-group counts were inconsistent`, {
            analysisDate,
            batchDateKey,
            currentGroupRoomCount: preparedData.hotelMetrics.groupMetrics.currentValue,
            currentRoomGroupMetrics
        });
    }

    renderSalesSettingOverallSummary(
        firstCard,
        preparedData.totalCapacity,
        currentOverallRoomCount,
        previousDayOverallRoomCount,
        previousWeekOverallRoomCount,
        previousMonthOverallRoomCount,
        resolveSalesSettingPrivateRoomCount(preparedData.hotelMetrics.transientMetrics.currentValue, currentOverallRoomCount, preparedData.hotelMetrics.groupMetrics.currentValue),
        resolveSalesSettingPrivateRoomCount(preparedData.hotelMetrics.transientMetrics.previousDayValue, previousDayOverallRoomCount, preparedData.hotelMetrics.groupMetrics.previousDayValue),
        resolveSalesSettingPrivateRoomCount(preparedData.hotelMetrics.transientMetrics.previousWeekValue, previousWeekOverallRoomCount, preparedData.hotelMetrics.groupMetrics.previousWeekValue),
        resolveSalesSettingPrivateRoomCount(preparedData.hotelMetrics.transientMetrics.previousMonthValue, previousMonthOverallRoomCount, preparedData.hotelMetrics.groupMetrics.previousMonthValue),
        preparedData.hotelMetrics.groupMetrics.currentValue,
        preparedData.hotelMetrics.groupMetrics.previousDayValue,
        preparedData.hotelMetrics.groupMetrics.previousWeekValue,
        preparedData.hotelMetrics.groupMetrics.previousMonthValue,
        showGroupMetrics,
        preparedData.hotelMetrics.bookingCurveData === null
            ? null
            : buildSalesSettingBookingCurveRenderData(
                preparedData.hotelMetrics.bookingCurveData,
                preparedData.hotelMetrics.referenceCurveData,
                preparedData.hotelMetrics.sameWeekdayCurveData,
                analysisDate,
                batchDateKey
            )
    );
}

function hydrateSalesSettingOverallReferenceCurve(
    preparedData: SalesSettingPreparedData,
    analysisDate: string,
    batchDateKey: string,
    syncContext: SyncContext,
    firstCard: SalesSettingCard
): void {
    if (
        preparedData.hotelMetrics.bookingCurveData === null
        || preparedData.hotelMetrics.referenceCurveData !== null
    ) {
        return;
    }

    void loadSalesSettingBookingCurveReferenceData(analysisDate, batchDateKey)
        .then((referenceCurveData) => {
            if (
                referenceCurveData === null
                || isSyncContextStale(syncContext)
                || !firstCard.cardElement.isConnected
                || preparedData.hotelMetrics.bookingCurveData === null
            ) {
                return;
            }

            preparedData.hotelMetrics.referenceCurveData = referenceCurveData;
            renderSalesSettingOverallSummaryFromPreparedData(preparedData, analysisDate, batchDateKey, firstCard);
        })
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to hydrate overall booking curve reference data`, {
                analysisDate,
                batchDateKey,
                error
            });
        });
}

async function syncSalesSettingRankInsights(
    analysisDate: string,
    syncContext: SyncContext,
    preparedData: SalesSettingPreparedData | null
): Promise<void> {
    if (preparedData === null || preparedData.cards.length === 0) {
        cleanupSalesSettingRankOverview();
        cleanupSalesSettingRankDetails();
        if (!hasCurrentSalesSettingUi()) {
            scheduleSalesSettingSupplementCleanup();
        }
        return;
    }

    const cards = collectSalesSettingCards();
    if (cards.length === 0) {
        if (!hasCurrentSalesSettingUi()) {
            scheduleSalesSettingSupplementCleanup();
        }
        return;
    }

    cancelSalesSettingSupplementCleanup();
    ensureGroupRoomStyles();

    const statuses = latestSalesSettingRankStatusesSnapshot !== null
        && latestSalesSettingRankStatusesSnapshot.analysisDate === analysisDate
        ? latestSalesSettingRankStatusesSnapshot.statuses
        : await getLincolnSuggestStatuses(analysisDate)
            .catch((error: unknown) => {
                console.error(`[${SCRIPT_NAME}] failed to load lincoln suggest statuses`, {
                    analysisDate,
                    error
                });
                return [] as LincolnSuggestStatus[];
            });
    if (isSyncContextStale(syncContext)) {
        return;
    }

    latestSalesSettingRankStatusesSnapshot = {
        analysisDate,
        statuses
    };

    const currentCards = collectSalesSettingCards();
    if (currentCards.length === 0) {
        if (!hasCurrentSalesSettingUi()) {
            scheduleSalesSettingSupplementCleanup();
        }
        return;
    }

    const firstCard = currentCards[0];
    if (firstCard === undefined || !firstCard.cardElement.isConnected) {
        return;
    }

    renderSalesSettingRankInsightsFromStatuses(
        currentCards,
        statuses,
        firstCard,
        preparedData
    );
}

function renderSalesSettingRankInsightsFromStatuses(
    cards: SalesSettingCard[],
    statuses: LincolnSuggestStatus[],
    firstCard: SalesSettingCard,
    preparedData: SalesSettingPreparedData | null = null
): void {
    const summaries = buildSalesSettingRankSummaries(cards, statuses, preparedData);
    const summaryByRoomGroupName = new Map(summaries.map((summary) => [summary.roomGroupName, summary]));

    renderSalesSettingRankOverview(
        firstCard,
        cards
            .map((card) => summaryByRoomGroupName.get(card.roomGroupName))
            .filter((summary): summary is SalesSettingRankSummary => summary !== undefined)
    );

    for (const card of cards) {
        if (!card.cardElement.isConnected) {
            continue;
        }

        renderSalesSettingRankDetail(card, summaryByRoomGroupName.get(card.roomGroupName) ?? null);
    }
}

function collectMonthlyCalendarCells(): MonthlyCalendarCell[] {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>(`[data-testid^="${CALENDAR_DATE_TEST_ID_PREFIX}"]`))
        .flatMap((anchorElement) => {
            const testId = anchorElement.getAttribute("data-testid");
            if (testId === null || !testId.startsWith(CALENDAR_DATE_TEST_ID_PREFIX)) {
                return [];
            }

            const stayDateWithHyphen = testId.slice(CALENDAR_DATE_TEST_ID_PREFIX.length);
            const roomElement = anchorElement.querySelector<HTMLElement>(`[data-testid="room-num-${stayDateWithHyphen}"]`);

            if (roomElement === null || roomElement.parentElement === null) {
                return [];
            }

            return [{
                stayDate: stayDateWithHyphen.replaceAll("-", ""),
                anchorElement,
                containerElement: roomElement.parentElement,
                roomElement,
                indicatorElement: anchorElement.querySelector<HTMLElement>(`[data-testid="indicator-${stayDateWithHyphen}"]`)
            }];
        });
}

function collectLegacySalesSettingCards(): SalesSettingCard[] {
    return Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="suggestions-heading"]`))
        .flatMap((headingElement) => {
            const roomTypeElement = headingElement.querySelector<HTMLElement>(`[data-testid="suggestions-room-type-name"]`);
            const latestReflectionElement = headingElement.querySelector<HTMLElement>(`[data-testid="suggestions-latest-reflection-at"]`);
            const cardElement = headingElement.parentElement;
            const roomCountSummaryElement = headingElement
                .querySelector<HTMLElement>(`[data-testid="suggestions-room-full-number"]`)
                ?.parentElement ?? null;

            if (roomTypeElement === null || cardElement === null) {
                return [];
            }

            const roomGroupName = roomTypeElement.textContent?.trim() ?? "";
            if (roomGroupName === "") {
                return [];
            }

            return [{
                roomGroupName,
                cardElement,
                headingElement,
                latestReflectionElement,
                roomCountSummaryElement,
                detailWrapperElement: cardElement.querySelector<HTMLElement>(`[data-testid="suggestions-detail-wrapper"]`)
            }];
        });
}

function collectSalesSettingCards(): SalesSettingCard[] {
    const legacyCards = collectLegacySalesSettingCards();
    if (legacyCards.length > 0) {
        cleanupCurrentUiSalesSettingRoot();
        return legacyCards;
    }

    return collectCurrentUiSalesSettingCards();
}

function collectCurrentUiSalesSettingCards(): SalesSettingCard[] {
    if (!hasCurrentSalesSettingUi()) {
        cleanupCurrentUiSalesSettingRoot();
        return [];
    }

    const contentElement = findCurrentUiSalesSettingContentElement();
    const containerElement = contentElement?.parentElement;
    const fallbackRoot = document.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`);
    const fallbackCards = collectExistingCurrentUiSalesSettingCards(fallbackRoot);
    const roomGroupNames = collectCurrentUiRoomGroupNames();
    if (!(contentElement instanceof HTMLElement) || !(containerElement instanceof HTMLElement)) {
        if (fallbackCards.length > 0) {
            return fallbackCards;
        }
        cleanupCurrentUiSalesSettingRoot();
        return [];
    }

    if (roomGroupNames.length === 0) {
        if (fallbackCards.length > 0) {
            return fallbackCards;
        }
        cleanupCurrentUiSalesSettingRoot();
        return [];
    }

    const existingRoot = containerElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`) ?? fallbackRoot;
    const rootElement = existingRoot ?? document.createElement("section");
    rootElement.setAttribute(SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE, "");

    const cardsContainerElement = rootElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_CARDS_ATTRIBUTE}]`) ?? document.createElement("div");
    cardsContainerElement.setAttribute(SALES_SETTING_CURRENT_UI_CARDS_ATTRIBUTE, "");

    const existingCards = new Map(Array.from(cardsContainerElement.querySelectorAll<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE}]`))
        .map((cardElement) => [cardElement.getAttribute(SALES_SETTING_CURRENT_UI_CARD_ROOM_GROUP_ATTRIBUTE) ?? "", cardElement]));

    const cards = roomGroupNames.map((roomGroupName) => {
        const cardElement = existingCards.get(roomGroupName) ?? document.createElement("section");
        cardElement.setAttribute(SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE, "");
        cardElement.setAttribute(SALES_SETTING_CURRENT_UI_CARD_ROOM_GROUP_ATTRIBUTE, roomGroupName);

        const headingElement = cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_HEADING_ATTRIBUTE}]`) ?? document.createElement("div");
        headingElement.setAttribute(SALES_SETTING_CURRENT_UI_HEADING_ATTRIBUTE, "");

        const titleElement = headingElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_TITLE_ATTRIBUTE}]`) ?? document.createElement("div");
        titleElement.setAttribute(SALES_SETTING_CURRENT_UI_TITLE_ATTRIBUTE, "");
        titleElement.textContent = roomGroupName;

        const metaElement = headingElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_META_ATTRIBUTE}]`) ?? document.createElement("div");
        metaElement.setAttribute(SALES_SETTING_CURRENT_UI_META_ATTRIBUTE, "");

        const metaLabelElement = metaElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_META_LABEL_ATTRIBUTE}]`) ?? document.createElement("span");
        metaLabelElement.setAttribute(SALES_SETTING_CURRENT_UI_META_LABEL_ATTRIBUTE, "");
        metaLabelElement.textContent = "最終変更";

        const latestReflectionElement = metaElement.querySelector<HTMLElement>(`[data-ra-sales-setting-current-ui-latest-reflection]`) ?? document.createElement("span");
        latestReflectionElement.setAttribute("data-ra-sales-setting-current-ui-latest-reflection", "");
        if ((latestReflectionElement.textContent ?? "").trim() === "") {
            latestReflectionElement.textContent = "-";
        }
        if (latestReflectionElement.parentElement !== metaElement || metaElement.childElementCount !== 2) {
            metaElement.replaceChildren(metaLabelElement, latestReflectionElement);
        }

        if (headingElement.childElementCount !== 2 || titleElement.parentElement !== headingElement || metaElement.parentElement !== headingElement) {
            headingElement.replaceChildren(titleElement, metaElement);
        }

        const detailWrapperElement = cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_DETAIL_WRAPPER_ATTRIBUTE}]`) ?? document.createElement("div");
        detailWrapperElement.setAttribute(SALES_SETTING_CURRENT_UI_DETAIL_WRAPPER_ATTRIBUTE, "");

        const capacityElement = cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_CAPACITY_ATTRIBUTE}]`) ?? document.createElement("span");
        capacityElement.setAttribute(SALES_SETTING_CURRENT_UI_CAPACITY_ATTRIBUTE, "");
        capacityElement.hidden = true;

        if (
            cardElement.childElementCount < 3
            || headingElement.parentElement !== cardElement
            || capacityElement.parentElement !== cardElement
            || detailWrapperElement.parentElement !== cardElement
        ) {
            cardElement.replaceChildren(headingElement, capacityElement, detailWrapperElement);
        }

        return {
            roomGroupName,
            cardElement,
            headingElement,
            latestReflectionElement,
            roomCountSummaryElement: capacityElement,
            detailWrapperElement
        } satisfies SalesSettingCard;
    });

    const validNames = new Set(roomGroupNames);
    for (const [roomGroupName, cardElement] of existingCards.entries()) {
        if (!validNames.has(roomGroupName)) {
            cardElement.remove();
        }
    }

    cardsContainerElement.replaceChildren(...cards.map((card) => card.cardElement));

    rootElement.replaceChildren(cardsContainerElement);

    if (rootElement.parentElement !== containerElement || rootElement.previousElementSibling !== contentElement) {
        containerElement.insertBefore(rootElement, contentElement.nextSibling);
    }

    restoreCurrentUiSalesSettingSupplements(cards);
    scheduleCurrentUiSalesSettingSupplementRestore();

    return cards;
}

function cleanupCurrentUiSalesSettingRoot(): void {
    document.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`)?.remove();
    document.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE}]`)?.remove();
}

function findDirectChildByAttribute(parentElement: HTMLElement, attributeName: string): HTMLElement | null {
    return Array.from(parentElement.children)
        .find((element): element is HTMLElement => element instanceof HTMLElement && element.hasAttribute(attributeName))
        ?? null;
}

function ensureCurrentUiSupplementsElement(): HTMLElement | null {
    if (!(document.body instanceof HTMLElement)) {
        return null;
    }

    const existingElement = document.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE}]`);
    const supplementsElement = existingElement ?? document.createElement("section");
    supplementsElement.setAttribute(SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE, "");

    if (supplementsElement.parentElement !== document.body || document.body.lastElementChild !== supplementsElement) {
        document.body.append(supplementsElement);
    }

    return supplementsElement;
}

function collectExistingCurrentUiSalesSettingCards(rootElement: HTMLElement | null): SalesSettingCard[] {
    if (!(rootElement instanceof HTMLElement)) {
        return [];
    }

    return Array.from(rootElement.querySelectorAll<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE}]`))
        .flatMap((cardElement) => {
            const roomGroupName = cardElement.getAttribute(SALES_SETTING_CURRENT_UI_CARD_ROOM_GROUP_ATTRIBUTE)?.trim() ?? "";
            const headingElement = cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_HEADING_ATTRIBUTE}]`);
            const latestReflectionElement = cardElement.querySelector<HTMLElement>(`[data-ra-sales-setting-current-ui-latest-reflection]`);
            const capacityElement = cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_CAPACITY_ATTRIBUTE}]`);
            const detailWrapperElement = cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_DETAIL_WRAPPER_ATTRIBUTE}]`);
            if (roomGroupName === "" || headingElement === null || detailWrapperElement === null) {
                return [];
            }

            return [{
                roomGroupName,
                cardElement,
                headingElement,
                latestReflectionElement,
                roomCountSummaryElement: capacityElement,
                detailWrapperElement
            } satisfies SalesSettingCard];
        });
}

function restoreCurrentUiSalesSettingSupplements(cards: SalesSettingCard[]): void {
    if (!hasCurrentSalesSettingUi() || cards.length === 0) {
        return;
    }

    cancelSalesSettingSupplementCleanup();

    const analysisDate = activeAnalyzeDate;
    const batchDateKey = activeBatchDateKey;
    const firstCard = cards[0];
    if (analysisDate === null || batchDateKey === null || firstCard === undefined || !firstCard.cardElement.isConnected) {
        return;
    }

    const preparedData = (
        latestSalesSettingPreparedSnapshot !== null
        && latestSalesSettingPreparedSnapshot.analysisDate === analysisDate
        && latestSalesSettingPreparedSnapshot.batchDateKey === batchDateKey
    )
        ? latestSalesSettingPreparedSnapshot.preparedData
        : null;

    if (preparedData !== null) {
        renderSalesSettingOverallSummaryFromPreparedData(
            preparedData,
            analysisDate,
            batchDateKey,
            firstCard
        );
    }

    if (
        preparedData !== null
        && latestSalesSettingRankStatusesSnapshot !== null
        && latestSalesSettingRankStatusesSnapshot.analysisDate === analysisDate
    ) {
        renderSalesSettingRankInsightsFromStatuses(
            cards,
            latestSalesSettingRankStatusesSnapshot.statuses,
            firstCard,
            preparedData
        );
        renderCompetitorPriceOverviewFromState();
        renderPriceTrendOverviewFromState();
        return;
    }

    cleanupSalesSettingRankOverview();
    cleanupSalesSettingRankDetails();
    renderCompetitorPriceOverviewFromState();
    renderPriceTrendOverviewFromState();
}

function scheduleSalesSettingSupplementCleanup(): void {
    if (salesSettingSupplementCleanupTimeoutId !== null) {
        return;
    }

    salesSettingSupplementCleanupTimeoutId = window.setTimeout(() => {
        salesSettingSupplementCleanupTimeoutId = null;
        if (hasCurrentSalesSettingUi()) {
            return;
        }

        cleanupSalesSettingOverallSummary();
        cleanupSalesSettingRankOverview();
        cleanupSalesSettingRankDetails();
    }, SALES_SETTING_SUPPLEMENT_CLEANUP_DELAY_MS);
}

function cancelSalesSettingSupplementCleanup(): void {
    if (salesSettingSupplementCleanupTimeoutId === null) {
        return;
    }

    window.clearTimeout(salesSettingSupplementCleanupTimeoutId);
    salesSettingSupplementCleanupTimeoutId = null;
}

function scheduleCurrentUiSalesSettingSupplementRestore(): void {
    clearCurrentUiSalesSettingSupplementRestore();

    if (!hasCurrentSalesSettingUi()) {
        return;
    }

    for (const delayMs of SALES_SETTING_SUPPLEMENT_RETRY_DELAYS_MS) {
        const timeoutId = window.setTimeout(() => {
            const cards = collectExistingCurrentUiSalesSettingCards(
                document.querySelector<HTMLElement>(`[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`)
            );
            if (cards.length === 0) {
                return;
            }

            restoreCurrentUiSalesSettingSupplements(cards);
        }, delayMs);
        salesSettingSupplementRetryTimeoutIds.push(timeoutId);
    }
}

function clearCurrentUiSalesSettingSupplementRestore(): void {
    while (salesSettingSupplementRetryTimeoutIds.length > 0) {
        const timeoutId = salesSettingSupplementRetryTimeoutIds.pop();
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
        }
    }
}

function collectCurrentUiRoomGroupNames(): string[] {
    const names: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="booking-curve-rm-room-group-list"] li`))) {
        const name = element.textContent?.trim() ?? "";
        if (name !== "" && name !== "全て") {
            names.push(name);
        }
    }
    return names;
}

function findCurrentUiSalesSettingContentElement(): HTMLElement | null {
    const headerElement = document.querySelector<HTMLElement>(`[data-testid="${SALES_SETTING_CURRENT_UI_HEADER_TEST_ID}"]`);
    if (headerElement === null) {
        return null;
    }

    let element = headerElement.parentElement;
    while (element !== null) {
        if (element.querySelector<HTMLElement>(`[data-testid="booking-curve-rm-room-group-list"]`) !== null) {
            return element;
        }

        element = element.parentElement;
    }

    return null;
}

function hasVisibleSalesSettingUi(): boolean {
    return collectSalesSettingCards().length > 0 || hasCurrentSalesSettingUi();
}

function hasSalesSettingWarmCacheEligiblePage(): boolean {
    return hasVisibleSalesSettingUi() || collectMonthlyCalendarCells().length > 0;
}

function hasCurrentSalesSettingUi(): boolean {
    return document.querySelector<HTMLElement>(`[data-testid="${SALES_SETTING_CURRENT_UI_HEADER_TEST_ID}"]`) !== null
        && document.querySelector<HTMLElement>(`[data-testid="${SALES_SETTING_CURRENT_UI_ROOM_GROUP_SELECTOR_TEST_ID}"]`) !== null;
}

function getLookupDate(stayDate: string): string {
    return stayDate;
}

function shiftDate(date: string, offsetDays: number): string {
    const compactDateKey = date.trim().replace(/-/g, "");
    const year = Number(compactDateKey.slice(0, 4));
    const month = Number(compactDateKey.slice(4, 6));
    const day = Number(compactDateKey.slice(6, 8));
    const value = new Date(Date.UTC(year, month - 1, day));
    value.setUTCDate(value.getUTCDate() + offsetDays);

    return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
}

function shiftMonth(date: string, offsetMonths: number): string | null {
    const compactDateKey = toCompactDateKey(date);
    if (compactDateKey === null) {
        return null;
    }

    const year = Number(compactDateKey.slice(0, 4));
    const monthIndex = Number(compactDateKey.slice(4, 6)) - 1;
    const day = Number(compactDateKey.slice(6, 8));
    const targetMonthFirstDate = new Date(Date.UTC(year, monthIndex + offsetMonths, 1));
    const targetYear = targetMonthFirstDate.getUTCFullYear();
    const targetMonthIndex = targetMonthFirstDate.getUTCMonth();
    const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
    const clampedDay = Math.min(day, lastDay);

    return `${targetYear}${String(targetMonthIndex + 1).padStart(2, "0")}${String(clampedDay).padStart(2, "0")}`;
}

function getRevenueAssistantComparisonDates(batchDateKey: string): { previousDay: string; previousWeek: string; previousMonth: string } {
    return {
        previousDay: shiftDate(batchDateKey, -2),
        previousWeek: shiftDate(batchDateKey, -8),
        previousMonth: shiftDate(batchDateKey, -31)
    };
}

function getSalesSettingComparisonDateKeys(batchDateKey: string): SalesSettingComparisonDateKeys {
    const { previousDay, previousWeek, previousMonth } = getRevenueAssistantComparisonDates(batchDateKey);

    return {
        current: batchDateKey,
        previousDay,
        previousWeek,
        previousMonth
    };
}

function createEmptySalesSettingComparisonMetrics(): SalesSettingComparisonMetrics {
    return {
        currentValue: null,
        previousDayValue: null,
        previousWeekValue: null,
        previousMonthValue: null
    };
}

function buildSalesSettingComparisonMetrics(
    bookingCurveData: BookingCurveResponse | null,
    comparisonDateKeys: SalesSettingComparisonDateKeys,
    countScope: BookingCurveCountScope
): SalesSettingComparisonMetrics {
    if (bookingCurveData === null) {
        return createEmptySalesSettingComparisonMetrics();
    }

    return {
        currentValue: findBookingCurveCount(bookingCurveData, comparisonDateKeys.current, countScope),
        previousDayValue: findBookingCurveCount(bookingCurveData, comparisonDateKeys.previousDay, countScope),
        previousWeekValue: findBookingCurveCount(bookingCurveData, comparisonDateKeys.previousWeek, countScope),
        previousMonthValue: findBookingCurveCount(bookingCurveData, comparisonDateKeys.previousMonth, countScope)
    };
}

function buildSalesSettingBookingCurveMetrics(
    bookingCurveData: BookingCurveResponse | null,
    referenceCurveData: SalesSettingBookingCurveReferenceData | null,
    sameWeekdayCurveData: SalesSettingSameWeekdayCurveData[],
    comparisonDateKeys: SalesSettingComparisonDateKeys
): SalesSettingBookingCurveMetrics {
    const allMetrics = buildSalesSettingComparisonMetrics(bookingCurveData, comparisonDateKeys, "all");
    const transientMetrics = buildSalesSettingComparisonMetrics(bookingCurveData, comparisonDateKeys, "transient");
    const groupMetrics = buildSalesSettingComparisonMetrics(bookingCurveData, comparisonDateKeys, "group");

    return {
        bookingCurveData,
        referenceCurveData,
        sameWeekdayCurveData,
        allMetrics,
        transientMetrics,
        groupMetrics,
        privateMetrics: {
            currentValue: resolveSalesSettingPrivateRoomCount(transientMetrics.currentValue, allMetrics.currentValue, groupMetrics.currentValue),
            previousDayValue: resolveSalesSettingPrivateRoomCount(transientMetrics.previousDayValue, allMetrics.previousDayValue, groupMetrics.previousDayValue),
            previousWeekValue: resolveSalesSettingPrivateRoomCount(transientMetrics.previousWeekValue, allMetrics.previousWeekValue, groupMetrics.previousWeekValue),
            previousMonthValue: resolveSalesSettingPrivateRoomCount(transientMetrics.previousMonthValue, allMetrics.previousMonthValue, groupMetrics.previousMonthValue)
        }
    };
}

async function loadSalesSettingBookingCurveReferenceData(
    analysisDate: string,
    batchDateKey: string,
    rmRoomGroupId?: string
): Promise<SalesSettingBookingCurveReferenceData | null> {
    const referenceSourcesByKind = new Map<ReferenceCurveKind, Promise<BookingCurveResponseSource[]>>();
    const getReferenceSources = (
        curveKind: ReferenceCurveKind,
        stayDates: string[],
        scope: CurveScope
    ): Promise<BookingCurveResponseSource[]> => {
        const cached = referenceSourcesByKind.get(curveKind);
        if (cached !== undefined) {
            return cached;
        }

        const request = loadSalesSettingReferenceCurveSources(stayDates, batchDateKey, scope, rmRoomGroupId);
        referenceSourcesByKind.set(curveKind, request);
        return request;
    };
    const [
        recentOverall,
        seasonalOverall,
        recentIndividual,
        seasonalIndividual,
        recentGroup,
        seasonalGroup
    ] = await Promise.all([
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "all", "recent_weighted_90", rmRoomGroupId, getReferenceSources),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "all", "seasonal_component", rmRoomGroupId, getReferenceSources),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "transient", "recent_weighted_90", rmRoomGroupId, getReferenceSources),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "transient", "seasonal_component", rmRoomGroupId, getReferenceSources),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "group", "recent_weighted_90", rmRoomGroupId, getReferenceSources),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "group", "seasonal_component", rmRoomGroupId, getReferenceSources)
    ]);

    if (
        recentOverall === null
        && seasonalOverall === null
        && recentIndividual === null
        && seasonalIndividual === null
        && recentGroup === null
        && seasonalGroup === null
    ) {
        return null;
    }

    return {
        recentOverall,
        seasonalOverall,
        recentIndividual,
        seasonalIndividual,
        recentGroup,
        seasonalGroup
    };
}

function getSalesSettingSameWeekdayStayDates(analysisDate: string): Array<{ offsetDays: number; stayDate: string }> {
    return [-14, -7, 7, 14].map((offsetDays) => ({
        offsetDays,
        stayDate: shiftDate(analysisDate, offsetDays)
    }));
}

async function loadSalesSettingSameWeekdayCurveData(
    analysisDate: string,
    batchDateKey: string,
    rmRoomGroupId?: string
): Promise<SalesSettingSameWeekdayCurveData[]> {
    if (!isSalesSettingBookingCurveSameWeekdayVisible()) {
        return [];
    }

    const results = await Promise.all(getSalesSettingSameWeekdayStayDates(analysisDate).map(async ({ offsetDays, stayDate }) => {
        return scheduleReferenceCurveRequest(
            `same-weekday:${batchDateKey}:${rmRoomGroupId ?? "-"}:${stayDate}`,
            () => getBookingCurve(stayDate, batchDateKey, rmRoomGroupId)
        )
            .then((bookingCurveData) => ({
                offsetDays,
                stayDate,
                bookingCurveData
            }))
            .catch((error: unknown) => {
                console.warn(`[${SCRIPT_NAME}] failed to load same-weekday booking curve`, {
                    analysisDate,
                    batchDateKey,
                    stayDate,
                    offsetDays,
                    rmRoomGroupId,
                    error
                });
                return null;
            });
    }));

    return results.filter((result): result is SalesSettingSameWeekdayCurveData => result !== null);
}

async function loadSalesSettingReferenceCurveResult(
    analysisDate: string,
    batchDateKey: string,
    segment: CurveSegment,
    curveKind: "recent_weighted_90" | "seasonal_component",
    rmRoomGroupId?: string,
    getReferenceSources?: (
        curveKind: ReferenceCurveKind,
        stayDates: string[],
        scope: CurveScope
    ) => Promise<BookingCurveResponseSource[]>
): Promise<ReferenceCurveResult | null> {
    const facilityId = await resolveCurrentFacilityCacheKey();
    const scope: CurveScope = rmRoomGroupId === undefined ? "hotel" : "roomGroup";
    const normalizedAnalysisDate = normalizeDateKey(analysisDate);
    const normalizedBatchDate = normalizeDateKey(batchDateKey);
    const weekday = normalizedAnalysisDate === null ? null : getUtcWeekday(normalizedAnalysisDate);
    if (normalizedAnalysisDate === null || normalizedBatchDate === null || weekday === null) {
        return null;
    }

    const targetMonth = normalizedAnalysisDate.slice(0, 7);
    const algorithmVersion = curveKind === "recent_weighted_90"
        ? RECENT_WEIGHTED_90_ALGORITHM_VERSION
        : SEASONAL_COMPONENT_ALGORITHM_VERSION;
    const cacheKey = buildReferenceCurveCacheKey({
        facilityId,
        scope,
        ...(rmRoomGroupId === undefined ? {} : { roomGroupId: rmRoomGroupId }),
        ...(curveKind === "recent_weighted_90"
            ? { targetStayDate: normalizedAnalysisDate }
            : { targetMonth, weekday }),
        asOfDate: normalizedBatchDate,
        segment,
        curveKind,
        algorithmVersion
    });

    return getOrComputeReferenceCurve({
        cacheKey,
        compute: async () => {
            const candidateStayDates = curveKind === "recent_weighted_90"
                ? getRecentWeighted90CandidateStayDates({
                    targetStayDate: normalizedAnalysisDate,
                    asOfDate: normalizedBatchDate,
                    ticks: SALES_SETTING_REFERENCE_CURVE_TICKS
                })
                : getSeasonalComponentCandidateStayDates({
                    targetMonth,
                    weekday
                });
            const sources = await (getReferenceSources === undefined
                ? loadSalesSettingReferenceCurveSources(candidateStayDates, batchDateKey, scope, rmRoomGroupId)
                : getReferenceSources(curveKind, candidateStayDates, scope));
            const input = buildCurveInputFromBookingCurveResponses({
                facilityId,
                asOfDate: normalizedBatchDate,
                sources,
                segments: [segment]
            });

            return curveKind === "recent_weighted_90"
                ? buildRecentWeighted90ReferenceCurve(input, {
                    scope,
                    ...(rmRoomGroupId === undefined ? {} : { roomGroupId: rmRoomGroupId }),
                    segment,
                    ticks: SALES_SETTING_REFERENCE_CURVE_TICKS,
                    targetStayDate: normalizedAnalysisDate,
                    asOfDate: normalizedBatchDate
                })
                : buildSeasonalComponentReferenceCurve(input, {
                    scope,
                    ...(rmRoomGroupId === undefined ? {} : { roomGroupId: rmRoomGroupId }),
                    segment,
                    ticks: SALES_SETTING_REFERENCE_CURVE_TICKS,
                    targetMonth,
                    weekday,
                    asOfDate: normalizedBatchDate
                });
        }
    }).catch((error: unknown) => {
        console.warn(`[${SCRIPT_NAME}] failed to load BCL-tuned reference curve`, {
            analysisDate,
            batchDateKey,
            rmRoomGroupId,
            segment,
            curveKind,
            error
        });
        return null;
    });
}

async function loadSalesSettingReferenceCurveSources(
    stayDates: string[],
    batchDateKey: string,
    scope: CurveScope,
    rmRoomGroupId?: string
): Promise<BookingCurveResponseSource[]> {
    const uniqueStayDates = Array.from(new Set(stayDates));
    const responses = await Promise.all(uniqueStayDates.map(async (stayDate) => {
        const compactStayDate = toCompactDateKey(stayDate);
        if (compactStayDate === null) {
            return null;
        }

        return scheduleReferenceCurveRequest(
            `${batchDateKey}:${scope}:${rmRoomGroupId ?? "-"}:${compactStayDate}`,
            () => getBookingCurve(compactStayDate, batchDateKey, rmRoomGroupId)
        ).catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to load reference curve source booking curve`, {
                stayDate,
                compactStayDate,
                batchDateKey,
                rmRoomGroupId,
                error
            });
            return null;
        });
    }));

    return responses
        .filter((response): response is BookingCurveResponse => response !== null)
        .map((response) => ({
            response,
            scope,
            ...(rmRoomGroupId === undefined ? {} : { roomGroupId: rmRoomGroupId })
        }));
}

async function loadSalesSettingBookingCurveMetrics(
    analysisDate: string,
    batchDateKey: string,
    comparisonDateKeys: SalesSettingComparisonDateKeys,
    rmRoomGroupId?: string,
    loadReferenceCurve = false,
    loadSameWeekdayCurve = false
): Promise<SalesSettingBookingCurveMetrics> {
    const bookingCurveData = await getBookingCurve(analysisDate, batchDateKey, rmRoomGroupId)
        .catch((error: unknown) => {
            console.error(`[${SCRIPT_NAME}] failed to load booking curve`, {
                analysisDate,
                batchDateKey,
                rmRoomGroupId,
                error
            });
            return null;
        });

    const [referenceCurveData, sameWeekdayCurveData] = await Promise.all([
        bookingCurveData === null || !loadReferenceCurve
            ? Promise.resolve(null)
            : loadSalesSettingBookingCurveReferenceData(analysisDate, batchDateKey, rmRoomGroupId),
        bookingCurveData === null || !loadSameWeekdayCurve
            ? Promise.resolve([])
            : loadSalesSettingSameWeekdayCurveData(analysisDate, batchDateKey, rmRoomGroupId)
    ]);

    return buildSalesSettingBookingCurveMetrics(bookingCurveData, referenceCurveData, sameWeekdayCurveData, comparisonDateKeys);
}

async function prepareSalesSettingSyncData(
    analysisDate: string,
    batchDateKey: string,
    syncContext: SyncContext
): Promise<SalesSettingPreparedData | null> {
    const cards = collectSalesSettingCards();
    if (cards.length === 0) {
        return null;
    }

    const comparisonDateKeys = getSalesSettingComparisonDateKeys(batchDateKey);
    const totalCapacity = sumSalesSettingRoomCapacities(cards);
    const capacityUpdate = populateCurrentUiSalesSettingCapacities(analysisDate, cards);
    const roomGroupsRequest = getRoomGroups()
        .catch((error: unknown) => {
            console.error(`[${SCRIPT_NAME}] failed to load room groups`, {
                error
            });
            return [] as RoomGroup[];
        });
    const hotelMetricsRequest = loadSalesSettingBookingCurveMetrics(
        analysisDate,
        batchDateKey,
        comparisonDateKeys,
        undefined,
        false,
        isSalesSettingBookingCurveSameWeekdayVisible()
    );
    const [roomGroups, hotelMetrics] = await Promise.all([
        roomGroupsRequest,
        hotelMetricsRequest
    ]);
    await capacityUpdate;
    if (isSyncContextStale(syncContext)) {
        return null;
    }

    const roomGroupIdByName = new Map(roomGroups.map((roomGroup) => [roomGroup.name, roomGroup.id]));
    const cardMetrics = await Promise.all(cards.map(async (card) => {
        const rmRoomGroupId = roomGroupIdByName.get(card.roomGroupName);
        if (rmRoomGroupId === undefined) {
            return {
                card,
                roomGroupName: card.roomGroupName,
                metrics: null
            };
        }

        return {
            card,
            roomGroupName: card.roomGroupName,
            rmRoomGroupId,
            metrics: await loadSalesSettingBookingCurveMetrics(
                analysisDate,
                batchDateKey,
                comparisonDateKeys,
                rmRoomGroupId,
                false,
                isSalesSettingBookingCurveSameWeekdayVisible() && isSalesSettingBookingCurveOpen(card.roomGroupName)
            )
        };
    }));
    if (isSyncContextStale(syncContext)) {
        return null;
    }

    const preparedData = {
        cards,
        totalCapacity,
        hotelMetrics,
        cardMetrics
    } satisfies SalesSettingPreparedData;

    latestSalesSettingPreparedSnapshot = {
        analysisDate,
        batchDateKey,
        preparedData
    };

    return preparedData;
}

function getRoomGroups(): Promise<RoomGroup[]> {
    if (roomGroupListPromise !== null) {
        return roomGroupListPromise;
    }

    const request = loadRoomGroups()
        .then((roomGroups) => roomGroups.slice().sort((left, right) => left.sequence - right.sequence))
        .catch((error: unknown) => {
            roomGroupListPromise = null;
            throw error;
        });

    roomGroupListPromise = request;
    return request;
}

function getSalesSettingCurrentSettings(analysisDate: string): Promise<SalesSettingCurrentSettingsResponse> {
    const monthKey = analysisDate.slice(0, 6);
    const cached = salesSettingCurrentSettingsPromiseCache.get(monthKey);
    if (cached !== undefined) {
        return cached;
    }

    const { fromDateKey, toDateKey } = getSalesSettingMonthDateRange(analysisDate);
    const request = loadSalesSettingCurrentSettings(fromDateKey, toDateKey)
        .catch((error: unknown) => {
            salesSettingCurrentSettingsPromiseCache.delete(monthKey);
            throw error;
        });

    salesSettingCurrentSettingsPromiseCache.set(monthKey, request);
    return request;
}

async function loadSalesSettingCurrentSettings(
    fromDateKey: string,
    toDateKey: string
): Promise<SalesSettingCurrentSettingsResponse> {
    const url = new URL(CURRENT_SETTINGS_ENDPOINT, window.location.origin);
    url.searchParams.set("from", fromDateKey);
    url.searchParams.set("to", toDateKey);

    const response = await fetch(url.toString(), {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new RevenueAssistantRequestError(CURRENT_SETTINGS_ENDPOINT, response.status);
    }

    return (await response.json()) as SalesSettingCurrentSettingsResponse;
}

async function populateCurrentUiSalesSettingCapacities(
    analysisDate: string,
    cards: SalesSettingCard[]
): Promise<void> {
    if (!cards.some((card) => card.cardElement.hasAttribute(SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE))) {
        return;
    }

    const capacityByRoomGroupName = await getSalesSettingCurrentSettings(analysisDate)
        .then(buildCurrentUiCapacityByRoomGroupName)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to load current-ui sales-setting capacities`, {
                analysisDate,
                error
            });
            return new Map<string, number>();
        });

    for (const card of cards) {
        if (!card.cardElement.hasAttribute(SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE)) {
            continue;
        }

        const maxValue = capacityByRoomGroupName.get(card.roomGroupName) ?? null;
        updateCurrentUiSalesSettingCapacity(card.roomCountSummaryElement, maxValue);
    }
}

function buildCurrentUiCapacityByRoomGroupName(
    response: SalesSettingCurrentSettingsResponse
): Map<string, number> {
    const capacityByRoomGroupName = new Map<string, number>();

    for (const currentSetting of response.suggest_output_current_settings ?? []) {
        for (const roomGroup of currentSetting.rm_room_groups ?? []) {
            const roomGroupName = roomGroup.rm_room_group_name?.trim() ?? "";
            const maxNumRoom = roomGroup.max_num_room;
            if (roomGroupName === "" || typeof maxNumRoom !== "number" || !Number.isFinite(maxNumRoom) || maxNumRoom <= 0) {
                continue;
            }

            capacityByRoomGroupName.set(
                roomGroupName,
                Math.max(capacityByRoomGroupName.get(roomGroupName) ?? 0, maxNumRoom)
            );
        }
    }

    return capacityByRoomGroupName;
}

function updateCurrentUiSalesSettingCapacity(element: HTMLElement | null, maxValue: number | null): void {
    if (!(element instanceof HTMLElement)) {
        return;
    }

    if (maxValue === null) {
        element.removeAttribute(SALES_SETTING_CURRENT_UI_CAPACITY_MAX_ATTRIBUTE);
        element.textContent = "";
        return;
    }

    element.setAttribute(SALES_SETTING_CURRENT_UI_CAPACITY_MAX_ATTRIBUTE, String(maxValue));
    element.textContent = `0 / ${formatGroupRoomNumber(maxValue)}`;
}

function getSalesSettingMonthDateRange(analysisDate: string): { fromDateKey: string; toDateKey: string } {
    const year = Number(analysisDate.slice(0, 4));
    const monthIndex = Number(analysisDate.slice(4, 6)) - 1;
    const lastDate = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

    return {
        fromDateKey: `${analysisDate.slice(0, 6)}01`,
        toDateKey: `${analysisDate.slice(0, 6)}${String(lastDate).padStart(2, "0")}`
    };
}

async function loadRoomGroups(): Promise<RoomGroup[]> {
    const response = await fetch(new URL(ROOM_GROUPS_ENDPOINT, window.location.origin).toString(), {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new Error(`room group request failed: ${response.status}`);
    }

    return (await response.json()) as RoomGroup[];
}

function prefetchSalesSettingGroupRooms(analysisDate: string, batchDateKey: string): void {
    if (!hasVisibleSalesSettingUi()) {
        return;
    }

    const prefetchKey = `${batchDateKey}:${analysisDate}`;
    if (salesSettingPrefetchKeys.has(prefetchKey)) {
        return;
    }

    salesSettingPrefetchKeys.add(prefetchKey);

    const { previousDay, previousWeek, previousMonth } = getRevenueAssistantComparisonDates(batchDateKey);
    void getRoomGroups()
        .then((roomGroups) => Promise.all([
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group"),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "group"),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "group"),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "group"),
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "transient"),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "transient"),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "transient"),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "transient"),
            ...roomGroups.flatMap((roomGroup) => [
                fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "group", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "group", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "group", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "transient", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "transient", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "transient", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "transient", roomGroup.id)
            ])
        ]))
        .catch((error: unknown) => {
            salesSettingPrefetchKeys.delete(prefetchKey);
            console.warn(`[${SCRIPT_NAME}] failed to prefetch sales-setting group rooms`, {
                analysisDate,
                batchDateKey,
                error
            });
        });
}

function getLincolnSuggestStatuses(analysisDate: string): Promise<LincolnSuggestStatus[]> {
    const cached = lincolnSuggestStatusCache.get(analysisDate);
    if (cached !== undefined) {
        return cached;
    }

    const request = loadLincolnSuggestStatuses(analysisDate)
        .catch((error: unknown) => {
            lincolnSuggestStatusCache.delete(analysisDate);
            throw error;
        });
    lincolnSuggestStatusCache.set(analysisDate, request);

    return request;
}

function getLincolnSuggestStatusesForRange(fromDateKey: string, toDateKey: string): Promise<LincolnSuggestStatus[]> {
    const cacheKey = `${fromDateKey}:${toDateKey}`;
    const cached = lincolnSuggestStatusRangeCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const request = loadLincolnSuggestStatusesForRange(fromDateKey, toDateKey)
        .catch((error: unknown) => {
            lincolnSuggestStatusRangeCache.delete(cacheKey);
            throw error;
        });
    lincolnSuggestStatusRangeCache.set(cacheKey, request);

    return request;
}

async function loadLincolnSuggestStatuses(analysisDate: string): Promise<LincolnSuggestStatus[]> {
    const statuses = await loadLincolnSuggestStatusesForRange(analysisDate, analysisDate);
    return statuses.filter((status) => status.date === analysisDate);
}

async function loadLincolnSuggestStatusesForRange(fromDateKey: string, toDateKey: string): Promise<LincolnSuggestStatus[]> {
    const url = new URL(LINCOLN_SUGGEST_STATUS_ENDPOINT, window.location.origin);
    url.searchParams.set("filter_type", "stay_date");
    url.searchParams.set("from", fromDateKey);
    url.searchParams.set("to", toDateKey);

    const response = await fetch(url.toString(), {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new RevenueAssistantRequestError(LINCOLN_SUGGEST_STATUS_ENDPOINT, response.status);
    }

    const payload = (await response.json()) as LincolnSuggestStatusResponse;
    return payload.suggest_statuses ?? [];
}

function getCurrentBatchDateKey(): string {
    const text = document.body?.innerText ?? "";
    const match = /最終データ更新[:：]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(text);

    if (match !== null) {
        const year = match[1];
        const month = match[2];
        const day = match[3];
        if (year !== undefined && month !== undefined && day !== undefined) {
            return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
        }
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}${month}${day}`;
}

function getLocalTodayDateKey(): string {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}${month}${day}`;
}

function syncCacheBatch(batchDateKey: string, facilityCacheKey: string): void {
    if (activeBatchDateKey === batchDateKey && activeFacilityCacheKey === facilityCacheKey) {
        return;
    }

    cleanupLegacyGroupRoomStorage();
    cleanupPersistedBookingCurveStorage(facilityCacheKey);

    activeBatchDateKey = batchDateKey;
    activeFacilityCacheKey = facilityCacheKey;
    clearPendingRankRecommendationDecisions();
    clearPendingRankRecommendationRankChanges();
    salesSettingPrefetchKeys.clear();
    groupRoomCache.clear();
    bookingCurveCache.clear();
    lincolnSuggestStatusCache.clear();
    lincolnSuggestStatusRangeCache.clear();
    latestSalesSettingPreparedSnapshot = null;
    latestSalesSettingRankStatusesSnapshot = null;
    resetPersistedGroupRoomCache(batchDateKey, facilityCacheKey);
}

function resetPersistedGroupRoomCache(batchDateKey: string, facilityCacheKey: string): void {
    try {
        const storageBatchKey = getGroupRoomStorageBatchKey(facilityCacheKey);
        const storagePrefix = getGroupRoomStorageFacilityPrefix(facilityCacheKey);
        const previousBatchDateKey = window.localStorage.getItem(storageBatchKey);
        if (previousBatchDateKey === batchDateKey) {
            return;
        }

        const keysToRemove: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (
                key !== null
                && key.startsWith(storagePrefix)
                && key !== storageBatchKey
                && key !== GROUP_ROOM_VISIBILITY_STORAGE_KEY
            ) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
        }

        window.localStorage.setItem(storageBatchKey, batchDateKey);
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to reset persistent group-room cache`, {
            batchDateKey,
            facilityCacheKey,
            error
        });
    }
}

function invalidateGroupRoomCaches(batchDateKey: string): void {
    salesSettingPrefetchKeys.clear();
    groupRoomCache.clear();
    bookingCurveCache.clear();

    const facilityCacheKey = activeFacilityCacheKey;
    if (facilityCacheKey === null) {
        return;
    }

    try {
        const storageBatchKey = getGroupRoomStorageBatchKey(facilityCacheKey);
        const storagePrefix = getGroupRoomStorageFacilityPrefix(facilityCacheKey);
        const keysToRemove: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (
                key !== null
                && key.startsWith(storagePrefix)
                && key !== storageBatchKey
                && key !== GROUP_ROOM_VISIBILITY_STORAGE_KEY
            ) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
        }

        window.localStorage.setItem(storageBatchKey, batchDateKey);
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to invalidate group-room cache`, {
            batchDateKey,
            facilityCacheKey,
            error
        });
    }
}

function getGroupRoomResultCacheKey(
    facilityCacheKey: string,
    batchDateKey: string,
    stayDate: string,
    lookupDate: string,
    countScope = "group",
    rmRoomGroupId?: string
): string {
    return `${facilityCacheKey}:${batchDateKey}:${getGroupRoomScopeKey(rmRoomGroupId)}:${countScope}:${stayDate}:${lookupDate}`;
}

function readPersistedGroupRoomCount(facilityCacheKey: string, cacheKey: string): number | null | undefined {
    try {
        const raw = window.localStorage.getItem(`${getGroupRoomResultStoragePrefix(facilityCacheKey)}${cacheKey}`);
        if (raw === null) {
            return undefined;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (parsed === null || typeof parsed === "number") {
            return parsed;
        }
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to read persistent group-room cache`, {
            cacheKey,
            error
        });
    }

    return undefined;
}

function writePersistedGroupRoomCount(facilityCacheKey: string, cacheKey: string, groupRoomCount: number | null): void {
    try {
        window.localStorage.setItem(`${getGroupRoomResultStoragePrefix(facilityCacheKey)}${cacheKey}`, JSON.stringify(groupRoomCount));
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to write persistent group-room cache`, {
            cacheKey,
            error
        });
    }
}

function cleanupPersistedBookingCurveStorage(facilityCacheKey: string): number {
    try {
        const storagePrefix = getBookingCurveStoragePrefix(facilityCacheKey);
        const keysToRemove: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (key !== null && key.startsWith(storagePrefix)) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
        }

        if (keysToRemove.length > 0) {
            console.info(`[${SCRIPT_NAME}] removed persistent booking-curve localStorage cache`, {
                facilityCacheKey,
                removedCount: keysToRemove.length
            });
        }

        return keysToRemove.length;
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to cleanup persistent booking-curve localStorage cache`, {
            facilityCacheKey,
            error
        });
    }

    return 0;
}

function cleanupLegacyGroupRoomStorage(): boolean {
    if (legacyGroupRoomStorageCleanupAttempted) {
        return false;
    }

    legacyGroupRoomStorageCleanupAttempted = true;

    try {
        const keysToRemove: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (key !== null && LEGACY_GROUP_ROOM_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
        }

        if (keysToRemove.length > 0) {
            console.info(`[${SCRIPT_NAME}] removed legacy group-room storage`, {
                removedCount: keysToRemove.length
            });
            return true;
        }
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to cleanup legacy group-room storage`, {
            error
        });
    }

    return false;
}

function getGroupRoomStorageFacilityPrefix(facilityCacheKey: string): string {
    return `${GROUP_ROOM_STORAGE_PREFIX}${facilityCacheKey}:`;
}

function getGroupRoomStorageBatchKey(facilityCacheKey: string): string {
    return `${getGroupRoomStorageFacilityPrefix(facilityCacheKey)}batch-date`;
}

function getBookingCurveStoragePrefix(facilityCacheKey: string): string {
    return `${getGroupRoomStorageFacilityPrefix(facilityCacheKey)}booking-curve:`;
}

function getGroupRoomResultStoragePrefix(facilityCacheKey: string): string {
    return `${getGroupRoomStorageFacilityPrefix(facilityCacheKey)}result:`;
}

async function resolveCurrentFacilityCacheKey(): Promise<string> {
    const facilityLabel = getCurrentFacilityLabel();
    if (resolvedFacilityCacheKey !== null && resolvedFacilityLabel === facilityLabel) {
        return resolvedFacilityCacheKey;
    }

    if (facilityCacheKeyPromise !== null) {
        return facilityCacheKeyPromise;
    }

    facilityCacheKeyPromise = loadCurrentFacilityCacheKey(facilityLabel)
        .then((facilityCacheKey) => {
            resolvedFacilityCacheKey = facilityCacheKey;
            resolvedFacilityLabel = facilityLabel;
            return facilityCacheKey;
        })
        .finally(() => {
            facilityCacheKeyPromise = null;
        });

    return facilityCacheKeyPromise;
}

async function loadCurrentFacilityCacheKey(facilityLabel: string | null): Promise<string> {
    try {
        const response = await fetch(new URL(YAD_INFO_ENDPOINT, window.location.origin).toString(), {
            credentials: "include",
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        });

        if (response.ok) {
            const data = (await response.json()) as YadInfoResponse;
            if (typeof data.yad_no === "string" && data.yad_no.length > 0) {
                return `yad:${data.yad_no}`;
            }

            if (typeof data.name === "string" && data.name.trim().length > 0) {
                return `name:${encodeURIComponent(data.name.trim())}`;
            }
        }
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to resolve facility cache key`, {
            error
        });
    }

    if (facilityLabel !== null && facilityLabel.length > 0) {
        return `name:${encodeURIComponent(facilityLabel)}`;
    }

    return "unknown";
}

function getCurrentFacilityLabel(): string | null {
    const selectors = [
        "header button span",
        "header button",
        "header h1",
        "header [role='button'] span",
        "header [role='button']"
    ];

    for (const selector of selectors) {
        const text = document.querySelector<HTMLElement>(selector)?.textContent?.trim();
        if (text !== undefined && text.length > 0) {
            return text;
        }
    }

    return null;
}

function isGroupRoomCalendarVisible(): boolean {
    try {
        return window.localStorage.getItem(GROUP_ROOM_VISIBILITY_STORAGE_KEY) !== "0";
    } catch {
        return true;
    }
}

function setGroupRoomCalendarVisible(visible: boolean): void {
    try {
        window.localStorage.setItem(GROUP_ROOM_VISIBILITY_STORAGE_KEY, visible ? "1" : "0");
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to persist group-room visibility`, {
            visible,
            error
        });
    }
}

function ensureGroupRoomToggle(hasCalendar: boolean): void {
    const existingToggle = document.querySelector<HTMLElement>(`[${GROUP_ROOM_TOGGLE_ATTRIBUTE}]`);
    if (!hasCalendar) {
        existingToggle?.remove();
        return;
    }

    const segmentedControl = document.querySelector<HTMLElement>(`[data-testid="segmented-control"]`);
    const toolbarElement = segmentedControl?.parentElement?.parentElement ?? null;
    if (segmentedControl === null || toolbarElement === null) {
        existingToggle?.remove();
        return;
    }

    const hostElement = resolveGroupRoomToggleHostElement(segmentedControl, toolbarElement);
    if (hostElement === null) {
        existingToggle?.remove();
        return;
    }

    if (window.getComputedStyle(hostElement).position === "static") {
        hostElement.style.position = "relative";
    }

    const toggleElement = existingToggle ?? document.createElement("div");
    toggleElement.setAttribute(GROUP_ROOM_TOGGLE_ATTRIBUTE, "");

    const buttonElement = (existingToggle?.querySelector<HTMLElement>(`[${GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE}]`) ?? document.createElement("button")) as HTMLButtonElement;
    buttonElement.type = "button";
    updateGroupRoomToggleButton(buttonElement, isGroupRoomCalendarVisible());

    if (buttonElement.parentElement !== toggleElement || toggleElement.childElementCount !== 1) {
        toggleElement.replaceChildren(buttonElement);
    }

    if (toggleElement.parentElement !== hostElement) {
        toggleElement.remove();
    }

    if (toggleElement.parentElement !== hostElement) {
        hostElement.append(toggleElement);
    }
}

function updateGroupRoomToggleButton(buttonElement: HTMLButtonElement, visible: boolean): void {
    if (!buttonElement.hasAttribute(GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE)) {
        buttonElement.setAttribute(GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE, "");
    }

    const nextActive = visible ? "true" : "false";
    if (buttonElement.getAttribute(GROUP_ROOM_TOGGLE_ACTIVE_ATTRIBUTE) !== nextActive) {
        buttonElement.setAttribute(GROUP_ROOM_TOGGLE_ACTIVE_ATTRIBUTE, nextActive);
    }

    const nextLabel = visible ? "団体数 表示中" : "団体数 非表示";
    if (buttonElement.textContent !== nextLabel) {
        buttonElement.textContent = nextLabel;
    }
}

function getSalesSettingBookingCurveToggleKey(roomGroupName: string): string {
    return `room:${roomGroupName}`;
}

function isSalesSettingBookingCurveOpen(roomGroupName: string): boolean {
    return salesSettingBookingCurveOpenState.get(getSalesSettingBookingCurveToggleKey(roomGroupName)) ?? false;
}

function setSalesSettingBookingCurveOpen(toggleKey: string, open: boolean): void {
    salesSettingBookingCurveOpenState.set(toggleKey, open);
}

function parseSalesSettingBookingCurveReferenceKind(value: string | null): SalesSettingBookingCurveReferenceKind | null {
    return value === "recent" || value === "seasonal" ? value : null;
}

function isSalesSettingBookingCurveSameWeekdayVisible(): boolean {
    return salesSettingBookingCurveSameWeekdayVisible;
}

function setSalesSettingBookingCurveSameWeekdayVisible(visible: boolean): void {
    salesSettingBookingCurveSameWeekdayVisible = visible;
}

function parseSalesSettingBookingCurveSecondarySegment(value: string | null): SalesSettingBookingCurveSecondarySegment | null {
    return value === "individual" || value === "group" ? value : null;
}

function getSalesSettingBookingCurveSecondarySegment(): SalesSettingBookingCurveSecondarySegment {
    return salesSettingBookingCurveSecondarySegment;
}

function setSalesSettingBookingCurveSecondarySegment(segment: SalesSettingBookingCurveSecondarySegment): void {
    salesSettingBookingCurveSecondarySegment = segment;
}

function isSalesSettingBookingCurveReferenceVisible(kind: SalesSettingBookingCurveReferenceKind): boolean {
    return salesSettingBookingCurveReferenceVisibilityState.get(kind) ?? true;
}

function setSalesSettingBookingCurveReferenceVisible(kind: SalesSettingBookingCurveReferenceKind, visible: boolean): void {
    salesSettingBookingCurveReferenceVisibilityState.set(kind, visible);
}

function getSalesSettingBookingCurveReferenceVisibilitySignature(): string {
    return [
        `recent:${isSalesSettingBookingCurveReferenceVisible("recent") ? "1" : "0"}`,
        `seasonal:${isSalesSettingBookingCurveReferenceVisible("seasonal") ? "1" : "0"}`
    ].join("|");
}

function updateSalesSettingBookingCurveToggleButton(buttonElement: HTMLButtonElement, roomGroupName: string, open: boolean): void {
    buttonElement.type = "button";
    buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE, "");
    buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_KEY_ATTRIBUTE, getSalesSettingBookingCurveToggleKey(roomGroupName));
    buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_ACTIVE_ATTRIBUTE, open ? "true" : "false");

    const nextLabel = open ? "ブッキングカーブを閉じる" : "ブッキングカーブを開く";
    if (buttonElement.textContent !== nextLabel) {
        buttonElement.textContent = nextLabel;
    }
}

function getSalesSettingBookingCurveLabel(tick: SalesSettingBookingCurveTick): string {
    return tick === "ACT" ? "ACT" : String(tick);
}

function getSalesSettingBookingCurveSecondarySegmentLabel(segment: SalesSettingBookingCurveSecondarySegment): string {
    return segment === "individual" ? "個人" : "団体";
}

function resolveSalesSettingBookingCurveSecondaryCurrentRoomCount(
    currentIndividualRoomCount: number | null,
    currentGroupRoomCount: number | null,
    segment: SalesSettingBookingCurveSecondarySegment = getSalesSettingBookingCurveSecondarySegment()
): number | null {
    return segment === "individual" ? currentIndividualRoomCount : currentGroupRoomCount;
}

function getSalesSettingBookingCurveCurrentStroke(variant: SalesSettingBookingCurvePanelVariant): string {
    if (variant === "overall") {
        return "#1f5fbf";
    }

    return variant === "individual" ? "#2f8f5b" : "#8b6f2a";
}

function getSalesSettingBookingCurveReferenceLabel(kind: SalesSettingBookingCurveReferenceKind): string {
    return kind === "recent" ? "直近型" : "季節型";
}

function getSalesSettingBookingCurveReferenceStroke(kind: SalesSettingBookingCurveReferenceKind): string {
    return kind === "recent" ? "#b7791f" : "#c2415d";
}

function getSalesSettingBookingCurveReferenceDasharray(kind: SalesSettingBookingCurveReferenceKind): string {
    return kind === "recent" ? "8 5" : "2 6";
}

function formatSalesSettingSameWeekdayCurveLabel(result: SalesSettingSameWeekdayCurveData): string {
    return `${result.stayDate.slice(0, 4)}-${result.stayDate.slice(4, 6)}-${result.stayDate.slice(6, 8)}`;
}

function getSalesSettingSameWeekdayCurveStroke(offsetDays: number): string {
    if (offsetDays === -7) {
        return "#475569";
    }

    if (offsetDays === -14) {
        return "#64748b";
    }

    if (offsetDays === 7) {
        return "#5f7f61";
    }

    return "#7c8f7a";
}

function getSalesSettingSameWeekdayCurveOpacity(offsetDays: number): number {
    return Math.abs(offsetDays) === 7 ? 0.66 : 0.54;
}

function getSalesSettingBookingCurveDrawableSeries(
    panelData: SalesSettingBookingCurvePanelData,
    variant: SalesSettingBookingCurvePanelVariant
): SalesSettingBookingCurveDrawableSeries[] {
    const drawableSeries: SalesSettingBookingCurveDrawableSeries[] = [];

    if (isSalesSettingBookingCurveSameWeekdayVisible()) {
        for (const helper of panelData.sameWeekday) {
            drawableSeries.push({
                kind: helper.kind,
                label: helper.label,
                series: helper.series,
                stroke: getSalesSettingSameWeekdayCurveStroke(helper.offsetDays),
                strokeWidth: 1.5,
                strokeDasharray: null,
                opacity: getSalesSettingSameWeekdayCurveOpacity(helper.offsetDays)
            });
        }
    }

    drawableSeries.push({
        kind: "current",
        label: "現在",
        series: panelData.current,
        stroke: getSalesSettingBookingCurveCurrentStroke(variant),
        strokeWidth: 3,
        strokeDasharray: null
    });

    for (const kind of ["recent", "seasonal"] as const) {
        const series = kind === "recent" ? panelData.recent : panelData.seasonal;
        if (series === null || !isSalesSettingBookingCurveReferenceVisible(kind)) {
            continue;
        }

        drawableSeries.push({
            kind,
            label: getSalesSettingBookingCurveReferenceLabel(kind),
            series,
            stroke: getSalesSettingBookingCurveReferenceStroke(kind),
            strokeWidth: 2.4,
            strokeDasharray: getSalesSettingBookingCurveReferenceDasharray(kind)
        });
    }

    return drawableSeries;
}

function formatSalesSettingBookingCurveTooltipPointLabel(tick: SalesSettingBookingCurveTick): string {
    return tick === "ACT" ? "ACT時点" : `${tick}日前時点`;
}

function formatSalesSettingBookingCurveDaysBeforeStayLabel(daysBeforeStay: number | null): string {
    if (daysBeforeStay === null) {
        return "時点不明";
    }

    return daysBeforeStay === 0 ? "0日前時点" : `${daysBeforeStay}日前時点`;
}

function resolveSalesSettingBookingCurveVisibleAxisLabels(samples: SalesSettingBookingCurveSample[]): boolean[] {
    return samples.map((sample) => SALES_SETTING_BOOKING_CURVE_VISIBLE_AXIS_TICKS.has(sample.tick));
}

function getSalesSettingBookingCurveAxisTextAnchor(tick: SalesSettingBookingCurveTick): "start" | "middle" | "end" {
    if (tick === "ACT") {
        return "end";
    }

    if (tick === 360 || tick === 270) {
        return "start";
    }

    return "middle";
}

function getSalesSettingBookingCurveRoundedMaxValue(maxValue: number): number {
    const intervalCount = 4;
    return Math.max(intervalCount, Math.ceil(Math.max(1, maxValue) / intervalCount) * intervalCount);
}

function getSalesSettingBookingCurveYAxisRatios(): number[] {
    return [0, 0.25, 0.5, 0.75, 1];
}

function formatSalesSettingBookingCurveOccupancyRate(rate: number): string {
    const roundedRate = Math.round(rate * 10) / 10;
    const label = Number.isInteger(roundedRate) ? String(roundedRate) : roundedRate.toFixed(1);
    return `${label}%`;
}

function formatSalesSettingBookingCurveRankMarkerTitle(daysBeforeStay: number): string {
    return `ランク変更 ${daysBeforeStay}日前`;
}

function formatSalesSettingBookingCurveMarkerDateLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function buildSalesSettingBookingCurveLinePath(samples: SalesSettingBookingCurveSample[]): string {
    let path = "";
    let hasOpenSegment = false;

    for (const sample of samples) {
        if (sample.value === null || sample.y === null) {
            hasOpenSegment = false;
            continue;
        }

        path += `${hasOpenSegment ? " L" : `${path === "" ? "" : " "}M`}${sample.x.toFixed(2)},${sample.y.toFixed(2)}`;
        hasOpenSegment = true;
    }

    return path;
}

function buildSalesSettingBookingCurveAreaPath(samples: SalesSettingBookingCurveSample[], baselineY: number): string {
    const segments: SalesSettingBookingCurveSample[][] = [];
    let activeSegment: SalesSettingBookingCurveSample[] = [];

    for (const sample of samples) {
        if (sample.value === null || sample.y === null) {
            if (activeSegment.length > 0) {
                segments.push(activeSegment);
                activeSegment = [];
            }
            continue;
        }

        activeSegment.push(sample);
    }

    if (activeSegment.length > 0) {
        segments.push(activeSegment);
    }

    const segmentPaths: string[] = [];
    for (const segment of segments) {
        const firstSample = segment[0];
        const lastSample = segment[segment.length - 1];
        if (firstSample === undefined || lastSample === undefined) {
            continue;
        }

        const linePath = segment
            .map((sample, index) => `${index === 0 ? "M" : "L"}${sample.x.toFixed(2)},${sample.y?.toFixed(2) ?? baselineY.toFixed(2)}`)
            .join(" ");
        segmentPaths.push(`${linePath} L${lastSample.x.toFixed(2)},${baselineY.toFixed(2)} L${firstSample.x.toFixed(2)},${baselineY.toFixed(2)} Z`);
    }
    return segmentPaths.join(" ");
}

function buildSalesSettingBookingCurveSamples(
    maxValue: number,
    series: SalesSettingBookingCurveSeries,
    plotWidth: number,
    plotHeight: number,
    paddingLeft: number,
    paddingTop: number
): SalesSettingBookingCurveSample[] {
    const safeMaxValue = Math.max(1, maxValue);

    return series.values.map((value, index) => {
        const x = paddingLeft + ((plotWidth * index) / Math.max(1, series.values.length - 1));
        const normalizedValue = typeof value === "number"
            ? Math.max(0, Math.min(safeMaxValue, value))
            : null;
        const y = normalizedValue === null
            ? null
            : paddingTop + ((1 - (normalizedValue / safeMaxValue)) * plotHeight);
        const occupancyRate = normalizedValue === null ? null : (normalizedValue / safeMaxValue) * 100;

        return {
            tick: SALES_SETTING_BOOKING_CURVE_TICKS[index] ?? "ACT",
            daysBeforeStay: typeof (SALES_SETTING_BOOKING_CURVE_TICKS[index] ?? "ACT") === "number"
                ? SALES_SETTING_BOOKING_CURVE_TICKS[index] as number
                : null,
            value: normalizedValue,
            occupancyRate,
            x,
            y
        };
    });
}

function buildSalesSettingBookingCurveTooltipReferenceValues(
    drawableSeries: SalesSettingBookingCurveDrawableSeries[],
    index: number
): SalesSettingBookingCurveTooltipReferenceValue[] {
    const referenceValues: SalesSettingBookingCurveTooltipReferenceValue[] = [];
    for (const series of drawableSeries) {
        if (series.kind === "current") {
            continue;
        }
        referenceValues.push({
            label: series.label,
            value: series.series.values[index] ?? null,
            interpolated: series.series.interpolated?.[index] === true
        });
    }
    return referenceValues;
}

function resolveSalesSettingBookingCurveMarkerX(
    daysBeforeStay: number,
    samples: SalesSettingBookingCurveSample[]
): number | null {
    const numericSamples = samples.filter((sample): sample is SalesSettingBookingCurveSample & { tick: number } => sample.tick !== "ACT");
    const firstSample = numericSamples[0];
    const lastSample = numericSamples[numericSamples.length - 1];
    if (firstSample === undefined || lastSample === undefined) {
        return null;
    }

    if (daysBeforeStay > firstSample.tick || daysBeforeStay < lastSample.tick) {
        return null;
    }

    for (let index = 0; index < numericSamples.length; index += 1) {
        const sample = numericSamples[index];
        if (sample !== undefined && sample.tick === daysBeforeStay) {
            return sample.x;
        }
    }

    for (let index = 0; index < numericSamples.length - 1; index += 1) {
        const leftSample = numericSamples[index];
        const rightSample = numericSamples[index + 1];
        if (leftSample === undefined || rightSample === undefined) {
            continue;
        }

        if (leftSample.tick > daysBeforeStay && daysBeforeStay > rightSample.tick) {
            const ratio = (leftSample.tick - daysBeforeStay) / (leftSample.tick - rightSample.tick);
            return leftSample.x + ((rightSample.x - leftSample.x) * ratio);
        }
    }

    return null;
}

function buildSalesSettingBookingCurveRenderedMarkers(
    markers: SalesSettingBookingCurveMarker[],
    samples: SalesSettingBookingCurveSample[],
    maxValue: number,
    paddingTop: number,
    plotHeight: number
): Array<SalesSettingBookingCurveMarker & { x: number; y: number }> {
    const safeMaxValue = Math.max(1, maxValue);
    const renderedMarkers: Array<SalesSettingBookingCurveMarker & { x: number; y: number }> = [];

    for (const marker of markers) {
        const x = resolveSalesSettingBookingCurveMarkerX(marker.daysBeforeStay, samples);
        if (x === null || marker.value === null) {
            continue;
        }

        const normalizedValue = Math.max(0, Math.min(safeMaxValue, marker.value));
        const y = paddingTop + ((1 - (normalizedValue / safeMaxValue)) * plotHeight);
        renderedMarkers.push({
            ...marker,
            x,
            y
        });
    }

    return renderedMarkers;
}

function createSalesSettingBookingCurveTooltip(): HTMLDivElement {
    const tooltipElement = document.createElement("div");
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ATTRIBUTE, "");
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "false");

    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_TITLE_ATTRIBUTE, "");

    const valueElement = document.createElement("div");
    valueElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_VALUE_ATTRIBUTE, "");

    const metaElement = document.createElement("div");
    metaElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_META_ATTRIBUTE, "");

    const detailElement = document.createElement("div");
    detailElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_ATTRIBUTE, "");

    tooltipElement.replaceChildren(titleElement, valueElement, metaElement, detailElement);
    return tooltipElement;
}

function showSalesSettingBookingCurveTooltip(
    tooltipElement: HTMLElement,
    guideLineElement: SVGLineElement,
    pointElement: SVGCircleElement,
    sample: SalesSettingBookingCurveSample,
    referenceValues: SalesSettingBookingCurveTooltipReferenceValue[],
    marker: (SalesSettingBookingCurveMarker & { x: number; y: number }) | null,
    width: number,
    height: number,
    paddingBottom: number,
    capacityValue: number
): void {
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "true");
    tooltipElement.style.left = `${Math.max(48, Math.min(width - 48, sample.x))}px`;

    const titleElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_TITLE_ATTRIBUTE}]`);
    const valueElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_VALUE_ATTRIBUTE}]`);
    const metaElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_META_ATTRIBUTE}]`);
    const detailElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_ATTRIBUTE}]`);
    if (titleElement !== null) {
        titleElement.textContent = formatSalesSettingBookingCurveTooltipPointLabel(sample.tick);
    }
    if (valueElement !== null) {
        valueElement.textContent = sample.value === null ? "データなし" : `${formatGroupRoomNumber(sample.value)}室`;
    }
    if (metaElement !== null) {
        metaElement.textContent = sample.occupancyRate === null
            ? `上限 ${formatGroupRoomNumber(capacityValue)}室`
            : `稼働率 ${formatSalesSettingBookingCurveOccupancyRate(sample.occupancyRate)} / 上限 ${formatGroupRoomNumber(capacityValue)}室`;
    }
    if (detailElement !== null) {
        renderSalesSettingBookingCurveTooltipDetail(detailElement, marker, referenceValues);
    }

    if (sample.y === null) {
        guideLineElement.setAttribute("visibility", "hidden");
        pointElement.setAttribute("visibility", "hidden");
        return;
    }

    guideLineElement.setAttribute("visibility", "visible");
    guideLineElement.setAttribute("x1", sample.x.toFixed(2));
    guideLineElement.setAttribute("x2", sample.x.toFixed(2));
    guideLineElement.setAttribute("y1", "10");
    guideLineElement.setAttribute("y2", String(height - paddingBottom));

    pointElement.setAttribute("visibility", "visible");
    pointElement.setAttribute("cx", sample.x.toFixed(2));
    pointElement.setAttribute("cy", sample.y.toFixed(2));
}

function hideSalesSettingBookingCurveTooltip(
    tooltipElement: HTMLElement,
    guideLineElement: SVGLineElement,
    pointElement: SVGCircleElement
): void {
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "false");
    guideLineElement.setAttribute("visibility", "hidden");
    pointElement.setAttribute("visibility", "hidden");
}

function showSalesSettingBookingCurveRankMarkerTooltip(
    tooltipElement: HTMLElement,
    guideLineElement: SVGLineElement,
    pointElement: SVGCircleElement,
    marker: SalesSettingBookingCurveMarker & { x: number; y: number },
    width: number,
    height: number,
    paddingBottom: number,
    maxValue: number
): void {
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "true");
    tooltipElement.style.left = `${Math.max(48, Math.min(width - 48, marker.x))}px`;

    const titleElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_TITLE_ATTRIBUTE}]`);
    const valueElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_VALUE_ATTRIBUTE}]`);
    const metaElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_META_ATTRIBUTE}]`);
    const detailElement = tooltipElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_ATTRIBUTE}]`);
    if (titleElement !== null) {
        titleElement.textContent = formatSalesSettingBookingCurveDaysBeforeStayLabel(marker.daysBeforeStay);
    }
    if (valueElement !== null) {
        valueElement.textContent = marker.value === null ? "データなし" : `${formatGroupRoomNumber(marker.value)}室`;
    }
    if (metaElement !== null) {
        const occupancyRate = marker.value === null ? null : (marker.value / Math.max(1, maxValue)) * 100;
        metaElement.textContent = occupancyRate === null
            ? `上限 ${formatGroupRoomNumber(maxValue)}室`
            : `稼働率 ${formatSalesSettingBookingCurveOccupancyRate(occupancyRate)} / 上限 ${formatGroupRoomNumber(maxValue)}室`;
    }
    if (detailElement !== null) {
        renderSalesSettingBookingCurveTooltipDetail(detailElement, marker);
    }

    guideLineElement.setAttribute("visibility", "visible");
    guideLineElement.setAttribute("x1", marker.x.toFixed(2));
    guideLineElement.setAttribute("x2", marker.x.toFixed(2));
    guideLineElement.setAttribute("y1", "10");
    guideLineElement.setAttribute("y2", String(height - paddingBottom));

    pointElement.setAttribute("visibility", "visible");
    pointElement.setAttribute("cx", marker.x.toFixed(2));
    pointElement.setAttribute("cy", marker.y.toFixed(2));
}

function createSalesSettingBookingCurveSvg(
    tooltipElement: HTMLElement,
    maxValue: number,
    panelData: SalesSettingBookingCurvePanelData,
    markers: SalesSettingBookingCurveMarker[],
    variant: SalesSettingBookingCurvePanelVariant
): SVGSVGElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svgElement = document.createElementNS(svgNamespace, "svg");
    svgElement.setAttribute(SALES_SETTING_BOOKING_CURVE_PANEL_SVG_ATTRIBUTE, "");
    svgElement.setAttribute("viewBox", "0 0 420 164");
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute(
        "aria-label",
        variant === "overall"
            ? "全体ブッキングカーブ表示イメージ"
            : `${getSalesSettingBookingCurveSecondarySegmentLabel(variant)}ブッキングカーブ表示イメージ`
    );

    const width = 420;
    const height = 164;
    const paddingLeft = 38;
    const paddingRight = 10;
    const paddingTop = 14;
    const paddingBottom = 28;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const roundedMaxValue = getSalesSettingBookingCurveRoundedMaxValue(maxValue);
    const safeMaxValue = Math.max(1, roundedMaxValue);
    const drawableSeries = getSalesSettingBookingCurveDrawableSeries(panelData, variant);
    const samples = buildSalesSettingBookingCurveSamples(
        safeMaxValue,
        panelData.current,
        plotWidth,
        plotHeight,
        paddingLeft,
        paddingTop
    );
    const visibleAxisLabels = resolveSalesSettingBookingCurveVisibleAxisLabels(samples);
    const baselineY = height - paddingBottom;
    const renderedMarkers = buildSalesSettingBookingCurveRenderedMarkers(markers, samples, safeMaxValue, paddingTop, plotHeight);

    for (const ratio of getSalesSettingBookingCurveYAxisRatios()) {
        const y = paddingTop + ((1 - ratio) * plotHeight);
        const lineElement = document.createElementNS(svgNamespace, "line");
        lineElement.setAttribute(SALES_SETTING_BOOKING_CURVE_Y_AXIS_LINE_ATTRIBUTE, "");
        lineElement.setAttribute("x1", String(paddingLeft));
        lineElement.setAttribute("x2", String(width - paddingRight));
        lineElement.setAttribute("y1", y.toFixed(2));
        lineElement.setAttribute("y2", y.toFixed(2));
        lineElement.setAttribute("stroke", ratio === 0 ? "#cfd8e7" : "#e7edf7");
        lineElement.setAttribute("stroke-width", "1");
        svgElement.append(lineElement);

        const labelElement = document.createElementNS(svgNamespace, "text");
        labelElement.setAttribute(SALES_SETTING_BOOKING_CURVE_Y_AXIS_LABEL_ATTRIBUTE, "");
        labelElement.setAttribute("x", String(paddingLeft - 6));
        labelElement.setAttribute("y", String(y + 3));
        labelElement.setAttribute("text-anchor", "end");
        labelElement.textContent = formatGroupRoomNumber(Math.round(safeMaxValue * ratio));
        svgElement.append(labelElement);
    }

    const capacityRatio = Math.max(0, Math.min(1, maxValue / safeMaxValue));
    const capacityY = paddingTop + ((1 - capacityRatio) * plotHeight);
    const capacityLineElement = document.createElementNS(svgNamespace, "line");
    capacityLineElement.setAttribute("x1", String(paddingLeft));
    capacityLineElement.setAttribute("x2", String(width - paddingRight));
    capacityLineElement.setAttribute("y1", capacityY.toFixed(2));
    capacityLineElement.setAttribute("y2", capacityY.toFixed(2));
    capacityLineElement.setAttribute("stroke", "#8fa4c1");
    capacityLineElement.setAttribute("stroke-width", "1");
    capacityLineElement.setAttribute("stroke-dasharray", "3 3");
    svgElement.append(capacityLineElement);

    const areaPath = buildSalesSettingBookingCurveAreaPath(samples, baselineY);
    if (areaPath !== "") {
        const areaElement = document.createElementNS(svgNamespace, "path");
        areaElement.setAttribute("d", areaPath);
        areaElement.setAttribute("fill", variant === "overall" ? "rgba(31, 95, 191, 0.08)" : "rgba(67, 160, 71, 0.10)");
        svgElement.append(areaElement);
    }

    for (const drawable of drawableSeries) {
        const drawableSamples = drawable.kind === "current"
            ? samples
            : buildSalesSettingBookingCurveSamples(
                safeMaxValue,
                drawable.series,
                plotWidth,
                plotHeight,
                paddingLeft,
                paddingTop
            );
        const linePath = buildSalesSettingBookingCurveLinePath(drawableSamples);
        if (linePath === "") {
            continue;
        }

        const pathElement = document.createElementNS(svgNamespace, "path");
        pathElement.setAttribute("d", linePath);
        pathElement.setAttribute("fill", "none");
        pathElement.setAttribute("stroke", drawable.stroke);
        pathElement.setAttribute("stroke-width", String(drawable.strokeWidth));
        pathElement.setAttribute("stroke-linejoin", "round");
        pathElement.setAttribute("stroke-linecap", "round");
        if (drawable.opacity !== undefined) {
            pathElement.setAttribute("opacity", String(drawable.opacity));
        }
        if (drawable.strokeDasharray !== null) {
            pathElement.setAttribute("stroke-dasharray", drawable.strokeDasharray);
        }
        svgElement.append(pathElement);
    }

    const guideLineElement = document.createElementNS(svgNamespace, "line");
    guideLineElement.setAttribute(SALES_SETTING_BOOKING_CURVE_ACTIVE_GUIDE_ATTRIBUTE, "");
    guideLineElement.setAttribute("visibility", "hidden");
    svgElement.append(guideLineElement);

    const pointElement = document.createElementNS(svgNamespace, "circle");
    pointElement.setAttribute(SALES_SETTING_BOOKING_CURVE_ACTIVE_POINT_ATTRIBUTE, "");
    pointElement.setAttribute("r", "4.5");
    pointElement.setAttribute("stroke", getSalesSettingBookingCurveCurrentStroke(variant));
    pointElement.setAttribute("visibility", "hidden");
    svgElement.append(pointElement);

    samples.forEach((sample, index) => {
        const tick = sample.tick;
        const showAxisLabel = visibleAxisLabels[index] ?? false;

        const tickLineElement = document.createElementNS(svgNamespace, "line");
        tickLineElement.setAttribute("x1", sample.x.toFixed(2));
        tickLineElement.setAttribute("x2", sample.x.toFixed(2));
        tickLineElement.setAttribute("y1", String(height - paddingBottom));
        tickLineElement.setAttribute("y2", String((height - paddingBottom) + (showAxisLabel ? 6 : 4)));
        tickLineElement.setAttribute("stroke", "#9fb0c8");
        tickLineElement.setAttribute("stroke-width", "1");
        svgElement.append(tickLineElement);

        if (showAxisLabel) {
            const labelElement = document.createElementNS(svgNamespace, "text");
            labelElement.setAttribute(SALES_SETTING_BOOKING_CURVE_AXIS_LABEL_ATTRIBUTE, "");
            labelElement.setAttribute(SALES_SETTING_BOOKING_CURVE_AXIS_LABEL_VISIBLE_ATTRIBUTE, "true");
            labelElement.setAttribute("x", sample.x.toFixed(2));
            labelElement.setAttribute("y", String(height - 6));
            labelElement.setAttribute("text-anchor", getSalesSettingBookingCurveAxisTextAnchor(tick));
            labelElement.textContent = getSalesSettingBookingCurveLabel(tick);
            svgElement.append(labelElement);
        }

        const previousSample = index > 0 ? samples[index - 1] : undefined;
        const nextSample = index < samples.length - 1 ? samples[index + 1] : undefined;
        const leftEdge = previousSample === undefined ? paddingLeft : (previousSample.x + sample.x) / 2;
        const rightEdge = nextSample === undefined ? width - paddingRight : (sample.x + nextSample.x) / 2;
        const hitboxElement = document.createElementNS(svgNamespace, "rect");
        hitboxElement.setAttribute(SALES_SETTING_BOOKING_CURVE_HITBOX_ATTRIBUTE, "");
        hitboxElement.setAttribute("x", leftEdge.toFixed(2));
        hitboxElement.setAttribute("y", String(paddingTop));
        hitboxElement.setAttribute("width", Math.max(1, rightEdge - leftEdge).toFixed(2));
        hitboxElement.setAttribute("height", String(plotHeight));
        hitboxElement.setAttribute("tabindex", "0");
        hitboxElement.setAttribute("role", "button");
        hitboxElement.setAttribute("aria-label", sample.value === null
            ? `${getSalesSettingBookingCurveLabel(tick)}時点 データなし`
            : `${getSalesSettingBookingCurveLabel(tick)}時点 ${formatGroupRoomNumber(sample.value)}室`);
        const activeMarker = findSalesSettingBookingCurveMarkerInRange(renderedMarkers, leftEdge, rightEdge, sample.x);
        const referenceValues = buildSalesSettingBookingCurveTooltipReferenceValues(drawableSeries, index);
        hitboxElement.addEventListener("mouseenter", () => {
            showSalesSettingBookingCurveTooltip(
                tooltipElement,
                guideLineElement,
                pointElement,
                sample,
                referenceValues,
                activeMarker,
                width,
                height,
                paddingBottom,
                maxValue
            );
        });
        hitboxElement.addEventListener("focus", () => {
            showSalesSettingBookingCurveTooltip(
                tooltipElement,
                guideLineElement,
                pointElement,
                sample,
                referenceValues,
                activeMarker,
                width,
                height,
                paddingBottom,
                maxValue
            );
        });
        hitboxElement.addEventListener("mouseleave", () => {
            hideSalesSettingBookingCurveTooltip(tooltipElement, guideLineElement, pointElement);
        });
        hitboxElement.addEventListener("blur", () => {
            hideSalesSettingBookingCurveTooltip(tooltipElement, guideLineElement, pointElement);
        });
        svgElement.append(hitboxElement);
    });

    for (const marker of renderedMarkers) {
        const markerElement = document.createElementNS(svgNamespace, "circle");
        markerElement.setAttribute(SALES_SETTING_BOOKING_CURVE_MARKER_POINT_ATTRIBUTE, "");
        markerElement.setAttribute("cx", marker.x.toFixed(2));
        markerElement.setAttribute("cy", marker.y.toFixed(2));
        markerElement.setAttribute("r", "3.5");
        markerElement.setAttribute("fill", getSalesSettingBookingCurveCurrentStroke(variant));
        markerElement.setAttribute("stroke", "#ffffff");
        markerElement.setAttribute("stroke-width", "1.5");
        svgElement.append(markerElement);

        const markerHitboxElement = document.createElementNS(svgNamespace, "circle");
        markerHitboxElement.setAttribute(SALES_SETTING_BOOKING_CURVE_MARKER_HITBOX_ATTRIBUTE, "");
        markerHitboxElement.setAttribute("cx", marker.x.toFixed(2));
        markerHitboxElement.setAttribute("cy", marker.y.toFixed(2));
        markerHitboxElement.setAttribute("r", "8");
        markerHitboxElement.setAttribute("tabindex", "0");
        markerHitboxElement.setAttribute("role", "button");
        markerHitboxElement.setAttribute(
            "aria-label",
            `${formatSalesSettingBookingCurveRankMarkerTitle(marker.daysBeforeStay)} ランク ${formatSalesSettingRankTransition(marker.beforeRankName, marker.afterRankName)}`
        );
        markerHitboxElement.addEventListener("mouseenter", () => {
            showSalesSettingBookingCurveRankMarkerTooltip(
                tooltipElement,
                guideLineElement,
                pointElement,
                marker,
                width,
                height,
                paddingBottom,
                maxValue
            );
        });
        markerHitboxElement.addEventListener("focus", () => {
            showSalesSettingBookingCurveRankMarkerTooltip(
                tooltipElement,
                guideLineElement,
                pointElement,
                marker,
                width,
                height,
                paddingBottom,
                maxValue
            );
        });
        markerHitboxElement.addEventListener("mouseleave", () => {
            hideSalesSettingBookingCurveTooltip(tooltipElement, guideLineElement, pointElement);
        });
        markerHitboxElement.addEventListener("blur", () => {
            hideSalesSettingBookingCurveTooltip(tooltipElement, guideLineElement, pointElement);
        });
        svgElement.append(markerHitboxElement);
    }

    return svgElement;
}

function findSalesSettingBookingCurveMarkerInRange(
    renderedMarkers: Array<SalesSettingBookingCurveMarker & { x: number; y: number }>,
    leftEdge: number,
    rightEdge: number,
    targetX: number
): (SalesSettingBookingCurveMarker & { x: number; y: number }) | null {
    let matchedMarker: (SalesSettingBookingCurveMarker & { x: number; y: number }) | null = null;
    let smallestDistance = Number.POSITIVE_INFINITY;

    for (const marker of renderedMarkers) {
        if (marker.x < leftEdge || marker.x > rightEdge) {
            continue;
        }

        const distance = Math.abs(marker.x - targetX);
        if (distance <= smallestDistance) {
            matchedMarker = marker;
            smallestDistance = distance;
        }
    }

    return matchedMarker;
}

function renderSalesSettingBookingCurveTooltipDetail(
    detailElement: HTMLElement,
    marker: (SalesSettingBookingCurveMarker & { x: number; y: number }) | null,
    referenceValues: SalesSettingBookingCurveTooltipReferenceValue[] = []
): void {
    const children: Array<Node> = [];

    for (const referenceValue of referenceValues) {
        const lineElement = document.createElement("div");
        const valueText = referenceValue.value === null ? "-" : `${formatGroupRoomNumber(referenceValue.value)}室`;
        const interpolationText = referenceValue.interpolated ? "（補間）" : "";
        lineElement.textContent = `${referenceValue.label} ${valueText}${interpolationText}`;
        children.push(lineElement);
    }

    if (marker === null) {
        detailElement.replaceChildren(...children);
        return;
    }

    const emphasisElement = document.createElement("span");
    emphasisElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_EMPHASIS_ATTRIBUTE, "");
    emphasisElement.textContent = `ランク ${formatSalesSettingRankTransition(marker.beforeRankName, marker.afterRankName)}`;

    const tailParts = [
        formatSalesSettingBookingCurveMarkerDateLabel(marker.reflectedAt),
        marker.reflectorName
    ].filter((part): part is string => part !== null && part !== "");
    const tailText = tailParts.length === 0 ? "" : ` / ${tailParts.join(" / ")}`;

    const markerElement = document.createElement("div");
    markerElement.replaceChildren(emphasisElement, document.createTextNode(tailText));
    detailElement.replaceChildren(...children, markerElement);
}

function createSalesSettingBookingCurvePanel(
    title: string,
    maxValue: number,
    currentValue: number | null,
    panelData: SalesSettingBookingCurvePanelData,
    markers: SalesSettingBookingCurveMarker[],
    variant: SalesSettingBookingCurvePanelVariant
): HTMLDivElement {
    const panelElement = document.createElement("div");
    panelElement.setAttribute(SALES_SETTING_BOOKING_CURVE_PANEL_ATTRIBUTE, "");

    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_BOOKING_CURVE_PANEL_TITLE_ATTRIBUTE, "");
    titleElement.textContent = title;

    const metricElement = document.createElement("div");
    metricElement.setAttribute(SALES_SETTING_BOOKING_CURVE_PANEL_METRIC_ATTRIBUTE, "");
    metricElement.textContent = `室数 ${formatCompactMetricValue(currentValue)} / ${formatGroupRoomNumber(maxValue)}`;

    const canvasElement = document.createElement("div");
    canvasElement.setAttribute(SALES_SETTING_BOOKING_CURVE_CANVAS_ATTRIBUTE, "");

    const tooltipElement = createSalesSettingBookingCurveTooltip();
    const svgElement = createSalesSettingBookingCurveSvg(tooltipElement, maxValue, panelData, markers, variant);
    const guideLineElement = svgElement.querySelector<SVGLineElement>(`[${SALES_SETTING_BOOKING_CURVE_ACTIVE_GUIDE_ATTRIBUTE}]`);
    const pointElement = svgElement.querySelector<SVGCircleElement>(`[${SALES_SETTING_BOOKING_CURVE_ACTIVE_POINT_ATTRIBUTE}]`);

    if (guideLineElement !== null && pointElement !== null) {
        const hideTooltip = () => {
            hideSalesSettingBookingCurveTooltip(tooltipElement, guideLineElement, pointElement);
        };

        canvasElement.addEventListener("mouseleave", hideTooltip);
        canvasElement.addEventListener("focusout", (event) => {
            const nextFocusedElement = event.relatedTarget;
            if (nextFocusedElement instanceof Node && canvasElement.contains(nextFocusedElement)) {
                return;
            }
            hideTooltip();
        });
    }

    canvasElement.replaceChildren(tooltipElement, svgElement);

    panelElement.replaceChildren(
        titleElement,
        metricElement,
        canvasElement
    );

    return panelElement;
}

function createSalesSettingBookingCurveReferenceToggleGroup(): HTMLDivElement {
    const groupElement = document.createElement("div");
    groupElement.setAttribute(SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_GROUP_ATTRIBUTE, "");

    for (const kind of ["recent", "seasonal"] as const) {
        const buttonElement = document.createElement("button");
        buttonElement.type = "button";
        buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_ATTRIBUTE, "");
        buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_REFERENCE_KIND_ATTRIBUTE, kind);
        buttonElement.setAttribute(
            SALES_SETTING_BOOKING_CURVE_REFERENCE_ACTIVE_ATTRIBUTE,
            isSalesSettingBookingCurveReferenceVisible(kind) ? "true" : "false"
        );
        buttonElement.textContent = getSalesSettingBookingCurveReferenceLabel(kind);
        groupElement.append(buttonElement);
    }

    return groupElement;
}

function createSalesSettingBookingCurveHelperToggleGroup(): HTMLDivElement {
    const groupElement = document.createElement("div");
    groupElement.setAttribute(SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_GROUP_ATTRIBUTE, "");

    const buttonElement = document.createElement("button");
    buttonElement.type = "button";
    buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_ATTRIBUTE, "");
    buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_HELPER_KIND_ATTRIBUTE, "sameWeekday");
    buttonElement.setAttribute(
        SALES_SETTING_BOOKING_CURVE_HELPER_ACTIVE_ATTRIBUTE,
        isSalesSettingBookingCurveSameWeekdayVisible() ? "true" : "false"
    );
    buttonElement.textContent = "同曜日";
    groupElement.append(buttonElement);

    return groupElement;
}

function createSalesSettingBookingCurveSegmentToggleGroup(): HTMLDivElement {
    const groupElement = document.createElement("div");
    groupElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_GROUP_ATTRIBUTE, "");

    const currentSegment = getSalesSettingBookingCurveSecondarySegment();
    for (const segment of ["individual", "group"] as const) {
        const buttonElement = document.createElement("button");
        buttonElement.type = "button";
        buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_ATTRIBUTE, "");
        buttonElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SEGMENT_ATTRIBUTE, segment);
        buttonElement.setAttribute(
            SALES_SETTING_BOOKING_CURVE_SEGMENT_ACTIVE_ATTRIBUTE,
            segment === currentSegment ? "true" : "false"
        );
        buttonElement.textContent = getSalesSettingBookingCurveSecondarySegmentLabel(segment);
        groupElement.append(buttonElement);
    }

    return groupElement;
}

function createSalesSettingBookingCurveLegend(curveData: SalesSettingBookingCurveRenderData): HTMLDivElement {
    const legendElement = document.createElement("div");
    legendElement.setAttribute(SALES_SETTING_BOOKING_CURVE_LEGEND_ATTRIBUTE, "");

    const items: Array<{ label: string; stroke: string; dasharray: string | null; visible: boolean }> = [{
        label: "現在",
        stroke: "#1f5fbf",
        dasharray: null,
        visible: true
    }];

    for (const kind of ["recent", "seasonal"] as const) {
        const hasSeries = curveData.overall[kind] !== null || curveData.secondary[kind] !== null;
        if (!hasSeries) {
            continue;
        }

        items.push({
            label: getSalesSettingBookingCurveReferenceLabel(kind),
            stroke: getSalesSettingBookingCurveReferenceStroke(kind),
            dasharray: getSalesSettingBookingCurveReferenceDasharray(kind),
            visible: isSalesSettingBookingCurveReferenceVisible(kind)
        });
    }

    if (
        isSalesSettingBookingCurveSameWeekdayVisible()
        && (curveData.overall.sameWeekday.length > 0 || curveData.secondary.sameWeekday.length > 0)
    ) {
        items.push({
            label: "同曜日",
            stroke: "#64748b",
            dasharray: null,
            visible: true
        });
    }

    for (const item of items) {
        const itemElement = document.createElement("span");
        itemElement.setAttribute(SALES_SETTING_BOOKING_CURVE_LEGEND_ITEM_ATTRIBUTE, "");
        itemElement.setAttribute("aria-disabled", item.visible ? "false" : "true");

        const swatchElement = document.createElement("span");
        if (item.dasharray !== null) {
            swatchElement.style.cssText = [
                "background-color: transparent",
                `background-image: repeating-linear-gradient(90deg, ${item.stroke} 0 6px, transparent 6px 10px)`
            ].join("; ");
        } else {
            swatchElement.style.backgroundColor = item.stroke;
        }

        itemElement.replaceChildren(swatchElement, document.createTextNode(item.label));
        legendElement.append(itemElement);
    }

    return legendElement;
}

function createSalesSettingBookingCurveSection(
    kind: "overall" | "card",
    titleLabel: string,
    maxValue: number,
    currentOverallRoomCount: number | null,
    currentSecondaryRoomCount: number | null,
    curveData: SalesSettingBookingCurveRenderData
): HTMLElement {
    const sectionElement = document.createElement("section");
    sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE, "");
    sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE, kind);

    const headerElement = document.createElement("div");
    headerElement.setAttribute(SALES_SETTING_BOOKING_CURVE_HEADER_ATTRIBUTE, "");

    const titleElement = document.createElement("span");
    titleElement.textContent = `ブッキングカーブ（${titleLabel}）`;

    const noteElement = document.createElement("span");
    noteElement.setAttribute(SALES_SETTING_BOOKING_CURVE_NOTE_ATTRIBUTE, "");
    noteElement.textContent = "booking_curve実データ + 参考線";

    headerElement.replaceChildren(
        titleElement,
        noteElement,
        createSalesSettingBookingCurveSegmentToggleGroup(),
        createSalesSettingBookingCurveHelperToggleGroup(),
        createSalesSettingBookingCurveReferenceToggleGroup()
    );

    const legendElement = createSalesSettingBookingCurveLegend(curveData);

    const gridElement = document.createElement("div");
    gridElement.setAttribute(SALES_SETTING_BOOKING_CURVE_GRID_ATTRIBUTE, "");
    gridElement.replaceChildren(
        createSalesSettingBookingCurvePanel("全体", maxValue, currentOverallRoomCount, curveData.overall, curveData.overallRankMarkers, "overall"),
        createSalesSettingBookingCurvePanel(
            getSalesSettingBookingCurveSecondarySegmentLabel(curveData.secondarySegment),
            maxValue,
            currentSecondaryRoomCount,
            curveData.secondary,
            curveData.secondaryRankMarkers,
            curveData.secondarySegment
        )
    );

    sectionElement.replaceChildren(headerElement, legendElement, gridElement);
    return sectionElement;
}

function renderSalesSettingOverallBookingCurve(
    containerElement: HTMLElement,
    totalCapacity: SalesSettingRoomCapacity | null,
    currentRoomValue: number | null,
    currentSecondaryRoomCount: number | null,
    curveData: SalesSettingBookingCurveRenderData | null
): void {
    const existingSection = containerElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE}="overall"]`);
    if (totalCapacity === null || curveData === null) {
        existingSection?.remove();
        return;
    }

    const signature = [
        "overall",
        totalCapacity.maxValue,
        currentRoomValue,
        curveData.secondarySegment,
        currentSecondaryRoomCount,
        curveData.overall.signature,
        curveData.secondary.signature,
        curveData.rankSignature
    ].join(":");
    const sectionElement = existingSection ?? document.createElement("section");
    if (existingSection?.getAttribute(SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE) !== signature) {
        const nextSection = createSalesSettingBookingCurveSection(
            "overall",
            "全体",
            totalCapacity.maxValue,
            currentRoomValue,
            currentSecondaryRoomCount,
            curveData
        );
        sectionElement.replaceChildren(...Array.from(nextSection.childNodes));
        sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE, "");
        sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE, "overall");
        sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE, signature);
    }

    if (sectionElement.parentElement !== containerElement) {
        containerElement.append(sectionElement);
    }
}

function clearSalesSettingBookingCurveCard(card: SalesSettingCard): void {
    card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE}]`)?.remove();
    card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE}="card"]`)?.remove();
}

function renderSalesSettingBookingCurveCard(
    card: SalesSettingCard,
    currentOverallRoomCount: number | null,
    currentSecondaryRoomCount: number | null,
    curveData: SalesSettingBookingCurveRenderData | null
): void {
    const capacity = resolveSalesSettingBookingCurveCapacity(card.roomCountSummaryElement);
    if (capacity === null || curveData === null) {
        clearSalesSettingBookingCurveCard(card);
        return;
    }

    const isOpen = isSalesSettingBookingCurveOpen(card.roomGroupName);
    const existingToggleRow = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE}]`);
    const toggleRowElement = existingToggleRow ?? document.createElement("div");
    toggleRowElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE, "");

    const toggleButtonElement = (toggleRowElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE}]`) ?? document.createElement("button")) as HTMLButtonElement;
    updateSalesSettingBookingCurveToggleButton(toggleButtonElement, card.roomGroupName, isOpen);
    if (toggleButtonElement.parentElement !== toggleRowElement || toggleRowElement.childElementCount !== 1) {
        toggleRowElement.replaceChildren(toggleButtonElement);
    }

    const insertionAnchor = card.detailWrapperElement;
    if (toggleRowElement.parentElement !== card.cardElement) {
        if (insertionAnchor !== null) {
            card.cardElement.insertBefore(toggleRowElement, insertionAnchor);
        } else {
            card.cardElement.append(toggleRowElement);
        }
    }

    const existingSection = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE}="card"]`);
    if (!isOpen) {
        existingSection?.remove();
        return;
    }

    const signature = [
        "card",
        card.roomGroupName,
        capacity.maxValue,
        currentOverallRoomCount,
        curveData.secondarySegment,
        currentSecondaryRoomCount,
        curveData.overall.signature,
        curveData.secondary.signature,
        curveData.rankSignature
    ].join(":");
    const sectionElement = existingSection ?? document.createElement("section");
    if (existingSection?.getAttribute(SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE) !== signature) {
        const nextSection = createSalesSettingBookingCurveSection(
            "card",
            card.roomGroupName,
            capacity.maxValue,
            currentOverallRoomCount,
            currentSecondaryRoomCount,
            curveData
        );
        sectionElement.replaceChildren(...Array.from(nextSection.childNodes));
        sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE, "");
        sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE, "card");
        sectionElement.setAttribute(SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE, signature);
    }

    if (sectionElement.parentElement !== card.cardElement) {
        if (insertionAnchor !== null) {
            card.cardElement.insertBefore(sectionElement, insertionAnchor);
        } else {
            card.cardElement.append(sectionElement);
        }
    }
}

function clearSalesSettingGroupRoom(card: SalesSettingCard): void {
    card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`)?.remove();
    clearSalesSettingBookingCurveCard(card);
}

function cleanupSalesSettingOverallSummary(): void {
    document.querySelector<HTMLElement>(`[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`)?.remove();
}

function cleanupSalesSettingRankOverview(): void {
    document.querySelector<HTMLElement>(`[${SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE}]`)?.remove();
}

function cleanupCompetitorPriceOverview(): void {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_ATTRIBUTE}]`))) {
        element.remove();
    }
}

function cleanupPriceTrendOverview(): void {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_PRICE_TREND_OVERVIEW_ATTRIBUTE}]`))) {
        element.remove();
    }
}

function cleanupSalesSettingRankDetails(): void {
    for (const detailElement of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_RANK_DETAIL_ATTRIBUTE}]`))) {
        detailElement.remove();
    }
}

function getInconsistentSalesSettingGroupNames(
    metrics: Array<{ roomGroupName: string; currentValue: number | null }>,
    overallCurrentValue: number | null
): string[] {
    if (overallCurrentValue === null) {
        return [];
    }

    const inconsistentNames: string[] = [];
    for (const metric of metrics) {
        if (metric.currentValue !== null && metric.currentValue > overallCurrentValue) {
            inconsistentNames.push(metric.roomGroupName);
        }
    }
    return inconsistentNames;
}

function renderSalesSettingOverallSummary(
    firstCard: SalesSettingCard,
    totalCapacity: SalesSettingRoomCapacity | null,
    currentRoomValue: number | null,
    previousDayRoomValue: number | null,
    previousWeekRoomValue: number | null,
    previousMonthRoomValue: number | null,
    currentIndividualRoomCount: number | null,
    previousDayIndividualRoomCount: number | null,
    previousWeekIndividualRoomCount: number | null,
    previousMonthIndividualRoomCount: number | null,
    currentGroupRoomCount: number | null,
    previousDayGroupRoomCount: number | null,
    previousWeekGroupRoomCount: number | null,
    previousMonthGroupRoomCount: number | null,
    showGroupMetrics = true,
    curveData: SalesSettingBookingCurveRenderData | null = null
): void {
    const sectionContainer = resolveSalesSettingSectionContainer(firstCard);
    const insertionAnchor = resolveSalesSettingSectionInsertionAnchor(firstCard);
    if (sectionContainer === null) {
        return;
    }

    const existingContainer = findDirectChildByAttribute(sectionContainer, SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE);
    const containerElement = existingContainer ?? document.createElement("section");
    const signature = [
        totalCapacity === null ? "sales:-" : `sales:${totalCapacity.currentValue}/${totalCapacity.maxValue}`,
        `room:${currentRoomValue}:${previousDayRoomValue}:${previousWeekRoomValue}:${previousMonthRoomValue}`,
        showGroupMetrics
            ? `individual:${currentIndividualRoomCount}:${previousDayIndividualRoomCount}:${previousWeekIndividualRoomCount}:${previousMonthIndividualRoomCount}`
            : "individual:hidden",
        showGroupMetrics
            ? `group:${currentGroupRoomCount}:${previousDayGroupRoomCount}:${previousWeekGroupRoomCount}:${previousMonthGroupRoomCount}`
            : "group:hidden"
    ].join("|");

    if (existingContainer?.getAttribute(SALES_SETTING_OVERALL_SUMMARY_SIGNATURE_ATTRIBUTE) !== signature) {
        containerElement.setAttribute(SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE, "");
        containerElement.setAttribute(SALES_SETTING_OVERALL_SUMMARY_SIGNATURE_ATTRIBUTE, signature);

        const titleElement = document.createElement("span");
        titleElement.setAttribute(SALES_SETTING_OVERALL_TITLE_ATTRIBUTE, "");
        titleElement.textContent = "全体";

        const salesRowElement = document.createElement("div");
        salesRowElement.setAttribute(SALES_SETTING_OVERALL_SALES_ROW_ATTRIBUTE, "");
        if (totalCapacity === null) {
            salesRowElement.replaceChildren(titleElement);
        } else {
            const metricElement = document.createElement("span");
            metricElement.setAttribute(SALES_SETTING_OVERALL_METRIC_ATTRIBUTE, "");
            metricElement.textContent = `販売室数 : ${formatSalesSettingCapacity(totalCapacity)}`;
            salesRowElement.replaceChildren(titleElement, metricElement);
        }

        const tableElement = document.createElement("table");
        tableElement.setAttribute(SALES_SETTING_OVERALL_TABLE_ATTRIBUTE, "");

        const headElement = document.createElement("thead");
        const headerRowElement = document.createElement("tr");
        for (const label of ["区分", "室数", "1日前", "7日前", "30日前"]) {
            const headerCellElement = document.createElement("th");
            headerCellElement.scope = "col";
            headerCellElement.textContent = label;
            headerRowElement.append(headerCellElement);
        }
        headElement.append(headerRowElement);

        const bodyElement = document.createElement("tbody");
        bodyElement.append(createSalesSettingOverallSummaryRow(
            "全体",
            formatCompactMetricValue(currentRoomValue),
            formatCompactMetricDelta(currentRoomValue, previousDayRoomValue),
            formatCompactMetricDelta(currentRoomValue, previousWeekRoomValue),
            formatCompactMetricDelta(currentRoomValue, previousMonthRoomValue),
            getMetricDeltaTone(currentRoomValue, previousDayRoomValue),
            getMetricDeltaTone(currentRoomValue, previousWeekRoomValue),
            getMetricDeltaTone(currentRoomValue, previousMonthRoomValue),
            true
        ));

        if (showGroupMetrics) {
            bodyElement.append(
                createSalesSettingOverallSummaryRow(
                    "個人",
                    formatCompactMetricValue(currentIndividualRoomCount),
                    formatCompactMetricDelta(currentIndividualRoomCount, previousDayIndividualRoomCount),
                    formatCompactMetricDelta(currentIndividualRoomCount, previousWeekIndividualRoomCount),
                    formatCompactMetricDelta(currentIndividualRoomCount, previousMonthIndividualRoomCount),
                    getGroupRoomDeltaTone(currentIndividualRoomCount, previousDayIndividualRoomCount),
                    getGroupRoomDeltaTone(currentIndividualRoomCount, previousWeekIndividualRoomCount),
                    getGroupRoomDeltaTone(currentIndividualRoomCount, previousMonthIndividualRoomCount)
                ),
                createSalesSettingOverallSummaryRow(
                    "団体",
                    formatCompactMetricValue(currentGroupRoomCount),
                    formatCompactMetricDelta(currentGroupRoomCount, previousDayGroupRoomCount),
                    formatCompactMetricDelta(currentGroupRoomCount, previousWeekGroupRoomCount),
                    formatCompactMetricDelta(currentGroupRoomCount, previousMonthGroupRoomCount),
                    getGroupRoomDeltaTone(currentGroupRoomCount, previousDayGroupRoomCount),
                    getGroupRoomDeltaTone(currentGroupRoomCount, previousWeekGroupRoomCount),
                    getGroupRoomDeltaTone(currentGroupRoomCount, previousMonthGroupRoomCount)
                )
            );
        }

        tableElement.replaceChildren(headElement, bodyElement);
        containerElement.replaceChildren(salesRowElement, tableElement);
    }

    if (insertionAnchor === null) {
        if (containerElement.parentElement !== sectionContainer || sectionContainer.lastElementChild !== containerElement) {
            sectionContainer.append(containerElement);
        }
    } else if (containerElement.nextElementSibling !== insertionAnchor) {
        sectionContainer.insertBefore(containerElement, insertionAnchor);
    }

    renderSalesSettingOverallBookingCurve(
        containerElement,
        totalCapacity,
        currentRoomValue,
        resolveSalesSettingBookingCurveSecondaryCurrentRoomCount(currentIndividualRoomCount, currentGroupRoomCount),
        curveData
    );
}

function renderSalesSettingRankOverview(firstCard: SalesSettingCard, summaries: SalesSettingRankSummary[]): void {
    const sectionContainer = resolveSalesSettingSectionContainer(firstCard);
    const insertionAnchor = resolveSalesSettingSectionInsertionAnchor(firstCard);
    if (sectionContainer === null) {
        return;
    }

    const existingContainer = findDirectChildByAttribute(sectionContainer, SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE);
    if (summaries.length === 0) {
        existingContainer?.remove();
        return;
    }

    const orderedSummaries = summaries.slice().sort(compareSalesSettingRankSummaries);
    const signature = orderedSummaries
        .map((summary) => `${summary.roomGroupName}:${summary.latestReflectionAt}:${summary.beforeRankName}:${summary.afterRankName}:${summary.roomDelta}`)
        .join("|");
    const containerElement = existingContainer ?? document.createElement("section");

    if (existingContainer?.getAttribute(SALES_SETTING_RANK_OVERVIEW_SIGNATURE_ATTRIBUTE) !== signature) {
        containerElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE, "");
        containerElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_SIGNATURE_ATTRIBUTE, signature);

        const titleElement = document.createElement("div");
        titleElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_TITLE_ATTRIBUTE, "");
        titleElement.textContent = "ランク変更履歴";

        const tableElement = document.createElement("table");
        tableElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE, "");

        const headElement = document.createElement("thead");
        const headerRowElement = document.createElement("tr");
        for (const label of ["部屋タイプ", "最終変更", "ランク", "増減"]) {
            const headerCellElement = document.createElement("th");
            headerCellElement.scope = "col";
            headerCellElement.textContent = label;
            if (label === "増減") {
                headerCellElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_DELTA_ATTRIBUTE, "");
            }
            headerRowElement.append(headerCellElement);
        }
        headElement.append(headerRowElement);

        const bodyElement = document.createElement("tbody");
        for (const summary of orderedSummaries) {
            const rowElement = document.createElement("tr");
            rowElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_ROW_ATTRIBUTE, "");
            rowElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, getSalesSettingRankTone());

            const roomElement = document.createElement("td");
            roomElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_ROOM_ATTRIBUTE, "");
            roomElement.textContent = summary.roomGroupName;

            const metaElement = document.createElement("td");
            metaElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_META_ATTRIBUTE, "");
            metaElement.textContent = formatSalesSettingDaysAgo(summary.latestReflectionDaysAgo);

            const valueElement = document.createElement("td");
            valueElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_VALUE_ATTRIBUTE, "");
            valueElement.textContent = formatSalesSettingRankTransition(summary.beforeRankName, summary.afterRankName);

            const deltaElement = document.createElement("td");
            deltaElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_DELTA_ATTRIBUTE, "");
            deltaElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, getMetricDeltaTone(summary.roomDelta, 0));
            deltaElement.textContent = formatCompactMetricDelta(summary.roomDelta, 0);

            rowElement.replaceChildren(roomElement, metaElement, valueElement, deltaElement);
            bodyElement.append(rowElement);
        }

        tableElement.replaceChildren(headElement, bodyElement);

        containerElement.replaceChildren(
            titleElement,
            tableElement
        );
    }

    const overallSummaryElement = findDirectChildByAttribute(sectionContainer, SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE);
    const rankInsertionAnchor = overallSummaryElement ?? insertionAnchor;
    if (rankInsertionAnchor === null) {
        if (containerElement.parentElement !== sectionContainer || sectionContainer.lastElementChild !== containerElement) {
            sectionContainer.append(containerElement);
        }
    } else if (containerElement !== rankInsertionAnchor) {
        sectionContainer.insertBefore(containerElement, rankInsertionAnchor);
    }
}

function renderCompetitorPriceOverviewFromState(): void {
    const latestRecord = competitorPriceSnapshotUiState.latestRecord;
    const target = resolveCompetitorPriceTabSectionTarget();
    if (latestRecord === null || target === null) {
        cleanupCompetitorPriceOverview();
        return;
    }

    renderCompetitorPriceOverviewAtTarget(
        target.sectionContainer,
        target.insertionAnchor,
        competitorPriceSnapshotUiState.records.length === 0
            ? [latestRecord]
            : competitorPriceSnapshotUiState.records,
        latestRecord
    );
}

function renderCompetitorPriceOverviewAtTarget(
    sectionContainer: HTMLElement,
    insertionAnchor: HTMLElement | null,
    records: CompetitorPriceSnapshotRecord[],
    latestRecord: CompetitorPriceSnapshotRecord
): void {
    const filters = buildCompetitorPriceFilterOptions(records);
    const roomTypeFilter = filters.roomTypes.includes(competitorPriceRoomTypeFilter ?? "")
        ? competitorPriceRoomTypeFilter
        : null;
    const mealTypeFilter = filters.mealTypes.includes(competitorPriceMealTypeFilter ?? "")
        ? competitorPriceMealTypeFilter
        : null;
    competitorPriceRoomTypeFilter = roomTypeFilter;
    competitorPriceMealTypeFilter = mealTypeFilter;

    const dailyRecords = buildLatestCompetitorPriceRecordsByFetchDate(records, roomTypeFilter);
    const chartSeries = buildCompetitorPriceGuestChartSeries(dailyRecords, roomTypeFilter, mealTypeFilter);
    const signature = [
        COMPETITOR_PRICE_OVERVIEW_UI_VERSION,
        records.map((record) => record.snapshotKey).join("|"),
        roomTypeFilter ?? "room:any",
        mealTypeFilter ?? "meal:any"
    ].join("::");
    const existingContainer = findDirectChildByAttribute(sectionContainer, SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_ATTRIBUTE);
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_ATTRIBUTE}]`))) {
        if (element !== existingContainer) {
            element.remove();
        }
    }
    const containerElement = existingContainer ?? document.createElement("section");

    if (existingContainer?.getAttribute(SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_SIGNATURE_ATTRIBUTE) !== signature) {
        containerElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_ATTRIBUTE, "");
        containerElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_SIGNATURE_ATTRIBUTE, signature);

        const titleElement = document.createElement("div");
        titleElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_TITLE_ATTRIBUTE, "");
        titleElement.textContent = "競合価格 最安値推移";

        const metaElement = document.createElement("div");
        metaElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_META_ATTRIBUTE, "");
        metaElement.textContent = [
            `対象宿泊日 ${formatCompactDateForDisplay(latestRecord.stayDate)}`,
            `取得日 ${dailyRecords.length}日`,
            `最終取得 ${formatDateTimeForDisplay(latestRecord.fetchedAt)}`,
            `同日複数取得は最新 snapshot`,
            `条件 ${shortenConditionSignature(latestRecord.conditionSignature)}`
        ].join(" / ");

        const controlsElement = createCompetitorPriceFilterControls(filters, roomTypeFilter, mealTypeFilter);
        const legendElement = createCompetitorPriceLegend(chartSeries.facilities);
        const chartGridElement = document.createElement("div");
        chartGridElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_GRID_ATTRIBUTE, "");
        for (const guestCount of COMPETITOR_PRICE_GUEST_COUNTS) {
            chartGridElement.append(createCompetitorPriceChartPanel(guestCount, chartSeries));
        }

        containerElement.replaceChildren(titleElement, metaElement, controlsElement, legendElement, chartGridElement);
    }

    if (insertionAnchor === null) {
        if (containerElement.parentElement !== sectionContainer || sectionContainer.lastElementChild !== containerElement) {
            sectionContainer.append(containerElement);
        }
    } else if (containerElement.nextElementSibling !== insertionAnchor) {
        sectionContainer.insertBefore(containerElement, insertionAnchor);
    }
}

function renderPriceTrendOverviewFromState(): void {
    const target = resolvePriceTrendTabSectionTarget();
    if (target === null) {
        cleanupPriceTrendOverview();
        return;
    }

    applyPriceTrendBackgroundFixtureIfNeeded();

    if (priceTrendUiState.records.length === 0 && priceTrendUiState.status === "idle") {
        cleanupPriceTrendOverview();
        return;
    }

    renderPriceTrendOverviewAtTarget(target, priceTrendUiState);
}

function applyPriceTrendBackgroundFixtureIfNeeded(): void {
    const fixtureMode = resolvePriceTrendBackgroundFixtureMode();
    if (fixtureMode === null) {
        return;
    }

    const fixtureStayDate = activeAnalyzeDate ?? priceTrendUiState.stayDate ?? "fixture";
    const fixtureFacilityId = activeFacilityCacheKey ?? priceTrendUiState.facilityId ?? "fixture";
    if (fixtureMode === "skip") {
        priceTrendBackgroundQueueState = {
            ...createInitialPriceTrendBackgroundQueueState(),
            status: "complete",
            facilityId: fixtureFacilityId,
            stayDate: fixtureStayDate,
            total: 3,
            processed: 3,
            skipped: 3
        };
        priceTrendUiState = {
            ...priceTrendUiState,
            status: "skipped",
            facilityId: fixtureFacilityId,
            stayDate: fixtureStayDate,
            records: [],
            reason: "unsupported-stay-date",
            errorMessage: null,
            updatedAt: new Date().toISOString()
        };
        return;
    }

    priceTrendBackgroundQueueState = {
        ...createInitialPriceTrendBackgroundQueueState(),
        status: "stopped",
        facilityId: fixtureFacilityId,
        stayDate: fixtureStayDate,
        total: 3,
        processed: 3,
        errors: 3,
        consecutiveErrors: 3,
        pauseReason: "fixture failure"
    };
    priceTrendUiState = {
        ...priceTrendUiState,
        status: "error",
        facilityId: fixtureFacilityId,
        stayDate: fixtureStayDate,
        records: [],
        reason: null,
        errorMessage: "fixture failure",
        updatedAt: new Date().toISOString()
    };
}

function resolvePriceTrendBackgroundFixtureMode(): PriceTrendBackgroundFixtureMode | null {
    try {
        const rawMode = window.localStorage.getItem(PRICE_TREND_BACKGROUND_FIXTURE_STORAGE_KEY);
        return rawMode === "failure" || rawMode === "skip" ? rawMode : null;
    } catch {
        return null;
    }
}

function renderPriceTrendOverviewAtTarget(
    sectionContainer: HTMLElement,
    state: PriceTrendUiState
): void {
    const filters = buildPriceTrendFilterOptions(state.records);
    const roomTypeFilter = filters.roomTypes.includes(priceTrendRoomTypeFilter ?? "")
        ? priceTrendRoomTypeFilter
        : null;
    const mealTypeFilter = filters.mealTypes.includes(priceTrendMealTypeFilter ?? "")
        ? priceTrendMealTypeFilter
        : null;
    priceTrendRoomTypeFilter = roomTypeFilter;
    priceTrendMealTypeFilter = mealTypeFilter;
    const filteredRecords = selectPriceTrendRecordsForFilters(state.records, roomTypeFilter, mealTypeFilter);
    const signature = [
        PRICE_TREND_OVERVIEW_UI_VERSION,
        state.status,
        state.reason ?? "reason:none",
        state.errorMessage ?? "error:none",
        formatPriceTrendBackgroundQueueSignature(),
        state.records.map((record) => record.recordKey).join("|"),
        roomTypeFilter ?? "room:any",
        mealTypeFilter ?? "meal:any"
    ].join("::");
    const existingContainer = findDirectChildByAttribute(sectionContainer, SALES_SETTING_PRICE_TREND_OVERVIEW_ATTRIBUTE);
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_PRICE_TREND_OVERVIEW_ATTRIBUTE}]`))) {
        if (element !== existingContainer) {
            element.remove();
        }
    }
    const containerElement = existingContainer ?? document.createElement("section");

    if (existingContainer?.getAttribute(SALES_SETTING_PRICE_TREND_OVERVIEW_SIGNATURE_ATTRIBUTE) !== signature) {
        containerElement.setAttribute(SALES_SETTING_PRICE_TREND_OVERVIEW_ATTRIBUTE, "");
        containerElement.setAttribute(SALES_SETTING_PRICE_TREND_OVERVIEW_SIGNATURE_ATTRIBUTE, signature);

        const titleElement = document.createElement("div");
        titleElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_TITLE_ATTRIBUTE, "");
        titleElement.textContent = "競合価格 最安値推移（90日版）";

        const metaElement = document.createElement("div");
        metaElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_META_ATTRIBUTE, "");
        metaElement.textContent = formatPriceTrendOverviewMeta(state, filteredRecords, roomTypeFilter, mealTypeFilter);

        if (state.records.length === 0) {
            const emptyElement = document.createElement("div");
            emptyElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_EMPTY_ATTRIBUTE, "");
            emptyElement.textContent = formatPriceTrendEmptyText(state);
            const nextActionElement = createPriceTrendNextActionElement(state);
            containerElement.replaceChildren(
                titleElement,
                metaElement,
                ...[emptyElement, nextActionElement].filter((element): element is HTMLElement => element !== null)
            );
        } else {
            const controlsElement = createPriceTrendFilterControls(filters, roomTypeFilter, mealTypeFilter);
            if (filteredRecords.length === 0) {
                const emptyElement = document.createElement("div");
                emptyElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_EMPTY_ATTRIBUTE, "");
                emptyElement.textContent = "選択した条件の価格推移データは保存されていません。";
                containerElement.replaceChildren(titleElement, metaElement, controlsElement, emptyElement);
            } else {
                const chartSeries = buildPriceTrendGuestChartSeries(filteredRecords);
                const legendElement = createCompetitorPriceLegend(chartSeries.facilities);
                const chartGridElement = document.createElement("div");
                chartGridElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_GRID_ATTRIBUTE, "");
                for (const guestCount of PRICE_TREND_GUEST_COUNTS) {
                    chartGridElement.append(createPriceTrendChartPanel(guestCount, chartSeries));
                }
                containerElement.replaceChildren(titleElement, metaElement, controlsElement, legendElement, chartGridElement);
            }
        }
    }

    if (containerElement.parentElement !== sectionContainer || sectionContainer.lastElementChild !== containerElement) {
        sectionContainer.append(containerElement);
    }
}

function createPriceTrendNextActionElement(state: PriceTrendUiState): HTMLElement | null {
    const text = formatPriceTrendNextActionText(state);
    if (text === null) {
        return null;
    }
    const element = document.createElement("div");
    element.setAttribute(SALES_SETTING_COMPETITOR_PRICE_NEXT_ACTION_ATTRIBUTE, "");
    element.textContent = text;
    return element;
}

function formatPriceTrendNextActionText(state: PriceTrendUiState): string | null {
    if (state.status === "loading") {
        return "次操作: 取得完了までこのタブを開いたまま待つ。別日へ移動した場合は、戻った後に再取得状態を確認する。";
    }
    if (state.reason === "unsupported-stay-date") {
        return "次操作: 89日以内の宿泊日で確認する。89日より先の宿泊日は競合価格 snapshot または Analyze の他の根拠で判断する。";
    }
    if (state.reason === "indexeddb-unavailable") {
        return "次操作: ブラウザの保存領域を確認し、タブを再表示して再取得する。保存できない間はこの価格推移 graph を根拠にしない。";
    }
    if (state.status !== "error") {
        return null;
    }

    const errorText = [
        state.errorMessage,
        priceTrendBackgroundQueueState.pauseReason
    ].filter((value): value is string => value !== null).join(" ");
    const statusMatch = errorText.match(/\b(?:HTTP\s*)?(401|403|429|5\d\d)\b/i);
    const status = statusMatch?.[1] ?? null;
    if (status === "401") {
        return "次操作: Revenue Assistant に再ログインし、この価格推移タブを再表示して再取得する。";
    }
    if (status === "403") {
        return "次操作: この施設または価格推移 API の閲覧権限を確認する。権限がない場合はこの graph を根拠にしない。";
    }
    if (status === "429") {
        return "次操作: クールダウンのため時間を置き、同じタブを再表示して再取得する。連続で再読み込みしない。";
    }
    if (status !== null) {
        return "次操作: サーバー応答が安定するまで時間を置き、このタブを再表示して再取得する。";
    }
    if (/network|fetch|timeout|failed to fetch/i.test(errorText)) {
        return "次操作: 通信状態を確認し、このタブを再表示して再取得する。再発する場合は時間を置く。";
    }
    if (priceTrendBackgroundQueueState.status === "stopped") {
        return "次操作: 停止理由を確認し、ログイン状態、権限、通信状態を確認してからタブを再表示する。";
    }
    return "次操作: タブを再表示して再取得する。再発する場合はログイン状態、権限、通信状態を確認する。";
}

function resolvePriceTrendTabSectionTarget(): HTMLElement | null {
    const priceTrendsContentElement = document.querySelector<HTMLElement>(`[data-testid="price-trends-content"]`);
    if (
        priceTrendsContentElement instanceof HTMLElement
        && isElementVisiblyRendered(priceTrendsContentElement)
    ) {
        return priceTrendsContentElement;
    }

    return null;
}

function resolveCompetitorPriceTabSectionTarget(): { sectionContainer: HTMLElement; insertionAnchor: HTMLElement | null } | null {
    const taxIncludedTextElement = document.querySelector<HTMLElement>(`[data-testid="competitor-price-tax-included-text"]`);
    if (
        taxIncludedTextElement?.parentElement instanceof HTMLElement
        && isElementVisiblyRendered(taxIncludedTextElement)
    ) {
        return {
            sectionContainer: taxIncludedTextElement.parentElement,
            insertionAnchor: null
        };
    }

    return null;
}

function isElementVisiblyRendered(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== "none"
        && style.visibility !== "hidden"
        && element.getClientRects().length > 0;
}

interface CompetitorPriceFilterOptions {
    roomTypes: string[];
    mealTypes: string[];
}

interface CompetitorPriceFacilitySeries {
    yadNo: string;
    name: string;
    color: string;
}

interface CompetitorPriceChartPoint {
    fetchDate: string;
    yadNo: string;
    price: number;
    roomType: string | null;
}

interface CompetitorPriceGuestChartSeries {
    fetchDates: string[];
    facilities: CompetitorPriceFacilitySeries[];
    pointsByGuestCount: Map<number, CompetitorPriceChartPoint[]>;
}

interface CompetitorPriceChartLayout {
    plotLeft: number;
    plotWidth: number;
    activeLeft: number;
    activeWidth: number;
}

interface PriceTrendChartPoint {
    leadTimeDays: number;
    observedDate: string | null;
    yadNo: string;
    price: number;
    roomType: string | null;
    status: string | null;
}

interface PriceTrendGuestChartSeries {
    leadTimeDays: number[];
    facilities: CompetitorPriceFacilitySeries[];
    pointsByGuestCount: Map<PriceTrendGuestCount, PriceTrendChartPoint[]>;
}

function formatPriceTrendOverviewMeta(
    state: PriceTrendUiState,
    records: PriceTrendRecord[],
    roomTypeFilter: string | null,
    mealTypeFilter: string | null
): string {
    const latestRecord = selectLatestPriceTrendRecord(records);
    const parts = [
        state.stayDate === null ? null : `対象宿泊日 ${formatCompactDateForDisplay(state.stayDate)}`,
        latestRecord === null ? null : `部屋タイプ ${roomTypeFilter === null ? "全部屋タイプから最安値" : formatPriceTrendRoomTypeForDisplay(roomTypeFilter)}`,
        latestRecord === null ? null : `食事 ${mealTypeFilter === null ? "指定なし" : formatMealTypeForDisplay(mealTypeFilter)}`,
        latestRecord === null ? null : `公式更新 ${formatNullableDateTimeForDisplay(latestRecord.payload.latestSourceUpdatedAt)}`,
        latestRecord === null ? null : `保存 ${formatDateTimeForDisplay(latestRecord.fetchedAt)}`,
        formatPriceTrendBackgroundQueueLabel(),
        `取得元 /api/v1/price_trends`
    ].filter((part): part is string => part !== null);
    return parts.join(" / ");
}

function formatPriceTrendBackgroundQueueSignature(): string {
    return [
        priceTrendBackgroundQueueState.status,
        priceTrendBackgroundQueueState.total,
        priceTrendBackgroundQueueState.processed,
        priceTrendBackgroundQueueState.stored,
        priceTrendBackgroundQueueState.skipped,
        priceTrendBackgroundQueueState.errors,
        priceTrendBackgroundQueueState.currentScope === null ? "current:none" : formatPriceTrendRequestScopeLabel(priceTrendBackgroundQueueState.currentScope),
        priceTrendBackgroundQueueState.pauseReason ?? "reason:none"
    ].join("|");
}

function formatPriceTrendBackgroundQueueLabel(): string | null {
    const state = priceTrendBackgroundQueueState;
    if (state.status === "idle" || state.total === 0) {
        return null;
    }
    const base = [
        `背景取得 ${state.processed} / ${state.total}`,
        `保存 ${state.stored}`,
        `skip ${state.skipped}`,
        state.errors > 0 ? `失敗 ${state.errors}` : null,
        state.currentScope === null ? null : `取得中 ${formatPriceTrendRequestScopeLabel(state.currentScope)}`,
        state.status === "complete" ? "完了" : null,
        state.status === "stopped" && state.pauseReason !== null ? `停止 ${state.pauseReason}` : null
    ].filter((part): part is string => part !== null);
    return base.join("・");
}

function formatPriceTrendRequestScopeLabel(scope: PriceTrendRequestScope): string {
    return [
        `${scope.numGuests}名`,
        formatMealTypeForDisplay(scope.mealType),
        formatPriceTrendRoomTypeForDisplay(scope.roomType)
    ].join(" / ");
}

function formatPriceTrendEmptyText(state: PriceTrendUiState): string {
    if (state.status === "loading") {
        return "公式価格推移データを取得中です。";
    }
    if (state.status === "error") {
        return `公式価格推移データを取得できませんでした${state.errorMessage === null ? "" : `: ${state.errorMessage}`}`;
    }
    if (state.reason === "unsupported-stay-date") {
        return "公式価格推移データなし。89日より先、または公式側に対象データがない宿泊日として扱います。";
    }
    if (state.reason === "indexeddb-unavailable") {
        return "公式価格推移データは取得できましたが、IndexedDB に保存できませんでした。";
    }
    return "公式価格推移データなし。";
}

function formatNullableDateTimeForDisplay(value: string | null): string {
    return value === null ? "不明" : formatDateTimeForDisplay(value);
}

function buildPriceTrendFilterOptions(records: PriceTrendRecord[]): CompetitorPriceFilterOptions {
    const roomTypes = new Set<string>();
    const mealTypes = new Set<string>();
    for (const record of records) {
        const roomType = getPriceTrendRecordRoomTypeLabel(record);
        if (roomType !== null) {
            roomTypes.add(roomType);
        }
        if (record.mealType.trim() !== "") {
            mealTypes.add(record.mealType);
        }
    }

    return {
        roomTypes: Array.from(roomTypes).sort(compareCompetitorPriceRoomTypeLabels),
        mealTypes: Array.from(mealTypes).sort((left, right) => formatMealTypeForDisplay(left).localeCompare(formatMealTypeForDisplay(right), "ja"))
    };
}

function selectPriceTrendRecordsForFilters(
    records: PriceTrendRecord[],
    roomTypeFilter: string | null,
    mealTypeFilter: string | null
): PriceTrendRecord[] {
    const hasSpecificRoomTypeRecords = roomTypeFilter === null && hasCompletePriceTrendSpecificRoomTypeRecords(records);
    return records.filter((record) => {
        const roomType = getPriceTrendRecordRoomTypeLabel(record);
        const roomTypeMatches = roomTypeFilter === null
            ? (hasSpecificRoomTypeRecords ? roomType !== null : true)
            : roomType === roomTypeFilter;
        const mealTypeMatches = mealTypeFilter === null || record.mealType === mealTypeFilter;
        return roomTypeMatches && mealTypeMatches;
    });
}

function hasCompletePriceTrendSpecificRoomTypeRecords(records: PriceTrendRecord[]): boolean {
    const expectedRoomTypes = new Set(PRICE_TREND_ROOM_TYPE_REQUESTS.map((roomType) => formatPriceTrendRoomTypeForDisplay(roomType)));
    const availableKeys = new Set<string>();
    for (const record of records) {
        const roomType = getPriceTrendRecordRoomTypeLabel(record);
        if (roomType === null || !expectedRoomTypes.has(roomType)) {
            continue;
        }
        availableKeys.add(`${record.numGuests}|${record.mealType}|${roomType}`);
    }

    for (const roomType of expectedRoomTypes) {
        for (const mealType of PRICE_TREND_MEAL_TYPE_REQUESTS) {
            for (const guestCount of PRICE_TREND_GUEST_COUNTS) {
                if (!availableKeys.has(`${guestCount}|${mealType}|${roomType}`)) {
                    return false;
                }
            }
        }
    }
    return true;
}

function getPriceTrendRecordRoomTypeLabel(record: PriceTrendRecord): string | null {
    const label = record.roomTypeLabel ?? record.scope.roomTypeLabel ?? record.roomType ?? record.scope.roomType;
    const trimmed = label?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

function formatPriceTrendRoomTypeForDisplay(roomType: string | null): string {
    return roomType === null ? "指定なし" : formatRoomTypeForDisplay(roomType);
}

function buildPriceTrendGuestChartSeries(records: PriceTrendRecord[]): PriceTrendGuestChartSeries {
    const leadTimeDaySet = new Set<number>();
    const minimumPointsByGuestCount = new Map<PriceTrendGuestCount, Map<string, PriceTrendChartPoint>>();
    for (const guestCount of PRICE_TREND_GUEST_COUNTS) {
        minimumPointsByGuestCount.set(guestCount, new Map());
    }

    const latestRecord = selectLatestPriceTrendRecord(records);
    const facilities = buildPriceTrendFacilities(latestRecord);

    for (const record of records) {
        const minimumPoints = minimumPointsByGuestCount.get(record.numGuests) ?? new Map<string, PriceTrendChartPoint>();
        const roomType = getPriceTrendRecordRoomTypeLabel(record);
        for (const yad of record.payload.yads) {
            for (const point of yad.points) {
                leadTimeDaySet.add(point.leadTimeDays);
                if (point.priceIncludingTax === null) {
                    continue;
                }

                const chartPoint: PriceTrendChartPoint = {
                    leadTimeDays: point.leadTimeDays,
                    observedDate: point.date,
                    yadNo: yad.yadNo,
                    price: point.priceIncludingTax,
                    roomType,
                    status: point.status
                };
                const key = `${chartPoint.yadNo}|${chartPoint.leadTimeDays}`;
                const currentMinimum = minimumPoints.get(key);
                if (currentMinimum === undefined || chartPoint.price < currentMinimum.price) {
                    minimumPoints.set(key, chartPoint);
                }
            }
        }
        minimumPointsByGuestCount.set(record.numGuests, minimumPoints);
    }

    const pointsByGuestCount = new Map<PriceTrendGuestCount, PriceTrendChartPoint[]>();
    for (const guestCount of PRICE_TREND_GUEST_COUNTS) {
        const points = Array.from(minimumPointsByGuestCount.get(guestCount)?.values() ?? []);
        pointsByGuestCount.set(guestCount, points);
    }

    return {
        leadTimeDays: Array.from(leadTimeDaySet).sort((left, right) => right - left),
        facilities,
        pointsByGuestCount
    };
}

function selectLatestPriceTrendRecord(records: PriceTrendRecord[]): PriceTrendRecord | null {
    return records.reduce<PriceTrendRecord | null>((latest, record) => {
        if (latest === null) {
            return record;
        }
        return record.fetchedAt.localeCompare(latest.fetchedAt) > 0 ? record : latest;
    }, null);
}

function buildPriceTrendFacilities(record: PriceTrendRecord | null): CompetitorPriceFacilitySeries[] {
    if (record === null) {
        return [];
    }

    let ownFacility: CompetitorPriceFacilitySeries | null = null;
    const competitorFacilities: CompetitorPriceFacilitySeries[] = [];
    for (const facility of record.facilities) {
        if (facility.role === "own") {
            ownFacility = {
                yadNo: facility.yadNo,
                name: "自社",
                color: COMPETITOR_PRICE_OWN_SERIES_COLOR
            };
        } else if (facility.role === "competitor") {
            competitorFacilities.push({
                yadNo: facility.yadNo,
                name: facility.name,
                color: COMPETITOR_PRICE_COMPETITOR_SERIES_COLORS[competitorFacilities.length % COMPETITOR_PRICE_COMPETITOR_SERIES_COLORS.length] ?? "#50627a"
            });
        }
    }

    return [
        ...(ownFacility === null
            ? []
            : [ownFacility]),
        ...competitorFacilities
    ];
}

function createPriceTrendChartPanel(
    guestCount: PriceTrendGuestCount,
    chartSeries: PriceTrendGuestChartSeries
): HTMLElement {
    const panelElement = document.createElement("section");
    panelElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_PANEL_ATTRIBUTE, "");
    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_TITLE_ATTRIBUTE, "");
    titleElement.textContent = `${guestCount}名 最安値`;
    const points = chartSeries.pointsByGuestCount.get(guestCount) ?? [];
    if (points.length === 0) {
        const emptyElement = document.createElement("div");
        emptyElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_EMPTY_ATTRIBUTE, "");
        emptyElement.textContent = "対象データなし";
        panelElement.replaceChildren(titleElement, emptyElement);
        return panelElement;
    }

    const tooltipElement = createCompetitorPriceTooltip();
    panelElement.replaceChildren(
        titleElement,
        tooltipElement,
        createPriceTrendChartSvg(chartSeries.leadTimeDays, chartSeries.facilities, points, guestCount, tooltipElement)
    );
    return panelElement;
}

function mergeCompetitorPriceSnapshotRecordList(
    records: CompetitorPriceSnapshotRecord[],
    nextRecords: CompetitorPriceSnapshotRecord[]
): CompetitorPriceSnapshotRecord[] {
    const merged = new Map(records.map((item) => [item.snapshotKey, item]));
    for (const record of nextRecords) {
        merged.set(record.snapshotKey, record);
    }
    return Array.from(merged.values()).sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt));
}

function buildLatestCompetitorPriceRecordsByFetchDate(
    records: CompetitorPriceSnapshotRecord[],
    roomTypeFilter: string | null
): CompetitorPriceSnapshotRecord[] {
    const candidateRecords = selectCompetitorPriceRecordsForRoomTypeFilter(records, roomTypeFilter);
    const dailyRecords = new Map<string, CompetitorPriceSnapshotRecord>();
    for (const record of candidateRecords) {
        const fetchDate = formatCompetitorPriceFetchDate(record.fetchedAt);
        const existingRecord = dailyRecords.get(fetchDate);
        if (existingRecord === undefined || existingRecord.fetchedAt.localeCompare(record.fetchedAt) < 0) {
            dailyRecords.set(fetchDate, record);
        }
    }

    return Array.from(dailyRecords.values()).sort((left, right) => left.fetchedAt.localeCompare(right.fetchedAt));
}

function selectCompetitorPriceRecordsForRoomTypeFilter(
    records: CompetitorPriceSnapshotRecord[],
    roomTypeFilter: string | null
): CompetitorPriceSnapshotRecord[] {
    const unspecifiedRecords: CompetitorPriceSnapshotRecord[] = [];
    const roomTypeRequestRecords: CompetitorPriceSnapshotRecord[] = [];
    for (const record of records) {
        if (isUnspecifiedCompetitorPriceRecord(record)) {
            unspecifiedRecords.push(record);
        }
        if (roomTypeFilter !== null && recordMatchesCompetitorPriceRoomTypeRequest(record, roomTypeFilter)) {
            roomTypeRequestRecords.push(record);
        }
    }

    if (roomTypeFilter === null) {
        return unspecifiedRecords.length > 0 ? unspecifiedRecords : records;
    }

    return roomTypeRequestRecords.length > 0 ? roomTypeRequestRecords : unspecifiedRecords;
}

function isUnspecifiedCompetitorPriceRecord(record: CompetitorPriceSnapshotRecord): boolean {
    return getCompetitorPriceRecordJalanRoomTypes(record).length === 0;
}

function recordMatchesCompetitorPriceRoomTypeRequest(record: CompetitorPriceSnapshotRecord, roomTypeFilter: string): boolean {
    return getCompetitorPriceRecordJalanRoomTypes(record)
        .some((roomType) => formatRoomTypeForDisplay(roomType) === roomTypeFilter);
}

function getCompetitorPriceRecordJalanRoomTypes(record: CompetitorPriceSnapshotRecord): string[] {
    return record.searchConditionRaw.jalanRoomTypes ?? [];
}

function buildCompetitorPriceFilterOptions(records: CompetitorPriceSnapshotRecord[]): CompetitorPriceFilterOptions {
    const roomTypes = new Set<string>();
    const mealTypes = new Set<string>();
    for (const record of records) {
        for (const plan of flattenCompetitorPricePlansWithOwn(record)) {
            if (plan.jalanFacilityRoomType !== null && plan.jalanFacilityRoomType.trim() !== "") {
                roomTypes.add(formatRoomTypeForDisplay(plan.jalanFacilityRoomType));
            }
            if (plan.mealType !== null && plan.mealType.trim() !== "") {
                mealTypes.add(plan.mealType);
            }
        }
    }

    return {
        roomTypes: Array.from(roomTypes).sort(compareCompetitorPriceRoomTypeLabels),
        mealTypes: Array.from(mealTypes).sort((left, right) => formatMealTypeForDisplay(left).localeCompare(formatMealTypeForDisplay(right), "ja"))
    };
}

function createCompetitorPriceFilterControls(
    filters: CompetitorPriceFilterOptions,
    roomTypeFilter: string | null,
    mealTypeFilter: string | null
): HTMLElement {
    return createPriceSeriesFilterControls(
        filters,
        roomTypeFilter,
        mealTypeFilter,
        (value) => {
            competitorPriceRoomTypeFilter = value;
            renderCompetitorPriceOverviewFromState();
        },
        (value) => {
            competitorPriceMealTypeFilter = value;
            renderCompetitorPriceOverviewFromState();
        }
    );
}

function createPriceTrendFilterControls(
    filters: CompetitorPriceFilterOptions,
    roomTypeFilter: string | null,
    mealTypeFilter: string | null
): HTMLElement {
    return createPriceSeriesFilterControls(
        filters,
        roomTypeFilter,
        mealTypeFilter,
        (value) => {
            priceTrendRoomTypeFilter = value;
            renderPriceTrendOverviewFromState();
        },
        (value) => {
            priceTrendMealTypeFilter = value;
            renderPriceTrendOverviewFromState();
        }
    );
}

function createPriceSeriesFilterControls(
    filters: CompetitorPriceFilterOptions,
    roomTypeFilter: string | null,
    mealTypeFilter: string | null,
    onRoomTypeChange: (value: string | null) => void,
    onMealTypeChange: (value: string | null) => void
): HTMLElement {
    const controlsElement = document.createElement("div");
    controlsElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CONTROLS_ATTRIBUTE, "");
    controlsElement.append(
        createCompetitorPriceFilterGroup("部屋タイプ", filters.roomTypes, roomTypeFilter, onRoomTypeChange, formatRoomTypeForDisplay),
        createCompetitorPriceFilterGroup("食事", filters.mealTypes, mealTypeFilter, onMealTypeChange, formatMealTypeForDisplay)
    );
    return controlsElement;
}

function createCompetitorPriceFilterGroup(
    label: string,
    options: string[],
    selectedValue: string | null,
    onChange: (value: string | null) => void,
    formatLabel: (value: string) => string = (value) => value
): HTMLElement {
    const groupElement = document.createElement("div");
    groupElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_FILTER_GROUP_ATTRIBUTE, "");
    const labelElement = document.createElement("span");
    labelElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_FILTER_LABEL_ATTRIBUTE, "");
    labelElement.textContent = label;
    groupElement.append(labelElement);

    const entries: Array<{ value: string | null; label: string }> = [
        { value: null, label: "指定なし" },
        ...options.map((option) => ({ value: option, label: formatLabel(option) }))
    ];
    for (const entry of entries) {
        const buttonElement = document.createElement("button");
        buttonElement.type = "button";
        buttonElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_FILTER_BUTTON_ATTRIBUTE, "");
        buttonElement.setAttribute(
            SALES_SETTING_COMPETITOR_PRICE_FILTER_ACTIVE_ATTRIBUTE,
            entry.value === selectedValue ? "true" : "false"
        );
        buttonElement.textContent = entry.label;
        buttonElement.addEventListener("click", () => {
            onChange(entry.value);
        });
        groupElement.append(buttonElement);
    }

    return groupElement;
}

function buildCompetitorPriceGuestChartSeries(
    dailyRecords: CompetitorPriceSnapshotRecord[],
    roomTypeFilter: string | null,
    mealTypeFilter: string | null
): CompetitorPriceGuestChartSeries {
    const fetchDates = dailyRecords.map((record) => formatCompetitorPriceFetchDate(record.fetchedAt));
    const facilityMap = new Map<string, CompetitorPriceFacilitySeries>();
    let competitorSeriesCount = 0;
    const pointsByGuestCount = new Map<number, CompetitorPriceChartPoint[]>();
    for (const guestCount of COMPETITOR_PRICE_GUEST_COUNTS) {
        pointsByGuestCount.set(guestCount, []);
    }

    for (const record of dailyRecords) {
        const fetchDate = formatCompetitorPriceFetchDate(record.fetchedAt);
        for (const facility of buildCompetitorPriceFacilities(record)) {
            if (!facilityMap.has(facility.yadNo)) {
                const competitorSeriesIndex = competitorSeriesCount;
                facilityMap.set(facility.yadNo, {
                    ...facility,
                    color: getCompetitorPriceFacilitySeriesColor(facility, competitorSeriesIndex)
                });
                if (facility.name !== "自社") {
                    competitorSeriesCount += 1;
                }
            }
        }
        const minimumPricesByGuestCount = buildMinimumCompetitorPricesByGuestCount(record, roomTypeFilter, mealTypeFilter);
        for (const guestCount of COMPETITOR_PRICE_GUEST_COUNTS) {
            const points = pointsByGuestCount.get(guestCount) ?? [];
            for (const [yadNo, minimumPrice] of minimumPricesByGuestCount.get(guestCount)?.entries() ?? []) {
                points.push({
                    fetchDate,
                    yadNo,
                    price: minimumPrice.price,
                    roomType: minimumPrice.roomType
                });
            }
            pointsByGuestCount.set(guestCount, points);
        }
    }

    return {
        fetchDates,
        facilities: Array.from(facilityMap.values()),
        pointsByGuestCount
    };
}

function getCompetitorPriceFacilitySeriesColor(
    facility: { yadNo: string; name: string },
    competitorSeriesIndex: number
): string {
    if (facility.name === "自社") {
        return COMPETITOR_PRICE_OWN_SERIES_COLOR;
    }

    return COMPETITOR_PRICE_COMPETITOR_SERIES_COLORS[
        competitorSeriesIndex % COMPETITOR_PRICE_COMPETITOR_SERIES_COLORS.length
    ] ?? "#50627a";
}

function createCompetitorPriceLegend(facilities: CompetitorPriceFacilitySeries[]): HTMLElement {
    const legendElement = document.createElement("div");
    legendElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_LEGEND_ATTRIBUTE, "");
    for (const facility of facilities) {
        const itemElement = document.createElement("span");
        itemElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_LEGEND_ITEM_ATTRIBUTE, "");
        const swatchElement = document.createElement("span");
        swatchElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_LEGEND_SWATCH_ATTRIBUTE, "");
        swatchElement.style.backgroundColor = facility.color;
        itemElement.append(swatchElement, document.createTextNode(facility.name));
        legendElement.append(itemElement);
    }
    return legendElement;
}

function createCompetitorPriceChartPanel(
    guestCount: number,
    chartSeries: CompetitorPriceGuestChartSeries
): HTMLElement {
    const panelElement = document.createElement("section");
    panelElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_PANEL_ATTRIBUTE, "");
    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_TITLE_ATTRIBUTE, "");
    titleElement.textContent = `${guestCount}名 最安値`;
    const points = chartSeries.pointsByGuestCount.get(guestCount) ?? [];
    if (points.length === 0) {
        const emptyElement = document.createElement("div");
        emptyElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_EMPTY_ATTRIBUTE, "");
        emptyElement.textContent = "対象データなし";
        panelElement.replaceChildren(titleElement, emptyElement);
        return panelElement;
    }

    const tooltipElement = createCompetitorPriceTooltip();
    panelElement.replaceChildren(
        titleElement,
        tooltipElement,
        createCompetitorPriceChartSvg(chartSeries.fetchDates, chartSeries.facilities, points, guestCount, tooltipElement)
    );
    return panelElement;
}

function createCompetitorPriceChartSvg(
    fetchDates: string[],
    facilities: CompetitorPriceFacilitySeries[],
    points: CompetitorPriceChartPoint[],
    guestCount: number,
    tooltipElement: HTMLElement
): SVGSVGElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const width = 760;
    const height = 220;
    const paddingLeft = 54;
    const paddingRight = 24;
    const paddingTop = 18;
    const paddingBottom = 34;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const layout = getCompetitorPriceChartLayout(fetchDates.length, paddingLeft, plotWidth);
    const fetchDateIndexByDate = new Map(fetchDates.map((fetchDate, index) => [fetchDate, index] as const));
    const { minPrice, maxPrice } = resolvePricePointRange(points);
    const yMin = minPrice === maxPrice ? Math.max(0, minPrice - 1000) : minPrice;
    const yMax = minPrice === maxPrice ? maxPrice + 1000 : maxPrice;
    const yAxisTicks = buildCompetitorPriceYAxisTicks(yMin, yMax);

    const svgElement = document.createElementNS(svgNamespace, "svg");
    svgElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE, "");
    svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute("aria-label", `${guestCount}名の競合価格最安値推移`);

    for (const [index, tick] of yAxisTicks.entries()) {
        const y = getCompetitorPriceChartY(tick, yMin, yMax, paddingTop, plotHeight);
        const textElement = document.createElementNS(svgNamespace, "text");
        textElement.setAttribute("x", "4");
        textElement.setAttribute("y", String(y + 4));
        textElement.textContent = formatPriceForDisplay(tick).replace("円", "");
        svgElement.append(textElement);

        const lineElement = document.createElementNS(svgNamespace, "line");
        lineElement.setAttribute("x1", layout.plotLeft.toFixed(2));
        lineElement.setAttribute("x2", (layout.plotLeft + layout.plotWidth).toFixed(2));
        lineElement.setAttribute("y1", y.toFixed(2));
        lineElement.setAttribute("y2", y.toFixed(2));
        if (index > 0 && index < yAxisTicks.length - 1) {
            lineElement.setAttribute("stroke-dasharray", "2 4");
            lineElement.setAttribute("opacity", "0.75");
        }
        svgElement.append(lineElement);
    }

    for (const [dateIndex, fetchDate] of fetchDates.entries()) {
        const x = getCompetitorPriceChartX(dateIndex, fetchDates.length, layout);
        const textElement = document.createElementNS(svgNamespace, "text");
        textElement.setAttribute("x", x.toFixed(2));
        textElement.setAttribute("y", String(height - 8));
        textElement.setAttribute("text-anchor", "middle");
        textElement.textContent = fetchDate.slice(5);
        svgElement.append(textElement);
    }

    const guideLineElement = document.createElementNS(svgNamespace, "line");
    guideLineElement.setAttribute("x1", String(paddingLeft));
    guideLineElement.setAttribute("x2", String(paddingLeft));
    guideLineElement.setAttribute("y1", String(paddingTop));
    guideLineElement.setAttribute("y2", String(height - paddingBottom));
    guideLineElement.setAttribute("visibility", "hidden");
    guideLineElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_GUIDE_LINE_ATTRIBUTE, "");
    guideLineElement.setAttribute("stroke", "#8fa1b8");
    guideLineElement.setAttribute("stroke-dasharray", "3 3");
    svgElement.append(guideLineElement);

    const pointsByFacility = buildCompetitorPriceChartPointsByFacility(points, fetchDateIndexByDate);
    for (const facility of facilities) {
        const facilityPoints = pointsByFacility.get(facility.yadNo) ?? [];
        if (facilityPoints.length === 0) {
            continue;
        }

        const pathData = facilityPoints
            .map((point, index) => {
                const x = getCompetitorPriceChartX(fetchDateIndexByDate.get(point.fetchDate) ?? -1, fetchDates.length, layout);
                const y = getCompetitorPriceChartY(point.price, yMin, yMax, paddingTop, plotHeight);
                return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");
        const pathElement = document.createElementNS(svgNamespace, "path");
        pathElement.setAttribute("d", pathData);
        pathElement.setAttribute("fill", "none");
        pathElement.setAttribute("stroke", facility.color);
        pathElement.setAttribute("stroke-width", "2");
        svgElement.append(pathElement);

        for (const point of facilityPoints) {
            const circleElement = document.createElementNS(svgNamespace, "circle");
            circleElement.setAttribute("cx", getCompetitorPriceChartX(fetchDateIndexByDate.get(point.fetchDate) ?? -1, fetchDates.length, layout).toFixed(2));
            circleElement.setAttribute("cy", getCompetitorPriceChartY(point.price, yMin, yMax, paddingTop, plotHeight).toFixed(2));
            circleElement.setAttribute("r", "3");
            circleElement.setAttribute("fill", facility.color);
            const titleElement = document.createElementNS(svgNamespace, "title");
            titleElement.textContent = `${facility.name} ${point.fetchDate} ${formatPriceForDisplay(point.price)}`;
            circleElement.append(titleElement);
            svgElement.append(circleElement);
        }
    }

    const hitboxElements: SVGRectElement[] = [];
    for (const [dateIndex, fetchDate] of fetchDates.entries()) {
        const x = getCompetitorPriceChartX(dateIndex, fetchDates.length, layout);
        const previousFetchDate = fetchDates[dateIndex - 1] ?? null;
        const hitboxElement = document.createElementNS(svgNamespace, "rect");
        hitboxElement.setAttribute("x", getCompetitorPriceChartHitboxX(dateIndex, fetchDates.length, layout).toFixed(2));
        hitboxElement.setAttribute("y", String(paddingTop));
        hitboxElement.setAttribute("width", getCompetitorPriceChartHitboxWidth(fetchDates.length, layout).toFixed(2));
        hitboxElement.setAttribute("height", String(plotHeight));
        hitboxElement.setAttribute("fill", "transparent");
        hitboxElement.setAttribute("tabindex", "0");
        hitboxElements.push(hitboxElement);
        hitboxElement.addEventListener("mouseenter", (event) => {
            setActiveCompetitorPriceChartHitbox(hitboxElements, hitboxElement);
            showCompetitorPriceTooltip(tooltipElement, guideLineElement, x, width, fetchDate, previousFetchDate, facilities, points, event.clientX);
        });
        hitboxElement.addEventListener("focus", () => {
            setActiveCompetitorPriceChartHitbox(hitboxElements, hitboxElement);
            showCompetitorPriceTooltip(tooltipElement, guideLineElement, x, width, fetchDate, previousFetchDate, facilities, points);
        });
        hitboxElement.addEventListener("mouseleave", () => {
            hideCompetitorPriceTooltip(tooltipElement, guideLineElement);
            clearActiveCompetitorPriceChartHitboxes(hitboxElements);
        });
        hitboxElement.addEventListener("blur", () => {
            hideCompetitorPriceTooltip(tooltipElement, guideLineElement);
            clearActiveCompetitorPriceChartHitboxes(hitboxElements);
        });
        svgElement.append(hitboxElement);
    }

    return svgElement;
}

function buildCompetitorPriceChartPointsByFacility(
    points: CompetitorPriceChartPoint[],
    fetchDateIndexByDate: Map<string, number>
): Map<string, CompetitorPriceChartPoint[]> {
    const pointsByFacility = new Map<string, CompetitorPriceChartPoint[]>();
    for (const point of points) {
        const facilityPoints = pointsByFacility.get(point.yadNo) ?? [];
        facilityPoints.push(point);
        pointsByFacility.set(point.yadNo, facilityPoints);
    }
    for (const facilityPoints of pointsByFacility.values()) {
        facilityPoints.sort((left, right) => (fetchDateIndexByDate.get(left.fetchDate) ?? -1) - (fetchDateIndexByDate.get(right.fetchDate) ?? -1));
    }
    return pointsByFacility;
}

function createPriceTrendChartSvg(
    leadTimeDays: number[],
    facilities: CompetitorPriceFacilitySeries[],
    points: PriceTrendChartPoint[],
    guestCount: PriceTrendGuestCount,
    tooltipElement: HTMLElement
): SVGSVGElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const width = 760;
    const height = 220;
    const paddingLeft = 54;
    const paddingRight = 24;
    const paddingTop = 18;
    const paddingBottom = 34;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const layout = getCompetitorPriceChartLayout(leadTimeDays.length, paddingLeft, plotWidth);
    const leadTimeIndexByDays = new Map(leadTimeDays.map((leadTimeDaysValue, index) => [leadTimeDaysValue, index] as const));
    const { minPrice, maxPrice } = resolvePricePointRange(points);
    const yMin = minPrice === maxPrice ? Math.max(0, minPrice - 1000) : minPrice;
    const yMax = minPrice === maxPrice ? maxPrice + 1000 : maxPrice;
    const yAxisTicks = buildCompetitorPriceYAxisTicks(yMin, yMax);

    const svgElement = document.createElementNS(svgNamespace, "svg");
    svgElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE, "");
    svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute("aria-label", `${guestCount}名の競合価格最安値推移 90日版`);

    for (const [index, tick] of yAxisTicks.entries()) {
        const y = getCompetitorPriceChartY(tick, yMin, yMax, paddingTop, plotHeight);
        const textElement = document.createElementNS(svgNamespace, "text");
        textElement.setAttribute("x", "4");
        textElement.setAttribute("y", String(y + 4));
        textElement.textContent = formatPriceForDisplay(tick).replace("円", "");
        svgElement.append(textElement);

        const lineElement = document.createElementNS(svgNamespace, "line");
        lineElement.setAttribute("x1", layout.plotLeft.toFixed(2));
        lineElement.setAttribute("x2", (layout.plotLeft + layout.plotWidth).toFixed(2));
        lineElement.setAttribute("y1", y.toFixed(2));
        lineElement.setAttribute("y2", y.toFixed(2));
        if (index > 0 && index < yAxisTicks.length - 1) {
            lineElement.setAttribute("stroke-dasharray", "2 4");
            lineElement.setAttribute("opacity", "0.75");
        }
        svgElement.append(lineElement);
    }

    for (const [leadTimeIndex, leadTimeDaysValue] of leadTimeDays.entries()) {
        if (!shouldShowPriceTrendLeadTimeTick(leadTimeDaysValue)) {
            continue;
        }
        const x = getCompetitorPriceChartX(leadTimeIndex, leadTimeDays.length, layout);
        const textElement = document.createElementNS(svgNamespace, "text");
        textElement.setAttribute("x", x.toFixed(2));
        textElement.setAttribute("y", String(height - 8));
        textElement.setAttribute("text-anchor", "middle");
        textElement.textContent = String(leadTimeDaysValue);
        svgElement.append(textElement);
    }

    const axisLabelElement = document.createElementNS(svgNamespace, "text");
    axisLabelElement.setAttribute("x", String(width - 4));
    axisLabelElement.setAttribute("y", String(height - 8));
    axisLabelElement.setAttribute("text-anchor", "end");
    axisLabelElement.textContent = "(日前)";
    svgElement.append(axisLabelElement);

    const guideLineElement = document.createElementNS(svgNamespace, "line");
    guideLineElement.setAttribute("x1", String(paddingLeft));
    guideLineElement.setAttribute("x2", String(paddingLeft));
    guideLineElement.setAttribute("y1", String(paddingTop));
    guideLineElement.setAttribute("y2", String(height - paddingBottom));
    guideLineElement.setAttribute("visibility", "hidden");
    guideLineElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_GUIDE_LINE_ATTRIBUTE, "");
    guideLineElement.setAttribute("stroke", "#8fa1b8");
    guideLineElement.setAttribute("stroke-dasharray", "3 3");
    svgElement.append(guideLineElement);

    const pointsByFacility = buildPriceTrendChartPointsByFacility(points, leadTimeIndexByDays);
    for (const facility of facilities) {
        const facilityPoints = pointsByFacility.get(facility.yadNo) ?? [];
        if (facilityPoints.length === 0) {
            continue;
        }

        const pathData = facilityPoints
            .map((point, index) => {
                const x = getCompetitorPriceChartX(leadTimeIndexByDays.get(point.leadTimeDays) ?? -1, leadTimeDays.length, layout);
                const y = getCompetitorPriceChartY(point.price, yMin, yMax, paddingTop, plotHeight);
                return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");
        const pathElement = document.createElementNS(svgNamespace, "path");
        pathElement.setAttribute("d", pathData);
        pathElement.setAttribute("fill", "none");
        pathElement.setAttribute("stroke", facility.color);
        pathElement.setAttribute("stroke-width", "2");
        svgElement.append(pathElement);
    }

    const hitboxElements: SVGRectElement[] = [];
    for (const [leadTimeIndex, leadTimeDaysValue] of leadTimeDays.entries()) {
        const x = getCompetitorPriceChartX(leadTimeIndex, leadTimeDays.length, layout);
        const previousLeadTimeDays = leadTimeDays[leadTimeIndex - 1] ?? null;
        const hitboxElement = document.createElementNS(svgNamespace, "rect");
        hitboxElement.setAttribute("x", getCompetitorPriceChartHitboxX(leadTimeIndex, leadTimeDays.length, layout).toFixed(2));
        hitboxElement.setAttribute("y", String(paddingTop));
        hitboxElement.setAttribute("width", getCompetitorPriceChartHitboxWidth(leadTimeDays.length, layout).toFixed(2));
        hitboxElement.setAttribute("height", String(plotHeight));
        hitboxElement.setAttribute("fill", "transparent");
        hitboxElement.setAttribute("tabindex", "0");
        hitboxElements.push(hitboxElement);
        hitboxElement.addEventListener("mouseenter", (event) => {
            setActiveCompetitorPriceChartHitbox(hitboxElements, hitboxElement);
            showPriceTrendTooltip(tooltipElement, guideLineElement, x, width, leadTimeDaysValue, previousLeadTimeDays, facilities, points, event.clientX);
        });
        hitboxElement.addEventListener("focus", () => {
            setActiveCompetitorPriceChartHitbox(hitboxElements, hitboxElement);
            showPriceTrendTooltip(tooltipElement, guideLineElement, x, width, leadTimeDaysValue, previousLeadTimeDays, facilities, points);
        });
        hitboxElement.addEventListener("mouseleave", () => {
            hideCompetitorPriceTooltip(tooltipElement, guideLineElement);
            clearActiveCompetitorPriceChartHitboxes(hitboxElements);
        });
        hitboxElement.addEventListener("blur", () => {
            hideCompetitorPriceTooltip(tooltipElement, guideLineElement);
            clearActiveCompetitorPriceChartHitboxes(hitboxElements);
        });
        svgElement.append(hitboxElement);
    }

    return svgElement;
}

function buildPriceTrendChartPointsByFacility(
    points: PriceTrendChartPoint[],
    leadTimeIndexByDays: Map<number, number>
): Map<string, PriceTrendChartPoint[]> {
    const pointsByFacility = new Map<string, PriceTrendChartPoint[]>();
    for (const point of points) {
        const facilityPoints = pointsByFacility.get(point.yadNo) ?? [];
        facilityPoints.push(point);
        pointsByFacility.set(point.yadNo, facilityPoints);
    }
    for (const facilityPoints of pointsByFacility.values()) {
        facilityPoints.sort((left, right) => (leadTimeIndexByDays.get(left.leadTimeDays) ?? -1) - (leadTimeIndexByDays.get(right.leadTimeDays) ?? -1));
    }
    return pointsByFacility;
}

function shouldShowPriceTrendLeadTimeTick(leadTimeDays: number): boolean {
    return leadTimeDays === 0 || leadTimeDays === 84 || leadTimeDays % 7 === 0;
}

function resolvePricePointRange(points: Array<{ price: number }>): { minPrice: number; maxPrice: number } {
    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        minPrice = Math.min(minPrice, point.price);
        maxPrice = Math.max(maxPrice, point.price);
    }
    return { minPrice, maxPrice };
}

function setActiveCompetitorPriceChartHitbox(hitboxElements: SVGRectElement[], activeHitboxElement: SVGRectElement): void {
    for (const hitboxElement of hitboxElements) {
        hitboxElement.setAttribute(
            SALES_SETTING_COMPETITOR_PRICE_CHART_HITBOX_ACTIVE_ATTRIBUTE,
            hitboxElement === activeHitboxElement ? "true" : "false"
        );
    }
}

function clearActiveCompetitorPriceChartHitboxes(hitboxElements: SVGRectElement[]): void {
    for (const hitboxElement of hitboxElements) {
        hitboxElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_CHART_HITBOX_ACTIVE_ATTRIBUTE, "false");
    }
}

function createCompetitorPriceTooltip(): HTMLElement {
    const tooltipElement = document.createElement("div");
    tooltipElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE, "");
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "false");
    return tooltipElement;
}

function showCompetitorPriceTooltip(
    tooltipElement: HTMLElement,
    guideLineElement: SVGLineElement,
    x: number,
    width: number,
    fetchDate: string,
    previousFetchDate: string | null,
    facilities: CompetitorPriceFacilitySeries[],
    points: CompetitorPriceChartPoint[],
    cursorClientX: number | null = null
): void {
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "true");
    guideLineElement.setAttribute("visibility", "visible");
    guideLineElement.setAttribute("x1", x.toFixed(2));
    guideLineElement.setAttribute("x2", x.toFixed(2));

    const pointByYadNo = new Map<string, CompetitorPriceChartPoint>();
    const previousPointByYadNo = new Map<string, CompetitorPriceChartPoint>();
    for (const point of points) {
        if (point.fetchDate === fetchDate) {
            pointByYadNo.set(point.yadNo, point);
        } else if (previousFetchDate !== null && point.fetchDate === previousFetchDate) {
            previousPointByYadNo.set(point.yadNo, point);
        }
    }

    let ownPoint: CompetitorPriceChartPoint | undefined;
    for (const facility of facilities) {
        if (facility.name === "自社") {
            ownPoint = pointByYadNo.get(facility.yadNo);
            break;
        }
    }
    const rows: Array<{ facility: CompetitorPriceFacilitySeries; point: CompetitorPriceChartPoint; previousDelta: number | null; ownDelta: number | null }> = [];
    for (const facility of facilities) {
        const point = pointByYadNo.get(facility.yadNo);
        if (point === undefined) {
            continue;
        }
        const previousPoint = previousPointByYadNo.get(facility.yadNo);
        const previousDelta = previousPoint === undefined ? null : point.price - previousPoint.price;
        const ownDelta = ownPoint === undefined || facility.name === "自社" ? null : point.price - ownPoint.price;
        rows.push({ facility, point, previousDelta, ownDelta });
    }

    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_TITLE_ATTRIBUTE, "");
    titleElement.textContent = fetchDate;

    const valueElement = document.createElement("div");
    valueElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_VALUE_ATTRIBUTE, "");
    valueElement.textContent = "最安値";

    const detailElement = document.createElement("div");
    detailElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_ATTRIBUTE, "");
    const tableElement = document.createElement("table");
    const headElement = document.createElement("thead");
    const headRowElement = document.createElement("tr");
    for (const label of ["施設", "部屋タイプ", "価格", "前回差分", "自社との差"]) {
        const cellElement = document.createElement("th");
        cellElement.scope = "col";
        cellElement.textContent = label;
        headRowElement.append(cellElement);
    }
    headElement.append(headRowElement);

    const bodyElement = document.createElement("tbody");
    for (const row of rows) {
        const rowElement = document.createElement("tr");
        const facilityElement = document.createElement("td");
        facilityElement.append(createPriceSeriesFacilityLabel(row.facility));
        const roomTypeElement = document.createElement("td");
        roomTypeElement.textContent = row.point.roomType === null ? "不明" : formatRoomTypeForDisplay(row.point.roomType);
        const priceElement = document.createElement("td");
        priceElement.textContent = formatPriceForDisplay(row.point.price);
        const previousDeltaElement = document.createElement("td");
        previousDeltaElement.textContent = row.previousDelta === null ? "前回なし" : formatSignedPriceForDisplay(row.previousDelta);
        previousDeltaElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_TONE_ATTRIBUTE, getCompetitorPriceDeltaTone(row.previousDelta));
        const ownDeltaElement = document.createElement("td");
        ownDeltaElement.textContent = row.ownDelta === null ? "-" : formatSignedPriceForDisplay(row.ownDelta);
        ownDeltaElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_TONE_ATTRIBUTE, getCompetitorPriceDeltaTone(row.ownDelta));
        rowElement.append(facilityElement, roomTypeElement, priceElement, previousDeltaElement, ownDeltaElement);
        bodyElement.append(rowElement);
    }
    tableElement.append(headElement, bodyElement);
    detailElement.append(tableElement);

    tooltipElement.replaceChildren(titleElement, valueElement, detailElement);
    positionCompetitorPriceTooltip(tooltipElement, x, width, cursorClientX);
}

function showPriceTrendTooltip(
    tooltipElement: HTMLElement,
    guideLineElement: SVGLineElement,
    x: number,
    width: number,
    leadTimeDays: number,
    previousLeadTimeDays: number | null,
    facilities: CompetitorPriceFacilitySeries[],
    points: PriceTrendChartPoint[],
    cursorClientX: number | null = null
): void {
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "true");
    guideLineElement.setAttribute("visibility", "visible");
    guideLineElement.setAttribute("x1", x.toFixed(2));
    guideLineElement.setAttribute("x2", x.toFixed(2));

    const pointByYadNo = new Map<string, PriceTrendChartPoint>();
    const previousPointByYadNo = new Map<string, PriceTrendChartPoint>();
    for (const point of points) {
        if (point.leadTimeDays === leadTimeDays) {
            pointByYadNo.set(point.yadNo, point);
        } else if (previousLeadTimeDays !== null && point.leadTimeDays === previousLeadTimeDays) {
            previousPointByYadNo.set(point.yadNo, point);
        }
    }

    let ownPoint: PriceTrendChartPoint | undefined;
    for (const facility of facilities) {
        if (facility.name === "自社") {
            ownPoint = pointByYadNo.get(facility.yadNo);
            break;
        }
    }
    const rows: Array<{ facility: CompetitorPriceFacilitySeries; point: PriceTrendChartPoint; previousDelta: number | null; ownDelta: number | null }> = [];
    for (const facility of facilities) {
        const point = pointByYadNo.get(facility.yadNo);
        if (point === undefined) {
            continue;
        }
        const previousPoint = previousPointByYadNo.get(facility.yadNo);
        const previousDelta = previousPoint === undefined ? null : point.price - previousPoint.price;
        const ownDelta = ownPoint === undefined || facility.name === "自社" ? null : point.price - ownPoint.price;
        rows.push({ facility, point, previousDelta, ownDelta });
    }

    const titleElement = document.createElement("div");
    titleElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_TITLE_ATTRIBUTE, "");
    titleElement.textContent = `${leadTimeDays}日前`;

    const valueElement = document.createElement("div");
    valueElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_VALUE_ATTRIBUTE, "");
    valueElement.textContent = rows[0]?.point.observedDate === null || rows[0]?.point.observedDate === undefined
        ? "税込最安値"
        : `税込最安値 / 取得対象日 ${formatCompactDateForDisplay(rows[0].point.observedDate)}`;

    const detailElement = document.createElement("div");
    detailElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_ATTRIBUTE, "");
    const tableElement = document.createElement("table");
    const headElement = document.createElement("thead");
    const headRowElement = document.createElement("tr");
    for (const label of ["施設", "部屋タイプ", "価格", "前回差分", "自社との差"]) {
        const cellElement = document.createElement("th");
        cellElement.scope = "col";
        cellElement.textContent = label;
        headRowElement.append(cellElement);
    }
    headElement.append(headRowElement);

    const bodyElement = document.createElement("tbody");
    for (const row of rows) {
        const rowElement = document.createElement("tr");
        const facilityElement = document.createElement("td");
        facilityElement.append(createPriceSeriesFacilityLabel(row.facility));
        const roomTypeElement = document.createElement("td");
        roomTypeElement.textContent = formatPriceTrendRoomTypeForDisplay(row.point.roomType);
        const priceElement = document.createElement("td");
        priceElement.textContent = formatPriceForDisplay(row.point.price);
        const previousDeltaElement = document.createElement("td");
        previousDeltaElement.textContent = row.previousDelta === null ? "前回なし" : formatSignedPriceForDisplay(row.previousDelta);
        previousDeltaElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_TONE_ATTRIBUTE, getCompetitorPriceDeltaTone(row.previousDelta));
        const ownDeltaElement = document.createElement("td");
        ownDeltaElement.textContent = row.ownDelta === null ? "-" : formatSignedPriceForDisplay(row.ownDelta);
        ownDeltaElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_TONE_ATTRIBUTE, getCompetitorPriceDeltaTone(row.ownDelta));
        rowElement.append(facilityElement, roomTypeElement, priceElement, previousDeltaElement, ownDeltaElement);
        bodyElement.append(rowElement);
    }
    tableElement.append(headElement, bodyElement);
    detailElement.append(tableElement);

    tooltipElement.replaceChildren(titleElement, valueElement, detailElement);
    positionCompetitorPriceTooltip(tooltipElement, x, width, cursorClientX);
}

function createPriceSeriesFacilityLabel(facility: CompetitorPriceFacilitySeries): HTMLElement {
    const labelElement = document.createElement("span");
    labelElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_FACILITY_ATTRIBUTE, "");
    const swatchElement = document.createElement("span");
    swatchElement.setAttribute(SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_SWATCH_ATTRIBUTE, "");
    swatchElement.style.backgroundColor = facility.color;
    labelElement.append(swatchElement, document.createTextNode(facility.name));
    return labelElement;
}

function positionCompetitorPriceTooltip(
    tooltipElement: HTMLElement,
    x: number,
    chartViewBoxWidth: number,
    cursorClientX: number | null
): void {
    const panelRect = tooltipElement.parentElement?.getBoundingClientRect();
    const panelWidth = panelRect?.width ?? chartViewBoxWidth;
    const scale = chartViewBoxWidth > 0 ? panelWidth / chartViewBoxWidth : 1;
    const panelViewportLeft = panelRect?.left ?? 0;
    const xInPanel = cursorClientX === null ? x * scale : cursorClientX - panelViewportLeft;
    const rightSideLeft = xInPanel + COMPETITOR_PRICE_TOOLTIP_OFFSET_X;
    const tooltipWidth = tooltipElement.offsetWidth;
    const viewportRight = window.innerWidth - COMPETITOR_PRICE_TOOLTIP_OFFSET_X;
    const viewportConstrainedLeft = viewportRight - tooltipWidth - panelViewportLeft;
    tooltipElement.style.left = `${Math.max(COMPETITOR_PRICE_TOOLTIP_OFFSET_X, Math.min(rightSideLeft, viewportConstrainedLeft))}px`;
}

function hideCompetitorPriceTooltip(tooltipElement: HTMLElement, guideLineElement: SVGLineElement): void {
    tooltipElement.setAttribute(SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE, "false");
    guideLineElement.setAttribute("visibility", "hidden");
}

function buildCompetitorPriceFacilities(record: CompetitorPriceSnapshotRecord): Array<{ yadNo: string; name: string }> {
    const facilities: Array<{ yadNo: string; name: string }> = [];
    if (record.payload.own !== null) {
        facilities.push({ yadNo: record.payload.own.yadNo, name: "自社" });
    }
    for (const competitor of record.competitorSet) {
        facilities.push({ yadNo: competitor.yadNo, name: competitor.name });
    }
    return facilities;
}

type CompetitorPriceMinimumByFacility = Map<string, { price: number; roomType: string | null }>;

function buildMinimumCompetitorPricesByGuestCount(
    record: CompetitorPriceSnapshotRecord,
    roomTypeFilter: string | null,
    mealTypeFilter: string | null
): Map<number, CompetitorPriceMinimumByFacility> {
    const minimumPricesByGuestCount = new Map<number, CompetitorPriceMinimumByFacility>();
    for (const plan of flattenCompetitorPricePlansWithOwn(record)) {
        if (
            plan.price === null
            || plan.numGuests === null
            || (roomTypeFilter !== null && formatRoomTypeForDisplay(plan.jalanFacilityRoomType ?? "") !== roomTypeFilter)
            || (mealTypeFilter !== null && plan.mealType !== mealTypeFilter)
        ) {
            continue;
        }

        const minimumPrices = minimumPricesByGuestCount.get(plan.numGuests) ?? new Map();
        const currentPrice = minimumPrices.get(plan.yadNo);
        if (currentPrice === undefined || plan.price < currentPrice.price) {
            minimumPrices.set(plan.yadNo, {
                price: plan.price,
                roomType: plan.jalanFacilityRoomType
            });
        }
        minimumPricesByGuestCount.set(plan.numGuests, minimumPrices);
    }
    return minimumPricesByGuestCount;
}

function flattenCompetitorPricePlansWithOwn(record: CompetitorPriceSnapshotRecord): CompetitorPriceSnapshotPlan[] {
    const plans: CompetitorPriceSnapshotPlan[] = [];
    plans.push(...(record.payload.own?.plans ?? []));
    for (const hotel of record.payload.competitors) {
        plans.push(...hotel.plans);
    }
    return plans;
}

function getCompetitorPriceChartLayout(fetchDateCount: number, plotLeft: number, plotWidth: number): CompetitorPriceChartLayout {
    const activeWidth = fetchDateCount >= 7
        ? plotWidth
        : Math.min(plotWidth, Math.max(160, (Math.max(2, fetchDateCount) - 1) * 140));
    return {
        plotLeft,
        plotWidth,
        activeLeft: plotLeft + (plotWidth - activeWidth) / 2,
        activeWidth
    };
}

function buildCompetitorPriceYAxisTicks(yMin: number, yMax: number): number[] {
    if (yMax <= yMin) {
        return [yMin];
    }

    const tickCount = 5;
    const step = (yMax - yMin) / (tickCount - 1);
    const roundedTicks = Array.from({ length: tickCount }, (_, index) => Math.round((yMax - step * index) / 100) * 100);
    if (new Set(roundedTicks).size === tickCount) {
        return roundedTicks;
    }

    return Array.from({ length: tickCount }, (_, index) => Math.round(yMax - step * index));
}

function getCompetitorPriceDeltaTone(delta: number | null): "negative" | "neutral" | "positive" {
    if (delta === null || delta === 0) {
        return "neutral";
    }

    return delta < 0 ? "negative" : "positive";
}

function getCompetitorPriceChartX(index: number, count: number, layout: CompetitorPriceChartLayout): number {
    return count <= 1
        ? layout.activeLeft + layout.activeWidth / 2
        : layout.activeLeft + (layout.activeWidth * index) / (count - 1);
}

function getCompetitorPriceChartHitboxX(index: number, count: number, layout: CompetitorPriceChartLayout): number {
    if (count <= 1) {
        return layout.activeLeft;
    }

    const stepWidth = layout.activeWidth / Math.max(1, count - 1);
    return Math.max(layout.plotLeft, getCompetitorPriceChartX(index, count, layout) - stepWidth / 2);
}

function getCompetitorPriceChartHitboxWidth(count: number, layout: CompetitorPriceChartLayout): number {
    if (count <= 1) {
        return layout.activeWidth;
    }

    return layout.activeWidth / Math.max(1, count - 1);
}

function getCompetitorPriceChartY(price: number, minPrice: number, maxPrice: number, paddingTop: number, plotHeight: number): number {
    if (minPrice === maxPrice) {
        return paddingTop + plotHeight / 2;
    }
    return paddingTop + plotHeight - ((price - minPrice) / (maxPrice - minPrice)) * plotHeight;
}

function formatCompetitorPriceFetchDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value.slice(0, 10);
    }

    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatMealTypeForDisplay(value: string): string {
    const labels: Record<string, string> = {
        NONE: "素泊まり",
        BREAKFAST: "朝食",
        DINNER: "夕食",
        BREAKFAST_DINNER: "朝夕食"
    };
    return labels[value] ?? value;
}

function formatRoomTypeForDisplay(value: string): string {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue.includes("four_beds") || normalizedValue.includes("4_beds") || normalizedValue.includes("quad") || normalizedValue.includes("フォース")) {
        return "フォース";
    }
    if (normalizedValue.includes("single") || normalizedValue.includes("シングル")) {
        return "シングル";
    }
    if (normalizedValue.includes("semi_double") || normalizedValue.includes("semidouble") || normalizedValue.includes("セミダブル")) {
        return "セミダブル";
    }
    if (normalizedValue.includes("double") || normalizedValue.includes("ダブル")) {
        return "ダブル";
    }
    if (normalizedValue.includes("twin") || normalizedValue.includes("ツイン")) {
        return "ツイン";
    }
    if (normalizedValue.includes("triple") || normalizedValue.includes("トリプル")) {
        return "トリプル";
    }
    if (normalizedValue.includes("suite") || normalizedValue.includes("スイート")) {
        return "スイート";
    }
    if (normalizedValue.includes("和室")) {
        return "和室";
    }
    if (
        normalizedValue.includes("wayoushitsu")
        || normalizedValue.includes("wayo")
        || normalizedValue.includes("和洋")
    ) {
        return "和洋室";
    }
    return value;
}

function compareCompetitorPriceRoomTypeLabels(left: string, right: string): number {
    const displayOrder = ["シングル", "セミダブル", "ダブル", "ツイン", "トリプル", "フォース", "和室", "和洋室"];
    const leftIndex = displayOrder.indexOf(left);
    const rightIndex = displayOrder.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? displayOrder.length : leftIndex)
            - (rightIndex === -1 ? displayOrder.length : rightIndex);
    }
    return left.localeCompare(right, "ja");
}

function formatSignedPriceForDisplay(value: number): string {
    if (value > 0) {
        return `+${value.toLocaleString("ja-JP")}円`;
    }
    return `${value.toLocaleString("ja-JP")}円`;
}

function resolveSalesSettingSectionContainer(card: SalesSettingCard): HTMLElement | null {
    if (card.cardElement.hasAttribute(SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE)) {
        return ensureCurrentUiSupplementsElement();
    }

    return card.cardElement.parentElement;
}

function resolveSalesSettingSectionInsertionAnchor(card: SalesSettingCard): HTMLElement | null {
    if (card.cardElement.hasAttribute(SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE)) {
        return null;
    }

    return card.cardElement;
}

function renderSalesSettingGroupRoom(
    card: SalesSettingCard,
    currentOverallRoomCount: number | null,
    previousDayOverallRoomCount: number | null,
    previousWeekOverallRoomCount: number | null,
    previousMonthOverallRoomCount: number | null,
    currentIndividualRoomCount: number | null,
    previousDayIndividualRoomCount: number | null,
    previousWeekIndividualRoomCount: number | null,
    previousMonthIndividualRoomCount: number | null,
    currentGroupRoomCount: number | null,
    previousDayGroupRoomCount: number | null,
    previousWeekGroupRoomCount: number | null,
    previousMonthGroupRoomCount: number | null,
    curveData: SalesSettingBookingCurveRenderData | null = null
): void {
    const existingRow = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`);

    if (
        currentOverallRoomCount === null
        && previousDayOverallRoomCount === null
        && previousWeekOverallRoomCount === null
        && previousMonthOverallRoomCount === null
        &&
        currentIndividualRoomCount === null
        && previousDayIndividualRoomCount === null
        && previousWeekIndividualRoomCount === null
        && previousMonthIndividualRoomCount === null
        &&
        currentGroupRoomCount === null
        && previousDayGroupRoomCount === null
        && previousWeekGroupRoomCount === null
        && previousMonthGroupRoomCount === null
    ) {
        existingRow?.remove();
        clearSalesSettingBookingCurveCard(card);
        return;
    }

    const signature = [
        currentOverallRoomCount,
        previousDayOverallRoomCount,
        previousWeekOverallRoomCount,
        previousMonthOverallRoomCount,
        currentIndividualRoomCount,
        previousDayIndividualRoomCount,
        previousWeekIndividualRoomCount,
        previousMonthIndividualRoomCount,
        currentGroupRoomCount,
        previousDayGroupRoomCount,
        previousWeekGroupRoomCount,
        previousMonthGroupRoomCount
    ].join(":");
    if (existingRow?.getAttribute(SALES_SETTING_GROUP_ROOM_ROW_SIGNATURE_ATTRIBUTE) === signature) {
        renderSalesSettingBookingCurveCard(
            card,
            currentOverallRoomCount,
            resolveSalesSettingBookingCurveSecondaryCurrentRoomCount(currentIndividualRoomCount, currentGroupRoomCount),
            curveData
        );
        return;
    }

    const rowElement = existingRow ?? document.createElement("table");
    rowElement.setAttribute(SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE, "");
    rowElement.setAttribute(SALES_SETTING_GROUP_ROOM_ROW_SIGNATURE_ATTRIBUTE, signature);

    const headElement = document.createElement("thead");
    const headerRowElement = document.createElement("tr");
    for (const label of ["区分", "室数", "1日前", "7日前", "30日前"]) {
        const headerCellElement = document.createElement("th");
        headerCellElement.scope = "col";
        headerCellElement.textContent = label;
        headerRowElement.append(headerCellElement);
    }
    headElement.append(headerRowElement);

    const bodyElement = document.createElement("tbody");
    bodyElement.append(
        createSalesSettingOverallSummaryRow(
            "全体",
            formatCompactMetricValue(currentOverallRoomCount),
            formatCompactMetricDelta(currentOverallRoomCount, previousDayOverallRoomCount),
            formatCompactMetricDelta(currentOverallRoomCount, previousWeekOverallRoomCount),
            formatCompactMetricDelta(currentOverallRoomCount, previousMonthOverallRoomCount),
            getGroupRoomDeltaTone(currentOverallRoomCount, previousDayOverallRoomCount),
            getGroupRoomDeltaTone(currentOverallRoomCount, previousWeekOverallRoomCount),
            getGroupRoomDeltaTone(currentOverallRoomCount, previousMonthOverallRoomCount),
            true
        ),
        createSalesSettingOverallSummaryRow(
            "個人",
            formatCompactMetricValue(currentIndividualRoomCount),
            formatCompactMetricDelta(currentIndividualRoomCount, previousDayIndividualRoomCount),
            formatCompactMetricDelta(currentIndividualRoomCount, previousWeekIndividualRoomCount),
            formatCompactMetricDelta(currentIndividualRoomCount, previousMonthIndividualRoomCount),
            getGroupRoomDeltaTone(currentIndividualRoomCount, previousDayIndividualRoomCount),
            getGroupRoomDeltaTone(currentIndividualRoomCount, previousWeekIndividualRoomCount),
            getGroupRoomDeltaTone(currentIndividualRoomCount, previousMonthIndividualRoomCount)
        ),
        createSalesSettingOverallSummaryRow(
            "団体",
            formatCompactMetricValue(currentGroupRoomCount),
            formatCompactMetricDelta(currentGroupRoomCount, previousDayGroupRoomCount),
            formatCompactMetricDelta(currentGroupRoomCount, previousWeekGroupRoomCount),
            formatCompactMetricDelta(currentGroupRoomCount, previousMonthGroupRoomCount),
            getGroupRoomDeltaTone(currentGroupRoomCount, previousDayGroupRoomCount),
            getGroupRoomDeltaTone(currentGroupRoomCount, previousWeekGroupRoomCount),
            getGroupRoomDeltaTone(currentGroupRoomCount, previousMonthGroupRoomCount)
        )
    );

    rowElement.replaceChildren(headElement, bodyElement);

    if (existingRow === null) {
        if (card.detailWrapperElement !== null) {
            card.cardElement.insertBefore(rowElement, card.detailWrapperElement);
        } else {
            card.cardElement.append(rowElement);
        }
    }

    renderSalesSettingBookingCurveCard(
        card,
        currentOverallRoomCount,
        resolveSalesSettingBookingCurveSecondaryCurrentRoomCount(currentIndividualRoomCount, currentGroupRoomCount),
        curveData
    );
}

function renderSalesSettingRankDetail(card: SalesSettingCard, summary: SalesSettingRankSummary | null): void {
    const latestReflectionContainer = card.latestReflectionElement?.parentElement;
    const existingDetail = latestReflectionContainer?.querySelector<HTMLElement>(`[${SALES_SETTING_RANK_DETAIL_ATTRIBUTE}]`) ?? null;
    const detailText = getSalesSettingRankDetailText(summary);

    if (latestReflectionContainer == null || detailText === null) {
        existingDetail?.remove();
        return;
    }

    if (summary === null) {
        existingDetail?.remove();
        return;
    }

    const signature = `${summary.latestReflectionAt}:${summary.beforeRankName}:${summary.afterRankName}`;
    if (existingDetail?.getAttribute(SALES_SETTING_RANK_DETAIL_SIGNATURE_ATTRIBUTE) === signature) {
        return;
    }

    const detailElement = existingDetail ?? document.createElement("div");
    detailElement.setAttribute(SALES_SETTING_RANK_DETAIL_ATTRIBUTE, "");
    detailElement.setAttribute(SALES_SETTING_RANK_DETAIL_SIGNATURE_ATTRIBUTE, signature);
    detailElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, getSalesSettingRankTone());
    detailElement.textContent = detailText;

    if (existingDetail === null) {
        latestReflectionContainer.append(detailElement);
    }
}

function createSalesSettingOverallSummaryRow(
    label: string,
    roomValue: string,
    previousDayValue: string,
    previousWeekValue: string,
    previousMonthValue: string,
    previousDayTone: string,
    previousWeekTone: string,
    previousMonthTone: string,
    emphasize = false
): HTMLTableRowElement {
    const rowElement = document.createElement("tr");
    rowElement.setAttribute(SALES_SETTING_OVERALL_ROW_ATTRIBUTE, "");
    if (emphasize) {
        rowElement.setAttribute(SALES_SETTING_OVERALL_EMPHASIS_ATTRIBUTE, "true");
    }

    const labelElement = document.createElement("th");
    labelElement.scope = "row";
    labelElement.setAttribute(SALES_SETTING_OVERALL_LABEL_ATTRIBUTE, "");
    labelElement.textContent = label;

    const roomElement = document.createElement("td");
    roomElement.setAttribute(SALES_SETTING_OVERALL_VALUE_ATTRIBUTE, "");
    roomElement.textContent = roomValue;

    const previousDayElement = document.createElement("td");
    previousDayElement.setAttribute(SALES_SETTING_OVERALL_VALUE_ATTRIBUTE, "");
    previousDayElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, previousDayTone);
    previousDayElement.textContent = previousDayValue;

    const previousWeekElement = document.createElement("td");
    previousWeekElement.setAttribute(SALES_SETTING_OVERALL_VALUE_ATTRIBUTE, "");
    previousWeekElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, previousWeekTone);
    previousWeekElement.textContent = previousWeekValue;

    const previousMonthElement = document.createElement("td");
    previousMonthElement.setAttribute(SALES_SETTING_OVERALL_VALUE_ATTRIBUTE, "");
    previousMonthElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, previousMonthTone);
    previousMonthElement.textContent = previousMonthValue;

    rowElement.replaceChildren(labelElement, roomElement, previousDayElement, previousWeekElement, previousMonthElement);
    return rowElement;
}

function formatCompactMetricValue(value: number | null): string {
    if (value === null) {
        return "-";
    }

    return formatGroupRoomNumber(value);
}

function resolveSalesSettingPrivateRoomCount(
    transientValue: number | null,
    totalValue: number | null,
    groupValue: number | null
): number | null {
    if (transientValue !== null) {
        return transientValue;
    }

    if (totalValue === null || groupValue === null) {
        return null;
    }

    return totalValue - groupValue;
}

function formatCompactMetricDelta(currentValue: number | null, previousValue: number | null): string {
    const delta = getMetricDelta(currentValue, previousValue);
    if (delta === null) {
        return "-";
    }

    const prefix = delta > 0 ? "+" : "";
    return `${prefix}${formatGroupRoomNumber(delta)}`;
}

function getGroupRoomDeltaTone(currentValue: number | null, previousValue: number | null): string {
    return getMetricDeltaTone(currentValue, previousValue);
}

function getMetricDeltaTone(currentValue: number | null, previousValue: number | null): string {
    const delta = getMetricDelta(currentValue, previousValue);
    if (delta === null || delta === 0) {
        return "neutral";
    }

    return delta > 0 ? "positive" : "negative";
}

function getMetricDelta(currentValue: number | null, previousValue: number | null): number | null {
    if (currentValue === null || previousValue === null) {
        return null;
    }

    return currentValue - previousValue;
}

function sumMetricValues(values: Array<number | null>): number | null {
    let total = 0;

    for (const value of values) {
        if (value === null) {
            return null;
        }

        total += value;
    }

    return total;
}

function sumSalesSettingRoomCapacities(cards: SalesSettingCard[]): SalesSettingRoomCapacity | null {
    let currentValue = 0;
    let maxValue = 0;

    for (const card of cards) {
        const capacity = parseSalesSettingRoomCapacity(card.roomCountSummaryElement);
        if (capacity === null) {
            return null;
        }

        currentValue += capacity.currentValue;
        maxValue += capacity.maxValue;
    }

    return {
        currentValue,
        maxValue
    };
}

function parseSalesSettingRoomCapacity(element: HTMLElement | null): SalesSettingRoomCapacity | null {
    if (element?.hasAttribute(SALES_SETTING_CURRENT_UI_CAPACITY_MAX_ATTRIBUTE)) {
        return null;
    }

    const text = element?.textContent ?? "";
    const match = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(text);
    if (match === null) {
        return null;
    }

    const currentValue = Number(match[1]);
    const maxValue = Number(match[2]);
    if (!Number.isFinite(currentValue) || !Number.isFinite(maxValue)) {
        return null;
    }

    return {
        currentValue,
        maxValue
    };
}

function resolveSalesSettingBookingCurveCapacity(element: HTMLElement | null): SalesSettingRoomCapacity | null {
    const parsedCapacity = parseSalesSettingRoomCapacity(element);
    if (parsedCapacity !== null) {
        return parsedCapacity;
    }

    const maxValue = Number(element?.getAttribute(SALES_SETTING_CURRENT_UI_CAPACITY_MAX_ATTRIBUTE));
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
        return null;
    }

    return {
        currentValue: maxValue,
        maxValue
    };
}

function formatSalesSettingCapacity(capacity: SalesSettingRoomCapacity | null): string {
    if (capacity === null) {
        return "- / -";
    }

    return `${formatGroupRoomNumber(capacity.currentValue)} / ${formatGroupRoomNumber(capacity.maxValue)}`;
}

function buildSalesSettingRankSummaries(
    cards: SalesSettingCard[],
    statuses: LincolnSuggestStatus[],
    preparedData: SalesSettingPreparedData | null = null
): SalesSettingRankSummary[] {
    const latestStatusByRoomGroupName = new Map<string, LincolnSuggestStatus>();
    const metricByRoomGroupName = new Map(
        preparedData?.cardMetrics.map((metric) => [metric.roomGroupName, metric.metrics]) ?? []
    );

    for (const status of statuses.slice().sort(compareLincolnSuggestStatuses)) {
        const roomGroupName = status.rm_room_group_name?.trim();
        if (roomGroupName === undefined || roomGroupName === "") {
            continue;
        }

        if (!latestStatusByRoomGroupName.has(roomGroupName)) {
            latestStatusByRoomGroupName.set(roomGroupName, status);
        }
    }

    return cards.flatMap((card, index) => {
        const status = latestStatusByRoomGroupName.get(card.roomGroupName);
        if (status === undefined) {
            return [];
        }

        const latestReflectionAt = getLincolnSuggestStatusTimestamp(status);
        const reflectedDateKey = getDateKeyFromTimestamp(latestReflectionAt);
        const metrics = metricByRoomGroupName.get(card.roomGroupName) ?? null;
        return [{
            roomGroupName: card.roomGroupName,
            displayOrder: index,
            latestReflectionAt,
            latestReflectionDaysAgo: getDaysAgo(latestReflectionAt),
            beforeRankName: status.before_price_rank_name ?? null,
            afterRankName: status.after_price_rank_name ?? null,
            roomDelta: resolveSalesSettingRankSummaryDelta(metrics?.bookingCurveData ?? null, metrics?.allMetrics.currentValue ?? null, reflectedDateKey)
        }];
    });
}

function resolveSalesSettingRankSummaryDelta(
    bookingCurveData: BookingCurveResponse | null,
    currentValue: number | null,
    reflectedDateKey: string | null
): number | null {
    if (bookingCurveData === null || currentValue === null || reflectedDateKey === null) {
        return null;
    }

    return getMetricDelta(currentValue, findBookingCurveCount(bookingCurveData, reflectedDateKey, "all"));
}

function buildSalesSettingRankHistoryByRoomGroup(
    statuses: LincolnSuggestStatus[],
    stayDate: string
): Map<string, SalesSettingRankHistoryEvent[]> {
    const historyByRoomGroup = new Map<string, SalesSettingRankHistoryEvent[]>();
    const latestStatusByRoomAndDate = new Set<string>();
    const targetStayDateKey = toCompactDateKey(stayDate);
    if (targetStayDateKey === null) {
        return historyByRoomGroup;
    }

    for (const status of statuses.slice().sort(compareLincolnSuggestStatuses)) {
        const statusStayDateKey = toCompactDateKey(status.date ?? "");
        if (statusStayDateKey !== targetStayDateKey) {
            continue;
        }

        const roomGroupName = status.rm_room_group_name?.trim();
        if (roomGroupName === undefined || roomGroupName === "") {
            continue;
        }

        const reflectedAt = getLincolnSuggestStatusTimestamp(status);
        const reflectedDateKey = getDateKeyFromTimestamp(reflectedAt);
        if (reflectedAt === null || reflectedDateKey === null) {
            continue;
        }

        const daysBeforeStay = getDaysBetweenDateKeys(stayDate, reflectedDateKey);
        if (daysBeforeStay === null || daysBeforeStay < 0 || daysBeforeStay > 360) {
            continue;
        }

        const transition = formatSalesSettingRankTransition(status.before_price_rank_name ?? null, status.after_price_rank_name ?? null);
        if (transition === "-") {
            continue;
        }

        const dailyKey = `${roomGroupName}:${reflectedDateKey}`;
        if (latestStatusByRoomAndDate.has(dailyKey)) {
            continue;
        }

        latestStatusByRoomAndDate.add(dailyKey);

        const events = historyByRoomGroup.get(roomGroupName) ?? [];
        events.push({
            reflectedAt,
            reflectedDateKey,
            daysBeforeStay,
            beforeRankName: status.before_price_rank_name ?? null,
            afterRankName: status.after_price_rank_name ?? null,
            reflectorName: status.reflector_name ?? null,
            signature: `${reflectedDateKey}:${status.before_price_rank_name ?? "-"}:${status.after_price_rank_name ?? "-"}:${status.reflector_name ?? "-"}`
        });
        historyByRoomGroup.set(roomGroupName, events);
    }

    for (const events of historyByRoomGroup.values()) {
        events.sort((left, right) => right.daysBeforeStay - left.daysBeforeStay);
    }

    return historyByRoomGroup;
}

function getDateKeyFromTimestamp(value: string | null): string | null {
    if (value === null) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function getDaysBetweenDateKeys(laterDateKey: string, earlierDateKey: string): number | null {
    const laterYear = Number(laterDateKey.slice(0, 4));
    const laterMonth = Number(laterDateKey.slice(4, 6));
    const laterDay = Number(laterDateKey.slice(6, 8));
    const earlierYear = Number(earlierDateKey.slice(0, 4));
    const earlierMonth = Number(earlierDateKey.slice(4, 6));
    const earlierDay = Number(earlierDateKey.slice(6, 8));

    if (
        !Number.isFinite(laterYear) || !Number.isFinite(laterMonth) || !Number.isFinite(laterDay)
        || !Number.isFinite(earlierYear) || !Number.isFinite(earlierMonth) || !Number.isFinite(earlierDay)
    ) {
        return null;
    }

    const laterDate = Date.UTC(laterYear, laterMonth - 1, laterDay);
    const earlierDate = Date.UTC(earlierYear, earlierMonth - 1, earlierDay);
    return Math.round((laterDate - earlierDate) / 86400000);
}

function getDaysBetweenDashedDateKeys(laterDateKey: string, earlierDateKey: string): number | null {
    return getDaysBetweenDateKeys(laterDateKey.replace(/-/g, ""), earlierDateKey.replace(/-/g, ""));
}

function getDaysAgo(value: string | null): number | null {
    if (value === null) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const currentDate = new Date();
    const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((currentDay.getTime() - targetDay.getTime()) / 86400000);

    return diffDays < 0 ? 0 : diffDays;
}

function formatSalesSettingDaysAgo(value: number | null): string {
    if (value === null) {
        return "-";
    }

    return `${value}日前`;
}

function formatSalesSettingRankTransition(beforeRankName: string | null, afterRankName: string | null): string {
    if (beforeRankName === null && afterRankName === null) {
        return "-";
    }

    if (beforeRankName === null) {
        return afterRankName ?? "-";
    }

    if (afterRankName === null || afterRankName === beforeRankName) {
        return beforeRankName;
    }

    return `${beforeRankName}→${afterRankName}`;
}

function getSalesSettingRankTone(): string {
    return "neutral";
}

function getSalesSettingRankDetailText(summary: SalesSettingRankSummary | null): string | null {
    if (summary === null) {
        return null;
    }

    const value = formatSalesSettingRankTransition(summary.beforeRankName, summary.afterRankName);
    if (value === "-") {
        return null;
    }

    return `ランク：${value}`;
}

function compareSalesSettingRankSummaries(left: SalesSettingRankSummary, right: SalesSettingRankSummary): number {
    return left.displayOrder - right.displayOrder;
}

function compareLincolnSuggestStatuses(left: LincolnSuggestStatus, right: LincolnSuggestStatus): number {
    return getLincolnSuggestStatusSortValue(right) - getLincolnSuggestStatusSortValue(left);
}

function getLincolnSuggestStatusTimestamp(status: LincolnSuggestStatus): string | null {
    return status.accepted_at ?? status.completed_at ?? status.suggest_calc_datetime ?? null;
}

function getLincolnSuggestStatusSortValue(status: LincolnSuggestStatus): number {
    const timestamp = getLincolnSuggestStatusTimestamp(status);
    if (timestamp === null) {
        return 0;
    }

    const value = Date.parse(timestamp);
    return Number.isNaN(value) ? 0 : value;
}

function formatGroupRoomNumber(value: number): string {
    if (Number.isInteger(value)) {
        return String(value);
    }

    return value.toFixed(1).replace(/\.0$/, "");
}

function renderGroupRoomCount(cell: MonthlyCalendarCell, groupRoomCount: number | null): void {
    const existingBadge = cell.containerElement.querySelector<HTMLElement>(`[${GROUP_ROOM_BADGE_ATTRIBUTE}]`);

    if (groupRoomCount === null) {
        if (
            existingBadge === null
            && !cell.containerElement.hasAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE)
            && !cell.roomElement.hasAttribute(GROUP_ROOM_ROOM_ATTRIBUTE)
            && (cell.indicatorElement === null || !cell.indicatorElement.hasAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE))
        ) {
            return;
        }

        existingBadge?.remove();
        if (cell.containerElement.hasAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE)) {
            cell.containerElement.removeAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE);
        }
        if (cell.roomElement.hasAttribute(GROUP_ROOM_ROOM_ATTRIBUTE)) {
            cell.roomElement.removeAttribute(GROUP_ROOM_ROOM_ATTRIBUTE);
        }
        if (cell.indicatorElement?.hasAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE)) {
            cell.indicatorElement.removeAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE);
        }
        return;
    }

    const nextLabel = `団${groupRoomCount}`;
    const hasLayout = cell.containerElement.hasAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE);
    const hasRoomMarker = cell.roomElement.hasAttribute(GROUP_ROOM_ROOM_ATTRIBUTE);
    const hasIndicatorMarker = cell.indicatorElement === null || cell.indicatorElement.hasAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE);
    if (existingBadge?.textContent === nextLabel && hasLayout && hasRoomMarker && hasIndicatorMarker) {
        return;
    }

    if (!hasLayout) {
        cell.containerElement.setAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE, "");
    }
    if (!hasRoomMarker) {
        cell.roomElement.setAttribute(GROUP_ROOM_ROOM_ATTRIBUTE, "");
    }
    if (cell.indicatorElement !== null && !hasIndicatorMarker) {
        cell.indicatorElement.setAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE, "");
    }

    const badgeElement = existingBadge ?? document.createElement("div");
    badgeElement.setAttribute(GROUP_ROOM_BADGE_ATTRIBUTE, "");
    if (badgeElement.textContent !== nextLabel) {
        badgeElement.textContent = nextLabel;
    }

    if (existingBadge === null) {
        cell.containerElement.append(badgeElement);
    }
}

function cleanupMonthlyCalendarGroupRooms(): void {
    cleanupMonthlyCalendarLatestChanges();

    for (const badgeElement of Array.from(document.querySelectorAll<HTMLElement>(`[${GROUP_ROOM_BADGE_ATTRIBUTE}]`))) {
        badgeElement.remove();
    }

    for (const containerElement of Array.from(document.querySelectorAll<HTMLElement>(`[${GROUP_ROOM_LAYOUT_ATTRIBUTE}]`))) {
        containerElement.removeAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE);
    }

    for (const roomElement of Array.from(document.querySelectorAll<HTMLElement>(`[${GROUP_ROOM_ROOM_ATTRIBUTE}]`))) {
        roomElement.removeAttribute(GROUP_ROOM_ROOM_ATTRIBUTE);
    }

    for (const indicatorElement of Array.from(document.querySelectorAll<HTMLElement>(`[${GROUP_ROOM_INDICATOR_ATTRIBUTE}]`))) {
        indicatorElement.removeAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE);
    }
}

function cleanupSalesSettingGroupRooms(): void {
    for (const rowElement of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`))) {
        rowElement.remove();
    }
}

function cleanupSalesSettingBookingCurveCards(): void {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE}], [${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}]`))) {
        if (element.closest(`[${RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE}]`) !== null) {
            continue;
        }
        element.remove();
    }
}

function cleanupSalesSettingRoomDeltas(): void {
    for (const deltaElement of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_ROOM_DELTA_ATTRIBUTE}]`))) {
        deltaElement.remove();
    }
}

function ensureGroupRoomStyles(): void {
    const existingStyleElement = document.getElementById(GROUP_ROOM_STYLE_ID);
    if (existingStyleElement?.getAttribute("data-ra-style-version") === GROUP_ROOM_STYLE_VERSION) {
        return;
    }

    const styleElement = existingStyleElement ?? document.createElement("style");
    styleElement.id = GROUP_ROOM_STYLE_ID;
    styleElement.setAttribute("data-ra-style-version", GROUP_ROOM_STYLE_VERSION);
    styleElement.textContent = `
        [${GROUP_ROOM_LAYOUT_ATTRIBUTE}] {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            height: 36px;
            padding: 1px 2px 0 !important;
        }

        [${GROUP_ROOM_LAYOUT_ATTRIBUTE}] > [data-testid^="date-num-"] {
            align-self: flex-start;
            font-size: 13px !important;
            line-height: 14px !important;
            min-height: 14px;
        }

        [${GROUP_ROOM_ROOM_ATTRIBUTE}] {
            align-self: flex-end;
            height: 12px;
            font-size: 12px !important;
            line-height: 12px !important;
        }

        [${GROUP_ROOM_BADGE_ATTRIBUTE}] {
            align-self: flex-end;
            margin-top: 1px;
            color: #1f5fbf;
            font-size: 10px;
            font-weight: 700;
            line-height: 10px;
        }

        [${CALENDAR_LAST_CHANGE_ATTRIBUTE}] {
            position: absolute;
            left: 2px;
            bottom: 2px;
            color: #6a7e99;
            font-size: 10px;
            font-weight: 600;
            line-height: 10px;
            pointer-events: none;
            text-shadow: 0 0 2px rgba(255, 255, 255, 0.95);
            white-space: nowrap;
            z-index: 1;
        }

        [${GROUP_ROOM_TOGGLE_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            pointer-events: auto;
            position: absolute;
            top: 50%;
            right: 24px;
            transform: translateY(-50%);
            z-index: 2;
        }

        [${GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE}] {
            border: 1px solid #c2d4f4;
            border-radius: 999px;
            background: #ffffff;
            color: #456792;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
            padding: 7px 10px;
            pointer-events: auto;
            position: relative;
            z-index: 2;
        }

        [${GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE}][${GROUP_ROOM_TOGGLE_ACTIVE_ATTRIBUTE}="true"] {
            background: #eef4ff;
            border-color: #8fb2ea;
            color: #1f5fbf;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROLS_ATTRIBUTE}] {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            align-items: start;
            gap: 6px 10px;
            margin: 10px 0 8px;
            padding: 10px;
            border: 1px solid #d6e2ee;
            border-radius: 8px;
            background: #f8fbff;
            box-shadow: 0 1px 3px rgba(35, 52, 71, 0.06);
            max-width: 100%;
            box-sizing: border-box;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_TITLE_ATTRIBUTE}] {
            grid-column: 1;
            grid-row: 1;
            color: #344a62;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.2;
            white-space: nowrap;
        }

        [${SALES_SETTING_WARM_CACHE_HIDDEN_TAB_TOGGLE_ATTRIBUTE}] {
            grid-column: 1;
            grid-row: 2;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            width: fit-content;
            padding: 6px 8px;
            border: 1px solid #c5d3ea;
            border-radius: 6px;
            background: #ffffff;
            color: #34425a;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.2;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }

        [${SALES_SETTING_WARM_CACHE_HIDDEN_TAB_TOGGLE_ATTRIBUTE}] input {
            width: 14px;
            height: 14px;
            margin: 0;
            flex: 0 0 auto;
            accent-color: #315b8d;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_ACTIONS_ATTRIBUTE}] {
            grid-column: 2;
            grid-row: 1;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
            align-items: stretch;
            gap: 8px;
            min-width: 0;
            width: 100%;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 5px;
            min-width: 0;
            min-height: 58px;
            padding: 6px;
            border: 1px solid #dde7f1;
            border-radius: 7px;
            background: #ffffff;
            box-sizing: border-box;
            color: #50627a;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.2;
            overflow: hidden;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_BUTTON_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            min-width: 0;
            min-height: 28px;
            padding: 0 8px;
            border: 1px solid #c9d7e8;
            border-radius: 6px;
            background: #f9fbff;
            color: #243447;
            cursor: pointer;
            font: inherit;
            font-weight: 800;
            box-shadow: none;
            white-space: nowrap;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_SUMMARY_ATTRIBUTE}] {
            display: inline-flex;
            flex: 0 0 auto;
            flex-direction: column;
            align-items: stretch;
            gap: 3px;
            width: 100%;
            min-width: 0;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 18px;
            padding: 0 7px;
            border: 1px solid #c8d7e8;
            border-radius: 999px;
            background: #eef5fc;
            color: #315b8d;
            font-size: 11px;
            font-weight: 800;
            line-height: 1.2;
            white-space: nowrap;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_BUTTON_ATTRIBUTE}]:hover,
        [${SALES_SETTING_WARM_CACHE_MONTH_BUTTON_ATTRIBUTE}]:focus-visible {
            border-color: #7aa7dc;
            background: #f4f9ff;
            outline: none;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_PROGRESS_ATTRIBUTE}] {
            display: block;
            width: 100%;
            height: 5px;
            border-radius: 999px;
            background:
                linear-gradient(90deg, #3f8ed8 var(--ra-sales-setting-warm-cache-month-progress, 0%), #d9e3f0 0);
            flex: 0 0 auto;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="idle"] [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE}] {
            border-color: #d7e0ea;
            background: #f3f6f9;
            color: #596a7c;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="queued"] [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE}] {
            border-color: #d6c5a4;
            background: #fff7e8;
            color: #8a5f15;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="running"] [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE}] {
            border-color: #b9d2ed;
            background: #edf6ff;
            color: #315b8d;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="complete"] [${SALES_SETTING_WARM_CACHE_MONTH_PROGRESS_ATTRIBUTE}] {
            background:
                linear-gradient(90deg, #2f9e63 100%, #d9e3f0 0);
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="complete"] [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE}] {
            border-color: #b8ddc7;
            background: #edf8f1;
            color: #24734b;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="error"] [${SALES_SETTING_WARM_CACHE_MONTH_PROGRESS_ATTRIBUTE}] {
            background:
                linear-gradient(90deg, #c44f4f 100%, #d9e3f0 0);
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="error"] [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE}] {
            border-color: #e1b9b9;
            background: #fff0f0;
            color: #9a3030;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="cooldown"] [${SALES_SETTING_WARM_CACHE_MONTH_PROGRESS_ATTRIBUTE}] {
            background:
                linear-gradient(90deg, #d49335 var(--ra-sales-setting-warm-cache-month-progress, 0%), #ead8bd 0);
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_CONTROL_ATTRIBUTE}][${SALES_SETTING_WARM_CACHE_MONTH_STATUS_ATTRIBUTE}="cooldown"] [${SALES_SETTING_WARM_CACHE_MONTH_STATUS_LABEL_ATTRIBUTE}] {
            border-color: #ddc394;
            background: #fff5e4;
            color: #8a5f15;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] {
            width: fit-content;
            max-width: 100%;
            border-collapse: collapse;
            margin: 4px 0 10px;
            user-select: text;
            -webkit-user-select: text;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] th,
        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] td {
            padding: 1px 16px 1px 0;
            text-align: left;
            vertical-align: top;
            white-space: nowrap;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] tr > :not(:first-child) {
            text-align: right;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] thead th {
            color: #50627a;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.35;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] th:last-child,
        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] td:last-child {
            padding-right: 0;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] [${SALES_SETTING_OVERALL_ROW_ATTRIBUTE}][${SALES_SETTING_OVERALL_EMPHASIS_ATTRIBUTE}="true"] {
            color: #243447;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] [${SALES_SETTING_OVERALL_LABEL_ATTRIBUTE}] {
            color: #243447;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
        }

        [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] [${SALES_SETTING_OVERALL_VALUE_ATTRIBUTE}] {
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
        }

        [${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 8px 0 10px;
            padding: 0;
            border: none;
            border-radius: 0;
            background: transparent;
            user-select: text;
            -webkit-user-select: text;
        }

        [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] {
            width: fit-content;
            max-width: 100%;
            border-collapse: collapse;
        }

        [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] th,
        [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] td {
            padding: 1px 16px 1px 0;
            text-align: left;
            vertical-align: top;
            white-space: nowrap;
        }

        [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] tr > :not(:first-child) {
            text-align: right;
        }

        [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] th:last-child,
        [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] td:last-child {
            padding-right: 0;
        }

        [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] thead th {
            color: #50627a;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.35;
        }

        [${SALES_SETTING_OVERALL_ROW_ATTRIBUTE}] {
            color: #50627a;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
        }

        [${SALES_SETTING_OVERALL_LABEL_ATTRIBUTE}] {
            color: #243447;
            font-weight: 700;
        }

        [${SALES_SETTING_OVERALL_VALUE_ATTRIBUTE}] {
            white-space: nowrap;
        }

        [${SALES_SETTING_OVERALL_ROW_ATTRIBUTE}][${SALES_SETTING_OVERALL_EMPHASIS_ATTRIBUTE}="true"] {
            color: #243447;
        }

        [${SALES_SETTING_OVERALL_SALES_ROW_ATTRIBUTE}] {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            column-gap: 10px;
            row-gap: 4px;
        }

        [${SALES_SETTING_OVERALL_TITLE_ATTRIBUTE}] {
            padding-left: 8px;
            border-left: 3px solid #1f5fbf;
            color: #243447;
            font-size: 18px;
            font-weight: 700;
            line-height: 1.35;
        }

        [${SALES_SETTING_OVERALL_METRIC_ATTRIBUTE}] {
            color: #243447;
            font-size: 16px;
            font-weight: 700;
            line-height: 1.4;
            white-space: nowrap;
        }

        [${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin: 14px 0 0;
            padding-top: 14px;
            border-top: 1px solid #dfe7f5;
        }

        [${SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: min(1180px, calc(100vw - 32px));
            margin: 18px auto 24px;
        }

        [${SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE}]:empty {
            display: none;
        }

        [${SALES_SETTING_WARM_CACHE_INLINE_STATUS_ATTRIBUTE}],
        [${SALES_SETTING_WARM_CACHE_MONTH_DETAIL_ATTRIBUTE}] {
            box-sizing: border-box;
            max-width: 100%;
            border: 1px solid #d6e0ec;
            border-radius: 6px;
            background: #f8fbff;
            color: #344a62;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.45;
            white-space: normal;
        }

        [${SALES_SETTING_WARM_CACHE_INLINE_STATUS_ATTRIBUTE}] {
            margin: 8px 0 10px;
            padding: 7px 9px;
        }

        [${SALES_SETTING_WARM_CACHE_MONTH_DETAIL_ATTRIBUTE}] {
            grid-column: 2;
            grid-row: 2;
            padding: 5px 7px;
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}] {
            position: absolute;
            left: 0;
            bottom: 0;
            width: var(${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_PROGRESS_PROPERTY}, 0%);
            height: 3px;
            border-radius: 999px;
            pointer-events: none;
            z-index: 2;
            transform: none;
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="partial"] > [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}] {
            background: rgba(91, 141, 239, 0.78);
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="complete"] > [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}] {
            background: rgba(47, 143, 91, 0.82);
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="error"] > [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}] {
            background: rgba(208, 79, 79, 0.82);
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="stored-current"] > [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}] {
            left: 50%;
            width: var(${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_PROGRESS_PROPERTY}, 24%);
            transform: translateX(-50%);
            background: rgba(47, 143, 91, 0.62);
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="stored-past"] > [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_BAR_ATTRIBUTE}] {
            left: 50%;
            width: var(${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_PROGRESS_PROPERTY}, 18%);
            transform: translateX(-50%);
            background: rgba(91, 110, 130, 0.42);
        }

        [${SALES_SETTING_CURRENT_UI_CARDS_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        [${SALES_SETTING_CURRENT_UI_CARD_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 12px 14px;
            border: 1px solid #dfe7f5;
            border-radius: 12px;
            background: #fafcff;
        }

        [${SALES_SETTING_CURRENT_UI_HEADING_ATTRIBUTE}] {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            justify-content: space-between;
            gap: 8px 12px;
        }

        [${SALES_SETTING_CURRENT_UI_TITLE_ATTRIBUTE}] {
            color: #243447;
            font-size: 16px;
            font-weight: 700;
            line-height: 1.4;
        }

        [${SALES_SETTING_CURRENT_UI_META_ATTRIBUTE}] {
            display: inline-flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            color: #50627a;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.4;
        }

        [${SALES_SETTING_CURRENT_UI_META_LABEL_ATTRIBUTE}] {
            color: #6a7e99;
        }

        [${SALES_SETTING_CURRENT_UI_DETAIL_WRAPPER_ATTRIBUTE}] {
            min-height: 0;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE}] {
            display: flex;
            justify-content: flex-end;
            margin: 2px 0 8px;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE}] {
            border: 1px solid #c9d7ef;
            border-radius: 999px;
            background: #ffffff;
            color: #456792;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
            padding: 7px 11px;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_TOGGLE_ACTIVE_ATTRIBUTE}="true"] {
            background: #eef4ff;
            border-color: #8fb2ea;
            color: #1f5fbf;
        }

        [${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin: 0 0 14px;
            padding: 10px 12px 12px;
            border: 1px solid #dfe7f5;
            border-radius: 12px;
            background: #fafcff;
        }

        [${SALES_SETTING_BOOKING_CURVE_HEADER_ATTRIBUTE}] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            color: #243447;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.35;
        }

        [${SALES_SETTING_BOOKING_CURVE_NOTE_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            background: #eef4ff;
            color: #5878a5;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            padding: 5px 8px;
            white-space: nowrap;
        }

        [${SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_GROUP_ATTRIBUTE}],
        [${SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_GROUP_ATTRIBUTE}],
        [${SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_GROUP_ATTRIBUTE}] {
            display: inline-flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 4px;
        }

        [${SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_GROUP_ATTRIBUTE}] {
            margin-left: auto;
        }

        [${SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_GROUP_ATTRIBUTE}],
        [${SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_GROUP_ATTRIBUTE}] {
            margin-left: 4px;
        }

        [${SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_ATTRIBUTE}],
        [${SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_ATTRIBUTE}],
        [${SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_ATTRIBUTE}] {
            border: 1px solid #d4deed;
            border-radius: 999px;
            background: #ffffff;
            color: #58708f;
            cursor: pointer;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            padding: 5px 8px;
            white-space: nowrap;
        }

        [${SALES_SETTING_BOOKING_CURVE_SEGMENT_TOGGLE_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_SEGMENT_ACTIVE_ATTRIBUTE}="true"],
        [${SALES_SETTING_BOOKING_CURVE_HELPER_TOGGLE_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_HELPER_ACTIVE_ATTRIBUTE}="true"],
        [${SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_REFERENCE_ACTIVE_ATTRIBUTE}="true"] {
            background: #f7fbff;
            border-color: #9fb7d4;
            color: #243447;
        }

        [${SALES_SETTING_BOOKING_CURVE_LEGEND_ATTRIBUTE}] {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 12px;
            color: #58708f;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.2;
        }

        [${SALES_SETTING_BOOKING_CURVE_LEGEND_ITEM_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
        }

        [${SALES_SETTING_BOOKING_CURVE_LEGEND_ITEM_ATTRIBUTE}][aria-disabled="true"] {
            opacity: 0.42;
        }

        [${SALES_SETTING_BOOKING_CURVE_LEGEND_ITEM_ATTRIBUTE}] > span {
            display: inline-block;
            width: 18px;
            height: 3px;
            border-radius: 999px;
        }

        [${SALES_SETTING_BOOKING_CURVE_GRID_ATTRIBUTE}] {
            display: grid;
            gap: 12px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        [${SALES_SETTING_BOOKING_CURVE_PANEL_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
            padding: 10px 10px 8px;
            border: 1px solid #d8e2f1;
            border-radius: 10px;
            background: #ffffff;
        }

        [${SALES_SETTING_BOOKING_CURVE_PANEL_TITLE_ATTRIBUTE}] {
            color: #243447;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.35;
        }

        [${SALES_SETTING_BOOKING_CURVE_PANEL_METRIC_ATTRIBUTE}] {
            color: #5b6f8b;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.35;
        }

        [${SALES_SETTING_BOOKING_CURVE_CANVAS_ATTRIBUTE}] {
            position: relative;
        }

        [${SALES_SETTING_BOOKING_CURVE_PANEL_SVG_ATTRIBUTE}] {
            display: block;
            width: 100%;
            height: auto;
            overflow: visible;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOOLTIP_ATTRIBUTE}] {
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            min-width: 104px;
            max-width: min(180px, calc(100% - 8px));
            padding: 7px 9px;
            border: 1px solid #d7e0ef;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 8px 24px rgba(80, 98, 122, 0.12);
            color: #243447;
            opacity: 0;
            pointer-events: none;
            transition: opacity 120ms ease;
            z-index: 1;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOOLTIP_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE}="true"] {
            opacity: 1;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOOLTIP_TITLE_ATTRIBUTE}] {
            color: #58708f;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.2;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOOLTIP_VALUE_ATTRIBUTE}] {
            margin-top: 2px;
            color: #243447;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.25;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOOLTIP_META_ATTRIBUTE}] {
            margin-top: 2px;
            color: #6d7f98;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.25;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_ATTRIBUTE}] {
            margin-top: 2px;
            color: #58708f;
            font-size: 10px;
            font-weight: 700;
            line-height: 1.25;
        }

        [${SALES_SETTING_BOOKING_CURVE_TOOLTIP_DETAIL_EMPHASIS_ATTRIBUTE}] {
            color: #243447;
            font-weight: 800;
        }

        [${SALES_SETTING_BOOKING_CURVE_AXIS_LABEL_ATTRIBUTE}] {
            fill: #70839c;
            font-size: 8px;
            font-weight: 500;
            line-height: 1;
        }

        [${SALES_SETTING_BOOKING_CURVE_Y_AXIS_LABEL_ATTRIBUTE}] {
            fill: #8a9cb4;
            font-size: 8px;
            font-weight: 500;
            line-height: 1;
        }

        [${SALES_SETTING_BOOKING_CURVE_ACTIVE_GUIDE_ATTRIBUTE}] {
            stroke: rgba(95, 118, 148, 0.42);
            stroke-width: 1.5;
            stroke-dasharray: 4 4;
        }

        [${SALES_SETTING_BOOKING_CURVE_ACTIVE_POINT_ATTRIBUTE}] {
            fill: #ffffff;
            stroke-width: 2.5;
        }

        [${SALES_SETTING_BOOKING_CURVE_MARKER_HITBOX_ATTRIBUTE}] {
            fill: transparent;
            cursor: pointer;
        }

        [${SALES_SETTING_BOOKING_CURVE_HITBOX_ATTRIBUTE}] {
            fill: transparent;
            cursor: crosshair;
        }

        [${SALES_SETTING_OVERALL_GROUP_ROW_ATTRIBUTE}] {
            display: flex;
            flex-wrap: wrap;
            column-gap: 10px;
            row-gap: 2px;
            color: #50627a;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
            user-select: text;
            -webkit-user-select: text;
        }

        [${SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin: 0 0 12px;
            padding: 0;
            border: none;
            border-radius: 0;
            background: transparent;
            user-select: text;
            -webkit-user-select: text;
        }

        [${SALES_SETTING_RANK_OVERVIEW_TITLE_ATTRIBUTE}] {
            color: #243447;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.35;
        }

        [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] {
            width: fit-content;
            max-width: 100%;
            border-collapse: collapse;
        }

        [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] th,
        [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] td {
            padding: 1px 14px 1px 0;
            text-align: left;
            vertical-align: top;
            white-space: nowrap;
        }

        [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] th:last-child,
        [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] td:last-child {
            padding-right: 0;
        }

        [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] th {
            color: #50627a;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.35;
        }

        [${SALES_SETTING_RANK_OVERVIEW_ROW_ATTRIBUTE}] {
            color: #243447;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.4;
        }

        [${SALES_SETTING_RANK_OVERVIEW_ROOM_ATTRIBUTE}] {
            min-width: 0;
            color: #243447;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        [${SALES_SETTING_RANK_OVERVIEW_META_ATTRIBUTE}] {
            color: #50627a;
            white-space: nowrap;
        }

        [${SALES_SETTING_RANK_OVERVIEW_VALUE_ATTRIBUTE}] {
            color: #243447;
            white-space: nowrap;
        }

        [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] [${SALES_SETTING_RANK_OVERVIEW_DELTA_ATTRIBUTE}] {
            text-align: right;
            white-space: nowrap;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_ATTRIBUTE}],
        [${SALES_SETTING_PRICE_TREND_OVERVIEW_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 12px 0 0;
            padding: 0;
            border: none;
            border-radius: 0;
            background: transparent;
            user-select: text;
            -webkit-user-select: text;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_TITLE_ATTRIBUTE}] {
            color: #243447;
            font-size: 15px;
            font-weight: 700;
            line-height: 1.35;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_OVERVIEW_META_ATTRIBUTE}] {
            color: #50627a;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.35;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CONTROLS_ATTRIBUTE}] {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 18px;
            align-items: center;
            color: #50627a;
            font-size: 12px;
            font-weight: 700;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_FILTER_GROUP_ATTRIBUTE}] {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 4px;
            align-items: center;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_FILTER_LABEL_ATTRIBUTE}] {
            margin-right: 2px;
            color: #50627a;
            font-weight: 800;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_FILTER_BUTTON_ATTRIBUTE}] {
            padding: 2px 8px;
            border: 1px solid #c9d3df;
            border-radius: 4px;
            background: #fff;
            color: #50627a;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.35;
            cursor: pointer;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_FILTER_BUTTON_ATTRIBUTE}][${SALES_SETTING_COMPETITOR_PRICE_FILTER_ACTIVE_ATTRIBUTE}="true"] {
            border-color: #4b7fc7;
            background: #4b7fc7;
            color: #fff;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_LEGEND_ATTRIBUTE}] {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
            color: #50627a;
            font-size: 12px;
            font-weight: 700;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_LEGEND_ITEM_ATTRIBUTE}] {
            display: inline-flex;
            gap: 4px;
            align-items: center;
            white-space: nowrap;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_LEGEND_SWATCH_ATTRIBUTE}] {
            width: 10px;
            height: 10px;
            border-radius: 2px;
            flex: 0 0 auto;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_GRID_ATTRIBUTE}] {
            display: grid;
            grid-template-columns: minmax(320px, 1fr);
            gap: 12px;
            max-width: 980px;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_PANEL_ATTRIBUTE}] {
            position: relative;
            min-width: 0;
            padding: 12px 14px 10px;
            border: 1px solid #d8e0ea;
            border-radius: 6px;
            background: #fff;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_TITLE_ATTRIBUTE}] {
            margin-bottom: 2px;
            color: #243447;
            font-size: 13px;
            font-weight: 800;
            line-height: 1.35;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE}] {
            display: block;
            width: 100%;
            max-width: 760px;
            height: auto;
            overflow: visible;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE}] text {
            fill: #50627a;
            font-size: 10px;
            font-weight: 700;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE}] line {
            stroke: #d8e0ea;
            stroke-width: 1;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE}] [${SALES_SETTING_COMPETITOR_PRICE_CHART_GUIDE_LINE_ATTRIBUTE}] {
            stroke: #3f5872;
            stroke-width: 1.5;
            stroke-dasharray: 2 3;
            opacity: 0.95;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_CHART_SVG_ATTRIBUTE}] rect[${SALES_SETTING_COMPETITOR_PRICE_CHART_HITBOX_ACTIVE_ATTRIBUTE}="true"] {
            fill: rgba(47, 111, 187, 0.08);
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] {
            position: absolute;
            top: 28px;
            left: 50%;
            z-index: 2;
            min-width: 220px;
            max-width: min(560px, 90vw);
            padding: 6px 8px;
            border: 1px solid #cbd7e8;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 8px 24px rgba(32, 50, 76, 0.14);
            pointer-events: none;
            opacity: 0;
            color: #29384d;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.45;
            transition: opacity 120ms ease;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] table {
            border-collapse: collapse;
            min-width: 430px;
            margin-top: 4px;
            font-size: 11px;
            line-height: 1.35;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] th,
        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] td {
            padding: 2px 6px;
            border-bottom: 1px solid #e5ebf2;
            text-align: right;
            white-space: nowrap;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] th:first-child,
        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] td:first-child {
            max-width: 240px;
            overflow: hidden;
            text-align: left;
            text-overflow: ellipsis;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_FACILITY_ATTRIBUTE}] {
            display: inline-flex;
            max-width: 100%;
            align-items: center;
            gap: 5px;
            overflow: hidden;
            text-overflow: ellipsis;
            vertical-align: top;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_SWATCH_ATTRIBUTE}] {
            width: 9px;
            height: 9px;
            border-radius: 2px;
            flex: 0 0 auto;
            box-shadow: inset 0 0 0 1px rgba(25, 38, 54, 0.16);
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] th {
            color: #50627a;
            font-weight: 800;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] tr:last-child td {
            border-bottom: 0;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}] [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_TONE_ATTRIBUTE}="negative"] {
            color: #c93a3a;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_TOOLTIP_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_TOOLTIP_ACTIVE_ATTRIBUTE}="true"] {
            opacity: 1;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_EMPTY_ATTRIBUTE}] {
            color: #7a8794;
            font-size: 12px;
            font-weight: 700;
        }

        [${SALES_SETTING_COMPETITOR_PRICE_NEXT_ACTION_ATTRIBUTE}] {
            margin-top: 6px;
            padding: 7px 9px;
            border-left: 4px solid #d49335;
            background: #fff8e8;
            color: #4f3a0c;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.45;
            white-space: normal;
        }

        [${SALES_SETTING_RANK_DETAIL_ATTRIBUTE}] {
            margin-top: 2px;
            color: #50627a;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] {
            --ra-ui-bg: #f7f9fc;
            --ra-ui-surface: #ffffff;
            --ra-ui-surface-muted: #eef3f8;
            --ra-ui-border: #cdd8e6;
            --ra-ui-border-strong: #aabbd0;
            --ra-ui-text: #243245;
            --ra-ui-muted: #5b6b7d;
            --ra-ui-accent: #315b8d;
            --ra-ui-focus: #2f6fbb;
            --ra-ui-success-bg: #ecf8ef;
            --ra-ui-success-text: #17663a;
            --ra-ui-warning-bg: #fff7df;
            --ra-ui-warning-text: #5c4300;
            --ra-ui-error-bg: #fff0f0;
            --ra-ui-error-text: #8b2f2f;
            margin: 12px 0 14px;
            padding: 12px;
            border: 1px solid var(--ra-ui-border);
            border-radius: 6px;
            background: var(--ra-ui-bg);
            box-shadow: 0 1px 3px rgba(24, 39, 75, 0.08);
            color: var(--ra-ui-text);
            font-family: inherit;
        }

        [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] h2 {
            margin: 0 0 4px;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.4;
        }

        [data-ra-rank-recommendation-meta] {
            margin-bottom: 8px;
            color: #5b6b7d;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.4;
        }

        [${RANK_RECOMMENDATION_UI_COMPONENT_ATTRIBUTE}="summary"] {
            display: grid;
            gap: 2px;
        }

        [${RANK_RECOMMENDATION_UI_COMPONENT_ATTRIBUTE}="control-group"] {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px 12px;
            margin: 0 0 10px;
        }

        [${RANK_RECOMMENDATION_TARGET_MONTH_CONTROL_ATTRIBUTE}],
        [${RANK_RECOMMENDATION_VIEW_MODE_CONTROL_ATTRIBUTE}] {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            margin: 0;
            color: var(--ra-ui-muted);
            font-size: 12px;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_TARGET_MONTH_CONTROL_ATTRIBUTE}] select {
            min-width: 150px;
            padding: 4px 8px;
            border: 1px solid var(--ra-ui-border-strong);
            border-radius: 5px;
            background: var(--ra-ui-surface);
            color: var(--ra-ui-text);
            font: inherit;
            font-weight: 700;
        }

        [data-ra-rank-recommendation-display-limit-control] {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            justify-content: flex-start;
            margin: 0;
        }

        [${RANK_RECOMMENDATION_ORDER_CONTROL_ATTRIBUTE}] {
            display: grid;
            gap: 6px;
            margin: 0 0 10px;
            padding: 8px 10px;
            border: 1px solid #d9e1ea;
            border-radius: 5px;
            background: var(--ra-ui-surface);
            font-size: 12px;
            line-height: 1.45;
        }

        [data-ra-rank-recommendation-order-summary] {
            color: #33445a;
            font-weight: 800;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_ORDER_CONTROL_ATTRIBUTE}] summary {
            width: fit-content;
            color: #315b8d;
            cursor: pointer;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_ORDER_INPUT_ATTRIBUTE}] {
            display: block;
            width: 100%;
            min-height: 44px;
            box-sizing: border-box;
            margin: 6px 0;
            padding: 6px 8px;
            border: 1px solid #b7c4d3;
            border-radius: 5px;
            color: #243245;
            font: inherit;
            resize: vertical;
        }

        [data-ra-rank-recommendation-order-actions] {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
        }

        [${RANK_RECOMMENDATION_ORDER_STATUS_ATTRIBUTE}] {
            color: #5b6b7d;
            font-weight: 700;
        }

        [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] table {
            width: 100%;
            border-collapse: collapse;
            table-layout: auto;
            font-size: 12px;
            line-height: 1.45;
        }

        [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] th,
        [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] td {
            padding: 8px 9px;
            border-top: 1px solid #e1e7ef;
            text-align: left;
            vertical-align: top;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] th {
            color: #50627a;
            font-weight: 800;
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] {
            border-left: 4px solid transparent;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE}="high"] {
            border-left-color: #b54646;
            background: #fff8f7;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE}="medium"] {
            border-left-color: #b98616;
            background: #fffaf0;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE}="low"] {
            border-left-color: #7f93aa;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="priority"],
        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="decision-summary"],
        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="stay-date"],
        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="current-rank"],
        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"],
        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="status"] {
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="room-group"],
        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="reason"] {
            min-width: 120px;
            max-width: 240px;
            overflow-wrap: anywhere;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE}="high"] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="priority"] {
            color: #8b2f2f;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_PRIORITY_ATTRIBUTE}="medium"] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="priority"] {
            color: #6d4a09;
        }

        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="priority"],
        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="decision-summary"],
        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="status"] {
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="priority"] {
            text-align: center;
        }

        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="priority"]::after {
            content: "";
            display: block;
            width: 28px;
            height: 3px;
            margin-top: 3px;
            border-radius: 999px;
            background: currentColor;
            opacity: 0.55;
        }

        [${RANK_RECOMMENDATION_HISTORY_ATTRIBUTE}] {
            color: #50627a;
            font-weight: 800;
        }

        [data-ra-rank-recommendation-recommended-action-layout] {
            display: inline-grid;
            gap: 4px;
            justify-items: start;
            white-space: normal;
        }

        [data-ra-rank-recommendation-recommended-action-label] {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            min-height: 22px;
            padding: 2px 7px;
            border: 1px solid currentColor;
            border-radius: 999px;
            font-weight: 800;
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"] [${RANK_RECOMMENDATION_HISTORY_ATTRIBUTE}] {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 2px 6px;
            align-items: center;
            font-size: 11px;
            line-height: 1.25;
        }

        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"] [data-ra-rank-recommendation-history-prefix],
        [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"] [data-ra-rank-recommendation-history-item] {
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE}] {
            position: relative;
        }

        span[${RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE}] {
            display: inline-flex;
            flex-direction: column;
            max-width: 100%;
            align-items: flex-start;
        }

        [${RANK_RECOMMENDATION_RANK_GAP_TRIGGER_ATTRIBUTE}] {
            max-width: 180px;
            overflow: hidden;
            padding: 0;
            border: 0;
            background: transparent;
            color: #243245;
            cursor: help;
            font: inherit;
            font-weight: 800;
            line-height: inherit;
            text-align: left;
            text-decoration: underline dotted #7c8da1;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}] {
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            z-index: 6;
            display: none;
            max-width: min(560px, calc(100vw - 32px));
            overflow-x: auto;
            padding: 8px;
            border: 1px solid #cdd8e6;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.99);
            box-shadow: 0 10px 28px rgba(32, 50, 76, 0.16);
            color: #243245;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.4;
            white-space: normal;
        }

        span[${RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE}]:hover [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}],
        span[${RANK_RECOMMENDATION_RANK_GAP_ATTRIBUTE}]:focus-within [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}] {
            display: block;
        }

        [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}] table {
            min-width: 430px;
            border-collapse: collapse;
        }

        [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}] th,
        [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}] td {
            padding: 3px 8px;
            border-bottom: 1px solid #e3e9f1;
            text-align: left;
            vertical-align: top;
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}] th {
            color: #50627a;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_RANK_GAP_TOOLTIP_ATTRIBUTE}] tr[data-ra-rank-recommendation-rank-gap-target="true"] td {
            background: #eef5ff;
            color: #1f4f83;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_ACTION_ATTRIBUTE}="raise_watch"] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"] {
            color: #0c6b3b;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_ACTION_ATTRIBUTE}="lower_watch"] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"] {
            color: #a13535;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_ACTION_ATTRIBUTE}="watch"] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"] {
            color: #475d75;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}][${RANK_RECOMMENDATION_STATUS_ATTRIBUTE}="not_eligible"] {
            color: #6a7684;
        }

        [${RANK_RECOMMENDATION_CURVE_PREVIEW_ROW_ATTRIBUTE}] td,
        [${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_ROW_ATTRIBUTE}] td {
            padding: 0 8px 10px;
            border-top: 0;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE}],
        [${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_CELL_ATTRIBUTE}] {
            background: #f3f7fb;
        }

        [${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_CELL_ATTRIBUTE}] > section {
            display: grid;
            gap: 8px;
            margin: 0;
            padding: 10px;
            border: 1px solid #d9e1ea;
            border-radius: 6px;
            background: #ffffff;
        }

        [${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_CELL_ATTRIBUTE}] p {
            margin: 0;
            color: #50627a;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.45;
        }

        [${RANK_RECOMMENDATION_COMPETITOR_PREVIEW_CELL_ATTRIBUTE}] [${SALES_SETTING_COMPETITOR_PRICE_CHART_GRID_ATTRIBUTE}] {
            margin: 0;
        }

        [${RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE}] [${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}] {
            margin: 0;
            border-radius: 6px;
            background: #ffffff;
        }

        [${RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE}] [${SALES_SETTING_BOOKING_CURVE_HEADER_ATTRIBUTE}] {
            flex-wrap: wrap;
            justify-content: flex-start;
        }

        [${RANK_RECOMMENDATION_CURVE_PREVIEW_CELL_ATTRIBUTE}] [${SALES_SETTING_BOOKING_CURVE_REFERENCE_TOGGLE_GROUP_ATTRIBUTE}] {
            margin-left: auto;
        }

        [${RANK_RECOMMENDATION_CURVE_PREVIEW_DIAGNOSTICS_ATTRIBUTE}] {
            margin-top: 6px;
            color: #5b6b7d;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.45;
        }

        [${RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_ROW_ATTRIBUTE}] td {
            padding: 0 8px 10px;
            border-top: 0;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_RANK_CHANGE_PREVIEW_CELL_ATTRIBUTE}] {
            background: #f6f8fb;
        }

        [${RANK_RECOMMENDATION_RAW_SOURCE_STATUS_ATTRIBUTE}] {
            color: #33445a;
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_CURVE_POPOVER_ATTRIBUTE}] {
            display: inline-block;
            margin-right: 6px;
            vertical-align: top;
        }

        [data-ra-rank-recommendation-primary-actions],
        [data-ra-rank-recommendation-secondary-actions] {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            margin: 0 0 6px;
        }

        [data-ra-rank-recommendation-secondary-actions] {
            width: fit-content;
            color: #315b8d;
        }

        [data-ra-rank-recommendation-secondary-actions] summary {
            min-height: 24px;
            padding: 3px 7px;
            border: 1px solid #c9d4e2;
            border-radius: 5px;
            background: #f8fbff;
            color: #315b8d;
            cursor: pointer;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.25;
        }

        [data-ra-rank-recommendation-secondary-actions] > *:not(summary) {
            margin-top: 6px;
        }

        [${RANK_RECOMMENDATION_CURVE_POPOVER_ATTRIBUTE}] button {
            display: inline-flex;
            align-items: center;
            min-height: 26px;
            padding: 4px 8px;
            border: 1px solid #b7c4d3;
            border-radius: 5px;
            background: #ffffff;
            color: #243245;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.2;
            cursor: pointer;
        }

        [${RANK_RECOMMENDATION_CURVE_POPOVER_CONTENT_ATTRIBUTE}] {
            z-index: 20;
            min-width: 260px;
            padding: 8px 10px;
            border: 1px solid #c9d4e2;
            border-radius: 6px;
            background: #ffffff;
            box-shadow: 0 8px 20px rgba(31, 44, 61, 0.16);
            color: #33445a;
            font-size: 12px;
            line-height: 1.45;
        }

        [${RANK_RECOMMENDATION_CURVE_POPOVER_CONTENT_ATTRIBUTE}] > div {
            display: grid;
            grid-template-columns: max-content minmax(0, 1fr);
            gap: 4px 10px;
        }

        [${RANK_RECOMMENDATION_CURVE_POPOVER_CONTENT_ATTRIBUTE}] span {
            color: #5b6b7d;
            font-weight: 800;
        }

        [${RANK_RECOMMENDATION_CURVE_POPOVER_CONTENT_ATTRIBUTE}] strong {
            min-width: 0;
            color: #243245;
            font-weight: 800;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_INLINE_RANK_CHANGE_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            margin: 0 0 6px;
            vertical-align: top;
        }

        [${RANK_RECOMMENDATION_INLINE_RANK_SELECT_ATTRIBUTE}] {
            max-width: 96px;
            min-height: 26px;
            border: 1px solid #b7c4d3;
            border-radius: 5px;
            background: #ffffff;
            color: #243245;
            font-size: 12px;
            font-weight: 700;
        }

        [data-ra-rank-recommendation-rank-change-preview] {
            display: grid;
            gap: 8px;
            padding: 10px 12px;
            border: 1px solid #d7e0ea;
            border-radius: 6px;
            background: #ffffff;
        }

        [data-ra-rank-recommendation-rank-change-title] {
            color: #243245;
            font-size: 13px;
            font-weight: 800;
            line-height: 1.4;
        }

        [data-ra-rank-recommendation-rank-change-preview] dl {
            display: grid;
            grid-template-columns: max-content minmax(0, 1fr);
            gap: 5px 10px;
            margin: 0;
            color: #33445a;
            font-size: 12px;
            line-height: 1.45;
        }

        [data-ra-rank-recommendation-rank-change-preview] dt {
            color: #5b6b7d;
            font-weight: 800;
        }

        [data-ra-rank-recommendation-rank-change-preview] dd {
            min-width: 0;
            margin: 0;
            white-space: normal;
        }

        [data-ra-rank-recommendation-rank-change-preview] p {
            margin: 0;
            color: #5b6b7d;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.5;
        }

        [${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 26px;
            margin: 0;
            padding: 4px 8px;
            border: 1px solid var(--ra-ui-border-strong);
            border-radius: 5px;
            background: var(--ra-ui-surface);
            color: var(--ra-ui-text);
            font-size: 12px;
            font-weight: 800;
            line-height: 1.2;
            text-decoration: none;
            cursor: pointer;
        }

        [${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="analyze"] {
            border-color: #315b8d;
            background: #315b8d;
            color: #ffffff;
        }

        [${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-change-submit"],
        [${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="rank-change-inline-submit"] {
            border-color: #0c7a43;
            background: #ecf8ef;
            color: #0c5f35;
        }

        [${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}]:hover:not([disabled]) {
            border-color: #8fa4bf;
            background: #f3f7fb;
        }

        [${RANK_RECOMMENDATION_BUTTON_ACTION_ATTRIBUTE}="analyze"]:hover:not([disabled]) {
            border-color: #244f7f;
            background: #244f7f;
            color: #ffffff;
        }

        [${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}]:focus-visible {
            outline: 2px solid var(--ra-ui-focus);
            outline-offset: 2px;
        }

        [${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][aria-pressed="true"] {
            border-color: #315b8d;
            background: #e8f1fb;
            color: #1f4f83;
        }

        [${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}][disabled] {
            color: #8a98a8;
            cursor: not-allowed;
            opacity: 0.75;
        }

        [${RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            max-width: 100%;
            gap: 6px;
            margin-top: 6px;
            padding: 4px 6px;
            border: 1px solid #d8b247;
            border-radius: 5px;
            background: var(--ra-ui-warning-bg);
            color: var(--ra-ui-warning-text);
            font-size: 11px;
            font-weight: 800;
            line-height: 1.3;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_PENDING_RANK_CHANGE_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            max-width: 100%;
            gap: 6px;
            margin-top: 6px;
            padding: 4px 6px;
            border: 1px solid #d8b247;
            border-radius: 5px;
            background: var(--ra-ui-warning-bg);
            color: var(--ra-ui-warning-text);
            font-size: 11px;
            font-weight: 800;
            line-height: 1.3;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_PENDING_DECISION_ATTRIBUTE}] [${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}],
        [${RANK_RECOMMENDATION_PENDING_RANK_CHANGE_ATTRIBUTE}] [${RANK_RECOMMENDATION_BUTTON_ATTRIBUTE}] {
            min-height: 22px;
            margin-right: 0;
            padding: 2px 6px;
            border-color: #b58a19;
            background: #ffffff;
            color: #5c4300;
            font-size: 11px;
        }

        [${RANK_RECOMMENDATION_PENDING_PROGRESS_ATTRIBUTE}] {
            display: inline-block;
            flex: 0 0 auto;
            width: 16px;
            height: 16px;
            border-radius: 999px;
            background:
                radial-gradient(circle at center, var(--ra-ui-warning-bg) 0 45%, transparent 46%),
                conic-gradient(#8d6500 var(--ra-rank-recommendation-pending-progress, 100%), #ead7a4 0);
        }

        [data-ra-rank-recommendation-current-rank-occupancy] {
            display: block;
            margin-top: 2px;
            color: #5f6f82;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.25;
            white-space: nowrap;
        }

        [${RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE}] {
            display: block;
            width: fit-content;
            margin-top: 6px;
            padding: 4px 6px;
            border-radius: 5px;
            font-size: 11px;
            font-weight: 800;
            line-height: 1.35;
            white-space: normal;
        }

        [${RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE}="success"] {
            border: 1px solid #9bc7aa;
            background: var(--ra-ui-success-bg);
            color: var(--ra-ui-success-text);
        }

        [${RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE}="confirming"] {
            border: 1px solid #a7b9dc;
            background: #eef4ff;
            color: #244f8f;
        }

        [${RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE}="blocked"],
        [${RANK_RECOMMENDATION_RANK_CHANGE_STATUS_ATTRIBUTE}="failed"] {
            border: 1px solid #e1b1b1;
            background: var(--ra-ui-error-bg);
            color: var(--ra-ui-error-text);
        }

        [${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}] {
            margin: 10px 0 14px;
            padding: 10px 12px;
            border: 1px solid var(--ra-ui-border);
            border-radius: 6px;
            background: var(--ra-ui-surface);
            color: var(--ra-ui-text);
            font-size: 12px;
            line-height: 1.45;
        }

        [${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}] h2 {
            margin: 0 0 6px;
            font-size: 14px;
            line-height: 1.3;
        }

        [${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}] h3 {
            margin: 10px 0 3px;
            color: #243245;
            font-size: 13px;
            font-weight: 800;
            line-height: 1.35;
        }

        [${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}] p {
            margin: 3px 0 5px;
            color: #5b6b7d;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.4;
        }

        [${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}] table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 5px;
        }

        [${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}] th,
        [${RANK_RECOMMENDATION_ANALYZE_LIST_ATTRIBUTE}] td {
            padding: 5px 6px;
            border-top: 1px solid #e1e8f0;
            text-align: left;
            vertical-align: top;
        }

        [${RANK_RECOMMENDATION_ANALYZE_HIGHLIGHT_ATTRIBUTE}="true"] {
            background: #eef5ff;
            box-shadow: inset 3px 0 0 #2f6fbb;
        }

        [${RANK_RECOMMENDATION_FOCUS_HIGHLIGHT_ATTRIBUTE}] {
            outline: 3px solid #2f6fbb;
            outline-offset: 4px;
            transition: outline-color 0.2s ease;
        }

        [${RANK_RECOMMENDATION_FOCUS_SUMMARY_ATTRIBUTE}] {
            margin: 8px 0 10px;
            padding: 8px 10px;
            border-left: 4px solid #2f6fbb;
            background: #eef5ff;
            color: #1f3550;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.5;
        }

        @media (max-width: 900px) {
            [${SALES_SETTING_WARM_CACHE_MONTH_CONTROLS_ATTRIBUTE}] {
                grid-template-columns: 1fr;
            }

            [${SALES_SETTING_WARM_CACHE_MONTH_TITLE_ATTRIBUTE}],
            [${SALES_SETTING_WARM_CACHE_HIDDEN_TAB_TOGGLE_ATTRIBUTE}],
            [${SALES_SETTING_WARM_CACHE_MONTH_ACTIONS_ATTRIBUTE}] {
                grid-column: 1;
                grid-row: auto;
            }

            [${SALES_SETTING_WARM_CACHE_MONTH_ACTIONS_ATTRIBUTE}] {
                grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
            }

            [${SALES_SETTING_WARM_CACHE_MONTH_DETAIL_ATTRIBUTE}] {
                grid-column: 1;
                grid-row: auto;
            }

            [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] {
                width: 100%;
            }

            [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] th,
            [${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}] td {
                padding-right: 10px;
            }

            [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] {
                width: 100%;
            }

            [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] th,
            [${SALES_SETTING_OVERALL_TABLE_ATTRIBUTE}] td {
                padding-right: 10px;
            }

            [${SALES_SETTING_BOOKING_CURVE_GRID_ATTRIBUTE}] {
                grid-template-columns: 1fr;
            }

            [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] {
                width: 100%;
            }

            [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] th,
            [${SALES_SETTING_RANK_OVERVIEW_TABLE_ATTRIBUTE}] td {
                padding-right: 10px;
            }

            [${SALES_SETTING_COMPETITOR_PRICE_CHART_GRID_ATTRIBUTE}] {
                grid-template-columns: 1fr;
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] {
                overflow-x: auto;
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] table,
            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] thead,
            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] tbody,
            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] tr,
            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] th,
            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] td {
                display: block;
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] thead {
                display: none;
            }

            [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] {
                padding: 8px 0;
                border-top: 1px solid #e1e7ef;
                border-left-width: 4px;
            }

            [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] td {
                display: grid;
                grid-template-columns: minmax(86px, max-content) minmax(0, 1fr);
                gap: 6px;
                padding: 4px 0;
                border-top: 0;
            }

            [${RANK_RECOMMENDATION_ROW_ATTRIBUTE}] td::before {
                color: var(--ra-ui-muted);
                font-weight: 800;
                content: attr(data-ra-rank-recommendation-cell-role);
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="priority"]::before {
                content: "優先度";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="decision-summary"]::before {
                content: "判断";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="stay-date"]::before {
                content: "宿泊日";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="room-group"]::before {
                content: "部屋タイプ";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="current-rank"]::before {
                content: "現ランク";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="recommended-action"]::before {
                content: "推奨";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="reason"]::before {
                content: "根拠";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="status"]::before {
                content: "状態";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="actions"]::before {
                content: "操作";
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="actions"] {
                align-items: start;
            }

            [${RANK_RECOMMENDATION_LIST_ATTRIBUTE}] [${RANK_RECOMMENDATION_CELL_ROLE_ATTRIBUTE}="actions"] > * {
                min-width: 0;
            }

            [data-ra-rank-recommendation-primary-actions],
            [data-ra-rank-recommendation-secondary-actions],
            [${RANK_RECOMMENDATION_INLINE_RANK_CHANGE_ATTRIBUTE}] {
                max-width: 100%;
            }
        }

        [${SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE}="positive"] {
            color: #0c7a43;
        }

        [${SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE}="negative"] {
            color: #b54646;
        }

        [${GROUP_ROOM_INDICATOR_ATTRIBUTE}] {
            font-size: 10px !important;
            line-height: 10px !important;
            padding: 0 2px 1px !important;
        }
    `;
    document.head.append(styleElement);
}

boot();
