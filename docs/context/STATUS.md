# STATUS

最終更新: 2026-07-23

## Current Task Bundle

- `RAU-UX-150` は進行中である。第一段階の競合 snapshot 履歴 graph と、利用者が明示承認した第二段階の browser-local bounded writer は、clean-room 実装、合成 fixture、ログイン済み実画面 QA まで完了した。
- Next は `/analyze/YYYY-MM-DD` の可視な標準競合価格本文だけを所有し、標準表の末尾に追加表示する。desktop は4人数を 2 x 2、680px 以下は選択中1人数とし、部屋 / 食事 / 人数 filter、mouse / keyboard tooltip、最新値 / 前回差分、日別表を持つ。
- 既存の競合一覧 / 競合価格 GET だけを、可視な標準競合価格本文で未保存日の現在 stay date に各最大1回使う。週・月・周辺日程の background prefetch、raw response 保存、Revenue Assistant write API は追加していない。booking curve reference / rank marker と90日価格推移の比較 UI が Next cutover blockerとして残る。
- `src/main.ts` の monolith、Classic view / store、標準 chart は Next へ import または複製しない。

## Current State

- `RAU-UX-146` で Classic 公開物と Next candidate の identity / publication boundary を分離した。最後に記録された公開 Classic baseline は version `0.1.0.442`、662,626 bytes、SHA-256 `6C4635639376A6ECA2259FC9EA7916141CFE1A40BD3AE1364E49F577030802EB` である。
- `RAU-UX-147` では、基準日選択後だけ既存 read-only API と IndexedDB record を厳密な facility / stay date / as-of / room group / endpoint / query 境界で接続した。欠損、0、部分値、stale、error を分け、新規 API、background prefetch、storage write、Revenue Assistant write を追加していない。
- `RAU-UX-148` では、青い `団n` を hotel scope の直接値として再接続し、標準 calendar の黒い値や geometry を変更していない。
- `RAU-UX-149` では Analyze route isolation、標準3 tab、対象日維持、candidate request 0、Revenue Assistant write API POST 0、route cleanup を fixture / live QA で確認した。標準 Analyze 自体の 390px overflow は Next 起因ではない。
- `RAU-UX-150` 第一段階は、schema validation、view model、bounded IndexedDB read adapter、data-bound SVG view、route-scoped runtime、合成 fixture を分離した。最新の同一 condition signature 群と同じ JST 取得日の最終 record だけを採用し、4 panel は共通価格目盛を使う。保存時刻は表示するが鮮度を推測せず `最新性は未判定` とする。
- `RAU-UX-150` 第二段階は、可視な標準競合価格本文と facility label guard が一致する間だけ、部屋 / 食事指定なし・1〜6名の現在 stay date を `facility x stay date x JST取得日` ごとに1件保存する。Next 専用 IndexedDB、exclusive browser lock、deterministic key、`add` constraint、120観測 retention を writer / store 境界へ隔離し、Classic DB は変更しない。plan name / URL / price diff は保存せず、Classic / Next の有効履歴を表示時だけ統合する。
- `RAU-UX-145` は、Next が旧 stacked rail を採用していないため見送りである。同じ host 構造を将来採用する場合だけ再開する。
- RAU は Profile C とし、root `AGENTS.md` を入口に、`PROJECT_CONTEXT.md`、`INTENT.md`、`DECISIONS.md`、この file、backlog を責務が一致するときだけ読む。

## Next Re-entry

1. 次は booking curve reference / rank marker を clean-room の独立 runtime として再接続する。標準 booking curve を置換せず、現在の bounded writer と保存責務を混ぜない。
2. 最後に90日価格推移の人数別比較 UI を扱う。旧4 panel は無条件に複製せず、標準 UI と合成 fixture を比較して判断速度が上がる形を選ぶ。
3. 週・月・周辺日程の競合価格 prefetch、保存削除 UI、retention 変更が必要になった場合は、今回の明示承認へ含めず別の Yellow zone 判断とする。

