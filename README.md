# Revenue Assistant Userscript

レベニューアシスタント向けの Tampermonkey userscript を、TypeScript で安全に開発するための専用ワークスペースです。

## 目的

- レベニューアシスタントの画面拡張を userscript で実装する
- 機能ごとの DOM 依存や API 依存を整理しながら育てる
- Chrome remote debugging と DevTools MCP を使って確認しやすくする

初期ターゲットは、analyze 日付ページで団体室数と販売設定差分を見やすくすることです。ただし repo 自体は単機能に閉じず、今後のレベアシ向け拡張を受け止める汎用基盤として扱います。

## 前提

1. Node.js 22 LTS 以上
2. Google Chrome
3. Chrome 拡張の Tampermonkey
4. `npm run chrome:debug` を使う場合は PowerShell 7 (`pwsh`)

## 初期セットアップ

```powershell
npm install
npm run check
```

## 開発コマンド

- `npm run dev`: `dist/*.user.js` を watch build
- `npm run build`: 本番向けに 1 回ビルド
- `npm run typecheck`: TypeScript の型検査
- `npm run lint`: ESLint 実行
- `npm run check`: 型検査、lint、build をまとめて実行
- `npm run chrome:debug`: デバッグポート 9222 付きの Chrome を専用プロファイルで起動
- `npm run chrome:debug:default-profile`: 既存の Chrome Default プロファイルを remote debugging 付きで起動
- `npm run chrome:debug:default-profile:resume`: 既存の Chrome Default プロファイルを前回セッション復元付きで起動
- `npm run chrome:profiles`: 利用可能な Chrome プロファイルを一覧表示
- `npm run chrome:pages`: CDP 経由で Chrome に接続し、開いているページを一覧表示
- `npm run userscript:version-check -- --installed-version <Tampermonkey上のversion>`: local `dist`、GitHub Pages 公開版、Tampermonkey 上の version、Revenue Assistant tab の有無を確認
- `npm run smoke:write-posts -- --seconds 30 --operation <確認内容>`: CDP 接続中の Chrome tab で、監視対象 write API の POST 件数を確認

## Verification

```powershell
# 通常の repo-wide verify
npm run check

# 型エラーだけを先に確認
npm run typecheck

# ESLint だけを確認
npm run lint

# userscript bundle 再生成だけを確認
npm run build

# commit 前の whitespace error 確認
git diff --check
```

`npm run check` は `npm run typecheck`、`npm run lint`、`npm run build` を順に実行します。

Codex automation shell などで `npm run ...` をそのまま実行できない場合は、次の direct command を fallback として使います。

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\eslint\bin\eslint.js .
node .\scripts\build.mjs
```

## 配布版確認と通常 Chrome smoke

この確認は、`dist` は更新済みだが通常 Chrome の Tampermonkey では古い版が動いている、という状態を早く見つけるために行います。

### Version Check

1. `npm run build` を実行し、local `dist/revenue-assistant-userscript.user.js` を更新する。
2. `npm run userscript:version-check` を実行し、local version、published version、`@updateURL`、`@downloadURL`、Revenue Assistant tab の有無を確認する。
3. Tampermonkey dashboard で対象 userscript の version を確認する。Codex が dashboard の保存操作を自動化しない。更新が必要な場合は、利用者本人が Tampermonkey の更新操作を行う。
4. 更新後に `npm run userscript:version-check -- --installed-version <確認したversion> --open-url https://ra.jalan.net/` を実行し、local / published / installed version と開いた Revenue Assistant URL を記録する。

### Smoke Checklist

通常 Chrome、Tampermonkey、Revenue Assistant ログイン状態が必要な確認では、CDP 一時注入ではなく配布版 userscript を使います。CDP は DOM、console、network の観測補助に限定します。

| 画面 | 操作 | 期待結果 | 証跡として残す値 |
| --- | --- | --- | --- |
| Top 料金調整候補 | Revenue Assistant top を reload | `料金調整候補` section、候補 row、meta、表示条件、対象月 filter が表示される | URL、row count、`data-ra-rank-recommendation-react-island="mounted"`、`data-mode`、console error 件数 |
| Top 料金調整候補 | `曲線` を開閉 | preview row が開閉し、既存 booking curve selector が維持される | preview row 件数、SVG 件数、console error 件数 |
| Top 料金調整候補 | `rank調整` を開閉し、送信前に `取消` する | 5 秒 pending 中に取消でき、実 POST は発生しない | pending 表示、取消後の pending 件数、監視対象 write API POST 件数 |
| Top 料金調整候補 | `様子見` と `対応不要` を押し、保存前に `取消` する | browser-local decision record が保存されず、row 表示が戻る | pending 表示、取消後の pending 件数、監視対象 write API POST 件数 |
| Analyze 価格推移 tab | `価格推移` tab を開く | `競合価格 最安値推移（90日版）`、初回表示優先、background queue 状態が表示される | URL、panel / SVG 件数、background status text、console error 件数 |
| 月次実績画面 | `/monthly-progress/YYYY-MM` を reload | `LTブッキングカーブ`、2 panel、loading / background state が表示される | URL、preview root 件数、panel / SVG 件数、status text、console error 件数 |
| Warm cache indicator | Top または Analyze で detail を開く | 対象期間、保存、skip、失敗、候補優先が発火する場合の進行状態が読める | indicator text、対象期間、保存 / skip / 失敗件数 |

