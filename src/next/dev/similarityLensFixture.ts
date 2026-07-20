import {
    findSimilarDays,
    type SimilarityCurvePoint,
    type SimilarityDayEvidence,
    type SimilarityMatch
} from "../similarityLensModel";

const FIXTURE_MONTHS = ["202607", "202608", "202609"] as const;
const calendarStripCandidate = document.querySelector<HTMLElement>("[data-ra-next-fixture-calendar-strip]");
const lensPanelCandidate = document.querySelector<HTMLElement>("[data-ra-next-lens-panel]");
const comparisonRegionCandidate = document.querySelector<HTMLElement>("[data-ra-next-lens-comparison]");
const clearButtonCandidate = document.querySelector<HTMLButtonElement>("[data-ra-next-lens-clear]");
const jumpButtonCandidate = document.querySelector<HTMLButtonElement>("[data-ra-next-lens-jump]");

if (calendarStripCandidate === null
    || lensPanelCandidate === null
    || comparisonRegionCandidate === null
    || clearButtonCandidate === null
    || jumpButtonCandidate === null) {
    throw new Error("Similarity lens fixture root is missing.");
}

const calendarStrip = calendarStripCandidate;
const lensPanel = lensPanelCandidate;
const comparisonRegion = comparisonRegionCandidate;
const clearButton = clearButtonCandidate;
const jumpButton = jumpButtonCandidate;

const evidenceByDate = buildFixtureEvidence(FIXTURE_MONTHS);
let baseDate: string | null = null;
let calendarTabStopDate: string | null = evidenceByDate.keys().next().value ?? null;
let selectedComparisonDates = new Set<string>();
let currentMatches: readonly SimilarityMatch[] = [];

installStyles();
renderCalendars();
renderLens();

calendarStrip.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    const dateButton = target.closest<HTMLButtonElement>("[data-ra-next-fixture-date-button]");
    const selectedDate = dateButton?.getAttribute("data-ra-next-fixture-stay-date") ?? null;
    if (selectedDate === null || !evidenceByDate.has(selectedDate)) {
        return;
    }
    baseDate = selectedDate;
    calendarTabStopDate = selectedDate;
    selectedComparisonDates = new Set();
    renderLens();
});

calendarStrip.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)
        || !target.hasAttribute("data-ra-next-fixture-date-button")) {
        return;
    }
    calendarTabStopDate = target.getAttribute("data-ra-next-fixture-stay-date");
    syncCalendarTabStops();
});

calendarStrip.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLButtonElement)
        || !event.target.hasAttribute("data-ra-next-fixture-date-button")) {
        return;
    }
    const offset = getCalendarKeyboardOffset(event.key);
    if (offset === null) {
        return;
    }
    const buttons = [...calendarStrip.querySelectorAll<HTMLButtonElement>(
        "[data-ra-next-fixture-date-button]"
    )];
    const currentIndex = buttons.indexOf(event.target);
    const nextIndex = Math.max(0, Math.min(buttons.length - 1, currentIndex + offset));
    const nextButton = buttons[nextIndex];
    if (nextButton === undefined || nextIndex === currentIndex) {
        return;
    }
    event.preventDefault();
    calendarTabStopDate = nextButton.getAttribute("data-ra-next-fixture-stay-date");
    syncCalendarTabStops();
    nextButton.focus();
    nextButton.scrollIntoView({ block: "nearest", inline: "nearest" });
});

lensPanel.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
        return;
    }
    const stayDate = target.value;
    if (target.checked) {
        selectedComparisonDates.add(stayDate);
    } else {
        selectedComparisonDates.delete(stayDate);
    }
    renderComparison();
    syncComparisonSummary();
});

clearButton.addEventListener("click", () => {
    baseDate = null;
    selectedComparisonDates = new Set();
    renderLens();
});

jumpButton.addEventListener("click", () => {
    const firstMatch = lensPanel.querySelector<HTMLInputElement>("[data-ra-next-lens-match] input");
    if (firstMatch !== null) {
        firstMatch.focus();
        return;
    }
    lensPanel.focus();
});

