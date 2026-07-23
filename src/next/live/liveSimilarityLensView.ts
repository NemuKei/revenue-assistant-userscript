import type { LiveCalendarDomSnapshot } from "./liveCalendarDomAdapter";
import type {
    LiveSimilarityLensCalendarGroupEvidence,
    LiveSimilarityLensRoomGroupEvidence
} from "./liveSimilarityLensEvidence";
import type { LiveSimilarityLensState } from "./liveSimilarityLensState";
import {
    buildLiveSimilarityLensReadyViewModel,
    formatEvidenceMetric,
    getCurveCurrentRooms,
    type LiveSimilarityLensEvidenceLoadState,
    type LiveSimilarityLensMatchViewModel,
    type LiveSimilarityLensReadyViewModel
} from "./liveSimilarityLensViewModel";

export const LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE = "data-ra-next-similarity-lens-root";
export const LIVE_SIMILARITY_LENS_STYLE_ID = "revenue-assistant-next-similarity-lens-style";
export const LIVE_SIMILARITY_LENS_DESCRIPTION_ID = "ra-next-similarity-lens-base-description";
export const LIVE_SIMILARITY_LENS_INSTRUCTION_ID = "ra-next-similarity-lens-selection-instruction";
export const LIVE_SIMILARITY_LENS_ANALYZE_TRIGGER_ATTRIBUTE = "data-ra-next-lens-analyze-trigger";
export const LIVE_SIMILARITY_LENS_CALENDAR_GROUP_BADGE_ATTRIBUTE = "data-ra-next-calendar-group-badge";

export interface LiveSimilarityLensDisclosureState {
    comparisonExpanded: boolean | null;
    matchListExpanded: boolean | null;
}

const BASE_DATE_ATTRIBUTE = "data-ra-next-lens-base-date";
const SIMILAR_DATE_ATTRIBUTE = "data-ra-next-lens-similar-date";
const COMPARISON_DATE_ATTRIBUTE = "data-ra-next-lens-comparison-date";
const SELECTION_MODE_ATTRIBUTE = "data-ra-next-lens-selection-mode";
const SIMILAR_DESCRIPTION_ID = "ra-next-similarity-lens-similar-description";
const COMPARISON_DESCRIPTION_ID = "ra-next-similarity-lens-comparison-description";

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
    state: LiveSimilarityLensState,
    evidenceState: LiveSimilarityLensEvidenceLoadState,
    snapshot: LiveCalendarDomSnapshot | null,
    disclosureState?: LiveSimilarityLensDisclosureState
): LiveSimilarityLensReadyViewModel | null {
    root.setAttribute("data-ra-next-lens-state", state.mode);
    let content = root.querySelector<HTMLElement>("[data-ra-next-lens-content]");
    if (content === null) {
        content = root.ownerDocument.createElement("div");
        content.setAttribute("data-ra-next-lens-content", "");
        root.append(content);
    }
    const matchListExpanded = disclosureState === undefined
        ? content.querySelector<HTMLDetailsElement>("[data-ra-next-lens-results]")?.open ?? null
        : disclosureState.matchListExpanded;
    const comparisonExpanded = disclosureState === undefined
        ? content.querySelector<HTMLDetailsElement>("[data-ra-next-lens-comparison]")?.open ?? null
        : disclosureState.comparisonExpanded;
    ensureHiddenCopy(root);
    const announcer = ensureAnnouncer(root);
    const header = createHeader(root, state);
    const visibleChildren: HTMLElement[] = [header];
    let readyViewModel: LiveSimilarityLensReadyViewModel | null = null;

    if (state.baseDate !== null) {
        visibleChildren.push(createBaseDateBar(root, state.baseDate, snapshot));
        if (evidenceState.status === "loading") {
            visibleChildren.push(createLoadingState(root));
        } else if (evidenceState.status === "error") {
            visibleChildren.push(createErrorState(root, evidenceState.reason));
        } else if (evidenceState.status === "ready") {
            readyViewModel = buildLiveSimilarityLensReadyViewModel(state, evidenceState.evidence);
            visibleChildren.push(createReadyEvidence(
                root,
                state,
                readyViewModel,
                snapshot,
                matchListExpanded,
                comparisonExpanded
            ));
        }
    }

    content.replaceChildren(...visibleChildren);
    announcer.textContent = getLiveSimilarityLensAnnouncement(state, evidenceState, readyViewModel);
    return readyViewModel;
}

