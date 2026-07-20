import type { LiveCalendarDomSnapshot } from "./liveCalendarDomAdapter";
import type { LiveSimilarityLensState } from "./liveSimilarityLensState";

export const LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE = "data-ra-next-similarity-lens-root";
export const LIVE_SIMILARITY_LENS_STYLE_ID = "revenue-assistant-next-similarity-lens-style";
export const LIVE_SIMILARITY_LENS_DESCRIPTION_ID = "ra-next-similarity-lens-base-description";
export const LIVE_SIMILARITY_LENS_INSTRUCTION_ID = "ra-next-similarity-lens-selection-instruction";

const BASE_DATE_ATTRIBUTE = "data-ra-next-lens-base-date";
const SELECTION_MODE_ATTRIBUTE = "data-ra-next-lens-selection-mode";

export function createLiveSimilarityLensRoot(documentHost: Document): HTMLElement {
    const root = documentHost.createElement("section");
    root.setAttribute(LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE, "");
    root.setAttribute("aria-label", "類似日レンズ");
    return root;
}

export function ensureLiveSimilarityLensStyles(documentHost: Document): void {
    if (documentHost.getElementById(LIVE_SIMILARITY_LENS_STYLE_ID) !== null) {
        return;
    }
    const style = documentHost.createElement("style");
    style.id = LIVE_SIMILARITY_LENS_STYLE_ID;
    style.textContent = getLiveSimilarityLensStyles();
    (documentHost.head ?? documentHost.documentElement).append(style);
}

export function renderLiveSimilarityLens(
    root: HTMLElement,
    state: LiveSimilarityLensState
): void {
    root.setAttribute("data-ra-next-lens-state", state.mode);
    let content = root.querySelector<HTMLElement>("[data-ra-next-lens-content]");
    if (content === null) {
        content = root.ownerDocument.createElement("div");
        content.setAttribute("data-ra-next-lens-content", "");
        root.append(content);
    }
    let description = root.querySelector<HTMLElement>(`#${LIVE_SIMILARITY_LENS_DESCRIPTION_ID}`);
    if (description === null) {
        description = textElement(
            root,
            "span",
            "類似日レンズの基準日として選択中",
            "data-ra-next-visually-hidden"
        );
        description.id = LIVE_SIMILARITY_LENS_DESCRIPTION_ID;
        root.append(description);
    }
    let instruction = root.querySelector<HTMLElement>(`#${LIVE_SIMILARITY_LENS_INSTRUCTION_ID}`);
    if (instruction === null) {
        instruction = textElement(
            root,
            "span",
            "基準日選択モード。矢印キーで日付を移動し、EnterキーまたはSpaceキーで選択、Escapeキーで解除します。",
            "data-ra-next-visually-hidden"
        );
        instruction.id = LIVE_SIMILARITY_LENS_INSTRUCTION_ID;
        root.append(instruction);
    }
    let announcer = root.querySelector<HTMLElement>("[data-ra-next-lens-announcer]");
    if (announcer === null) {
        announcer = textElement(root, "span", "", "data-ra-next-lens-announcer");
        announcer.setAttribute("data-ra-next-visually-hidden", "");
        announcer.setAttribute("aria-live", "polite");
        announcer.setAttribute("aria-atomic", "true");
        root.append(announcer);
    }

    const header = root.ownerDocument.createElement("div");
    header.setAttribute("data-ra-next-lens-header", "");
    const copy = root.ownerDocument.createElement("div");
    copy.setAttribute("data-ra-next-lens-copy", "");
    copy.append(
        textElement(root, "p", "Next / read-only", "data-ra-next-lens-eyebrow"),
        textElement(root, "h2", "類似日レンズ"),
        textElement(
            root,
            "p",
            state.mode === "armed"
                ? "選択モード中です。カレンダーの日付を1つ選んでください。"
                : "通常の日付クリックは従来どおりAnalyzeへ移動します。",
            "data-ra-next-lens-status"
        )
    );
    const actions = root.ownerDocument.createElement("div");
    actions.setAttribute("data-ra-next-lens-actions", "");
    const armButton = root.ownerDocument.createElement("button");
    armButton.type = "button";
    armButton.setAttribute("data-ra-next-lens-arm", "");
    armButton.textContent = state.mode === "armed"
        ? "日付選択をやめる"
        : state.baseDate === null ? "基準日を選ぶ" : "別の基準日を選ぶ";
    actions.append(armButton);
    if (state.baseDate !== null) {
        const clearButton = root.ownerDocument.createElement("button");
        clearButton.type = "button";
        clearButton.setAttribute("data-ra-next-lens-clear", "");
        clearButton.textContent = "基準日を解除";
        actions.append(clearButton);
    }
    header.append(copy, actions);

    const visibleChildren: HTMLElement[] = [header];
    if (state.baseDate !== null) {
        visibleChildren.push(createUnavailableEvidenceSummary(root, state.baseDate));
    }
    content.replaceChildren(...visibleChildren);
    announcer.textContent = getLiveSimilarityLensAnnouncement(state);
}