function renderLens(): void {
    clearButton.disabled = baseDate === null;
    jumpButton.hidden = baseDate === null;
    if (baseDate === null) {
        currentMatches = [];
        lensPanel.replaceChildren(createEmptyLensPanel());
        syncCalendarLensState();
        renderComparison();
        return;
    }
    const baseEvidence = evidenceByDate.get(baseDate);
    if (baseEvidence === undefined) {
        return;
    }
    currentMatches = findSimilarDays(baseEvidence, [...evidenceByDate.values()], {
        maximumResults: 6,
        minimumScore: 0.68
    });
    lensPanel.replaceChildren(createLensPanel(baseEvidence, currentMatches));
    syncCalendarLensState();
    renderComparison();
}

function createEmptyLensPanel(): HTMLElement {
    const wrapper = element("div", "data-ra-next-lens-empty");
    wrapper.append(
        textElement("p", "基準日レンズ", "data-ra-next-lens-panel-eyebrow"),
        textElement("h2", "比較したい日を1つ選択"),
        textElement("p", "選んだ日を基準にしたときだけ、説明できる類似日を表示します。")
    );
    return wrapper;
}

function createLensPanel(base: SimilarityDayEvidence, matches: readonly SimilarityMatch[]): HTMLElement {
    const wrapper = element("div", "data-ra-next-lens-content");
    const header = element("header", "data-ra-next-lens-header");
    header.append(
        textElement("p", "基準日", "data-ra-next-lens-panel-eyebrow"),
        textElement("h2", formatJapaneseDate(base.stayDate)),
        createMetricRow(base)
    );
    const explanation = textElement(
        "p",
        "個人ペースが一定以上近く、4軸中3軸以上を比較できる日だけを表示します。団体・OH・競合は別々に照合します。",
        "data-ra-next-lens-explanation"
    );
    const resultHeader = element("div", "data-ra-next-lens-result-header");
    resultHeader.append(
        textElement("strong", `似た日 ${matches.length}件`),
        textElement("span", "近い順 / 最大6件", "data-ra-next-lens-result-meta")
    );
    const resultList = element("div", "data-ra-next-lens-result-list");
    if (matches.length === 0) {
        resultList.append(textElement("p", "十分に近い日はありません。", "data-ra-next-lens-no-result"));
    } else {
        resultList.append(...matches.map(createMatchRow));
    }
    const comparisonSummary = element("div", "data-ra-next-lens-comparison-summary");
    comparisonSummary.append(
        textElement("strong", "比較対象 0日", "data-ra-next-lens-comparison-count"),
        textElement("span", "チェックした日だけを下で比較します。")
    );
    wrapper.append(header, explanation, resultHeader, resultList, comparisonSummary);
    return wrapper;
}

function createMatchRow(match: SimilarityMatch): HTMLElement {
    const evidence = evidenceByDate.get(match.stayDate);
    if (evidence === undefined) {
        throw new Error(`Fixture evidence is missing: ${match.stayDate}`);
    }
    const label = document.createElement("label");
    label.setAttribute("data-ra-next-lens-match", "");
    label.setAttribute("data-similarity-tier", match.tier);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = match.stayDate;
    checkbox.checked = selectedComparisonDates.has(match.stayDate);
    checkbox.setAttribute("aria-label", `${formatJapaneseDate(match.stayDate)}を比較対象にする`);
    const body = element("span", "data-ra-next-lens-match-body");
    const title = element("span", "data-ra-next-lens-match-title");
    title.append(
        textElement("strong", formatJapaneseDate(match.stayDate)),
        textElement(
            "span",
            `一致度 ${Math.round(match.score * 100)}%・根拠 ${match.availableDimensionCount}/4`,
            "data-ra-next-lens-score"
        )
    );
    const reasons = element("span", "data-ra-next-lens-reasons");
    reasons.append(...match.reasonLabels.map((reason) => textElement("span", reason)));
    body.append(title, createMetricRow(evidence), reasons);
    label.append(checkbox, body);
    return label;
}

