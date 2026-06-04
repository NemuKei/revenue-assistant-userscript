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
- 2026-05-28 の追加確認では、Revenue Assistant の配信 JavaScript が `defaultSequence` を「名前順に並べ替える」初期順として扱い、設定保存時は並び替え済みの `priceRankCode` 配列を送信していた。そのため、RAU は `default_sequence` を rank 上げ / 下げの方向として使わない。
- 2026-05-28 の `RAU-RR-16` 追加確認では、設定画面 `設定 > 表示 > 料金ランクの並び順` の route が `/settings/price-rank-sequence` であり、この画面が `GET /api/v1/rank_sequences` の配列順をそのままドラッグリストへ表示することを確認した。保存時は `POST /api/v1/rank_sequences` へ並び替え後の `priceRankCode` 配列を送る。したがって RAU は、manual override がない場合、`rank_sequences[]` の配列順を Revenue Assistant 設定画面の保存済み rank 並び順として扱う。
- 大国町では、設定画面 `料金ランクの並び順` が高ランクから低ランクの順に `1` から `20` へ並んでいる。RAU はこの保存済み順序を source `settings_screen` として優先し、`1` を最高ランク、`20` を最低ランクとして扱う。
- rank 名は企業や施設により、数字系、ローマ字または英字系、記号混在系のいずれもあり得る。同じ数字系や文字系でも、`1` や `A` が最高ランクになる運用と、最低ランクになる運用の両方があり得る。名前パターンだけでは上下関係を安全に断定できないため、数字、ローマ字、英字、記号の推定ロジックを積み増して確認済み source と同等に扱わない。
- カレンダーベースの曜日別関係や、競合価格内での自社料金位置は、rank order source として上下関係を確定する入力にはしない。これらは、rank order が `settings_screen` または `manual_override` で確定している前提で、候補の priority、confidence、reasonCodes、diagnostics を補助する入力候補として扱う。
- 今後、rank order の推定ロジックを追加する場合でも、推定結果は既定値または fallback として扱う。利用者が方向または上下関係を任意変更できる入口を維持し、推定値を確認済みの施設設定または利用者指定より優先しない。
- 設定画面の保存済み順序が取得できない場合に限り、rank 名がすべて整数として読めるなら、RAU は rank 名の数値昇順を高ランクから低ランクへの fallback 順序として推定する。この fallback は、設定画面順序や manual override と同じ確定 source ではなく、source `numeric_rank_name` として UI と diagnostics に明示する。
- `raise_watch` の隣接 recommended rank は、高ランクから低ランクへの順序上で current rank の 1 つ高い rank とする。`lower_watch` の隣接 recommended rank は、同じ順序上で current rank の 1 つ低い rank とする。
- rank order source は `numeric_rank_name`、`settings_screen`、`manual_override`、`unresolved` のいずれかとして扱う。source 優先順位は、利用者が browser-local に保存した `manual_override`、Revenue Assistant 設定画面の保存済み順序である `settings_screen`、設定順序が使えない場合の fallback である `numeric_rank_name`、解決不能の `unresolved` とする。
- rank 名が数値として読めない場合、または施設ごとの上下関係を推定できない場合は、recommended rank を出さず、原因を diagnostics に残す。
- 利用者が manual override を保存した場合は、browser-local の保存値を `manual_override` source として使い、recommended rank を保存後の順序で再計算する。manual override は Revenue Assistant の rank 設定を書き換えない。
- 2026-05-28 の Chrome DevTools Protocol read-only 初回確認では、root 画面から `/settings/site-controller` link を確認し、同 path の fetch は 200 を返したが、rank の全貌や rank order payload は確認できなかった。`RAU-RR-16` で `/settings/price-rank-sequence` と `GET /api/v1/rank_sequences` の関係を追加確認したため、settings screen source は確認済み source として扱う。
- current rank が rank ladder に存在しない場合、rank order を推定できない場合、または current rank が推定順序の端で隣接 rank が存在しない場合は、`recommendedRank` を null にする。
- current rank が推定順序の端にあり、`raise_watch` または `lower_watch` の隣接 rank が存在しない場合、top list の推奨方向には `上限ランク: 上げ余地なし` または `下限ランク: 下げ余地なし` を表示する。これは推奨レート金額や 2 段階以上の rank 移動を出すものではなく、隣接 rank がない理由を利用者に見せるための表示である。

`/api/v1/rank_colors`

- 2026-05-28 の Chrome DevTools Protocol read-only 調査で取得できることを確認した。
- response は `rank_colors[]` を持ち、各要素に `price_rank_code`、`price_rank_name`、`color_no` が含まれる。
- rank 名や表示色の補助に使える。rank の上下関係や価格差を、この endpoint だけから判断しない。

`/api/v1/plan_master/plan_rank_price`

- 2026-05-28 の Chrome DevTools Protocol read-only 調査で、`from=YYYYMMDD` 形式の query では 200 応答を確認した。`from=YYYY-MM-DD` 形式は 400 応答だった。
- response は `plan_rank_prices[]` を持ち、観測 field は `price_rank_code`、`price_rank_name`、`from`、`effective_date`、`manual_from`、`manual_effective_date`、`invalid` だった。
- 2026-05-28 の `RAU-RR-36` 追加確認では、`from=20260501`、`from=20260528`、`from=20260529`、`from=20260501&to=20260531` のいずれも 200 応答で、`plan_rank_prices[]` は 20 件だった。観測 field は前回と同じであり、実価格、金額、人数、食事条件、roomGroup、plan 別価格 field は確認できなかった。
- 同じ追加確認で、Revenue Assistant 配信 JavaScript 内の `plan_rank_price` 呼び出しは `from` parameter を送る実装だった。`current_settings` の `latest_current` は current rank と capacity / remaining には使えるが、観測範囲では `without_meal`、`with_only_breakfast`、`with_only_dinner`、`with_breakfast_and_dinner` が null であり、現在販売中価格の全体像には使えなかった。
- 観測範囲では実価格または金額 field は確認できなかった。したがって、rank price table、現在販売中価格、プラン別・人数別・食事条件別価格は引き続き未確認である。

`/api/v1/lincoln/suggest/reflection_allow`

- 2026-05-28 の Chrome DevTools Protocol read-only 調査で、`suggest_calc_datetime` を付けると 200 応答を返し、`is_allowed` が取得できることを確認した。
- これは rank 反映の許可状態を示す候補であり、一括反映や自動反映の安全性を証明するものではない。request shape、対象行の指定方法、競合更新時の挙動、部分失敗、権限差、error response は未確認である。

JavaScript bundle から見つかった write endpoint 候補

- 2026-05-28 の Chrome DevTools Protocol 調査で、bundle 内に `POST /api/v1/lincoln/price_ranks`、`POST /api/v1/neppan/price_ranks`、`POST /api/v1/tema/price_ranks`、`POST /api/v1/lincoln/suggest`、`POST /api/v3/lincoln/suggest/status` などの候補文字列を確認した。
- これらの write endpoint は実行していない。request body、CSRF、権限、provider 差、対象日付範囲、partial failure、同時更新、rollback、Revenue Assistant 標準 UI との競合条件は未確認である。
- first phase ではこれらの write endpoint を呼ばない。`RAU-RR-11` では feasibility と guardrail を調査し、実行は別判断にする。
- 2026-05-29 の `RAU-RR-48` read-only 追加確認では、標準画面の料金ランク一括反映が `POST v1/lincoln/price_ranks`、`POST v1/tema/price_ranks`、`POST v1/neppan/price_ranks` を site controller ごとに呼び分ける実装候補を確認した。Rakutsu はこの断片では `NotLinked` 扱いだった。
- 同確認で、送信候補 payload は標準画面の `targetSalesSettings` から作られる配列であり、各要素は少なくとも `date`、`rmRoomGroupId`、`priceRankCode` を持つ。現在設定に値がある場合だけ `limitedNumber`、`withoutMeal`、`withOnlyBreakfast`、`withOnlyDinner`、`withBreakfastAndDinner` を同梱する。送信前に key は decamelize されるため、wire format では snake_case になる可能性が高い。ただし実 POST を実行していないため、server が必須とする field、null 許容、空配列、日付範囲、複数 roomGroup 混在、provider 差は未確認である。
- 標準 UI には、modal 内の未反映 state、`最初からやり直す`、`閉じる` 時の確認 prompt、`続けて反映する` state、成功、一部失敗、失敗の通知種別がある。ただし、これは送信前の取り消しと送信後の結果表示に関する手掛かりであり、送信後に Revenue Assistant 側が一定時間の rollback または undo を提供することは確認していない。
- したがって、RAU から top list 直接 rank 変更を実装する場合でも、標準 UI と同じ write endpoint をすぐ呼ぶのではなく、少なくとも事前 preview、現在 rank 再取得、対象 `stayDate x roomGroup` の固定、隣接 rank 限定、送信前の取消可能な pending state、送信結果の成功 / 一部失敗 / 失敗記録、同時更新検知、実 POST の低リスク確認を別 task で満たす必要がある。

### Single-row Rank Change From Top List

2026-05-29 の `RAU-RR-51` では、利用者が実務上変更してよい対象として選んだ `2026-07-23 x キャンプ、ツインS` の rank 変更 `11 -> 10` を Revenue Assistant 標準 UI 経由で実行し、Chrome DevTools Protocol で通信を観測した。

この観測により、標準 UI で任意 rank を選ぶ手動操作は `カスタム販売設定する` から rank のプルダウンを選択する操作であり、観測済みの送信は次の形である。

- endpoint: `/api/v1/lincoln/suggest`
- HTTP method: `POST`
- success HTTP status: `204`
- observed request header names: `accept`、`content-type`、`referer`、`sec-ch-ua`、`sec-ch-ua-mobile`、`sec-ch-ua-platform`、`user-agent`、`x-requested-with`
- observed payload field names: `date`、`rm_room_group_id`、`price_rank_code`、`price_rank_name`
- response body: none
- completion observation: `/api/v3/lincoln/suggest/status` に `reflection_type = CUSTOM`、`before_price_rank_name = 11`、`after_price_rank_name = 10`、`accepted_at`、`completed_at` が反映された。
- current settings observation: `/api/v1/suggest/output/current_settings` の同じ `stayDate x roomGroup` に変更後 rank code / rank name が反映された。

