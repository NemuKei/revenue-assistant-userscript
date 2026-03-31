const SCRIPT_NAME = typeof GM_info === "undefined"
    ? "Revenue Assistant Userscript"
    : (GM_info.script?.name ?? "Revenue Assistant Userscript");
const ANALYZE_DATE_PATTERN = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})$/;
const BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";
const ROOM_GROUPS_ENDPOINT = "/api/v1/booking_curve/rm_room_groups";
const CALENDAR_DATE_TEST_ID_PREFIX = "calendar-date-";
const GROUP_ROOM_STYLE_ID = "revenue-assistant-group-room-style";
const GROUP_ROOM_LAYOUT_ATTRIBUTE = "data-ra-group-room-layout";
const GROUP_ROOM_BADGE_ATTRIBUTE = "data-ra-group-room-badge";
const GROUP_ROOM_ROOM_ATTRIBUTE = "data-ra-group-room-room";
const GROUP_ROOM_INDICATOR_ATTRIBUTE = "data-ra-group-room-indicator";
const SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE = "data-ra-sales-setting-group-room-row";
const SALES_SETTING_GROUP_ROOM_ITEM_ATTRIBUTE = "data-ra-sales-setting-group-room-item";
const SALES_SETTING_GROUP_ROOM_TONE_ATTRIBUTE = "data-ra-sales-setting-group-room-tone";
const GROUP_ROOM_STORAGE_PREFIX = "revenue-assistant:group-room-count:v3:";
const GROUP_ROOM_STORAGE_BATCH_KEY = `${GROUP_ROOM_STORAGE_PREFIX}batch-date`;
const BOOKING_CURVE_STORAGE_PREFIX = `${GROUP_ROOM_STORAGE_PREFIX}booking-curve:`;
const GROUP_ROOM_RESULT_STORAGE_PREFIX = `${GROUP_ROOM_STORAGE_PREFIX}result:`;

interface BookingCurvePoint {
    date: string;
    group?: {
        this_year_room_sum?: number;
    };
}

interface BookingCurveResponse {
    stay_date: string;
    booking_curve?: BookingCurvePoint[];
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
    detailWrapperElement: HTMLElement | null;
}

const groupRoomCache = new Map<string, Promise<number | null>>();
const bookingCurveCache = new Map<string, Promise<BookingCurveResponse>>();
const interactionSyncTimeoutIds: number[] = [];
const salesSettingPrefetchKeys = new Set<string>();
let roomGroupListPromise: Promise<RoomGroup[]> | null = null;
let activeHref = "";
let activeAnalyzeDate: string | null = null;
let activeBatchDateKey: string | null = null;
let calendarObserver: MutationObserver | null = null;
let calendarSyncQueued = false;

