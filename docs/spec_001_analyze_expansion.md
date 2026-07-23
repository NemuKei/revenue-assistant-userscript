# spec_001_analyze_expansion

## Purpose

analyze 日付ページで、団体室数の把握と販売設定の差分確認を 1 画面で行えるようにする。

この仕様は、現在の実装済み範囲と、残っている拡張候補の境界を定義する。

## Target Screen

- パス: `/analyze/YYYY-MM-DD`
- 前提: レベニューアシスタントは single-page application（ページ全体を再読み込みせずに画面を書き換える方式）として再描画される
- 要求: 初回表示だけでなく、画面内遷移、タブ切替、再描画、フォーカス復帰でも表示が壊れないこと

## Data Sources

### Calendar / Group Data

- `/api/v4/booking_curve?date=YYYYMMDD`
  - ホテル全体の booking curve を取得する
  - `booking_curve[].group.this_year_room_sum` からホテル全体の団体室数を取る
- `/api/v4/booking_curve?date=YYYYMMDD&rm_room_group_id=<id>`
  - 室タイプ別の booking curve を取得する
  - `booking_curve[].group.this_year_room_sum` から室タイプ別の団体室数を取る
- `/api/v4/booking_curve` の response は、ホテル全体と室タイプ別で同じ形として扱う
  - top-level には `booking_curve`、`stay_date`、`last_year_stay_date`、`max_room_count` がある
  - `booking_curve[]` の各 point には `date`、`last_year_date`、`all`、`transient`、`group` がある
  - `all`、`transient`、`group` には少なくとも `this_year_room_sum`、`last_year_room_sum`、`two_years_ago_room_sum`、`three_years_ago_room_sum`、`this_year_sales_sum`、`last_year_sales_sum`、`two_years_ago_sales_sum`、`three_years_ago_sales_sum`、`this_year_adr`、`last_year_adr` がある
  - 売上と ADR は Analyze 日付単位の取得元として使える。Chrome CDP で 2026-04-30 のホテル全体と室タイプ別 `rm_room_group_id` 指定の両方で、`this_year_sales_sum`、過去年売上、`this_year_adr`、`last_year_adr` が返ることを確認した
  - `batch-date` は `/api/v4/booking_curve` の response には含まれない。取得時点や cache 分離に必要な `batch-date` は、既存の同期文脈または cache key 側の値として扱う
- `/api/v1/booking_curve/rm_room_groups`
  - 室タイプ一覧と `rm_room_group_id` を取得する
- 当日点が `null` の stay_date があるため、表示時は `date <= stay_date` の最新非 null 値へフォールバックする

### Sales Setting Data

- `/api/v3/lincoln/suggest/status?filter_type=stay_date&from=YYYYMMDD&to=YYYYMMDD`
  - 対象 stay_date の反映済み販売設定履歴を取得する
  - 各要素には `rm_room_group_id`、`rm_room_group_name`、`accepted_at`、`before_price_rank_name`、`after_price_rank_name`、`reflector_name` が含まれる

### Facility Identity

- `/api/v2/yad/info`
  - 施設識別子を取得する
  - キャッシュキーを施設単位で分離するときに使う

## Delivered Behavior

### Monthly Calendar

- 各日付セルへ団体室数を表示する
- 団体室数表示の visible / hidden を切り替えるトグルを提供する
- React 再描画や月送り後でも、対象セルへ再同期する

### Sales Setting Tab

- 室タイプ別の販売室数に対して `1日前差分 / 7日前差分 / 30日前差分` を表示する
- 室タイプ別の `全体 / 個人 / 団体` に対して `室数 / 1日前差分 / 7日前差分 / 30日前差分` を表形式で表示する
- 最上段に `全体 販売室数: current / max` を表示し、その下へ `区分 / 室数 / 1日前 / 7日前 / 30日前` の表形式で全体・個人・団体のサマリーを表示する
- 全体サマリーの下に、室タイプカードと同じ順序で、室タイプ別の `部屋タイプ / 最終変更 / ランク / 増減` を表形式で俯瞰できる rank overview を表示する
- 各室タイプカードの `最終変更履歴` の下に、`ランク：A→B` を 1 行で表示する
- 各室タイプカードの booking curve には、同 stay_date の rank 変更履歴を小さな丸 marker として重ねて表示できるようにする
- 全体販売室数サマリーは、販売設定タブ上に描画済みの室タイプ別表示を合算して生成する
- 販売設定タブの販売室数差分は、Phase 1 では `/api/v4/booking_curve` の室タイプ別 `all.this_year_room_sum` を正として維持する

### Candidate: Room-Type Booking Curve

- 対象は analyze 日付ページの `販売設定` タブ内にある各室タイプカードとする
- 実装はフェーズ分割とし、初期実装では `室数` グラフだけを扱う
- 2026-04-18 時点で、Phase 1 の booking curve は `/api/v4/booking_curve` の LT 実系列へ接続済みであり、最上段の全体 block、各室タイプ card の開閉 UI、custom SVG、hover tooltip、capacity 基準 y 軸、rank marker overlay を含めて運用可能な状態とする

#### Phase 1

- 最上段の全体サマリー直下に、ホテル全体の booking curve を常時展開で表示する
- 全体 block の標準表示は `全体` と `個人` の 2 panel とし、`個人 / 団体` toggle で second panel を `団体` に切り替えられる構成を正とする
- 各室タイプカードへ、同じ室タイプの booking curve を 1 枚ずつ表示する
- 各室タイプカードの booking curve は、カードごとに独立して開閉できるようにする
- 各室タイプカードの開閉トリガーは、そのカード自身の block 内に置く
- booking curve の見出しは対象を含めて表示し、`ブッキングカーブ（全体）`、`ブッキングカーブ（シングル）` のように判別できる形を正とする
- 各室タイプカードの標準表示は `全体` と `個人` の 2 panel とし、`個人 / 団体` toggle で second panel を `団体` に切り替えられる構成を正とする
- `団体` 系列は常時3枚目の panel として表示せず、必要なときだけ `個人` panel の代わりに表示する
- rank 変更履歴 marker は、Phase 1 では各室タイプ card の booking curve にだけ重ねる。最上段の全体 block へは載せない
- baseline は初期実装では入れない
- 生データ保存は日次のまま維持し、圧縮するのは表示だけとする
- 初期表示は、全体 block は `開いた状態`、各室タイプ card は `閉じた状態` を既定とする
- 利用の流れは、最初にサマリーで調整対象を絞り込み、その後に必要な室タイプだけ booking curve を開いて確認してから調整する運用を前提とする
- `0日前` とは別に `ACT` を独立した tick として扱う。値が存在しない stay_date では `ACT` は空でよい
- LT 圧縮は bucket 集約とし、各 bucket の代表値は平均ではなく `bucket の最後の日` の値を使う
- 仕様上の LT tick は次を正とする
  - `ACT`
  - `0-14日`: 1日単位
  - `15-30日`: 2日単位の bucket 終端 `16, 18, 20, 22, 24, 26, 28, 30`
  - `31-60日`: 5日単位の bucket 終端 `35, 40, 45, 50, 55, 60`
  - `61-90日`: 10日単位の bucket 終端 `70, 80, 90`
  - `91-180日`: 15日単位の bucket 終端 `105, 120, 135, 150, 165, 180`
  - `181-360日`: 30日単位の bucket 終端 `210, 240, 270, 300, 330, 360`
- 実画面の横軸ラベルは、上記の LT tick 全体から一部だけを間引いて 1 行で表示する
- 2026-04-17 時点の優先表示ラベルは `ACT, 3, 7, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 360` を正とする
- 実画面での左右の向きは、既存のレベニューアシスタントの booking curve 表示に合わせる
- 当日を含む未着地 stay_date では、最新 ASOF 値を `ACT` まで延ばさず、観測 LT の位置で線を打ち切る
- y 軸メモリは小数点を使わず、固定本数の整数メモリになるよう上限値を丸める。実容量の満室ラインは別の補助線として描画する
- rank 変更履歴 marker は、各 panel の線の上に小さな丸で重ねる
- rank 変更履歴 marker の x 座標は、反映日時を宿泊日から引いた LT 日数を圧縮済み LT 軸へ補間して置く
- rank 変更履歴 marker の y 座標は、同日の `booking_curve` 値を panel ごとに解決して使う
- tooltip は point 詳細と rank 変更履歴を 1 つにまとめ、line hover 側でも同じ区間の rank marker 情報を拾えるようにする。point 側の `何日前 / 室数 / 稼働率 / 上限` に加えて、rank marker では `ランク A→B / 反映日 / 反映者` を追記する
- tooltip は point または marker の hover / focus 中だけ表示し、カーソルまたはフォーカスが外れたら非表示にする
- 同じ部屋タイプで同じ日に複数回 rank 変更がある場合、Phase 1 ではその日の最後の 1 件だけを marker として表示する
- `/api/v4/booking_curve` の raw source は `stayDate`、`asOfDate`、`fetchedAt`、scope、roomGroupId、endpoint、query、schema を key 情報として IndexedDB に保存する
- raw source は、response に含まれる rooms、sales、ADR を後続の reference curve、rank response、単価予測、売上予測で再利用できる保存契約にする。`RAU-RR-02` では、完全な response 全文ではなく、RAU が扱う rooms / sales / ADR fields を `compactBookingCurveResponse()` で保持する方針にした
- `booking_curve_raw_source:v2` は、`all`、`transient`、`group` の rooms fields、sales fields、確認済みの ADR fields と、将来 response に含まれる可能性がある過去年 ADR optional fields を保持する。既存 `booking_curve_raw_source:v1` record は同じ IndexedDB に残るが、v2 の cache key では読まれず、次回取得で v2 record が作られる
- 既存の short-lived cache は画面応答のために維持するが、`0日前` と `ACT` の分離や future reference curve の再計算に使う正本は raw source IndexedDB とする
- `/api/v4/booking_curve` response 全体を localStorage に永続保存する旧 persistent cache は、新規書き込みを行わない。理由は、同じ raw source を IndexedDB に保存済みであり、localStorage 側は画面応答用の短期 memory cache と役割が重複するうえ、施設単位で数十件保存すると localStorage の容量上限に達するためである
- 既存の localStorage booking curve key は、`revenue-assistant:group-room-count:v4:<facilityCacheKey>:booking-curve:` の facility prefix に限定して削除してよい。localStorage 全体、競合価格 IndexedDB、booking curve raw source IndexedDB、derived reference curve IndexedDB は削除対象にしない

#### Phase 1 Verification Notes

- 室タイプ別とホテル全体の `全体 / 個人` 系列は、選択中 analyze 日付を `stay_date` として扱い、current 値は `batch-date` 以前の最新非 null を使う
- 当日 stay_date では `ACT` を空表示にし、未来 stay_date では観測 LT より先を空表示にする
- GUI verify では `dist/*.user.js` の build 完了だけでなく、Tampermonkey 側の userscript 再読込も済ませた状態を正とする
- rank marker は card panel 上で小さな丸として視認でき、tooltip では `ランク A→B / 反映日 / 反映者` を確認できることを Phase 1 の受け入れ条件とする

#### Phase 2

- BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を、描画用の別系列として重ねる
- reference curve は、Phase 1 の `全体` panel と `個人 / 団体` toggle 対象 panel の実系列と同じ LT 軸に揃える
- 最上段のホテル全体 block と、各室タイプ card の両方を対象にする
- first wave では Revenue Assistant の booking curve 系データだけを使い、PMS データ、人数実績、外部 RMS の保存データを前提にしない
- BCL Python 実装を直接呼び出さず、BCL repo の算出ロジックを TypeScript の純粋関数として RAU 向けに再実装する
- reference curve の core logic、input、output、diagnostics、将来の予測モデル、将来の予測評価の契約は `docs/spec_002_curve_core.md` を正本とする
- baseline 用の履歴系列と室タイプ別 derived reference curve を複数保持するため、Phase 2 では derived reference curve の保存先を `IndexedDB` とする

