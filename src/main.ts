const SCRIPT_NAME = typeof GM_info === "undefined"
    ? "Revenue Assistant Userscript"
    : (GM_info.script?.name ?? "Revenue Assistant Userscript");
const ANALYZE_DATE_PATTERN = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})$/;
const BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";
const ROOM_GROUPS_ENDPOINT = "/api/v1/booking_curve/rm_room_groups";
const LINCOLN_SUGGEST_STATUS_ENDPOINT = "/api/v3/lincoln/suggest/status";
const YAD_INFO_ENDPOINT = "/api/v2/yad/info";
const CALENDAR_DATE_TEST_ID_PREFIX = "calendar-date-";
const GROUP_ROOM_STYLE_ID = "revenue-assistant-group-room-style";
const GROUP_ROOM_LAYOUT_ATTRIBUTE = "data-ra-group-room-layout";
const GROUP_ROOM_BADGE_ATTRIBUTE = "data-ra-group-room-badge";
const GROUP_ROOM_ROOM_ATTRIBUTE = "data-ra-group-room-room";
const GROUP_ROOM_INDICATOR_ATTRIBUTE = "data-ra-group-room-indicator";
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
const SALES_SETTING_RANK_DETAIL_ATTRIBUTE = "data-ra-sales-setting-rank-detail";
const SALES_SETTING_RANK_DETAIL_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-rank-detail-signature";
const SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE = "data-ra-sales-setting-booking-curve-section";
const SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE = "data-ra-sales-setting-booking-curve-kind";
const SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-signature";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_ROW_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-row";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-button";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_KEY_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-key";
const SALES_SETTING_BOOKING_CURVE_TOGGLE_ACTIVE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-toggle-active";
const SALES_SETTING_BOOKING_CURVE_HEADER_ATTRIBUTE = "data-ra-sales-setting-booking-curve-header";
const SALES_SETTING_BOOKING_CURVE_NOTE_ATTRIBUTE = "data-ra-sales-setting-booking-curve-note";
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
const SALES_SETTING_BOOKING_CURVE_VISIBLE_AXIS_TICKS = new Set<SalesSettingBookingCurveTick>([
    360, 270, 180, 150, 120, 90, 60, 45, 30, 21, 14, 7, 3, "ACT"
]);
const SALES_SETTING_BOOKING_CURVE_TICKS = [
    360, 330, 300, 270, 240, 210,
    180, 165, 150, 135, 120, 105,
    90, 80, 70,
    60, 55, 50, 45, 40, 35,
    30, 28, 26, 24, 21, 20, 18, 16,
    14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    "ACT"
] as const;
const GROUP_ROOM_STORAGE_PREFIX = "revenue-assistant:group-room-count:v4:";
const GROUP_ROOM_VISIBILITY_STORAGE_KEY = `${GROUP_ROOM_STORAGE_PREFIX}calendar-visible`;
const CONSISTENCY_CHECK_DEBOUNCE_MS = 250;
const CONSISTENCY_CHECK_MIN_INTERVAL_MS = 15000;

interface BookingCurvePoint {
    date: string;
    all?: {
        this_year_room_sum?: number;
    };
    transient?: {
        this_year_room_sum?: number;
    };
    group?: {
        this_year_room_sum?: number;
    };
}

type BookingCurveCountScope = "all" | "transient" | "group";

