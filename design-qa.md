# Design QA: RAU-UX-138〜142 Top Decision Workspace

最終確認日: 2026-07-18

## 対象と判定

- 対象: Revenue Assistant top の 3 か月カレンダー、`今日の判断` rail、選択候補の詳細、rank 変更の最終確認、標準 UI との host / cue 競合。
- 判定: 3 か月 synthetic fixture、Revenue Assistant 実 DOM の read-only host preflight、未配布 candidate の cold-start shell smoke は pass。candidate の ready-state live interaction と Tampermonkey 配布版 smoke、実 write は未確認。
- 採用方向: 既存カレンダーを左、`今日の判断` rail を右、選択詳細を下へ置く option 2。

## Visual Evidence

### Reference

- `C:\Users\中村圭一\.codex\generated_images\019f6d76-d03c-7e22-8622-63ec3f8da975\exec-2f8e9918-c198-4424-9447-075433ac90b9.png`

### Pre-follow-up Implementation

以下は `RAU-UX-138` の 1 か月 fixture evidence であり、workspace hierarchy と write interaction の確認記録として残す。実画面 host と calendar cue の最終形としては superseded されている。

- desktop ready / 1440 x 1024: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-desktop-1440x1024.png`
- desktop confirmation / 1440 x 1024: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-confirmation-1440x1024.png`
- wide / 1920 x 911: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-wide-1920x911.png`
- mobile / 390 x 844: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-mobile-390x844.png`

### Final Safe-host Implementation

