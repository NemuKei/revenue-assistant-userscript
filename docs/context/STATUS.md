# STATUS

## Current State

- repo scaffold を作成済み
- userscript のビルド基盤を作成済み
- Chrome remote debugging 用スクリプトを配置済み
- analyze 日付ページの月次カレンダー各セルへ団体室数を追記する PoC を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の 1日前差分 / 7日前差分 / 30日前差分を表示する拡張を実装済み
- analyze 日付ページの販売設定タブで、室タイプ別の団体室数と 1日前差分 / 7日前差分 / 30日前差分を表示する拡張を実装済み
- analyze 日付ページの販売設定タブ最上段で、全体の販売室数サマリーと全体の団体室数サマリーを 2 行で表示する拡張を実装済み
- booking_curve の結果を `最終データ更新` 日付が変わるまで localStorage にキャッシュする構成に更新済み
- analyze 日付ページの起動時、ページ復帰時、フォーカス復帰時に団体系の整合チェックを行い、異常時はキャッシュを破棄して再同期する構成に更新済み
- GitHub Pages へ userscript を自動配布する workflow を追加済み
- npm と GitHub Actions の依存更新を週次で提案する Dependabot 設定を追加済み
- pull request 用の検証 workflow と CODEOWNERS を追加済み

## Next Focus

- 販売設定タブの販売室数差分を booking_curve ベースのまま維持するか、販売設定系 endpoint ベースへ寄せるかを決める
- 並列数制限や月送り時の体感速度を改善する
- 必要なら booking_curve 取得単位の最適化を進める
- 競合価格表の埋め込み要否を判断する
