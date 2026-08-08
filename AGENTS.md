<!-- agents-catalog-basis: repo-template-codex@8877297d; profile=solo-product; overlays=data-contract-and-migration,architecture-and-dependencies,browser-observation-safety -->
# AGENTS.md

## Purpose And Outcome

このファイルは、revenue-assistant-userscript (RAU) で安全に作業を始めるための最初の operational read である。

RAU は、Revenue Assistant 上で RM のレート調整判断を軽くする Tampermonkey userscript 基盤である。利用者が標準画面の文脈を保ったまま、確認すべき日・部屋・比較材料・次の操作を短時間で判断できることを成果とする。

独立 RMS、PMS / DWH、推奨レート金額、自動反映、一括反映、credential 保存、非公開データの網羅的保存は目的にしない。product挙動を変える前に、今回の成功状態、成果へ届く理由、変えない境界を確認し、入口から利用者が確認できる結果までを1つの動くsliceとして扱う。

## Repo Entrypoint And Source Routing

- 初手で読むのはこの `AGENTS.md` と `git status --short --branch`。追加読込は、現在の判断を変え得る正本へ絞る。
- `docs/context/PROJECT_CONTEXT.md` は、目的、profile、strategy、非目的、API / write / distribution boundary、docs governanceを判断するときだけ読む。通常taskのunconditional full readにはしない。
- `docs/spec_*.md` は外部挙動、受け入れ条件、保存形式、distribution / write contractを所有する。
- `docs/context/INTENT.md` は判断原則、`docs/context/DECISIONS.md` はdurable decisionと理由、`docs/context/STATUS.md` は現在地とre-entry、`docs/tasks_backlog.md` は実行順と完了履歴を所有する。存在するだけで毎回読まない。
- `README.md` はsetup、build、verify、distribution手順、`docs/context/PRODUCT_DESIGN_AUDIT.md` はUI / UX audit evidenceを所有する。auditから正本を変える場合はspec、STATUS、backlogの該当ownerへ戻す。
- code、test、CI、設定fileはlive behaviorとmechanical proofを所有する。安全・法令・公開・認証情報の境界を最優先し、その後は問いに最も近いactive ownerとfresh evidenceを使う。
- 会話だけを正本にせず、同じruleを複数layerへ複製しない。新規docは既存ownerへ統合できず、反復参照され、ownerとupdate triggerを定義できる場合だけ作る。
- materialなdurable context候補、陳腐化、矛盾、責務ずれは、明示依頼がなくても`context-lifecycle`で検出してよい。ただし検出はtaskのwrite権限を拡張しない。read-onlyでは候補提示に留め、許可済みrepo変更ではsemantic ownerが採用した内容だけを既存surfaceへ反映する。
- routine closeoutをcapture ceremonyにしない。Memory、SecondBrain、別repo、runtime、外部serviceへの書込みは、それぞれのownerと明示権限がある場合だけ行う。
- `docs/spec_000_overview.md` はspec mapと更新規則に限定する。`docs/ai/`の未確認生成物やuser-owned artifactは自動採用せず、secret / PII / raw traceを除去した今回scopeのfileだけを扱う。

## Project Compass

- この repo は `maintain-project-compass` に明示opt-inする。目的、優先順位、固定判断、作業仮説、未解決事項、停止条件、次の検証入口、正本とのgapがmaterialに変わった場合だけ更新し、routine progress、文言修正、test rerun、通常closeoutでは更新しない。
- stateは`.chatgpt/context-dashboard/state.json`、生成HTMLは`.tmp/context-dashboard/index.html`に置く。どちらもignored / untrackedなlocal-only派生物とし、Git追跡、commit、push、release、deploy、外部公開を行わない。
- 入力はrepo内正本、Git metadata、利用者が明示した安全な判断単位に限定する。Compassは正本ではなく、PII、credential、raw log、browser history、session data、価格・在庫などの非公開実データを保存せず、正本との差は`alignment.gaps`へ残す。

## Product And Distribution Boundary

