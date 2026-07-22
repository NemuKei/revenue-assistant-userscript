export const LIVE_CALENDAR_DATE_SELECTOR = 'a[data-testid^="calendar-date-"]';
export const LIVE_MONTHLY_CALENDAR_SELECTOR = '[data-testid="monthly-calendar"]';

export type LiveCalendarDomFailureReason =
    | "calendar-cells-missing"
    | "calendar-cell-invalid"
    | "calendar-date-duplicate"
    | "calendar-standard-value-missing"
    | "calendar-strip-ambiguous"
    | "calendar-mount-boundary-missing";

export interface LiveCalendarCell {
    analyzeHref: string | null;
    anchor: HTMLAnchorElement;
    standardValueElement: HTMLElement;
    stayDate: string;
}

export interface LiveCalendarDomSnapshot {
    calendarStrip: HTMLElement;
    cells: readonly LiveCalendarCell[];
    dateFingerprint: string;
    facilityContextHints: readonly string[];
    mountBoundary: HTMLElement;
    mountParent: HTMLElement;
}

export type LiveCalendarDomResult =
    | { ok: true; snapshot: LiveCalendarDomSnapshot }
    | { ok: false; reason: LiveCalendarDomFailureReason };

export function collectLiveCalendarDom(documentHost: Document): LiveCalendarDomResult {
    const anchors = Array.from(
        documentHost.querySelectorAll<HTMLAnchorElement>(LIVE_CALENDAR_DATE_SELECTOR)
    ).filter(isVisibleElement);
    if (anchors.length < 28) {
        return { ok: false, reason: "calendar-cells-missing" };
    }

    const cells: LiveCalendarCell[] = [];
    const seenDates = new Set<string>();
    for (const anchor of anchors) {
        const stayDate = parseStayDateFromCalendarTestId(anchor.getAttribute("data-testid"));
        if (stayDate === null || anchor.closest(LIVE_MONTHLY_CALENDAR_SELECTOR) === null) {
            return { ok: false, reason: "calendar-cell-invalid" };
        }
        if (seenDates.has(stayDate)) {
            return { ok: false, reason: "calendar-date-duplicate" };
        }
        const standardValueElement = anchor.querySelector<HTMLElement>(
            `[data-testid="room-num-${stayDate}"]`
        );
        if (standardValueElement === null) {
            return { ok: false, reason: "calendar-standard-value-missing" };
        }
        seenDates.add(stayDate);
        cells.push({
            analyzeHref: anchor.hasAttribute("href") ? anchor.href : null,
            anchor,
            standardValueElement,
            stayDate
        });
    }

    const calendarStrip = findLowestCommonAncestor(cells.map((cell) => cell.anchor));
    if (
        calendarStrip === null
        || calendarStrip.matches("html, body, main")
        || calendarStrip.querySelectorAll(LIVE_MONTHLY_CALENDAR_SELECTOR).length === 0
    ) {
        return { ok: false, reason: "calendar-strip-ambiguous" };
    }

    const main = calendarStrip.closest<HTMLElement>("main");
    if (main === null) {
        return { ok: false, reason: "calendar-mount-boundary-missing" };
    }
    let mountBoundary: HTMLElement = calendarStrip;
    while (mountBoundary.parentElement !== null && mountBoundary.parentElement !== main) {
        mountBoundary = mountBoundary.parentElement;
    }
    if (mountBoundary.parentElement !== main || mountBoundary === main) {
        return { ok: false, reason: "calendar-mount-boundary-missing" };
    }

    return {
        ok: true,
        snapshot: {
            calendarStrip,
            cells,
            dateFingerprint: cells.map((cell) => cell.stayDate).join(","),
            facilityContextHints: readLiveFacilityContextHints(documentHost),
            mountBoundary,
            mountParent: main
        }
    };
}

export function readLiveFacilityContextHints(documentHost: Document): string[] {
    const selectors = [
        "header [data-testid*='facility']",
        "header [data-testid*='yad']",
        "header button span",
        "header button",
        "header h1",
        "header [role='button'] span",
        "header [role='button']"
    ];
    const hints = new Set<string>();
    for (const selector of selectors) {
        for (const element of documentHost.querySelectorAll<HTMLElement>(selector)) {
            if (!isVisibleElement(element)) {
                continue;
            }
            const text = element.textContent?.replace(/\s+/gu, " ").trim() ?? "";
            if (text !== "") {
                hints.add(text);
            }
        }
    }
    return Array.from(hints);
}

export function hasLiveFacilityContextLabel(
    hints: readonly string[],
    facilityLabel: string
): boolean {
    const normalizedLabel = normalizeFacilityContextText(facilityLabel);
    if (normalizedLabel === "") {
        return false;
    }
    return hints.some((hint) => {
        const normalizedHint = normalizeFacilityContextText(hint);
        return normalizedHint === normalizedLabel;
    });
}

export function parseStayDateFromCalendarTestId(value: string | null): string | null {
    const match = /^calendar-date-(\d{4})-(\d{2})-(\d{2})$/u.exec(value ?? "");
    if (match === null) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
}

function findLowestCommonAncestor(elements: readonly HTMLElement[]): HTMLElement | null {
    let candidate: HTMLElement | null = elements[0] ?? null;
    while (candidate !== null && !elements.every((element) => candidate?.contains(element) === true)) {
        candidate = candidate.parentElement;
    }
    return candidate;
}

function isVisibleElement(element: HTMLElement): boolean {
    if (
        element.hidden
        || element.closest('[hidden], [aria-hidden="true"], [inert]') !== null
    ) {
        return false;
    }
    const defaultView = element.ownerDocument.defaultView;
    for (let current: HTMLElement | null = element; current !== null; current = current.parentElement) {
        const style = defaultView?.getComputedStyle(current);
        if (
            style?.display === "none"
            || style?.visibility === "hidden"
            || style?.visibility === "collapse"
            || Number(style?.opacity ?? "1") <= 0
        ) {
            return false;
        }
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function normalizeFacilityContextText(value: string): string {
    return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}