## Verify / Confirmation State

- 合成 fixture で desktop 2 x 2、390px 1 panel、部屋 / 食事 / 人数切替、mouse / keyboard tooltip、empty / missing / error / 1日、route / tab cleanup、Next root 自己 overflow 0、console warning / error 0を確認した。fixture は writer を無効化し、外部通信や browser-local 保存を行わない。
- Tampermonkey 無効・ログイン済み実画面へ candidate を一時注入し、標準競合価格本文を維持したまま Next rootを末尾へ1件追加した。初回は `GET /api/v2/competitors` と `GET /api/v5/competitor_prices` を各1回だけ使い、Next 専用 DB の record は0件から1件になった。POST / PUT / PATCH / DELETE は0件だった。
- reload後の再注入と、booking curve tabから競合価格tabへの再表示では `本日分は保存済み` を表示し、candidate の競合一覧 / 1〜6名価格 GET は0件、Next record は1件のままだった。保存 record はschema / source / deterministic keyを満たし、plan name / URL / price diff は全件 `null`、禁止top-level fieldは0件だった。
- 標準表は1件のまま、Next rootも1件、標準表の後への非干渉配置、candidate console warning / error 0を確認した。最後はdevice overrideを解除してreloadし、Next root / runtime marker 0、標準競合価格tabと本文を復元した。実価格、施設名、room type名、response body、raw trace、実画面screenshotは保存していない。明示承認に基づく当日snapshot 1件だけはNext専用browser-local DBへ残した。
- `npm run check:next`、`npm run check`、`npm run check:classic-publication`、`npm run check:distribution-smoke-fixture`、`npm run check:booking-curve-smoke-fixture`、`npm run build:vite:fixture`、`git diff --check` が通過した。Next runtime graphは23 files、raw fetch 1か所、許可API path 4件である。既存履歴 owner `src/indexedDbReadOnly.ts` は `readonly` のまま、Next専用 writer owner `src/next/analyze/competitorHistorySnapshotStore.ts` だけが `readonly` / `readwrite` transactionと120件retentionを持つ。
- Next candidate は110,940 bytes、SHA-256 `403FE83EFA50E1DF46D29257DB35432E1345E2ED34FE89F8EBF1E8E326D4C6B5`、Classic と別 identity、updateURL / downloadURL なし、`server-read-only/local-bounded-history` である。Next publish、Tampermonkey install / switch、Classic 再公開、Revenue Assistant writeは未実施の別 gate である。

## Open Questions / Risks

- 競合履歴は利用者が標準競合価格本文を表示した stay date だけ厚くなる。観測頻度を網羅性や鮮度保証と誤読せず、background prefetchを必要とする場合は別判断にする。
- Next専用DBの削除UIはまだ持たない。当日QAで保存した1件を含め、同一施設・stay dateの古いNext recordは保存成功時に120件超過分だけ自動削除する。
- 競合 snapshot の room type 対応と freshness は断定しない。保存済み record の存在と取得時刻を、価格判断の十分条件として扱わない。
- booking curve reference / rank marker と90日価格推移の人数別比較は未接続であり、Next cutover は未達である。
- rank write API、server-side validation、権限差、error / partial failure、rollback は現行の確認済み範囲を超える。推奨レート金額、自動反映、一括反映は非目的である。
- 実画面 screenshot、raw trace、request / response body、施設名、room type名、価格、在庫、予約、顧客情報は repo へ保存しない。
- 完了履歴と詳細 verify は `docs/tasks_backlog.md`、`docs/context/DECISIONS.md`、spec、Git history を owner とし、この file へ再蓄積しない。

## References

- 上位前提: `docs/context/PROJECT_CONTEXT.md`
- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- Rank recommendation / Next parity: `docs/spec_003_rank_recommendation_signal.md`
- 実行順: `docs/tasks_backlog.md`
