const SCRIPT_NAME = typeof GM_info === "undefined"
    ? "Revenue Assistant Userscript"
    : (GM_info.script?.name ?? "Revenue Assistant Userscript");
const ANALYZE_DATE_PATTERN = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})$/;
const BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";
const CALENDAR_DATE_TEST_ID_PREFIX = "calendar-date-";
const GROUP_ROOM_STYLE_ID = "revenue-assistant-group-room-style";
const GROUP_ROOM_LAYOUT_ATTRIBUTE = "data-ra-group-room-layout";
const GROUP_ROOM_BADGE_ATTRIBUTE = "data-ra-group-room-badge";
const GROUP_ROOM_ROOM_ATTRIBUTE = "data-ra-group-room-room";
const GROUP_ROOM_INDICATOR_ATTRIBUTE = "data-ra-group-room-indicator";
const GROUP_ROOM_STORAGE_PREFIX = "revenue-assistant:group-room-count:v1:";
const GROUP_ROOM_STORAGE_BATCH_KEY = `${GROUP_ROOM_STORAGE_PREFIX}batch-date`;

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

interface MonthlyCalendarCell {
    stayDate: string;
    anchorElement: HTMLAnchorElement;
    containerElement: HTMLElement;
    roomElement: HTMLElement;
    indicatorElement: HTMLElement | null;
}

const groupRoomCache = new Map<string, Promise<number | null>>();
const bookingCurveCache = new Map<string, Promise<BookingCurveResponse>>();
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

function syncPage(): void {
    const nextHref = window.location.href;
    const selectedDate = getAnalyzeDate(window.location.pathname);

    if (selectedDate === null) {
        activeAnalyzeDate = null;
        disconnectCalendarObserver();

        if (nextHref !== activeHref) {
            activeHref = nextHref;
            console.info(`[${SCRIPT_NAME}] non-analyze route`, {
                href: activeHref
            });
        }

        return;
    }

    activeAnalyzeDate = selectedDate;
    ensureCalendarObserver();
    queueCalendarSync();

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
    const cacheKey = `${batchDateKey}:${stayDate}:${lookupDate}`;
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

    const request = getBookingCurve(stayDate, batchDateKey)
        .then((data) => findGroupRoomCount(data, lookupDate))
        .then((groupRoomCount) => {
            writePersistedGroupRoomCount(cacheKey, groupRoomCount);
            return groupRoomCount;
        })
        .catch((error: unknown) => {
            console.error(`[${SCRIPT_NAME}] failed to load booking curve`, {
                stayDate,
                lookupDate,
                error
            });
            return null;
        });

    groupRoomCache.set(cacheKey, request);
    return request;
}

function getBookingCurve(stayDate: string, batchDateKey: string): Promise<BookingCurveResponse> {
    const cacheKey = `${batchDateKey}:${stayDate}`;
    const cached = bookingCurveCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const request = loadBookingCurve(stayDate)
        .then((data) => {
            persistBookingCurveGroupRoomCounts(stayDate, batchDateKey, data);
            return data;
        })
        .catch((error: unknown) => {
            bookingCurveCache.delete(cacheKey);
            throw error;
        });

    bookingCurveCache.set(cacheKey, request);
    return request;
}

async function loadBookingCurve(stayDate: string): Promise<BookingCurveResponse> {
    const url = new URL(BOOKING_CURVE_ENDPOINT, window.location.origin);
    url.searchParams.set("date", stayDate);

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
    const point = data.booking_curve?.find((entry) => entry.date === stayDate);
    const count = point?.group?.this_year_room_sum;

    return typeof count === "number" ? count : null;
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
        childList: true,
        subtree: true
    });
}

function disconnectCalendarObserver(): void {
    calendarObserver?.disconnect();
    calendarObserver = null;
}

function queueCalendarSync(): void {
    if (calendarSyncQueued) {
        return;
    }

    calendarSyncQueued = true;
    window.requestAnimationFrame(() => {
        calendarSyncQueued = false;
        void syncMonthlyCalendarGroupRooms();
    });
}

async function syncMonthlyCalendarGroupRooms(): Promise<void> {
    const analysisDate = activeAnalyzeDate;
    if (analysisDate === null) {
        return;
    }

    const batchDateKey = getCurrentBatchDateKey();
    syncCacheBatch(batchDateKey);

    const cells = collectMonthlyCalendarCells();
    if (cells.length === 0) {
        return;
    }

    ensureGroupRoomStyles();
    await Promise.all(cells.map(async (cell) => {
        const lookupDate = getLookupDate(cell.stayDate, analysisDate);
        const groupRoomCount = await fetchGroupRoomCount(cell.stayDate, lookupDate, batchDateKey);

        if (!cell.anchorElement.isConnected) {
            return;
        }

        renderGroupRoomCount(cell, groupRoomCount);
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

function getLookupDate(stayDate: string, analysisDate: string): string {
    return stayDate < analysisDate ? stayDate : analysisDate;
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
    groupRoomCache.clear();
    bookingCurveCache.clear();
    resetPersistedGroupRoomCache(batchDateKey);
}

function persistBookingCurveGroupRoomCounts(
    stayDate: string,
    batchDateKey: string,
    data: BookingCurveResponse
): void {
    for (const point of data.booking_curve ?? []) {
        const pointDate = point.date;
        const groupRoomCount = typeof point.group?.this_year_room_sum === "number"
            ? point.group.this_year_room_sum
            : null;
        const cacheKey = `${batchDateKey}:${stayDate}:${pointDate}`;
        const request = Promise.resolve(groupRoomCount);

        groupRoomCache.set(cacheKey, request);
        writePersistedGroupRoomCount(cacheKey, groupRoomCount);
    }
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
        const raw = window.localStorage.getItem(`${GROUP_ROOM_STORAGE_PREFIX}${cacheKey}`);
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
        window.localStorage.setItem(`${GROUP_ROOM_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(groupRoomCount));
    } catch (error: unknown) {
        console.warn(`[${SCRIPT_NAME}] failed to write persistent group-room cache`, {
            cacheKey,
            error
        });
    }
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

        [${GROUP_ROOM_INDICATOR_ATTRIBUTE}] {
            font-size: 10px !important;
            line-height: 10px !important;
            padding: 0 2px 1px !important;
        }
    `;
    document.head.append(styleElement);
}

boot();
