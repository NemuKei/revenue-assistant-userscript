# STATUS

最終更新: 2026-04-20

## Done

- userscript の TypeScript 開発基盤、build、lint、typecheck を整備済み
- Chrome remote debugging 用スクリプトと CDP 接続スクリプトを配置済み
- analyze 日付ページの月次カレンダー各セルへ団体室数を表示する拡張を実装済み
- カレンダー上の団体室数表示の visible / hidden 切替トグルを実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の `1日前差分 / 7日前差分 / 30日前差分` を表示する拡張を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の団体室数と `1日前差分 / 7日前差分 / 30日前差分` を表示する拡張を実装済み
- 販売設定タブの室タイプ別 `1日前差分 / 7日前差分 / 30日前差分` は、Phase 1 では `/api/v4/booking_curve` の室タイプ別 `all.this_year_room_sum` を正として維持する判断を確定済み
- analyze 日付ページの販売設定タブ最上段で、全体販売室数サマリーと全体団体室数サマリーを 2 行で表示する拡張を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の `最終変更 何日前 / ランク A→B / 増減` を俯瞰できる rank overview を追加済み
- analyze 日付ページの販売設定タブの rank overview `増減` 列は、値ずれしない配置へ補正済み
- トップカレンダー各日付セルの最下部へ、販売ランク最終変更の相対日数を表示する拡張を追加済みで、analyze 画面では非表示を維持する構成へ更新済み
- トップカレンダーの `◯日前` 表示は、既存 indicator flow に混ぜず、日付セル anchor 直下の overlay として配置する構成へ更新済み
- analyze 日付ページの販売設定タブで、各室タイプカードの `最終変更履歴` の下へ `ランク：A→B` を表示する拡張を追加済み
- analyze 日付ページの販売設定タブ最上段に、ホテル全体 booking curve の常時展開 block を追加済み
- analyze 日付ページの販売設定タブで、各室タイプ card ごとに booking curve 開閉 UI を追加済み
- booking curve のグラフ描画は custom SVG ベースで実装済みで、hover tooltip、capacity 基準 y 軸、横軸ラベルの優先表示を含む
- booking curve グラフは `/api/v4/booking_curve` の LT 実系列へ接続済みで、全体 block と各室タイプ card の `全体 / 個人` を実データで描画する構成へ更新済み
- booking curve Phase 1 の current 値は `batch-date` 以前の最新非 null を維持し、`ACT` tick は `batch-date` の実点がある場合だけ表示する構成へ更新済み
- 室タイプ別 booking curve へ rank 変更履歴 marker を重ねる仕様を、`小さな丸 marker / 同日複数変更は最後の 1 件 / tooltip で詳細表示` で確定済み
- 室タイプ別 booking curve へ rank 変更履歴 marker を重ねる実装を追加済みで、`/api/v3/lincoln/suggest/status` の履歴を card ごとに小さな丸 marker と tooltip で表示する構成へ更新済み
- booking curve tooltip は point 詳細と rank 変更履歴を 1 つへ統合し、line hover 側でも同区間の rank marker 情報を表示し、hover / focus を外したら閉じる構成へ更新済み
- 未着地 stay_date の booking curve は観測 LT 以降を null として扱い、当日を含めて `ACT` まで線を延ばさない構成へ更新済み
- booking curve の y 軸は整数メモリになるよう上限値を丸め、実容量の満室ラインを別線で描画する構成へ更新済み
- booking curve の結果を `最終データ更新` 日付と施設単位で分離して `localStorage` へキャッシュする構成へ更新済み
- 起動時、ページ復帰時、フォーカス復帰時に団体系の整合チェックを行い、異常時は group 系キャッシュを破棄して再同期する構成へ更新済み
- 2026-04-18 時点で、当日 `ACT` 空表示、未来 stay_date の観測 LT 打ち切り、販売室数差分の data source、rank marker overlay の実データ前提を spot check 済みとして Phase 1 完了扱いへ更新済み
- analyze 日付ページで販売設定カードが見えていない状態では、sales-setting 向け booking_curve prefetch を走らせない構成へ更新済み
- sales-setting の card 行と overall summary が、同じ booking_curve response から比較値を 1 回で事前集計して再利用する構成へ更新済み
- `queueCalendarSync()` は、同一 DOM 状態の署名を比較して不要な再同期を捨て、同期中の MutationObserver / interaction 由来の再要求を pending 1 回へ畳み込む構成へ更新済み
- `queueCalendarSync()` の各呼び出し元は reason 付き軽量計測ログを持ち、`__DEV__` では request / skip / execute 件数を run ごとに console へ出せる構成へ更新済み
- calendar sync debug summary は `localStorage["revenue-assistant:debug:calendar-sync"] = "1"` でも有効化できるため、通常ビルドの Tampermonkey 上でも GUI 実測が可能
- 月送りの GUI 実測では `mutation-observer` が支配的な発火源だったため、自前で挿入した DOM subtree だけの mutation は observer 段階で捨てる構成へ更新済み
- 自前 DOM mutation 除外後の月送り GUI 再実測では、`mutation-observer` requested が 52 件から 11 件まで低下したことを確認済み
- calendar sync debug summary は console だけでなく `localStorage["revenue-assistant:debug:calendar-sync:last"]` と `data-ra-calendar-sync-debug-snapshot` DOM node にも最新 snapshot を残す構成へ更新済み
- `queueCalendarSync()` の MutationObserver 起点は、observer callback ごとに直接 queue せず、同期が空くまで 1 本だけ待たせてから queue する構成へ更新済み
- 2026-04-18 の GUI 再実測で、fresh analyze tab 初期表示の `mutation-observer` は requested が 16 から 1、queuedWhileRunning が 15 から 0 へ低下したことを確認済み
- `scheduleMutationObserverCalendarSync()` は、flush 時点の DOM 署名が前回完了済みと同じなら `queueCalendarSync()` を呼ばずに打ち切る構成へ更新済み
- 2026-04-18 の GUI 再実測で、analyze 月送り 1 回の `mutation-observer` は requested 5 / skippedCompleted 4 から requested 2 / skippedCompleted 1 まで低下したことを確認済み
- 2026-04-18 の GUI 再実測で、focus 復帰では `mutation-observer` が requested 1 / scheduled 1 に留まり、warning や `consistency-invalidate` を増やさず、group row 6 件・rank detail 6 件・`ブッキングカーブを開く` 6 件が維持されることを確認済み
- booking_curve の persistent cache は raw response をそのまま保存せず、`date / all / transient / group` の最小系列だけを保存する構成へ更新済み
- booking_curve の persistent cache 書き込み時は、旧 `v1/v2/v3` userscript が残した legacy localStorage を 1 回だけ自動 cleanup し、quota 例外時は cleanup 後に 1 回だけ再保存を試みる構成へ更新済み
- 2026-04-18 の GUI verify で、analyze 日付ページから月送り 1 回後も `failed to write persistent booking-curve cache` warning は再発せず、legacy `v1/v2/v3` key が 0 件であることを確認済み
- interaction 遅延タイマーは、直前の sync が完了済みで DOM 署名も未変化なら残りタイマーを打ち切る構成へ更新済み
- 現行 analyze UI では販売設定 card の `suggestions-*` DOM が見えず、`booking-curve-main-chart-header` と `部屋グループ` selector が sales-setting 可視状態の実 DOM であることを GUI 実測で確認済み
- sales-setting 向け booking_curve prefetch の可視判定は、旧 `suggestions-*` card だけでなく現行 chart header + room-group selector UI でも成立する構成へ更新済み
- 現行 rank mode では、legacy sales-setting card が無い場合でも booking curve セクション直下へ synthetic room-type host 群を生成し、既存の overall summary / rank overview / room-group table を再利用できる構成へ更新済み
- synthetic host の個別 booking curve 用 capacity は `/api/v1/suggest/output/current_settings` の `rm_room_groups[].max_num_room` を月単位で取得して hidden element へ補い、既存 card renderer を再利用する構成へ更新済み
- 現行 current UI の overall summary / rank overview は、booking curve host 再描画で消えないよう synthetic room-type host から切り離し、body 直下の専用 supplement portal へ描画する構成へ更新済み
- 2026-04-18 の GUI verify で、analyze 現行 rank mode にて current-ui supplement portal、overall summary、rank overview、room-group table 6 件が final state まで残ることを確認済み
- 2026-04-18 の GUI verify で、analyze 現行 rank mode にて current-ui room-group 6 件へ `ブッキングカーブを開く` が表示され、シングル card で `全体 / 個人` の個別 booking curve が開くこと、capacity が `61 / 61` で表示されることを確認済み
- GitHub Pages へ userscript を自動配布する workflow を追加済み
- npm と GitHub Actions の依存更新を週次で提案する Dependabot 設定を追加済み
- pull request 用の検証 workflow と `CODEOWNERS` を追加済み
- 2026-04-20 の月次実績画面 DOM/API 調査で、route は `/monthly-progress/YYYY-MM`、stable selector は `chart-tabs`、`chart-sub-tabs-*`、`chart-content-*`、`table-contents` 系であることを確認済み
- 月次実績画面の主要 API 候補として、`/api/v1/booking_curve/monthly`、`/api/v1/booking_progress/monthly`、`/api/v1/sales_diffs`、`/api/v1/sales_diffs/performance`、`/api/v3/lincoln/suggest/status` を確認済み
- 月次実績画面では、宿泊日基準 `販売客室数` への切替で `booking_curve/monthly`、`sales_diffs`、`calendar` が再取得され、予約日基準への切替では `booking_curve/monthly` のみ再取得されることを GUI 実測で確認済み
- 月次実績画面の custom booking curve は、2026-04-20 時点で `LT基準` を正とし、表示と操作は `予約日基準` chart の派生として設計する判断を確定済み
- 月次実績画面の custom booking curve は別 userscript へ分離せず、既存 userscript のまま進める判断を確定済み。既存 top / analyze の完成機能を巻き込まないことを優先し、route 単位の起動境界と monthly-progress 専用 storage namespace を前提にする
- 月次実績画面向けに route-scoped slice の土台を追加し、`/monthly-progress/YYYY-MM` では既存 top / analyze の observer / sync を停止しつつ、monthly-progress 専用 kill switch と storage namespace を先に切る実装を反映済み
- 月次実績画面の `/api/v1/booking_curve/monthly` は、取り逃がし防止のため facility + yearMonth + batch-date 単位で write-only snapshot を IndexedDB へ保存し始めた。read path はまだ切り替えず、現行表示は API 正本のまま維持する
- 月次実績画面の `予約日 -> LT` 変換は、保存済み snapshot を month-end anchor の LT 系列へ落とす純粋関数として扱い、現年は未観測 bucket と ACT を打ち切る形へ更新済み
- 月次実績画面の LT 横軸メモリは、日別 booking curve と同じ LT バケット定義を使う判断で確定し、monthly preview も同じ bucket end-date 集約へ更新済み
- 月次実績画面の最初の UI として、予約日基準 `販売客室数` chart 直下へ 2 カラムの LT chart section を独立 block で差し込む実装を追加済み。左に `販売客室数`、右に `販売単価` を置き、対象月から未来 3 か月を同時表示し、`前年 / 前々年` compare と hover tooltip を持つ。既存 Recharts chart は置き換えず、reservation basis chart が見えない時は block を外す

