# spec_003_rank_recommendation_signal

## Purpose

この仕様は、Revenue Assistant のトップ画面と Analyze 画面に、料金調整候補を `stayDate x roomGroup` 単位で提示するための外部挙動、入力、判定単位、状態管理、UI 契約、未確認論点を定義する。

最初の目的は、自動価格変更ではなく、RM（Revenue Manager）が今日確認すべき作業キューを作ることである。

この仕様で扱う recommendation は、「この価格が正しい」と断定するものではない。利用者に対して、次のような判断支援を行う。

- 今日見るべき候補はどの日付と部屋タイプか。
- この部屋タイプは 1 段階上げを検討する候補か、下げを注意して見る候補か、監視に留める候補か。
- 候補になった根拠は、個人 pace、残室、reference curve からの差分、過去の rank 変更反応、直近 rank 変更の有無、競合価格 snapshot、売上または ADR の状態のどれか。
- 判定に使えるデータが足りない場合、何が不足しているため `判定対象外` または低 confidence なのか。

first phase では、推奨レート金額を出さない。Revenue Assistant の実操作単位に合わせ、`ランク方向` または将来取得できる場合の `推奨ランク` を中心に扱う。

## Ownership And Update Trigger

所有者:

- Revenue Assistant userscript の top / analyze 画面における料金調整候補表示。
- `docs/spec_001_analyze_expansion.md` の Analyze booking curve、rank marker、競合価格 snapshot、warm cache と接続する feature line。
- `docs/spec_002_curve_core.md` の reference curve、forecast extension、evaluation extension を、料金調整候補の根拠として使う後続 feature line。

更新トリガー:

- 料金調整候補の表示単位、UI 表示位置、user decision、lifecycle が変わるとき。
- 推奨方向、推奨ランク、priority、confidence、reason code、reason fingerprint の入出力契約が変わるとき。
- Revenue Assistant から current rank、rank ladder、rank price table、rank 反映 API を取得できると確認したとき。
- `rank response`、sales / ADR、競合価格 snapshot、reference curve、forecast result のどれかを scoring に追加するとき。
- bulk apply を検討対象から実装対象へ進めるとき。

## Product Intent / Background

RAU の主線は、独立した本格 RMS（Revenue Management System）を先に作ることではなく、Revenue Assistant 画面上でレート調整判断を軽くすることである。Analyze 日付ページでは、booking curve、部屋タイプ別 card、全体 / 個人 / 団体、reference curve、rank marker、競合価格 snapshot、warm cache が段階的に入っている。次の価値は、トップ画面で「どの宿泊日と部屋タイプから見るべきか」を一覧化し、Analyze 画面で詳細根拠を確認できるようにすることである。

推奨レート金額を出すには、少なくとも次の情報が必要になる。

- プラン別料金。
- 人数別料金。
- 食事条件別料金。
- 現在販売中価格。
- rank ladder と各 rank の上下関係。
- rank 別、日付別、部屋タイプ別の価格表。
- 競合価格の現在値と過去 snapshot。
- 施設ごとの価格方針、最低価格、上限、販売停止、在庫制約。

これらが揃わない段階で金額を出すと、利用者は「RAU が提示した金額が正しい」と受け取りやすい。金額推奨は責任が大きく、間違った場合の影響も大きい。一方で、Revenue Assistant の実操作が販売 rank の変更中心であるなら、first phase の recommendation は `維持`、`1段階上げ検討`、`1段階下げ検討`、`監視`、`判定対象外` のような離散判断として扱うほうが自然である。

トップカレンダーの badge だけでは、RM が「何から作業するか」を決めにくい。日付セル内の表示は、その日付に何らかの状態があることを示すには向いているが、複数日、複数部屋タイプを比較して優先順に並べるには向いていない。トップ画面に料金調整候補リストを追加し、優先度の高い `stayDate x roomGroup` から並べることで、RM の作業順に直結させる。

Analyze は詳細確認の場として扱う。トップ画面では候補一覧と根拠要約を出し、Analyze では booking curve、全体 / 個人 / 団体、reference curve、rank 履歴、競合価格、sales / ADR などの詳細根拠を見る。リスト行から Analyze へ遷移できるようにし、将来的には対象 roomGroup card を開く、対象位置へ scroll する、対象 card を highlight する。

全体 rooms の上振れだけを根拠に個人価格 rank を上げると、団体による押し上げを個人需要の上振れとして誤読する可能性がある。したがって `all` だけではなく、`transient` と `group` を分ける。`all` が基準より多くても `group` が主因なら、個人価格 rank の上げ検討は抑制する。`transient` または個人需要の推定が基準より多いかを重視する。

