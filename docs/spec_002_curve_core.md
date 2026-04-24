# spec_002_curve_core

## Purpose

この仕様は、booking curve のコアロジックを UI、API 取得、storage 実装から分離し、RAU と今後の別プロジェクトで再利用しやすい形にするための入力、処理、出力の契約を定義する。

ここでいうコアロジックは、Revenue Assistant の画面へ直接描画する処理ではない。複数日の booking curve データを共通形式へ変換し、reference curve、将来の予測モデル、将来の予測評価に使える中間データと結果を返す純粋処理を指す。

## Ownership And Update Trigger

- 所有者:
  - RAU の booking curve 拡張実装。
  - 将来、同じ算出ロジックを別プロジェクトへ移す場合も、この仕様を最初の参照元にする。
- 更新トリガー:
  - `直近型カーブ`、`季節型カーブ`、予測モデル、予測評価の入力または出力が変わるとき。
  - core logic の責務境界を、UI、API client、IndexedDB adapter、別プロジェクト用 package のいずれかへ移すとき。
  - BCL repo の算出ロジックを再確認し、RAU 側の計算規則を変更するとき。

## Scope

### In Scope

- `/api/v4/booking_curve` response 群を、画面や API 形式に依存しない canonical input へ変換するための契約。
- `stay_date x LT` の rooms matrix を作るための契約。
- BCL-tuned `直近型カーブ` の算出契約。
- BCL-tuned `季節型カーブ` の算出契約。
- データ不足、欠損、future stay_date、final rooms 欠損の扱い。
- 将来の予測モデルと予測評価で使うための拡張点。

### Out Of Scope

- Revenue Assistant API を呼び出す処理。
- IndexedDB、localStorage、memory cache の具体的な実装。
- Analyze 画面の DOM 操作、SVG 描画、tooltip、legend、toggle。
- PMS データ、DWH データ、外部 DB との接続。
- BCL Python 実装を直接実行すること。
- 予測モデルの採用確定、学習済みパラメータの固定、評価指標の合格基準固定。

## Terms

- `stay_date`: 宿泊日。
- `as_of_date`: 予約状態を評価する基準日。Revenue Assistant の `batch-date` が response に無い場合は、既存同期文脈または取得側の key から渡す。
- `LT`: lead time。宿泊日から予約状態の基準日までの日数差。例: 宿泊日の 7 日前は `LT=7` とする。
- `ACT`: 宿泊日着地後の最終実績を表す点。core logic では表示用 tick として扱い、必要に応じて `lt=-1` 相当へ正規化してよい。
- `scope`: ホテル全体または室タイプ別を区別する対象範囲。
- `segment`: rooms 系列の区分。初期対象は `all` と `transient`。`group` は入力可能だが標準表示は別判断とする。
- `final_rooms`: 履歴 stay_date の最終販売室数。季節型カーブの比率計算で分母になる。
- `reference_curve`: 現在値と比較するための基準線。初期対象は `recent_weighted_90` と `seasonal_component`。
- `forecast_model`: 現在の観測値、reference curve、補助特徴量から将来または最終需要を予測する処理。
- `evaluation_case`: 過去の stay_date を、ある `as_of_date` 時点で止めたものとして扱い、予測値と実績値を比較するための入力単位。

## Core Boundary

core logic は純粋関数として実装する。

- 入力:
  - canonical input。
  - algorithm option。
  - target stay_date、target month、weekday、as_of_date、scope、segment。
- 処理:
  - 入力の整形。
  - LT 計算。
  - matrix 構築。
  - reference curve 算出。
  - 将来の予測モデルまたは評価処理が使える diagnostics 生成。
- 出力:
  - chart や cache に渡せる structured result。
  - 欠損理由、利用した履歴件数、algorithm version を含む diagnostics。

core logic は次の処理を直接行わない。

- `fetch()`。
- `localStorage` または `IndexedDB` の読み書き。
- DOM 読み書き。
- 現在ページの route 判定。
- console への直接依存。

## Canonical Input

Revenue Assistant の response は、core logic へ渡す前に canonical input へ変換する。

最小単位は次の情報を持つ。

```ts
type CurveObservation = {
  scope: "hotel" | "roomGroup";
  roomGroupId?: string;
  segment: "all" | "transient" | "group";
  stayDate: string;       // YYYY-MM-DD
  observedDate: string;   // YYYY-MM-DD
  lt: number;             // stayDate - observedDate in days
  rooms: number | null;
  capacity?: number | null;
};
```

集計単位は次の情報を持つ。

```ts
type CurveInput = {
  facilityId: string;
  asOfDate: string;       // YYYY-MM-DD
  observations: CurveObservation[];
};
```

Revenue Assistant 固有の field 名、例えば `this_year_room_sum`、`last_year_room_sum`、`two_years_ago_room_sum` は adapter 側で解釈する。core logic は、それらの field 名へ直接依存しない。

## Canonical Output

reference curve の出力は、表示と cache の両方で使える形にする。

```ts
type CurvePoint = {
  lt: number | "ACT";
  rooms: number | null;
  sourceCount: number;
};

type ReferenceCurveResult = {
  curveKind: "recent_weighted_90" | "seasonal_component";
  algorithmVersion: string;
  facilityId: string;
  scope: "hotel" | "roomGroup";
  roomGroupId?: string;
  segment: "all" | "transient" | "group";
  targetStayDate?: string;
  targetMonth?: string;   // YYYY-MM
  weekday?: number;       // 0-6
  asOfDate: string;
  points: CurvePoint[];
  diagnostics: {
    sourceStayDateCount: number;
    missingReason?: string;
    warnings: string[];
  };
};
```

`rooms` が `null` の点は、表示側で空表示にする。core logic は旧仮ロジックへ暗黙 fallback しない。

