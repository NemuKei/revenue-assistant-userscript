import { detectLegacyClassicRuntime } from "../runtimeLease";
import { parseNextFacilityContext } from "../facilityContext";
import {
    collectLiveCalendarDom,
    hasLiveFacilityContextLabel,
    readLiveFacilityContextHints,
    type LiveCalendarDomSnapshot
} from "../live/liveCalendarDomAdapter";
import {
    parseLiveSimilarityLensAsOfDate,
    parseLiveSimilarityLensCurrentSettings
} from "../live/liveSimilarityLensDataSource";
import {
    createBrowserNextReadTransport,
    createNextReadSession,
    type NextReadTransport
} from "../live/liveSimilarityLensTransport";
import {
    createNextBookingCurveScopes,
    type NextBookingCurveAcquisitionContext
} from "./bookingCurveAcquisitionModel";
import type {
    NextBookingCurveAcquisitionCoordinator,
    NextBookingCurveAcquisitionState,
    NextBookingCurveAcquisitionStopReason
} from "./bookingCurveAcquisitionCoordinator";

export const NEXT_BOOKING_CURVE_ACQUISITION_ROOT_ATTRIBUTE =
    "data-ra-next-booking-curve-acquisition-root";
const NEXT_BOOKING_CURVE_ACQUISITION_STYLE_ATTRIBUTE =
    "data-ra-next-booking-curve-acquisition-style";
const NEXT_BOOKING_CURVE_ACQUISITION_STATE_ATTRIBUTE =
    "data-ra-next-booking-curve-acquisition-state";

export interface BookingCurveAcquisitionRuntimeHandle {
    reconcile(): void;
    stop(): void;
}

export interface StartBookingCurveAcquisitionRuntimeOptions {
    coordinator: NextBookingCurveAcquisitionCoordinator;
    transport?: NextReadTransport;
}

