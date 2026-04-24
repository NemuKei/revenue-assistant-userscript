# INTENT

最終更新: 2026-04-24

## Purpose

この文書は、RAU で複数の仕様判断に繰り返し使う比較軸と優先順位を定義する。
単発の決定は `docs/context/DECISIONS.md`、仕様本文は `docs/spec_*.md`、現在地は `docs/context/STATUS.md` に置く。

## Judgment Principles

- `独立した分析ツールを先に作ること` と `Revenue Assistant の画面上でレート調整判断を軽くすること` が競合する場合は、後者を優先する。
- `人数データを含む本格 forecast` と `Revenue Assistant から取得できる rooms データだけで成立する簡易 forecast` が競合する場合は、当面は後者を優先する。
- `PMS データや DWH データを併用して精度を上げること` と `userscript 単体で実務導線を崩さず段階導入すること` が競合する場合は、当面は後者を優先する。
- `月次実績画面の分析表示を進めること` と `Analyze 日付ページで部屋タイプ別レート調整の判断基準を増やすこと` が競合する場合は、後者を優先する。
- `表示系列を増やすこと` と `既存の全体 / 個人系列、rank marker、tooltip、ACT 空表示を壊さないこと` が競合する場合は、後者を優先する。
- `request 数を増やして比較系列を豊かにすること` と `画面遷移、タブ切替、フォーカス復帰で安定して動くこと` が競合する場合は、後者を優先する。

## Non-Goals

- 当面は、RAU で人数 forecast を成立させることを目標にしない。
- 当面は、RAU から Revenue Assistant のレート変更を自動実行することを目標にしない。
- 当面は、RAU の first wave に PMS データ、DWH データ、BCL Python 実装、RAR 同期を必須化しない。
- 当面は、月次実績画面の custom booking curve を Analyze reference curve より優先しない。

## How To Use

- reference curve、baseline、cache、request 数、表示密度の判断で迷った場合は、この文書の優先順位を先に確認する。
- 判断原則を変える場合だけ、この文書を更新する。
- 単発の採否判断は `docs/context/DECISIONS.md` に記録する。