#### Phase 2 Pending Decisions

- 2026-04-24 時点の主線では、baseline は `全体 block のみ` ではなく、室タイプ別のレート調整に使えることを主目的として扱う
- 最初の slice では、Phase 1 の `全体` panel、`個人 / 団体` toggle 対象 panel、rank marker overlay、tooltip close、`ACT` 空表示を崩さないことを優先する
- 既存の小さい日次 cache 全体を無条件に `IndexedDB` へ移すことは Phase 2 の必須条件にしない。ただし、BCL 由来の reference curve は比較対象 stay_date が増えるため、表示用に圧縮した derived reference curve を `IndexedDB` へ保存する
- Phase 2 の最初の受け入れ条件は、baseline 追加後も current-ui supplement portal、overall summary、rank overview、room-group table が維持され、不要 warning を増やさないこととする

### Candidate: Rooms-only Forecast Curves for Rate Adjustment

目的:

- 部屋タイプ別のレート調整時に、現在の booking curve が `直近型` の基準より速いのか遅いのか、また `季節型` の基準より速いのか遅いのかを同じ画面で判断できるようにする。
- 利用者が、室タイプごとの販売室数、ランク変更履歴、現在の booking curve、reference curve を 1 画面で比較できるようにし、レート調整前の判断コストを下げる。

first wave の対象:

- 指標は rooms のみとする。
- ホテル全体と室タイプ別 card を対象にする。
- `直近型カーブ` は、Revenue Assistant の booking curve 系データから、BCL の `recent90w` 相当の考え方で作る直近傾向の reference curve とする。
- `季節型カーブ` は、Revenue Assistant の booking curve 系データから、BCL の seasonal component 相当の考え方で作る前年・2 年前同月同曜日の reference curve とする。
- どちらも BCL の算出ロジックを参照するが、BCL の Python 実装、PMS データ、外部 DB、学習済みパラメータを RAU first wave の必須入力にしない。
- 算出ロジックの詳細は `docs/spec_002_curve_core.md` を正本とし、この仕様では Analyze 画面への接続、表示、取得タイミング、cache 連携だけを扱う。

first wave の非目標:

- 人数 forecast
- 宿泊売上 forecast
- Revenue Assistant 外の DB を必須にすること
- `revenue-assistant-rms` との同期を前提にすること
- 自動レート変更
- BCL の評価ロジックや学習済みパラメータを userscript へ直接移植すること

実装前に確認する論点:

1. request 数と表示密度を増やしても、画面内遷移、タブ切替、フォーカス復帰で安定して動くか。
2. reference curve を室タイプ card まで出した時点で、derived reference curve を IndexedDB に保存する範囲をどこまでにするか。
3. Revenue Assistant の `/api/v4/booking_curve` だけで、BCL seasonal component に必要な final rooms を安定して解決できるか。

2026-04-24 時点で確認済みのこと:

- `/api/v4/booking_curve` は、ホテル全体と室タイプ別の両方で、対象 `stay_date` 以外の比較対象日付を取得できる。
- `rm_room_group_id` を指定した場合も、ホテル全体と同じ top-level key、point key、rooms 系列 key が返る。
- 確認時点の 6 室タイプすべてで、同じ response shape が返った。
- 今日、1 日後、7 日後、30 日後、前年同日に相当する date 指定で 200 応答を確認した。

BCL-tuned first wave の定義:

- 2026-04-24 に実装した `直近 7 泊日中央値` と `last_year_room_sum` 優先の reference curve は、UI shell 用の仮ロジックとして扱う。今後の仕様ターゲットにはしない。
- reference curve 算出では、Revenue Assistant の `/api/v4/booking_curve` response 群を canonical input へ変換し、`docs/spec_002_curve_core.md` の core logic へ渡す。
- `直近型カーブ` は `docs/spec_002_curve_core.md` の `recent_weighted_90` を使う。
- `季節型カーブ` は `docs/spec_002_curve_core.md` の `seasonal_component` を使う。
- core logic の結果に含まれる `rooms=null`、`missingReason`、`warnings` は、Analyze 画面で空表示、取得不可状態、または tooltip/status 表示に使う。
- 描画する rooms 系列は、常時表示の `全体` panel と、`個人 / 団体` toggle で切り替える second panel で構成する。
- `個人 / 団体` toggle の既定は `個人` とする。`団体` 選択時は、current、`直近型カーブ`、`季節型カーブ`、rank marker tooltip の対象 segment を `group` に切り替える。`全体` panel は常時表示のまま維持する。
- `個人 / 団体` toggle 状態は、初期実装では画面内 memory に保持する。Revenue Assistant 側の再描画や本 userscript の再同期では維持するが、ページ再読み込みや別タブをまたぐ永続化は必須要件にしない。
- `RAU-AF-11` 以降、`個人 / 団体` toggle の切り替え直後は、保持済みの最新 `SalesSettingPreparedData` と rank status snapshot から Analyze 側の booking curve 表示を即時再描画し、その後に通常の calendar sync を強制実行する。これにより、切り替え直後から通常再同期完了までの間に、全体 panel または室タイプ別 panel が空表示のまま残らないようにする。
- reference curve の表示範囲は、current の booking curve と同じ LT 軸に揃える。標準の横軸は `0〜360日前` と `ACT` を対象にし、表示ラベルは既存の間引きルールを使う。
- request 数が問題になる場合でも、仕様上の目標表示範囲は `0〜360日前` と `ACT` のままとする。短期の性能対策で一時的に取得範囲を狭める場合は、取得中、未取得、算出不能を区別して表示する。
- 初期表示では `現在 / 直近型 / 季節型` を比較できる状態にする。ただし表示密度が上がるため、`直近型カーブ` と `季節型カーブ` は個別に表示切替できるようにする。
- 室タイプ別 reference curve の追加取得は、初期画面表示時に全室タイプ分を一括で先読みしない。各室タイプ card が開かれたときに、その card に必要な比較対象日付だけを取得する。
- 必要な履歴 stay_date が不足する場合、旧仮ロジックへ暗黙 fallback しない。該当 reference curve は空表示または取得不可状態として扱い、tooltip または status 表示で不足理由を確認できるようにする。
- `0日前` と `ACT` は、current と reference curve の両方で別 tick として扱う。`0日前` は宿泊日当日時点の観測値、`ACT` は宿泊日後に確定した最終実績を指す。
- Revenue Assistant API が過去 stay_date の `0日前` 値を実績確定後の値で上書きして返す場合、raw source 保存開始前の過去日程については本当の `0日前` と `ACT` を後から分離できない。この制約は仕様上の欠損として扱い、推測で補完しない。
- `直近型カーブ` と `季節型カーブ` の `ACT` がどの入力値から作られているかを diagnostics または調査ログで確認できるようにする。`0日前` と `ACT` が同じ値から作られているなら、`0日前` から `ACT` への線は平坦になるはずである。値が下がる、または不自然に跳ねる場合は、算出ロジック、入力 source の混在、segment 解決、API response の上書き仕様を調査対象にする。
- reference curve の `0日前` は、core logic と IndexedDB の derived reference curve cache では推測補完しない。真の `0日前` を分離できない場合は、算出値としては欠損または diagnostics 上の制約として扱う。
- 画面表示では、参考線の `0日前` が欠損している、または `0日前` と `ACT` が同値で `1日前` と `ACT` に差があるため API 側の実績上書き混入が疑われる場合に限り、表示層で `1日前` と `ACT` の線形補間値を描画してよい。初期実装では `0日前 = round(1日前 + (ACT - 1日前) * 0.5)` とし、表示補間値は整数室数に丸める。この補間値は current、直近同曜日補助線、core logic、derived reference curve cache、予測評価 dataset には使わない。
- 表示補間した `0日前` は、Tooltip または diagnostics 表示で補間値であることを明示する。利用者が実観測値、core 算出値、表示補間値を混同しないことを優先する。

同曜日補助線:

- `直近同曜日カーブ` は、`直近型カーブ` の平均線が実在した近い宿泊日の動きと大きくずれていないかを確認する補助線とする。
- 初期候補は target stay_date の前後2週、つまり `-14日`、`-7日`、`+7日`、`+14日` の同曜日 stay_date とする。
- 既定表示は OFF とし、利用者が必要なときだけ toggle で表示する。
- `直近同曜日カーブ` は主判断線ではないため、現在線や reference curve より目立たない薄いグレーの細い破線を既定とする。
- `直近型カーブ` と `季節型カーブ` は、同曜日補助線より優先度の高い reference curve として扱い、同曜日補助線より少し太く、必要に応じて透過を使う。
- 凡例上は同曜日補助線をまとめて `同曜日` として扱い、hover 時に対象 stay_date と `-14日`、`-7日`、`+7日`、`+14日` の区別を確認できるようにする。
- `直近同曜日カーブ` は既定 OFF とし、OFF の間は追加の `/api/v4/booking_curve` 取得を行わない。toggle ON のときだけ、ホテル全体 block と開いている室タイプ card に必要な同曜日 stay_date を取得する。
- `直近同曜日カーブ` の取得は raw source IndexedDB と既存 request cache を経由し、不足分だけ API から補う。ON にした直後の表示では、取得済みの線から順に描画し、取得できない stay_date は空表示として扱う。

## キャッシュと同期のルール

### キャッシュ範囲

- group 系キャッシュは `最終データ更新` 日付が変わるまで再利用してよい
- ただしキャッシュキーは施設単位でも分離し、異なる施設間で再利用しない
- 室タイプ別 booking curve キャッシュは `rm_room_group_id` を含め、ホテル全体キャッシュと分離する
- BCL-tuned reference curve の derived cache は `IndexedDB` に保存する。保存対象は、表示に必要な LT tick、rooms 値、算出種別、対象 scope、入力日付範囲、算出ロジック version、`as_of_date`、施設識別子、`rm_room_group_id` を含む圧縮済み payload とする
- derived cache の key は、少なくとも `facility_id`、`scope`、`target_stay_date` または `target_month + weekday`、`as_of_date`、`rm_room_group_id`、`curve_kind`、`algorithm_version` を含める
- first wave の derived cache は、TTL による自動失効ではなく、`as_of_date` と `algorithm_version` を key に含めて分離する。表示側は現在の key だけを読む。古い key の削除は、保存量または再計算頻度が問題になった時点で別 task として判断する
- `/api/v4/booking_curve` の raw source も `IndexedDB` 保存対象にする。raw source は response 改善、`0日前` と `ACT` の分離、将来の予測評価 dataset の入力証跡を兼ねる。
- raw source の key は、少なくとも施設識別子、`stay_date`、`as_of_date`、`fetched_at`、scope、`rm_room_group_id`、endpoint、query、schema version を含める。`booking_curve_raw_source:v2` 以降では、schema version が保存契約の一部であり、v1 rooms-only compact record と v2 rooms / sales / ADR compact record は別 key として扱う。
- raw source の read path は API 取得より先に参照する。IndexedDB に有効な raw source があれば API request を省略し、不足している stay_date と scope だけ API から取得する。
- raw source 保存開始前の過去 stay_date は、実績確定後に API 側で上書き済みの可能性があるため、本当の `0日前` と `ACT` を分離できる対象に含めない。
- 同じ derived cache key の計算が進行中の場合、重複 request を発行せず、進行中の計算結果を共有する
- 室タイプ別 reference curve は card が開かれた時点で取得・計算する。初期表示で全室タイプ分の履歴を一括取得しない
- 室タイプ別 booking curve は、まず current の実系列を表示し、reference curve は IndexedDB raw source と derived cache を優先して非同期で補う。これにより、室タイプ card を開く操作が reference curve 用の複数 API request の完了待ちで止まらないようにする。
- request 並列数は小さく制限する。初期値は 2 から 3 を候補とし、GUI 確認で体感遅延または API エラーが出る場合は下げる

