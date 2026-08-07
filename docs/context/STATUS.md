# STATUS

最終更新: 2026-08-07

## Current Task Bundle

- 現在進行中の Goal Bundle はない。直近完了は `RAU-UX-153` のClassic UI baseline第二sliceであり、Next booking curveを対象・切替・凡例・chart・必要時の詳細という読む順序へ戻し、合成fixtureでdesktop / mobileと主要操作を確認した。Revenue Assistant実画面とTampermonkey実行版は変更・確認していない。

## Current State

- `RAU-UX-146` で Classic 公開物と Next candidate の identity / publication boundary を分離した。最後に記録された公開 Classic baseline は version `0.1.0.442`、662,626 bytes、SHA-256 `6C4635639376A6ECA2259FC9EA7916141CFE1A40BD3AE1364E49F577030802EB` である。
- `RAU-UX-147` では、基準日選択後だけ既存 read-only API と IndexedDB record を厳密な facility / stay date / as-of / room group / endpoint / query 境界で接続した。欠損、0、部分値、stale、error を分け、新規 API、background prefetch、storage write、Revenue Assistant write を追加していない。
- `RAU-UX-148` では、青い `団n` を hotel scope の直接値として再接続し、標準 calendar の黒い値や geometry を変更していない。
- `RAU-UX-149` では Analyze route isolation、標準3 tab、対象日維持、candidate request 0、Revenue Assistant write API POST 0、route cleanup を fixture / live QA で確認した。標準 Analyze 自体の 390px overflow は Next 起因ではない。
- `RAU-UX-150` 第一段階は、schema validation、view model、bounded IndexedDB read adapter、data-bound SVG view、route-scoped runtime、合成 fixture を分離した。最新の同一 condition signature 群と同じ JST 取得日の最終 record だけを採用し、4 panel は共通価格目盛を使う。保存時刻は表示するが鮮度を推測せず `最新性は未判定` とする。
- `RAU-UX-150` 第二段階は、可視な標準競合価格本文と facility label guard が一致する間だけ、部屋 / 食事指定なし・1〜6名の現在 stay date を `facility x stay date x JST取得日` ごとに1件保存する。Next 専用 IndexedDB、exclusive browser lock、deterministic key、`add` constraint、120観測 retention を writer / store 境界へ隔離し、Classic DB は変更しない。plan name / URL / price diff は保存せず、Classic / Next の有効履歴を表示時だけ統合する。
- `RAU-UX-150` 第三段階Aは、可視な標準booking curveの2 chartを残し、そのnative content末尾へ独立rootを追加する。初期scopeはホテル全体、room groupは確認済みidを利用者が選んだ場合だけ遅延読込し、`全体`と`個人 / 団体`の2 panelでcurrent / 直近型 / 季節型を同じLT軸へ重ねる。facility / current settings GETは各最大1回、raw cacheは選択scopeのexact primary keyだけを1 readonly transactionで読み、referenceはメモリ上で算出して保存しない。
- `RAU-UX-150` 第三段階Bは、利用者の明示承認に基づき、facility guard通過後の確認済みroom scopeで表示中stay dateだけを既存rank status endpointへ最大1 GETする。responseはruntime validation後もメモリだけに置き、同一room / JST反映日の最新eventへ絞る。current curveの直接値があるeventだけをmarkerへ置き、値がないeventも履歴表には残す。room名fallback、ホテル全体への集約、`reflector_name`、response保存、自動retry、rank writeを追加していない。
- `RAU-UX-150` 第四段階では当時、1〜4名のsummary cardと選択中1人数の詳細chartを採用した。標準chart非干渉、filter、tooltip、accessible table、保存時刻、empty / stale / error、bounded readonly readの境界は現在も有効だが、表示layoutと人数選択は`RAU-UX-152`で置き換えた。
- `RAU-UX-150` 第五段階は、利用者の明示承認に基づき、可視な標準価格推移本文、facility label guard、document visible、JST当日から89日先までのstay dateが揃う場合だけ、部屋指定なし・4食事 x 4人数の不足scopeを取得する。競合一覧GETは最大1回、価格推移GETは最大16回 / concurrency 2で、Classic / Nextに同日有効scopeがあれば両方を省略する。Next専用DB、deterministic key、Web Locks、IDB add constraint、scopeごとの最新1件、施設単位で当日〜89日先・最大1,440件の自動pruneをwriter / store境界へ隔離し、Classic DBを変更しない。
- `RAU-UX-151` は、可視なcalendarまたはAnalyze、facility label guard、document visible、現在のas-ofが揃う場合だけ既存read-only `GET /api/v4/booking_curve`を使う。必要source coverage 80%未満のbounded bootstrapは表示中stay dateのhotel / 全room currentとhotel直近型referenceを最大800件、coverage 80%以上のdaily deltaは新規・欠損・current tail・新しく観測可能になったreference tickだけを最大200件、250ms以上 / concurrency 2で補う。1 sessionで全sourceへ届かない場合は`今回分完了`として次の可視sessionで再計画し、全source準備済みを断定しない。Next専用DBはsource最新1件へ過去pointを内包し、施設最大4,096件、401 / 403 / 429即停止、同一run retryなしとする。
- `RAU-UX-152` は、Classicで定着したUIをNextの表示baselineとし、90日価格推移を`1名 最安値`〜`4名 最安値`の施設別chart 4 panel常時表示へ戻した。summary card、人数選択、選択中1 chartのstateとevent処理は除去した。部屋 / 食事filter、共通legend、tooltip、人数別accessible table、capture / empty / stale / read error、標準chart非干渉、既存の取得・保存・request / write境界は維持する。
- `RAU-UX-153` は、Next booking curveの大きな説明blockをchart前から外し、対象scopeを含む見出し、compactな`表示範囲 / 内訳 / 参考線`toggle、凡例、2 chartを先に置いた。取得条件、欠損説明、rank変更履歴はchart後の初期折りたたみdetailsへ残し、狭幅では全pointを維持したまま横軸labelだけを6件へ間引いた。adapter / data source / model / runtime、API / storage / write境界は変更していない。
- 最終確認した2026-07-24時点では、利用者がTampermonkeyの旧Next version `0.1.0`を無効化し、最新candidateも一時注入後のreloadで除去して、通常Chromeをnative UIだけへ戻していた。2026-07-31のdocs lifecycleではbrowserを再確認していないため、現在のTampermonkey実行状態は未確認である。candidateは引き続きupdateURL / downloadURLを持たないopt-in artifactで、公開版ではない。
- `RAU-UX-145` は、Next が旧 stacked rail を採用していないため見送りである。同じ host 構造を将来採用する場合だけ再開する。
- RAU は`solo-product`を採用し、data contract / migration、architecture / dependency、browser observationのconditional boundaryをroot `AGENTS.md`へ統合した。user-scope global policyは複製せず、`PROJECT_CONTEXT.md`、`INTENT.md`、`DECISIONS.md`、このfile、backlogは責務が一致するときだけ読む。今回のprofile最適化はruntime、Classic / Next、Tampermonkey、API / write、publication boundaryを変更しない。

