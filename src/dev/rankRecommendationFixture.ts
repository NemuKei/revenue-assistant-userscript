import {
    renderRankRecommendationReactListElement,
    syncRankRecommendationReactList,
    type RankRecommendationReactButtonSnapshot,
    type RankRecommendationReactListSnapshot,
    type RankRecommendationReactRowSnapshot
} from "../rankRecommendationReactIsland";

type FixtureState =
    | "candidates"
    | "empty"
    | "current-settings-401"
    | "current-settings-403"
    | "decision-hidden"
    | "decision-pending"
    | "rank-change-pending"
    | "rank-change-error"
    | "long-room-name"
    | "preview-open"
    | "monthly-compact"
    | "monthly-empty"
    | "monthly-partial"
    | "price-trends-loading"
    | "price-trends-empty"
    | "price-trends-failure";

const FIXTURE_STATES: readonly { value: FixtureState; label: string }[] = [
    { value: "candidates", label: "候補あり" },
    { value: "empty", label: "候補なし" },
    { value: "current-settings-401", label: "current settings 401" },
    { value: "current-settings-403", label: "current settings 403" },
    { value: "decision-hidden", label: "利用者判断で非表示" },
    { value: "decision-pending", label: "判断 pending" },
    { value: "rank-change-pending", label: "rank change pending" },
    { value: "rank-change-error", label: "rank change error" },
    { value: "long-room-name", label: "長い部屋タイプ名" },
    { value: "preview-open", label: "preview open" },
    { value: "monthly-compact", label: "月次 compact view" },
    { value: "monthly-empty", label: "月次 empty" },
    { value: "monthly-partial", label: "月次 partial" },
    { value: "price-trends-loading", label: "価格推移 loading" },
    { value: "price-trends-empty", label: "価格推移 empty" },
    { value: "price-trends-failure", label: "価格推移 failure" }
];

if (typeof document !== "undefined") {
    const rootElement = document.getElementById("rank-fixture-root");
    const secondaryRootElement = document.getElementById("rank-fixture-secondary-root");
    const galleryRootElement = document.getElementById("rank-fixture-gallery-root");
    const stateSelectElement = document.getElementById("rank-fixture-state");

    if (!(rootElement instanceof HTMLElement)
        || !(secondaryRootElement instanceof HTMLElement)
        || !(galleryRootElement instanceof HTMLElement)
        || !(stateSelectElement instanceof HTMLSelectElement)) {
        throw new Error("Rank recommendation fixture root is missing.");
    }

    installFixtureStyles();
    installStateOptions(stateSelectElement);
    renderFixture(rootElement, secondaryRootElement, "candidates");
    renderGallery(galleryRootElement);

    stateSelectElement.addEventListener("change", () => {
        renderFixture(rootElement, secondaryRootElement, stateSelectElement.value as FixtureState);
    });
}

function installStateOptions(selectElement: HTMLSelectElement): void {
    selectElement.replaceChildren(...FIXTURE_STATES.map((state) => {
        const option = document.createElement("option");
        option.value = state.value;
        option.textContent = state.label;
        return option;
    }));
}

function renderFixture(rootElement: HTMLElement, secondaryRootElement: HTMLElement, state: FixtureState): void {
    syncRankRecommendationReactList(rootElement, buildFixtureSnapshot(state));
    renderSecondaryFixtureState(secondaryRootElement, state);
}

function renderGallery(galleryRootElement: HTMLElement): void {
    const galleryCards = FIXTURE_STATES.map((state) => {
        const card = document.createElement("article");
        card.setAttribute("data-ra-fixture-gallery-card", "");
        const heading = document.createElement("h3");
        heading.textContent = state.label;
        const mount = document.createElement("section");
        mount.setAttribute("data-ra-rank-recommendation-list", "");
        card.append(heading, mount);
        syncRankRecommendationReactList(mount, buildFixtureSnapshot(state.value));
        return card;
    });
    galleryRootElement.replaceChildren(...galleryCards);
}

