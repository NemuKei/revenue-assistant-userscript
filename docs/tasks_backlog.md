# tasks_backlog

## Active Backlog

- 販売設定タブの販売室数差分を、`booking_curve` ベースのまま維持するか、`/api/v3/suggest/output/details` ベースへ寄せるかを判断する
- 最上段の全体 block にホテル全体 booking curve を常時展開で追加し、`全体` と `個人` を横並びで表示する
- 各室タイプカードへ、`室数` のみ・baseline なしの booking curve を段階導入し、各 card は既定で閉じた表示にする
- 各室タイプ card の開閉トリガーをその block 自身に持たせ、開いたときは `全体` と `個人` を横並びで表示する
- `団体` 系列を Phase 1 の標準 UI に含めるかは、実装後の使用感を見て再判断する
- 室タイプ別 booking curve の LT 軸を bucket 集約表示で定義し、`ACT` を `0日前` と分離した tick 仕様で実装する
- `同月同曜日` baseline と `IndexedDB` 導入要否を Phase 2 で再判断する
- `booking_curve` と販売設定タブ再同期の request 数を見直し、月送り時の体感速度を改善する
- `/api/v5/competitor_prices` を使った競合価格表の導入要否と最小表示仕様を決める
