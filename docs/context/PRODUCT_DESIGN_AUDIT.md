# Product Design Audit

最終更新: 2026-06-19

## Purpose

この文書は、Revenue Assistant Userscript の既存画面を Product Design 観点で確認した結果を残す。
仕様本文は `docs/spec_*.md`、現在地は `docs/context/STATUS.md`、実行順は `docs/tasks_backlog.md` を正本とする。
この文書は、画面証跡、UX findings、accessibility risk、次に実装する候補をまとめる補助正本である。

## Ownership And Update Trigger

- 所有者: この repository の owner / primary developer。
- 更新 trigger:
  - `@product-design` または Product Design workflow で既存画面を audit したとき。
  - top 画面、Analyze 画面、価格推移 tab、月次実績画面、共通 UI primitive、fixture、smoke の見た目や操作順を見直したとき。
  - audit 結果から実装 task、fixture task、smoke task を切るとき。

## Product Design Brief

- 対象 product: Revenue Assistant Userscript。
- 対象利用者: Revenue Assistant の画面で、宿泊日、部屋タイプ、販売室数、ランク、ブッキングカーブ、競合価格を見ながら、料金調整候補を短時間で確認する利用者。
- 目的:
  - 既存機能画面を、料金調整判断に必要な情報と次の操作が最短で分かる UI (User Interface) / UX (User Experience) にする。
  - 見た目だけではなく、操作順、読み込み状態、空状態、エラー状態、mobile 表示、Revenue Assistant 標準 UI との干渉を確認する。
- 視覚方針:
  - Revenue Assistant 標準画面に割り込む userscript であるため、装飾を増やすより、読み取り順、ボタン文言、余白、状態表示を整える。
  - 主要操作は常時表示し、補助操作は誤押下しにくい場所へ分ける。
  - 金額、差額、percent、forecast 数値、sales / ADR 数値は top list の本文へ直接表示しない既存契約を維持する。
- interactivity level:
  - 実装へ進む場合は full interactivity を前提にする。つまり、hover、focus、keyboard、loading、empty、error、disabled、pending、cancel、mobile 表示を実装と verify の対象に含める。

## Analyze Sales Setting Brushup Audit 2026-06-19

### Brief Playback

- task: `RAU-AN-02`
- 対象 surface: Analyze `販売設定` タブの RAU 追加表示。
- 対象導線:
  - Analyze 日付ページを開く。
  - `販売設定` タブで全体サマリーを確認する。
  - 全体 booking curve と参考線 / 同曜日補助線を読む。
  - 必要な室タイプ card を開き、部屋別 booking curve、参考線、toggle を確認する。
  - `競合価格` など別タブへ移動して戻ったときに、主要表示が欠けていないか確認する。
- 成功条件:
  - 利用者が、現時点の予約実績と reference curve を比較し、全体 / 部屋別に異常や差分を見る表示だと迷わず分かる。
  - hover なしでも、全体サマリー、booking curve section、SVG、reference / segment toggle の存在が確認できる。
  - 実装は既存表示を変えず、主要表示欠けを配布版 smoke で検出できるようにする。

### Evidence

- source audit:
  - `src/main.ts` には `data-ra-sales-setting-overall-summary`、`data-ra-sales-setting-booking-curve-section`、`data-ra-sales-setting-booking-curve-panel-svg`、`data-ra-sales-setting-booking-curve-toggle-button` の marker が存在する。
  - `scripts/run-distribution-smoke.mjs` はこれらを metrics として収集していたが、`analyze-recommendations` mode の pass / fail 条件には使っていなかった。
- spec audit:
  - `docs/spec_001_analyze_expansion.md` は、Analyze `販売設定` タブの current booking curve を `interactive` priority とし、tab mount 遅延に有限再同期で対応する契約を持っている。
  - same-weekday raw source の pre-scan と月別優先取得時の current / same-weekday raw 優先化は実装済みだが、pre-scan の説明に `currentRaw` 限定の古い記述が残っていた。
- screenshot:
  - 今回は runtime UI の形状、文言、配置を変更しないため、新規 screenshot は取得していない。
  - live Chrome / Tampermonkey 更新、Revenue Assistant 実ログイン画面の再読込、raw trace / HAR / response body 保存は行っていない。

