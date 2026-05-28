# tasks_backlog

## Completed / Recent GUI Confirmed

### RAU-CP-04 競合価格グラフを標準表より下に固定する

- 目的:
  - Revenue Assistant 側で競合価格の絞り込みを行ったあとも、RAU の競合価格グラフが Revenue Assistant 標準の競合価格表より下に表示され続けるようにする。
- 背景:
  - 2026-05-01 の利用者確認で、Revenue Assistant 側の競合価格絞り込み後に、RAU のグラフブロックが上側へ移動し、Revenue Assistant 標準表が下に出るケースが確認された。
- スコープ:
  - 競合価格 tab 本文の標準表が再描画された場合でも、RAU の挿入位置を標準表より下へ戻す。
  - 標準表が未表示または hidden の状態では、販売設定 tab や別 tab の下部へ fallback 描画しない。
  - 既存の `競合価格 -> 販売設定 -> 競合価格` 再表示対応を壊さない。
- 非目標:
  - 部屋タイプ別 snapshot 取得を追加すること。
  - 競合価格グラフのデータ構造や IndexedDB schema を変更すること。
- 受け入れ条件:
  - 競合価格 tab で Revenue Assistant 側の絞り込みを変更しても、RAU の `競合価格 最安値推移` は Revenue Assistant 標準表より下に表示される。
  - 販売設定 tab には RAU の競合価格表示が出ない。
  - `競合価格 -> 販売設定 -> 競合価格` と遷移しても、RAU グラフは標準表より下に 1 セクションだけ再表示される。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - Analyze 日付ページ内の click 後に、競合価格グラフの配置修復を複数回予約するようにした。
  - MutationObserver が DOM 変化を検知したが calendar sync signature が変わらない場合でも、競合価格グラフの配置修復を予約するようにした。
  - 配置修復は保存済み state から `renderCompetitorPriceOverviewFromState()` を再実行し、Revenue Assistant 標準表が後から追加された場合でも RAU セクションを同じ親要素の末尾へ戻す。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run check`: passed
  - `git diff --check`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
- GUI 確認:
  - 2026-05-01 に Chrome CDP で build 済み `dist/revenue-assistant-userscript.user.js` を `https://ra.jalan.net/analyze/2026-06-17` へ注入して確認した。
  - 競合価格 tab 内に `競合価格 最安値推移` が表示され、初期状態で RAU セクションが親要素の末尾にあることを確認した。
  - 標準表の後続再描画を模した test node を RAU セクションの後ろに追加し、2.3 秒後に RAU セクションが再び末尾へ戻ることを確認した。

### RAU-CP-03 競合価格 snapshot の人数別最安値グラフを競合価格タブに表示する

- 目的:
  - `RAU-CP-02` で保存した競合価格 snapshot を使い、対象宿泊日の競合価格が取得日ごとにどう推移したかを確認できるようにする。
  - Revenue Assistant 標準タブの現在値表を複製するのではなく、取得時点つき snapshot の人数別最安値推移を RAU の追加価値として表示する。
- スコープ:
  - Analyze 日付ページの競合価格 tab 内にだけ、RAU の競合価格表示を追加する。販売設定タブには表示しない。
  - RAU の表示は、Revenue Assistant 標準の競合価格表より下に置く。
  - 競合価格 tab 本文が実際に表示されている場合だけ RAU の競合価格表示を描画する。競合価格 tab button や tab root だけを根拠に、販売設定 tab の下部へ fallback 描画しない。
  - `1名`、`2名`、`3名`、`4名` の人数別 panel で、施設別の最安値折れ線グラフを表示する。
  - 人数別 panel は 2 列ではなく縦 4 ブロックで表示する。
  - 自社と保存時点の競合施設を同じグラフ上の線として表示する。
  - 横軸は取得日、縦軸は価格とする。同じ日に複数 snapshot がある場合は、その取得日の最新 snapshot を代表として使う。
  - 部屋タイプと食事条件は、グラフ軸ではなく toggle button の簡易絞り込みとして表示する。
  - 部屋タイプ名は raw value をそのまま出さず、`シングル`、`ダブル`、`ツイン`、`トリプル`、`和洋室` などの日本語表記へ寄せる。
  - グラフの Tooltip は取得日軸ごとに表示し、施設別の最安値と同じ施設の前回取得日との差分を表示する。
  - Analyze 日付ページの indicator に、競合価格 snapshot の保存状態を追加する。
  - warm cache indicator は詳細を折りたためる最小化機能を持つ。
  - Analyze 画面内で競合価格 tab を開いた場合は、現在開いている stay_date の競合価格 snapshot 取得優先度を上げる。
  - 競合施設を入れ替えた場合でも、保存時点の施設名と `yad_no` を使い、現在の競合施設一覧だけで過去 snapshot を解釈しない。
- 非目標:
  - 販売設定タブに競合価格を表示すること。
  - booking_curve warm cache の通常範囲、同週、同月の全日付へ競合価格 snapshot 取得を広げること。
  - 在庫状態、販売停止、満室を表示すること。
  - 自動レート変更へ接続すること。
- 受け入れ条件:
  - 競合価格タブを開いたとき、Revenue Assistant 標準の競合価格表より下に RAU の人数別最安値グラフが表示される。
  - 販売設定タブには RAU の競合価格表示が出ない。
  - 販売設定タブを最下部までスクロールしても、RAU の競合価格表示が割り込まない。
  - `1名`、`2名`、`3名`、`4名` の panel が縦 4 ブロックで表示され、対象データがない人数は `対象データなし` と表示される。
  - 部屋タイプと食事条件を toggle button で指定なしから選択でき、選択後にグラフが再描画される。
  - 部屋タイプ名が `シングル`、`ダブル`、`ツイン`、`トリプル`、`和洋室` などの読みやすい表記で表示される。
  - グラフの取得日軸に hover または focus したとき、Tooltip で施設別最安値と前回差分を確認できる。
  - indicator の最小化ボタンで詳細表示を折りたたみ、再表示できる。
  - 同じ取得日に複数 snapshot がある場合、取得日の最新 snapshot だけがグラフに使われる。
  - indicator で、競合価格 snapshot の未取得、保存中、保存済み、skip、保存失敗を区別できる。
  - 競合価格 tab を開いた場合、現在開いている stay_date の競合価格 snapshot 保存が、通常の Analyze open 起点より優先される。
  - 競合施設入れ替え後、現在の競合施設一覧に存在しない過去施設を現在施設として誤表示しない。
  - 既存の販売設定、booking curve、rank marker、warm cache indicator の表示と操作を壊さない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - `src/competitorPriceSnapshotStore.ts` に、同じ facility と stay_date の snapshot 系列を読む read path を追加した。
  - Analyze 日付ページの indicator に、競合価格 snapshot の保存中、保存済み、前回あり、skip、保存失敗を表示するようにした。
  - 販売設定タブへの競合価格表示をやめ、競合価格 tab 内の標準表より下にだけ RAU の追加表示を出すようにした。
  - 競合価格 tab button 付近を fallback 挿入先にする処理をやめ、競合価格 tab 本文が表示されている場合だけ描画するようにした。
  - 表示方式を前回比 table から、`1名`、`2名`、`3名`、`4名` の人数別最安値グラフへ変更した。
  - 同日複数 snapshot は取得日の最新 snapshot を代表として使い、取得時刻は保存データと indicator 詳細に残すようにした。
  - 部屋タイプと食事条件の toggle button 絞り込みを追加した。
  - 部屋タイプ名を `シングル`、`ダブル`、`ツイン`、`トリプル`、`和洋室` などの日本語表記へ寄せた。
  - グラフを縦 4 ブロック表示にし、取得日軸ごとの Tooltip と前回差分表示を追加した。
  - warm cache indicator に最小化ボタンを追加した。
  - 競合価格 tab を開いた場合は、現在開いている stay_date の競合価格 snapshot 保存を `competitor-tab` source として即時トリガーするようにした。
  - `競合価格 -> 販売設定 -> 競合価格` と遷移した場合でも、重複取得は抑制したまま、保存済み snapshot series を読み直して競合価格グラフを再描画するようにした。
  - 取得日数が少ない競合価格グラフでは、横軸をパネル最大幅まで引き伸ばさず、短い描画幅を中央寄せで使うようにした。7日以上になった場合は従来どおりパネル幅を使う。
  - 人数別グラフ panel ごとの境界が分かるように、各 panel に薄い枠線、内側余白、白背景を追加した。
  - 縦軸に 5 段階の価格目盛りを表示し、中間目盛りには薄い破線の補助線を追加した。補助線は、取得日数が少ない場合でも、点と線の短い中央寄せ幅ではなくグラフ描画領域の横幅いっぱいに表示する。価格幅が小さく 100 円丸めで目盛りが重複する場合は、1 円単位の補間目盛りへ戻して重複表示を避ける。
  - Tooltip の施設別最安値を、`施設`、`価格`、`前回差分` の表形式に変更した。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- GUI 確認:
  - 2026-04-30 に Chrome CDP で build 済み `dist/revenue-assistant-userscript.user.js` を Analyze 日付ページへ注入して確認した。
  - 競合価格 tab 内に `競合価格 最安値推移` が 1 セクション表示されることを確認した。
  - `1名 最安値`、`2名 最安値`、`3名 最安値`、`4名 最安値` の 4 panel が縦 4 ブロックで表示されることを確認した。
  - 部屋タイプと食事条件の pull-down が 0 件になり、toggle button として表示されることを確認した。
  - 部屋タイプ toggle が `シングル`、`ダブル`、`ツイン`、`トリプル` のカタカナ表記で重複なく表示されることを確認した。
  - 取得日軸の hover で Tooltip が表示され、施設別最安値と前回差分欄が表示されることを確認した。
  - indicator の `最小化` button で詳細表示が非表示になることを確認した。Tampermonkey 正式再読込後の利用者確認で、人数別グラフ panel の枠線、縦軸補助目盛り、補助線、Tooltip 表形式、補助線の横幅いっぱい表示が反映されることを確認した。
  - 販売設定 tab に戻ったとき、RAU の競合価格セクションが 0 件になることを確認した。
  - 2026-05-14 の Analyze 日付ページで、販売設定 tab 下部に `競合価格 最安値推移` が割り込まないことを Chrome CDP build 注入で確認した。
  - 2026-04-30 の Analyze 日付ページで、競合価格 tab 本文が表示されている場合は `競合価格 最安値推移` が 1 セクション、4 panel で表示されることを Chrome CDP build 注入で再確認した。
  - 2026-05-01 に Chrome CDP で build 済み userscript を注入し、`競合価格 -> 販売設定 -> 競合価格` の遷移後も `競合価格 最安値推移` が 1 セクション、4 panel、4 SVG で再表示されることを確認した。
  - 2026-05-01 に Chrome CDP で build 済み userscript を注入し、2日分の競合価格グラフで日付ラベル、点、グリッド線が `315〜475` の短い中央寄せ幅に収まり、旧表示の `54〜736` 両端配置にならないことを確認した。
  - 2026-05-01 に build 出力へ `trend-toggle-v4`、縦軸補助目盛り、補助線、Tooltip 表形式の生成コードが含まれることを確認した。
  - 2026-05-01 に Tampermonkey 正式再読込後の利用者確認で、人数別グラフ panel の枠線、縦軸補助目盛り、補助線、Tooltip 表形式、補助線の横幅いっぱい表示が期待どおり表示されることを確認した。

## Completed / Recent Stabilization

### RAU-CP-10 競合価格タブ遷移直後の取得トリガー欠落を修正する

- 目的:
  - Analyze 日付ページをしばらく開いたあとに別の Analyze 日付ページへ移動し、競合価格タブを開いた場合でも、現在開いている宿泊日の競合価格 snapshot 取得とグラフ表示を開始できるようにする。
- 背景:
  - 2026-05-02 の利用者確認で、競合価格タブを開いても競合価格グラフが表示されない場合があると報告された。
  - 表示されない場合は indicator 内に競合価格の表示がなく、競合価格 snapshot 取得自体が走っていないように見えることが確認された。
  - F5 更新後に同じ画面を開くと表示されるため、保存済みデータやグラフ描画形式ではなく、SPA 画面遷移直後の取得開始タイミングが主な疑いになった。
- スコープ:
  - 競合価格タブ click 時点で、Analyze 日付、施設 cache key、batch date key のいずれかが未確定でも、要求を破棄せず短時間だけ保留して再試行する。
  - 保留中の競合価格タブ要求は、対象 Analyze 日付と現在の Analyze 日付が一致し、施設 cache key と batch date key が確定した時点で `competitor-tab` source として snapshot 保存を開始する。
  - 保存済み snapshot 系列だけが先に存在する場合でも、競合価格タブ表示時に現在の施設と宿泊日を表示対象として確定し、保存済み系列を読み直せるようにする。
- 非目標:
  - 競合価格 snapshot の IndexedDB schema を変更すること。
  - 競合価格 background queue の対象範囲、request 間隔、停止条件を変更すること。
  - 競合価格グラフの表示密度、横軸、Tooltip、フィルタ UI を変更すること。
- 受け入れ条件:
  - 別の Analyze 日付ページから移動した直後に競合価格タブを開いても、現在開いている stay_date の `/api/v5/competitor_prices` request が発行される。
  - indicator に現在 stay_date の競合価格保存状態、または競合価格 background queue の進捗が表示される。
  - 競合価格タブ内に `競合価格 最安値推移` が表示され、販売設定タブには表示されない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - 競合価格タブ click 時の要求を `PendingCompetitorPriceTabSnapshotRequest` として保持し、日付・施設 cache key・batch date key がそろうまで短時間再試行するようにした。
  - `runCalendarSync()` で施設 cache key と batch date key が確定したあと、保留中の競合価格タブ要求を再評価するようにした。
  - Analyze 日付が変わった場合は、別日付向けの保留要求を破棄し、同じ日付向けの保留要求だけを維持するようにした。
  - 保存済み snapshot 系列を読み直す前に、競合価格 UI state の施設と stay_date を現在の競合価格タブ対象へ合わせるようにした。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
- GUI 確認:
  - 2026-05-02 に Chrome CDP で build 済み `dist/revenue-assistant-userscript.user.js` を注入して確認した。
  - `https://ra.jalan.net/analyze/2026-06-22` を約 5 秒開いたあと、`https://ra.jalan.net/analyze/2026-06-23` へ移動し、競合価格タブを開いた。
  - 競合価格タブ click 後に `/api/v5/competitor_prices` request が発行され、indicator に `競合価格: 周辺日程取得中` が表示されることを確認した。
  - 競合価格タブ内に `競合価格 最安値推移` が表示され、画面内の SVG が 4 件になることを確認した。

### RAU-WC-07 booking curve localStorage 容量超過を整理する

- 目的:
  - Analyze 日付ページの GUI 確認中に発生した `QuotaExceededError` を放置せず、booking curve の persistent cache が容量超過で書き込めない状態を整理する。
  - 競合価格 snapshot は IndexedDB に保存できているため、本タスクは競合価格の本線を止めず、booking curve 側の保存先と削除条件だけを対象にする。
- スコープ:
  - `failed to write persistent booking-curve cache` の発生箇所を確認し、localStorage に保存している booking curve cache の key、値の大きさ、削除条件を棚卸しする。
  - 既存の IndexedDB raw source store と役割が重複している localStorage booking curve cache を、削除、縮小、または IndexedDB 参照へ寄せる方針を決める。
  - 容量超過時に、古い legacy key または現在の `batchDateKey` と一致しない key を削除しても復旧できるかを確認する。
  - 修正する場合は、booking curve 表示、reference curve 非同期補完、warm cache indicator の既存挙動を維持する。
- 非目標:
  - 競合価格 snapshot store を変更すること。
  - warm cache の取得対象日付、取得優先順位、request 間隔を変更すること。
  - localStorage 全体を無条件に消す操作を追加すること。
- 受け入れ条件:
  - `QuotaExceededError` が出る条件と、対象 localStorage key 群を説明できる。
  - 実装する場合、容量超過時の復旧処理が facility、batch date、schema の境界を壊さない。
  - Analyze 日付ページを再読み込みしても、booking curve の current 表示と reference curve の非同期補完が壊れない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- 実装方針:
  - 2026-04-30 の Chrome CDP 確認では、localStorage 全体 547 件、約 5.18 MB のうち、`revenue-assistant:group-room-count:v4:<facility>:booking-curve:` 配下の 36 件が約 5.16 MB を占めていた。大きい key は 1 件あたり約 145 KB だった。
  - `/api/v4/booking_curve` raw source は IndexedDB に保存済みのため、booking curve response 全体を localStorage に重複保存しない。
  - 新規の localStorage booking curve 書き込みと読み込みを止め、既存 key は facility prefix `revenue-assistant:group-room-count:v4:<facility>:booking-curve:` に限定して削除する。
  - localStorage の group-room result cache、booking curve raw source IndexedDB、derived reference curve IndexedDB、競合価格 snapshot IndexedDB は削除対象にしない。
- 実装内容:
  - `src/main.ts` の booking curve 取得経路から、localStorage persistent cache の読み込みと書き込みを削除した。
  - `cleanupPersistedBookingCurveStorage()` を追加し、sync batch 開始時に facility prefix `revenue-assistant:group-room-count:v4:<facility>:booking-curve:` 配下の旧 key だけを削除するようにした。
  - `docs/spec_001_analyze_expansion.md`、`docs/spec_000_overview.md`、`docs/context/DECISIONS.md`、`README.md` の保存契約を、IndexedDB raw source 正本へ揃えた。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- GUI 確認:
  - Chrome CDP で build 済み userscript を Analyze 日付ページ `https://ra.jalan.net/analyze/2026-06-17` へ注入し、旧 booking curve localStorage key 36 件が削除されることを確認した。
  - 同じ確認で、販売設定タブの booking curve section 1 件、booking curve SVG 2 件が表示されることを確認した。
  - Tampermonkey 側を `a4c4cc9` の build に更新後、Analyze 日付ページを再読み込みして再確認した。localStorage の booking-curve key は 0 件、booking-curve bytes は 0 のまま維持された。
  - 同じ再確認で、販売設定タブ内の group rows 6 件、overall summary 1 件、rank overview 1 件、booking curve section 1 件、booking curve SVG 2 件を確認した。
  - `QuotaExceededError` は再発していない。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`

## Recently Implemented / GUI Unconfirmed

### RAU-WC-08 カレンダー下線を現在取得中の progress bar として表示する

- 目的:
  - トップカレンダーの日付セル下端に出している booking_curve 取得状態の下線を、現在走っている warm cache queue の進捗として読めるようにする。
  - `一部取得済み` を固定幅の青線ではなく、`done / total` に応じた幅の progress bar として表示する。
- スコープ:
  - 既存の `salesSettingWarmCacheState.dateProgress` を使い、現在 queue の対象日だけを progress bar 表示にする。
  - `partial` は青、`complete` は緑の全幅、`error` は赤の全幅として表示する。
  - `partial` tooltip には、対象 task の完了数と総数を表示する。
- 非目標:
  - IndexedDB を再集計して、取得が走っていない日の保存済み状態を永続表示すること。これは `RAU-WC-09` で扱う。
  - 保存済み状態を、現在の `as_of_date` 完了と過去 `as_of_date` ありに分けること。これは `RAU-WC-10` で扱う。
  - warm cache の取得対象、取得順、request 間隔、retry、停止条件を変更すること。
- 受け入れ条件:
  - warm cache queue 実行中、対象日の下線幅が `raw / reference / sameWeekday` の合計 `done / total` に応じて変わる。
  - 完了日は緑の全幅下線、エラー日は赤の全幅下線として表示される。
  - 取得が走っていない日には、この task だけでは永続保存済みシグナルを出さない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- 実装内容:
  - `renderSalesSettingWarmCacheCalendarMarker()` が `SalesSettingWarmCacheDateProgress` を受け取り、CSS custom property に progress percent を設定するようにした。
  - カレンダー marker CSS を固定幅 `box-shadow` から `::after` の幅指定へ変更した。
  - `partial` の最小表示幅は、進捗が 0 より大きい場合に 8% とし、少量取得済みでも利用者が見落としにくいようにした。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
- GUI 確認:
  - 2026-05-02 に Tampermonkey 再読込後のトップカレンダーを Chrome CDP で確認した。
  - `calendar-date-2026-05-01` が `partial`、title `booking_curve 一部取得済み 25 / 77`、progress custom property `32%` として表示されることを確認した。

### RAU-WC-09 カレンダーへ保存済みデータありの静的シグナルを表示する

- 目的:
  - warm cache queue が現在走っていない日でも、IndexedDB に booking_curve raw source が保存済みであることをカレンダー上で確認できるようにする。
- スコープ:
  - 初期版では、同じ施設と stay_date の `/api/v4/booking_curve` raw source が IndexedDB に 1 件以上あるかだけを判定する。
  - 表示中のトップカレンダー日付を 1 回の readonly transaction でまとめて確認する。
  - 現在取得中の progress bar とは別の、セル下端中央の短い薄色ラインとして表示する。
  - 現在取得中の progress bar、完了、エラー表示を優先し、保存済みシグナルがそれらを上書きしない。
- 非目標:
  - reference source raw source、derived reference curve、同曜日 raw source まで含めた完全完了判定。
  - 過去 `as_of_date` と現在 `as_of_date` の見た目分離。これは `RAU-WC-10` で扱う。
- 受け入れ条件:
  - warm cache queue の対象ではない日でも、対象 stay_date の raw source が IndexedDB にあれば短い薄色ラインが表示される。
  - warm cache queue の対象日は、保存済みシグナルではなく、`partial`、`complete`、`error` の既存表示が優先される。
  - 保存済みシグナルの tooltip は `booking_curve 保存済みデータあり` とする。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - `src/bookingCurveRawSourceStore.ts` に、表示中 stay_date 群について raw source の保存有無をまとめて読む read path を追加した。
  - `src/main.ts` のカレンダー marker state に `stored` を追加した。
  - `stored` は現在 queue の progress state がない日だけ使い、中央の短い薄色ラインとして表示する。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `npm run check`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
- 未確認:
  - なし。
- GUI 確認:
  - 2026-05-02 に Chrome CDP で build 済み `dist/revenue-assistant-userscript.user.js` をトップカレンダーへ一時注入して確認した。
  - `calendar-date-2026-05-01` は `partial`、title `booking_curve 一部取得済み 31 / 77`、progress `40%` として表示され、現在取得中の progress bar が優先された。
  - `calendar-date-2026-05-02` 以降の保存済み日付は `stored`、title `booking_curve 保存済みデータあり`、progress `18%` として表示された。
  - 2026-05-02 に Tampermonkey 再読込後のトップカレンダーを Chrome CDP で確認した。marker 92 件、bar 92 件が存在し、日付セルの `position: absolute` は維持されていた。
  - `calendar-date-2026-05-01` は `partial`、title `booking_curve 一部取得済み 39 / 77`、progress `51%` として表示され、青い bar 幅が設定されていた。
  - `calendar-date-2026-05-02` 以降の保存済み日付は `stored`、title `booking_curve 保存済みデータあり`、progress `18%` として表示され、短い保存済み bar が設定されていた。

### RAU-WC-10 保存済みシグナルを current as_of_date と過去 as_of_date に分ける

- 目的:
  - カレンダー上の保存済みシグナルについて、現在の `as_of_date` の raw source がある日と、過去 `as_of_date` の raw source だけがある日を誤読されないように分ける。
- スコープ:
  - 表示中のトップカレンダー日付を対象に、同じ施設と stay_date の `/api/v4/booking_curve` raw source を IndexedDB から読む。
  - その stay_date に現在の `as_of_date` と一致する raw source が 1 件以上ある場合は `stored-current` とし、緑の短い静的 line を表示する。
  - 過去 `as_of_date` の raw source だけがある場合は `stored-past` とし、灰色の短い静的 line を表示する。
  - 現在取得中の progress bar、完了、エラー表示を優先し、保存済みシグナルがそれらを上書きしない。
- 非目標:
  - reference source raw source、derived reference curve、同曜日 raw source まで含めた完全完了判定。
  - warm cache の取得対象や queue 制御を変更すること。
- 受け入れ条件:
  - 現在の `as_of_date` の raw source がある日付は、取得中でなければ緑の短い line になる。
  - 過去 `as_of_date` の raw source だけがある日付は、取得中でなければ灰色の短い line になる。
  - 現在取得中の `partial`、`complete`、`error` 表示は保存済みシグナルより優先される。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - `src/bookingCurveRawSourceStore.ts` の保存済み raw source read path を、stay_date ごとの `currentAsOf` / `pastAsOf` status を返す形に変更した。
  - `src/main.ts` のカレンダー marker state を `stored-current` と `stored-past` に分けた。
  - `stored-current` は緑の短い line、`stored-past` は灰色の短い line として表示する。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `npm run check`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
- 未確認:
  - 現在の実データには `stored-past` 該当日がなかったため、過去基準だけの灰色 line の実データ GUI 確認。
- GUI 確認:
  - 2026-05-02 に Chrome CDP で build 済み `dist/revenue-assistant-userscript.user.js` をトップカレンダーへ一時注入して確認した。
  - 現在の実データでは `partial` 1 件、`stored-current` 91 件、bar 92 件が表示された。
  - `stored-current` は title `booking_curve 現在基準の保存済みデータあり`、progress `24%`、緑の短い line として表示された。
  - 現在の実データには `stored-past` 該当日がなかったため、過去基準だけの灰色 line はコード経路と CSS rule の確認に留めた。
  - 利用者が Tampermonkey 更新後に GUI 目視確認済み。

### RAU-CP-02 競合価格 snapshot store と取得 adapter を実装する

- 目的:
  - `RAU-CP-01` の観測結果に基づき、競合価格 response を取得時点つき snapshot として保存できる最小土台を作る。
  - 競合価格の現在値表を複製するのではなく、次回以降に `現在価格 / 前回価格 / 差分 / 前回取得時刻 / 条件 signature` を出せる保存単位へ揃える。
- スコープ:
  - `/api/v5/competitor_prices` 用の request builder を追加する。
  - request には `x-requested-with: XMLHttpRequest` を付ける。
  - query は `date`、`min_num_guests=1`、`max_num_guests=6`、`yad_nos[]` を必須にし、`meal_types[]` と plan name 検索条件は任意にする。
  - 初期取得では食事条件を指定せず、Revenue Assistant から取得できる食事タイプを広めに保存する。
  - 画面に保存されている現在の競合施設一覧から、初期 request 条件を作る。
  - 競合施設は自社に加えて最大 5 施設で、後から入れ替え可能である。保存時点の `yad_nos[]` と競合施設名を snapshot に保存し、現在の競合施設一覧だけで過去 snapshot を解釈しない。
  - IndexedDB store は、取得時刻、対象 stay_date、検索条件 raw、検索条件 signature、取得元、response schema version、保存時点の競合施設一覧、`own`、`competitors` を保存する。
  - response adapter は、`own.plans[]` と `competitors[].plans[]` の plan を、人数、食事条件、部屋タイプ、プラン名、URL、価格、自社価格との差分として正規化する。
- 非目標:
  - 競合価格 UI を表示すること。
  - warm cache queue に競合価格取得を混ぜること。
  - 競合施設一覧なしの全件取得を前提にすること。
  - 在庫状態、販売停止、満室を競合価格 response だけで判定すること。
- 受け入れ条件:
  - `date`、宿泊人数範囲、競合施設一覧を含む検索条件 signature で snapshot を保存できる。
  - 同じ stay_date でも、検索条件 signature が違う snapshot は別系列として保存される。
  - 競合施設を入れ替えた場合でも、過去 snapshot の競合施設名と `yad_no` が失われず、現在の競合施設一覧と混同されない。
  - 施設単位の価格推移は `yad_no` ごとに追跡できる。
  - `meal_types[]` を省略する場合と指定する場合を、検索条件 signature で区別できる。
  - 保存済み snapshot から、競合施設別、人数別、食事条件別、部屋タイプ別、プラン名別に RAU 側で再絞り込みできる。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - `src/competitorPriceSnapshotStore.ts` を追加し、`/api/v2/competitors`、`/api/v5/competitor_prices` の取得 adapter を実装した。
  - 初期取得条件は `min_num_guests=1`、`max_num_guests=6`、食事条件指定なし、保存時点の `yad_nos[]` とした。
  - IndexedDB database `revenue-assistant-competitor-price-snapshots` と store `competitor-price-snapshots` を追加した。
  - snapshot record は、取得時刻、stay_date、検索条件 raw、検索条件 signature、取得元、schema version、保存時点の競合施設一覧、`own`、`competitors` を保存する。
  - `facilityId + conditionSignature` index を追加し、同じ検索条件 signature の最新 snapshot を取得できるようにした。
  - Analyze 日付ページ同期時に、同じ施設、stay_date、batch date では 1 回だけ snapshot 保存を試すようにした。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- GUI 確認:
  - 2026-04-30 に Tampermonkey 更新後の Analyze 日付ページ `https://ra.jalan.net/analyze/2026-04-30` で確認済み。
  - RAU 側の `/api/v5/competitor_prices?date=20260430&min_num_guests=1&max_num_guests=6&yad_nos[]=...` は `200` を返した。
  - IndexedDB database `revenue-assistant-competitor-price-snapshots` の store `competitor-price-snapshots` に snapshot が 2 件保存されていた。
  - 最新 snapshot は `facilityId=yad:358180`、`stayDate=20260430`、競合施設 5 件、自社 plan 6 件、競合 plan hotel 5 件だった。
  - console log で `competitor price snapshot stored` と `previousFetchedAt` を確認し、同じ検索条件 signature の前回 snapshot が実ブラウザ上で読めることを確認した。