export function buildFixtureSnapshot(state: FixtureState): RankRecommendationReactListSnapshot {
    const rows = buildRowsForState(state);
    const emptyText = getEmptyTextForState(state);
    return {
        signature: `fixture:${state}:${rows.length}`,
        mode: "fixture",
        title: "料金調整候補",
        metaText: buildMetaText(state, rows.length),
        metaTitle: buildMetaTitle(state, rows.length),
        columns: ["優先度", "判断", "宿泊日", "部屋タイプ", "現ランク", "推奨", "根拠", "状態", "操作"],
        emptyText,
        controls: {
            targetMonth: {
                currentValue: "2026-07",
                options: [
                    { value: "all", label: "全ての月" },
                    { value: "2026-07", label: "2026年7月" },
                    { value: "2026-08", label: "2026年8月" }
                ]
            },
            viewMode: {
                options: [
                    { mode: "all", label: "全て", title: "全ての候補を表示", pressed: true },
                    { mode: "raise", label: "上げ注意", title: "上げ推奨だけを表示", pressed: false },
                    { mode: "lower", label: "下げ注意", title: "下げ推奨だけを表示", pressed: false }
                ]
            },
            displayLimit: {
                showMoreButton: buildButton("さらに表示", "display-more"),
                resetButton: buildButton("10件に戻す", "display-reset")
            },
            rankOrder: {
                source: "manual-override",
                ladderJson: JSON.stringify(["10", "11", "12"]),
                summary: "ランク順序: 手動",
                summaryTitle: "rank順序: 手動調整 10 > 11 > 12",
                inputValue: "10\n11\n12",
                status: "保存済み",
                saveButton: buildButton("保存", "rank-order-save"),
                reverseButton: buildButton("上下反転", "rank-order-reverse"),
                resetButton: buildButton("初期化", "rank-order-reset")
            }
        },
        rows
    };
}

export function buildAllFixtureSnapshots(): readonly RankRecommendationReactListSnapshot[] {
    return FIXTURE_STATES.map((state) => buildFixtureSnapshot(state.value));
}

export { renderRankRecommendationReactListElement };

function buildRowsForState(state: FixtureState): RankRecommendationReactRowSnapshot[] {
    if (state === "empty" || state === "current-settings-401" || state === "current-settings-403") {
        return [];
    }

    const firstRow = buildRow({
        key: "20260723-camp-twin-s",
        stayDate: "2026-07-23",
        roomGroup: "キャンプ、ツインS",
        priority: "high",
        action: "raise_watch",
        currentRank: "11",
        recommendedRank: "10",
        reason: "直近販売が基準より鈍い",
        curveOpen: state === "preview-open",
        rankOpen: state === "preview-open",
        pendingDecision: state === "decision-pending",
        pendingRankChange: state === "rank-change-pending",
        rankChangeError: state === "rank-change-error"
    });
    const secondRow = buildRow({
        key: "20260803-standard-single",
        stayDate: "2026-08-03",
        roomGroup: "シングル",
        priority: "medium",
        action: "lower_watch",
        currentRank: "8",
        recommendedRank: "9",
        reason: "相場より高めの注意",
        curveOpen: false,
        rankOpen: false,
        pendingDecision: false,
        pendingRankChange: false,
        rankChangeError: false
    });
    const longNameRow = buildRow({
        key: "20260811-family-suite-long-name",
        stayDate: "2026-08-11",
        roomGroup: "露天風呂付き和洋室スイート 角部屋 海側 禁煙 夕朝食付きプラン連動",
        priority: "low",
        action: "watch",
        currentRank: "15",
        recommendedRank: "14",
        reason: "長い部屋タイプ名と複数根拠が同じ行で折り返される状態",
        curveOpen: false,
        rankOpen: false,
        pendingDecision: false,
        pendingRankChange: false,
        rankChangeError: false
    });

    if (state === "decision-hidden") {
        return [firstRow];
    }
    return state === "long-room-name" ? [longNameRow, firstRow] : [firstRow, secondRow];
}

