# AGENTS.md

## Purpose

このファイルは、revenue-assistant-userscript (RAU) で安全に作業を始めるための最初の operational read である。

RAU は、Revenue Assistant 上で RM のレート調整判断を軽くする Tampermonkey userscript 基盤である。独立 RMS、PMS / DWH、推奨レート金額、自動反映、一括反映、credential 保存、非公開データ保存を目的にしない。

この repo は AGENTS-first, not AGENTS-only で運用する。毎回必要な作業入口、source map、安全境界、dist / API / write 境界、最小 verify、Git default はこのファイルに置く。背景意図や profile は `docs/context/PROJECT_CONTEXT.md` を optional upper premise layer として扱う。

## Read Budget

- 初手で読むのはこの `AGENTS.md` と `git status --short --branch`。
- `docs/context/PROJECT_CONTEXT.md` は、premise、strategy、非目的、安全境界、API / write / distribution boundary、docs governance に触れるときだけ読む。通常 task の unconditional full read にはしない。
- 追加読込は、目的と対象を先に決めてから最小限にする。
- 不足があれば推測せず、必要な正本を特定して読む。

## Source Map

優先順位:

1. セキュリティ、法令、公開制約、認証情報保護
2. `AGENTS.md`: 作業入口、source map、常設安全境界、verify / Git default
3. `docs/context/PROJECT_CONTEXT.md`: optional upper premise。目的、背景意図、非目的、profile、安全境界
4. `docs/spec_*.md`: 外部挙動、受け入れ条件、distribution / write boundary
5. `docs/context/INTENT.md`: 判断原則、比較軸
6. `docs/context/DECISIONS.md`: durable decision と判断理由
7. `docs/context/STATUS.md`: 現在地、re-entry、直近 verify 状態
8. `docs/tasks_backlog.md`: task の棚卸し、優先順、triage
9. `docs/context/PRODUCT_DESIGN_AUDIT.md`: UI / UX audit artifact。正本更新は spec、STATUS、backlog 側で行う
10. `README.md`: setup、build、verify、distribution 手順
11. 既存コード、テスト、CI、設定ファイル

`PROJECT_CONTEXT.md` は progress、task queue、verification log、単発 decision の置き場ではない。`STATUS.md`、`DECISIONS.md`、`tasks_backlog.md` は targeted optional layer として読み、標準必須 read にしない。

## Docs Governance

- 会話内容だけを正本にしない。正本化する場合は対象 docs を更新する。
- 仕様は `docs/spec_*.md`、上位前提は `docs/context/PROJECT_CONTEXT.md`、判断原則は `docs/context/INTENT.md`、判断理由は `docs/context/DECISIONS.md`、現在地は `docs/context/STATUS.md`、実行順は `docs/tasks_backlog.md`、利用手順は `README.md` に置く。
- 同じルールを複数文書へ重複記載しない。重い背景前提は `PROJECT_CONTEXT.md`、日々の再開地点は `STATUS.md`、単発の固定判断は `DECISIONS.md` に分ける。
- 新規 docs を作る前に既存正本へ統合できるか確認する。
- `docs/spec_000_overview.md` は spec map と spec 更新規則に限定し、個別画面の詳細を書き溜めない。
- `docs/ai/` は AI collaboration artifact の置き場候補だが、未確認生成物や user-owned artifact を自動採用しない。採用する場合も secret / PII / raw trace を除去し、今回 task の対象ファイルだけ stage する。

## RAU Product Boundary

- 配布物と Tampermonkey への投入物は `dist/*.user.js` を正とする。
- `dist/*.user.js` を手編集しない。必要な変更は `src/`、`scripts/build.mjs`、`userscript.config.mjs` 側で行う。
- userscript metadata は `userscript.config.mjs` に集約し、source へ重複記載しない。
- Revenue Assistant の画面差分は、API 起点で取れるものと DOM 起点でしか取れないものを分けて設計する。
- API 依存を実装する場合は、API adapter、cache key、UI 描画を分離する。UI component に通信詳細、credential handling、未整理の `fetch` を直接埋め込まない。
- React 再描画に追従が必要な UI は、単発注入ではなく再同期前提で設計する。
- 既存 UI へ要素を追加するときは、標準要素を押しのけない余白や非干渉領域を優先する。

## Non-public API / Write Boundary

| Zone | 扱い |
| --- | --- |
| Green | 自分の契約アカウント、自施設、自分の権限内の read-only API を、画面補助または分析補助に、人間の画面操作に近い頻度で使う。外部送信しない。raw trace、HAR、request / response body、credential、個人情報、顧客情報、予約情報、価格や在庫の非公開データを保存・commit しない。 |
| Yellow | 新規または未調査の未文書 API、response body 保存、background prefetch、価格・在庫・予約・顧客情報、標準画面より呼び出し回数が増える処理。実装前に、利用目的、保存範囲、削除方針、負荷、権限確認を `docs/context/DECISIONS.md`、対象 `spec`、または task docs へ記録する。 |
| Red | 認証回避、rate limit 回避、bot 検知回避、他アカウント、他施設、非表示データへのアクセス、write 系 API の自動実行、公式 API / partner API / 明示許可のない OTA・第三者サイト hidden API。実装しない。 |