function createMetricRow(evidence: SimilarityDayEvidence): HTMLElement {
    const latestTransient = latestCurveValue(evidence.transientCurve);
    const latestGroup = latestCurveValue(evidence.groupCurve);
    const row = element("div", "data-ra-next-lens-metrics");
    row.append(
        metric("OH", evidence.onHandRooms),
        metric("個人", latestTransient),
        metric("団体", latestGroup),
        metric("競合", evidence.competitorPriceIndex === null
            ? null
            : `${Math.round((evidence.competitorPriceIndex - 1) * 100)}%`)
    );
    return row;
}

function metric(label: string, value: number | string | null): HTMLElement {
    const item = element("span", "data-ra-next-lens-metric");
    item.append(textElement("span", label), textElement("strong", value === null ? "未取得" : String(value)));
    return item;
}

function syncComparisonSummary(): void {
    const countElement = lensPanel.querySelector<HTMLElement>("[data-ra-next-lens-comparison-count]");
    if (countElement !== null) {
        countElement.textContent = `比較対象 ${selectedComparisonDates.size}日`;
    }
}

function renderComparison(): void {
    comparisonRegion.replaceChildren();
    if (baseDate === null || selectedComparisonDates.size === 0) {
        comparisonRegion.hidden = true;
        return;
    }
    const base = evidenceByDate.get(baseDate);
    if (base === undefined) {
        return;
    }
    comparisonRegion.hidden = false;
    const header = element("header", "data-ra-next-lens-comparison-header");
    header.append(
        textElement("div", "", "data-ra-next-lens-comparison-kicker"),
        textElement("h2", "選択した日を画面内で比較")
    );
    const kicker = header.querySelector<HTMLElement>("[data-ra-next-lens-comparison-kicker]");
    if (kicker !== null) {
        kicker.textContent = "read-only comparison";
    }
    const comparisonEvidence = [base, ...[...selectedComparisonDates]
        .flatMap((stayDate) => {
            const evidence = evidenceByDate.get(stayDate);
            return evidence === undefined ? [] : [evidence];
        })];
    const sharedMaximum = getSharedCurveMaximum(comparisonEvidence);
    const grid = element("div", "data-ra-next-lens-comparison-grid");
    comparisonEvidence.forEach((evidence, index) => {
        grid.append(createComparisonCard(evidence, index === 0 ? "基準日" : "類似日", sharedMaximum));
    });
    comparisonRegion.append(header, grid);
}

function createComparisonCard(
    evidence: SimilarityDayEvidence,
    kind: string,
    sharedMaximum: number
): HTMLElement {
    const card = element("article", "data-ra-next-lens-comparison-card");
    card.append(
        textElement("span", kind, "data-ra-next-lens-comparison-kind"),
        textElement("h3", formatJapaneseDate(evidence.stayDate)),
        createMetricRow(evidence),
        createMiniCurve(evidence, sharedMaximum)
    );
    return card;
}

function createMiniCurve(evidence: SimilarityDayEvidence, sharedMaximum: number): HTMLElement {
    const wrapper = element("div", "data-ra-next-lens-mini-curve");
    const transient = evidence.transientCurve ?? [];
    const group = evidence.groupCurve ?? [];
    wrapper.setAttribute("role", "img");
    wrapper.setAttribute(
        "aria-label",
        `個人と団体を分けた合成ブッキングペース。D-28からD0、共通最大値${sharedMaximum}`
    );
    wrapper.append(
        createBarSeries("個人", transient, sharedMaximum, "transient"),
        createBarSeries("団体", group, sharedMaximum, "group"),
        textElement("span", "D-28 → D0（全カード共通尺度）", "data-ra-next-lens-mini-axis")
    );
    return wrapper;
}

function createBarSeries(
    label: string,
    values: readonly SimilarityCurvePoint[],
    maximum: number,
    kind: "transient" | "group"
): HTMLElement {
    const row = element("div", "data-ra-next-lens-mini-series");
    row.setAttribute("data-series", kind);
    row.append(textElement("span", label));
    const bars = element("span", "data-ra-next-lens-mini-bars");
    values.forEach((point) => {
        const bar = element("span", "data-ra-next-lens-mini-bar");
        bar.style.height = point.value <= 0
            ? "0%"
            : `${Math.max(4, Math.round((point.value / maximum) * 100))}%`;
        bar.title = `D-${point.leadDays}: ${point.value}`;
        bars.append(bar);
    });
    row.append(bars);
    return row;
}

