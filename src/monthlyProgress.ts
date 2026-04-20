import {
    persistMonthlyBookingCurveSnapshot,
    readLatestMonthlyBookingCurveSnapshot,
    type MonthlyBookingCurveSnapshotRecord
} from "./monthlyProgressIndexedDb";
import {
    buildMonthlyProgressLeadTimeSeries,
    getYearMonthBounds,
    summarizeMonthlyProgressLeadTimeSeries,
    type MonthlyProgressLeadTimeSeries
} from "./monthlyProgressLeadTime";
import { LEAD_TIME_BUCKET_TICKS, LEAD_TIME_BUCKET_VISIBLE_TICKS } from "./leadTimeBuckets";

const MONTHLY_PROGRESS_ROUTE_PATTERN = /^\/monthly-progress\/(\d{4})-(\d{2})$/;
const MONTHLY_PROGRESS_FEATURE_STORAGE_KEY = "revenue-assistant:feature:monthly-progress:enabled";
const MONTHLY_PROGRESS_STORAGE_PREFIX = "revenue-assistant:monthly-progress:v1:";
const MONTHLY_PROGRESS_PREVIEW_STYLE_ID = "revenue-assistant-monthly-progress-preview-style";
const MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE = "data-ra-monthly-progress-preview-root";
const MONTHLY_PROGRESS_PREVIEW_CARD_ATTRIBUTE = "data-ra-monthly-progress-preview-card";
const MONTHLY_PROGRESS_PREVIEW_LABEL_ATTRIBUTE = "data-ra-monthly-progress-preview-label";
const MONTHLY_PROGRESS_PREVIEW_VALUE_ATTRIBUTE = "data-ra-monthly-progress-preview-value";
const MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE = "data-ra-monthly-progress-preview-meta";
const MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE = "data-ra-monthly-progress-preview-note";
const MONTHLY_PROGRESS_RESERVATION_CHART_TEST_ID = "chart-content-numberOfRoomsSold-dateOfReservationBasis";

export interface MonthlyProgressRouteState {
    year: string;
    month: string;
    yearMonth: string;
}

export interface MonthlyProgressStorageAdapter {
    namespacePrefix: string;
    readJson<T>(key: string): T | undefined;
    writeJson(key: string, value: unknown): boolean;
    remove(key: string): void;
    clearNamespace(): number;
}

interface MonthlyProgressSyncOptions {
    scriptName: string;
    href: string;
    routeState: MonthlyProgressRouteState;
    batchDateKey: string;
    resolveFacilityCacheKey: () => Promise<string>;
}

interface MonthlyProgressResolvedContext extends MonthlyProgressSyncOptions {
    facilityCacheKey: string;
}

let activeMonthlyProgressSignature = "";
let activeMonthlyProgressContext: MonthlyProgressResolvedContext | null = null;
let monthlyProgressObserver: MutationObserver | null = null;
let monthlyProgressRenderQueued = false;
let latestMonthlyProgressPreviewSignature = "";

export function getMonthlyProgressRouteState(pathname: string): MonthlyProgressRouteState | null {
    const match = MONTHLY_PROGRESS_ROUTE_PATTERN.exec(pathname);
    if (match === null) {
        return null;
    }

    const year = match[1];
    const month = match[2];
    if (year === undefined || month === undefined) {
        return null;
    }

    return {
        year,
        month,
        yearMonth: `${year}${month}`
    };
}

export function isMonthlyProgressFeatureEnabled(): boolean {
    try {
        return window.localStorage.getItem(MONTHLY_PROGRESS_FEATURE_STORAGE_KEY) !== "0";
    } catch {
        return true;
    }
}

