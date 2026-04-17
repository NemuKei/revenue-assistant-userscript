# STATUS

最終更新: 2026-04-17

## Done

- userscript の TypeScript 開発基盤、build、lint、typecheck を整備済み
- Chrome remote debugging 用スクリプトと CDP 接続スクリプトを配置済み
- analyze 日付ページの月次カレンダー各セルへ団体室数を表示する拡張を実装済み
- カレンダー上の団体室数表示の visible / hidden 切替トグルを実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の `1日前差分 / 7日前差分 / 30日前差分` を表示する拡張を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の団体室数と `1日前差分 / 7日前差分 / 30日前差分` を表示する拡張を実装済み
- analyze 日付ページの販売設定タブ最上段で、全体販売室数サマリーと全体団体室数サマリーを 2 行で表示する拡張を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の `最終変更 何日前 / ランク A→B` を俯瞰できる rank overview を追加済み
- analyze 日付ページの販売設定タブで、各室タイプカードの `最終変更履歴` の下へ `ランク：A→B` を表示する拡張を追加済み
- analyze 日付ページの販売設定タブ最上段に、ホテル全体 booking curve の常時展開 block を追加済み
- analyze 日付ページの販売設定タブで、各室タイプ card ごとに booking curve 開閉 UI を追加済み
- booking curve のグラフ描画は custom SVG ベースで実装済みで、hover tooltip、capacity 基準 y 軸、横軸ラベルの優先表示を含む
- booking curve グラフは `/api/v4/booking_curve` の LT 実系列へ接続済みで、全体 block と各室タイプ card の `全体 / 個人` を実データで描画する構成へ更新済み
- booking curve Phase 1 の current 値は `batch-date` 以前の最新非 null を維持し、`ACT` tick は `batch-date` の実点がある場合だけ表示する構成へ更新済み
- 室タイプ別 booking curve へ rank 変更履歴 marker を重ねる仕様を、`小さな丸 marker / 同日複数変更は最後の 1 件 / tooltip で詳細表示` で確定済み
- 室タイプ別 booking curve へ rank 変更履歴 marker を重ねる実装を追加済みで、`/api/v3/lincoln/suggest/status` の履歴を card ごとに小さな丸 marker と tooltip で表示する構成へ更新済み
- booking curve tooltip は point 詳細と rank 変更履歴を 1 つへ統合し、line hover 側でも同区間の rank marker 情報を表示し、hover / focus を外したら閉じる構成へ更新済み
- 未着地 stay_date の booking curve は観測 LT 以降を null として扱い、当日を含めて `ACT` まで線を延ばさない構成へ更新済み
- booking curve の y 軸は整数メモリになるよう上限値を丸め、実容量の満室ラインを別線で描画する構成へ更新済み
- booking curve の結果を `最終データ更新` 日付と施設単位で分離して `localStorage` へキャッシュする構成へ更新済み
- 起動時、ページ復帰時、フォーカス復帰時に団体系の整合チェックを行い、異常時は group 系キャッシュを破棄して再同期する構成へ更新済み
- GitHub Pages へ userscript を自動配布する workflow を追加済み
- npm と GitHub Actions の依存更新を週次で提案する Dependabot 設定を追加済み
- pull request 用の検証 workflow と `CODEOWNERS` を追加済み

## Doing

- 室タイプ別 booking curve の LT 軸で、過去 stay_date を含む spot check と marker の見え方調整を追加で詰める

## Next

1. 販売設定タブの販売室数差分を `booking_curve` ベースのまま維持するか、販売設定系 endpoint ベースへ寄せるかを判断する
2. 室タイプ別 booking curve の LT 軸で、過去 stay_date を含む spot check を行い、bucket 集約値、null fallback、`ACT` 空表示を追認する
3. 並列数制限、先読み取得の単位、月送り時の再同期方法を見直し、体感速度を改善する
4. `同月同曜日` baseline と `IndexedDB` 導入要否を Phase 2 で判断する
5. `competitor_prices` を販売設定タブへ埋め込む価値と最小表示仕様を判断する

## Notes For Next Thread

- booking curve グラフの系列生成は `src/main.ts` の `buildSalesSettingBookingCurveSeries` と `buildSalesSettingBookingCurveRenderData` が担う
- 数値 tick は選択中 analyze 日付を `stay_date` として bucket 終端日を引き、`findBookingCurveCount` の fallback で系列化する
- `ACT` tick は `batch-date` と一致する実点だけを使う。上部の current 値は `batch-date` 以前の最新非 null を使うので、将来 stay_date では `ACT` と一致しない場合がある
- rank 変更履歴 marker は室タイプ別 card のみへ重ねる。x は LT 日数を圧縮済み LT 軸へ補間し、同日複数変更は最後の 1 件だけ表示する
- booking curve の tooltip は point または marker の hover / focus 中だけ表示する。rank marker 情報は marker 点だけでなく同じ区間の line hover でも表示し、`ランク A→B` を強調表示する
- 未着地 stay_date では、観測 LT より手前の tick と `ACT` を空にして、当日も含めて線を観測 LT で打ち切る
- booking curve の見出しは対象名を含めて表示する。y 軸は整数メモリへ丸め、満室ラインは補助線で別描画する
- 2026-04-17 時点の横軸ラベル優先表示は `ACT, 3, 7, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 360`
- GUI verify では build 後の `dist/*.user.js` だけでなく、Tampermonkey 側の userscript 再読込も必要。再読込なしでは旧 build が表示されることがある

## Remaining Task Triage

Now:

- 販売設定タブの販売室数差分のデータ源を確定する
- 過去 stay_date を含む spot check で LT bucket 表示、null fallback、`ACT` 空表示を追認する

Next:

- request 数と先読み単位を見直して、体感速度を改善する

After Next:

- baseline と競合価格表の導入要否を決める