function buildRow(options: {
    key: string;
    stayDate: string;
    roomGroup: string;
    priority: string;
    action: string;
    currentRank: string;
    recommendedRank: string;
    reason: string;
    curveOpen: boolean;
    rankOpen: boolean;
    pendingDecision: boolean;
    pendingRankChange: boolean;
    rankChangeError: boolean;
}): RankRecommendationReactRowSnapshot {
    return {
        key: options.key,
        priority: options.priority,
        action: options.action,
        status: "eligible",
        cells: [
            { kind: "text", value: options.priority === "high" ? "高" : options.priority === "medium" ? "中" : "低", role: "priority" },
            { kind: "text", value: "高・注意あり", role: "decision-summary", title: "宿泊まで: 53日\nデータ: 保存済み\n前回変更: 2日前" },
            { kind: "text", value: options.stayDate, role: "stay-date", title: "宿泊まで: 53日" },
            { kind: "text", value: options.roomGroup, role: "room-group", title: `${options.roomGroup}\nデータ: 保存済み\n前回変更: 2日前` },
            {
                kind: "rankGap",
                currentRankText: options.currentRank,
                occupancyCapacityText: "販売室数：8/12",
                title: "同じ宿泊日の全部屋タイプ rank を確認",
                role: "current-rank",
                entries: [
                    { values: [options.roomGroup, options.currentRank, "8/12", "対象", "fixture"], isTarget: true },
                    { values: ["ダブル", "12", "5/10", "1段低い", "fixture"], isTarget: false }
                ]
            },
            {
                kind: "recommendedAction",
                value: options.action === "raise_watch" ? "上げ候補" : options.action === "lower_watch" ? "下げ候補" : "様子見",
                role: "recommended-action",
                title: "推奨と前回変更履歴の fixture",
                historyItems: [
                    { label: "ランク", value: "11→10" },
                    { label: "経過", value: "2日前" }
                ],
                quickSubmitButton: options.action === "watch"
                    ? null
                    : buildButton("推奨反映", "rank-change-submit")
            },
            { kind: "text", value: options.reason, role: "reason", title: options.reason },
            { kind: "text", value: "有効", role: "status" }
        ],
        analyzeLink: {
            text: "Analyzeで確認",
            title: "Analyze で確認",
            href: `https://ra.jalan.net/analyze/${options.stayDate}`,
            attrs: {
                "data-ra-rank-recommendation-button": "",
                "data-ra-rank-recommendation-button-action": "analyze"
            }
        },
        curvePreviewButton: {
            ...buildButton("曲線", "curve-preview-toggle"),
            expanded: options.curveOpen
        },
        curvePopoverItems: [
            { label: "全体", value: "基準より遅い" },
            { label: "個人", value: "やや弱い" },
            { label: "団体", value: "変化なし" }
        ],
        inlineRankChange: {
            options: [
                { code: options.recommendedRank, name: options.recommendedRank },
                { code: options.currentRank, name: options.currentRank }
            ],
            selectedCode: options.recommendedRank,
            disabled: false,
            submitButton: buildButton("反映する", "rank-change-inline-submit")
        },
        rankChangeButton: {
            ...buildButton("ランク調整", "rank-change-preview-toggle"),
            expanded: options.rankOpen
        },
        snoozeButton: buildButton("様子見", "snooze"),
        dismissButton: buildButton("対応不要", "dismiss"),
        pendingDecision: options.pendingDecision
            ? {
                key: options.key,
                label: "様子見: 3秒後に確定",
                progressPercent: 60,
                cancelButton: buildButton("取消", "decision-cancel")
            }
            : null,
        pendingRankChange: options.pendingRankChange
            ? {
                key: options.key,
                label: "3秒後に送信",
                progressPercent: 60,
                cancelButton: buildButton("取消", "rank-change-cancel")
            }
            : null,
        rankChangeResult: options.rankChangeError
            ? {
                status: "failed",
                message: "HTTP 403: 権限またはログイン状態を確認",
                title: "fixture error"
            }
            : null,
        curvePreview: {
            key: options.key,
            open: options.curveOpen
        },
        rankChangePreview: {
            key: options.key,
            open: options.rankOpen
        }
    };
}

function buildButton(text: string, action: string): RankRecommendationReactButtonSnapshot {
    return {
        text,
        title: text,
        attrs: {
            "data-ra-rank-recommendation-button": "",
            "data-ra-rank-recommendation-button-action": action,
            "data-ra-rank-recommendation-stay-date": "20260723",
            "data-ra-rank-recommendation-room-group-id": "fixture-room-group"
        }
    };
}