### Warm Cache Queue

目的:

- トップカレンダーまたは Analyze 日付ページを開いたときに、近い宿泊日のホテル全体と室タイプ別 booking curve を IndexedDB raw source に少しずつ保存し、次回以降の current、reference curve、同曜日補助線の表示待ちを減らす。
- Revenue Assistant API への負荷を抑えるため、取得対象、取得順、同時取得数、1 回の稼働時間、クールダウン、停止条件を明示的に制限する。
- 取得状況を画面上に表示し、利用者が「取得中」「一時停止中」「上限到達」「エラーあり」を区別できるようにする。

取得対象:

- Analyze 日付ページを開いていない場合の初期対象は、現在の `as_of_date - 1日` から `as_of_date + 3か月` までの stay_date とする。`as_of_date - 1日` を含める理由は、直近で実績確定した ACT を raw source として保存し、`0日前` と `ACT` の分離や reference curve 評価に使える証跡を増やすためである。
- 各 stay_date について、ホテル全体と全室タイプの `/api/v4/booking_curve` raw source を対象にする。
- Analyze 日付ページを開いていない場合の取得順は、stay_date が近い順とする。同じ stay_date 内では、ホテル全体を先に取得し、その後に全室タイプを取得する。
- Analyze 日付ページを開いている場合は、利用者が見ている stay_date を最優先し、次にその stay_date を含む週、その次にその stay_date を含む月、その次に通常 warm cache 範囲を取得する。
- トップカレンダー由来の warm cache がクールダウン中または 1 回の稼働時間上限到達中でも、Analyze 日付ページを開いた場合は、Analyze 日付ページの priority queue を作り直して取得を開始する。Analyze 日付ページで利用者が見ている stay_date は、バックグラウンド取得より優先する。
- 優先 queue で同じ `facilityId + stayDate + asOfDate + scope + roomGroupId + endpoint + query + schema` が重複する場合は 1 件にまとめる。
- 施設識別子、stay_date、as_of_date、scope、rm_room_group_id が揃わないものは queue に入れない。

完了定義:

- warm cache の stay_date 単位の完了は、current 用 raw source だけではなく、reference curve と同曜日補助線の表示に必要な保存状態まで含めて判定する。
- `current raw source` は、対象 stay_date のホテル全体と全室タイプの `/api/v4/booking_curve` raw source を指す。
- `reference source raw source` は、対象 stay_date の `直近型カーブ` と `季節型カーブ` を算出するために必要な候補 stay_date の `/api/v4/booking_curve` raw source を指す。対象 scope はホテル全体と全室タイプとする。
- `derived reference curve` は、対象 stay_date、scope、rm_room_group_id、curve_kind、algorithm_version、as_of_date が一致する `直近型カーブ` と `季節型カーブ` の計算済み IndexedDB record を指す。
- `同曜日 raw source` は、対象 stay_date の `-14日`、`-7日`、`+7日`、`+14日` のホテル全体と全室タイプの `/api/v4/booking_curve` raw source を指す。
- 同曜日補助線は derived cache を必須にしない。同曜日 raw source が IndexedDB に揃っていれば、表示時に raw source を LT 軸へ整形して描画する。
- reference source raw source が不足している場合は、不足分だけ API から取得する。derived reference curve が不足している場合は、既存の reference curve core logic と derived cache store を使って計算し、IndexedDB に保存する。
- raw source、derived reference curve、同曜日 raw source のいずれかが不足している stay_date は、indicator 上では未完了または部分完了として扱う。

差分更新:

- warm cache における差分更新とは、前回 response との差分だけを保存することではなく、現在の `as_of_date` で未保存の raw source key だけを取得することを指す。
- 同じ `facilityId + stayDate + asOfDate + scope + roomGroupId + endpoint + query + schema` の raw source が IndexedDB に存在する場合、warm cache では API request を発行しない。
- `as_of_date` が変わった場合は、同じ stay_date と roomGroupId でも新しい観測 snapshot として別 key で保存する。
- 同じ key の response を通常経路で取得済みの場合も warm cache では skip する。
- 同じ key を上書き更新するのは、手動 refresh、schema version 変更、保存破損検知など明示的な理由がある場合だけとする。

エラーと再試行:

- warm cache task が失敗した場合、同じ task を即時連続再試行せず、retry 回数を増やした task として queue 末尾へ戻す。
- 同じ task の自動 retry は最大 2 回までとする。
- retry 予定が残っている失敗は、その stay_date を最終エラー扱いにしない。最大 retry 回数を超えた場合に、その stay_date をエラーありとして扱う。
- 連続エラー 3 回で warm cache 全体を一時停止する安全弁は維持する。
- 画面内 status では、通常のエラー数とは別に、retry 待ち task 数を確認できるようにする。

負荷制限:

- RAU が `loadBookingCurve()` から発行する `/api/v4/booking_curve` request は、current raw source、same-weekday source、reference source raw source のいずれでも、既定 high-throughput profile として request 開始間隔 35ms 以上、同時実行数 30 件以下にする。Revenue Assistant 本体が標準画面表示のために発行する request は RAU の制御対象ではない。
- `reference source raw source` を取得するために reference curve request scheduler へ投入した `/api/v4/booking_curve` request も、同じ request scheduler を通す。これにより、warm cache worker が最大 30 件並行で進んでいても、`/api/v4/booking_curve` request の開始間隔 35ms 以上と同時実行 30 件以下を維持する。
- request scheduler は optional priority として `interactive` / `background` を持ってよい。未指定は `background` とし、同一 priority 内 FIFO、同一 requestKey の pending dedupe、開始間隔、同時実行数、active request 非中断を維持する。queued の同一 requestKey が後から `interactive` として要求された場合は、active request を中断せず queued priority だけを上げてよい。
- Analyze `販売設定` タブで画面に出す current booking curve は、ホテル全体と室タイプ別 card のどちらも `interactive` priority として要求する。これは表示中の current line と summary が warm cache や reference source の background queue 待ちで欠けることを避けるためであり、reference curve、same-weekday、warm cache の取得対象、query、保存 schema、Revenue Assistant write API は変更しない。
- Analyze `販売設定` タブへ戻ったときは、React 側の tab mount が遅れる場合に備えて有限回の強制再同期を行ってよい。再同期は既存 `queueCalendarSync` の範囲に閉じ、無限 polling、認証回避、rate limit 回避、追加 write API は行わない。
- 配布版 `analyze-recommendations` smoke は、Analyze `販売設定` タブの主要表示として、overall summary、booking curve section、booking curve SVG、booking curve toggle をそれぞれ 1 件以上確認できない場合に fail とする。これは `RAU-AN-01` の描画欠けを再検出するための合格条件であり、runtime UI、API query、保存 schema、Revenue Assistant write API は変更しない。
- warm cache queue は最大 30 worker で処理してよい。worker は task queue の処理単位であり、実際の `/api/v4/booking_curve` request 開始間隔と同時実行数は `loadBookingCurve()` 側の request scheduler が制御する。
- IndexedDB または derived cache の既存 record により skip できる task は、API request を発行しないため、次 task へ即時に進めてよい。
- warm cache queue build 時の pre-scan は、`currentRaw` task または `sameWeekdayRaw` task と保存済み raw source の exact currentAsOf key が一致する場合だけ、その task を queue から除外してよい。exact key は facility、stay_date、as_of_date、scope、rm_room_group_id、endpoint、query、schema version を含む。`pastAsOf` と `none` は除外せず、hotel scope の保存済み record で roomGroup task を除外せず、別 roomGroup の保存済み record で candidate roomGroup task を除外しない。除外数は fetch performance marker と warm cache status summary で確認できる。
- 1 回の自動 warm cache 稼働時間は最大 10 分とする。
- 1 回の自動 warm cache 稼働時間に達した場合は、3 分以上のクールダウン時間を置いた後に自動再開する。
- 日次合計稼働時間の上限は設けない。負荷制御は、有限 queue、request 間隔、1 回の稼働時間、クールダウン、document hidden 中の既定一時停止、連続エラー停止で行う。
- document が hidden の間は自動取得を一時停止する。ただし、利用者が `候補データ優先取得` strip の `非表示中も取得` を ON にした場合だけ、レベアシタブを開いたまま別タブを見ている間も booking curve warm cache と月別優先取得を継続してよい。この opt-in は browser-local `localStorage` に保存し、既定値は OFF とする。非表示中も、既定 high-throughput profile の request 開始間隔 35ms 以上、同時実行 30 件以下、1 回 10 分上限、3 分 cooldown、連続 error 停止、HTTP 401 ログイン確認、HTTP 403 権限確認、HTTP 429 取得停止を維持する。
- `非表示中も取得` は自動再ログインを行わない。ログアウト、HTTP 401、認証切れらしい状態では取得を停止し、利用者に再ログインを促す表示に留める。userscript は ID、password、Cookie、token、credential を保存または自動入力しない。
- 先行月向けの待ち時間改善は、queue 順序、cache 再利用、high-throughput profile の組み合わせで扱う。月別優先取得で選んだ月、対象月 filter で選んだ月、表示中候補と一致する `currentRaw x roomGroup` task は、既存 queue 内で先に処理する候補にできる。取得済み raw source は cache hit として再取得しない。Revenue Assistant write API、rank 変更 POST、自動反映、一括反映にはこの boost を適用しない。
- HTTP 401 はログイン状態の確認が必要な状態として扱い、自動 retry を続けず一時停止する。
- HTTP 403 は権限または対象施設の確認が必要な状態として扱い、自動 retry を続けず一時停止する。
- HTTP 429 は request 頻度に対する制限として扱い、自動 retry や cooldown 継続ではなく、その取得 queue を即停止する。
- HTTP 5xx と network error は一時的な失敗候補として扱い、同じ task を最大 2 回まで queue 末尾へ戻す。ただし連続発生した場合は high-throughput profile を締める対象として停止し、画面内 status と fetch performance marker に停止理由を残す。
- 連続エラーが発生した場合は一時停止し、画面内 status でエラー件数と停止状態を表示する。`data-ra-fetch-performance-summary` には endpoint 別 high-throughput profile、HTTP error count、auto-tightened reason の sanitized 値だけを残す。
- 利用者が Analyze 画面で操作している間も、既存表示やクリック操作を妨げないように、取得は低優先度の queue として扱う。

画面内 status:

