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
- 判断原則の確認: `docs/context/INTENT.md`
- 現在地の確認: `docs/context/STATUS.md`
- 実行順の確認: `docs/tasks_backlog.md`
- 判断理由の確認: `docs/context/DECISIONS.md`
- 実装コマンドや運用手順の確認: `README.md`
- このリポジトリ固有ルールの確認: この `AGENTS.md` の `Local Extension`

## Skills (Only When Needed)

- root `AGENTS.md` はリポジトリ全体で共通の常設ルールを定義し、特定作業だけで使う補助手順は必要なときだけ Skill で追加する。
- リポジトリ全体で共通の判断基準や設計原則を Skill へ重複記載しない。
- Codex lifecycle hooks は Skill や repo 内正本の代替ではない。secret guard、repo context guide、completion gate のような反復確認を lifecycle event に差し込む補助層として扱い、repo 固有判断は `AGENTS.md`、`docs/spec_*.md`、`docs/context/DECISIONS.md`、`docs/context/STATUS.md` などの正本へ置く。
- このリポジトリでは固有 Skill を常設しない。必要な Skill は共有 Skill から使う。
- `thread-contract-handoff` は、明示的な handoff 作成、古い handoff からの復旧、長期中断後の正本再同期、既存 handoff prompt の正本照合が必要なときだけ使う optional / legacy Skill として扱う。通常の Goal Bundle Execution、通常の task 継続、通常の終了判断では使わない。
- 優先して使う共有 Skill:
  - `search-first`: 既存実装、既存依存、外部候補を先に確認するとき
  - `missing-capability-proposal`: 実行中または verify 中に未導入のツール、ライブラリ、Skill、preset が不足能力の原因になったときに、導入提案を短く整理するとき
  - `docs-governance`: 文書の正本配置、新規作成要否、重複整理を判断するとき
  - `spec-governance`: `spec` 更新要否や更新先を判断するとき
  - `task-add-and-triage`: 新規タスク追加後に棚卸し、統合、実行順更新を同じ変更で行うとき
  - `verification-before-completion`: 完了報告前に verify を整理するとき
  - `second-brain-capture`: 作業結果、再開地点、判断理由、Codex から見た作業モデルを Obsidian SecondBrain へ保存するとき
  - `create-cli`: 新しい CLI、サブコマンド、引数体系、出力契約を設計または変更するとき
  - `playwright`: 反復可能なブラウザ操作、複数 viewport 確認、スクリーンショット比較、CI に近い画面確認を行うとき
  - `browser-trace` / `browser-to-api`: 新しい画面、新しいタブ、未調査 API、response shape が不明な API を実装前に調査するとき。optional global Skill なので、利用時は対象端末の Skill 同期状態と実際に読まれる Skill root を確認する。現時点の template repo では Windows 側同期先として `C:\Users\n-kei\.codex\skills`、WSL から同じ Windows 側 home を参照する場合は `/mnt/c/Users/n-kei/.codex/skills` を維持しているが、OpenAI docs 側では `$HOME/.agents/skills` が示されているため、実環境を確認してから使う。

## Goal Bundle Execution

- Goal Bundle Execution は root `AGENTS.md` の常設ルールであり、Skill ではない。通常の正本確認、Goal Bundle 判断、subagent 利用判断、終了条件は、repo 正本に基づいて扱う。
- Task ID は追跡単位であり、常に実行停止単位ではない。利用者が `すすめて`、`次にすすめて`、`未着手を進めて`、`未着手つぶして`、`ゴールモード`、または同等の継続実装を求めた場合は、Goal Bundle Execution として扱う。
- Goal Bundle は、同じユーザー可視成果に属し、同じ spec または同じ責務境界に属し、同じ verify セットで完了判定でき、同じ commit / push セーブポイントにまとめても戻しやすい未着手 task 群で構成する。
- Codex は Goal Bundle 内の小 task ごとに利用者確認で止まらない。止まるのは、外部契約、公開挙動、削除、migration、依存追加または更新、認証・secret・権限、実データ操作、release / publish、または利用者判断が必要な仕様判断が出た場合だけにする。
- 影響が局所的で戻せる判断は、前提を明示して進め、最終報告で確認結果を書く。Goal Bundle 外の論点は別管理にし、現在の Goal Bundle 完了に必要なものだけ扱う。