## Next Re-entry

1. Classic UI baselineの次sliceへ進む場合は、基準日レンズからAnalyzeへ進む現行の判断導線と、現在の機能・取得・保存・安全設計を変更しない。未着手のTop基準日レンズまたはAnalyze競合価格履歴について、ClassicとNextの表示配置、情報の順序、filter / toggle、用語、操作感だけを合成fixtureで比較し、判断を最も妨げているUI差分を1つ局所修正する。Classicの9列候補表、旧monolith、API / 保存範囲、request / write境界、実データを比較・移植対象へ混ぜない。
2. Tampermonkey実行版を更新する場合は、現在の有効 / 無効と実行版をfresh確認し、最新candidateの手動reinstall / switchと切替後smokeを別の明示gateとして扱う。updateURL / downloadURLがないため、repo更新だけでは現在の実行版へ自動反映されない。
3. 翌日tail差分は2026-07-24の同日live QAでは再現できていない。pure testでは最後の保存point以後だけのappendを確認済みだが、次のJST観測日に実行版を有効化する場合は、新規・欠損・観測可能tailだけを最大200件で補うことをlive確認候補とする。
4. Next publish、release、Classic再公開は未実施の明示gateである。週・月・周辺日程の取得、保存削除 UI、retention 変更が必要になった場合も、今回の明示承認へ含めず別の Yellow zone 判断とする。

## Verify / Confirmation State

