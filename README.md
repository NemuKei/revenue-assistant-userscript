# Revenue Assistant Userscript

レベニューアシスタント向けの Tampermonkey userscript を、TypeScript で安全に開発するための専用ワークスペースです。

## 目的

- レベニューアシスタントの画面拡張を userscript で実装する
- 機能ごとの DOM 依存や API 依存を整理しながら育てる
- Chrome remote debugging と DevTools MCP を使って確認しやすくする

初期ターゲットは、analyze 日付ページで団体室数と販売設定差分を見やすくすることです。ただし repo 自体は単機能に閉じず、今後のレベアシ向け拡張を受け止める汎用基盤として扱います。

## Product Lines

- `Classic`: 現在公開中の userscript。既存の name / namespace / filename / updateURL / downloadURL / 公開 URL を維持し、Next への cutover までは凍結する。
- `Next`: 別 identity の未公開 candidate。`userscript.next.config.mjs` と `src/next/entry.ts` を入口にし、`.tmp/vite-next-candidate/revenue-assistant-next.candidate.user.js` へだけ生成する。自己更新 URL と `dist/` 出力を持たない。
- Classic と Next を同じ Revenue Assistant tab で同時に実行しない。初期 Next QA は Tampermonkey で Classic を無効化してから reload する。Next は既に描画済みの Classic DOM を検出すると停止するが、現公開 Classic が後から起動する競合までは防げない。
- Next の現在の entry は、Revenue Assistant の表示中カレンダーだけへ接続する read-only な基準日レンズ shell である。通常の日付クリックは変更せず、利用者が `基準日を選ぶ` を押した直後の1回だけ選択として扱う。OH / 個人 / 団体 / 競合の実データ adapter は未接続で、値・類似候補・一致度を推測表示しない。Tampermonkey install / switch、publish、write 操作は未実施である。

## 前提

1. Node.js 22 LTS 以上
2. Google Chrome
3. Chrome 拡張の Tampermonkey
4. `npm run chrome:debug` を使う場合は PowerShell 7 (`pwsh`)

## 初期セットアップ

```powershell
npm install
npm run check
```

## 開発コマンド

- `npm run dev`: `dist/*.user.js` を watch build
- `npm run build`: Classic userscript bundle を `dist/` へ 1 回ビルド。Classic / Next の公開経路分離までは検証用であり、push / 配布しない
- `npm run build:legacy`: 旧 esbuild build を rollback 候補として 1 回実行
- `npm run dev:fixture`: Revenue Assistant runtime へ接続しない Vite fixture preview を起動
- `npm run build:vite:fixture`: Vite fixture preview を build
- `npm run build:vite:candidate`: 正規 `dist` を上書きしない Vite candidate userscript build を `.tmp/vite-candidate/` に生成
- `npm run build:next:candidate`: Next の独立 userscript candidate を `.tmp/vite-next-candidate/` に生成
- `npm run dev:next:fixture`: Next の類似度モデル fixture を `http://127.0.0.1:5173/dev/fixtures/similarity-lens/`、実画面接続 shell fixture を `http://127.0.0.1:5173/dev/fixtures/next-live-shell/` で preview
- `npm run build:next:fixture`: Next の基準日レンズ合成 fixture を `.tmp/vite-next-fixture/` に生成
- `npm run check:next`: Next の型、lint、runtime lease、live shell の純粋ロジック、類似度 model、read-only artifact metadata、fixture build をまとめて確認。DOM interaction は Browser fixture と単一 runtime の実画面 QA で別途確認する
- `npm run check:classic-publication`: Classicの公開baseline manifest、workflow allowlist、公開権限もdeploy処理も持たないverify-only workflowの完全一致をoffline検査。`-- --live` を付けると公開URLのmetadata、bytes、SHA-256とGitHub Actions run provenanceも照合する
- `npm run build:compare:vite`: 正規 `dist` と Vite candidate の userscript metadata、size、entry line を比較
- `npm run check:fixture-markers`: Revenue Assistant 認証、Tampermonkey、通常 Chrome profile を使わず、fixture の合成 data だけで top のカレンダー連携型判断 workspace の主要 UI marker を確認
- `npm run typecheck`: TypeScript の型検査
- `npm run lint`: ESLint 実行
- `npm run check`: 型検査、lint、build をまとめて実行
- `npm run react:doctor`: 固定済み `react-doctor@0.7.8` を repo-local に実行。diagnosticを停止条件へ使わず、個別確認の起点にする
- `npm run chrome:debug`: デバッグポート 9222 付きの Chrome を専用プロファイルで起動
- `npm run chrome:debug:default-profile`: 既存の Chrome Default プロファイルを remote debugging 付きで起動
- `npm run chrome:debug:default-profile:resume`: 既存の Chrome Default プロファイルを前回セッション復元付きで起動
- `npm run chrome:profiles`: 利用可能な Chrome プロファイルを一覧表示
- `npm run chrome:pages`: CDP 経由で Chrome に接続し、開いているページを一覧表示
- `npm run userscript:version-check -- --installed-version <Tampermonkey上のversion>`: local `dist`、GitHub Pages 公開版、Tampermonkey 上の version、Revenue Assistant tab の有無を確認
- `npm run smoke:write-posts -- --seconds 30 --operation <確認内容>`: CDP 接続中の Chrome tab で、監視対象 write API の POST 件数を確認
- `npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode top --url https://ra.jalan.net/`: 配布版 version、画面別主要 selector、監視対象 write API POST 件数をまとめて確認

