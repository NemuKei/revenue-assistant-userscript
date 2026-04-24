# tasks_backlog

## Now

### RAU-AF-04 BCL-tuned reference curve の算出コアを実装する

- 目的:
  - `直近型カーブ` と `季節型カーブ` の算出を、BCL repo の booking curve 画面で使う考え方を参照した RAU 向けロジックへ差し替える。
- スコープ:
  - `docs/spec_002_curve_core.md` を正本として、UI、API 取得、storage に依存しない core logic を実装する。
  - canonical input、canonical output、diagnostics の型を作る。
  - Revenue Assistant の `/api/v4/booking_curve` response 群を、`stay_date x LT` の rooms matrix へ変換する純粋関数を作る。
  - `直近型カーブ` は、同じ曜日の履歴 stay_date を使い、LT ごとの 90 日窓と直近重みを使う `recent90w` 相当で算出する。
  - `季節型カーブ` は、前年同月と 2 年前同月の同じ曜日の履歴 stay_date を使い、final rooms に対する LT 比率から rooms-only reference curve を算出する。
  - 既存の `直近 7 泊日中央値` と `last_year_room_sum` 優先ロジックは、暗黙 fallback として残さない。
- 非目標:
  - BCL Python 実装を直接呼び出すこと。
  - PMS データ、外部 DB、人数実績、学習済みパラメータを必須入力にすること。
  - UI レイアウトをこの task で作り直すこと。
  - 予測モデルや予測評価をこの task で実装すること。
- 受け入れ条件:
  - 入力 response 群から、ホテル全体と室タイプ別の両方に使える `直近型カーブ` と `季節型カーブ` の表示用データを生成できる。
  - データ不足時は旧仮ロジックへ自動 fallback せず、空表示または取得不可状態を返せる。
  - 算出ロジックが UI と API 取得処理から分離され、単体で確認できる。
  - 将来の予測モデルと予測評価で再利用できるよう、result に `algorithmVersion`、`sourceCount`、`missingReason`、`warnings` を含める。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_002_curve_core.md`, `docs/spec_001_analyze_expansion.md`
  - `open-spec-questions`: final rooms の解決規則と BCL outlier row weights 相当の扱いは、実装中に API response の実データで再確認する

## Next

### RAU-AF-05 reference curve の IndexedDB cache と request scheduler を実装する

- 目的:
  - BCL-tuned reference curve の request 数増加で、Analyze 日付ページと室タイプ別 card の操作が重くならないようにする。
- スコープ:
  - derived reference curve を IndexedDB へ保存する。
  - cache key は `facility_id`、`scope`、`target_stay_date` または `target_month + weekday`、`as_of_date`、`rm_room_group_id`、`curve_kind`、`algorithm_version` を含める。
  - 同じ key の計算が進行中の場合は in-flight Promise を共有し、重複 request を発行しない。
  - `/api/v4/booking_curve` の比較対象日付取得に同時 request 数制限を入れる。
  - 室タイプ別 reference curve は、card が開かれたときに必要分だけ取得する。
- 非目標:
  - 既存の小さい日次 localStorage cache 全体を無条件に IndexedDB へ移すこと。
  - 初期表示時に全室タイプ分の reference curve を一括取得すること。
- 受け入れ条件:
  - 同じ target と scope で再表示した場合、保存済み derived reference curve を再利用できる。
  - 同じ target と scope の計算を短時間に複数回要求しても、同じ API request が重複して増えない。
  - 室タイプ card を開くまで、その室タイプの reference curve 用履歴取得は始まらない。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
  - `open-spec-questions`: IndexedDB の保持期間を `as_of_date`、`batch-date`、TTL のどれで切るかは初期実装時に暫定値を置く

## After Next

### RAU-AF-06 BCL-tuned reference curve を既存 UI shell へ接続して GUI 確認する

- 目的:
  - `RAU-AF-03` で作った reference curve UI shell を維持しつつ、表示データを BCL-tuned 算出結果へ差し替える。
- スコープ:
  - ホテル全体 block と、開いた室タイプ card の `現在 / 直近型 / 季節型` 表示を BCL-tuned 算出結果へ接続する。
  - `全体 / 個人` panel、rank marker、tooltip、`ACT` 空表示、表示切替を維持する。
  - データ不足、取得中、取得失敗を UI で判別できるようにする。
- 非目標:
  - `団体` 系列の標準表示化。
  - competitor prices 表の導入。
  - 月次実績画面の chart 更新。
- 受け入れ条件:
  - Analyze 日付ページで、ホテル全体と室タイプ別 card に BCL-tuned reference curve が表示できる。
  - 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示、current-ui supplement portal が維持される。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
  - Tampermonkey 再読込後に Analyze 日付ページで GUI 確認できる。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: during-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
  - `open-spec-questions`: 表示密度が高すぎる場合、reference curve の既定表示状態を再判断する

## Later

### RAU-UX-01 competitor prices と団体系列の導入要否を再判断する

- 目的:
  - Analyze reference curve 実装後の使用感を見て、`/api/v5/competitor_prices` と `団体` 系列を標準 UI に含めるか判断する。
- metadata:
  - `spec-impact`: unknown
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

### RAU-FC-01 rooms-only 予測モデルの導入要否を判断する

- 目的:
  - BCL-tuned reference curve 実装後に、現在観測値、`直近型カーブ`、`季節型カーブ` から最終販売室数または将来 booking curve を予測する価値があるか判断する。
- 前提:
  - `RAU-AF-04` で core logic の input / output / diagnostics が実装済みであること。
  - `RAU-AF-06` で reference curve の GUI 使用感を確認済みであること。
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

- `RAU-AF-04` BCL-tuned reference curve の算出コアを実装する

Next:

- `RAU-AF-05` reference curve の IndexedDB cache と request scheduler を実装する

After Next:

- `RAU-AF-06` BCL-tuned reference curve を既存 UI shell へ接続して GUI 確認する

Later:

- `RAU-UX-01` competitor prices と団体系列の導入要否を再判断する
- `RAU-MP-01` 月次実績画面の LT 基準 custom booking curve を再開する
- `RAU-FC-01` rooms-only 予測モデルの導入要否を判断する
- `RAU-FC-02` 予測評価 dataset と metrics を設計する

統合判断:

- 旧 `RAU-AF-03` は UI shell 実装として扱い、BCL-tuned 算出ロジックへの差し替えは `RAU-AF-04`、cache と request scheduling は `RAU-AF-05`、GUI 接続と確認は `RAU-AF-06` に分ける。
- `直近型カーブ` と `季節型カーブ` は同じ入力 matrix と cache key 設計を共有するため、算出コアは同じ task bundle で扱う。
- response 改善は算出ロジックと密接に関係するが、主成果物と verify 観点が異なるため `RAU-AF-05` として分ける。
- 旧 backlog の月次実績画面関連 task は、`RAU-MP-01` へ束ねて優先度を下げる。
- 旧 backlog の `団体` 系列、rank marker polish、competitor prices は、BCL-tuned reference curve 実装後の使用感で再判断するため `RAU-UX-01` へ束ねる。
- 予測モデルと予測評価は将来候補として残すが、reference curve の core logic と GUI 接続が完了するまでは `Later` に置く。先に `RAU-AF-04` で evaluation-ready な input / output / diagnostics を作り、後続 task が同じ core contract を再利用できる状態にする。