## Doing

- 月次実績画面の LT 基準 custom booking curve を、追加済み route-scoped slice、IndexedDB write-only snapshot、2 カラム multi-month chart の上でどこまで本実装へ寄せるかを切り分ける

## Next

1. 追加済み reservation basis chart 直下の 2 カラム multi-month chart を、final の custom graph へ置き換えるか、同 chart を段階拡張するか決める
2. 追加済み LT バケット集約系列の月別色分け、compare 見せ方、tooltip 詳細粒度をどこまで本実装へ寄せるか決める
3. 追加済み monthly-progress 専用起動境界、storage namespace、kill switch を前提に、verify 境界と DOM 差し込み責務を決める
4. write-only で保存し始めた IndexedDB snapshot を、どの時点で baseline や過去比較の read path に繋ぐか判断する
5. booking curve の標準 UI に `団体` 系列を含めるかを、実装後の使用感ベースで再判断する

## Thread Handoff

- 現在の `main` は clean 前提で再開できる。直近の押し込み済み保存点は `ca1525e` `Fix rank overview delta alignment`、`ca298fa` `Add top calendar latest change label`、`874e73c` `Fix calendar latest change label layout`
- 直近の確認済み verify は `npm run check` 通過と、トップ画面カレンダーの通常表示、`1日前増減`、`1日 / 7日前増減`、analyze 画面非表示の GUI 実測。`◯日前` が既存 indicator を押し下げず、analyze では 0 件であることを確認済み
- 次スレッドの先頭は、トップカレンダー修正済み前提で、`月次実績画面の DOM/API 調査` を最優先にする
- 現状の localStorage 実測は revenue-assistant 分だけで約 210 万文字、715 key、hotel booking_curve 1 key は約 4.5 万文字で、headroom はまだあるが広くはない
- `IndexedDB` は monthly-progress の `/api/v1/booking_curve/monthly` snapshot を write-only で保存する用途から先に使い始めた。設定値、toggle、debug snapshot は引き続き localStorage を維持する
- `src/monthlyProgressLeadTime.ts` を追加し、保存済み snapshot を month-start anchor の LT 系列へ変換する純粋関数と summary helper を切り出した。現時点では console preview までで、UI の read path はまだ切り替えない
- `src/leadTimeBuckets.ts` を追加し、日別 booking curve と monthly preview が同じ LT バケット定義を共有する構造へ寄せた
- `src/monthlyProgress.ts` は reservation basis `販売客室数` chart の親直後へ独立 section を差し込み、visible LT tick を使った 2 カラム multi-month SVG chart を描画する。左は `販売客室数`、右は `販売単価`、対象月から未来 3 か月を同時表示し、`前年 / 前々年` compare と hover tooltip を monthly 専用 observer 配下で制御する
- 次スレッドの最小 verify は docs 判断だけなら差分確認のみ、実装に入るなら `npm run check`。GUI まで触る場合だけ、対象画面に応じて月次実績画面の DOM/API 実測、または analyze rank mode の current-ui supplement portal、overall summary、rank overview、room-group table 再確認を行う
- 2026-04-20 の月次実績画面 GUI 調査では、トップ導線の `月次実績` link から `/monthly-progress/2026-04` へ遷移でき、表示中 chart の testid は state に応じて `chart-content-sales-dateOfStayBasis`、`chart-content-numberOfRoomsSold-dateOfStayBasis`、`chart-content-numberOfRoomsSold-dateOfReservationBasis` へ切り替わることを確認済み
- `/api/v1/booking_curve/monthly?year_month=202604` は `sales_based` と `room_based` の 181 点系列、および `updated_at` を返し、月次実績画面の curve 表示の primary data source 候補として使えることを確認済み
- 月次実績画面の custom booking curve は LT 基準を正とし、宿泊日基準へ寄せず、予約日基準 chart の派生表示として扱う
- 月次実績画面の custom booking curve は別 userscript へ分離せず、同一 userscript 上で進める。その代わり、既存 top / analyze 完成機能を巻き込まないよう、起動条件、storage、描画責務を monthly-progress 側へ閉じる
- `src/monthlyProgress.ts` に monthly-progress 専用 route-scoped scaffold を追加し、main 側は route dispatch のみで monthly-progress へ渡す構造に寄せた。`/monthly-progress` では既存 observer / sync を停止し、kill switch と namespaced storage adapter を先に持つ
- `src/monthlyProgressIndexedDb.ts` を追加し、monthly-progress の `booking_curve/monthly` を facility + yearMonth + batch-date 単位の snapshot として IndexedDB へ write-only 保存する。初期 slice ではまだ UI の read path には使わない
- `src/monthlyProgress.ts` は route 初期化時に最新 snapshot を読み、month-start anchor の LT preview summary を console.info へ出せる。UI 未接続のまま、変換責務だけを先に固定する
- monthly preview の LT 系列は raw 日別点ではなく、日別 booking curve と同じ bucket end-date 集約で出す。x 軸メモリの粒度を先に共通化する
- 次の UI 実装は、差し込み済み 2 カラム multi-month chart を final の custom booking curve へどう寄せるかの判断から始める

