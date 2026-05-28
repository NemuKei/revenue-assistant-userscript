# STATUS

最終更新: 2026-05-28

## Current Task Bundle

- 主対象: Rank Recommendation Bundle は `RAU-RR-01` から `RAU-RR-11` まで完了済み。`RAU-FC-01` から `RAU-FC-05` まで完了済み。`RAU-SALES-02` は docs 設計済み、`RAU-SALES-03` と `RAU-SALES-04` は実装済み。次の Now は `RAU-SALES-05` で、sales / ADR health signal の実データ発火と閾値を確認する。
- 完了済み Task ID:
  - `RAU-RR-01` rank recommendation signal spec を整備する
  - `RAU-RR-02` booking_curve raw source に sales / ADR を保存する
  - `RAU-RR-03` current rank / rank ladder / rank price table の取得可否を browser trace で調査する
  - `RAU-RR-04` トップ料金調整候補リスト UI shell を実装する
  - `RAU-RR-05` reference deviation ベースの初期 priority scoring を実装する
  - `RAU-RR-06` Analyze 遷移・対象 roomGroup focus 導線を実装する
  - `RAU-RR-07` user snooze / dismissed decision と cooldown を保存する
  - `RAU-RR-08` rank change history による resolved 化を実装する
  - `RAU-RR-09` rank response dataset / metrics を設計する
  - `RAU-RR-10` 推奨ランク算出を設計する
  - `RAU-RR-11` bulk apply feasibility を調査する
  - `RAU-FC-01` rooms-only 予測モデルの導入要否を判断する
  - `RAU-FC-02` 予測評価 dataset / metrics と ForecastResult v1 candidate を設計する
  - `RAU-FC-03` forecast evaluation dataset を実装する
  - `RAU-FC-04` first forecast model を pure function として実装する
  - `RAU-FC-05` rank recommendation scoring へ forecast diagnostics を接続する
  - `RAU-SALES-02` booking_curve 売上・ADR adapter と単価・売上予測 model を設計する
  - `RAU-SALES-03` sales / ADR adapter と baseline forecast pure functions を実装する
  - `RAU-SALES-04` sales / ADR health diagnostics を rank recommendation scoring へ段階接続する
- 次スレッドの種別:
  - `mainline-task`
- 次スレッドで参照する正本:
  - `docs/context/STATUS.md`
  - `docs/tasks_backlog.md`
  - `docs/context/DECISIONS.md`
  - `docs/spec_000_overview.md`
  - `docs/spec_002_curve_core.md`
  - `docs/spec_003_rank_recommendation_signal.md`
- 次スレッドの範囲:
  - Rank Recommendation Bundle は、トップ料金調整候補リスト、初期 scoring、Analyze focus、user decision、resolved 化、rank response / recommendedRank / bulk apply の正本化まで完了済みとして扱う。
  - `docs/tasks_backlog.md` の `Now` は `RAU-SALES-05` とする。次は、`RAU-SALES-04` で接続した sales / ADR health signal の実データ発火と閾値を確認する。
  - `RAU-FC-02` では、evaluation dataset の grain、入力、除外条件、未来情報混入防止、metric、`ForecastResult v1 candidate`、rank recommendation impact proxy を `docs/spec_002_curve_core.md` に確定済みである。
  - `RAU-FC-03` では、`src/curveCore.ts` に evaluation case 生成と evaluation result 集計を追加済みである。
  - `RAU-FC-04` では、`src/curveCore.ts` に first forecast model `recent_deviation_adjusted_seasonal:v1` と baseline `seasonal_ratio_baseline:v1` を追加済みである。
  - `RAU-FC-05` では、`booking_curve_raw_source:v2` の roomGroup response から `scope="roomGroup"`、`segment="transient"` の `ForecastResult v1 candidate` を生成し、forecast signal を rank recommendation の priority / confidence 補助へ接続済みである。top list には forecast 数値を表示しない。
  - `RAU-RR-09` では rank response dataset の grain、入力、baseline、result window、欠損 diagnostics を `docs/spec_003_rank_recommendation_signal.md` に定義済みである。
  - `RAU-RR-10` では current rank と rank ladder 候補を使う recommendedRank の条件を定義した。ただし `rank_sequences[].default_sequence` の方向が未確認のため、方向確認までは `recommendedRankDirection` のみを表示する。
  - `RAU-RR-11` では bulk apply を `not-now` と判断した。write endpoint 候補は見えているが、request shape、安全制約、preview、明示選択、反映結果保存、partial failure 保存が未確認または未実装であるため、first phase では button も API 実行も追加しない。
- 次スレッドでやらないこと:
  - 推奨レート金額を出さない。
  - Revenue Assistant への自動反映や選択範囲一括反映を実装しない。
  - 未確認 API を確認済み仕様として扱わない。
  - forecast 数値を top list または Analyze detail へ表示しない。
  - 月次 `/api/v1/booking_curve/monthly` の snapshot read path を、過去 batch の履歴比較や日次差分表示へ広げない。
  - Analyze 日付ページ、競合価格 graph、booking curve warm cache の既存挙動を変更しない。
- 終了条件:
  - `RAU-SALES-05` で、通常 Chrome 上の Revenue Assistant 候補 list と `sales_adr_signal_*` diagnostics の分布を確認する。
  - 閾値を変更する場合は、変更理由、入力、判断、出力を正本文書へ残す。
  - sales / ADR reason は引き続き数値を直接出さず、非数値要約に留める。
  - 未確認 API を確認済み仕様として扱わない。
- subagent 利用方針:
  - 既定では使わない。
  - 使う場合は、browser trace 結果の要約、rank API 候補の read-heavy 調査、既存 raw source contract の棚卸しに限る。
  - 仕様判断、task 分割、最終 verify、正本文書更新はメインスレッドで行う。
