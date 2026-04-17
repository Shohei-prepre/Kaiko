# KAIKO　03. データベース設計

ver 1.7　|　2026年4月

> **変更点（v1.6 → v1.7）**: `horse_ratings` テーブルを追加。全馬横断の最小二乗グローバルレーティングを導入。全ページの能力指標を統一。

---

## 1. テーブル一覧

| テーブル名 | 用途・フェーズ |
| --- | --- |
| races | レースマスタ。レース全体の構造化データ＋LLM生成のレース全体評価 |
| horses | 馬マスタ。馬名・生年・調教師など基本情報 |
| horse_performances | 馬ごとの出走成績＋LLM生成の馬個別評価。race_idでracesと結合して使う |
| user_reviews | ユーザー入力の回顧（将来実装・現フェーズは対象外） |
| odds_snapshots | オッズ時系列（将来実装・現フェーズは対象外） |

> ※ races と horse_performances は race_id をキーに JOIN して使う。

---

## 2. races（レースマスタ）

| カラム名 | 型 | 属性 | 内容・備考 |
| --- | --- | --- | --- |
| race_number | integer | JRA | レース番号 例: 11（11R）※v1.4で追加 |
| kai_nichi | text | JRA | 開催回次 例: 2回中山8日 ※v1.4で追加 |
| race_id | text | PK | JRA形式 例: 2024050501010811 |
| race_name | text | JRA | レース名 |
| race_date | date | JRA | 開催日 |
| track | text | JRA | 競馬場名（例: 東京・中山・阪神） |
| distance | integer | JRA | 距離（m） |
| surface | text | JRA | 芝 / ダート |
| grade | text | JRA | G1 / G2 / G3 / OP / 1勝C など |
| track_condition | text | JRA | 馬場状態　良 / 稍重 / 重 / 不良 |
| lap_times | text | JRA | ラップタイム（カンマ区切り） |
| pace | text | JRA | スロー / ミドル / ハイ |
| track_bias_level | text | LLM | null / small / medium / large |
| track_bias_value | numeric | LLM | 馬身換算値。不明は null |
| track_bias_summary | text | LLM | トラックバイアスの要約 |
| course_aptitude_level | text | LLM | null / small / medium / large |
| course_aptitude_value | numeric | LLM | 馬身換算値。不明は null |
| course_aptitude_summary | text | LLM | コース適性傾向の要約 |
| pace_level | text | LLM | null / small / medium / large |
| pace_value | numeric | LLM | 馬身換算値。不明は null |
| pace_summary | text | LLM | 展開・ペースの要約 |
| sources | text[] | META | 情報源 |
| confidence | text | META | high / medium / low |
| created_at | timestamptz | META | 作成日時 |

---

## 3. horses（馬マスタ）

| カラム名 | 型 | 属性 | 内容・備考 |
| --- | --- | --- | --- |
| horse_id | bigint | PK | 自動採番 |
| name | text | JRA | 馬名 |
| born_year | integer | JRA | 生年 |
| trainer | text | JRA | 調教師名 |
| created_at | timestamptz | META | 作成日時 |

---

## 4. horse_performances（馬ごとの出走成績・個別評価）

1レース × 1頭 = 1レコード。全出走馬が対象。

| カラム名 | 型 | 属性 | 内容・備考 |
| --- | --- | --- | --- |
| id | bigint | PK | 自動採番 |
| race_id | text | FK | races.race_id と紐づく |
| horse_id | bigint | FK | horses.horse_id と紐づく |
| finish_order | integer | JRA | 着順 |
| margin | text | JRA | 1つ前の着順の馬との馬身差。表示時に累積計算して使う |
| weight_carried | numeric | JRA | 斤量（kg） |
| horse_weight | text | JRA | 馬体重（例: 480(+2)） |
| position_order | text | JRA | 通過順位 例: 3-3-4-2 |
| **frame_number** | integer | JRA | 枠番（1〜8）※v1.5で追加 |
| **horse_number** | integer | JRA | 馬番（1〜18）※v1.5で追加 |
| trouble_level | text | LLM | 進路・不利　null / small / medium / large |
| trouble_value | numeric | LLM | 馬身換算値。不明は null |
| trouble_summary | text | LLM | 進路・不利の要約 |
| temperament_level | text | LLM | 折り合い　null / small / medium / large |
| temperament_value | numeric | LLM | 馬身換算値。不明は null |
| temperament_summary | text | LLM | 折り合いの状況要約 |
| weight_effect_level | text | LLM | 斤量影響　null / small / medium / large |
| weight_effect_value | numeric | LLM | 馬身換算値。不明は null |
| weight_effect_summary | text | LLM | 斤量の影響要約 |
| track_condition_level | text | LLM | 馬場適性（この馬個別）null / small / medium / large |
| track_condition_value | numeric | LLM | 馬身換算値。不明は null |
| track_condition_summary | text | LLM | 馬場適性の要約 |
| pace_effect_level | text | LLM | 展開影響（この馬個別）null / small / medium / large |
| pace_effect_value | numeric | LLM | 馬身換算値。不明は null |
| pace_effect_summary | text | LLM | 展開影響の要約 |
| **eval_tag** | text | LLM | 評価タグ。above / fair / below / disregard　※v1.5で追加 |
| sources | text[] | META | このレコードの情報源 |
| confidence | text | META | high / medium / low |
| review_flag | boolean | META | 要レビューフラグ |
| processed | boolean | META | AI処理済みフラグ（二重処理防止） |
| created_at | timestamptz | META | 作成日時 |

> ※ margin の管理方針：DBには「1つ前の着順の馬との差」を保存する。表示時・比較時は以下のSQLで1着との累積差に変換する。

