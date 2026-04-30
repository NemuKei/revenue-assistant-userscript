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

## 現在の実装状態

### Analyze 日付ページ

現時点の `src/main.ts` は、レベニューアシスタントの analyze 日付ページを検知し、次の拡張を実装しています。ブッキングカーブ API の raw source は、画面上の `最終データ更新` 日付、施設、scope、室タイプごとに分離して IndexedDB に保存します。画面応答用には memory cache と小さな group-room result cache だけを使い、ブッキングカーブ response 全体は localStorage に新規保存しません。起動時、ページ復帰時、フォーカス復帰時には団体系の整合チェックを行い、異常時は group 系キャッシュを破棄して再同期します。

- 月次カレンダー各日付セルへの団体室数表示
- カレンダー上の団体室数表示の visible / hidden 切替トグル
- 販売設定タブの室タイプ別 1日前差分 / 7日前差分 / 30日前差分表示
- 販売設定タブの室タイプ別団体室数と 1日前差分 / 7日前差分 / 30日前差分表示
- 販売設定タブ最上段の全体販売室数サマリーと全体団体室数サマリーの 2 行表示

この段階の狙いは、次の 3 点を先に安定させることです。

- 対象画面の判定
- API 取得と日次キャッシュ
- SPA 風遷移に対する再同期

### 月次実績画面

月次実績画面向けには、`/monthly-progress/YYYY-MM` を既存 top / analyze の同期系から切り離す route-scoped scaffold を追加済みです。monthly-progress 側は専用 storage namespace を先に持ち、`localStorage["revenue-assistant:feature:monthly-progress:enabled"] = "0"` で kill switch を入れられます。

`/api/v1/booking_curve/monthly` の結果は write-only で IndexedDB へ日次 snapshot 保存を始めており、予約日基準 chart 直下へ month-end anchor の LT バケット集約 chart を独立 section で差し込んでいます。現在は `販売客室数` と `販売単価` の 2 カラム表示、対象月から未来 3 か月の同時表示、`前年 / 前々年` compare 切替、hover tooltip まで入っています。表示の read path はまだ現行 API を正とします。

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