### RAU-WC-06 warm cache の retry、3ヶ月対象、Analyze 優先再開を実装する

- 目的:
  - 一時的な API 失敗で赤ラインが残り続ける状態を減らす。
  - トップカレンダーで放置したときに、直近 ACT 確定日と将来 3 か月分の booking_curve data が少しずつ貯まるようにする。
  - トップカレンダーのバックグラウンド取得がクールダウン中でも、Analyze 日付ページを開いた場合は見ている日付を優先して取得できるようにする。
- スコープ:
  - failed task は最大 2 回まで queue 末尾へ戻して自動 retry する。
  - retry 予定がある失敗は、stay_date の最終エラー扱いにしない。
  - トップカレンダーの通常対象を、`as_of_date - 1日` から `as_of_date + 3か月` までに広げる。
  - Analyze 日付ページに入った場合は、既存 cooldown より Analyze priority queue を優先する。
- 非目標:
  - 同時取得数を 2 以上へ増やすこと。
  - request 間隔 1.0 秒以上、1 回最大 10 分、連続エラー 3 回停止を外すこと。
  - 競合価格 snapshot を同じ queue に含めること。
- 受け入れ条件:
  - failed task が retry 回数つきで最大 2 回まで再投入される。
  - retry 待ち task 数が indicator で確認できる。
  - トップカレンダー通常表示時の対象期間が、直近 ACT 確定日を含む `as_of_date - 1日` から `as_of_date + 3か月` までになる。
  - Analyze 日付ページを開いた場合は、トップカレンダー側の cooldown 中でも、開いている stay_date を優先した queue が開始される。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - 通常 warm cache 対象を `as_of_date - 1日` から `as_of_date + 3か月` までへ変更した。
  - queue に投入する target stay_date を `YYYYMMDD` に正規化し、日付形式混在による indicator 表示崩れを避けるようにした。
  - failed task は `retryCount` を付けて最大 2 回まで queue 末尾へ戻すようにした。
  - retry 予定がある失敗は stay_date の最終エラー扱いにせず、最大 retry 回数を超えた場合だけ date progress の `errors` に反映するようにした。
  - indicator 詳細に `再試行待ち n` を表示するようにした。
  - Analyze 日付ページを開いた場合は `priorityStayDate` が変わるため、トップカレンダー由来の cooldown state を引き継がず priority queue を作り直す。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認
  - 実ブラウザ上で、通常対象が `as_of_date - 1日` から `as_of_date + 3か月` までになること
  - retry 発生時に `再試行待ち n` が表示され、成功時に赤 line にならないこと
  - トップカレンダー cooldown 中に Analyze 日付ページを開いたとき、priority queue が動き始めること

### RAU-WC-05 warm cache indicator の対象期間表示とカレンダー marker を改善する

- 目的:
  - indicator の `31日` だけでは対象期間が読み取りにくいため、開始日と終了日を明示する。
  - 完了日数がしばらく 0 のままでも、取得が進んでいる日付をカレンダー上で確認できるようにする。
- スコープ:
  - indicator の status に `4/29〜5/29` のような対象日付範囲を表示する。
  - indicator に、完了日数とは別に一部取得済みの日数を `進行 n日` として表示する。
  - トップカレンダーの日付セル下端に、warm cache の状態 line を表示する。
  - line は、一部取得済みを青、完了を緑、取得エラーありを赤とする。
- 非目標:
  - warm cache の取得対象、取得順、request 間隔、完了定義を変更すること。
  - 取得対象を画面上で編集する UI を追加すること。
  - IndexedDB schema を変更すること。
- 受け入れ条件:
  - indicator で対象日数だけでなく対象日付範囲を確認できる。
  - 取得が一部進んだ stay_date が、完了前でもカレンダー上で line 表示される。
  - 完了した stay_date がカレンダー上で別色 line 表示される。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - indicator の status に `4/29〜5/29` 形式の対象日付範囲を表示するようにした。
  - 完了日数とは別に、完了前でも一部取得済みの日付数を `進行 n日` として表示するようにした。
  - カレンダー日付セル下端に warm cache line を追加した。
  - line は、一部取得済みを青、完了を緑、取得エラーありを赤で表示する。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認
  - トップカレンダー上で一部取得済み、完了、エラー line が実データに応じて表示されること

### RAU-AF-10 reference curve の 0日前表示補間を実装する

- 目的:
  - raw source 保存開始前の過去 stay_date で本当の `0日前` と `ACT` を分離できない場合でも、参考線の見た目が `ACT` 混入値に引っ張られすぎないようにする。
  - core logic、derived reference curve cache、予測評価 dataset には推測補完値を入れず、画面表示だけで補間値を使う。
- スコープ:
  - 対象は `直近型カーブ` と `季節型カーブ` の reference curve 表示だけとする。
  - `0日前` が欠損している、または `0日前` と `ACT` が同値で `1日前` と `ACT` に差がある場合、表示層で `1日前` と `ACT` の線形補間値を整数に丸めて描画する。
  - 補間値は Tooltip で補間値と分かるように表示する。
- 非目標:
  - current curve、直近同曜日補助線、core logic、derived reference curve cache の値を変更すること。
  - raw source 保存開始前の過去 stay_date について、本当の `0日前` を復元すること。
  - 予測モデルまたは予測評価ロジックを追加すること。
- 受け入れ条件:
  - reference curve の `0日前` が表示補間された場合でも、IndexedDB に保存される derived reference curve result は変更されない。
  - Tooltip で、表示補間された reference curve の値が補間値であることを確認できる。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`, `docs/spec_002_curve_core.md`
- 実装内容:
  - reference curve の表示用 series 生成時だけ、`0日前` の補間値を作るようにした。
  - `0日前` が欠損している場合、または `0日前` と `ACT` が同値で `1日前` と `ACT` に差がある場合に、`round(1日前 + (ACT - 1日前) * 0.5)` を表示値として使う。
  - 補間値は `SalesSettingBookingCurveSeries.interpolated` に表示用 marker として保持し、Tooltip に `（補間）` を出すようにした。
  - core logic、derived reference curve cache、raw source cache、current curve、直近同曜日補助線は変更していない。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認
  - 実データで `0日前` Tooltip に `（補間）` が表示されること

### RAU-WC-03 Analyze 日付優先 warm cache と reference 完了定義を実装する

- 目的:
  - Analyze 日付ページを開いたときに、利用者が見ている stay_date の booking curve 表示待ちを最優先で減らす。
  - warm cache の完了を current raw source だけでなく、直近型、季節型、同曜日補助線まで表示できる状態として扱う。
  - Indicator で対象月または対象範囲と、Analyze 日付の取得状況を percentage と件数で確認できるようにする。
- スコープ:
  - Analyze 日付ページでは、開いている stay_date、その週、その月、通常 warm cache 範囲の順に queue を並べる。
  - 同じ raw source key または derived reference curve key は重複 queue に入れない。
  - stay_date 単位の完了には、current 用 raw source、reference source raw source、直近型 derived reference curve、季節型 derived reference curve、同曜日 raw source を含める。
  - 同曜日補助線は、前後2週の raw source が IndexedDB に揃っていれば表示時に整形して描画する。derived cache は必須にしない。
  - Analyze 日付ページの indicator には、`この日 raw x% / 参考線 y% / 同曜日 z%` のように不足段階が分かる表示を出す。
  - Indicator には、対象範囲が単月なら対象月、複数月なら対象月の範囲を表示する。
  - request 間隔 2.5 秒以上、1 回最大 5 分、10 分クールダウン、document hidden 中の一時停止、連続エラー停止は維持する。
- 非目標:
  - 全過去日程を一括取得すること。
  - 同曜日補助線の derived cache を新設すること。
  - 競合価格 snapshot を同じ queue に含めること。
  - 自動レート変更へ接続すること。
- 受け入れ条件:
  - Analyze 日付ページを開いた直後、その stay_date の取得が通常範囲より優先される。
  - その stay_date、同週、同月、通常範囲の順に取得優先度が変わる。
  - current raw source だけでなく、直近型、季節型、同曜日補助線まで揃った日付を完了として indicator に表示できる。
  - Analyze 日付ページで、その日の raw source、reference curve、同曜日 raw source の取得状況を percentage と件数で確認できる。
  - 既存の current 先行表示、reference curve 非同期補完、同曜日 toggle、個人/団体 toggle を壊さない。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - warm cache task を `current raw`、`reference curve`、`same weekday raw` に分けた。
  - Analyze 日付ページでは、開いている stay_date、その週、その月、通常 warm cache 範囲の順に target stay_date を並べるようにした。
  - 同じ task key は queue 作成時に重複排除するようにした。
  - reference curve task は既存の reference curve core logic と derived cache store を使い、直近型と季節型を segment 別に計算保存するようにした。
  - 同曜日 task は前後2週の raw source を保存し、derived cache は作らない方針を維持した。
  - Indicator に対象月または対象範囲と、Analyze 日付の `raw / 参考線 / 同曜日` 取得率を表示するようにした。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認
  - Analyze 日付ページで、その日、同週、同月の順に取得が優先されること
  - Indicator の `raw / 参考線 / 同曜日` 取得率が実データに応じて進むこと

## Completed / Recent Implementation

### RAU-SALES-01 Analyze 日付単位の売上・単価データ取得可否を調査する

- 目的:
  - Analyze / 販売設定判断で、宿泊日単位の売上、販売室数、販売単価を扱える API または DOM 起点の data があるか確認する。
  - 競合価格 snapshot、booking curve room count、将来の単価表示を同じ stay_date 軸で比較できるか判断する。
- 調査結果:
  - `/api/v4/booking_curve` response は室数だけでなく、売上と ADR を含んでいた。
  - ホテル全体と室タイプ別 `rm_room_group_id` 指定の両方で、`all`、`transient`、`group` に `this_year_sales_sum`、`last_year_sales_sum`、`two_years_ago_sales_sum`、`three_years_ago_sales_sum`、`this_year_adr`、`last_year_adr` が含まれる。
  - 2026-04-30 のホテル全体では、`all.this_year_sales_sum=1218863`、`all.this_year_room_sum=138`、`all.this_year_adr=8896` が返った。
  - 2026-04-30 の室タイプ別シングルでは、`all.this_year_sales_sum=336508`、`all.this_year_room_sum=50`、`all.this_year_adr=6730` が返った。
  - 月次 `/api/v1/booking_curve/monthly?year_month=202606` は `sales_based` と `room_based` を返すが、予約日基準の月次系列であり、Analyze の stay_date 単位判断には `/api/v4/booking_curve` のほうが保存単位を揃えやすい。
- 結論:
  - Analyze 日付単位の売上と ADR の取得元は `API endpoint` として存在する。
  - 新規取得 endpoint や DOM scraping を追加する前に、既存 booking curve raw source の adapter と表示用 model を拡張する。
  - 保存単位は既存 `/api/v4/booking_curve` raw source と同じ `facility`、`stay_date`、`batch_date`、scope、room group、endpoint、query を使う。
  - 単価は API の `this_year_adr` / `last_year_adr` を第一候補とし、必要な場合だけ `sales_sum / room_sum` の再計算値と差分確認する。
- 非目標:
  - この task では snapshot store、UI、グラフ表示を実装しない。
  - 競合価格グラフへ売上や単価を重ねない。
  - DWH や外部 RMS 連携を前提にしない。
- verify:
  - Chrome CDP で `/api/v4/booking_curve?date=20260623`、`/api/v4/booking_curve?date=20260430`、`/api/v4/booking_curve?date=20260430&rm_room_group_id=<id>`、`/api/v1/booking_curve/monthly?year_month=202606` を確認した。
  - `docs/spec_001_analyze_expansion.md` と `docs/context/DECISIONS.md` に取得元と判断を反映した。

### RAU-CP-09 競合価格 background 取得中に表示中グラフが揺れるバグを修正する

- 目的:
  - 前回データがある stay_date で競合価格 background queue が動いている間も、表示中の競合価格グラフを現在開いている stay_date の系列に固定する。
  - 周辺日程の取得中に、前回データが見えたり見えなかったり、表示対象日が切り替わって見える状態を防ぐ。
- スコープ:
  - background queue から呼ぶ競合価格 snapshot 保存では、indicator の進捗だけを更新し、`competitorPriceSnapshotUiState` の `stayDate`、`records`、`latestRecord`、`previousRecord` を更新しない。
  - Analyze open と競合価格 tab の現在 stay_date 保存では、従来どおり表示中グラフの state を更新する。
- 非目標:
  - 競合価格グラフの表示形式、横軸、Tooltip、保存 schema を変更すること。
- 受け入れ条件:
  - background queue 実行中も、競合価格グラフの `対象宿泊日` が現在開いている stay_date から周辺日程へ切り替わらない。
  - background queue 実行中も、保存済みの前回データ系列が一時的に消えない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: no
  - `spec-checkpoint`: not-needed
  - `target-spec`: none
- 実装内容:
  - `runCompetitorPriceSnapshotSave()` に `updateVisibleState` option を追加し、background queue からの保存では visible state 更新を無効化した。

### RAU-CP-08 競合価格 background queue の indicator 進捗を表示する

- 目的:
  - 同週、同月の競合価格 snapshot 取得が進んでいるか、止まっているかを indicator で判断できるようにする。
  - 競合価格 data が増える前段として、取得進捗と表示確認の前提を利用者が追える状態にする。
- スコープ:
  - Indicator の競合価格 status に、周辺日程の取得中、完了、停止を表示する。
  - 詳細には対象範囲、現在取得中の stay_date、完了日数、対象日数を表示する。
  - Analyze 日付変更や Analyze 外への遷移では、古い background queue と進捗表示を reset する。
- 非目標:
  - 直近 30 日の取得を追加すること。
  - 競合価格グラフの横軸ラベル間引き、期間フィルタ、表示点数制限を追加すること。
- 受け入れ条件:
  - 競合価格 tab 起点の background queue 実行中に、indicator が `競合価格: 周辺日程取得中 n / m日` を表示する。
  - 詳細表示に、周辺日程の対象範囲と現在取得中の stay_date が出る。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - `CompetitorPriceSnapshotBackgroundProgress` を追加し、background queue の total、processed、currentTask、対象範囲、停止理由を indicator へ渡すようにした。
  - Analyze 日付変更や Analyze 外への遷移時に、background queue、task key、progress、timeout を reset するようにした。

### RAU-CP-07 競合価格タブ起点で同週、同月の snapshot を background 取得する

- 目的:
  - 競合価格 tab を開いた stay_date の比較意図を起点に、同週、同月の競合価格 snapshot を少しずつ厚くする。
  - 取得対象を広げても、booking curve warm cache の queue、完了定義、indicator の基本挙動とは分離する。
- スコープ:
  - 競合価格 tab 起点で現在の stay_date の 6 snapshot を保存した後、同週、同月の順に background queue を作る。
  - 各 stay_date では `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 snapshot を保存する。
  - document hidden、別 Analyze 日付への遷移、batch date や facility cache key の変更を検知した場合は background queue を停止する。
- 非目標:
  - Analyze open だけで同週、同月、直近 30 日を取得すること。
  - 直近 30 日の競合価格 snapshot queue を追加すること。
  - booking curve warm cache queue に競合価格 task を混ぜること。
- 受け入れ条件:
  - 競合価格 tab を開いた stay_date の保存後、同週、同月の別 stay_date に対する `/api/v5/competitor_prices` request が発行される。
  - background queue の各 stay_date request に、`指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` が含まれる。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - 競合価格 snapshot 保存処理を `runCompetitorPriceSnapshotSave()` に切り出し、現在 stay_date の保存完了後に同週、同月の background queue を積むようにした。
  - background queue は booking curve warm cache とは別に持ち、1 task ずつ `COMPETITOR_PRICE_SNAPSHOT_BACKGROUND_INTERVAL_MS` 間隔で進めるようにした。

### RAU-CP-06 Analyze open の競合価格 snapshot 粒度を部屋タイプ別まで揃える

- 目的:
  - Analyze 画面を開いた日程について、競合価格 tab を開いたかどうかで snapshot 粒度が変わらないようにする。
  - 現在開いている宿泊日は料金判断対象である可能性が高いため、`指定なし` だけでなく、部屋タイプ別 snapshot も同じタイミングで保存する。
