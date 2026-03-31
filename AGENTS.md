# AGENTS.md

## Purpose

このファイルは、このリポジトリで安全に作業を始めるための常設ルール。
レベニューアシスタント向け userscript を、正本優先・最小読込・最小差分で育てる。

## Scope

- このファイル単体で運用を開始できることを優先する。
- 外部リポジトリや親ワークスペースへの参照は任意。存在しなくても止めない。

## Read Budget

- 初手で読むのは AGENTS.md のみ。
- 追加読込は、タスク遂行に必要な最小数に限定する。
- 不足があれば推測せず、必要ファイルを特定して読む。

## Source Priority

1. セキュリティ、法令、公開制約
2. 仕様書
3. 現況と意思決定
4. AGENTS.md
5. README.md

## Docs Governance

- 仕様は docs/spec_*.md、現況は docs/context/STATUS.md、判断理由は docs/context/DECISIONS.md、利用手順は README.md を正本とする。
- AGENTS には常設ルールだけを書く。手順書や一時メモを肥大化させない。

## Engineering Defaults

- デフォルトは単純さを優先する。
- 既存の公開挙動は、明示的に変更を求められない限り保持する。
- 変更は最小差分を原則とし、無関係な rename や構成変更を混ぜない。
- 3 ステップ以上、または責務境界や仕様判断を含むタスクでは、実装前に 変更範囲、保持すべき公開挙動、最小 verify を先に明示する。
- 依存追加や更新の前に、既存実装、標準機能、既存依存で代替できないか確認する。
- lockfile または version pin がない依存は、そのまま完了扱いにしない。
- verify 失敗時の自己修正は最大 2 回までとし、解消しなければ失敗内容と未解決点を報告して止まる。

## Verification Policy

- verify は変更に応じた最小十分な確認とする。
- 優先順は、変更箇所に直結するテスト、型や静的解析、ビルド、手動確認。
- verify 未整備または未実施がある場合は、最終報告で確認済み範囲と未確認範囲を分けて書く。

## Directory Guideline

- 入口は root の AGENTS.md とする。
- 仕様は docs/、実装は src/、ビルドや補助スクリプトは scripts/ に寄せる。
- dist/ は生成物として扱い、ソース上の真実をそこへ重複させない。

## Local Extension

### Revenue Assistant / Userscript

- 配布物と Tampermonkey への投入物は dist/*.user.js を正とする。
- userscript metadata は userscript.config.mjs に集約し、ソースへ重複記載しない。
- レベニューアシスタントの画面差分は、API 起点で取れるものと DOM 起点でしか取れないものを分けて設計する。
- React 再描画に追従が必要な変更では、単発注入ではなく再同期前提で設計する。

### Build / Verify

- ビルドは scripts/build.mjs と esbuild で行い、TypeScript の型検査は tsc --noEmit で分離する。
- 通常の verify は npm run typecheck、npm run lint、npm run build、必要に応じて npm run check を使う。

### Browser / Automation

- ブラウザ接続と自動操作は、Chrome の remote debugging port 9222 と playwright-core の CDP 接続を既定にする。
- 画面確認が必要な変更では、専用プロファイルまたは remote debugging 付き既存プロファイルでの確認手順を優先する。

## Delivery Rule

- 最終報告は、何を変えたか、なぜ変えたか、影響範囲、GUI 確認要否を優先する。
- 実施済み、未実施、未確認、承認待ちを分けて書く。
- Chrome や Tampermonkey の画面操作を伴う変更では、確認してほしい手順と期待結果を必ず示す。