### Product / UX Findings

- `RAU-AN-01` の主な UX risk は、表示が遅いことよりも「販売設定タブに戻った時点で、全体サマリーや booking curve が存在しないように見える」ことである。
- 現行 UI は、全体サマリー、全体 booking curve、部屋別 card、segment / helper / reference toggle によって、判断導線そのものは成立している。
- 追加の copy、card、loading 表示を推測で加えるより、主要表示が DOM 上に存在することを smoke の合格条件へ昇格する方が、今回の問題に対して低リスクである。

### Data / Visualization Findings

- この表示の判断対象は、現時点の予約実績と reference curve を比較し、全体 / 部屋別に booking pace の差分を見ることである。
- chart は hover tooltip で詳細値を読む前に、section、SVG、toggle の存在だけで「比較表示が描画された」ことを確認できる必要がある。
- `Analyze sales setting ... count` metrics はこの確認に十分近いが、これまで観測値止まりだったため、欠落しても smoke が pass する余地があった。

### Result

`RAU-AN-02` では runtime UI を変更しない。
代わりに、配布版 `analyze-recommendations` smoke が Analyze 販売設定の overall summary、booking curve section、SVG、toggle を必須表示として検証するようにする。

Revenue Assistant API request 範囲、Revenue Assistant write API、rank change payload、request 間隔、同時実行数、保存 schema、userscript metadata、`dist/` の手編集は変更しない。

## Product Design Re-Audit 2026-06-05

### Brief Playback

- task: `RAU-UX-126`
- 対象 surface: 最新配布版 `0.1.0.378` の top 料金調整候補 UI。
- 対象要素:
  - 対象月 filter。
  - `候補データ優先取得` の先 6 か月カード。
  - 補助操作 `その他` details。
  - row action、status badge、pending 表示。
  - 競合価格 preview の今後導線。
  - 先行月 queue boost の入口候補。
- 成功条件:
  - 利用者が top 画面で対象月を選び、データ取得を待ち、候補を確認し、必要なら Analyze / 曲線 / ランク調整へ進むまでの操作順が短い。
  - 情報量、装飾、追加入口が判断速度を落とさない。
  - request 数、write API、安全な作業キューの既存契約を崩さない。
- Product Design workflow:
  - `product-design:get-context` を brief gate として使用した。
  - 今回は既存 surface の audit / plan first であり、`ideate`、`image-to-code`、runtime UI 実装は行わない。

### Evidence

- `npm run userscript:version-check -- --installed-version 0.1.0.378 --open-url https://ra.jalan.net/`
  - published version と installed version はどちらも `0.1.0.378`。
  - Chrome CDP は reachable。
  - Revenue Assistant page では login form candidate なし、calendar candidate あり、RAU userscript root count `3`、React marker mounted `yes`。
- `npm run smoke:distribution -- --installed-version 0.1.0.378 --mode top --url https://ra.jalan.net/ --seconds 30 --version-policy fail`
  - top row `10` 件、target month select `yes`。
  - primary actions wrappers `10`、secondary action markers `10`、status badge cells `10`。
  - warm cache month controls `6`、warm cache month buttons `6`。
  - console error `0`、page error `0`、監視対象 write API POST `0`。
  - booking curve request count は `0` で、cache 済みまたは月別優先取得未発火として fallback reason が出た。
- `npm run check:fixture-markers`
  - rank fixture marker check passed。
  - fixture render roots `16`、row layout markers `25`、primary actions wrappers `25`、secondary action markers `25`、status badge cells `25`。
- mobile evidence:
  - `0.1.0.378` へつながる直前 bundle の fixture visual check で、1280px、420px、320px の各幅において対象月 option は 6 か月、横 overflow false、control overlap `0` 件だった。
  - 今回の再 audit では同じ source surface の fixture marker を再確認し、mobile 表示を壊す DOM 欠落は確認されなかった。

### Findings

- 対象月 filter:
  - 優先取得月カードと同じ先 6 か月にそろっており、対象月を選んで候補を確認する操作距離は短い。
  - 候補 0 件の未来月も option に残すことで、データ不足の月を先に見つけられる。
  - 追加の filter UI は不要である。現行 select は Revenue Assistant 標準画面に対して干渉が小さい。