- スコープ:
  - Analyze open 起点でも、`指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 snapshot を保存する。
  - `指定なし` snapshot は継続し、`SEMI_DOUBLE` と raw room type が空のその他相当 plan を保持する。
  - 表示側は、指定なし表示では `指定なし` snapshot を優先し、部屋タイプ toggle 選択時は対応する `jalan_room_types[]` snapshot を優先する既存仕様を維持する。
- 非目標:
  - 同週、同月、直近 30 日の競合価格 snapshot queue を追加すること。これは request 数、booking curve warm cache との優先順位、停止条件を別途設計してから行う。
  - booking curve warm cache より競合価格 snapshot を優先すること。
- 受け入れ条件:
  - Analyze 画面を開いた日程で、`/api/v5/competitor_prices` の request に `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` が含まれる。
  - 競合価格 tab を開かなくても、現在日程の部屋タイプ別 snapshot が保存される。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - `persistCompetitorPriceSnapshotsForSource()` の source 分岐をなくし、`analyze-open` と `competitor-tab` のどちらでも同じ 6 snapshot を保存するようにした。

### RAU-CP-05 競合価格の部屋タイプ別 snapshot を個別取得する

- 目的:
  - 既存の `指定なし` 競合価格 snapshot は継続しつつ、シングル、ダブル、ツイン、トリプル、フォースを個別条件で追加取得し、部屋タイプ絞り込み時の欠損を減らす。
  - `指定なし` snapshot を継続する理由は、Revenue Assistant の部屋タイプ絞り込み選択肢には独立して存在しない `SEMI_DOUBLE` や、raw room type が空のその他相当 plan が、最安値として返る場合があるためである。
- 背景:
  - 2026-05-01 の Chrome CDP 調査で、`jalan_room_types[]=TWIN` を単独指定すると、指定なし response では返らなかった TWIN plan が返ることを確認した。
  - `jalan_room_types[]=TWIN&jalan_room_types[]=DOUBLE` のように複数部屋タイプを同時指定しても、各部屋タイプの plan がすべて返るわけではなく、指定集合内の最安値寄りに絞られる挙動だった。
  - `jalan_facility_room_types[]`、`jalan_facility_room_type`、`room_types[]` は部屋タイプ条件として効かなかった。
  - `SINGLE` 単独指定で `SEMI_DOUBLE` が返る場合はあるが、通常は `SINGLE` の最安値が優先して表出しやすい。`SINGLE` 在庫がない場合や、その他相当 plan が最安値になる場合を後から確認できるように、`指定なし` snapshot も保存対象として残す。
- スコープ:
  - 従来の `指定なし` snapshot 取得を継続する。
  - 競合価格 snapshot 取得条件に、`jalan_room_types[]` の単独指定を持たせる。
  - 取得対象は `SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` とする。
  - `指定なし` snapshot と部屋タイプ別 snapshot は検索条件 signature で区別する。部屋タイプ別 snapshot は `指定なし` snapshot の補助であり、置き換えではない。
  - グラフの部屋タイプ toggle で該当部屋タイプが選ばれた場合は、該当 room type snapshot を優先して使う。
  - グラフ Tooltip は、施設名、部屋タイプ、価格、前回差分を表形式で表示する。部屋タイプは実際に response で返った `jalanFacilityRoomType` を表示名へ正規化して出す。
  - request 数が増えるため、初期実装では競合価格 tab を開いた stay_date を優先し、通常 warm cache の広い対象日付へは混ぜない。
- 非目標:
  - `SEMI_DOUBLE` を単独 request 条件にすること。2026-05-01 の調査では `SEMI_DOUBLE` は `400 BAD_REQUEST` だった。`SEMI_DOUBLE` は `指定なし` snapshot、または `SINGLE` request の response に含まれた plan として保持する。
  - Revenue Assistant の部屋タイプ絞り込み選択肢に存在しないその他相当の部屋タイプを、独立した request 条件として扱うこと。raw room type が空の plan は `指定なし` snapshot で保持する。
  - 複数部屋タイプを 1 request で網羅取得できる前提にすること。
  - 競合施設一覧なしの全件取得を追加すること。
- 受け入れ条件:
  - 従来の `指定なし` snapshot が引き続き保存され、`SEMI_DOUBLE` や raw room type が空のその他相当 plan が失われない。
  - `SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の単独条件 snapshot を保存できる。
  - `TWIN` などの部屋タイプ toggle 選択時、指定なし snapshot だけでは欠けていた施設の plan が、部屋タイプ別 snapshot から表示される。
  - 条件 signature に `jalan_room_types[]` の単独指定が含まれ、指定なし snapshot と混同されない。
  - Tooltip に、施設名、部屋タイプ、価格、前回差分が表示される。
  - API request は同時に大量発行せず、既存の競合価格 tab 優先取得と indicator 表示を壊さない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - `CompetitorPriceSnapshotSearchCondition` に `jalanRoomTypes` を追加し、`jalan_room_types[]` 単独指定を検索条件 signature と request query に含められるようにした。
  - 初期実装では Analyze open 起点は従来どおり `指定なし` snapshot だけを保存し、競合価格 tab 起点では `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 snapshot を保存するようにした。この取得タイミングは `RAU-CP-06` で Analyze open 起点も 6 snapshot に拡張した。
  - 取得日ごとの代表 snapshot は、指定なし表示では `指定なし` snapshot を優先し、部屋タイプ toggle 選択時は対応する `jalan_room_types[]` snapshot を優先するようにした。
  - `SEMI_DOUBLE` は単独 request せず、response に含まれた plan として保持する。表示名は `セミダブル` として扱う。
  - Tooltip に `部屋タイプ` 列を追加し、最安値として採用した plan の実際の `jalanFacilityRoomType` を表示するようにした。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
- GUI 確認:
  - 2026-05-01 に Chrome CDP で build 済み `dist/revenue-assistant-userscript.user.js` を `https://ra.jalan.net/analyze/2026-06-17` へ注入して確認した。
  - 競合価格 tab を開いたとき、`/api/v5/competitor_prices` の request に `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` が含まれることを確認した。
  - console log で `storedCount: 6` を確認し、競合価格 tab 起点で 6 snapshot が保存されたことを確認した。

## Recently Completed / GUI Confirmed

### RAU-MP-01 月次実績画面の LT 基準 custom booking curve を再開する

- 目的:
  - 追加済み route-scoped slice、IndexedDB write-only snapshot、2 カラム multi-month chart を、どこまで final graph へ寄せるか判断する。
- 現状:
  - `/monthly-progress/YYYY-MM` は、既存 top / analyze の同期系から切り離す route-scoped scaffold を追加済み。
  - monthly-progress 専用 storage namespace と kill switch `localStorage["revenue-assistant:feature:monthly-progress:enabled"] = "0"` を持つ。
  - `/api/v1/booking_curve/monthly` の response は、`facilityCacheKey + yearMonth + batchDateKey` ごとの IndexedDB snapshot として保存済み。
  - 現在の preview は、同じ batch date の snapshot がなければ API 取得して保存し、その後 `readLatestMonthlyBookingCurveSnapshot()` で保存済み snapshot を読む。過去 batch の履歴比較や日次差分表示にはまだ使っていない。
  - 予約日基準 chart 直下へ、month-end anchor の LT bucket 集約 preview chart を独立 section として差し込み済み。
  - preview chart は、`販売客室数` panel、`販売単価 / 売上` 切替 panel、対象月から未来 4 か月の同時表示、`前年 / 前々年 / 3年前` compare 切替、hover tooltip を持つ。
- 次に確認すること:
  - 現在の `/monthly-progress/YYYY-MM` 画面で preview section が Revenue Assistant 標準 chart と干渉していないか。
  - LT bucket 集約が、月次実績画面で見たい「月末に向けた予約日基準の積み上がり」として読めるか。
  - 2 panel 構成、4 か月同時表示、`前年 / 前々年 / 3年前` compare、`販売単価 / 売上` 切替を final graph に残す前提で、表示密度と tooltip が実画面で読めるか。
  - IndexedDB snapshot は現在 batch の表示 read path として使う。次に検討するのは、過去 batch の履歴比較や日次差分表示へ使う必要があるかどうかである。
- 保留理由:
  - 現時点では Analyze 日別の rooms-only reference curve のほうが、部屋タイプ別レート調整の判断コストを直接下げるため優先度が高い。
- 非目標:
  - Analyze 日付ページ、競合価格 graph、booking curve warm cache の挙動変更。
  - 売上・ADR の表示活用。これは `RAU-SALES-02` として forecast bundle の後段で扱う。
  - rooms-only 予測モデルの実装。これは `RAU-FC-02` の evaluation dataset / `ForecastResult v1 candidate` 設計後に扱う。
- 受け入れ条件:
  - 月次実績画面の現状実装、残す UI、直す UI、実装しない範囲が明文化される。
  - 次の実装 slice が、対象ファイル、保持する既存挙動、最小 verify とともに 1 つに絞られる。
  - 実装へ進む前に `docs/spec_000_overview.md` の更新要否が判断される。
- 現時点の判断:
  - 残す UI は、予約日基準 chart 直下の独立 section、月末 anchor の LT bucket 集約、`販売客室数` panel、`販売単価 / 売上` 切替 panel、対象月から未来 4 か月の同時表示、`前年 / 前々年 / 3年前` compare、hover tooltip とする。
  - 直す可能性がある UI は、実画面での挿入位置、表示密度、説明文、tooltip、2 panel layout に限定する。
  - 実装しない範囲は、Analyze 日付ページ、競合価格 graph、booking curve warm cache、売上・ADR の予測活用、rooms-only 予測モデル、過去 batch の履歴比較、月次 read path の履歴正本化である。
- レスポンス改善:
  - 既定の `前年` compare では、対象月から未来 4 か月の current snapshot だけで表示できる。current snapshot の `lastYearSum` を使えば、前年比較に必要な値を追加 API request なしで得られるためである。
  - `前々年` compare を選んだ場合だけ、対象月から 12 か月前の snapshot を追加取得し、その snapshot の `lastYearSum` を前々年値として使う。
  - `3年前` compare を選んだ場合だけ、対象月から 12 か月前と 24 か月前の snapshot を追加取得し、24 か月前 snapshot の `lastYearSum` を 3年前値として使う。
  - 表示に使わない比較年 snapshot を先に取得しないことで、初期表示前の直列 request 数を減らす。IndexedDB schema、snapshot key、LT bucket 算出、UI 契約は変更しない。
- 切替 UX 改善:
  - compare button と `販売単価 / 売上` button は、click 直後に押した選択肢を active 表示へ切り替える。
  - compare 切替で追加 snapshot 取得が発生している間は、preview section 内に更新中 status を表示する。
  - 連続 click で複数の非同期 sync が走った場合は、最後に開始した sync だけを描画対象にする。古い sync が後から完了しても、画面を古い選択状態へ戻さない。
- 画面 open 直後の取得改善:
  - `/monthly-progress/YYYY-MM` に入った直後に、対象月から未来 4 か月と、現在選択中の compare に必要な比較月の snapshot prefetch を background で開始する。
  - compare 切替時も、選択後の表示に必要な snapshot prefetch を先に開始する。
  - prefetch と preview 描画側の取得は、既存の `persistMonthlyBookingCurveSnapshot()` の pending map で同じ snapshot key ごとに dedupe する。同じ `facilityCacheKey + yearMonth + batchDateKey` を重複 request しない。
  - prefetch は表示を直接描画しない。表示は従来どおり `syncMonthlyProgressPreview()` が snapshot read path から作る。
- 次の実装 slice:
  - なし。`RAU-MP-01` は GUI 確認済みで、現時点では追加実装へ進めない。
  - 月次の過去 batch 履歴比較、日次差分表示、表示密度の追加調整は、利用者が必要性を再確認した場合に別 task として切る。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
- GUI 確認:
  - 利用者が Tampermonkey 更新後に `/monthly-progress/YYYY-MM` を目視確認した。
  - 追加確認として、Chrome CDP で `https://ra.jalan.net/monthly-progress/2026-05` に接続し、LT preview root、`LTブッキングカーブ` heading、2 panel、2 SVG、compare button、`販売単価 / 売上` button が存在することを確認した。
  - compare button click 直後に、押した年の active 表示、`比較年を更新中`、`aria-busy=true` を確認した。
  - 取得済み snapshot がある場合、更新中 status は短時間で消え、2 panel / 2 SVG 表示へ戻ることを確認した。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_000_overview.md`

## Completed

### RAU-CP-01 競合価格推移 snapshot の価値と保存単位を設計する

- 完了日: 2026-04-30
- 調査結果:
  - Analyze 日付ページで、Revenue Assistant 画面本体が `GET /api/v5/competitor_prices` を呼ぶことを Chrome CDP で確認した。
  - request header には `x-requested-with: XMLHttpRequest` が必要である。同じ URL でも、この header がない同一 origin `fetch` は `400 BAD_REQUEST` になった。
  - request query は、`date`、`min_num_guests`、`max_num_guests`、`meal_types[]`、`search_jalan_plan_name_contains`、`yad_nos[]` を含む。
  - `yad_nos[]` なし、宿泊人数範囲なし、`date` のみ、`max_num_guests=10` は `400 BAD_REQUEST` になった。
  - `meal_types[]` は省略可能で、省略すると `NONE`、`BREAKFAST`、`DINNER`、`BREAKFAST_DINNER` を含む response が返った。
  - response root は `own` と `competitors` を持つ。plan は `num_guests`、`meal_type`、`plan_name`、`jalan_facility_room_type`、`url`、`price`、`price_diff` を持つ。
  - response には在庫状態、販売停止、満室、ページング情報は含まれなかった。
- 判断:
  - 競合施設一覧なしの広い raw snapshot は初期方式にしない。
  - 初期 snapshot は、`date`、宿泊人数範囲、競合施設一覧、任意の食事条件、任意のプラン名検索条件から作る検索条件 signature ごとに保存する。
  - 次の実装 slice は `RAU-CP-02` の snapshot store と取得 adapter とする。
- verify:
  - Chrome CDP で Analyze 日付ページの Network request、headers、response shape を確認した。
  - `docs/spec_001_analyze_expansion.md` と `docs/context/DECISIONS.md` に観測結果を反映した。

### RAU-WC-04 warm cache の取得速度を安全弁つきで引き上げる

- 目的:
  - 参考線込みの warm cache 完了までの時間を短縮する。
  - API 負荷が危険にならないよう、停止条件とクールダウンを残したまま速度を上げる。
- スコープ:
  - request 間隔を 2.5 秒から 1.0 秒へ短縮する。
  - 1 回の自動稼働時間を 5 分から 10 分へ延ばす。
  - クールダウンを 10 分から 3 分へ短縮する。
  - IndexedDB raw source が既存のため skip できる task は、API request を発行しないため次 task へ即時に進める。
  - 同時 warm cache task 実行 1、reference curve request scheduler の同時数制限、document hidden 中の一時停止、連続エラー 3 回停止は維持する。
- 非目標:
  - 同時 warm cache task 実行数を 2 以上に増やすこと。
  - 連続エラー停止や hidden pause を外すこと。
  - Revenue Assistant API の response を無制限に取りに行くこと。
- 受け入れ条件:
  - skip task は 1 秒待たずに進む。
  - API request を伴う task は 1.0 秒以上の間隔を置く。
  - 10 分稼働後は 3 分以上クールダウンしてから再開する。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認
  - skip task が即時に進み、API request を伴う task が 1.0 秒以上の間隔を保つこと

### RAU-WC-02 warm cache indicator をトップカレンダーと日付単位進捗に広げる

- 目的:
  - Analyze 日付ページを開く前でも、トップカレンダーを開いている状態で booking_curve raw source の warm cache を進められるようにする。
  - 取得状況 indicator で、task 件数だけでなく stay_date 単位の取得済み範囲を確認できるようにする。
  - 1 回の自動稼働上限に達した場合でも、クールダウン後に自動再開できるようにする。
- スコープ:
  - warm cache の対象日付、取得順、IndexedDB raw source key、request 間隔は `RAU-WC-01` の仕様を維持する。
  - 起動条件を Analyze 日付ページだけでなく、トップカレンダーを含む calendar 表示中にも広げる。
  - indicator は完了済み stay_date の連続範囲、現在取得中の stay_date と scope、保存数、skip 数、クールダウン再開目安を表示する。
  - stay_date 単位の完了は、その stay_date のホテル全体と全室タイプが取得済みまたは skip 済みになった状態を指す。
- 非目標:
  - 取得対象日付や部屋タイプを画面上で編集できる UI を追加すること。
  - 日次合計稼働時間を制限すること。
  - 全過去日程や競合価格 snapshot を同じ queue に含めること。
- 受け入れ条件:
  - トップカレンダー表示中でも warm cache indicator が表示され、queue が進む。
  - Analyze 日付ページでも既存の current、reference curve、同曜日補助線、個人/団体 toggle を妨げない。
  - indicator で完了済み stay_date 範囲を確認できる。
  - 1 回の自動稼働上限に達した場合は、クールダウン中表示になり、自動再開する。
  - hidden、連続エラー停止の既存制限は維持される。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - warm cache の起動対象をトップカレンダーにも広げた。
  - queue の対象日付は `asOfDate + 0日` から `asOfDate + 30日` までに揃えた。
  - indicator の進捗を task 件数ではなく、完了済み stay_date 数と完了済み stay_date 範囲で表示するようにした。
  - 1 回の自動稼働上限に達した場合は、10 分クールダウン後に自動再開するようにした。
  - 日次合計稼働時間の上限を撤廃した。
  - document hidden、連続エラー停止は停止条件として維持した。
  - hidden pause 後に `visibilitychange` が発火しない復帰ケースへ対応するため、`pageshow` と `focus` でも warm cache drain を再開するようにした。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
- 未確認:
  - 修正後 dist を Tampermonkey へ再読込した後の GUI 目視確認
  - 実ブラウザ上でトップカレンダー表示中に indicator が `取得中` へ復帰し、日付単位完了範囲が進むこと
  - クールダウン後自動再開の確認

### RAU-WC-01 booking_curve warm cache queue と indicator を実装する

- 目的:
  - Analyze 日付ページを開いた状態で、近い stay_date からホテル全体と全室タイプの booking curve raw source を少しずつ IndexedDB に保存し、次回以降の current、reference curve、同曜日補助線の表示待ちを減らす。
  - API request 数を時間と間隔で制限し、取得状況を indicator で明示する。
- スコープ:
  - 対象 stay_date は初期実装では `today + 0日` から `today + 30日` までとする。
  - 取得順は stay_date が近い順とし、同じ stay_date 内ではホテル全体、全室タイプの順に取得する。
  - warm cache の差分更新は、現在の `asOfDate` で未保存の raw source key だけを取得することとする。
  - 同じ `facilityId + stayDate + asOfDate + scope + roomGroupId + endpoint + query + schema` が IndexedDB に存在する場合は skip する。
  - 同時取得数は 1、request 間隔は 2.5 秒以上、1 回の自動稼働は最大 5 分を初期値にする。
  - document hidden 中は一時停止し、連続エラー時も一時停止する。
  - Indicator に `待機中`、`取得中 current / total`、`一時停止中`、`上限到達`、`エラー n` を表示する。
- 非目標:
  - 全過去日程を一括取得すること。
  - reference curve の derived cache を warm cache 側で直接作成すること。
  - 競合価格 snapshot を同じ task で扱うこと。
  - 自動レート変更へ接続すること。
- 受け入れ条件:
  - IndexedDB に現在の `asOfDate` で未保存のホテル全体と室タイプ別 raw source だけが順番に保存される。
  - 既存 raw source がある key では API request を発行しない。
  - request が同時に 2 本以上走らない。
  - request 間隔、1 回稼働時間、1 日稼働時間の上限が守られる。
  - Indicator で現在の状態、進捗、停止理由、エラー数を確認できる。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
  - Tampermonkey 再読込後に Analyze 日付ページで、通常の current 表示、reference curve、同曜日 toggle、個人/団体 toggle が維持される。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - Analyze 日付ページ同期後に warm cache queue を作成する。
  - queue は `today + 0日` から `today + 30日` まで、各 stay_date でホテル全体、全室タイプの順に並べる。
  - IndexedDB raw source に同じ key が存在する場合は skip する。
  - 未保存 key は既存の raw source read/write path を使って取得し、IndexedDB に保存する。
  - 同時取得数は 1、request 間隔は 2.5 秒以上、1 回稼働時間は最大 5 分とする。日次合計稼働時間の上限は後続の `RAU-WC-02` で撤廃した。
  - document hidden 中は一時停止し、連続エラー時も一時停止する。
  - 画面右下に取得状況 indicator を表示する。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認
  - 実ブラウザ上で request 間隔、skip、hidden pause の挙動確認

### RAU-AF-09 直近同曜日カーブを既定OFFの補助線として追加する

- 目的:
  - `直近型カーブ` の平均線が、実在した近い同曜日 stay_date の booking curve と大きくずれていないかを確認できるようにする。
  - current の前後2週の同曜日カーブを、必要なときだけ補助線として重ねる。
- スコープ:
  - 対象 stay_date は `-14日`、`-7日`、`+7日`、`+14日` を初期候補にする。
  - 既定表示は OFF とし、toggle で表示する。
  - 同曜日補助線は薄いグレーの細い破線にする。
  - 凡例ではまとめて `同曜日` と表示し、hover 時に対象 stay_date と前後何週かを確認できるようにする。
  - current、直近型、季節型より視覚優先度を下げる。
- 非目標:
  - 同曜日補助線を既定 ON にすること。
  - 直近型または季節型の算出ロジックを置き換えること。
  - 競合価格や予測モデルを追加すること。
- 受け入れ条件:
  - 初期表示では同曜日補助線が表示されない。
  - toggle ON で、取得可能な前後2週の同曜日カーブが重なる。
  - 同曜日補助線は current と reference curve の判読を妨げない。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
- 実装内容:
  - booking curve header に `同曜日` toggle を追加した。
  - toggle は既定 OFF とし、OFF の間は前後2週の追加 booking_curve 取得を行わない。
  - toggle ON のとき、target stay_date の `-14日`、`-7日`、`+7日`、`+14日` の同曜日 booking curve を補助線として表示する。
  - 補助線は薄いグレーの細い破線とし、current と reference curve より先に描画することで主判断線を邪魔しないようにした。
  - ホテル全体 block は toggle ON 時に取得し、室タイプ別 card は開いている card だけ取得する。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認

### RAU-AF-08 booking curve の個人/団体 toggle を実装する

- 完了日: 2026-04-26
- 実施内容:
  - booking curve の second panel を、既定 `個人`、必要時 `団体` に切り替える toggle として実装した。
  - `団体` 選択時は、current、直近型、季節型、rank marker tooltip の対象 segment を `group` に切り替える。
  - `全体` panel は常時表示のまま維持した。
  - toggle 状態は画面内 memory で保持し、Revenue Assistant 側の再描画や本 userscript の再同期では維持する。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run chrome:pages`: CDP 接続で Analyze 日付ページが開いていることを確認
- 未確認:
  - Tampermonkey 再読込後の GUI 目視確認

## Rank Recommendation Bundle

この section は、トップ料金調整候補リスト、推奨ランク方向、user decision、cooldown、rank response、future bulk apply に関する task をまとめる。仕様正本は `docs/spec_003_rank_recommendation_signal.md` とする。

`RAU-FC-01` の rooms-only 予測モデル導入判断とは重なる部分があるが、rank recommendation は UI、候補 lifecycle、user decision、rank history、rank response、future bulk apply を含む独立した bundle として扱う。`RAU-FC-01` の結論後も、first phase では forecast model を必須入力にしない。reference curve からの差分、capacity、remaining rooms、transient / group 分解、直近 rank change、競合価格 snapshot、sales / ADR の保存契約を使い、RM の作業キューを先に作る。

### RAU-RR-01 rank recommendation signal spec を整備する

- 状態:
  - 2026-05-27 の docs-only 整備で完了。
  - 2026-05-27 の追補で、背景・意図を後続セッションが会話なしで復元できる粒度へ補強した。
- 目的:
  - トップ料金調整候補リスト、推奨ランク方向、user decision、candidate lifecycle、rank response、future bulk apply の正本仕様を作る。
- 背景:
  - 会話内容は正本ではないため、次の Codex セッションや別 ChatGPT セッションが GitHub 経由で再開できるように、背景、意図、仕様候補、実装順序、未確認論点を repo 内 docs へ反映する必要がある。
