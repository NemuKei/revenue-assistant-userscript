# STATUS

最終更新: 2026-04-24

## Current Task Bundle

- 主対象: `RAU-AF-04` BCL-tuned reference curve の算出コアを実装する
- この bundle で扱う Task ID:
  - `RAU-AF-04` BCL-tuned reference curve の算出コアを実装する
  - `RAU-AF-05` reference curve の IndexedDB cache と request scheduler を実装する
  - `RAU-AF-06` BCL-tuned reference curve を既存 UI shell へ接続して GUI 確認する
- 今回の目的:
  - Analyze 日付ページの日別 booking curve を、部屋タイプ別のレート調整に使える判断画面へ拡張する。
  - BCL repo の booking curve 画面で使う算出ロジックを参照し、RAU の `/api/v4/booking_curve` response だけで成立する rooms-only reference curve へチューニングする。
  - booking curve core logic を UI、API 取得、storage から分離し、将来の別プロジェクト、予測モデル、予測評価でも再利用できる形にする。
  - request 数増加で画面操作が重くならないよう、derived reference curve cache と request scheduling を設計する。

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
- `RAU-AF-02` で置いた first wave の `直近 7 泊日中央値` と `last_year_room_sum` 優先定義は、2026-04-24 の BCL repo 再確認により仮定義として扱う。今後の仕様ターゲットは `D-20260424-005` の BCL-tuned 定義へ差し替える。
- `RAU-AF-03` は UI shell としてコード実装済み。ホテル全体 block と開いた室タイプ card に、`現在 / 直近型 / 季節型` の legend、参考線、個別表示切替を追加した。
- `RAU-AF-03` の算出ロジックは仮定義のため、`RAU-AF-04` 以降で BCL-tuned 算出ロジック、IndexedDB derived cache、request scheduler へ差し替える。
- `RAU-AF-03` の GUI 確認は、Chrome CDP で build 済み `dist` を Analyze 日付ページへ注入して確認済み。Tampermonkey 側で `dist/*.user.js` を正式に再読込しての確認は未実施。
- `docs/spec_002_curve_core.md` を追加し、canonical input / output、reference curve、将来の forecast extension、将来の evaluation extension の正本とした。

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

1. `RAU-AF-04` として、`docs/spec_002_curve_core.md` の canonical input / output を TypeScript 型へ落とす。
2. Revenue Assistant の `/api/v4/booking_curve` response 群を canonical input と `stay_date x LT` rooms matrix へ変換する adapter / pure function の置き場所を決める。
3. BCL repo の `recent90w` 相当と seasonal component 相当を、RAU の LT tick と `all / transient` 系列で扱える TypeScript 関数として実装する。
4. 実装中に final rooms の解決規則、diagnostics、履歴不足時の扱いが仕様本文とずれた場合は、先に `docs/spec_002_curve_core.md` を更新する。
5. `RAU-AF-04` の verify が通ったら、次は `RAU-AF-05` の IndexedDB derived cache と request scheduler へ進む。

変更しない契約:

- 人数 forecast は扱わない。
- PMS データ、BCL Python 実装、RAR 同期、外部 DB を first wave の前提にしない。
- 予測モデル、予測評価、学習済みパラメータ固定は `RAU-AF-04` の完了条件にしない。
- 自動レート変更は扱わない。
- 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示、current-ui supplement portal を壊さない。
- `dist/*.user.js` は手編集しない。
- 室タイプ別 reference curve の追加取得は、初期画面表示時に全室タイプ分を一括で先読みしない。
- 旧 `直近 7 泊日中央値` と `last_year_room_sum` 優先ロジックへ、データ不足時に暗黙 fallback しない。

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

- BCL-tuned `直近型カーブ` は、同じ曜日の履歴 stay_date を LT ごとに集計するため、仮実装より request 数が増える。
- BCL-tuned `季節型カーブ` は、前年同月と 2 年前同月の同じ曜日の履歴 stay_date から final rooms と LT 比率を解決する必要がある。Revenue Assistant response だけで final rooms を常に解決できるかは実装中に確認する。
- derived reference curve の IndexedDB 保持期間は未確定。初期実装では `algorithm_version` と `as_of_date` を key に含め、保持期間は `RAU-AF-05` で暫定判断する。
- reference curve を初期表示で見せるため、表示密度が上がる。`直近型カーブ` と `季節型カーブ` の個別表示切替で緩和する。
- 予測モデルと予測評価は将来候補として視野に入れる。まず `RAU-AF-04` では、forecast / evaluation が後で使える input、output、diagnostics を壊さない形で core logic を作る。

## References

- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- Curve core 仕様: `docs/spec_002_curve_core.md`
- 残タスク: `docs/tasks_backlog.md`