- 右下固定 indicator は表示しない。warm cache と競合価格 snapshot の状態は、利用者が次に確認する画面内の領域へ表示する。
- トップ画面では、`候補データ優先取得` strip、料金調整候補 list の直後、料金調整候補 list summary の近くのいずれかに表示する。固定表示で Revenue Assistant 標準 UI、料金調整候補 list、footer、固定 action を覆わない。
- Analyze 日付ページでは、Analyze 上部候補一覧、全体 summary、販売設定 UI root の近くに表示し、表示中 stay_date の booking curve / 競合価格状態として読める位置に置く。
- 最小表示は `待機中`、`取得中 完了日数 / 対象日数`、`一時停止中`、`クールダウン中`、`エラー n` を区別する。対象日数だけでは期間が分かりにくいため、最小表示にも `4/29〜5/29` のような対象日付範囲を含める。
- 詳細表示では、対象月または対象範囲、取得順、完了済み stay_date 範囲、現在取得中の stay_date と scope、保存数、skip 数、エラー数、最終取得時刻を確認できるようにする。
- 料金調整候補の表示中候補と一致する `currentRaw x roomGroup` task を優先処理している場合は、詳細表示に `候補優先` として総数、処理済み件数、保存件数、skip 件数、最終エラー件数、現在取得中の候補を表示する。この表示は既存 warm cache queue の並び替え結果を説明するためのものであり、取得対象期間、request 件数、request 間隔、同時取得数、停止条件は変更しない。
- 対象範囲は月名だけではなく、`対象 2026-04-29〜2026-05-29` のように開始日と終了日を明示する。
- 完了済み stay_date 範囲は、current raw source、reference source raw source、derived reference curve、同曜日 raw source がすべて揃った日付を、連続範囲として表示する。
- トップカレンダーの各日付セルには、warm cache の stay_date 単位の状態をセル下端の細い色ラインとして表示する。現在 warm cache queue の対象になっている日付は、`raw source`、`reference curve`、`同曜日` の合計 `done / total` に応じた progress bar として表示する。部分的に取得済みの日付は青、完了した日付は緑の全幅、取得エラーがある日付は赤の全幅とする。日付セル内の販売室数、団体室数、差分表示とは重ねない。
- warm cache queue が現在走っていない日付に、保存済み raw source の存在を表示する場合は、現在取得中の progress bar と同じ見た目にしない。IndexedDB に同じ施設と stay_date の `/api/v4/booking_curve` raw source が 1 件以上ある日付を、セル下端中央の短い静的ラインとして表示する。現在取得中の progress bar、完了、エラー表示がある場合は、それらを優先し、保存済みシグナルは上書きしない。
- 保存済みシグナルは、現在の `as_of_date` の raw source が 1 件以上ある日付と、過去 `as_of_date` の raw source だけがある日付を分ける。現在 `as_of_date` の raw source がある日付は緑の短い線、過去 `as_of_date` の raw source だけがある日付は灰色の短い線とする。この区別は raw source の存在を示すものであり、reference source raw source、derived reference curve、同曜日 raw source まで含めた完了を示すものではない。
- 完了日数は、完了定義を満たした stay_date の数を指す。取得が始まっているが完了していない stay_date は `進行 n日` として別に表示し、完了 0 日のままでも取得が進んでいることを確認できるようにする。
- トップカレンダーでは、表示中の月ごとに月別優先取得ボタンを `候補データ優先取得` strip として表示する。料金調整候補 list の host が解決できる場合は、初回表示から strip をカレンダー直後かつ料金調整候補 list 直前へ置く。料金調整候補 list の host が解決できない場合だけ、入口が消えないようにカレンダー上部へ fallback 表示する。ボタンは `YYYY-MM 優先取得` の短い文言、円形 progress、短い状態表示を持つ。状態は `未優先`、`待機中`、`取得中 n%`、`完了`、`クールダウン中`、`エラー n` を区別する。
- 月別優先取得ボタンを押した場合、その `YYYYMM` の全 stay_date を通常の直近日付 queue より前に置く。指定月の候補判断に必要な raw booking_curve を先に厚く取得するため、同じ月の current raw / same-weekday raw task は reference curve task より前に処理し、事前 scan で cache hit を queue から除外する。Analyze 日付ページを開いている場合の `priorityStayDate` は引き続き最優先であり、月別優先取得はトップカレンダー上の明示操作として扱う。
- 月別優先取得ボタンは、表示月ごとの優先取得入口と progress summary に加えて、全体 queue の短い状態も同じ strip 内に表示してよい。右下固定 indicator は使わない。
- 月別優先取得ボタンの入力は、表示中カレンダーの月であり、料金調整候補の行や候補件数から対象月を推定しない。配置は、利用者が優先取得後に確認する料金調整候補 list の直前を第一候補とする。これにより、取得入口、`対象月` filter、候補根拠の確認を同じ作業領域で続けて読めるようにする。候補 list host が描画前でも解決できる状態では、初回から候補 list の直前に strip を置く。候補 list host が解決できない状態だけカレンダー上部へ fallback し、入口が消えないようにする。カレンダー側と候補 list 側の二重配置は採用しない。理由は、同じ月の同じ取得処理に対する入口が 2 箇所に分かれると、どちらが現在の対象月 filter と連動するのかを誤読しやすいためである。
- `候補データ優先取得` strip には、`非表示中も取得` の opt-in toggle を表示してよい。ON の場合は strip の状態表示に `非表示中も取得ON` を含め、利用者が現在の取得条件を誤読しないようにする。
- 月別優先取得ボタンを押した場合、料金調整候補 list の `対象月` filter は押した月へ切り替える。カレンダー表示月は、押したボタンが表示中カレンダー上の月を表すため、追加で変更しない。`対象月` filter を切り替える理由は、取得完了後に利用者が同じ月の候補をすぐ確認できるようにするためである。filter 切替時は既存の filter 変更と同じく、表示上限を初期値 10 件へ戻し、開いている booking curve preview、競合価格 preview、rank change preview を閉じる。rank change pending がある場合は、未確定操作を隠さないため filter 切替を遅延するか、pending 行が見える状態を維持する。どちらを採る場合でも、pending 中の Revenue Assistant write API 送信条件、取消条件、5 秒 timer は変更しない。
- 料金調整候補 list の `対象月` filter を手動で変更した場合も、同じ月の booking curve warm cache priority を要求してよい。この要求は既存の月別優先取得 queue と同じ安全条件を使い、request 間隔、同時実行数、取得対象期間、保存 schema、Revenue Assistant write API endpoint、rank change payload は変更しない。filter 変更は表示条件を変える操作であり、queue 優先化は未保存 raw source の待ち時間を減らす補助として扱う。
- 月別優先取得の完了後は、料金調整候補 list 上部の summary に、対象月の再評価結果を短く表示してよい。比較する値は、取得開始直前と取得後再同期後の `対象月` filter 適用済み active candidate 件数、表示中候補件数、raw source 状態別件数、状態 badge の `取得中`、`確認不足`、`根拠あり` 件数である。表示文言は、`対象月 2026-08: 候補 +3件、確認不足 -5件` のような短い非数値中心の summary とし、金額、差額、percent、forecast 数値、sales / ADR 数値は出さない。比較結果は画面内 memory の一時 summary に留め、IndexedDB、localStorage、docs、Git 管理へ保存しない。保存する場合でも、最小識別情報は `facilityCacheKey`、対象 `YYYYMM`、比較時刻、件数差分、raw source 状態差分に限定し、request body、response body、raw trace、Cookie、token、credential、価格や在庫の非公開データは保存しない。
- 配布版 top smoke では、月別優先取得の high-throughput profile 確認として、RAU 発行 `/api/v4/booking_curve` の request count、HTTP status count、HTTP error count、最大 1 秒 burst request 開始件数、最小 request 開始間隔、最大同時 request 数、worker 表示、監視対象 write API POST 0 件を raw body なしで確認する。指定月の明示検証では `--top-click-warm-cache-month YYYYMM` で月別優先取得 button をクリックし、クリック可否、対象月 status、status text と、その後の RAU warm cache request metrics を同じ実行で確認する。Revenue Assistant 標準画面由来の同 endpoint request と RAU warm cache 由来 request は分けて表示し、RAU warm cache の判定は `X-RAU-Request: booking-curve` header 付き request に限定する。未取得 task が十分にある場合は、HTTP error 0 件、最大 1 秒 burst request 開始件数 10 req/s 以上、最小 request 開始間隔 25ms 以上、最大同時 request 数 30 件以下、最大同時 request 数 10 件以上到達を自動判定する。cache 済みで request count が少ない場合は、低 throughput を失敗扱いにせず、fallback 理由を出力する。
- Analyze 日付ページでは、利用者が開いている stay_date の取得状況を percentage と件数で表示する。例: `この日 71%（5/7）`。
- Analyze 日付ページの percentage は、少なくとも `raw source`、`reference curve`、`同曜日` の内訳を区別できる形にする。初期表示では `この日 raw 100% / 参考線 60% / 同曜日 100%` のように、どの段階が不足しているか分かる表示を優先する。
- Analyze 日付ページの indicator では、booking_curve warm cache とは別に、競合価格 snapshot の保存状態も表示する。表示する状態は、未取得、保存中、保存済み、前回 snapshot あり、競合施設未設定による skip、保存失敗を区別する。
- 競合価格 snapshot の詳細表示では、対象 stay_date、検索条件 signature、最終保存時刻、前回 snapshot の取得時刻、保存時点の競合施設数を確認できるようにする。
- `クールダウン中` の詳細表示では、自動再開までのおおよその残り時間を表示する。
- Indicator は取得を開始したこと、停止したこと、上限に達したことを利用者が把握するための表示であり、初期実装では取得対象の細かい編集 UI は持たせない。

画面別の読み込み状態契約:

- Top の `料金調整候補` は、現在の月次カレンダー表示範囲に対する `/api/v1/suggest/output/current_settings`、rank ladder、rank status、browser-local decision、保存済み `booking_curve_raw_source:v2` を使う。`基準日` は候補の `asOfDate` であり、`宿泊まで` の日数と current settings の観測日を示す。保存済み raw source は、候補別に `最新基準日あり`、`過去基準日あり`、`未保存`、`取得中`、`取得失敗` の非数値状態として表示できる。`最新基準日あり` は候補と同じ `asOfDate` の raw source がある状態を指す。`過去基準日あり` は同じ stay_date と roomGroup の raw source はあるが、候補と同じ `asOfDate` ではない状態を指す。`取得中` は warm cache の現在 task または queue に、同じ stay_date と roomGroup の `currentRaw` task が残っている状態を指す。
- Analyze 日付ページは、利用者が開いている stay_date を warm cache の最優先対象にする。表示上の基準日は `as_of_date` であり、indicator は `この日 raw`、`参考線`、`同曜日` の内訳を出す。保存済み raw source、derived reference curve、同曜日 raw source のいずれが不足しているかを分けて表示する。
- 競合価格タブは、競合価格 snapshot の保存状態を booking curve warm cache とは別の状態として表示する。対象 stay_date、検索条件 signature、最終保存時刻、前回 snapshot の有無、競合施設数、skip 理由、保存失敗を区別する。競合価格 snapshot を booking curve warm cache の完了定義へ混ぜない。
- 価格推移タブは、公式 `/api/v1/price_trends` から保存した `price-trend-records` を使う。初回表示では、表示中 stay_date の `roomType = 指定なし`、`mealType = NONE / BREAKFAST / DINNER / BREAKFAST_DINNER`、`guestCount = 1 / 2 / 3 / 4` の 16 request を優先する。これは既定の `部屋タイプ=指定なし`、`食事=指定なし`、人数別 4 panel を先に描画するための最小単位である。visible 16 scope は request 総数、query 契約、保存 schema を変えず、最大 20 件の bounded parallel fetch で進めてよい。部屋タイプ別 request を含む残りの `mealType x roomType x guestCount` は background queue で取得し、background queue は 100ms interval、最大 10 scope 相当で処理し、route / facility / document hidden / section absence の停止条件を維持する。保存済み record は `fetchedAt` を取得時刻として表示できるようにし、89 日より先または `yads` 空配列は対象外理由として扱う。
- 価格推移タブを開いたとき、同じ facility と stay_date の保存済み `price-trend-records` がある場合は、visible 16 scope の network fetch より先に保存済み graph を表示してよい。ただし `PriceTrendRecord` には batchDateKey がなく freshness policy が未確定であるため、保存済み record があることだけを理由に visible 16 scope の `/api/v1/price_trends` fetch を skip しない。保存済み graph を先に出す間は `保存済み表示・再取得中` と分かる meta を表示し、visible fetch 完了後は取得した record で更新する。
- 月次実績画面は、現在表示月の snapshot を初回表示の優先対象にし、比較月または future month の prefetch は background 扱いにする。`RAU-MP-03` では、現在表示月の snapshot だけを初回描画の同期対象にし、future month と比較月は background queue で順次取得する。画面上には、現在表示月の保存状態、表示中の月数、background の処理済み件数、対象件数、失敗件数、現在取得中の yearMonth を表示する。これにより、比較月や future month の取得が遅い場合でも、現在表示月の graph を先に確認できる。

### Sync Timing