- このスレッドで完了したこと:
  - `RAU-RR-01` docs-only 正本化を実施した。`docs/spec_003_rank_recommendation_signal.md` を新規作成し、推奨レート金額ではなく推奨ランク方向を first wave にする理由、トップ候補リスト、user snooze / dismissed、rank response、future bulk apply の非目標と guardrail、未確認 API 調査対象を整理した。
  - 2026-05-27 の追補で、推奨ランク方向、トップ候補リスト、様子見 cooldown、sales / ADR 保存、一括反映の非目標、団体 / 個人分離、小キャパ、forecast との関係を、後続セッションが会話なしで復元できる粒度へ補強した。
  - `docs/spec_000_overview.md`、`docs/context/INTENT.md`、`docs/context/DECISIONS.md`、`docs/tasks_backlog.md` へ、rank recommendation の正本参照、判断原則、判断記録、後続 task bundle を同期した。
  - 2026-05-27 の現状確認で、`/api/v4/booking_curve` response 自体には sales / ADR が含まれる一方、`src/main.ts` の `compactBookingCurveResponse()` が保存前に rooms 系列だけを残していることを確認した。そのため、`RAU-RR-02` を raw source 保存契約の更新 task として最優先に置いた。
  - `RAU-RR-02` は実装済み。`compactBookingCurveResponse()` の保持対象を rooms / sales / ADR fields へ拡張し、保存 schema version を `booking_curve_raw_source:v2` へ上げた。IndexedDB database version は object store と index 構造を変えないため 1 のまま据え置いた。既存 v1 record は同じ DB に残るが、v2 の cache key では読まれず、保存済み raw source signal も v2 record だけを有効扱いにする。
  - 2026-05-28 に、Tampermonkey 側で userscript `0.1.0.235` へ更新済みの通常 Chrome 上で `https://ra.jalan.net/analyze/2026-06-17` を確認した。overall summary 1 件、rank overview 1 件、ホテル全体 booking curve section 1 件、SVG 2 件、室タイプ別 toggle button 6 件を確認した。シングルの room card を開くと、card booking curve section 1 件が追加され、booking curve SVG は合計 4 件になった。console error は 0 件だった。
  - 2026-05-28 に、既存 Chrome profile を `remote-debugging-port=9222` 付きで再起動し、CDP 経由で Revenue Assistant origin の IndexedDB を確認した。`booking_curve_raw_source:v2` record は 192 件あり、全 192 件で `booking_curve[]` 配下の `all`、`transient`、`group` に `this_year_sales_sum`、`last_year_sales_sum`、`two_years_ago_sales_sum`、`three_years_ago_sales_sum`、`this_year_adr`、`last_year_adr` が保持されていた。値は出力していない。`two_years_ago_adr`、`three_years_ago_adr` は観測 record では存在しなかった。
  - 2026-05-28 に、`RAU-RR-03` の Chrome DevTools Protocol read-only 調査を実施した。`/api/v1/suggest/output/current_settings` から `latest_current.price_rank_code` と `latest_current.price_rank_name` を取得できるため、`stayDate x roomGroup` 単位の current rank は確認済みである。`/api/v1/rank_sequences` から `price_rank_code`、`price_rank_name`、`default_sequence` を取得できるため、rank ladder 候補は確認済みである。ただし `default_sequence` の大小が rank 上げ / 下げのどちらに対応するかは未確認である。`/api/v1/plan_master/plan_rank_price` では観測範囲に実価格 field がなかったため、rank price table と現在販売中価格は未確認のまま扱う。write endpoint 候補は bundle 内で見つかったが実行していない。
  - `RAU-RR-04` は実装済み。トップ画面に `stayDate x roomGroup` 単位の料金調整候補リスト shell を追加した。行項目は、優先度、宿泊日、部屋タイプ、現ランク、推奨方向、主要根拠、状態、操作である。`Analyzeで確認` は Analyze URL への導線として表示し、`様子見` と `対応不要` は `RAU-RR-07` で永続保存を実装するまで disabled button として出す。候補生成の初期実装は `src/rankRecommendation.ts` に分離し、current settings の current rank、remaining、max を使う仮 shell 用判定である。reference deviation scoring は `RAU-RR-05` で実装する。
  - `RAU-RR-05` は実装済み。`src/rankRecommendation.ts` の候補生成に、IndexedDB の `booking_curve_raw_source:v2` から読む roomGroup booking curve evidence を接続した。asOfDate 時点の `this_year_room_sum` と、`last_year_room_sum` / `two_years_ago_room_sum` / `three_years_ago_room_sum` の平均を、`all`、`transient`、`group` ごとに比較し、reference 上振れ / 下振れ / 不足を reasonCodes と diagnostics に残す。group が上振れ主因で transient が上振れていない場合は、個人価格 rank の上げ検討を `watch` へ抑制する。reference 欠損は推測で埋めず `reference不足` として表示する。
  - `RAU-RR-06` は実装済み。トップ候補リストの `Analyzeで確認` click 時に `sessionStorage` へ pending focus を保存し、Analyze 表示時に対象 roomGroup の booking curve card を開く状態にして scroll / highlight する。対象が見つからない場合は通常 Analyze 表示を維持し、console warning に診断を出す。Chrome CDP 一時注入確認では、トップ候補から `/analyze/2026-05-28` へ遷移し、pending focus が消え、highlight 1 件が付くことを確認した。
  - `RAU-RR-07` は実装済み。`src/rankRecommendationDecisionStore.ts` に IndexedDB store `revenue-assistant-rank-recommendations` / `rank-recommendation-decisions` を追加し、`stayDate x roomGroup x action x reasonFingerprint` 単位で `snooze` と `dismiss` を保存する。`様子見` は LT 帯に応じた asOfDate 基準 cooldown を持ち、cooldown 中は同じ candidate を list から抑制する。`対応不要` は同じ reasonFingerprint を抑制する。Chrome CDP 一時注入確認では、`様子見` click 後に候補行が 10 件から 9 件になり、検証用 decision record 1 件を作成後に削除した。
  - `RAU-RR-08` は実装済み。トップ候補 list の同期時に表示範囲の `/api/v3/lincoln/suggest/status` を読み、同じ `stayDate x roomGroupId` で asOfDate 以降の rank change がある candidate を active list から外す。Chrome CDP 一時注入確認では、候補リスト表示、`/api/v3/lincoln/suggest/status` request、console error 0 を確認した。
  - `RAU-RR-09` は docs 設計済み。rank response dataset は `facilityId x stayDate x roomGroupId x rankChangeEvent` を grain とし、rank change event、booking_curve raw source v2、reference curve、競合価格 snapshot を接続候補にする。実価格または rank price table が取れるまでは、価格変化率や価格弾力性を出さず、`ランク反応度` として扱う。
  - `RAU-RR-10` は docs 設計済み。current rank は `/api/v1/suggest/output/current_settings`、rank ladder 候補は `/api/v1/rank_sequences` を第一候補にする。ただし `default_sequence` の方向確認までは `recommendedRank` を出さず、`recommendedRankDirection` と日本語表示名を使う。
  - `RAU-RR-11` は feasibility 判断済み。bulk apply は `not-now` とし、first phase では一括反映 button も Revenue Assistant への write API 実行も追加しない。将来検討には、反映直前 current rank 再取得、別 rank change 確認、snoozed / dismissed / cooldown / low confidence / small capacity / group-driven 除外、全件 preview、明示選択、partial failure 保存が必要である。
  - `RAU-FC-01` は docs 判断済み。rooms-only forecast は priority / confidence 改善や rank response baseline として有望だが、未評価のまま forecast model を実装したり UI へ数値表示したりしない。先に `RAU-FC-02` で forecast evaluation dataset / metrics と `ForecastResult v1 candidate` を確定する。
  - `RAU-FC-02` は docs 設計済み。`docs/spec_002_curve_core.md` に、evaluation dataset の grain を `facilityId x targetStayDate x asOfDate x scope x roomGroupId? x segment` とすること、`ForecastResult v1 candidate` の field と diagnostics、`maeRooms` / `smape` / `biasRooms`、rank recommendation impact proxy、`snoozed_by_user` を false positive と誤読しない注意を反映した。
  - `RAU-FC-03` は実装済み。`src/curveCore.ts` に `ForecastResultV1Candidate`、`ForecastEvaluationCase`、`ForecastEvaluationResult`、`buildForecastEvaluationCase()`、`summarizeForecastEvaluationResults()` を追加した。`actualFinalRooms` と `observedPrefix` を分け、未来情報混入防止、`0日前` / `ACT` 分離制約、小キャパ、group-driven diagnostics、`maeRooms` / `smape` / `biasRooms` 集計、rank recommendation impact proxy を扱えるようにした。
  - `RAU-FC-04` は実装済み。`src/curveCore.ts` に `buildRoomsOnlyForecastResult()` を追加し、`recent_deviation_adjusted_seasonal:v1` と `seasonal_ratio_baseline:v1` を `ForecastResultV1Candidate` として返せるようにした。UI、API、storage、rank recommendation scoring へはまだ接続していない。
  - `RAU-FC-05` は完了した。`src/main.ts` で `booking_curve_raw_source:v2` の roomGroup response から forecast signal を作り、`src/rankRecommendation.ts` で priority / confidence 補助へ接続した。`src/curveCore.ts` では live forecast 生成時に `actual_final_missing` だけを blocking missing reason として扱わないようにした。`docs/spec_003_rank_recommendation_signal.md` と `docs/context/DECISIONS.md` に接続契約を同期済みである。
  - `RAU-FC-05` の通常 Chrome 実画面確認では、Chrome DevTools Protocol で Revenue Assistant root `https://ra.jalan.net/` へ build 済み `dist/revenue-assistant-userscript.user.js` を一時注入し、`料金調整候補` heading 1 件、候補 list root 1 件、候補 row 10 件、priority `high` 10 件、action `raise_watch` 10 件、重大な console / page error 0 件を確認した。候補 list 内に forecast 数値 label は表示されていない。現在の実データでは `着地見込み高` / `着地見込み低` の forecast reason は 0 件だったため、forecast reason の実データ表示発火は未確認として別 task 候補に残す。
  - Chrome拡張 backend の capability-only 確認では、この project thread から `browser-client.mjs` が見つからず、Chrome拡張 backend を直接使える状態とは確認できなかった。通常 Chrome の実画面確認は Chrome DevTools Protocol で実施した。
  - 2026-05-28 に Tampermonkey dashboard から Revenue Assistant Userscript を `0.1.0.236` から公開最新 `0.1.0.243` へ更新した。Revenue Assistant top を再読み込みし、実 Tampermonkey 経由で `料金調整候補` heading 1 件、候補 list root 1 件、候補 row 10 件、console error 0 件を Chrome DevTools Protocol で確認した。
  - `RAU-CP-04` は完了。Revenue Assistant 側の競合価格絞り込み後も RAU グラフが標準表より下へ戻るようにした。
  - `RAU-CP-05` は完了。`指定なし` snapshot を継続しつつ、競合価格 tab 起点で `SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の部屋タイプ別 snapshot を追加取得するようにした。
  - `RAU-CP-06` は完了。Analyze open 起点でも、現在開いている宿泊日の `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 snapshot を保存するようにした。
  - `RAU-CP-07` は完了。競合価格 tab 起点で現在 stay_date の保存後、同週、同月の順に background queue で競合価格 snapshot を保存するようにした。
  - `RAU-CP-08` は完了。競合価格 background queue の対象範囲、完了日数、対象日数、現在取得中の stay_date を indicator に表示するようにした。
  - `RAU-CP-09` は完了。競合価格 background queue 実行中に、表示中グラフの対象日と前回データ系列が周辺日程の保存処理で揺れないようにした。
  - `RAU-CP-10` は完了。Analyze 日付ページ遷移直後に競合価格タブを開いた場合でも、日付・施設 cache key・batch date key がそろうまで競合価格タブ要求を短時間保留し、`competitor-tab` source の snapshot 保存とグラフ再描画を開始するようにした。
  - 競合価格グラフの部屋タイプ filter で、`WAYOUSHITSU` / `wayo` 系の raw value を `和洋室` として表示するようにした。保存データの raw value と filter 判定は従来どおり raw value を使う。
  - 競合価格グラフの系列色は、自社の青色と競合施設の色を分離した。競合施設の差し替えで一時的に施設数が 5 件を超えても、追加された競合施設を自社と同じ青色で表示しない。
  - `RAU-SALES-01` は完了。Analyze 日付単位の売上と ADR は既存 `/api/v4/booking_curve` response に含まれることを確認した。
  - 2026-05-27 に、`RAU-RR-02` で raw source 保存契約を v2 へ更新した。
  - `RAU-SALES-02` は docs 設計済み。`docs/spec_002_curve_core.md` に Sales And ADR Extension を追加し、sales / ADR は rooms 用 `CurveInput` へ混ぜず、別 adapter が `SalesAdrObservation` を作る契約にした。ADR は Revenue Assistant の `*_adr` field を第一候補にし、欠損時だけ `sales_sum / room_sum` で計算する。0 室では ADR を推測せず、売上 0 と ADR 0 は欠損と同一視しない。既存 `booking_curve_raw_source:v2` は必要 field を保持しているため、保存単位と IndexedDB schema は追加変更しない。
  - `RAU-SALES-03` は実装済み。`src/curveCore.ts` に `SalesAdrObservation`、`UnitPriceForecastV1Candidate`、`SalesForecastV1Candidate`、`buildSalesAdrInputFromBookingCurveResponses()`、`buildUnitPriceForecastResult()`、`buildSalesForecastResult()` を追加した。UI、API request、IndexedDB schema、rank recommendation scoring には接続していない。
  - `RAU-SALES-04` は実装済み。`src/main.ts` で `booking_curve_raw_source:v2` の roomGroup response から `buildSalesAdrInputFromBookingCurveResponses()` を呼び、`scope="roomGroup"`、`segment="transient"`、`asOfDate` 時点の sales / ADR health signal を rank recommendation evidence に接続した。`src/rankRecommendation.ts` では `adr_down`、`sales_down`、`adr_and_sales_down`、`neutral` を priority / confidence の補助として扱う。top list には sales / ADR 数値、比率、金額を表示しない。Chrome DevTools Protocol 確認では、候補 list 10 行、重大 console / page error 0、forecast 数値 label なし、sales / ADR 数値 label なしを確認した。現在の実データでは sales / ADR reason の発火は 0 件だった。
  - `RAU-MP-01` のコード状態を再確認した。既存実装は `src/monthlyProgress.ts` で `/monthly-progress/YYYY-MM` route を検知し、top / analyze 系同期を停止したうえで月次専用 observer と preview を起動する。
  - 月次 `/api/v1/booking_curve/monthly` は `src/monthlyProgressIndexedDb.ts` で `facilityCacheKey + yearMonth + batchDateKey` ごとに IndexedDB snapshot へ保存する。現在の preview は保存後に `readLatestMonthlyBookingCurveSnapshot()` で読む snapshot-backed read path であり、旧記述の「表示 read path は現行 API response を正とする」は実装状態と一致しない。
  - `RAU-MP-01` では、まず月次実績画面で GUI 確認し、必要なら `src/monthlyProgress.ts` の挿入位置、文言、tooltip、layout だけを最小修正する。
  - 月次カーブのレスポンス改善として、既定の `前年` compare では前年・前々年の月次 snapshot を追加取得しないようにした。`前々年` compare では前年月の snapshot、`3年前` compare では前年月と前々年月の snapshot だけを追加取得する。表示契約、IndexedDB schema、月末 anchor の LT bucket 集約は変更していない。
  - 月次カーブの切替 UX 改善として、compare button と `販売単価 / 売上` button の click 直後に選択状態と更新中 status を表示するようにした。非同期取得が連続した場合は、古い sync 結果を後から描画しない。
  - 月次実績画面を開いた直後に、対象月から未来 4 か月と、現在選択中の compare に必要な比較月の snapshot prefetch を background で開始するようにした。compare 切替時も、選択後の表示に必要な snapshot prefetch を先に開始する。
  - `RAU-MP-01` は GUI 確認済み。利用者が Tampermonkey 更新後に目視確認し、追加で Chrome CDP から `https://ra.jalan.net/monthly-progress/2026-05` を確認した。LT preview root、`LTブッキングカーブ` heading、2 panel、2 SVG、compare button、`販売単価 / 売上` button が存在した。compare click 直後に `比較年を更新中`、`aria-busy=true`、押した年の active 表示を確認した。cache hit では status は短時間で消える。
  - `RAU-WC-08` は GUI 確認済み。トップカレンダーの日付セル下端の booking_curve 取得状態 line を、現在走っている warm cache queue の `done / total` に応じた progress bar 表示へ変更した。Chrome CDP で `calendar-date-2026-05-01` が `partial`、`25 / 77`、progress `32%` として表示されることを確認した。
  - `RAU-WC-09` は GUI 確認済み。取得が走っていない日でも、IndexedDB に同じ施設と stay_date の `/api/v4/booking_curve` raw source が 1 件以上ある場合は、トップカレンダーの日付セル下端中央に短い薄色ラインを出す。現在取得中の progress bar、完了、エラー表示は保存済みシグナルより優先する。Tampermonkey 再読込後、Chrome CDP で marker 92 件、bar 92 件、5/1 の青い進捗 bar、5/2 以降の保存済み bar を確認した。
  - `RAU-WC-10` は GUI 確認済み。保存済みシグナルは、現在 `as_of_date` の raw source がある日を緑の短い線、過去 `as_of_date` の raw source だけがある日を灰色の短い線として分ける。これは raw source の存在を示すものであり、reference source raw source、derived reference curve、同曜日 raw source まで含めた完了を示すものではない。Chrome CDP build 注入では、現在の実データで `stored-current` 91 件、`partial` 1 件を確認した。利用者が Tampermonkey 更新後に GUI 目視確認済み。