## Resume From Here

- 現在地は Phase 2 の最初の性能改善として、販売設定カードが見えていない状態では sales-setting 向け booking_curve prefetch を止め、booking_curve 比較値の事前集計共有、`queueCalendarSync()` の署名ベース重複抑止、reason 付き debug summary、通常ビルド向け debug フラグ、自前 DOM mutation 除外、debug snapshot の DOM / localStorage 出力、observer callback の 1 本化待ち、booking_curve persistent cache の最小系列化、interaction 遅延タイマー打ち切り、現行 sales-setting UI 可視判定の追従、synthetic current-ui host による summary / rank / room-group table 再利用、`current_settings` ベースの個別 booking curve capacity 補完まで反映済み
- rank overview の `増減` 列追加と配置補正、トップカレンダーの `相対日数のみ / セル最下部のみ / analyze 画面では非表示` は実装と GUI verify まで完了済み
- トップカレンダーの `◯日前` は、既存 indicator 配下へ差し込むと `1日前増減` と `1日 / 7日前増減` の縦積みを壊すため、日付セル anchor 直下の absolute overlay を正とする
- 直近の保存点は、上記トップカレンダー layout fix を含む `874e73c` 時点の `main`
- 次スレッドの最初の実装対象は、baseline へ戻る前に、月次実績画面の DOM と API の調査へ入ること
- 先に保持すべき公開挙動は、Phase 1 の booking curve UI、tooltip close、`ACT` 空表示、rank marker overlay を変えないこと
- 月次実績画面の booking curve は、まず DOM と API の調査だけを 1 本切り、データ源と表示余地が見えるまで実装へ入らない
- GUI verify を再開する場合は、Tampermonkey 側の userscript 再読込を済ませてから判断する。build 結果と画面表示がずれた場合は `dist/*.user.js` を正とする
- 次スレッドの最小 verify は、調査だけなら差分確認または採取メモで足りる。実装に入る場合は `npm run check`。GUI まで触る場合だけ analyze 画面の rank mode で synthetic current-ui host が表示され、不要 warning を増やさないことを確認する
- 月次実績画面の初回調査は完了済みで、route は `/monthly-progress/YYYY-MM`、主要 data source は `/api/v1/booking_curve/monthly`、補助候補は `/api/v1/booking_progress/monthly`、`/api/v1/sales_diffs`、`/api/v1/sales_diffs/performance`、`/api/v3/lincoln/suggest/status` と整理できている
- 次スレッドの最初の判断対象は、既存 Recharts DOM を置き換えずに予約日基準 chart area 直下へ独立 block を差し込むかどうかと、`予約日 -> LT` の変換をどこで持つか
- 月次実績画面の実装は同一 userscript 上で進める前提のまま、monthly-progress 専用の起動境界、storage namespace、kill switch、write-only IndexedDB snapshot、month-start anchor の LT 変換関数までは先に切ってある。次スレッドでは、その上に最小 UI を積む