## Source Priority

1. セキュリティ、法令、公開制約
2. 仕様書 (`docs/spec_*.md`)
3. 判断原則 (`docs/context/INTENT.md`)
4. 判断理由 (`docs/context/DECISIONS.md`)
5. 現在地 (`docs/context/STATUS.md`)
6. `AGENTS.md`
7. `README.md`

同順位で矛盾した場合は、より新しい決定を優先する。
未解決なら `docs/context/DECISIONS.md` に暫定判断を残して進める。

## Docs Governance

- 仕様は `docs/spec_*.md`、判断原則は `docs/context/INTENT.md`、現況は `docs/context/STATUS.md`、判断理由は `docs/context/DECISIONS.md`、実行順は `docs/tasks_backlog.md`、利用手順は `README.md` を正本とする。
- 新規ドキュメントを作るか、既存文書へ統合するかの判断は `docs-governance` の手順に従う。
- 会話内容は正本にしない。正本化する場合は、対象ファイルを更新して確定する。
- 同一ルールの重複記載を残さない。
- `tasks_backlog` に追加しただけでは `spec` を確定しない。ただし、実装候補 task には `spec-impact`、`spec-checkpoint`、`target-spec`、`open-spec-questions` を持たせてよい。
- `spec-impact: yes | unknown` の task は、実装開始前に `spec` 更新要否を再判定する。
- `docs/spec_000_overview.md` は repo-wide の仕様地図と更新規則に限定し、個別画面の詳細仕様を書き溜める場所にしない。
- 新しい `spec_*.md` は、独立した外部契約、受け入れ条件、更新単位のいずれかがある場合だけ作る。既存 `spec` と同じ責務境界に属する場合は、既存 `spec` への追記を優先する。
- `AGENTS.md` には常設ルールだけを書く。手順書や一時メモを肥大化させない。

## Obsidian SecondBrain Capture

このリポジトリでの Codex 作業のうち、次回以降も参照する価値がある情報は、Obsidian SecondBrain vault へ記録する。

Obsidian vault:

```text
Windows canonical vault: C:\Users\n-kei\Documents\Obsidian\SecondBrain
WSL access path: /mnt/c/Users/n-kei/Documents/Obsidian/SecondBrain
```

### Source Of Truth

このリポジトリの仕様、進捗、決定、タスクの正本は repo 内ドキュメントである。

Obsidian は、repo をまたいで検索、比較、再利用するための横断索引と、Codex の作業文脈を維持するための補助情報である。

repo 内正本と Obsidian が矛盾する場合は、repo 内正本を優先する。

### System Notes

SecondBrain 全体の目的、保守、repo 連携、別端末再現は vault 内の次の system note を正本として扱う。

- `99_System/SecondBrain Charter.md`
- `99_System/SecondBrain Operations.md`
- `99_System/SecondBrain Repo Integration Rule.md`
- `99_System/SecondBrain Device Setup and Recovery.md`

### Reuse Checkpoint

作業開始時は、まず対象 repo の `STATUS`、`DECISIONS`、`tasks_backlog`、`spec`、root `AGENTS.md` と Codex memory を確認する。

SecondBrain は、単一 repo 内の現在地管理を置き換えない。repo 内 docs と memory で十分に閉じる実装、修正、検証では、SecondBrain を無理に検索しない。

次の条件に該当する場合は、SecondBrain を検索する。