docs へは raw trace、request body 全文、response body 全文、Cookie、token、顧客情報、価格や在庫の非公開データを保存しない。仕様に残すのは endpoint、method、status、header 名、payload field 名、反映確認先、成功 / 失敗分類だけである。

RAU が top list から単一行 rank 変更を実装する場合、対象は rank 変更だけに限定する。推奨金額、人数別価格、食事条件別価格、プラン別価格、販売停止、在庫、複数行選択、bulk apply、自動反映は対象外である。

RAU の単一行 rank 変更 proposal は少なくとも次を持つ。

- `facilityId`
- `stayDate`
- `asOfDate`
- `generatedAt`
- `roomGroupId`
- `roomGroupName`
- `currentRankCode`
- `currentRankName`
- `targetRankCode`
- `targetRankName`
- `reasonFingerprint`
- `confidenceLevel`
- `disabledReasons`

変更可能にしてよい条件は、次をすべて満たす場合に限る。

- candidate が `active` である。
- action が `raise_watch` または `lower_watch` である。
- current rank code と current rank name が取得済みである。
- recommended rank code と recommended rank name が存在し、隣接 rank 欠落理由がない。
- rank order source が `manual_override` または `settings_screen` である。
- confidence 表示段階が `高` または `中` である。
- diagnostics に `small_capacity`、`capacity_missing`、`group_driven_raise_suppressed` が含まれない。
- write adapter が観測済み provider / endpoint として `/api/v1/lincoln/suggest` を扱える。

UI は最初の `rank調整` 押下で inline preview を開く。preview には、対象宿泊日、roomGroup、現在 rank、変更後 rank、主要根拠、注意、送信不可理由を表示する。送信不可理由がある場合は `反映する` を disabled にし、POST を発生させない。

`反映する` 押下後は 5 秒の in-memory pending state に入り、`n秒後に送信` と `取消` を表示する。pending 中に reload、施設切替、batch 切替、script 再実行が起きた場合は送信しない。RAU の pending state は送信前取消であり、送信後 rollback または undo ではない。

`取消` は送信前 safety guard の一部であるため、`反映する` 押下後の pending 表示は候補 list 全体の再同期完了を待たず、押下直後に同じ行へ表示する。再同期が 5 秒以上かかった場合でも、利用者が送信前に取り消せる入口を失わないようにする。

送信直前には、exact `stayDate x roomGroup` の current settings と rank change status を再取得する。current rank が候補表示時から変わっていた場合、または同じ `stayDate x roomGroup` に候補生成後の rank change status がある場合は送信しない。

候補生成後の rank change status 判定には、`rank調整` preview が作られた候補の `generatedAt` を使う。`反映する` を押した時刻や 5 秒 pending を開始した時刻だけを基準にすると、候補表示から送信操作までの間に Revenue Assistant 標準 UI または別端末で行われた rank 変更を見逃すためである。

`/api/v1/lincoln/suggest/reflection_allow?suggest_calc_datetime=...` は read-only 調査で `is_allowed` を返す候補として確認済みである。ただし、2026-05-29 時点では単一行 custom rank 変更の標準 UI 操作でこの endpoint が送信直前 guard として使われること、また `suggest_calc_datetime` にどの値を入れるべきかは未確認である。したがって RAU は `suggest_calc_datetime` を推測して独自の `reflection_allow` guard を作らない。標準 UI の単一行 custom rank 変更で利用が確認できた場合だけ、送信直前 guard に追加する。

POST 成功後は、adapter の HTTP response だけで成功扱いにせず、可能な範囲で `/api/v3/lincoln/suggest/status` または fresh current settings により反映結果を再確認する。POST 成功後から反映確認が終わるまでは、同じ `facilityId x stayDate x roomGroupId` を `反映確認中` として扱い、同じ宿泊日と部屋タイプに対する追加の rank 変更送信を disabled にする。成功後は current settings cache と rank status cache を破棄し、再取得結果で row を更新する。

2026-05-29 の補完後実確認では、利用者が実務上反映してよい候補を RAU の top list `rank調整` 導線から操作し、`POST /api/v1/lincoln/suggest` が 1 回だけ発生し HTTP `204` を返した。POST 直前と直後に `/api/v1/suggest/output/current_settings` と `/api/v3/lincoln/suggest/status` が取得され、いずれも HTTP `200` だった。利用者は Revenue Assistant 画面上で実際に反映できていることを確認した。この確認中、`/api/v1/lincoln/suggest/reflection_allow` request は発生しなかった。

POST 失敗、送信前 guard 失敗、または送信後の反映確認失敗時は同じ row に要約を表示し、自動再送しない。browser-local に保存してよいのは HTTP status、失敗分類、発生時刻、対象を識別する最小 key だけである。raw response body、credential、非公開データは保存しない。

`RAU-RR-59` の write guard 棚卸しでは、現在の guard を次の段階へ分ける。

- 送信前 guard。candidate が active であること、action が `raise_watch` または `lower_watch` であること、current rank と target rank が取得済みであること、rank order source が `manual_override` または `settings_screen` であること、confidence 表示段階が `高` または `中` であること、送信不可 diagnostics がないこと、provider が観測済み `lincoln_custom_suggest` であることを確認する。さらに送信直前に exact `stayDate x roomGroup` の current settings と rank change status を再取得し、current rank mismatch または候補生成後の rank change を検出したら送信しない。
- 送信中 guard。5 秒 pending の満了後だけ POST を実行し、pending 中の reload、施設切替、batch 切替、script 再実行では送信しない。POST は 1 候補につき 1 回だけ実行し、自動 retry はしない。
- 送信後 guard。HTTP status だけで成功扱いにせず、可能な範囲で `/api/v3/lincoln/suggest/status` または fresh current settings を再取得する。POST 成功後から確認完了までは `反映確認中` を row に表示し、同じ `facilityId x stayDate x roomGroupId` の追加送信を block する。反映確認が取れない場合は `reflection_unconfirmed` として row に表示し、成功、未確認、失敗を混同しない。
- 反映未確認時。RAU は rollback または undo を実装済みとして扱わない。利用者には、送信は行われたが反映確認が取れていないこと、Revenue Assistant 標準画面で確認すべき対象日と roomGroup を表示する。
- 失敗時。HTTP status、失敗分類、発生時刻、対象識別 key だけを browser-local に保存してよい。raw response body、request body 全文、Cookie、token、credential、価格や在庫の非公開データは保存しない。

追加 guard の分類:

- 実装必須。反映未確認時の row 表示を、`送信失敗` と区別する。現在の `reflection_unconfirmed` failure class を使い、送信は完了したが反映確認が取れていないこと、Revenue Assistant 標準画面で確認すべき対象日と roomGroup を表示する。
- 実装必須。送信直前と送信後確認の current settings 再取得、rank status 再取得で、HTTP 401 / 403 / その他 HTTP status / network error を別表示する。ログイン切れ、権限不足、サーバー応答失敗、通信失敗を同じ失敗文言にしない。HTTP 401 は再ログイン、HTTP 403 は権限確認、その他 HTTP status は時間を置いた再確認、network error は通信状態確認を表示する。
- 実装済み。成功後に current settings cache と rank status cache を破棄するだけでなく、対象 row の再描画までの間に `反映確認中` を維持する。これは利用者が二重送信しないための UI guard である。
- 実装済み。同じ `facilityId x stayDate x roomGroupId` の pending rank change または反映確認中 rank change がある間は、別の rank 変更 pending を開始できないようにする。これは同じ宿泊日と部屋タイプの二重送信防止であり、複数 row の bulk apply ではない。
- not-now。`/api/v1/lincoln/suggest/reflection_allow` を送信直前 guard に追加すること。単一行 custom rank 変更の標準 UI がこの endpoint を使うことと、`suggest_calc_datetime` の正しい入力値が未確認であるため、推測で実装しない。
- not-now。`POST /api/v1/lincoln/price_ranks`、`POST /api/v1/tema/price_ranks`、`POST /api/v1/neppan/price_ranks` を単一行 rank 変更へ追加すること。これらは一括反映または別 provider の候補であり、今回の観測済み Lincoln custom rank path とは別の調査単位にする。
- 不要。rate limit 回避、bot 検知回避、認証回避、他アカウントまたは他施設へのアクセスを前提にした guard。これらは実装対象ではなく、要望が出た場合は許可された公式 API、partner 契約、手動確認へ切り替える。

`POST /api/v1/lincoln/price_ranks`、`POST /api/v1/tema/price_ranks`、`POST /api/v1/neppan/price_ranks` は、2026-05-29 時点では一括反映または別操作系の候補として扱う。`RAU-RR-51` の単一行 rank 変更では呼ばない。

### Unconfirmed / Investigation Tasks

次は確認済み仕様として扱わず、browser-trace / browser-to-api 調査 task、または対象を固定した低リスクの手動確認 task にする。

- rank 別、日付別、部屋タイプ別価格表の取得可否。
- Revenue Assistant への rank 反映 API の server-side validation、CSRF、権限差、error response、partial failure response schema、同時更新時の挙動、反映後 rollback 可否。`RAU-RR-51` で `/api/v1/lincoln/suggest` の単一行 custom rank 変更は 1 件だけ実 POST 観測したが、error response、partial failure、権限差、他 provider は未確認である。
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
- `recommendedRankUnavailableReason`
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
- `様子見` または `対応不要` の判断時より、confidence の表示段階が上がった。

### Dismiss / 対応不要

対応不要は、一時的な様子見ではなく、同じ根拠での再表示を抑制する user decision として扱う。

