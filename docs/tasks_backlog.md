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
  - 部屋タイプ名は raw value をそのまま出さず、`シングル`、`ダブル`、`ツイン`、`トリプル` などのカタカナ表記へ寄せる。
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
  - 部屋タイプ名が `シングル`、`ダブル`、`ツイン`、`トリプル` などの読みやすい表記で表示される。
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
  - 部屋タイプ名を `シングル`、`ダブル`、`ツイン`、`トリプル` などのカタカナ表記へ寄せた。
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

## Now

### RAU-MP-01 月次実績画面の LT 基準 custom booking curve を再開する

- 目的:
  - 追加済み route-scoped slice、IndexedDB write-only snapshot、2 カラム multi-month chart を、どこまで final graph へ寄せるか判断する。
- 保留理由:
  - 現時点では Analyze 日別の rooms-only reference curve のほうが、部屋タイプ別レート調整の判断コストを直接下げるため優先度が高い。
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

## Later

### RAU-FC-01 rooms-only 予測モデルの導入要否を判断する

- 目的:
  - BCL-tuned reference curve 実装後に、現在観測値、`直近型カーブ`、`季節型カーブ` から最終販売室数または将来 booking curve を予測する価値があるか判断する。
- 前提:
  - `RAU-AF-04` で core logic の input / output / diagnostics が実装済みであること。
  - `RAU-AF-07` で raw source cache、360 日 reference curve、ACT diagnostics の GUI 使用感を確認済みであること。
- 非目標:
  - 人数 forecast。
  - PMS データ、DWH データ、学習済み外部モデルを必須にすること。
  - 予測値を根拠なく自動レート変更へつなげること。
- metadata:
  - `spec-impact`: unknown
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`

### RAU-FC-02 予測評価 dataset と metrics を設計する

- 目的:
  - rooms-only 予測モデルを採用する前に、過去 stay_date を使って予測誤差と偏りを確認できる評価入力と評価指標を決める。
- スコープ:
  - `EvaluationCase` と `EvaluationResult` の具体的な保存単位、抽出条件、metric を決める。
  - `as_of_date` 時点で未観測の情報を入力へ混ぜないルールを確認する。
  - 初期 metric は `maeRooms`、`smape`、`biasRooms` を候補にする。
- 非目標:
  - 評価用の外部 DB を必須にすること。
  - 合格基準をこの task だけで固定すること。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`

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

- `RAU-MP-01` 月次実績画面の LT 基準 custom booking curve を再開する

Next:

- `RAU-FC-01` rooms-only 予測モデルの導入要否を判断する

After Next:

- `RAU-FC-02` 予測評価 dataset と metrics を設計する

Later:

- なし

統合判断:

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
- `RAU-MP-01` は、Analyze 日付ページの競合価格表示と booking curve localStorage 容量超過整理が完了したため再開候補だったが、競合価格の表示順バグと部屋タイプ別 snapshot 欠損が見つかったため、その後へ戻す。
- `RAU-WC-01` は、部屋タイプ別 booking curve の表示待ちを減らすため、`RAU-CP-01` より先に進める。取得順は部屋タイプ優先ではなく、近い stay_date からホテル全体と全室タイプを揃える方針にする。
- 予測モデルと予測評価は将来候補として残すが、reference curve の core logic と GUI 接続が完了するまでは `Later` に置く。先に `RAU-AF-04` で evaluation-ready な input / output / diagnostics を作り、後続 task が同じ core contract を再利用できる状態にする。