- 他 repo の判断、実装、失敗した方法、検証コマンドを今回の repo に応用する可能性がある。
- レベニューマネジメント、ホテル、需要予測、価格、競合調査について、repo 内 docs だけでは足りない横断知識や外部知識が必要である。
- 論文、外部資料、Deep Research、専門用語、開発概念を確認する必要がある。
- AGENTS.md、Skill、automation、SecondBrain、別端末運用など、repo をまたぐ運用ルールに関係する。
- ユーザーが「前に決めた」「知識体系」「単語帳」「論文」「他 repo でも」「別端末でも」といった継続文脈を示した。

検索対象は `20_Areas/`、`30_References/`、`00_Inbox/Codex Captures/`、`99_System/`、`99_System/Bases/` を優先する。

SecondBrain を参照した場合でも、repo 内 `STATUS`、`DECISIONS`、`tasks_backlog`、`spec`、root `AGENTS.md` を正本として優先する。参照した note が今回の判断に影響する場合は、作業メモまたは最終報告で短く示す。参照しなかった場合でも、repo 内正本で閉じる作業なら問題として扱わない。

### Capture Triggers

次の作業を行った場合、終了前に Obsidian への記録対象を判断する。

- 非自明な実装、調査、設計判断、docs handoff
- 次スレッドの再開地点が重要な作業
- repo をまたいで再利用できる判断、検証方法、失敗知識
- ユーザーの説明粒度、確認頻度、委任範囲に関する作業認識の更新
- AGENTS.md、Skill、handoff、automation、Obsidian vault 運用の変更
- ユーザー向けに噛み砕いて残す価値がある論文、外部知識、開発概念、専門用語
- 今後の開発判断に使えそうな補助メモ

### Completion Checkpoint

次のいずれかを行った場合、最終回答の前に `capture-needed: yes | no` を明示的に判定する。

- 非自明な実装、調査、設計判断、docs 更新、handoff
- AGENTS.md、Skill、automation、Obsidian vault 運用の変更
- 論文、外部知識、開発概念、専門用語に関する整理
- repo をまたいで再利用できる判断、検証方法、失敗知識の発見

`capture-needed: yes` の場合は、`second-brain-capture` Skill を使い、repo 内正本と Obsidian note の境界を分けて記録する。

`capture-needed: no` の場合は、保存しない理由を短く示す。例: 単発回答、repo 内正本に十分記録済み、再利用価値がない、秘密情報を含むため保存しない。

この判定を省略したまま、非自明な作業を完了扱いにしない。

### Git Sync Checkpoint

SecondBrain vault は複数端末から更新される前提で扱う。Codex が SecondBrain の note、system file、Base、Canvas を作成または更新した場合、既定の完了状態は、関係する変更だけを commit し、active branch を `origin` へ push し、`git status --short --branch` で未コミット差分がなく remote と同期していることを確認した状態である。

stage するのは現在 task に関係する vault 変更だけにする。Obsidian の local UI state、cache、plugin token、sync config、内容未確認のユーザー作成 note は stage しない。秘密情報混入の疑い、未完成 note、内容未確認のユーザー作成 note、git 失敗のいずれかで push できない場合は、最終報告で理由、残っている差分、remote との同期状態を明記する。
### Capture Rules

- 新規作業記録は `00_Inbox/Codex Captures/` に作成する。
- note には `audience`、`update_mode`、`confidence` を入れる。
- `audience: codex` の note は、Codex が次回以降の作業文脈として使う。
- `audience: user` の note は、ユーザー本人が後で読む知識体系として扱う。
- `audience: shared` の note は、Codex とユーザーの両方が参照する運用ルールや判断基準として扱う。
- Codex 側の作業プロファイルは `update_mode: automatic` として自動更新してよい。
- 誤りが後続のやり取りで見つかった場合は、必要に応じて `Revision Notes` に修正理由を残す。
- ユーザー向け知識 note は日本語で噛み砕き、英語の正式名称、略語、検索語、論文タイトル、API 名、ライブラリ名は保持する。
- 専門用語、略語、モデル名、評価指標、データ概念、設計概念、業務概念は glossary note または candidate queue へ接続する。
- ユーザー向け note に書くと冗長だが今後の開発に応用できる補助メモは、Codex Application Memos へ分ける。
- 未確認、出典確認、開発応用の棚卸しは Knowledge Dashboard と review 系 Base から辿れるようにする。
- SecondBrain 更新が非自明な場合は subagent 利用を標準候補にし、メインスレッドが保存先、repo 正本との境界、最終差分、verify、commit、push、最終報告を担う。

