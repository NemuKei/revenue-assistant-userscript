# STATUS

最終更新: 2026-04-30

## Current Task Bundle

- 主対象: `RAU-WC-07` booking curve localStorage 容量超過を整理する
- この bundle で扱う Task ID:
  - `RAU-WC-07` booking curve localStorage 容量超過を整理する
- 今回の目的:
  - 2026-04-30 の GUI 確認中に出た `failed to write persistent booking-curve cache` / `QuotaExceededError` の対象 key と保存量を整理する。
  - 競合価格 snapshot は IndexedDB 保存で正常確認済みのため、競合価格の本線は止めず、booking curve localStorage cache の削除、縮小、または IndexedDB 参照への寄せ方を決める。
  - 実装修正する場合は、booking curve current 表示、reference curve 非同期補完、warm cache indicator の既存挙動を維持する。
  - Chrome CDP で確認した localStorage 容量の大半は `revenue-assistant:group-room-count:v4:<facility>:booking-curve:` 配下の booking curve response cache だったため、IndexedDB raw source を正本として localStorage 側の重複保存を止める。
  - コード実装、build、Tampermonkey 更新後の GUI 確認まで完了。Analyze 日付ページ再読み込み後も booking curve localStorage key は再生成されない。

## Current State

- RAU の当面の主線は、`レート調整特化 + 人数なしの簡易フォーキャスト` とする。
- RAR の本格 RMS 実装は一旦保留し、人数データまたは DWH 連携の見通しが立った時点で再開判断する。
- Analyze 日付ページの booking curve Phase 1 は実装済み。
- Phase 1 では、ホテル全体 block と室タイプ別 card に、常時表示の `全体` 系列と、`個人 / 団体` toggle で切り替える second panel を表示する。
- Phase 1 の booking curve は、custom SVG、hover tooltip、capacity 基準 y 軸、rank 変更履歴 marker、未来 stay_date の観測 LT 打ち切り、`ACT` 空表示を含む。
- 現行 current UI では、legacy sales-setting card が無い場合でも synthetic room-type host を生成し、overall summary、rank overview、room-group table、室タイプ別 booking curve を表示できる。
- 月次実績画面の LT 基準 custom booking curve は、Analyze reference curve が一段落するまで優先度を下げる。
- `RAU-AF-01` は完了。2026-04-24 時点のログイン済み Revenue Assistant 環境で、`/api/v4/booking_curve` はホテル全体と全 6 室タイプについて、対象 `stay_date` 以外の比較対象日付でも 200 応答を返すことを確認した。
- `/api/v4/booking_curve` の response に `batch-date` は含まれない。`batch-date` は既存の同期文脈または cache key 側で扱う。
- `RAU-AF-02` で置いた first wave の `直近 7 泊日中央値` と `last_year_room_sum` 優先定義は、2026-04-24 の BCL repo 再確認により仮定義として扱う。今後の仕様ターゲットは `D-20260424-005` の BCL-tuned 定義へ差し替える。
- `RAU-AF-03` は UI shell としてコード実装済み。ホテル全体 block と開いた室タイプ card に、`現在 / 直近型 / 季節型` の legend、参考線、個別表示切替を追加した。
- `RAU-AF-03` の算出ロジックは仮定義のため、`RAU-AF-04` 以降で BCL-tuned 算出ロジック、IndexedDB derived cache、request scheduler へ差し替える。
- `RAU-AF-03` の GUI 確認は、Chrome CDP で build 済み `dist` を Analyze 日付ページへ注入して確認済み。Tampermonkey 側で `dist/*.user.js` を正式に再読込しての確認は未実施。
- `docs/spec_002_curve_core.md` を追加し、canonical input / output、reference curve、将来の forecast extension、将来の evaluation extension の正本とした。
- `RAU-AF-04` は実装済み。`src/curveCore.ts` に、canonical input / output、Revenue Assistant booking curve response adapter、`recent_weighted_90`、`seasonal_component`、候補 stay_date 生成、diagnostics を追加した。
- `RAU-AF-04` では UI への接続は行っていない。BCL-tuned reference curve を画面へ接続する前に、`RAU-AF-05` で request scheduler と IndexedDB derived cache を実装する。
- `RAU-AF-05` は実装済み。`src/referenceCurveStore.ts` に、derived reference curve の IndexedDB store、cache key builder、`ReferenceCurveResult` record adapter、in-flight compute dedupe、request-level dedupe、同時 request 数制限 scheduler を追加した。
- `RAU-AF-05` の cache 保持は、TTL ではなく `asOfDate` と `algorithmVersion` を key に含めて分離する。古い key の削除は、保存量または再計算頻度が問題になった時点で別判断とする。
- `RAU-AF-06` はコード接続まで実装済み。既存 UI shell の `現在 / 直近型 / 季節型` に、`src/curveCore.ts` と `src/referenceCurveStore.ts` 由来の BCL-tuned reference curve を接続した。
- `RAU-AF-06` の GUI 確認は、`RAU-AF-07` の raw source cache、360 日表示、非同期補完を含む GUI 確認へ吸収する。
- 2026-04-26 に、reference curve の表示範囲は current と同じ `0〜360日前 + ACT` を目標にする方針へ更新した。旧 first wave の `ACT と 0〜120日前` 限定は、`RAU-AF-07` のコード実装で解除した。
- `0日前` と `ACT` は、値が同じ場合でも別概念として扱う。raw source 保存開始前の過去 stay_date では、API 側で `0日前` が実績確定後の値へ上書きされている場合、本当の `0日前` を後から復元できない。
- `RAU-AF-07` はコード実装済み。`src/bookingCurveRawSourceStore.ts` に `/api/v4/booking_curve` raw source 用 IndexedDB store を追加し、`src/main.ts` の booking curve 取得経路へ接続した。
- `RAU-AF-07` では、reference curve の LT 対象を current と同じ `0〜360日前 + ACT` へ戻した。既存 derived cache との混在を避けるため、`recent_weighted_90` と `seasonal_component` の algorithm version を v2 に上げた。
- `RAU-AF-07` では、ホテル全体と室タイプ別 card の reference curve を初期同期の待ち時間から外し、current curve を先に描画してから reference curve を非同期で補うようにした。
- `RAU-AF-07` では、`ReferenceCurveDiagnostics.actComparison` を追加し、`0日前` と `ACT` の rooms、sourceCount、差分を保存できるようにした。`ACT` が `0日前` より低い場合は warning を追加する。
- 2026-04-26 の GUI 確認で、current が先に表示され、reference curve が後から補完されることを確認した。ホテル全体とシングル card で v2 reference curve が表示され、raw source IndexedDB に 142 件、derived reference curve IndexedDB に 36 件の保存を確認した。
- 同じ確認で、`recent_weighted_90:v2` の `ACT` が `0日前` より低くなる warning を確認した。原因は、直近型 ACT 算出で `as_of_date` 以降の未着地 stay_date を final rooms 候補に含めていたことだったため、`recent_weighted_90:v3` では `stayDate < asOfDate` の履歴だけを ACT final sample に使うよう修正した。
- `recent_weighted_90:v3` 修正後、利用者確認により直近型の `0日前 -> ACT` スパイク解消を確認した。
- 直近型は BCL の `recent90w` 相当で進める。LT ごとに `asOfDate - (90 - LT)` から `asOfDate + LT` までの stay_date window を取り、その window 内の観測値を直近ほど重くして平均する。
- 直近型が 165日前付近など途中の LT から始まる場合があるのは、API取得失敗ではなく、その LT の recent90w window 内に非 null 観測値が不足するためと整理した。
- `RAU-UX-01` は判断済み。`団体` は常時3枚目の panel ではなく、`個人 / 団体` toggle として追加する。競合価格は現在値表を複製せず、価格推移 snapshot として後続候補にする。`直近同曜日カーブ` は既定 OFF の補助線として追加候補にする。
- `RAU-AF-08` はコード実装済み。booking curve の second panel は既定 `個人`、必要時 `団体` に切り替えられる。`団体` 選択時は current、直近型、季節型、rank marker tooltip の対象 segment が `group` になる。toggle 状態は画面内 memory で保持し、Revenue Assistant 側の再描画や本 userscript の再同期では維持する。
- `RAU-AF-09` はコード実装済み。booking curve header に `同曜日` toggle を追加し、既定 OFF にした。ON のときだけ target stay_date の `-14日`、`-7日`、`+7日`、`+14日` の booking curve を取得し、薄いグレーの細い破線で補助線として表示する。ホテル全体 block は ON 時に取得し、室タイプ別 card は開いている card だけ取得する。
- booking_curve warm cache の取得順は部屋タイプ別優先ではなく、近い stay_date からホテル全体と全室タイプを揃える。差分更新は、現在の `as_of_date` で未保存の raw source key だけを取得することとし、同じ key は再取得しない。
- `RAU-WC-01` はコード実装済み。Analyze 日付ページ同期後に warm cache queue を作成し、`today + 0日` から `today + 30日` まで、各 stay_date でホテル全体、全室タイプの順に raw source を保存する。IndexedDB に同じ key がある場合は skip する。初期制限は同時取得 1、request 間隔 2.5 秒以上、1 回最大 5 分とし、右下に取得状況 indicator を表示する。日次合計稼働時間の上限は `RAU-WC-02` で撤廃済み。
- `RAU-WC-02` はコード実装済み。warm cache の起動対象をトップカレンダーにも広げ、indicator で stay_date 単位の完了範囲とクールダウン後の自動再開目安を表示する。日次合計稼働時間の上限は撤廃し、document hidden、連続エラー停止の制限は維持する。
- `RAU-WC-02` では、hidden pause 後に `visibilitychange` が発火しない復帰ケースへ対応するため、`pageshow` と `focus` でも warm cache drain を再開する。
- `RAU-WC-02` の `dist/*.user.js` は `npm run build` で再生成済み。Tampermonkey 再読込後の GUI 目視確認が必要。
- `RAU-WC-03` はコード実装済み。Analyze 日付ページを開いた場合は、開いている stay_date、その週、その月、通常 warm cache 範囲の順に取得を優先する。warm cache の完了定義は current raw source だけではなく、reference source raw source、直近型 derived reference curve、季節型 derived reference curve、同曜日 raw source まで含める。
- `RAU-WC-03` では、indicator に対象月または対象範囲と、Analyze 日付の `raw / 参考線 / 同曜日` 取得率を表示する。`dist/*.user.js` は `npm run build` で再生成済み。Tampermonkey 再読込後の GUI 目視確認が必要。
- `RAU-WC-04` はコード実装済み。request 間隔を 1.0 秒、1 回の自動稼働を 10 分、クールダウンを 3 分へ緩和した。IndexedDB raw source が既存で skip できる task は API request を発行しないため即時に次 task へ進める。
- `RAU-AF-10` はコード実装済み。reference curve の `0日前` は core logic と IndexedDB derived cache では推測補完せず、表示層だけで `1日前` と `ACT` の線形補間値を使う。初期実装では `round(1日前 + (ACT - 1日前) * 0.5)` とし、整数室数に丸める。Tooltip では補間値であることを `（補間）` として明示する。
- `RAU-WC-05` はコード実装済み。warm cache indicator は対象日数だけでなく対象日付範囲を表示し、完了前でも一部取得済みの日付数を `進行 n日` として表示する。トップカレンダーの日付セル下端に、一部取得済み、完了、エラーの line を表示する。
- `RAU-WC-06` はコード実装済み。warm cache の通常対象を `as_of_date - 1日` から `as_of_date + 3か月` までへ広げ、failed task の最大 2 回 retry、Analyze 日付ページを開いたときの優先 queue 再開を追加した。
- `RAU-CP-01` は完了。2026-04-30 に Chrome CDP で Analyze 日付ページの Network request を確認し、`GET /api/v5/competitor_prices` が競合価格 endpoint であることを確認した。
- `/api/v5/competitor_prices` には `x-requested-with: XMLHttpRequest` が必要で、query には少なくとも `date`、`min_num_guests`、`max_num_guests`、`yad_nos[]` が必要である。`1〜6名 / 食事条件指定なし` は取得できるが、競合施設一覧なしの広い取得は `400 BAD_REQUEST` になる。
- `/api/v5/competitor_prices` の response は `own` と `competitors` を持つ。plan は人数、食事条件、プラン名、じゃらん部屋タイプ、URL、価格、自社価格との差分を持つが、在庫状態、販売停止、満室、ページング情報は持たない。
- `RAU-CP-02` はコード実装済み。`src/competitorPriceSnapshotStore.ts` に competitor price snapshot の IndexedDB store、request builder、response adapter、同じ検索条件 signature の最新 snapshot read path を追加した。
- `RAU-CP-02` では、Analyze 日付ページ同期時に、同じ施設、stay_date、batch date につき 1 回だけ snapshot 保存を試す。競合価格 UI と warm cache 接続は実装していない。
- `RAU-CP-03` はコード実装済み。保存済み snapshot を使い、販売設定タブではなく競合価格タブ内の標準表より下に、`1名`、`2名`、`3名`、`4名` の人数別最安値グラフを縦 4 ブロックで表示する。部屋タイプと食事条件は toggle button の簡易絞り込みとして扱い、部屋タイプ名は `シングル`、`ダブル`、`ツイン`、`トリプル` などのカタカナ表記へ寄せる。グラフ Tooltip では取得日ごとの施設別最安値と前回差分を表示する。indicator には競合価格 snapshot の状態を表示し、詳細を折りたためる最小化 button を持たせる。競合価格 tab を開いた場合は現在開いている stay_date の snapshot 取得を優先する。
- `RAU-CP-03` の GUI 確認は、Chrome CDP で build 済み `dist` を Analyze 日付ページへ注入して確認済み。2026-05-01 に `競合価格 -> 販売設定 -> 競合価格` と遷移した場合でも、2 回目の競合価格タブで `競合価格 最安値推移` が 1 セクション、4 panel、4 SVG で再表示されることを確認した。同じ日に、2日分の競合価格グラフが旧表示の `54〜736` 両端配置ではなく、`315〜475` の短い中央寄せ幅で表示されることを確認した。Tampermonkey 側で `dist/*.user.js` を正式に再読込しての確認は未実施。
- `RAU-WC-07` はコード実装済み。2026-04-30 の GUI 確認で既存 booking curve localStorage 書き込みの `QuotaExceededError` が出たため、競合価格表示の次に保存量整理を行った。Chrome CDP 確認では、localStorage 全体約 5.18 MB のうち、booking curve localStorage key 36 件が約 5.16 MB を占めていた。
- `RAU-WC-07` の実装では、`src/main.ts` の booking curve 取得経路から localStorage persistent cache の読み込みと書き込みを外し、既存 key は `revenue-assistant:group-room-count:v4:<facility>:booking-curve:` の facility prefix に限定して削除する。IndexedDB raw source、derived reference curve、競合価格 snapshot は削除対象にしない。
- Tampermonkey 側を `a4c4cc9` の build に更新後、Chrome CDP で Analyze 日付ページ `https://ra.jalan.net/analyze/2026-06-17` を再読み込みして確認した。localStorage の booking-curve key は 0 件、booking-curve bytes は 0 のまま維持された。販売設定タブ内では group rows 6 件、overall summary 1 件、rank overview 1 件、booking curve section 1 件、booking curve SVG 2 件を確認した。`QuotaExceededError` は再発していない。