function renderCalendars(): void {
    calendarStrip.replaceChildren(...FIXTURE_MONTHS.map(createCalendarMonth));
}

function createCalendarMonth(yearMonth: string): HTMLElement {
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(4, 6));
    const section = element("section", "data-ra-next-fixture-calendar");
    section.setAttribute("data-testid", "monthly-calendar");
    section.append(textElement("h2", `${year}年${month}月`, "data-ra-next-fixture-calendar-header"));
    const grid = element("div", "data-ra-next-fixture-calendar-grid");
    ["日", "月", "火", "水", "木", "金", "土"].forEach((weekday) => {
        grid.append(textElement("span", weekday, "data-ra-next-fixture-weekday"));
    });
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    for (let index = 0; index < firstWeekday; index += 1) {
        grid.append(element("span", "data-ra-next-fixture-calendar-blank"));
    }
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
        grid.append(createCalendarDate(year, month, day));
    }
    section.append(grid);
    return section;
}

function createCalendarDate(year: number, month: number, day: number): HTMLElement {
    const stayDate = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
    const evidence = evidenceByDate.get(stayDate);
    if (evidence === undefined) {
        throw new Error(`Fixture calendar evidence is missing: ${stayDate}`);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-ra-next-fixture-date-button", "");
    button.setAttribute("data-ra-next-fixture-stay-date", stayDate);
    button.setAttribute("aria-pressed", "false");
    button.tabIndex = -1;
    button.append(
        textElement("span", String(day), "data-ra-next-fixture-date"),
        textElement("span", `OH ${evidence.onHandRooms ?? "—"}`, "data-ra-next-fixture-oh"),
        textElement(
            "span",
            `個 ${latestCurveValue(evidence.transientCurve) ?? "—"} / 団 ${latestCurveValue(evidence.groupCurve) ?? "—"}`,
            "data-ra-next-fixture-segments"
        ),
        textElement("span", "", "data-ra-next-fixture-similarity-badge")
    );
    return button;
}

function syncCalendarLensState(): void {
    const matchByDate = new Map(currentMatches.map((match) => [match.stayDate, match] as const));
    calendarStrip.querySelectorAll<HTMLButtonElement>("[data-ra-next-fixture-date-button]").forEach((button) => {
        const stayDate = button.getAttribute("data-ra-next-fixture-stay-date");
        const match = stayDate === null ? undefined : matchByDate.get(stayDate);
        button.removeAttribute("data-ra-next-lens-base-date");
        button.removeAttribute("data-ra-next-lens-similarity-tier");
        button.setAttribute("aria-pressed", stayDate === baseDate ? "true" : "false");
        const badge = button.querySelector<HTMLElement>("[data-ra-next-fixture-similarity-badge]");
        if (badge !== null) {
            badge.textContent = "";
        }
        if (stayDate === baseDate) {
            button.setAttribute("data-ra-next-lens-base-date", "");
        } else if (match !== undefined) {
            button.setAttribute("data-ra-next-lens-similarity-tier", match.tier);
            if (badge !== null) {
                badge.textContent = `${Math.round(match.score * 100)}%`;
            }
        }
        if (stayDate !== null) {
            syncCalendarButtonAccessibleName(button, stayDate, match);
        }
    });
    syncCalendarTabStops();
}

function buildFixtureEvidence(months: readonly string[]): Map<string, SimilarityDayEvidence> {
    const records = new Map<string, SimilarityDayEvidence>();
    months.forEach((yearMonth) => {
        const year = Number(yearMonth.slice(0, 4));
        const month = Number(yearMonth.slice(4, 6));
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let day = 1; day <= daysInMonth; day += 1) {
            const stayDate = `${yearMonth}${String(day).padStart(2, "0")}`;
            const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
            const pattern = (day + weekday * 2 + month) % 5;
            const transientBase = 5 + pattern * 2 + (weekday === 6 ? 3 : 0);
            const groupBase = day % 5 === 0 ? 0 : (day + month) % 4;
            records.set(stayDate, {
                stayDate,
                onHandRooms: 3 + ((day * 3 + month + weekday) % 12),
                transientCurve: curveFromValues([
                    Math.max(0, transientBase - 7),
                    Math.max(0, transientBase - 5),
                    Math.max(0, transientBase - 3),
                    Math.max(0, transientBase - 1),
                    transientBase
                ]),
                groupCurve: curveFromValues([
                    0,
                    Math.max(0, groupBase - 2),
                    Math.max(0, groupBase - 1),
                    groupBase,
                    groupBase
                ]),
                competitorPriceIndex: 0.91 + (((day + weekday + month) % 13) * 0.015)
            });
        }
    });
    return records;
}