### Do Not Capture

- API key、Cookie、token、認証情報
- 不必要な個人情報
- 一時ログ全文
- repo 内正本と矛盾する未確認情報
- 人格評価、感情の断定、開発支援に不要な推測

### Skill

Obsidian capture を作成または更新する場合は、`second-brain-capture` Skill を使う。

## Engineering Defaults

- デフォルトは単純さを優先する。後方互換の shim や fallback は、明確な運用要件がある場合だけ追加し、追加する場合は目的、適用範囲、廃止条件を明記する。
- 依頼で求められていない将来拡張、汎用化、設定化、抽象化は追加しない。追加する場合は、今回の依頼で必要な入力、処理、出力、または既存運用上の差し替え点を説明できることを条件にする。
- ビジネスルールは UI、CLI、handler、transport 層へ直置きしない。
- 外部 API、DB、file I/O などの副作用は境界に隔離する。
- 新規コードは継承より composition を優先し、interface や abstraction は実際の差し替え点がある場合だけ導入する。
- god file、god class、god function を拡張しない。責務が増える場合は先に分割方針を決める。
- 既存の密結合構造を無批判に踏襲しない。変更が責務境界をまたぐ場合は、置き場所と依存方向を先に点検する。
- テストしやすい単位を優先し、副作用は端に寄せる。
- 既存の公開挙動は、明示的に変更を求められない限り保持する。
- 変更は最小差分を原則とし、無関係な rename、move、構成変更を混ぜない。
- 編集後は、変更した行が利用者の依頼、必要な verify、または自分の変更で発生した不要 import、不要変数、不要設定の cleanup に対応しているか確認する。対応を説明できない隣接 refactor、表記統一、整形、削除は行わない。
- 変更範囲が広い、横断的、または危険操作を含む場合は、先に分割案を示す。
- 実行中または verify 中に、未導入のツール、ライブラリ、Skill、preset が不足能力の原因になっている場合は、短い導入提案をしてよい。提案すべきか迷う場合は、提案を抑えるより、不足内容と候補を短く示す方を優先する。
- 依存追加や更新の前に、既存実装、標準機能、既存依存で代替できないか確認する。
- 外部ツールや依存ライブラリを提案する前に、`search-first` で既存手段を確認する。外部導入候補が残る場合は、`security-best-practices` が使える環境ではそれを使い、使えない場合でも供給網、権限、install script、version 固定を確認する。
- lockfile または version pin がない依存は、そのまま完了扱いにしない。
- 導入提案を見送られた場合は、少なくとも `not-now`、`policy-reject`、`security-reject`、`cost-reject` のいずれかで理由を整理する。`policy-reject` と `security-reject` は、明示的な再検討があるまで再提案しない。
- 実装または文書更新を始める前に、作業の成功条件を短く定義する。成功条件には、変更する対象、変えない対象、確認するコマンドまたは確認観点を含める。3 ステップ以上、または責務境界や仕様判断を含むタスクでは、`変更範囲`、`保持すべき公開挙動`、`最小 verify` を先に明示する。
- 解釈が複数あり、外部契約、公開挙動、削除、破壊的操作、仕様判断、利用者の明示判断が必要な項目に影響する場合は、前提を置いて進めず利用者に確認する。影響が局所的で戻せる場合は、前提を明示して進め、最終報告でその前提と確認結果を書く。
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
- commit と push はセーブポイントとして扱う。Codex がセッション中に意味のある差分を作った場合、利用者が停止を明示しない限り、既定の完了状態は `main` への commit と `origin/main` への push まで終わっている状態である。
- 利用者が `Pushまでしておいて` と言った場合は、この既定動作の実行漏れを補正する指示として扱う。その指示がないことを commit / push を省略する理由にしない。
- verify 未通過、未解決リスクあり、秘密情報や生成キャッシュの混入疑いあり、利用者判断待ちの項目あり、または利用者由来の無関係差分が混ざる状態では、通常の commit / push を行わない。
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
- 新しい画面、新しいタブ、未調査 API、response shape が不明な API を扱う場合は、実装前に `browser-trace` / `browser-to-api` の利用を検討する。`browser-trace` は通信、console、DOM、screenshot などの観測補助として扱う。`browser-to-api` は `browser-trace` の `.o11y/<run>/` capture を入力にし、OpenAPI、report、samples、confidence metadata を推定生成する調査補助として扱う。
- `browser-to-api` の生成物は公式 API 仕様ではなく、観測済み通信から作った推定資料として扱う。実装前に endpoint、query parameter、request sample、response sample、null 許容、optional field、empty array、error response、pagination、日付範囲、権限差、confidence を確認する。
- API 依存を実装する場合は、API adapter、cache key、UI 描画を分離する。UI component へ通信詳細、credential handling、未整理の `fetch` を直接埋め込まない。
- React 再描画に追従が必要な変更では、単発注入ではなく再同期前提で設計する。
- 既存 UI へ要素を追加するときは、標準要素を押しのけない余白や非干渉領域への配置を可能な範囲で優先し、難しい場合だけ安定性と実装コストを見て別案を選ぶ。