export function syncLiveCalendarDecorations(
    documentHost: Document,
    snapshot: LiveCalendarDomSnapshot | null,
    state: LiveSimilarityLensState,
    viewModel: LiveSimilarityLensReadyViewModel | null,
    calendarGroups: readonly LiveSimilarityLensCalendarGroupEvidence[] = []
): void {
    if (state.mode === "armed") {
        documentHost.documentElement.setAttribute(SELECTION_MODE_ATTRIBUTE, "armed");
    } else {
        documentHost.documentElement.removeAttribute(SELECTION_MODE_ATTRIBUTE);
    }
    syncLiveCalendarGroupBadges(documentHost, snapshot, calendarGroups);

    documentHost.querySelectorAll<HTMLElement>(
        `[${BASE_DATE_ATTRIBUTE}], [${SIMILAR_DATE_ATTRIBUTE}], [${COMPARISON_DATE_ATTRIBUTE}]`
    ).forEach((element) => {
        element.removeAttribute(BASE_DATE_ATTRIBUTE);
        element.removeAttribute(SIMILAR_DATE_ATTRIBUTE);
        element.removeAttribute(COMPARISON_DATE_ATTRIBUTE);
        removeDescriptionToken(element, LIVE_SIMILARITY_LENS_DESCRIPTION_ID);
        removeDescriptionToken(element, SIMILAR_DESCRIPTION_ID);
        removeDescriptionToken(element, COMPARISON_DESCRIPTION_ID);
    });
    if (snapshot === null) {
        return;
    }
    const selectedComparisonDates = new Set(viewModel?.comparisonEvidence.map((item) => item.stayDate) ?? []);
    const matchDates = new Set(viewModel?.matches.map((item) => item.match.stayDate) ?? []);
    for (const cell of snapshot.cells) {
        const compactDate = compactDateKey(cell.stayDate);
        if (datesEqual(cell.stayDate, state.baseDate)) {
            cell.anchor.setAttribute(BASE_DATE_ATTRIBUTE, "");
            appendDescriptionToken(cell.anchor, LIVE_SIMILARITY_LENS_DESCRIPTION_ID);
            continue;
        }
        if (compactDate !== null && matchDates.has(compactDate)) {
            cell.anchor.setAttribute(SIMILAR_DATE_ATTRIBUTE, "");
            appendDescriptionToken(cell.anchor, SIMILAR_DESCRIPTION_ID);
        }
        if (compactDate !== null && selectedComparisonDates.has(compactDate)) {
            cell.anchor.setAttribute(COMPARISON_DATE_ATTRIBUTE, "");
            appendDescriptionToken(cell.anchor, COMPARISON_DESCRIPTION_ID);
        }
    }
}

function syncLiveCalendarGroupBadges(
    documentHost: Document,
    snapshot: LiveCalendarDomSnapshot | null,
    calendarGroups: readonly LiveSimilarityLensCalendarGroupEvidence[]
): void {
    const roomsByStayDate = new Map<string, number>();
    for (const evidence of calendarGroups) {
        const rooms = getCurveCurrentRooms(evidence.groupCurve);
        if (rooms !== null && Number.isFinite(rooms) && rooms >= 0) {
            roomsByStayDate.set(evidence.stayDate, rooms);
        }
    }
    const activeAnchors = new Set(snapshot?.cells.map((cell) => cell.anchor) ?? []);
    documentHost.querySelectorAll<HTMLElement>(
        `[${LIVE_SIMILARITY_LENS_CALENDAR_GROUP_BADGE_ATTRIBUTE}]`
    ).forEach((badge) => {
        const anchor = badge.parentElement;
        const stayDate = anchor?.getAttribute("data-testid")?.replace(/^calendar-date-/u, "") ?? null;
        const compactStayDate = stayDate === null ? null : compactDateKey(stayDate);
        if (
            !(anchor instanceof HTMLAnchorElement)
            || !activeAnchors.has(anchor)
            || compactStayDate === null
            || !roomsByStayDate.has(compactStayDate)
        ) {
            badge.remove();
        }
    });
    if (snapshot === null) {
        return;
    }

    for (const cell of snapshot.cells) {
        const compactStayDate = compactDateKey(cell.stayDate);
        const rooms = compactStayDate === null ? undefined : roomsByStayDate.get(compactStayDate);
        const existingBadge = cell.anchor.querySelector<HTMLElement>(
            `:scope > [${LIVE_SIMILARITY_LENS_CALENDAR_GROUP_BADGE_ATTRIBUTE}]`
        );
        if (rooms === undefined) {
            existingBadge?.remove();
            continue;
        }
        const label = `団${formatCalendarGroupRooms(rooms)}`;
        const accessibleLabel = `ホテル全体の団体 ${formatCalendarGroupRooms(rooms)}室`;
        const badge = existingBadge ?? documentHost.createElement("span");
        if (!badge.hasAttribute(LIVE_SIMILARITY_LENS_CALENDAR_GROUP_BADGE_ATTRIBUTE)) {
            badge.setAttribute(LIVE_SIMILARITY_LENS_CALENDAR_GROUP_BADGE_ATTRIBUTE, "");
        }
        if (badge.textContent !== label) {
            badge.textContent = label;
        }
        if (badge.getAttribute("aria-label") !== accessibleLabel) {
            badge.setAttribute("aria-label", accessibleLabel);
        }
        if (badge.title !== accessibleLabel) {
            badge.title = accessibleLabel;
        }
        if (existingBadge === null) {
            cell.anchor.append(badge);
        }
    }
}

function formatCalendarGroupRooms(value: number): string {
    return Number.isInteger(value)
        ? String(value)
        : value.toFixed(1).replace(/\.0$/u, "");
}

