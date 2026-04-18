# spec_000_overview

## Purpose

このリポジトリは、レベニューアシスタント向け Tampermonkey userscript を TypeScript で継続開発するための基盤を提供する。

単一機能専用の補助スクリプトではなく、対象画面ごとの拡張を段階的に追加できる構成を前提にする。

## In Scope

- userscript の TypeScript 開発基盤
- `dist/*.user.js` の生成と配布
- Chrome remote debugging と CDP 接続の確認導線
- レベニューアシスタント top / analyze 画面の拡張実装
- userscript の運用に必要な最小限の文書正本

## Out Of Scope

- 外部サーバーや外部保存先との連携
- Playwright を使った本格的な end-to-end テストの常設
- top / analyze 画面以外の拡張仕様
- userscript 以外の Chrome 拡張配布形態

## Current Public Behavior

現在の userscript は、top / analyze 系ページを検知し、次の公開挙動を提供する。

- トップカレンダー各日付セルの最下部へ、販売ランク最終変更の相対日数を表示する
- 月次カレンダー各日付セルへ団体室数を表示する
- カレンダー上の団体室数表示を切り替えるトグルを提供する
- 販売設定タブで、室タイプ別の販売室数に対する `1日前差分 / 7日前差分 / 30日前差分` を表示する
- 販売設定タブで、室タイプ別の団体室数と `1日前差分 / 7日前差分 / 30日前差分` を表示する
- 販売設定タブ最上段で、全体販売室数サマリーと全体団体室数サマリーを 2 行で表示する
- `booking_curve` 系の取得結果を `最終データ更新` 日付と施設単位で分離して `localStorage` に保持し、起動時、ページ復帰時、フォーカス復帰時に整合チェックを行って異常時は再同期する

analyze 画面の詳細仕様は `docs/spec_001_analyze_expansion.md` を正本とする。

## Architecture

- `src/main.ts`: userscript 本体の入口
- `userscript.config.mjs`: userscript metadata の正本
- `scripts/build.mjs`: metadata 付き bundle を生成する build 入口
- `scripts/open-chrome-debug.ps1`: remote debugging 付き Chrome を起動する
- `scripts/attach-chrome.mjs`: CDP で Chrome に接続する

## Verification

通常の verify は次の順で実施する。

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`
4. 必要に応じて `npm run check`
5. GUI 変更がある場合は、Tampermonkey に `dist/*.user.js` を読み込み、対象画面で手動確認する

## Documentation Map

- `AGENTS.md`: リポジトリ全体の常設ルール
- `README.md`: セットアップ、コマンド、配布方法
- `docs/spec_001_analyze_expansion.md`: analyze 画面拡張の現行仕様
- `docs/context/STATUS.md`: 現況と次の作業
- `docs/context/DECISIONS.md`: 継続参照する判断理由
- `docs/tasks_backlog.md`: 未着手または未確定の残課題