- `候補データ優先取得`:
  - 先 6 か月カードは、表示中カレンダーだけに縛られず、先行月を先に取得したい実務に合っている。
  - button、status summary、progress bar が分離され、直近の問題だった button 内 indicator の邪魔さは解消済みである。
  - これ以上の高速化入口を増やすと、`INTENT.md` の request 数より安定性を優先する原則に反するため、現時点では新しい request 増加 UI を追加しない。
- 補助操作 `その他`:
  - primary action と secondary action が分離され、誤押下防止と表示密度のバランスは現行維持でよい。
  - 実利用で `様子見`、`対応不要`、`要点` を見つけられず候補処理が止まる観測が出るまでは、row footer や popover への移設 task は作らない。
- row action / status badge:
  - 常時表示 action は `Analyzeで確認`、`曲線`、`ランク調整` に絞られており、top 画面で次操作を選びやすい。
  - status badge は非数値の状態を短く示し、top list 本文へ金額、差額、percent、forecast 数値、sales / ADR 数値を増やさない契約に合っている。
- 競合価格 preview の今後導線:
  - `RAU-CP-19` の設計どおり、押下時だけの row preview として進める方針は現行 top UI と整合する。
  - 常時 graph や常時金額表示は、表示密度を上げて判断を遅くするため採用しない。
- 先行月 queue boost:
  - 入口は既存の対象月 filter と先 6 か月カードで足りている。
  - request 間隔短縮、同時実行数増加、新しい強制取得 button は採用しない。
  - `RAU-WC-27` の方針どおり、queue 順序、cache hit、表示中候補の優先化で扱う。

### Rejected Ideas

- 競合価格 graph を top row に常時展開する案:
  - 表示密度が上がり、top 画面の短時間判断を妨げるため不採用。
- `その他` details を今すぐ row footer / popover へ移す案:
  - 現行 smoke と fixture では重なりや横 overflow がなく、補助操作を常時露出すると誤押下と高さ増加のリスクがあるため不採用。
- 先行月向けの新しい高速取得 button や request concurrency 増加:
  - request 数より安定性を優先する `INTENT.md` の原則に反するため不採用。

### Result

今回の Product Design re-audit では、`0.1.0.378` の top 料金調整候補 UI に対して即時の runtime UI 実装 task は追加しない。
現行の対象月 filter、先 6 か月の優先取得カード、`その他` details、row action、status badge は、利用者が最短で候補確認へ進むための構造として維持する。

残リスクは、競合価格 row preview の実装時に keyboard / focus return / mobile 390px / failure state を再検証すること、および通常利用で `その他` details の開閉が判断速度を落とす観測が出た場合に再配置を再評価することである。
Revenue Assistant write API、rank change payload、request 間隔、同時実行数、保存 schema は変更していない。

## Competitor Preview Density Audit 2026-06-05

### Brief Playback

- task: `RAU-UX-128`
- 対象 surface: `0.1.0.379` で追加した top 料金調整候補 row の `競合価格` preview。
- 対象要素:
  - primary action の `競合価格` button。
  - 押下時だけ開く row preview。
  - loading / stored / empty / error / retry state。
  - `RAU-CP-23` で追加した `confirmed` / `ambiguous` / `unknown` の部屋タイプ対応 note。
  - 人数別の競合価格 preview graph。
- 成功条件:
  - top list 本文には金額、差額、percent、forecast 数値、sales / ADR 数値を増やさない。
  - preview を開いた利用者が、部屋タイプ対応の確度、graph の対象範囲、次に Analyze / 曲線 / ランク調整へ進むべきかを短時間で読める。
  - graph を初期表示から削る場合は、keyboard / focus / mobile / fixture / smoke / write API 非追加を含む実装 task に分ける。
- Product Design workflow:
  - Product Design の `user-context` preflight では保存済み user context は見つからなかった。
  - 今回は backlog 上の task brief と repo 内 evidence を入力にした既存 surface audit / plan first であり、`ideate`、`image-to-code`、runtime UI 実装は行わない。
- Data Visualization workflow:
  - `@build-web-data-visualization` の観点では、preview graph は順位や推奨金額を直接決める chart ではなく、競合価格 snapshot の文脈を確認する補助 chart として扱う。
  - 読み筋は、state message、部屋タイプ対応 note、graph の順にし、`confirmed` 以外では caveat を先に読む前提にする。

