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
- booking curve の結果を `最終データ更新` 日付と施設単位で分離して `localStorage` へキャッシュする構成へ更新済み
- 起動時、ページ復帰時、フォーカス復帰時に団体系の整合チェックを行い、異常時は group 系キャッシュを破棄して再同期する構成へ更新済み
- GitHub Pages へ userscript を自動配布する workflow を追加済み
- npm と GitHub Actions の依存更新を週次で提案する Dependabot 設定を追加済み
- pull request 用の検証 workflow と `CODEOWNERS` を追加済み

## Doing

- なし

## Next

1. 販売設定タブの販売室数差分を `booking_curve` ベースのまま維持するか、販売設定系 endpoint ベースへ寄せるかを判断する
2. 販売設定タブの各室タイプカードへ、`室数` のみ・`全体 / 個人 / 団体` 切替あり・baseline なしの booking curve を段階導入する
3. 室タイプ別 booking curve の LT 軸を bucket 集約表示で定義し、`ACT` を `0日前` と分離した tick 仕様で実装する
4. 並列数制限、先読み取得の単位、月送り時の再同期方法を見直し、体感速度を改善する
5. `同月同曜日` baseline と `IndexedDB` 導入要否を Phase 2 で判断する
6. `competitor_prices` を販売設定タブへ埋め込む価値と最小表示仕様を判断する

## Remaining Task Triage

Now:

- 販売設定タブの販売室数差分のデータ源を確定する
- 室タイプ別 booking curve の Phase 1 仕様を実装粒度まで固める

Next:

- 室タイプ別 booking curve の LT bucket 表示と `ACT` 分離を実装する

After Next:

- baseline と競合価格表の導入要否を決める