export function startBookingCurveAcquisitionRuntime(
    documentHost: Document,
    windowHost: Window,
    options: StartBookingCurveAcquisitionRuntimeOptions
): BookingCurveAcquisitionRuntimeHandle {
    const transport = options.transport ?? createBrowserNextReadTransport(windowHost);
    const abortController = new AbortController();
    const observer = new MutationObserver(scheduleReconcile);
    let activeLoadController: AbortController | null = null;
    let activeFingerprint: string | null = null;
    let generation = 0;
    let root: HTMLElement | null = null;
    let scheduledTimer: number | null = null;
    let state: NextBookingCurveAcquisitionState = {
        errorCount: 0,
        mode: null,
        processedCount: 0,
        requestCount: 0,
        skippedCount: 0,
        status: "idle",
        stopReason: null,
        storedCount: 0,
        totalCount: 0
    };
    let stopped = false;
    const unsubscribe = options.coordinator.subscribe((nextState) => {
        state = nextState;
        render();
    });

    windowHost.addEventListener("popstate", scheduleReconcile, {
        signal: abortController.signal
    });
    documentHost.addEventListener("visibilitychange", scheduleReconcile, {
        signal: abortController.signal
    });
    observer.observe(documentHost.body, {
        attributeFilter: ["aria-hidden", "class", "hidden", "inert", "style"],
        attributes: true,
        childList: true,
        subtree: true
    });
    reconcile();

    return { reconcile, stop };

    function reconcile(): void {
        if (stopped) {
            return;
        }
        if (detectLegacyClassicRuntime(documentHost)) {
            suspend("stopped");
            return;
        }
        if (documentHost.visibilityState === "hidden") {
            suspend("document-hidden");
            return;
        }
        const surface = resolveAcquisitionSurface(documentHost, windowHost.location.pathname);
        if (surface === null) {
            suspend("inactive-route");
            return;
        }
        ensureRoot(surface);
        const asOfDate = parseLiveSimilarityLensAsOfDate(documentHost);
        if (asOfDate === null) {
            if (activeFingerprint !== null) {
                activeFingerprint = null;
                activeLoadController?.abort();
                activeLoadController = null;
                options.coordinator.suspend("facility-context-changed");
            }
            setRuntimeState("waiting-as-of");
            return;
        }
        const facilityHints = readLiveFacilityContextHints(documentHost);
        const fingerprint = [
            surface.kind,
            asOfDate,
            surface.stayDates.join(","),
            facilityHints.join("\u001f")
        ].join("|");
        if (fingerprint === activeFingerprint) {
            return;
        }
        if (activeFingerprint !== null) {
            options.coordinator.suspend("facility-context-changed");
        }
        activeFingerprint = fingerprint;
        activeLoadController?.abort();
        const controller = new AbortController();
        activeLoadController = controller;
        const currentGeneration = ++generation;
        setRuntimeState("resolving-context");
        void loadContext({
            asOfDate,
            facilityHints,
            signal: controller.signal,
            stayDates: surface.stayDates
        }).then(async (context) => {
            if (
                stopped
                || controller.signal.aborted
                || currentGeneration !== generation
                || activeFingerprint !== fingerprint
            ) {
                return;
            }
            if (context === null) {
                setRuntimeState("suspended-context-mismatch");
                return;
            }
            await options.coordinator.startBackground(context);
        }).catch(() => {
            if (!controller.signal.aborted) {
                setRuntimeState("context-error");
            }
        });
    }

    async function loadContext(loadOptions: {
        asOfDate: string;
        facilityHints: readonly string[];
        signal: AbortSignal;
        stayDates: readonly string[];
    }): Promise<NextBookingCurveAcquisitionContext | null> {
        const firstDate = loadOptions.stayDates[0];
        const lastDate = loadOptions.stayDates.at(-1);
        if (firstDate === undefined || lastDate === undefined) {
            return null;
        }
        const session = createNextReadSession(transport, loadOptions.signal);
        const [facilityPayload, currentSettingsPayload] = await Promise.all([
            session.read({ kind: "facility" }),
            session.read({ kind: "current-settings", from: firstDate, to: lastDate })
        ]);
        const facility = parseNextFacilityContext(facilityPayload);
        const currentSettings = parseLiveSimilarityLensCurrentSettings(currentSettingsPayload);
        if (
            facility === null
            || currentSettings === null
            || !hasLiveFacilityContextLabel(loadOptions.facilityHints, facility.facilityLabel)
        ) {
            return null;
        }
        return {
            asOfDate: loadOptions.asOfDate,
            facilityId: facility.facilityId,
            roomScopes: createNextBookingCurveScopes(currentSettings),
            visibleStayDates: loadOptions.stayDates
        };
    }

    function ensureRoot(surface: AcquisitionSurface): void {
        const candidates = Array.from(documentHost.querySelectorAll<HTMLElement>(
            `[${NEXT_BOOKING_CURVE_ACQUISITION_ROOT_ATTRIBUTE}]`
        ));
        for (const duplicate of candidates.slice(1)) {
            duplicate.remove();
        }
        root = candidates[0] ?? createRoot(documentHost);
        if (root.parentElement !== surface.mountParent) {
            root.remove();
            if (
                surface.mountBefore !== null
                && surface.mountBefore.parentElement === surface.mountParent
            ) {
                surface.mountParent.insertBefore(root, surface.mountBefore);
            } else {
                surface.mountParent.append(root);
            }
        }
        ensureStyles(documentHost);
        render();
    }

    function render(): void {
        if (root === null || !root.isConnected) {
            return;
        }
        root.replaceChildren();
        const label = documentHost.createElement("strong");
        label.textContent = state.mode === null
            ? "取得準備"
            : state.mode === "bootstrap"
                ? "初回準備"
                : "本日差分";
        const message = documentHost.createElement("span");
        message.textContent = formatNextBookingCurveAcquisitionState(state);
        root.append(label, message);
        root.setAttribute("role", "status");
        root.setAttribute("aria-live", state.status === "stopped" ? "assertive" : "polite");
        setRuntimeState(state.status);
    }

    function setRuntimeState(value: string): void {
        documentHost.documentElement.setAttribute(
            NEXT_BOOKING_CURVE_ACQUISITION_STATE_ATTRIBUTE,
            value
        );
    }

    function suspend(reason: NextBookingCurveAcquisitionStopReason): void {
        generation += 1;
        activeLoadController?.abort();
        activeLoadController = null;
        activeFingerprint = null;
        options.coordinator.suspend(reason);
        root?.remove();
        root = null;
        documentHost.querySelector(`[${NEXT_BOOKING_CURVE_ACQUISITION_STYLE_ATTRIBUTE}]`)?.remove();
        setRuntimeState(`suspended-${reason}`);
    }

    function scheduleReconcile(): void {
        if (stopped || scheduledTimer !== null) {
            return;
        }
        scheduledTimer = windowHost.setTimeout(() => {
            scheduledTimer = null;
            reconcile();
        }, 0);
    }

    function stop(): void {
        if (stopped) {
            return;
        }
        stopped = true;
        observer.disconnect();
        abortController.abort();
        if (scheduledTimer !== null) {
            windowHost.clearTimeout(scheduledTimer);
            scheduledTimer = null;
        }
        unsubscribe();
        options.coordinator.stop();
        generation += 1;
        activeLoadController?.abort();
        activeLoadController = null;
        activeFingerprint = null;
        root?.remove();
        root = null;
        documentHost.querySelector(`[${NEXT_BOOKING_CURVE_ACQUISITION_STYLE_ATTRIBUTE}]`)?.remove();
        setRuntimeState("suspended-stopped");
    }
}

