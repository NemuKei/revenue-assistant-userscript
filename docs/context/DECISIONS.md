# DECISIONS

> 目的: 継続して参照する判断を短く残す。仕様本文の正本は `docs/spec_*.md` とする。

## Decisions

- D-20260424-004 | Analyze booking curve reference curve の first wave では、`直近型カーブ` は対象 `stay_date` の直前 7 泊日を比較対象にし、各 LT tick の rooms 値は非 null 値の中央値で集約する。`季節型カーブ` は `/api/v4/booking_curve` が返す `last_year_stay_date`、各 point の `last_year_date`、`last_year_room_sum` を優先し、欠損時だけ `two_years_ago_room_sum`、`three_years_ago_room_sum` の順で補う。reference curve は `全体` と `個人` の既存 panel に追加し、初期表示では `現在 / 直近型 / 季節型` を比較できる状態にするが、表示密度対策として reference curve 単位の表示切替を持たせる | status: active | spec_link: docs/spec_001_analyze_expansion.md
- D-20260424-003 | `/api/v4/booking_curve` は、少なくとも 2026-04-24 時点のログイン済み Revenue Assistant 環境では、ホテル全体と全 6 室タイプについて、確認した比較対象 `stay_date` と `rm_room_group_id` の組み合わせで 200 応答を返す。response は `booking_curve`、`stay_date`、`last_year_stay_date`、`max_room_count` を持ち、各 point は `date`、`last_year_date`、`all`、`transient`、`group` を持つ。`batch-date` は response には含まれないため、既存の同期文脈または cache key 側の値として扱う | status: active | spec_link: docs/spec_001_analyze_expansion.md
- D-20260424-002 | `repo-template-codex` の共通断片に合わせ、RAU でも `INTENT`、`STATUS`、`DECISIONS`、`tasks_backlog`、`spec` の責務分離を明確化する。次スレッド入口は `STATUS`、実行順は `tasks_backlog`、複数判断に使う優先順位は `INTENT` を正とする | status: active | spec_link: AGENTS.md, docs/context/INTENT.md, docs/context/STATUS.md, docs/tasks_backlog.md, docs/spec_000_overview.md
- D-20260424-001 | 当面の主線は、RAR 側の本格分析ツールではなく、RAU を `レート調整特化 + 人数なしの簡易フォーキャスト` として進める。Analyze 日付ページの日別 booking curve へ、BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を、ホテル全体と室タイプ別の両方で表示できるようにする | status: active | spec_link: docs/spec_000_overview.md, docs/spec_001_analyze_expansion.md
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
- D-20260420-004 | 月次実績画面は UI 実装より先に、同一 userscript 内の独立 slice として土台を切る。`/monthly-progress` route では既存 top / analyze の observer / sync を停止し、monthly-progress 側は kill switch と namespaced storage adapter を先に持つ | status: applied | spec_link: docs/spec_000_overview.md
- D-20260420-005 | 月次実績画面の `/api/v1/booking_curve/monthly` は、取り逃がし防止のため batch-date 単位の write-only snapshot を IndexedDB へ保存し始める。初期 slice では read path を切り替えず、現行表示は API 正本のまま維持する | status: applied | spec_link: docs/spec_000_overview.md
- D-20260420-006 | 月次実績画面の `予約日 -> LT` 変換は、`booking_curve/monthly` snapshot を month-end anchor の LT 系列へ落とす純粋関数として扱う。現年系列は未観測 bucket と ACT を month-end 到達前に打ち切り、比較系列は前年または前々年を別 line として重ねられるようにする | status: applied | spec_link: docs/spec_000_overview.md
- D-20260420-007 | 月次実績画面の LT 横軸メモリは、日別 booking curve と同じバケット定義を使う。monthly の `予約日 -> LT` preview も同じ bucket end-date 集約で系列化し、x 軸の粒度だけ別物にしない | status: applied | spec_link: docs/spec_000_overview.md
- D-20260420-008 | 月次実績画面の最初の UI は、予約日基準 `販売客室数` chart 直下の独立 block とする。既存 Recharts chart は置き換えず、左に `販売客室数`、右に `販売単価` を置く 2 カラム chart section を差し込み、対象月から未来 3 か月を同時表示しつつ `前年 / 前々年` compare と hover tooltip を同 section 内で持つ | status: applied | spec_link: docs/spec_000_overview.md