### Evidence

- `RAU-CP-22` の配布版 `0.1.0.379` top smoke:
  - top row `10` 件、competitor preview buttons `10` 件、competitor preview rows `10` 件。
  - primary actions `10`、secondary actions `10`、console / page error `0` 件、監視対象 write API POST `0` 件。
  - 実クリック確認では、競合価格 preview が `0` 件から `1` 件へ開き、`Escape` で `0` 件へ閉じ、focus return は true だった。
- `RAU-CP-23` の implementation verify:
  - `npm run typecheck`、`npm run lint`、`npm run build`、`npm run build:vite:fixture`、`npm run check:fixture-markers`、`git diff --check` が通過した。
  - fixture marker check では competitor preview buttons `25` 件、competitor preview rows `25` 件を確認した。
- `RAU-CP-23` の graph contract:
  - `confirmed` は snapshot 側 label が候補 `roomGroupName` に一意に含まれる場合だけで、その label で preview graph を絞り込む。
  - `ambiguous` と `unknown` は強い絞り込みをせず、preview 内で部屋タイプ対応未確認を明示する。
  - この分類は表示絞り込み用であり、candidate scoring、priority、confidence、reasonFingerprint には使わない。

### Findings

- preview の開閉方式:
  - graph は常時表示ではなく、利用者が `競合価格` を押したときだけ開く。top list の通常状態では表示密度を増やさないため、現行方針を維持する。
  - `Escape` close と focus return は直近 smoke で確認済みであり、二段階表示へ分ける前に必要な最低限の操作契約は満たしている。
- graph の情報量:
  - 人数別 graph は、開いた preview 内では情報量が多いが、競合価格 snapshot の確認目的には自然である。
  - top list 本文へ金額や差額を出していないため、常時視界に入る情報量は増えていない。
  - 初期表示を要約だけにすると、利用者が再度詳細を開く操作を要求され、現時点の evidence では操作距離短縮より利点が小さい。
- 部屋タイプ対応 note:
  - `RAU-CP-23` の `confirmed` / `ambiguous` / `unknown` note により、graph を推奨根拠として過読する risk は下がった。
  - `ambiguous` / `unknown` では caveat が先に見えるため、表示密度を削るより、現在の caveat-first の読み順を維持する方が安全である。
- mobile / narrow viewport:
  - 直近の fixture marker と prior mobile evidence では preview row 構造は維持されている。
  - ただし、実データ graph を開いた mobile 390px の縦スクロール量は未確認である。`RAU-UX-129` では current fixture の action density を確認済みであり、実データ graph の縦スクロール量は今後の preview visual smoke が必要になった時点で扱う。

### Rejected Ideas

- 競合価格 preview graph を top row に常時表示する案:
  - top list の最速判断を妨げるため不採用。
- 初期表示を要約だけにして graph を二段階表示に分ける案:
  - 現時点では、開いた preview 内の graph が判断を妨げている live evidence がない。
  - 二段階表示にすると、graph 確認までの操作が増え、cache hit 時の利点を薄める。
- top list 本文へ金額、差額、percent を短い summary として追加する案:
  - 既存の非数値 top list 契約を崩し、競合価格を候補方向の主因として誤読させるため不採用。

### Result

`RAU-UX-128` では、競合価格 preview graph を現行維持とする。
要約中心 / 二段階表示への runtime UI 変更 task は追加しない。

再評価条件は、mobile 390px 相当で preview を開いたときに候補 row の処理が進みにくいこと、`confirmed` / `ambiguous` / `unknown` note が読まれず graph だけが推奨根拠として解釈されること、または通常利用で preview を開いた後に結局 Analyze / 曲線へ戻る操作が多いことを観測した場合である。
Revenue Assistant write API、rank change payload、request 間隔、同時実行数、保存 schema は変更していない。

## Secondary Actions Density Audit 2026-06-05

### Brief Playback

- task: `RAU-UX-129`
- 対象 surface: `競合価格` が top row の primary action に増えた後の `その他` details。
- 対象要素:
  - primary action の `Analyzeで確認`、`曲線`、`競合価格`、`ランク調整`。
  - secondary action の `その他` details。
  - `様子見`、`対応不要`、`要点` などの補助操作。
  - pending notice。
  - mobile 390px 相当の折り返し、横 overflow、action group の重なり。
