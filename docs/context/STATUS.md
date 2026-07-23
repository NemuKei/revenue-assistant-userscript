# STATUS

最終更新: 2026-07-23

## Current Task Bundle

- `RAU-UX-150` は進行中である。第一段階の競合 snapshot 履歴 graph は、clean-room 実装、合成 fixture、ログイン済み実画面の read-only QA まで完了した。
- Next は `/analyze/YYYY-MM-DD` の可視な標準競合価格本文だけを所有し、標準表の末尾に追加表示する。desktop は4人数を 2 x 2、680px 以下は選択中1人数とし、部屋 / 食事 / 人数 filter、mouse / keyboard tooltip、最新値 / 前回差分、日別表を持つ。
- 新規 endpoint、background prefetch、response 保存、storage write、Revenue Assistant write API は追加していない。Classic 無効後も履歴を更新する bounded writer、booking curve reference / rank marker、90日価格推移の比較 UI が Next cutover blockerとして残る。
- `src/main.ts` の monolith、Classic view / store、標準 chart は Next へ import または複製しない。

## Current State

- `RAU-UX-146` で Classic 公開物と Next candidate の identity / publication boundary を分離した。最後に記録された公開 Classic baseline は version `0.1.0.442`、662,626 bytes、SHA-256 `6C4635639376A6ECA2259FC9EA7916141CFE1A40BD3AE1364E49F577030802EB` である。
- `RAU-UX-147` では、基準日選択後だけ既存 read-only API と IndexedDB record を厳密な facility / stay date / as-of / room group / endpoint / query 境界で接続した。欠損、0、部分値、stale、error を分け、新規 API、background prefetch、storage write、Revenue Assistant write を追加していない。
- `RAU-UX-148` では、青い `団n` を hotel scope の直接値として再接続し、標準 calendar の黒い値や geometry を変更していない。
- `RAU-UX-149` では Analyze route isolation、標準3 tab、対象日維持、candidate request 0、Revenue Assistant write API POST 0、route cleanup を fixture / live QA で確認した。標準 Analyze 自体の 390px overflow は Next 起因ではない。
- `RAU-UX-150` 第一段階は、schema validation、view model、bounded IndexedDB read adapter、data-bound SVG view、route-scoped runtime、合成 fixture を分離した。最新の同一 condition signature 群と同じ JST 取得日の最終 record だけを採用し、4 panel は共通価格目盛を使う。保存時刻は表示するが鮮度を推測せず `最新性は未判定` とする。
- `RAU-UX-145` は、Next が旧 stacked rail を採用していないため見送りである。同じ host 構造を将来採用する場合だけ再開する。
- RAU は Profile C とし、root `AGENTS.md` を入口に、`PROJECT_CONTEXT.md`、`INTENT.md`、`DECISIONS.md`、この file、backlog を責務が一致するときだけ読む。

## Next Re-entry

1. Classic 無効後も競合履歴を更新する bounded snapshot writer について、保存対象、保存期間、削除方針、request 負荷、権限を Yellow zone 判断として固定し、利用者の明示承認を得る。
2. 承認後は既存 `/api/v5/competitor_prices` 契約を adapter / storage owner の境界内で再接続し、現在日の明示取得から始める。background queue や周辺日程 prefetch は同じ gate に含めず別判断とする。
3. 次に booking curve reference / rank marker、最後に90日価格推移の人数別比較 UI を扱う。旧4 panel は無条件に複製せず合成 fixture で比較する。
4. writer を承認しない場合も read-only graph は維持できるが、履歴更新不能を cutover blocker として残す。

## Verify / Confirmation State

- 合成 fixture で desktop 2 x 2、390px 1 panel、部屋 / 食事 / 人数切替、mouse / keyboard tooltip、empty / missing / error / 1日、route / tab cleanup、Next root 自己 overflow 0、console warning / error 0を確認した。
- Tampermonkey 無効・ログイン済み実画面へ candidate を一時注入し、標準競合価格 section の既存3 childを維持したまま Next rootを末尾へ1件追加した。4 SVG / 4 panel、filter連動、390 x 844でvisible panel 1、44px人数button、Next root client / scroll width 357 / 357pxを確認した。
- candidate 起点の facility GET は `GET /api/v2/yad/info` 1回、Revenue Assistant APIへの POST / PUT / PATCH / DELETE は0件、runtime exception / console warning / errorは0件だった。既存 page の外部 telemetry POSTと通知 / alert GETはcandidate writeに数えない。
- 最後はdevice overrideを解除してreloadし、Next root / style / runtime marker 0、標準競合価格tabと本文を復元した。実価格、施設名、room type名、response body、raw trace、実画面screenshotは保存していない。
- `npm run check:next`、`npm run check`、`npm run check:classic-publication`、`npm run check:distribution-smoke-fixture`、`npm run check:booking-curve-smoke-fixture`、`npm run build:vite:fixture`、`git diff --check` が通過した。Next runtime graphは21 files、raw fetch 1か所、許可API path 2件、IndexedDB owner `src/indexedDbReadOnly.ts`、transaction mode `readonly` である。
- Next candidate は97,714 bytes、SHA-256 `788FEA4C1D3304E01397822CB122FD5E9D72CEA6FDFDEE5F992B5D896869F323`、Classic と別 identity、updateURL / downloadURL なし、read-only である。Next publish、Tampermonkey install / switch、Classic 再公開、実 write は未実施の別 gate である。

## Open Questions / Risks

- 保存済み履歴を表示できても、新しい snapshot を蓄積しなければ推移は更新されない。writer 承認前は cutover 可としない。
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
