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
- raw source の key は、少なくとも施設識別子、`stay_date`、`as_of_date`、`fetched_at`、scope、`rm_room_group_id`、endpoint、query、schema version を含める。
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
- indicator では、通常のエラー数とは別に、retry 待ち task 数を確認できるようにする。

負荷制限:

- 初期実装の同時取得数は 1 とする。
- request 間隔は 1.0 秒以上とする。
- IndexedDB または derived cache の既存 record により skip できる task は、API request を発行しないため、次 task へ即時に進めてよい。
- 1 回の自動 warm cache 稼働時間は最大 10 分とする。
- 1 回の自動 warm cache 稼働時間に達した場合は、3 分以上のクールダウン時間を置いた後に自動再開する。
- 日次合計稼働時間の上限は設けない。負荷制御は、有限 queue、request 間隔、1 回の稼働時間、クールダウン、document hidden 中の一時停止、連続エラー停止で行う。
- document が hidden の間は自動取得を一時停止する。
- 連続エラーが発生した場合は一時停止し、indicator でエラー件数と停止状態を表示する。
- 利用者が Analyze 画面で操作している間も、既存表示やクリック操作を妨げないように、取得は低優先度の queue として扱う。

Indicator:

- トップカレンダーと Analyze 日付ページ上に、warm cache の状態を小さく表示する。
- 最小表示は `待機中`、`取得中 完了日数 / 対象日数`、`一時停止中`、`クールダウン中`、`エラー n` を区別する。対象日数だけでは期間が分かりにくいため、最小表示にも `4/29〜5/29` のような対象日付範囲を含める。
- 詳細表示では、対象月または対象範囲、取得順、完了済み stay_date 範囲、現在取得中の stay_date と scope、保存数、skip 数、エラー数、最終取得時刻を確認できるようにする。
- 対象範囲は月名だけではなく、`対象 2026-04-29〜2026-05-29` のように開始日と終了日を明示する。
- 完了済み stay_date 範囲は、current raw source、reference source raw source、derived reference curve、同曜日 raw source がすべて揃った日付を、連続範囲として表示する。
- トップカレンダーの各日付セルには、warm cache の stay_date 単位の状態をセル下端の細い色ラインとして表示する。現在 warm cache queue の対象になっている日付は、`raw source`、`reference curve`、`同曜日` の合計 `done / total` に応じた progress bar として表示する。部分的に取得済みの日付は青、完了した日付は緑の全幅、取得エラーがある日付は赤の全幅とする。日付セル内の販売室数、団体室数、差分表示とは重ねない。
- warm cache queue が現在走っていない日付に、保存済み raw source の存在を表示する場合は、現在取得中の progress bar と同じ見た目にしない。IndexedDB に同じ施設と stay_date の `/api/v4/booking_curve` raw source が 1 件以上ある日付を、セル下端中央の短い静的ラインとして表示する。現在取得中の progress bar、完了、エラー表示がある場合は、それらを優先し、保存済みシグナルは上書きしない。
- 保存済みシグナルは、現在の `as_of_date` の raw source が 1 件以上ある日付と、過去 `as_of_date` の raw source だけがある日付を分ける。現在 `as_of_date` の raw source がある日付は緑の短い線、過去 `as_of_date` の raw source だけがある日付は灰色の短い線とする。この区別は raw source の存在を示すものであり、reference source raw source、derived reference curve、同曜日 raw source まで含めた完了を示すものではない。
- indicator の完了日数は、完了定義を満たした stay_date の数を指す。取得が始まっているが完了していない stay_date は `進行 n日` として別に表示し、完了 0 日のままでも取得が進んでいることを確認できるようにする。
- Analyze 日付ページでは、利用者が開いている stay_date の取得状況を percentage と件数で表示する。例: `この日 71%（5/7）`。
- Analyze 日付ページの percentage は、少なくとも `raw source`、`reference curve`、`同曜日` の内訳を区別できる形にする。初期表示では `この日 raw 100% / 参考線 60% / 同曜日 100%` のように、どの段階が不足しているか分かる表示を優先する。
- Analyze 日付ページの indicator では、booking_curve warm cache とは別に、競合価格 snapshot の保存状態も表示する。表示する状態は、未取得、保存中、保存済み、前回 snapshot あり、競合施設未設定による skip、保存失敗を区別する。
- 競合価格 snapshot の詳細表示では、対象 stay_date、検索条件 signature、最終保存時刻、前回 snapshot の取得時刻、保存時点の競合施設数を確認できるようにする。
- `クールダウン中` の詳細表示では、自動再開までのおおよその残り時間を表示する。
- Indicator は取得を開始したこと、停止したこと、上限に達したことを利用者が把握するための表示であり、初期実装では取得対象の細かい編集 UI は持たせない。

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
- 部屋タイプの表示名は、API response の raw value をそのまま出すのではなく、利用者が読みやすい `シングル`、`ダブル`、`ツイン`、`トリプル` などのカタカナ表記へ寄せる。raw value は保存データとして保持し、filter 判定には raw value を使う。
- 人数別グラフは 2 列ではなく、`1名`、`2名`、`3名`、`4名` の順に縦 4 ブロックで表示する。
- グラフの Tooltip は取得日軸ごとに表示する。Tooltip には、その取得日の施設別最安値と、同じ施設の前回取得日との差分を表示する。前回取得日がない場合は前回なしとして表示する。
- warm cache indicator と競合価格表示が干渉する場合に備え、indicator は詳細を折りたためる最小化機能を持つ。最小化しても状態の要約は残し、再表示できるようにする。
- 検索条件 signature が違う競合価格 snapshot を同じ推移系列として扱わない。初期表示では同じ stay_date の保存済み snapshot を読むが、画面上には最新 snapshot の条件 signature を明示し、条件違いが混在している可能性を見落とさないようにする。
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
- `SINGLE` 単独指定で `SEMI_DOUBLE` が返る場合はあるが、通常は `SINGLE` の最安値が優先して表出しやすい。`SEMI_DOUBLE` とその他相当 plan を後から確認できるように、表示時は実際に response で返った `jalanFacilityRoomType` を保持し、Tooltip には施設名、部屋タイプ、価格、前回差分を表示する。
- ただし、競合施設一覧を指定しない広い raw snapshot は取得できない。初期の snapshot 保存単位は、`date`、宿泊人数範囲、競合施設一覧、任意の食事条件、任意のプラン名検索条件から作る検索条件 signature ごとに分ける。
- Revenue Assistant で扱う競合は自社に加えて最大 5 施設である。競合施設は後から入れ替え可能なため、保存時点の `yad_nos[]` と競合施設名を snapshot に保存し、後から現在の競合施設一覧だけを参照して過去 snapshot を解釈しない。
- 競合施設を入れ替えた場合、入れ替え前の競合施設と入れ替え後の競合施設を同じ施設として連結しない。施設単位の価格推移は `yad_no` ごとに追跡し、検索条件 signature は保存時点の `yad_nos[]` の集合を含めて作る。

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