## Current State

- RAU の当面の主線は、`レート調整特化 + 人数なしの簡易フォーキャスト` とする。
- rank recommendation の正本は `docs/spec_003_rank_recommendation_signal.md` とする。first wave は、推奨レート金額ではなく推奨ランク方向を中心にした RM 作業キューである。
- トップ画面には、カレンダー badge だけではなく、`stayDate x roomGroup` 単位の料金調整候補リストを追加する方針とした。Analyze 画面は、候補の詳細根拠を確認する場所として扱う。
- user decision は `Analyzeで確認`、`様子見`、`対応不要` を最低限持つ。`様子見` は一時抑制、`対応不要` は同じ reasonFingerprint の再表示抑制と false positive 候補として分ける。
- bulk apply は将来候補だが first phase では非目標である。current rank、rank ladder、rank 反映 endpoint、user decision、cooldown、resolved、dismissed、guardrail が揃うまで実装対象にしない。
- rooms-only forecast は first wave の必須入力にしない。`RAU-FC-01` では、今すぐ forecast model を実装せず、`RAU-FC-02` で evaluation dataset / metrics と `ForecastResult v1 candidate` を先に設計すると判断した。`RAU-FC-02` から `RAU-FC-05` は完了済みである。
- forecast は評価済みで diagnostics が許容できる場合だけ、rank recommendation の priority / confidence 補助として扱う。top list へ forecast 数値を直接表示せず、実装前は Analyze detail にも表示しない。
- core / storage 上の segment 名は `all` / `transient` / `group` を正とする。UI 表示では `transient` を「個人」と呼ぶ場合があるが、spec と保存契約では `transient` を使う。
- Browser API Discovery ルールは `AGENTS.md` と `D-20260514-001` に反映済み。新しい画面、新しいタブ、未調査 API、response shape が不明な API を扱う場合は、実装前に `browser-trace` / `browser-to-api` の利用可否、生成物の保存範囲、Green / Yellow / Red 分類、commit 禁止データを確認する。
- RAR の本格 RMS 実装は一旦保留し、人数データまたは DWH 連携の見通しが立った時点で再開判断する。
- Analyze 日付ページの booking curve Phase 1 は実装済み。
- Phase 1 では、ホテル全体 block と室タイプ別 card に、常時表示の `全体` 系列と、`個人 / 団体` toggle で切り替える second panel を表示する。
- Phase 1 の booking curve は、custom SVG、hover tooltip、capacity 基準 y 軸、rank 変更履歴 marker、未来 stay_date の観測 LT 打ち切り、`ACT` 空表示を含む。
- 現行 current UI では、legacy sales-setting card が無い場合でも synthetic room-type host を生成し、overall summary、rank overview、room-group table、室タイプ別 booking curve を表示できる。
- 月次実績画面の LT 基準 custom booking curve は、Analyze reference curve が一段落するまで優先度を下げる。
- Analyze / 販売設定タブの booking curve warm cache は `/api/v4/booking_curve` raw source を保存している。この API response には室数だけでなく、`this_year_sales_sum`、過去年売上、`this_year_adr`、`last_year_adr` が含まれるため、Analyze 日付単位の売上・ADR 取得元として使える。
- `RAU-RR-02` で、`src/main.ts` の `compactBookingCurveResponse()` は rooms / sales / ADR fields を保持する compact source 作成へ更新済みである。保存 schema version は `booking_curve_raw_source:v2` とし、既存 `booking_curve_raw_source:v1` record は新しい read / write path で読まない。
- `RAU-SALES-01` の Chrome CDP 調査では、2026-04-30 のホテル全体と室タイプ別シングルの両方で `/api/v4/booking_curve` に売上・ADR が含まれることを確認した。月次 `/api/v1/booking_curve/monthly?year_month=202606` は `sales_based` と `room_based` を返すが、予約日基準の月次系列であり、Analyze の stay_date 単位判断では既存 booking curve raw source を優先する。
- `RAU-AF-01` は完了。2026-04-24 時点のログイン済み Revenue Assistant 環境で、`/api/v4/booking_curve` はホテル全体と全 6 室タイプについて、対象 `stay_date` 以外の比較対象日付でも 200 応答を返すことを確認した。
- `/api/v4/booking_curve` の response に `batch-date` は含まれない。`batch-date` は既存の同期文脈または cache key 側で扱う。
- `RAU-AF-02` で置いた first wave の `直近 7 泊日中央値` と `last_year_room_sum` 優先定義は、2026-04-24 の BCL repo 再確認により仮定義として扱う。今後の仕様ターゲットは `D-20260424-005` の BCL-tuned 定義へ差し替える。
- `RAU-AF-03` は UI shell としてコード実装済み。ホテル全体 block と開いた室タイプ card に、`現在 / 直近型 / 季節型` の legend、参考線、個別表示切替を追加した。
- `RAU-AF-03` の算出ロジックは仮定義のため、`RAU-AF-04` 以降で BCL-tuned 算出ロジック、IndexedDB derived cache、request scheduler へ差し替える。
- `RAU-AF-03` の GUI 確認は、Chrome CDP で build 済み `dist` を Analyze 日付ページへ注入して確認済み。Tampermonkey 側で `dist/*.user.js` を正式に再読込しての確認は未実施。
- `docs/spec_002_curve_core.md` を追加し、canonical input / output、reference curve、将来の forecast extension、将来の evaluation extension の正本とした。
- `RAU-AF-04` は実装済み。`src/curveCore.ts` に、canonical input / output、Revenue Assistant booking curve response adapter、`recent_weighted_90`、`seasonal_component`、候補 stay_date 生成、diagnostics を追加した。
- `RAU-AF-04` では UI への接続は行っていない。BCL-tuned reference curve を画面へ接続する前に、`RAU-AF-05` で request scheduler と IndexedDB derived cache を実装する。
- `RAU-AF-05` は実装済み。`src/referenceCurveStore.ts` に、derived reference curve の IndexedDB store、cache key builder、`ReferenceCurveResult` record adapter、in-flight compute dedupe、request-level dedupe、同時 request 数制限 scheduler を追加した。
- `RAU-AF-05` の cache 保持は、TTL ではなく `asOfDate` と `algorithmVersion` を key に含めて分離する。古い key の削除は、保存量または再計算頻度が問題になった時点で別判断とする。
- `RAU-AF-06` はコード接続まで実装済み。既存 UI shell の `現在 / 直近型 / 季節型` に、`src/curveCore.ts` と `src/referenceCurveStore.ts` 由来の BCL-tuned reference curve を接続した。
- `RAU-AF-06` の GUI 確認は、`RAU-AF-07` の raw source cache、360 日表示、非同期補完を含む GUI 確認へ吸収する。
- 2026-04-26 に、reference curve の表示範囲は current と同じ `0〜360日前 + ACT` を目標にする方針へ更新した。旧 first wave の `ACT と 0〜120日前` 限定は、`RAU-AF-07` のコード実装で解除した。
- `0日前` と `ACT` は、値が同じ場合でも別概念として扱う。raw source 保存開始前の過去 stay_date では、API 側で `0日前` が実績確定後の値へ上書きされている場合、本当の `0日前` を後から復元できない。
- `RAU-AF-07` はコード実装済み。`src/bookingCurveRawSourceStore.ts` に `/api/v4/booking_curve` raw source 用 IndexedDB store を追加し、`src/main.ts` の booking curve 取得経路へ接続した。
- `RAU-AF-07` では、reference curve の LT 対象を current と同じ `0〜360日前 + ACT` へ戻した。既存 derived cache との混在を避けるため、`recent_weighted_90` と `seasonal_component` の algorithm version を v2 に上げた。
- `RAU-AF-07` では、ホテル全体と室タイプ別 card の reference curve を初期同期の待ち時間から外し、current curve を先に描画してから reference curve を非同期で補うようにした。
- `RAU-AF-07` では、`ReferenceCurveDiagnostics.actComparison` を追加し、`0日前` と `ACT` の rooms、sourceCount、差分を保存できるようにした。`ACT` が `0日前` より低い場合は warning を追加する。
- 2026-04-26 の GUI 確認で、current が先に表示され、reference curve が後から補完されることを確認した。ホテル全体とシングル card で v2 reference curve が表示され、raw source IndexedDB に 142 件、derived reference curve IndexedDB に 36 件の保存を確認した。
- 同じ確認で、`recent_weighted_90:v2` の `ACT` が `0日前` より低くなる warning を確認した。原因は、直近型 ACT 算出で `as_of_date` 以降の未着地 stay_date を final rooms 候補に含めていたことだったため、`recent_weighted_90:v3` では `stayDate < asOfDate` の履歴だけを ACT final sample に使うよう修正した。
- `recent_weighted_90:v3` 修正後、利用者確認により直近型の `0日前 -> ACT` スパイク解消を確認した。
- 直近型は BCL の `recent90w` 相当で進める。LT ごとに `asOfDate - (90 - LT)` から `asOfDate + LT` までの stay_date window を取り、その window 内の観測値を直近ほど重くして平均する。
- 直近型が 165日前付近など途中の LT から始まる場合があるのは、API取得失敗ではなく、その LT の recent90w window 内に非 null 観測値が不足するためと整理した。
- `RAU-UX-01` は判断済み。`団体` は常時3枚目の panel ではなく、`個人 / 団体` toggle として追加する。競合価格は現在値表を複製せず、価格推移 snapshot として後続候補にする。`直近同曜日カーブ` は既定 OFF の補助線として追加候補にする。
- `RAU-AF-08` はコード実装済み。booking curve の second panel は既定 `個人`、必要時 `団体` に切り替えられる。`団体` 選択時は current、直近型、季節型、rank marker tooltip の対象 segment が `group` になる。toggle 状態は画面内 memory で保持し、Revenue Assistant 側の再描画や本 userscript の再同期では維持する。
- `RAU-AF-09` はコード実装済み。booking curve header に `同曜日` toggle を追加し、既定 OFF にした。ON のときだけ target stay_date の `-14日`、`-7日`、`+7日`、`+14日` の booking curve を取得し、薄いグレーの細い破線で補助線として表示する。ホテル全体 block は ON 時に取得し、室タイプ別 card は開いている card だけ取得する。
- booking_curve warm cache の取得順は部屋タイプ別優先ではなく、近い stay_date からホテル全体と全室タイプを揃える。差分更新は、現在の `as_of_date` で未保存の raw source key だけを取得することとし、同じ key は再取得しない。
- `RAU-WC-01` はコード実装済み。Analyze 日付ページ同期後に warm cache queue を作成し、`today + 0日` から `today + 30日` まで、各 stay_date でホテル全体、全室タイプの順に raw source を保存する。IndexedDB に同じ key がある場合は skip する。初期制限は同時取得 1、request 間隔 2.5 秒以上、1 回最大 5 分とし、右下に取得状況 indicator を表示する。日次合計稼働時間の上限は `RAU-WC-02` で撤廃済み。
- `RAU-WC-02` はコード実装済み。warm cache の起動対象をトップカレンダーにも広げ、indicator で stay_date 単位の完了範囲とクールダウン後の自動再開目安を表示する。日次合計稼働時間の上限は撤廃し、document hidden、連続エラー停止の制限は維持する。
- `RAU-WC-02` では、hidden pause 後に `visibilitychange` が発火しない復帰ケースへ対応するため、`pageshow` と `focus` でも warm cache drain を再開する。
- `RAU-WC-02` の `dist/*.user.js` は `npm run build` で再生成済み。Tampermonkey 再読込後の GUI 目視確認が必要。
- `RAU-WC-03` はコード実装済み。Analyze 日付ページを開いた場合は、開いている stay_date、その週、その月、通常 warm cache 範囲の順に取得を優先する。warm cache の完了定義は current raw source だけではなく、reference source raw source、直近型 derived reference curve、季節型 derived reference curve、同曜日 raw source まで含める。
- `RAU-WC-03` では、indicator に対象月または対象範囲と、Analyze 日付の `raw / 参考線 / 同曜日` 取得率を表示する。`dist/*.user.js` は `npm run build` で再生成済み。Tampermonkey 再読込後の GUI 目視確認が必要。
- `RAU-WC-04` はコード実装済み。request 間隔を 1.0 秒、1 回の自動稼働を 10 分、クールダウンを 3 分へ緩和した。IndexedDB raw source が既存で skip できる task は API request を発行しないため即時に次 task へ進める。
- `RAU-AF-10` はコード実装済み。reference curve の `0日前` は core logic と IndexedDB derived cache では推測補完せず、表示層だけで `1日前` と `ACT` の線形補間値を使う。初期実装では `round(1日前 + (ACT - 1日前) * 0.5)` とし、整数室数に丸める。Tooltip では補間値であることを `（補間）` として明示する。
- `RAU-WC-05` はコード実装済み。warm cache indicator は対象日数だけでなく対象日付範囲を表示し、完了前でも一部取得済みの日付数を `進行 n日` として表示する。トップカレンダーの日付セル下端に、一部取得済み、完了、エラーの line を表示する。
- `RAU-WC-06` はコード実装済み。warm cache の通常対象を `as_of_date - 1日` から `as_of_date + 3か月` までへ広げ、failed task の最大 2 回 retry、Analyze 日付ページを開いたときの優先 queue 再開を追加した。
- `RAU-WC-08` は GUI 確認済み。トップカレンダーの一部取得済み line は固定幅ではなく、現在 queue の `raw / reference / sameWeekday` 合計進捗に応じた幅で表示する。完了は緑の全幅、エラーは赤の全幅とする。Tampermonkey 再読込後、Chrome CDP で `calendar-date-2026-05-01` の marker state、title、progress custom property を確認した。
- `RAU-WC-09` は GUI 確認済み。表示中のトップカレンダー日付を対象に IndexedDB raw source をまとめて読み、現在 queue の対象でない保存済み日付へ短い薄色ラインを出す。保存済みシグナルは progress 表示を上書きしない。Tampermonkey 再読込後、Chrome CDP で marker と bar の DOM、bar 幅、日付セルの `position: absolute` 維持を確認した。
- `RAU-WC-10` は GUI 確認済み。保存済み raw source の `asOfDate` が現在 batch date と一致する場合は `stored-current`、過去 `asOfDate` の raw source だけがある場合は `stored-past` として表示する。現在取得中の `partial`、`complete`、`error` 表示は引き続き保存済みシグナルより優先する。Chrome CDP build 注入では `stored-current` の緑 line と title `booking_curve 現在基準の保存済みデータあり` を確認した。現在の実データには `stored-past` 該当日がなかったため、過去基準だけの見た目はコード経路の verify まで。利用者が Tampermonkey 更新後に GUI 目視確認済み。
- `RAU-CP-01` は完了。2026-04-30 に Chrome CDP で Analyze 日付ページの Network request を確認し、`GET /api/v5/competitor_prices` が競合価格 endpoint であることを確認した。
- `/api/v5/competitor_prices` には `x-requested-with: XMLHttpRequest` が必要で、query には少なくとも `date`、`min_num_guests`、`max_num_guests`、`yad_nos[]` が必要である。`1〜6名 / 食事条件指定なし` は取得できるが、競合施設一覧なしの広い取得は `400 BAD_REQUEST` になる。
- `/api/v5/competitor_prices` の response は `own` と `competitors` を持つ。plan は人数、食事条件、プラン名、じゃらん部屋タイプ、URL、価格、自社価格との差分を持つが、在庫状態、販売停止、満室、ページング情報は持たない。
- `RAU-CP-02` はコード実装済み。`src/competitorPriceSnapshotStore.ts` に competitor price snapshot の IndexedDB store、request builder、response adapter、同じ検索条件 signature の最新 snapshot read path を追加した。
- `RAU-CP-02` では、Analyze 日付ページ同期時に、同じ施設、stay_date、batch date につき 1 回だけ snapshot 保存を試す。競合価格 UI と warm cache 接続は実装していない。
- `RAU-CP-03` はコード実装済み。保存済み snapshot を使い、販売設定タブではなく競合価格タブ内の標準表より下に、`1名`、`2名`、`3名`、`4名` の人数別最安値グラフを縦 4 ブロックで表示する。部屋タイプと食事条件は toggle button の簡易絞り込みとして扱い、部屋タイプ名は `シングル`、`ダブル`、`ツイン`、`トリプル` などのカタカナ表記へ寄せる。グラフ Tooltip では取得日ごとの施設別最安値と前回差分を表示する。indicator には競合価格 snapshot の状態を表示し、詳細を折りたためる最小化 button を持たせる。競合価格 tab を開いた場合は現在開いている stay_date の snapshot 取得を優先する。
- `RAU-CP-03` の GUI 確認は、Chrome CDP で build 済み `dist` を Analyze 日付ページへ注入して確認済み。2026-05-01 に `競合価格 -> 販売設定 -> 競合価格` と遷移した場合でも、2 回目の競合価格タブで `競合価格 最安値推移` が 1 セクション、4 panel、4 SVG で再表示されることを確認した。同じ日に、2日分の競合価格グラフが旧表示の `54〜736` 両端配置ではなく、`315〜475` の短い中央寄せ幅で表示されることを確認した。人数別グラフ panel の枠線、縦軸補助目盛り、補助線、Tooltip 表形式、補助線の横幅いっぱい表示は、Tampermonkey 正式再読込後の利用者確認まで完了した。
- 2026-05-01 の追加調査で、`/api/v5/competitor_prices` は `jalan_room_types[]=TWIN` のような単独部屋タイプ指定を受け付けることを Chrome CDP で確認した。指定なし response では返らない TWIN plan が、TWIN 単独指定では返った。複数部屋タイプ同時指定は各部屋タイプを網羅せず、指定集合内の最安値寄りに絞られるため、部屋タイプ別 snapshot は単独 request として扱う。ただし、`指定なし` response には `SEMI_DOUBLE` や raw room type が空のその他相当 plan が最安値として含まれる場合があるため、`指定なし` snapshot は継続して保存する。
- `RAU-CP-04` はコード実装済み。Analyze 日付ページ内の click 後と、MutationObserver が DOM 変化を検知したが calendar sync signature が変わらない場合に、競合価格グラフの配置修復を予約するようにした。Revenue Assistant 標準表が後から追加された場合でも、保存済み state から `renderCompetitorPriceOverviewFromState()` を再実行し、RAU セクションを同じ親要素の末尾へ戻す。
- `RAU-CP-05` はコード実装済み。`指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 snapshot を保存できるようにし、指定なし表示では `指定なし` snapshot を優先し、部屋タイプ toggle 選択時は対応する `jalan_room_types[]` snapshot を優先する。Tooltip には、施設名、部屋タイプ、価格、前回差分を表示する。
- `RAU-CP-06` はコード実装済み。Analyze open 起点でも競合価格 tab 起点と同じ 6 snapshot を保存し、現在開いている宿泊日の競合価格 snapshot 粒度を揃える。同週、同月、直近 30 日への queue 拡張は、request 数、booking curve warm cache との優先順位、停止条件を別途設計してから行う。
- `RAU-CP-07` はコード実装済み。競合価格 tab 起点で現在 stay_date の 6 snapshot を保存した後、同じ Analyze 日付ページを表示している間だけ、同週、同月の順に background queue で競合価格 snapshot を保存する。background queue は booking curve warm cache queue と分離し、document hidden、別 Analyze 日付への遷移、batch date や facility cache key の変更時は停止する。直近 30 日への拡張は未実装。
- `RAU-CP-08` はコード実装済み。Indicator は競合価格 background queue について、`周辺日程取得中 n / m日`、対象範囲、現在取得中の stay_date、完了日数を表示する。Analyze 日付変更や Analyze 外への遷移では、古い background queue と進捗表示を reset する。
- `RAU-CP-09` はコード実装済み。background queue からの競合価格 snapshot 保存では indicator の進捗だけを更新し、表示中グラフの `competitorPriceSnapshotUiState` は更新しない。これにより、周辺日程保存中に競合価格グラフの対象日や前回データ系列が一時的に切り替わらない。
- `RAU-CP-10` はコード実装済み。競合価格タブ click 時点で Analyze 日付、施設 cache key、batch date key のいずれかが未確定でも要求を破棄せず、短時間の再試行で context 確定後に `competitor-tab` source の snapshot 保存と保存済み系列の読み直しを実行する。2026-05-02 に Chrome CDP で `2026-06-22` の Analyze 日付ページを約 5 秒開いたあと `2026-06-23` へ移動し、競合価格タブ click 後に `/api/v5/competitor_prices` request、indicator の競合価格進捗、`競合価格 最安値推移`、4 件の SVG 表示を確認した。
- `RAU-WC-07` はコード実装済み。2026-04-30 の GUI 確認で既存 booking curve localStorage 書き込みの `QuotaExceededError` が出たため、競合価格表示の次に保存量整理を行った。Chrome CDP 確認では、localStorage 全体約 5.18 MB のうち、booking curve localStorage key 36 件が約 5.16 MB を占めていた。
- `RAU-WC-07` の実装では、`src/main.ts` の booking curve 取得経路から localStorage persistent cache の読み込みと書き込みを外し、既存 key は `revenue-assistant:group-room-count:v4:<facility>:booking-curve:` の facility prefix に限定して削除する。IndexedDB raw source、derived reference curve、競合価格 snapshot は削除対象にしない。
- Tampermonkey 側を `a4c4cc9` の build に更新後、Chrome CDP で Analyze 日付ページ `https://ra.jalan.net/analyze/2026-06-17` を再読み込みして確認した。localStorage の booking-curve key は 0 件、booking-curve bytes は 0 のまま維持された。販売設定タブ内では group rows 6 件、overall summary 1 件、rank overview 1 件、booking curve section 1 件、booking curve SVG 2 件を確認した。`QuotaExceededError` は再発していない。
- 月次実績画面 `/monthly-progress/YYYY-MM` は、既存 top / analyze の同期系から切り離す route-scoped scaffold を追加済みである。monthly-progress 側は専用 storage namespace と kill switch `localStorage["revenue-assistant:feature:monthly-progress:enabled"] = "0"` を持つ。
- 月次 `/api/v1/booking_curve/monthly` の response は、`facilityCacheKey + yearMonth + batchDateKey` ごとの IndexedDB snapshot として保存している。現在の preview は、同じ batch date の snapshot がなければ API 取得して保存し、その後 `readLatestMonthlyBookingCurveSnapshot()` で保存済み snapshot を読む。過去 batch の履歴比較や日次差分表示にはまだ使っていない。
- 月次実績画面には、予約日基準 chart 直下へ month-end anchor の LT bucket 集約 preview chart を独立 section として差し込んでいる。現在の preview は、`販売客室数` panel、`販売単価 / 売上` 切替 panel、対象月から未来 4 か月の同時表示、`前年 / 前々年 / 3年前` compare 切替、hover tooltip を持つ。snapshot 取得は選択中 compare に必要な月へ限定する。画面 open と compare 切替の直後に必要 snapshot の prefetch を開始し、切替 click 後は更新中 status を表示し、古い非同期結果の後戻り描画を抑止する。
- 月次実績画面 `RAU-MP-01` は GUI 確認済みのため、次スレッドの主対象にしない。月次の過去 batch 履歴比較、日次差分表示、表示密度の追加調整は、利用者が必要性を再確認した場合に別 task として切る。

