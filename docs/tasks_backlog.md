# tasks_backlog

## Now

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

## Next

### RAU-CP-01 競合価格推移 snapshot の価値と保存単位を設計する

- 目的:
  - Revenue Assistant 標準タブで見られる現在値ではなく、競合価格が直近で上がったか、下がったか、自館の価格変更や booking curve 変化と前後関係があるかを確認できるようにする。
  - 全件取得ではなく、Analyze 日付ページを開いた日付や、料金判断のために繰り返し確認された日付ほど snapshot 履歴が厚くなる設計にする。
  - 最初の調査では、絞り込みなし、または空条件に近い request で競合価格 data を取得できるかを確認する。
- スコープ:
  - `/api/v5/competitor_prices` または実際に使われている競合価格 endpoint を Chrome CDP の Network 監視または userscript 側の fetch hook で特定する。
  - 競合価格タブを開いたときと、Analyze 日付ページを開いたときに、どの endpoint が呼ばれるかを確認する。
  - request method、query、payload、headers のうち、検索条件に関係する項目を確認する。
  - Revenue Assistant に保存されている検索条件を使う request と、検索条件なし、空条件、または初期条件に近い request の差を確認する。
  - response に人数、食事条件、部屋タイプ、プラン名、競合施設識別子、価格、在庫状態、満室、販売停止、取得件数、ページング情報が含まれるかを確認する。
  - 保存後に RAU 側で人数帯や食事条件を絞り込めるだけの情報が response に含まれるかを判定する。
  - 絞り込みなし保存が可能な場合と不可能な場合で、IndexedDB snapshot key の候補を分けて整理する。
  - Analyze 画面へ表示する場合の最小表示は、初期案として `現在価格 / 前回価格 / 差分 / 前回取得時刻 / 条件 signature` の表を優先し、グラフは snapshot が蓄積してから後続候補にする。
- 非目標:
  - 初回調査の段階で IndexedDB store を実装すること。
  - 初回調査の段階で競合価格推移 UI を実装すること。
  - 全日付、全競合、全検索条件の網羅取得を前提にすること。
  - 競合価格の現在値表だけを販売設定タブへ複製すること。
  - 自動レート変更へ接続すること。
- 受け入れ条件:
  - 競合価格 endpoint、request method、主要 query/payload、response shape が整理されている。
  - 絞り込みなし、空条件、または初期条件に近い request で取得できるかが、実ブラウザ観測に基づいて判定されている。
  - response 内に、保存後の人数帯、食事条件、部屋タイプ、プラン単位の絞り込みに必要な項目が含まれるかが整理されている。
  - `広めに raw snapshot 保存して後から絞り込み` と `検索条件 signature ごとに別系列保存` のどちらを採用すべきか、判断材料が残っている。
  - 次実装 slice が、`snapshot store 設計`、`Analyze open 時の snapshot 取得`、`前回比 table 表示` のどこから始めるべきか整理されている。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`

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
  - `src/main.ts` の booking curve 取得経路を、memory、localStorage、IndexedDB raw source、API の順にした。
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

- `RAU-CP-01` 競合価格推移 snapshot の価値と保存単位を設計する

Next:

- `RAU-MP-01` 月次実績画面の LT 基準 custom booking curve を再開する

After Next:

- なし

Later:

- `RAU-FC-01` rooms-only 予測モデルの導入要否を判断する
- `RAU-FC-02` 予測評価 dataset と metrics を設計する

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
- `RAU-CP-01` の最初の作業は、実装ではなく調査とする。特に、絞り込みなし、空条件、または初期条件に近い request で競合価格 data を取得できるか、response に後から絞り込めるだけの条件情報が含まれるかを確認する。
- `RAU-WC-01` は、部屋タイプ別 booking curve の表示待ちを減らすため、`RAU-CP-01` より先に進める。取得順は部屋タイプ優先ではなく、近い stay_date からホテル全体と全室タイプを揃える方針にする。
- 予測モデルと予測評価は将来候補として残すが、reference curve の core logic と GUI 接続が完了するまでは `Later` に置く。先に `RAU-AF-04` で evaluation-ready な input / output / diagnostics を作り、後続 task が同じ core contract を再利用できる状態にする。
