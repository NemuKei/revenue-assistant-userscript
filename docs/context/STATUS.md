# STATUS

最終更新: 2026-04-24

## Current Task Bundle

- 主対象: `RAU-AF-01` Analyze booking curve reference curve のデータ取得可否を確認する
- この bundle で扱う Task ID:
  - `RAU-AF-01` Analyze booking curve reference curve のデータ取得可否を確認する
  - `RAU-AF-02` 直近型カーブ / 季節型カーブの first wave 定義を固定する
- 今回の目的:
  - Analyze 日付ページの日別 booking curve を、部屋タイプ別のレート調整に使える判断画面へ拡張する。
  - BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を、Revenue Assistant の booking curve 系データだけで成立させられるか確認する。

## Current State

- RAU の当面の主線は、`レート調整特化 + 人数なしの簡易フォーキャスト` とする。
- RAR の本格 RMS 実装は一旦保留し、人数データまたは DWH 連携の見通しが立った時点で再開判断する。
- Analyze 日付ページの booking curve Phase 1 は実装済み。
- Phase 1 では、ホテル全体 block と室タイプ別 card に `全体 / 個人` の rooms 系列を表示する。
- Phase 1 の booking curve は、custom SVG、hover tooltip、capacity 基準 y 軸、rank 変更履歴 marker、未来 stay_date の観測 LT 打ち切り、`ACT` 空表示を含む。
- 現行 current UI では、legacy sales-setting card が無い場合でも synthetic room-type host を生成し、overall summary、rank overview、room-group table、室タイプ別 booking curve を表示できる。
- 月次実績画面の LT 基準 custom booking curve は、Analyze reference curve が一段落するまで優先度を下げる。

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

1. `RAU-AF-01` として、`/api/v4/booking_curve` が比較対象 `stay_date` と `rm_room_group_id` の組み合わせで安定取得できるかを確認する。
2. 取得できる場合は、response のキー、`batch-date`、`all.this_year_room_sum`、`transient.this_year_room_sum`、`group.this_year_room_sum` の有無を、ホテル全体と室タイプ別で比較する。
3. 取得できない場合は、reference curve first wave を「現在表示中 stay_date の周辺 API 取得」ではなく、既存 cache / monthly-progress snapshot / 別 endpoint のどれで組むかを再判断する。
4. `RAU-AF-02` として、`直近型カーブ` と `季節型カーブ` の比較対象日付選定を固定する。

変更しない契約:

- 人数 forecast は扱わない。
- PMS データ、BCL Python 実装、RAR 同期、外部 DB を first wave の前提にしない。
- 自動レート変更は扱わない。
- 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示、current-ui supplement portal を壊さない。
- `dist/*.user.js` は手編集しない。

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

## Open Questions / Risks

- `/api/v4/booking_curve` が任意の比較対象 `stay_date` と `rm_room_group_id` の組み合わせで安定取得できるか未確認。
- `直近型カーブ` を直近何日または何件の comparable stay_date から作るか未確定。
- `季節型カーブ` を前年同日、前年同曜日、同月同曜日のどれから始めるか未確定。
- reference curve を常時表示にするか、toggle 表示にするか未確定。
- 室タイプ別 reference curve で request 数と localStorage 使用量が増える可能性がある。

## References

- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- 残タスク: `docs/tasks_backlog.md`
