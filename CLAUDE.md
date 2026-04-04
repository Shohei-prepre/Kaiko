# KAIKO — Claude Code コンテキスト

競馬回顧情報を収集・構造化してユーザーに届けるWebサービス。
個人開発（AI活用）。2026年3月〜開発中。

---

## 現在地

| フェーズ | 状態 |
| --- | --- |
| Phase 0：環境構築 | ✅ 完了 |
| Phase 1：データパイプライン | ✅ 完了（~/kaiko_test/） |
| Phase 2：フロントエンド実装 | ⬜ 未着手（← 今ここ） |
| Phase 3：自動収集 | ⬜ 未着手 |

---

## 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 15 + TypeScript（App Router） |
| スタイリング | Tailwind CSS + shadcn/ui |
| 状態管理 | Zustand + TanStack Query |
| DB・認証 | Supabase（PostgreSQL + Auth + RLS） |
| ストレージ | Supabase Storage → Cloudflare R2（将来） |
| AI処理 | Claude Haiku 4.5（字幕整形・eval_tag生成） |
| ホスティング | Vercel |
| バッチ処理 | GitHub Actions |

---

## フォルダ構成

```
~/Desktop/kaiko/          ← このリポジトリ（フロントエンド）
├── CLAUDE.md
├── docs/                 ← 設計書（Markdown）
│   ├── 01_service_overview.md
│   ├── 02_tech_stack.md
│   ├── 03_database_design.md    ← v1.6（最新）
│   ├── 04_development_phases.md
│   ├── 05_cost_tools.md
│   ├── 06_monetization.md
│   ├── 07_data_pipeline.md      ← v1.3（最新）
│   └── 08_frontend_design.md    ← v1.3（最新）
├── mockups/              ← デザインモック（HTML）
│   ├── kaiko_racelist_stitch_v2.html       ← レース一覧（確定）
│   ├── kaiko_race_detail_stitch_v1.html    ← レース詳細（確定）
│   └── ability_comparison.html             ← 比較画面（ワイヤー段階）
└── src/                  ← Next.jsアプリ（未作成）

~/kaiko_test/             ← データパイプライン（完成済み・別フォルダ）
├── fetch_race.py         ← netkeibaスクレイピング
├── fetch_transcript.py   ← YouTube字幕取得
├── pipeline.py           ← Claude API → JSON生成
├── insert.py             ← Supabase投入
├── kaiko_create_tables.sql
└── .env                  ← API KEY類（Gitに含めない）
```

---

## DBテーブル構成（Supabase）

### races（レースマスタ）
JRAデータ（race_id, race_name, race_date, track, distance, surface, grade, track_condition, lap_times, pace）とLLM生成データ（track_bias, course_aptitude, pace の各 level/value/summary）を持つ。

### horses（馬マスタ）
horse_id（自動採番）, name, born_year, trainer

### horse_performances（馬×レース）
1レース×1頭=1レコード。JRAデータ（finish_order, margin, weight_carried, horse_weight, position_order, frame_number, horse_number）とLLM生成データ（trouble, temperament, weight_effect, track_condition, pace_effect の各 level/value/summary）と eval_tag を持つ。

**複合ユニーク制約：** `UNIQUE (race_id, horse_id)`（unique_race_horse）

---

## フロントエンドの重要ルール

### ルーティング
| 画面 | パス |
| --- | --- |
| レース一覧 | /races |
| レース詳細 | /races/[id] |
| 馬ページ | /horses/[id] |
| 比較ページ | /compare |

BottomNav は2タブ（レース `/races`・能力比較 `/compare`）のみ。馬ページはBottomNavに出さない。

### フロントで計算する値（DBに保存しない）
```
aptitude_value = track_condition_value + pace_effect_value
loss_value     = trouble_value + temperament_value + weight_effect_value
ability_value  = aptitude_value + loss_value
```

### eval_tag の意味
| タグ | 表示名 | 意味 |
| --- | --- | --- |
| above | 実力以上 | 条件に恵まれた。額面通りに取れない |
| fair | 実力通り | 条件・ロスが概ね相殺 |
| below | 実力以下 | ロスで損。次走買い候補 |
| disregard | 度外視 | 落馬・中止など参考外 |

### 物差し馬ロジック
- 各馬の直近5走を取得
- `eval_tag = disregard` のレースは除外
- 複数対象レースがある場合は補正後能力差の平均値を使用

### カラートークン（Tailwind config）
レース詳細画面とレース一覧画面で設計が異なる。詳細は `docs/08_frontend_design.md` の「2. デザインシステム」を参照。実装時は両画面のトークンをマージした統合configを使うこと。

**レース一覧画面のみ** `borderRadius DEFAULT: 0px`（シャープコーナー）。他画面は `rounded-xl` 等が有効。

---

## Phase 2 実装順序

1. `src/` に Next.js プロジェクト作成（create-next-app）
2. Tailwind config に両画面トークンをマージして設定
3. 共通コンポーネント（BottomNav / Header / カード / バッジ / 評価タグ）
4. レース詳細画面（`/races/[id]`）← `kaiko_race_detail_stitch_v1.html` を正として実装
5. 馬ページ（`/horses/[id]`）
6. 比較画面（`/compare`）← 物差し馬ロジック実装
7. レース一覧（`/races`）← `kaiko_racelist_stitch_v2.html` を正として実装

---

## 設計判断の記録

- **AI統一：** Gemini 2.0 Flash は使わない。Claude Haiku 4.5 に統一。
- **JRA-VAN不使用：** Windows専用のためnetkeibaスクレイピングで代替。
- **Auth固定：** スケール後も Supabase Auth を使い続ける（移行リスク最大のため）。
- **margin の保存：** 1つ前の馬との差をDBに保存し、累積計算はSQL/フロントで行う。
- **fetch_transcript.py はローカルMac必須：** GitHub Actionsでの自動化は要検討。