- Product Design workflow:
  - 既存 UI surface の audit / plan first として扱い、runtime UI 実装は行わない。
  - Product Design の観点では、利用者が短時間で主操作を選べることと、補助操作を誤押下しないことを優先する。
- Data Visualization workflow:
  - `@build-web-data-visualization` の観点では、競合価格 graph は押下時 preview に閉じ、top row 本文へ金額、差額、percent を増やさない前提を維持する。

### Evidence

- `RAU-CP-22` の配布版 `0.1.0.379` top smoke:
  - top row `10` 件、primary actions `10` 件、secondary actions `10` 件。
  - competitor preview buttons `10` 件、competitor preview rows `10` 件。
  - console / page error `0` 件、監視対象 write API POST `0` 件。
- `RAU-UX-129` の current fixture marker check:
  - primary actions wrappers `25` 件、secondary action markers `25` 件。
  - pending notice markers `2` 件、pending progress markers `2` 件。
  - competitor preview buttons `25` 件、competitor preview rows `25` 件。
  - decision buttons `50` 件。
- `RAU-UX-129` の current mobile fixture layout check:
  - `npm run build:vite:fixture` で current fixture を生成した。
  - mobile 390px の `candidates`、`decision-pending`、`preview-open` state で、`documentElement.scrollWidth` は `390`、横 overflow は false だった。
  - 同 3 state で visible action group overlap は `0` 件だった。
  - `candidates` state は rows `27` 件、primary actions `27` 件、secondary actions `27` 件、pending notices `2` 件、competitor preview buttons `27` 件だった。
  - `decision-pending` state は rows `27` 件、primary actions `27` 件、secondary actions `27` 件、pending notices `3` 件、competitor preview buttons `27` 件だった。
  - `preview-open` state は rows `27` 件、primary actions `27` 件、secondary actions `27` 件、pending notices `2` 件、competitor preview buttons `27` 件だった。
  - local fixture server の favicon 404 はあったが、fixture DOM rendering と layout 判定には影響しない。

### Findings

- primary action は `競合価格` 追加後も 1 row に 4 系統あり、すでに常時表示領域の密度は高い。
- `その他` details は、補助操作を常時表示から外して主操作と分離できている。
- pending notice は fixture 上で 2 から 3 件の sparse state として確認でき、常時表示の row footer を増やす理由にはならない。
- mobile 390px の current fixture では、`candidates`、`decision-pending`、`preview-open` のいずれでも横 overflow と action group overlap は確認されなかった。
- row footer 化は常時表示される補助操作を増やし、primary action と pending notice の視認性を下げる。
- popover 化は別の interaction mode を増やすため、現時点では `その他` details より単純とは言えない。

### Rejected Ideas

- `その他` details の即時 row footer 化:
  - 補助操作を常時表示に戻し、top row の密度を上げるため不採用。
- `その他` details の即時 popover 化:
  - 現時点では、details を見つけにくい、または開閉で候補処理が止まる evidence がないため不採用。
- `要点`、`様子見`、`対応不要` の常時 button 化:
  - 主操作と補助判断の境界が薄くなり、誤押下と表示密度の risk が増えるため不採用。

### Result

`RAU-UX-129` では、`その他` details を現行維持とする。
row footer / popover への runtime UI 変更 task は追加しない。

再評価条件は、通常利用または配布版 top smoke で `様子見`、`対応不要`、`要点` を探すための開閉が多く候補処理が止まること、pending notice と `その他` details が重なって取消や補助操作が見えにくいこと、または mobile 390px の実データ preview で row 処理が進みにくいことを観測した場合である。
Revenue Assistant write API、rank change payload、request 間隔、同時実行数、保存 schema は変更していない。

## Audit Evidence

保存先は Git 管理しない `.tmp/product-design-audit/` と `.tmp/ux-116-117-112-114-115-visual/` である。
raw trace、HAR、request body、response body、Cookie、token、credential、価格や在庫の非公開データは保存していない。

