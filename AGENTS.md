# AGENTS.md

## Purpose

このファイルは、このリポジトリで安全に作業を始めるための常設ルール。
`repo-template-codex` の現行テンプレートを利用する個別リポジトリ向け方針をベースにしつつ、レベニューアシスタント向け userscript に必要なリポジトリ固有ルールだけを追加する。

## Scope

- このファイル単体で運用を開始できることを優先する。
- 外部リポジトリや親ワークスペースへの参照は任意とし、存在しなくても止めない。

## Read Budget

- 初手で読むのは `AGENTS.md` のみ。
- 追加読込は、タスク遂行に必要な最小数に限定する。
- ただし、責務境界、影響範囲、安全性判断に必要なときは追加読込を許可する。読む理由と対象を先に特定し、無関係な読込へ広げない。
- 不足があれば推測せず、必要ファイルを特定して読む。

## Task Read (Only When Needed)

- 仕様変更や公開挙動の確認: `docs/spec_*.md`
- 現在地と残課題の確認: `docs/context/STATUS.md`、`docs/tasks_backlog.md`
- 判断理由の確認: `docs/context/DECISIONS.md`
- 実装コマンドや運用手順の確認: `README.md`
- このリポジトリ固有ルールの確認: この `AGENTS.md` の `Local Extension`

## Skills (Only When Needed)

- root `AGENTS.md` はリポジトリ全体で共通の常設ルールを定義し、特定作業だけで使う補助手順は必要なときだけ Skill で追加する。
- リポジトリ全体で共通の判断基準や設計原則を Skill へ重複記載しない。
- このリポジトリでは固有 Skill を常設しない。必要な Skill は共有 Skill から使う。
- 優先して使う共有 Skill:
  - `search-first`: 既存実装、既存依存、外部候補を先に確認するとき
  - `missing-capability-proposal`: 実行中または verify 中に未導入のツール、ライブラリ、Skill、preset が不足能力の原因になったときに、導入提案を短く整理するとき
  - `docs-governance`: 文書の正本配置、新規作成要否、重複整理を判断するとき
  - `spec-governance`: `spec` 更新要否や更新先を判断するとき
  - `verification-before-completion`: 完了報告前に verify を整理するとき
  - `thread-contract-handoff`: 長めのスレッドで目的、範囲、handoff 要否を整理するとき
  - `playwright`: Chrome remote debugging と画面確認を伴う作業をするとき

## Source Priority

1. セキュリティ、法令、公開制約
2. 仕様書 (`docs/spec_*.md`)
3. 現況と意思決定 (`docs/context/STATUS.md` / `docs/context/DECISIONS.md`)
4. `AGENTS.md`
5. `README.md`

同順位で矛盾した場合は、より新しい決定を優先する。
未解決なら `docs/context/DECISIONS.md` に暫定判断を残して進める。

## Docs Governance

- 仕様は `docs/spec_*.md`、現況は `docs/context/STATUS.md`、判断理由は `docs/context/DECISIONS.md`、利用手順は `README.md` を正本とする。
- 新規ドキュメントを作るか、既存文書へ統合するかの判断は `docs-governance` の手順に従う。
- `AGENTS.md` には常設ルールだけを書く。手順書や一時メモを肥大化させない。

## Engineering Defaults

