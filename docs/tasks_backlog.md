# tasks_backlog

## Active Backlog

- 月次実績画面の custom booking curve は LT 基準を正とし、予約日基準 chart の派生表示として最小 UI、差し込み位置、`予約日 -> LT` 変換方針を決める
- 月次実績画面の実装は同一 userscript 上で進め、追加済み route-scoped 起動境界、monthly-progress 専用 storage namespace、kill switch の上で verify 境界と DOM 差し込み責務を固める
- monthly-progress の `/api/v1/booking_curve/monthly` write-only snapshot を、baseline や過去比較の read path へ繋ぐ最初の利用箇所を決める
- 日別と同じ LT バケット集約系列を、どの UI block とラベル表示仕様へ接続するか決める
- `同月同曜日` baseline を `全体 block のみ` で始めるか、室タイプ card まで含めるかを決める
- 選んだ baseline scope で、write-only 保存済み IndexedDB snapshot をどこまで read 利用するかを決める
- `団体` 系列を booking curve の標準 UI に含めるかを、実装後の使用感で再判断する
- 室タイプ別 booking curve の rank 変更履歴 marker の見え方と tooltip 情報量の polish を必要なら継続する
- `/api/v5/competitor_prices` を使った競合価格表の導入要否と最小表示仕様を決める