export function syncLiveCalendarDecorations(
    documentHost: Document,
    snapshot: LiveCalendarDomSnapshot | null,
    state: LiveSimilarityLensState
): void {
    if (state.mode === "armed") {
        documentHost.documentElement.setAttribute(SELECTION_MODE_ATTRIBUTE, "armed");
    } else {
        documentHost.documentElement.removeAttribute(SELECTION_MODE_ATTRIBUTE);
    }

    documentHost.querySelectorAll<HTMLElement>(`[${BASE_DATE_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(BASE_DATE_ATTRIBUTE);
        removeDescriptionToken(element, LIVE_SIMILARITY_LENS_DESCRIPTION_ID);
    });
    if (snapshot === null || state.baseDate === null) {
        return;
    }
    const baseCell = snapshot.cells.find((cell) => cell.stayDate === state.baseDate);
    if (baseCell === undefined) {
        return;
    }
    baseCell.anchor.setAttribute(BASE_DATE_ATTRIBUTE, "");
    appendDescriptionToken(baseCell.anchor, LIVE_SIMILARITY_LENS_DESCRIPTION_ID);
}

export function removeLiveSimilarityLensArtifacts(documentHost: Document): void {
    documentHost.documentElement.removeAttribute(SELECTION_MODE_ATTRIBUTE);
    documentHost.querySelectorAll<HTMLElement>(`[${BASE_DATE_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(BASE_DATE_ATTRIBUTE);
        removeDescriptionToken(element, LIVE_SIMILARITY_LENS_DESCRIPTION_ID);
    });
    documentHost.querySelectorAll(`[${LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE}]`).forEach(
        (element) => element.remove()
    );
    documentHost.getElementById(LIVE_SIMILARITY_LENS_STYLE_ID)?.remove();
}

function createUnavailableEvidenceSummary(root: HTMLElement, stayDate: string): HTMLElement {
    const summary = root.ownerDocument.createElement("div");
    summary.setAttribute("data-ra-next-lens-summary", "");

    const base = root.ownerDocument.createElement("div");
    base.setAttribute("data-ra-next-lens-base-summary", "");
    base.append(
        textElement(root, "span", "基準日"),
        textElement(root, "strong", formatJapaneseDate(stayDate))
    );

    const metrics = root.ownerDocument.createElement("div");
    metrics.setAttribute("data-ra-next-lens-metrics", "");
    for (const label of ["OH", "個人", "団体", "競合"]) {
        const metric = root.ownerDocument.createElement("span");
        metric.setAttribute("data-ra-next-lens-metric", "");
        metric.append(
            textElement(root, "span", label),
            textElement(root, "strong", "未接続")
        );
        metrics.append(metric);
    }

    const notice = textElement(
        root,
        "p",
        "実データadapterは未接続です。値を推測せず、類似日候補と一致度は表示していません。",
        "data-ra-next-lens-unavailable"
    );
    summary.append(base, metrics, notice);
    return summary;
}

function formatJapaneseDate(stayDate: string): string {
    const [year, month, day] = stayDate.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()] ?? "";
    return `${year}年${month}月${day}日（${weekday}）`;
}

function getLiveSimilarityLensAnnouncement(state: LiveSimilarityLensState): string {
    if (state.mode === "armed") {
        return "基準日選択モードです。矢印キーで日付を移動し、EnterキーまたはSpaceキーで選択できます。";
    }
    if (state.baseDate !== null) {
        return `${formatJapaneseDate(state.baseDate)}を基準日に設定しました。OH、個人、団体、競合の4軸は未接続です。`;
    }
    return "類似日レンズの基準日は未選択です。";
}