極小キャパの部屋タイプでは、1 室の変動が稼働率や pace deviation に与える影響が大きい。通常 threshold をそのまま適用すると、1 室の変化で頻繁に候補化される。first phase では、capacity、remaining rooms、観測点数、reference curve 欠損を使い、`eligibility`、`confidence`、`判定対象外` を持たせる。

利用者が「見たが今は触らない」と判断した候補を出し続けると、候補リストが作業キューではなくノイズになる。そのため、user snooze と様子見 cooldown を持つ。様子見は false positive ではない。人間が「今はタイミングではない」と判断したログである。一方、対応不要は「この reasonFingerprint では候補として扱わなくてよい」という false positive 候補としてモデル改善に使える。両者を同じ dismiss として扱わない。

将来の一括反映には、active recommendation だけではなく、user decision、cooldown、resolved、dismissed の状態管理が必要になる。first phase で一括反映を入れない理由は、UI 操作の実装量だけではない。rank ladder、current rank、反映 endpoint、反映直前再検証、部分失敗時の記録、user decision の尊重、small capacity や group-driven の除外など、誤反映を避けるための guardrail が揃っていないためである。

### Rationale That Must Survive Thread Migration

この section は、後続セッションが元の会話を読めない前提で、主要判断の理由を復元するために置く。実装 task ではこの section の意図を崩さない。

1. 推奨レート金額ではなく推奨ランク方向を優先する理由。
   Revenue Assistant の実操作は、販売 rank の変更を中心に行う可能性が高い。first wave では、操作単位に合う `上げ検討`、`下げ注意`、`監視`、`判定対象外` を出すほうが、未確認データを使った金額提示より安全である。推奨レート金額を出すには、プラン、人数、食事条件、販売中価格、競合価格、rank ladder、rank 別価格表、施設方針を合わせて確認する必要がある。これらが揃わない状態で金額を出すと、RAU が価格を断定したように見える。現在 rank と rank ladder が取得できると確認できた場合は、`推奨ランク方向` から `1段階上げ検討` や `1段階下げ検討` のような隣接 rank recommendation へ進める。実価格または rank price table が取れるまでは、厳密な価格弾力性ではなく `ランク反応度` として扱う。

2. トップ画面にリストを置く理由。
   カレンダー badge は、日付セルに何らかの状態があることを示す補助表示には向いている。一方で、RM にとって価値があるのは「どの日付に印があるか」だけではなく、「今日どの宿泊日と部屋タイプから見るべきか」である。候補リストは、RM の作業キューとして、priority の高い `stayDate × roomGroup` を上から並べる。実装や ASCII 文脈では同じ単位を `stayDate x roomGroup` と表記する場合がある。日付単位だけでは、同じ日付のどの部屋タイプを触るべきか分からないため、候補単位は `stayDate × roomGroup` を原則にする。トップリストは作業開始地点であり、Analyze は根拠確認の場である。

3. 様子見 cooldown が必要な理由。
   利用者が候補を見たうえで「今は触らない」と判断したものが出続けると、recommendation list は作業キューではなくノイズになる。`様子見` は false positive ではなく、人間が「今はタイミングではない」と判断したログである。`対応不要` は false positive 候補であり、同じ根拠を再表示しないための model 改善 input である。したがって `snoozed_by_user` と `dismissed_by_user` は別状態にする。様子見中でも、priority、confidence、個人需要 pickup、残室率、競合価格、主因、reasonFingerprint が大きく変われば再表示できるようにする。reasonFingerprint は、同じ根拠の繰り返し通知と、新しい根拠による再通知を分けるために持つ。

4. sales / ADR 保存を進める理由。
   rooms だけを見ると、値下げ後に pickup が増えたが ADR が落ちて売上や RevPAR 相当が悪化したケースを、良い反応として誤解する可能性がある。rank response の評価では、rooms だけでなく ADR、sales、RevPAR 相当、net pickup を合わせて見る必要がある。sales / ADR は将来の単価予測と売上予測にも使える。正本上は `/api/v4/booking_curve` response に sales / ADR が含まれることを確認済みである。`RAU-RR-02` では、保存前 compact の保持対象を rooms / sales / ADR fields へ拡張し、後続 task が rank response、単価予測、売上予測の入力証跡として使える状態にした。

5. 一括反映を first phase に入れない理由。
   bulk apply には、rank 反映 API、rank ladder、current rank、反映直前の再取得、recommendation 生成後の別 rank change 確認、部分失敗時の記録、利用者の明示選択、対象除外 guardrail が必要である。精度が担保される前に bulk apply を入れると、誤った rank 変更をまとめて実行する危険がある。ただし、将来の user-confirmed bulk apply を見据え、first phase から recommendation lifecycle と user decision は保存できる設計にする。将来実装する場合も、自動反映ではなく user-confirmed bulk apply を前提にする。

