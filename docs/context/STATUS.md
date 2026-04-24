# STATUS

最終更新: 2026-04-24

## Current Task Bundle

- 主対象: `RAU-AF-03` Analyze booking curve reference curve の UI first wave を実装する
- この bundle で扱う Task ID:
  - `RAU-AF-03` Analyze booking curve reference curve の UI first wave を実装する
- 今回の目的:
  - Analyze 日付ページの日別 booking curve を、部屋タイプ別のレート調整に使える判断画面へ拡張する。
  - BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を、ホテル全体 block と室タイプ別 card の既存 booking curve へ追加する。

## Current State

- RAU の当面の主線は、`レート調整特化 + 人数なしの簡易フォーキャスト` とする。
- RAR の本格 RMS 実装は一旦保留し、人数データまたは DWH 連携の見通しが立った時点で再開判断する。
- Analyze 日付ページの booking curve Phase 1 は実装済み。
- Phase 1 では、ホテル全体 block と室タイプ別 card に `全体 / 個人` の rooms 系列を表示する。
- Phase 1 の booking curve は、custom SVG、hover tooltip、capacity 基準 y 軸、rank 変更履歴 marker、未来 stay_date の観測 LT 打ち切り、`ACT` 空表示を含む。
- 現行 current UI では、legacy sales-setting card が無い場合でも synthetic room-type host を生成し、overall summary、rank overview、room-group table、室タイプ別 booking curve を表示できる。
- 月次実績画面の LT 基準 custom booking curve は、Analyze reference curve が一段落するまで優先度を下げる。
- `RAU-AF-01` は完了。2026-04-24 時点のログイン済み Revenue Assistant 環境で、`/api/v4/booking_curve` はホテル全体と全 6 室タイプについて、対象 `stay_date` 以外の比較対象日付でも 200 応答を返すことを確認した。
- `/api/v4/booking_curve` の response に `batch-date` は含まれない。`batch-date` は既存の同期文脈または cache key 側で扱う。
- `RAU-AF-02` は完了。first wave の `直近型カーブ` は対象 `stay_date` の直前 7 泊日を中央値で集約し、`季節型カーブ` は response 内の `last_year_room_sum` を優先して使う。
- `RAU-AF-03` はコード実装済み。ホテル全体 block と開いた室タイプ card に、`現在 / 直近型 / 季節型` の legend、参考線、個別表示切替を追加した。
- `RAU-AF-03` の GUI 確認は、Chrome CDP で build 済み `dist` を Analyze 日付ページへ注入して確認済み。Tampermonkey 側で `dist/*.user.js` を正式に再読込しての確認は未実施。

## Next Re-entry

最初に読む正本:

1. `AGENTS.md`
2. `docs/context/STATUS.md`
3. `docs/tasks_backlog.md`
4. `docs/context/INTENT.md`
5. `docs/context/DECISIONS.md`
6. `docs/spec_000_overview.md`
7. `docs/spec_001_analyze_expansion.md`

最初にやること:

1. Tampermonkey 側で `dist/*.user.js` を再読込する。
2. Analyze 日付ページの販売設定タブを開き、ホテル全体 block で `現在 / 直近型 / 季節型` の legend と参考線が表示されることを確認する。
3. 室タイプ別 card を 1 つ開き、同じ legend と参考線が表示され、`直近型` と `季節型` の表示切替が効くことを確認する。
4. 問題がなければ `RAU-AF-03` を完了扱いにし、次は `RAU-UX-01` へ進む。

変更しない契約:

- 人数 forecast は扱わない。
- PMS データ、BCL Python 実装、RAR 同期、外部 DB を first wave の前提にしない。
- 自動レート変更は扱わない。
- 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示、current-ui supplement portal を壊さない。
- `dist/*.user.js` は手編集しない。
- 室タイプ別 reference curve の追加取得は、初期画面表示時に全室タイプ分を一括で先読みしない。

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

## Open Questions / Risks

- `直近型カーブ` は、室タイプ card を開いたタイミングで追加取得するため、連続して複数 card を開いたときの request 数が増える。
- reference curve を初期表示で見せるため、表示密度が上がる。`直近型カーブ` と `季節型カーブ` の個別表示切替で緩和する。
- 室タイプ別 reference curve で localStorage 使用量が増える可能性がある。実装中に cache payload の圧縮範囲を確認する。

## References

- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- 残タスク: `docs/tasks_backlog.md`
