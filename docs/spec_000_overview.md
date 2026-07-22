# spec_000_overview

## Purpose

このリポジトリは、レベニューアシスタント向け Tampermonkey userscript を TypeScript で継続開発するための基盤を提供する。

単一機能専用の補助スクリプトではなく、対象画面ごとの拡張を段階的に追加できる構成を前提にする。

## In Scope

- userscript の TypeScript 開発基盤
- `dist/*.user.js` の生成と配布
- Vite を使った userscript 正規 build、dev-only fixture preview、candidate build 比較
- Chrome remote debugging と CDP 接続の確認導線
- レベニューアシスタント top / analyze / monthly-progress 画面の拡張実装または拡張調査
- トップ画面と Analyze 画面をつなぐ料金調整候補、推奨ランク方向、user decision、候補 lifecycle の拡張調査または拡張実装
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
- `booking_curve` 系の raw source を `最終データ更新` 日付、施設、scope、室タイプ単位で分離して IndexedDB に保持し、画面応答用には memory cache と小さな group-room result cache だけを使う

analyze 画面の詳細仕様は `docs/spec_001_analyze_expansion.md` を正本とする。

monthly-progress 画面の custom booking curve は、route-scoped scaffold、月次専用 storage namespace、IndexedDB snapshot 保存、LT preview chart のコード実装まで進んでいる。ただし GUI 確認と final graph 契約の固定が未完了であるため、現時点の安定した公開挙動にはまだ含めない。詳細な現状と次の実装 slice は `docs/tasks_backlog.md` の `RAU-MP-01` を正本とする。

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
- トップ画面では、既存カレンダー、`今日の判断` rail、選択詳細を decision workspace として組み合わせ、`stayDate x roomGroup` の作業順を明示する。カレンダー cue は補助表示とし、標準の黒い値と青い `団n` を置き換えない。
- 料金調整候補の単位は、日付単位ではなく `stayDate x roomGroup` を原則とする。
- first wave の recommendation は推奨レート金額ではなく、Revenue Assistant の操作単位に合う推奨ランク方向を中心にする。詳細な候補単位、user decision、cooldown、rank response、future bulk apply の契約は `docs/spec_003_rank_recommendation_signal.md` を正本とする。
- core logic は UI、API 取得、storage 実装から分離し、将来の別プロジェクトでも再利用できるようにする。
- 予測モデルと予測評価は将来候補として視野に入れる。ただし、人数 forecast、PMS データ併用、Revenue Assistant 外の長期 DB、rate write-back 自動化は first wave の対象外とする。

## Architecture

- `src/main.ts`: userscript 本体の入口
- `userscript.config.mjs`: userscript metadata の正本
- `vite.userscript.config.mjs`: metadata 付き `dist/revenue-assistant-userscript.user.js` を生成する正規 build 設定
- `vite.fixture.config.mjs`: Revenue Assistant runtime へ接続しない dev-only fixture preview 設定
- `scripts/build.mjs`: 旧 esbuild build。Vite build の rollback 候補として一時維持する
- `scripts/userscript-metadata.mjs`: userscript metadata block を Vite build と旧 esbuild build で共有する helper
- `scripts/compare-vite-build.mjs`: 正規 Vite build と Vite candidate build の metadata、size、entry line を比較する helper
- `scripts/open-chrome-debug.ps1`: remote debugging 付き Chrome を起動する
- `scripts/attach-chrome.mjs`: CDP で Chrome に接続する

## React + Vite + UI Library Migration Contract

React + Vite + UI ライブラリへの完全移行は、Revenue Assistant 本体を置き換えることではない。
対象は、userscript が追加する UI、dev-only fixture preview、userscript bundle の生成経路である。

対象:

- トップ decision workspace の `今日の判断` rail、controls、task card、選択詳細、最終確認、pending / result 表示、booking curve evidence。
- dev-only UI regression gallery。対象は、トップ料金調整候補 list の候補あり、空状態、HTTP 401、HTTP 403、利用者判断による非表示、判断 pending、rank change pending、rank change error、長い部屋タイプ名、preview open、月次実績 compact view、価格推移 loading / empty / failure の合成状態である。
- 正規 userscript build と、正規 build を上書きしない Vite candidate build。

対象外:

- Revenue Assistant 本体の routing、標準 UI、標準 table、標準 graph。
- candidate generation、scoring、Revenue Assistant API adapter、IndexedDB adapter、write guard、request queue、background queue。
- Revenue Assistant write API の自動実行、bulk apply、配布形態を Chrome 拡張へ変えること。

段階:

1. 完了定義、build lane、UI ライブラリ候補を正本化する。
2. Revenue Assistant runtime、Tampermonkey、`dist/*.user.js` へ接続しない Vite fixture preview を追加する。
3. fixture へ主要 state を追加し、実データ、Cookie、token、価格や在庫の非公開データを使わずに確認する。fixture は単一 state の確認だけでなく、UI regression gallery として複数 state を同じ画面で比較できるようにする。
4. UI ライブラリは 1 package、1 component、1 interaction に限定して試す。
5. Vite candidate build を正規 `dist` とは別の `.tmp/vite-candidate/` に出し、metadata、bundle size、entry line を比較する。
6. production 接続はトップ decision workspace の 1 component から始め、既存 `data-ra-*` selector、pending、evidence、write guard を維持する。
7. `npm run build` を Vite build に切り替える。旧 esbuild build は `npm run build:legacy` として一時維持し、rollback 候補にする。

停止条件:

- `npm run check`、`npm run build`、`npm run build:vite:candidate`、`npm run build:compare:vite` のいずれかが通らない。
- Vite 正規 build の userscript metadata が candidate または旧 build と一致しない。
- UI ライブラリ component が既存 `data-ra-*` selector、keyboard close、focus return、pending / cancel、監視対象 write API POST 0 件確認を壊す。
- bundle size 増加を許容する理由、rollback 手順、配布版 smoke 条件を説明できない。
- 追加 package ごとの用途、置き換える UI、採用理由、代替案、version pin、lockfile 差分、license、install script、供給網リスク、Tampermonkey 配布版 smoke 条件を説明できない。

配布版 smoke 条件:

- `dist/revenue-assistant-userscript.user.js` は userscript metadata を先頭に持つ。
- local version、GitHub Pages published version、Tampermonkey installed version の関係を確認する。
- 対象 scope では、主要 selector、React marker、UI component marker、console / page error 0 件、監視対象 write API POST 0 件を確認する。

配布 workflow:

- Classic公開は凍結する。`.github/workflows/publish-userscript.yml` は `workflow_dispatch` による公開baselineのread-only照合だけを行い、push trigger、Pages / OIDC書込権限、source build、artifact upload、deployを持たない。
- `main` pushでは、Pages権限を持たない `.github/workflows/validate-main.yml` がClassic / Next / fixture / publication boundaryを検証する。`.github/workflows/**` の追加または変更も起動対象とする。
- publication boundary checkerはworkflow allowlistと全workflowの公開系権限 / action不在を検査する。Classicの再公開または更新は、candidate source SHA、digest、protected approvalを先に仕様化する別gateとする。

## Verification

通常の verify は次の順で実施する。

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`
4. 必要に応じて `npm run check`
5. Next GUI変更は別identityのcandidateをClassic無効の単一runtimeで確認する。Classicの `dist/*.user.js` をTampermonkeyへ投入するのは、release gateを明示的に再開した場合だけとする

## Documentation Map

- `AGENTS.md`: リポジトリ全体の常設ルール
- `README.md`: セットアップ、コマンド、配布方法
- `docs/context/PROJECT_CONTEXT.md`: optional upper premise。Profile、目的、背景意図、非目的、安全境界、source-of-truth role
- `docs/context/INTENT.md`: 複数の仕様判断に使う比較軸と優先順位
- `docs/context/DECISIONS.md`: 継続参照する判断理由
- `docs/context/STATUS.md`: 現況、次スレッド入口、verify 状態
- `docs/tasks_backlog.md`: 未着手または未確定の残課題と実行順
- `docs/spec_001_analyze_expansion.md`: analyze 画面拡張の現行仕様
- `docs/spec_002_curve_core.md`: booking curve core logic、reference curve、将来の予測モデル、将来の予測評価の入出力契約
- `docs/spec_003_rank_recommendation_signal.md`: トップ decision workspace、推奨ランク方向、user decision、candidate lifecycle、rank response、future bulk apply の契約

## Spec Update Policy

- `docs/spec_000_overview.md` は repo-wide の目的、scope、文書地図、更新規則に限定する。
- Analyze 画面の詳細仕様は `docs/spec_001_analyze_expansion.md` を正本とする。
- booking curve core logic の入出力、算出規則、予測モデル候補、予測評価候補は `docs/spec_002_curve_core.md` を正本とする。
- トップ decision workspace、推奨ランク方向、user decision、candidate lifecycle、rank response、future bulk apply は `docs/spec_003_rank_recommendation_signal.md` を正本とする。
- `tasks_backlog` に task を追加しただけでは `spec` を確定しない。
- `spec-impact: yes | unknown` の task は、実装開始前に `spec` 更新要否を再判定する。
- 外部から見える挙動、入出力契約、受け入れ条件、非機能要件に影響する場合は、実装前を主 checkpoint として `spec` を更新する。
- 新しい `spec_*.md` は、独立した外部契約、受け入れ条件、更新単位のいずれかがある場合だけ作る。