- sourceから生成するClassic検証artifactと、明示承認後にTampermonkeyへ投入するrelease candidateは`dist/*.user.js`を正とする。Classic公開凍結中の公開物は、公開URLのbyte列と`.github/classic-publication-baseline.json`を正とし、local `dist`を現在の公開版とみなさない。
- `dist/*.user.js`を手編集しない。変更は`src/`、`scripts/build.mjs`、`userscript.config.mjs`などのowner sourceで行い、userscript metadataは`userscript.config.mjs`へ集約する。
- ClassicとNextのidentity、runtime、保存領域、publication boundaryを混ぜない。candidate生成、Tampermonkey install / switch、Classic再公開、Next publish / releaseは別gateとし、通常のcommit / pushから推論しない。
- Next公開版は`docs/spec_004_next_distribution.md`を契約とし、Next専用GitHub Pages URL、`0.2.0.<workflow run number>`、`updateURL` / `downloadURL`を持つ。`main` pushでは公開せず、manual workflow、明示確認、Classic byte保全、remote照合を通した場合だけ更新する。
- 既存のRevenue Assistant標準UIを置き換えず、非干渉領域へ補助情報を追加する。標準要素のgeometry、操作、表示切替、主要graphを変える場合は、利用者が触る経路でbefore / afterを確認する。
- 変更は入口から表示結果まで動くvertical sliceにする。大きい変更は個別にsmokeできるsliceへ分け、長期間未完成になる全面置換を行わない。

## Data, Architecture, And Dependencies

- IndexedDB schema、保存JSON、cache key、userscript metadata、設定file、公開URL、Revenue Assistant APIの観測済みshapeをcontractとして扱う。意味やshapeを変える前にbefore / after、caller、互換方針、migration、rollbackを確認する。
- 既存dataを無断で削除、初期化、再解釈しない。migrationはforwardに追加し、backup、atomicity、validation、reopen、rollbackが必要な範囲を明示する。
- Revenue Assistantの画面差分は、API起点とDOM起点を分ける。API adapter、runtime validation、cache / store、view model、UI描画を、変更理由と独立検証が異なる境界で分離する。
- UI componentへ通信詳細、credential handling、未整理の`fetch`、business ruleを直接埋め込まない。React再描画に追従するUIは単発注入ではなく再同期とcleanupを前提にする。
- architectureを整えること自体を成果にせず、現在の変更に必要なseamだけを作る。将来の可能性だけでlayer、interface、service、fileを増やさない。
- 新dependencyやversion更新の前に、既存実装、標準機能、既存dependency、current documentationで代替できないか確認する。追加する場合はmaintenance、security、license、bundle size、重複、lockfile差分を確認し、明示承認を得る。

## Non-public API, Browser Observation, And Write Boundary

| Zone | 扱い |
| --- | --- |
| Green | 自分の契約アカウント、自施設、自分の権限内の read-only API を、画面補助または分析補助に、人間の画面操作に近い頻度で使う。外部送信しない。raw trace、HAR、request / response body、credential、個人情報、顧客情報、予約情報、価格や在庫の非公開データを保存・commit しない。 |
| Yellow | 新規または未調査の未文書 API、response body 保存、background prefetch、価格・在庫・予約・顧客情報、標準画面より呼び出し回数が増える処理。実装前に、利用目的、保存範囲、削除方針、負荷、権限確認を `docs/context/DECISIONS.md`、対象 `spec`、または task docs へ記録する。 |
| Red | 認証回避、rate limit 回避、bot 検知回避、他アカウント、他施設、非表示データへのアクセス、write 系 API の自動実行、公式 API / partner API / 明示許可のない OTA・第三者サイト hidden API。実装しない。 |