## Verification

```powershell
# 通常の repo-wide verify
npm run check

# 型エラーだけを先に確認
npm run typecheck

# ESLint だけを確認
npm run lint

# userscript bundle 再生成だけを確認
npm run build

# 正規 build と candidate build の metadata / size 比較
npm run build:vite:candidate
npm run build:compare:vite

# Next の独立 candidate と基準日レンズ fixture を確認
npm run check:next

# React component 変更後の追加診断
npm run react:doctor -- --scope full

# commit 前の whitespace error 確認
git diff --check
```

`npm run check` は repo 全体の typecheck / lint の後に Classic artifact を build します。`npm run check:next` も repo 全体の typecheck / lint を通し、続けて Next 専用の runtime lease、類似度 model、artifact metadata、candidate / fixture build を確認します。

React component、React mount、React state 管理を追加または変更した場合は、`npm run check` に加えて `npm run react:doctor -- --scope full` を実行します。`react-doctor` は `devDependency` として `0.7.8` に固定し、lockfile に記録しています。package scriptは `--blocking none` とし、exit code 0をdiagnostic 0件の意味に読み替えません。出力は仮説として対象codeを確認し、今回scope外の既存診断を自動修正しません。`@latest` を指定した `npx react-doctor@latest`、global install、lockfile を更新しない一時実行は使いません。更新する場合は、npm registry の version、license、repository、dependencies、bin、lifecycle script、lockfile 差分、`npm audit`、repo-local 実行結果を確認してから行います。`npm install` や `npm run react:doctor` が Node engine、install script、未確認依存、network、権限のいずれかで失敗する場合は、その回の React 診断は停止し、`npm run check` と通常 Chrome smoke を代替 verify として記録します。

Codex automation shell などで `npm run ...` をそのまま実行できない場合は、次の direct command を fallback として使います。

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\eslint\bin\eslint.js .
node .\node_modules\vite\bin\vite.js build --config .\vite.userscript.config.mjs --mode userscript
```

`npm run build` は Vite build を正規 path として使います。旧 esbuild build へ戻す必要がある場合は、まず `npm run build:legacy` で `dist/revenue-assistant-userscript.user.js` を再生成し、Vite 起因の問題かどうかを切り分けます。旧 build を正規 path に戻す判断は、`package.json` の `build` script を `node ./scripts/build.mjs` に戻す変更として扱います。

## 配布版確認と通常 Chrome smoke

Classic公開を凍結している間、この節は日常のNext QA手順ではなく、将来Classic release gateを明示的に再開した場合の確認runbookとして扱います。local `dist`を更新しただけで公開版またはTampermonkey installed versionを揃えません。Nextは別identityのcandidateとし、Classicを無効化した単一runtimeで検証します。

### Version Check

1. `npm run build` を実行し、local `dist/revenue-assistant-userscript.user.js` を更新する。
2. `npm run userscript:version-check` を実行し、local version、published version、`@updateURL`、`@downloadURL`、Revenue Assistant tab の有無を確認する。
3. Tampermonkey dashboard で対象 userscript の version を確認する。既定では Codex が dashboard の保存操作を自動化しない。配布版検証で installed version を published version へ揃える必要があり、利用者が明示的に許可した場合だけ、Codex は Chrome 拡張または @コンピュータ経由で Tampermonkey dashboard の更新操作を行ってよい。
4. 更新後に `npm run userscript:version-check -- --installed-version <確認したversion> --open-url https://ra.jalan.net/` を実行し、local / published / installed version と開いた Revenue Assistant URL を記録する。

