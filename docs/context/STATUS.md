# STATUS

最終更新: 2026-04-18

## Done

- userscript の TypeScript 開発基盤、build、lint、typecheck を整備済み
- Chrome remote debugging 用スクリプトと CDP 接続スクリプトを配置済み
- analyze 日付ページの月次カレンダー各セルへ団体室数を表示する拡張を実装済み
- カレンダー上の団体室数表示の visible / hidden 切替トグルを実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の `1日前差分 / 7日前差分 / 30日前差分` を表示する拡張を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の団体室数と `1日前差分 / 7日前差分 / 30日前差分` を表示する拡張を実装済み
- 販売設定タブの室タイプ別 `1日前差分 / 7日前差分 / 30日前差分` は、Phase 1 では `/api/v4/booking_curve` の室タイプ別 `all.this_year_room_sum` を正として維持する判断を確定済み
- analyze 日付ページの販売設定タブ最上段で、全体販売室数サマリーと全体団体室数サマリーを 2 行で表示する拡張を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の `最終変更 何日前 / ランク A→B` を俯瞰できる rank overview を追加済み
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

## Doing

- 月送りと focus 復帰を GUI 再実測し、observer coalescing 後にも残る支配的な再同期トリガーだけを対象に `queueCalendarSync()` をさらに減らす

## Next

1. 月送りと focus 復帰を GUI 再実測し、observer coalescing 後にも残る支配的な再同期トリガーだけを対象に `queueCalendarSync()` をさらに減らす
2. `同月同曜日` baseline と `IndexedDB` 導入要否を Phase 2 で判断する
3. `competitor_prices` を販売設定タブへ埋め込む価値と最小表示仕様を判断する

## Resume From Here

- 現在地は Phase 2 の最初の性能改善として、販売設定カードが見えていない状態では sales-setting 向け booking_curve prefetch を止め、booking_curve 比較値の事前集計共有、`queueCalendarSync()` の署名ベース重複抑止、reason 付き debug summary、通常ビルド向け debug フラグ、自前 DOM mutation 除外、debug snapshot の DOM / localStorage 出力、observer callback の 1 本化待ち、booking_curve persistent cache の最小系列化、interaction 遅延タイマー打ち切り、現行 sales-setting UI 可視判定の追従、synthetic current-ui host による summary / rank / room-group table 再利用、`current_settings` ベースの個別 booking curve capacity 補完まで反映済み
- 直近の保存点は `db59520` `Reduce duplicate calendar sync observer triggers`
- 次スレッドの最初の実装対象は、月送りと focus 復帰を GUI 再実測し、snapshot の `summary` と `mutationObserverSummaries` を比べて、observer coalescing 後にも支配的な reason だけを対象に `queueCalendarSync()` の不要発火を削るところから始める
- 先に保持すべき公開挙動は、Phase 1 の booking curve UI、tooltip close、`ACT` 空表示、rank marker overlay を変えないこと
- 次の最小差分候補は、月送りか focus 復帰のどちらかでまだ支配的な reason だけを対象に、consistency check か外部 DOM 再描画かを切り分けること
- GUI verify を再開する場合は、Tampermonkey 側の userscript 再読込を済ませてから判断する。build 結果と画面表示がずれた場合は `dist/*.user.js` を正とする
- 次スレッドの最小 verify は `npm run check`。GUI まで触る場合だけ analyze 画面の rank mode で synthetic current-ui host が表示され、不要 warning を増やさないことを確認する

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

## Remaining Task Triage

Now:

- 月送りと focus 復帰を再実測し、observer coalescing 後にも残る支配的な再同期トリガーだけを対象に `queueCalendarSync()` を減らす

Next:

- `同月同曜日` baseline と `IndexedDB` 導入要否を判断する

After Next:

- `competitor_prices` と `団体` 系列 UI の導入要否を決める