## Notes For Next Thread

- booking curve グラフの系列生成は `src/main.ts` の `buildSalesSettingBookingCurveSeries` と `buildSalesSettingBookingCurveRenderData` が担う
- 数値 tick は選択中 analyze 日付を `stay_date` として bucket 終端日を引き、`findBookingCurveCount` の fallback で系列化する
- `ACT` tick は `batch-date` と一致する実点だけを使う。上部の current 値は `batch-date` 以前の最新非 null を使うので、将来 stay_date では `ACT` と一致しない場合がある
- rank 変更履歴 marker は室タイプ別 card のみへ重ねる。x は LT 日数を圧縮済み LT 軸へ補間し、同日複数変更は最後の 1 件だけ表示する
- booking curve の tooltip は point または marker の hover / focus 中だけ表示する。rank marker 情報は marker 点だけでなく同じ区間の line hover でも表示し、`ランク A→B` を強調表示する
- 未着地 stay_date では、観測 LT より手前の tick と `ACT` を空にして、当日も含めて線を観測 LT で打ち切る
- booking curve の見出しは対象名を含めて表示する。y 軸は整数メモリへ丸め、満室ラインは補助線で別描画する
- 2026-04-17 時点の横軸ラベル優先表示は `ACT, 3, 7, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 360`
- GUI verify では build 後の `dist/*.user.js` だけでなく、Tampermonkey 側の userscript 再読込も必要。再読込なしでは旧 build が表示されることがある
- トップカレンダーの `◯日前` は root 画面でだけ表示し、normal、`1日前増減`、`1日 / 7日前増減` の 3 モードで indicator の縦積みを壊していないかを見る
- 販売設定カードの `1日前 / 7日前 / 30日前` は、Phase 1 では booking_curve の室タイプ別 `all.this_year_room_sum` を正として扱う
- `prefetchSalesSettingGroupRooms` は旧 `suggestions-*` card だけでなく、現行 `booking-curve-main-chart-header` と `部屋グループ` selector が見えている sales-setting UI でも走る
- 現行 UI の synthetic host は booking curve セクション下に自前 DOM を生成して legacy render 関数を再利用する。room group 名は booking curve の room-group list から列挙し、個別 capacity は `/api/v1/suggest/output/current_settings` の `max_num_room` を hidden element へ補って card booking curve を描く
- `prepareSalesSettingSyncData` は hotel / room-group ごとの booking_curve response から current, 1日前, 7日前, 30日前の比較値をまとめて解決し、card 行と overall summary で使い回す
- `queueCalendarSync()` は completed signature と pending queue を持ち、同期中の DOM 変化は次の 1 回へ畳み込む。cache invalidation 時だけ force 付き再同期を許可する
- `queueCalendarSync()` の debug summary は `__DEV__` 時だけ有効で、reason ごとの requested / scheduled / skippedQueued / skippedCompleted / queuedWhileRunning / executed / forced を console.info へ出す
- calendar sync debug は通常ビルドでも `localStorage["revenue-assistant:debug:calendar-sync"] = "1"` で有効化できる
- 最新の calendar sync debug snapshot は `localStorage["revenue-assistant:debug:calendar-sync:last"]` と `data-ra-calendar-sync-debug-snapshot` からも読めるので、Tampermonkey isolated world の console を直接拾えない時でも GUI 実測を継続できる
- 月送りの初回 GUI 実測では `mutation-observer` が requested 52 / scheduled 1 / skippedCompleted 17 / queuedWhileRunning 34 で支配的だったため、observer は自前 DOM subtree だけの mutation を無視するよう更新した
- 自前 DOM mutation 除外後の再実測では、月送り 1 回の `mutation-observer` は requested 11 / scheduled 1 まで低下した
- observer callback の 1 本化待ち追加後の fresh analyze tab 初期表示では、`mutation-observer` は requested 1 / scheduled 1 / queuedWhileRunning 0 まで低下した
- persistent booking-curve cache warning の根本要因は raw booking_curve response の localStorage 保存サイズと見ており、現在は `date / all.this_year_room_sum / transient.this_year_room_sum / group.this_year_room_sum` だけへ圧縮保存する
- 月次実績画面の top nav には `月次実績` link があり、現行実 DOM では `/monthly-progress/YYYY-MM` へ遷移する
- 月次実績画面の chart は Recharts ベースで、安定 selector は `chart-tabs`、`chart-sub-tabs-dateOfStayBasis`、`chart-sub-tabs-dateOfReservationBasis`、`chart-content-*`、`table-contents` を優先する
- 宿泊日基準 `売上` の visible chart は `chart-content-sales-dateOfStayBasis`、宿泊日基準 `販売客室数` は `chart-content-numberOfRoomsSold-dateOfStayBasis`、予約日基準 `販売客室数` は `chart-content-numberOfRoomsSold-dateOfReservationBasis` だった
- 宿泊日基準 `販売客室数` への切替では `booking_curve/monthly`、`sales_diffs`、`calendar` が再取得され、予約日基準への切替では `booking_curve/monthly` のみ再取得された
- `/api/v1/booking_curve/monthly` は `sales_based` と `room_based` の 181 点系列を返す。各点は `date / this_year_sum / last_year_sum` を持ち、`updated_at` も返る
- custom booking curve の基準軸は LT を正とする。月次実績画面では予約日基準 chart の派生表示として扱い、宿泊日基準を初手の土台にはしない
- monthly-progress 実装は別 script に逃がさず、同一 userscript の route-scoped slice として進める。既存完成機能を巻き込まないため、storage key、DOM selector、observer 起動条件を monthly-progress 専用で閉じる

## Remaining Task Triage

Now:

- 月次実績画面の LT 基準 custom booking curve の graph 化範囲と、軽量 curve chart をどこまで段階拡張するかを決める

Next:

- `同月同曜日` baseline の対象範囲と `IndexedDB` 導入要否を判断する
- `competitor_prices` と `団体` 系列 UI の導入要否を判断する

After Next:

- baseline 実装後の使用感を見て、室タイプ card まで baseline を広げるか、`団体` 系列を標準 UI に含めるかを再判断する
