# Revenue Assistant Userscript

レベニューアシスタント向けの Tampermonkey userscript を、TypeScript で安全に開発するための専用ワークスペースです。

## 目的

- レベニューアシスタントの画面拡張を userscript で実装する
- 機能ごとの DOM 依存や API 依存を整理しながら育てる
- Chrome remote debugging と DevTools MCP を使って確認しやすくする

初期ターゲットは、analyze 日付ページで団体室数と販売設定差分を見やすくすることです。ただし repo 自体は単機能に閉じず、今後のレベアシ向け拡張を受け止める汎用基盤として扱います。

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
- `npm run build`: Vite で本番向け userscript bundle を 1 回ビルド
- `npm run build:legacy`: 旧 esbuild build を rollback 候補として 1 回実行
- `npm run dev:fixture`: Revenue Assistant runtime へ接続しない Vite fixture preview を起動
- `npm run build:vite:fixture`: Vite fixture preview を build
- `npm run build:vite:candidate`: 正規 `dist` を上書きしない Vite candidate userscript build を `.tmp/vite-candidate/` に生成
- `npm run build:compare:vite`: 正規 `dist` と Vite candidate の userscript metadata、size、entry line を比較
- `npm run check:fixture-markers`: Revenue Assistant 認証、Tampermonkey、通常 Chrome profile を使わず、fixture の合成 data だけで top 料金調整候補 list の主要 UI marker を確認
- `npm run typecheck`: TypeScript の型検査
- `npm run lint`: ESLint 実行
- `npm run check`: 型検査、lint、build をまとめて実行
- `npm run react:doctor`: 固定済み `react-doctor@0.2.14` を repo-local に実行
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

# React component 変更後の追加診断
npm run react:doctor -- --diff false

# commit 前の whitespace error 確認
git diff --check
```

`npm run check` は `npm run typecheck`、`npm run lint`、`npm run build` を順に実行します。

React component、React mount、React state 管理を追加または変更した場合は、`npm run check` に加えて `npm run react:doctor -- --diff false` を実行します。`react-doctor` は `devDependency` として `0.2.14` に固定し、lockfile に記録しています。`@latest` を指定した `npx react-doctor@latest`、global install、lockfile を更新しない一時実行は使いません。更新する場合は、npm registry の version、license、repository、dependencies、bin、lifecycle script、lockfile 差分、`npm audit`、repo-local 実行結果を確認してから行います。`npm install` や `npm run react:doctor` が Node engine、install script、未確認依存、network、権限のいずれかで失敗する場合は、その回の React 診断は停止し、`npm run check` と通常 Chrome smoke を代替 verify として記録します。

Codex automation shell などで `npm run ...` をそのまま実行できない場合は、次の direct command を fallback として使います。

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\eslint\bin\eslint.js .
node .\node_modules\vite\bin\vite.js build --config .\vite.userscript.config.mjs --mode userscript
```

`npm run build` は Vite build を正規 path として使います。旧 esbuild build へ戻す必要がある場合は、まず `npm run build:legacy` で `dist/revenue-assistant-userscript.user.js` を再生成し、Vite 起因の問題かどうかを切り分けます。旧 build を正規 path に戻す判断は、`package.json` の `build` script を `node ./scripts/build.mjs` に戻す変更として扱います。

## 配布版確認と通常 Chrome smoke

この確認は、`dist` は更新済みだが通常 Chrome の Tampermonkey では古い版が動いている、という状態を早く見つけるために行います。

### Version Check

1. `npm run build` を実行し、local `dist/revenue-assistant-userscript.user.js` を更新する。
2. `npm run userscript:version-check` を実行し、local version、published version、`@updateURL`、`@downloadURL`、Revenue Assistant tab の有無を確認する。
3. Tampermonkey dashboard で対象 userscript の version を確認する。既定では Codex が dashboard の保存操作を自動化しない。配布版検証で installed version を published version へ揃える必要があり、利用者が明示的に許可した場合だけ、Codex は Chrome 拡張または @コンピュータ経由で Tampermonkey dashboard の更新操作を行ってよい。
4. 更新後に `npm run userscript:version-check -- --installed-version <確認したversion> --open-url https://ra.jalan.net/` を実行し、local / published / installed version と開いた Revenue Assistant URL を記録する。

### Smoke Checklist

