# Design QA: RAU-UX-138 Top Decision Workspace

最終確認日: 2026-07-17

## 対象と判定

- 対象: Revenue Assistant top の既存カレンダー、`今日の判断` rail、選択候補の詳細、rank 変更の最終確認。
- 判定: local synthetic fixture では pass。live Revenue Assistant / Tampermonkey 配布版と実 write は未確認。
- 採用方向: 既存カレンダーを左、`今日の判断` rail を右、選択詳細を下へ置く option 2。

## Visual Evidence

### Reference

- `C:\Users\中村圭一\.codex\generated_images\019f6d76-d03c-7e22-8622-63ec3f8da975\exec-2f8e9918-c198-4424-9447-075433ac90b9.png`

### Implementation

- desktop ready / 1440 x 1024: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-desktop-1440x1024.png`
- desktop confirmation / 1440 x 1024: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-confirmation-1440x1024.png`
- wide / 1920 x 911: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-wide-1920x911.png`
- mobile / 390 x 844: `C:\Users\中村圭一\.codex\visualizations\2026\07\17\019f6d76-d03c-7e22-8622-63ec3f8da975\rau-option2-mobile-390x844.png`

## Reference Comparison

reference と desktop ready screenshot を同じ comparison input で確認した。最終実装は次を満たす。

- calendar / rail / detail の三段階 hierarchy が reference と一致する。
- カレンダーの黒い標準値と青い `団n` を維持し、RAU の判断状態は色だけに依存しない短い `判` / `要` / `保` cue として追加する。
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

## Iteration Notes

1. 旧 9 列 list を task rail と選択詳細へ分割した。
2. option 1 の task-first hierarchy を rail へ取り込み、option 2 の calendar mental model を主構造にした。
3. OH、個人、団体を直接取得値で分離し、missing を差し引きで補完しないようにした。
4. rank write を countdown 送信から二段階の明示確認へ変更し、no-op / stale context / duplicate / scope guard を確認直前にも再評価するようにした。
5. mobile stacking、empty count、calendar state cue、focus return、graph の roving tabindex を追加修正した。
6. React 再同期で evidence DOM が不要に置換される条件を除き、必要な再描画時は graph focus を保持した。

## Remaining Live Gate

- Revenue Assistant 実 DOM で calendar state cue、2-panel booking curve、長い実 roomGroup 名、標準 UI 非干渉を確認する。
- live smoke では `/api/v1/lincoln/suggest` を含む監視対象 write API POST 0 件のまま review open / cancel まで確認する。
- 実 write、Tampermonkey 更新、GitHub Pages 公開はこの QA に含めない。
