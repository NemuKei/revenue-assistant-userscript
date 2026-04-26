# tasks_backlog

## Now

### RAU-AF-07 booking_curve raw source IndexedDB cache と ACT/0日前分離を GUI 確認する

- 目的:
  - `/api/v4/booking_curve` の raw source を IndexedDB に保存し、同じ施設、宿泊日、取得基準日、scope、室タイプの再取得を減らす。
  - raw source 保存開始後の stay_date について、宿泊日当日時点の `0日前` と宿泊日後に確定した `ACT` を別データとして扱えるようにする。
  - `直近型カーブ` と `季節型カーブ` の `ACT` がどの入力値から作られているかを確認し、`0日前` から `ACT` へ不自然な段差が出る原因を特定できるようにする。
- 状態:
  - コード実装済み。
  - Analyze 日付ページでの GUI 確認は未実施。
- スコープ:
  - raw source の IndexedDB store、cache key、record adapter を追加する。
  - key には施設識別子、`stay_date`、`as_of_date`、`fetched_at`、scope、`rm_room_group_id`、endpoint、query、schema version を含める。
  - reference curve の source 取得は IndexedDB raw source を先に読み、不足分だけ API request する。
  - 部屋タイプ別 card は current curve を先に表示し、reference curve は raw source / derived cache を使って非同期で補う。
  - current と reference curve の表示範囲は `0〜360日前 + ACT` を目標に揃える。
  - `recent_weighted_90` と `seasonal_component` の `ACT` sourceCount、`0日前` sourceCount、rooms 差分を確認できる diagnostics を追加する。
- 非目標:
  - raw source 保存開始前の過去日程について、本当の `0日前` を推測で復元すること。
  - 外部 DB、PMS データ、DWH データを必須にすること。
  - 予測モデルの採用をこの task で決めること。
- 受け入れ条件:
  - 同じ Analyze 日付、同じ施設、同じ室タイプ card を再表示したとき、保存済み raw source を優先して API request 数が減る。
  - raw source 保存開始後の stay_date では、`0日前` と `ACT` を別 key または別観測時点として追跡できる。
  - `直近型カーブ` と `季節型カーブ` の `ACT` が、`0日前` と同じ入力値なのか、final rooms 相当の入力値なのかを確認できる。
  - `0日前` と `ACT` が同じ値から作られている場合に線が平坦になるかを確認でき、不自然な段差が残る場合は原因候補を diagnostics に残せる。
  - 既存の `全体 / 個人` 系列、rank marker、tooltip、current-ui supplement portal が維持される。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
  - Tampermonkey 再読込後に Analyze 日付ページで GUI 確認できる。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`, `docs/spec_002_curve_core.md`
  - `open-spec-questions`: raw source の保存期間、容量上限、手動削除導線をどの段階で入れるか

## Next

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

- `RAU-AF-07` booking_curve raw source IndexedDB cache と ACT/0日前分離を GUI 確認する

Next:

- `RAU-UX-01` competitor prices と団体系列の導入要否を再判断する

After Next:

- `RAU-MP-01` 月次実績画面の LT 基準 custom booking curve を再開する

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
- 旧 backlog の `団体` 系列、rank marker polish、competitor prices は、BCL-tuned reference curve 実装後の使用感で再判断するため `RAU-UX-01` へ束ねる。
- 予測モデルと予測評価は将来候補として残すが、reference curve の core logic と GUI 接続が完了するまでは `Later` に置く。先に `RAU-AF-04` で evaluation-ready な input / output / diagnostics を作り、後続 task が同じ core contract を再利用できる状態にする。