#### Browser API Discovery Data Handling

- 次のものは commit しない: `.o11y/`、HAR file、raw Chrome DevTools Protocol trace、request body、response body、generated sample body、Cookie、token、authorization header、API key、Browserbase session id、debugger URL、project id、個人情報、顧客情報、予約情報、価格や在庫の非公開データ。
- docs へ残す必要がある場合は、実データを削除または合成データへ置き換え、field 名、型、null 許容、optional 判定、confidence だけを反映する。
- raw trace や response body sample を保存する必要がある場合は、保存範囲、削除方針、秘密情報除去の方法を先に決める。決める前に capture 生成物を Git 管理へ入れない。

#### Non-public API Boundary

- Revenue Assistant 内で、自分の契約アカウント、自施設、自分の権限内の read-only API を、人間の画面操作に近い頻度で、画面補助または分析補助に使い、外部送信しない範囲は比較的安全な範囲として扱う。ただし Green 扱いでも、raw trace、HAR、request body、response body、credential、個人情報、顧客情報、予約情報、価格や在庫の非公開データは commit しない。
- 新規または未調査の未文書 API、response body 保存、background prefetch、価格・在庫・予約・顧客情報、標準画面より呼び出し回数が増える処理は Yellow として扱う。実装前に、利用目的、保存範囲、削除方針、負荷、権限確認を `docs/context/DECISIONS.md`、対象 `spec`、または task docs へ記録する。
- OTA、競合サイト、第三者サイトの hidden API は、公式 API、partner API、または明示許可がない限り実装対象にしない。公式 API や明示許可のない価格収集、在庫収集、予約情報収集は実装しない。
- 認証回避、rate limit 回避、bot 検知回避、他アカウント、他施設、非表示データへのアクセス、write 系 API の自動実行は禁止する。Red に該当する要望は、公式 API、partner 契約、手動確認、または許可されたデータソースへ切り替える。

### Build / Verify

- ビルドは `scripts/build.mjs` と `esbuild` で行い、TypeScript の型検査は `tsc --noEmit` で分離する。
- 通常の verify は `npm run typecheck`、`npm run lint`、`npm run build`、必要に応じて `npm run check` を使う。
- verify 手段が未整備なら勝手に増やさず、その旨を報告する。

## Frontend Product Design Routing