- 初回起動時に同期する
- analyze 日付ページへの画面内遷移時に再同期する
- `visibilitychange` と `focus` の復帰時に整合チェックを行う
- 整合チェックで group 系表示とキャッシュの不整合を検知した場合は、group 系キャッシュを破棄して再同期する
- reference curve は、必要な target と scope に対して userscript が取得キューへ明示的に投入したときだけ計算する。Analyze 日付優先 warm cache は、この明示的な取得キュー投入の一種として扱う

## Non-Functional Requirements

- single-page application の再描画に追従できること
- 同一日付、同一施設、同一 `最終データ更新` 日付では無駄な再取得を増やさないこと
- カレンダーと販売設定タブの既存レイアウトを壊さないこと

## Remaining Candidate Scope

### Analyze 上部の料金調整候補 read-only 表示

Analyze 日付ページ `/analyze/YYYY-MM-DD` では、開いている宿泊日と一致する料金調整候補を上部に read-only section として表示する。入力は top 料金調整候補 list と同じ current settings、rank ladder、curve evidence、user decision filter、resolved rank change filter、rank change history を使う。候補抽出条件は `candidate.stayDate` が Analyze 日付と一致することを最小条件にする。表示単位は `stayDate x roomGroup` である。

表示列は、部屋タイプ、現ランク、推奨、根拠、状態、前回変更に限定する。候補が 0 件の場合は、既存 Analyze UI を押しのけずに空状態を表示する。top list から `Analyzeで確認` で遷移した場合は、sessionStorage に保存した `stayDate`、`roomGroupId`、`roomGroupName`、reason summary が Analyze 日付と一致する場合だけ、該当候補 row と既存 roomGroup card を highlight する。URL 直打ち、別日付、別施設、別 roomGroup では highlight しない。

この section は read-only であり、`推奨反映`、`rank調整`、任意 rank select、一括反映、未選択行送信、自動反映、`price_ranks` 系 endpoint への POST は表示または実行しない。推奨レート金額、forecast 数値、sales / ADR 数値、競合価格の金額、差額、percent も表示しない。Revenue Assistant API request 範囲、request 件数、request 間隔、top list の candidate scoring は変更しない。

配布版 smoke では `--mode analyze-recommendations` を使い、Analyze page candidate、RAU Analyze candidate list root、候補 row count、empty count、highlight count、console / page error 件数、監視対象 write API POST 件数、userscript version を確認する。Analyze section 内に write 系 button が存在する場合、監視対象 write API POST が 0 件でない場合、mode と最終 URL が一致しない場合は pass としない。

Analyze 上部から `推奨反映` または一括反映を実装する前には、write 安全条件を別途再調査する。単一行 `POST /api/v1/lincoln/suggest` は top list の観測済み custom rank path として使えるが、Analyze 上部でも送信直前 current rank 再取得、rank status 再取得、同一 `stayDate x roomGroup` pending block、5 秒 pending、取消、反映確認を維持する必要がある。`POST /api/v1/lincoln/price_ranks`、`POST /api/v1/tema/price_ranks`、`POST /api/v1/neppan/price_ranks` を使う場合は、payload field、provider 差、CSRF、権限差、partial failure、error response、反映確認先が確認されるまで実装しない。

### Candidate 1: Performance Tuning

- 月送り時と販売設定タブ再描画時の体感速度を改善する
- 比較対象は request 並列数、先読み取得の単位、キャッシュ再利用単位とする

### Candidate 2: Competitor Price Table

- `/api/v5/competitor_prices` の現在値を販売設定タブへ埋め込むだけでは、Revenue Assistant 標準の競合価格タブと役割が重複するため、優先しない
- RAU で競合価格を扱う場合は、取得時点つきの競合価格 snapshot を IndexedDB に保存し、直近で競合価格が上がったか、下がったか、自館の価格変更や booking curve 変化と前後関係があるかを追跡できる形を候補にする
- 競合価格 snapshot は、全日付、全競合、全条件を網羅取得するものではなく、Analyze 日付ページを開いた日付や、料金判断のために繰り返し確認された日付ほど観測履歴が厚くなる設計を第一候補にする。
- 取得トリガーは、競合価格タブを開いたときだけに限定しない。Analyze 日付ページを開いた時点で、その stay_date は料金判断の対象になっている可能性が高いため、競合価格 snapshot の候補に含める。
- Analyze 日付ページを開いた stay_date は、競合価格タブを開いたかどうかに関係なく、`指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 snapshot を保存する。理由は、現在見ている宿泊日の競合価格 data は、操作履歴によって部屋タイプ別 snapshot の有無が変わると比較しにくいためである。
- Analyze 画面内で競合価格タブを開いた場合は、その stay_date の競合価格確認意図がより明確になったものとして、競合価格 snapshot の取得優先度を上げる。
- 競合価格タブを開いた時点で、single-page application の画面遷移直後などにより Analyze 日付、施設 cache key、batch date key がまだ確定していない場合でも、その競合価格タブ起点の取得要求を即時破棄してはならない。短時間の再試行で必要な context がそろった時点で、現在開いている stay_date の `competitor-tab` source として snapshot 保存と保存済み系列の読み直しを開始する。
- 競合価格タブを開いたときは、現在開いている stay_date の 6 snapshot を先に保存する。その保存後、同じ Analyze 日付ページを表示している間だけ、同週、同月の順に background queue で競合価格 snapshot を保存する。queue の各 stay_date も `指定なし`、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS` の 6 snapshot を保存する。
- 競合価格 snapshot の background queue は、booking_curve warm cache queue へ混ぜない。競合価格 tab 起点の保存後に別の queue として進め、document hidden、別 Analyze 日付への遷移、batch date や facility cache key の変更を検知した場合は停止する。
- Indicator は競合価格 snapshot の background queue について、対象範囲、完了日数、対象日数、現在取得中の stay_date を表示する。利用者が同週、同月の取得が進んでいるか、止まっているかを判別できることを優先する。
- 競合価格 tab 起点で直近 30 日へ取得範囲を広げる案は後続候補とする。実装する場合は、同週、同月 queue との重複、request 数の上限、booking_curve warm cache との体感上の優先順位を再設計する。
- 競合価格 snapshot の取得は、booking_curve warm cache queue と同じ完了定義には含めない。indicator では同じ場所に表示しても、状態、skip、error、最終保存時刻は競合価格 snapshot 専用の値として扱う。
- 検索条件が違う競合価格 snapshot を同じ推移系列として扱わない。保存時には、検索条件 raw、検索条件 signature、取得元、取得時刻を必ず保持する。
- 競合価格の RAU 追加表示は、販売設定タブには出さず、Revenue Assistant 標準の競合価格タブ内に閉じる。
- 競合価格の RAU 追加表示は、Revenue Assistant 標準の競合価格表より下に置く。標準表の現在値確認を優先し、RAU 側は取得時点つき snapshot の推移確認を担当する。
- 競合価格の RAU 追加表示は、競合価格タブ本文が実際に表示されている場合だけ描画する。競合価格タブの button や tab root だけを根拠に fallback 描画してはならない。販売設定タブや他タブの下部へ割り込まないことを優先する。
- 初期表示は表ではなく、取得日単位の最安値折れ線グラフを既定にする。グラフは `1名`、`2名`、`3名`、`4名` の人数別 panel とし、部屋タイプ別 panel にはしない。
- 各人数 panel では、自社と保存時点の競合施設を線として表示する。競合施設を後から入れ替えても、過去 snapshot の施設名と `yad_no` を現在の競合施設一覧で上書きしない。
- グラフの横軸は取得日、縦軸は価格とする。同じ取得日に複数 snapshot がある場合は、その取得日の最新 snapshot だけを代表として使う。取得時刻は保存データとして保持するが、初期表示の比較単位は日単位にする。
- グラフに使う価格は、対象人数、施設、取得日、現在の簡易絞り込み条件に一致する plan の最安値とする。これは Revenue Assistant 標準表で見る最安値の考え方と揃える。
- 部屋タイプと食事条件は、グラフ軸ではなく簡易絞り込みとして扱う。初期状態は指定なしとし、保存済み snapshot に含まれる `jalanFacilityRoomType` と `mealType` から選択肢を作る。選択 UI は pull-down ではなく toggle button とする。
- 部屋タイプの表示名は、API response の raw value をそのまま出すのではなく、利用者が読みやすい `シングル`、`ダブル`、`ツイン`、`トリプル`、`和洋室` などの日本語表記へ寄せる。raw value は保存データとして保持し、filter 判定には raw value を使う。
- Next の人数別グラフは、desktop では `1名`、`2名`、`3名`、`4名` の 2 x 2 比較、680px 以下では選択中 1 人数だけを表示する。狭幅では `1名` から `4名` の 44px 以上の toggle で切り替え、標準表由来の横 overflow を Next root が広げない。
- グラフの Tooltip は取得日軸ごとに表示し、その取得日の施設別最安値と採用部屋タイプを mouse / keyboard の両方で確認できるようにする。最新値と同じ施設の前回取得日との差分は hover に依存させずグラフ下へ常時表示し、前回取得日がない場合は `前回なし` とする。
- warm cache indicator と競合価格表示が干渉する場合に備え、indicator は詳細を折りたためる最小化機能を持つ。最小化しても状態の要約は残し、再表示できるようにする。
- 検索条件 signature が違う競合価格 snapshot を同じ推移系列として扱わない。初期表示では同じ stay_date の保存済み snapshot を読み、最新の同一 signature 群だけを採用する。画面には opaque な signature 文字列ではなく、同一条件の採用件数と条件違いとして除外した件数を表示する。
- 初回調査では、Revenue Assistant に保存されている検索条件を無視して、絞り込みなし、または空条件に近い request で競合価格 data を取得できるかを確認する。
- 絞り込みなし取得が可能かどうかは、次の観点で判定する。
  - API endpoint と request method。
  - request query または payload に含まれる検索条件。
  - 検索条件なし、空条件、または初期条件で request できるか。
  - response に含まれる件数、ページング、上限件数。
  - response に人数、食事条件、部屋タイプ、プラン名、在庫状態、販売停止、満室、価格が含まれるか。
  - response 内の情報だけで、保存後に人数帯や食事条件で絞り込み直せるか。
  - Revenue Assistant 画面に保存されている検索条件が request にどう反映されるか。
- 絞り込みなし response が十分な条件情報を含む場合は、広めの raw snapshot を保存し、RAU 側で後から絞り込む方式を候補にする。response が画面条件に強く依存する場合は、検索条件 signature ごとに別系列として保存する。
- 初期表示は、snapshot が少ない段階でも人数別の最安値グラフを優先する。snapshot が 1 日分だけの場合は線ではなく点として表示し、蓄積後に自然に推移グラフとして読める形にする。
- 配布版 `competitor-prices` smoke は、Analyzeの標準競合価格tabと税込表示context、Classicが追加する`競合価格 最安値推移` overview、部屋 / 食事filter group、人数別4 panel、SVG、keyboard focus可能な日付hitboxを確認する。保存済みsnapshotがなくoverviewを描けない場合はpassとせず、missing evidenceとして扱う。console / page errorまたは監視対象write API POSTが1件以上なら他modeと同じくfailとする。

Next clean-room read-only contract (`RAU-UX-150` 第一段階):