## Next Re-entry

最初に読む正本:

1. `AGENTS.md`
2. `docs/context/STATUS.md`
3. `docs/tasks_backlog.md`
4. `docs/context/INTENT.md`
5. `docs/context/DECISIONS.md`
6. `docs/spec_000_overview.md`
7. `docs/spec_001_analyze_expansion.md`
8. `docs/spec_002_curve_core.md`

最初にやること:

1. `docs/tasks_backlog.md` の `RAU-WC-07` を確認する。
2. 次に進む場合は、`docs/tasks_backlog.md` の `Now` から次の安定化または競合価格系 task を選ぶ。
3. 競合価格を続ける場合は、競合価格タブ内の保存済み snapshot 表示と indicator の表示密度を、実画面で見ながら調整する。
4. booking curve 側を続ける場合は、reference curve 取得率が低い日付で、表示待ち、取得中、取得不可の区別が十分かを確認する。

変更しない契約:

- 人数 forecast は扱わない。
- PMS データ、BCL Python 実装、RAR 同期、外部 DB を first wave の前提にしない。
- 予測モデル、予測評価、学習済みパラメータ固定は `RAU-AF-04` の完了条件にしない。
- 自動レート変更は扱わない。
- 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示、current-ui supplement portal を壊さない。
- `dist/*.user.js` は手編集しない。
- 室タイプ別 reference curve の追加取得は、初期画面表示時に全室タイプ分を一括で先読みしない。
- warm cache は、表示同期の待ち時間に入れず、低優先度 queue として時間制限つきで進める。
- 旧 `直近 7 泊日中央値` と `last_year_room_sum` 優先ロジックへ、データ不足時に暗黙 fallback しない。
- raw source 保存開始前の過去 stay_date について、本当の `0日前` を推測で復元しない。