- スコープ:
  - `docs/spec_003_rank_recommendation_signal.md` を作成する。
  - `docs/spec_000_overview.md`、`docs/context/INTENT.md`、`docs/context/DECISIONS.md`、`docs/context/STATUS.md`、`docs/tasks_backlog.md` を同期する。
  - 推奨レート金額ではなく推奨ランク方向を first wave にする理由を正本化する。
  - トップ候補リスト、様子見 cooldown、対応不要、sales / ADR raw source、rank response、future bulk apply の判断理由を正本化する。
  - 団体と個人の分離、小キャパの扱い、forecast との関係を、実装 task の前提として読める粒度で正本化する。
- 非目標:
  - コード実装。
  - Revenue Assistant API の新規調査。
  - Tampermonkey や `dist/*.user.js` の更新。
- 受け入れ条件:
  - `docs/spec_003_rank_recommendation_signal.md` に、目的、背景、scope、data source、recommendation unit、user decisions、priority、rank response、UI、lifecycle、future bulk apply、open questions が記載されている。
  - `docs/spec_003_rank_recommendation_signal.md` に、推奨レートではなく推奨ランク方向を優先する理由、トップにリストを置く理由、様子見 cooldown が必要な理由、sales / ADR 保存を進める理由、一括反映を first phase に入れない理由、団体と個人を分ける理由、小キャパを別扱いする理由、forecast との関係が明記されている。
  - overview、INTENT、DECISIONS、STATUS、backlog が同じ方向を指している。
  - 未確認 API が確認済み仕様として書かれていない。
  - `git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`
  - `open-spec-questions`: なし。後続の API 調査論点は `RAU-RR-03` 以降で扱う。

### RAU-RR-02 booking_curve raw source に sales / ADR を保存する

- 状態:
  - 2026-05-27 に実装済み。
  - `compactBookingCurveResponse()` の保持対象を rooms / sales / ADR fields へ拡張した。
  - 保存 schema version は `booking_curve_raw_source:v2` へ上げた。IndexedDB object store と index 構造は変えていないため、IndexedDB database version は 1 のまま据え置いた。
  - 既存 `booking_curve_raw_source:v1` record は同じ IndexedDB に残るが、v2 の cache key では読まれない。トップカレンダーの保存済み raw source signal も v2 record だけを有効扱いにする。
  - 2026-05-28 に、Tampermonkey `0.1.0.235` を入れた通常 Chrome の Revenue Assistant で Analyze 日付ページ `https://ra.jalan.net/analyze/2026-06-17` を確認した。overall summary、rank overview、ホテル全体 booking curve 2 SVG、室タイプ別 toggle、シングル card booking curve 2 SVG、console error 0 件を確認した。
  - 2026-05-28 に、既存 Chrome profile を `remote-debugging-port=9222` 付きで再起動し、CDP 経由で Revenue Assistant origin の IndexedDB を確認した。`booking_curve_raw_source:v2` record 192 件すべてで、`booking_curve[]` 配下の `all`、`transient`、`group` に `this_year_sales_sum`、`last_year_sales_sum`、`two_years_ago_sales_sum`、`three_years_ago_sales_sum`、`this_year_adr`、`last_year_adr` が保持されていた。値は出力していない。`two_years_ago_adr`、`three_years_ago_adr` は optional 許容のみで、今回の観測 record には存在しなかった。
- 目的:
  - `/api/v4/booking_curve` response に含まれる sales / ADR を、raw source 保存で落とさず保持する。
  - rank response、ADR / sales health、将来の単価予測、将来の売上予測で使える入力証跡を作る。
- 背景:
  - `RAU-SALES-01` で、`/api/v4/booking_curve` response に `this_year_sales_sum`、過去年売上、`this_year_adr`、`last_year_adr` が含まれることを確認済みである。
  - 2026-05-27 の現状確認では、`src/main.ts` の `compactBookingCurveResponse()` が `this_year_room_sum`、`last_year_room_sum`、`two_years_ago_room_sum`、`three_years_ago_room_sum` だけを残し、sales / ADR を落としている。
  - raw source と呼ぶ保存契約を維持するなら、表示用 compact と raw source 保存の責務を分けるか、compact 対象を sales / ADR まで拡張する必要がある。
- スコープ:
  - `compactBookingCurveResponse()` の責務は、Revenue Assistant response 全文の保存ではなく、RAU が扱う booking curve fields を保持する compact source 作成に寄せる。
  - schema version を `booking_curve_raw_source:v2` へ上げる。
  - `all`、`transient`、`group` の rooms / sales / ADR field を保存対象に含める。
  - 既存 raw source read path と reference curve adapter が、rooms だけを使う挙動を維持できるか確認する。
- 非目標:
  - sales / ADR の UI 表示を追加しない。
  - 単価予測や売上予測 model をこの task で実装しない。
  - 月次 `/api/v1/booking_curve/monthly` の read path を変更しない。
  - Revenue Assistant 外の保存先を追加しない。
- 受け入れ条件:
  - IndexedDB raw source record に、`all`、`transient`、`group` の sales / ADR field が保存される。
  - 保存 schema version を変える場合、cache key と既存 record との混在条件が説明されている。
  - reference curve、warm cache、current curve 表示が rooms field を従来どおり読める。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`, `docs/spec_001_analyze_expansion.md`, `docs/spec_002_curve_core.md`
  - `open-spec-questions`: なし。schema version は `booking_curve_raw_source:v2`、保存方式は rooms / sales / ADR fields までの compact source 維持、IndexedDB database version は据え置きとする。

### RAU-RR-03 current rank / rank ladder / rank price table の取得可否を browser trace で調査する

- 状態:
  - 2026-05-28 実施済み。
  - `/api/v1/suggest/output/current_settings` から `latest_current.price_rank_code` と `latest_current.price_rank_name` を取得できるため、current rank は `stayDate x roomGroup` 単位で取得可能と扱う。
  - `/api/v1/rank_sequences` から `price_rank_code`、`price_rank_name`、`default_sequence` を取得できるため、rank ladder 候補は取得可能と扱う。
  - `/api/v1/rank_colors` から rank 表示色候補を取得できる。
  - `/api/v1/plan_master/plan_rank_price` は `from=YYYYMMDD` で 200 応答を確認したが、観測範囲に実価格 field がなかったため、rank price table と現在販売中価格は未確認のまま扱う。
  - bundle 内に rank 反映系の POST endpoint 候補は見つかったが、実行していない。request shape、安全制約、権限差、error response、partial failure、同時更新時の挙動は未確認である。
- 目的:
  - rank recommendation で current rank、rank ladder、recommendedRank、future bulk apply を扱えるか判断するため、Revenue Assistant の実通信と画面状態を調査する。
- 背景:
  - 現行 docs では `/api/v1/suggest/output/current_settings` を capacity / remaining / max の取得に使っているが、current rank、rank ladder、rank price table が取れるかは未確認である。
  - 未確認 API を確認済み仕様として扱うと、推奨 rank 名、rank 上下関係、一括反映の安全制約を誤って設計する可能性がある。
- スコープ:
  - current rank の取得可否を確認する。
  - rank ladder と rank の上下関係の取得可否を確認する。
  - rank 別、日付別、部屋タイプ別 price table の取得可否を確認する。
  - Revenue Assistant への rank 反映 API の有無、request shape、安全制約を確認する。
  - browser-trace / browser-to-api を使う場合は、raw trace、HAR、request body、response body、credential、個人情報、予約情報、価格・在庫の非公開データを commit しない。
- 非目標:
  - rank 反映 API を実行しない。
  - 自動反映や bulk apply を実装しない。
  - 未確認 API の response body をそのまま docs へ保存しない。
- 受け入れ条件:
  - current rank、rank ladder、rank price table、rank 反映 API について、確認済み、未確認、取得不可、追加調査必要のどれかに分類されている。
  - docs に残す場合は、実データを削除または合成データへ置き換え、field 名、型、null 許容、optional 判定、confidence だけを反映している。
  - `docs/spec_003_rank_recommendation_signal.md` または `docs/context/DECISIONS.md` に、確認済み範囲と未確認範囲が反映されている。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`
  - `open-spec-questions`: rank price table と現在販売中価格の取得可否。rank reflection endpoint の request shape と安全制約。

### RAU-RR-04 トップ料金調整候補リスト UI shell を実装する

- 状態:
  - 2026-05-28 実装済み。
  - トップ画面に `料金調整候補` section を追加し、候補行は `stayDate x roomGroup` 単位で表示する。
  - `src/rankRecommendation.ts` に current settings ベースの仮候補生成を分離した。これは shell 表示用の初期判定であり、reference deviation scoring は `RAU-RR-05` で差し替える。
  - `Analyzeで確認` は Analyze URL への導線として表示する。対象 roomGroup focus は `RAU-RR-06` で扱う。
  - `様子見` と `対応不要` は表示するが、永続保存は `RAU-RR-07` まで disabled とする。
- 目的:
  - トップ画面に、RM が見るべき料金調整候補を優先度順に並べる UI shell を追加する。
- 背景:
  - トップカレンダー badge だけでは、どの日付と部屋タイプから作業するかを比較しにくい。
  - 候補リストは、`stayDate x roomGroup` 単位で作業順を提示する主導線である。
- スコープ:
  - トップ画面に料金調整候補リストの container を追加する。
  - 行項目として、優先度、宿泊日、部屋タイプ、現ランク、推奨方向、主要根拠、状態、Analyze 導線、様子見、対応不要を置く。
  - 初期表示件数を持たせる。候補は top 10 を第一候補にする。
  - warm cache marker、保存済み raw source signal、団体室数表示、最終変更表示と意味が混ざらない表示 layer にする。
- 非目標:
  - 推奨レート金額を表示しない。
  - 推奨 rank 名は、`RAU-RR-12` で rank ladder の扱いを確認するまでは表示必須にしない契約だった。`RAU-RR-12` 後は、current rank が `/api/v1/rank_sequences` の response 配列に存在し、隣接 rank がある場合に限り推奨 rank 名を表示してよい。
  - user decision の永続保存は `RAU-RR-07` で扱う。
  - rank change history による resolved 化は `RAU-RR-08` で扱う。
- 受け入れ条件:
  - トップ画面に料金調整候補リストが表示される。
  - 候補単位が `stayDate x roomGroup` として読める。
  - `Analyzeで確認` の導線がある。
  - 既存のトップカレンダー表示、団体室数、最終変更表示、warm cache indicator を壊さない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`
  - `open-spec-questions`: 初期 UI shell の挿入位置。候補 0 件時の表示。top 10 超過時の件数表示。

### RAU-RR-05 reference deviation ベースの初期 priority scoring を実装する

- 状態:
  - 2026-05-28 実装済み。
  - `booking_curve_raw_source:v2` の roomGroup raw source を読み、asOfDate 時点の `this_year_room_sum` と、`last_year_room_sum` / `two_years_ago_room_sum` / `three_years_ago_room_sum` の平均を `all`、`transient`、`group` ごとに比較する。
  - reference 欠損は推測で埋めず、`reference不足` と diagnostics に出す。
  - group が上振れ主因で transient が上振れていない場合は、個人価格 rank の上げ検討を `watch` へ抑制する。
  - forecast model と historical rank response はまだ使わない。
- 目的:
  - current booking curve と reference curve の差分を使い、最初の料金調整候補 priority と confidence を作る。
- 背景:
  - first phase では forecast model を必須にしない。
  - 既存の `直近型カーブ`、`季節型カーブ`、capacity、remaining rooms、transient / group 分解を使えば、推奨金額なしでも作業候補の優先順位を作れる可能性がある。
- スコープ:
  - demand pace deviation、final occupancy expectation、capacity / remaining-room urgency、LT urgency、transient contribution を初期 scoring の主入力にする。
  - group-driven penalty、small-capacity uncertainty、recent rank-change cooldown、data missing penalty を入れる。
  - 欠損理由は diagnostics に出し、推測補完しない。
  - `raise_watch`、`lower_watch`、`watch`、`not_eligible` など、断定度の高すぎない action へ落とす。
- 非目標:
  - 推奨レート金額を算出しない。
  - rank price table が未確認のまま recommendedRank 名を出さない。
  - historical rank response を本格 scoring に入れることは `RAU-RR-09` 以降に回す。
- 受け入れ条件:
  - 候補ごとに priority、confidence、reasonCodes、reasonFingerprint、diagnostics が生成される。
  - `all` が多くても group が主因の場合、個人価格 rank の上げ検討が抑制される。
  - 小キャパまたは reference curve 欠損では `not_eligible` または低 confidence になる。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`, `docs/spec_002_curve_core.md`
  - `open-spec-questions`: 初期 threshold、small capacity 判定、confidence の段階、reasonFingerprint の構成。

### RAU-RR-06 Analyze 遷移・対象 roomGroup focus 導線を実装する

- 状態:
  - 2026-05-28 実装済み。
  - `Analyzeで確認` click 時に `sessionStorage` へ pending focus を保存する。
  - Analyze 表示時に pending focus の stayDate が現在日付と一致する場合、対象 roomGroup card を開く、scroll する、highlight する。
  - focus 成功時は pending focus を消す。対象 card が見つからない場合は通常 Analyze 表示を維持し、console warning に診断を出す。
- 目的:
  - トップ候補リストから Analyze へ移動した利用者が、該当する日付と部屋タイプの根拠へ迷わず到達できるようにする。
- 背景:
  - トップは候補一覧と根拠要約の場であり、Analyze は詳細確認の場である。
  - リストから日付だけを開けても、対象 roomGroup card を探す手間が残る。
- スコープ:
  - `Analyzeで確認` で該当 stayDate の Analyze を開く。
  - sessionStorage などで pending focus を保持する。
  - Analyze 表示後に対象 roomGroup card を開く、scroll する、highlight する候補を実装する。
  - focus が失敗した場合は、通常 Analyze 表示を維持し、エラーで画面を壊さない。
- 非目標:
  - scoring を変更しない。
  - user decision の永続保存を実装しない。
  - Revenue Assistant の標準操作を送信しない。
- 受け入れ条件:
  - トップ候補リストから Analyze へ遷移できる。
  - 対象 roomGroup が特定できる場合、対象 card を開く、scroll する、highlight する。
  - 対象 card が見つからない場合、診断ログまたは UI status で不足理由を確認できる。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`, `docs/spec_001_analyze_expansion.md`
  - `open-spec-questions`: pending focus の保存形式。Revenue Assistant の SPA 遷移後に card DOM が安定するタイミング。

### RAU-RR-07 user snooze / dismissed decision と cooldown を保存する

- 状態:
  - 2026-05-28 実装済み。
  - `src/rankRecommendationDecisionStore.ts` に browser-local IndexedDB store を追加した。
  - `snooze` は LT 帯に応じた asOfDate 基準 cooldown を保存し、cooldown 中の同一 candidate を list から抑制する。
  - `dismiss` は同じ `stayDate x roomGroup x action x reasonFingerprint` の再表示を抑制する。
  - Chrome CDP 一時注入確認では、`様子見` click 後に候補行が 10 件から 9 件へ減り、検証用 decision record は確認後に削除した。
- 目的:
  - 利用者が `様子見` または `対応不要` と判断した recommendation を、候補リストに出し続けないようにする。
- 背景:
  - 同じ recommendation が出続けると、候補リストが作業キューではなくノイズになる。
  - 様子見は一時抑制、対応不要は同じ根拠の再表示抑制と false positive 候補であり、同じ状態として扱わない。
- スコープ:
  - `snoozed_by_user` と `dismissed_by_user` を保存する。
  - `cooldownUntil`、`snoozedUntilAsOfDate` または `snoozedUntil` を持つ。
  - `stayDate x roomGroup x action x reasonFingerprint` を再表示抑制の主 key にする。
  - priority、confidence、個人需要 pickup、残室率、競合価格、group-driven から transient-driven への変化、reasonFingerprint 変化時の再表示条件を扱う。
- 非目標:
  - rank change history による resolved 化は `RAU-RR-08` で扱う。
  - bulk apply は実装しない。
  - scoring model の本格改善は行わない。
- 受け入れ条件:
  - `様子見` を押した候補は、cooldown 中に active list へ出続けない。
  - `対応不要` を押した候補は、同じ reasonFingerprint で再表示されない。
  - 方向や主要根拠が大きく変わった場合は、再表示候補にできる。
  - user decision の履歴が後続評価に使える形で残る。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`
  - `open-spec-questions`: LT 帯別 cooldown 既定値。asOfDate 基準と実時間基準のどちらを主にするか。decision store の保存 namespace。

### RAU-RR-08 rank change history による resolved 化を実装する

- 状態:
  - 2026-05-28 実装済み。
  - トップ候補 list の同期時に表示範囲の `/api/v3/lincoln/suggest/status` を読み、同じ `stayDate x roomGroupId` で asOfDate 以降の rank change がある candidate を active list から外す。
  - Chrome CDP 一時注入確認では、候補リスト表示、`/api/v3/lincoln/suggest/status` request、console error 0 を確認した。
- 目的:
  - recommendation 生成後に rank 変更が行われた候補を、active list から外し、履歴として残す。
- 背景:
  - 将来の bulk apply と rank response 評価には、active、user decision、resolved、expired の lifecycle が必要である。
  - rank 変更後も同じ候補が active に残ると、利用者に再対応を促す誤表示になる。
- スコープ:
  - `/api/v3/lincoln/suggest/status` の rank change history を使う。
  - 同じ `stayDate x roomGroup` で recommendation `generatedAt` より後の rank change がある場合、`resolved_by_rank_change` にする。
  - 完全削除ではなく状態更新にする。
  - `before_price_rank_name`、`after_price_rank_name`、`accepted_at`、`completed_at`、`reflector_name` を履歴として参照できるようにする。
- 非目標:
  - rank response metric の本格計算は `RAU-RR-09` で扱う。
  - Revenue Assistant への反映実行は行わない。
- 受け入れ条件:
  - rank 変更が確認された recommendation が active list から外れる。
  - resolved になった履歴を将来評価に使える形で保持する。
  - 同日複数 rank change がある場合の扱いが documented または diagnostics で確認できる。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`
  - `open-spec-questions`: `accepted_at` と `completed_at` のどちらを rank change 発生時刻として使うか。同じ日付と roomGroup で複数 change がある場合の resolved 条件。

### RAU-RR-09 rank response dataset / metrics を設計する

- 状態:
  - 2026-05-28 の docs 設計で完了。
  - `docs/spec_003_rank_recommendation_signal.md` に、rank response dataset の grain、入力、rank change timestamp、event 重複時の扱い、booking_curve raw source v2 との接続、result window、baseline、output、欠損 diagnostics を定義した。
  - 実価格または rank price table が取れるまでは、価格弾力性ではなく `ランク反応度` として扱う判断を `docs/context/DECISIONS.md` に残した。
- 目的:
  - 過去 rank 変更に対して、変更後の booking curve、sales、ADR、競合価格がどう変化したかを評価できる dataset と metric を設計する。
- 背景:
  - 厳密な価格弾力性は実価格変化率が取れないと算出できない。
  - rank change history だけで最初に出せるのは `rank response` または `ランク反応度` である。
- スコープ:
  - rank transition、roomGroup、stayDate、LT at change、capacity、all / transient / group rooms、sales / ADR、competitor snapshot を入力候補にする。
  - 変更後 1 日 pickup、3 日 pickup、7 日 pickup、final rooms、final occupancy、ADR、sales、RevPAR 相当、net pickup を結果指標候補にする。
  - 直近型 reference curve、季節型 reference curve、近似日比較、変更前 pace trend からの外れを反実仮想候補にする。
- 非目標:
  - 価格弾力性という名称で厳密指標を出さない。
  - 実価格または rank price table が未確認のまま価格変化率を推定しない。
  - scoring へ即時接続しない。
- 受け入れ条件:
  - rank response dataset の入力、処理、出力、欠損理由が明文化される。
  - 実価格が取れない段階で何を `rank response` と呼ぶかが明確になっている。
  - sales / ADR raw source、競合価格 snapshot、reference curve との接続条件が明確になっている。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`, `docs/spec_002_curve_core.md`
  - `open-spec-questions`: 実価格または rank price table の取得可否。競合価格 snapshot の時点合わせ。sales / ADR 欠損時の扱い。

### RAU-RR-10 推奨ランク算出を設計する

- 状態:
  - 2026-05-28 の docs 設計で完了。
  - current rank は `/api/v1/suggest/output/current_settings`、rank ladder 候補は `/api/v1/rank_sequences` を第一候補にする契約を `docs/spec_003_rank_recommendation_signal.md` に定義した。
  - `RAU-RR-12` 前は、`rank_sequences[].default_sequence` の扱いが未確定だったため `recommendedRank` を出さず、`recommendedRankDirection` のみを表示する契約にしていた。`RAU-RR-12` 後は、`default_sequence` を方向に使わず、`/api/v1/rank_sequences` の response 配列順から隣接 rank を出す契約に更新済みである。
- 目的:
  - current rank と rank ladder が取得できる場合に、推奨ランク名または隣接 rank 方向を算出する契約を設計する。
- 背景:
  - first phase は推奨方向だけで開始できるが、Revenue Assistant の操作単位に合わせるなら、将来的には `現在ランク A -> 推奨ランク B` のような表示が有用になる。
  - ただし rank price table が未確認のまま recommendedRank から推奨レート金額を出すと、価格差を誤る可能性がある。
- スコープ:
  - currentRank、rank ladder、隣接 rank、rank price table の入力契約を設計する。
  - 推奨は first wave では隣接 rank のみに限定する。
  - `raise_one`、`lower_one`、`keep`、`watch`、`not_eligible` と recommendedRank の関係を整理する。
  - rank ladder 欠損時は recommendedRank を出さず、recommendedRankDirection だけに戻す。
- 非目標:
  - 推奨レート金額を出さない。
  - rank 反映 API を呼ばない。
  - bulk apply は設計対象にしない。
- 受け入れ条件:
  - current rank と rank ladder がある場合、recommendedRank を出す条件が明文化される。
  - current rank または ladder が欠損する場合、recommendedRankDirection に戻る条件が明文化される。
  - 隣接 rank 以外を推奨しない guardrail が明文化される。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`
  - `open-spec-questions`: rank ladder の上下関係。rank price table の取得可否。rank 名の同一性と facility / roomGroup / date ごとの差分。

### RAU-RR-11 bulk apply feasibility を調査する

- 状態:
  - 2026-05-28 の feasibility 判断で完了。
  - current rank、rank ladder 候補、reflection allow 候補は確認済みだが、write endpoint 候補は未実行であり、request shape、安全制約、partial failure、同時更新、preview、明示選択、反映結果保存が未確認または未実装である。
  - 結論は `not-now` とし、first phase では bulk apply button も Revenue Assistant への write API 実行も追加しない。
- 目的:
  - 将来の user-confirmed bulk apply を実装できるか、実装前に API、guardrail、状態管理、部分失敗時の記録を調査する。
- 背景:
  - 一括反映は作業時間を減らせる可能性があるが、first phase で入れるには安全制約が不足している。
  - active recommendation だけでなく、user decision、cooldown、resolved、dismissed、confidence、small capacity、group-driven 判定が対象除外に必要である。
- スコープ:
  - rank 反映 endpoint の有無、request shape、必要 header、権限、CSRF、error response を調査する。
  - 反映直前 current rank 再取得の可否を調査する。
  - recommendation 生成後の別 rank change 検出方法を整理する。
  - preview、明示選択、部分失敗記録、rollback 不可時の表示を設計候補として整理する。
- 非目標:
  - 実際の rank 反映 API を実行しない。
  - 自動反映を作らない。
  - first phase の UI shell に一括反映 button を追加しない。
- 受け入れ条件:
  - bulk apply を実装するための必須条件と不足条件が一覧化される。
  - 実装に進めない場合、その理由が API 未確認、guardrail 未実装、状態管理不足、精度不足のどれかに分類される。
  - `docs/spec_003_rank_recommendation_signal.md` または `docs/context/DECISIONS.md` に、進める / 見送る判断が反映される。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`
  - `open-spec-questions`: rank 反映 endpoint の有無。反映直前再検証の方法。部分失敗時の保存形式。利用者確認 UI。