- デフォルトは単純さを優先する。
- 既存の公開挙動は、明示的に変更を求められない限り保持する。
- 変更は最小差分を原則とし、無関係な rename、move、構成変更を混ぜない。
- 変更範囲が広い、横断的、または危険操作を含む場合は、先に分割案を示す。
- 実行中または verify 中に、未導入のツール、ライブラリ、Skill、preset が不足能力の原因になっている場合は、短い導入提案をしてよい。提案すべきか迷う場合は、提案を抑えるより、不足内容と候補を短く示す方を優先する。
- 依存追加や更新の前に、既存実装、標準機能、既存依存で代替できないか確認する。
- 外部ツールや依存ライブラリを提案する前に、`search-first` で既存手段を確認する。外部導入候補が残る場合は、`security-best-practices` が使える環境ではそれを使い、使えない場合でも供給網、権限、install script、version 固定を確認する。
- lockfile または version pin がない依存は、そのまま完了扱いにしない。
- 導入提案を見送られた場合は、少なくとも `not-now`、`policy-reject`、`security-reject`、`cost-reject` のいずれかで理由を整理する。`policy-reject` と `security-reject` は、明示的な再検討があるまで再提案しない。
- 3 ステップ以上、または責務境界や仕様判断を含むタスクでは、実装前に `変更範囲`、`保持すべき公開挙動`、`最小 verify` を先に明示する。
- 実装中に前提、影響範囲、verify 方法が崩れた場合は、そのまま押し切らず、分割または再計画へ戻す。
- 明示承認なしで行わない: 依存追加や更新、大量削除、設定変更、認証や secret や権限まわりの変更、配布設定の変更。
- verify 失敗時の自己修正は最大 2 回までとし、解消しなければ失敗内容と未解決点を報告して止まる。

## Verification Policy

- verify は、変更に応じた最小十分な確認とする。
- 優先順は、変更箇所に直結するテスト、型や静的解析、ビルド、手動確認とする。
- verify は対象を絞って実行し、必要になった範囲だけ広げる。
- verify 未整備または未実施がある場合は、そのまま完了扱いにしない。最終報告で確認済み範囲と未確認範囲を分けて書く。

## Directory Guideline

- 入口は root の `AGENTS.md` とする。
- 仕様は `docs/`、実装は `src/`、ビルドや補助スクリプトは `scripts/` に寄せる。
- `dist/` は生成物として扱い、ソース上の真実をそこへ重複させない。

## Local Extension

### Revenue Assistant / Userscript

- 配布物と Tampermonkey への投入物は `dist/*.user.js` を正とする。
- userscript metadata は `userscript.config.mjs` に集約し、ソースへ重複記載しない。
- `dist/*.user.js` を手編集せず、必要な変更は `src/`、`scripts/build.mjs`、`userscript.config.mjs` 側で行う。
- レベニューアシスタントの画面差分は、API 起点で取れるものと DOM 起点でしか取れないものを分けて設計する。
- React 再描画に追従が必要な変更では、単発注入ではなく再同期前提で設計する。

### Build / Verify

- ビルドは `scripts/build.mjs` と `esbuild` で行い、TypeScript の型検査は `tsc --noEmit` で分離する。
- 通常の verify は `npm run typecheck`、`npm run lint`、`npm run build`、必要に応じて `npm run check` を使う。
- verify 手段が未整備なら勝手に増やさず、その旨を報告する。

### Browser / Automation

- ブラウザ接続と自動操作は、Chrome の remote debugging port `9222` と `playwright-core` の CDP 接続を既定にする。
- 画面確認が必要な変更では、専用プロファイルまたは remote debugging 付き既存プロファイルでの確認手順を優先する。

### Subagent Policy

- メインスレッド側は全体判断、統合、verify、最終報告を担う。
- サブエージェントへ優先して委譲するのは、調査、影響範囲確認、テスト切り分け、レビュー、要約など、読む量が多い作業とする。
- 編集量が多い変更、複数領域にまたがる変更、依存変更、設定変更、外部接続を伴う操作は既定でメインスレッド側に残す。
- サブエージェントによる部分検証は許容するが、最終 verify 判定と正本ドキュメント更新要否の判断はメインスレッド側が保持する。

## Delivery Rule

- 最終報告は、何を変えたか、なぜ変えたか、影響範囲、GUI 確認要否を優先する。
- 最終報告では、実施済み、未実施、未確認、承認待ちを分けて書く。
- Chrome や Tampermonkey の画面操作を伴う変更では、確認してほしい手順と期待結果を必ず示す。
- GUI 確認が不要な変更なら、その理由を明記する。