function getEmptyTextForState(state: FixtureState): string | null {
    if (state === "empty") {
        return "表示できる料金調整候補はありません。";
    }
    if (state === "current-settings-401") {
        return "Revenue Assistant のログイン状態を確認してください。current settings が HTTP 401 を返しました。";
    }
    if (state === "current-settings-403") {
        return "この施設または画面で current settings を確認する権限がありません。HTTP 403 を返しました。";
    }
    return null;
}

function buildMetaText(state: FixtureState, rowCount: number): string {
    if (state === "decision-hidden") {
        return `候補 ${rowCount}件 / 非表示 利用者判断 1件 / fixture`;
    }
    return `候補 ${rowCount}件 / 注意あり / fixture`;
}

function buildMetaTitle(state: FixtureState, rowCount: number): string {
    if (state === "decision-hidden") {
        return `表示 ${rowCount} 件 / 利用者判断で非表示 1 件 / fixture`;
    }
    return `表示 ${rowCount} 件 / 上げ候補 1 件 / 下げ候補 1 件 / fixture`;
}

function renderSecondaryFixtureState(container: HTMLElement, state: FixtureState): void {
    if (state === "monthly-compact" || state === "monthly-empty" || state === "monthly-partial") {
        const body = state === "monthly-empty"
            ? `
                <p data-ra-monthly-progress-empty>保存済み月次 snapshot がないため、LTブッキングカーブを表示できません。</p>
                <details data-ra-monthly-progress-daily-diff-details>
                    <summary>日次差分は未表示</summary>
                    <p>現在月の保存後に増加、減少、変化なし、未観測を確認します。</p>
                </details>
            `
            : state === "monthly-partial"
                ? `
                    <p data-ra-monthly-progress-partial>保存済み・比較不足あり / background 取得中 5 / 12・失敗 1</p>
                    <table data-ra-monthly-progress-daily-diff-main-table>
                        <tbody>
                            <tr><td>7日前</td><td>増加</td><td>+4室</td></tr>
                            <tr><td>14日前</td><td>未観測</td><td>-</td></tr>
                        </tbody>
                    </table>
                    <details data-ra-monthly-progress-daily-diff-details open>
                        <summary>変化なし / 未観測 4件</summary>
                        <table><tbody><tr><td>21日前</td><td>変化なし</td></tr><tr><td>30日前</td><td>未観測</td></tr></tbody></table>
                    </details>
                `
                : `
                    <table data-ra-monthly-progress-daily-diff-main-table>
                        <tbody>
                            <tr><td>7日前</td><td>増加</td><td>+4室</td></tr>
                            <tr><td>14日前</td><td>減少</td><td>-1室</td></tr>
                        </tbody>
                    </table>
                    <details data-ra-monthly-progress-daily-diff-details>
                        <summary>変化なし / 未観測 2件</summary>
                        <table><tbody><tr><td>21日前</td><td>変化なし</td></tr><tr><td>30日前</td><td>未観測</td></tr></tbody></table>
                    </details>
                `;
        container.innerHTML = `
            <h2>月次実績 日次差分 compact view</h2>
            ${body}
        `;
        return;
    }

    if (state.startsWith("price-trends")) {
        const message = state === "price-trends-loading"
            ? "背景取得 16 / 128・保存 16・現在取得中 ツイン 朝食 2名"
            : state === "price-trends-empty"
                ? "対象データがないため graph を表示できません。"
                : "背景取得 19 / 128・失敗 3・停止 fixture failure";
        const nextAction = state === "price-trends-loading"
            ? "次操作: 取得完了までこのタブを開いたまま待つ。"
            : state === "price-trends-empty"
                ? "次操作: 89日以内の宿泊日で確認する。"
                : "次操作: ログイン状態、権限、通信状態を確認し、タブを再表示して再取得する。";
        container.innerHTML = `
            <h2>価格推移 supplement</h2>
            <p data-ra-price-trends-background-status>${message}</p>
            <p data-ra-sales-setting-competitor-price-next-action>${nextAction}</p>
        `;
        return;
    }

    container.innerHTML = "";
}