- `RAU-UX-153` のbooking curve合成fixtureを1280pxで表示し、標準chart 2、Next panel 2、control group 3、初期details closed、Next root自己overflow 0を確認した。chartまでの距離は変更前431px、変更後127pxだった。room scope、個人 / 団体、直近型 / 季節型、rank履歴1回読込と2 panel marker、tap tooltip、details / table、route cleanup /復帰、missing / errorを確認し、console warning / errorは0だった。
- 390pxではNext panel 2を1列、toggle最小高さ44px、Next root自己overflow 0、横軸labelを`360 / 180 / 90 / 30 / 7 / ACT`の6件とした。全point、`0日前`と`ACT`の別値、tooltip、accessible tableは維持している。これは外部通信と保存を無効化した合成fixtureによるlocal QAであり、Revenue Assistant実画面、Tampermonkey、browser-local保存値は確認していない。
- `RAU-UX-153` ではfocused check、`npm run check:next`、`npm run check`、`npm run check:classic-publication`、`npm run check:fixture-markers`、distribution / booking-curve smoke fixture、Classic fixture build、Vite build比較、`git diff --check`が通過した。再生成したlocal candidateは239,094 bytes、SHA-256 `401756E78ABD11B554DA3F3E9A555ED660E4F7AACC48730C1617EDE0D0557002`、updateURL / downloadURLなしであり、公開していない。
- `RAU-UX-152` の合成fixtureを1280pxで表示し、Next root 1件、人数別panel / SVG / accessible table各4件、標準価格推移chart 1件、Next root自己overflow 0を確認した。部屋filter後も4 panelを維持し、keyboard focus tooltip、24行の詳細表、route離脱時root 0・復帰時root 1を確認した。4名だけ欠損するfixtureではpanel 4件のままSVG 3件、`4名 最安値`だけ`対象データなし`となった。
- 390pxではNext root自己overflow 0、panel 4件を1列、filterの最小高さ44pxを確認した。empty / read errorでも標準chart 1件を維持し、browser console warning / errorは0だった。これは合成データによるlocal QAであり、Revenue Assistant実画面、Tampermonkey、browser-local保存値は確認していない。
- `npm run check:next`、`npm run check`、`npm run check:classic-publication`、`npm run check:distribution-smoke-fixture`、`npm run check:booking-curve-smoke-fixture`、`npm run build:vite:fixture`、`git diff --check`が通過した。再生成したlocal candidateは237,697 bytes、SHA-256 `438BCDABEBD8BDAD05D4DF289883C55D54EEA3ADF53600C4EEF4707F23CDCB18`、updateURL / downloadURLなしであり、公開していない。
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
- 第五段階のfocused checkでは、同日16 scopeのnetwork 0、1 scope不足時の競合一覧1 / 価格推移1、同一runtime再実行0、90日範囲外0、不正保存recordの再取得、不正response / request / storage失敗時とrequest abort時の保存0、公式側データなし、deterministic key、retention prune、fixture writer完全無効を確認した。
- ログイン済み実画面では、標準価格推移chartを残したまま初回にfacility 1 / 競合一覧1 / 価格推移16 GET、Revenue Assistant originのwrite method 0で、Next専用DBを0件から既定16 scopeへ保存した。reload後の再注入ではfacility 1、競合一覧0、価格推移0、DB 16件維持、`本日分は保存済み`、candidate / page console warning / error 0を確認した。保存recordは16 deterministic key、部屋指定なし、最小schema、禁止field 0だった。390pxではNext root自体359px、summary 2列、内部overflow 0で、標準画面由来の固定幅overflowを拡大しなかった。最後はdevice overrideを解除してreloadし、Next root / runtime marker 0、標準価格推移tabと本文を復元した。実価格、施設名、response body、raw trace、実画面screenshotは保存せず、明示承認に基づく当日16 recordだけをNext専用browser-local DBへ残した。
- Tampermonkey切替後の通常Chromeをfresh reloadし、calendar routeでは標準calendarを残してNext基準日レンズroot 1件をidleでmountし、基準日選択とclearを確認した。Analyzeでは標準booking curve 2 chartとNext root 1件、確認済みscope 7件、room scopeのrank履歴ready、rank GET初回1・tab再表示0を確認した。競合価格では標準本文1件、Next root 1件、4 panel / SVG 4件、価格推移では標準本文1件、Next root 1件、summary 4件 / detail SVG 1件を確認し、両方とも`already-stored`でtab表示時の競合一覧 / 競合価格 / 価格推移GETは0件だった。各reload・route・tab操作区間のRevenue Assistant write methodは0件、runtime exceptionとconsole warning / errorは0件、Classic markerは0件だった。booking curveのexact raw cache不足と、基準日レンズの実比較候補不足は既存どおり推測で補っていない。
- `RAU-UX-151`のfocused checkでは、保存済みpoint不変、最後の保存point以後のtail-only append、source as-ofより遅れたtailの次回補充、current当日差分、referenceの次tick到達時差分、past landing後の年齢再取得なし、source最新1件、施設最大4,096件、401 / 403 / 429即停止、同一run retryなし、連続3 error停止を確認した。`0日前`とlanding / ACTの分離、post-stay-only sourceの`0日前`欠損、current / 直近型 / 季節型での表示補間なし、直近型ACTへの別曜日landing混入なし、current tail未補充時の`比較準備中`も直接testした。
- Tampermonkey旧Nextを無効化したログイン済み実画面へcandidateだけを一時注入した。Next booking curve DB 0件から開始し、初回sessionで768 source、次の可視sessionで残り235 sourceを保存して合計1,003件へ収束した。2回目の235 GETは全件HTTP 200、request開始間隔最短251.4ms、最大同時2、error 0、Revenue Assistant originのwrite method 0だった。3回目の同日再注入ではfacility / current settings GET各1、booking curve GET 0、DB 1,003件維持、candidate runtime exception / console error 0だった。これにより、初回bootstrapがsession上限で複数回に分かれ、保存済みsourceから再開した後は同日差分0へ収束することを確認した。
- liveで判明したsession単位の誤読を避けるため、bootstrapの完了文言を`今回分完了` / `残りは次回確認`へ変更し、通常の保存済みsource再利用とIDB `add`競合を混同していた`再利用`を`重複回避`へ変更した。focused checkでbootstrap文言を、再生成candidateの同日live smokeで`本日差分完了 0/0（保存 0・重複回避 0・エラー 0）`、booking curve GET 0、DB 1,003件維持、write 0を確認した。
- `npm run check:next`、`npm run check`、`npm run check:classic-publication`、`npm run check:distribution-smoke-fixture`、`npm run check:booking-curve-smoke-fixture`、`npm run build:vite:fixture`、`git diff --check` が通過した。Next sourceは35 files、runtime graphは40 files、raw fetch 1か所、許可API path 7件である。既存cache reader `src/indexedDbReadOnly.ts` は `readonly` のまま、Next専用writer ownerは競合履歴120件、価格推移1,440件、booking curve4,096件へ分離されている。
- 最新Next candidateは240,445 bytes、SHA-256 `ECEA745A492CDA76C0FE09938A5D61874E0C736A3D7183B6112914CC5B514E54`、Classicと別identity、updateURL / downloadURLなし、`server-read-only/local-bounded-history`である。live QAの一時candidateと計測用fetch wrapperはreloadで除去し、Next root / runtime marker 0、native main / calendar維持を確認した。明示承認されたbooking curve source 1,003件だけをNext専用browser-local DBへ残した。実施設名、room type名、rooms値、response body、raw trace、screenshotは保存またはcommitしていない。Next publish、release、Classic再公開、Revenue Assistant write、最新candidateのTampermonkey reinstall / switchは未実施の別gateである。