- 同じ `stayDate x roomGroup x action x reasonFingerprint` は抑制する。
- 方向、主要根拠、または reasonFingerprint が大きく変わった場合は、再表示候補にできる。
- `対応不要` の判断時より confidence の表示段階が上がった場合は、同じ reasonFingerprint でも再表示候補にできる。ここでいう confidence の表示段階は、top list に出す `高`、`中`、`低` の段階であり、小数値の細かな増減は直接表示しない。
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
+ weekday context support
+ own price position in competitor snapshot
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
- 小キャパの roomGroup は、`not_eligible` または低 confidence へ落とす。capacity 3 の roomGroup は一律に除外しない。ただし、remaining rooms が少ない、または稼働率が高い場合でも、`all` または `transient` の reference deviation が正であることを確認できないときは、高優先度の `raise_watch` へ上げず、`watch` / medium と小キャパ確認 diagnostics に落とす。
- reference curve、forecast、capacity、current rank、rank ladder、weekday context、競合価格 snapshot が欠損している場合は、推測で埋めず diagnostics に不足理由を出す。
- 直近に rank 変更がある場合は、同じ方向の recommendation を出し続けないよう cooldown を使う。
- 過去に反応が悪かった rank transition は、priority または confidence を下げる。
- `lower_watch` は、宿泊日まで 30 日以内、稼働率 40% 以下、かつ reference 比較または個人 pace 比較が不足または下振れしている場合に出す。reference 比較または個人 pace 比較で実際の下振れが確認できる場合は、`raise_watch` と同じ `high` priority tier に置き、sort で confidence、宿泊日、roomGroup 名によって比較する。
- `lower_watch` のうち、reference 比較または個人 pace 比較が欠損しているために「下振れの可能性」として出している候補は、`medium` priority に留める。欠損だけを理由に `high` へ上げると、下げ候補の過剰表示になり、実際に下振れしている候補と区別できなくなるためである。
- `priority` は `reasonFingerprint` に含める。したがって、`medium` だった `lower_watch` が下振れ evidence により `high` へ変わった場合は、過去の同一 `stayDate x roomGroup x action` の利用者判断と別 fingerprint になることがある。これは、優先度が変わった候補を再確認できるようにするための挙動である。

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

sales / ADR health の扱い:

- sales / ADR health は first wave の必須入力にしない。sales / ADR が欠損しても、reference deviation、capacity、remaining rooms、forecast signal、rank change history、user decision cooldown による候補生成を継続する。
- sales / ADR health は `booking_curve_raw_source:v2` の roomGroup response から作る。追加 API request は行わない。候補生成時は `RAU-SALES-03` の `buildSalesAdrInputFromBookingCurveResponses()` を使い、`scope="roomGroup"`、`segment="transient"`、`asOfDate` 時点の最新 observation を current とする。
- reference は同じ raw source の latest point に含まれる `last_year_*`、`two_years_ago_*`、`three_years_ago_*` の平均を使う。これは top list scoring の補助 signal を作るための内部比較であり、正式な売上予測や価格弾力性評価ではない。
- 初期 signal は `adr_down`、`sales_down`、`adr_and_sales_down`、`neutral` とする。ADR は current ADR が reference ADR の 95% 以下、sales は current sales が reference sales の 90% 以下の場合に弱含みとして扱う。
- reference が欠損している場合、reference が 0 で比率比較できない場合、current sales / ADR が欠損している場合は、該当 signal を推測で補完しない。候補には diagnostics を残し、既存 scoring を継続する。
- sales / ADR health signal は候補 action を単独で決めない。`raise_watch` では弱含み signal を confidence の抑制として使い、作業順が「上げてよい候補」と誤読されないよう priority を最大 `medium` まで下げる。`lower_watch` では confidence の補強として使う。`watch` では近い LT の場合だけ priority / confidence を小さく補正する。
- top list には ADR、sales、比率、金額を直接表示しない。主要根拠に出す場合も、`ADR弱含み`、`売上弱含み`、`ADR・売上弱含み` のような非数値要約に留める。
- `neutral` は内部 diagnostics として残してよいが、候補行の主要根拠を増やす目的では表示しない。実データでの発火率と false positive は後続 task で確認する。
- sales / ADR health の `asOfDate` 比較では、`YYYYMMDD` と `YYYY-MM-DD` を混在させない。`booking_curve_raw_source:v2` の point date、`SalesAdrObservation.observedDate`、rank recommendation の `asOfDate` は比較前に同じ日付形式へ正規化し、asOfDate より後の将来 observation を current として使わない。
- top list 候補の `booking_curve_raw_source:v2` coverage を増やす場合は、既存 warm cache の queue 内にある `currentRaw x roomGroup` task を、表示中の top candidates と一致する `stayDate x roomGroupId` から先に処理してよい。この優先化は既存 task の並び替えであり、対象日付範囲、request 件数、request 間隔、run limit、cooldown、重複排除、既存 raw source skip を変更しない。hidden tab 中の取得継続は、`候補データ優先取得` strip の `非表示中も取得` が ON の場合だけ許可する opt-in であり、既定はタブ非表示時に一時停止する。優先 task を新規取得した場合は、top list が保存済み raw source を読めるよう、calendar sync を強制再実行してよい。

weekday context と競合価格内自社料金位置の扱い:

- rank order は、manual override、Revenue Assistant 設定画面の保存済み順序、数値 rank 名 fallback、unresolved の順で解決する。曜日別関係と競合価格内の自社料金位置は、rank order source にはしない。
- 理由は、rank rule が企業またはホテルごとに異なるためである。rank 名は数字系、ローマ字または英字系、記号混在系のいずれもあり得る。同じ表記系でも、高ランクから低ランクへ進む運用と、低ランクから高ランクへ進む運用の両方があり得る。曜日別の rank 使い分けや競合価格との関係も、施設固有の運用であり、上下関係を安全に断定する source にはならない。
- 大国町では、Revenue Assistant 設定画面の `料金ランクの並び順` が高ランクから低ランクへ `1` から `20` の順に並んでいる。この施設では `1` が最高ランク、`20` が最低ランクである。RAU はこの順序を `settings_screen` source として使い、必要なら利用者が manual override で変更できる。
- 曜日別関係は、rank order の推定ではなく、同じ曜日または近い営業文脈の需要差を見て、既存 action の priority / confidence を小さく補正する入力にする。初期実装の比較単位は `facilityId x stayDate x asOfDate x roomGroupId x weekday` とし、既存 `booking_curve_raw_source:v2`、reference curve、同曜日 raw source から取れる範囲に限定する。追加 API request、祝日 API、未確認 calendar API は first implementation では使わない。
- weekday context の初期 signal は、`weekday_reference_supports_raise`、`weekday_reference_supports_lower`、`weekday_reference_neutral` の内部分類候補とする。top list へ表示する場合は、数値を出さず `同曜日強め`、`同曜日弱め` のような非数値 reason に留める。
- weekday context が欠損している場合、source count が少ない場合、祝前日または連休の扱いを確認できない場合は、signal を推測で補完しない。diagnostics は `weekday_context_missing`、`weekday_reference_source_count_low`、`holiday_context_unconfirmed` を候補にする。
- 競合価格内の自社料金位置は、保存済み `competitor-price-snapshots` の最新 snapshot を使う。初期比較単位は `facilityId x stayDate x conditionSignature x fetchedAt x guestCount x jalanFacilityRoomType? x mealType?` とし、同じ snapshot 内の自社最安値と競合施設ごとの最安値を比較する。検索条件 signature、取得時点、競合施設集合が違う snapshot を同じ比較単位に混ぜない。
- `conditionSignature` には、宿泊日、人数範囲、競合施設 `yad_no` 集合、食事条件、プラン名条件、部屋タイプ条件が入る。したがって、競合施設の入れ替え、部屋タイプ別 snapshot、食事条件違いは、同一比較として扱わない。
- 競合価格内自社料金位置の初期 signal は、`own_price_low_against_competitors`、`own_price_near_competitors`、`own_price_high_against_competitors` の内部分類候補とする。金額、差額、比率は top list に直接出さない。
- `own_price_high_against_competitors` と `own_price_low_against_competitors` は、Revenue Assistant の roomGroup と競合価格 response の `jalanFacilityRoomType` または `jalan_room_types[]` を対応づけられる確認済み source が見つかるまで、候補方向を反転させる主因にはしない。候補の diagnostics には `competitor_price_room_group_scope_unconfirmed` と比較可能人数を残し、後続評価で発火分布を確認できるようにする。
- 競合価格内自社料金位置は、`raise_watch`、`lower_watch`、`watch` の action を単独では変更しない。`RAU-RR-53` では、宿泊日まで 30 日以内、かつ人数 1 から 4 のうち比較可能な人数が 2 つ以上ある場合だけ、小さな confidence 補正として使う。自施設最安値が競合中央値の 95% 以下なら `相場より安め`、105% 以上なら `相場より高め` とし、候補の方向と整合する場合は confidence を最大 `+0.04`、逆向きの場合は confidence を最大 `-0.04` とし priority を最大 `medium` に抑える。競合価格だけで `raise_watch` と `lower_watch` を反転させず、競合価格だけで新規候補を作らない。
- 競合価格 snapshot がない場合、自社 plan がない場合、比較対象の競合 plan がない場合、同じ条件 signature の snapshot がない場合、部屋タイプまたは食事条件が一致しない場合は、signal を推測で補完しない。diagnostics は `competitor_price_snapshot_missing`、`competitor_price_own_missing`、`competitor_price_comparable_plan_missing`、`competitor_price_condition_mismatch`、`competitor_price_competitor_set_missing` を候補にする。
- 競合価格 snapshot は、取得済みデータを使う。rank recommendation scoring のために、未確認 request 範囲、取得頻度、対象日付範囲、background queue の上限を増やさない。
- `RAU-RR-18` の初期実装では、weekday context は `stayDate` から `-14日`、`-7日`、`+7日`、`+14日` の同曜日候補を作り、`asOfDate` 時点で未来または当日の候補だけを使う。各候補の保存済み `booking_curve_raw_source:v2` roomGroup response から `transient.this_year_room_sum` を読み、2 件以上の比較値がある場合だけ current transient rooms と平均を比較する。current が平均より 1 室以上かつ 115% 以上なら `weekday_reference_supports_raise`、平均より 1 室以上低く 85% 以下なら `weekday_reference_supports_lower`、それ以外は `weekday_reference_neutral` とする。
- `RAU-RR-18` の初期実装では、競合価格内自社料金位置は `stayDate` ごとの最新保存済み snapshot を使い、同じ snapshot 内の人数 1 から 4 の自社最安値と競合施設ごとの最安値中央値を比較する。`RAU-RR-20` の read-only 確認では、Revenue Assistant の roomGroup と `jalan` 側部屋タイプを対応づける明示 field が確認できなかった。そのため、`RAU-RR-21` では `自社安め` / `自社高め` を top list の主要 reason と confidence 補正に使う挙動を止め、diagnostics に `competitor_price_room_group_scope_unconfirmed` を残す形へ弱めた。`RAU-RR-53` では、利用者が直近日程の相場感を候補判断に使いたいという方針を出したため、30 日以内かつ比較可能人数 2 つ以上に限定し、補正幅 `+0.04 / -0.04` 以内の小さな scoring support として再接続した。

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
- rank ladder は `/api/v1/rank_sequences` の `price_rank_code` と `price_rank_name` を使う。`default_sequence` は名前順初期化用の値であり、rank 上げ / 下げ方向には使わない。
- rank order source は `numeric_rank_name`、`settings_screen`、`manual_override`、`unresolved` のいずれかとして record へ残す。
- 利用者が manual override を保存した場合は、保存された高ランクから低ランクへの順序を source `manual_override` として最優先する。manual override は browser-local 保存に限定し、Revenue Assistant の rank 設定へ write しない。
- rank の上下関係が現在の推定または設定画面順序と逆の施設では、利用者が現在の入力順を逆順にして manual override として保存できる入口を持つ。この入口は browser-local の RAU override だけを変更し、Revenue Assistant の設定画面の並び順は変更しない。
- manual override の入力が保存できない場合は、件数、未確認 token、重複 token、不足 rank のうち判定できた理由を status に表示する。これは利用者が入力を修正するための補助であり、rank order の自動確定 source は変更しない。
- 保存済み manual override が現在の rank ladder と一致しない場合は、その override を使わず、設定画面順序、数値 rank 名 fallback、unresolved の順へ戻す。この場合は status に保存済み手動順序を未使用にした理由を表示する。RAU は保存済み override を自動削除しない。
- manual override がない場合は、`/api/v1/rank_sequences` の配列順を、Revenue Assistant 設定画面 `料金ランクの並び順` の保存済み順序として使い、source `settings_screen` とする。大国町ではこの設定画面が高ランクから低ランクの順に `1` から `20` へ並んでいる。
- 設定画面の保存済み順序が取得できない場合だけ、rank 名がすべて整数として読めるなら、rank 名の数値昇順を高ランクから低ランクへの fallback 順序として推定し、source を `numeric_rank_name` とする。この fallback は、すべての施設で数字が小さいほど高ランクであると断定するものではない。
- rank 名は企業や施設により、数字系、ローマ字または英字系、記号混在系のいずれもあり得る。同じ表記系でも高低が逆になる運用があり得るため、名前パターンだけで `settings_screen` と同等の確定 source にはしない。ローマ字または英字順、記号の有無、曜日別販売傾向、競合価格内の自社料金位置は、rank order source としては使わない。
- 追加の推定ロジックを設計する場合は、推定できるかどうか、どの source を使ったか、利用者が任意変更できるかを UI と diagnostics で区別する。推定値は、`manual_override` と `settings_screen` を置き換えるものではない。
- `raise_watch` では current rank の 1 つ高い rank を、`lower_watch` では current rank の 1 つ低い rank を、first wave の隣接 `recommendedRank` として扱う。
- 方向確認後も、first wave の recommendedRank は隣接 rank のみに限定する。2 段階以上の rank 移動、価格差最大化、売上最大化 rank の直接提示は行わない。
- current rank が欠損する場合、rank ladder に current rank code が存在しない場合、rank order を推定できない場合、または隣接 rank が存在しない場合は、`recommendedRank` を null にする。
- 隣接 rank が存在しない理由が rank ladder の端である場合、top list の推奨方向には `上限ランク: 上げ余地なし` または `下限ランク: 下げ余地なし` を表示する。rank ladder が取れない、または current rank code が ladder に存在しない場合は、原因を diagnostics に残し、従来どおり `上げ検討` / `下げ注意` の direction 表示に戻す。
- rank price table または実販売価格が取れるまで、recommendedRank から推奨レート金額を導出しない。