標準 smoke では実送信を行いません。監視対象 write API は次の POST です。

- `/api/v1/lincoln/suggest`
- `/api/v1/lincoln/price_ranks`
- `/api/v1/tema/price_ranks`
- `/api/v1/neppan/price_ranks`

確認中に POST 0 件を記録する場合は、対象 Chrome tab を開いた状態で次を実行します。

```powershell
npm run smoke:write-posts -- --seconds 30 --operation top-react-smoke
```

出力には、観測対象 URL、操作名、観測秒数、監視 endpoint、POST count、確認時刻が含まれます。raw request body、raw response body、Cookie、token、authorization header、顧客情報、予約情報、価格や在庫の非公開データは保存しません。

## 現在の実装状態

### Analyze 日付ページ

現時点の `src/main.ts` は、レベニューアシスタントの analyze 日付ページを検知し、次の拡張を実装しています。ブッキングカーブ API の raw source は、画面上の `最終データ更新` 日付、施設、scope、室タイプごとに分離して IndexedDB に保存します。画面応答用には memory cache と小さな group-room result cache だけを使い、ブッキングカーブ response 全体は localStorage に新規保存しません。起動時、ページ復帰時、フォーカス復帰時には団体系の整合チェックを行い、異常時は group 系キャッシュを破棄して再同期します。

- 月次カレンダー各日付セルへの団体室数表示
- カレンダー上の団体室数表示の visible / hidden 切替トグル
- 販売設定タブの室タイプ別 1日前差分 / 7日前差分 / 30日前差分表示
- 販売設定タブの室タイプ別団体室数と 1日前差分 / 7日前差分 / 30日前差分表示
- 販売設定タブ最上段の全体販売室数サマリーと全体団体室数サマリーの 2 行表示
- Analyze 日付ページで取得した競合価格 response の IndexedDB snapshot 保存
- 競合価格タブ内、Revenue Assistant 標準の競合価格表より下への人数別最安値グラフ表示
- 競合価格グラフの部屋タイプ、食事条件 toggle 絞り込み、縦軸補助線、表形式 tooltip、同日複数 snapshot の日単位最新化
- warm cache indicator への競合価格 snapshot 保存状態表示と、詳細表示の最小化 / 再表示

この段階の狙いは、次の 3 点を先に安定させることです。

- 対象画面の判定
- API 取得と日次キャッシュ
- SPA 風遷移に対する再同期

### 月次実績画面

月次実績画面向けには、`/monthly-progress/YYYY-MM` を既存 top / analyze の同期系から切り離す route-scoped scaffold を追加済みです。monthly-progress 側は専用 storage namespace を先に持ち、`localStorage["revenue-assistant:feature:monthly-progress:enabled"] = "0"` で kill switch を入れられます。

`/api/v1/booking_curve/monthly` の結果は、`facilityCacheKey + yearMonth + batchDateKey` ごとの IndexedDB snapshot として保存します。現在の preview は、同じ batch date の snapshot がなければ API 取得して保存し、その後に保存済み snapshot を読んで表示します。過去 batch の履歴比較や日次差分表示にはまだ使っていません。

予約日基準 chart 直下には、month-end anchor の LT バケット集約 chart を独立 section で差し込んでいます。現在は `販売客室数` panel、`販売単価 / 売上` 切替 panel、対象月から未来 4 か月の同時表示、`前年 / 前々年 / 3年前` compare 切替、hover tooltip まで入っています。GUI 確認と final graph 契約の固定は `docs/tasks_backlog.md` の `RAU-MP-01` で扱います。

## ドキュメントの正本

- `AGENTS.md`: リポジトリ全体の常設ルール
- `docs/spec_000_overview.md`: リポジトリ全体の仕様概要
- `docs/spec_001_analyze_expansion.md`: analyze 画面拡張の現行仕様
- `docs/context/STATUS.md`: 現況の正本
- `docs/context/DECISIONS.md`: 判断理由の正本
- `docs/tasks_backlog.md`: 未実装タスクの管理

## 配布

`userscript.config.mjs` が userscript metadata の正本です。配布物と Tampermonkey への投入物は `dist/*.user.js` を正とします。

公開 userscript URL:
[https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js](https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js)

GitHub Pages 配布を使う場合は、`GITHUB_PAGES_BASE_URL` をビルド時に渡すと `updateURL` と `downloadURL` が自動で入ります。

`main` への push では `.github/workflows/publish-userscript.yml` が動き、GitHub Pages へ userscript を自動配布します。GitHub Actions 上の build では `GITHUB_RUN_NUMBER` を userscript version に付与するため、公開物は push ごとに Tampermonkey の自動更新対象になります。
