# Product Design Audit

最終更新: 2026-06-05

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