## UI Contract

### Top

トップ画面には、料金調整候補リストを追加する。

- 日付 x 部屋タイプ単位の候補を優先度順に表示する。
- 料金調整候補リストは、トップ画面のカレンダーより下に配置する。カレンダーの表示範囲を見たあとに、同じ表示範囲内の作業キューとして候補を読むためである。カレンダー上部の期間切替、表示切替、標準操作領域を押し下げる位置には置かない。
- 最大件数は初期値を持つ。初期候補は top 10 とする。利用者が top 10 の外の active candidates を確認したい場合は、`さらに表示` で表示上限を 10 件ずつ増やせる。表示上限の最大値は 50 件とする。表示上限が初期値を超えている場合は、`10件に戻す` で初期表示へ戻せる。
- 表示対象は、user decision と rank change resolved による lifecycle filter を適用した後の active candidates から選ぶ。candidate pool を作る段階で先に top 10 へ切ると、上位候補が `様子見`、`対応不要`、または `反映済み` で非表示になった場合に、11 件目以降の有効候補で作業キューを埋め戻せないためである。
- 表示対象は、対象月でさらに絞り込める。top 画面で `候補データ優先取得` の先 6 か月カードが表示できる場合、対象月 filter の選択肢も同じ基準月から 6 か月分を表示する。各月の件数は lifecycle filter と rank change resolved filter を適用した後の active candidates から数え、候補が 0 件の月も選択肢として残す。先 6 か月カードが解決できない場合は、従来どおり active candidates に含まれる月だけを表示する。初期値は `全ての月` とする。対象月を変更した場合は表示上限を初期値 10 件へ戻し、開いている booking curve preview、競合価格 preview、rank change preview を閉じる。対象月 filter は表示専用の条件であり、candidate scoring、priority、confidence、reasonFingerprint、rank order、manual override、user decision、resolved 判定、Revenue Assistant write API endpoint、rank change payload は変更しない。対象月変更時に同じ `YYYYMM` の booking curve warm cache priority を要求してよいが、request 間隔、同時実行数、取得対象期間、保存 schema は既存 queue 契約を維持する。
- 表示対象は、表示モードでさらに絞り込める。初期値は `全て` とする。表示モードは `全て`、`上げ検討`、`下げ注意`、`注意あり` とする。`上げ検討` は `action="raise_watch"` の候補だけ、`下げ注意` は `action="lower_watch"` の候補だけ、`注意あり` は不足または注意 diagnostics が残る候補だけを表示する。表示モードは表示専用の条件であり、candidate scoring、priority、confidence、reasonFingerprint、rank order、manual override、user decision、resolved 判定は変更しない。
- top 10 の外にも候補がある場合は、件数を表示し、表示上限が最大値に達していない場合だけ `さらに表示` を表示する。表示上限が初期値を超えている場合は、top list meta の下に `10件に戻す` を表示する。
- リスト上部の summary は常時表示を短くする。常時表示は、表示中候補件数、基準日、保存済み raw source 状態、不足または注意の有無、対象月 filter または表示モードが有効な場合の条件外件数、非表示件数、表示上限外件数に絞る。推奨方向別件数、優先度別件数、確度別件数、不足または注意の種類別件数は title または折りたたみ内で確認できる状態を維持する。基準日は表示中候補の `asOfDate` であり、`宿泊まで` の日数計算に使う日付を利用者が確認するための表示である。表示中候補の `asOfDate` が 1 種類で、ブラウザの当日より前である場合は、`基準日 5/28・前日`、`基準日 5/27・2日前` のように、当日から見た鮮度を追加表示する。表示中候補の `asOfDate` が複数混在し、かつ最古の `asOfDate` がブラウザの当日より前である場合は、`基準日 複数・最古 5/28・前日` のように、最も古い基準日と鮮度を追加表示する。これは top list に出ている候補の内訳であり、全候補母数、推奨レート金額、forecast 数値、sales / ADR 数値、競合価格の金額または percent を示すものではない。
- リスト上部の summary には、保存済み `booking_curve_raw_source:v2` の状態を非数値で表示する。分類は `最新基準日あり`、`過去基準日あり`、`未保存`、`取得中`、`取得失敗` とする。`最新基準日あり` は候補と同じ `asOfDate` の raw source がある状態、`過去基準日あり` は同じ stay_date と roomGroup の raw source はあるが候補と同じ `asOfDate` ではない状態、`未保存` は保存済み raw source がない状態、`取得中` は warm cache の現在 task または queue に同じ `stayDate x roomGroup` の `currentRaw` task が残っている状態、`取得失敗` は同じ `stayDate x roomGroup` の優先 task が retry 上限後に error 扱いになった状態を指す。この表示は根拠データの読み取り状態を示すためのものであり、candidate scoring、priority、confidence、reasonFingerprint、rank order は変更しない。
- 表示中候補と一致する `currentRaw x roomGroup` task を warm cache が処理中の場合、summary、`候補データ優先取得` strip、または料金調整候補 list 直後の画面内 status に `候補データ更新中` を表示する。右下固定 indicator は使わない。取得または skip 後は既存どおり `rank-recommendation-warm-cache` reason で calendar sync を再実行し、保存済み raw source を使って候補を再評価できるようにする。この処理は既存 warm cache queue の並び替えであり、API request 範囲、request 件数、request 間隔、同時取得数は変更しない。
- 月別優先取得ボタンを押した場合、top list の `対象月` filter は押した `YYYYMM` へ切り替える。表示上限は初期値 10 件へ戻し、開いている booking curve preview、競合価格 preview、rank change preview は閉じる。rank change pending がある場合は、未確定操作の `取消` と満了後の guard が見えなくならないよう、pending 行を維持するか filter 切替を遅延する。月別優先取得による filter 切替は表示専用の補助であり、candidate scoring、priority、confidence、reasonFingerprint、rank order、user decision、resolved 判定、Revenue Assistant write API endpoint、rank change payload、pending 秒数は変更しない。
- 月別優先取得の完了後に再同期した場合、top list summary は対象月の再評価結果を一時表示してよい。比較対象は、取得開始直前と取得後再同期後の `対象月` filter 適用済み active candidate 件数、表示中候補件数、保存済み raw source 状態別件数、状態 badge の `取得中`、`確認不足`、`根拠あり` 件数である。summary の本文は、候補件数と不足解消の差分を短く伝える表示に限定する。例は `対象月 2026-08: 候補 +3件、確認不足 -5件` とする。この summary は画面内 memory の一時表示であり、IndexedDB、localStorage、docs、Git 管理へ保存しない。request body、response body、raw trace、Cookie、token、credential、価格や在庫の非公開データは保存しない。
- 不足または注意の種類別件数は、表示中候補の diagnostics から作る `booking_curve または reference 不足`、`forecast 比較不足`、`sales / ADR 比較不足`、`同曜日比較不足`、`競合価格の部屋タイプ対応未確認`、`団体主因のため上げ判断を抑制`、`部屋数条件により判定制限`、`隣接ランク表示に制約あり` の非数値要約である。これは候補行を読む前に、判断材料の不足がどこに偏っているかを知るための表示であり、candidate scoring、reasonFingerprint、rank order、API request 範囲、推奨金額は変更しない。
- lifecycle filter、対象月 filter、表示モード適用後に表示上限を超える active candidates がある場合は、summary に `他 n件` を表示する。これは現在の表示上限の外にも確認候補が残っていることを示すための件数である。`さらに表示` と `10件に戻す` は表示件数だけを変更する入口であり、candidate scoring、sort、対象月と表示モード以外の filter 条件、rank order、manual override、user decision、resolved 判定、API request 範囲、request 件数、推奨金額表示は変更しない。
- user decision または rank change resolved により active list から外れた候補がある場合は、summary に非表示件数を表示する。分類は、利用者判断による非表示と、rank 変更反映済みによる非表示に分ける。これは候補 list が短い、または空に見える理由を説明するための表示であり、candidate lifecycle、scoring、rank order、API request 範囲、推奨金額は変更しない。
- `current settings` が取得できない場合は、候補行を空にし、リスト上部の status に失敗理由を表示する。HTTP 401 の場合は Revenue Assistant への再ログインが必要であること、HTTP 403 の場合は閲覧権限確認が必要であることを表示する。その他の HTTP status は `current settings` 取得失敗として HTTP status を表示する。これは候補生成に使う入力が欠損した状態を利用者に示すための表示であり、rank order、scoring、candidate lifecycle、API request 範囲は変更しない。

