# STATUS

最終更新: 2026-07-23

## Current Task Bundle

- `RAU-UX-149` の Next Analyze read-only parity audit は完了した。
- Next の基準日レンズは calendar route `/` だけを所有し、Analyze では root、style、選択、marker、追加 accessibility 属性を除去する。calendar へ戻った場合は旧選択を復元せず idle から再開する。
- Revenue Assistant 標準 Analyze の booking curve、現時点の競合価格条件表示、90日価格推移は Next 休止中も残る。一方、Classic 固有の booking curve reference / rank marker、競合 snapshot 履歴 graph、90日価格推移の人数別比較は標準画面だけでは残らない。
- `RAU-UX-150` を唯一の Now とし、競合 snapshot 履歴 graph から clean-room の独立 runtime で再接続する。`src/main.ts` の monolith や標準 chart は複製しない。

## Current State

- `RAU-UX-146` で Classic 公開物と Next candidate の identity / publication boundary を分離した。最後に記録された公開 Classic baseline は version `0.1.0.442`、662,626 bytes、SHA-256 `6C4635639376A6ECA2259FC9EA7916141CFE1A40BD3AE1364E49F577030802EB` である。
- `RAU-UX-147` では、基準日選択後だけ既存 read-only API と IndexedDB record を厳密な facility / stay date / as-of / room group / endpoint / query 境界で接続した。欠損、0、部分値、stale、error を分け、新規 API、background prefetch、storage write、Revenue Assistant write を追加していない。
- `RAU-UX-148` では、青い `団n` を hotel scope の直接値として再接続し、標準 calendar の黒い値や geometry を変更していない。
- `RAU-UX-149` では Analyze route isolation、標準3 tab、対象日維持、candidate request 0、Revenue Assistant write API POST 0、route cleanup を fixture / live QA で確認した。標準 Analyze 自体の 390px overflow は Next 起因ではなく、今回変更していない。
- `RAU-UX-145` は、Next が旧 stacked rail を採用していないため見送りである。同じ host 構造を将来採用する場合だけ再開する。
- RAU は Profile C とし、root `AGENTS.md` を入口に、`PROJECT_CONTEXT.md`、`INTENT.md`、`DECISIONS.md`、この file、backlog を責務が一致するときだけ読む。

## Next Re-entry

1. `RAU-UX-150` の最初の slice として、既存 browser-local record を read-only で使う競合 snapshot 履歴 graph の adapter / view model / chart / route cleanup を分離する。
2. snapshot / empty / stale / error、人数 / 食事 / 部屋タイプ、mouse / keyboard tooltip、screen reader label、390px、標準 overflow 非悪化、request budget、console、write 0 を fixture / smoke / live で確認する。
3. その後に booking curve reference / rank marker、最後に90日価格推移の人数別比較 UI を扱う。旧4 panel は無条件に複製しない。
4. 新規 endpoint、background prefetch、response 保存、storage write、freshness policy 変更が必要になった場合は、実装前に Yellow zone 判断を記録して停止する。

## Verify / Confirmation State

- `RAU-UX-149` の記録では、`npm run check:next`、`npm run check`、`npm run check:classic-publication`、`npm run check:distribution-smoke-fixture`、`npm run check:booking-curve-smoke-fixture`、`npm run build:vite:fixture`、`git diff --check` が通過している。
- Next candidate は Classic と別 identity、updateURL / downloadURL なし、read-only を維持する。Next publish、Tampermonkey install / switch、Classic 再公開、実 write は未実施の別 gate である。
- この context / Skill portfolio 横展開は runtime source、`dist/**`、依存、browser state、workflow、配布設定、公開物を変更しない。

## Open Questions / Risks

- Classic 固有の3つの比較機能が未接続のため、Next cutover は未達である。
- 競合 snapshot の room type 対応と freshness は断定しない。保存済み record の存在と取得時刻を、価格判断の十分条件として扱わない。
- rank write API、server-side validation、権限差、error / partial failure、rollback は現行の確認済み範囲を超える。推奨レート金額、自動反映、一括反映は非目的である。
- 実画面 screenshot、raw trace、request / response body、施設名、room type 名、価格、在庫、予約、顧客情報は repo へ保存しない。
- 完了履歴と詳細 verify は `docs/tasks_backlog.md`、`docs/context/DECISIONS.md`、spec、Git history を owner とし、この file へ再蓄積しない。

## References

- 上位前提: `docs/context/PROJECT_CONTEXT.md`
- 判断原則: `docs/context/INTENT.md`
- 固定判断: `docs/context/DECISIONS.md`
- 仕様地図: `docs/spec_000_overview.md`
- Analyze 仕様: `docs/spec_001_analyze_expansion.md`
- Rank recommendation / Next parity: `docs/spec_003_rank_recommendation_signal.md`
- 実行順: `docs/tasks_backlog.md`