- safe wide / 3 か月 host: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-workspace-wide-safe-02.png`
- safe stacked / 標準親 flex 維持: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-workspace-stacked-safe-02.png`
- safe mobile / 3 か月内部 scroll: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-workspace-mobile-safe-02.png`

## Reference Comparison

reference と safe wide / stacked / mobile screenshot を同じ comparison input で確認した。最終実装は次を満たす。

- calendar / rail / detail の三段階 hierarchy が reference と一致する。
- カレンダーの黒い標準値と青い `団n` を維持し、RAU の判断状態は標準値、青い団体表示、today / selected / focus 表現を占有しない左端 edge cue と screen-reader description で補助する。
- rail は対象月、3つの作業状態、宿泊日 grouping、選択中 task を一続きで読める。
- detail は現在 / 候補 rank、`OH / キャパ`、`個人`、`団体`、根拠、注意、操作を分け、初期画面に final write CTA を出さない。
- 余白、border、selected state、CTA hierarchy は既存 Revenue Assistant の密度から逸脱せず、wide でも間延びしない。
- 390px では calendar、rail、detail の順に積み、document overflow は 0。カレンダー内部だけ横 scroll を許容する。

## Interaction And Accessibility QA

- candidate、対象月、3 state、empty、missing、zero、large count、long room name、HTTP 401 / 403、pending / confirming / success / failure を fixture で確認した。
- empty state は `0 判断可能`、`0 要確認`、`0 保留・直近` とし、非選択の 0 件 state を disabled にする。
- `変更内容を確認` で focus が最終確認 region へ移り、`確認をやめる` で元 button へ戻る。
- 現在 rank と同じ値は `現在・変更なし` と明示し、final button を disabled にする。
- review を 5 秒以上開いても mock submit は 0、cancel 後も 0、fixture の final 明示押下だけで 1 になる。
- confirming / success 後は、無効化された opener ではなく結果 status / detail へ focus を移す。
- booking curve は各 panel 1 回の Tab で入り、矢印、Home、End で点を移動する。個人 / 団体、reference toggle は `aria-pressed` を持ち、再描画後も対象 control または同じ graph point を復元する。
- 2 panel の roving tabindex は互いに独立し、片側の focus 復元で他 panel の Tab stop を失わない。
- browser console の error / warning は 0、Vite error overlay は 0、fixture 全体の意図しない横 overflow は 0。
- 親幅 1500px では wide、1393px と 359px では stacked となり、stacked 時の親は fixture 本来の `display:flex; flex-direction:column` のまま維持された。
- 対象月を 2026-07 から 2026-08 へ変えると cue は 8 月 cell だけへ移り、controlled select の値も 2026-08 になった。
- empty では RAU cue / description / `aria-describedby` token は 0 件になり、native description token は残った。ready 再同期後も標準の黒い値、青い `団2`、native inset box-shadow は維持された。
- screen-reader description は日付 link 外へ置き、link text には日付、標準の黒い値、青い `団n` だけが残る。390px 相当では hidden description の static position による document overflow もなく、document clientWidth / scrollWidth はともに 375px だった。

## Iteration Notes

1. 旧 9 列 list を task rail と選択詳細へ分割した。
2. option 1 の task-first hierarchy を rail へ取り込み、option 2 の calendar mental model を主構造にした。
3. OH、個人、団体を直接取得値で分離し、missing を差し引きで補完しないようにした。
4. rank write を countdown 送信から二段階の明示確認へ変更し、no-op / stale context / duplicate / scope guard を確認直前にも再評価するようにした。
5. mobile stacking、empty count、calendar state cue、focus return、graph の roving tabindex を追加修正した。
6. React 再同期で evidence DOM が不要に置換される条件を除き、必要な再描画時は graph focus を保持した。
7. 実画面観測で、3 か月 calendar の親が toolbar、月別優先取得 controls、旧候補表示、inline status、footer 相当を共有すると判明した。親全体の無条件 grid 化を廃止し、host 構造と実幅が安全な場合だけ 2 列にした。
8. calendar cue の右下 `判` / `要` / `保` pill と `box-shadow` 上書きを廃止し、標準表示と重ならない左端 edge cue へ変更した。
9. 月切替中の非同期結果が旧 calendar へ戻らないよう、DOM generation、host、日付範囲、cell identity の stale guard を追加した。
10. 最終 code review で、preview await 中の月・状態・表示件数変更が旧同期で巻き戻る race を発見した。interaction generation を stale context に追加して修正し、静的再レビューは pass。deferred interleaving を自動再現する integration test は残る検証課題である。
11. candidate cold start では API 完了まで workspace が空だったため、最初の await 前に calendar を塞がない loading shell と live region を追加した。再同期前から有効な list がある場合は loading shell へ戻さない。
12. dev fixture の対象月切替が calendar cue だけへ反映され、rail / detail に旧月候補が残る不整合を修正した。cue の screen-reader description も日付別候補総数と状態別件数を集約し、同日2候補を1件と読まないようにした。production path は target-month-filtered candidates を rail と cue の双方へ渡していることを別 source review で確認した。

## 2026-07-18 Candidate Runtime / Fixture Follow-up

- 利用者が既存 Tampermonkey userscript を手動無効化し、reload 後に旧 RAU root / group badge / workspace が 0 であることを確認してから、未配布 candidate を 1 回だけ注入した。二重 runtime ではない。
- 修正前 candidate は calendar の標準表示と group badge を描画したが、2分30秒超と `/api/v4/booking_curve` 200件超の read-only 取得後も workspace ready state に到達しなかった。画面を空のままにする問題を cold-start defect として扱った。
- 修正版 candidate は 626ms で loading workspace を描画した。workspace / rail / detail / React island は各 1、3 か月 calendar は維持、layout は live 幅で `wide`、calendar / rail / detail の sibling 順は正しく、work-state / target-month / task はデータ準備前に出さない。標準 segmented control は 1、横 overflow、framework overlay、console warning / error は 0 だった。
- final candidate artifact は 630,066 bytes、正規 build との差 10 bytes、metadata mismatch 0、SHA-256 `935C88A14A0FBD82A04636B8966E74C6E9BEAD5C79E9A99ECA4765E9257B5109`。`npm run check`、fixture / candidate build、fixture marker、distribution / booking-curve smoke fixture、build compare は pass。React Doctor は exit 0、51 warnings で、今回差分の blocking finding はない。
- candidate live smoke 中に write 操作は行わず、監視対象 write API POST は 0 だった。実施設値、価格・在庫、request / response body、raw trace、screenshot は保存していない。
- live page は cold-cache request 継続後に DOM read へ応答しなくなった。candidate を除去する reload は開始したが、post-reload root 0 の DOM verification は完了していない。candidate は一時注入で永続化していない。利用者は検証後に Tampermonkey userscript を再有効化したと確認済みである。
- synthetic fixture では対象月を 2026-08 へ変更すると rail / detail の宿泊日と calendar cue がすべて 2026-08 へ同期した。`判断可能` から `要確認` への切替、2件の task、選択詳細、Analyze 導線を確認し、mock write count は 0 のままだった。
- `OH 0 / キャパ 18`、`個人 0`、`団体 0` と、`OH 未取得 / キャパ 未取得`、`個人 未取得`、`団体 未取得` を別状態で確認した。対象月 / work-state 切替前後で標準日付、黒い室数、青い `団n`、native highlight の text / color / size / box-shadow は不変で、document overflow と console warning / error は 0 だった。

## Remaining Live Gate

- Tampermonkey userscript は利用者が再有効化済みである。通常 runtime の DOM 再読取は行っていないため、次の live gate で version / root を改めて確認する。拡張 UI は自動操作しない。
- `RAU-UX-143` で first actionable candidate までの cold-start latency と段階表示を設計・実装した後、単一 runtime の未配布 candidate または更新済み Tampermonkey 版で ready-state interaction、wide / stacked 切替、calendar edge cue、2-panel booking curve、長い実 roomGroup 名、標準 UI 非干渉を確認する。
- live ready-state smoke では `/api/v1/lincoln/suggest` を含む監視対象 write API POST 0 件のまま task selection、対象月、work-state、Analyze、review open / cancel まで確認する。
- 実 write、Tampermonkey 更新、GitHub Pages 公開はこの QA に含めない。
