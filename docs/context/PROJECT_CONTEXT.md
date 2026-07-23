# PROJECT_CONTEXT

最終更新: 2026-07-23

## Role

このファイルは、revenue-assistant-userscript (RAU) の optional upper premise layer である。

RAU は AGENTS-first, not AGENTS-only で運用する。毎回の作業入口、source map、安全境界、dist / API / write 境界、最小 verify、Git default は root `AGENTS.md` を正とする。このファイルは、目的、背景意図、profile、非目的、安全境界の上位前提を固定する。

## Conditional Read Block

`AGENTS.md` は毎回読む。このファイルは、次のいずれかに触れるときだけ読む。

- RAU の目的、profile、非目的、背景意図を判断する。
- API、write、distribution、Tampermonkey、non-public data boundary を判断する。
- docs governance、source-of-truth、handoff、multi-step planning を判断する。
- `INTENT.md`、`DECISIONS.md`、`STATUS.md`、`tasks_backlog.md` の役割変更を判断する。

通常の小さな実装、局所 bugfix、既存仕様に沿う文言修正では、全文常時読込を前提にしない。

## Profile

RAU は Profile C とする。

Classic / Next の並行境界、userscript distribution、non-public API / write boundary、Revenue Assistant 上の業務判断を扱うため、誤った再開や公開判断の影響が大きい。ただし Profile C でもこのファイルは optional upper premise layer であり、独立サービス、PMS / DWH、本番自動化、外部公開 API 基盤を RAU の責務にはしない。

## Purpose

RAU の目的は、Revenue Assistant 上で RM のレート調整判断を軽くする Tampermonkey userscript 基盤を作ることである。

ユーザーが画面上で見るべき rooms-only の基準、rank direction、reference curve、competitor snapshot、work queue を、Revenue Assistant の操作文脈から離れずに確認できるようにする。

## Background Intent

- rooms-only を、ノイズの少ない基準線として扱う。
- rank direction を、手元の確認優先度と違和感検出に使う。
- reference curve を、過去実績や周辺基準との比較補助として使う。
- competitor snapshot を、判断材料のひとつとして軽量に提示する。
- work queue を、どこから確認すべきかの作業順整理に使う。
- これらは、レート担当者の最終判断を置き換えるものではなく、画面内での確認負荷を下げる補助である。

## Non-goals

RAU は次を目的にしない。

- 独立 RMS の構築
- PMS / DWH の構築または置き換え
- 推奨レート金額の提示
- レートの自動反映
- レートの一括反映
- credential、token、Cookie、session の保存
- raw trace、HAR、request / response body、価格、在庫、予約、顧客情報など非公開データの保存
- OTA、競合サイト、第三者サイトの hidden API 収集

## Safety Boundary

RAU の安全な中心線は、契約アカウント、自施設、自分の権限内の read-only 補助である。

- Green: 自分の契約アカウント、自施設、自分の権限内の read-only API を、画面補助または分析補助として、人間の画面操作に近い頻度で使う。外部送信しない。raw trace、HAR、credential、個人情報、顧客情報、予約情報、価格や在庫の非公開データを保存・commit しない。
- Yellow: 新規または未調査の未文書 API、response body 保存、background prefetch、価格・在庫・予約・顧客情報、標準画面より呼び出し回数が増える処理。実装前に、利用目的、保存範囲、削除方針、負荷、権限確認を spec、DECISIONS、または task docs に残す。
- Red: 認証回避、rate limit 回避、bot 検知回避、他アカウント、他施設、非表示データへのアクセス、write 系 API の自動実行、公式 API / partner API / 明示許可のない OTA・第三者サイト hidden API。実装しない。

write を扱う場合は、明示操作、直前再確認、取消可能性、guard、失敗時の非反映を仕様で先に固定する。現行 RAU は推奨レート金額、自動反映、一括反映を非目的とする。

## Source-of-truth Roles

- `AGENTS.md`: 毎回の作業入口、source map、常設安全境界、verify / Git default
- `docs/context/PROJECT_CONTEXT.md`: RAU の profile、purpose、background intent、non-goals、upper safety premise
- `docs/spec_*.md`: 外部挙動、受け入れ条件、distribution / write boundary
- `docs/context/INTENT.md`: 判断原則、比較軸
- `docs/context/DECISIONS.md`: durable decision と判断理由
- `docs/context/STATUS.md`: 現在地、re-entry、直近 verify 状態
- `docs/tasks_backlog.md`: task の棚卸し、優先順、triage
- `README.md`: setup、build、verify、distribution 手順
- `docs/context/PRODUCT_DESIGN_AUDIT.md`: UI / UX audit artifact。正本更新は spec、STATUS、backlog 側で行う

## Not For This File

このファイルには次を置かない。

- 進捗、current task、Next Re-entry
- task queue、Now / Next / Later triage
- verify log、command output
- 単発 decision、implementation note
- release note
- raw trace、HAR、credential、個人情報、顧客情報、予約情報、価格や在庫の非公開データ

## Update Trigger

このファイルを更新するのは、RAU の目的、profile、非目的、背景意図、安全境界、source-of-truth role が変わるときに限る。

進捗は `STATUS.md`、判断理由は `DECISIONS.md`、実行順は `tasks_backlog.md`、外部挙動は `docs/spec_*.md` に残す。