interface BookingCurveResponse {
    stay_date: string;
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

interface MonthlyCalendarCell {
    stayDate: string;
    anchorElement: HTMLAnchorElement;
    containerElement: HTMLElement;
    roomElement: HTMLElement;
    indicatorElement: HTMLElement | null;
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

type SalesSettingBookingCurveTick = typeof SALES_SETTING_BOOKING_CURVE_TICKS[number];

interface SalesSettingBookingCurveSample {
    tick: SalesSettingBookingCurveTick;
    daysBeforeStay: number | null;
    value: number | null;
    occupancyRate: number | null;
    x: number;
    y: number | null;
}

interface SalesSettingBookingCurveSeries {
    values: Array<number | null>;
    signature: string;
}

interface SalesSettingBookingCurveRenderData {
    overall: SalesSettingBookingCurveSeries;
    individual: SalesSettingBookingCurveSeries;
    overallRankMarkers: SalesSettingBookingCurveMarker[];
    individualRankMarkers: SalesSettingBookingCurveMarker[];
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

const groupRoomCache = new Map<string, Promise<number | null>>();
const bookingCurveCache = new Map<string, Promise<BookingCurveResponse>>();
const lincolnSuggestStatusCache = new Map<string, Promise<LincolnSuggestStatus[]>>();
const interactionSyncTimeoutIds: number[] = [];
const salesSettingPrefetchKeys = new Set<string>();
const salesSettingBookingCurveOpenState = new Map<string, boolean>();
let roomGroupListPromise: Promise<RoomGroup[]> | null = null;
let activeHref = "";
let activeAnalyzeDate: string | null = null;
let activeBatchDateKey: string | null = null;
let activeFacilityCacheKey: string | null = null;
let calendarObserver: MutationObserver | null = null;
let calendarSyncQueued = false;
let syncVersion = 0;
let consistencyCheckTimeoutId: number | null = null;
let consistencyCheckLastTriggeredAt = 0;
let consistencyCheckRunVersion = 0;
let resolvedFacilityCacheKey: string | null = null;
let resolvedFacilityLabel: string | null = null;
let facilityCacheKeyPromise: Promise<string> | null = null;

function boot(): void {
    console.info(`[${SCRIPT_NAME}] initialized`, {
        href: window.location.href,
        dev: __DEV__
    });

    installNavigationHooks();
    installInteractionHooks();
    installLifecycleConsistencyHooks();
    syncPage();
}

function installLifecycleConsistencyHooks(): void {
    window.addEventListener("pageshow", () => {
        scheduleConsistencyCheck("pageshow");
    });

    window.addEventListener("focus", () => {
        scheduleConsistencyCheck("focus");
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            scheduleConsistencyCheck("visibility");
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
            const bookingCurveToggleButton = target.closest<HTMLButtonElement>(`[${SALES_SETTING_BOOKING_CURVE_TOGGLE_BUTTON_ATTRIBUTE}]`);
            if (bookingCurveToggleButton !== null) {
                event.preventDefault();
                event.stopPropagation();

                const toggleKey = bookingCurveToggleButton.getAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_KEY_ATTRIBUTE);
                if (toggleKey !== null && toggleKey.length > 0) {
                    const nextOpen = bookingCurveToggleButton.getAttribute(SALES_SETTING_BOOKING_CURVE_TOGGLE_ACTIVE_ATTRIBUTE) !== "true";
                    setSalesSettingBookingCurveOpen(toggleKey, nextOpen);
                    queueCalendarSync();
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

                queueCalendarSync();
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
    queueCalendarSync();

    clearInteractionSyncTimeouts();

    for (const delay of [120, 300, 700, 1500, 3000]) {
        const timeoutId = window.setTimeout(() => {
            queueCalendarSync();
        }, delay);
        interactionSyncTimeoutIds.push(timeoutId);
    }
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

    activeAnalyzeDate = selectedDate;

    if (selectedDate !== null && (nextHref !== activeHref || selectedDate !== previousAnalyzeDate)) {
        salesSettingBookingCurveOpenState.clear();
    }

    ensureCalendarObserver();
    queueCalendarSync();

    if (selectedDate === null) {
        clearInteractionSyncTimeouts();
        clearConsistencyCheckTimeout();

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
    queueCalendarSync();
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

        const request = loadBookingCurve(stayDate, rmRoomGroupId)
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

    return (await response.json()) as BookingCurveResponse;
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
    variant: "overall" | "individual"
): number | null {
    if (variant === "overall") {
        return findBookingCurveCount(data, lookupDate, "all");
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
    variant: "overall" | "individual"
): number | null {
    const observationLeadDays = getDaysBetweenDashedDateKeys(stayDate, batchDateKey);
    if (observationLeadDays !== null && observationLeadDays >= 0) {
        return null;
    }

    if (variant === "overall") {
        return findExactBookingCurveCount(data, batchDateKey, "all");
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
    variant: "overall" | "individual"
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

function buildSalesSettingBookingCurveRenderData(
    data: BookingCurveResponse,
    stayDate: string,
    batchDateKey: string,
    rankHistory: SalesSettingRankHistoryEvent[] = []
): SalesSettingBookingCurveRenderData {
    const overallRankMarkers = buildSalesSettingBookingCurveMarkers(data, rankHistory, "overall");
    const individualRankMarkers = buildSalesSettingBookingCurveMarkers(data, rankHistory, "individual");

    return {
        overall: buildSalesSettingBookingCurveSeries(data, stayDate, batchDateKey, "overall"),
        individual: buildSalesSettingBookingCurveSeries(data, stayDate, batchDateKey, "individual"),
        overallRankMarkers,
        individualRankMarkers,
        rankSignature: [
            ...overallRankMarkers.map((marker) => `o:${marker.signature}:${marker.value === null ? "-" : marker.value}`),
            ...individualRankMarkers.map((marker) => `i:${marker.signature}:${marker.value === null ? "-" : marker.value}`)
        ].join("|")
    };
}

function buildSalesSettingBookingCurveMarkers(
    data: BookingCurveResponse,
    rankHistory: SalesSettingRankHistoryEvent[],
    variant: "overall" | "individual"
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
    calendarObserver = new MutationObserver(() => {
        queueCalendarSync();
    });
    calendarObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-selected"],
        childList: true,
        subtree: true
    });
}

function queueCalendarSync(): void {
    if (calendarSyncQueued) {
        return;
    }

    calendarSyncQueued = true;
    window.requestAnimationFrame(() => {
        void runCalendarSync();
    });
}

async function runCalendarSync(): Promise<void> {
    calendarSyncQueued = false;
    const batchDateKey = getCurrentBatchDateKey();
    const facilityCacheKey = await resolveCurrentFacilityCacheKey();
    syncCacheBatch(batchDateKey, facilityCacheKey);
    const syncContext = createSyncContext(batchDateKey, facilityCacheKey);

    if (activeAnalyzeDate !== null) {
        prefetchSalesSettingGroupRooms(activeAnalyzeDate, batchDateKey);
        cleanupSalesSettingRoomDeltas();
    } else {
        salesSettingBookingCurveOpenState.clear();
        cleanupSalesSettingOverallSummary();
        cleanupSalesSettingRankOverview();
        cleanupSalesSettingRankDetails();
        cleanupSalesSettingGroupRooms();
        cleanupSalesSettingBookingCurveCards();
        cleanupSalesSettingRoomDeltas();
    }

    await Promise.all([
        syncMonthlyCalendarGroupRooms(batchDateKey),
        activeAnalyzeDate === null
            ? Promise.resolve()
            : syncSalesSettingGroupRooms(activeAnalyzeDate, batchDateKey, syncContext),
        activeAnalyzeDate === null
            ? Promise.resolve()
            : syncSalesSettingOverallSummary(activeAnalyzeDate, batchDateKey, syncContext)
    ]);

    if (activeAnalyzeDate !== null) {
        await syncSalesSettingRankInsights(activeAnalyzeDate, syncContext);
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

async function syncSalesSettingGroupRooms(analysisDate: string, batchDateKey: string, syncContext: SyncContext): Promise<void> {
    const cards = collectSalesSettingCards();
    if (cards.length === 0) {
        return;
    }

    ensureGroupRoomStyles();

    const [roomGroups, statuses] = await Promise.all([
        getRoomGroups()
            .catch((error: unknown) => {
                console.error(`[${SCRIPT_NAME}] failed to load room groups`, {
                    error
                });
                return [] as RoomGroup[];
            }),
        getLincolnSuggestStatuses(analysisDate)
            .catch((error: unknown) => {
                console.warn(`[${SCRIPT_NAME}] failed to load rank history for booking curve markers`, {
                    analysisDate,
                    error
                });
                return [] as LincolnSuggestStatus[];
            })
    ]);
    if (isSyncContextStale(syncContext)) {
        return;
    }

    const rankHistoryByRoomGroupName = buildSalesSettingRankHistoryByRoomGroup(statuses, analysisDate);
    const roomGroupIdByName = new Map(roomGroups.map((roomGroup) => [roomGroup.name, roomGroup.id]));
    const { previousDay, previousWeek, previousMonth } = getRevenueAssistantComparisonDates(batchDateKey);
    const currentOverallGroupRoomCount = await fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group");
    if (isSyncContextStale(syncContext)) {
        return;
    }

    const metrics = await Promise.all(cards.map(async (card) => {
        const rmRoomGroupId = roomGroupIdByName.get(card.roomGroupName);
        if (rmRoomGroupId === undefined) {
            return {
                card,
                roomGroupName: card.roomGroupName,
                currentOverallRoomCount: null,
                previousDayOverallRoomCount: null,
                previousWeekOverallRoomCount: null,
                previousMonthOverallRoomCount: null,
                currentIndividualRoomCount: null,
                previousDayIndividualRoomCount: null,
                previousWeekIndividualRoomCount: null,
                previousMonthIndividualRoomCount: null,
                currentGroupRoomCount: null,
                previousDayGroupRoomCount: null,
                previousWeekGroupRoomCount: null,
                previousMonthGroupRoomCount: null,
                bookingCurveData: null,
                missingRoomGroup: true
            };
        }

        const [
            currentTransientRoomCount,
            previousDayTransientRoomCount,
            previousWeekTransientRoomCount,
            previousMonthTransientRoomCount,
            currentAllRoomCount,
            previousDayAllRoomCount,
            previousWeekAllRoomCount,
            previousMonthAllRoomCount,
            currentGroupRoomCount,
            previousDayGroupRoomCount,
            previousWeekGroupRoomCount,
            previousMonthGroupRoomCount,
            bookingCurveData
        ] = await Promise.all([
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "transient", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "transient", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "transient", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "transient", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "group", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "group", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "group", rmRoomGroupId),
            getBookingCurve(analysisDate, batchDateKey, rmRoomGroupId).catch(() => null)
        ]);

        return {
            card,
            roomGroupName: card.roomGroupName,
            currentOverallRoomCount: currentAllRoomCount,
            previousDayOverallRoomCount: previousDayAllRoomCount,
            previousWeekOverallRoomCount: previousWeekAllRoomCount,
            previousMonthOverallRoomCount: previousMonthAllRoomCount,
            currentIndividualRoomCount: resolveSalesSettingPrivateRoomCount(currentTransientRoomCount, currentAllRoomCount, currentGroupRoomCount),
            previousDayIndividualRoomCount: resolveSalesSettingPrivateRoomCount(previousDayTransientRoomCount, previousDayAllRoomCount, previousDayGroupRoomCount),
            previousWeekIndividualRoomCount: resolveSalesSettingPrivateRoomCount(previousWeekTransientRoomCount, previousWeekAllRoomCount, previousWeekGroupRoomCount),
            previousMonthIndividualRoomCount: resolveSalesSettingPrivateRoomCount(previousMonthTransientRoomCount, previousMonthAllRoomCount, previousMonthGroupRoomCount),
            currentGroupRoomCount,
            previousDayGroupRoomCount,
            previousWeekGroupRoomCount,
            previousMonthGroupRoomCount,
            bookingCurveData,
            missingRoomGroup: false
        };
    }));

    if (isSyncContextStale(syncContext)) {
        return;
    }

    const inconsistentRoomGroupNames = getInconsistentSalesSettingGroupNames(
        metrics.map((metric) => ({
            roomGroupName: metric.roomGroupName,
            currentValue: metric.currentGroupRoomCount
        })),
        currentOverallGroupRoomCount
    );
    if (inconsistentRoomGroupNames.length > 0) {
        console.warn(`[${SCRIPT_NAME}] inconsistent sales-setting group counts`, {
            analysisDate,
            batchDateKey,
            currentOverallGroupRoomCount,
            inconsistentRoomGroupNames
        });
        cleanupSalesSettingGroupRooms();
        return;
    }

    for (const metric of metrics) {
        if (metric.missingRoomGroup) {
            clearSalesSettingGroupRoom(metric.card);
            continue;
        }

        if (!metric.card.cardElement.isConnected) {
            continue;
        }

        renderSalesSettingGroupRoom(
            metric.card,
            metric.currentOverallRoomCount,
            metric.previousDayOverallRoomCount,
            metric.previousWeekOverallRoomCount,
            metric.previousMonthOverallRoomCount,
            metric.currentIndividualRoomCount,
            metric.previousDayIndividualRoomCount,
            metric.previousWeekIndividualRoomCount,
            metric.previousMonthIndividualRoomCount,
            metric.currentGroupRoomCount,
            metric.previousDayGroupRoomCount,
            metric.previousWeekGroupRoomCount,
            metric.previousMonthGroupRoomCount,
            metric.bookingCurveData === null
                ? null
                : buildSalesSettingBookingCurveRenderData(
                    metric.bookingCurveData,
                    analysisDate,
                    batchDateKey,
                    rankHistoryByRoomGroupName.get(metric.card.roomGroupName) ?? []
                )
        );
    }
}

async function syncSalesSettingOverallSummary(analysisDate: string, batchDateKey: string, syncContext: SyncContext): Promise<void> {
    const cards = collectSalesSettingCards();
    if (cards.length === 0) {
        cleanupSalesSettingOverallSummary();
        return;
    }

    ensureGroupRoomStyles();

    const totalCapacity = sumSalesSettingRoomCapacities(cards);
    const roomGroups = await getRoomGroups()
        .catch((error: unknown) => {
            console.error(`[${SCRIPT_NAME}] failed to load room groups`, {
                error
            });
            return [] as RoomGroup[];
        });
    if (isSyncContextStale(syncContext)) {
        return;
    }

    const roomGroupIdByName = new Map(roomGroups.map((roomGroup) => [roomGroup.name, roomGroup.id]));
    const { previousDay, previousWeek, previousMonth } = getRevenueAssistantComparisonDates(batchDateKey);

    const roomDeltaMetrics = await Promise.all(cards.map(async (card) => {
        const rmRoomGroupId = roomGroupIdByName.get(card.roomGroupName);
        if (rmRoomGroupId === undefined) {
            return {
                currentValue: null,
                previousDayValue: null,
                previousWeekValue: null,
                previousMonthValue: null
            };
        }

        const [currentValue, previousDayValue, previousWeekValue, previousMonthValue] = await Promise.all([
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "all", rmRoomGroupId)
        ]);

        return {
            currentValue,
            previousDayValue,
            previousWeekValue,
            previousMonthValue
        };
    }));
    if (isSyncContextStale(syncContext)) {
        return;
    }

    const currentRoomGroupMetrics = await Promise.all(cards.map(async (card) => {
        const rmRoomGroupId = roomGroupIdByName.get(card.roomGroupName);
        if (rmRoomGroupId === undefined) {
            return {
                roomGroupName: card.roomGroupName,
                currentValue: null
            };
        }

        const currentValue = await fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group", rmRoomGroupId);
        return {
            roomGroupName: card.roomGroupName,
            currentValue
        };
    }));
    if (isSyncContextStale(syncContext)) {
        return;
    }

    const [
        currentTransientRoomCount,
        previousDayTransientRoomCount,
        previousWeekTransientRoomCount,
        previousMonthTransientRoomCount,
        currentGroupRoomCount,
        previousDayGroupRoomCount,
        previousWeekGroupRoomCount,
        previousMonthGroupRoomCount,
        overallBookingCurveData
    ] = await Promise.all([
        fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "transient"),
        fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "transient"),
        fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "transient"),
        fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "transient"),
        fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group"),
        fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "group"),
        fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "group"),
        fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "group"),
        getBookingCurve(analysisDate, batchDateKey).catch(() => null)
    ]);
    if (isSyncContextStale(syncContext)) {
        return;
    }