```sql
SELECT finish_order, horse_id, margin,
  SUM(margin::numeric) OVER (ORDER BY finish_order) AS margin_from_first
FROM horse_performances WHERE race_id = '202607010201'
ORDER BY finish_order;
```

### 4-1. フロント計算値（DB保存なし）

以下の3値はフロントエンドで計算する。DBには保存しない。

| 計算値（DB保存なし） | 算出式・用途 |
| --- | --- |
| aptitude_value | track_condition_value + pace_effect_value　→ 適性スコア |
| loss_value | trouble_value + temperament_value + weight_effect_value　→ ロススコア |
| ability_value | aptitude_value + loss_value　→ 能力評価スコア。記号（◎○△×）変換に使用 |

### 4-2. eval_tag の判定基準

LLMへのインプット：各 _value（5項目）・各 _summary（5項目）・回顧テキスト全体。disregard を最優先で判定し、該当しない場合に数値基準で分類する。

| タグ値 | 判定基準 |
| --- | --- |
| **disregard** | 最優先で判定。落馬・競走中止・大きな不利・輸送失敗など結果自体を参考にできないケース。_summaryと回顧テキストから判断 |
| **below** | 合算補正値（aptitude + loss）が +1.5馬身以上。実力より低い結果。次走買い候補 |
| **above** | 合算補正値が −1.5馬身以下。条件に恵まれた結果。額面通りに取れない |
| **fair** | 上記以外（±1.5馬身以内）。条件とロスが概ね相殺 |

### 4-3. テーブル制約

| 制約名 | 内容 |
| --- | --- |
| **unique_race_horse** | UNIQUE (race_id, horse_id)。複数ソースのupsertを可能にするため v1.6で追加 |

> ※ 複数ソースのupsertを可能にするため追加。SQLエディタで以下を実行済み。

```sql
ALTER TABLE horse_performances
ADD CONSTRAINT unique_race_horse UNIQUE (race_id, horse_id);
```

---

## 5. horse_ratings（グローバルレーティング）

> **v1.7 で追加。** `pipeline/compute_ratings.py` がデータ投入後にバッチ計算し upsert する。フロントエンドは読み取り専用。

全馬を横断した最小二乗グローバルレーティング。レースレベルの差を自動吸収し、注目馬・レース詳細・比較の全ページで統一指標として使用する。

### 算出ロジック概要

- 各レースの全出走馬ペア間で `adjustedDiff = 着差差 + 補正差 + track_bias` を計算
- 全ペアをまとめて `minimize Σ w × (r_A - r_B - adjustedDiff)²` を最小化
- 重み `w = time_weight × llm_weight`（時間減衰 0.75/年、LLM補正なし = 0.5）
- アンカー：全対象馬の平均 = 0

| カラム名 | 型 | 内容・備考 |
| --- | --- | --- |
| horse_id | bigint | PK。horses.horse_id と紐づく |
| rating | float8 | 能力値（高いほど強い、全馬平均 = 0） |
| rating_error | float8 | 残差 RMS（信頼指標。小さいほど安定） |
| races_analyzed | int | 計算に使った走数（2走未満は非表示） |
| connected_horses | int | グラフで繋がった他馬の数 |
| computed_at | timestamptz | 最終計算日時 |

```sql
create table horse_ratings (
  horse_id         bigint primary key references horses(horse_id),
  rating           float8  not null,
  rating_error     float8,
  races_analyzed   int     not null,
  connected_horses int,
  computed_at      timestamptz not null default now()
);

-- 全ユーザーが参照可能、書き込みは管理者のみ
alter table horse_ratings enable row level security;
create policy "public read" on horse_ratings for select using (true);
```

### 4-1 の更新（フロント計算値）

| 計算値 | 変更後の用途 |
| --- | --- |
| aptitude_value / loss_value / ability_value | `horse_ratings.rating` が存在する場合は補助表示のみ。rating がない馬のフォールバックとして維持 |

---

## 6. 将来実装テーブル（現フェーズは対象外）

### user_reviews

| カラム名 | 型 | 属性 | 内容・備考 |
| --- | --- | --- | --- |
| id | bigint | PK | 自動採番 |
| user_id | uuid | FK | ユーザーID（Supabase Auth連携） |
| race_id | text | FK | races.race_id |
| horse_id | bigint | FK | horses.horse_id |
| comment | text | | ユーザーのコメント |
| rating | integer | | 評価（1〜5） |
| created_at | timestamptz | META | 作成日時 |

### odds_snapshots

| カラム名 | 型 | 属性 | 内容・備考 |
| --- | --- | --- | --- |
| id | bigint | PK | 自動採番 |
| race_id | text | FK | races.race_id |
| horse_name | text | | 馬名 |
| odds | numeric | | オッズ値 |
| snapshot_at | timestamptz | | 取得日時 |

---

## 6. セキュリティ方針（RLS）

| 対象テーブル | ポリシー |
| --- | --- |
| races / horses / horse_performances | 全ユーザーが参照可能。書き込みは管理者（バッチ処理）のみ |
| user_reviews | 自分の回顧のみ編集可（将来実装） |
| odds_snapshots | 全ユーザーが参照可能（将来実装） |

> ※ RLSポリシーはDB層で完結させ、API側での制御に依存しない設計とする。

---

## 7. 属性の凡例

| 属性 | 意味 |
| --- | --- |
| PK | 主キー（このテーブルの一意なID） |
| FK | 外部キー（他テーブルのIDと紐づく） |
| JRA | netkeiba / JRA-VANから取得する確定値 |
| LLM | LLMが回顧テキストから生成する評価値 |
| META | システムが管理する運用情報 |

---

以上　— 03. データベース設計　v1.7