- Next の追加表示は `/analyze/YYYY-MM-DD` の標準競合価格本文が実際に可視である場合だけ、標準表と同じ section の末尾へ 1 root を追加する。他 tab、別 route、後発 Classic、重複 root を検知した場合は root / style を除去または fail closed とし、標準表を隠す、移動する、置換する処理は持たない。
- facility identity は既存の `GET /api/v2/yad/info` を 1 回だけ使って確認し、表示中の施設 label と一致する場合だけ保存済み履歴を描画する。競合履歴は既存 IndexedDB の `facility-stay-date` index を完全一致 key `[facilityId, stayDate]`、`readonly` transaction、固定上限 512 record で読む。database upgrade、cursor scan、response 保存、新規 endpoint、background prefetch、storage write、Revenue Assistant write API は追加しない。
- 外部 record は schema version、facility、stay date、payload shape を検証してから使う。room type scope を選んだ後、最新の同一 condition signature 群だけを採用し、同じ JST 取得日に複数 record がある場合は最終取得 1 件を代表にする。過去 snapshot の競合施設名は現在の一覧で上書きしない。
- 4 panel は同じ取得日集合と共通価格目盛を使う。各 panel は施設別最安値、最新値、前回差分、採用部屋タイプを示し、全日別値は初期折りたたみ表でも確認できる。snapshot が 1 日だけなら点として表示し、0 件、IndexedDB 不在、read error は標準表を残したまま区別して表示する。保存時刻は表示するが、現在時刻との鮮度判定は行わず `最新性は未判定` と明示する。
- この第一段階は既存保存履歴の表示だけを再接続する。Classic を無効化した後も新しい観測を蓄積する writer は含まれない。Next cutover 前に、保存対象、保存期間、削除方針、request 負荷、権限を Yellow zone 判断として固定し、利用者の明示承認後に別実装する。

Next bounded snapshot writer contract (`RAU-UX-150` 第二段階):

- 2026-07-23 の利用者明示承認に基づき、Next は `/analyze/YYYY-MM-DD` の標準競合価格本文が実際に可視で、`GET /api/v2/yad/info` の facility label が表示中 context と一致する場合だけ、表示中 stay date の競合価格 snapshot 保存を開始してよい。販売設定 tab、価格推移 tab、別 route、document hidden、facility mismatch では開始せず、開始後に対象 context が外れた場合は未完了 request を abort する。
- 保存 scope は部屋タイプ指定なし、食事指定なし、1〜6名の 1 snapshot に限定する。`facilityId x stayDate x JST取得日` が同じ有効 record が Classic または Next の履歴に 1 件以上あれば、その日は保存済みとして `/api/v2/competitors` と `/api/v5/competitor_prices` を発行しない。保存失敗は成功扱いにせず、次に標準競合価格本文を明示表示したときだけ再試行してよい。
- 未保存日の取得は、同一 session、自施設、自分の権限内で既存の `GET /api/v2/competitors` と `GET /api/v5/competitor_prices` を各最大1回使う。週、月、前後日、他 stay date の background queue / prefetch はこの段階に含めない。Revenue Assistant の POST / PUT / PATCH / DELETE、自動再ログイン、認証回避、rate limit 回避は行わない。
- Next は Classic の `revenue-assistant-competitor-price-snapshots` database を変更しない。Next 専用 database `revenue-assistant-next-competitor-price-snapshots`、store `competitor-price-snapshots` を version 1 で所有し、deterministic primary key により同一日保存を重複させない。複数 tab の同時取得は browser の exclusive lock を利用できる場合は同じ日次 key で直列化し、storage 側の `add` constraint を最終重複 guard とする。
- 保存 payload は graph の再構築に必要な facility / stay date / condition signature / query / fetchedAt / competitor set と、施設、人数、食事、部屋タイプ、価格に限定する。plan name、URL、price diff は保存せず `null` とし、raw response、request / response body dump、HAR、Cookie、token、credential、API key、予約・顧客情報は保存しない。
- Next 専用 store は同一 `facilityId x stayDate` ごとに直近120観測を保持し、保存成功時に超過した古い Next record だけを削除する。Classic database と Classic record は削除、移動、上書きしない。利用者が明示した削除 UI や database 全削除はこの段階に含めない。
- 表示 read path は Classic database と Next 専用 database をそれぞれ固定上限付き `readonly` で読み、schema / facility / stay date を検証した record を snapshot key で重複排除して統合する。一方が missing / unavailable / error でも他方の有効 record があれば表示を継続し、保存状態は `確認中`、`本日分を保存`、`本日分は保存済み`、`競合設定なし`、`保存失敗` を標準表を妨げない短い badge で区別する。

Next booking curve clean-room contract (`RAU-UX-150` 第三段階A):

- Next の booking curve 補助表示は `/analyze/YYYY-MM-DD` の標準 booking curve 本文が実際に可視である場合だけ、標準の2 chartを含む native content の直後へ sibling root を1つ追加する。標準chart、room-group list、filter、tabを隠す、移動する、置換する処理は持たず、他tab、別route、document hidden、後発Classic、重複rootを検知した場合は未完了処理とroot / styleを除去してfail closedとする。
- facility identity は既存の `GET /api/v2/yad/info`、room-group mapping は既存の `GET /api/v1/suggest/output/current_settings` を、表示中stay dateに対して各最大1回だけ使う。画面の最終データ更新日を読めない、facility labelが一致しない、stay dateまたはroom-group idが一致しない場合は推測や名称fallbackで補わない。
- current / reference の入力は既存 `revenue-assistant-booking-curve-sources` database、`booking-curve-raw-sources` storeの `booking_curve_raw_source:v2` recordに限定する。選択中scopeの current stay date、直近型候補日、季節型候補日のdeterministic primary keyだけを1回の `readonly` transactionで読み、database upgrade、cursor scan、`GET /api/v4/booking_curve`、隣接日や他room-groupのbackground prefetch、derived cache write、storage writeを追加しない。
- 初期scopeはホテル全体とし、room-groupは確認済みidを持つtoggleで利用者が選んだ場合だけ遅延読込する。同一stay date内で読み終えたscopeはmemory cacheしてよいが、route / stay date離脱後へ持ち越さない。room-group名だけからidを推測せず、全room-groupのreferenceを先読みしない。
- 選択中scopeは `全体` と `個人` の2 panelを標準表示し、second panelだけを `個人 / 団体` toggleで切り替える。個人は`transient`、団体は`group`の直接値だけを使い、`all - group`で欠損を推測しない。current、`直近型`、`季節型` は同じ `360日前 ... 0日前 / ACT` 軸と共通の室数目盛を使い、reference系列は個別toggleで表示を切り替える。`0` は有効値、`null` は欠損として線を分断し、未着地stay dateの `ACT` は空のまま扱う。referenceの0日前を表示上補間した場合はtooltipで補間値と明示し、core inputやcacheへ書き戻さない。
- SVG pointはmouseとkeyboard focusの双方で `何日前 / current / 直近型 / 季節型` を確認できる。凡例、最終データ更新日、reference source日数、欠損理由はhoverに依存させず表示し、current cacheなし、reference source不足、as-of不一致、IndexedDB unavailable / errorを同じ空表示へ潰さない。680px以下では2 panelを縦積みにし、toggleは44px以上、Next root自身の横overflowは0とする。
- この第三段階Aだけではrank-change markerのlive取得を行わず、rank historyの有無はreference cacheのready / empty判定へ混ぜない。

Next booking curve rank-change contract (`RAU-UX-150` 第三段階B):

- 2026-07-23の利用者明示承認と`D-20260723-006`に基づき、可視な標準booking curve、facility label guard、`current_settings`で確認済みのroom-group scopeが揃った場合だけ、表示中stay dateに対して `GET /api/v3/lincoln/suggest/status?filter_type=stay_date&from=YYYYMMDD&to=YYYYMMDD` を最大1回使う。ホテル全体scopeではroom固有rankを集約せずrequestを開始しない。同じstay dateの表示contextではroom切替とtab再表示で結果または失敗をmemory再利用し、自動retryしない。route、stay date、tab、document visibilityの離脱時は未完了取得をabortする。
- rank取得はreference raw-cache reader、competitor writer、rank writeから分離した専用adapterが所有する。response rootの`suggest_statuses`と各eventをruntime validationし、stay date完全一致、非空`rm_room_group_id`、parse可能な`accepted_at -> completed_at -> suggest_calc_datetime`の優先timestamp、stringまたはnullの変更前後rankを満たすeventだけを採用する。選択scopeとは`rm_room_group_id`で完全一致させ、room名fallbackを使わない。同一room-group・JST反映日では最新1件、stay dateまで0〜360日のeventだけを残す。
- response、正規化event、request / response body、HAR、Cookie、token、credentialをstorageへ保存しない。`reflector_name`はmarker判断に不要で個人名になり得るためNextのmodelと表示へ取り込まない。月・隣接日・他stay dateの取得、background prefetch、Revenue AssistantのPOST / PUT / PATCH / DELETE、自動反映、一括反映を追加しない。
- room-group scopeのcurrent booking curveに反映日以前の直接取得値があるeventだけを、LT bucket間を線形配置したrank markerとして全体panelと選択中の個人 / 団体panelへ描く。個人値は`transient`だけを使い、`all - group`で補わない。値がないeventはchart上へ推測配置せず、テキスト履歴には残す。markerは色だけに依存しない形と補助線を持ち、mouse、keyboard focus、tapでLT、反映日、変更前後rankを確認できる。全有効eventはhover不要のdetails / tableでも確認でき、empty / invalid response / request errorをcurrent / reference不足と区別する。

公式 `価格推移` タブへの RAU 追加表示:

- `RAU-CP-11` の 2026-05-29 read-only 調査では、Analyze 画面に `data-testid="tab-priceTrends"` の公式 `価格推移` タブがあり、本文には `data-testid="price-trends-content"`、`price-trends-filter-item`、`price-trends-filter-button`、`price-trends-chart-header`、`price-trends-chart-header-yad-list-item`、`price-trends-content-updated-at` が存在することを確認した。chart は Recharts の wrapper と `svg` として描画されている。調査中に保存したのは DOM 挿入位置、test id、通信 endpoint の発生有無、response shape の field 名や型の範囲に限定し、HAR、raw trace、request body、response body、Cookie、token、credential、非公開価格データは repo に保存しない。
- 2026-05-29 の追加 read-only 調査で、公式 `価格推移` タブは `GET /api/v1/price_trends` を使うことを確認した。query は `stay_date`、`num_guests`、`meal_type`、`yad_nos[]` を持つ。response root は `latest_source_updated_at`、`stay_date`、`yads` を持つ。各 `yads[]` は `yad_no` と `price_trends[]` を持ち、各 `price_trends[]` は `date`、`lead_time_days`、`jalan_min_price`、`jalan_min_price_status` を持つ。89日より先の確認では HTTP 200 だが `yads` は空配列であり、RAU は対象外として表示する。
- 2026-05-29 の追加確認では、公式 `価格推移` タブの frontend bundle が `roomTypeOptions` を `GET /api/v1/price_trends` に渡していることを確認した。`decamelizeKeys` 後の有効 query は配列形式の `room_type_options[]` であり、`room_type_options[]=SINGLE`、`DOUBLE`、`TWIN`、`FOUR_BEDS` などの単独指定では response hash が指定なしと変わった。scalar 形式の `room_type_options=SINGLE` は指定なしと同じ response hash だったため、RAU は部屋タイプ別価格推移を `room_type_options[]` の単独指定 request として取得する。
- 公式 `価格推移` API の `meal_type` は単一値指定であり、指定なしで複数食事タイプをまとめて返す response ではない。RAU は `NONE`、`BREAKFAST`、`DINNER`、`BREAKFAST_DINNER` を個別 request として取得し、食事タイプ別に保存する。`食事` filter の `指定なし` は保存済み食事タイプ全体の最安値として集約し、食事タイプを選択した場合は該当 `mealType` scope の record だけを使う。
- 利用者方針では、公式 `価格推移` は 89 日以内の宿泊日に対して一定の lead time 内で取得できる別データ源である。ただし、89 日より先の宿泊日では取得できず、データ粒度が細かすぎてそのまま意思決定に向くとは限らない。RAU は既存の `競合価格` タブの IndexedDB snapshot グラフを置き換えず、公式 `価格推移` は直近日程の補助情報源として扱う。
- `RAU-CP-12` の更新後は、公式 `価格推移` タブの RAU 追加 graph は既存 `competitor-price-snapshots` を使わない。`価格推移` タブでは、公式 `/api/v1/price_trends` から人数 1 から 4 を個別に取得し、人数別 4 panel の lead time 別 graph を表示する。表示 series は `自社` と競合施設別 series とし、集計 series `競合最低価格` は表示しない。見出しは `競合価格 最安値推移（90日版）` とし、`公式価格推移` という表現は公式サイト自体の価格と誤読されやすいため使わない。
- 公式価格推移 data は既存 `competitor-price-snapshots` store へ混ぜず、IndexedDB database `revenue-assistant-price-trends`、store `price-trend-records` に保存する。record は `facilityId`、`stayDate`、`numGuests`、`mealType`、`roomType`、`roomTypeLabel`、`fetchedAt`、`endpoint`、`query`、`facilities`、`scope`、`payload` を持つ。`mealType` は `NONE`、`BREAKFAST`、`DINNER`、`BREAKFAST_DINNER` のいずれかとする。`roomType` と `roomTypeLabel` は、指定なし request では `null`、部屋タイプ別 request では `SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS`、`WASHITSU`、`WAYOUSHITSU` のいずれかと表示 label を入れる。`payload.yads[].points[]` は `date`、`leadTimeDays`、`priceIncludingTax`、`status` を持つ。
- `価格推移` タブ側にも、既存 `競合価格` タブの graph と同じ形の `部屋タイプ`、`食事` 絞り込み UI を表示する。部屋タイプの表示候補は、保存済み公式価格推移 record の `roomType` / `roomTypeLabel` scope から作る。食事の表示候補は、保存済み公式価格推移 record の `mealType` scope から作る。`部屋タイプ=指定なし` 選択時は、部屋タイプ別 request record が保存されている場合は部屋タイプ別 request record 全体を `facility x leadTime` ごとの最安値へ集約し、tooltip には採用された request scope の部屋タイプを表示する。部屋タイプ別 request record がない場合だけ指定なし request の record を使う。部屋タイプ選択時は対応する `room_type_options[]` 単独指定 request の record を使う。`食事=指定なし` 選択時は保存済み食事タイプ全体を `facility x leadTime` ごとの最安値へ集約し、食事タイプ選択時は該当 meal type scope だけを使う。
- `競合価格` タブと `価格推移` タブの RAU graph tooltip は、列名を `施設`、`部屋タイプ`、`価格`、`前回差分`、`自社との差` に揃える。`施設` cell には色 swatch と施設名を表示し、`部屋タイプ` cell にはその行の最安値として採用した plan または request scope の部屋タイプを表示する。同じ取得日または同じ lead time の自社価格が取れない場合、`自社との差` は `-` と表示する。
- `価格推移` タブを開いた場合、RAU は公式価格推移取得だけを開始し、既存 `competitor-tab` source の競合価格 snapshot 保存要求を開始しない。既存 `競合価格` タブでは、従来どおり `competitor-price-tax-included-text` 周辺に保存済み snapshot graph を表示し、IndexedDB snapshot 保存挙動も維持する。
- `RAU-CP-14` 以降、価格推移タブの取得は初回表示用 request と background queue を分ける。初回表示用 request は `room_type_options[]` を指定しない record だけを対象にし、食事タイプ 4 種と人数 4 種の 16 record を先に保存する。初回表示用 request が保存できたら、残りの部屋タイプ別 request を 100ms 間隔、最大 10 scope 相当の background queue で保存する。background queue の対象は、`SINGLE`、`DOUBLE`、`TWIN`、`TRIPLE`、`FOUR_BEDS`、`WASHITSU`、`WAYOUSHITSU` と、食事タイプ 4 種、人数 4 種の組み合わせである。取得対象の総組み合わせは増やさない。
- 価格推移タブの background queue は、booking curve warm cache queue と競合価格 snapshot queue へ混ぜない。`document.hidden`、別 Analyze 日付への遷移、施設 cache key の変更、価格推移タブ本文が表示されなくなった場合は停止する。`document.hidden` で停止した場合は、同じ価格推移タブへ戻ったときに残り queue を再開できる。
- 価格推移タブの meta 表示では、background queue の `処理済み / 対象数`、保存数、skip 数、失敗数、現在取得中条件、完了または停止理由を表示する。取得中条件は、人数、食事、部屋タイプを表示する。
- background queue の進捗だけが変わる場合は、既存 graph、legend、filter、tooltip を再構築せず、meta/status 表示だけを軽量更新してよい。records、filter、selected room type、selected meal type、empty/error state が変わる場合は従来どおり graph と tooltip を更新する。
- 価格推移タブを開いたときは、保存済み `price-trend-records` の読み込みと `loadPriceTrendRequestContext()` を並行開始してよい。保存済み record がある場合の先行 graph 表示、visible 16 scope の常時 revalidate、request 総数、query 契約、保存 schema、background 112 scope、Revenue Assistant write API は変更しない。visible fetch は最大 20 件、background queue は 100ms / 最大 10 scope 相当で進める。requestContext 取得失敗時は現行 error handling と同等以上に安全側へ倒し、保存済み表示を最新扱いにしない。
- 価格推移タブの loading、empty、failure、停止、retry 待ちでは、状態説明だけではなく次操作を表示する。HTTP 401 は Revenue Assistant への再ログイン、HTTP 403 は閲覧権限確認、HTTP 429 は時間を置くまたはクールダウン、HTTP 5xx は時間を置いた再表示、network error は通信状態確認と再表示、89 日より先または公式側データなしは 89 日以内の宿泊日確認、IndexedDB 保存不可はブラウザ保存領域確認として区別する。次操作表示は復帰方法を示すための UI であり、価格推移 adapter、request 範囲、request 件数、保存 schema、tooltip、filter、graph 計算、Revenue Assistant write API は変更しない。
- `部屋タイプ=指定なし` の graph は、部屋タイプ別 record がすべてそろうまでは初回表示用の指定なし record を使う。部屋タイプ別 record が一部だけ保存された途中状態で、指定なし graph を部分的な部屋タイプ別集約へ切り替えない。これにより、background queue 中に現在表示条件の graph が不要に揺れることを避ける。
- 表示品質確認用に、browser-local の `localStorage["revenue-assistant:price-trends:v1:background-fixture"]` で background queue 表示の合成 fixture を有効化できる。値は `failure` または `skip` とし、raw response body、Cookie、token、credential、非公開データを使わず、失敗件数、停止理由、skip 表示、次操作表示だけを確認する。
- データ取得速度の確認用に、RAU は `data-ra-fetch-performance-summary` の JSON marker を DOM へ出してよい。marker は price_trends の high-throughput profile、表示要求時刻、保存済み record 初回描画時刻、visible / background fetch の開始・完了時刻、visible / background scope count、cache read count、network fetch count、error count、HTTP error count、auto-tightened reason、competitor_prices の high-throughput profile、表示要求時刻、保存済み snapshot 初回描画時刻、visible / background fetch の開始・完了時刻、visible scope count、cache read count、network fetch count、error count、HTTP error count、auto-tightened reason と、booking_curve warm cache の high-throughput profile、queue build / completed 時刻、表示候補 currentRaw の fetched / skipped / errored count、preScanHitCount、Analyze reference の interactive queued / request started / request finished / first line painted / all lines painted / wait ms / max concurrent / min start interval、HTTP error count、auto-tightened reason だけを持つ。`localStorage["revenue-assistant:debug:fetch-performance"] === "1"` の場合だけ同じ sanitized summary を console に出してよい。response body、価格詳細、施設実データ、予約・在庫・顧客情報、Cookie、token、credential は marker、console、storage、docs に保存しない。この marker は計測補助であり、価格推移 API query、`PriceTrendRecord` 保存 schema、competitor price snapshot 保存 schema、booking_curve raw source 保存 schema、API query contract、cache freshness、network skip、Revenue Assistant write API は変更しない。

Candidate Performance Contracts:

- この節は `RAU-PERF-14` から `RAU-PERF-19` と `RAU-UX-134` のための performance contract である。既存の Revenue Assistant write API、rank change payload は変更しない。performance 実装を進める場合も、保存 schema、API query contract、request 総数を変える変更は別 task として扱う。
- `RAU-PERF-14` では、`RAU-PERF-09` の live observation 未完了 / blocked 履歴を引き継ぎ、price_trends、booking_curve、competitor 関連の baseline 再取得項目を定義した。live observation が取れる場合は CDP 9222 または通常 Chrome / Tampermonkey 実行版で `data-ra-fetch-performance-summary` を読む。取れない場合は fixture + manual observation の fallback 手順を使い、duration、request count、error count、timestamp、marker 有無だけを比較対象にする。competitor 関連は、競合価格 tab / top row preview の visible fetch started / completed、visible scope count、cache read count、network fetch count、error count、保存済み snapshot 初回描画時刻を baseline に含める。
- `RAU-PERF-15` では、competitor visible / user-facing fetch だけを最大 2 件の bounded parallel fetch にした。`RAU-PERF-19` では、この既定を最大 20 件へ緩め、background queue も 100ms / 最大 10 stay_date 相当で処理する。request 総数、競合価格 snapshot の検索条件 signature、保存 schema、API query contract は変えない。429 / 403 / 401 は即停止し、5xx / timeout / network error は締める対象として停止理由を marker に残す。
- `RAU-PERF-16` では、保存済み competitor price snapshot がある場合に network 完了前の cache-first 表示を行う。保存済み表示時は meta に `保存済み表示・再取得中` を出し、freshness 未確定のまま network fetch を skip しない。最新取得完了後は通常表示へ更新し、stale cache を最新値として誤認させない。
- `RAU-PERF-17` では、Analyze で表示中のホテル全体 reference curve と、開いている室タイプ card の初回 reference curve を `interactive` とし、warm cache の reference curve task、same-weekday、未表示客室 / 未表示月の補完取得は `background` とした。`RAU-PERF-19` では raw-source request scheduler を 100ms / concurrency 30 相当へ緩める。request 総数、API query contract、active request 非中断は維持する。reference curve は current line の描画を止めず、`recentOverall` と対象 segment の recent を先に反映し、seasonal / individual / group / same-weekday は後続で足してよい。
- interactive reference は、derived reference curve の pending compute dedupe によって background compute の完了待ちへ固定されないようにしてよい。ただし raw source request の同一 requestKey pending dedupe は維持し、同一 API request を重複発行しない。
- `RAU-PERF-18` では、endpoint-aware cooldown / backoff を採用候補にした。`RAU-PERF-19` では 401 / 403 / 429 を即停止、5xx / timeout / network error を連続発生時の縮退または停止対象として実装する。UI には軽い status を出すが、エラー詳細や response body は保存しない。
- `RAU-UX-134` では、request が速くなっても render や DOM 更新で体感が詰まっていないかを確認する。competitor preview / graph / table の再構築回数、background 進捗だけで graph 全体を再構築していないか、large DOM `replaceChildren()` が user-facing 操作で jank になっていないかを audit し、証拠がある場合だけ実装 task に分解する。
- `RAU-UX-136` では、料金調整候補から開く competitor preview の初期 roomType filter を `null` / 未指定にした。Analyze 側の競合価格 detail UI は既存どおり初期 filter 未指定を維持する。候補 roomType は note として残し、初期 preview は競合全体の価格帯を見落とさないため全体表示にする。request 件数、保存 schema、query contract、Revenue Assistant write API、rank change payload、candidate scoring / priority / confidence は変更しない。
- すべての planned performance improvements で、response body、価格詳細、予約情報、顧客情報、施設実データ、Cookie、token、credential は marker / log / storage / docs に保存しない。

月次実績画面 final graph 契約:

- 月次実績画面の対象 route は `/monthly-progress/YYYY-MM` である。画面ごとの起動境界は `monthlyProgress` module に閉じ、top / analyze の observer、booking curve warm cache、競合価格 snapshot queue、価格推移 queue とは混ぜない。
- 入力データは `/api/v1/booking_curve/monthly` の response を、`facilityCacheKey x yearMonth x batchDateKey` 単位で保存した `monthly-progress` IndexedDB snapshot である。raw response body 全文、Cookie、token、credential、非公開データは docs や Git 管理へ保存しない。
- final graph は既存 Revenue Assistant の予約日基準 chart を置き換えず、その直下に RAU の独立 section として表示する。1 つ目の panel は `販売客室数`、2 つ目の panel は `販売単価` または `売上` の切替表示とする。
- 横軸は日別 booking curve と同じ LT bucket を使う。表示 tick は `360 / 270 / 180 / 120 / 90 / 60 / 45 / 30 / 21 / 14 / 7 / 3 / ACT` を基本にする。`ACT` は対象月末日を anchor とした最終実績であり、現在表示月がまだ月末に到達していない場合は this year の `ACT` を未観測として扱う。
- 表示対象月は、route の現在表示月から未来 4 か月までを同じ graph section に出す。各月は色を分けて表示し、tooltip では月、LT、対象日、値、前年同日または前年同 bucket との比率を確認できるようにする。
- 比較対象は `前年`、`前年 / 前々年`、`前年 / 前々年 / 3年前` の段階切替とする。比較対象月の snapshot が未保存または取得失敗の場合は、その比較線だけを欠損として扱い、現在表示月の線を消さない。
- 読み込み優先順位は、まず route の現在表示月、次に同じ graph section に出す未来 4 か月、最後に選択中 compare mode で必要な前年、前々年、3年前の比較月とする。現在表示月が描画可能な場合は、比較月または future month の取得完了を待たずに section を表示する。
- 読み込み状態は、現在表示月を `取得中`、`保存済み`、`保存済みだが比較不足`、`取得失敗`、`対象外` に分ける。background 対象は、対象月、比較月、処理済み件数、対象件数、失敗件数、現在取得中の yearMonth を表示できる形にする。`RAU-MP-03` の初期実装では、現在表示月が保存済みで比較値が不足している場合に `保存済み・比較不足あり` と表示し、background queue は `background 取得中 processed / total・現在 YYYY-MM・失敗 n` または `background 完了 processed / total・失敗 n` と表示する。
- 表示品質確認用に、browser-local の `localStorage["revenue-assistant:monthly-progress:v1:fixture-mode"]` で合成 fixture を有効化できる。値は `empty`、`current-only`、`compare-shortage`、`partial-failure` とし、raw response body、Cookie、token、credential、非公開データを使わない。fixture mode 中は月次 snapshot の background prefetch を開始せず、合成 view model だけで空状態、現在月のみ保存済み、比較不足、一部取得失敗の表示を確認する。
- 月次実績画面の次段階候補は、`過去 batch 履歴比較`、`日次差分表示`、`表示密度調整` の 3 つに分けて扱う。最初に実装する候補は `日次差分表示` とする。理由は、既存の `monthly-progress` snapshot と LT bucket view model だけで入力が閉じ、過去 batch 間比較のような保存世代管理を増やさずに、利用者が月内の増減日を読めるようにできるためである。
- `日次差分表示` の入力は、`facilityCacheKey x yearMonth x batchDateKey` の保存済み monthly snapshot と、既存の month-end anchor に変換した LT bucket 系列である。処理は、同じ表示月の連続する予約日または LT bucket の差分を計算し、増加、減少、変化なし、未観測を UI 表示用の view model へ変換する。出力は、既存 `LTブッキングカーブ` section 内の補助表示として、対象月、LT bucket、対象日、差分方向、差分量の表示有無、未観測理由を持つ。初期実装では `販売客室数` の現年系列だけを対象にし、隣り合う観測済み LT bucket の差分を `日次差分` table に表示する。raw monthly API response body、Cookie、token、credential、非公開データは保存または docs 化しない。
- `日次差分` table は、表示密度を抑えるため、route の現在表示月だけを行として表示する。未来月と比較月の差分は、既存 graph と tooltip で確認する対象に留め、日次差分 table へ同時に並べない。table 上部には、現在表示月の `増加`、`減少`、`変化なし`、`未観測` の件数 summary を表示する。初期表示では、利用者が最初に確認すべき `増加` と `減少` の行だけを table に出し、`変化なし` と `未観測` は件数 summary と展開領域で確認できるようにする。これにより、対象月から未来 4 か月までの全 LT bucket を一度に表示して行数が増えすぎる状態と、変化のない行が増減行より先に目に入る状態を避ける。表示密度調整は UI 表示だけの変更であり、monthly snapshot schema、API request 範囲、background prefetch、過去 batch 履歴比較、料金調整候補 scoring には接続しない。
- `過去 batch 履歴比較` は、同じ `yearMonth` の複数 `batchDateKey` snapshot を比較するため、保存世代の選択、古い snapshot の保持方針、比較基準 batch の表示が必要である。これは `日次差分表示` より保存単位と UI 説明が増えるため、月次画面の次段階 1 件目にはしない。
- `表示密度調整` は、系列数、tooltip 情報量、panel 配置、既存 Revenue Assistant chart との距離を調整する UI task とする。入力データの追加は伴わないため、日次差分表示または過去 batch 比較で情報量が増えた後に必要性を再判断する。
- 既存 snapshot schema migration、料金調整候補 scoring への接続、月次実績の rank recommendation 入力化は別 task とする。

2026-04-30 の Chrome CDP 観測結果:

- Analyze 日付ページを開くと、Revenue Assistant 画面本体は `GET /api/v5/competitor_prices` を呼び出す。
- request には `x-requested-with: XMLHttpRequest` が必要である。この header がない同一 origin `fetch` は、同じ URL でも `400 BAD_REQUEST` になる。
- 画面本体の request query は、`date`、`min_num_guests`、`max_num_guests`、`meal_types[]`、`search_jalan_plan_name_contains`、`yad_nos[]` を含む。
- `yad_nos[]` は必須条件として扱う。`date`、宿泊人数範囲、食事条件があっても `yad_nos[]` がない request は `400 BAD_REQUEST` になる。
- 宿泊人数範囲は必須条件として扱う。`date`、食事条件、`yad_nos[]` があっても `min_num_guests` と `max_num_guests` がない request は `400 BAD_REQUEST` になる。
- `meal_types[]` は省略可能である。省略すると、`NONE`、`BREAKFAST` だけではなく、`DINNER`、`BREAKFAST_DINNER` を含む response が返る。
- `search_jalan_plan_name_contains` は、少なくとも空 keyword の状態では省略しても response shape と件数は変わらない。
- `min_num_guests=1`、`max_num_guests=6`、`meal_types[]` 省略の request は `200` で取得できる。response に実際に入る人数は、該当プランが存在する人数だけである。2026-04-30 の観測では、request は `1〜6名` でも response 内の `num_guests` は `1〜4` だった。
- `max_num_guests=10` は `400 BAD_REQUEST` になる。初期取得条件は、Revenue Assistant 画面の通常絞り込みが `1〜4名 / 素泊まり・朝のみ` であっても、RAU 側では `1〜6名 / 食事条件指定なし` を第一候補にする。
- response root は `own` と `competitors` を持つ。`own.plans[]` と `competitors[].plans[]` の各 plan は、`num_guests`、`meal_type`、`plan_name`、`jalan_facility_room_type`、`url`、`price`、`price_diff` を持つ。
- response には、在庫状態、販売停止、満室、ページング情報は含まれない。空室なしや販売停止を独立した状態として保存したい場合は、別 endpoint または画面表示の追加確認が必要である。
- response には、人数、食事条件、部屋タイプ、プラン名、競合施設識別子、価格、自社価格との差分が含まれるため、取得後に RAU 側で人数、食事条件、部屋タイプ、プラン名の再絞り込みは可能である。
- ただし、部屋タイプ指定なし response は各部屋タイプの plan を網羅しない。2026-05-01 の Chrome CDP 調査では、`jalan_room_types[]=TWIN` を単独指定すると、指定なし response には含まれなかった TWIN plan が返った。
- 部屋タイプ query は `jalan_room_types[]` を使う。`jalan_facility_room_types[]`、`jalan_facility_room_type`、`room_types[]` は 2026-05-01 の調査では部屋タイプ条件として効かなかった。
- 複数部屋タイプを同時指定しても、各部屋タイプの plan がすべて返るわけではない。`jalan_room_types[]=TWIN&jalan_room_types[]=DOUBLE` では、TWIN 単独指定では返る施設でも DOUBLE だけに寄るケースがあったため、部屋タイプ別 snapshot は単独 request として扱う。
- 部屋タイプ別 snapshot は、従来の `指定なし` snapshot を置き換えない。`指定なし` response には、Revenue Assistant の部屋タイプ絞り込み選択肢に独立して存在しない `SEMI_DOUBLE` や、raw room type が空のその他相当 plan が最安値として含まれる場合があるため、`指定なし` snapshot も保存し続ける。
- `SINGLE` 単独指定で `SEMI_DOUBLE` が返る場合はあるが、通常は `SINGLE` の最安値が優先して表出しやすい。`SEMI_DOUBLE` とその他相当 plan を後から確認できるように、表示時は実際に response で返った `jalanFacilityRoomType` を保持し、tooltip には `施設`、`部屋タイプ`、`価格`、`前回差分`、`自社との差` を表示する。
- ただし、競合施設一覧を指定しない広い raw snapshot は取得できない。初期の snapshot 保存単位は、`date`、宿泊人数範囲、競合施設一覧、任意の食事条件、任意のプラン名検索条件から作る検索条件 signature ごとに分ける。
- Revenue Assistant で扱う競合は自社に加えて最大 5 施設である。競合施設は後から入れ替え可能なため、保存時点の `yad_nos[]` と競合施設名を snapshot に保存し、後から現在の競合施設一覧だけを参照して過去 snapshot を解釈しない。
- 競合施設を入れ替えた場合、入れ替え前の競合施設と入れ替え後の競合施設を同じ施設として連結しない。施設単位の価格推移は `yad_no` ごとに追跡し、検索条件 signature は保存時点の `yad_nos[]` の集合を含めて作る。
- トップ料金調整候補 row から競合価格 graph を開く場合も、全候補や全日付を事前取得しない。押下された row の `stayDate` を対象日とし、既存競合施設、宿泊人数範囲、食事条件、部屋タイプ別 snapshot 保存契約を使って、cache hit なら保存済み snapshot を表示し、未取得または不足時だけ対象日の snapshot 取得を開始する。取得中、取得失敗、データなし、再取得、同一 `facility x stayDate` の in-flight 重複排除を UI と adapter の境界で扱う。preview は既存競合価格 snapshot series を読み、未保存時だけ既存 `competitor-tab` source の snapshot 保存処理を対象日に限定して呼ぶ。request body、response body、raw trace、HAR、Cookie、token、credential、価格や在庫の非公開データは Git 管理へ保存しない。

### Candidate 3: Booking Curve Phase 2

- BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を別系列として重ねる
- `団体` 系列は `個人 / 団体` toggle として追加し、既定は `個人` とする
- `直近同曜日カーブ` を、既定 OFF の補助線として追加する
- BCL-tuned reference curve の derived cache を `IndexedDB` へ保存し、request fan-out を抑える

## Open Questions

1. 月送りやタブ切替時の request 数をどこまで減らすべきか
2. 競合価格タブ内の人数別最安値グラフで、施設入れ替え後の過去施設をどこまで表示するか
3. Revenue Assistant の `/api/v4/booking_curve` response から、すべての履歴 stay_date で final rooms を安定して解決できるか
4. BCL の outlier row weights に相当する除外または重み補正を、Revenue Assistant だけで再現すべきか
5. 古い derived reference curve cache を削除する条件を、保存量または再計算頻度のどちらを基準に決めるか