    const firstCard = cards[0];
    if (firstCard === undefined || !firstCard.cardElement.isConnected) {
        return;
    }

    const showGroupMetrics = getInconsistentSalesSettingGroupNames(currentRoomGroupMetrics, currentGroupRoomCount).length === 0;
    if (!showGroupMetrics) {
        console.warn(`[${SCRIPT_NAME}] skipped overall group summary because room-group counts were inconsistent`, {
            analysisDate,
            batchDateKey,
            currentGroupRoomCount,
            currentRoomGroupMetrics
        });
    }

    renderSalesSettingOverallSummary(
        firstCard,
        totalCapacity,
        sumMetricValues(roomDeltaMetrics.map((metric) => metric.currentValue)),
        sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousDayValue)),
        sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousWeekValue)),
        sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousMonthValue)),
        resolveSalesSettingPrivateRoomCount(currentTransientRoomCount, sumMetricValues(roomDeltaMetrics.map((metric) => metric.currentValue)), currentGroupRoomCount),
        resolveSalesSettingPrivateRoomCount(previousDayTransientRoomCount, sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousDayValue)), previousDayGroupRoomCount),
        resolveSalesSettingPrivateRoomCount(previousWeekTransientRoomCount, sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousWeekValue)), previousWeekGroupRoomCount),
        resolveSalesSettingPrivateRoomCount(previousMonthTransientRoomCount, sumMetricValues(roomDeltaMetrics.map((metric) => metric.previousMonthValue)), previousMonthGroupRoomCount),
        currentGroupRoomCount,
        previousDayGroupRoomCount,
        previousWeekGroupRoomCount,
        previousMonthGroupRoomCount,
        showGroupMetrics,
        overallBookingCurveData === null ? null : buildSalesSettingBookingCurveRenderData(overallBookingCurveData, analysisDate, batchDateKey)
    );
}

