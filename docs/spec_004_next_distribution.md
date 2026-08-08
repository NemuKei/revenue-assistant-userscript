# spec_004_next_distribution

## Purpose

Next userscriptを一度だけ手動インストールした後、Tampermonkeyの更新確認で同じ配布先から更新できるようにする。

この仕様はNextの公開artifact、GitHub Pagesへの配置、version、更新、公開確認、rollbackを所有する。Nextの画面、API、browser-local保存、Revenue Assistant writeの仕様は変更しない。

## Distribution Identity

| 区分 | 役割 | identity / version | 自己更新 |
| --- | --- | --- | --- |
| Classic公開版 | 凍結中の既存利用版 | 既存name / namespace、`0.1.0.442` | 既存URLを維持する |
| Next local candidate | 公開前のfixture・手動QA | `Revenue Assistant Next (Candidate)`、local namespace、`0.1.0.<candidate revision>` | `updateURL` / `downloadURL`を持たない |
| Next公開版 | 日常利用と継続更新 | local candidateと同じname / namespace、`0.2.0.<workflow run number>` | Next専用URLを`updateURL` / `downloadURL`に持つ |

Next公開版は、現在インストールされているNext candidateと同じTampermonkey identityを維持する。初回の公開版インストールで既存Nextを更新し、Classicまたは別のNextを同時実行させない。

## Stable URLs

- userscript: `https://nemukei.github.io/revenue-assistant-userscript/next/revenue-assistant-next.user.js`
- source map: `https://nemukei.github.io/revenue-assistant-userscript/next/revenue-assistant-next.user.js.map`
- release manifest: `https://nemukei.github.io/revenue-assistant-userscript/next/release.json`

公開userscriptはmetadata先頭に、candidateと同じ`name`、`namespace`、`match`、`grant none`、`run-at document-idle`を持つ。`updateURL`と`downloadURL`は上記userscript URLと完全一致させる。`connect`、`require`、`resource`は追加しない。

## Artifact Contract

- 公開artifactは`src/next/entry.ts`からViteで生成し、`dist/`やlocal candidateを手編集またはそのまま公開しない。
- 公開buildと同じsourceから生成したlocal candidateについて、userscript metadataとsource map参照以外の実行payloadが一致することを検査する。
- Pages artifactには、Next userscript、Next source map、release manifest、`.nojekyll`を含める。
- release manifestには、公開URL、version、source commit、workflow run ID / number / attempt、artifact byte数、SHA-256を含める。
- credential、Cookie、token、raw response、価格・在庫、予約・顧客情報、browser-local保存値をartifactまたはmanifestへ含めない。

## Classic Preservation

GitHub Pages deploymentはsite全体を置き換えるため、Nextだけをuploadしない。

- deploy前に現在のClassic userscriptとsource mapを公開URLから取得する。
- `.github/classic-publication-baseline.json`のbyte数とSHA-256へ両方が一致しない場合は停止する。
- Pages artifactのrootには照合済みClassic userscriptとsource mapをbyte列のまま含め、既存URLを維持する。
- deploy後にもClassic userscriptとsource mapを同じbaselineへ再照合する。
- Classicをsourceから再build、再解釈、改変しない。

## Publication Workflow

- `.github/workflows/publish-next-userscript.yml`だけがNextのPages書込を所有する。
- triggerは`workflow_dispatch`だけとし、`main` pushやpull requestでは公開しない。
- `main`上で実行し、入力値`PUBLISH_NEXT`による明示確認が一致しない場合は停止する。
- lockfileどおりに依存を導入し、Classic / Nextのfull check、publication boundary、公開artifact、Classic live baselineを通してからPages artifactを作る。
- deploy jobだけに`pages: write`と`id-token: write`を与え、GitHubの`github-pages` environmentを通す。
- deploy後はNextのuserscriptとrelease manifest、Classicのuserscriptとsource mapをremoteから再取得して照合する。
- 同じworkflow run numberを異なる公開byte列へ再利用しない。

## Update Behavior

- 初回だけ利用者がNext公開URLを開き、現在のNext candidateを公開版へ更新する。
- 以後はTampermonkeyの定期更新確認、または利用者の明示した手動更新確認で同じURLから新versionを取得する。
- Git push、local build、candidate生成だけでは公開版やインストール済み版を変更しない。
- 公開直後の即時反映はTampermonkeyの確認間隔に依存するため、公開完了とインストール完了を分けて確認する。

## Rollback

- 不具合時は問題commitを`main`上でrevertし、同じmanual workflowを再実行する。
- rollback artifactにも新しいworkflow run numberを付け、Tampermonkeyから見てversionを前進させたまま実行payloadを既知の正常状態へ戻す。
- 公開済みartifactを同じversionのまま上書きしてrollbackしたことにしない。
- Classicへの切替はNext rollbackとは別操作とし、NextとClassicを同時に有効化しない。

## Acceptance Criteria

1. local candidateは従来どおり自己更新URLなしで生成・検証できる。
2. syntheticな公開buildでversion、stable URL、metadata allowlist、candidateとの実行payload一致を検証できる。
3. publication workflowはmanual-only、main-only、explicit confirmation、Classic byte保全、post-deploy remote verificationを満たす。
4. 初回公開後、Next userscriptとrelease manifestのversion、source commit、byte数、SHA-256が一致する。
5. 初回公開の前後でClassic userscriptとsource mapのbyte数、SHA-256がbaselineから変わらない。
6. Tampermonkeyで公開版versionと更新URLを確認し、Revenue AssistantではNext runtimeが1つだけ動作する。
7. TopからAnalyzeの標準3 tabまで、標準UI非干渉、Next主要表示、console error 0、Revenue Assistant write 0をread-only smokeで確認する。

## Update Trigger

公開URL、Next identity、version規則、workflow trigger、Pages artifact内容、Classic保全、承認方法、rollback、公開後の合格条件を変更するときに、このspecをコードと同じ変更集合で更新する。
