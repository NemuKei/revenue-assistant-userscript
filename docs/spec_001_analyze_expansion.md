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
- 全体 block の標準表示は `全体` と `個人` の 2 系列とし、横並びで同時に見られる構成を優先する
- 各室タイプカードへ、同じ室タイプの booking curve を 1 枚ずつ表示する
- 各室タイプカードの booking curve は、カードごとに独立して開閉できるようにする
- 各室タイプカードの開閉トリガーは、そのカード自身の block 内に置く
- booking curve の見出しは対象を含めて表示し、`ブッキングカーブ（全体）`、`ブッキングカーブ（シングル）` のように判別できる形を正とする
- 各室タイプカードの標準表示は `全体` と `個人` の 2 系列とし、横並びで同時に見られる構成を優先する
- `団体` 系列は Phase 1 の標準 UI では必須としない
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
- Phase 1 では `localStorage` へ booking curve の生 JSON を persistent 保存しない
- persistent cache が必要なら、`date / all / transient / group` だけの最小系列へ圧縮した payload を優先する
- `IndexedDB` は Phase 1 では前提にしない

#### Phase 1 Verification Notes

- 室タイプ別とホテル全体の `全体 / 個人` 系列は、選択中 analyze 日付を `stay_date` として扱い、current 値は `batch-date` 以前の最新非 null を使う
- 当日 stay_date では `ACT` を空表示にし、未来 stay_date では観測 LT より先を空表示にする
- GUI verify では `dist/*.user.js` の build 完了だけでなく、Tampermonkey 側の userscript 再読込も済ませた状態を正とする
- rank marker は card panel 上で小さな丸として視認でき、tooltip では `ランク A→B / 反映日 / 反映者` を確認できることを Phase 1 の受け入れ条件とする

#### Phase 2

- `同月同曜日` の reference curve を baseline として重ねる
- baseline 用の履歴系列を複数本持つ必要が出た場合に、`IndexedDB` 導入を再判断する
- baseline は `rm-booking-curve-lab` の `comparison_curves` と同様に、描画用の別系列として扱う

#### Phase 2 Pending Decisions

- 2026-04-18 時点で未確定なのは、baseline を `全体 block のみ` で先に入れるか、室タイプ card まで同時に入れるか
- 最初の slice では、Phase 1 の `全体 / 個人` 系列、rank marker overlay、tooltip close、`ACT` 空表示を崩さないことを優先する
- baseline scope が固まる前に、persistent cache 全体を `IndexedDB` へ移す前提で設計しない。必要になった場合も booking_curve persistent cache を最初の移行対象とする
- Phase 2 の最初の受け入れ条件は、baseline 追加後も current-ui supplement portal、overall summary、rank overview、room-group table が維持され、不要 warning を増やさないこととする

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

### Candidate 1: Performance Tuning

- 月送り時と販売設定タブ再描画時の体感速度を改善する
- 比較対象は request 並列数、先読み取得の単位、キャッシュ再利用単位とする

### Candidate 2: Competitor Price Table

- `/api/v5/competitor_prices` を使った競合価格表を販売設定タブへ埋め込むか判断する
- 実装する場合は、表示位置、比較単位、列数、既存タブとの役割分担を先に仕様化する

### Candidate 3: Booking Curve Phase 2

- `同月同曜日` baseline を別系列として重ねる
- `団体` 系列を標準 UI に含めるかを再判断する
- baseline や複数比較系列が増える場合に `IndexedDB` 導入要否を再判断する

## Open Questions

1. 月送りやタブ切替時の request 数をどこまで減らすべきか
2. 競合価格表を analyze 画面へ追加する価値が、表示密度の増加を上回るか
3. baseline は `全体 block のみ` から始めるべきか、それとも室タイプ card まで同時に出すべきか
4. baseline scope を決めた時点で、現行 localStorage headroom のまま進められるか
