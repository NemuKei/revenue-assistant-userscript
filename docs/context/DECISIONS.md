# DECISIONS

> 目的: 継続して参照する判断を短く残す。仕様本文の正本は `docs/spec_*.md` とする。

## Decisions

- D-20260331-001 | リポジトリ名は `revenue-assistant-userscript` とし、単一機能専用ではなくレベニューアシスタント向け拡張基盤として扱う | status: applied | spec_link: docs/spec_000_overview.md
- D-20260331-002 | 初回実装は UI 装飾より、`booking_curve` 取得、キャッシュ、再同期の土台を優先する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
- D-20260411-001 | 個別リポジトリ側の文書構成は `repo-template-codex` の現行 `AGENTS.md` / `STATUS.md` / `DECISIONS.md` 形式へ寄せ、リポジトリ固有ルールは `Local Extension` と `docs/spec_*.md` に残す | status: applied | spec_link: AGENTS.md
- D-20260411-002 | 団体室数系キャッシュは `最終データ更新` 日付だけでなく施設単位でも分離し、起動時、ページ復帰時、フォーカス復帰時の整合チェックで異常を検知したら group 系キャッシュを破棄して再同期する | status: applied | spec_link: docs/spec_001_analyze_expansion.md