行項目:

- 優先度。
- 確度。`confidence` の内部値をそのまま数値表示せず、`高`、`中`、`低` の段階表示に丸める。不足または注意が残る候補では、cell 本体に `高・注意あり`、`中・注意あり`、`低・注意あり` のように短い補助表示を付ける。hover tooltip では、確度が予測精度、推奨金額の正確さ、または Revenue Assistant への反映可否を保証する値ではないことを示し、主要根拠と不足または注意の種類だけを非数値で表示する。
- 宿泊日。
- 宿泊まで。`stayDate - asOfDate` を日数で表示する。当日は `当日`、日数を計算できない場合または宿泊日が `asOfDate` より過去の場合は `-` と表示する。これは作業の緊急度を読みやすくするための表示であり、priority、confidence、candidate lifecycle、API request 範囲は変更しない。
- 前回変更。`/api/v3/lincoln/suggest/status` で取得済みの rank change history から、同じ `stayDate x roomGroupId` の最新 rank 変更内容と経過日を表示する。2026-06-02 時点の 9 列 row layout では、前回変更を独立列へ戻さず、`推奨` cell の補助行に `前回 ランク 11→10 経過 2日前` のように項目別で表示する。表示する項目は、取得できる場合は `ランク 変更前→変更後` と `経過 n日前` である。月日や年月日は補助行へ表示しない。履歴がない場合は cell 本体に補助行を出さず、title 側で履歴なしを確認できる状態にする。hover tooltip または title では、経過日、変更内容、実行者が取れる場合の実行者、候補が表示されている理由を表示する。候補表示理由は、前回変更が基準日より前であること、基準日以降の変更で通常は resolved 非表示になること、利用者判断がないこと、様子見 cooldown が切れていること、前回判断とは別の `reasonFingerprint` であること、または前回判断後に `confidence` 表示段階が上がったことを区別する。この表示は表示補助であり、cooldown 期間、resolved 判定、candidate scoring、priority、confidence、API request 範囲は変更しない。
- 部屋タイプ。
- 現ランク。`RAU-RR-52` では、この cell に hover / focus tooltip を追加し、同じ宿泊日の全部屋タイプの現ランクを一覧表示する。tooltip の列は `部屋タイプ`、`現ランク`、`対象候補との差`、`備考` とする。`対象候補との差` は rank order source が確認できる場合だけ表示し、rank order が `unresolved` の場合、対象候補または比較対象の current rank が rank ladder 上で解決できない場合は `順序未確認` と表示する。`RAU-RR-57` では、この tooltip に `販売室数` 列を追加する。`販売室数` は、ここでは `/api/v1/suggest/output/current_settings` の `max_num_room - remaining_num_room` で計算する予約済み室数を指す。分母は同じ response の `max_num_room` を指す。この tooltip は UI 表示用であり、価格計算、候補方向、priority、confidence、reasonFingerprint には使わない。
- 推奨方向または推奨ランク方向。recommended rank が存在し、既存の単一行 rank 変更 guard を通せる行では、同じ cell 内に `推奨反映` button を表示してよい。この button は既存 `rank-change-submit` handler を使い、押下直後に Revenue Assistant へ POST せず、5 秒 pending、取消、送信直前 current rank 再取得、rank status 再取得、同一 `stayDate x roomGroup` pending block、反映確認を必ず通す。rank ladder の端で `上限ランク: 上げ余地なし` または `下限ランク: 下げ余地なし` になる候補、recommended rank がない候補、送信不可 diagnostics がある候補では quick submit を出さない。
- rank order の現在 source と、高ランクから低ランクへの順序。
- 利用者が high-to-low の rank 順序を手動保存する入口、現在の入力順を逆順にして保存する入口、保存失敗理由を具体的に表示する status、推定順序へ戻す reset 入口。
- 主要根拠。cell 本体には reason code の非数値要約だけを表示し、hover tooltip では同じ主要根拠と、不足または注意の種類を非数値で表示する。これは利用者が根拠欄を読む流れのまま、booking curve / forecast / sales / ADR / 同曜日 / 競合価格対応 / 団体主因 / 小キャパ / 隣接ランク制約の注意を確認できるようにするためである。
- 状態。この cell は、既存 diagnostics と raw source status から作る短い非数値 badge として表示する。入力は既存 reason code、diagnostics、保存済み `booking_curve_raw_source:v2` の状態、warm cache pending、curve preview diagnostics、rank change disabled reasons である。比較対象は、根拠が揃っているか、取得中か、不足または注意があるか、対象外か、rank 変更を送信できない理由があるかである。出力は `根拠あり`、`取得中`、`確認不足`、`送信不可`、`対象外` のような短い label と title 補足に限定する。`確認不足` と `送信不可` が同時に成立する場合は、行から rank 変更を送信できないことを先に伝えるため、badge 本文は `送信不可` を優先する。`確認不足` の内容は title の `注意` 行に残す。金額、差額、percent、forecast 数値、sales / ADR 数値、競合価格の金額は表示しない。
- `Analyzeで確認`。
- `曲線`。押下すると、同じ `stayDate x roomGroup` の booking curve preview を候補 row 直下に開く。もう一度押すと閉じる。preview 内または開いた button 上で `Escape` を押した場合も閉じる。閉じた後の focus は、preview を開いた `曲線` button へ戻す。preview は Analyze 画面へ遷移せずに見るための表示補助であり、candidate scoring、priority、confidence、reasonFingerprint、rank order、user decision、resolved 判定、API request 範囲、Revenue Assistant write / bulk apply は変更しない。
- booking curve 要点 popover。`RAU-RR-54` では、既存の `曲線` preview block を残したまま、候補行内に hover / focus / click で開ける小型 popover を追加する。popover は保存済み `booking_curve_raw_source:v2` と既存 preview 用 data を使い、新規 API request 範囲、request 件数、request 間隔を増やさない。表示内容は、詳細 chart 全体ではなく、判断に必要な要約、全体 / 個人 / 団体の現在値、reference curve との差分の非数値要約、不足 diagnostics に限定する。forecast 数値、sales / ADR 数値、競合価格金額、推奨レート金額は表示しない。
- `競合価格` preview。料金調整候補 row から競合価格を確認する導線は、常時表示の列を増やさず、`曲線` と同じ row 直下 preview として押下時だけ開く。button は、対象 `stayDate` があり、競合価格 snapshot adapter が使える top row で表示する。開閉、`Escape` close、focus return は `曲線` preview と同じ契約にする。preview の対象日は row の `stayDate` とし、対象 room type は候補の `roomGroupName` と `jalanFacilityRoomType` の対応が確認できる場合だけ強く絞る。未確認の場合は、保存済み snapshot 全体の人数別最安値 graph と状態文を表示し、部屋タイプ対応未確認を金額推奨として扱わない。cache hit では保存済み snapshot を表示し、未取得または不足時は押下後に対象日の競合価格 snapshot 取得を開始する。同じ `facility x stayDate` の in-flight request は重複発行しない。取得中、取得失敗、データなし、再取得を preview 内に表示し、金額、差額、percent を top list 本文や summary へ常時表示しない。Revenue Assistant write API、rank 変更 POST、自動反映、一括反映は追加しない。
- 行内 rank 変更。`RAU-RR-55` では、既存の `rank調整` preview block を残したまま、候補行の `推奨` 付近または action cell に、推奨 rank を初期値にした rank select と `反映する` button を追加した。`RAU-UX-78` 以降は、rank select と `反映する` button を常時表示せず、`rank調整` preview が開いている場合、または rank 変更 pending / 結果表示が必要な場合に表示する。`RAU-UX-95` では、recommended rank が存在する行に限り、`推奨` cell 内の `推奨反映` button から同じ送信候補を pending へ渡せるようにする。利用者は preview 内では任意 rank を選べるが、`推奨反映` は candidate の recommended rank だけを送信候補にする。送信対象は観測済み `/api/v1/lincoln/suggest` の単一行 custom rank path に限定する。押下後は既存の 5 秒 pending、`取消`、送信直前 current rank 再取得、rank status 再取得、反映確認を再利用し、行内で `反映する`、`推奨反映`、`取消`、`反映中`、成功または未確認結果を表示する。
- `rank調整` preview。押下すると、同じ `stayDate x roomGroup x reasonFingerprint` の rank 変更 preview を候補 row 直下に開く。もう一度押すと閉じる。preview 内または開いた button 上で `Escape` を押した場合も閉じる。閉じた後の focus は、preview を開いた `rank調整` button へ戻す。この keyboard close は表示状態だけを変え、rank select の選択値、送信前 pending、送信済み結果、Revenue Assistant write API は変更しない。
- 行内 rank 変更の rank select は、rank ladder の全候補から作る。初期値は recommended rank とし、利用者が別 rank を選んだ場合は、その rank code と rank name を送信候補として pending に渡す。select の変更は表示上の送信候補だけを変え、candidate scoring、recommendedRank、reasonFingerprint は変更しない。
- `様子見`。
- `対応不要`。
- 操作 cell では、常時表示する主操作を `Analyzeで確認`、`曲線`、`rank調整` に絞る。booking curve 要点 popover、`様子見`、`対応不要` は secondary actions として折りたたむ。DOM selector、button action、pending cancel、preview row、rank select の selector は維持するが、常時目に入る command 数を減らす。これは UI 表示密度を下げるための変更であり、Revenue Assistant write API endpoint、candidate scoring、priority order、confidence calculation、rank change payload、pending 秒数は変更しない。