export function createMonthlyProgressStorageAdapter(facilityCacheKey: string): MonthlyProgressStorageAdapter {
    const namespacePrefix = `${MONTHLY_PROGRESS_STORAGE_PREFIX}${facilityCacheKey}:`;

    return {
        namespacePrefix,
        readJson<T>(key: string): T | undefined {
            try {
                const raw = window.localStorage.getItem(`${namespacePrefix}${key}`);
                if (raw === null) {
                    return undefined;
                }

                return JSON.parse(raw) as T;
            } catch {
                return undefined;
            }
        },
        writeJson(key: string, value: unknown): boolean {
            try {
                window.localStorage.setItem(`${namespacePrefix}${key}`, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },
        remove(key: string): void {
            try {
                window.localStorage.removeItem(`${namespacePrefix}${key}`);
            } catch {
                // Ignore storage cleanup failures.
            }
        },
        clearNamespace(): number {
            try {
                const keysToRemove: string[] = [];
                for (let index = 0; index < window.localStorage.length; index += 1) {
                    const key = window.localStorage.key(index);
                    if (key !== null && key.startsWith(namespacePrefix)) {
                        keysToRemove.push(key);
                    }
                }

                for (const key of keysToRemove) {
                    window.localStorage.removeItem(key);
                }

                return keysToRemove.length;
            } catch {
                return 0;
            }
        }
    };
}

export function syncMonthlyProgressPage(options: MonthlyProgressSyncOptions): void {
    const enabled = isMonthlyProgressFeatureEnabled();
    const nextSignature = `${options.href}:${options.routeState.yearMonth}:${options.batchDateKey}:${enabled ? "enabled" : "disabled"}`;
    if (nextSignature === activeMonthlyProgressSignature) {
        return;
    }

    activeMonthlyProgressSignature = nextSignature;

    if (!enabled) {
        cleanupMonthlyProgressPage();
        console.info(`[${options.scriptName}] monthly-progress feature disabled`, {
            href: options.href,
            yearMonth: options.routeState.yearMonth,
            killSwitchStorageKey: MONTHLY_PROGRESS_FEATURE_STORAGE_KEY
        });
        return;
    }

    void options.resolveFacilityCacheKey()
        .then((facilityCacheKey) => {
            if (activeMonthlyProgressSignature !== nextSignature) {
                return;
            }

            const resolvedContext: MonthlyProgressResolvedContext = {
                ...options,
                facilityCacheKey
            };
            activeMonthlyProgressContext = resolvedContext;
            ensureMonthlyProgressObserver();

            const storage = createMonthlyProgressStorageAdapter(facilityCacheKey);
            void persistMonthlyBookingCurveSnapshot({
                scriptName: options.scriptName,
                facilityCacheKey,
                yearMonth: options.routeState.yearMonth,
                batchDateKey: options.batchDateKey
            }).catch((error: unknown) => {
                console.warn(`[${options.scriptName}] failed to persist monthly-progress booking-curve snapshot`, {
                    href: options.href,
                    yearMonth: options.routeState.yearMonth,
                    batchDateKey: options.batchDateKey,
                    facilityCacheKey,
                    error
                });
            });

            void syncMonthlyProgressPreview(resolvedContext);

            console.info(`[${options.scriptName}] monthly-progress route ready`, {
                href: options.href,
                yearMonth: options.routeState.yearMonth,
                batchDateKey: options.batchDateKey,
                facilityCacheKey,
                storageNamespace: storage.namespacePrefix,
                killSwitchStorageKey: MONTHLY_PROGRESS_FEATURE_STORAGE_KEY
            });
        })
        .catch((error: unknown) => {
            console.warn(`[${options.scriptName}] failed to prepare monthly-progress route`, {
                href: options.href,
                yearMonth: options.routeState.yearMonth,
                error
            });
        });
}

export function cleanupMonthlyProgressPage(): void {
    activeMonthlyProgressSignature = "";
    activeMonthlyProgressContext = null;
    latestMonthlyProgressPreviewSignature = "";
    cleanupMonthlyProgressObserver();
    cleanupMonthlyProgressPreview();
}

export function getMonthlyProgressFeatureStorageKey(): string {
    return MONTHLY_PROGRESS_FEATURE_STORAGE_KEY;
}

function ensureMonthlyProgressObserver(): void {
    if (monthlyProgressObserver !== null) {
        return;
    }

    const root = document.querySelector("#root") ?? document.body;
    monthlyProgressObserver = new MutationObserver((mutations) => {
        if (mutations.every((mutation) => isMonthlyProgressManagedMutation(mutation))) {
            return;
        }

        queueMonthlyProgressPreviewSync();
    });
    monthlyProgressObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-selected"],
        childList: true,
        subtree: true
    });
}

function cleanupMonthlyProgressObserver(): void {
    if (monthlyProgressObserver === null) {
        return;
    }

    monthlyProgressObserver.disconnect();
    monthlyProgressObserver = null;
    monthlyProgressRenderQueued = false;
}

function isMonthlyProgressManagedMutation(mutation: MutationRecord): boolean {
    if (mutation.type === "attributes") {
        return isMonthlyProgressManagedNode(mutation.target);
    }

    if (isMonthlyProgressManagedNode(mutation.target)) {
        return true;
    }

    const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return changedNodes.length > 0 && changedNodes.every((node) => isMonthlyProgressManagedNode(node));
}