## Next Re-entry

最初に読む正本:

1. `AGENTS.md`
2. `docs/context/STATUS.md`
3. `docs/tasks_backlog.md`
4. `docs/context/INTENT.md`
5. `docs/context/DECISIONS.md`
6. `docs/spec_000_overview.md`
7. `docs/spec_001_analyze_expansion.md`
8. `docs/spec_002_curve_core.md`
9. `docs/spec_003_rank_recommendation_signal.md`

最初にやること:

1. `docs/tasks_backlog.md` の `Now` にある `RAU-SALES-05` を確認し、通常 Chrome 上の候補 list で `sales_adr_signal_*` diagnostics の分布を確認する。
2. sales / ADR health signal が発火している場合は、表示文言が非数値要約として読めるかを確認する。
3. 初期閾値を変更する場合は、変更理由、入力、判断、出力を `docs/spec_003_rank_recommendation_signal.md` と `docs/context/DECISIONS.md` へ残す。
4. Rank Recommendation Bundle に戻る場合は、forecast 数値を top list へ直接表示しない契約と、`rank_sequences[].default_sequence` の方向、rank price table、write endpoint request shape を未確認のまま実装済み仕様として扱わない契約を維持する。

変更しない契約:

- 人数 forecast は扱わない。
- PMS データ、BCL Python 実装、RAR 同期、外部 DB を first wave の前提にしない。
- 推奨レート金額を first phase で出さない。
- Revenue Assistant への自動反映や選択範囲一括反映は first phase で扱わない。
- 未確認 API を確認済み仕様として扱わない。
- forecast 数値を top list または Analyze detail へ直接表示しない。forecast signal は priority / confidence 補助としてのみ扱う。
- sales / ADR 数値、比率、金額を top list へ直接表示しない。sales / ADR health signal は priority / confidence 補助としてのみ扱う。
- 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示、current-ui supplement portal を壊さない。
- `dist/*.user.js` は手編集しない。
- 室タイプ別 reference curve の追加取得は、初期画面表示時に全室タイプ分を一括で先読みしない。
- warm cache は、表示同期の待ち時間に入れず、低優先度 queue として時間制限つきで進める。
- 旧 `直近 7 泊日中央値` と `last_year_room_sum` 優先ロジックへ、データ不足時に暗黙 fallback しない。
- raw source 保存開始前の過去 stay_date について、本当の `0日前` を推測で復元しない。