export function removeLiveSimilarityLensArtifacts(documentHost: Document): void {
    documentHost.documentElement.removeAttribute(SELECTION_MODE_ATTRIBUTE);
    documentHost.querySelectorAll<HTMLElement>(
        `[${BASE_DATE_ATTRIBUTE}], [${SIMILAR_DATE_ATTRIBUTE}], [${COMPARISON_DATE_ATTRIBUTE}]`
    ).forEach((element) => {
        element.removeAttribute(BASE_DATE_ATTRIBUTE);
        element.removeAttribute(SIMILAR_DATE_ATTRIBUTE);
        element.removeAttribute(COMPARISON_DATE_ATTRIBUTE);
        removeDescriptionToken(element, LIVE_SIMILARITY_LENS_DESCRIPTION_ID);
        removeDescriptionToken(element, SIMILAR_DESCRIPTION_ID);
        removeDescriptionToken(element, COMPARISON_DESCRIPTION_ID);
    });
    documentHost.querySelectorAll(`[${LIVE_SIMILARITY_LENS_CALENDAR_GROUP_BADGE_ATTRIBUTE}]`).forEach(
        (element) => element.remove()
    );
    documentHost.querySelectorAll(`[${LIVE_SIMILARITY_LENS_ROOT_ATTRIBUTE}]`).forEach(
        (element) => element.remove()
    );
    documentHost.getElementById(LIVE_SIMILARITY_LENS_STYLE_ID)?.remove();
}

