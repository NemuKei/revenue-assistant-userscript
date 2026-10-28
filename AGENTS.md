# AGENTS.md

Revenue Assistant標準画面でRMの判断を補助するTampermonkey userscriptの正本。独立RMS、推奨レート金額、自動/一括反映、credential保存を目的にしない。

- 標準UIの操作を壊さない。Classic/Nextのidentity、runtime、保存領域、公開境界を混ぜない。
- dist/*.user.jsは生成物。Classic公開凍結中は公開URLのbytesと.github/classic-publication-baseline.jsonが公開版の正本。Next配布契約はdocs/spec_004_next_distribution.md。
- main pushは配信/インストール/切替ではない。公開・配布は独立gateであり、本整理では実行しない。
- 自分の契約・施設・権限内のread-only観察に限る。新しい未文書API、prefetch、非公開データ取扱いは対象specでscope/負荷/保持/削除/権限を先に固定する。
- 認証/rate limit/bot検知回避、他施設・非表示データ、無許可hidden API、自動writeを実装しない。
- raw traffic/HAR/body、credential、顧客/予約/個人情報、非公開価格/在庫をGit/外部へ出さない。既存保存データを無断で削除/初期化/再解釈しない。
- 依存の追加/更新、API/保存/write/安全境界の拡張は明示承認が必要。

Next実行内容の変更は、未配信停止の明示がない限り、local gateとmain同期後のmanual publication・公開artifact/Classic照合まで継続承認されている。docs-only、Classic再公開、検証失敗、API/保存/write/安全境界の拡張は対象外。本整理では配信しない。
