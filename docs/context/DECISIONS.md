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
