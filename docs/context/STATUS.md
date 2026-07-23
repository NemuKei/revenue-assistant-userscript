# STATUS

最終更新: 2026-07-23

## Current Task Bundle

- `RAU-UX-150` は進行中である。第一段階の競合 snapshot 履歴 graph、利用者が明示承認した第二段階の browser-local bounded writer、第三段階Aの booking curve reference比較、第三段階Bの rank変更履歴、第四段階の90日価格推移read-only比較UIは、clean-room 実装、合成 fixture、ログイン済み実画面 QA まで完了した。
- Next は `/analyze/YYYY-MM-DD` の可視な標準競合価格本文だけを所有し、標準表の末尾に追加表示する。desktop は4人数を 2 x 2、680px 以下は選択中1人数とし、部屋 / 食事 / 人数 filter、mouse / keyboard tooltip、最新値 / 前回差分、日別表を持つ。
- 既存の競合一覧 / 競合価格 GET だけを、可視な標準競合価格本文で未保存日の現在 stay date に各最大1回使う。booking curve referenceは既存raw cacheのexact primary keyだけを選択scopeごとにreadonlyで読み、メモリ上で算出する。rank履歴は確認済みroom scopeで表示中stay dateだけを最大1 GETし、responseを保存しない。90日価格推移はClassicの既存IndexedDB recordだけをbounded readonlyで読む。週・月・周辺日程のbackground prefetch、booking curve GET、価格推移GET、Revenue Assistant write APIは追加していない。Next自前の価格推移取得・保存契約がcutover gateとして残る。
- `src/main.ts` の monolith、Classic view / store、標準 chart は Next へ import または複製しない。

## Current State

- `RAU-UX-146` で Classic 公開物と Next candidate の identity / publication boundary を分離した。最後に記録された公開 Classic baseline は version `0.1.0.442`、662,626 bytes、SHA-256 `6C4635639376A6ECA2259FC9EA7916141CFE1A40BD3AE1364E49F577030802EB` である。
- `RAU-UX-147` では、基準日選択後だけ既存 read-only API と IndexedDB record を厳密な facility / stay date / as-of / room group / endpoint / query 境界で接続した。欠損、0、部分値、stale、error を分け、新規 API、background prefetch、storage write、Revenue Assistant write を追加していない。
- `RAU-UX-148` では、青い `団n` を hotel scope の直接値として再接続し、標準 calendar の黒い値や geometry を変更していない。
- `RAU-UX-149` では Analyze route isolation、標準3 tab、対象日維持、candidate request 0、Revenue Assistant write API POST 0、route cleanup を fixture / live QA で確認した。標準 Analyze 自体の 390px overflow は Next 起因ではない。
- `RAU-UX-150` 第一段階は、schema validation、view model、bounded IndexedDB read adapter、data-bound SVG view、route-scoped runtime、合成 fixture を分離した。最新の同一 condition signature 群と同じ JST 取得日の最終 record だけを採用し、4 panel は共通価格目盛を使う。保存時刻は表示するが鮮度を推測せず `最新性は未判定` とする。
- `RAU-UX-150` 第二段階は、可視な標準競合価格本文と facility label guard が一致する間だけ、部屋 / 食事指定なし・1〜6名の現在 stay date を `facility x stay date x JST取得日` ごとに1件保存する。Next 専用 IndexedDB、exclusive browser lock、deterministic key、`add` constraint、120観測 retention を writer / store 境界へ隔離し、Classic DB は変更しない。plan name / URL / price diff は保存せず、Classic / Next の有効履歴を表示時だけ統合する。
- `RAU-UX-150` 第三段階Aは、可視な標準booking curveの2 chartを残し、そのnative content末尾へ独立rootを追加する。初期scopeはホテル全体、room groupは確認済みidを利用者が選んだ場合だけ遅延読込し、`全体`と`個人 / 団体`の2 panelでcurrent / 直近型 / 季節型を同じLT軸へ重ねる。facility / current settings GETは各最大1回、raw cacheは選択scopeのexact primary keyだけを1 readonly transactionで読み、referenceはメモリ上で算出して保存しない。
- `RAU-UX-150` 第三段階Bは、利用者の明示承認に基づき、facility guard通過後の確認済みroom scopeで表示中stay dateだけを既存rank status endpointへ最大1 GETする。responseはruntime validation後もメモリだけに置き、同一room / JST反映日の最新eventへ絞る。current curveの直接値があるeventだけをmarkerへ置き、値がないeventも履歴表には残す。room名fallback、ホテル全体への集約、`reflector_name`、response保存、自動retry、rank writeを追加していない。
- `RAU-UX-150` 第四段階は、可視な標準価格推移chartを残し、そのnative content末尾へ独立rootを追加する。1〜4名は自社 / 競合最安 / 差額 / 直近lead timeの4 summary cardで同時比較し、選択中1人数だけを自社 / 競合施設別の詳細chartで見る。部屋 / 食事filter、mouse / keyboard tooltip、accessible table、保存時刻、empty / stale / errorを持つ。既存Classic DBの同一facility / stay dateを最大512件readonlyで読むだけで、価格推移GET、storage write、Classic DB変更を追加していない。
- `RAU-UX-145` は、Next が旧 stacked rail を採用していないため見送りである。同じ host 構造を将来採用する場合だけ再開する。
- RAU は Profile C とし、root `AGENTS.md` を入口に、`PROJECT_CONTEXT.md`、`INTENT.md`、`DECISIONS.md`、この file、backlog を責務が一致するときだけ読む。

