# tasks_backlog

## Now

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

## Next

### RAU-CP-01 競合価格推移 snapshot の価値と保存単位を設計する

- 目的:
  - Revenue Assistant 標準タブで見られる現在値ではなく、競合価格が直近で上がったか、下がったか、自館の価格変更や booking curve 変化と前後関係があるかを確認できるようにする。
- スコープ:
  - `/api/v5/competitor_prices` の response shape、取得対象日、施設単位、競合施設単位、取得時点を確認する。
  - IndexedDB に保存する snapshot key と保持期間を設計する。
  - Analyze 画面へ表示する場合の最小表示を設計する。
- 非目標:
  - 競合価格の現在値表だけを販売設定タブへ複製すること。
  - 自動レート変更へ接続すること。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`

## Completed

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

- `RAU-AF-09` 直近同曜日カーブを既定OFFの補助線として追加する

Next:

- `RAU-CP-01` 競合価格推移 snapshot の価値と保存単位を設計する

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
- `RAU-UX-01` の判断結果により、`団体` は `RAU-AF-08` の `個人 / 団体` toggle へ、直近同曜日比較は `RAU-AF-09` へ、競合価格は現在値表ではなく `RAU-CP-01` の価格推移 snapshot 設計へ分割する。
- `RAU-AF-08` を先に行う理由は、既存 booking curve panel の segment 表示切替だけで実装でき、直近同曜日補助線より表示構造への影響が小さいため。
- `RAU-AF-09` は線の本数と凡例、hover 表示が増えるため、`個人 / 団体` toggle の表示構造を固めた後に実装する。
- `RAU-CP-01` は `/api/v5/competitor_prices` の現在値表を複製しない。価格推移を扱うには snapshot 保存設計が必要なため、表示実装より先に保存単位を設計する。
- 予測モデルと予測評価は将来候補として残すが、reference curve の core logic と GUI 接続が完了するまでは `Later` に置く。先に `RAU-AF-04` で evaluation-ready な input / output / diagnostics を作り、後続 task が同じ core contract を再利用できる状態にする。