### Smoke Checklist

通常 Chrome、Tampermonkey、Revenue Assistant ログイン状態が必要な確認では、CDP 一時注入ではなく配布版 userscript を使います。CDP は DOM、console、network の観測補助に限定します。

| 画面 | 操作 | 期待結果 | 証跡として残す値 |
| --- | --- | --- | --- |
| Top 今日の判断 | Revenue Assistant top を reload | 既存カレンダー左、`今日の判断` rail 右、選択詳細が下に表示される | URL、task / detail count、calendar workspace、`data-ra-rank-recommendation-react-island="mounted"`、console error 件数 |
| Top 今日の判断 | rail の候補を切り替える | 選択した宿泊日・部屋タイプの詳細だけが表示され、`OH / キャパ`、`個人`、`団体`、判断根拠が分離して読める | selected task、detail heading、OH / 個人 / 団体 marker、evidence host 件数 |
| Top 今日の判断 | `変更内容を確認` を開き、`確認をやめる` で戻る | 最終送信 button は確認画面でのみ表示され、取消後は消え、実 POST は発生しない | review region、final write button、focus return、取消後の final button 件数、監視対象 write API POST 件数 |
| Top 料金調整候補 | `様子見` と `対応不要` を押し、保存前に `取消` する | browser-local decision record が保存されず、row 表示が戻る | pending 表示、取消後の pending 件数、監視対象 write API POST 件数 |
| Analyze 価格推移 tab | `価格推移` tab を開く | `競合価格 最安値推移（90日版）`、初回表示優先、background queue 状態が表示される | URL、panel / SVG 件数、background status text、console error 件数 |
| Analyze 価格推移 tab fixture | `localStorage["revenue-assistant:price-trends:v1:background-fixture"]` に `failure` または `skip` を入れて `価格推移` tab を開く | response body を保存せず、failure / skip 表示だけを確認できる | background status text、empty text、console error 件数、監視対象 write API POST 件数 |
| 月次実績画面 | `/monthly-progress/YYYY-MM` を reload | `LTブッキングカーブ`、2 panel、日次差分、loading / background state が表示される | URL、preview root 件数、panel / SVG 件数、日次差分 row 件数、status text、console error 件数 |
| Warm cache indicator | Top または Analyze で detail を開く | 対象期間、保存、skip、失敗、候補優先が発火する場合の進行状態が読める | indicator text、対象期間、保存 / skip / 失敗件数 |

UI primitive、React component、React mount、React state 管理を変更した後は、top smoke と手動確認を分けて確認します。

top smoke で確認する項目:

- 判断 task が 1 件以上表示されること。
- `data-ra-rank-recommendation-react-island="mounted"` があること。
- 既存カレンダーと workspace が連結され、対象月 select、3つの作業状態、rank order control があること。
- 選択詳細に `OH / キャパ`、`個人`、`団体`、判断根拠 host、`変更内容を確認`、`様子見` / `対応不要` があること。
- 初期表示では `この内容で変更する` が DOM に存在しないこと。
- `data-ra-rank-recommendation-ui-component` の marker で、workspace rail、task list、detail が確認できること。
- console / page error が 0 件であること。
- 監視対象 write API POST が 0 件であること。

手動または Chrome DevTools Protocol で確認する項目:

- UI primitive を適用した button が hover、focus-visible、disabled、selected または `aria-pressed` の各状態で読めること。
- keyboard の Tab 移動で、作業状態、task、rank order、`変更内容を確認`、rank select、pending cancel button に到達できること。
- booking curve は各 panel 1 回の Tab で入り、矢印、Home、End で点を移動できること。個人 / 団体と reference の切替は `aria-pressed` を持ち、再描画後も focus が同じ操作または graph point に戻ること。
- 確認を開くと focus が最終確認 region へ移り、`確認をやめる` で元の `変更内容を確認` button へ戻ること。
- 現在 rank と同じ値を選んだ場合は最終送信 button が disabled になること。
- decision pending の cancel button が表示され、cancel で pending 表示が消えること。
- 390px では rail と detail がカレンダー下へ積まれ、document 全体に意図しない横 overflow がないこと。カレンダー内部の横 scroll は許容する。

標準 smoke では実送信を行いません。監視対象 write API は次の POST です。

- `/api/v1/lincoln/suggest`
- `/api/v1/lincoln/price_ranks`
- `/api/v1/tema/price_ranks`
- `/api/v1/neppan/price_ranks`

確認中に POST 0 件を記録する場合は、対象 Chrome tab を開いた状態で次を実行します。

```powershell
npm run smoke:write-posts -- --seconds 30 --operation top-react-smoke
```

出力には、観測対象 URL、操作名、観測秒数、監視 endpoint、POST count、確認時刻が含まれます。raw request body、raw response body、Cookie、token、authorization header、顧客情報、予約情報、価格や在庫の非公開データは保存しません。

配布版 smoke を半自動でまとめる場合は、通常 Chrome を remote debugging port `9222` 付きで起動し、Tampermonkey 上の installed version を確認してから次を実行します。`--seconds` は基本的に最大待機時間です。helper は、RAU userscript root、React marker、mode 別主要 selector、UI component marker が揃った時点で待機を終了し、揃わなかった場合は最後に確認できた selector count を出力します。ただし `--mode top` では、月別優先取得や warm cache の throughput を同じ実行で観測するため、主要 selector が揃った後も指定秒数まで GET `/api/v4/booking_curve` の request 開始と response status を観測します。

```powershell
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode top --url https://ra.jalan.net/ --seconds 30
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode top --url https://ra.jalan.net/ --seconds 30 --viewport-width 390 --top-open-rank-review
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode top --url https://ra.jalan.net/ --seconds 60 --top-click-warm-cache-month YYYYMM
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode price-trends --url https://ra.jalan.net/analyze/YYYY-MM-DD --seconds 60
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode analyze-recommendations --url https://ra.jalan.net/analyze/YYYY-MM-DD --seconds 45
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode monthly-progress --url https://ra.jalan.net/monthly-progress/YYYY-MM --seconds 30
```

この helper は local `dist` version、GitHub Pages 公開版 version、手入力した installed version、Revenue Assistant URL、`--mode` ごとの主要 selector、console / page error 件数、監視対象 write API POST 件数、確認時刻を出力します。全 mode 共通で、page title、ログイン画面らしい selector の有無、カレンダーらしい selector の有無、RAU userscript root の件数、React marker の有無、preflight message を出力します。`--mode top` は、判断 task、calendar workspace、対象月 select、3つの作業状態、rank order control、detail、OH / 個人 / 団体、判断根拠 host、review open button、初期 final write button 0 件、decision button、UI component marker、月別優先取得 control、warm cache worker count / capacity と booking curve throughput を出力します。`--top-click-warm-cache-month YYYYMM` を付けた場合は、指定月の月別優先取得 button をクリックし、クリック可否、対象月 status、status text と、その後の RAU warm cache request metrics を同じ実行で出力します。`--viewport-width 390 --top-open-rank-review` を付けた場合は、送信せずに `変更内容を確認` を開き、最終確認 region、final button、横 overflow、focus 移動を確認してから `確認をやめる` を押し、final button が消えることと focus return を出力します。Revenue Assistant 標準画面外枠の固定幅は document scroll width の参考値として出します。RAU warm cache の throughput 判定は、RAU が付ける `X-RAU-Request: booking-curve` header 付き request だけを対象にします。Revenue Assistant 標準画面由来の `/api/v4/booking_curve` request は page 全体の参考値として出しますが、RAU warm cache の安全条件の fail 理由にはしません。未取得 task が十分にあり、RAU warm cache request が 10 件以上観測された場合は、HTTP error 0 件、最大 1 秒 burst request 開始件数 10 req/s 以上、最小 request 開始間隔 25ms 以上、最大同時 request 数 30 件以下、最大同時 request 数 10 件以上到達を自動判定します。RAU warm cache request が 10 件未満の場合は、cache 済みまたは月別優先取得が走っていない可能性があるため、throughput 低下を失敗扱いにせず fallback reason を出力します。`--mode price-trends`、`--mode analyze-recommendations`、`--mode monthly-progress` の確認項目は各画面の既存 smoke contract を維持します。いずれの mode でも、監視対象 write API POST が 1 件以上、console / page error が 1 件以上、対象画面の主要 selector が 0 件、または `--mode` と最終 URL が対応しない場合は、command は non-zero exit で失敗します。Tampermonkey dashboard の更新操作は、利用者が明示的に許可した検証で、通常 Chrome profile と Tampermonkey の実 installed version を揃える必要がある場合だけ行います。