- HTTP request / responseの観測は通常のbrowser controlの既定手段にしない。公式API、現行spec、provider documentationで不足し、endpoint、parameter、response shapeの観測が必要な場合だけ`browser-api-discovery`を使う。
- 観測前にcurrent tool contract、対象accountと権限、利用規約・契約、scope、load、保存先、retention、deletionを確認する。観測結果は`observed evidence`であり公式contractではないため、fact、inference、confidence、unknownを分ける。
- `.o11y/`、HAR、raw Chrome DevTools Protocol trace、request / response body、Cookie、token、authorization header、API key、session / debugger URL、個人・顧客・予約情報、価格・在庫などの非公開データをcommitまたは外部送信しない。
- 正本へ残す場合は実dataと識別子を除去またはsynthetic dataへ置き換え、必要最小限のfield、型、null許容、confidence、unknownだけを反映する。
- write操作を扱う場合は、明示操作、直前再確認、取消可能性、guard、失敗時の非反映をspecで先に固定する。推奨レート金額、自動反映、一括反映は現行非目的である。

## Implementation And Verification

- 既存の設計、命名、test、format、運用手順を優先し、現在の成果に必要な最小の一貫した変更を選ぶ。無関係なrename、move、構成変更、整形、refactorを混ぜない。
- フロントエンド作業は`frontend-skill`をcapability routerとし、利用者の明示指定を優先して現在利用可能なdesign / engineering ownerを1つ選ぶ。Product Designを固定依存にせず、局所的な文言・CSS修正へbrief gateを強制しない。
- booking curve、価格推移、競合価格、月次実績などchart / tooltip / series / mobile可読性が主題ならdata visualization workflowを検討する。どのSkill / Pluginを使ってもrepoのframework、routing、component、design token、test、build、previewを確認する。
- buildは`scripts/build.mjs`と`esbuild`、型検査は`tsc --noEmit`で分離する。通常verifyは`npm run typecheck`、`npm run lint`、`npm run build`、必要に応じて`npm run check`を使う。
- UI、route、API-facing、保存contractを変えた場合は、変更に直結するtestに加え、fixtureまたは認証済み実画面で利用者が触る経路、標準UI非干渉、request budget、write 0、cleanupをriskに応じて確認する。
- docs-only変更は`git diff --check`、対象docsのBOM、targeted consistency scan、diff-scoped secret / credential / raw trace scan、`git status --short --branch`を最小verifyとする。
- testを通すために検証を弱めたりerrorを無視したりしない。未実行または実行不能な確認は、理由と残riskを分けて報告する。

## Local Work And Git

- 既定branchは`main`で、single-owner / linearを基本にする。並列作業を行う場合も、`STATUS.md`、`docs/tasks_backlog.md`、`docs/context/DECISIONS.md`、central specs、lockfile、generated manifestはownerを1つに固定する。
- 利用者の無関係な差分を保持し、今回taskのfileだけをstageする。委譲結果はmain側でscope、根拠、残risk、verifyを確認してから採用する。
- 意味のある差分を作りverifyが通った場合、利用者が停止を明示しない限り、対象差分だけをcommitし`origin/main`へpushする。docs-only pushをuserscript release、Tampermonkey切替、公開承認とみなさない。
- verify未通過、secret混入疑い、利用者判断待ち、無関係差分混入がある場合はcommit / pushしない。rebase、force push、branch deletion、destructive cleanupは明示依頼がある場合だけ行う。

## SecondBrain / Capture

repo 内 docs が RAU の正本である。SecondBrain は repo をまたぐ検索、比較、再利用の補助であり、RAU の `PROJECT_CONTEXT`、spec、STATUS、DECISIONS、backlog を置き換えない。

SecondBrain を読むのは、他 repo へ再利用する運用判断、利用者が明示した横断知識、または repo docs だけでは足りない専門知識が必要な場合に限る。書き込みは利用者の明示依頼または採用済み capture policy がある場合だけ行い、routine closeout の定型 capture は置かない。secret、credential、raw trace、個人情報、非公開データは残さない。

## Owner Profile

- `Language`: 日本語
- `Technical baseline`: 職業プログラマーではない。コード全文より先に、何を変えたか、なぜ変えたか、影響範囲を把握したい。
- `Communication preference`: 結論先出し。必要な次アクションを明示する。専門語は必要最小限にする。
- `Explanation depth`: 実装意図と変更点の説明を重視する。