後続のトップ画面意思決定支援:

- first wave の後続では、トップ画面の料金調整候補から Analyze 画面へ遷移せずに、該当 roomGroup の booking curve、前回変更日、rank 調整操作、取消可能な反映バッファを確認または操作できるようにする。
- ただし、Revenue Assistant write API、rank 変更の request shape、安全制約、取消可能時間、partial failure、同時更新時の挙動が未確認の間は、トップ画面からの rank 変更を実装済み仕様として扱わない。
- `RAU-RR-48` の read-only 確認により、標準の料金ランク一括反映 UI には送信前の modal state、`最初からやり直す`、`閉じる` 時の確認 prompt、`続けて反映する` state があることを確認した。一方で、送信後の rollback または短時間 undo は未確認である。
- `様子見`、`対応不要`、将来の rank 変更操作は、押下直後に即時確定して戻せない挙動にしない。少なくとも短時間の取消入口を持つ反映バッファを設ける。browser-local の `様子見` と `対応不要` は RAU 内で確定前に取り消せる設計にする。将来の Revenue Assistant rank 変更では、RAU 内の pending state は送信前の取消に限定し、送信後 undo を実装済みとして扱わない。
- `RAU-RR-49` では、`様子見` と `対応不要` を押した直後に IndexedDB へ保存せず、5 秒の in-memory pending state に入れる。pending 中は対象候補 row の `様子見` と `対応不要` button を disabled にし、行内に `n秒後に確定` と `取消` button を表示する。`取消` を押すと timer を破棄し、decision record を保存しない。
- pending timer が満了した場合だけ、従来と同じ `rank-recommendation-decisions` record を保存する。保存後の cooldown、dismiss、confidence escalation、reasonFingerprint による lifecycle filter は既存契約を維持する。
- pending state は browser memory 上だけに置く。画面 reload、別施設または別 batch への切替、script 再実行で pending state が失われた場合は保存しない。これは未確定の利用者判断を、意図せず後から確定させないためである。
- `RAU-RR-56` では、既存の `様子見` と `対応不要` の 5 秒 pending 保存ロジックを維持したまま、表示文言、配置、色、disabled 状態、`取消` の見え方を rank 変更 pending と同じ操作感へ揃える。保存前の `取消` で IndexedDB に何も保存されない挙動、timer 満了後だけ従来の decision record を保存する挙動、cooldown、dismiss、confidence escalation、reasonFingerprint の既存 lifecycle は変更しない。
- 前回変更履歴は top list の `推奨` cell の補助表示と title に表示する。9 列 row layout では `前回変更` を独立列へ戻さない。補助表示は項目別にし、月日や年月日は表示せず、経過日は `n日前` を表示する。rank change history による resolved 判定、user decision cooldown、候補再表示条件を区別できる表示にする。前回変更からの経過日が近い候補に推奨が出る場合は、cooldown が効いていないのか、別 roomGroup、別 reasonFingerprint、confidence 表示段階上昇、または販売状況変化として再表示されているのかを検証できるようにする。
- booking curve preview は、Analyze 画面と同じ意味の全体 / 個人 / 団体、reference curve、不足 diagnostics を使う。top list 上では tooltip ではなく候補 row 直下の追加 row として表示し、候補一覧の作業順を保ったまま開閉できるようにする。preview の data source は既存保存済みの `booking_curve_raw_source:v2` とし、top list preview のために `/api/v4/booking_curve` の request 範囲、request 件数、request 間隔を増やさない。raw source がない場合または基準日以前の booking curve point がない場合は、chart の代わりに不足 diagnostics を表示する。reference curve は、保存済みの derived reference curve がある場合はそれを使い、ない場合は保存済み `booking_curve_raw_source:v2` から Analyze と同じ直近型または季節型の計算関数で再計算する。preview 表示のために不足している reference source を新規 API request で取得しない。直近型 reference curve の保存済み derived record または計算元 raw source がない場合は、季節型と同じ線を代用せず、直近型を欠損として扱う。季節型 reference curve の計算元 raw source がない場合だけ、対象日の raw source に含まれる前年、2年前、3年前の room count から作る historical reference を fallback として使う。top list preview では forecast 数値、sales / ADR 数値、競合価格の金額、推奨レート金額を直接出す契約にはしない。
- `RAU-AF-11` では、Analyze 画面の booking curve と top list preview の `個人 / 団体` 切り替えで、切り替え直後に表示が空にならないようにする。切り替え時は、まず現在保持している最新の `SalesSettingPreparedData` と rank status snapshot から Analyze 側の全体 summary、室タイプ別 card、rank overview、競合価格グラフ位置を再描画し、その後に通常の calendar sync を強制実行する。top list preview は保存済み `booking_curve_raw_source:v2` から作った preview 用 snapshot を保持し、`個人` と `団体` の両方の segment variant を同じ preview data 内に持たせる。切り替え直後は開いている preview row をその snapshot から再描画し、通常 sync 開始時の sales setting cleanup は preview 内の booking curve section を削除しない。preview 用に `/api/v4/booking_curve` request 範囲や request 件数を増やさない。

first wave の top list では forecast 数値を直接表示しない。forecast が評価後に scoring 補助として使われる場合でも、top list では priority、confidence、主要根拠、diagnostics に反映する。`予測最終室数` のような数値を top list に出すと、利用者が current、reference curve、forecast、推奨ランク方向を混同しやすいためである。`confidence` は候補の根拠がどれだけ揃っているかを示す補助情報であり、実価格や予測値の精度を保証する値ではない。そのため top list では、内部値を直接出さず、確度の段階表示に留める。summary と確度 tooltip でも forecast 数値、sales / ADR 数値、競合価格の金額または差額、percent は表示しない。

トップカレンダー badge は optional とする。入れる場合でも、warm cache marker、保存済み raw source signal、団体室数表示、最終変更表示と意味を混同しない。候補リストを作業順の主導線とし、badge は補助表示に留める。

### Analyze

Analyze 画面では、該当日付の候補一覧と部屋タイプ別 signal detail を表示する。

- 該当 stayDate の候補一覧を表示する。
- pending focus がある場合は、Analyze 上部候補一覧を「遷移元候補の確認」と「同日他候補の確認」に分ける。遷移元候補は top 画面から選んだ `stayDate x roomGroup` を示し、利用者が最初に確認する行として表示する。同日他候補は、同じ宿泊日に残る別 roomGroup の比較対象として表示する。pending focus がない場合は、従来どおり該当 stayDate の候補一覧を 1 つの一覧として表示してよい。
- Analyze 上部候補一覧は read-only とする。反映操作、一括反映、自動反映、Revenue Assistant write API は追加しない。分割表示は見出し、説明、並び、highlight だけの変更であり、candidate scoring、priority、confidence、reasonFingerprint、rank change payload、API request 範囲は変更しない。
- 部屋タイプ別 card に signal detail を出す。
- トップのリストから遷移した場合、sessionStorage などで pending focus を保持する。
- トップのリストから遷移した場合、対象 roomGroup card を開く、scroll する、highlight する。
- トップのリストから遷移した場合、highlight した roomGroup card に、どの料金調整候補から来たのかを示す短い summary を表示する。summary は推奨方向、主要根拠、不足または注意の非数値要約に限定し、forecast 数値、sales / ADR 数値、競合価格の金額、差額、比率、推奨レート金額は表示しない。
- rank change が発生したら `resolved_by_rank_change` として active list から外す。ただし履歴は削除しない。

forecast 実装前は、Analyze detail に forecast 数値を表示しない。評価後に表示する場合も、最初は Analyze detail の diagnostics として扱い、top list への簡易表示とは別 task で判断する。表示する場合は、current、reference curve、forecast の入力、処理、出力を区別できる label と missing diagnostics を持たせる。

## React Island And UI Primitive Contract

React 化の目的は、Revenue Assistant 本体を React application として置き換えることではない。目的は、userscript が追加する UI の入力、UI state、利用者操作、出力 DOM、副作用呼び出しを分け、候補 list の表示と操作を保守しやすくすることである。

React 化する候補:

- 料金調整候補 list の summary、controls、table、row、cell、row actions、preview row。
- 候補 list 内の read-only 表示部品。例: 確度、主要根拠、現ランク tooltip、booking curve 要点 popover。
- 候補 list 内の browser-local UI state。例: 表示 mode、表示件数、target month、preview open state、rank select state。
- 候補 list 内の pending 表示。例: `様子見`、`対応不要`、rank 変更の送信前取消可能状態。

React 化しない候補:

- Revenue Assistant 本体の routing、標準 UI、標準 table、標準 graph。
- candidate generation、priority / confidence scoring、reasonFingerprint 作成。
- IndexedDB adapter、Revenue Assistant API adapter、write guard、request queue、background queue。
- Tampermonkey metadata、配布版生成、Chrome DevTools Protocol smoke helper。

React component が扱ってよい入力、状態、出力:

- 入力は、`RankRecommendationReactListSnapshot` と、その中の行、cell、button、control、preview placeholder snapshot に限定する。
- `derived from snapshot` は、候補 row、表示文言、tooltip 内容、button title、disabled 状態、preview placeholder key である。component 内で再計算しない。
- `browser-local UI state` は、React component 内で持ってよい。対象は `InlineRankChange` の選択中 rank code のように、送信候補の表示だけを変える一時 state に限定する。
- `pending write state` は、main module が管理し、React component は snapshot に含まれる pending label と cancel button を表示するだけにする。
- `temporary display state` は、preview open state、popover / details open state、focus state である。Revenue Assistant API request、IndexedDB write、rank change POST は component 内で直接行わない。
- 出力は既存 `data-ra-*` selector、button attribute、link href、aria attribute、preview placeholder DOM とする。既存 smoke selector は維持する。
- 利用者操作は既存 delegated event handler に届く `data-ra-rank-recommendation-button-action` などの属性で表す。React component から API adapter を直接呼ばない。

UI primitive 導入方針:

- 自前 UI primitive は、button、pending notice、React row actions、preview row、現ランク tooltip、rank select、details 系操作に使い続ける。
- 外部 UI ライブラリは、CSS theme 全面導入や component suite 置き換えではなく、必要な component だけを取り込む。
- 2026-05-31 の完全移行レーンでは、最初の外部 UI ライブラリ component として Radix UI `@radix-ui/react-popover@1.1.15` の Popover だけを採用する。対象は、トップ料金調整候補 list の booking curve 要点 popover である。
- booking curve 要点 popover は、既存 `curvePopoverItems` だけを入力にし、Revenue Assistant API request、IndexedDB write、candidate scoring、reasonFingerprint、rank change adapter を直接扱わない。
- Popover の trigger と content は `data-ra-rank-recommendation-curve-popover`、`data-ra-rank-recommendation-curve-popover-content`、`data-ra-rank-recommendation-ui-primitive` を持ち、既存 selector contract と smoke helper の確認入口を維持する。
- Radix Popover は Portal を使うため、CSS は content 自体の data attribute へ当てる。Revenue Assistant 本体 DOM へ global theme、CSS reset、design token を注入しない。
- write API に近い操作へ primitive を適用する場合は、送信条件、5 秒 pending、取消、送信直前 current rank 再取得、rank status 再取得、反映確認、同一 `stayDate x roomGroup` pending block を維持する。

2026-06-01 UI overhaul 契約:

- トップ料金調整候補 list の design token は、`data-ra-rank-recommendation-list` 配下の CSS custom properties と component class に限定する。Revenue Assistant 本体の `body`、標準 button、標準 select、標準 table、標準 calendar へ global style、CSS reset、theme class を当てない。
- `data-ra-rank-recommendation-ui-component` は、配布版 smoke と fixture 確認で UI 実装漏れを検出するための marker として使う。対象は summary、control group、table、row layout、row actions、popover、tooltip、pending notice、status message である。既存の `data-ra-rank-recommendation-react-island`、row、button action、preview host selector は維持する。
- 候補 row は、desktop 幅では `優先度`、`判断`、`宿泊日`、`部屋タイプ`、`現ランク`、`推奨`、`根拠`、`状態`、`操作` の 9 列を基本にする。従来の `宿泊まで`、`データ`、`前回変更` は一覧上の独立列から外すが、title、tooltip、meta text として保持する。
- narrow 幅では、row を block layout にし、各 cell の `data-ra-rank-recommendation-cell-role` から表示 label を出す。目的は、長い roomGroup 名、pending、error、preview open の状態で text overlap と操作不能を避けることである。
- Select と Segmented Control は、既存 native select と自前 control primitive を使う。新しい UI library package はこの契約では追加しない。追加 package が必要になった場合は、用途、置き換える UI、採用理由、代替案、exact version、lockfile 差分、license、repository、dependencies、install / postinstall script、bundle size 差分、rollback 条件、Tampermonkey 配布版 smoke を同じ判断単位で確認する。
- pending、confirmation、warning、error、empty の表示は、RAU root 配下の token と component class で揃える。ただし、5 秒 pending、取消、送信直前 current rank 再取得、rank status 再取得、同一 `stayDate x roomGroup` pending block、HTTP 401 / 403 / その他 status の区別は変更しない。
- top list 本文には、金額、差額、percent、forecast 数値、sales / ADR 数値、競合価格の金額を直接表示しない。これらを表示候補に戻す場合は、入力データ、比較対象、判断に使う条件、誤読を避ける表示単位を別 task で先に決める。
- Vite fixture は dev-only UI regression gallery として、empty、loading、確認前、確認後、decision pending、rank change pending、rank change error、long room name、preview open などの合成状態を並べて確認する。実データ、認証情報、API response body、価格や在庫の非公開データは fixture へ保存しない。
- 配布版 smoke の top mode は、RAU root、React marker、候補 row、主要 control、UI component marker、console / page error 0 件、監視対象 write API POST 0 件を確認する。UI marker が不足する場合は、Tampermonkey 未更新、userscript 未発火、React hydration 未完了、component 実装漏れを分けて確認する。

UI ライブラリ候補の評価基準:

- bundle size と tree-shaking 可能性。Tampermonkey userscript の配布 bundle に入るため、必要 component だけを取り込めることを優先する。
- CSS 衝突。Revenue Assistant 本体 DOM と同じ page に挿入されるため、global CSS や theme class の前提が強い候補は避ける。
- unstyled / headless 対応。RAU 側の既存 CSS と `data-ra-*` selector を維持できることを優先する。
- keyboard 操作と accessibility。button、popover、dialog、menu、tabs、select の focus、Escape、aria 属性を確認する。
- Tampermonkey 配布との相性。Portal の挿入先、z-index、Shadow DOM 非利用、CSP、bundle size を確認する。
- 供給網リスク。license、repository、maintainer、dependencies、install / postinstall script、version pin、lockfile 差分、`npm audit` を確認する。
- 承認なしでできるのは、公式 docs、npm metadata、package size、license、dependencies、install script 有無の調査までである。dependency 追加、lockfile 更新、UI component 置き換えは利用者承認後に行う。

2026-05-31 時点の候補比較:

| 候補 | 使える component | 使わない component | 供給網上の注意 | Tampermonkey userscript での懸念 | 判断 |
| --- | --- | --- | --- | --- | --- |
| Radix UI `@radix-ui/react-popover` | Popover、Dialog、Tooltip、Select を個別 package で検討できる | CSS theme、全面的な component suite 置き換え | npm metadata では `@radix-ui/react-popover` は MIT、15 dependencies、unpacked size 91.3 kB、version `1.1.15`。install / postinstall script は確認対象 metadata には出ていない。`npm audit` は 0 vulnerabilities | Portal と z-index、既存 details / tooltip との event 競合、複数 Radix package を入れた場合の依存増加 | 採用候補。最初の production 接続対象は booking curve 要点 popover 1 件だけに限定する |
| Ariakit `@ariakit/react` | Dialog、Popover、Menu、Select、Combobox などの headless component | 全面的な toolkit 導入 | npm metadata では MIT、1 dependency、unpacked size 273 kB、version `0.4.18` | API 面は広いが、userscript で必要な部品より大きくなりやすい | 保留候補。dependency 数は少ないが、最初の primitive には過剰 |
| React Aria Components `react-aria-components` | Button、Popover、Dialog、Select、Tabs など accessibility 重視の unstyled component | 国際化や日付系を含む広い component 群 | npm metadata では Apache-2.0、29 dependencies、unpacked size 4.39 MB、version `1.12.1` | internationalization 依存と package size が大きく、Tampermonkey 配布に対して初期導入が重い | 不採用寄りの保留。accessibility は強いが、今回の小さい primitive 試験には重い |
| Headless UI `@headlessui/react` | Dialog、Popover、Menu、Tabs など | Tailwind 前提の例をそのまま使うこと | npm metadata では MIT、5 dependencies、unpacked size 1.01 MB、version `2.2.7` | Tailwind と組み合わせる説明が多く、RAU の既存 CSS へ最小導入するには検証が必要 | 保留候補。Tailwind を入れない前提では最初の候補にしない |

調査出典:

- Radix UI `@radix-ui/react-popover`: `https://www.npmjs.com/package/@radix-ui/react-popover`
- Ariakit `@ariakit/react`: `https://www.npmjs.com/package/@ariakit/react`
- React Aria Components: `https://www.npmjs.com/package/react-aria-components`
- Headless UI `@headlessui/react`: `https://www.npmjs.com/package/@headlessui/react`

月次実績画面の React 化候補:

- React 化候補は、`日次差分` compact view の summary、展開状態、将来の filter / expand 操作である。これらは入力が月次 preview model に閉じ、Revenue Assistant API adapter や monthly snapshot schema を component に入れずに表現できる。
- 素の DOM のままにする候補は、現行の `LTブッキングカーブ` SVG graph、tooltip、background prefetch status である。理由は、chart 本体と tooltip は既に月次 module 内で完結しており、React 化すると snapshot 読み取りと描画 timing の責務境界を再設計する必要があるためである。
- 先に仕様確認が必要な候補は、月次 graph 本体、過去 batch 履歴比較、月次実績を料金調整候補 scoring へ接続する処理である。これらは入力、保存世代、出力の契約が未確定であり、React 化の前に spec を固定する。

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