## Next Re-entry

1. 次はNext単独運用時の90日価格推移取得・保存を扱うか判断する。進める場合は、`/api/v1/price_trends`のrequest範囲と頻度、保存scope、retention、削除方針、freshness表示、権限と負荷を別Yellow zone判断として先に固定する。
2. 週・月・周辺日程の競合価格 prefetch、保存削除 UI、retention 変更が必要になった場合は、今回の明示承認へ含めず別の Yellow zone 判断とする。

## Verify / Confirmation State

- 合成 fixture で desktop 2 x 2、390px 1 panel、部屋 / 食事 / 人数切替、mouse / keyboard tooltip、empty / missing / error / 1日、route / tab cleanup、Next root 自己 overflow 0、console warning / error 0を確認した。fixture は writer を無効化し、外部通信や browser-local 保存を行わない。
- Tampermonkey 無効・ログイン済み実画面へ candidate を一時注入し、標準競合価格本文を維持したまま Next rootを末尾へ1件追加した。初回は `GET /api/v2/competitors` と `GET /api/v5/competitor_prices` を各1回だけ使い、Next 専用 DB の record は0件から1件になった。POST / PUT / PATCH / DELETE は0件だった。
- reload後の再注入と、booking curve tabから競合価格tabへの再表示では `本日分は保存済み` を表示し、candidate の競合一覧 / 1〜6名価格 GET は0件、Next record は1件のままだった。保存 record はschema / source / deterministic keyを満たし、plan name / URL / price diff は全件 `null`、禁止top-level fieldは0件だった。
- 標準表は1件のまま、Next rootも1件、標準表の後への非干渉配置、candidate console warning / error 0を確認した。最後はdevice overrideを解除してreloadし、Next root / runtime marker 0、標準競合価格tabと本文を復元した。実価格、施設名、room type名、response body、raw trace、実画面screenshotは保存していない。明示承認に基づく当日snapshot 1件だけはNext専用browser-local DBへ残した。
- booking curve referenceの合成fixtureでは、desktop 2 panel、390px縦積み、room scope、個人 / 団体、直近型 / 季節型、mouse / keyboard tooltip、0 / missing / stale / error、route cleanup、Next root自己overflow 0、標準chart 2枚維持、console warning / error 0を確認した。標準fixture由来の横overflowをNext rootは拡大しなかった。
- ログイン済み実画面へcandidateを一時注入し、可視な標準booking curve 2 chartを維持したままnative content末尾へNext root 1件を追加した。対象日のexact as-of raw cacheはホテル / 確認したroom scopeとも不足していたため、古いcacheを探索せずemptyを表示し、7つの確認済みscope toggleを残した。facility / current settings GETは各1回、scope切替とtab再表示で追加0、booking curve GET 0、Revenue Assistant write 0、candidate runtime exception / console warning / error 0だった。reload後はNext root / style 0、標準booking curve 2 chartへ戻した。
- rank履歴の合成fixtureでは、ホテルscopeのload 0、room scope初回1、room / segment / tab切替後も1、route変更後だけ新contextとして2、ready / empty / request error / abort、自動retryなし、2 panel marker、keyboard focus / tap tooltip、履歴表、390pxのNext root自己overflow 0、標準chart 2枚維持、console warning / error 0を確認した。
- ログイン済み実画面へcandidateを一時注入し、ホテルscopeのrank GET 0、最初のroom scopeで既存`GET /api/v3/lincoln/suggest/status` 1、別room / 価格推移tab往復後の追加0、Revenue Assistant originのPOST / PUT / PATCH / DELETE 0、runtime exception / console warning / error 0を確認した。exact raw cache不足のためmarker位置は推測せず、valid rank履歴だけを表へ表示した。reload後はNext root / style 0、標準booking curve 2 chartへ戻した。response body、施設名、room type名、rank名、raw trace、実画面screenshotは保存していない。
- 価格推移の合成fixtureでは、desktopのsummary 4件 / detail chart 1枚、4名切替、部屋filter、keyboard focus tooltip、accessible table、empty / read error、route / tab / facility mismatch cleanup、390pxのsummary 2列とNext root自己overflow 0、標準chart維持、console warning / error 0を確認した。
- ログイン済み実画面へcandidateを一時注入し、既存保存履歴からsummary 4件 / detail chart 1枚を標準chartの後へ表示した。4名切替、Next root自己overflow 0、`GET /api/v2/yad/info` 1件、candidate起点の価格推移GET 0、Revenue Assistant originのPOST / PUT / PATCH / DELETE 0、runtime exception / console warning / error 0を確認した。reload後はNext root / style / runtime marker 0、標準価格推移chart 1枚へ戻した。実価格、施設名、response body、raw trace、実画面screenshotは保存していない。
- `npm run check:next`、`npm run check`、`npm run check:classic-publication`、`npm run check:distribution-smoke-fixture`、`npm run check:booking-curve-smoke-fixture`、`npm run build:vite:fixture`、`git diff --check` が通過した。Next sourceは29 files、runtime graphは34 files、raw fetch 1か所、許可API path 5件である。既存cache reader `src/indexedDbReadOnly.ts` は `readonly` のまま、Next専用 writer owner `src/next/analyze/competitorHistorySnapshotStore.ts` だけが `readonly` / `readwrite` transactionと120件retentionを持つ。
- Next candidate は193,311 bytes、SHA-256 `258EDB6184F9E04B62AA2E6C8106B8EFCA54BCC1EAC9EC6225846B9C64B263F5`、Classic と別 identity、updateURL / downloadURL なし、`server-read-only/local-bounded-history` である。Next publish、Tampermonkey install / switch、Classic 再公開、Revenue Assistant writeは未実施の別 gate である。

## Open Questions / Risks

- 競合履歴は利用者が標準競合価格本文を表示した stay date だけ厚くなる。観測頻度を網羅性や鮮度保証と誤読せず、background prefetchを必要とする場合は別判断にする。
- Next専用DBの削除UIはまだ持たない。当日QAで保存した1件を含め、同一施設・stay dateの古いNext recordは保存成功時に120件超過分だけ自動削除する。
- 競合 snapshot の room type 対応と freshness は断定しない。保存済み record の存在と取得時刻を、価格判断の十分条件として扱わない。
- booking curve referenceとrank履歴は接続したが、実画面の対象日ではexact raw cache不足のため、実rank eventをcurrent curve上へ位置づけたmarkerは未確認である。ready marker / source不足 / 0 / stale / errorの表示契約は合成fixtureで確認した。90日価格推移のread-only比較UIは接続したが、Next自前の取得・保存は未実装で、Classicが残した既存recordがない日には履歴を増やせないためNext cutoverは未達である。
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