function installFixtureStyles(): void {
    const styleElement = document.createElement("style");
    styleElement.textContent = `
        body {
            margin: 0;
            background: #eef2f6;
            color: #243245;
            font-family: Arial, "Yu Gothic", "Meiryo", sans-serif;
        }

        [data-ra-fixture-shell] {
            max-width: 1180px;
            margin: 0 auto;
            padding: 24px;
        }

        [data-ra-fixture-header] {
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 16px;
        }

        [data-ra-fixture-header] h1 {
            margin: 0 0 4px;
            font-size: 24px;
        }

        [data-ra-fixture-header] p {
            margin: 0;
            color: #5b6b7d;
            font-size: 13px;
            font-weight: 700;
        }

        [data-ra-fixture-header] label {
            display: grid;
            gap: 6px;
            min-width: 260px;
            color: #50627a;
            font-size: 12px;
            font-weight: 800;
        }

        [data-ra-fixture-header] select {
            min-height: 34px;
            border: 1px solid #b7c4d3;
            border-radius: 5px;
            background: #ffffff;
            color: #243245;
            font: inherit;
        }

        [data-ra-rank-recommendation-list] {
            margin: 0 0 16px;
            padding: 12px;
            border: 1px solid #cfd8e3;
            border-radius: 6px;
            background: #f8fafc;
            box-shadow: 0 1px 3px rgba(24, 39, 75, 0.08);
            overflow-x: auto;
        }

        [data-ra-rank-recommendation-list] table {
            width: 100%;
            border-collapse: collapse;
            table-layout: auto;
            font-size: 12px;
            line-height: 1.45;
        }

        [data-ra-rank-recommendation-list] th,
        [data-ra-rank-recommendation-list] td {
            padding: 7px 8px;
            border-top: 1px solid #e1e7ef;
            text-align: left;
            vertical-align: middle;
            white-space: nowrap;
        }

        [data-ra-rank-recommendation-row] {
            border-left: 4px solid transparent;
        }

        [data-ra-rank-recommendation-row][data-ra-rank-recommendation-priority="high"] {
            border-left-color: #b54646;
            background: #fff8f7;
        }

        [data-ra-rank-recommendation-row][data-ra-rank-recommendation-priority="medium"] {
            border-left-color: #b98616;
            background: #fffaf0;
        }

        [data-ra-rank-recommendation-row][data-ra-rank-recommendation-priority="low"] {
            border-left-color: #7f93aa;
        }

        [data-ra-rank-recommendation-cell-role="priority"],
        [data-ra-rank-recommendation-cell-role="decision-summary"],
        [data-ra-rank-recommendation-cell-role="status"] {
            font-weight: 800;
        }

        [data-ra-rank-recommendation-cell-role="priority"] {
            text-align: center;
        }

        [data-ra-rank-recommendation-cell-role="priority"]::after {
            content: "";
            display: block;
            width: 28px;
            height: 3px;
            margin-top: 3px;
            border-radius: 999px;
            background: currentColor;
            opacity: 0.55;
        }

        [data-ra-rank-recommendation-recommended-action-label] {
            display: inline-flex;
            align-items: center;
            width: fit-content;
            min-height: 22px;
            padding: 2px 7px;
            border: 1px solid currentColor;
            border-radius: 999px;
            font-weight: 800;
            white-space: nowrap;
        }

        [data-ra-rank-recommendation-button],
        [data-ra-rank-recommendation-curve-popover] button {
            min-height: 26px;
            padding: 4px 8px;
            border: 1px solid #b7c4d3;
            border-radius: 5px;
            background: #ffffff;
            color: #243245;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
        }

        [data-ra-rank-recommendation-button-action="analyze"] {
            border-color: #315b8d;
            background: #315b8d;
            color: #ffffff;
        }

        [data-ra-rank-recommendation-button-action="rank-change-submit"],
        [data-ra-rank-recommendation-button-action="rank-change-inline-submit"] {
            border-color: #0c7a43;
            background: #ecf8ef;
            color: #0c5f35;
        }

        [data-ra-rank-recommendation-primary-actions],
        [data-ra-rank-recommendation-secondary-actions] {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            margin: 0 0 6px;
        }

        [data-ra-rank-recommendation-secondary-actions] {
            width: fit-content;
        }

        [data-ra-rank-recommendation-secondary-actions] summary {
            min-height: 24px;
            padding: 3px 7px;
            border: 1px solid #c9d4e2;
            border-radius: 5px;
            background: #f8fbff;
            color: #315b8d;
            cursor: pointer;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.25;
        }

        [data-ra-rank-recommendation-secondary-actions] > *:not(summary) {
            margin-top: 6px;
        }

        [data-ra-rank-recommendation-curve-popover-content] {
            z-index: 20;
            min-width: 260px;
            padding: 8px 10px;
            border: 1px solid #c9d4e2;
            border-radius: 6px;
            background: #ffffff;
            box-shadow: 0 8px 20px rgba(31, 44, 61, 0.16);
            color: #33445a;
            font-size: 12px;
            line-height: 1.45;
        }

        [data-ra-rank-recommendation-rank-gap-tooltip] {
            display: none;
        }

        [data-ra-rank-recommendation-rank-gap]:hover [data-ra-rank-recommendation-rank-gap-tooltip],
        [data-ra-rank-recommendation-rank-gap]:focus-within [data-ra-rank-recommendation-rank-gap-tooltip] {
            display: block;
        }

        [data-ra-fixture-secondary] {
            padding: 12px;
            border: 1px solid #d9e1ea;
            border-radius: 6px;
            background: #ffffff;
        }

        [data-ra-fixture-secondary]:empty {
            display: none;
        }

        [data-ra-fixture-gallery] {
            margin-top: 18px;
        }

        [data-ra-fixture-gallery] h2 {
            margin: 0 0 10px;
            font-size: 18px;
        }

        [data-ra-fixture-gallery-grid] {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
            gap: 14px;
        }

        [data-ra-fixture-gallery-card] {
            min-width: 0;
            padding: 10px;
            border: 1px solid #d9e1ea;
            border-radius: 6px;
            background: #ffffff;
        }

        [data-ra-fixture-gallery-card] h3 {
            margin: 0 0 8px;
            color: #33445a;
            font-size: 13px;
        }

        @media (max-width: 760px) {
            [data-ra-fixture-header] {
                align-items: stretch;
                flex-direction: column;
            }

            [data-ra-fixture-shell] {
                padding: 14px;
            }

            [data-ra-fixture-gallery-grid] {
                grid-template-columns: 1fr;
            }

            [data-ra-rank-recommendation-list] table,
            [data-ra-rank-recommendation-list] thead,
            [data-ra-rank-recommendation-list] tbody,
            [data-ra-rank-recommendation-list] tr,
            [data-ra-rank-recommendation-list] th,
            [data-ra-rank-recommendation-list] td {
                display: block;
            }

            [data-ra-rank-recommendation-list] thead {
                display: none;
            }

            [data-ra-rank-recommendation-row] {
                padding: 8px 0;
                border-top: 1px solid #e1e7ef;
                border-left-width: 4px;
            }

            [data-ra-rank-recommendation-list] td {
                display: grid;
                grid-template-columns: 82px minmax(0, 1fr);
                gap: 6px;
                padding: 4px 0;
                border-top: 0;
                white-space: normal;
            }

            [data-ra-rank-recommendation-list] td::before {
                color: #5b6b7d;
                font-weight: 800;
                content: attr(data-ra-rank-recommendation-cell-role);
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="priority"]::before {
                content: "優先度";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="decision-summary"]::before {
                content: "判断";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="stay-date"]::before {
                content: "宿泊日";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="room-group"]::before {
                content: "部屋タイプ";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="current-rank"]::before {
                content: "現ランク";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="recommended-action"]::before {
                content: "推奨";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="reason"]::before {
                content: "根拠";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="status"]::before {
                content: "状態";
            }

            [data-ra-rank-recommendation-list] [data-ra-rank-recommendation-cell-role="actions"]::before {
                content: "操作";
            }
        }
    `;
    document.head.append(styleElement);
}
