# tasks_backlog

## Now

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

## Next

### RAU-UX-01 competitor prices と団体系列の導入要否を再判断する

- 目的:
  - Analyze reference curve 実装後の使用感を見て、`/api/v5/competitor_prices` と `団体` 系列を標準 UI に含めるか判断する。
- metadata:
  - `spec-impact`: unknown
  - `spec-checkpoint`: before-impl
  - `target-spec`: `docs/spec_001_analyze_expansion.md`

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

## Remaining Task Triage

Now:

- `RAU-AF-03` Analyze booking curve reference curve の UI first wave を実装する

Next:

- `RAU-UX-01` competitor prices と団体系列の導入要否を再判断する

After Next:

- `RAU-MP-01` 月次実績画面の LT 基準 custom booking curve を再開する

統合判断:

- 旧 backlog の `同月同曜日 baseline`、`baseline scope`、`IndexedDB read path` は、`RAU-AF-01` と `RAU-AF-02` で確認と定義固定を行い、UI 実装は `RAU-AF-03` に統合する。
- 旧 backlog の月次実績画面関連 task は、`RAU-MP-01` へ束ねて優先度を下げる。
- 旧 backlog の `団体` 系列、rank marker polish、competitor prices は、Analyze reference curve 実装後の使用感で再判断するため `RAU-UX-01` へ束ねる。