live top smoke で RAU warm cache request count が 10 件未満になる場合は、cache 済みまたは月別優先取得未発火として fallback reason を読みます。判定ロジック自体を実 request なしで確認する場合は、synthetic fixture を使います。

```powershell
npm run check:booking-curve-smoke-fixture
npm run check:distribution-smoke-fixture
npm run check:booking-curve-smoke-fixture -- --scenario safe-active
npm run check:booking-curve-smoke-fixture -- --scenario warm-cache
```

fixture は raw response body、request body、HAR、Cookie、token、credential、価格や在庫の非公開データを使いません。`safe-active` は RAU tagged request 10 件以上、HTTP error 0 件、最大 1 秒 burst request 開始件数 10 req/s 以上、最小開始間隔 25ms 以上、最大同時 30 件以下、最大同時 10 件以上到達を pass として確認します。`warm-cache` は RAU tagged request 0 件でも fallback reason が出て throughput fail にならないことを確認します。`unsafe-fast`、`unsafe-concurrent`、`http-error` は、同じ判定が危険な synthetic metrics を fail として検出できることを確認します。`check:distribution-smoke-fixture` は live Chrome / Revenue Assistant へ接続せず、カレンダー連携型 workspace、OH / 個人 / 団体、二段階確認、focus return、横 overflow と月別優先取得 click metrics の pass / fail 判定を synthetic metrics で確認します。

Chrome DevTools Protocol の `/json/version` と `/json/list` は応答するが、Playwright の `connectOverCDP` が websocket connected 後に timeout する場合があります。この場合、helper は対象 page の `webSocketDebuggerUrl` へ直接接続する fallback を使い、同じ selector 件数、console / page error 件数、監視対象 write API POST 件数を出力します。fallback でも各 CDP command は timeout するため、長時間止まらずに接続段階、navigation、selector 待ちのどこで失敗したかを確認できます。fallback を明示的に確認する場合は `--cdp-connection page` を付けます。既定の `--cdp-connection auto` は、まず Playwright の browser-level 接続を使い、失敗した場合だけ page websocket fallback へ切り替えます。page websocket fallback は、対象 URL が既に開いている場合は reload せず、現在の DOM を読みます。これは browser-level attach が失敗したときの代替証跡取得を目的にし、通常の reload smoke は browser-level path で確認するためです。

UI component marker の構造だけを CI で確認する場合は、Revenue Assistant 認証、Tampermonkey、通常 Chrome profile、GitHub Pages 公開版 version を使いません。`npm run build:vite:fixture` で fixture bundle を生成し、`npm run check:fixture-markers` で React server render された fixture snapshot から RAU root、React marker、workspace rail、3つの作業状態、task list、選択 detail、OH / 個人 / 団体、判断根拠 host、review open CTA、pending decision、write result state を数えます。また初期 DOM に final write CTA がなく、自動送信 countdown と旧9列表 marker が残っていないことも確認します。この確認は実ログイン画面の smoke を置き換えません。実アカウントの表示、Tampermonkey installed version、監視対象 write API POST 0 件、console / page error 0 件は、必要に応じて CDP 接続付き通常 Chrome の `smoke:distribution` または一時注入確認で別に扱います。