function isMonthlyProgressManagedNode(node: Node | null): boolean {
    if (node === null) {
        return false;
    }

    if (node instanceof Element) {
        return node.matches(`#${MONTHLY_PROGRESS_PREVIEW_STYLE_ID}, [${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`)
            || node.closest(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`) !== null;
    }

    return node.parentElement?.closest(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`) !== null;
}

function queueMonthlyProgressPreviewSync(): void {
    if (monthlyProgressRenderQueued) {
        return;
    }

    monthlyProgressRenderQueued = true;
    window.requestAnimationFrame(() => {
        monthlyProgressRenderQueued = false;
        const context = activeMonthlyProgressContext;
        if (context === null) {
            cleanupMonthlyProgressPreview();
            return;
        }

        void syncMonthlyProgressPreview(context);
    });
}

async function syncMonthlyProgressPreview(context: MonthlyProgressResolvedContext): Promise<void> {
    try {
        const snapshot = await readLatestMonthlyBookingCurveSnapshot(context.facilityCacheKey, context.routeState.yearMonth);
        if (snapshot === undefined) {
            cleanupMonthlyProgressPreview();
            return;
        }

        const monthBounds = getYearMonthBounds(snapshot.yearMonth);
        if (monthBounds === null) {
            cleanupMonthlyProgressPreview();
            return;
        }

        const roomSeries = buildMonthlyProgressLeadTimeSeries(
            snapshot.payload,
            "room",
            monthBounds.firstDateKey,
            snapshot.batchDateKey
        );
        const salesSeries = buildMonthlyProgressLeadTimeSeries(
            snapshot.payload,
            "sales",
            monthBounds.firstDateKey,
            snapshot.batchDateKey
        );
        console.info(`[${context.scriptName}] monthly-progress LT preview ready`, {
            href: context.href,
            yearMonth: context.routeState.yearMonth,
            snapshotBatchDateKey: snapshot.batchDateKey,
            anchorDateKey: monthBounds.firstDateKey,
            room: summarizeMonthlyProgressLeadTimeSeries(roomSeries),
            sales: summarizeMonthlyProgressLeadTimeSeries(salesSeries)
        });

        renderMonthlyProgressPreview({
            context,
            snapshot,
            anchorDateKey: monthBounds.firstDateKey,
            roomSeries
        });
    } catch (error: unknown) {
        cleanupMonthlyProgressPreview();
        console.warn(`[${context.scriptName}] failed to prepare monthly-progress LT preview`, {
            href: context.href,
            yearMonth: context.routeState.yearMonth,
            facilityCacheKey: context.facilityCacheKey,
            error
        });
    }
}

function renderMonthlyProgressPreview(options: {
    context: MonthlyProgressResolvedContext;
    snapshot: MonthlyBookingCurveSnapshotRecord;
    anchorDateKey: string;
    roomSeries: MonthlyProgressLeadTimeSeries;
}): void {
    const chart = document.querySelector<HTMLElement>(`[data-testid="${MONTHLY_PROGRESS_RESERVATION_CHART_TEST_ID}"]`);
    if (chart === null) {
        cleanupMonthlyProgressPreview();
        return;
    }

    const chartContainer = chart.parentElement;
    const chartGroup = chartContainer?.parentElement;
    if (!(chartContainer instanceof HTMLElement) || !(chartGroup instanceof HTMLElement)) {
        cleanupMonthlyProgressPreview();
        return;
    }

    ensureMonthlyProgressPreviewStyles();

    const visiblePoints = LEAD_TIME_BUCKET_TICKS
        .filter((tick) => LEAD_TIME_BUCKET_VISIBLE_TICKS.has(tick))
        .map((tick) => options.roomSeries.points.find((point) => point.tick === tick) ?? null);
    const previewSignature = JSON.stringify({
        route: options.context.routeState.yearMonth,
        batch: options.context.batchDateKey,
        snapshotBatch: options.snapshot.batchDateKey,
        points: visiblePoints.map((point) => point === null ? null : [point.tick, point.thisYearValue, point.lastYearValue])
    });

    const existingRoot = chartGroup.querySelector<HTMLElement>(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`);
    if (existingRoot !== null && latestMonthlyProgressPreviewSignature === previewSignature && existingRoot.previousElementSibling === chartContainer) {
        return;
    }

    latestMonthlyProgressPreviewSignature = previewSignature;

    const root = existingRoot ?? document.createElement("section");
    root.setAttribute(MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE, "");

    const heading = document.createElement("h3");
    heading.textContent = "LTブッキングカーブ preview";

    const meta = document.createElement("p");
    meta.setAttribute(MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE, "");
    meta.textContent = `予約日基準 / 観測 ${formatDateKey(options.snapshot.batchDateKey)} / anchor ${formatDateKey(options.anchorDateKey)}`;

    const note = document.createElement("p");
    note.setAttribute(MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE, "");
    note.textContent = "日別と同じ LT バケット集約。現年 / 前年同時点の販売客室数を表示。";

    const grid = document.createElement("div");
    for (const point of visiblePoints) {
        const card = document.createElement("div");
        card.setAttribute(MONTHLY_PROGRESS_PREVIEW_CARD_ATTRIBUTE, "");

        const label = document.createElement("div");
        label.setAttribute(MONTHLY_PROGRESS_PREVIEW_LABEL_ATTRIBUTE, "");
        label.textContent = point === null || point.tick === "ACT" ? "ACT" : `${point.tick}日前`;

        const value = document.createElement("div");
        value.setAttribute(MONTHLY_PROGRESS_PREVIEW_VALUE_ATTRIBUTE, "");
        value.textContent = point === null ? "- / -" : `${formatMetricValue(point.thisYearValue)} / ${formatMetricValue(point.lastYearValue)}`;

        const sub = document.createElement("div");
        sub.setAttribute(MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE, "");
        sub.textContent = point === null || point.targetDateKey === null ? "データなし" : `end ${formatDateKey(point.targetDateKey)}`;

        card.replaceChildren(label, value, sub);
        grid.append(card);
    }

    root.replaceChildren(heading, meta, note, grid);

    if (root.parentElement !== chartGroup || root.previousElementSibling !== chartContainer) {
        root.remove();
        chartContainer.insertAdjacentElement("afterend", root);
    }
}

function cleanupMonthlyProgressPreview(): void {
    document.querySelector<HTMLElement>(`[${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}]`)?.remove();
    document.getElementById(MONTHLY_PROGRESS_PREVIEW_STYLE_ID)?.remove();
}

function ensureMonthlyProgressPreviewStyles(): void {
    if (document.getElementById(MONTHLY_PROGRESS_PREVIEW_STYLE_ID) !== null) {
        return;
    }

    const style = document.createElement("style");
    style.id = MONTHLY_PROGRESS_PREVIEW_STYLE_ID;
    style.textContent = `
      [${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}] {
        margin-top: 16px;
        border: 1px solid #d7e1f0;
        border-radius: 12px;
        background: linear-gradient(180deg, #fbfdff 0%, #f2f7fc 100%);
        padding: 16px 18px;
        box-shadow: 0 10px 24px rgba(49, 94, 148, 0.08);
      }
      [${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}] h3 {
        margin: 0;
        color: #183b63;
        font-size: 16px;
        font-weight: 700;
      }
      [${MONTHLY_PROGRESS_PREVIEW_META_ATTRIBUTE}] {
        margin: 6px 0 0;
        color: #55708f;
        font-size: 12px;
        line-height: 1.5;
      }
      [${MONTHLY_PROGRESS_PREVIEW_NOTE_ATTRIBUTE}] {
        margin: 8px 0 0;
        color: #315375;
        font-size: 12px;
        line-height: 1.6;
      }
      [${MONTHLY_PROGRESS_PREVIEW_ROOT_ATTRIBUTE}] > div:last-child {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_CARD_ATTRIBUTE}] {
        border-radius: 10px;
        border: 1px solid #d8e5f2;
        background: #ffffff;
        padding: 10px 10px 9px;
      }
      [${MONTHLY_PROGRESS_PREVIEW_LABEL_ATTRIBUTE}] {
        color: #305272;
        font-size: 11px;
        font-weight: 700;
      }
      [${MONTHLY_PROGRESS_PREVIEW_VALUE_ATTRIBUTE}] {
        margin-top: 6px;
        color: #17324f;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
    `;
    document.head.append(style);
}

function formatMetricValue(value: number | null): string {
    return value === null ? "-" : value.toLocaleString("ja-JP");
}

function formatDateKey(dateKey: string): string {
    if (!/^\d{8}$/.test(dateKey)) {
        return dateKey;
    }

    return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}