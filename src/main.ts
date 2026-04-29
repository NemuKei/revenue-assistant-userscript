import {
    cleanupMonthlyProgressPage,
    getMonthlyProgressRouteState,
    syncMonthlyProgressPage
} from "./monthlyProgress";
import {
    LEAD_TIME_BUCKET_TICKS as SALES_SETTING_BOOKING_CURVE_TICKS,
    LEAD_TIME_BUCKET_VISIBLE_TICKS as SALES_SETTING_BOOKING_CURVE_VISIBLE_AXIS_TICKS,
    type LeadTimeBucketTick as SalesSettingBookingCurveTick
} from "./leadTimeBuckets";
import {
    RECENT_WEIGHTED_90_ALGORITHM_VERSION,
    SEASONAL_COMPONENT_ALGORITHM_VERSION,
    buildCurveInputFromBookingCurveResponses,
    buildRecentWeighted90ReferenceCurve,
    buildSeasonalComponentReferenceCurve,
    getRecentWeighted90CandidateStayDates,
    getSeasonalComponentCandidateStayDates,
    getUtcWeekday,
    normalizeDateKey,
    toCompactDateKey,
    type BookingCurveResponseSource,
    type CurveSegment,
    type CurveScope,
    type ReferenceCurveKind,
    type ReferenceCurveResult
} from "./curveCore";
import {
    buildReferenceCurveCacheKey,
    getOrComputeReferenceCurve,
    scheduleReferenceCurveRequest
} from "./referenceCurveStore";
import {
    buildBookingCurveRawSourceCacheKey,
    buildBookingCurveRawSourceRecord,
    readBookingCurveRawSourceRecord,
    writeBookingCurveRawSourceRecord
} from "./bookingCurveRawSourceStore";

const SCRIPT_NAME = typeof GM_info === "undefined"
    ? "Revenue Assistant Userscript"
    : (GM_info.script?.name ?? "Revenue Assistant Userscript");
const ANALYZE_DATE_PATTERN = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})$/;
const BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";
const ROOM_GROUPS_ENDPOINT = "/api/v1/booking_curve/rm_room_groups";
const CURRENT_SETTINGS_ENDPOINT = "/api/v1/suggest/output/current_settings";
const LINCOLN_SUGGEST_STATUS_ENDPOINT = "/api/v3/lincoln/suggest/status";
const YAD_INFO_ENDPOINT = "/api/v2/yad/info";
const SALES_SETTING_WARM_CACHE_TARGET_MONTHS = 3;
const SALES_SETTING_WARM_CACHE_REQUEST_INTERVAL_MS = 1000;
const SALES_SETTING_WARM_CACHE_RUN_LIMIT_MS = 10 * 60 * 1000;
const SALES_SETTING_WARM_CACHE_COOLDOWN_MS = 3 * 60 * 1000;
const SALES_SETTING_WARM_CACHE_MAX_CONSECUTIVE_ERRORS = 3;
const SALES_SETTING_WARM_CACHE_MAX_RETRY_COUNT = 2;
const CALENDAR_DATE_TEST_ID_PREFIX = "calendar-date-";
const GROUP_ROOM_STYLE_ID = "revenue-assistant-group-room-style";
const GROUP_ROOM_LAYOUT_ATTRIBUTE = "data-ra-group-room-layout";
const GROUP_ROOM_BADGE_ATTRIBUTE = "data-ra-group-room-badge";
const GROUP_ROOM_ROOM_ATTRIBUTE = "data-ra-group-room-room";
const GROUP_ROOM_INDICATOR_ATTRIBUTE = "data-ra-group-room-indicator";
const SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE = "data-ra-sales-setting-warm-cache-calendar-cell";
const SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE = "data-ra-sales-setting-warm-cache-calendar-marker-state";
const CALENDAR_LAST_CHANGE_ATTRIBUTE = "data-ra-calendar-last-change";
const CALENDAR_LAST_CHANGE_HOST_ATTRIBUTE = "data-ra-calendar-last-change-host";
const GROUP_ROOM_TOGGLE_ATTRIBUTE = "data-ra-group-room-toggle";
const GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE = "data-ra-group-room-toggle-button";
const GROUP_ROOM_TOGGLE_ACTIVE_ATTRIBUTE = "data-ra-group-room-toggle-active";
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
const SALES_SETTING_WARM_CACHE_INDICATOR_ATTRIBUTE = "data-ra-sales-setting-warm-cache-indicator";
const SALES_SETTING_WARM_CACHE_INDICATOR_STATUS_ATTRIBUTE = "data-ra-sales-setting-warm-cache-indicator-status";
const SALES_SETTING_WARM_CACHE_INDICATOR_DETAIL_ATTRIBUTE = "data-ra-sales-setting-warm-cache-indicator-detail";
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
    `[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`,
    `[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`,
    `[${SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE}]`,
    `[${SALES_SETTING_RANK_DETAIL_ATTRIBUTE}]`,
    `[${SALES_SETTING_CURRENT_UI_ROOT_ATTRIBUTE}]`,
    `[${SALES_SETTING_CURRENT_UI_SUPPLEMENTS_ATTRIBUTE}]`,
    `[${SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE}]`,
    `[${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}]`,
    `[${CALENDAR_SYNC_DEBUG_SNAPSHOT_ATTRIBUTE}]`
].join(", ");