### RAU-RR-12 `rank_sequences[].default_sequence` の方向を確認する

- 状態:
  - 2026-05-28 に実装済み。
  - Chrome拡張で通常 Chrome の Revenue Assistant root tab が 1 件あることを確認した。
  - Chrome DevTools Protocol read-only で `/api/v1/rank_sequences`、`/api/v3/lincoln/suggest/status?filter_type=stay_date&from=20260501&to=20260531`、Revenue Assistant 配信 JavaScript を確認した。
  - `default_sequence` は「名前順に並べ替える」初期順へ戻すための値であり、rank 上げ / 下げ方向には使わないと判断した。
  - 当初は `/api/v1/rank_sequences` の response 配列順を recommended rank の上下方向として使ったが、この方向判断は `RAU-RR-14` で置き換えた。
  - 観測した response 配列順は rank 名 `1` から `20` までの自然順だった。利用者確認により、大国町では `1` が最高ランク、`20` が最低ランクである。
  - 通常 Chrome への最新 dist 一時注入後、top list 10 行、`raise_watch` 10 行、隣接 rank 表示 9 行、推奨レート金額表示 0 行、page error / console error 0 件を確認した。
  - current rank が response 配列の末尾で次 rank が存在しない 1 行は、当時の実装では隣接 recommended rank を出さず従来どおり `上げ検討` と表示した。この端判定も `RAU-RR-14` 後は推定 rank 順序に従う。
  - 推奨レート金額、2段階以上の移動、Revenue Assistant write / bulk apply は追加していない。
- 目的:
  - current rank と rank ladder 候補から、`recommendedRankDirection` だけでなく隣接 rank 名を安全に出せるか判断する。
- 背景:
  - `RAU-RR-10` では current rank と rank ladder 候補を使う契約を設計済みである。
  - `RAU-RR-10` では `rank_sequences[].default_sequence` の扱いを未確定としていたため、recommended rank 名の表示を保留していた。
  - この task では、`default_sequence` を direction として使うべきか、別の順序を rank ladder として使うべきかを確認する。
- スコープ:
  - 通常 Chrome の Revenue Assistant 画面と CDP の read-only API 観測を使い、current rank と rank ladder の並びを比較する。
  - `default_sequence` の昇順または降順を使うべきか、または `rank_sequences[]` の response 配列順を使うべきかを判断する。
  - 判断できる場合は `docs/spec_003_rank_recommendation_signal.md` と `docs/context/DECISIONS.md` に反映する。
- 非目標:
  - 推奨レート金額を出さない。
  - Revenue Assistant への write API を実行しない。
  - bulk apply を実装しない。
- 受け入れ条件:
  - `default_sequence` の方向を確認済み、または確認不能理由を明記している。
  - 確認済みの場合、recommended rank 名を表示してよい条件と、表示しない条件が仕様へ反映されている。
  - 確認不能の場合、`recommendedRankDirection` のみを継続する理由が `docs/context/DECISIONS.md` に残っている。
- metadata:
  - `spec-impact`: unknown
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-13 rank ladder 端の推奨方向表示を明確化する

- 状態:
  - 2026-05-28 に実装済み。
  - 候補 record に `recommendedRankUnavailableReason` を追加した。
  - rank ladder の端で隣接 recommended rank が存在しない場合は、`recommended_rank_rank_ladder_boundary` を diagnostics に残す。
  - 通常 Chrome の最新 dist 一時注入後、当時の response 配列順ベースでは current rank `20` の `raise_watch` 行が `上限ランク: 上げ余地なし` と表示され、隣接 rank がある 9 行は `1段上げ検討: {rankName}` のままだった。この具体的な端判定は、`RAU-RR-14` 後は推定 rank 順序に従う。
  - 合成入力では、推定 rank 順序の最高ランクに対する `raise_watch` と最低ランクに対する `lower_watch` の両方で `recommendedRankUnavailableReason: rank_ladder_boundary` になることを確認した。
  - 推奨レート金額、sales / ADR 数値、金額、比率は表示されず、page error / console error は 0 件だった。
- 目的:
  - current rank が rank ladder の端にある候補で、隣接 recommended rank が存在しない理由を top list 上で読めるようにする。
- 背景:
  - `RAU-RR-12` の通常 Chrome 確認では、current rank が `20` で `raise_watch` の候補が 1 行あり、隣接 rank がないため推奨方向は従来どおり `上げ検討` と表示された。
  - この表示だけでは、利用者が「上げ方向の候補だが、rank ladder 上は上限で 1 段上げできない状態」と判断するために current rank と rank ladder 端を自分で読み解く必要がある。
- スコープ:
  - 候補 record に、隣接 recommended rank を出せない理由を持たせる。
  - rank ladder の端で隣接 rank が存在しない場合だけ、top list の推奨方向を `上限ランク: 上げ余地なし` または `下限ランク: 下げ余地なし` と表示する。
  - rank ladder が取得できない場合や current rank code が ladder に存在しない場合は、原因を diagnostics に残し、従来の direction 表示に戻す。
- 非目標:
  - 推奨レート金額を出さない。
  - 2 段階以上の rank 移動を出さない。
  - Revenue Assistant への write / bulk apply を行わない。
- 受け入れ条件:
  - current rank が推定 rank 順序の最高ランクで `raise_watch` の場合、top list の推奨方向に `上限ランク: 上げ余地なし` が表示される。
  - current rank が推定 rank 順序の最低ランクで `lower_watch` の場合、top list の推奨方向に `下限ランク: 下げ余地なし` が表示される。
  - 隣接 rank が存在する場合は、従来どおり `1段上げ検討: {rankName}` または `1段下げ注意: {rankName}` が表示される。
  - top list に推奨レート金額、sales / ADR 数値、金額、比率が表示されない。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-14 数値ランク名から上下関係を推定する

- 状態:
  - 2026-05-28 に実装済み。
  - 合成入力で、rank ladder `1,2,...,20` の current rank `14` に対して `raise_watch -> 13`、`lower_watch -> 15` を確認した。
  - 合成入力で、current rank `1` の `raise_watch` と current rank `20` の `lower_watch` が `recommendedRankUnavailableReason: rank_ladder_boundary` になることを確認した。
  - 通常 Chrome の Revenue Assistant root へ Chrome DevTools Protocol で最新 dist を一時注入し、top list 10 行、`current rank 14 -> 1段上げ検討: 13`、`current rank 20 -> 1段上げ検討: 19`、旧誤方向 `14 -> 15` 0 行、推奨レート金額表示 0 行、sales / ADR 数値表示 0 行、page error / console error 0 件を確認した。
- 目的:
  - 大国町のように rank 名 `1` が最高ランク、`20` が最低ランクである施設で、`raise_watch` / `lower_watch` の recommended rank 方向を逆にしない。
- 背景:
  - `RAU-RR-12` と `RAU-RR-13` では `/api/v1/rank_sequences` の response 配列順を使い、`raise_watch` を response 配列上の次 rank として扱っていた。
  - 利用者確認により、大国町では `1` が最高ランクである。したがって response 配列が `1,2,...,20` である場合、`raise_watch` は `14 -> 13`、`lower_watch` は `14 -> 15` になる。
- スコープ:
  - rank 名がすべて整数として読める場合、rank 名の数値昇順を高ランクから低ランクへの順序として推定する。
  - `raise_watch` は 1 つ高い rank、`lower_watch` は 1 つ低い rank を隣接 recommended rank として表示する。
  - rank 名が数値として読めない場合は、recommended rank を出さず diagnostics に原因を残す。
- 非目標:
  - 設定画面から rank 全貌を読む実装は `RAU-RR-15` で扱う。
  - 利用者が任意に上下関係を変更する UI は `RAU-RR-15` で扱う。
  - 推奨レート金額、2 段階以上の rank 移動、Revenue Assistant write / bulk apply は追加しない。
- 受け入れ条件:
  - rank ladder が `1,2,...,20` の場合、current rank `14` の `raise_watch` は `13` を recommended rank として表示する。
  - rank ladder が `1,2,...,20` の場合、current rank `14` の `lower_watch` は `15` を recommended rank として表示する。
  - current rank `1` の `raise_watch` は `上限ランク: 上げ余地なし` と表示する。
  - current rank `20` の `lower_watch` は `下限ランク: 下げ余地なし` と表示する。
  - rank 名が数値として読めない場合、recommended rank を出さず diagnostics に `rank_order_unresolved` が残る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-15 rank 上下関係の推定 source と任意調整入口を実装する

- 状態:
  - 2026-05-28 に実装済み。
  - Chrome拡張では、通常 Chrome extension instance が利用可能であることを確認した。
  - Chrome DevTools Protocol read-only では、root 画面から `/settings/site-controller` link を確認し、同 path の fetch が 200 を返すことを確認した。ただし response は SPA shell であり、rank の全貌や rank order payload は確認できなかった。
  - top list に rank order source と高ランクから低ランクへの順序を表示する入口を追加した。
  - manual override は browser-local 保存とし、保存後に recommended rank を override 後の順序で再計算する。reset で数値推定へ戻せる。
  - CDP 一時注入確認では、初期状態 `numeric_rank_name` で `14 -> 13`、手動で逆順保存後 `manual_override` で `14 -> 15`、reset 後 `numeric_rank_name` で `14 -> 13` に戻ることを確認した。確認後、rank order override の localStorage key は 0 件だった。
- 目的:
  - rank 上下関係の推定を、数値 rank 名だけに固定せず、設定画面、カレンダー上の曜日別関係、競合価格内の自社料金などから補強し、利用者が任意に方向や上下関係を調整できる入口を作る。
- 背景:
  - 大国町では `1` が最高ランクであることを利用者が確認済みである。
  - ただし施設や設定により rank 名、価格帯、曜日別の使い分けが異なる可能性がある。推定だけに固定すると、施設固有の運用とずれた recommended rank を出す危険がある。
  - rank の全貌は Revenue Assistant の設定画面内にある。
- スコープ:
  - Chrome拡張で通常 Chrome の設定画面候補 tab を確認し、CDP read-only で rank 設定画面の DOM または API を観測する。
  - rank order の推定 source を、少なくとも `numeric_rank_name`、`settings_screen`、`manual_override`、`unresolved` のどれかとして record へ残す。
  - 利用者が rank 上下関係を確認、変更、リセットできる入口を top list 付近または設定画面連携として追加する。
  - manual override は browser-local 保存とし、Revenue Assistant へ write しない。
- 非目標:
  - Revenue Assistant の rank 設定を変更しない。
  - 推奨レート金額を出さない。
  - Revenue Assistant への write / bulk apply を行わない。
- 受け入れ条件:
  - rank order の現在 source と上下方向が UI 上で確認できる。
  - manual override を保存した場合、recommended rank が override 後の順序で再計算される。
  - reset で推定順序へ戻せる。
  - 設定画面から得た情報または取得不能理由が `docs/context/STATUS.md` または `docs/context/DECISIONS.md` に残っている。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-16 settings screen 由来の rank order 抽出可否を追加調査する

- 状態:
  - 2026-05-28 に実装済み。
  - Chrome拡張では、通常 Chrome extension instance が利用可能であることを確認した。ただし、この環境で公開されている capability は tab content/list 操作を直接提供していなかったため、通常 Chrome の実画面調査は Chrome DevTools Protocol の read-only 接続で行った。
  - CDP read-only で、設定画面 `設定 > 表示 > 料金ランクの並び順` の route が `/settings/price-rank-sequence` であり、`GET /api/v1/rank_sequences` の配列順をドラッグリストに表示することを確認した。大国町では表示順が `1` から `20` であり、利用者確認どおり高ランクから低ランクの順である。
  - `src/rankRecommendation.ts` では、manual override がない場合に `rank_sequences[]` の配列順を source `settings_screen` として使うようにした。数値 rank 名推定は、設定画面順序を使えない場合の fallback に下げた。
  - 通常 Chrome の Revenue Assistant root へ最新 build を CDP で一時注入し、top list 10 行、rank order source `settings_screen`、summary `ランク順序: 設定画面 / 高い順 1 > ... > 20`、page error 0 件、console error 0 件を確認した。確認前の manual override localStorage key は 0 件だった。
- 目的:
  - `settings_screen` source を実際に使えるか確認し、使える場合は manual override より低く、numeric rank name より高い自動 source として接続する。
- 背景:
  - `RAU-RR-15` の CDP read-only 確認では、root 画面から `/settings/site-controller` link と fetch 200 は確認できた。
  - ただし response は SPA shell で、rank の全貌や rank order payload は確認できなかった。
  - 利用者によると rank の全貌自体は設定画面内にある。
  - 利用者補足により、rank 名は企業や施設により数字系、ローマ字または英字系、記号混在系のいずれもあり得る。同じ表記系でも上下関係が逆になる運用があり得る。名前パターンを増やして推定を強くするより、Revenue Assistant 設定画面の保存済み順序と manual override を優先する必要がある。
- スコープ:
  - Chrome拡張で通常 Chrome の設定画面候補を取り違えないよう確認する。
  - CDP read-only で設定画面遷移後の DOM、XHR、fetch request を観測し、rank order を取得できる source があるか確認する。
  - 取得できる場合は `settings_screen` source として `RankRecommendationRankOrderResolution` へ接続する。
  - 取得できない場合は、取得不能理由と次の確認候補を `docs/context/STATUS.md` または `docs/context/DECISIONS.md` に残す。
- 非目標:
  - Revenue Assistant の rank 設定を変更しない。
  - Revenue Assistant への write API を実行しない。
  - hidden API を保存済み仕様として扱わない。
- 受け入れ条件:
  - settings screen 由来の rank order を取得できるか、取得不能理由が明記されている。
  - 取得できる場合、UI の rank order source が `settings_screen` と表示される。
  - 取得できない場合、既存の `numeric_rank_name` と `manual_override` の挙動は維持される。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-17 カレンダー曜日別関係と競合価格内の自社料金を rank recommendation scoring の補助候補として設計する

- 状態:
  - 2026-05-28 に docs 設計済み。
  - 曜日別関係と競合価格内の自社料金位置は、rank order source ではなく、priority / confidence / reasonCodes / diagnostics の補助 input として採用する。
  - rank rule は企業またはホテルごとに異なり、rank 名は数字系、ローマ字または英字系、記号混在系のいずれもあり得る。同じ表記系でも上下関係が逆になる運用があり得るため、名前パターン、曜日別の販売傾向、競合価格内の自社料金位置だけで上下関係を断定しない。
  - 大国町では Revenue Assistant 設定画面の `料金ランクの並び順` が高ランクから低ランクへ `1` から `20` の順に並んでいるため、`1` を最高ランク、`20` を最低ランクとして扱う。
  - 曜日別関係は既存 `booking_curve_raw_source:v2`、reference curve、同曜日 raw source から取れる範囲に限定し、追加 API request、祝日 API、未確認 calendar API は使わない。
  - 競合価格内自社料金位置は、保存済み `competitor-price-snapshots` の同じ `conditionSignature`、取得時点、競合施設集合、人数、部屋タイプ、食事条件の範囲で比較する。
- 目的:
  - rank order は設定画面順序を使う前提にしたうえで、料金調整候補の priority / confidence を、カレンダー上の曜日別関係と競合価格 snapshot 内の自社料金位置で補助できるか判断する。
- 背景:
  - 利用者は、推定ロジック候補として「カレンダーベースでの曜日別の関係」と「競合価格内の自社料金」を挙げている。
  - rank 名の数字系、ローマ字または英字系、記号混在系、上下関係の逆転パターンは施設差が大きく、rank order の確定 source としては使いにくい。一方、曜日別の販売傾向や競合価格内の自社位置は、rank order ではなく候補の優先度や confidence を補助する input として扱える可能性がある。
- スコープ:
  - カレンダー上の曜日別関係を、同曜日の reference、近い曜日、祝前日などのどの単位で扱うかを設計する。
  - 競合価格 snapshot 内の自社料金位置を、人数、部屋タイプ、食事条件、取得時点、競合施設集合のどの粒度で比較するかを設計する。
  - `raise_watch`、`lower_watch`、`watch` の action を単独で変えず、priority / confidence / reasonCodes の補助に留めるかを判断する。
  - 欠損時は推測補完せず diagnostics に残す条件を定義する。
- 非目標:
  - rank 名パターンを使った上下関係推定を強化しない。
  - 推奨レート金額を出さない。
  - Revenue Assistant への write / bulk apply を行わない。
  - 競合価格の未確認 request 範囲や取得頻度を増やさない。
- 受け入れ条件:
  - 曜日別関係と競合価格内の自社料金位置を、rank order source ではなく scoring 補助 input として扱うかどうかが `docs/spec_003_rank_recommendation_signal.md` に記録されている。
  - 採用する場合は、入力、比較単位、出力する reasonCodes / diagnostics、欠損時の扱い、既存 scoring へ加える補正範囲が明記されている。
  - 採用しない場合は、採用しない理由と再検討条件が `docs/context/DECISIONS.md` に記録されている。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-18 曜日別関係と競合価格内自社料金位置の scoring support を実装する

- 状態:
  - 2026-05-28 に実装済み。
  - `src/rankRecommendation.ts` に weekday context signal と competitor own price position signal を追加し、既存 action を単独で変えず priority / confidence / reasonCodes / diagnostics の小さな補助として接続した。
  - `src/main.ts` では、weekday context を保存済み `booking_curve_raw_source:v2` の同曜日候補から作り、競合価格内自社料金位置を保存済み `competitor-price-snapshots` の最新 snapshot から作るようにした。追加 API request は行わない。
  - 競合価格内自社料金位置は `stayDate` ごとに読み取り結果を共有し、同じ stayDate の複数 roomGroup で IndexedDB 読み取りを重複させない。
  - Chrome拡張 backend では通常 Chrome の Revenue Assistant tab が 1 件あることを確認した。
  - Chrome DevTools Protocol で最新 dist を通常 Chrome の Revenue Assistant root へ一時注入し、候補 list 10 行、page error 0 件、console error 0 件、`自社安め` 7 行、weekday reason 0 行、金額・差額・比率の直接表示 0 行を確認した。
- 目的:
  - `RAU-RR-17` の設計に従い、rank recommendation の既存 action を単独で変えずに、曜日別関係と競合価格内自社料金位置を priority / confidence / reasonCodes / diagnostics の補助として接続する。
- 背景:
  - rank order は `manual_override`、`settings_screen`、`numeric_rank_name`、`unresolved` の順で解決済みである。
  - 曜日別関係と競合価格内自社料金位置は、rank order source ではなく、候補の優先度や確信度を補助する input として扱う判断が `RAU-RR-17` で確定した。
- スコープ:
  - `src/rankRecommendation.ts` の pure scoring contract に、weekday context signal と competitor own price position signal を追加する。
  - `src/main.ts` では、既存保存済み raw source、reference curve、同曜日 raw source、`competitor-price-snapshots` から必要な evidence を組み立てる。
  - 初期 signal は、weekday context を `weekday_reference_supports_raise`、`weekday_reference_supports_lower`、`weekday_reference_neutral`、競合価格内自社料金位置を `own_price_low_against_competitors`、`own_price_near_competitors`、`own_price_high_against_competitors` の範囲に留める。
  - 欠損、source count 不足、条件不一致、比較対象 plan 不足は diagnostics に残し、推測補完しない。
  - top list へ出す reason は、数値、金額、差額、比率を出さず、非数値要約に留める。
- 非目標:
  - rank order source を変更しない。
  - 推奨レート金額を出さない。
  - Revenue Assistant への write / bulk apply を行わない。
  - 競合価格 snapshot の request 範囲、取得頻度、background queue 上限を増やさない。
  - 祝日、連休、イベント日を未確認 source から推定しない。
- 受け入れ条件:
  - 曜日別関係と競合価格内自社料金位置の signal が欠損時に既存候補生成を止めず、diagnostics に理由を残す。
  - `raise_watch`、`lower_watch`、`watch` の action は、これらの signal だけでは変更されない。
  - 補正は priority / confidence / reasonCodes の小さな範囲に限定される。
  - top list に金額、差額、比率、forecast 数値、sales / ADR 数値が直接表示されない。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: after-spec
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-19 scoring support signal の実データ発火分布と閾値を確認する

- 状態:
  - 2026-05-28 に確認済み。
  - Chrome拡張 backend で、通常 Chrome の Revenue Assistant tab が 1 件あることを確認した。
  - Chrome DevTools Protocol で通常 Chrome の Revenue Assistant root へ最新 dist を一時注入し、top list 10 行、page error 0 件、console error 0 件を確認した。
  - top list 10 行はすべて `raise_watch` / `high` / `active` だった。表示 reason は `残室少` 10 行、`自社安め` 7 行、`自社高め` 0 行、`同曜日強め` 0 行、`同曜日弱め` 0 行だった。金額、差額、比率の直接表示は 0 行だった。
  - fingerprint 上の signal は、`competitor_price_signal_own_price_low_against_competitors` 7 件、`competitor_price_signal_own_price_high_against_competitors` 0 件、`competitor_price_snapshot_missing` 3 件、`weekday_signal_weekday_reference_neutral` 3 件、`weekday_reference_source_count_low` 1 件、`weekday_context_current_transient_missing` 6 件だった。
  - この 1 画面の観測では、競合価格内自社料金位置の 95% / 105% 閾値や weekday context の 115% / 85% 閾値を変更する根拠として不十分であるため、閾値と補正幅は変更しない。
  - `自社安め` が 7 行に出ている主因候補は、現時点で Revenue Assistant の roomGroup と競合価格 response の `jalanFacilityRoomType` または `jalan_room_types[]` の安全な対応づけを使っていないことである。次は閾値変更ではなく、対応 source の read-only 確認へ進める。
- 目的:
  - `RAU-RR-18` で追加した weekday context signal と competitor own price position signal が、実データで候補順位や主要根拠を過度に偏らせていないか確認する。
- 背景:
  - 初回の CDP 確認では top list 10 行のうち `自社安め` が 7 行に出た一方、weekday reason は 0 行だった。
  - 1 snapshot だけでは、競合価格内自社料金位置の 95% / 105% 閾値や、weekday context の 115% / 85% 閾値が妥当か判断できない。
- スコープ:
  - 通常 Chrome の Revenue Assistant root と、可能なら異なる表示範囲または Analyze 起点後の top list で、support reason と diagnostics の分布を確認する。
  - `own_price_low_against_competitors`、`own_price_high_against_competitors`、`weekday_reference_supports_raise`、`weekday_reference_supports_lower`、欠損 diagnostics の件数を確認する。
  - 閾値変更が必要な場合は、数値を直接 UI に出さず、補正幅または reason 表示の条件だけを調整する。
- 非目標:
  - 新しい競合価格 request 範囲や取得頻度を追加しない。
  - roomGroup と jalan room type の未確認対応づけを推測しない。
  - 推奨レート金額、Revenue Assistant write / bulk apply を追加しない。
