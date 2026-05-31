import {
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
    | "rank-change-pending"
    | "preview-open"
    | "monthly-compact"
    | "price-trends-loading"
    | "price-trends-empty"
    | "price-trends-failure";

const FIXTURE_STATES: readonly { value: FixtureState; label: string }[] = [
    { value: "candidates", label: "候補あり" },
    { value: "empty", label: "候補なし" },
    { value: "current-settings-401", label: "current settings 401" },
    { value: "current-settings-403", label: "current settings 403" },
    { value: "decision-hidden", label: "利用者判断で非表示" },
    { value: "rank-change-pending", label: "rank change pending" },
    { value: "preview-open", label: "preview open" },
    { value: "monthly-compact", label: "月次 compact view" },
    { value: "price-trends-loading", label: "価格推移 loading" },
    { value: "price-trends-empty", label: "価格推移 empty" },
    { value: "price-trends-failure", label: "価格推移 failure" }
];

const rootElement = document.getElementById("rank-fixture-root");
const secondaryRootElement = document.getElementById("rank-fixture-secondary-root");
const stateSelectElement = document.getElementById("rank-fixture-state");

if (!(rootElement instanceof HTMLElement)
    || !(secondaryRootElement instanceof HTMLElement)
    || !(stateSelectElement instanceof HTMLSelectElement)) {
    throw new Error("Rank recommendation fixture root is missing.");
}

const fixtureRootElement = rootElement;
const fixtureSecondaryRootElement = secondaryRootElement;

installFixtureStyles();
installStateOptions(stateSelectElement);
renderFixture("candidates");

stateSelectElement.addEventListener("change", () => {
    renderFixture(stateSelectElement.value as FixtureState);
});

function installStateOptions(selectElement: HTMLSelectElement): void {
    selectElement.replaceChildren(...FIXTURE_STATES.map((state) => {
        const option = document.createElement("option");
        option.value = state.value;
        option.textContent = state.label;
        return option;
    }));
}

function renderFixture(state: FixtureState): void {
    syncRankRecommendationReactList(fixtureRootElement, buildFixtureSnapshot(state));
    renderSecondaryFixtureState(fixtureSecondaryRootElement, state);
}

function buildFixtureSnapshot(state: FixtureState): RankRecommendationReactListSnapshot {
    const rows = buildRowsForState(state);
    const emptyText = getEmptyTextForState(state);
    return {
        signature: `fixture:${state}:${rows.length}`,
        mode: "fixture",
        title: "料金調整候補",
        metaText: buildMetaText(state, rows.length),
        columns: ["優先", "宿泊日", "部屋タイプ", "宿泊まで", "前回変更", "現ランク", "確度", "推奨", "主要根拠", "操作"],
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
                summary: "rank順序: 手動調整 10 > 11 > 12",
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
        pendingRankChange: state === "rank-change-pending"
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
        pendingRankChange: false
    });

    return state === "decision-hidden" ? [firstRow] : [firstRow, secondRow];
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
    pendingRankChange: boolean;
}): RankRecommendationReactRowSnapshot {
    return {
        key: options.key,
        priority: options.priority,
        action: options.action,
        status: "eligible",
        cells: [
            { kind: "text", value: options.priority === "high" ? "高" : "中" },
            { kind: "text", value: options.stayDate },
            { kind: "text", value: options.roomGroup },
            { kind: "text", value: "53日" },
            { kind: "text", value: "5/27・2日前", attribute: "data-ra-rank-recommendation-history" },
            {
                kind: "rankGap",
                currentRankText: options.currentRank,
                title: "同じ宿泊日の全部屋タイプ rank を確認",
                entries: [
                    { values: [options.roomGroup, options.currentRank, "8/12", "対象", "fixture"], isTarget: true },
                    { values: ["ダブル", "12", "5/10", "1段低い", "fixture"], isTarget: false }
                ]
            },
            { kind: "text", value: "高・注意あり" },
            { kind: "text", value: options.action === "raise_watch" ? "上げ候補" : "下げ候補" },
            { kind: "text", value: options.reason }
        ],
        analyzeLink: {
            text: "Analyze",
            title: "Analyze で確認",
            href: `https://ra.jalan.net/analyze/${options.stayDate}`,
            attrs: {}
        },
        curvePreviewButton: {
            ...buildButton("曲線", "curve-preview"),
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
            ...buildButton("rank調整", "rank-change-preview"),
            expanded: options.rankOpen
        },
        snoozeButton: buildButton("様子見", "snooze"),
        dismissButton: buildButton("対応不要", "dismiss"),
        pendingDecision: null,
        pendingRankChange: options.pendingRankChange
            ? {
                key: options.key,
                label: "3秒後に送信",
                cancelButton: buildButton("取消", "rank-change-cancel")
            }
            : null,
        rankChangeResult: null,
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
        return `表示 ${rowCount} 件 / 利用者判断で非表示 1 件 / fixture`;
    }
    return `表示 ${rowCount} 件 / 上げ候補 1 件 / 下げ候補 1 件 / fixture`;
}

function renderSecondaryFixtureState(container: HTMLElement, state: FixtureState): void {
    if (state === "monthly-compact") {
        container.innerHTML = `
            <h2>月次実績 日次差分 compact view</h2>
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
        return;
    }

    if (state.startsWith("price-trends")) {
        const message = state === "price-trends-loading"
            ? "背景取得 16 / 128・保存 16・現在取得中 ツイン 朝食 2名"
            : state === "price-trends-empty"
                ? "対象データがないため graph を表示できません。"
                : "背景取得 19 / 128・失敗 3・停止 fixture failure";
        container.innerHTML = `
            <h2>価格推移 supplement</h2>
            <p data-ra-price-trends-background-status>${message}</p>
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

        [data-ra-rank-recommendation-button],
        [data-ra-rank-recommendation-curve-popover] button {
            min-height: 26px;
            margin-right: 6px;
            padding: 4px 8px;
            border: 1px solid #b7c4d3;
            border-radius: 5px;
            background: #ffffff;
            color: #243245;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
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

        [data-ra-fixture-secondary] {
            padding: 12px;
            border: 1px solid #d9e1ea;
            border-radius: 6px;
            background: #ffffff;
        }

        [data-ra-fixture-secondary]:empty {
            display: none;
        }

        @media (max-width: 760px) {
            [data-ra-fixture-header] {
                align-items: stretch;
                flex-direction: column;
            }

            [data-ra-fixture-shell] {
                padding: 14px;
            }
        }
    `;
    document.head.append(styleElement);
}
