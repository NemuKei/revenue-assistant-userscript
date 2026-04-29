# STATUS

最終更新: 2026-04-29

## Current Task Bundle

- 主対象: `RAU-CP-01` 競合価格推移 snapshot の価値と保存単位を設計する
- この bundle で扱う Task ID:
  - `RAU-CP-01` 競合価格推移 snapshot の価値と保存単位を設計する
- 今回の目的:
  - 競合価格の現在値表を複製するのではなく、取得時点つき snapshot を保存し、競合価格が直近で上がったか、下がったかを追跡できる形を設計する。
  - 全件取得を前提にせず、Analyze 日付ページを開いた日付や、料金判断のために繰り返し確認された日付ほど snapshot 履歴が厚くなる設計にする。
  - 最初の作業は、絞り込みなし、空条件、または初期条件に近い request で競合価格 data を取得できるかを調査することに限定する。
  - response に人数、食事条件、部屋タイプ、プラン名、在庫状態が含まれるかを確認し、保存後に RAU 側で絞り込みできるかを判断する。

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
- `RAU-CP-01` は次の本線。最初の調査は、Chrome CDP で競合価格タブまたは Analyze 日付ページの network を確認し、競合価格 endpoint、request 条件、response shape、絞り込みなし取得可否を整理する。調査が終わるまで IndexedDB store と UI は実装しない。

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

1. Chrome CDP で Revenue Assistant の競合価格タブを開き、Network request を確認する。
2. 競合価格 endpoint、request method、query/payload、検索条件、response shape を記録する。
3. 絞り込みなし、空条件、または初期条件に近い request で競合価格 data を取得できるかを確認する。
4. response に人数、食事条件、部屋タイプ、プラン名、在庫状態、満室、販売停止、価格が含まれるかを確認する。
5. 調査結果を `docs/tasks_backlog.md` の `RAU-CP-01` と `docs/context/DECISIONS.md` へ反映し、次の実装 slice を決める。

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
- `RAU-CP-01` では、絞り込みなし取得が可能かを調査するまで、検索条件 signature、IndexedDB schema、表示 UI を確定しない。

## References

- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- Curve core 仕様: `docs/spec_002_curve_core.md`
- 残タスク: `docs/tasks_backlog.md`