6. 団体と個人を分離する理由。
   `all` が基準より多くても、`group` が主因なら、個人向け販売 rank を上げる根拠としては弱い。団体起因の全体上振れを個人需要の上振れとして扱うと、個人価格 rank を上げる判断を誤る。scoring では `transient` と `group` を分け、個人需要の寄与を確認する。団体起因の候補は、`監視` に留めるか、confidence を下げる。

7. 小キャパを別扱いする理由。
   極小キャパの roomGroup では、1 室の増減だけで稼働率や pace deviation が大きく動く。通常 threshold をそのまま使うと、実務上の優先候補ではないものが頻繁に出る。small capacity は `判定対象外`、または低 confidence として扱う。判定不能やデータ不足は、何も出さずに消すのではなく、diagnostics と reason code に残す。これにより、後続で threshold を調整するときに、なぜ候補化しなかったのかを確認できる。

8. Forecast との関係。
   rank recommendation は forecast そのものではなく、RM 作業キューである。forecast が使えるようになると priority と confidence の精度は上がるが、first wave は reference curve deviation と既存 booking curve で始められる。`RAU-FC-01` の結論は、今すぐ forecast model を実装して scoring に接続するのではなく、`RAU-FC-02` で evaluation dataset、metrics、`ForecastResult v1 candidate` を先に設計することである。forecast を使う場合も、評価済みで diagnostics が許容できると判断した後に priority / confidence の補助要素として接続する。rank recommendation は UI、lifecycle、user decision、rank response、future bulk apply 設計まで含むため、forecast bundle とは独立して扱う。

## Scope

### First Phase

first phase では次を行う。

- トップ画面に料金調整候補リストを出す。
- 候補単位は原則 `stayDate x roomGroup` とする。
- 候補には、優先度、宿泊日、部屋タイプ、現ランク、推奨方向、根拠、状態、Analyze 導線を出す。
- 推奨方向の初期表現は、断定度の高い金額推奨ではなく、`raise_watch`、`lower_watch`、`watch`、`not_eligible` のような確認候補として扱う。
- UI 表示名は日本語とし、初期候補は `上げ検討`、`下げ注意`、`監視`、`判定対象外` とする。
- 推奨ランク名の表示は、rank ladder と current rank の取得可否が確認できてから追加する。
- 既存 warm cache marker、団体室数表示、最終変更表示、競合価格 indicator と意味を混同しない表示 layer にする。
- リストから該当日程の Analyze を開けるようにする。
- rank change history による resolved 化は後続で含めるが、first UI shell では `active`、`snoozed_by_user`、`dismissed_by_user` の保存を優先する。

### Non-goals For First Phase

first phase では次を行わない。

- 推奨レート金額を出さない。
- Revenue Assistant への自動反映を行わない。
- 選択範囲の一括反映を行わない。
- PMS、DWH、人数 forecast を必須入力にしない。
- Revenue Assistant 外の外部保存先を必須にしない。
- 未確認 API を確認済みとして扱わない。
- `価格弾力性` という名前を厳密な意味で使わない。実価格変化率が取れない段階では、`ランク反応度` または `rank response` と呼ぶ。

## Data Sources

### Confirmed / Existing

`/api/v4/booking_curve`

- rooms 系列の主要取得元である。
- response には sales / ADR も含まれることが過去調査で確認されている。
- 保存単位は、facility、stayDate、asOfDate、scope、roomGroup、endpoint、query、schema version を持つ raw source とする。
- `RAU-RR-02` では、`src/main.ts` の `compactBookingCurveResponse()` の保持対象を rooms / sales / ADR fields へ拡張し、保存 schema version を `booking_curve_raw_source:v2` へ上げた。保存する raw source は Revenue Assistant response 全文ではなく、RAU が扱う fields と key 情報を保持する compact source である。
- 既存 `booking_curve_raw_source:v1` record は同じ IndexedDB に残るが、v2 の cache key では読まれない。v2 record は次回 API 取得時に作られる。IndexedDB object store と index 構造は変えないため、IndexedDB database version は据え置く。

`/api/v3/lincoln/suggest/status`

- `rm_room_group_id`。
- `rm_room_group_name`。
- `accepted_at`。
- `completed_at`。
- `before_price_rank_name`。
- `after_price_rank_name`。
- `reflector_name`。
- rank change history、resolved 判定、過去 rank response 評価に使う。

`/api/v1/booking_curve/rm_room_groups`

- roomGroup 一覧を取得する。

`/api/v1/suggest/output/current_settings`

