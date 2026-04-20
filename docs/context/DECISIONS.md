# DECISIONS

> 目的: 継続して参照する判断を短く残す。仕様本文の正本は `docs/spec_*.md` とする。

## Decisions

- D-20260331-001 | リポジトリ名は `revenue-assistant-userscript` とし、単一機能専用ではなくレベニューアシスタント向け拡張基盤として扱う | status: applied | spec_link: docs/spec_000_overview.md
- D-20260331-002 | 初回実装は UI 装飾より、`booking_curve` 取得、キャッシュ、再同期の土台を優先する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260411-001 | 個別リポジトリ側の文書構成は `repo-template-codex` の現行 `AGENTS.md` / `STATUS.md` / `DECISIONS.md` 形式へ寄せ、リポジトリ固有ルールは `Local Extension` と `docs/spec_*.md` に残す | status: applied | spec_link: AGENTS.md
- D-20260411-002 | 団体室数系キャッシュは `最終データ更新` 日付だけでなく施設単位でも分離し、起動時、ページ復帰時、フォーカス復帰時の整合チェックで異常を検知したら group 系キャッシュを破棄して再同期する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260417-001 | 販売設定タブ内の室タイプ別 booking curve はフェーズ分割とし、Phase 1 は `室数` のみ、baseline なしで進め、標準 UI は `全体` と `個人` の 2 系列を横並び表示する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260417-002 | 室タイプ別 booking curve の LT 圧縮は bucket 集約とし、代表値は平均ではなく各 bucket の最後の日を使い、`ACT` は `0日前` と分離して扱う | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260417-003 | Phase 1 では `localStorage` へ booking curve 生 JSON を persistent 保存せず、必要なら最小系列のみを保持し、`IndexedDB` は baseline 導入以降に再判断する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260417-004 | 最上段の全体 block はホテル全体 booking curve を常時展開で表示し、各室タイプ card は既定で閉じ、開閉トリガーは各 block 自身に持たせる | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260417-005 | Phase 1 の booking curve UI は custom SVG の placeholder 実装を先行し、hover tooltip と capacity 基準 y 軸を含めて見た目と操作を先に固める | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260417-006 | Phase 1 の横軸ラベルは 2 段表示へ固定せず、1 行表示を優先し、優先表示ラベルは `ACT, 3, 7, 14, 21, 30, 45, 60, 90, 120, 150, 180, 270, 360` とする | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260417-007 | 室タイプ別 booking curve の rank 変更履歴は、Phase 1 では各室タイプ card のみへ小さな丸 marker で重ね、同日複数変更は最後の 1 件だけを tooltip 付きで表示する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260418-001 | 販売設定タブの室タイプ別 `1日前 / 7日前 / 30日前` の販売室数差分は、Phase 1 では `/api/v4/booking_curve` の室タイプ別 `all.this_year_room_sum` を正として維持し、販売設定系 endpoint への寄せ替えは Phase 2 以降の再判断とする | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260418-002 | 現行 current UI の synthetic room-type host における個別 booking curve capacity は `/api/v1/suggest/output/current_settings` の `rm_room_groups[].max_num_room` を room group 名単位で補い、既存 card renderer を再利用する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260418-003 | `queueCalendarSync()` の MutationObserver 起点は、observer callback ごとに直接 queue せず、同期が空くまで 1 本だけ待たせてから queue し、debug snapshot は console だけでなく DOM と localStorage にも残す | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260418-004 | observer coalescing と completed-signature 打ち切り後の focus 復帰 GUI 実測では `mutation-observer` が requested 1 / scheduled 1 に留まり、現時点では `queueCalendarSync()` の性能改善は一区切りとする。次は `同月同曜日` baseline の最小範囲を決め、`IndexedDB` はその実装 scope が固まってから booking_curve persistent cache 単位で再判断する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260418-005 | analyze のランク変更履歴は、次の slice では最新1件サマリーを維持し、table へ `増減` 列だけを追加する最小差分で進める | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260418-006 | トップカレンダーの最終変更表示は、初期 slice では `相対日数のみ / セル最下部のみ / analyze 画面では非表示` を正とし、文字密度を優先して日付文字列や常時表示は入れない | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260418-007 | 月次実績画面のカスタム booking curve は、いきなり実装へ入らず、まず対象画面の DOM と API を調査してから最小仕様を決める | status: applied | spec_link: docs/spec_000_overview.md
- D-20260420-001 | トップカレンダーの `◯日前` は、root 画面の既存 indicator flow に混ぜず、日付セル anchor 直下の overlay として絶対配置する。`1日前増減` と `1日 / 7日前増減` の縦積みを壊さないことを優先する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260420-002 | 月次実績画面の custom booking curve は LT 基準を正とし、宿泊日基準の派生ではなく、予約日基準 chart を土台にした派生表示として設計する | status: applied | spec_link: docs/spec_000_overview.md
- D-20260420-003 | 月次実績画面の custom booking curve は別 userscript へ分離せず、既存 userscript のまま進める。既存 top / analyze の完成機能を巻き込まないよう、route 単位の起動境界、monthly-progress 専用 storage namespace、描画責務の局所化を前提に実装する | status: applied | spec_link: docs/spec_000_overview.md