function appendDescriptionToken(element: HTMLElement, token: string): void {
    const tokens = new Set((element.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean));
    tokens.add(token);
    element.setAttribute("aria-describedby", Array.from(tokens).join(" "));
}

function removeDescriptionToken(element: HTMLElement, token: string): void {
    const tokens = (element.getAttribute("aria-describedby") ?? "")
        .split(/\s+/u)
        .filter((value) => value !== "" && value !== token);
    if (tokens.length === 0) {
        element.removeAttribute("aria-describedby");
        return;
    }
    element.setAttribute("aria-describedby", tokens.join(" "));
}

function textElement(
    root: HTMLElement,
    tagName: string,
    text: string,
    attributeName = ""
): HTMLElement {
    const element = root.ownerDocument.createElement(tagName);
    if (attributeName !== "") {
        element.setAttribute(attributeName, "");
    }
    element.textContent = text;
    return element;
}

function getLiveSimilarityLensStyles(): string {
    return `
        [data-ra-next-similarity-lens-root] { box-sizing: border-box; display: block; margin: 0 24px 12px; border: 1px solid #c9d8e5; border-left: 4px solid #1767a5; border-radius: 8px; background: #fff; color: #263a4d; font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-header] { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; padding: 10px 14px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-copy] { min-width: 0; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-eyebrow] { margin: 0 0 2px; color: #1767a5; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
        [data-ra-next-similarity-lens-root] h2 { margin: 0; font-size: 17px; font-weight: 800; line-height: 1.3; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-status] { margin: 3px 0 0; color: #607286; font-size: 12px; font-weight: 600; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-actions] { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; }
        [data-ra-next-similarity-lens-root] button { min-height: 42px; padding: 8px 13px; border: 1px solid #6d9abb; border-radius: 7px; background: #f3f8fb; color: #215d89; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
        [data-ra-next-similarity-lens-root] button:hover { background: #e8f2f8; }
        [data-ra-next-similarity-lens-root] button:focus-visible { outline: 3px solid rgba(23,103,165,.32); outline-offset: 2px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-clear] { border-color: #b6c4d0; background: #fff; color: #52667a; }
        [data-ra-next-similarity-lens-root][data-ra-next-lens-state="armed"] { border-color: #6d9abb; background: #f5faff; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-summary] { display: grid; grid-template-columns: minmax(0, .75fr) minmax(0, 1.6fr) minmax(0, 1fr); gap: 12px; align-items: center; padding: 0 14px 12px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-summary] { display: grid; gap: 2px; padding: 9px 10px; border: 1px solid #d9e3eb; border-radius: 7px; background: #f8fafc; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-summary] span { color: #65778a; font-size: 11px; font-weight: 700; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-summary] strong { font-size: 13px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metrics] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric] { display: grid; gap: 1px; min-width: 0; padding: 8px; border: 1px solid #dfe6ed; border-radius: 7px; background: #fafbfd; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric] span { color: #68798b; font-size: 11px; font-weight: 700; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric] strong { color: #4f6173; font-size: 12px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-unavailable] { margin: 0; padding: 9px 10px; border-left: 3px solid #92adc1; background: #f6f9fb; color: #5d7184; font-size: 11px; font-weight: 650; line-height: 1.55; }
        [data-ra-next-visually-hidden] { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
        html[data-ra-next-lens-selection-mode="armed"] a[data-testid^="calendar-date-"] { cursor: crosshair !important; }
        html[data-ra-next-lens-selection-mode="armed"] a[data-testid^="calendar-date-"]:hover { outline: 3px solid rgba(23,103,165,.45); outline-offset: -3px; }
        html[data-ra-next-lens-selection-mode="armed"] a[data-testid^="calendar-date-"]:focus-visible { outline: 3px solid #d98200 !important; outline-offset: 2px; }
        a[data-ra-next-lens-base-date] { z-index: 2; outline: 3px solid #1767a5; outline-offset: -3px; }
        a[data-ra-next-lens-base-date]:focus-visible { outline-color: #d98200; outline-offset: 2px; }
        @media (max-width: 1000px) {
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-summary] { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
            [data-ra-next-similarity-lens-root] { margin: 0 8px 8px; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-header] { align-items: stretch; flex-direction: column; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-actions] button { flex: 1 1 150px; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-metrics] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
    `;
}