## Verify / Confirmation State

- docs-only の再開準備では、`git diff --check` と正本参照の整合確認を最小 verify とする。
- 実装に入る場合の最小 verify は `npm run typecheck`、`npm run lint`、`npm run build` とする。
- GUI まで触る場合は、Tampermonkey 側で `dist/*.user.js` を再読込してから Analyze 日付ページで確認する。
- 2026-05-27 の rank recommendation docs 整備:
  - 当時の再開入口は `RAU-RR-02`。
  - docs-only のため、最小 verify は `git diff --check` と docs 差分確認とする。
  - コード、package、`dist/*.user.js` は変更しない。
- 2026-05-27 の `RAU-RR-02` code 実装:
  - 現在の再開入口は `RAU-RR-03`。
  - `compactBookingCurveResponse()` の保持対象を rooms / sales / ADR fields へ拡張した。
  - 保存 schema version は `booking_curve_raw_source:v2`、IndexedDB database version は 1 のまま据え置きである。
  - `git diff --check`: passed
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内では esbuild が workspace path を読めず失敗したため、同じ command を通常権限で再実行して通過した
  - GUI 確認: 2026-05-28 に Tampermonkey `0.1.0.235` を入れた通常 Chrome の Revenue Assistant で確認した。Analyze 日付ページ `https://ra.jalan.net/analyze/2026-06-17` で、overall summary、rank overview、ホテル全体 booking curve 2 SVG、室タイプ別 toggle、シングル card booking curve 2 SVG の表示を確認し、console error は 0 件だった。
  - IndexedDB 保存確認: 2026-05-28 に CDP で Revenue Assistant origin の IndexedDB を確認した。`booking_curve_raw_source:v2` record 192 件すべてで、`booking_curve[]` 配下の `all`、`transient`、`group` に sales / ADR の確認済み field が保存されていた。確認対象 field は `this_year_sales_sum`、`last_year_sales_sum`、`two_years_ago_sales_sum`、`three_years_ago_sales_sum`、`this_year_adr`、`last_year_adr` である。値は出力していない。`two_years_ago_adr`、`three_years_ago_adr` は optional 許容のみで、今回の観測 record には存在しなかった。