## Open Questions / Risks

- 競合履歴は利用者が標準競合価格本文を表示した stay date だけ厚くなる。観測頻度を網羅性や鮮度保証と誤読せず、background prefetchを必要とする場合は別判断にする。
- Next専用DBの削除UIはまだ持たない。競合履歴は同一施設・stay dateで120観測超過分、価格推移はscopeごとの旧record、当日〜89日先の範囲外、施設単位1,440件超過分だけを各保存成功時に自動削除する。
- Tampermonkeyの現在の有効 / 無効と実行版は2026-07-31時点で未確認である。candidateは自己更新しないため、実行版を更新する場合はcandidateの再build、artifact確認、手動再install、切替後smokeを同じrollback境界で行う。
- `RAU-UX-151`の初回bootstrap負荷と同日収束は実画面確認済みだが、翌日tail差分は同日には再現できない。翌日の新規観測pointだけを補う契約はpure test確認であり、live確認済みと誤記しない。
- 競合 snapshot の room type 対応と freshness は断定しない。保存済み record の存在と取得時刻を、価格判断の十分条件として扱わない。
- booking curve referenceとrank履歴は接続したが、実画面の対象日ではexact raw cache不足のため、実rank eventをcurrent curve上へ位置づけたmarkerは未確認である。ready marker / source不足 / 0 / stale / errorの表示契約は合成fixtureで確認した。90日価格推移のNext自前取得は部屋指定なし16 scopeに限定し、部屋タイプ別filterの新しい履歴は取得しない。Classicの既存specific-room recordがない場合、部屋タイプ別表示の鮮度や網羅性は保証しない。
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
