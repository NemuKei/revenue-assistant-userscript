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
const SALES_SETTING_GROUP_ROOM_ITEM_ATTRIBUTE = "data-ra-sales-setting-group-room-item";
const SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE = "data-ra-sales-setting-group-room-tone";
const SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE = "data-ra-sales-setting-overall-summary";
const SALES_SETTING_OVERALL_SUMMARY_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-overall-summary-signature";
const SALES_SETTING_OVERALL_SALES_ROW_ATTRIBUTE = "data-ra-sales-setting-overall-sales-row";
const SALES_SETTING_OVERALL_TITLE_ATTRIBUTE = "data-ra-sales-setting-overall-title";
const SALES_SETTING_OVERALL_METRIC_ATTRIBUTE = "data-ra-sales-setting-overall-metric";
const SALES_SETTING_OVERALL_GROUP_ROW_ATTRIBUTE = "data-ra-sales-setting-overall-group-row";
const SALES_SETTING_ROOM_DELTA_ATTRIBUTE = "data-ra-sales-setting-room-delta";
const SALES_SETTING_ROOM_DELTA_ITEM_ATTRIBUTE = "data-ra-sales-setting-room-delta-item";
const SALES_SETTING_ROOM_DELTA_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-room-delta-signature";
const SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE = "data-ra-sales-setting-rank-overview";
const SALES_SETTING_RANK_OVERVIEW_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-rank-overview-signature";
const SALES_SETTING_RANK_OVERVIEW_TITLE_ATTRIBUTE = "data-ra-sales-setting-rank-overview-title";
const SALES_SETTING_RANK_OVERVIEW_ROW_ATTRIBUTE = "data-ra-sales-setting-rank-overview-row";
const SALES_SETTING_RANK_OVERVIEW_ROOM_ATTRIBUTE = "data-ra-sales-setting-rank-overview-room";
const SALES_SETTING_RANK_OVERVIEW_META_ATTRIBUTE = "data-ra-sales-setting-rank-overview-meta";
const SALES_SETTING_RANK_OVERVIEW_VALUE_ATTRIBUTE = "data-ra-sales-setting-rank-overview-value";
const SALES_SETTING_RANK_DETAIL_ATTRIBUTE = "data-ra-sales-setting-rank-detail";
const SALES_SETTING_RANK_DETAIL_SIGNATURE_ATTRIBUTE = "data-ra-sales-setting-rank-detail-signature";
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

interface SyncContext {
    version: number;
    analysisDate: string | null;
    batchDateKey: string;
    facilityCacheKey: string;
}

const groupRoomCache = new Map<string, Promise<number | null>>();
const bookingCurveCache = new Map<string, Promise<BookingCurveResponse>>();
const lincolnSuggestStatusCache = new Map<string, Promise<LincolnSuggestStatus[]>>();
const interactionSyncTimeoutIds: number[] = [];
const salesSettingPrefetchKeys = new Set<string>();
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
    const selectedDate = getAnalyzeDate(window.location.pathname);

    activeAnalyzeDate = selectedDate;
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
        prefetchSalesSettingRoomDeltas(activeAnalyzeDate, batchDateKey);
    } else {
        cleanupSalesSettingOverallSummary();
        cleanupSalesSettingRankOverview();
        cleanupSalesSettingRankDetails();
        cleanupSalesSettingGroupRooms();
        cleanupSalesSettingRoomDeltas();
    }

    await Promise.all([
        syncMonthlyCalendarGroupRooms(batchDateKey),
        activeAnalyzeDate === null
            ? Promise.resolve()
            : syncSalesSettingRoomDeltas(activeAnalyzeDate, batchDateKey, syncContext),
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
                currentGroupRoomCount: null,
                previousDayGroupRoomCount: null,
                previousWeekGroupRoomCount: null,
                previousMonthGroupRoomCount: null,
                missingRoomGroup: true
            };
        }

        const [currentGroupRoomCount, previousDayGroupRoomCount, previousWeekGroupRoomCount, previousMonthGroupRoomCount] = await Promise.all([
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "group", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "group", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "group", rmRoomGroupId)
        ]);

        return {
            card,
            roomGroupName: card.roomGroupName,
            currentGroupRoomCount,
            previousDayGroupRoomCount,
            previousWeekGroupRoomCount,
            previousMonthGroupRoomCount,
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
            metric.currentGroupRoomCount,
            metric.previousDayGroupRoomCount,
            metric.previousWeekGroupRoomCount,
            metric.previousMonthGroupRoomCount
        );
    }
}