- 2026-05-02 のスレッド移行前 docs 整備:
  - 当時の再開入口は `RAU-FC-01`。
  - 競合価格、月次実績、warm cache calendar marker は直近の修正と GUI 確認まで完了扱い。
  - この docs 整備は docs-only のため、`git diff --check` と正本間の手動整合確認を最小 verify とする。
- 直近のコード savepoint:
  - `d50c1cb fix: localize wayoushitsu room type label`
  - `5b1a98f fix: retry competitor tab snapshot after analyze transition`
- GUI 確認時の対象:
  - Analyze 日付ページの販売設定タブ
  - ホテル全体 booking curve block
  - 室タイプ別 booking curve card
  - rank marker tooltip
  - current-ui supplement portal、overall summary、rank overview、room-group table
- 2026-04-24 のコード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - Chrome CDP 注入 GUI 確認: ホテル全体 block、開いた室タイプ card、reference curve legend、破線の参考線、`季節型` toggle は確認済み
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-25 の `RAU-AF-06` コード接続 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run chrome:pages`: CDP 接続は成功。open pages は root と Tampermonkey dashboard
  - Analyze 日付ページ GUI 確認: 未実施
- 2026-04-26 の `RAU-AF-07` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run chrome:pages`: CDP 接続は成功。open pages は Tampermonkey dashboard と Analyze 日付ページ
  - Analyze 日付ページ GUI 確認: Tampermonkey 再読込後、current 先行表示、reference curve 非同期補完、360 日 reference curve、IndexedDB 保存件数を確認
  - `recent_weighted_90:v3` 修正後の Tampermonkey 再読込 GUI 確認: 利用者確認により `0日前 -> ACT` スパイク解消を確認