function boot(): void {
    console.info(`[${SCRIPT_NAME}] initialized`, {
        href: window.location.href,
        dev: __DEV__
    });

    installNavigationHooks();
    installInteractionHooks();
    syncPage();
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
    document.addEventListener("click", () => {
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
    void logSelectedDateGroupRooms(selectedDate);
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
    syncCacheBatch(batchDateKey);

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
    return fetchScopedGroupRoomCount(stayDate, lookupDate, batchDateKey);
}

function fetchScopedGroupRoomCount(
    stayDate: string,
    lookupDate: string,
    batchDateKey: string,
    rmRoomGroupId?: string
): Promise<number | null> {
    const scopeKey = getGroupRoomScopeKey(rmRoomGroupId);
    const cacheKey = `${batchDateKey}:${scopeKey}:${stayDate}:${lookupDate}`;
    const cached = groupRoomCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const persisted = readPersistedGroupRoomCount(cacheKey);
    if (persisted !== undefined) {
        const request = Promise.resolve(persisted);
        groupRoomCache.set(cacheKey, request);
        return request;
    }

    const request = getBookingCurve(stayDate, batchDateKey, rmRoomGroupId)
        .then((data) => findGroupRoomCount(data, lookupDate))
        .then((groupRoomCount) => {
            writePersistedGroupRoomCount(cacheKey, groupRoomCount);
            return groupRoomCount;
        })
        .catch((error: unknown) => {
            console.error(`[${SCRIPT_NAME}] failed to load booking curve`, {
                rmRoomGroupId,
                stayDate,
                lookupDate,
                error
            });
            return null;
        });

    groupRoomCache.set(cacheKey, request);
    return request;
}

function getGroupRoomScopeKey(rmRoomGroupId?: string): string {
    return rmRoomGroupId === undefined ? "hotel" : `room-group:${rmRoomGroupId}`;
}

function getBookingCurve(stayDate: string, batchDateKey: string, rmRoomGroupId?: string): Promise<BookingCurveResponse> {
    const scopeKey = getGroupRoomScopeKey(rmRoomGroupId);
    const cacheKey = `${batchDateKey}:${scopeKey}:${stayDate}`;
    const cached = bookingCurveCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const persisted = readPersistedBookingCurve(cacheKey);
    if (persisted !== undefined) {
        const request = Promise.resolve(persisted);
        bookingCurveCache.set(cacheKey, request);
        return request;
    }

    const request = loadBookingCurve(stayDate, rmRoomGroupId)
        .then((data) => {
            writePersistedBookingCurve(cacheKey, data);
            return data;
        })
        .catch((error: unknown) => {
            bookingCurveCache.delete(cacheKey);
            throw error;
        });

    bookingCurveCache.set(cacheKey, request);
    return request;
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

function findGroupRoomCount(data: BookingCurveResponse, stayDate: string): number | null {
    let latestMatchedDate = "";
    let latestMatchedCount: number | null = null;

    for (const point of data.booking_curve ?? []) {
        const pointDate = point.date;
        const count = point.group?.this_year_room_sum;

        if (pointDate > stayDate || typeof count !== "number") {
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
        calendarSyncQueued = false;
        const batchDateKey = getCurrentBatchDateKey();
        const referenceDate = activeAnalyzeDate ?? batchDateKey;
        syncCacheBatch(batchDateKey);

        if (activeAnalyzeDate !== null) {
            prefetchSalesSettingGroupRooms(activeAnalyzeDate, batchDateKey);
        } else {
            cleanupSalesSettingGroupRooms();
        }

        void Promise.all([
            syncMonthlyCalendarGroupRooms(referenceDate, batchDateKey),
            activeAnalyzeDate === null
                ? Promise.resolve()
                : syncSalesSettingGroupRooms(activeAnalyzeDate, batchDateKey)
        ]);
    });
}

async function syncMonthlyCalendarGroupRooms(referenceDate: string, batchDateKey: string): Promise<void> {
    const cells = collectMonthlyCalendarCells();
    if (cells.length === 0) {
        cleanupMonthlyCalendarGroupRooms();
        return;
    }

    ensureGroupRoomStyles();
    await Promise.all(cells.map(async (cell) => {
        const lookupDate = getLookupDate(cell.stayDate, referenceDate);
        const groupRoomCount = await fetchGroupRoomCount(cell.stayDate, lookupDate, batchDateKey);

        if (!cell.anchorElement.isConnected) {
            return;
        }

        renderGroupRoomCount(cell, groupRoomCount);
    }));
}

async function syncSalesSettingGroupRooms(analysisDate: string, batchDateKey: string): Promise<void> {
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
    const roomGroupIdByName = new Map(roomGroups.map((roomGroup) => [roomGroup.name, roomGroup.id]));
    const previousDay = shiftDate(analysisDate, -1);
    const previousWeek = shiftDate(analysisDate, -7);

    await Promise.all(cards.map(async (card) => {
        const rmRoomGroupId = roomGroupIdByName.get(card.roomGroupName);
        if (rmRoomGroupId === undefined) {
            clearSalesSettingGroupRoom(card);
            return;
        }

        const [currentGroupRoomCount, previousDayGroupRoomCount, previousWeekGroupRoomCount] = await Promise.all([
            fetchScopedGroupRoomCount(analysisDate, analysisDate, batchDateKey, rmRoomGroupId),
            fetchScopedGroupRoomCount(analysisDate, previousDay, batchDateKey, rmRoomGroupId),
            fetchScopedGroupRoomCount(analysisDate, previousWeek, batchDateKey, rmRoomGroupId)
        ]);

        if (!card.cardElement.isConnected) {
            return;
        }

        renderSalesSettingGroupRoom(
            card,
            currentGroupRoomCount,
            previousDayGroupRoomCount,
            previousWeekGroupRoomCount
        );
    }));
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
            const cardElement = headingElement.parentElement;

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
                detailWrapperElement: cardElement.querySelector<HTMLElement>(`[data-testid="suggestions-detail-wrapper"]`)
            }];
        });
}

function getLookupDate(stayDate: string, analysisDate: string): string {
    return stayDate < analysisDate ? stayDate : analysisDate;
}

function shiftDate(date: string, offsetDays: number): string {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(4, 6));
    const day = Number(date.slice(6, 8));
    const value = new Date(Date.UTC(year, month - 1, day));
    value.setUTCDate(value.getUTCDate() + offsetDays);

    return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
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

    const previousDay = shiftDate(analysisDate, -1);
    const previousWeek = shiftDate(analysisDate, -7);
    void getRoomGroups()
        .then((roomGroups) => Promise.all(roomGroups.flatMap((roomGroup) => [
            fetchScopedGroupRoomCount(analysisDate, analysisDate, batchDateKey, roomGroup.id),
            fetchScopedGroupRoomCount(analysisDate, previousDay, batchDateKey, roomGroup.id),
            fetchScopedGroupRoomCount(analysisDate, previousWeek, batchDateKey, roomGroup.id)
        ])))
        .catch((error: unknown) => {
            salesSettingPrefetchKeys.delete(prefetchKey);
            console.warn(`[${SCRIPT_NAME}] failed to prefetch sales-setting group rooms`, {
                analysisDate,
                batchDateKey,
                error
            });
        });
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

