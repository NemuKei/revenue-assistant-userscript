# spec_001_analyze_expansion

## Purpose

analyze 画面で、団体数 PoC を日次の意思決定補助へ広げる。

現時点の PoC は月次カレンダーへの団体室数表示までに留まるため、次段では次の 4 系統を追加候補として扱う。

- 1日前増減 / 7日前増減に対する団体系表示
- 販売設定タブでの室タイプ別差分表示
- 販売設定タブでの室タイプ別団体系表示
- 販売設定タブ内への競合価格表の埋め込み

## Current Findings

### Calendar / Group Data

- `/api/v4/booking_curve?date=YYYYMMDD` で、stay_date 単位の booking curve が取れる
- `booking_curve[].group.this_year_room_sum` でホテル全体の団体室数が取れる
- 当日点が `null` の stay_date があるため、表示時は `date <= stay_date` の最新非 null 値へフォールバックが必要
- booking_curve はホテル全体の集計であり、室タイプ別の団体内訳はこの API だけでは取れない
- analyze 画面のブッキングカーブタブには室タイプ切替 UI があるため、室タイプ単位の booking curve 系データ源が別に存在する可能性が高い

### Sales Setting Tab

- analyze 画面の販売設定タブは、室タイプ別に `販売室数 : current / max` を表示している
- `/api/v3/suggest/output/details?from=YYYYMMDD&to=YYYYMMDD` で、室タイプ別の current setting が配列で取得できる
- 各要素には `rm_room_group_id`, `rm_room_group_name`, `current.landing_num_room`, `max_num_room` が含まれる
- 同じ endpoint を `date-1`, `date-7` で引き直せば、`rm_room_group_id` join で室タイプ別の 1日前増減 / 7日前増減は計算できる見込み

### Competitor Prices

- `/api/v5/competitor_prices` で、自館と競合のプラン価格表が取得できる
- `own.plans[]` と `competitors[].plans[]` には `jalan_facility_room_type`, `num_guests`, `meal_type`, `price`, `price_diff` が含まれる
- analyze 画面の競合価格タブに相当するデータ源として流用できる見込み

### Unknowns

- 室タイプ別の団体販売室数を返す API は、観測範囲では未特定
- ただしブッキングカーブタブの室タイプ切替で参照している API または既存 state に、室タイプ別の団体系データが含まれる可能性がある
- `/api/v1/booking_curve/rm_room_groups` は室タイプ一覧のみで、団体系の室タイプ別数値は持たない
- 室タイプ別団体数は別 API 調査が必要で、なければ DOM 由来情報の再利用またはスコープ見直しが必要

## Proposed Scope

### Phase 1: Group Delta On Calendar

目的:
1日前増減 / 7日前増減の文脈でも、ホテル全体の団体増減を見えるようにする。

候補仕様:
- 既存の `団N` を維持しつつ、差分モード時は別行または小さい補助表示で `団 +N`, `団 -N` を出す
- 差分は booking curve の group room sum を使って計算する
- 1日前増減は `selected curve date` と `curve date - 1 day` の差分
- 7日前増減は `selected curve date` と `curve date - 7 day` の差分

受け入れ条件:
- analyze 日付ページのカレンダーで、差分表示モード時に団体系差分が表示される
- 当日点が null でも、直前の非 null 値で表示が途切れない

### Phase 2: Room Type Deltas On Sales Setting

目的:
販売設定タブの室タイプ別販売室数の横に、1日前増減 / 7日前増減を追加する。

候補仕様:
- 表示例: `シングル 販売室数 : 60 / 61  前日比 -1  7日前比 +2`
- 比較元データは `/api/v3/suggest/output/details` を date, date-1, date-7 で取得し、`rm_room_group_id` で join する
- 差分対象は `current.landing_num_room`

受け入れ条件:
- 販売設定タブの各室タイプ行で current, 1日前差分, 7日前差分が並んで表示される
- 室タイプ順は既存 UI を崩さない

### Phase 3: Room Type Group Counts On Sales Setting

目的:
販売設定タブの室タイプ別販売室数の横に、団体の室タイプ別販売室数と 1日前増減 / 7日前増減を追加する。

前提:
- このフェーズは専用データ源の特定が前提

現時点の判断:
- 先行して調査タスク化し、まずブッキングカーブタブの室タイプ切替で使うデータ源を確認する
- API がなければ、まずホテル全体の団体数表示までで止める選択肢を持つ

受け入れ条件:
- 室タイプ別団体数のソースが特定されてから定義する

### Phase 4: Competitor Price Table In Sales Setting

目的:
販売設定タブの余白に、室タイプ比較のための競合価格表を埋め込む。

候補仕様:
- 右側または下段の余白に簡易テーブルを表示する
- 初期表示は `own + competitors` の最安値比較に絞る
- 1室人数と meal type は analyze 画面の既定条件に合わせる
- 詳細版は後続に回し、初期段階では表幅と可読性を優先する

受け入れ条件:
- 販売設定タブを壊さずに競合価格の比較表が表示される
- モバイル幅ではなくデスクトップ前提の analyze 画面で破綻しない

## Open Questions

1. `7日前増減` は現行 UI のどこでトグルされるか。常設表示か、絞り込み条件かを実画面で再確認する
2. 団体系差分は、既存の差分数値の隣に出すか、団体数の下に別行で出すか
3. 販売設定タブの室タイプ行へ追加する情報量は、1行追記で収まるか、2段化が必要か
4. 室タイプ別団体数のソース API がなければ、この要求は別タスクに分離するか
5. 競合価格表は analyze 既存の競合価格タブを要約表示するのか、それとも別表として再構成するのか

## Recommended Delivery Order

1. カレンダーの団体系 1日前増減 / 7日前増減
2. 販売設定タブの室タイプ別 1日前増減 / 7日前増減
3. 競合価格表の埋め込み
4. 室タイプ別団体数のデータ源調査と実装可否判断