RAU userscript root count が `0` の場合は、次の順に確認します。まず Revenue Assistant がログイン済み画面かを `login form candidate` と `calendar candidate` で確認します。ログイン画面らしい selector がある場合は再ログインしてから smoke を再実行します。ログイン済み画面らしいのに RAU userscript root count が `0` の場合は、Tampermonkey dashboard で `Revenue Assistant Userscript` の installed version が GitHub Pages 公開版 version と一致しているか、対象 script が有効か、`https://ra.jalan.net/*` で発火する設定かを確認します。公開版 version の反映待ちが疑われる場合は少し待ってから再実行します。Tampermonkey 手動更新が必要な場合は、dashboard で対象 script を更新し、期待 version と一致した状態で `--version-policy fail` を付けて再確認します。

`非表示中も取得` の hidden-tab 実測は、Chrome / CDP の環境によって `document.visibilityState` が常に `visible` と見える場合があります。その場合は hidden 判定そのものを合格条件にせず、`非表示中も取得` を ON にしたうえで、Revenue Assistant tab を開いたまま別タブを foreground にし、RAU warm cache request count、status detail の進行、worker 表示、監視対象 write API POST 0 件を証跡にします。OFF の確認では、同じ手順で `タブ非表示` 停止または request 進行なしを確認します。ログイン画面、HTTP 401、HTTP 403 は自動再ログインせず、`ログイン確認` または `権限確認` として止めます。raw trace、HAR、request body、response body、Cookie、token、credential、価格や在庫の非公開データは保存しません。

version の扱いは `--version-policy warn | fail` で指定します。既定は `warn` です。local build は GitHub Pages 配布時の run number を含まないことがあるため、local version と published version の不一致は常に warning として出力します。配布版として完了扱いにする確認では、Tampermonkey dashboard で更新した後に `--version-policy fail` を付けます。この場合、published version が取得できない、または手入力した installed version と published version が一致しないと command は失敗します。意図的に installed version の不一致を許容する一時確認では、既定の `warn` のまま実行するか、`--allow-version-mismatch` を明示します。

価格推移の failure / skip fixture のように、graph panel と SVG が出ないこと自体を確認したい場合だけ、`--allow-empty-price-trends` を付けます。この option は `--mode price-trends` の tab、content、RAU overview の存在確認は維持し、panel と SVG の 0 件だけを許可します。通常の配布版 smoke ではこの option を使わず、価格推移 graph が描画されることを確認します。

## 現在の実装状態

### Analyze 日付ページ

現時点の `src/main.ts` は、レベニューアシスタントの analyze 日付ページを検知し、次の拡張を実装しています。ブッキングカーブ API の raw source は、画面上の `最終データ更新` 日付、施設、scope、室タイプごとに分離して IndexedDB に保存します。画面応答用には memory cache と小さな group-room result cache だけを使い、ブッキングカーブ response 全体は localStorage に新規保存しません。起動時、ページ復帰時、フォーカス復帰時には団体系の整合チェックを行い、異常時は group 系キャッシュを破棄して再同期します。

- 月次カレンダー各日付セルへの団体室数表示
- カレンダー上の団体室数表示の visible / hidden 切替トグル
- 販売設定タブの室タイプ別 1日前差分 / 7日前差分 / 30日前差分表示
- 販売設定タブの室タイプ別団体室数と 1日前差分 / 7日前差分 / 30日前差分表示
- 販売設定タブ最上段の全体販売室数サマリーと全体団体室数サマリーの 2 行表示
- Analyze 日付ページで取得した競合価格 response の IndexedDB snapshot 保存
- 競合価格タブ内、Revenue Assistant 標準の競合価格表より下への人数別最安値グラフ表示
- 競合価格グラフの部屋タイプ、食事条件 toggle 絞り込み、縦軸補助線、表形式 tooltip、同日複数 snapshot の日単位最新化
- warm cache indicator への競合価格 snapshot 保存状態表示と、詳細表示の最小化 / 再表示

この段階の狙いは、次の 3 点を先に安定させることです。

- 対象画面の判定
- API 取得と日次キャッシュ
- SPA 風遷移に対する再同期