function syncCacheBatch(batchDateKey: string): void {
    if (activeBatchDateKey === batchDateKey) {
        return;
    }

    activeBatchDateKey = batchDateKey;
    salesSettingPrefetchKeys.clear();
    groupRoomCache.clear();
    bookingCurveCache.clear();
    resetPersistedGroupRoomCache(batchDateKey);
}

function resetPersistedGroupRoomCache(batchDateKey: string): void {
    try {
        const previousBatchDateKey = window.localStorage.getItem(GROUP_ROOM_STORAGE_BATCH_KEY);
        if (previousBatchDateKey === batchDateKey) {
            return;
        }

        const keysToRemove: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (key !== null && key.startsWith(GROUP_ROOM_STORAGE_PREFIX) && key !== GROUP_ROOM_STORAGE_BATCH_KEY) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
        }

        window.localStorage.setItem(GROUP_ROOM_STORAGE_BATCH_KEY, batchDateKey);
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to reset persistent group-room cache`, {
            batchDateKey,
            error
        });
    }
}

function readPersistedGroupRoomCount(cacheKey: string): number | null | undefined {
    try {
        const raw = window.localStorage.getItem(`${GROUP_ROOM_RESULT_STORAGE_PREFIX}${cacheKey}`);
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

function writePersistedGroupRoomCount(cacheKey: string, groupRoomCount: number | null): void {
    try {
        window.localStorage.setItem(`${GROUP_ROOM_RESULT_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(groupRoomCount));
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to write persistent group-room cache`, {
            cacheKey,
            error
        });
    }
}

function readPersistedBookingCurve(cacheKey: string): BookingCurveResponse | undefined {
    try {
        const raw = window.localStorage.getItem(`${BOOKING_CURVE_STORAGE_PREFIX}${cacheKey}`);
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

function writePersistedBookingCurve(cacheKey: string, data: BookingCurveResponse): void {
    try {
        window.localStorage.setItem(`${BOOKING_CURVE_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(data));
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to write persistent booking-curve cache`, {
            cacheKey,
            error
        });
    }
}

function clearSalesSettingGroupRoom(card: SalesSettingCard): void {
    card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`)?.remove();
}

function renderSalesSettingGroupRoom(
    card: SalesSettingCard,
    currentGroupRoomCount: number | null,
    previousDayGroupRoomCount: number | null,
    previousWeekGroupRoomCount: number | null
): void {
    const existingRow = card.cardElement.querySelector<HTMLElement>(`[${SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE}]`);

    if (
        currentGroupRoomCount === null
        && previousDayGroupRoomCount === null
        && previousWeekGroupRoomCount === null
    ) {
        existingRow?.remove();
        return;
    }

    const rowElement = existingRow ?? document.createElement("div");
    rowElement.setAttribute(SALES_SETTING_GROUP_ROOM_ROW_ATTRIBUTE, "");
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

function createSalesSettingGroupRoomItem(label: string, value: string, tone: string): HTMLSpanElement {
    const itemElement = document.createElement("span");
    itemElement.setAttribute(SALES_SETTING_GROUP_ROOM_ITEM_ATTRIBUTE, "");
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
    const delta = getGroupRoomDelta(currentValue, previousValue);
    if (delta === null) {
        return "-";
    }

    const prefix = delta > 0 ? "+" : "";
    return `${prefix}${formatGroupRoomNumber(delta)}室`;
}

function getGroupRoomDeltaTone(currentValue: number | null, previousValue: number | null): string {
    const delta = getGroupRoomDelta(currentValue, previousValue);
    if (delta === null || delta === 0) {
        return "neutral";
    }

    return delta > 0 ? "positive" : "negative";
}

function getGroupRoomDelta(currentValue: number | null, previousValue: number | null): number | null {
    if (currentValue === null || previousValue === null) {
        return null;
    }

    return currentValue - previousValue;
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
        existingBadge?.remove();
        cell.containerElement.removeAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE);
        cell.roomElement.removeAttribute(GROUP_ROOM_ROOM_ATTRIBUTE);
        cell.indicatorElement?.removeAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE);
        return;
    }

    cell.containerElement.setAttribute(GROUP_ROOM_LAYOUT_ATTRIBUTE, "");
    cell.roomElement.setAttribute(GROUP_ROOM_ROOM_ATTRIBUTE, "");
    cell.indicatorElement?.setAttribute(GROUP_ROOM_INDICATOR_ATTRIBUTE, "");

    const badgeElement = existingBadge ?? document.createElement("div");
    badgeElement.setAttribute(GROUP_ROOM_BADGE_ATTRIBUTE, "");
    badgeElement.textContent = `団${groupRoomCount}`;

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
            font-size: 9px;
            font-weight: 700;
            line-height: 9px;
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