function createHeader(root: HTMLElement, state: LiveSimilarityLensState): HTMLElement {
    const header = root.ownerDocument.createElement("div");
    header.setAttribute("data-ra-next-lens-header", "");
    const copy = root.ownerDocument.createElement("div");
    copy.setAttribute("data-ra-next-lens-copy", "");
    copy.append(
        textElement(root, "h2", "類似日レンズ"),
        textElement(root, "p", getHeaderStatus(state), "data-ra-next-lens-status")
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
    return header;
}

function createBaseDateBar(
    root: HTMLElement,
    stayDate: string,
    snapshot: LiveCalendarDomSnapshot | null
): HTMLElement {
    const bar = root.ownerDocument.createElement("div");
    bar.setAttribute("data-ra-next-lens-base-bar", "");
    const copy = root.ownerDocument.createElement("div");
    copy.append(
        textElement(root, "span", "基準日"),
        textElement(root, "strong", formatJapaneseDate(stayDate))
    );
    bar.append(copy);
    appendAnalyzeLink(root, bar, snapshot, stayDate, "Analyzeで詳細");
    return bar;
}

function createLoadingState(root: HTMLElement): HTMLElement {
    const region = root.ownerDocument.createElement("div");
    region.setAttribute("data-ra-next-lens-message", "loading");
    region.setAttribute("role", "status");
    region.setAttribute("aria-busy", "true");
    region.append(
        textElement(root, "strong", "証拠を読み込んでいます"),
        textElement(root, "span", "現在施設と表示期間を確認しています。追加取得は2件までです。")
    );
    return region;
}

function createErrorState(root: HTMLElement, reason: string): HTMLElement {
    const region = root.ownerDocument.createElement("div");
    region.setAttribute("data-ra-next-lens-message", "error");
    region.append(
        textElement(root, "strong", getLoadErrorTitle(reason)),
        textElement(root, "span", getLoadErrorDetail(reason))
    );
    return region;
}

function createReadyEvidence(
    root: HTMLElement,
    state: LiveSimilarityLensState,
    viewModel: LiveSimilarityLensReadyViewModel,
    snapshot: LiveCalendarDomSnapshot | null,
    matchListExpanded: boolean | null,
    comparisonExpanded: boolean | null
): HTMLElement {
    const region = root.ownerDocument.createElement("div");
    region.setAttribute("data-ra-next-lens-ready", "");
    const selector = createRoomGroupSelector(root, state, viewModel);
    region.append(selector);
    if (viewModel.roomGroups.length === 0) {
        region.append(createInlineNotice(
            root,
            "部屋タイプ情報を確認できません",
            "名称とIDが揃った部屋タイプだけを表示します。推測した名称や生IDは使いません。",
            "warning"
        ));
        return region;
    }
    if (state.selectedRoomGroupId === null || viewModel.baseEvidence === null) {
        region.append(createInlineNotice(
            root,
            "次に部屋タイプを選んでください",
            "OH・個人・団体は、選んだ同一部屋タイプの中だけで比較します。",
            "neutral"
        ));
        return region;
    }

    region.append(
        createMetricStrip(root, viewModel.baseEvidence, viewModel),
        createSourceNote(root, viewModel, viewModel.baseEvidence.stayDate)
    );
    if (viewModel.matches.length === 0) {
        const coverageIncomplete = viewModel.comparableDayCount < viewModel.totalDayCount;
        region.append(createInlineNotice(
            root,
            coverageIncomplete ? "比較準備中" : "表示できる類似日はありません",
            coverageIncomplete
                ? `比較可能 ${viewModel.comparableDayCount}/${viewModel.totalDayCount}日。保存が進むと、選択を維持したまま再計算します。`
                : "個人ペースを含む3軸が揃い、十分に近い日だけを候補にしています。欠損値は0として扱いません。",
            coverageIncomplete ? "warning" : "neutral"
        ));
    } else {
        region.append(createMatchList(
            root,
            state,
            viewModel,
            snapshot,
            matchListExpanded
        ));
    }
    if (viewModel.comparisonEvidence.length > 0) {
        region.append(createComparisonRegion(root, viewModel, snapshot, comparisonExpanded));
    }
    return region;
}

function createRoomGroupSelector(
    root: HTMLElement,
    state: LiveSimilarityLensState,
    viewModel: LiveSimilarityLensReadyViewModel
): HTMLElement {
    const wrapper = root.ownerDocument.createElement("label");
    wrapper.setAttribute("data-ra-next-lens-room-group-field", "");
    wrapper.append(textElement(root, "span", "部屋タイプ"));
    const select = root.ownerDocument.createElement("select");
    select.setAttribute("data-ra-next-lens-room-group", "");
    select.disabled = viewModel.roomGroups.length === 0;
    const placeholder = root.ownerDocument.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "選択してください";
    select.append(placeholder);
    for (const roomGroup of viewModel.roomGroups) {
        const option = root.ownerDocument.createElement("option");
        option.value = roomGroup.id;
        option.textContent = roomGroup.name;
        select.append(option);
    }
    select.value = state.selectedRoomGroupId ?? "";
    wrapper.append(select);
    return wrapper;
}

function createMetricStrip(
    root: HTMLElement,
    evidence: LiveSimilarityLensRoomGroupEvidence,
    viewModel: LiveSimilarityLensReadyViewModel
): HTMLElement {
    const metrics = root.ownerDocument.createElement("div");
    metrics.setAttribute("data-ra-next-lens-metrics", "");
    const onHandReady = evidence.onHand.status === "ready"
        ? `${formatRooms(evidence.onHand.value.rooms)} / ${formatRooms(evidence.onHand.value.capacityRooms)}`
        : "";
    const transientRooms = getCurveCurrentRooms(evidence.transientCurve);
    const groupRooms = getCurveCurrentRooms(evidence.groupCurve);
    const competitorAvailable = hasLiveSimilarityLensCompetitorCacheForStayDate(
        viewModel.competitorCache,
        evidence.stayDate
    );
    appendMetric(metrics, root, "OH", formatEvidenceMetric(evidence.onHand, onHandReady));
    appendMetric(metrics, root, "個人", formatEvidenceMetric(
        evidence.transientCurve,
        transientRooms === null ? "未取得" : formatRooms(transientRooms)
    ));
    appendMetric(metrics, root, "団体", formatEvidenceMetric(
        evidence.groupCurve,
        groupRooms === null ? "未取得" : formatRooms(groupRooms)
    ));
    appendMetric(
        metrics,
        root,
        "競合",
        viewModel.competitorCache.status === "ready" && !competitorAvailable
            ? { label: "未取得", tone: "muted" }
            : formatEvidenceMetric(viewModel.competitorCache, competitorAvailable ? "保存値あり" : "")
    );
    return metrics;
}

function createSourceNote(
    root: HTMLElement,
    viewModel: LiveSimilarityLensReadyViewModel,
    stayDate: string
): HTMLElement {
    const note = root.ownerDocument.createElement("p");
    note.setAttribute("data-ra-next-lens-source-note", "");
    const asOf = viewModel.asOfDate === "" ? "確認不可" : formatJapaneseDate(viewModel.asOfDate);
    const compactStayDate = compactDateKey(stayDate);
    const competitorFetchedAt = viewModel.competitorCache.status === "ready" && compactStayDate !== null
        ? viewModel.competitorCache.value.fetchedAtByStayDate[compactStayDate] ?? null
        : null;
    const competitor = competitorFetchedAt !== null
        ? `対象日の競合は保存値あり（${formatFetchedAt(competitorFetchedAt)}取得）・部屋タイプ未確認のため類似判定には未使用`
        : "対象日の競合は未取得または未接続のため類似判定には未使用";
    const evidence = viewModel.baseEvidence?.stayDate === compactStayDate
        ? viewModel.baseEvidence
        : null;
    const curves = evidence === null
        ? []
        : [evidence.transientCurve, evidence.groupCurve];
    const exactCurveCount = curves.filter((curve) => curve.status === "ready").length;
    const observedThroughDates = curves.flatMap((curve) => (
        curve.status === "tail-pending" ? [curve.sourceAsOfDate] : []
    )).sort();
    const bookingCurve = exactCurveCount === curves.length && curves.length > 0
        ? "booking curveは本日まで観測済み"
        : observedThroughDates.length > 0
            ? `booking curveは${formatJapaneseDate(observedThroughDates.at(-1) ?? "")}まで観測済み・不足分を補充中`
            : "booking curveは未取得";
    note.textContent = `データ基準日 ${asOf} / ${bookingCurve} / ${competitor}`;
    return note;
}

function formatFetchedAt(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return "時刻未確認";
    }
    return new Intl.DateTimeFormat("ja-JP", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "numeric"
    }).format(date);
}

export function hasLiveSimilarityLensCompetitorCacheForStayDate(
    competitorCache: LiveSimilarityLensReadyViewModel["competitorCache"],
    stayDate: string
): boolean {
    const compactStayDate = compactDateKey(stayDate);
    return competitorCache.status === "ready"
        && compactStayDate !== null
        && competitorCache.value.stayDates.includes(compactStayDate);
}