## Verify / Confirmation State

- docs-only の再開準備では、`git diff --check` と正本参照の整合確認を最小 verify とする。
- 実装に入る場合の最小 verify は `npm run typecheck`、`npm run lint`、`npm run build` とする。
- GUI まで触る場合は、Tampermonkey 側で `dist/*.user.js` を再読込してから Analyze 日付ページで確認する。
- GUI 確認時の対象:
  - Analyze 日付ページの販売設定タブ
  - ホテル全体 booking curve block
  - 室タイプ別 booking curve card
  - rank marker tooltip
  - current-ui supplement portal、overall summary、rank overview、room-group table
- 2026-04-24 のコード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - Chrome CDP 注入 GUI 確認: ホテル全体 block、開いた室タイプ card、reference curve legend、破線の参考線、`季節型` toggle は確認済み
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-25 の `RAU-AF-06` コード接続 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run chrome:pages`: CDP 接続は成功。open pages は root と Tampermonkey dashboard
  - Analyze 日付ページ GUI 確認: 未実施
- 2026-04-26 の `RAU-AF-07` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run chrome:pages`: CDP 接続は成功。open pages は Tampermonkey dashboard と Analyze 日付ページ
  - Analyze 日付ページ GUI 確認: Tampermonkey 再読込後、current 先行表示、reference curve 非同期補完、360 日 reference curve、IndexedDB 保存件数を確認
  - `recent_weighted_90:v3` 修正後の Tampermonkey 再読込 GUI 確認: 利用者確認により `0日前 -> ACT` スパイク解消を確認
