# spec_000_overview

## Purpose

このリポジトリは、レベニューアシスタント向け Tampermonkey userscript を TypeScript で継続開発するための基盤を提供する。

単一機能専用の補助スクリプトではなく、対象画面ごとの拡張を段階的に追加できる構成を前提にする。

## In Scope

- userscript の TypeScript 開発基盤
- `dist/*.user.js` の生成と配布
- Chrome remote debugging と CDP 接続の確認導線
- レベニューアシスタント top / analyze / monthly-progress 画面の拡張実装または拡張調査
- userscript の運用に必要な最小限の文書正本

## Out Of Scope

- 外部サーバーや外部保存先との連携
- Playwright を使った本格的な end-to-end テストの常設
- top / analyze / monthly-progress 画面以外の拡張仕様
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

monthly-progress 画面の custom booking curve は調査と仕様整理の段階であり、現時点の公開挙動にはまだ含めない。

## Near-Term Product Direction

当面の主線は、`revenue-assistant-rms` 側で独立した分析ツールを進めることではなく、この userscript を `レート調整特化 + 人数なしの簡易フォーキャスト` として育てることである。

理由:

- Revenue Assistant から確認できる範囲では、人数実績データが取得できない。
- PMS データを併用する本格 RMS は、入力経路、保存、LT 定義、データ粒度が複雑になる。
- 現時点では、Revenue Assistant の Analyze 画面上で、部屋タイプ別のレート調整判断に使える基準線を増やすほうが実務価値が高い。

優先する表示:

- Analyze 日付ページの日別 booking curve に、BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を重ねる。
- 最上段のホテル全体 block だけでなく、室タイプ別 card でも同じ考え方の reference curve を表示する。
- reference curve は、Revenue Assistant から取得できる booking curve 系データだけを使う first wave とする。
- 人数 forecast、PMS データ併用、Revenue Assistant 外の長期 DB、rate write-back 自動化は first wave の対象外とする。

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
- `docs/context/INTENT.md`: 複数の仕様判断に使う優先順位と非目標
- `docs/context/DECISIONS.md`: 継続参照する判断理由
- `docs/context/STATUS.md`: 現況、次スレッド入口、verify 状態
- `docs/tasks_backlog.md`: 未着手または未確定の残課題と実行順
- `docs/spec_001_analyze_expansion.md`: analyze 画面拡張の現行仕様

## Spec Update Policy

- `docs/spec_000_overview.md` は repo-wide の目的、scope、文書地図、更新規則に限定する。
- Analyze 画面の詳細仕様は `docs/spec_001_analyze_expansion.md` を正本とする。
- `tasks_backlog` に task を追加しただけでは `spec` を確定しない。
- `spec-impact: yes | unknown` の task は、実装開始前に `spec` 更新要否を再判定する。
- 外部から見える挙動、入出力契約、受け入れ条件、非機能要件に影響する場合は、実装前を主 checkpoint として `spec` を更新する。
- 新しい `spec_*.md` は、独立した外部契約、受け入れ条件、更新単位のいずれかがある場合だけ作る。
