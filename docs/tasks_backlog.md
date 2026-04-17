# tasks_backlog

## Active Backlog

- 販売設定タブの販売室数差分を、`booking_curve` ベースのまま維持するか、`/api/v3/suggest/output/details` ベースへ寄せるかを判断する
- `団体` 系列を Phase 1 の標準 UI に含めるかは、実装後の使用感を見て再判断する
- 室タイプ別 booking curve の LT 軸で、過去 stay_date を含む spot check を行い、bucket 集約値、null fallback、`ACT` 空表示を追認する
- `同月同曜日` baseline と `IndexedDB` 導入要否を Phase 2 で再判断する
- `booking_curve` と販売設定タブ再同期の request 数を見直し、月送り時の体感速度を改善する
- `/api/v5/competitor_prices` を使った競合価格表の導入要否と最小表示仕様を決める
