# INTENT

最終更新: 2026-06-01

## Purpose

この文書は、RAU で複数の仕様判断に繰り返し使う比較軸と優先順位を定義する。
単発の決定は `docs/context/DECISIONS.md`、仕様本文は `docs/spec_*.md`、現在地は `docs/context/STATUS.md` に置く。

## Judgment Principles

- `独立した分析ツールを先に作ること` と `Revenue Assistant の画面上でレート調整判断を軽くすること` が競合する場合は、後者を優先する。
- `人数データを含む本格 forecast` と `Revenue Assistant から取得できる rooms データだけで成立する簡易 forecast` が競合する場合は、当面は後者を優先する。
- `PMS データや DWH データを併用して精度を上げること` と `userscript 単体で実務導線を崩さず段階導入すること` が競合する場合は、当面は後者を優先する。
- `月次実績画面の分析表示を進めること` と `Analyze 日付ページで部屋タイプ別レート調整の判断基準を増やすこと` が競合する場合は、後者を優先する。
- `Analyze 画面へ遷移して詳細確認する導線を増やすこと` と `トップ画面の料金調整候補だけで一定の調整意思決定を完結できるようにすること` が競合する場合は、後者を優先する。ただし、根拠の確認、取消、cooldown、write safety が不足する場合は、トップ画面での直接操作を先に作らず、確認表示または調査 task として分ける。
- `表示項目、説明文、装飾、操作部品を増やして情報を網羅すること` と `利用者が料金調整判断に必要な情報と次の操作を短時間で理解できる、シンプルで分かりやすい UI (User Interface) / UX (User Experience) にすること` が競合する場合は、後者を優先する。情報量が多いこと自体が判断を遅くする可能性があるため、追加情報は常時表示へ置く前に、利用頻度、判断への必要性、誤読リスクを確認し、機能に対して不要な情報は削る。必要だが常時表示しない情報は、tooltip、popover、preview、詳細表示、または非表示へ分ける。
- `表示系列を増やすこと` と `既存の全体 / 個人系列、rank marker、tooltip、ACT 空表示を壊さないこと` が競合する場合は、後者を優先する。
- `request 数を増やして比較系列を豊かにすること` と `画面遷移、タブ切替、フォーカス復帰で安定して動くこと` が競合する場合は、後者を優先する。
- `Analyze 画面へ最短で直置きすること` と `booking curve core logic を UI、API 取得、storage から分離して再利用可能にすること` が競合する場合は、first wave の進行を大きく遅らせない範囲で後者を優先する。
- `予測モデルを早く表示すること` と `予測評価に使える入力、出力、diagnostics を先に固定すること` が競合する場合は、後者を優先する。
- `推奨レート金額を出すこと` と `Revenue Assistant の販売 rank 操作単位に合う推奨ランク方向を出すこと` が競合する場合は、first wave では後者を優先する。
- `rank 名のパターンから上下関係を推定すること` と `Revenue Assistant の設定画面で保存された rank 並び順を使うこと` が競合する場合は、設定画面の保存済み順序を優先する。rank 名は、数字系、ローマ字または英字系、記号混在系のいずれもあり得て、同じ表記系でも高低が逆になる運用があるため、名前パターンだけでは企業や施設ごとの上下関係を安全に断定しない。
- `曜日別の販売傾向や競合価格内の自社料金位置を使って rank の上下関係を推定すること` と `設定画面の保存済み順序または利用者の manual override で rank order を確定すること` が競合する場合は、後者を優先する。曜日別関係と競合価格内の自社料金位置は、rank order source ではなく priority、confidence、reasonCodes、diagnostics を補助する入力として扱う。
- `Revenue Assistant への自動反映を早く作ること` と `RM が今日確認すべき作業キューを安全に作ること` が競合する場合は、当面は後者を優先する。
- `同じ recommendation を繰り返し表示して見落としを防ぐこと` と `利用者が様子見または対応不要と判断した結果を尊重すること` が競合する場合は、user decision と cooldown を尊重する。

## Non-Goals

- 当面は、RAU で人数 forecast を成立させることを目標にしない。
- 当面は、RAU から Revenue Assistant のレート変更を自動実行することを目標にしない。
- 当面は、RAU の first wave に PMS データ、DWH データ、BCL Python 実装、RAR 同期を必須化しない。
- 当面は、予測モデルの採用、学習済みパラメータの固定、予測評価の合格基準固定を first wave の完了条件にしない。
- 当面は、月次実績画面の custom booking curve を Analyze reference curve より優先しない。
- 当面は、RAU から Revenue Assistant へ選択範囲の rank 変更を一括反映することを first wave の目標にしない。

## How To Use

- reference curve、baseline、core logic、forecast、evaluation、rank recommendation、cache、request 数、表示密度、UI / UX の判断で迷った場合は、この文書の優先順位を先に確認する。
- 判断原則を変える場合だけ、この文書を更新する。
- 単発の採否判断は `docs/context/DECISIONS.md` に記録する。