通常 Chrome、Tampermonkey、Revenue Assistant ログイン状態が必要な確認では、CDP 一時注入ではなく配布版 userscript を使います。CDP は DOM、console、network の観測補助に限定します。

| 画面 | 操作 | 期待結果 | 証跡として残す値 |
| --- | --- | --- | --- |
| Top 料金調整候補 | Revenue Assistant top を reload | `料金調整候補` section、候補 row、meta、表示条件、対象月 filter が表示される | URL、row count、`data-ra-rank-recommendation-react-island="mounted"`、`data-mode`、console error 件数 |
| Top 料金調整候補 | `曲線` を開閉 | preview row が開閉し、既存 booking curve selector が維持される | preview row 件数、SVG 件数、console error 件数 |
| Top 料金調整候補 | `rank調整` を開閉し、送信前に `取消` する | 5 秒 pending 中に取消でき、実 POST は発生しない | pending 表示、取消後の pending 件数、監視対象 write API POST 件数 |
| Top 料金調整候補 | `様子見` と `対応不要` を押し、保存前に `取消` する | browser-local decision record が保存されず、row 表示が戻る | pending 表示、取消後の pending 件数、監視対象 write API POST 件数 |
| Analyze 価格推移 tab | `価格推移` tab を開く | `競合価格 最安値推移（90日版）`、初回表示優先、background queue 状態が表示される | URL、panel / SVG 件数、background status text、console error 件数 |
| Analyze 価格推移 tab fixture | `localStorage["revenue-assistant:price-trends:v1:background-fixture"]` に `failure` または `skip` を入れて `価格推移` tab を開く | response body を保存せず、failure / skip 表示だけを確認できる | background status text、empty text、console error 件数、監視対象 write API POST 件数 |
| 月次実績画面 | `/monthly-progress/YYYY-MM` を reload | `LTブッキングカーブ`、2 panel、日次差分、loading / background state が表示される | URL、preview root 件数、panel / SVG 件数、日次差分 row 件数、status text、console error 件数 |
| Warm cache indicator | Top または Analyze で detail を開く | 対象期間、保存、skip、失敗、候補優先が発火する場合の進行状態が読める | indicator text、対象期間、保存 / skip / 失敗件数 |

UI primitive、React component、React mount、React state 管理を変更した後は、top smoke と手動確認を分けて確認します。

top smoke で確認する項目:

- 料金調整候補 row が 1 件以上表示されること。
- `data-ra-rank-recommendation-react-island="mounted"` があること。
- 対象月 select、表示 mode、表示上限、rank order control があること。
- `曲線` button、`rank調整` button、`様子見` / `対応不要` button があること。
- `data-ra-rank-recommendation-ui-component` の marker で、control group、row layout、popover が確認できること。
- console / page error が 0 件であること。
- 監視対象 write API POST が 0 件であること。

手動または Chrome DevTools Protocol で確認する項目:

- UI primitive を適用した button が hover、focus-visible、disabled、selected または `aria-pressed` の各状態で読めること。
- keyboard の Tab 移動で、対象 button、select、details summary、pending cancel button に到達できること。
- `曲線` と `rank調整` の preview button が、同じ button で開閉でき、button focus が予期せず失われないこと。
- decision pending と rank change pending の cancel button が表示され、cancel で pending 表示が消えること。
- preview、popover、table、tooltip が重ならず、横幅が狭い場合も文字が隣の UI と重ならないこと。

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

配布版 smoke を半自動でまとめる場合は、通常 Chrome を remote debugging port `9222` 付きで起動し、Tampermonkey 上の installed version を確認してから次を実行します。`--seconds` は固定 sleep ではなく最大待機時間である。helper は、RAU userscript root、React marker、mode 別主要 selector、UI component marker が揃った時点で待機を終了し、揃わなかった場合は最後に確認できた selector count を出力します。

```powershell
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode top --url https://ra.jalan.net/ --seconds 30
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode price-trends --url https://ra.jalan.net/analyze/YYYY-MM-DD --seconds 60
npm run smoke:distribution -- --installed-version <Tampermonkey上のversion> --mode monthly-progress --url https://ra.jalan.net/monthly-progress/YYYY-MM --seconds 30
```

