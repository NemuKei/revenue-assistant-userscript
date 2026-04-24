# tasks_backlog

## Active Backlog

- Analyze 日付ページの日別 booking curve に、BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を重ねる実装を最優先に戻す
- reference curve は、ホテル全体 block と室タイプ別 card の両方を対象にし、部屋タイプ別のレート調整判断に使えることを受け入れ条件にする
- 実装前に、`/api/v4/booking_curve` が比較対象日付と `rm_room_group_id` の組み合わせで安定取得できるかを確認する
- `直近型カーブ` と `季節型カーブ` の初期定義を、Revenue Assistant の booking curve 系データだけで閉じる。人数、PMS データ、RAR 同期は前提にしない
- 月次実績画面の custom booking curve は LT 基準を正とし、追加済み 2 カラム multi-month chart を graph へどう段階拡張するか決める
- 月次実績画面の実装は同一 userscript 上で進め、追加済み route-scoped 起動境界、monthly-progress 専用 storage namespace、kill switch の上で verify 境界と DOM 差し込み責務を固める
- monthly-progress の `/api/v1/booking_curve/monthly` write-only snapshot を、baseline や過去比較の read path へ繋ぐ最初の利用箇所を決める
- 日別と同じ LT バケット集約系列を、どの UI block とラベル表示仕様へ接続するか決める
- `直近型カーブ` と `季節型カーブ` の比較対象日付選定を、直近傾向と季節傾向の2本に分けて決める
- 選んだ baseline scope で、write-only 保存済み IndexedDB snapshot をどこまで read 利用するかを決める
- `団体` 系列を booking curve の標準 UI に含めるかを、実装後の使用感で再判断する
- 室タイプ別 booking curve の rank 変更履歴 marker の見え方と tooltip 情報量の polish を必要なら継続する
- `/api/v5/competitor_prices` を使った競合価格表の導入要否と最小表示仕様を決める