フロントエンド実装、UI redesign、prototype、image-to-code、または視覚品質が成果に大きく影響する作業では、Product Design プラグインが利用可能な場合、Product Design workflow を優先候補にする。
Product Design を frontend 作業の必須依存にはしない。Product Design プラグインが利用できない場合は、`frontend-skill` と通常の browser / screenshot verification で進める。
小規模な文言修正、機械的な CSS 修正、既存 component contract を変えない局所修正では、Product Design の brief gate を必須にしない。
Product Design を使う場合でも、既存 codebase の framework、routing、component、design token、test、build、preview の確認は省略しない。
Product Design が visual brief や prototype の前段を担当し、repo 内実装と検証を `frontend-skill` の手順で閉じる場合は、どちらの workflow がどの入力、処理、出力を担当したかを最終報告で分けて書く。

### Browser Tool Routing

ブラウザ操作が必要な場合は、先に目的を分類し、目的に合う手段を選ぶ。
ここでいう `Chrome拡張` は Codex Chrome Extension を通じて利用者本人の通常 Chrome を操作する手段を指す。
ここでいう `アプリ内ブラウザ` は Codex アプリ内に表示されるブラウザを指す。
ここでいう `Playwright` は、開発中アプリやテスト用ブラウザを自動操作するためのブラウザ自動化ライブラリを指す。
ここでいう `CDP` は Chrome DevTools Protocol を指し、remote debugging port などで Chrome へ接続する低レベルの開発者向け手段を指す。

- 利用者が `Chrome`、`@chrome`、`Chrome拡張`、`ログイン済みChrome`、`既存Chromeタブ` を明示した場合は、Chrome拡張を使う。対象は、通常 Chrome のログイン済み状態、Cookie による認証状態、既存タブ、利用者が Chrome に入れている拡張機能を前提にした確認である。
- Chrome拡張で既存タブを扱う場合は、タブ一覧から対象候補を確認し、対象タブを取り違えないようにする。業務システム、個人アカウント、認証済みサイトの内容を読む、タブを claim する、入力する、送信する、確定する場合は、対象タブと次に行う操作を明示してから進める。
- userscript が Tampermonkey、通常 Chrome profile、Revenue Assistant の実ログイン状態、または Chrome 拡張機能の実挙動に依存する確認では、Chrome拡張または CDP 接続付き Chrome を使う。
- 開発中の GUI を人間目線で確認する場合は、アプリ内ブラウザを優先してよい。対象は `localhost`、`127.0.0.1`、`file://`、開発サーバー、静的 HTML、ユーザーに見せたい画面確認、スクリーンショット、注釈付き確認である。ただし、Tampermonkey、通常 Chrome profile、Revenue Assistant の実ログイン状態が必要な確認はアプリ内ブラウザだけで完了扱いにしない。
- 利用者に確認してもらう入口は、アプリ内ブラウザまたは Chrome拡張に限定する。開発中 GUI、`localhost`、静的 HTML、公開ページはアプリ内ブラウザで見せる。通常 Chrome のログイン済み状態、既存タブ、Tampermonkey、利用者の Chrome 拡張機能が必要な場合は Chrome拡張で見せる。
- Codex が任意の開発検証としてブラウザを使う場合は、効率と再現性を基準に手段を選んでよい。DOM 操作、反復可能な操作確認、複数 viewport 確認、スクリーンショット比較、CI に近い確認は Playwright を優先候補にする。
- Playwright と CDP は Codex の内部検証手段として扱う。利用者に確認してもらう入口として、別の見える Playwright ブラウザや `about:blank` のウィンドウを開いたままにしない。
- CDP / `playwright-core` の remote debugging 接続は、対象 repo の手順が remote debugging port `9222` を前提にしている場合、network / console / performance 情報が必要な場合、Tampermonkey 上の実挙動確認が必要な場合、または Chrome拡張では取得できない開発者向け情報が必要な場合に使う。Chrome remote debugging が起動していない場合は、CDP 接続を既定にしない。
- Browser API discovery、`browser-trace`、`browser-to-api` は、ブラウザ操作そのものの既定手段ではない。許可された範囲の HTTP request / response を観測し、API 理解を補助するための追加手段である。
- 通常の Web 検索、公式 docs の確認、公開情報の調査は、ローカルブラウザ操作ではなく web search / docs MCP などの調査手段を使う。