function curveFromValues(values: readonly number[]): SimilarityCurvePoint[] {
    const leadDays = [28, 21, 14, 7, 0] as const;
    return values.flatMap((value, index) => {
        const leadDay = leadDays[index];
        return leadDay === undefined ? [] : [{ leadDays: leadDay, value }];
    });
}

function getSharedCurveMaximum(evidence: readonly SimilarityDayEvidence[]): number {
    return Math.max(
        1,
        ...evidence.flatMap((day) => [
            ...(day.transientCurve ?? []).map((point) => point.value),
            ...(day.groupCurve ?? []).map((point) => point.value)
        ])
    );
}

function getCalendarKeyboardOffset(key: string): number | null {
    if (key === "ArrowLeft") {
        return -1;
    }
    if (key === "ArrowRight") {
        return 1;
    }
    if (key === "ArrowUp") {
        return -7;
    }
    if (key === "ArrowDown") {
        return 7;
    }
    return null;
}

function syncCalendarTabStops(): void {
    const preferredDate = calendarTabStopDate ?? baseDate;
    calendarStrip.querySelectorAll<HTMLButtonElement>("[data-ra-next-fixture-date-button]")
        .forEach((button) => {
            button.tabIndex = button.getAttribute("data-ra-next-fixture-stay-date") === preferredDate
                ? 0
                : -1;
        });
}

function syncCalendarButtonAccessibleName(
    button: HTMLButtonElement,
    stayDate: string,
    match: SimilarityMatch | undefined
): void {
    const evidence = evidenceByDate.get(stayDate);
    if (evidence === undefined) {
        return;
    }
    const parts = [
        formatJapaneseDate(stayDate),
        `OH ${evidence.onHandRooms ?? "未取得"}`,
        `個人 ${latestCurveValue(evidence.transientCurve) ?? "未取得"}`,
        `団体 ${latestCurveValue(evidence.groupCurve) ?? "未取得"}`
    ];
    if (stayDate === baseDate) {
        parts.push("基準日として選択中");
    } else if (match !== undefined) {
        parts.push(
            `類似度 ${Math.round(match.score * 100)}パーセント`,
            `根拠 ${match.availableDimensionCount}/4`,
            ...match.reasonLabels
        );
    } else {
        parts.push("基準日にする");
    }
    button.setAttribute("aria-label", parts.join("、"));
}

function formatJapaneseDate(compactDate: string): string {
    const month = Number(compactDate.slice(4, 6));
    const day = Number(compactDate.slice(6, 8));
    const weekday = new Date(Date.UTC(
        Number(compactDate.slice(0, 4)),
        month - 1,
        day
    )).toLocaleDateString("ja-JP", { weekday: "short", timeZone: "UTC" });
    return `${month}/${day}（${weekday}）`;
}

function latestCurveValue(values: readonly SimilarityCurvePoint[] | null): number | null {
    if (values === null || values.length === 0) {
        return null;
    }
    return [...values].sort((left, right) => left.leadDays - right.leadDays)[0]?.value ?? null;
}