- `top-fixture-desktop.png`: top 料金調整候補 fixture、desktop 1280 x 900。
- `top-fixture-mobile.png`: top 料金調整候補 fixture、mobile 390 x 900。
- `top-preview-desktop.png`: top 料金調整候補 preview open、desktop 1280 x 900。
- `top-preview-mobile.png`: top 料金調整候補 preview open、mobile 390 x 900。
- `price-trends-loading-desktop.png`: 価格推移 loading fixture、desktop 1280 x 900。
- `price-trends-empty-desktop.png`: 価格推移 empty fixture、desktop 1280 x 900。
- `price-trends-failure-desktop.png`: 価格推移 failure fixture、desktop 1280 x 900。
- `price-trends-failure-mobile.png`: 価格推移 failure fixture、mobile 390 x 900。
- `monthly-compact-desktop.png`: 月次 compact fixture、desktop 1280 x 900。
- `.tmp/ux-116-117-112-114-115-visual/candidates-mobile.png`: top 料金調整候補 fixture、mobile 390px。
- `.tmp/ux-116-117-112-114-115-visual/price-trends-failure-mobile.png`: 価格推移 failure fixture、mobile 390px。
- `.tmp/ux-116-117-112-114-115-visual/monthly-compact-mobile.png`: 月次 compact fixture、mobile 390px。
- `.tmp/ux-116-117-112-114-115-visual/monthly-empty-mobile.png`: 月次 empty fixture、mobile 390px。
- `.tmp/ux-116-117-112-114-115-visual/monthly-partial-mobile.png`: 月次 partial fixture、mobile 390px。

確認値:

- mobile 390px で `documentElement.scrollWidth` は `390`。横 overflow は確認されなかった。
- mobile 390px の fixture では料金調整候補 row が `23` 件、action button が `262` 件、secondary action group が `23` 件、pending notice が `2` 件だった。
- 価格推移 failure fixture の status text は `背景取得 19 / 128・失敗 3・停止 fixture failure` だった。
- 2026-06-04 の追加 fixture visual check では、`candidates`、`price-trends-failure`、`monthly-compact`、`monthly-empty`、`monthly-partial` の desktop 1280px と mobile 390px で `documentElement.scrollWidth` が viewport 幅と一致した。
- 2026-06-04 の追加 fixture visual check では、価格推移 failure fixture に次アクション表示が 1 件、月次 compact / partial fixture に主 table 1 件、月次 compact / empty / partial fixture に data status details 1 件が表示された。
- 通常 Chrome の実ログイン profile を CDP (Chrome DevTools Protocol) 付きで起動する確認は、既存 Chrome が開いていたため repo script が停止した。既存 Chrome を強制終了しない方針にしたため、今回の live screenshot は未実施である。

## Surface Findings

### Top Screen

維持する点:

- 主要操作 `Analyzeで確認`、`曲線`、`ランク調整` を常時表示し、`様子見`、`対応不要` などの補助操作を `その他` details に分ける構造は、誤押下を避けながら判断を進める順序として妥当である。
- mobile 390px では table が card layout へ切り替わり、横 overflow は発生しない。
- 優先度の背景色と左線、推奨方向の pill、販売室数の補助表示は、視線誘導と判断材料の分離に役立っている。

修正した点:

- fixture の analyze link 表示を `Analyze` から `Analyzeで確認` に変更した。本番と fixture の主要操作文言を一致させるためである。
- `rank調整` の表示を `ランク調整` に変更した。日本語 UI の中で英字と日本語が混ざる表記を減らすためである。data attribute、rank change payload、Revenue Assistant write API endpoint は変更していない。
- 右下固定の warm cache indicator を廃止し、取得状態は料金調整候補 list または Analyze 画面内の関連領域へ表示するようにした。Revenue Assistant 標準 UI と候補 list の視認性を妨げないためである。
- `候補データ優先取得` strip は、料金調整候補 list がまだ描画されていない初期状態でも list 予定位置へ差し込む。これにより、最初にカレンダー上部へ出てから後で移動する見え方を避ける。

残る risk:

- mobile 390px では横 overflow はないが、1 row 内の操作候補が多い。今後、実利用で `その他` details の開閉頻度が高い場合は、補助操作を row 内から popover または row footer へ再配置する候補がある。
- fixture では favicon 404 が出たが、UI 起因の console error ではない。fixture polish として対応する場合は別 task で扱う。

