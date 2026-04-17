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
- 全体サマリーの下に、室タイプカードと同じ順序で、室タイプ別の `部屋タイプ / 最終変更 / ランク` を表形式で俯瞰できる rank overview を表示する
- 各室タイプカードの `最終変更履歴` の下に、`ランク：A→B` を 1 行で表示する
- 全体販売室数サマリーは、販売設定タブ上に描画済みの室タイプ別表示を合算して生成する
- 販売設定タブの販売室数差分は、現状 `/api/v4/booking_curve` の `all.this_year_room_sum` を室タイプ別に引いて計算している

### Candidate: Room-Type Booking Curve

- 対象は analyze 日付ページの `販売設定` タブ内にある各室タイプカードとする
- 実装はフェーズ分割とし、初期実装では `室数` グラフだけを扱う

#### Phase 1

- 最上段の全体サマリー直下に、ホテル全体の booking curve を 1 枚表示する
- 各室タイプカードへ、同じ室タイプの booking curve を 1 枚ずつ表示する
- 表示対象の系列は `全体 / 個人 / 団体` とし、`/api/v4/booking_curve` の `all / transient / group` を切り替えて使う
- baseline は初期実装では入れない
- 生データ保存は日次のまま維持し、圧縮するのは表示だけとする
- 初期表示は常時展開ではなく、全体 block と各室タイプ card ともに `閉じた状態` を既定とし、必要なものだけ開いて見られる構成を優先する
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
- 実画面での左右の向きは、既存のレベニューアシスタントの booking curve 表示に合わせる
- Phase 1 では `localStorage` へ booking curve の生 JSON を persistent 保存しない
- persistent cache が必要なら、`date / all / transient / group` だけの最小系列へ圧縮した payload を優先する
- `IndexedDB` は Phase 1 では前提にしない

#### Phase 2

- `同月同曜日` の reference curve を baseline として重ねる
- baseline 用の履歴系列を複数本持つ必要が出た場合に、`IndexedDB` 導入を再判断する
- baseline は `rm-booking-curve-lab` の `comparison_curves` と同様に、描画用の別系列として扱う

## キャッシュと同期のルール

### キャッシュ範囲

- group 系キャッシュは `最終データ更新` 日付が変わるまで再利用してよい
- ただしキャッシュキーは施設単位でも分離し、異なる施設間で再利用しない
- 室タイプ別 booking curve キャッシュは `rm_room_group_id` を含め、ホテル全体キャッシュと分離する

### Sync Timing

- 初回起動時に同期する
- analyze 日付ページへの画面内遷移時に再同期する
- `visibilitychange` と `focus` の復帰時に整合チェックを行う
- 整合チェックで group 系表示とキャッシュの不整合を検知した場合は、group 系キャッシュを破棄して再同期する

## Non-Functional Requirements

- single-page application の再描画に追従できること
- 同一日付、同一施設、同一 `最終データ更新` 日付では無駄な再取得を増やさないこと
- カレンダーと販売設定タブの既存レイアウトを壊さないこと

## Remaining Candidate Scope

### Candidate 1: Sales Setting Delta Data Source

- 販売設定タブの販売室数差分を、現在の `booking_curve` ベースのまま維持するか、`/api/v3/suggest/output/details` ベースへ寄せるかを判断する
- 判断では、計算の意味、レスポンス整合性、取得回数、保守性を比較する

### Candidate 2: Performance Tuning

- 月送り時と販売設定タブ再描画時の体感速度を改善する
- 比較対象は request 並列数、先読み取得の単位、キャッシュ再利用単位とする

### Candidate 3: Competitor Price Table

- `/api/v5/competitor_prices` を使った競合価格表を販売設定タブへ埋め込むか判断する
- 実装する場合は、表示位置、比較単位、列数、既存タブとの役割分担を先に仕様化する

### Candidate 4: Room-Type Booking Curve

- 最上段の全体 block にもホテル全体 booking curve を表示する
- 販売設定タブ内の各室タイプカードへ booking curve を段階導入する
- 初期実装では `室数` のみ、`全体 / 個人 / 団体` 切替あり、baseline なし、既定は閉じた表示とする
- LT 軸は日次生データを bucket 集約表示へ圧縮し、代表値は各 bucket の最後の日を使う
- `ACT` は `0日前` と分離して扱う
- Phase 2 で `同月同曜日` baseline と `IndexedDB` 導入要否を再判断する

## Open Questions

1. 販売設定タブの販売室数差分は、現状の `booking_curve` 由来値で十分か
2. 月送りやタブ切替時の request 数をどこまで減らすべきか
3. 競合価格表を analyze 画面へ追加する価値が、表示密度の増加を上回るか
