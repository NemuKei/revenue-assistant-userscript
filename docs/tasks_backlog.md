# tasks_backlog

## Active Backlog

- 販売設定タブの販売室数差分を、`booking_curve` ベースのまま維持するか、`/api/v3/suggest/output/details` ベースへ寄せるかを判断する
- booking curve の placeholder 系列を `/api/v4/booking_curve` 実データへ置き換える
- 全体 block と各室タイプ card で、`全体 / 個人` 系列の current 値と LT 系列の採用元を確定する
- `団体` 系列を Phase 1 の標準 UI に含めるかは、実装後の使用感を見て再判断する
- 室タイプ別 booking curve の LT 軸で、bucket 集約値、null fallback、`ACT` 採用条件を実データで確定する
- GUI verify 手順を、build 完了だけでなく Tampermonkey 再読込込みで固定する
- `同月同曜日` baseline と `IndexedDB` 導入要否を Phase 2 で再判断する
- `booking_curve` と販売設定タブ再同期の request 数を見直し、月送り時の体感速度を改善する
- `/api/v5/competitor_prices` を使った競合価格表の導入要否と最小表示仕様を決める