interface AcquisitionSurface {
    kind: "analyze" | "calendar";
    mountBefore: HTMLElement | null;
    mountParent: HTMLElement;
    stayDates: readonly string[];
}

function resolveAcquisitionSurface(
    documentHost: Document,
    pathname: string
): AcquisitionSurface | null {
    if (pathname === "/" || pathname.trim() === "") {
        const result = collectLiveCalendarDom(documentHost);
        if (!result.ok) {
            return null;
        }
        return buildCalendarSurface(result.snapshot);
    }
    const stayDate = parseAnalyzeStayDate(pathname);
    const main = documentHost.querySelector<HTMLElement>("main");
    if (stayDate === null || main === null) {
        return null;
    }
    return {
        kind: "analyze",
        mountBefore: null,
        mountParent: main,
        stayDates: [stayDate]
    };
}

function buildCalendarSurface(snapshot: LiveCalendarDomSnapshot): AcquisitionSurface {
    return {
        kind: "calendar",
        mountBefore: snapshot.mountBoundary,
        mountParent: snapshot.mountParent,
        stayDates: snapshot.cells
            .map((cell) => cell.stayDate.replaceAll("-", ""))
            .sort()
    };
}

function parseAnalyzeStayDate(pathname: string): string | null {
    const match = /^\/analyze\/(\d{4})-(\d{2})-(\d{2})\/?$/u.exec(pathname.trim());
    if (match === null) {
        return null;
    }
    const compact = `${match[1]}${match[2]}${match[3]}`;
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? compact
        : null;
}

function createRoot(documentHost: Document): HTMLElement {
    const root = documentHost.createElement("section");
    root.setAttribute(NEXT_BOOKING_CURVE_ACQUISITION_ROOT_ATTRIBUTE, "");
    return root;
}

function ensureStyles(documentHost: Document): void {
    if (documentHost.querySelector(`[${NEXT_BOOKING_CURVE_ACQUISITION_STYLE_ATTRIBUTE}]`) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.setAttribute(NEXT_BOOKING_CURVE_ACQUISITION_STYLE_ATTRIBUTE, "");
    style.textContent = `
[${NEXT_BOOKING_CURVE_ACQUISITION_ROOT_ATTRIBUTE}] {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(100%, calc(100vw - 48px));
    margin: 8px 0;
    padding: 9px 12px;
    border: 1px solid #cbd7e2;
    border-radius: 7px;
    background: #f7fafc;
    color: #465f73;
    font: 12px/1.5 "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif;
}
[${NEXT_BOOKING_CURVE_ACQUISITION_ROOT_ATTRIBUTE}] strong {
    flex: 0 0 auto;
    color: #24445d;
}
@media (max-width: 680px) {
    [${NEXT_BOOKING_CURVE_ACQUISITION_ROOT_ATTRIBUTE}] {
        align-items: flex-start;
        flex-direction: column;
        gap: 2px;
        width: min(100%, calc(100vw - 48px));
    }
}
`;
    documentHost.head.append(style);
}

export function formatNextBookingCurveAcquisitionState(
    state: NextBookingCurveAcquisitionState
): string {
    if (state.status === "idle" || state.status === "planning") {
        return "取得済み範囲を確認しています";
    }
    const progress = `${state.processedCount}/${Math.max(state.totalCount, state.processedCount)}`;
    const details =
        `保存 ${state.storedCount}・重複回避 ${state.skippedCount}・エラー ${state.errorCount}`;
    if (state.status === "running") {
        return `取得中 ${progress}（${details}）`;
    }
    if (state.status === "complete") {
        if (state.mode === "bootstrap") {
            return `今回分完了 ${progress}（${details}・残りは次回確認）`;
        }
        return `完了 ${progress}（${details}）`;
    }
    return `停止 ${formatStopReason(state.stopReason)}（${details}）`;
}

function formatStopReason(reason: NextBookingCurveAcquisitionStopReason | null): string {
    switch (reason) {
        case "budget-reached":
            return "今回の上限に到達・次回再開";
        case "http-401":
            return "ログイン確認が必要";
        case "http-403":
            return "権限または施設確認が必要";
        case "http-429":
            return "アクセス頻度制限";
        case "consecutive-errors":
            return "連続エラー";
        case "document-hidden":
            return "画面非表示";
        case "inactive-route":
            return "対象画面外";
        default:
            return "一時停止";
    }
}