### Analyze Sales Setting Screen

維持する点:

- Analyze 上部候補一覧は read-only であり、反映操作、一括反映、自動反映を追加していない。これは write safety を優先する既存方針に合っている。
- top list から Analyze へ遷移した後、日付一致候補だけを見る導線は、詳細確認の入口として妥当である。

残る risk:

- 今回は実ログイン Chrome の live screenshot を取得できなかったため、全体 booking curve、室タイプ別 card、rank overview、Analyze 上部候補一覧の同一画面内での視線移動は、直近の配布版 smoke 証跡と仕様記録からの判断に留まる。
- top list から Analyze へ遷移した候補がある場合、Analyze 上部候補一覧を `遷移元候補の確認` と `同日他候補の確認` に分けるようにした。これにより、利用者が今見に来た候補と、同じ日付の比較候補を混同しにくくする。

### Price Trends / Competitor Price Tab

維持する点:

- loading、empty、failure の fixture 表示があり、background queue の状態を文章で確認できる。
- 非公開データを保存しない制約を維持している。audit でも request body、response body、HAR、Cookie、token、価格や在庫の非公開データを保存していない。

修正した点:

- failure text は原因と停止状態だけではなく、次に行う操作を状態別に出すようにした。HTTP 401 はログイン確認、HTTP 403 は施設権限確認、HTTP 429 は時間を置いて再表示、HTTP 5xx と network / fetch / timeout はタブ再表示または再取得、IndexedDB unavailable はブラウザ設定または storage 状態の確認を促す。

残る risk:

- 金額 graph の tooltip と filter は実データが必要なため、通常 Chrome の live screenshot が取れない状態では最終判断できない。

### Monthly Progress Screen

維持する点:

- `INTENT.md` の優先順位に従い、月次実績画面は top 画面と Analyze 画面より後に扱う。
- compact view の fixture は、主 table と details を分ける方向で表示密度を抑えている。

修正した点:

- 月次 compact / empty / partial fixture を追加し、desktop 1280px と mobile 390px の screenshot を取得した。mobile 390px では横 overflow は確認されなかった。

残る risk:

- 月次実績の通常 Chrome 実ログイン画面では未確認である。月次画面を次に進める場合は、custom LT booking curve、compare / metric controls、日次差分 table、details、empty / partial data を Revenue Assistant 実画面でも確認する。

## Cross-Surface Findings

- button 文言は、日本語 UI の中で英字のまま残すと読み取り順が乱れる。外部 product 名として必要な `Analyze` は `Analyzeで確認` のように操作目的を含める。
- 操作の常時表示は、主要操作だけに限定する。補助操作は、誤押下を防ぎ、row の高さを増やしすぎない形で折りたたむ。
- loading、empty、failure は、状態説明だけでなく、次に利用者が何をすればよいかまで出す必要がある。
- 共通 UI primitive は、少なくとも 2 画面以上で同じ課題が確認できる場合だけ切り出す。今回の共通候補は、button label、status badge、failure action text、fixture screenshot coverage、smoke metric coverage である。

## Completed Follow-up Candidates

この節の候補は、2026-06-04 の後続 task 化で `docs/tasks_backlog.md` の未着手 task 本体と Remaining Task Triage へ反映し、同日の実装 bundle で完了した。
完了状態の正本は `docs/tasks_backlog.md` の `Completed / Product Design And Warm Cache UX Follow-ups` と `docs/context/STATUS.md` の最新項目とする。

- `RAU-UX-116`: 右下 warm cache indicator を廃止し、必要な状態表示を画面内の文脈へ移した。
- `RAU-UX-117`: `候補データ優先取得` strip の初期表示位置を料金調整候補 list 予定位置へ固定した。
- `RAU-UX-112`: 価格推移 / 競合価格 tab の failure state に、次に行う操作を状態別に表示した。
- `RAU-UX-113`: Analyze 上部候補一覧を、遷移元候補の確認と同日他候補の確認に分けた。
- `RAU-UX-114`: 月次実績画面の compact / empty / partial fixture と mobile screenshot coverage を追加した。
- `RAU-UX-115`: top 画面の補助操作 `その他` details は fixture 確認範囲では現行維持とし、row footer または popover へ移す判断は実利用頻度の確認後に扱うことにした。