write 操作を扱う場合は、明示操作、直前再確認、取消可能性、guard、失敗時の非反映を仕様で先に固定する。推奨レート金額、自動反映、一括反映は現行非目的である。

## Browser Discovery Data

- `.o11y/`、HAR、raw Chrome DevTools Protocol trace、request body、response body、generated sample body、Cookie、token、authorization header、API key、Browserbase session id、debugger URL、project id、個人情報、顧客情報、予約情報、価格や在庫の非公開データは commit しない。
- docs に残す必要がある場合は、実データを削除または合成データへ置き換え、field 名、型、null 許容、optional 判定、confidence だけを反映する。
- 新しい画面、新しいタブ、未調査 API、response shape が不明な API は、実装前に browser trace / API inference を検討する。ただし生成物は公式仕様ではなく観測補助として扱う。

## Build / Verify

- ビルドは `scripts/build.mjs` と `esbuild`、型検査は `tsc --noEmit` で分離する。
- 通常 verify は `npm run typecheck`、`npm run lint`、`npm run build`、必要に応じて `npm run check`。
- docs-only 変更の最小 verify は `git diff --check`、対象 docs の BOM check、必要な `rg` consistency scan、secret / credential / raw trace marker scan、`git status --short --branch`。
- verify 手段が未整備なら勝手に増やさず、確認済み範囲と未確認範囲を分けて報告する。

## Git Defaults

- 既定 branch は `main`。
- 意味のある差分を作り、verify が通った場合、利用者が停止を明示しない限り、対象差分だけを commit し `origin/main` へ push する。
- stage するのは今回 task に関係するファイルだけ。user-owned の未追跡ファイルや無関係差分は触らない。
- verify 未通過、秘密情報混入疑い、利用者判断待ち、無関係差分混入のいずれかがある場合は commit / push しない。
- 履歴書き換え、rebase、force push、branch deletion、destructive cleanup は明示依頼がある場合だけ行う。

## Codex Orchestration Defaults

- 既定は single-owner / linear on `main`。並列 worktree orchestration は利用者が明示した場合だけ使う。
- `STATUS.md`、`docs/tasks_backlog.md`、`docs/context/DECISIONS.md`、central specs、lockfiles、generated manifests は shared / high-conflict file として扱い、並列時は parent-owned を原則にする。
- child thread や subagent の結果は、そのまま正とせず、main thread 側で scope、根拠、残リスク、verify を確認してから採用する。

## Goal Bundle Execution

Task ID、TODO、issue、checklist item は追跡単位であり、常に停止単位ではない。利用者が継続実装を求めた場合は、同じユーザー可視成果、同じ責務境界、同じ verify セット、同じ rollback 単位に収まる task を Goal Bundle として扱う。

Goal Bundle 内では小 task ごとに確認で止まらない。止まるのは、外部契約、公開挙動、削除、migration、依存追加・更新、認証・secret・権限、実データ操作、release / publish、または利用者判断が必要な仕様判断が出た場合だけにする。

## Engineering Defaults

- 既存の設計、命名、テスト、フォーマット、運用手順を優先する。
- 変更は最小差分に保ち、無関係な rename、move、構成変更、整形、refactor を混ぜない。
- ビジネスルールは UI、CLI、handler、transport 層へ直置きしない。
- 外部 API、DB、file I/O などの副作用は境界に隔離する。
- 依存追加や更新の前に、既存実装、標準機能、既存依存で代替できないか確認する。
- 明示承認なしで、依存追加や更新、大量削除、設定変更、認証・secret・権限まわりの変更、配布設定変更、rename、move、migration、実データ操作を行わない。

## Frontend / Tool Routing

- フロントエンド実装、UI redesign、prototype、image-to-code、視覚品質が成果に大きく影響する作業では、利用可能なら Product Design workflow を優先候補にする。
- 小規模な文言修正、機械的 CSS 修正、既存 component contract を変えない局所修正では Product Design brief gate を必須にしない。
- booking curve、価格推移、競合価格、月次実績など chart / tooltip / series / mobile 可読性が主題なら data visualization workflow を検討する。
- どの plugin / Skill を使っても、repo 内の framework、routing、component、design token、test、build、preview の確認は省略しない。

## SecondBrain / Capture

repo 内 docs が RAU の正本である。SecondBrain は repo をまたぐ検索、比較、再利用の補助であり、RAU の `PROJECT_CONTEXT`、spec、STATUS、DECISIONS、backlog を置き換えない。

SecondBrain を使うのは、他 repo へ再利用する運用判断、ユーザーが明示した横断知識、または repo docs だけでは足りない専門知識が必要な場合に限る。保存する場合も secret、credential、raw trace、個人情報、非公開データは残さない。

## Owner Profile

- `Language`: 日本語
- `Technical baseline`: 職業プログラマーではない。コード全文より先に、何を変えたか、なぜ変えたか、影響範囲を把握したい。
- `Communication preference`: 結論先出し。必要な次アクションを明示する。専門語は必要最小限にする。
- `Explanation depth`: 実装意図と変更点の説明を重視する。