- 2026-04-26 の `RAU-AF-08` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `npm run chrome:pages`: CDP 接続は成功。open pages は Tampermonkey dashboard と Analyze 日付ページ
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-26 の `RAU-AF-09` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-26 の `RAU-WC-01` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 実ブラウザ上で request 間隔、skip、hidden pause の挙動確認: 未実施
- 2026-04-29 の `RAU-WC-02` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - `npm run chrome:pages`: passed。open pages は Tampermonkey dashboard、chrome-error tab、Revenue Assistant root
  - トップカレンダー GUI 確認: indicator 表示と取得開始は確認済み。表示は `データ取得: 取得中 0 / 31日`、詳細は `完了 なし / 保存 5 / skip 1 / 今日 0/30分` だった。日次上限撤廃後は `今日 x/30分` を表示しない。
  - hidden pause 復帰補正: `pageshow` と `focus` でも warm cache drain を再開する修正を追加し、`npm run typecheck`、`npm run lint`、`npm run build` は再通過
  - 日次合計稼働時間の上限撤廃後、`npm run typecheck`、`npm run lint`、`npm run build` は再通過
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 実ブラウザ上でトップカレンダー表示中の indicator、日付単位完了範囲、クールダウン後自動再開の確認: 未実施
- 2026-04-29 の `RAU-WC-03` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - Analyze 日付ページで、その日、同週、同月の順に取得が優先されること: 未実施
  - Indicator の `raw / 参考線 / 同曜日` 取得率が実データに応じて進むこと: 未実施