## Pending UI And Row Visibility

`様子見`、`対応不要`、`推奨反映` は、押下直後に確定または送信しない。5 秒の in-memory pending state に入り、同じ行に残り秒数 text、progress ring、`取消` button を表示する。progress ring は text と同じ `commitAt` と 5 秒 duration から計算し、表示補助だけに使う。progress ring は pending 秒数、保存条件、送信前 guard、POST 実行条件、反映確認を変更しない。

`様子見` と `対応不要` は、5 秒満了後に browser-local decision record の保存へ進む。保存が成功した場合、次の rank recommendation 再同期で既存の user decision lifecycle filter により対象行を非表示にする。保存に失敗した場合は、失敗を console warning に残し、次の再同期で候補が再表示され得る状態を維持する。

`推奨反映` は、5 秒満了後に送信前 guard へ進む。送信前 guard、POST、反映確認のいずれかに失敗した場合、対象候補を隠したままにせず、同じ行または次の再同期後の行で失敗状態を確認できるようにする。送信成功または反映確認済みの場合は、既存の resolved rank change filter により対象候補を非表示にする。満了直後に無条件で行を消さない理由は、送信前 guard と反映確認の失敗を利用者が確認できる状態を維持するためである。

## Current Rank Occupancy Display

トップ料金調整候補 list の `現ランク` cell では、current rank の値と販売室数を別行に分け、current rank の下に `販売室数：current/max` を補助行として表示する。`販売室数` は、ここでは `/api/v1/suggest/output/current_settings` の `max_num_room - remaining_num_room` で計算する現在の使用済みまたは確保済み室数を指す。分母は同じ response の `max_num_room` を指す。

この表示は、同じ cell の rank gap tooltip に出している `販売室数` と同じ計算にそろえる。`remaining_num_room` または `max_num_room` が未取得、不正、または `max_num_room <= 0` の場合は推測値を出さず、補助行を表示しないか tooltip 側で `販売室数未取得` と表示する。`販売室数` は UI 表示用であり、candidate scoring、priority、confidence、reasonFingerprint、rank change payload には使わない。

## Competitor Baseline Deviation

現行の `ownPricePositionSignal` は、現在の自社最安値と現在の競合中央値を比較して `own_price_low_against_competitors`、`own_price_near_competitors`、`own_price_high_against_competitors` を作る。これは現在値の単発比較であり、施設が通常から競合より少し安く売る方針なのか、今日だけ通常方針から外れているのかを区別しない。

今後の `通常時平均との差分` 方式では、入力を次のように分ける。

- 現在値: 同じ `stayDate`、人数、食事条件、部屋タイプ scope の `自社価格 / 競合中央値`。
- baseline: 過去または lead time 別の公式 `価格推移` record、または同じ条件 signature の競合価格 snapshot から作る通常時の `自社価格 / 競合中央値` の中央値を第一候補にする。
- 比較条件: 施設 ID、宿泊日、lead time bucket、曜日、人数、食事条件、部屋タイプ、競合施設集合、取得時点の古さ、比較可能 record 数。
- 出力: 現在値から baseline を引いた乖離量、比較可能人数数、比較 record 数、diagnostics、reasonCodes、priority / confidence の小さな補正候補。

初期設計では、公式 `価格推移` の `price-trend-records` を第一候補にする。理由は、同じ宿泊日の lead time 別系列を保存済み store から読め、現在値だけではなく通常時相当の相対距離を作りやすいためである。既存 `competitor-price-snapshots` は、同じ検索条件 signature と競合施設集合がそろう場合に fallback として扱う。価格推移 record が未保存、取得中、取得失敗、89 日より先で公式側に data がない、または条件が一致しない場合は、補正せず diagnostics に残す。

baseline の比較単位は、初期実装では `facility x guestCount x mealType x roomType x leadTimeBucket` を第一候補にする。ただし、Revenue Assistant の `roomGroup` と `jalan` 側の room type 対応 source が未確定な場合は、roomGroup 単位の強い補正を行わず、`competitor_price_room_group_scope_unconfirmed` または baseline 用 diagnostics を残す。weekday は baseline の補助 bucket とし、record 数が不足する場合は weekday を外した baseline へ下げる。

補正を使う場合は、action を新規作成または反転しない。`raise_watch` に対して、現在値が baseline より自社安めへ大きく乖離していれば上げ補助、baseline より自社高めへ乖離していれば抑制候補にする。`lower_watch` に対して、現在値が baseline より自社高めへ大きく乖離していれば下げ補助、baseline より自社安めへ乖離していれば抑制候補にする。補正幅は既存 `RAU-RR-53` の小補正と同じく小さくし、推奨レート金額、金額差、percent は top list 本文に直接表示しない。

比較不能時の diagnostics 候補は、`competitor_baseline_price_trend_missing`、`competitor_baseline_snapshot_missing`、`competitor_baseline_record_count_low`、`competitor_baseline_condition_mismatch`、`competitor_baseline_competitor_set_mismatch`、`competitor_baseline_room_group_scope_unconfirmed`、`competitor_baseline_stale` とする。

## Operation History Learning And Cooldown Customization

操作履歴を使う候補品質改善は、browser-local record と既存 reasonFingerprint / diagnostics を使う設計候補として扱う。外部サービスへ送る機械学習、個人情報や予約情報の保存、自動反映、自動 suppression は行わない。

入力候補は、`様子見`、`対応不要`、rank 変更実行、rank 変更取消、送信前 guard 失敗、反映確認失敗、reasonFingerprint、capacity、reference deviation、競合価格 baseline、confidence 表示段階である。`様子見` は一時的な見送りであり false positive とは扱わない。`対応不要` は同じ reasonFingerprint の false positive 候補として扱える。rank 変更実行は、利用者が候補を実務上採用した signal として扱える。rank 変更取消、guard 失敗、反映確認失敗は候補品質よりも操作安全性や同時更新の問題を示す可能性があるため、候補抑制の強い根拠にしない。

初期判断では、操作履歴から自動 suppression を実装しない。実装へ進む場合は、保存 schema、互換性、削除方針、表示説明、評価方法を別 task に分ける。代替策として、学習化ではなく利用者が明示設定した cooldown を使う。設定候補は `長め`、`ふつう`、`短め`、`任意日数` とし、設定粒度は全体設定、部屋タイプ別設定、LT 別設定を比較する。LT は `lead time` の略で、宿泊日までの日数を指す。

全体設定は実装が小さく、誤設定時の影響範囲を説明しやすいが、特定 roomGroup だけを調整できない。部屋タイプ別設定は小キャパや特殊部屋タイプの再表示頻度を調整しやすいが、roomGroup 名変更や施設差で設定管理が複雑になる。LT 別設定は直近日程と先の日程で異なる判断間隔を持てるが、範囲ブロックの定義を誤ると候補が見えにくくなる。任意日数は自由度が高いが、極端な値による未検証 suppression を避けるため、上限、reset 操作、diagnostics 表示を必須にする。

cooldown 設定を実装する場合でも、送信前 guard の無効化、任意式入力、JavaScript 入力、自動反映、未選択行の送信は行わない。候補に設定が影響した場合は、diagnostics または候補行の補助表示で、どの設定が再表示または非表示期間に影響したかを説明できるようにする。

## Future Bulk Apply

bulk apply は将来候補として残すが、first phase では非目標とする。

2026-05-28 時点の feasibility:

- current rank は `/api/v1/suggest/output/current_settings` から取得候補を確認済みである。
- rank ladder 候補は `/api/v1/rank_sequences` から取得候補を確認済みである。
- 反映許可候補は `/api/v1/lincoln/suggest/reflection_allow?suggest_calc_datetime=...` の `is_allowed` として確認済みである。
- write endpoint 候補は JavaScript bundle 内で確認したが、実行していない。request shape、必要 header、CSRF、provider 差、権限差、partial failure、同時更新、rollback、標準 UI との競合条件は未確認である。
- rank price table と現在販売中価格は、`RAU-RR-36` の追加確認後も、推奨レート金額を導出できる入力としては未確認である。
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
12. `RAU-RR-12` から `RAU-RR-16` で、rank order source、rank ladder 端表示、数値 rank 名 fallback、manual override、settings screen source を実装する。
13. `RAU-RR-17` で、曜日別関係と競合価格内自社料金位置を rank order source ではなく scoring 補助 input として扱う設計を確定する。
14. `RAU-RR-18` で、曜日別関係と競合価格内自社料金位置の初期 signal を実装し、既存候補生成へ小さく接続する。

## Open Questions

1. rank 別、日付別、roomGroup 別の price table は取得できるか。
2. Revenue Assistant への rank 反映 API 候補は存在するが、request shape、権限、CSRF、同時編集時の挙動、安全制約、partial failure は何か。
3. `reflection_allow.is_allowed` が false のとき、標準 UI と API はどのように反映を止めるか。
4. 現在販売中価格の全体像は取得できるか。
5. プラン別、人数別、食事条件別の価格と rank の関係は取得できるか。
6. 小キャパの eligibility threshold は何室以下、または残室率何%以下を初期値にするか。
7. 様子見 cooldown の LT 帯別 default duration をどう設定するか。
8. reasonFingerprint に含める reasonCodes、threshold、data version、scoring version の境界をどう切るか。
9. weekday context で祝前日、連休、イベント日を扱う場合、どの確認済み source を使うか。
10. 競合価格内自社料金位置を roomGroup 別に強める場合、Revenue Assistant の roomGroup と `jalanFacilityRoomType` をどの確認済み source で対応づけるか。
11. `RAU-FC-03` の実データ評価で、forecast diagnostics を priority / confidence に接続できるだけの安定性があるか。

## References

- Overview: `docs/spec_000_overview.md`
- Analyze 画面仕様: `docs/spec_001_analyze_expansion.md`
- Booking curve core logic: `docs/spec_002_curve_core.md`
- 判断原則: `docs/context/INTENT.md`
- 判断記録: `docs/context/DECISIONS.md`
- 現在地: `docs/context/STATUS.md`
- 実行順: `docs/tasks_backlog.md`