interface BookingCurveScopeCounts {
    this_year_room_sum?: number;
    last_year_room_sum?: number;
    two_years_ago_room_sum?: number;
    three_years_ago_room_sum?: number;
}

interface BookingCurvePoint {
    date: string;
    last_year_date?: string;
    all?: BookingCurveScopeCounts;
    transient?: BookingCurveScopeCounts;
    group?: BookingCurveScopeCounts;
}

type BookingCurveCountScope = "all" | "transient" | "group";

interface BookingCurveResponse {
    stay_date: string;
    last_year_stay_date?: string;
    max_room_count?: number;
    booking_curve?: BookingCurvePoint[];
}

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
    startedAt: number | null;
    runElapsedMs: number;
    cooldownUntil: number | null;
    lastFetchedAt: string | null;
    pauseReason: string | null;
}

interface MonthlyCalendarCell {
    stayDate: string;
    anchorElement: HTMLAnchorElement;
    containerElement: HTMLElement;
    roomElement: HTMLElement;
    indicatorElement: HTMLElement | null;
}

type SalesSettingWarmCacheDateMarkerState = "partial" | "complete" | "error";

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

const groupRoomCache = new Map<string, Promise<number | null>>();
const bookingCurveCache = new Map<string, Promise<BookingCurveResponse>>();
const lincolnSuggestStatusCache = new Map<string, Promise<LincolnSuggestStatus[]>>();
const lincolnSuggestStatusRangeCache = new Map<string, Promise<LincolnSuggestStatus[]>>();
const interactionSyncTimeoutIds: number[] = [];
const salesSettingPrefetchKeys = new Set<string>();
const salesSettingBookingCurveOpenState = new Map<string, boolean>();
const salesSettingBookingCurveReferenceVisibilityState = new Map<SalesSettingBookingCurveReferenceKind, boolean>();
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
const salesSettingCurrentSettingsPromiseCache = new Map<string, Promise<SalesSettingCurrentSettingsResponse>>();
let roomGroupListPromise: Promise<RoomGroup[]> | null = null;
let salesSettingWarmCacheTimeoutId: number | null = null;
let salesSettingWarmCacheState: SalesSettingWarmCacheState = createInitialSalesSettingWarmCacheState();
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
    });

    window.addEventListener("focus", () => {
        scheduleConsistencyCheck("focus");
        scheduleSalesSettingWarmCacheDrain(0);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            scheduleConsistencyCheck("visibility");
            scheduleSalesSettingWarmCacheDrain(0);
        } else {
            pauseSalesSettingWarmCache("タブ非表示");
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

        scheduleInteractionSync();
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

function syncPage(): void {
    const nextHref = window.location.href;
    const previousAnalyzeDate = activeAnalyzeDate;
    const selectedDate = getAnalyzeDate(window.location.pathname);
    const monthlyProgressRouteState = getMonthlyProgressRouteState(window.location.pathname);
    const previousMonthlyProgressYearMonth = activeMonthlyProgressYearMonth;
    const previousMonthlyProgressBatchDateKey = activeMonthlyProgressBatchDateKey;
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
    }

    ensureCalendarObserver();
    queueCalendarSync({ reason: "sync-page" });

    if (selectedDate === null) {
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
    cleanupSalesSettingRankDetails();
    cleanupSalesSettingGroupRooms();
    cleanupSalesSettingBookingCurveCards();
    cleanupSalesSettingRoomDeltas();
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

        const persisted = readPersistedBookingCurve(facilityCacheKey, cacheKey);
        if (persisted !== undefined) {
            const request = Promise.resolve(persisted);
            bookingCurveCache.set(cacheKey, request);
            return request;
        }

        const request = readOrLoadBookingCurveRawSource(facilityCacheKey, stayDate, batchDateKey, rmRoomGroupId)
            .then((data) => {
                writePersistedBookingCurve(facilityCacheKey, cacheKey, data);
                return data;
            })
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
        return storedRawSource.response as BookingCurveResponse;
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

    return response;
}

function createInitialSalesSettingWarmCacheState(): SalesSettingWarmCacheState {
    return {
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
        startedAt: null,
        runElapsedMs: 0,
        cooldownUntil: null,
        lastFetchedAt: null,
        pauseReason: null
    };
}

function scheduleSalesSettingWarmCache(startDate: string, batchDateKey: string, facilityCacheKey: string, priorityStayDate: string | null): void {
    if (!hasSalesSettingWarmCacheEligiblePage()) {
        renderSalesSettingWarmCacheIndicator();
        return;
    }

    const sameContext = salesSettingWarmCacheState.facilityId === facilityCacheKey
        && salesSettingWarmCacheState.asOfDate === batchDateKey
        && salesSettingWarmCacheState.priorityStayDate === priorityStayDate;
    if (sameContext && (salesSettingWarmCacheState.total > 0 || salesSettingWarmCacheState.status === "building")) {
        renderSalesSettingWarmCacheIndicator();
        if (canResumeSalesSettingWarmCache()) {
            scheduleSalesSettingWarmCacheDrain(0);
        }
        return;
    }

    salesSettingWarmCacheState = {
        ...createInitialSalesSettingWarmCacheState(),
        status: "building",
        facilityId: facilityCacheKey,
        asOfDate: batchDateKey,
        priorityStayDate,
        targetFromDate: null,
        targetToDate: null
    };
    renderSalesSettingWarmCacheIndicator();

    void buildSalesSettingWarmCacheQueue(startDate, priorityStayDate)
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

async function buildSalesSettingWarmCacheQueue(startDate: string, priorityStayDate: string | null): Promise<SalesSettingWarmCacheTask[]> {
    const roomGroups = await getRoomGroups();
    const tasks: SalesSettingWarmCacheTask[] = [];
    const taskKeys = new Set<string>();
    const targetStayDates = buildSalesSettingWarmCacheTargetStayDates(startDate, priorityStayDate);

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

    return tasks;
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

function buildSalesSettingWarmCacheTargetStayDates(startDate: string, priorityStayDate: string | null): string[] {
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

    const year = Number(compactStartDate.slice(0, 4));
    const monthIndex = Number(compactStartDate.slice(4, 6)) - 1;
    const dates: string[] = [];
    for (let monthOffset = 0; monthOffset < SALES_SETTING_WARM_CACHE_TARGET_MONTHS; monthOffset += 1) {
        const targetMonthDate = new Date(Date.UTC(year, monthIndex + monthOffset, 1));
        const targetYear = targetMonthDate.getUTCFullYear();
        const targetMonth = targetMonthDate.getUTCMonth() + 1;
        const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
        const monthPrefix = `${targetYear}${String(targetMonth).padStart(2, "0")}`;
        for (let day = 1; day <= lastDay; day += 1) {
            dates.push(`${monthPrefix}${String(day).padStart(2, "0")}`);
        }
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

    if (document.visibilityState === "hidden") {
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

    const task = salesSettingWarmCacheState.queue.shift();
    if (task === undefined) {
        finalizeSalesSettingWarmCacheRun("complete", null);
        return;
    }

    if (salesSettingWarmCacheState.startedAt === null) {
        salesSettingWarmCacheState.startedAt = Date.now();
    }
    salesSettingWarmCacheState = {
        ...salesSettingWarmCacheState,
        status: "running",
        currentTask: task,
        pauseReason: null
    };
    renderSalesSettingWarmCacheIndicator();

    try {
        const taskResult = await runSalesSettingWarmCacheTask(task, facilityId, asOfDate);
        const nextDelayMs = taskResult === "skipped" ? 0 : SALES_SETTING_WARM_CACHE_REQUEST_INTERVAL_MS;
        markSalesSettingWarmCacheDateProgress(task, false);
        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            processed: salesSettingWarmCacheState.processed + 1,
            fetched: salesSettingWarmCacheState.fetched + (taskResult === "fetched" ? 1 : 0),
            skipped: salesSettingWarmCacheState.skipped + (taskResult === "skipped" ? 1 : 0),
            consecutiveErrors: 0,
            currentTask: null,
            ...(taskResult === "fetched" ? { lastFetchedAt: new Date().toISOString() } : {})
        };
        renderSalesSettingWarmCacheIndicator();
        scheduleSalesSettingWarmCacheDrain(nextDelayMs);
        return;
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to warm booking curve raw source`, {
            task,
            error
        });
        const retryTask = buildSalesSettingWarmCacheRetryTask(task);
        if (retryTask !== null) {
            salesSettingWarmCacheState.queue.push(retryTask);
        } else {
            markSalesSettingWarmCacheDateProgress(task, true);
        }
        salesSettingWarmCacheState = {
            ...salesSettingWarmCacheState,
            processed: salesSettingWarmCacheState.processed + 1,
            errors: salesSettingWarmCacheState.errors + 1,
            consecutiveErrors: salesSettingWarmCacheState.consecutiveErrors + 1,
            currentTask: null
        };

        if (salesSettingWarmCacheState.consecutiveErrors >= SALES_SETTING_WARM_CACHE_MAX_CONSECUTIVE_ERRORS) {
            pauseSalesSettingWarmCache("連続エラー", "error");
            return;
        }
    }

    renderSalesSettingWarmCacheIndicator();
    scheduleSalesSettingWarmCacheDrain();
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

    const exists = await hasSalesSettingWarmCacheRawSource(task);
    if (exists) {
        return "skipped";
    }

    await readOrLoadBookingCurveRawSource(
        facilityId,
        task.stayDate,
        asOfDate,
        task.roomGroupId
    );
    return "fetched";
}

async function hasSalesSettingWarmCacheRawSource(task: SalesSettingWarmCacheTask): Promise<boolean> {
    if (salesSettingWarmCacheState.facilityId === null || salesSettingWarmCacheState.asOfDate === null) {
        return true;
    }

    const rawSourceKey = buildBookingCurveRawSourceCacheKey({
        facilityId: salesSettingWarmCacheState.facilityId,
        stayDate: task.stayDate,
        asOfDate: salesSettingWarmCacheState.asOfDate,
        scope: task.scope,
        ...(task.roomGroupId === undefined ? {} : { roomGroupId: task.roomGroupId }),
        endpoint: BOOKING_CURVE_ENDPOINT,
        query: buildBookingCurveQuerySignature(task.stayDate, task.roomGroupId)
    });

    const storedRawSource = await readBookingCurveRawSourceRecord(rawSourceKey)
        .catch((error: unknown) => {
            console.warn(`[${SCRIPT_NAME}] failed to read warm cache raw source`, {
                task,
                error
            });
            return undefined;
        });
    return storedRawSource !== undefined;
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
    finalizeSalesSettingWarmCacheRun("idle", reason);
    salesSettingWarmCacheState = createInitialSalesSettingWarmCacheState();
    renderSalesSettingWarmCacheIndicator();
}

function finalizeSalesSettingWarmCacheRun(status: SalesSettingWarmCacheStatus, pauseReason: string | null): void {
    const elapsedMs = getActiveSalesSettingWarmCacheRunElapsedMs();
    salesSettingWarmCacheState = {
        ...salesSettingWarmCacheState,
        status,
        startedAt: null,
        runElapsedMs: salesSettingWarmCacheState.runElapsedMs + elapsedMs,
        currentTask: null,
        pauseReason
    };
    renderSalesSettingWarmCacheIndicator();
}

function getActiveSalesSettingWarmCacheRunElapsedMs(): number {
    return salesSettingWarmCacheState.startedAt === null ? 0 : Date.now() - salesSettingWarmCacheState.startedAt;
}

function renderSalesSettingWarmCacheIndicator(): void {
    ensureGroupRoomStyles();
    const existingElement = document.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_INDICATOR_ATTRIBUTE}]`);
    if (salesSettingWarmCacheState.status === "idle" && salesSettingWarmCacheState.total === 0) {
        existingElement?.remove();
        renderSalesSettingWarmCacheCalendarMarkers();
        return;
    }

    const indicatorElement = existingElement ?? document.createElement("div");
    indicatorElement.setAttribute(SALES_SETTING_WARM_CACHE_INDICATOR_ATTRIBUTE, "");

    const statusElement = indicatorElement.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_INDICATOR_STATUS_ATTRIBUTE}]`) ?? document.createElement("div");
    statusElement.setAttribute(SALES_SETTING_WARM_CACHE_INDICATOR_STATUS_ATTRIBUTE, "");
    statusElement.textContent = getSalesSettingWarmCacheStatusLabel();

    const detailElement = indicatorElement.querySelector<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_INDICATOR_DETAIL_ATTRIBUTE}]`) ?? document.createElement("div");
    detailElement.setAttribute(SALES_SETTING_WARM_CACHE_INDICATOR_DETAIL_ATTRIBUTE, "");
    detailElement.textContent = getSalesSettingWarmCacheDetailLabel();

    indicatorElement.replaceChildren(statusElement, detailElement);

    if (indicatorElement.parentElement !== document.body) {
        document.body.append(indicatorElement);
    }

    renderSalesSettingWarmCacheCalendarMarkers();
}

function getSalesSettingWarmCacheStatusLabel(): string {
    const dayProgress = getSalesSettingWarmCacheDayProgressSummary();
    const progressText = dayProgress.partial > 0
        ? `${dayProgress.completed} / ${dayProgress.total}日・進行 ${dayProgress.partial}日`
        : `${dayProgress.completed} / ${dayProgress.total}日`;
    const targetRangeText = getSalesSettingWarmCacheTargetDateRangeLabel("short");
    switch (salesSettingWarmCacheState.status) {
        case "building":
            return "データ取得: 準備中";
        case "running":
            return `データ取得: 取得中 ${progressText}${targetRangeText === null ? "" : `（${targetRangeText}）`}`;
        case "paused":
            return "データ取得: 一時停止中";
        case "cooldown":
            return "データ取得: クールダウン中";
        case "limitReached":
            return "データ取得: 上限到達";
        case "error":
            return `データ取得: エラー ${salesSettingWarmCacheState.errors}`;
        case "complete":
            return `データ取得: 完了 ${progressText}${targetRangeText === null ? "" : `（${targetRangeText}）`}`;
        case "idle":
        default:
            return salesSettingWarmCacheState.total > 0
                ? `データ取得: 待機中 ${progressText}${targetRangeText === null ? "" : `（${targetRangeText}）`}`
                : "データ取得: 待機中";
    }
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
        taskLabel,
        cooldownLabel,
        retryPendingCount > 0 ? `再試行待ち ${retryPendingCount}` : null,
        `保存 ${salesSettingWarmCacheState.fetched}`,
        `skip ${salesSettingWarmCacheState.skipped}`
    ].filter((part): part is string => part !== null && part !== "");

    return parts.join(" / ");
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
    const shouldShowMarkers = salesSettingWarmCacheState.total > 0;

    for (const cell of cells) {
        renderedStayDates.add(cell.stayDate);
        const progress = shouldShowMarkers ? salesSettingWarmCacheState.dateProgress[cell.stayDate] : undefined;
        renderSalesSettingWarmCacheCalendarMarker(cell, getSalesSettingWarmCacheDateMarkerState(progress));
    }

    for (const markedCell of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE}]`))) {
        const testId = markedCell.getAttribute("data-testid");
        const stayDate = testId?.startsWith(CALENDAR_DATE_TEST_ID_PREFIX) === true
            ? testId.slice(CALENDAR_DATE_TEST_ID_PREFIX.length).replaceAll("-", "")
            : null;
        if (stayDate === null || !renderedStayDates.has(stayDate) || !shouldShowMarkers) {
            markedCell.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE);
            markedCell.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE);
            markedCell.removeAttribute("title");
        }
    }
}

function renderSalesSettingWarmCacheCalendarMarker(cell: MonthlyCalendarCell, state: SalesSettingWarmCacheDateMarkerState | null): void {
    if (state === null) {
        cell.anchorElement.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE);
        cell.anchorElement.removeAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE);
        cell.anchorElement.removeAttribute("title");
        return;
    }

    cell.anchorElement.setAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_CELL_ATTRIBUTE, "");
    cell.anchorElement.setAttribute(SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE, state);
    cell.anchorElement.setAttribute("title", getSalesSettingWarmCacheCalendarMarkerTitle(state));
}

function getSalesSettingWarmCacheCalendarMarkerTitle(state: SalesSettingWarmCacheDateMarkerState): string {
    switch (state) {
        case "complete":
            return "booking_curve 取得完了";
        case "error":
            return "booking_curve 取得エラーあり";
        case "partial":
        default:
            return "booking_curve 一部取得済み";
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

    const response = await fetch(url.toString(), {
        credentials: "include",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    if (!response.ok) {
        throw new Error(`booking curve request failed: ${response.status}`);
    }

    return compactBookingCurveResponse((await response.json()) as BookingCurveResponse);
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
        "three_years_ago_room_sum"
    ] as const;

    for (const key of countKeys) {
        const value = counts[key];
        if (typeof value === "number") {
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
                ? Promise.resolve()
                : salesSettingPreparedDataPromise.then((preparedData) => syncSalesSettingGroupRooms(preparedData, analysisDate, batchDateKey, syncContext)),
            analysisDate === null
                ? Promise.resolve()
                : salesSettingPreparedDataPromise.then((preparedData) => syncSalesSettingOverallSummary(preparedData, analysisDate, batchDateKey, syncContext))
        ]);

        if (analysisDate !== null) {
            await salesSettingPreparedDataPromise.then((preparedData) => syncSalesSettingRankInsights(analysisDate, syncContext, preparedData));
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
        return;
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
                    rankHistoryByRoomGroupName.get(metric.card.roomGroupName) ?? []
                )
        );
    }

    hydrateOpenSalesSettingRoomReferenceCurves(
        preparedData,
        analysisDate,
        batchDateKey,
        syncContext,
        rankHistoryByRoomGroupName
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

function hydrateOpenSalesSettingRoomReferenceCurves(
    preparedData: SalesSettingPreparedData,
    analysisDate: string,
    batchDateKey: string,
    syncContext: SyncContext,
    rankHistoryByRoomGroupName: Map<string, SalesSettingRankHistoryEvent[]>
): void {
    for (const metric of preparedData.cardMetrics) {
        if (
            metric.metrics === null
            || metric.rmRoomGroupId === undefined
            || metric.metrics.bookingCurveData === null
            || metric.metrics.referenceCurveData !== null
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

                const currentCard = collectSalesSettingCards()
                    .find((card) => card.roomGroupName === metric.roomGroupName) ?? metric.card;
                if (!currentCard.cardElement.isConnected || metric.metrics === null || metric.metrics.bookingCurveData === null) {
                    return;
                }

                metric.metrics.referenceCurveData = referenceCurveData;
                renderSalesSettingBookingCurveCard(
                    currentCard,
                    metric.metrics.allMetrics.currentValue,
                    resolveSalesSettingBookingCurveSecondaryCurrentRoomCount(
                        metric.metrics.privateMetrics.currentValue,
                        metric.metrics.groupMetrics.currentValue
                    ),
                    buildSalesSettingBookingCurveRenderData(
                        metric.metrics.bookingCurveData,
                        referenceCurveData,
                        metric.metrics.sameWeekdayCurveData,
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

    const statuses = await getLincolnSuggestStatuses(analysisDate)
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
        return;
    }

    cleanupSalesSettingRankOverview();
    cleanupSalesSettingRankDetails();
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
    return Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="booking-curve-rm-room-group-list"] li`))
        .map((element) => element.textContent?.trim() ?? "")
        .filter((name) => name !== "" && name !== "全て");
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
    const [
        recentOverall,
        seasonalOverall,
        recentIndividual,
        seasonalIndividual,
        recentGroup,
        seasonalGroup
    ] = await Promise.all([
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "all", "recent_weighted_90", rmRoomGroupId),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "all", "seasonal_component", rmRoomGroupId),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "transient", "recent_weighted_90", rmRoomGroupId),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "transient", "seasonal_component", rmRoomGroupId),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "group", "recent_weighted_90", rmRoomGroupId),
        loadSalesSettingReferenceCurveResult(analysisDate, batchDateKey, "group", "seasonal_component", rmRoomGroupId)
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
    rmRoomGroupId?: string
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
            const sources = await loadSalesSettingReferenceCurveSources(candidateStayDates, batchDateKey, scope, rmRoomGroupId);
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

    const referenceCurveData = bookingCurveData === null || !loadReferenceCurve
        ? null
        : await loadSalesSettingBookingCurveReferenceData(analysisDate, batchDateKey, rmRoomGroupId);
    const sameWeekdayCurveData = bookingCurveData === null || !loadSameWeekdayCurve
        ? []
        : await loadSalesSettingSameWeekdayCurveData(analysisDate, batchDateKey, rmRoomGroupId);

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

    await populateCurrentUiSalesSettingCapacities(analysisDate, cards);
    if (isSyncContextStale(syncContext)) {
        return null;
    }

    const comparisonDateKeys = getSalesSettingComparisonDateKeys(batchDateKey);
    const totalCapacity = sumSalesSettingRoomCapacities(cards);
    const [roomGroups, hotelMetrics] = await Promise.all([
        getRoomGroups()
            .catch((error: unknown) => {
                console.error(`[${SCRIPT_NAME}] failed to load room groups`, {
                    error
                });
                return [] as RoomGroup[];
            }),
        loadSalesSettingBookingCurveMetrics(
            analysisDate,
            batchDateKey,
            comparisonDateKeys,
            undefined,
            false,
            isSalesSettingBookingCurveSameWeekdayVisible()
        )
    ]);
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
        throw new Error(`current settings request failed: ${response.status}`);
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
        throw new Error(`lincoln suggest status request failed: ${response.status}`);
    }

    const payload = (await response.json()) as LincolnSuggestStatusResponse;
    return payload.suggest_statuses ?? [];
}