- 2026-04-29 の `RAU-WC-04` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
- 2026-04-29 の `RAU-AF-10` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 実データで `0日前` Tooltip に `（補間）` が表示されること: 未実施
- 2026-04-29 の `RAU-WC-05` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - トップカレンダー上で一部取得済み、完了、エラー line が実データに応じて表示されること: 未実施
- 2026-04-29 の `RAU-WC-06` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed
  - `git diff --check`: passed
  - Tampermonkey 再読込 GUI 確認: 未実施
  - 通常対象が `as_of_date - 1日` から `as_of_date + 3か月` までになること: 未実施
  - retry 発生時に `再試行待ち n` が表示されること: 未実施
  - トップカレンダー cooldown 中に Analyze 日付ページを開いたとき priority queue が動き始めること: 未実施
- 2026-04-30 の `RAU-CP-01` Chrome CDP 調査:
  - `npm run chrome:pages`: passed。open pages は Tampermonkey dashboard と Revenue Assistant root
  - Analyze 日付ページ `https://ra.jalan.net/analyze/2026-04-30` を開き、Network request を確認
  - `GET /api/v5/competitor_prices`、`GET /api/v2/competitors`、`GET /api/v2/competitors_filter_settings` を確認
  - `x-requested-with: XMLHttpRequest` 付きの同一 origin fetch で、保存条件あり、食事条件省略、plan name 検索 flag 省略、1名のみ、競合施設一覧なし、宿泊人数範囲なし、`date` のみ、`max_num_guests=10` を比較
  - `docs/spec_001_analyze_expansion.md`、`docs/context/DECISIONS.md`、`docs/tasks_backlog.md` を更新
