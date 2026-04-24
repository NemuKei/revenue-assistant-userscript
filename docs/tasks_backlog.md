# tasks_backlog

## Now

### RAU-AF-01 Analyze booking curve reference curve のデータ取得可否を確認する

- 目的:
  - BCL の `直近型カーブ` と `季節型カーブ` に相当する rooms-only reference curve を、Revenue Assistant の booking curve 系データだけで作れるか確認する。
- スコープ:
  - `/api/v4/booking_curve` を、比較対象 `stay_date` と `rm_room_group_id` の組み合わせで取得できるか確認する。
  - ホテル全体と室タイプ別の response 形を比較する。
  - `batch-date`、`all.this_year_room_sum`、`transient.this_year_room_sum`、`group.this_year_room_sum` の有無を確認する。
- 非目標:
  - UI 実装。
  - 人数 forecast。
  - PMS データ、BCL Python 実装、RAR 同期、外部 DB の導入。
  - 自動レート変更。
- 受け入れ条件:
  - ホテル全体と室タイプ別について、比較対象日付の booking curve を取得できるか説明できる。
  - 取得できる場合は、reference curve の材料に使える rooms 系列と使えない系列を説明できる。
  - 取得できない場合は、代替候補とその制約を `STATUS` または `DECISIONS` に残せる。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
  - `open-spec-questions`:
    - 任意の比較対象 `stay_date` を API で安定取得できるか
    - `rm_room_group_id` 指定時もホテル全体と同じ系列定義で扱えるか
    - request 数が増える場合、どこまで事前取得してよいか

### RAU-AF-02 直近型カーブ / 季節型カーブの first wave 定義を固定する

- 目的:
  - Analyze 日付ページで表示する `直近型カーブ` と `季節型カーブ` の初期定義を、レート調整判断に使える粒度で固定する。
- スコープ:
  - `直近型カーブ` の比較対象日付選定を決める。
  - `季節型カーブ` の比較対象日付選定を決める。
  - ホテル全体 block と室タイプ別 card の両方で同じ定義を使えるか判断する。
  - 表示は rooms-only とし、既存の LT bucket 軸へ揃える。
- 非目標:
  - 予測精度評価の本格実装。
  - 学習済みパラメータ。
  - 宿泊売上 forecast。
  - 人数 forecast。
- 受け入れ条件:
  - `直近型カーブ` と `季節型カーブ` について、入力データ、比較対象日付、出力系列、fallback 条件を説明できる。
  - 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示を保持したまま重ねる UI 方針を説明できる。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
  - `open-spec-questions`:
    - `直近型カーブ` は直近何日または何件を使うか
    - `季節型カーブ` は前年同日、前年同曜日、同月同曜日のどれから始めるか
    - reference curve は常時表示か toggle 表示か

## Next

### RAU-AF-03 Analyze booking curve reference curve の UI first wave を実装する

- 目的:
  - ホテル全体 block と室タイプ別 card に、rooms-only reference curve を既存 booking curve と同じ LT 軸で重ねる。
- スコープ:
  - `RAU-AF-02` で固定した定義を使う。
  - 既存 SVG chart、tooltip、legend、capacity line、rank marker を壊さずに系列を追加する。
  - 表示過密を避けるための toggle または legend 操作を必要に応じて追加する。
- 非目標:
  - 月次実績画面の chart 更新。
  - `団体` 系列の標準表示化。
  - 競合価格表。
- 受け入れ条件:
  - Analyze 日付ページで、ホテル全体と室タイプ別 card に reference curve が表示できる。
  - 既存の `全体 / 個人` 系列、rank marker、tooltip、`ACT` 空表示、current-ui supplement portal が維持される。
  - `npm run typecheck`、`npm run lint`、`npm run build` が通る。
  - Tampermonkey 再読込後に Analyze 日付ページで GUI 確認できる。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: during-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`
  - `open-spec-questions`: 実装中に UI 表示密度または request 数が許容できない場合、toggle と cache 方針を再判断する

## After Next

### RAU-MP-01 月次実績画面の LT 基準 custom booking curve を再開する

- 目的:
  - 追加済み route-scoped slice、IndexedDB write-only snapshot、2 カラム multi-month chart を、どこまで final graph へ寄せるか判断する。
- 保留理由:
  - 現時点では Analyze 日別の rooms-only reference curve のほうが、部屋タイプ別レート調整の判断コストを直接下げるため優先度が高い。
- metadata:
  - `spec-impact`: yes
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_000_overview.md`

### RAU-UX-01 competitor prices と団体系列の導入要否を再判断する

- 目的:
  - Analyze reference curve 実装後の使用感を見て、`/api/v5/competitor_prices` と `団体` 系列を標準 UI に含めるか判断する。
- metadata:
  - `spec-impact`: unknown
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`

## Remaining Task Triage

Now:

- `RAU-AF-01` Analyze booking curve reference curve のデータ取得可否を確認する
- `RAU-AF-02` 直近型カーブ / 季節型カーブの first wave 定義を固定する

Next:

- `RAU-AF-03` Analyze booking curve reference curve の UI first wave を実装する

After Next:

- `RAU-MP-01` 月次実績画面の LT 基準 custom booking curve を再開する
- `RAU-UX-01` competitor prices と団体系列の導入要否を再判断する

統合判断:

- 旧 backlog の `同月同曜日 baseline`、`baseline scope`、`IndexedDB read path` は、`RAU-AF-01` と `RAU-AF-02` に統合する。
- 旧 backlog の月次実績画面関連 task は、`RAU-MP-01` へ束ねて優先度を下げる。
- 旧 backlog の `団体` 系列、rank marker polish、competitor prices は、Analyze reference curve 実装後の使用感で再判断するため `RAU-UX-01` へ束ねる。