function createMatchList(
    root: HTMLElement,
    state: LiveSimilarityLensState,
    viewModel: LiveSimilarityLensReadyViewModel,
    snapshot: LiveCalendarDomSnapshot | null,
    expanded: boolean | null
): HTMLElement {
    const section = root.ownerDocument.createElement("details");
    section.setAttribute("data-ra-next-lens-results", "");
    section.open = expanded ?? shouldExpandMatchListByDefault(root);
    const summary = root.ownerDocument.createElement("summary");
    summary.textContent = `似た動きの日（${viewModel.matches.length}件 / 比較は3日まで）`;
    const list = root.ownerDocument.createElement("ul");
    list.setAttribute("data-ra-next-lens-match-list", "");
    for (const item of viewModel.matches) {
        list.append(createMatchRow(root, state, item, snapshot));
    }
    section.append(summary, list);
    return section;
}

function createMatchRow(
    root: HTMLElement,
    state: LiveSimilarityLensState,
    item: LiveSimilarityLensMatchViewModel,
    snapshot: LiveCalendarDomSnapshot | null
): HTMLElement {
    const row = root.ownerDocument.createElement("li");
    row.setAttribute("data-ra-next-lens-match", "");
    const checkbox = root.ownerDocument.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("data-ra-next-lens-compare-date", item.match.stayDate);
    checkbox.checked = state.selectedComparisonDates.some((date) => datesEqual(date, item.match.stayDate));
    checkbox.disabled = !checkbox.checked && state.selectedComparisonDates.length >= 3;
    checkbox.setAttribute("aria-label", `${formatJapaneseDate(item.match.stayDate)}を比較対象にする`);

    const body = root.ownerDocument.createElement("div");
    body.setAttribute("data-ra-next-lens-match-body", "");
    const title = root.ownerDocument.createElement("div");
    title.setAttribute("data-ra-next-lens-match-title", "");
    title.append(
        textElement(root, "strong", formatJapaneseDate(item.match.stayDate)),
        textElement(root, "span", getTierLabel(item.match.tier), "data-ra-next-lens-tier")
    );
    const reasons = root.ownerDocument.createElement("p");
    reasons.setAttribute("data-ra-next-lens-reasons", "");
    reasons.textContent = `${item.match.reasonLabels.join("・")} / 根拠 ${item.match.availableDimensionCount}/4`;
    body.append(title, reasons);
    const action = root.ownerDocument.createElement("div");
    action.setAttribute("data-ra-next-lens-match-actions", "");
    action.append(checkbox);
    appendAnalyzeLink(root, action, snapshot, item.match.stayDate, "Analyze");
    row.append(body, action);
    return row;
}

function createComparisonRegion(
    root: HTMLElement,
    viewModel: LiveSimilarityLensReadyViewModel,
    snapshot: LiveCalendarDomSnapshot | null,
    expanded: boolean | null
): HTMLElement {
    const section = root.ownerDocument.createElement("details");
    section.setAttribute("data-ra-next-lens-comparison", "");
    section.open = expanded ?? false;
    const summary = root.ownerDocument.createElement("summary");
    summary.textContent = `選択日の比較（基準日＋${viewModel.comparisonEvidence.length}日）`;
    section.append(summary);
    const grid = root.ownerDocument.createElement("div");
    grid.setAttribute("data-ra-next-lens-comparison-grid", "");
    if (viewModel.baseEvidence !== null) {
        grid.append(createComparisonCard(root, viewModel.baseEvidence, viewModel, snapshot, true));
    }
    for (const evidence of viewModel.comparisonEvidence) {
        grid.append(createComparisonCard(root, evidence, viewModel, snapshot, false));
    }
    section.append(grid);
    return section;
}

function shouldExpandMatchListByDefault(root: HTMLElement): boolean {
    return root.ownerDocument.defaultView?.matchMedia("(min-width: 901px)").matches ?? true;
}

function createComparisonCard(
    root: HTMLElement,
    evidence: LiveSimilarityLensRoomGroupEvidence,
    viewModel: LiveSimilarityLensReadyViewModel,
    snapshot: LiveCalendarDomSnapshot | null,
    isBase: boolean
): HTMLElement {
    const card = root.ownerDocument.createElement("article");
    card.setAttribute("data-ra-next-lens-comparison-card", isBase ? "base" : "candidate");
    const header = root.ownerDocument.createElement("div");
    header.setAttribute("data-ra-next-lens-comparison-card-header", "");
    header.append(
        textElement(root, "span", isBase ? "基準" : "比較"),
        textElement(root, "strong", formatJapaneseDate(evidence.stayDate))
    );
    appendAnalyzeLink(root, header, snapshot, evidence.stayDate, "Analyze");
    card.append(header, createMetricStrip(root, evidence, viewModel));
    return card;
}

function appendMetric(
    parent: HTMLElement,
    root: HTMLElement,
    label: string,
    metric: { label: string; tone: "ready" | "muted" | "warning" }
): void {
    const item = root.ownerDocument.createElement("div");
    item.setAttribute("data-ra-next-lens-metric", metric.tone);
    item.append(textElement(root, "span", label), textElement(root, "strong", metric.label));
    parent.append(item);
}