async function syncSalesSettingRoomDeltas(analysisDate: string, batchDateKey: string, syncContext: SyncContext): Promise<void> {
    const cards = collectSalesSettingCards();
    if (cards.length === 0) {
        return;
    }

    ensureGroupRoomStyles();

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

    await Promise.all(cards.map(async (card) => {
        const rmRoomGroupId = roomGroupIdByName.get(card.roomGroupName);
        if (rmRoomGroupId === undefined) {
            card.headingElement.querySelector<HTMLElement>(`[${SALES_SETTING_ROOM_DELTA_ATTRIBUTE}]`)?.remove();
            return;
        }

        const [currentValue, previousDayValue, previousWeekValue, previousMonthValue] = await Promise.all([
            fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "all", rmRoomGroupId),
            fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "all", rmRoomGroupId)
        ]);

        if (isSyncContextStale(syncContext)) {
            return;
        }

        if (!card.cardElement.isConnected) {
            return;
        }

        renderSalesSettingRoomDelta(card, currentValue, previousDayValue, previousWeekValue, previousMonthValue);
    }));
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

    const [currentGroupRoomCount, previousDayGroupRoomCount, previousWeekGroupRoomCount, previousMonthGroupRoomCount] = await Promise.all([
        fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group"),
        fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "group"),
        fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "group"),
        fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "group")
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
        currentGroupRoomCount,
        previousDayGroupRoomCount,
        previousWeekGroupRoomCount,
        previousMonthGroupRoomCount,
        showGroupMetrics
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
            ...roomGroups.flatMap((roomGroup) => [
                fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "group", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "group", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "group", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "group", roomGroup.id)
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

function prefetchSalesSettingRoomDeltas(analysisDate: string, batchDateKey: string): void {
    const prefetchKey = `${batchDateKey}:${analysisDate}`;
    if (salesSettingPrefetchKeys.has(`${prefetchKey}:room-delta`)) {
        return;
    }

    salesSettingPrefetchKeys.add(`${prefetchKey}:room-delta`);

    const { previousDay, previousWeek, previousMonth } = getRevenueAssistantComparisonDates(batchDateKey);
    void getRoomGroups()
        .then((roomGroups) => Promise.all([
            ...roomGroups.flatMap((roomGroup) => [
                fetchScopedBookingCurveCount(analysisDate, batchDateKey, batchDateKey, "all", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousDay, batchDateKey, "all", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousWeek, batchDateKey, "all", roomGroup.id),
                fetchScopedBookingCurveCount(analysisDate, previousMonth, batchDateKey, "all", roomGroup.id)
            ])
        ]))
        .catch((error: unknown) => {
            salesSettingPrefetchKeys.delete(`${prefetchKey}:room-delta`);
            console.warn(`[${SCRIPT_NAME}] failed to prefetch sales-setting room deltas`, {
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

function clearSalesSettingGroupRoom(card: SalesSettingCard): void {
    card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`)?.remove();
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
    currentGroupRoomCount: number | null,
    previousDayGroupRoomCount: number | null,
    previousWeekGroupRoomCount: number | null,
    previousMonthGroupRoomCount: number | null,
    showGroupMetrics = true
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

        const deltaContainerElement = document.createElement("span");
        deltaContainerElement.setAttribute(SALES_SETTING_ROOM_DELTA_ATTRIBUTE, "");
        deltaContainerElement.setAttribute(
            SALES_SETTING_ROOM_DELTA_SIGNATURE_ATTRIBUTE,
            `overall-room:${currentRoomValue}:${previousDayRoomValue}:${previousWeekRoomValue}:${previousMonthRoomValue}`
        );
        deltaContainerElement.replaceChildren(
            createSalesSettingRoomDeltaItem(
                "1日前",
                formatSalesSettingRoomDelta(currentRoomValue, previousDayRoomValue),
                getMetricDeltaTone(currentRoomValue, previousDayRoomValue)
            ),
            createSalesSettingRoomDeltaItem(
                "7日前",
                formatSalesSettingRoomDelta(currentRoomValue, previousWeekRoomValue),
                getMetricDeltaTone(currentRoomValue, previousWeekRoomValue)
            ),
            createSalesSettingRoomDeltaItem(
                "30日前",
                formatSalesSettingRoomDelta(currentRoomValue, previousMonthRoomValue),
                getMetricDeltaTone(currentRoomValue, previousMonthRoomValue)
            )
        );

        salesRowElement.replaceChildren(titleElement, metricElement, deltaContainerElement);

        if (showGroupMetrics) {
            const groupRowElement = document.createElement("div");
            groupRowElement.setAttribute(SALES_SETTING_OVERALL_GROUP_ROW_ATTRIBUTE, "");
            groupRowElement.replaceChildren(
                createSalesSettingGroupRoomItem("団体室数", formatGroupRoomMetricValue(currentGroupRoomCount), "neutral"),
                createSalesSettingGroupRoomItem(
                    "1日前差分",
                    formatGroupRoomDelta(currentGroupRoomCount, previousDayGroupRoomCount),
                    getGroupRoomDeltaTone(currentGroupRoomCount, previousDayGroupRoomCount)
                ),
                createSalesSettingGroupRoomItem(
                    "7日前差分",
                    formatGroupRoomDelta(currentGroupRoomCount, previousWeekGroupRoomCount),
                    getGroupRoomDeltaTone(currentGroupRoomCount, previousWeekGroupRoomCount)
                ),
                createSalesSettingGroupRoomItem(
                    "30日前差分",
                    formatGroupRoomDelta(currentGroupRoomCount, previousMonthGroupRoomCount),
                    getGroupRoomDeltaTone(currentGroupRoomCount, previousMonthGroupRoomCount)
                )
            );

            containerElement.replaceChildren(salesRowElement, groupRowElement);
        } else {
            containerElement.replaceChildren(salesRowElement);
        }
    }

    if (containerElement !== null && containerElement.nextElementSibling !== firstCard.cardElement) {
        parentElement.insertBefore(containerElement, firstCard.cardElement);
    }
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

        containerElement.replaceChildren(
            titleElement,
            ...orderedSummaries.map((summary) => {
                const rowElement = document.createElement("div");
                rowElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_ROW_ATTRIBUTE, "");
                rowElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, getSalesSettingRankTone());

                const roomElement = document.createElement("span");
                roomElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_ROOM_ATTRIBUTE, "");
                roomElement.textContent = summary.roomGroupName;

                const metaElement = document.createElement("span");
                metaElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_META_ATTRIBUTE, "");
                metaElement.textContent = `最終変更 ${formatSalesSettingDaysAgo(summary.latestReflectionDaysAgo)}`;

                const valueElement = document.createElement("span");
                valueElement.setAttribute(SALES_SETTING_RANK_OVERVIEW_VALUE_ATTRIBUTE, "");
                valueElement.textContent = `ランク：${formatSalesSettingRankTransition(summary.beforeRankName, summary.afterRankName)}`;

                rowElement.replaceChildren(roomElement, metaElement, valueElement);
                return rowElement;
            })
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
    currentGroupRoomCount: number | null,
    previousDayGroupRoomCount: number | null,
    previousWeekGroupRoomCount: number | null,
    previousMonthGroupRoomCount: number | null
): void {
    const existingRow = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`);

    if (
        currentGroupRoomCount === null
        && previousDayGroupRoomCount === null
        && previousWeekGroupRoomCount === null
        && previousMonthGroupRoomCount === null
    ) {
        existingRow?.remove();
        return;
    }

    const signature = [
        currentGroupRoomCount,
        previousDayGroupRoomCount,
        previousWeekGroupRoomCount,
        previousMonthGroupRoomCount
    ].join(":");
    if (existingRow?.getAttribute(SALES_SETTING_GROUP_ROOM_ROW_SIGNATURE_ATTRIBUTE) === signature) {
        return;
    }

    const rowElement = existingRow ?? document.createElement("div");
    rowElement.setAttribute(SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE, "");
    rowElement.setAttribute(SALES_SETTING_GROUP_ROOM_ROW_SIGNATURE_ATTRIBUTE, signature);
    rowElement.replaceChildren(
        createSalesSettingGroupRoomItem("団体室数", formatGroupRoomMetricValue(currentGroupRoomCount), "neutral"),
        createSalesSettingGroupRoomItem(
            "1日前差分",
            formatGroupRoomDelta(currentGroupRoomCount, previousDayGroupRoomCount),
            getGroupRoomDeltaTone(currentGroupRoomCount, previousDayGroupRoomCount)
        ),
        createSalesSettingGroupRoomItem(
            "7日前差分",
            formatGroupRoomDelta(currentGroupRoomCount, previousWeekGroupRoomCount),
            getGroupRoomDeltaTone(currentGroupRoomCount, previousWeekGroupRoomCount)
        ),
        createSalesSettingGroupRoomItem(
            "30日前差分",
            formatGroupRoomDelta(currentGroupRoomCount, previousMonthGroupRoomCount),
            getGroupRoomDeltaTone(currentGroupRoomCount, previousMonthGroupRoomCount)
        )
    );

    if (existingRow !== null) {
        return;
    }

    if (card.detailWrapperElement !== null) {
        card.cardElement.insertBefore(rowElement, card.detailWrapperElement);
        return;
    }

    card.cardElement.append(rowElement);
}

function renderSalesSettingRoomDelta(
    card: SalesSettingCard,
    currentValue: number | null,
    previousDayValue: number | null,
    previousWeekValue: number | null,
    previousMonthValue: number | null
): void {
    const existingContainer = card.headingElement.querySelector<HTMLElement>(`[${SALES_SETTING_ROOM_DELTA_ATTRIBUTE}]`);

    if (currentValue === null && previousDayValue === null && previousWeekValue === null && previousMonthValue === null) {
        existingContainer?.remove();
        return;
    }

    const items = [{
        label: "1日前",
        value: formatSalesSettingRoomDelta(currentValue, previousDayValue),
        tone: getMetricDeltaTone(currentValue, previousDayValue)
    }, {
        label: "7日前",
        value: formatSalesSettingRoomDelta(currentValue, previousWeekValue),
        tone: getMetricDeltaTone(currentValue, previousWeekValue)
    }, {
        label: "30日前",
        value: formatSalesSettingRoomDelta(currentValue, previousMonthValue),
        tone: getMetricDeltaTone(currentValue, previousMonthValue)
    }];
    const signature = items.map((item) => `${item.label}:${item.value}:${item.tone}`).join("|");

    if (existingContainer?.getAttribute(SALES_SETTING_ROOM_DELTA_SIGNATURE_ATTRIBUTE) === signature) {
        return;
    }

    const containerElement = existingContainer ?? document.createElement("span");
    containerElement.setAttribute(SALES_SETTING_ROOM_DELTA_ATTRIBUTE, "");
    containerElement.setAttribute(SALES_SETTING_ROOM_DELTA_SIGNATURE_ATTRIBUTE, signature);
    containerElement.replaceChildren(
        ...items.map((item) => createSalesSettingRoomDeltaItem(item.label, item.value, item.tone))
    );

    if (existingContainer !== null) {
        return;
    }

    if (card.roomCountSummaryElement !== null) {
        card.roomCountSummaryElement.insertAdjacentElement("afterend", containerElement);
        return;
    }

    card.headingElement.append(containerElement);
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

function createSalesSettingGroupRoomItem(label: string, value: string, tone: string): HTMLSpanElement {
    const itemElement = document.createElement("span");
    itemElement.setAttribute(SALES_SETTING_GROUP_ROOM_ITEM_ATTRIBUTE, "");
    itemElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, tone);
    itemElement.textContent = `${label} ${value}`;
    return itemElement;
}

function createSalesSettingRoomDeltaItem(label: string, value: string, tone: string): HTMLSpanElement {
    const itemElement = document.createElement("span");
    itemElement.setAttribute(SALES_SETTING_ROOM_DELTA_ITEM_ATTRIBUTE, "");
    itemElement.setAttribute(SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE, tone);
    itemElement.textContent = `${label} ${value}`;
    return itemElement;
}

function formatGroupRoomMetricValue(value: number | null): string {
    if (value === null) {
        return "-";
    }

    return `${formatGroupRoomNumber(value)}室`;
}

function formatGroupRoomDelta(currentValue: number | null, previousValue: number | null): string {
    const delta = getMetricDelta(currentValue, previousValue);
    if (delta === null) {
        return "-";
    }

    const prefix = delta > 0 ? "+" : "";
    return `${prefix}${formatGroupRoomNumber(delta)}室`;
}

function formatSalesSettingRoomDelta(currentValue: number | null, previousValue: number | null): string {
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
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin: 4px 0 10px;
            color: #50627a;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.4;
        }

        [${SALES_SETTING_GROUP_ROOM_ITEM_ATTRIBUTE}] {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            background: #eef4ff;
            padding: 2px 8px;
            white-space: nowrap;
        }

        [${SALES_SETTING_OVERALL_SUMMARY_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 0 0 12px;
            padding: 10px 12px;
            border: 1px solid #d9e5f7;
            border-radius: 10px;
            background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
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
            font-size: 16px;
            font-weight: 700;
            line-height: 1.2;
        }

        [${SALES_SETTING_OVERALL_METRIC_ATTRIBUTE}] {
            color: #243447;
            font-size: 14px;
            font-weight: 700;
            line-height: 1.4;
            white-space: nowrap;
        }

        [${SALES_SETTING_OVERALL_GROUP_ROW_ATTRIBUTE}] {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            color: #50627a;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.4;
        }

        [${SALES_SETTING_RANK_OVERVIEW_ATTRIBUTE}] {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin: 0 0 12px;
            padding: 10px 12px;
            border: 1px solid #e3e8ef;
            border-radius: 10px;
            background: #ffffff;
        }

        [${SALES_SETTING_RANK_OVERVIEW_TITLE_ATTRIBUTE}] {
            color: #243447;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.4;
        }

        [${SALES_SETTING_RANK_OVERVIEW_ROW_ATTRIBUTE}] {
            display: grid;
            grid-template-columns: minmax(72px, max-content) max-content max-content;
            justify-content: start;
            column-gap: 10px;
            row-gap: 2px;
            align-items: center;
            color: #50627a;
            font-size: 11px;
            font-weight: 700;
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
            font-size: 11px;
            font-weight: 700;
            line-height: 1.4;
            white-space: nowrap;
        }

        @media (max-width: 900px) {
            [${SALES_SETTING_RANK_OVERVIEW_ROW_ATTRIBUTE}] {
                grid-template-columns: minmax(0, 1fr) auto;
            }

            [${SALES_SETTING_RANK_OVERVIEW_VALUE_ATTRIBUTE}] {
                grid-column: 1 / -1;
                justify-self: start;
            }
        }

        [${SALES_SETTING_ROOM_DELTA_ATTRIBUTE}] {
            display: inline-flex;
            flex-wrap: wrap;
            column-gap: 8px;
            row-gap: 2px;
            margin-left: 10px;
            max-width: 100%;
            vertical-align: middle;
        }

        [${SALES_SETTING_ROOM_DELTA_ITEM_ATTRIBUTE}] {
            color: #50627a;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.4;
            white-space: nowrap;
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