async function syncSalesSettingRankInsights(analysisDate: string, syncContext: SyncContext): Promise<void> {
    const cards = collectSalesSettingCards();
    if (cards.length === 0) {
        cleanupSalesSettingRankOverview();
        cleanupSalesSettingRankDetails();
        return;
    }

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

    const summaries = buildSalesSettingRankSummaries(cards, statuses);
    const summaryByRoomGroupName = new Map(summaries.map((summary) => [summary.roomGroupName, summary]));

    const firstCard = cards[0];
    if (firstCard === undefined || !firstCard.cardElement.isConnected) {
        return;
    }

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

function collectSalesSettingCards(): SalesSettingCard[] {
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

function getLookupDate(stayDate: string): string {
    return stayDate;
}

function shiftDate(date: string, offsetDays: number): string {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(4, 6));
    const day = Number(date.slice(6, 8));
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
    if (collectSalesSettingCards().length === 0) {
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

async function loadLincolnSuggestStatuses(analysisDate: string): Promise<LincolnSuggestStatus[]> {
    const url = new URL(LINCOLN_SUGGEST_STATUS_ENDPOINT, window.location.origin);
    url.searchParams.set("filter_type", "stay_date");
    url.searchParams.set("from", analysisDate);
    url.searchParams.set("to", analysisDate);

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
    return (payload.suggest_statuses ?? []).filter((status) => status.date === analysisDate);
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

    activeBatchDateKey = batchDateKey;
    activeFacilityCacheKey = facilityCacheKey;
    salesSettingPrefetchKeys.clear();
    groupRoomCache.clear();
    bookingCurveCache.clear();
    lincolnSuggestStatusCache.clear();
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

        return JSON.parse(raw) as BookingCurveResponse;
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to read persistent booking-curve cache`, {
            cacheKey,
            error
        });
    }

    return undefined;
}

function writePersistedBookingCurve(facilityCacheKey: string, cacheKey: string, data: BookingCurveResponse): void {
    try {
        window.localStorage.setItem(`${getBookingCurveStoragePrefix(facilityCacheKey)}${cacheKey}`, JSON.stringify(data));
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to write persistent booking-curve cache`, {
            cacheKey,
            error
        });
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

    const actionButton = Array.from(toolbarElement.querySelectorAll<HTMLButtonElement>("button"))
        .find((buttonElement) => (buttonElement.textContent ?? "").includes("販売設定を一括反映"));
    const insertionAnchor = actionButton?.parentElement ?? null;

    const toggleElement = existingToggle ?? document.createElement("div");
    toggleElement.setAttribute(GROUP_ROOM_TOGGLE_ATTRIBUTE, "");

    const buttonElement = (existingToggle?.querySelector<HTMLElement>(`[${GROUP_ROOM_TOGGLE_BUTTON_ATTRIBUTE}]`) ?? document.createElement("button")) as HTMLButtonElement;
    buttonElement.type = "button";
    updateGroupRoomToggleButton(buttonElement, isGroupRoomCalendarVisible());

    if (buttonElement.parentElement !== toggleElement || toggleElement.childElementCount !== 1) {
        toggleElement.replaceChildren(buttonElement);
    }

    if (toggleElement.parentElement !== toolbarElement) {
        toggleElement.remove();
    }

    if (toggleElement.parentElement === null) {
        if (insertionAnchor !== null) {
            toolbarElement.insertBefore(toggleElement, insertionAnchor);
        } else {
            toolbarElement.append(toggleElement);
        }
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
        renderSalesSettingBookingCurveTooltipDetail(detailElement, marker);
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
    series: SalesSettingBookingCurveSeries,
    markers: SalesSettingBookingCurveMarker[],
    variant: "overall" | "individual"
): SVGSVGElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svgElement = document.createElementNS(svgNamespace, "svg");
    svgElement.setAttribute(SALES_SETTING_BOOKING_CURVE_PANEL_SVG_ATTRIBUTE, "");
    svgElement.setAttribute("viewBox", "0 0 420 164");
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute("aria-label", variant === "overall" ? "全体ブッキングカーブ表示イメージ" : "個人ブッキングカーブ表示イメージ");

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
    const samples = buildSalesSettingBookingCurveSamples(
        safeMaxValue,
        series,
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

    const linePath = buildSalesSettingBookingCurveLinePath(samples);
    if (linePath !== "") {
        const pathElement = document.createElementNS(svgNamespace, "path");
        pathElement.setAttribute("d", linePath);
        pathElement.setAttribute("fill", "none");
        pathElement.setAttribute("stroke", variant === "overall" ? "#1f5fbf" : "#2f8f5b");
        pathElement.setAttribute("stroke-width", "3");
        pathElement.setAttribute("stroke-linejoin", "round");
        pathElement.setAttribute("stroke-linecap", "round");
        svgElement.append(pathElement);
    }

    const guideLineElement = document.createElementNS(svgNamespace, "line");
    guideLineElement.setAttribute(SALES_SETTING_BOOKING_CURVE_ACTIVE_GUIDE_ATTRIBUTE, "");
    guideLineElement.setAttribute("visibility", "hidden");
    svgElement.append(guideLineElement);

    const pointElement = document.createElementNS(svgNamespace, "circle");
    pointElement.setAttribute(SALES_SETTING_BOOKING_CURVE_ACTIVE_POINT_ATTRIBUTE, "");
    pointElement.setAttribute("r", "4.5");
    pointElement.setAttribute("stroke", variant === "overall" ? "#1f5fbf" : "#2f8f5b");
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
        hitboxElement.addEventListener("mouseenter", () => {
            showSalesSettingBookingCurveTooltip(
                tooltipElement,
                guideLineElement,
                pointElement,
                sample,
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
        markerElement.setAttribute("fill", variant === "overall" ? "#1f5fbf" : "#2f8f5b");
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
    marker: (SalesSettingBookingCurveMarker & { x: number; y: number }) | null
): void {
    if (marker === null) {
        detailElement.replaceChildren();
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

    detailElement.replaceChildren(emphasisElement, document.createTextNode(tailText));
}

function createSalesSettingBookingCurvePanel(
    title: string,
    maxValue: number,
    currentValue: number | null,
    series: SalesSettingBookingCurveSeries,
    markers: SalesSettingBookingCurveMarker[],
    variant: "overall" | "individual"
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
    const svgElement = createSalesSettingBookingCurveSvg(tooltipElement, maxValue, series, markers, variant);
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

function createSalesSettingBookingCurveSection(
    kind: "overall" | "card",
    titleLabel: string,
    maxValue: number,
    currentOverallRoomCount: number | null,
    currentIndividualRoomCount: number | null,
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
    noteElement.textContent = "booking_curve実データ";

    headerElement.replaceChildren(titleElement, noteElement);

    const gridElement = document.createElement("div");
    gridElement.setAttribute(SALES_SETTING_BOOKING_CURVE_GRID_ATTRIBUTE, "");
    gridElement.replaceChildren(
        createSalesSettingBookingCurvePanel("全体", maxValue, currentOverallRoomCount, curveData.overall, curveData.overallRankMarkers, "overall"),
        createSalesSettingBookingCurvePanel("個人", maxValue, currentIndividualRoomCount, curveData.individual, curveData.individualRankMarkers, "individual")
    );

    sectionElement.replaceChildren(headerElement, gridElement);
    return sectionElement;
}

function renderSalesSettingOverallBookingCurve(
    containerElement: HTMLElement,
    totalCapacity: SalesSettingRoomCapacity | null,
    currentRoomValue: number | null,
    currentIndividualRoomCount: number | null,
    curveData: SalesSettingBookingCurveRenderData | null
): void {
    const existingSection = containerElement.querySelector<HTMLElement>(`[${SALES_SETTING_BOOKING_CURVE_SECTION_ATTRIBUTE}][${SALES_SETTING_BOOKING_CURVE_KIND_ATTRIBUTE}="overall"]`);
    if (totalCapacity === null || curveData === null) {
        existingSection?.remove();
        return;
    }

    const signature = `overall:${totalCapacity.maxValue}:${currentRoomValue}:${currentIndividualRoomCount}:${curveData.overall.signature}:${curveData.individual.signature}:${curveData.rankSignature}`;
    const sectionElement = existingSection ?? document.createElement("section");
    if (existingSection?.getAttribute(SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE) !== signature) {
        const nextSection = createSalesSettingBookingCurveSection(
            "overall",
            "全体",
            totalCapacity.maxValue,
            currentRoomValue,
            currentIndividualRoomCount,
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
    currentIndividualRoomCount: number | null,
    curveData: SalesSettingBookingCurveRenderData | null
): void {
    const capacity = parseSalesSettingRoomCapacity(card.roomCountSummaryElement);
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

    const signature = `card:${card.roomGroupName}:${capacity.maxValue}:${currentOverallRoomCount}:${currentIndividualRoomCount}:${curveData.overall.signature}:${curveData.individual.signature}:${curveData.rankSignature}`;
    const sectionElement = existingSection ?? document.createElement("section");
    if (existingSection?.getAttribute(SALES_SETTING_BOOKING_CURVE_SIGNATURE_ATTRIBUTE) !== signature) {
        const nextSection = createSalesSettingBookingCurveSection(
            "card",
            card.roomGroupName,
            capacity.maxValue,
            currentOverallRoomCount,
            currentIndividualRoomCount,
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
    const parentElement = firstCard.cardElement.parentElement;
    if (parentElement === null) {
        return;
    }

    const existingContainer = parentElement.querySelector<HTMLElement>(`[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`);
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

        const salesRowElement = document.createElement("div");
        salesRowElement.setAttribute(SALES_SETTING_OVERALL_SALES_ROW_ATTRIBUTE, "");

        const titleElement = document.createElement("span");
        titleElement.setAttribute(SALES_SETTING_OVERALL_TITLE_ATTRIBUTE, "");
        titleElement.textContent = "全体";

        const metricElement = document.createElement("span");
        metricElement.setAttribute(SALES_SETTING_OVERALL_METRIC_ATTRIBUTE, "");
        metricElement.textContent = `販売室数 : ${formatSalesSettingCapacity(totalCapacity)}`;

        salesRowElement.replaceChildren(titleElement, metricElement);

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

    if (containerElement !== null && containerElement.nextElementSibling !== firstCard.cardElement) {
        parentElement.insertBefore(containerElement, firstCard.cardElement);
    }

    renderSalesSettingOverallBookingCurve(
        containerElement,
        totalCapacity,
        currentRoomValue,
        currentIndividualRoomCount,
        curveData
    );
}

function renderSalesSettingRankOverview(firstCard: SalesSettingCard, summaries: SalesSettingRankSummary[]): void {
    const parentElement = firstCard.cardElement.parentElement;
    if (parentElement === null) {
        return;
    }

    const existingContainer = parentElement.querySelector<HTMLElement>(`[${SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE}]`);
    if (summaries.length === 0) {
        existingContainer?.remove();
        return;
    }

    const orderedSummaries = summaries.slice().sort(compareSalesSettingRankSummaries);
    const signature = orderedSummaries
        .map((summary) => `${summary.roomGroupName}:${summary.latestReflectionAt}:${summary.beforeRankName}:${summary.afterRankName}`)
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
        for (const label of ["部屋タイプ", "最終変更", "ランク"]) {
            const headerCellElement = document.createElement("th");
            headerCellElement.scope = "col";
            headerCellElement.textContent = label;
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

            rowElement.replaceChildren(roomElement, metaElement, valueElement);
            bodyElement.append(rowElement);
        }

        tableElement.replaceChildren(headElement, bodyElement);

        containerElement.replaceChildren(
            titleElement,
            tableElement
        );
    }

    const overallSummaryElement = parentElement.querySelector<HTMLElement>(`[${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}]`);
    const insertionAnchor = overallSummaryElement?.nextSibling ?? firstCard.cardElement;
    if (containerElement !== insertionAnchor?.previousSibling) {
        parentElement.insertBefore(containerElement, insertionAnchor);
    }
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
            currentIndividualRoomCount,
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
        currentIndividualRoomCount,
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

function formatSalesSettingCapacity(capacity: SalesSettingRoomCapacity | null): string {
    if (capacity === null) {
        return "- / -";
    }

    return `${formatGroupRoomNumber(capacity.currentValue)} / ${formatGroupRoomNumber(capacity.maxValue)}`;
}

function buildSalesSettingRankSummaries(cards: SalesSettingCard[], statuses: LincolnSuggestStatus[]): SalesSettingRankSummary[] {
    const latestStatusByRoomGroupName = new Map<string, LincolnSuggestStatus>();
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
        return [{
            roomGroupName: card.roomGroupName,
            displayOrder: index,
            latestReflectionAt,
            latestReflectionDaysAgo: getDaysAgo(latestReflectionAt),
            beforeRankName: status.before_price_rank_name ?? null,
            afterRankName: status.after_price_rank_name ?? null
        }];
    });
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

        [${GROUP_ROOM_TOGGLE_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            align-self: center;
            margin: 0 16px 0 20px;
            margin-right: auto;
            pointer-events: auto;
            position: relative;
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
            stroke: #1f5fbf;
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