## Delivery Rule

- 最終報告は、何を変えたか、なぜ変えたか、影響範囲、GUI 確認要否を優先する。
- 最終報告では、実施済み、未実施、未確認、承認待ちを分けて書く。
- Chrome や Tampermonkey の画面操作を伴う変更では、確認してほしい手順と期待結果を必ず示す。
- GUI 確認が不要な変更なら、その理由を明記する。

## Short Command Defaults

利用者の短い指示は、追加説明を要求せずに次の既定動作へ展開する。

- `すすめて`: `STATUS.md` の現在地と `tasks_backlog` の優先順位を確認し、完了済み task を再開せず、次の Goal Bundle を作って進める。実装を伴う場合は verify、関連 docs 同期、Session Git Sync Gate まで進める。
- `次にすすめて`: 現在の Goal Bundle が完了済みであることを確認し、`STATUS.md` または `tasks_backlog` から次の Goal Bundle へ移る。完了済み bundle の追加掘り下げを既定にしない。
- `未着手つぶして` / `ゴールモード`: `STATUS.md` と `tasks_backlog` から未着手 task を確認し、ユーザー可視成果ごとに Goal Bundle 化して、停止条件に当たるまで連続で進める。
- `Docs整備して`: docs-only として扱う。実装ファイルを編集せず、`STATUS.md`、`tasks_backlog`、`DECISIONS.md`、関連 `spec` の整合性を確認し、次スレッド入口、非対象、完了条件を明記する。
- `スレッド移行して`: 利用者が明示した場合だけ、次スレッドが会話履歴を読まなくても再開できるように、最初に読む正本、次の Goal Bundle、非対象、終了条件、verify / commit 状態を `STATUS.md` などの正本へ残す。通常終了時に毎回 handoff を作る指示としては扱わない。
- `見解だけ`: read-only として扱う。実装、commit、push をしない。必要な現物確認は行い、結論、根拠、不確実性、実装するなら最初に確認する事項を分けて報告する。
- `Pushまでしておいて`: 通常の追加要件ではなく、Session Git Sync Gate の実行漏れを補正する指示として扱う。この指示がなくても、意味のある差分があり条件を満たす場合は commit / push まで行う。

## Session Git Sync Gate

Codex がセッション中に意味のある差分を作った場合、利用者が停止を明示していない限り、既定の完了状態は次のすべてを満たす状態である。

1. 変更内容に対応する verify が通っている。
2. 必要な docs、`STATUS.md`、`tasks_backlog`、`DECISIONS.md`、関連 `spec` が同期されている。
3. 現在 task に関係する差分だけが stage されている。
4. active branch が `main` である。
5. commit が作成されている。
6. commit が `origin/main` へ push されている。
7. push 後に `git status --short --branch` を再確認し、未コミット差分なし、remote と同期済みであることを確認している。

次の場合は commit / push しない。

- verify が失敗している。
- 秘密情報、個人情報、生成キャッシュ、巨大な一時ファイルの混入疑いがある。
- 利用者由来の無関係差分が同じファイルまたは同じ working tree に残っており、現在 task の差分だけを安全に stage できない。
- 仕様判断、release 判断、公開判断、削除判断など、利用者判断待ちの項目が残っている。
- no-op で、repo に意味のある差分がない。
- 利用者が `commitしない`、`pushしない`、`見解だけ`、`docs案だけ` など、保存しない意図を明示している。

commit / push しない場合は、最終報告で理由、残っている差分、未実施または失敗した verify、次に必要な判断を明記する。