- 2026-04-26 の `RAU-AF-08` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run chrome:pages`: CDP 接続は成功。open pages は Tampermonkey dashboard と Analyze 日付ページ
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-26 の `RAU-AF-09` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-26 の `RAU-WC-01` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 実ブラウザ上で request 間隔、skip、hidden pause の挙動確認: 未実施
- 2026-04-29 の `RAU-WC-02` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - `npm run chrome:pages`: passed。open pages は Tampermonkey dashboard、chrome-error tab、Revenue Assistant root
  - トップカレンダー GUI 確認: indicator 表示と取得開始は確認済み。表示は `データ取得: 取得中 0 / 31日`、詳細は `完了 なし / 保存 5 / skip 1 / 今日 0/30分` だった。日次上限撤廃後は `今日 x/30分` を表示しない。
  - hidden pause 復帰補正: `pageshow` と `focus` でも warm cache drain を再開する修正を追加し、`npm run typecheck`、`npm run lint`、`npm run build` は再通過
  - 日次合計稼働時間の上限撤廃後、`npm run typecheck`、`npm run lint`、`npm run build` は再通過
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 実ブラウザ上でトップカレンダー表示中の indicator、日付単位完了範囲、クールダウン後自動再開の確認: 未実施
- 2026-04-29 の `RAU-WC-03` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - Analyze 日付ページで、その日、同週、同月の順に取得が優先されること: 未実施
  - Indicator の `raw / 参考線 / 同曜日` 取得率が実データに応じて進むこと: 未実施
- 2026-04-29 の `RAU-WC-04` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-29 の `RAU-AF-10` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 実データで `0日前` Tooltip に `（補間）` が表示されること: 未実施
- 2026-04-29 の `RAU-WC-05` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - トップカレンダー上で一部取得済み、完了、エラー line が実データに応じて表示されること: 未実施
- 2026-04-29 の `RAU-WC-06` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 通常対象が `as_of_date - 1日` から `as_of_date + 3か月` までになること: 未実施
  - retry 発生時に `再試行待ち n` が表示されること: 未実施
  - トップカレンダー cooldown 中に Analyze 日付ページを開いたとき priority queue が動き始めること: 未実施
- 2026-04-30 の `RAU-CP-01` Chrome CDP 調査:
  - `npm run chrome:pages`: passed。open pages は Tampermonkey dashboard と Revenue Assistant root
  - Analyze 日付ページ `https://ra.jalan.net/analyze/2026-04-30` を開き、Network request を確認
  - `GET /api/v5/competitor_prices`、`GET /api/v2/competitors`、`GET /api/v2/competitors_filter_settings` を確認
  - `x-requested-with: XMLHttpRequest` 付きの同一 origin fetch で、保存条件あり、食事条件省略、plan name 検索 flag 省略、1名のみ、競合施設一覧なし、宿泊人数範囲なし、`date` のみ、`max_num_guests=10` を比較
  - `docs/spec_001_analyze_expansion.md`、`docs/context/DECISIONS.md`、`docs/tasks_backlog.md` を更新
- 2026-04-30 の `RAU-CP-02` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。初回は sandbox 内で esbuild spawn が `EPERM` になったため、権限許可後に再実行して通過
  - `git diff --check`: passed
  - Tampermonkey 更新後の GUI 確認: passed。Analyze 日付ページ `https://ra.jalan.net/analyze/2026-04-30` で確認
  - RAU 側の `/api/v5/competitor_prices?date=20260430&min_num_guests=1&max_num_guests=6&yad_nos[]=...`: `200`
  - IndexedDB `revenue-assistant-competitor-price-snapshots` / `competitor-price-snapshots`: snapshot 2 件。最新 snapshot は `facilityId=yad:358180`、`stayDate=20260430`、競合施設 5 件、自社 plan 6 件、競合 plan hotel 5 件
  - 同じ検索条件 signature の前回 snapshot 取得: passed。console log の `competitor price snapshot stored` で `previousFetchedAt=2026-04-30T02:10:25.817Z` を確認