function appendAnalyzeLink(
    root: HTMLElement,
    parent: HTMLElement,
    snapshot: LiveCalendarDomSnapshot | null,
    stayDate: string,
    label: string
): void {
    const target = resolveLiveSimilarityLensAnalyzeTarget(snapshot, stayDate);
    if (target === null) {
        const unavailable = textElement(root, "span", "Analyze導線未確認", "data-ra-next-lens-link-unavailable");
        parent.append(unavailable);
        return;
    }
    if (target.kind === "native-calendar") {
        const trigger = root.ownerDocument.createElement("button");
        trigger.type = "button";
        trigger.setAttribute(LIVE_SIMILARITY_LENS_ANALYZE_TRIGGER_ATTRIBUTE, target.stayDate);
        trigger.textContent = label;
        parent.append(trigger);
        return;
    }
    const link = root.ownerDocument.createElement("a");
    link.href = target.href;
    link.setAttribute("data-ra-next-lens-analyze-link", compactDateKey(stayDate) ?? stayDate);
    link.textContent = label;
    parent.append(link);
}

export type LiveSimilarityLensAnalyzeTarget =
    | { href: string; kind: "href" }
    | { kind: "native-calendar"; stayDate: string };

export function resolveLiveSimilarityLensAnalyzeTarget(
    snapshot: LiveCalendarDomSnapshot | null,
    stayDate: string
): LiveSimilarityLensAnalyzeTarget | null {
    const cell = snapshot?.cells.find((candidate) => datesEqual(candidate.stayDate, stayDate));
    if (cell === undefined) {
        return null;
    }
    return cell.analyzeHref === null
        ? { kind: "native-calendar", stayDate: cell.stayDate }
        : { href: cell.analyzeHref, kind: "href" };
}

function createInlineNotice(
    root: HTMLElement,
    title: string,
    detail: string,
    tone: "neutral" | "warning"
): HTMLElement {
    const notice = root.ownerDocument.createElement("div");
    notice.setAttribute("data-ra-next-lens-inline-notice", tone);
    notice.append(textElement(root, "strong", title), textElement(root, "span", detail));
    return notice;
}

function ensureHiddenCopy(root: HTMLElement): void {
    ensureHiddenText(root, LIVE_SIMILARITY_LENS_DESCRIPTION_ID, "類似日レンズの基準日");
    ensureHiddenText(
        root,
        LIVE_SIMILARITY_LENS_INSTRUCTION_ID,
        "基準日選択モード。矢印キーで日付を移動し、EnterキーまたはSpaceキーで選択、Escapeキーで解除します。"
    );
    ensureHiddenText(root, SIMILAR_DESCRIPTION_ID, "類似日レンズの候補日");
    ensureHiddenText(root, COMPARISON_DESCRIPTION_ID, "類似日レンズで比較対象に選択中");
}

function ensureHiddenText(root: HTMLElement, id: string, text: string): void {
    if (root.querySelector(`#${id}`) !== null) {
        return;
    }
    const element = textElement(root, "span", text, "data-ra-next-visually-hidden");
    element.id = id;
    root.append(element);
}

function ensureAnnouncer(root: HTMLElement): HTMLElement {
    let announcer = root.querySelector<HTMLElement>("[data-ra-next-lens-announcer]");
    if (announcer !== null) {
        return announcer;
    }
    announcer = textElement(root, "span", "", "data-ra-next-lens-announcer");
    announcer.setAttribute("data-ra-next-visually-hidden", "");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    root.append(announcer);
    return announcer;
}

function getHeaderStatus(state: LiveSimilarityLensState): string {
    if (state.mode === "armed") {
        return "カレンダーから基準日を1つ選んでください。";
    }
    if (state.baseDate !== null) {
        return "同じ部屋タイプのOH・個人・団体から、似た動きの日を探します。";
    }
    return "通常の日付クリックは従来どおりAnalyzeへ移動します。";
}

function getLoadErrorTitle(reason: string): string {
    if (reason === "as-of-missing") {
        return "データ基準日を確認できません";
    }
    if (reason === "facility-response-invalid") {
        return "施設を確認できません";
    }
    if (reason === "current-settings-response-invalid") {
        return "部屋タイプ情報を確認できません";
    }
    if (reason === "aborted") {
        return "読み込みを中止しました";
    }
    return "証拠を読み込めませんでした";
}

function getLoadErrorDetail(reason: string): string {
    if (reason === "as-of-missing") {
        return "画面の「最終データ更新」を確認できないため、日付を推測せず停止しています。";
    }
    if (reason === "facility-response-invalid") {
        return "施設IDを推測せず停止しています。ページを確認してから基準日を選び直してください。";
    }
    if (reason === "current-settings-response-invalid") {
        return "料金設定の応答形式が確認できないため、生IDや推測名は表示しません。";
    }
    return "自動再試行はしません。状況を確認してから別の基準日を選び直してください。";
}

function getTierLabel(tier: "very_similar" | "similar"): string {
    return tier === "very_similar" ? "かなり近い" : "近い";
}

function getLiveSimilarityLensAnnouncement(
    state: LiveSimilarityLensState,
    evidenceState: LiveSimilarityLensEvidenceLoadState,
    viewModel: LiveSimilarityLensReadyViewModel | null
): string {
    if (state.mode === "armed") {
        return "基準日選択モードです。矢印キーで移動し、EnterキーまたはSpaceキーで選択できます。";
    }
    if (state.baseDate === null) {
        return "類似日レンズの基準日は未選択です。";
    }
    if (evidenceState.status === "loading") {
        return `${formatJapaneseDate(state.baseDate)}の証拠を読み込んでいます。`;
    }
    if (evidenceState.status === "error") {
        return `${formatJapaneseDate(state.baseDate)}の証拠を読み込めませんでした。`;
    }
    if (viewModel === null || state.selectedRoomGroupId === null) {
        return "証拠を読み込みました。部屋タイプを選択してください。";
    }
    return `類似日候補は${viewModel.matches.length}日です。比較対象は${viewModel.comparisonEvidence.length}日です。`;
}