### 月次実績画面

月次実績画面向けには、`/monthly-progress/YYYY-MM` を既存 top / analyze の同期系から切り離す route-scoped scaffold を追加済みです。monthly-progress 側は専用 storage namespace を先に持ち、`localStorage["revenue-assistant:feature:monthly-progress:enabled"] = "0"` で kill switch を入れられます。

`/api/v1/booking_curve/monthly` の結果は、`facilityCacheKey + yearMonth + batchDateKey` ごとの IndexedDB snapshot として保存します。現在の preview は、同じ batch date の snapshot がなければ API 取得して保存し、その後に保存済み snapshot を読んで表示します。過去 batch の履歴比較にはまだ使っていません。

予約日基準 chart 直下には、month-end anchor の LT バケット集約 chart を独立 section で差し込んでいます。現在は `販売客室数` panel、`販売単価 / 売上` 切替 panel、対象月から未来 4 か月の同時表示、`前年 / 前々年 / 3年前` compare 切替、hover tooltip、販売客室数の隣接 LT bucket 差分を読む日次差分 table まで入っています。日次差分 table は、増加、減少、変化なし、未観測、比較前 bucket なしを表示します。

## ドキュメントの正本

- `AGENTS.md`: リポジトリ全体の常設ルール
- `docs/spec_000_overview.md`: リポジトリ全体の仕様概要
- `docs/context/PROJECT_CONTEXT.md`: RAU の上位前提と profile
- `docs/spec_001_analyze_expansion.md`: analyze 画面拡張の現行仕様
- `docs/context/STATUS.md`: 現況の正本
- `docs/context/DECISIONS.md`: 判断理由の正本
- `docs/tasks_backlog.md`: 未実装タスクの管理

## 配布

`userscript.config.mjs` が Classic metadata の正本です。localでsourceから生成するClassic検証artifactと、明示承認後にTampermonkeyへ投入するrelease candidateは `dist/revenue-assistant-userscript.user.js` を正とします。ただし凍結中の現在の公開物は、公開URLのbyte列と `.github/classic-publication-baseline.json` を正とし、local `dist`を現在の公開版とみなしません。`userscript.next.config.mjs` は未公開 Next candidate の metadata 正本であり、生成物は `.tmp/vite-next-candidate/revenue-assistant-next.candidate.user.js` に限ります。`.tmp` の candidate を公開物または自動更新の正本として扱いません。

公開 userscript URL:
[https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js](https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js)

将来Classic release gateを再開する場合、production metadata付きbuildには `GITHUB_PAGES_BASE_URL` を使えますが、現verify-only workflowはbuildも配布も行いません。

2026-07-22にfresh確認したClassic公開baselineは、source commit `659d998254c7527ecc40b45a3e22513f049168de`、GitHub Actions run 442、`@version 0.1.0.442`、662,626 bytes、SHA-256 `6C4635639376A6ECA2259FC9EA7916141CFE1A40BD3AE1364E49F577030802EB` です。metadataを含む正本は `.github/classic-publication-baseline.json` に置きます。

localの `.github/workflows/publish-userscript.yml` は、`main` pushによる自動公開を廃止し、manual dispatchによる公開baselineのread-only照合だけを行います。Pages / OIDCの書込権限、source build、artifact upload、deploy処理は持ちません。Classicを再公開または更新する機能は意図的に凍結し、必要になった場合はcandidate artifact、source SHA、digest、保護された承認を持つ別仕様として再開します。`main` pushではPages権限を持たない `validate-main.yml` がClassic / Nextを検証用buildしますが、artifactのupload / deployは行いません。

2026-07-22に明示承認を受け、origin/mainの6 dependency / Actions更新をverify-only workflowと同じlocal treeへ統合しました。Actionsはcheckout / setup-node v7へ揃え、lockfileどおりの`npm ci`とfull verifyを通しています。GitHub Actionsはpushに対応するcommit上のworkflowでtriggerを判定するため、この統合treeを最初のremote反映単位とします。push後にClassic Publish run / Pages deploymentが発生していないことと公開SHA不変を確認するまで分離完了とはしません。Nextの公開、Tampermonkey install、Classicからの切替は、それぞれ別gateです。