function getCurrentBatchDateKey(): string {
    const text = document.body.innerText;
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

function syncCacheBatch(batchDateKey: string, facilityCacheKey: string): void {
    if (activeBatchDateKey === batchDateKey && activeFacilityCacheKey === facilityCacheKey) {
        return;
    }

    cleanupLegacyGroupRoomStorage();

    activeBatchDateKey = batchDateKey;
    activeFacilityCacheKey = facilityCacheKey;
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

function readPersistedBookingCurve(facilityCacheKey: string, cacheKey: string): BookingCurveResponse | undefined {
    try {
        const raw = window.localStorage.getItem(`${getBookingCurveStoragePrefix(facilityCacheKey)}${cacheKey}`);
        if (raw === null) {
            return undefined;
        }

        return compactBookingCurveResponse(JSON.parse(raw) as BookingCurveResponse);
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to read persistent booking-curve cache`, {
            cacheKey,
            error
        });
    }

    return undefined;
}

function writePersistedBookingCurve(facilityCacheKey: string, cacheKey: string, data: BookingCurveResponse): void {
    const storageKey = `${getBookingCurveStoragePrefix(facilityCacheKey)}${cacheKey}`;
    const serialized = JSON.stringify(compactBookingCurveResponse(data));

    try {
        window.localStorage.setItem(storageKey, serialized);
    } catch (error: unknown) {
        const recovered = tryRecoverPersistentBookingCurveQuota(storageKey, serialized);
        if (recovered) {
            return;
        }

        console.warn(`[${SCRIPT_NAME}] failed to write persistent booking-curve cache`, {
            cacheKey,
            error
        });
    }
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

function tryRecoverPersistentBookingCurveQuota(storageKey: string, serialized: string): boolean {
    const cleaned = cleanupLegacyGroupRoomStorage();
    if (!cleaned) {
        return false;
    }

    try {
        window.localStorage.setItem(storageKey, serialized);
        console.info(`[${SCRIPT_NAME}] recovered persistent booking-curve cache after legacy cleanup`, {
            storageKey
        });
        return true;
    } catch {
        return false;
    }
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

    return segments.map((segment) => {
        const firstSample = segment[0];
        const lastSample = segment[segment.length - 1];
        if (firstSample === undefined || lastSample === undefined) {
            return "";
        }

        const linePath = segment
            .map((sample, index) => `${index === 0 ? "M" : "L"}${sample.x.toFixed(2)},${sample.y?.toFixed(2) ?? baselineY.toFixed(2)}`)
            .join(" ");
        return `${linePath} L${lastSample.x.toFixed(2)},${baselineY.toFixed(2)} L${firstSample.x.toFixed(2)},${baselineY.toFixed(2)} Z`;
    }).filter((segmentPath) => segmentPath !== "").join(" ");
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
    return drawableSeries
        .filter((series) => series.kind !== "current")
        .map((series) => ({
            label: series.label,
            value: series.series.values[index] ?? null,
            interpolated: series.series.interpolated?.[index] === true
        }));
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
        swatchElement.style.backgroundColor = item.stroke;
        if (item.dasharray !== null) {
            swatchElement.style.backgroundImage = `repeating-linear-gradient(90deg, ${item.stroke} 0 6px, transparent 6px 10px)`;
            swatchElement.style.backgroundColor = "transparent";
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

    return metrics
        .filter((metric) => metric.currentValue !== null && metric.currentValue > overallCurrentValue)
        .map((metric) => metric.roomGroupName);
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

    for (const status of statuses.slice().sort(compareLincolnSuggestStatuses)) {
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
        element.remove();
    }
}

function cleanupSalesSettingRoomDeltas(): void {
    for (const deltaElement of Array.from(document.querySelectorAll<HTMLElement>(`[${SALES_SETTING_ROOM_DELTA_ATTRIBUTE}]`))) {
        deltaElement.remove();
    }
}

function ensureGroupRoomStyles(): void {
    if (document.getElementById(GROUP_ROOM_STYLE_ID) !== null) {
        return;
    }

    const styleElement = document.createElement("style");
    styleElement.id = GROUP_ROOM_STYLE_ID;
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

        [${SALES_SETTING_WARM_CACHE_INDICATOR_ATTRIBUTE}] {
            position: fixed;
            right: 18px;
            bottom: 18px;
            z-index: 2147483647;
            min-width: 180px;
            max-width: min(320px, calc(100vw - 36px));
            border: 1px solid #cbd7e8;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 8px 24px rgba(32, 50, 76, 0.16);
            color: #29384d;
            font-size: 12px;
            line-height: 1.35;
            padding: 8px 10px;
            pointer-events: none;
        }

        [${SALES_SETTING_WARM_CACHE_INDICATOR_STATUS_ATTRIBUTE}] {
            font-weight: 800;
        }

        [${SALES_SETTING_WARM_CACHE_INDICATOR_DETAIL_ATTRIBUTE}] {
            margin-top: 3px;
            color: #5b6d86;
            font-size: 11px;
            font-weight: 600;
            white-space: normal;
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="partial"] {
            box-shadow: inset 0 -3px 0 rgba(91, 141, 239, 0.78);
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="complete"] {
            box-shadow: inset 0 -3px 0 rgba(47, 143, 91, 0.82);
        }

        [${SALES_SETTING_WARM_CACHE_CALENDAR_MARKER_STATE_ATTRIBUTE}="error"] {
            box-shadow: inset 0 -3px 0 rgba(208, 79, 79, 0.82);
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

        [${SALES_SETTING_RANK_DETAIL_ATTRIBUTE}] {
            margin-top: 2px;
            color: #50627a;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
            white-space: nowrap;
        }

        @media (max-width: 900px) {
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