function formatRooms(value: number): string {
    return `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value)}室`;
}

function formatJapaneseDate(stayDate: string): string {
    const compact = compactDateKey(stayDate);
    if (compact === null) {
        return stayDate;
    }
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()] ?? "";
    return `${year}年${month}月${day}日（${weekday}）`;
}

function compactDateKey(value: string): string | null {
    const compact = value.trim().replace(/-/gu, "");
    return /^\d{8}$/u.test(compact) ? compact : null;
}

function datesEqual(left: string | null, right: string | null): boolean {
    if (left === null || right === null) {
        return false;
    }
    const leftKey = compactDateKey(left);
    return leftKey !== null && leftKey === compactDateKey(right);
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

export function getLiveSimilarityLensStyles(): string {
    return `
        [data-ra-next-similarity-lens-root] { box-sizing: border-box; display: block; width: calc(100% - 48px); max-width: calc(100vw - 48px); min-width: 0; margin: 0 24px 12px; border: 1px solid #c9d8e5; border-left: 4px solid #1767a5; border-radius: 8px; background: #fff; color: #263a4d; font-family: "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif; }
        [data-ra-next-similarity-lens-root] *, [data-ra-next-similarity-lens-root] *::before, [data-ra-next-similarity-lens-root] *::after { box-sizing: border-box; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-header] { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; padding: 12px 14px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-copy] { min-width: 0; }
        [data-ra-next-similarity-lens-root] h2 { margin: 0; font-size: 17px; font-weight: 800; line-height: 1.3; }
        [data-ra-next-similarity-lens-root] h3 { margin: 0; font-size: 14px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-status] { margin: 4px 0 0; color: #607286; font-size: 12px; font-weight: 600; line-height: 1.45; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-actions] { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; }
        [data-ra-next-similarity-lens-root] button, [data-ra-next-similarity-lens-root] select { min-height: 42px; font: inherit; font-size: 12px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] button { padding: 8px 13px; border: 1px solid #6d9abb; border-radius: 7px; background: #f3f8fb; color: #215d89; cursor: pointer; }
        [data-ra-next-similarity-lens-root] button:hover { background: #e8f2f8; }
        [data-ra-next-similarity-lens-root] button:focus-visible, [data-ra-next-similarity-lens-root] select:focus-visible, [data-ra-next-similarity-lens-root] a:focus-visible, [data-ra-next-similarity-lens-root] input:focus-visible { outline: 3px solid rgba(217,130,0,.48); outline-offset: 2px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-clear] { border-color: #b6c4d0; background: #fff; color: #52667a; }
        [data-ra-next-similarity-lens-root][data-ra-next-lens-state="armed"] { border-color: #6d9abb; background: #f5faff; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-bar] { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-top: 1px solid #dfe7ee; border-bottom: 1px solid #dfe7ee; background: #f7fafc; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-bar] > div { display: grid; gap: 2px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-bar] span { color: #65778a; font-size: 11px; font-weight: 700; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-bar] strong { font-size: 13px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] a { color: #1767a5; font-size: 12px; font-weight: 800; text-underline-offset: 2px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-analyze-trigger] { min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: #1767a5; font-size: 12px; font-weight: 800; text-decoration: underline; text-underline-offset: 2px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-analyze-trigger]:hover { background: transparent; color: #0f4f7e; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-message], [data-ra-next-similarity-lens-root] [data-ra-next-lens-inline-notice] { display: grid; gap: 3px; margin: 12px 14px; padding: 10px 12px; border-left: 3px solid #7fa9c8; background: #f5f8fa; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-message="error"], [data-ra-next-similarity-lens-root] [data-ra-next-lens-inline-notice="warning"] { border-left-color: #b37824; background: #fff9ee; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-message] strong, [data-ra-next-similarity-lens-root] [data-ra-next-lens-inline-notice] strong { font-size: 12px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-message] span, [data-ra-next-similarity-lens-root] [data-ra-next-lens-inline-notice] span { color: #5d7184; font-size: 11px; font-weight: 650; line-height: 1.5; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-ready] { display: grid; grid-template-columns: minmax(280px, 420px) minmax(0, 1fr); gap: 0 12px; padding: 12px 14px 14px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-ready] [data-ra-next-lens-inline-notice] { margin: 10px 0 0; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-room-group-field] { display: grid; grid-template-columns: 110px minmax(220px, 420px); gap: 10px; align-items: center; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-room-group-field] > span { color: #52687c; font-size: 12px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] select { width: 100%; padding: 7px 34px 7px 10px; border: 1px solid #9eb5c6; border-radius: 7px; background: #fff; color: #263a4d; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metrics] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 0; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric] { display: grid; gap: 2px; min-width: 0; padding: 9px 10px; border: 1px solid #dfe6ed; border-radius: 7px; background: #fafbfd; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric] span { color: #68798b; font-size: 11px; font-weight: 700; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric] strong { overflow: hidden; color: #31485d; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric="muted"] strong { color: #7b8997; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-metric="warning"] { border-color: #e1c99f; background: #fffaf1; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-source-note] { grid-column: 1 / -1; margin: 7px 0 0; color: #6c7d8d; font-size: 11px; font-weight: 650; line-height: 1.45; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-results], [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison] { margin-top: 14px; padding-top: 12px; border-top: 1px solid #dfe6ed; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-results], [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison], [data-ra-next-similarity-lens-root] [data-ra-next-lens-inline-notice] { grid-column: 1 / -1; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-match-list] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-match] { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 54px; padding: 8px 10px; border: 1px solid #dce4ec; border-radius: 7px; background: #fff; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-match]:has(input:checked) { border-color: #5f91b8; background: #f1f7fb; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-match-title] { display: flex; align-items: center; gap: 8px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-match-title] strong { font-size: 12px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-tier] { color: #1767a5; font-size: 11px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-reasons] { margin: 3px 0 0; color: #617487; font-size: 11px; font-weight: 650; line-height: 1.4; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-match-actions] { display: flex; align-items: center; gap: 12px; }
        [data-ra-next-similarity-lens-root] input[type="checkbox"] { width: 18px; height: 18px; margin: 0; accent-color: #1767a5; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-results] > summary, [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison] > summary { min-height: 34px; color: #31485d; cursor: pointer; font-size: 14px; font-weight: 800; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison-grid] { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 8px; margin-top: 8px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison-card] { padding: 10px; border: 1px solid #dce4ec; border-radius: 7px; background: #fff; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison-card="base"] { border-left: 3px solid #1767a5; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison-card-header] { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 7px; align-items: center; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison-card-header] > span { color: #1767a5; font-size: 11px; font-weight: 850; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison-card-header] strong { font-size: 12px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-comparison-card] [data-ra-next-lens-metrics] { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 8px; }
        [data-ra-next-similarity-lens-root] [data-ra-next-lens-link-unavailable] { color: #7b8997; font-size: 11px; font-weight: 650; }
        [data-ra-next-visually-hidden] { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0,0,0,0) !important; white-space: nowrap !important; border: 0 !important; }
        html[data-ra-next-lens-selection-mode="armed"] a[data-testid^="calendar-date-"] { cursor: crosshair !important; }
        html[data-ra-next-lens-selection-mode="armed"] a[data-testid^="calendar-date-"]:hover { outline: 3px solid rgba(23,103,165,.45); outline-offset: -3px; }
        html[data-ra-next-lens-selection-mode="armed"] a[data-testid^="calendar-date-"]:focus-visible { outline: 3px solid #d98200 !important; outline-offset: 2px; }
        a[data-testid^="calendar-date-"] > [data-ra-next-calendar-group-badge] { position: absolute; top: 24px; left: 6px; z-index: 1; color: #1f5fbf; font-size: 10px; font-weight: 800; line-height: 12px; pointer-events: none; text-shadow: 0 0 2px rgba(255,255,255,.95); white-space: nowrap; }
        a[data-ra-next-lens-base-date], a[data-ra-next-lens-similar-date], a[data-ra-next-lens-comparison-date] { z-index: 2; }
        a[data-ra-next-lens-base-date] { box-shadow: inset 0 0 0 3px #1767a5; }
        a[data-ra-next-lens-similar-date] { box-shadow: inset 0 0 0 2px #75a8ca; background-image: linear-gradient(rgba(221,239,250,.45), rgba(221,239,250,.45)); }
        a[data-ra-next-lens-comparison-date] { box-shadow: inset 0 0 0 3px #c27716; background-image: linear-gradient(rgba(255,239,210,.55), rgba(255,239,210,.55)); }
        a[data-ra-next-lens-base-date]::after, a[data-ra-next-lens-similar-date]::after, a[data-ra-next-lens-comparison-date]::after { position: absolute; top: 4px; right: 4px; padding: 1px 4px; border-radius: 3px; background: #1767a5; color: #fff; content: "基準"; font-size: 9px; font-weight: 800; line-height: 1.4; }
        a[data-ra-next-lens-similar-date]::after { background: #5e91b5; content: "類似"; }
        a[data-ra-next-lens-comparison-date]::after { background: #b66b0d; content: "比較"; }
        a[data-ra-next-lens-base-date]:focus-visible, a[data-ra-next-lens-similar-date]:focus-visible, a[data-ra-next-lens-comparison-date]:focus-visible { outline-color: #d98200; outline-offset: 2px; }
        @media (max-width: 900px) {
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-ready] { grid-template-columns: 1fr; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-metrics] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-room-group-field] { grid-template-columns: 1fr; gap: 5px; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-metrics] { margin-top: 12px; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-match-list] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 680px) {
            [data-ra-next-similarity-lens-root] { width: calc(100% - 16px); max-width: calc(100vw - 16px); margin: 0 8px 8px; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-header] { align-items: stretch; flex-direction: column; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-actions] button { flex: 1 1 150px; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-base-bar] { align-items: flex-start; flex-direction: column; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-match-list] { grid-template-columns: 1fr; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-match] { grid-template-columns: 1fr; }
            [data-ra-next-similarity-lens-root] [data-ra-next-lens-match-actions] { justify-content: space-between; }
            a[data-testid^="calendar-date-"] > [data-ra-next-calendar-group-badge] { left: 0; font-size: 9px; }
        }
    `;
}