- 受け入れ条件:
  - Chrome拡張 backend で通常 Chrome の対象 tab が確認されている。
  - Chrome DevTools Protocol で top list の support reason 分布、page error、console error が確認されている。
  - 閾値または補正幅を変更する場合は、`docs/spec_003_rank_recommendation_signal.md` と `docs/context/DECISIONS.md` に理由が残っている。
  - 変更を行った場合は `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: unknown
  - `spec-checkpoint`: before-threshold-change
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-20 roomGroup と jalan 部屋タイプの対応 source を read-only で確認する

- 状態:
  - 2026-05-28 に確認済み。
  - Chrome DevTools Protocol read-only で、`/api/v1/suggest/output/current_settings`、`/api/v1/booking_curve/rm_room_groups`、`/api/v2/competitors_filter_settings`、`/api/v2/competitors`、保存済み `competitor-price-snapshots` を確認した。
  - `current_settings` は `rm_room_group_id`、`rm_room_group_name`、`remaining_num_room`、`max_num_room`、`latest_current.price_rank_code`、`latest_current.price_rank_name` を持つが、`jalan` field や room type code field は持たなかった。
  - `rm_room_groups` は `id`、`name`、`sequence` を持つが、`jalan` 側部屋タイプ code は持たなかった。
  - `competitors_filter_settings` は `jalan_room_types` を持つが、roomGroup との対応は持たなかった。
  - 保存済み `competitor-price-snapshots` は検索条件に `jalanRoomTypes`、plan に `jalanFacilityRoomType` を持つが、plan 側に `rm_room_group_id` 相当の field はなかった。
  - 現時点では、roomGroup 名と `jalan` 側部屋タイプ名の文字列類似だけで対応を確定しない。`own_price_low_against_competitors` / `own_price_high_against_competitors` は roomGroup 別に強めない。
- 目的:
  - 競合価格内自社料金位置を roomGroup 別に安全に絞り込めるか判断する。
  - `RAU-RR-19` で `自社安め` が top list 10 行中 7 行に出たため、閾値変更より先に、比較単位が粗すぎるかを確認する。
- 背景:
  - `RAU-RR-18` の初期実装では、Revenue Assistant の roomGroup と競合価格 response の `jalanFacilityRoomType` または `jalan_room_types[]` の対応を安全に確定できなかったため、roomGroup 別の部屋タイプ filter はかけていない。
  - その結果、ある roomGroup の候補に対して、別の部屋タイプの自社最安値または競合最安値が比較に混ざる可能性がある。
- スコープ:
  - Chrome拡張で通常 Chrome の Revenue Assistant 対象 tab を確認する。
  - Chrome DevTools Protocol read-only で、既存画面、既存 response、保存済み `competitor-price-snapshots`、`current_settings`、roomGroup 一覧、競合価格 tab の表示要素を確認し、roomGroup と `jalan` 側部屋タイプを対応づけられる source があるかを分類する。
  - 対応 source がある場合は、field 名、対応単位、null / optional、confidence、対応できない case を `docs/context/DECISIONS.md` または対象 spec に残す。
  - 対応 source がない場合は、推測で対応づけず、競合価格内自社料金位置を roomGroup 別 signal に強めない理由を残す。
- 非目標:
  - Revenue Assistant の rank 設定、価格、在庫を変更しない。
  - 競合価格の request 範囲、取得頻度、background queue 上限を増やさない。
  - roomGroup 名と部屋タイプ名の文字列類似だけで対応を確定しない。
  - 推奨レート金額、Revenue Assistant write / bulk apply を追加しない。
- 受け入れ条件:
  - Chrome拡張 backend で通常 Chrome の対象 tab が確認されている。
  - Chrome DevTools Protocol read-only で、対応 source の有無、確認済み field、未確認 field、対応不能 case が記録されている。
  - 対応 source が確認できない場合、`own_price_low_against_competitors` / `own_price_high_against_competitors` を roomGroup 別に強める実装へ進まない判断が docs に残っている。
  - 対応 source が確認できる場合でも、実装は別 task とし、この task では write や bulk apply を行わない。
- metadata:
  - `spec-impact`: unknown
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-21 roomGroup 対応 source 未確認の競合価格 signal を主要 reason から外す

- 状態:
  - 2026-05-28 に実装済み。
  - `src/rankRecommendation.ts` では、`own_price_low_against_competitors` / `own_price_high_against_competitors` が存在しても、top list の主要 reason に `自社安め` / `自社高め` を追加せず、confidence や priority も補正しないようにした。
  - signal は `curveEvidence.diagnostics` の `competitor_price_signal_*` と、追加 diagnostics の `competitor_price_room_group_scope_unconfirmed` に残す。
- 目的:
  - roomGroup と `jalan` 側部屋タイプの対応 source が未確認のまま、競合価格内自社料金位置が候補の主要根拠として強く見える状態を避ける。
- 背景:
  - `RAU-RR-19` では `自社安め` が top list 10 行中 7 行に出た。
  - `RAU-RR-20` では、roomGroup と `jalan` 側部屋タイプを対応づける明示 field が確認できなかった。
  - 競合価格内自社料金位置は有用な補助候補だが、比較単位が roomGroup より粗い状態では、主要 reason として表示すると利用者が「この部屋タイプの自社料金が安い」と誤読する可能性がある。
- スコープ:
  - `src/rankRecommendation.ts` の scoring で、roomGroup scope 未確認の競合価格 signal を主要 reason と confidence / priority 補正から外す。
  - diagnostics には signal と scope 未確認理由を残す。
  - `docs/spec_003_rank_recommendation_signal.md`、`docs/context/DECISIONS.md`、`docs/context/STATUS.md` を同期する。
- 非目標:
  - 競合価格 snapshot の保存 schema を変更しない。
  - 競合価格の request 範囲、取得頻度、background queue 上限を増やさない。
  - roomGroup と `jalan` 側部屋タイプの推測対応を実装しない。
  - 推奨レート金額、Revenue Assistant write / bulk apply を追加しない。
- 受け入れ条件:
  - `own_price_low_against_competitors` / `own_price_high_against_competitors` が出ても、top list の主要 reason に `自社安め` / `自社高め` が出ない。
  - diagnostics に `competitor_price_signal_*` と `competitor_price_room_group_scope_unconfirmed` が残る。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: during-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-22 top list に非数値の確度表示を追加する

- 状態:
  - 2026-05-28 に実装済み。
  - top list の header に `確度` を追加し、候補行ごとに内部 `confidence` を `高`、`中`、`低` の段階表示へ丸めるようにした。
  - Chrome拡張 backend で通常 Chrome の Revenue Assistant tab が 1 件あることを確認した。
  - Chrome DevTools Protocol では、対象 tab が hidden で `requestAnimationFrame` が進まなかったため、検証中だけ `requestAnimationFrame` を `setTimeout` で代替し、最新 dist を一時注入した。top list 10 行、header 9 列、`確度` header 1 件、`確度` sample `高` / `中`、page error 0 件、console error 0 件を確認した。
  - forecast 数値、sales / ADR 数値、金額、比率は top list に表示されなかった。
- 目的:
  - 料金調整候補の作業順を、優先度だけでなく候補根拠の揃い方からも判断できるようにする。
  - `src/rankRecommendation.ts` は候補ごとに `confidence` を生成しているが、現行 top list は `confidence` を表示していないため、同じ優先度の候補を比較するときの判断材料が不足している。
- 背景:
  - `confidence` は forecast、sales / ADR health、weekday context、reference 欠損、小キャパ、group-driven などの補助 signal を受けて変わる。
  - ただし `confidence` の内部小数値をそのまま出すと、利用者が「予測精度」や「推奨金額の正確さ」と誤読しやすい。
- スコープ:
  - top list の行項目に `確度` を追加する。
  - 表示は `高`、`中`、`低` の段階表示に留める。
  - 既存の `priority`、`reasonCodes`、`reasonFingerprint`、`diagnostics` の生成ロジックは変更しない。
  - `docs/spec_003_rank_recommendation_signal.md`、`docs/context/STATUS.md`、`docs/tasks_backlog.md` を同期する。
- 非目標:
  - 推奨レート金額、forecast 数値、sales / ADR 数値、金額、比率を top list に出さない。
  - confidence の閾値や scoring 補正幅を変更しない。
  - Revenue Assistant write / bulk apply を追加しない。
- 受け入れ条件:
  - top list の header に `確度` が表示される。
  - 候補行ごとに `confidence` が `高`、`中`、`低` のいずれかで表示される。
  - empty state の table colSpan が列数と一致する。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
  - Chrome拡張で通常 Chrome の Revenue Assistant tab を確認し、Chrome DevTools Protocol で最新 dist 一時注入後の top list に `確度` 列が出ることを確認する。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-RR-23 確度 tooltip で非数値の根拠補足を表示する

- 状態:
  - 2026-05-28 に実装済み。
  - top list の `確度` cell に hover tooltip を追加し、`確度` が予測精度、推奨金額の正確さ、または Revenue Assistant への反映可否を保証する値ではないことを明示した。
  - tooltip には主要根拠と、不足または注意の種類を非数値で表示する。forecast 数値、sales / ADR 数値、競合価格の金額、差額、percent は表示しない。
  - Chrome拡張 backend で通常 Chrome の Revenue Assistant tab が 1 件あることを確認した。
  - Chrome DevTools Protocol では、対象 tab が hidden で `requestAnimationFrame` が進まなかったため、検証中だけ `requestAnimationFrame` を `setTimeout` で代替し、既存 list を削除してから最新 dist を一時注入した。top list 10 行、`確度` tooltip 10 件、tooltip sample に免責、主要根拠、注意が含まれること、tooltip 内の金額または percent 0 件、page error 0 件、console error 0 件を確認した。
- 目的:
  - 同じ `高` または `中` の確度に見える候補について、根拠が揃っているのか、不足や注意が残っているのかを top list 上で軽く確認できるようにする。
  - 内部 `confidence` の小数値を出さず、作業順判断に必要な補助だけを tooltip に出す。
- 背景:
  - `RAU-RR-22` で `confidence` を `高`、`中`、`低` に丸めたが、段階表示だけでは同じ表示値の候補間で不足理由が見えにくい。
  - 一方で、数値や金額を tooltip に出すと、利用者が予測精度、推奨金額、または反映可否として誤読しやすい。
- スコープ:
  - `確度` cell の `title` に、確度の意味、主要根拠、不足または注意の種類を表示する。
  - 既存の `priority`、`confidence` 閾値、scoring、reasonFingerprint、diagnostics 生成は変更しない。
  - `docs/spec_003_rank_recommendation_signal.md`、`docs/context/STATUS.md`、`docs/tasks_backlog.md`、`docs/context/DECISIONS.md` を同期する。
- 非目標:
  - 推奨レート金額、forecast 数値、sales / ADR 数値、競合価格の金額、差額、percent を表示しない。
  - confidence の閾値や scoring 補正幅を変更しない。
  - Revenue Assistant write / bulk apply を追加しない。
- 受け入れ条件:
  - top list の `確度` cell に hover tooltip が設定される。
  - tooltip に、`確度` が予測精度、推奨金額の正確さ、Revenue Assistant への反映可否を保証しないことが表示される。
  - tooltip に、主要根拠と不足または注意の種類が非数値で表示される。
  - tooltip に forecast 数値、sales / ADR 数値、競合価格の金額、差額、percent が表示されない。
  - `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` が通る。
  - Chrome拡張で通常 Chrome の Revenue Assistant tab を確認し、Chrome DevTools Protocol で最新 dist 一時注入後の top list に `確度` tooltip が出ることを確認する。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

## Forecast Bundle

この section は予測関連 task をまとめて保持する。実行順は下の `Remaining Task Triage` を正とする。

### RAU-FC-01 rooms-only 予測モデルの導入要否を判断する

- 状態:
  - 判断済み。
  - 結論は、forecast model を今すぐ実装せず、`RAU-FC-02` で forecast evaluation dataset / metrics と `ForecastResult v1 candidate` を先に設計する。
- 目的:
  - BCL-tuned reference curve 実装後に、現在観測値、`直近型カーブ`、`季節型カーブ` から最終販売室数または将来 booking curve を予測する価値があるか判断する。
- 前提:
  - `RAU-AF-04` で core logic の input / output / diagnostics が実装済みであること。
  - `RAU-AF-07` で raw source cache、360 日 reference curve、ACT diagnostics の GUI 使用感を確認済みであること。
- 判断結果:
  - 選択肢 A「今すぐ forecast 実装へ進む」は採用しない。final occupancy expectation を priority / confidence へ使える可能性はあるが、現時点では過去 stayDate 評価、bias、小キャパ、group-driven case、UI 誤読リスクを確認できていないためである。
  - 選択肢 B「forecast 評価 dataset / metrics を先に設計する」を採用する。forecast を使うなら、予測誤差だけでなく rank recommendation の候補優先度改善、false positive proxy、false negative proxy を評価対象にする。
  - 選択肢 C「当面は reference deviation + rank response + sales/ADR health だけで進め、forecast は見送る」は採用しない。first wave は forecast なしで継続できるが、forecast には最終着地見込みで priority / confidence を補強し、rank response baseline として使う余地があるためである。
  - `snoozed_by_user`、`dismissed_by_user`、`resolved_by_rank_change` は、初期評価では真の正解ラベルではなく evaluation proxy として扱う。`snoozed_by_user` は false positive ではなく一時判断ログである。
- 非目標:
  - 人数 forecast。
  - PMS データ、DWH データ、学習済み外部モデルを必須にすること。
  - 予測値を根拠なく自動レート変更へつなげること。
  - この task で forecast model を実装すること。
  - この task で rank recommendation scoring へ forecast を接続すること。
  - この task で forecast 数値を top list または Analyze detail に表示すること。
- verify:
  - docs-only のため `git diff --check` を最小 verify とする。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`, `docs/spec_003_rank_recommendation_signal.md`

### RAU-FC-02 予測評価 dataset / metrics と ForecastResult v1 candidate を設計する

- 状態:
  - 設計済み。
  - `docs/spec_002_curve_core.md` に、evaluation dataset の grain、入力、除外条件、未来情報混入防止、metric、`ForecastResult v1 candidate`、rank recommendation impact proxy を確定した。
- 目的:
  - rooms-only 予測モデルを採用する前に、過去 stay_date を使って予測誤差、偏り、rank recommendation への改善効果を確認できる評価入力と評価指標を決める。
  - `docs/spec_002_curve_core.md` の `ForecastResult v1 candidate` を、evaluation dataset と合わせて確定する。
- スコープ:
  - `EvaluationCase` と `EvaluationResult` の具体的な保存単位、抽出条件、metric を決める。
  - `ForecastResult v1 candidate` の `scope`、`roomGroupId`、`segment`、`observedLt`、`currentRooms`、capacity、`predictedFinalRooms`、`expectedOccupancyRatio`、diagnostics の要否を決める。
  - core / storage 上の segment 名は `all`、`transient`、`group` を正とし、UI 表示名の「個人」と `transient` を混同しない。
  - `as_of_date` 時点で未観測の情報を入力へ混ぜないルールを確認する。
  - 初期 metric は `maeRooms`、`smape`、`biasRooms` を候補にする。
  - rank recommendation 接続評価では、候補優先度の改善、false positive proxy、false negative proxy を扱うか決める。
  - `snoozed_by_user`、`dismissed_by_user`、`resolved_by_rank_change` を evaluation proxy として使う場合の意味と限界を明記する。
- 非目標:
  - 評価用の外部 DB を必須にすること。
  - 合格基準をこの task だけで固定すること。
  - forecast model の pure function を実装すること。
  - forecast を rank recommendation scoring へ接続すること。
  - forecast 数値を UI に表示すること。
- 受け入れ条件:
  - evaluation dataset の grain、入力、除外条件、未来情報混入防止ルールが明文化される。
  - `ForecastResult v1 candidate` が実装済み型ではなく proposed contract として確定される。
  - `maeRooms`、`smape`、`biasRooms` と rank recommendation impact proxy の関係が明文化される。
  - `snoozed_by_user` を false positive と誤読しない注意が残る。
- 設計結果:
  - evaluation dataset の grain は `facilityId x targetStayDate x asOfDate x scope x roomGroupId? x segment` とする。
  - `observedPrefix` は `asOfDate` 時点で観測済みの `CurveObservation` だけを含め、future final rooms、未来の rank 変更履歴、未来の競合価格を forecast model の入力へ混ぜない。
  - `actualFinalRooms`、user decision、rank change label は、評価 target または evaluation proxy としてだけ使い、forecast model の入力特徴量にしない。
  - 除外理由は `actual_final_missing`、`observed_prefix_missing`、`future_info_required`、`act_not_separated`、`room_group_id_missing`、`segment_unknown` を区別する。
  - `smape` は `abs(predicted - actual) / ((abs(predicted) + abs(actual)) / 2)` とし、予測と実績がどちらも 0 の場合は 0、片方だけが 0 の場合は最大 2.0 を上限にする。
  - `ForecastResult v1 candidate` は `facilityId`、`modelId`、`modelVersion`、`targetStayDate`、`asOfDate`、`scope`、`roomGroupId`、`segment`、`observedLt`、`currentRooms`、`capacityRooms`、`predictedFinalRooms`、`expectedOccupancyRatio`、任意の `predictedCurve`、diagnostics を持つ proposed contract とする。
  - diagnostics には、feature 名、missing reason、warnings、source count、`actSeparated`、`smallCapacity`、`groupDriven` を含める。
  - rank recommendation impact proxy は、`priorityOrderChangedCount`、`dismissedProxyCount`、`snoozedProxyCount`、`resolvedByRankChangeProxyCount` を初期範囲にする。いずれも真の正解ラベルではなく、後続確認のための観測量として扱う。
  - false negative proxy は初期 dataset では直接確定せず、候補化されなかった `stayDate x roomGroup` の後続 rank change、急な pickup、売上 / ADR 悪化を別 diagnostics 候補として残す。
- verify:
  - docs-only のため `git diff --check` を最小 verify とする。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`

### RAU-FC-03 forecast evaluation dataset を実装する

- 状態:
  - 実装済み。
  - `src/curveCore.ts` に `ForecastResultV1Candidate`、`ForecastEvaluationCase`、`ForecastEvaluationResult` と、`buildForecastEvaluationCase()`、`summarizeForecastEvaluationResults()` を追加した。
- 目的:
  - `RAU-FC-02` で確定した evaluation dataset contract に従い、過去 stay_date の raw source から forecast 評価用 case を作れるようにする。
- スコープ:
  - `as_of_date` 時点で観測済みの prefix と実 final rooms を分離する。
  - raw source 保存開始前に本当の `0日前` と `ACT` を分離できない case は diagnostics 付きで除外または低信頼扱いにする。
  - `all`、`transient`、`group` の segment 名は core / storage の正規名を使う。
- 非目標:
  - forecast model の精度改善。
  - UI 表示。
  - 外部 DB 追加。
- 実装内容:
  - `ForecastEvaluationCase` の grain は `facilityId x targetStayDate x asOfDate x scope x roomGroupId? x segment` とし、`buildForecastEvaluationCase()` がこの単位の case を作る。
  - `observedPrefix` は `asOfDate` 時点で観測済みの `CurveObservation` だけを入れ、`actualFinalRooms` は評価 target として分離する。
  - `actual_final_missing`、`observed_prefix_missing`、`future_info_required`、`act_not_separated`、`room_group_id_missing`、`segment_unknown` を diagnostics の missing reason として返す。
  - `summarizeForecastEvaluationResults()` は `ForecastResultV1Candidate` と evaluation case の組を受け取り、`maeRooms`、`smape`、`biasRooms`、rank recommendation impact proxy を集計する。
  - `smape` は `RAU-FC-02` の契約どおり、予測と実績がどちらも 0 の場合は 0、片方だけが 0 の場合は最大 2.0 を上限にする。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内では esbuild spawn が `EPERM` になったため、同じ command を通常権限で再実行して通過した。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`

### RAU-FC-04 first forecast model を pure function として実装する

- 状態:
  - 実装済み。
  - `src/curveCore.ts` に `buildRoomsOnlyForecastResult()` を追加し、`recent_deviation_adjusted_seasonal:v1` と evaluation baseline の `seasonal_ratio_baseline:v1` を `ForecastResultV1Candidate` として返せるようにした。
- 目的:
  - `RAU-FC-02` / `RAU-FC-03` の評価基盤を使い、最初の rooms-only forecast model を UI、API、storage から分離した pure function として実装する。
- スコープ:
  - 第一候補は、現在値と `recent_weighted_90` の差分で `seasonal_component` の final rooms 推定値を補正する単純モデルとする。
  - seasonal LT 比率換算は evaluation baseline として扱う。
  - 小キャパ、group-driven case、sourceCount 不足、`0日前` / `ACT` 制約は diagnostics に残す。
- 非目標:
  - rank recommendation scoring への接続。
  - UI 表示。
  - BCL Python 実装の直接呼び出し。
- 実装内容:
  - 既定 model は `recent_deviation_adjusted_seasonal` とし、既定 version は `recent_deviation_adjusted_seasonal:v1` とする。
  - 計算式は `seasonalFinalRooms + (currentRooms - recentRoomsAtObservedLt)` とする。
  - evaluation baseline として `seasonal_ratio_baseline:v1` も同じ関数で指定できる。計算式は `currentRooms / (seasonalRoomsAtObservedLt / seasonalFinalRooms)` とする。
  - `currentRooms`、observed LT の reference curve、seasonal final rooms が欠損する場合は `predictedFinalRooms=null` とし、diagnostics の `missingReason` に理由を残す。
  - capacity がある場合は、予測室数を 0 以上 capacity 以下に丸め、`expectedOccupancyRatio` を返す。
  - diagnostics に、feature 名、source count、`actSeparated`、`smallCapacity`、`groupDriven` を返す。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`

### RAU-FC-05 rank recommendation scoring へ forecast diagnostics を接続する

- 目的:
  - 評価済みの forecast result を、rank recommendation の priority / confidence 補助として接続する。
- スコープ:
  - forecast 欠損時は既存 reference deviation scoring を継続する。
  - `scope="roomGroup"`、`segment="transient"` を個人向け rank 判断の主入力候補にする。
  - `segment="group"` は団体起因の抑制条件と diagnostics に使う。
  - top list へ forecast 数値を直接表示しない。
- 非目標:
  - forecast 数値の UI 直接表示。
  - recommendedRank 名の表示。
  - Revenue Assistant への write / bulk apply。
- 実装内容:
  - `src/main.ts` の rank recommendation curve evidence 生成時に、`booking_curve_raw_source:v2` の roomGroup response から `ForecastResult v1 candidate` を生成するようにした。
  - forecast 入力は `scope="roomGroup"`、`segment="transient"` とし、同じ raw source 内の過去年 rooms 系列から raw history reference を作る。追加 API 取得は行わない。
  - raw history reference の `ACT` は、同じ raw source 内の `0日前` 過去年平均が取れる場合だけ作る。取れない場合は final rooms を推測せず、forecast 欠損 diagnostics に落とす。
  - live の将来 stayDate では `actual_final_missing` を評価 dataset の diagnostics として残しつつ、予測生成の blocking missing reason にはしないようにした。
  - forecast signal は `high_occupancy`、`low_occupancy`、`neutral` の内部分類に留め、`src/rankRecommendation.ts` では既存 action を単独で変えず priority / confidence だけを小さく補正する。
  - top list には forecast 数値を追加していない。表示されうる根拠は `着地見込み高`、`着地見込み低` の非数値要約だけである。
- verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内では esbuild spawn が `EPERM` になったため、権限許可後に再実行して通過
  - `npm run check`: passed。sandbox 内では build 部分が同じ `EPERM` になったため、権限許可後に再実行して通過
  - `git diff --check`: passed
- GUI / Chrome 確認:
  - 2026-05-28 に `npm run chrome:pages` を承認付きで実行し、通常 Chrome に Tampermonkey dashboard、OneTab、Revenue Assistant root `https://ra.jalan.net/` が開いていることを確認した。
  - 2026-05-28 に Chrome DevTools Protocol で通常 Chrome の Revenue Assistant root へ接続し、build 済み `dist/revenue-assistant-userscript.user.js` を一時注入して確認した。`料金調整候補` heading 1 件、候補 list root 1 件、候補 row 10 件、priority `high` 10 件、action `raise_watch` 10 件、重大な console / page error 0 件を確認した。
  - 同じ確認で、候補 list 内に forecast 数値 label は表示されていないことを確認した。現在の実データでは `着地見込み高` / `着地見込み低` の forecast reason は 0 件だったため、forecast reason の実データ表示発火は未確認である。
  - Chrome拡張 backend の capability-only 確認では、この project thread から `browser-client.mjs` が見つからず、Chrome拡張 backend を直接使える状態とは確認できなかった。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-SALES-02 booking_curve 売上・ADR adapter と単価・売上予測 model を設計する