- 現状では、部屋タイプ別 capacity、remaining、max の取得に使われている。
- 2026-05-28 の Chrome DevTools Protocol read-only 調査で、`suggest_output_current_settings[].rm_room_groups[].latest_current.price_rank_code` と `latest_current.price_rank_name` が取得できることを確認した。これにより、`stayDate x roomGroup` 単位の current rank はこの endpoint を第一候補にできる。
- 同じ response で `remaining_num_room` と `max_num_room` も取得できる。
- 同じ observation では、`without_meal`、`with_only_breakfast`、`with_only_dinner`、`with_breakfast_and_dinner` は null だった。したがって、プラン別、人数別、食事条件別の価格や rank 関係は、この確認だけでは取得済みとして扱わない。

`/api/v1/rank_sequences`

- 2026-05-28 の Chrome DevTools Protocol read-only 調査で取得できることを確認した。
- response は `rank_sequences[]` を持ち、各要素に `price_rank_code`、`price_rank_name`、`default_sequence` が含まれる。
- rank ladder の候補として使える。ただし、`default_sequence` の大小が Revenue Assistant UI 上の rank 上げ / 下げとどの方向に対応するかは、画面操作または既存履歴との照合で別途確認する。方向が未確認の間は、UI は `recommendedRank` 名を断定せず、`recommendedRankDirection` を第一表示にする。

`/api/v1/rank_colors`

- 2026-05-28 の Chrome DevTools Protocol read-only 調査で取得できることを確認した。
- response は `rank_colors[]` を持ち、各要素に `price_rank_code`、`price_rank_name`、`color_no` が含まれる。
- rank 名や表示色の補助に使える。rank の上下関係や価格差を、この endpoint だけから判断しない。

`/api/v1/plan_master/plan_rank_price`

- 2026-05-28 の Chrome DevTools Protocol read-only 調査で、`from=YYYYMMDD` 形式の query では 200 応答を確認した。`from=YYYY-MM-DD` 形式は 400 応答だった。
- response は `plan_rank_prices[]` を持ち、観測 field は `price_rank_code`、`price_rank_name`、`from`、`effective_date`、`manual_from`、`manual_effective_date`、`invalid` だった。
- 観測範囲では実価格または金額 field は確認できなかった。したがって、rank price table、現在販売中価格、プラン別・人数別・食事条件別価格は引き続き未確認である。

`/api/v1/lincoln/suggest/reflection_allow`

- 2026-05-28 の Chrome DevTools Protocol read-only 調査で、`suggest_calc_datetime` を付けると 200 応答を返し、`is_allowed` が取得できることを確認した。
- これは rank 反映の許可状態を示す候補であり、一括反映や自動反映の安全性を証明するものではない。request shape、対象行の指定方法、競合更新時の挙動、部分失敗、権限差、error response は未確認である。

JavaScript bundle から見つかった write endpoint 候補

- 2026-05-28 の Chrome DevTools Protocol 調査で、bundle 内に `POST /api/v1/lincoln/price_ranks`、`POST /api/v1/neppan/price_ranks`、`POST /api/v1/tema/price_ranks`、`POST /api/v1/lincoln/suggest`、`POST /api/v3/lincoln/suggest/status` などの候補文字列を確認した。
- これらの write endpoint は実行していない。request body、CSRF、権限、provider 差、対象日付範囲、partial failure、同時更新、rollback、Revenue Assistant 標準 UI との競合条件は未確認である。
- first phase ではこれらの write endpoint を呼ばない。`RAU-RR-11` では feasibility と guardrail を調査し、実行は別判断にする。

### Unconfirmed / Investigation Tasks

次は確認済み仕様として扱わず、browser-trace / browser-to-api 調査 task にする。

- `rank_sequences[].default_sequence` の大小が rank 上げ / 下げのどちらに対応するか。
- rank 別、日付別、部屋タイプ別価格表の取得可否。
- Revenue Assistant への rank 反映 API の request shape、安全制約、権限差、error response、partial failure、同時更新時の挙動。
- 現在販売中価格の全体像が取れるか。
- プラン別、人数別、食事条件別の価格と rank の関係が取れるか。

## Recommendation Unit

Recommendation の最小単位は `facilityId x stayDate x asOfDate x roomGroupId` とする。UI 上の主単位は `stayDate x roomGroup` だが、保存上は施設と asOfDate を含める。

候補 record は少なくとも次を持つ。

- `facilityId`
- `stayDate`
- `asOfDate`
- `roomGroupId`
- `roomGroupName`
- `currentRank`
- `recommendedRank` or `recommendedRankDirection`
- `action`
- `priority`
- `confidence`
- `reasonCodes`
- `reasonFingerprint`
- `diagnostics`
- `status`
- `generatedAt`
- `expiresAt`
- `cooldownUntil`
- `snoozedUntilAsOfDate` or `snoozedUntil`
- `resolvedAt`

