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

monthly-progress 画面の custom booking curve は、route-scoped scaffold、月次専用 storage namespace、IndexedDB snapshot 保存、LT preview chart のコード実装まで進んでいる。ただし GUI 確認と final graph 契約の固定が未完了であるため、現時点の安定した公開挙動にはまだ含めない。詳細な現状と次の実装 slice は [現行仕様/課題](https://github.com/NemuKei/revenue-assistant-userscript/issues/29) の `RAU-MP-01` を正本とする。

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
- `.github/workflows/publish-next-userscript.yml`だけがNext公開のPages書込を持つ。`workflow_dispatch`、`main`、入力値`PUBLISH_NEXT`へ限定し、Classicの公開JS / source mapを固定baselineへ照合して同梱した後、Next専用pathを含むsite全体をdeployする。
- publication boundary checkerはworkflow allowlistを検査し、Next公開workflow以外のPages / OIDC書込とdeploy actionを拒否する。Classicの再build、再公開、更新は引き続き別gateとする。

## Verification

通常の verify は次の順で実施する。

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`
4. 必要に応じて `npm run check`
5. Next GUI変更は別identityのcandidateをClassic無効の単一runtimeで確認する。Classicの `dist/*.user.js` をTampermonkeyへ投入するのは、release gateを明示的に再開した場合だけとする
6. Next公開時は`docs/spec_004_next_distribution.md`に従い、公開artifact / manifest、Classic不変、Tampermonkey installed version、単一runtime、標準UI非干渉、Revenue Assistant write 0を確認する

## Documentation Map

- `AGENTS.md`: リポジトリ全体の常設ルール
- `README.md`: セットアップ、コマンド、配布方法
- [現行仕様/課題](spec_000_overview.md): optional upper premise。Profile、目的、背景意図、非目的、安全境界、source-of-truth role
- [現行仕様/課題](spec_000_overview.md): 複数の仕様判断に使う比較軸と優先順位
- [現行仕様/課題](spec_000_overview.md): 継続参照する判断理由
- [現行仕様/課題](https://github.com/NemuKei/revenue-assistant-userscript/issues/29): 現況、次スレッド入口、verify 状態
- [現行仕様/課題](https://github.com/NemuKei/revenue-assistant-userscript/issues/29): 未着手または未確定の残課題と実行順
- `docs/spec_001_analyze_expansion.md`: analyze 画面拡張の現行仕様
- `docs/spec_002_curve_core.md`: booking curve core logic、reference curve、将来の予測モデル、将来の予測評価の入出力契約
- `docs/spec_003_rank_recommendation_signal.md`: トップ decision workspace、推奨ランク方向、user decision、candidate lifecycle、rank response、future bulk apply の契約
- `docs/spec_004_next_distribution.md`: Next公開artifact、GitHub Pages配置、version、自動更新、Classic保全、rollbackの契約

## Spec Update Policy

- `docs/spec_000_overview.md` は repo-wide の目的、scope、文書地図、更新規則に限定する。
- Analyze 画面の詳細仕様は `docs/spec_001_analyze_expansion.md` を正本とする。
- booking curve core logic の入出力、算出規則、予測モデル候補、予測評価候補は `docs/spec_002_curve_core.md` を正本とする。
- トップ decision workspace、推奨ランク方向、user decision、candidate lifecycle、rank response、future bulk apply は `docs/spec_003_rank_recommendation_signal.md` を正本とする。
- Next公開artifact、GitHub Pages配置、version、自動更新、Classic保全、rollbackは `docs/spec_004_next_distribution.md` を正本とする。
- `tasks_backlog` に task を追加しただけでは `spec` を確定しない。
- `spec-impact: yes | unknown` の task は、実装開始前に `spec` 更新要否を再判定する。
- 外部から見える挙動、入出力契約、受け入れ条件、非機能要件に影響する場合は、実装前を主 checkpoint として `spec` を更新する。
- 新しい `spec_*.md` は、独立した外部契約、受け入れ条件、更新単位のいずれかがある場合だけ作る。

## 判断導線と表示・取得の設計条件

### Purpose

この文書は、RAU で複数の仕様判断に繰り返し使う比較軸と優先順位を定義する。
単発の決定は [現行仕様/課題](spec_000_overview.md)、仕様本文は `docs/spec_*.md`、現在地は [現行仕様/課題](https://github.com/NemuKei/revenue-assistant-userscript/issues/29) に置く。

RAU の上位前提、Profile、非目的、安全境界、source-of-truth role は [現行仕様/課題](spec_000_overview.md) に置く。この [現行仕様/課題](spec_000_overview.md) は、それらを重複記載せず、日々の設計・実装・優先度判断で使う比較軸に限定する。

### Judgment Principles

- `独立した分析ツールを先に作ること` と `Revenue Assistant の画面上でレート調整判断を軽くすること` が競合する場合は、後者を優先する。
- `人数データを含む本格 forecast` と `Revenue Assistant から取得できる rooms データだけで成立する簡易 forecast` が競合する場合は、当面は後者を優先する。
- `PMS データや DWH データを併用して精度を上げること` と `userscript 単体で実務導線を崩さず段階導入すること` が競合する場合は、当面は後者を優先する。
- `月次実績画面の分析表示を進めること` と `Analyze 日付ページで部屋タイプ別レート調整の判断基準を増やすこと` が競合する場合は、後者を優先する。
- `料金調整候補の表を主役にして日付と部屋を並べること` と `標準カレンダーから類似日候補を見つけ、Analyzeで詳細根拠を確認すること` が競合する場合は、後者を優先する。表形式の料金調整候補はNextの入口へ戻さず、候補を見つける責務はカレンダー、根拠を深く確認する責務はAnalyzeへ分ける。
- `表示項目、説明文、装飾、操作部品を増やして情報を網羅すること` と `利用者が料金調整判断に必要な情報と次の操作を短時間で理解できる、シンプルで分かりやすい UI (User Interface) / UX (User Experience) にすること` が競合する場合は、後者を優先する。情報量が多いこと自体が判断を遅くする可能性があるため、追加情報は常時表示へ置く前に、利用頻度、判断への必要性、誤読リスクを確認し、機能に対して不要な情報は削る。必要だが常時表示しない情報は、tooltip、popover、preview、詳細表示、または非表示へ分ける。
- `表示系列を増やすこと` と `既存の全体 / 個人系列、rank marker、tooltip、ACT 空表示を壊さないこと` が競合する場合は、後者を優先する。
- 既に合意した Next の機能構成、判断導線、data contract、取得・保存、安全境界、clean-room の責務分離は維持する。Classic から再利用する対象は、表示配置、情報の順序、filter / toggle、用語、操作感などの UI 層に限定する。booking curve、参考線、過去調整 marker、競合価格 graph などの慣れた見方を baseline とし、標準 UI との干渉、意味の誤り、mobile / accessibility 上の問題、または実利用で判断が遅くなる根拠がある箇所だけ、変更範囲と理由を明示して局所最適化する。Classic の技術負債、monolith、DOM 構造、通信・保存責務は移植しない。
- 全面刷新より、Classicで実務に定着したUIを維持し、`booking curveを毎回全件取得すること`、`再描画で表示が重複・消失・不整合になること`、`表形式の料金調整候補を入口にすること`の3点を優先して直す。これら以外は、標準UI干渉、意味の誤り、または判断時間悪化を確認した場合だけ局所変更する。
- `request 数を増やして比較系列を豊かにすること` と `画面遷移、タブ切替、フォーカス復帰で安定して動くこと` が競合する場合は、後者を優先する。
- `表示範囲外の取得や学習用coverageを早く増やすこと` と `Top / Analyzeで現在の判断に必要な情報がSLO（Service Level Objective、操作から判断可能になるまでの目標時間）内に揃うこと` が競合する場合は、後者を優先する。interactiveなcurrent表示、表示中summary、利用者が開いたroom / tabを先にし、prefetch、欠損補完、学習用backgroundはその待ち時間を悪化させない余力だけで進める。速い空表示で達成したことにせず、latencyと利用可能なsource coverage、partial / error / stopを分けて測る。
- `Topのbackground coverageを早く完了すること` と `Analyzeで全体、各room current、利用者が開いたroomの根拠をテンポよく確認できること` が競合する場合は、Analyzeを優先する。Top backgroundの件数budgetとAnalyze foregroundを分け、AnalyzeはTopの800 / 200上限へ達しても`budget-reached`にしない。ここでいう上限なしは、現在のAnalyze表示と利用者が開いたroomに必要な有限のdue taskへ件数上限を置かない意味であり、未選択roomのreference prefetch、取得scope、50msの開始間隔、同時20件、dedupe、停止条件を無制限化する意味ではない。coldでも全体と各currentを数秒、選択room根拠を5秒程度で判断可能にすることを目標とし、数十秒の待機を通常UXとして許容しない。
- `request開始を一律に遅くすること` と `保存済みsourceを再利用して総request数を減らすこと` が競合する場合は、後者を優先する。取得対象、session上限、重複回避、401 / 403 / 429停止を維持したうえで、全件再取得を差分取得へ置き換え、開始間隔と同時数は既に実運用した範囲へ戻す。無制限化や取得範囲の拡張は行わない。
- Nextの実行内容を変える作業は、利用者が未配信で止めると明示しない限り、実装、検証、commit / pushだけで区切らず、同じ作業内でNext公開版の配信、公開版照合、Tampermonkey更新、実画面確認まで進める。実行内容が変わらない文書・記録だけの更新とClassic再公開は含めない。配信中に検証失敗、安全境界の拡大、または依頼時の想定を超える外部影響が判明した場合は停止する。
- `Analyze 画面へ最短で直置きすること` と `booking curve core logic を UI、API 取得、storage から分離して再利用可能にすること` が競合する場合は、first wave の進行を大きく遅らせない範囲で後者を優先する。
- `予測モデルを早く表示すること` と `予測評価に使える入力、出力、diagnostics を先に固定すること` が競合する場合は、後者を優先する。
- `rank変更後を部屋タイプごとに1件ずつ振り返ること` と `次の調整時に、どの部屋タイプを何段動かすと個人予約がどの程度変わりそうかを短時間で判断できること` が競合する場合は、後者を優先する。過去eventの個別表示は期待値の根拠を監査する詳細として残し、主導線にはしない。期待値を出す前に、週ブロックなど同じ判断で行った変更を独立事例へ水増しせず、3日後 / 7日後のexactな個人予約観測、再変更による打ち切り、比較可能な据え置き群、事例数と不確実性を確認する。
- `推奨レート金額を出すこと` と `Revenue Assistant の販売 rank 操作単位に合う推奨ランク方向を出すこと` が競合する場合は、first wave では後者を優先する。
- `rank 名のパターンから上下関係を推定すること` と `Revenue Assistant の設定画面で保存された rank 並び順を使うこと` が競合する場合は、設定画面の保存済み順序を優先する。rank 名は、数字系、ローマ字または英字系、記号混在系のいずれもあり得て、同じ表記系でも高低が逆になる運用があるため、名前パターンだけでは企業や施設ごとの上下関係を安全に断定しない。
- `曜日別の販売傾向や競合価格内の自社料金位置を使って rank の上下関係を推定すること` と `設定画面の保存済み順序または利用者の manual override で rank order を確定すること` が競合する場合は、後者を優先する。曜日別関係と競合価格内の自社料金位置は、rank order source ではなく priority、confidence、reasonCodes、diagnostics を補助する入力として扱う。
- `Revenue Assistant への自動反映を早く作ること` と `RM が今日確認すべき作業キューを安全に作ること` が競合する場合は、当面は後者を優先する。
- `利用者が明示選択した複数候補をまとめて調整すること` と `候補ごとの誤選択、送信直前の状態変化、部分失敗を確認できること` が競合する場合は、後者を優先する。一括調整は自動反映と分け、全対象preview、各行の直前再確認、取消、逐次結果、反映確認を送信しない試行で確かめた後に検討する。
- `同じ recommendation を繰り返し表示して見落としを防ぐこと` と `利用者が様子見または対応不要と判断した結果を尊重すること` が競合する場合は、user decision と cooldown を尊重する。

### Non-Goals

- 当面は、RAU で人数 forecast を成立させることを目標にしない。
- 当面は、RAU から Revenue Assistant のレート変更を自動実行することを目標にしない。
- 当面は、RAU の first wave に PMS データ、DWH データ、BCL Python 実装、RAR 同期を必須化しない。
- 当面は、予測モデルの採用、学習済みパラメータの固定、予測評価の合格基準固定を first wave の完了条件にしない。
- 当面は、月次実績画面の custom booking curve を Analyze reference curve より優先しない。
- 選択範囲のrank変更を一括反映することはfirst waveの完了条件にしない。first wave確認後は、利用者が明示選択した範囲に限る一括調整を、自動反映とは別の安全な操作候補として検討する。