- 状態:
  - 2026-05-28 に docs 設計済み。
- 目的:
  - `/api/v4/booking_curve` raw source に含まれる売上と ADR を、将来の単価予測と売上予測で使える model へ取り出す設計を決める。
  - 室数予測を実装する場合に、予測室数と予測単価から予測売上を算出できるようにする。
- 背景:
  - `RAU-SALES-01` で、既存 `/api/v4/booking_curve` の `all`、`transient`、`group` に売上と ADR が含まれることを確認した。
  - 2026-05-27 の `RAU-RR-02` で、`src/main.ts` の `compactBookingCurveResponse()` は rooms / sales / ADR fields を保持する compact source 作成へ更新済みである。
  - 売上・ADR の追加取得 queue は不要である。既存 `/api/v4/booking_curve` response を、sales / ADR まで保持できる raw source として保存したうえで adapter / model へ接続する。
  - 直近の優先対象は売上・ADR の表示ではなく、rank response、将来の単価予測、売上予測へ接続できる保存契約と adapter の整理である。
- スコープ:
  - `this_year_sales_sum`、`last_year_sales_sum`、`two_years_ago_sales_sum`、`three_years_ago_sales_sum`、`this_year_adr`、`last_year_adr` の型と null handling を定義する。
  - `all`、`transient`、`group` のどの segment を単価予測と売上予測の入力候補にするか決める。
  - API の ADR をそのまま使う場合と、`sales_sum / room_sum` で再計算する場合の優先順位と検算方法を決める。
  - rooms-only 予測モデルの出力と接続する場合の入力、処理、出力を明文化する。
- 非目標:
  - この task では UI 実装と IndexedDB schema migration を行わない。
  - 月次 `/api/v1/booking_curve/monthly` の read path を変更しない。
  - 競合価格グラフへ売上や単価を重ねない。
- 受け入れ条件:
  - 売上・ADR を扱う adapter 追加時の入力、出力、null handling、segment 対応が明文化される。
  - 室数予測、単価予測、売上予測の接続順序が明文化される。
  - `RAU-RR-02` の raw source 保存契約更新後、既存 booking curve raw source の保存単位をさらに変更する必要があるかどうかを判断できる。
- 設計結果:
  - `docs/spec_002_curve_core.md` に Sales And ADR Extension を追加し、`SalesAdrObservation`、`UnitPriceForecastV1Candidate`、`SalesForecastV1Candidate` の契約を定義した。
  - sales / ADR は rooms 用 `CurveInput` へ混ぜず、別 adapter で扱う。rooms reference curve と rooms-only forecast は引き続き `CurveObservation.rooms` を使う。
  - ADR は Revenue Assistant の `*_adr` field を第一候補にし、欠損時だけ `sales_sum / room_sum` で計算する。0 室では ADR を推測せず、売上 0 と ADR 0 は欠損と同一視しない。
  - 既存 `booking_curve_raw_source:v2` は必要な fields を保持しているため、保存単位と IndexedDB schema は追加変更しない。
  - 売上予測は rooms forecast と unit price forecast を合成する model とし、sales forecast が rooms forecast を内部で再計算しない。
- verify:
  - docs-only のため `git diff --check` を最小 verify とする。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`

### RAU-SALES-03 sales / ADR adapter と baseline forecast pure functions を実装する

- 状態:
  - 2026-05-28 に実装済み。
- 目的:
  - `RAU-SALES-02` で定義した sales / ADR contract を、UI、API 取得、IndexedDB から分離した pure function として実装する。
  - 将来の rank response、単価予測、売上予測、ADR / sales health diagnostics が同じ adapter を使える状態にする。
- 背景:
  - `booking_curve_raw_source:v2` は rooms / sales / ADR fields を保存済みである。
  - rooms 用 `CurveInput` に sales / ADR を混ぜると、reference curve と forecast の責務が曖昧になるため、別 adapter が必要である。
- スコープ:
  - `src/curveCore.ts` に `SalesAdrObservation`、`UnitPriceForecastV1Candidate`、`SalesForecastV1Candidate` の型を追加する。
  - `/api/v4/booking_curve` response source から `SalesAdrObservation[]` を作る adapter を追加する。
  - `api_current_adr_baseline:v1` の baseline unit price forecast を追加する。
  - rooms forecast と unit price forecast を合成する sales forecast 関数を追加する。
- 非目標:
  - UI 表示を追加しない。
  - IndexedDB schema migration を行わない。
  - Revenue Assistant API request を増やさない。
  - rank recommendation scoring へ接続しない。
  - 月次 `/api/v1/booking_curve/monthly` の read path を変更しない。
- 受け入れ条件:
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
  - 0 室、売上 0、ADR null、API ADR と計算 ADR の差分が diagnostics として区別できる。
  - 既存 rooms reference curve、rooms-only forecast、rank recommendation の公開 UI が変わらない。
- 実装内容:
  - `src/curveCore.ts` に `buildSalesAdrInputFromBookingCurveResponses()` を追加した。
  - `SalesAdrObservation` は `apiAdr`、`computedAdr`、`adr`、`adrSource`、`diagnostics` を持ち、API ADR を優先し、API ADR 欠損時だけ `sales / rooms` を使う。
  - `zero_rooms_for_adr`、`sales_without_rooms`、`api_computed_adr_delta`、`adr_missing` を diagnostics として区別する。
  - `buildUnitPriceForecastResult()` は `api_current_adr_baseline:v1` として、asOfDate 時点の ADR を predictedAdr にする。
  - `buildSalesForecastResult()` は rooms forecast の `predictedFinalRooms` と unit price forecast の `predictedAdr` を掛け合わせ、欠損時は `predictedSales=null` と diagnostics に理由を残す。
- verify:
  - `npm run typecheck`: passed
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`

### RAU-SALES-04 sales / ADR health diagnostics を rank recommendation scoring へ段階接続する

- 状態:
  - 実装済み。
- 目的:
  - `RAU-SALES-03` の adapter を使い、rank recommendation の候補根拠へ ADR / sales health diagnostics を追加する。
  - rooms pickup だけでは判断しにくい、ADR 低下や売上悪化を候補の priority / confidence 補助へ反映できるようにする。
- スコープ:
  - top list へ sales / ADR 数値を直接表示しない。
  - `ADR悪化`、`売上弱含み`、`ADR維持` など、非数値 reason / diagnostics として段階接続する。
  - 既存 `forecastSignal`、reference deviation、rank change resolved、user decision cooldown の挙動を壊さない。
- 非目標:
  - Revenue Assistant への write / bulk apply。
  - 推奨レート金額の表示。
  - rank price table や現在販売中価格の未確認 API を確認済み仕様として扱うこと。
  - 月次 `/api/v1/booking_curve/monthly` の read path 変更。
- 受け入れ条件:
  - sales / ADR が欠損しても既存候補生成が継続する。
  - sales / ADR reason は数値を直接出さず、非数値要約に留める。
  - Chrome DevTools Protocol または Chrome拡張で通常 Chrome 上の Revenue Assistant 候補 list を確認する。
- 実装内容:
  - `src/main.ts` で `booking_curve_raw_source:v2` の roomGroup response から `buildSalesAdrInputFromBookingCurveResponses()` を呼び、`scope="roomGroup"`、`segment="transient"`、`asOfDate` 時点の最新 sales / ADR observation を rank recommendation evidence に接続した。
  - 同じ latest booking curve point の `last_year_*`、`two_years_ago_*`、`three_years_ago_*` を reference とし、ADR は過去年平均比 95% 以下、sales は過去年平均比 90% 以下を弱含み signal とした。
  - `src/rankRecommendation.ts` に `RankRecommendationSalesAdrHealthSignal` を追加し、`adr_down`、`sales_down`、`adr_and_sales_down`、`neutral` を priority / confidence の小さな補助として扱うようにした。
  - top list には sales / ADR 数値、比率、金額を出さず、表示する場合も `ADR弱含み`、`売上弱含み`、`ADR・売上弱含み` の非数値 reason に限定した。
  - 欠損、reference 欠損、reference 0 の場合は signal を推測補完せず、diagnostics だけを残して既存候補生成を継続する。
- verify:
  - `npm run check`: passed
  - Chrome DevTools Protocol で通常 Chrome の `https://ra.jalan.net/` に build 済み userscript を一時注入し、`料金調整候補` heading 1 件、候補 list root 1 件、候補 row 10 件、重大 console / page error 0 件を確認した。
  - 候補 list 内に forecast 数値 label と sales / ADR 数値 label が表示されていないことを確認した。
  - 現在の実データでは `ADR弱含み` / `売上弱含み` / `ADR・売上弱含み` reason の発火は 0 件だったため、実データ発火時の見え方は後続確認に残す。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-SALES-05 sales / ADR health signal の実データ発火と閾値を確認する

- 状態:
  - 完了。
- 目的:
  - `RAU-SALES-04` で接続した sales / ADR health signal が、実データでどの程度発火するかを確認する。
  - 初期閾値で候補根拠が増えすぎないか、逆に実務上気づきたい弱含みを拾えていないかを調整判断できる状態にする。
- スコープ:
  - top list の候補行ごとに `sales_adr_signal_*` diagnostics の分布を確認する。
  - 発火した場合の表示文言が、数値を出さずに判断補助として読めるかを確認する。
  - 閾値を変更する場合は、`docs/spec_003_rank_recommendation_signal.md` と `docs/context/DECISIONS.md` を同時に更新する。
- 非目標:
  - Revenue Assistant への write / bulk apply。
  - 推奨レート金額、ADR 金額、sales 金額、比率の表示。
  - 未確認 API の追加調査や追加 request。
- 受け入れ条件:
  - Chrome DevTools Protocol または Chrome拡張で、通常 Chrome 上の Revenue Assistant 候補 list と diagnostics 分布を確認する。
  - 閾値を変更する場合は、変更理由、入力、判断、出力を正本文書へ残す。
  - 閾値を変更しない場合も、現時点の実データでは維持する理由を `STATUS.md` または `tasks_backlog.md` に残す。
- 実施結果:
  - Chrome拡張 backend は `browser-client.mjs` の bootstrap 後に利用可能であり、`openTabs()` が 3 件を返すことを確認した。タブ本文は読まず、通常 Chrome の接続確認に限定した。
  - Chrome DevTools Protocol で通常 Chrome の Revenue Assistant root に build 済み userscript を一時注入し、候補 list 10 行を確認した。
  - diagnostics 分布は `booking_curve_source_missing` 6 行、`sales_adr_current_adr_missing` 4 行、`sales_adr_current_sales_missing` 4 行、`reference_deviation_missing` 10 行、`forecast_missing` 4 行だった。
  - `sales_adr_signal_neutral`、`sales_adr_signal_adr_down`、`sales_adr_signal_sales_down`、`sales_adr_signal_adr_and_sales_down` は 0 行だった。
  - 候補 list 内に forecast 数値 label と sales / ADR 数値 label は表示されていなかった。重大な console / page error は 0 件だった。
- 判断:
  - 比較可能な sales / ADR health signal が 0 件のため、初期閾値は変更しない。
  - 現時点で閾値を変更すると、閾値の問題ではなく raw source 未保存または current sales / ADR 欠損を誤って補正しようとする危険がある。
  - 次は閾値変更ではなく、rank recommendation 候補で `booking_curve_raw_source:v2` roomGroup record が揃う範囲を広げる task に進む。
- metadata:
  - `spec-impact`: no
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-SALES-06 rank recommendation 候補の booking_curve raw source coverage を改善する

- 状態:
  - 実装済み。
  - 通常 Chrome の Revenue Assistant tab では、Chrome DevTools Protocol で IndexedDB と DOM を確認した。`booking_curve_source_missing` は top list 10 行で 0 行になった。
  - 同じ確認で、top list 10 行すべてに `booking_curve_raw_source:v2` の exact roomGroup record があり、うち 6 行は最新 observation の sales / ADR を抽出できることを確認した。
  - ただし、最新 build の一時注入後に Revenue Assistant API が 401 を返したため、ログイン済み状態での DOM 再描画後 `sales_adr_signal_*` 分布確認は `RAU-SALES-07` に分ける。
- 実装内容:
  - top list の表示中 candidates を、warm cache の優先候補として保持する。
  - 既存 warm cache queue 内の `currentRaw x roomGroup` task のうち、表示中 candidates と一致する `stayDate x roomGroupId` を先頭側へ安定 sort する。
  - 優先 task を新規取得した場合は `rank-recommendation-warm-cache` reason で calendar sync を強制再実行し、top list が保存済み raw source を読み直せるようにした。
  - sales / ADR health の latest point / latest observation 比較では、`YYYYMMDD` と `YYYY-MM-DD` の文字列比較が混ざらないよう、比較前に date key を正規化する。
- 変更しない契約:
  - warm cache の対象日付範囲、request 件数、request 間隔、hidden tab pause、run limit、cooldown、重複排除、既存 raw source skip は変更しない。
  - top list には sales / ADR 数値、比率、金額を直接表示しない。
  - Revenue Assistant への write / bulk apply は追加しない。
- 目的:
  - sales / ADR health signal、forecast signal、reference deviation が、raw source 未保存のために候補根拠へ入らない状態を減らす。
  - top list の `stayDate x roomGroup` 候補に対して、既存 `booking_curve_raw_source:v2` の roomGroup record が揃う範囲を増やし、次回の sales / ADR health 閾値評価を比較可能な実データで行えるようにする。
- スコープ:
  - 既存 warm cache、IndexedDB raw source store、rank recommendation evidence read path の関係を確認する。
  - top list 候補で `booking_curve_source_missing` になった `stayDate x roomGroup` を、既存 queue または既存 raw source request policy の範囲で補えるか判断する。
  - 追加 request が必要な場合は、対象件数、頻度、停止条件、document hidden 時の扱い、既存 warm cache との重複排除を先に決める。
- 非目標:
  - Revenue Assistant への write / bulk apply。
  - 推奨レート金額、ADR 金額、sales 金額、比率の表示。
  - 未確認 API を新規に実装すること。
  - 既存 warm cache の無制限な request 増加。
- 受け入れ条件:
  - `booking_curve_source_missing` が出る原因を、未保存、query key 不一致、asOfDate 不一致、roomGroupId 不一致、取得失敗のどれかに分けて説明できる。
  - 実装する場合は、既存 request safety rule と重複排除を維持する。
  - 実装する場合は、Chrome DevTools Protocol または Chrome拡張で通常 Chrome 上の候補 list と diagnostics 分布を再確認する。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: implemented
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-SALES-07 ログイン済み通常 Chrome で sales / ADR health signal の DOM 再描画分布を確認する

- 状態:
  - 完了。
  - Chrome拡張 backend で通常 Chrome の Revenue Assistant root tab が存在することを確認した。
  - Chrome DevTools Protocol で同 tab の `/api/v1/suggest/output/current_settings?from=20260501&to=20260531` が 200 を返すことを確認した。
  - 最新 build を同 tab へ一時注入し、top list diagnostics 分布を確認した。
- 確認結果:
  - top list row count は 10 行だった。
  - `booking_curve_source_missing` は 0 行だった。
  - `sales_adr_current_adr_missing` と `sales_adr_current_sales_missing` は各 3 行だった。
  - `sales_adr_signal_neutral` は 2 行、`sales_adr_signal_adr_down` は 4 行、`sales_adr_signal_sales_down` は 0 行、`sales_adr_signal_adr_and_sales_down` は 1 行だった。
  - `ADR弱含み` は 4 行、`ADR・売上弱含み` は 1 行で表示された。
  - top list に sales / ADR の数値、金額、比率は表示されなかった。
  - CDP 実行中の page error と console error は 0 件だった。
- 判断:
  - 比較可能な sales / ADR health signal は発火したが、1 snapshot だけでは閾値の良否を判断できないため、ADR 95% 以下、sales 90% 以下の初期閾値は変更しない。
  - その後の `RAU-SALES-08` で、`raise_watch` と sales / ADR 弱含み signal が同時に出る候補を、作業順と表示上どう扱うかを調整した。
- 目的:
  - `RAU-SALES-06` の date 正規化修正と warm cache 優先化後に、通常 Chrome のログイン済み Revenue Assistant 画面で top list が保存済み raw source を読み直し、sales / ADR health diagnostics を更新することを確認する。
- 背景:
  - `RAU-SALES-06` の CDP 確認では、IndexedDB 上の top list 10 行 exact roomGroup record は揃い、6 行で最新 observation の sales / ADR を抽出できた。
  - しかし最新 build を通常 Chrome へ一時注入した時点で Revenue Assistant API が 401 を返したため、current settings 再取得を含む DOM 再描画確認は完了できなかった。
- スコープ:
  - 通常 Chrome のログイン済み状態を確認する。
  - Chrome DevTools Protocol または Chrome拡張で、top list の row count、`booking_curve_source_missing`、`sales_adr_current_adr_missing`、`sales_adr_current_sales_missing`、`sales_adr_signal_*` 分布を確認する。
  - 比較可能な `sales_adr_signal_*` が出た場合だけ、`RAU-SALES-05` で据え置いた ADR 95% 以下、sales 90% 以下の閾値を見直す必要があるかを判断する。
- 非目標:
  - Revenue Assistant への write / bulk apply。
  - 推奨レート金額、ADR 金額、sales 金額、比率の表示。
  - 未確認 API の新規実装。
- 受け入れ条件:
  - ログイン済み通常 Chrome で、最新 build 注入または Tampermonkey 更新後の top list diagnostics 分布を確認している。
  - 401 などの認証失敗がある場合は、実装不具合と認証状態を分けて記録している。
  - sales / ADR health signal の閾値を変更する場合は、変更理由、入力分布、判断、出力影響を `docs/context/DECISIONS.md` と対象 spec に残している。
- metadata:
  - `spec-impact`: no
  - `spec-checkpoint`: verified
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-SALES-08 `raise_watch` と sales / ADR 弱含み signal が同時に出る候補の表示または補正を調整する

- 状態:
  - 2026-05-28 に実装済み。
  - `raise_watch` と `adr_down`、`sales_down`、`adr_and_sales_down` が同時に出る場合は、action を変えずに priority を最大 `medium` まで下げる。
  - confidence は既存どおり弱含みの種類に応じて小さく抑制する。
  - top list へ sales / ADR 数値、金額、比率は追加していない。
  - 合成入力による候補生成確認では、weak signal なしの場合は `raise_watch` / `high`、`adr_down`、`sales_down`、`adr_and_sales_down` の場合は `raise_watch` / `medium` になることを確認した。
  - 通常 Chrome の最新 dist 一時注入後の実画面確認では、top list 10 行すべてが `raise_watch` / `high` で、今回の snapshot では sales / ADR 弱含み reason が 0 行だった。そのため、実データ上の weak signal 行が `medium` になる表示はこの snapshot では発火しなかった。
- 目的:
  - top list で `上げ検討` と `ADR弱含み` または `ADR・売上弱含み` が同時に出る候補について、利用者が「上げてよい候補」ではなく「上げ検討だが慎重確認が必要な候補」と理解できるようにする。
  - sales / ADR health signal を、単なる理由文字列ではなく、作業順、priority、confidence、または表示文言のいずれかへ反映する。
- 背景:
  - `RAU-SALES-07` の通常 Chrome 確認では、top list 10 行すべてが `raise_watch` かつ `high` だった。
  - 同じ 10 行のうち、`sales_adr_signal_adr_down` が 4 行、`sales_adr_signal_adr_and_sales_down` が 1 行だった。
  - 現在の仕様では sales / ADR health signal は action を単独で決めず、`raise_watch` では confidence の抑制として扱う。しかし、UI 上で利用者が作業順を判断するには、weak signal の扱いが十分に目立つかを確認する必要がある。
- スコープ:
  - `src/rankRecommendation.ts` の priority / confidence 補正と、`src/main.ts` の top list 表示文言を確認する。
  - `raise_watch` かつ `adr_and_sales_down` の候補、`raise_watch` かつ `adr_down` の候補、`raise_watch` かつ `sales_down` の候補を分けて扱う必要があるか判断する。
  - 実装する場合は、top list へ sales / ADR 数値、金額、比率を出さず、非数値の注意文言または priority / confidence 補正に留める。
- 非目標:
  - ADR 95% 以下、sales 90% 以下の閾値をこの task だけで変更すること。
  - 推奨レート金額を出すこと。
  - Revenue Assistant への write / bulk apply。
- 受け入れ条件:
  - `raise_watch` と sales / ADR 弱含み signal が同時に出た場合の扱いを、表示、priority、confidence のどこで表すか決めている。
  - 実装する場合は、Chrome DevTools Protocol または Chrome拡張で top list 10 行の action、priority、weak signal reason 表示、数値非表示を確認している。
  - 閾値を変更しない場合は、その理由を `docs/context/DECISIONS.md` に残している。
- metadata:
  - `spec-impact`: unknown
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

### RAU-SALES-09 sales / ADR 弱含み行の priority downgrade を実データで再確認する

- 状態:
  - 2026-05-28 に確認済み。
  - Chrome拡張 backend で通常 Chrome の Revenue Assistant root tab が 1 件あることを確認した。
  - Chrome DevTools Protocol で最新 dist を通常 Chrome に一時注入し、top list 10 行を確認した。
  - 現在 snapshot では weak signal reason が 0 行で、全行 `raise_watch` / `高` だったため、weak signal 行の `medium` 表示はこの snapshot では確認不能だった。
  - top list に sales / ADR の数値、金額、比率は表示されなかった。
  - page error / console error は 0 件だった。
- 目的:
  - `RAU-SALES-08` の priority downgrade が、通常 Chrome の Revenue Assistant 実データで weak signal 行に表示されることを確認する。
- 背景:
  - `RAU-SALES-08` の実装時点では、合成入力では `raise_watch + weak signal -> medium` を確認できた。
  - しかし通常 Chrome の確認 snapshot では、top list 10 行に sales / ADR 弱含み reason が出なかったため、実データでの `medium` 表示は観測できなかった。
- スコープ:
  - Chrome拡張で通常 Chrome の Revenue Assistant 対象タブを確認する。
  - CDP で最新 dist を一時注入し、top list の action、priority、weak signal reason、sales / ADR 数値非表示を確認する。
- 非目標:
  - 閾値をこの task だけで変更しない。
  - 推奨レート金額を出さない。
  - Revenue Assistant への write / bulk apply を行わない。
- 受け入れ条件:
  - weak signal 行が発火した場合、その行の priority が `medium` 以下であることを確認している。
  - weak signal 行が発火しない場合、その snapshot では確認不能であることを `docs/context/STATUS.md` または `docs/context/DECISIONS.md` に残している。
  - top list に sales / ADR 数値、金額、比率が表示されないことを確認している。
