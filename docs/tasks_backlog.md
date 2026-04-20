# tasks_backlog

## Active Backlog

- 月次実績画面の custom booking curve は LT 基準を正とし、予約日基準 chart の派生表示として最小 UI、差し込み位置、`予約日 -> LT` 変換方針を決める
- `同月同曜日` baseline を `全体 block のみ` で始めるか、室タイプ card まで含めるかを決める
- 選んだ baseline scope で localStorage headroom が足りるかを試算する
- localStorage headroom が不足する場合だけ、booking_curve persistent cache 限定で `IndexedDB` 移行案を切る
- `団体` 系列を booking curve の標準 UI に含めるかを、実装後の使用感で再判断する
- 室タイプ別 booking curve の rank 変更履歴 marker の見え方と tooltip 情報量の polish を必要なら継続する
- `/api/v5/competitor_prices` を使った競合価格表の導入要否と最小表示仕様を決める