- 2026-04-30 の `RAU-CP-03` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
  - Chrome CDP build 注入 GUI 確認: passed。競合価格 tab 内に `競合価格 最安値推移` が 1 セクション表示され、`1名`、`2名`、`3名`、`4名` の 4 panel が縦 4 ブロックで表示されることを確認
  - 競合価格 filter GUI 確認: passed。部屋タイプと食事条件の pull-down が 0 件になり、toggle button として表示されることを確認。部屋タイプ toggle は `シングル`、`ダブル`、`ツイン`、`トリプル` のカタカナ表記で重複なく表示されることを確認
  - 競合価格 Tooltip GUI 確認: passed。取得日軸 hover で Tooltip が表示され、施設別最安値と前回差分欄が表示されることを確認
  - indicator 最小化 GUI 確認: passed。`最小化` button で詳細表示が非表示になることを確認。Tampermonkey 正式再読込後の利用者確認で、人数別グラフ panel の枠線、縦軸補助目盛り、補助線、Tooltip 表形式、補助線の横幅いっぱい表示が反映されることを確認
  - 販売設定 tab GUI 確認: passed。販売設定 tab に戻ったとき、RAU の競合価格セクションが 0 件になることを確認
  - 競合価格 tab 限定表示の回帰確認: passed。2026-05-14 の Analyze 日付ページで販売設定 tab 下部に `競合価格 最安値推移` が割り込まないこと、2026-04-30 の競合価格 tab 本文では `競合価格 最安値推移` が 1 セクション、4 panel で表示されることを Chrome CDP build 注入で確認
  - Tampermonkey 正式再読込後の GUI 目視確認: passed。人数別グラフ panel の枠線、縦軸補助目盛り、補助線、Tooltip 表形式、補助線の横幅いっぱい表示を利用者確認済み
  - RAU-CP-04 Chrome CDP build 注入 GUI 確認: passed。`https://ra.jalan.net/analyze/2026-06-17` の競合価格 tab で、RAU セクションの後ろに標準表の後続再描画を模した test node を追加し、2.3 秒後に RAU セクションが親要素の末尾へ戻ることを確認
  - RAU-CP-05 Chrome CDP build 注入 GUI 確認: passed。`https://ra.jalan.net/analyze/2026-06-17` の競合価格 tab を開いたとき、`/api/v5/competitor_prices` の request に `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` が含まれることを確認。console log で `storedCount: 6` を確認
  - RAU-CP-06 Chrome CDP build 注入 GUI 確認: passed。`https://ra.jalan.net/analyze/2026-06-19` の Analyze open 起点で、`/api/v5/competitor_prices` の request に `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` が含まれることを確認。console log で最新注入分の `storedCount: 6` を確認
  - RAU-CP-07 Chrome CDP build 注入 GUI 確認: passed。`https://ra.jalan.net/analyze/2026-06-20` の競合価格 tab 起点で、現在 stay_date の保存後に `20260614`、`20260615`、`20260616` の background request が発行されることを確認。先頭の background 日付 `20260614` では `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 request を確認
  - RAU-CP-08 Chrome CDP build 注入 GUI 確認: passed。`https://ra.jalan.net/analyze/2026-06-22` の競合価格 tab 起点で、indicator に `競合価格: 周辺日程取得中 0 / 29日`、対象範囲 `2026-06-01〜2026-06-30`、現在取得中の stay_date `2026-06-21`、完了日数 `0 / 29日` が表示されることを確認
  - RAU-CP-09 Chrome CDP build 注入 GUI 確認: passed。`https://ra.jalan.net/analyze/2026-06-23` の競合価格 tab 起点で、indicator が `競合価格: 周辺日程取得中` の間も、競合価格グラフ meta の `対象宿泊日 2026-06-23` が周辺日程へ切り替わらないことを確認
  - RAU-CP-10 Chrome CDP build 注入 GUI 確認: passed。`https://ra.jalan.net/analyze/2026-06-22` を約 5 秒開いたあと `https://ra.jalan.net/analyze/2026-06-23` へ移動し、競合価格タブ click 後に `/api/v5/competitor_prices` request、indicator の競合価格進捗、`競合価格 最安値推移`、4 件の SVG 表示を確認
  - 競合価格グラフ系列色の Tampermonkey 正式再読込後 GUI 目視確認: passed。`2026-06-17` の競合価格 tab で、競合施設の差し替えにより一時的に競合数が 5 件を超える状態でも、追加された競合施設が自社と同じ青色で表示されないことを利用者確認済み

## Open Questions / Risks

- current rank と rank ladder 候補は `RAU-RR-03` で確認済みである。ただし `rank_sequences[].default_sequence` の大小が rank 上げ / 下げのどちらに対応するか、rank 別価格表、現在販売中価格、rank 反映 API の request shape、安全制約、権限差、error response、partial failure、同時更新時の挙動は未確認である。
- rank recommendation first phase では推奨レート金額を出さない。金額推奨を行うには、プラン別、人数別、食事条件別、販売中価格、rank ladder、競合価格、施設方針の確認が必要であり、現時点では未確認項目が多い。
- top 料金調整候補リストは実装済みで、warm cache marker、保存済み raw source signal、団体室数表示、最終変更表示とは別の list layer として表示する。今後追加 UI を行う場合も、これらの意味を混同しない。
- user snooze / 対応不要の browser-local 保存は実装済みである。今後の改善では、priority / confidence / reasonFingerprint 変化時の再表示条件を、実データで false positive と見直し候補を分けながら調整する必要がある。
- `booking_curve_raw_source:v2` は、次回 API 取得時に作成される。既存 `booking_curve_raw_source:v1` record は同じ IndexedDB に残るが、v2 の cache key と保存済み raw source signal では有効扱いにしないため、過去に保存済みだった日付でも v2 record が作られるまでは保存済み signal が出ない場合がある。
- BCL-tuned `直近型カーブ` は、同じ曜日の履歴 stay_date を LT ごとに集計するため、仮実装より request 数が増える。
- BCL-tuned `季節型カーブ` は、前年同月と 2 年前同月の同じ曜日の履歴 stay_date から final rooms と LT 比率を解決する必要がある。Revenue Assistant response だけで final rooms を常に解決できるかは実装中に確認する。
- derived reference curve の IndexedDB 保持は、初期実装では `algorithmVersion` と `asOfDate` を key に含めて分離する。TTL や古い key の削除はまだ実装しない。
- reference curve を初期表示で見せるため、表示密度が上がる。`直近型カーブ` と `季節型カーブ` の個別表示切替で緩和する。
- 予測モデルと予測評価は将来候補として視野に入れる。まず `RAU-AF-04` では、forecast / evaluation が後で使える input、output、diagnostics を壊さない形で core logic を作る。
- `RAU-AF-08` では、`個人 / 団体` toggle を chart header に追加した。既存の `直近型 / 季節型` toggle と役割が混ざらないかは Tampermonkey 再読込後の GUI 目視で確認する必要がある。
- 現行コードでは `recent_weighted_90` の `ACT` は `as_of_date` より前に宿泊済みの履歴 stay_date から final rooms 相当を作り、`seasonal_component` の `ACT` は final rooms 推定値から作っている。`0日前` と `ACT` の段差が不自然に見える場合は、`actComparison`、source stay_date の混在、segment 解決、Revenue Assistant API の過去 point 上書き仕様を切り分ける必要がある。
- `RAU-AF-09` の直近同曜日カーブは線の本数を増やすため、既定 OFF とし、薄いグレー破線で視覚優先度を下げる。Tampermonkey 再読込後、ON/OFF、hover 表示、室タイプ別 card を開いたときの追加取得を GUI 目視で確認する必要がある。
- `RAU-WC-01` では、API 負荷と IndexedDB 保存量が増えるため、同時取得 1、request 間隔、1 回稼働時間、1 日稼働時間、hidden 時の一時停止、連続エラー停止を verify 対象にする。
- 競合価格 snapshot は、競合施設一覧なしの全件取得を前提にしない。
- 検索条件 signature が違う競合価格 snapshot を同じ推移系列として扱わない。
- 競合施設を入れ替えても、過去 snapshot の競合施設名と `yad_no` を現在の競合施設一覧で上書きしない。
- 競合価格 response だけで、在庫状態、販売停止、満室を確定した扱いにしない。
- `RAU-CP-03` は Tampermonkey 正式再読込後の利用者確認まで完了している。今後の競合価格改善は、追加 UI 調整または保存済み snapshot の表示密度改善として別 task 化する。
- 競合価格の部屋タイプ別 snapshot は `RAU-CP-05` で実装済み。ただし、`SEMI_DOUBLE` と raw room type が空のその他相当 plan を保持するため、従来の `指定なし` snapshot は廃止しない。
- 競合価格の部屋タイプ表示名は、日本語表記へ寄せる。`WAYOUSHITSU` / `wayo` 系 raw value は `和洋室` と表示する。保存データの raw value と filter 判定は raw value のまま維持する。
- 2026-04-30 の GUI 確認中に出た booking curve の localStorage persistent cache 書き込み `QuotaExceededError` は、`RAU-WC-07` で localStorage booking curve response cache を廃止して整理済み。再発した場合は、IndexedDB 保存量、group-room result cache、別 namespace の localStorage key を切り分ける。

## References

- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- Curve core 仕様: `docs/spec_002_curve_core.md`
- Rank recommendation 仕様: `docs/spec_003_rank_recommendation_signal.md`
- 残タスク: `docs/tasks_backlog.md`