- metadata:
  - `spec-impact`: no
  - `spec-checkpoint`: after-impl
  - `target-spec`: `docs/spec_003_rank_recommendation_signal.md`

## Completed / Superseded Context

### RAU-AF-07 booking_curve raw source IndexedDB cache と ACT/0日前分離を実装する

- 状態:
  - 実装済み。
  - Tampermonkey 再読込後の GUI 確認で、current が先に表示され、reference curve が後から補完されることを確認した。
  - `recent_weighted_90:v3` で `0日前 -> ACT` の不自然なスパイク解消を確認した。
- 実装内容:
  - `src/bookingCurveRawSourceStore.ts` に `/api/v4/booking_curve` raw source 用 IndexedDB store を追加した。
  - 当初の `src/main.ts` の booking curve 取得経路は、memory、localStorage、IndexedDB raw source、API の順だった。`RAU-WC-07` 以降は localStorage の response 全体 cache を廃止し、memory、IndexedDB raw source、API の順に変更した。
  - reference curve の表示範囲を current と同じ `0〜360日前 + ACT` へ広げた。
  - ホテル全体と室タイプ別 card で、current curve を先に描画し、reference curve を非同期で補完するようにした。
  - `ReferenceCurveDiagnostics.actComparison` を追加し、`0日前` と `ACT` の rooms、sourceCount、差分を記録できるようにした。
  - 直近型 ACT 算出では、`as_of_date` より前に宿泊済みの履歴 stay_date だけを final rooms 候補にするよう修正した。
- GUI確認:
  - raw source IndexedDB に保存されることを確認した。
  - derived reference curve IndexedDB に保存されることを確認した。
  - 直近型は `recent90w` 相当で進めることを確認した。
  - 直近型が遠い LT で空になる場合があるのは、API取得失敗ではなく、recent90w の LT 別 window 内に非 null 観測が不足するためと整理した。

### RAU-UX-01 competitor prices と団体系列の導入要否を再判断する

- 状態:
  - 判断済み。
- 判断結果:
  - `団体` は標準で扱うが、常時3枚目の panel として増やさず、`個人 / 団体` toggle として追加する。
  - 競合価格は現在値表だけなら Revenue Assistant 標準タブと重複するため、現在値表の複製は実装しない。
  - 競合価格を扱う場合は、取得時点つき snapshot を IndexedDB に保存し、価格推移を追跡する後続候補にする。
  - `直近同曜日カーブ` は、`直近型カーブ` の妥当性確認に使う補助線として追加候補にする。

### RAU-AF-05 reference curve の IndexedDB cache と request scheduler を実装する

- 状態:
  - 実装済み。
- 実装内容:
  - `src/referenceCurveStore.ts` に、derived reference curve の IndexedDB store を追加した。
  - `ReferenceCurveResult` を保存する record adapter と cache key builder を追加した。
  - 同じ cache key の計算を共有する in-flight compute dedupe を追加した。
  - 同じ request key の API 取得を共有する request-level dedupe を追加した。
  - reference curve 用 request scheduler を追加し、同時 request 数の初期値を 3 にした。
- 非目標として維持したこと:
  - 既存の小さい日次 localStorage cache 全体は IndexedDB へ移していない。
  - 初期表示時に全室タイプ分の reference curve を一括取得する処理は追加していない。
- 保持期間:
  - first wave では TTL を設けず、`asOfDate` と `algorithmVersion` を key に含めて分離する。
  - 古い key の削除は、保存量または再計算頻度が問題になった時点で別 task として判断する。

### RAU-AF-04 BCL-tuned reference curve の算出コアを実装する

- 状態:
  - 実装済み。
- 実装内容:
  - `src/curveCore.ts` に、UI、API 取得、storage に依存しない core logic を追加した。
  - canonical input、canonical output、diagnostics の型を追加した。
  - Revenue Assistant の `/api/v4/booking_curve` response 群を canonical input へ変換する adapter を追加した。
  - `recent_weighted_90` と `seasonal_component` を純粋関数として追加した。
  - request scheduler と UI 接続で使う候補 stay_date 生成関数を追加した。
- 未実施:
  - BCL-tuned reference curve の UI 接続。
  - IndexedDB derived cache。
  - request scheduler。

### RAU-AF-03 Analyze booking curve reference curve の UI first wave を実装する

- 状態:
  - UI shell としてはコード実装済み。
  - 算出ロジックは `直近 7 泊日中央値` と `last_year_room_sum` 優先の仮定義だったため、2026-04-24 の BCL repo 再確認により仕様ターゲットから外す。
- 残すもの:
  - ホテル全体 block と室タイプ別 card の reference curve legend、表示切替、参考線の UI shell。
- 差し替えるもの:
  - `直近型カーブ` と `季節型カーブ` の算出ロジック。
  - reference curve 用 cache と request scheduling。

## Remaining Task Triage

Now:

- なし

Next:

- なし

After Next:

- なし

Later:

- なし

統合判断:

- `RAU-RR-01` は 2026-05-27 の docs-only 正本化で完了したため、Remaining Task Triage には含めない。
- `RAU-RR-02` は 2026-05-27 に実装済みである。保存 schema version は `booking_curve_raw_source:v2`、保存方式は rooms / sales / ADR fields までの compact source 維持、IndexedDB database version は据え置きとしたため、Remaining Task Triage には含めない。
- Rank Recommendation Bundle は、`RAU-FC-01` の rooms-only 予測モデル導入判断と重なるが、UI、候補 lifecycle、user decision、rank history、rank response、future bulk apply を含むため、独立 bundle として扱う。
- first phase の rank recommendation は forecast model を必須入力にしない。reference curve deviation、capacity、remaining rooms、transient / group 分解、直近 rank change、競合価格 snapshot、sales / ADR raw source を使って、RM の作業キューを先に作る。
- `RAU-RR-03` は 2026-05-28 に実施済みである。current rank と rank ladder 候補は確認済みだが、当時は `rank_sequences[].default_sequence` の扱いを未確定としていた。`rank_sequences[].default_sequence` の扱いは `RAU-RR-12` で確認済みに更新した。
- rank price table、現在販売中価格、rank 反映 API の request shape と安全制約は未確認として残している。
- `RAU-RR-04` は実装済みである。トップ画面に `stayDate x roomGroup` 単位の候補リスト shell を追加し、current settings の current rank、remaining、max を使う仮候補生成を `src/rankRecommendation.ts` に分離した。`Analyzeで確認` は URL 導線として表示し、`様子見` と `対応不要` は `RAU-RR-07` まで disabled button として置く。
- `RAU-RR-05` は実装済みである。`booking_curve_raw_source:v2` の roomGroup raw source から asOfDate 時点の this_year rooms と過去年 rooms 平均を読み、`all`、`transient`、`group` ごとに reference deviation を計算する。欠損は推測で埋めず `reference不足` として出す。group が上振れ主因で transient が上振れていない場合は、個人価格 rank の上げ検討を抑制する。
- `RAU-RR-06` は実装済みである。`Analyzeで確認` click 時に pending focus を `sessionStorage` へ保存し、Analyze 表示時に対象 roomGroup card を開く、scroll する、highlight する。対象が見つからない場合は通常 Analyze 表示を維持し、console warning へ診断を出す。
- `RAU-RR-07` は実装済みである。IndexedDB store `revenue-assistant-rank-recommendations` / `rank-recommendation-decisions` に、`stayDate x roomGroup x action x reasonFingerprint` 単位で `snooze` と `dismiss` を保存する。`snooze` は LT 帯に応じた asOfDate 基準 cooldown を持ち、`dismiss` は同じ reasonFingerprint の再表示を抑制する。
- `RAU-RR-08` は実装済みである。トップ候補 list の同期時に表示範囲の `/api/v3/lincoln/suggest/status` を読み、同じ `stayDate x roomGroupId` で asOfDate 以降の rank change がある candidate を active list から外す。
- `RAU-RR-07` と `RAU-RR-08` は、future bulk apply だけでなく first phase の候補リストのノイズ低減にも必要であるため、UI shell と初期 scoring の後に置く。
- `RAU-RR-09` は 2026-05-28 の docs 設計で完了した。rank response は価格弾力性ではなく、実価格または rank price table が取れるまで `ランク反応度` として扱う。
- `RAU-RR-10` は 2026-05-28 の docs 設計で完了した。current rank と rank ladder 候補は使えるが、`RAU-RR-12` までは `rank_sequences[].default_sequence` の扱いが未確定だったため、recommendedRank 名は出さない契約にしていた。
- `RAU-RR-11` は 2026-05-28 の feasibility 判断で完了した。bulk apply は将来候補だが first phase の非目標である。API、current rank 再取得、別 rank change 確認、user decision、cooldown、low confidence、small capacity、group-driven 除外、preview、部分失敗記録が揃うまで実装しない。
- `RAU-RR-12` は 2026-05-28 に実装済みである。`default_sequence` は名前順初期化用であり、rank 上げ / 下げ方向には使わない。response 配列順を recommended rank の上下方向として使う判断は、利用者確認後の `RAU-RR-14` で置き換えた。
- `RAU-RR-13` は 2026-05-28 に実装済みである。rank ladder 端で隣接 recommended rank が存在しない場合は、`上限ランク: 上げ余地なし` または `下限ランク: 下げ余地なし` と表示する。端判定は `RAU-RR-14` 後の推定 rank 順序に従う。推奨レート金額、2段階以上の rank 移動、Revenue Assistant write / bulk apply は追加していない。
- `RAU-RR-14` は 2026-05-28 に実装済みである。大国町では rank 名 `1` が最高ランク、`20` が最低ランクであるため、rank 名がすべて整数として読める場合は数値昇順を高ランクから低ランクへの順序として推定する。top list では `raise_watch` に 1 つ高い rank、`lower_watch` に 1 つ低い rank を表示する。rank order を推定できない場合は recommended rank を出さず `rank_order_unresolved` を diagnostics に残す。
- `RAU-RR-15` は 2026-05-28 に実装済みである。rank order source は `numeric_rank_name`、`settings_screen`、`manual_override`、`unresolved` として扱う。first implementation では `numeric_rank_name` と `manual_override` を実装し、top list 上で現在 source と高ランクから低ランクへの順序を確認できる。manual override は browser-local 保存で、reset で推定順序へ戻せる。CDP read-only では `/settings/site-controller` link と fetch 200 は確認したが、response は SPA shell で rank order payload は確認できなかった。
- `RAU-RR-16` は 2026-05-28 に実装済みである。設定画面 `設定 > 表示 > 料金ランクの並び順` の route は `/settings/price-rank-sequence` であり、`GET /api/v1/rank_sequences` の配列順が設定画面のドラッグリスト順序として表示されることを確認した。RAU は、manual override がない場合、この配列順を source `settings_screen` として使う。名前パターンは企業や施設により数字系、ローマ字または英字系、記号混在系のいずれもあり得て、同じ表記系でも上下関係が逆になる運用があるため、数値 rank 名推定は設定画面順序が取れない場合の fallback とする。
- `RAU-RR-17` は 2026-05-28 に docs 設計済みである。曜日別関係と競合価格内の自社料金位置は rank order source ではなく、rank recommendation scoring の priority / confidence / reasonCodes / diagnostics 補助として扱う。rank 名は企業や施設により数字系、ローマ字または英字系、記号混在系のいずれもあり得るため、名前パターン、曜日別販売傾向、競合価格内自社料金位置だけで上下関係を断定しない。
- `RAU-RR-18` は 2026-05-28 に実装済みである。weekday context は保存済み `booking_curve_raw_source:v2` の同曜日候補、競合価格内自社料金位置は保存済み `competitor-price-snapshots` の最新 snapshot から作り、既存 action を単独で変えない小さな scoring support として接続した。Chrome DevTools Protocol の実画面確認では、候補 list 10 行、page error 0 件、console error 0 件、`自社安め` 7 行、weekday reason 0 行、金額・差額・比率の直接表示 0 行だった。
- `RAU-RR-19` は 2026-05-28 に確認済みである。通常 Chrome の実データでは top list 10 行すべてが `raise_watch` / `high` / `active` で、`自社安め` は 7 行、`自社高め` は 0 行、weekday 強弱 reason は 0 行、金額・差額・比率の直接表示は 0 行だった。1 画面の観測では閾値変更の根拠として不十分なため、競合価格内自社料金位置の 95% / 105% 閾値と weekday context の 115% / 85% 閾値は変更しない。
- `RAU-RR-20` は 2026-05-28 に確認済みである。`current_settings` と `rm_room_groups` は roomGroup field を持つが `jalan` 側部屋タイプ code を持たず、競合価格 snapshot は `jalanFacilityRoomType` と `jalanRoomTypes` を持つが `rm_room_group_id` 相当を持たないため、roomGroup 名と `jalan` 側部屋タイプ名の文字列類似だけで対応を確定しない。
- `RAU-RR-21` は 2026-05-28 に実装済みである。roomGroup と `jalan` 側部屋タイプの対応 source が未確認であるため、競合価格内自社料金位置 signal は top list の主要 reason と confidence / priority 補正から外し、diagnostics にだけ残す。
- `RAU-RR-22` は 2026-05-28 に実装済みである。top list に `確度` 列を追加し、内部 `confidence` を数値や percent ではなく `高`、`中`、`低` の段階表示に丸める。forecast 数値、sales / ADR 数値、金額、比率は top list に表示しない。
- `RAU-RR-23` は 2026-05-28 に実装済みである。top list の `確度` cell に hover tooltip を追加し、主要根拠と不足または注意の種類を非数値で表示する。tooltip でも forecast 数値、sales / ADR 数値、競合価格の金額、差額、percent は表示しない。
- `RAU-SALES-01` で、Analyze 日付単位の売上・ADR は既存 `/api/v4/booking_curve` response に含まれることを確認した。2026-05-27 に `RAU-RR-02` で raw source 保存契約を v2 へ更新したため、追加取得 queue は作らない。
- `RAU-FC-01` は 2026-05-28 に判断済みである。結論は、forecast model を今すぐ実装せず、先に `RAU-FC-02` で forecast evaluation dataset / metrics と `ForecastResult v1 candidate` を設計することである。
- `RAU-FC-02` は 2026-05-28 に設計済みである。`ForecastResult v1 candidate` の field、evaluation dataset の grain、除外条件、未来情報混入防止、metric、rank recommendation impact proxy を `docs/spec_002_curve_core.md` に確定した。
- `RAU-FC-03` は 2026-05-28 に実装済みである。`src/curveCore.ts` に evaluation case 生成と evaluation result 集計を追加し、raw source adapter が作る `CurveInput` から forecast 評価用 case を作れるようにした。
- `RAU-FC-04` は 2026-05-28 に実装済みである。`recent_deviation_adjusted_seasonal:v1` を first forecast model として追加し、seasonal LT 比率換算の `seasonal_ratio_baseline:v1` も evaluation baseline として返せるようにした。
- `RAU-FC-05` は 2026-05-28 に完了した。forecast 欠損時は既存 reference deviation scoring を継続し、top list へ forecast 数値を直接表示しない。Chrome DevTools Protocol の実画面確認では、候補 list root と候補 row 10 件が表示され、重大な console / page error は 0 件だった。現在の実データでは forecast reason の表示発火は 0 件だったため、後続で forecast 閾値や実データ確認を行う場合は別 task として扱う。
- `RAU-SALES-02` は 2026-05-28 に完了した。`docs/spec_002_curve_core.md` に sales / ADR adapter、unit price forecast、sales forecast の契約を追加した。既存 `booking_curve_raw_source:v2` の保存単位は追加変更しない。次は `RAU-SALES-03` で pure function 実装を行う。
- `RAU-SALES-03` は 2026-05-28 に実装済みである。室数予測、単価予測、売上予測の接続順序を保つため、UI や rank recommendation scoring へ接続せず、core logic の pure function と diagnostics だけを追加した。
- `RAU-SALES-04` は 2026-05-28 に実装済みである。`RAU-SALES-03` の adapter を使って、rank recommendation の候補根拠へ ADR / sales health diagnostics を段階接続した。top list へ sales / ADR 数値を直接表示せず、非数値 reason / diagnostics だけを追加する契約を維持する。Chrome DevTools Protocol の実画面確認では、候補 list root と候補 row 10 件が表示され、重大な console / page error は 0 件だった。現在の実データでは sales / ADR reason の表示発火は 0 件だったため、`RAU-SALES-05` で diagnostics 分布と閾値を確認する。
- `RAU-SALES-05` は 2026-05-28 に完了した。top list 10 行の diagnostics 分布は、`booking_curve_source_missing` 6 行、`sales_adr_current_adr_missing` 4 行、`sales_adr_current_sales_missing` 4 行で、比較可能な `sales_adr_signal_*` は 0 行だった。初期閾値は変更せず、次は `RAU-SALES-06` で raw source coverage を改善する。
- `RAU-SALES-06` は 2026-05-28 に実装済みである。top list の表示中 candidates と一致する既存 `currentRaw x roomGroup` warm cache task を優先し、取得後に rank recommendation list を再同期する。request 範囲や件数は増やしていない。さらに、sales / ADR health の latest observation 比較で `YYYYMMDD` と `YYYY-MM-DD` が混ざらないよう date key を正規化した。Chrome DevTools Protocol では IndexedDB 上の exact roomGroup record が top list 10 行すべてに存在し、6 行で最新 sales / ADR を抽出できることを確認した。一方、最新 build 注入時に Revenue Assistant API が 401 を返したため、ログイン済み通常 Chrome での DOM 再描画後 signal 分布確認は `RAU-SALES-07` へ分ける。
- `RAU-SALES-07` は 2026-05-28 に完了した。Chrome拡張 backend で通常 Chrome の Revenue Assistant root tab を確認し、Chrome DevTools Protocol で `/api/v1/suggest/output/current_settings?from=20260501&to=20260531` が 200 を返すことを確認した。最新 build 一時注入後の top list 10 行では、`booking_curve_source_missing` 0 行、`sales_adr_current_adr_missing` 3 行、`sales_adr_current_sales_missing` 3 行、`sales_adr_signal_neutral` 2 行、`sales_adr_signal_adr_down` 4 行、`sales_adr_signal_sales_down` 0 行、`sales_adr_signal_adr_and_sales_down` 1 行だった。sales / ADR の数値、金額、比率は表示されなかった。初期閾値は変更せず、`RAU-SALES-08` で `raise_watch` と weak signal の同時発火時の表示または補正を調整した。
- `RAU-SALES-08` は 2026-05-28 に実装済みである。`raise_watch` と `adr_down`、`sales_down`、`adr_and_sales_down` が同時に出る場合、action は `raise_watch` のまま維持し、priority を最大 `medium` まで下げる。合成入力では `raise_watch + weak signal -> medium` を確認した。通常 Chrome の最新 dist 一時注入後の snapshot では top list 10 行に weak signal reason が出なかったため、実データでの weak 行 `medium` 表示は `RAU-SALES-09` のデータ依存確認へ分ける。
- `RAU-SALES-09` は 2026-05-28 に確認済みである。通常 Chrome の最新 dist 一時注入後の top list 10 行では weak signal reason が 0 行だったため、weak signal 行の `medium` 表示はこの snapshot では確認不能だった。top list に sales / ADR の数値、金額、比率は表示されず、page error / console error は 0 件だった。
- 旧 `RAU-AF-03` は UI shell 実装として扱い、BCL-tuned 算出ロジックへの差し替えは `RAU-AF-04`、cache と request scheduling は `RAU-AF-05`、GUI 接続と確認は `RAU-AF-06` に分ける。
- `直近型カーブ` と `季節型カーブ` は同じ入力 matrix と cache key 設計を共有するため、算出コアは同じ task bundle で扱う。
- response 改善は算出ロジックと密接に関係するが、主成果物と verify 観点が異なるため `RAU-AF-05` として分ける。
- `RAU-AF-06` の GUI 確認は、`RAU-AF-07` で raw source cache と 360 日表示へ変更した後の画面確認に吸収する。
- raw source 保存、`0日前` と `ACT` の分離、部屋タイプ別 card の体感速度改善、reference curve の 360 日表示は、取得証跡と read path の変更を共有するため `RAU-AF-07` として束ねる。
- 旧 backlog の月次実績画面関連 task は、`RAU-MP-01` へ束ねて優先度を下げる。
- `RAU-UX-01` の判断結果により、`団体` は `RAU-AF-08` の `個人 / 団体` toggle へ、直近同曜日比較は `RAU-AF-09` へ、競合価格は現在値表ではなく `RAU-CP-01` の価格推移 snapshot 設計へ分割する。
- `RAU-AF-08` を先に行う理由は、既存 booking curve panel の segment 表示切替だけで実装でき、直近同曜日補助線より表示構造への影響が小さいため。
- `RAU-AF-09` は線の本数と凡例、hover 表示が増えるため、`個人 / 団体` toggle の表示構造を固めた後に実装する。
- `RAU-CP-01` は `/api/v5/competitor_prices` の現在値表を複製しない。価格推移を扱うには snapshot 保存設計が必要なため、表示実装より先に保存単位を設計する。
- `RAU-CP-01` の調査結果により、競合価格は競合施設一覧なしでは取得できない。`RAU-CP-02` では、検索条件 signature ごとの snapshot store と取得 adapter を先に作る。
- `RAU-CP-02` を先に行う理由は、人数別最安値グラフを出すには、同じ stay_date の過去 snapshot と保存時点の競合施設情報を読める保存単位が必要なため。
- `RAU-CP-03` は、`RAU-CP-02` の保存済み snapshot を使って、競合価格タブ内に人数別最安値グラフを出す task とする。販売設定タブには競合価格を表示しない。
- `RAU-CP-04` は、Revenue Assistant 側の競合価格絞り込みで標準表が再描画されたとき、RAU グラフが標準表より上へ移動する表示順バグを直す task とする。データ取得や IndexedDB schema は変更しない。
- `RAU-CP-05` は、`jalan_room_types[]` 単独指定で部屋タイプ別 plan が返ることを確認したため追加する。複数部屋タイプ同時指定では各部屋タイプを網羅できないため、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` を個別 request として扱う。ただし、`指定なし` snapshot は廃止しない。`SEMI_DOUBLE` と raw room type が空のその他相当 plan は、Revenue Assistant の部屋タイプ絞り込み選択肢に独立して存在しないため、`指定なし` snapshot で保持する。
- `RAU-WC-07` は、2026-04-30 の GUI 確認で booking curve localStorage 書き込みの `QuotaExceededError` が実観測されたため追加した。2026-05-01 時点で localStorage booking curve response cache の廃止と GUI 確認まで完了している。
- `RAU-MP-01` は、月次カーブのレスポンス改善、切替 UX 改善、画面 open 直後の snapshot prefetch、Chrome CDP と利用者目視の GUI 確認まで完了した。月次の過去 batch 履歴比較、日次差分表示、表示密度の追加調整は、必要性が再確認された場合に別 task として切る。
- `RAU-WC-01` は、部屋タイプ別 booking curve の表示待ちを減らすため、`RAU-CP-01` より先に進める。取得順は部屋タイプ優先ではなく、近い stay_date からホテル全体と全室タイプを揃える方針にする。
- 予測モデルと予測評価は将来候補として残すが、reference curve の core logic と GUI 接続が完了するまでは `Later` に置く。先に `RAU-AF-04` で evaluation-ready な input / output / diagnostics を作り、後続 task が同じ core contract を再利用できる状態にする。