初期 type 案:

```ts
type RankRecommendationAction =
  | "raise_one"
  | "lower_one"
  | "keep"
  | "watch"
  | "not_eligible";

type RankRecommendationStatus =
  | "active"
  | "snoozed_by_user"
  | "dismissed_by_user"
  | "resolved_by_rank_change"
  | "expired"
  | "suppressed_by_cooldown";

type RankRecommendationPriority = "high" | "medium" | "low";
```

初期 UI では、`raise_one` と `lower_one` をそのまま命令として見せない。表示名は `上げ検討`、`下げ注意` のように、利用者が Analyze で確認して判断する前提の文言にする。

## User Decisions

first phase の UI は、最低限次の user decision を持つ。

`Analyzeで確認`

- その候補の詳細確認へ進む。
- 初期実装では該当 stayDate の Analyze を開く。
- 後続では、sessionStorage などで pending focus を保持し、対象 roomGroup card を開く、scroll する、highlight する。

`様子見`

- 一時抑制を表す。
- 内部状態は `snoozed_by_user` とする。
- 通常の rank 変更後 cooldown とは別に扱う。
- 一定期間、または条件変化まで active list に再表示しない。

`対応不要`

- より強い抑制を表す。
- 内部状態は `dismissed_by_user` とする。
- 同じ `stayDate x roomGroup x action x reasonFingerprint` では基本的に再表示しない。
- false positive 候補として保存し、後続の scoring 改善に使う。

### User Snooze / 様子見 Cooldown

様子見 cooldown は、rank 変更後 cooldown とは別の user decision lifecycle として扱う。

- LT 帯によって既定期間を変える。
- できれば `最終データ更新` または `asOfDate` 基準で管理する。
- UI は最初から複雑にしない。初期 UI は `様子見` button だけでもよい。
- 内部では、LT に応じた default cooldown を設定する。

再表示条件:

- cooldown が終了した。
- priority が上がった。
- confidence が一定以上上がった。
- 個人需要 pickup が大きく増えた。
- 残室率が閾値を下回った。
- 競合価格が大きく変化した。
- 候補の主因が団体起因から個人起因へ変わった。
- reasonFingerprint が変わった。

### Dismiss / 対応不要

対応不要は、一時的な様子見ではなく、同じ根拠での再表示を抑制する user decision として扱う。

- 同じ `stayDate x roomGroup x action x reasonFingerprint` は抑制する。
- 方向、主要根拠、または reasonFingerprint が大きく変わった場合は、再表示候補にできる。
- 対応不要の履歴は、future scoring で false positive として使えるように残す。

## Priority / Scoring

初期 scoring は別 task で実装する。仕様上の考え方は次の通りとする。

```text
priorityScore =
  demand pace deviation
+ final occupancy expectation
+ capacity / remaining-room urgency
+ LT urgency
+ transient contribution
+ ADR / sales health
+ competitor price movement
+ historical rank response
- group-driven penalty
- small-capacity uncertainty
- recent rank-change cooldown
- data missing penalty
- historically poor rank-transition response
```

scoring では次を守る。

- `all` が基準より多くても、`group` が主因なら、個人価格 rank の上げ検討は抑制する。
- `transient` または個人需要推定が基準より多いかを重視する。UI 表示では `transient` を「個人」と呼ぶが、core / storage / spec の segment 名は `transient` を正とする。
- 小キャパの roomGroup は、`not_eligible` または低 confidence へ落とす。
- reference curve、forecast、capacity、current rank、rank ladder、競合価格 snapshot が欠損している場合は、推測で埋めず diagnostics に不足理由を出す。
- 直近に rank 変更がある場合は、同じ方向の recommendation を出し続けないよう cooldown を使う。
- 過去に反応が悪かった rank transition は、priority または confidence を下げる。

forecast の扱い:

- forecast は first wave の必須入力にしない。forecast が欠損しても、reference deviation、capacity、remaining rooms、`all` / `transient` / `group` 分解、直近 rank change、競合価格 snapshot、sales / ADR raw source で候補生成を継続する。
- `RAU-FC-02` で、`docs/spec_002_curve_core.md` の evaluation dataset と `ForecastResult v1 candidate` を proposed contract として確定した。forecast を scoring へ接続する場合は、この contract に従い、実データ評価後に priority / confidence の補助として使う。
- forecast を接続する場合は、`scope="roomGroup"`、`segment="transient"` を個人向け rank 判断の主入力候補にする。`segment="all"` は全体着地見込み、`segment="group"` は団体起因の抑制条件と diagnostics に使う。
- forecast 欠損時、reference curve 欠損時、sourceCount 不足時、capacity 不足時、`0日前` / `ACT` 分離制約がある場合は、推測で補完せず diagnostics に残す。
- `RAU-FC-05` では、`booking_curve_raw_source:v2` の roomGroup response に含まれる rooms 系列から `ForecastResult v1 candidate` を生成し、forecast signal を rank recommendation の priority / confidence 補助へ接続する。
- `RAU-FC-05` の forecast 接続は、追加 API 取得を行わない。候補生成時に保存済み raw source の `transient` 系列を主入力にし、同じ response 内の `last_year_room_sum`、`two_years_ago_room_sum`、`three_years_ago_room_sum` から raw history reference を作る。raw history reference は、公式な BCL-tuned reference curve ではなく、top list scoring の補助 signal を作るための内部入力である。raw history reference の `ACT` は、同じ raw source 内で `0日前` の過去年平均が取れる場合だけ作る。`0日前` が取れない場合は final rooms を推測補完せず、forecast 欠損として diagnostics に残す。
- live の将来 stayDate では `actualFinalRooms` が未確定であるため、`actual_final_missing` は evaluation dataset 上の除外理由として残す。一方で、live scoring の forecast 生成では、`actual_final_missing` だけを blocking missing reason として扱わない。`observed_prefix_missing`、`future_info_required`、`room_group_id_missing`、`segment_unknown` など、入力として必要な条件を満たさない場合は引き続き forecast 欠損として diagnostics に残す。`act_not_separated` は live scoring では警告として diagnostics に残し、後続の評価や閾値調整で確認する。
- forecast signal は `high_occupancy`、`low_occupancy`、`neutral` の内部分類として扱う。top list には `predictedFinalRooms`、`expectedOccupancyRatio`、予測曲線などの数値を表示しない。主要根拠に出す場合も、`着地見込み高`、`着地見込み低` のような非数値の要約に留める。
- forecast signal は候補 action を単独で決めない。既存の reference deviation、capacity、remaining rooms、LT、`transient` / `group` 分解で決まった action に対して、priority と confidence を小さく補正する。forecast が欠損している場合は、既存の reference deviation scoring を継続する。
- `snoozed_by_user`、`dismissed_by_user`、`resolved_by_rank_change` は、初期評価では真の正解ラベルではなく evaluation proxy として扱う。`snoozed_by_user` は false positive ではなく一時判断ログである。

## Rank Response / Elasticity

厳密な価格弾力性は、価格変化率が取れないと算出できない。rank change history だけで最初に評価できるのは、`rank response` または `ランク反応度` である。

実価格、または rank price table が取得できるようになった場合、rank response を価格弾力性へ拡張できる。ただし first phase では、価格弾力性という用語を厳密な意味で使わない。

rank response の評価対象:

- rank transition: `beforeRank -> afterRank`
- roomGroup
- stayDate
- LT at change
- capacity
- current all / transient / group rooms
- sales / ADR
- competitor snapshot

結果指標:

- 変更後 1 日 pickup。
- 変更後 3 日 pickup。
- 変更後 7 日 pickup。
- final rooms。
- final occupancy。
- ADR。
- sales。
- RevPAR 相当。
- net pickup。

反実仮想の初期候補:

- 直近型 reference curve に対する変更後 pickup 差分。
- 季節型 reference curve に対する変更後 pickup 差分。
- 同曜日、同 LT、同 roomGroup、同 pace 帯で rank change がなかった近似日との比較。
- 変更前 pace trend からの外れ。

rank response dataset の first contract:

- grain: `facilityId x stayDate x roomGroupId x rankChangeEvent`。
- rank change event は `/api/v3/lincoln/suggest/status` の `date`、`rm_room_group_id`、`before_price_rank_name`、`after_price_rank_name`、`accepted_at`、`completed_at`、`reflector_name` を入力にする。
- rank change timestamp は、初期実装では `accepted_at ?? completed_at ?? suggest_calc_datetime` を使う。複数 event が同じ `stayDate x roomGroupId` にある場合は、event ごとに別 record とし、同一 window の重なりは diagnostics に残す。
- LT at change は `stayDate - rankChangeDate` で計算する。timestamp が日付化できない場合は `lt_missing` とする。
- booking curve input は `booking_curve_raw_source:v2` を第一候補にし、`all`、`transient`、`group` の rooms、sales、ADR を event 前後の asOfDate で読む。sales / ADR の field 解釈、0 室、売上 0、ADR null、API ADR と計算 ADR の優先順位は `docs/spec_002_curve_core.md` の Sales And ADR Extension に従う。
- result window は、変更後 1 日、3 日、7 日、ACT または最終観測日を候補にする。該当 asOfDate の raw source がない場合は、推測補完せず `post_window_missing` を出す。
- baseline は、直近型 reference curve、季節型 reference curve、同曜日・同 LT・同 roomGroup・同 pace 帯の非変更日、変更前 pace trend の順に候補とする。どの baseline を使ったかを `baselineKind` として残す。
- output は、`pickupRooms`、`transientPickupRooms`、`groupPickupRooms`、`adrChange`、`salesChange`、`revparLikeChange`、`netPickup`、`baselineDelta`、`diagnostics` を持つ。
- 実価格または rank price table が取れるまで、価格変化率や価格弾力性は出力しない。`rank response` は rank transition 後の需要、ADR、sales の反応を表す分析用 dataset とする。