function element(tagName: string, attributeName: string): HTMLElement {
    const result = document.createElement(tagName);
    if (attributeName !== "") {
        result.setAttribute(attributeName, "");
    }
    return result;
}

function textElement(tagName: string, text: string, attributeName = ""): HTMLElement {
    const result = element(tagName, attributeName);
    result.textContent = text;
    return result;
}

function installStyles(): void {
    const style = document.createElement("style");
    style.textContent = getSimilarityLensFixtureStyles();
    document.head.append(style);
}

export function getSimilarityLensFixtureStyles(): string {
    return `
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Yu Gothic UI", sans-serif; background: #eef2f6; color: #263444; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f6; }
    button, input { font: inherit; }
    [data-ra-next-fixture-app-header] { display: flex; align-items: center; min-height: 58px; padding: 0 24px; background: #1767a5; color: #fff; box-shadow: 0 2px 8px rgba(23,55,84,.18); }
    [data-ra-next-fixture-brand] { font-size: 18px; font-weight: 850; }
    [data-ra-next-fixture-nav] { display: flex; gap: 22px; margin-left: 44px; font-size: 12px; font-weight: 700; }
    [data-ra-next-fixture-candidate] { margin-left: auto; padding: 5px 8px; border: 1px solid rgba(255,255,255,.4); border-radius: 999px; font-size: 11px; font-weight: 800; }
    [data-ra-next-fixture-shell] { width: min(1560px, calc(100% - 32px)); margin: 18px auto 50px; }
    [data-ra-next-fixture-toolbar] { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 12px; padding: 13px 15px; border: 1px solid #d5dee8; border-radius: 9px; background: #fff; }
    [data-ra-next-fixture-eyebrow], [data-ra-next-lens-panel-eyebrow], [data-ra-next-lens-comparison-kicker] { margin: 0 0 3px; color: #1767a5; font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
    [data-ra-next-fixture-toolbar] h1 { margin: 0; font-size: 17px; font-weight: 850; }
    [data-ra-next-fixture-toolbar] p:not([data-ra-next-fixture-eyebrow]) { margin: 3px 0 0; color: #687789; font-size: 12px; font-weight: 700; }
    [data-ra-next-lens-clear] { min-height: 34px; padding: 6px 11px; border: 1px solid #aebdce; border-radius: 7px; background: #fff; color: #385069; font-size: 12px; font-weight: 800; cursor: pointer; }
    [data-ra-next-lens-clear]:disabled { cursor: not-allowed; opacity: .55; }
    [data-ra-next-fixture-workspace] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: 12px; align-items: start; }
    [data-ra-next-fixture-calendar-region], [data-ra-next-lens-panel], [data-ra-next-lens-comparison] { min-width: 0; border: 1px solid #d4dde7; border-radius: 10px; background: #fff; }
    [data-ra-next-fixture-calendar-strip] { display: flex; min-width: 0; overflow-x: auto; }
    [data-ra-next-fixture-calendar] { flex: 1 0 345px; min-width: 345px; border-right: 1px solid #dfe5ec; }
    [data-ra-next-fixture-calendar]:last-child { border-right: 0; }
    [data-ra-next-fixture-calendar-header] { display: flex; align-items: center; justify-content: center; min-height: 42px; margin: 0; border-bottom: 1px solid #dfe5ec; color: #2c3f54; font-size: 14px; font-weight: 850; }
    [data-ra-next-fixture-calendar-grid] { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    [data-ra-next-fixture-weekday] { padding: 7px 5px; border-right: 1px solid #e3e8ee; border-bottom: 1px solid #e3e8ee; background: #f6f8fb; color: #6a7888; font-size: 11px; font-weight: 850; text-align: center; }
    [data-ra-next-fixture-calendar-blank] { min-height: 72px; border-right: 1px solid #e4e9ef; border-bottom: 1px solid #e4e9ef; background: #fafbfd; }
    [data-ra-next-fixture-date-button] { position: relative; display: grid; align-content: space-between; min-height: 72px; padding: 5px 6px; border: 0; border-right: 1px solid #e4e9ef; border-bottom: 1px solid #e4e9ef; background: #fff; color: #28394c; text-align: left; cursor: pointer; }
    [data-ra-next-fixture-date-button]:hover { background: #f5f9fd; }
    [data-ra-next-fixture-date-button]:focus-visible { z-index: 2; outline: 3px solid rgba(23,103,165,.35); outline-offset: -3px; }
    [data-ra-next-fixture-date] { font-size: 12px; font-weight: 850; }
    [data-ra-next-fixture-oh] { font-size: 12px; font-weight: 850; }
    [data-ra-next-fixture-segments] { color: #47617c; font-size: 11px; font-weight: 800; white-space: nowrap; }
    [data-ra-next-fixture-similarity-badge] { position: absolute; top: 4px; right: 4px; min-height: 18px; padding: 2px 5px; border-radius: 999px; font-size: 11px; font-weight: 900; }
    [data-ra-next-lens-base-date] { z-index: 1; box-shadow: inset 0 0 0 3px #175e96; background: #edf5fb; }
    [data-ra-next-lens-base-date]::after { content: "基準"; position: absolute; right: 4px; bottom: 4px; color: #175e96; font-size: 11px; font-weight: 900; }
    [data-ra-next-lens-similarity-tier="very_similar"] { background: #eaf4fb; box-shadow: inset 4px 0 #2c79b4; }
    [data-ra-next-lens-similarity-tier="similar"] { background: #f5f9fc; box-shadow: inset 4px 0 #8aaec8; }
    [data-ra-next-lens-similarity-tier="very_similar"] [data-ra-next-fixture-similarity-badge] { background: #2c79b4; color: #fff; }
    [data-ra-next-lens-similarity-tier="similar"] [data-ra-next-fixture-similarity-badge] { background: #dcebf6; color: #285f88; }
    [data-ra-next-fixture-calendar-help] { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 11px; border-top: 1px solid #dfe5ec; }
    [data-ra-next-fixture-calendar-note] { margin: 0; color: #687789; font-size: 11px; font-weight: 700; }
    [data-ra-next-lens-jump] { flex: 0 0 auto; min-height: 32px; padding: 5px 10px; border: 1px solid #6f9cbc; border-radius: 7px; background: #f2f7fb; color: #245e89; font-size: 11px; font-weight: 850; cursor: pointer; }
    [data-ra-next-lens-jump][hidden] { display: none; }
    [data-ra-next-lens-panel] { position: sticky; top: 10px; max-height: calc(100vh - 24px); overflow: auto; }
    [data-ra-next-lens-content], [data-ra-next-lens-empty] { padding: 14px; }
    [data-ra-next-lens-empty] { min-height: 210px; }
    [data-ra-next-lens-header] h2, [data-ra-next-lens-empty] h2 { margin: 0; font-size: 18px; font-weight: 850; }
    [data-ra-next-lens-empty] > p:last-child { color: #687789; font-size: 12px; font-weight: 700; line-height: 1.55; }
    [data-ra-next-lens-metrics] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; margin-top: 9px; }
    [data-ra-next-lens-metric] { display: grid; gap: 1px; min-width: 0; padding: 6px; border: 1px solid #dfe6ee; border-radius: 6px; background: #f8fafc; }
    [data-ra-next-lens-metric] span { color: #718095; font-size: 11px; font-weight: 800; }
    [data-ra-next-lens-metric] strong { overflow: hidden; color: #2c3f54; font-size: 12px; font-weight: 850; text-overflow: ellipsis; }
    [data-ra-next-lens-explanation] { margin: 12px 0; padding: 8px 9px; border-left: 3px solid #7fa9c8; background: #f4f8fb; color: #536b82; font-size: 11px; font-weight: 700; line-height: 1.5; }
    [data-ra-next-lens-result-header] { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 13px 0 7px; }
    [data-ra-next-lens-result-header] strong { font-size: 12px; }
    [data-ra-next-lens-result-meta] { color: #7b8999; font-size: 11px; font-weight: 700; }
    [data-ra-next-lens-result-list] { display: grid; gap: 7px; }
    [data-ra-next-lens-match] { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; padding: 9px; border: 1px solid #dce4ec; border-radius: 8px; cursor: pointer; }
    [data-ra-next-lens-match]:has(input:checked) { border-color: #5f91b8; background: #f1f7fb; }
    [data-ra-next-lens-match] input { margin-top: 3px; accent-color: #1767a5; }
    [data-ra-next-lens-match-body] { display: grid; min-width: 0; }
    [data-ra-next-lens-match-title] { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    [data-ra-next-lens-match-title] strong { font-size: 12px; }
    [data-ra-next-lens-score] { color: #1767a5; font-size: 11px; font-weight: 850; }
    [data-ra-next-lens-match] [data-ra-next-lens-metrics] { margin-top: 6px; }
    [data-ra-next-lens-reasons] { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    [data-ra-next-lens-reasons] span { padding: 2px 5px; border-radius: 999px; background: #eaf2f8; color: #416987; font-size: 11px; font-weight: 800; }
    [data-ra-next-lens-comparison-summary] { margin-top: 11px; padding-top: 10px; border-top: 1px solid #dfe6ee; }
    [data-ra-next-lens-comparison-summary] strong, [data-ra-next-lens-comparison-summary] span { display: block; }
    [data-ra-next-lens-comparison-summary] strong { font-size: 12px; }
    [data-ra-next-lens-comparison-summary] span { margin-top: 2px; color: #758496; font-size: 11px; font-weight: 700; }
    [data-ra-next-lens-comparison] { margin-top: 12px; padding: 14px; }
    [data-ra-next-lens-comparison][hidden] { display: none; }
    [data-ra-next-lens-comparison-header] h2 { margin: 0; font-size: 15px; }
    [data-ra-next-lens-comparison-grid] { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 9px; margin-top: 10px; }
    [data-ra-next-lens-comparison-card] { padding: 10px; border: 1px solid #dce4ec; border-radius: 8px; }
    [data-ra-next-lens-comparison-kind] { color: #1767a5; font-size: 11px; font-weight: 850; }
    [data-ra-next-lens-comparison-card] h3 { margin: 2px 0 0; font-size: 13px; }
    [data-ra-next-lens-mini-curve] { display: grid; gap: 5px; margin-top: 10px; }
    [data-ra-next-lens-mini-series] { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 6px; align-items: end; height: 34px; }
    [data-ra-next-lens-mini-series] > span:first-child { align-self: center; color: #687789; font-size: 11px; font-weight: 800; }
    [data-ra-next-lens-mini-bars] { display: flex; align-items: end; gap: 3px; height: 100%; border-bottom: 1px solid #d7e0e9; }
    [data-ra-next-lens-mini-bar] { flex: 1; min-width: 3px; border-radius: 2px 2px 0 0; background: #2d6da8; }
    [data-series="group"] [data-ra-next-lens-mini-bar] { background: #c28333; }
    [data-ra-next-lens-mini-axis] { color: #738296; font-size: 11px; font-weight: 700; }
    [data-ra-next-fixture-native-footer] { margin-top: 12px; padding: 10px 12px; border: 1px solid #d5dee8; border-radius: 8px; background: #fff; color: #596b7e; font-size: 12px; font-weight: 750; }
    @media (max-width: 1100px) { [data-ra-next-fixture-workspace] { grid-template-columns: minmax(0, 1fr); } [data-ra-next-lens-panel] { position: static; max-height: none; } }
    @media (max-width: 760px) { [data-ra-next-fixture-app-header] { padding: 0 14px; } [data-ra-next-fixture-nav] { display: none; } [data-ra-next-fixture-candidate] { font-size: 11px; } [data-ra-next-fixture-shell] { width: min(100% - 16px, 720px); margin-top: 8px; } [data-ra-next-fixture-toolbar] { align-items: stretch; flex-direction: column; } [data-ra-next-fixture-calendar] { flex-basis: 340px; min-width: 340px; } [data-ra-next-fixture-calendar-help] { align-items: stretch; flex-direction: column; } [data-ra-next-lens-jump] { width: 100%; } }
    `;
}
