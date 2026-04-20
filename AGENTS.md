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

- デフォルトは単純さを優先する。後方互換の shim や fallback は、明確な運用要件がある場合だけ追加し、追加する場合は目的、適用範囲、廃止条件を明記する。
- ビジネスルールは UI、CLI、handler、transport 層へ直置きしない。
- 外部 API、DB、file I/O などの副作用は境界に隔離する。
- 新規コードは継承より composition を優先し、interface や abstraction は実際の差し替え点がある場合だけ導入する。
- god file、god class、god function を拡張しない。責務が増える場合は先に分割方針を決める。
- 既存の密結合構造を無批判に踏襲しない。変更が責務境界をまたぐ場合は、置き場所と依存方向を先に点検する。
- テストしやすい単位を優先し、副作用は端に寄せる。
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
- 明示承認なしで行わない: rename、move、migration、実データ操作。
- verify 失敗時の自己修正は最大 2 回までとし、解消しなければ失敗内容と未解決点を報告して止まる。

## Verification Policy

- verify は、変更に応じた最小十分な確認とする。
- 優先順は、変更箇所に直結するテスト、型や静的解析、ビルド、手動確認とする。
- verify は対象を絞って実行し、必要になった範囲だけ広げる。
- verify 未整備または未実施がある場合は、そのまま完了扱いにしない。最終報告で確認済み範囲と未確認範囲を分けて書く。

## Single Owner Defaults

この repo は、1 人が owner 兼 primary developer である前提を既定とする。
branch を増やす柔軟性より、再開しやすさ、ロールバックしやすさ、会話文脈の連続性を優先する。

### Git Defaults

- branch や worktree を前提にせず、`main` 一本を既定とする。
- commit と push はセーブポイントとして扱う。利用者が停止を明示しない限り、verify 通過後は commit / push まで進めてよい。
- verify 未通過、未解決リスクあり、または利用者判断待ちの項目が残る状態では、通常の commit / push を行わない。
- 履歴書き換え、rebase、force push は、利用者が明示的に依頼した場合だけ行う。
- 変更単位はロールバックしやすい粒度を保ち、広い変更を 1 回の commit に混ぜすぎない。

### Communication Defaults

- 最終報告と途中説明では、コード詳細より先に、何を変えたか、なぜ変えたか、影響範囲、次アクションを示す。
- 技術用語や実装詳細は、`Owner Profile (Stable Context)` に定義された前提レベルに合わせて説明する。

## Subagent Policy

- メインスレッド側は、全体判断、統合、最終 verify、最終報告を担う。
- subagent の既定は未使用とする。使うのは、対象範囲、返却形式、寿命を事前に固定できる bounded delegation の場合だけに限る。
- クリティカルパス、責務境界をまたぐ変更、高判断コスト変更、write-heavy な変更は、既定でメインスレッド側に残す。
- 委譲を優先するのは、調査、影響範囲確認、レビュー、テスト切り分け、要約、文書配置判断などの read-heavy な作業とする。
- 実装を委譲する場合は、対象ファイルまたは責務、write set、期待する返却形式を開始前に明示する。
- 同一ファイル、同一責務、共有設定、同一 verify 対象を複数の subagent に重ねて割り当てない。競合が見込まれる変更はメインスレッド側へ戻す。
- subagent による部分 verify や調査用テストは許容するが、最終 verify 判定はメインスレッド側だけが行う。
- 依存追加や更新、設定変更、migration、認証、秘密情報、権限、外部接続変更、正本文書への反映要否の最終判断は、メインスレッド側が保持する。
- subagent は短命、単機能を原則とし、1 タスク 1 目的の使い捨てを基本とする。同一 thread で継続利用するのは、同じ bounded scope を維持できる場合だけとする。
- subagent の返却は生ログではなく蒸留要約とする。最低限、`結論`、`根拠ファイル`、`不確実点`、`推奨次アクション`、`編集ファイル一覧`、`verify 実施有無` を含める。

## Directory Guideline

- 入口は root の `AGENTS.md` とする。
- 仕様は `docs/`、実装は `src/`、ビルドや補助スクリプトは `scripts/` に寄せる。
- `dist/` は生成物として扱い、ソース上の真実をそこへ重複させない。

## Local Extension

### Owner Profile (Stable Context)

- `Language`: 日本語
- `Technical baseline`: 職業プログラマーではない。コード全文より先に、何を変えたか、なぜ変えたか、影響範囲を把握したい。
- `Communication preference`: 結論先出し。必要な次アクションを明示する。専門語は必要最小限にする。
- `Explanation depth`: 実装意図と変更点の説明を重視する。

更新ルール:

- 本人が明示した内容だけを更新する。推測で補わない。
- 1 回限りの反応ではなく、複数回再現した傾向だけを stable context として固定する。
- `DECISIONS.md` 相当の判断記録がある repo では、更新理由を 1 件だけ残す。

### Revenue Assistant / Userscript

- 配布物と Tampermonkey への投入物は `dist/*.user.js` を正とする。
- userscript metadata は `userscript.config.mjs` に集約し、ソースへ重複記載しない。
- `dist/*.user.js` を手編集せず、必要な変更は `src/`、`scripts/build.mjs`、`userscript.config.mjs` 側で行う。
- レベニューアシスタントの画面差分は、API 起点で取れるものと DOM 起点でしか取れないものを分けて設計する。
- React 再描画に追従が必要な変更では、単発注入ではなく再同期前提で設計する。
- 既存 UI へ要素を追加するときは、標準要素を押しのけない余白や非干渉領域への配置を可能な範囲で優先し、難しい場合だけ安定性と実装コストを見て別案を選ぶ。

### Build / Verify

- ビルドは `scripts/build.mjs` と `esbuild` で行い、TypeScript の型検査は `tsc --noEmit` で分離する。
- 通常の verify は `npm run typecheck`、`npm run lint`、`npm run build`、必要に応じて `npm run check` を使う。
- verify 手段が未整備なら勝手に増やさず、その旨を報告する。

### Browser / Automation

- ブラウザ接続と自動操作は、Chrome の remote debugging port `9222` と `playwright-core` の CDP 接続を既定にする。
- 画面確認が必要な変更では、専用プロファイルまたは remote debugging 付き既存プロファイルでの確認手順を優先する。

## Delivery Rule

- 最終報告は、何を変えたか、なぜ変えたか、影響範囲、GUI 確認要否を優先する。
- 最終報告では、実施済み、未実施、未確認、承認待ちを分けて書く。
- Chrome や Tampermonkey の画面操作を伴う変更では、確認してほしい手順と期待結果を必ず示す。
- GUI 確認が不要な変更なら、その理由を明記する。