この helper は local `dist` version、GitHub Pages 公開版 version、手入力した installed version、Revenue Assistant URL、`--mode` ごとの主要 selector、console / page error 件数、監視対象 write API POST 件数、確認時刻を出力します。全 mode 共通で、page title、ログイン画面らしい selector の有無、カレンダーらしい selector の有無、RAU userscript root の件数、React marker の有無、preflight message を出力します。`--mode top` は、top 料金調整候補 row 件数、対象月 select、表示 mode、表示上限、rank order control、primary actions wrappers、secondary action markers、status badge cells、`曲線` button、`rank調整` button、decision button、UI component marker を出力します。`--mode price-trends` は価格推移 tab / content、RAU overview、panel、SVG、background status を出力します。`--mode monthly-progress` は月次 preview root、panel、SVG、日次差分 section、日次差分 total row、主 table row、details table row、details summary、details 初期 open / closed、status text を出力します。いずれの mode でも、監視対象 write API POST が 1 件以上、console / page error が 1 件以上、対象画面の主要 selector が 0 件、または `--mode` と最終 URL が対応しない場合は、command は non-zero exit で失敗します。Tampermonkey dashboard の更新操作は、利用者が明示的に許可した検証で、通常 Chrome profile と Tampermonkey の実 installed version を揃える必要がある場合だけ行います。

UI component marker の構造だけを CI で確認する場合は、Revenue Assistant 認証、Tampermonkey、通常 Chrome profile、GitHub Pages 公開版 version を使いません。`npm run build:vite:fixture` で fixture bundle を生成し、`npm run check:fixture-markers` で React server render された fixture snapshot から RAU root、React marker、summary、control group、table、row layout、primary actions、secondary actions、popover、tooltip、pending notice、status message、rank select、主要 button marker を数えます。この確認は実ログイン画面の smoke を置き換えません。実アカウントの表示、Tampermonkey installed version、監視対象 write API POST 0 件、console / page error 0 件は、必要に応じて CDP 接続付き通常 Chrome の `smoke:distribution` または一時注入確認で別に扱います。

RAU userscript root count が `0` の場合は、次の順に確認します。まず Revenue Assistant がログイン済み画面かを `login form candidate` と `calendar candidate` で確認します。ログイン画面らしい selector がある場合は再ログインしてから smoke を再実行します。ログイン済み画面らしいのに RAU userscript root count が `0` の場合は、Tampermonkey dashboard で `Revenue Assistant Userscript` の installed version が GitHub Pages 公開版 version と一致しているか、対象 script が有効か、`https://ra.jalan.net/*` で発火する設定かを確認します。公開版 version の反映待ちが疑われる場合は少し待ってから再実行します。Tampermonkey 手動更新が必要な場合は、dashboard で対象 script を更新し、期待 version と一致した状態で `--version-policy fail` を付けて再確認します。

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
- `docs/spec_001_analyze_expansion.md`: analyze 画面拡張の現行仕様
- `docs/context/STATUS.md`: 現況の正本
- `docs/context/DECISIONS.md`: 判断理由の正本
- `docs/tasks_backlog.md`: 未実装タスクの管理

## 配布

`userscript.config.mjs` が userscript metadata の正本です。配布物と Tampermonkey への投入物は `dist/*.user.js` を正とします。

公開 userscript URL:
[https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js](https://nemukei.github.io/revenue-assistant-userscript/revenue-assistant-userscript.user.js)

GitHub Pages 配布を使う場合は、`GITHUB_PAGES_BASE_URL` をビルド時に渡すと `updateURL` と `downloadURL` が自動で入ります。

`main` への push では `.github/workflows/publish-userscript.yml` が動き、GitHub Pages へ userscript を自動配布します。GitHub Actions 上の build では `GITHUB_RUN_NUMBER` を userscript version に付与するため、公開物は push ごとに Tampermonkey の自動更新対象になります。

Publish Userscript workflow は、`src/`、`scripts/`、package / lockfile、userscript / Vite / TypeScript / ESLint 設定、dev fixture、workflow 自体が変わった push で実行します。`docs/`、`README.md`、`AGENTS.md` だけの closeout commit や backlog taskization commit では、userscript 実行版が変わらないため workflow を起動しません。この条件により、docs-only push だけで GitHub Pages 公開版の `@version` が進み、Tampermonkey installed version の再同期が必要になる状態を減らします。