推奨 rank 算出の first contract:

- current rank は `/api/v1/suggest/output/current_settings` の `latest_current.price_rank_code` / `price_rank_name` を第一候補にする。
- rank ladder は `/api/v1/rank_sequences` の `price_rank_code`、`price_rank_name`、`default_sequence` を候補にする。
- `default_sequence` の大小が Revenue Assistant UI の rank 上げ / 下げと対応する方向は未確認である。方向が確認されるまでは `recommendedRank` を出さず、`recommendedRankDirection` と UI 表示名 `上げ検討` / `下げ注意` / `監視` / `判定対象外` を出す。
- 方向確認後も、first wave の recommendedRank は隣接 rank のみに限定する。2 段階以上の rank 移動、価格差最大化、売上最大化 rank の直接提示は行わない。
- current rank が欠損する場合、rank ladder に current rank code が存在しない場合、または ladder の方向が未確認の場合は、`recommendedRank` を null にし、`recommendedRankDirection` のみを表示する。
- rank price table または実販売価格が取れるまで、recommendedRank から推奨レート金額を導出しない。

## UI Contract

### Top

トップ画面には、料金調整候補リストを追加する。

- 日付 x 部屋タイプ単位の候補を優先度順に表示する。
- 最大件数は初期値を持つ。初期候補は top 10 とする。
- top 10 の外にも候補がある場合は、件数だけでも分かる表示を候補にする。

行項目:

- 優先度。
- 宿泊日。
- 部屋タイプ。
- 現ランク。
- 推奨方向または推奨ランク方向。
- 主要根拠。
- 状態。
- `Analyzeで確認`。
- `様子見`。
- `対応不要`。

first wave の top list では forecast 数値を直接表示しない。forecast が評価後に scoring 補助として使われる場合でも、top list では priority、confidence、主要根拠、diagnostics に反映する。`予測最終室数` のような数値を top list に出すと、利用者が current、reference curve、forecast、推奨ランク方向を混同しやすいためである。

トップカレンダー badge は optional とする。入れる場合でも、warm cache marker、保存済み raw source signal、団体室数表示、最終変更表示と意味を混同しない。候補リストを作業順の主導線とし、badge は補助表示に留める。

### Analyze

Analyze 画面では、該当日付の候補一覧と部屋タイプ別 signal detail を表示する。

- 該当 stayDate の候補一覧を表示する。
- 部屋タイプ別 card に signal detail を出す。
- トップのリストから遷移した場合、sessionStorage などで pending focus を保持する。
- 後続 task で、対象 roomGroup card を開く、scroll する、highlight する。
- rank change が発生したら `resolved_by_rank_change` として active list から外す。ただし履歴は削除しない。

forecast 実装前は、Analyze detail に forecast 数値を表示しない。評価後に表示する場合も、最初は Analyze detail の diagnostics として扱い、top list への簡易表示とは別 task で判断する。表示する場合は、current、reference curve、forecast の入力、処理、出力を区別できる label と missing diagnostics を持たせる。

## Lifecycle

status は次を持つ。

- `active`
- `snoozed_by_user`
- `dismissed_by_user`
- `resolved_by_rank_change`
- `expired`
- `suppressed_by_cooldown`

消込規則:

- 同じ `stayDate x roomGroup` で、recommendation `generatedAt` より後の rank change が確認されたら `resolved_by_rank_change` にする。
- 完全削除ではなく状態更新にする。
- future scoring と精度評価に使うため、`active -> user decision -> resolved / expired` の履歴を残す。
- `expiresAt` は、stayDate が過ぎた、asOfDate が古くなった、または reasonFingerprint の前提が変わった場合に使う。

## Future Bulk Apply

bulk apply は将来候補として残すが、first phase では非目標とする。

2026-05-28 時点の feasibility:

- current rank は `/api/v1/suggest/output/current_settings` から取得候補を確認済みである。
- rank ladder 候補は `/api/v1/rank_sequences` から取得候補を確認済みである。
- 反映許可候補は `/api/v1/lincoln/suggest/reflection_allow?suggest_calc_datetime=...` の `is_allowed` として確認済みである。
- write endpoint 候補は JavaScript bundle 内で確認したが、実行していない。request shape、必要 header、CSRF、provider 差、権限差、partial failure、同時更新、rollback、標準 UI との競合条件は未確認である。
- rank price table と現在販売中価格は未確認である。
- user decision、cooldown、dismissed、resolved の browser-local lifecycle は first phase の候補リスト用に実装済みである。ただし、bulk apply 用の preview、選択状態、反映結果保存、部分失敗保存は未実装である。
- 以上により、`RAU-RR-11` の結論は `not-now` とする。bulk apply は future candidate のまま残すが、first phase では button も API 実行も追加しない。

検討できる条件:

- recommendation の精度が実データで確認されている。
- current rank が取得できる。
- rank ladder と隣接 rank が取得できる。
- rank 反映 endpoint と request shape が確認されている。
- Revenue Assistant 側の安全制約と権限範囲が確認されている。
- user decision、cooldown、resolved、dismissed の状態管理が実装されている。

必須 guardrail:

- 反映直前に current rank を再取得する。
- recommendation `generatedAt` 以降に別 rank change がないか確認する。
- `snoozed_by_user`、`dismissed_by_user`、cooldown 中、low confidence、small capacity、group-driven の候補は一括対象から外す。
- 推奨は隣接 rank のみに限定する。
- 全件 preview を出す。
- 利用者が明示選択した行だけ反映する。
- 部分失敗時の結果を保存する。
- 自動反映ではなく、user-confirmed bulk apply とする。

## Implementation Order Candidate

実装順序の候補は次の通りとする。正本上の Task ID と詳細は `docs/tasks_backlog.md` を参照する。

1. `RAU-RR-01` で、この仕様と関連 docs を整備する。
2. `RAU-RR-02` で、booking_curve raw source に sales / ADR を落とさず保存する契約を決めて実装する。
3. `RAU-RR-03` で、current rank、rank ladder、rank price table、rank 反映 API の取得可否を browser trace で調査する。
4. `RAU-RR-04` で、トップ料金調整候補リスト UI shell を実装する。
5. `RAU-RR-05` で、reference deviation ベースの初期 priority scoring を実装する。
6. `RAU-RR-06` で、Analyze 遷移と対象 roomGroup focus 導線を実装する。
7. `RAU-RR-07` で、user snooze、dismissed decision、cooldown を保存する。
8. `RAU-RR-08` で、rank change history による resolved 化を実装する。
9. `RAU-RR-09` で、rank response dataset と metrics を設計する。
10. `RAU-RR-10` で、推奨 rank 算出を設計する。
11. `RAU-RR-11` で、bulk apply feasibility を調査する。

## Open Questions

1. `rank_sequences[].default_sequence` の大小は、Revenue Assistant UI 上の rank 上げ / 下げのどちらに対応するか。
2. rank 別、日付別、roomGroup 別の price table は取得できるか。
3. Revenue Assistant への rank 反映 API 候補は存在するが、request shape、権限、CSRF、同時編集時の挙動、安全制約、partial failure は何か。
4. `reflection_allow.is_allowed` が false のとき、標準 UI と API はどのように反映を止めるか。
5. 現在販売中価格の全体像は取得できるか。
6. プラン別、人数別、食事条件別の価格と rank の関係は取得できるか。
7. 小キャパの eligibility threshold は何室以下、または残室率何%以下を初期値にするか。
8. 様子見 cooldown の LT 帯別 default duration をどう設定するか。
9. reasonFingerprint に含める reasonCodes、threshold、data version、scoring version の境界をどう切るか。
10. 競合価格 snapshot のどの変化量を `competitor price movement` として扱うか。
11. sales / ADR diagnostics を priority / confidence または reasonCodes に接続する場合、どの変化量と閾値を初期値にするか。
12. `RAU-FC-03` の実データ評価で、forecast diagnostics を priority / confidence に接続できるだけの安定性があるか。

## References

- Overview: `docs/spec_000_overview.md`
- Analyze 画面仕様: `docs/spec_001_analyze_expansion.md`
- Booking curve core logic: `docs/spec_002_curve_core.md`
- 判断原則: `docs/context/INTENT.md`
- 判断記録: `docs/context/DECISIONS.md`
- 現在地: `docs/context/STATUS.md`
- 実行順: `docs/tasks_backlog.md`
