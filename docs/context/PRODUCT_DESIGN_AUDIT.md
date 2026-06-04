# Product Design Audit

最終更新: 2026-06-04

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

## Audit Evidence

保存先は Git 管理しない `.tmp/product-design-audit/` である。
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

確認値:

- mobile 390px で `documentElement.scrollWidth` は `390`。横 overflow は確認されなかった。
- mobile 390px の fixture では料金調整候補 row が `23` 件、action button が `262` 件、secondary action group が `23` 件、pending notice が `2` 件だった。
- 価格推移 failure fixture の status text は `背景取得 19 / 128・失敗 3・停止 fixture failure` だった。
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

残る risk:

- mobile 390px では横 overflow はないが、1 row 内の操作候補が多い。今後、実利用で `その他` details の開閉頻度が高い場合は、補助操作を row 内から popover または row footer へ再配置する候補がある。
- fixture では favicon 404 が出たが、UI 起因の console error ではない。fixture polish として対応する場合は別 task で扱う。

### Analyze Sales Setting Screen

維持する点:

- Analyze 上部候補一覧は read-only であり、反映操作、一括反映、自動反映を追加していない。これは write safety を優先する既存方針に合っている。
- top list から Analyze へ遷移した後、日付一致候補だけを見る導線は、詳細確認の入口として妥当である。

残る risk:

- 今回は実ログイン Chrome の live screenshot を取得できなかったため、全体 booking curve、室タイプ別 card、rank overview、Analyze 上部候補一覧の同一画面内での視線移動は、直近の配布版 smoke 証跡と仕様記録からの判断に留まる。
- top list と Analyze 上部候補一覧の重複情報は、同じ候補を再確認するための情報として有効だが、表示密度が上がる。次に改善する場合は、Analyze 上部候補一覧を「遷移元候補の確認」と「同日他候補の確認」に分けるかを比較する。

### Price Trends / Competitor Price Tab

維持する点:

- loading、empty、failure の fixture 表示があり、background queue の状態を文章で確認できる。
- 非公開データを保存しない制約を維持している。audit でも request body、response body、HAR、Cookie、token、価格や在庫の非公開データを保存していない。

残る risk:

- failure text は原因と停止状態を出すが、次の操作が明確ではない。利用者が最速で復帰するには、再取得、タブ再表示、ログイン確認、権限確認のどれを行うべきかを状態別に出す余地がある。
- 金額 graph の tooltip と filter は実データが必要なため、通常 Chrome の live screenshot が取れない状態では最終判断できない。

### Monthly Progress Screen

維持する点:

- `INTENT.md` の優先順位に従い、月次実績画面は top 画面と Analyze 画面より後に扱う。
- compact view の fixture は、主 table と details を分ける方向で表示密度を抑えている。

残る risk:

- mobile の月次実績 fixture screenshot は今回未取得である。月次画面を次に進める場合は、custom LT booking curve、compare / metric controls、日次差分 table、details、empty / partial data を mobile 390px でも確認する。

## Cross-Surface Findings

- button 文言は、日本語 UI の中で英字のまま残すと読み取り順が乱れる。外部 product 名として必要な `Analyze` は `Analyzeで確認` のように操作目的を含める。
- 操作の常時表示は、主要操作だけに限定する。補助操作は、誤押下を防ぎ、row の高さを増やしすぎない形で折りたたむ。
- loading、empty、failure は、状態説明だけでなく、次に利用者が何をすればよいかまで出す必要がある。
- 共通 UI primitive は、少なくとも 2 画面以上で同じ課題が確認できる場合だけ切り出す。今回の共通候補は、button label、status badge、failure action text、fixture screenshot coverage、smoke metric coverage である。

## Recommended Next Task Candidates

この節は提案であり、2026-06-04 時点では Remaining Task Triage へ入れていない。
実装へ進める場合は、`docs/tasks_backlog.md` に task ID、目的、スコープ、非目標、受け入れ条件、最小 verify を追加する。

- `RAU-UX-112`: 価格推移 / 競合価格 tab の failure state に、次に行う操作を状態別に表示する。
  - 目的: `背景取得 19 / 128・失敗 3・停止 fixture failure` のような状態説明だけでなく、再取得、ログイン確認、権限確認、時間を置く、のどれを行うべきかを利用者が迷わないようにする。
  - 最小 verify: `npm run build:vite:fixture`、`npm run check:fixture-markers`、価格推移 failure fixture の desktop / mobile screenshot、必要なら `npm run smoke:distribution -- --mode price-trends`。
- `RAU-UX-113`: Analyze 上部候補一覧を、遷移元候補の確認と同日他候補の確認に分けるべきかを比較する。
  - 目的: top list から Analyze へ来た利用者が、同じ候補の詳細確認と同日他候補の比較を混同しないようにする。
  - 最小 verify: `npm run check`、`npm run build:vite:fixture`、`npm run smoke:distribution -- --mode analyze-recommendations`。
- `RAU-UX-114`: 月次実績画面の mobile fixture / screenshot coverage を追加する。
  - 目的: custom LT booking curve、compare / metric controls、日次差分、details、empty / partial data が 390px 幅で読めるかを、実装前に確認できるようにする。
  - 最小 verify: `npm run build:vite:fixture`、月次 compact / empty / partial の mobile screenshot、必要なら `npm run smoke:distribution -- --mode monthly-progress`。
- `RAU-UX-115`: top 画面の補助操作 `その他` details の実利用頻度を確認し、必要なら row footer または popover へ再配置する。
  - 目的: mobile で row 内操作が多い状態を維持してよいか、実利用の開閉頻度から判断する。
  - 最小 verify: `npm run check`、top fixture desktop / mobile screenshot、`npm run smoke:distribution -- --mode top`。