- 2026-04-30 の `RAU-CP-02` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。初回は sandbox 内で esbuild spawn が `EPERM` になったため、権限許可後に再実行して通過
  - `git diff --check`: passed
  - Tampermonkey 更新後の GUI 確認: passed。Analyze 日付ページ `https://ra.jalan.net/analyze/2026-04-30` で確認
  - RAU 側の `/api/v5/competitor_prices?date=20260430&min_num_guests=1&max_num_guests=6&yad_nos[]=...`: `200`
  - IndexedDB `revenue-assistant-competitor-price-snapshots` / `competitor-price-snapshots`: snapshot 2 件。最新 snapshot は `facilityId=yad:358180`、`stayDate=20260430`、競合施設 5 件、自社 plan 6 件、競合 plan hotel 5 件
  - 同じ検索条件 signature の前回 snapshot 取得: passed。console log の `competitor price snapshot stored` で `previousFetchedAt=2026-04-30T02:10:25.817Z` を確認
- 2026-04-30 の `RAU-CP-03` コード実装 verify:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm run build`: passed。sandbox 内で esbuild spawn が `EPERM` になるため、権限許可後に実行して通過
  - `git diff --check`: passed
  - Chrome CDP build 注入 GUI 確認: passed。競合価格 tab 内に `競合価格 最安値推移` が 1 セクション表示され、`1名`、`2名`、`3名`、`4名` の 4 panel が縦 4 ブロックで表示されることを確認
  - 競合価格 filter GUI 確認: passed。部屋タイプと食事条件の pull-down が 0 件になり、toggle button として表示されることを確認。部屋タイプ toggle は `シングル`、`ダブル`、`ツイン`、`トリプル` のカタカナ表記で重複なく表示されることを確認
  - 競合価格 Tooltip GUI 確認: passed。取得日軸 hover で Tooltip が表示され、施設別最安値と前回差分欄が表示されることを確認
  - indicator 最小化 GUI 確認: partially passed。`最小化` button で詳細表示が非表示になることを確認。Chrome CDP 注入確認では既存 Tampermonkey と build 注入が同時に動くため、`表示` button による再表示は Tampermonkey 正式再読込後に確認する
  - 販売設定 tab GUI 確認: passed。販売設定 tab に戻ったとき、RAU の競合価格セクションが 0 件になることを確認
  - 競合価格 tab 限定表示の回帰確認: passed。2026-05-14 の Analyze 日付ページで販売設定 tab 下部に `競合価格 最安値推移` が割り込まないこと、2026-04-30 の競合価格 tab 本文では `競合価格 最安値推移` が 1 セクション、4 panel で表示されることを Chrome CDP build 注入で確認
  - Tampermonkey 正式再読込後の GUI 目視確認: 未実施

## Open Questions / Risks

- BCL-tuned `直近型カーブ` は、同じ曜日の履歴 stay_date を LT ごとに集計するため、仮実装より request 数が増える。
- BCL-tuned `季節型カーブ` は、前年同月と 2 年前同月の同じ曜日の履歴 stay_date から final rooms と LT 比率を解決する必要がある。Revenue Assistant response だけで final rooms を常に解決できるかは実装中に確認する。
- derived reference curve の IndexedDB 保持は、初期実装では `algorithmVersion` と `asOfDate` を key に含めて分離する。TTL や古い key の削除はまだ実装しない。
- reference curve を初期表示で見せるため、表示密度が上がる。`直近型カーブ` と `季節型カーブ` の個別表示切替で緩和する。
- 予測モデルと予測評価は将来候補として視野に入れる。まず `RAU-AF-04` では、forecast / evaluation が後で使える input、output、diagnostics を壊さない形で core logic を作る。
- `RAU-AF-08` では、`個人 / 団体` toggle を chart header に追加した。既存の `直近型 / 季節型` toggle と役割が混ざらないかは Tampermonkey 再読込後の GUI 目視で確認する必要がある。
- 現行コードでは `recent_weighted_90` の `ACT` は `as_of_date` より前に宿泊済みの履歴 stay_date から final rooms 相当を作り、`seasonal_component` の `ACT` は final rooms 推定値から作っている。`0日前` と `ACT` の段差が不自然に見える場合は、`actComparison`、source stay_date の混在、segment 解決、Revenue Assistant API の過去 point 上書き仕様を切り分ける必要がある。
- `RAU-AF-09` の直近同曜日カーブは線の本数を増やすため、既定 OFF とし、薄いグレー破線で視覚優先度を下げる。Tampermonkey 再読込後、ON/OFF、hover 表示、室タイプ別 card を開いたときの追加取得を GUI 目視で確認する必要がある。
- `RAU-WC-01` では、API 負荷と IndexedDB 保存量が増えるため、同時取得 1、request 間隔、1 回稼働時間、1 日稼働時間、hidden 時の一時停止、連続エラー停止を verify 対象にする。
- 競合価格は現在値表ではなく、価格推移 snapshot の保存単位を設計してから表示判断する。
- 競合価格 snapshot は、競合施設一覧なしの全件取得を前提にしない。
- 検索条件 signature が違う競合価格 snapshot を同じ推移系列として扱わない。
- 競合施設を入れ替えても、過去 snapshot の競合施設名と `yad_no` を現在の競合施設一覧で上書きしない。
- 競合価格 response だけで、在庫状態、販売停止、満室を確定した扱いにしない。
- `RAU-CP-03` は build 注入確認まで完了したが、Tampermonkey 正式再読込後の目視確認は残る。
- 2026-04-30 の GUI 確認中、既存 booking curve の localStorage persistent cache 書き込みで `QuotaExceededError` warning が複数出た。競合価格 snapshot は IndexedDB に保存できているが、booking curve 側の localStorage 容量超過は `RAU-WC-07` で整理対象にする。

## References

- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- Curve core 仕様: `docs/spec_002_curve_core.md`
- 残タスク: `docs/tasks_backlog.md`