## Reference Curve Algorithms

### Recent Weighted 90

`recent_weighted_90` は、BCL の `recent90w` 相当の直近型カーブである。

入力:

- target stay_date。
- as_of_date。
- segment。
- scope。
- 同じ曜日の履歴 stay_date に属する observations。

処理:

1. 対象の LT tick ごとに、集計対象 stay_date の範囲を決める。
2. 範囲は `as_of_date - (90 - LT) 日` から `as_of_date + LT 日` までとする。
3. 対象範囲内にある同じ曜日の stay_date だけを使う。
4. stay_date と as_of_date の日数差で重みを付ける。
5. 0 から 14 日は重み 3、15 から 30 日は重み 2、31 から 90 日は重み 1、範囲外は重み 0 とする。
6. 非 null の rooms だけを重み付き平均する。
7. 使える rooms が 0 件の場合、その LT tick は `rooms=null` とする。

出力:

- `curveKind="recent_weighted_90"`。
- LT tick ごとの rooms。
- LT tick ごとの sourceCount。
- 使用した履歴 stay_date 数。

### Seasonal Component

`seasonal_component` は、BCL の seasonal baseline 相当の季節型カーブである。

入力:

- target month。
- weekday。
- as_of_date。
- segment。
- scope。
- 前年同月と 2 年前同月の同じ曜日に属する observations。

処理:

1. 対象月の 12 か月前と 24 か月前を季節履歴月として選ぶ。
2. 季節履歴月のうち、target weekday と同じ曜日の stay_date だけを使う。
3. 各 stay_date の final_rooms を解決する。
4. final_rooms が 0、null、または解決不能の stay_date は比率計算から除外する。
5. 各 LT tick で `rooms at LT / final_rooms` を計算する。
6. LT tick ごとに比率の平均を作る。
7. 比率は 0 から 1 に丸める。
8. 宿泊日に近づくほど rooms が減らない形に補正する。
9. `0日前` の比率は 1 とする。
10. final rooms 推定値は、利用できる履歴 stay_date の final_rooms 平均を初期実装の既定とする。
11. 各 LT tick の rooms は `final rooms 推定値 * 補正後比率` とする。

出力:

- `curveKind="seasonal_component"`。
- LT tick ごとの rooms。
- LT tick ごとの sourceCount。
- 使用した履歴 stay_date 数。

BCL 側の outlier row weights に相当する補正は、Revenue Assistant から安定して使える除外指標が確認できるまで必須にしない。

## Forecast Extension

予測モデルは、reference curve の実装後に追加候補として扱う。初期の reference curve 実装では、予測モデルを必須にしない。

予測モデルを追加する場合、core logic の入力と出力は次の方向で拡張する。

入力:

- target stay_date。
- as_of_date。
- 現在観測済みの booking curve prefix。
- `recent_weighted_90` と `seasonal_component` の reference curve。
- capacity。
- 任意の補助特徴量。例: 曜日、月、休日、価格ランク変更履歴、競合価格。補助特徴量は最初から必須にしない。

出力:

```ts
type ForecastResult = {
  modelId: string;
  modelVersion: string;
  targetStayDate: string;
  asOfDate: string;
  segment: "all" | "transient" | "group";
  predictedFinalRooms: number | null;
  predictedCurve?: CurvePoint[];
  diagnostics: {
    featureNames: string[];
    missingReason?: string;
    warnings: string[];
  };
};
```

初期候補:

- 現在値を `seasonal_component` の LT 比率で final rooms へ換算する単純モデル。
- 現在値と `recent_weighted_90` の差分を使い、`seasonal_component` の final rooms 推定値を補正する単純モデル。
- BCL の `forecast_final_from_pace14` 相当を rooms-only で移植するモデル。

採用前に確認すること:

- Revenue Assistant の rooms-only データだけで、実務判断に使える安定性があるか。
- モデルが reference curve 表示より判断コストを下げるか。
- 予測値を表示することで、利用者が現在値、基準線、予測値を混同しないか。

## Evaluation Extension

予測評価は、予測モデルを採用する前、または採用後の regression check として使う。

評価 input は過去の stay_date を使い、ある as_of_date 時点で観測できた情報だけを入力として扱う。

```ts
type EvaluationCase = {
  targetStayDate: string;
  asOfDate: string;
  segment: "all" | "transient" | "group";
  observedPrefix: CurveObservation[];
  actualFinalRooms: number | null;
};
```

評価 output は、少なくとも次を持つ。

```ts
type EvaluationResult = {
  modelId: string;
  modelVersion: string;
  caseCount: number;
  metrics: {
    maeRooms?: number;
    smape?: number;
    biasRooms?: number;
  };
  warnings: string[];
};
```

評価では、未来情報を入力へ混ぜない。`as_of_date` 時点で未観測の points、未来の final rooms、未来の rank 変更履歴、未来の競合価格は特徴量として使わない。

## Implementation Order

1. canonical input と output の型を実装する。
2. Revenue Assistant response から canonical input へ変換する adapter を実装する。
3. `recent_weighted_90` を純粋関数として実装する。
4. `seasonal_component` を純粋関数として実装する。
5. diagnostics を表示側と cache 側で使える形にする。
6. IndexedDB cache と request scheduler へ接続する。
7. Analyze UI shell へ接続する。
8. 予測モデル候補を task 化するか判断する。
9. 予測評価 dataset と metric を task 化するか判断する。

## References

- Analyze 画面への接続仕様: `docs/spec_001_analyze_expansion.md`
- 判断原則: `docs/context/INTENT.md`
- 判断記録: `docs/context/DECISIONS.md`
- 実行順: `docs/tasks_backlog.md`
