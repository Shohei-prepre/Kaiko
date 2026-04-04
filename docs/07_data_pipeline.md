# KAIKO　07. データパイプライン設計

ver 1.3　|　2026年3月

> **変更点（v1.2 → v1.3）**: Step 2b として eval_tag 生成ステップを追加。fetch_race.py に枠番・馬番の取得を追加。

---

## 1. パイプライン概要

回顧情報を収集・構造化してDBに保存するまでの流れ。Phase 1はすべてローカルMacで実行する。

| Step | 処理 | 実行 | 担当 | 状態 | 備考 |
| --- | --- | --- | --- | --- | --- |
| 1a | レース結果取得（netkeiba） | 手動 or 自動 | Mac（fetch_race.py） | ✅ 完成 | |
| 1b | 回顧テキスト収集（YouTube字幕） | 手動（ローカルMac必須） | Mac（fetch_transcript.py） | ✅ 完成 | |
| 2 | LLM構造化変換（JSON生成） | 自動（pipeline.py） | Mac → Claude API | ✅ 完成 | |
| **2b** | eval_tag 生成（LLM） | 自動（pipeline.py内） | Mac → Claude API | ⬜ 未実装 | ※v1.3で追加 |
| 3 | 整合性チェック | 自動（pipeline.py内） | Mac | ⬜ 未実装 | |
| 4 | 管理画面レビュー | 手動（フラグ立ち時） | 開発者 | ⬜ 未実装 | |
| 5 | DB保存（確定） | 自動 | Supabase（insert.py） | ✅ 完成 | |

---

## 2. ローカルスクリプト一覧（~/kaiko_test/）

| ファイル名 | 役割 | 状態 |
| --- | --- | --- |
| fetch_race.py | netkeibaからレース結果をスクレイピング | ✅ 完成 |
| fetch_transcript.py | YouTube字幕を取得してテキスト保存（ローカルMac実行必須） | ✅ 完成 |
| pipeline.py | fetch_race + fetch_transcript → Claude API → DB用JSON出力（eval_tag生成を含む） | ✅ 完成（eval_tag未実装） |
| insert.py | output_\<race_id\>.json を Supabase に投入 | ✅ 完成 |
| kaiko_create_tables.sql | horses / races / horse_performances テーブル作成SQL（実行済み） | ✅ 完成 |
| .env | ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY を管理 | ✅ 設定済み |
| output_\<race_id\>.json | pipeline.py の出力。races / horse_performances 形式 | ✅ 生成確認済み |

---

## 3. Step 1a　レース結果取得（fetch_race.py）

| 項目 | 内容 |
| --- | --- |
| スクリプト | fetch_race.py |
| データソース | netkeiba（race.netkeiba.com/race/result.html） |
| 実行方法 | `python3 fetch_race.py <race_id>` |
| race_id形式 | 202607010201（年・場コード・回・日・R） |
| 動作環境 | ローカルMac（クラウド実行は要検討） |
| **取得項目（v1.3追加）** | 枠番（frame_number）・馬番（horse_number）を追加取得 |

---

## 4. Step 1b　回顧テキスト収集（fetch_transcript.py）

| チャンネル | 特徴 | カバレッジ |
| --- | --- | --- |
| エキスポ競馬 | 中央競馬の全レース回顧をライブ配信 | 全レース |
| アラシ | 元馬術選手。映像視点で馬の動き・不利を詳細分析 | 重賞中心 |
| 邪推師GANMA「ぼやき回顧」 | 全出走馬コメント付き。ブログにテキスト版も同時掲載 | 重賞中心 |

---

## 5. Step 2　LLM構造化変換（pipeline.py）

| # | 項目名 | 種別 | 換算単位 |
| --- | --- | --- | --- |
| 1 | トラックバイアス | レース全体 | 馬身 |
| 2 | コース適性 | レース全体 | 馬身 |
| 3 | 展開・ペース | レース全体 | 馬身 |
| 4 | 馬場状態 | レース全体 | 馬身 |
| 5 | 進路・不利 | 馬個別 | 馬身 |
| 6 | 折り合い | 馬個別 | 馬身 |
| 7 | 斤量 | 馬個別 | 馬身 |
| 8 | confidence | メタ情報 | high / medium / low |
| 9 | flag | メタ情報 | conflict / single_source / null |

---

## 6. Step 2b　eval_tag 生成（pipeline.py内・新設）

Step 2のLLM構造化変換に続いて、同一pipeline.py内でeval_tagを生成する。

| 項目 | 内容 |
| --- | --- |
| **処理タイミング** | Step 2（LLM構造化変換）と同一APIコール内、または直後の別コールで実行 |
| **インプット** | 各 _value（5項目：trouble / temperament / weight_effect / track_condition / pace_effect）、各 _summary（同5項目）、回顧テキスト全体 |
| **アウトプット** | eval_tag：above / fair / below / disregard のいずれか1値 |
| **判定順序** | ① disregard を最優先判定（summaryと回顧テキストから落馬・中止・大きな不利を検出）② 合算補正値（aptitude + loss）が +1.5馬身以上 → below ③ 合算補正値が −1.5馬身以下 → above ④ 上記以外 → fair |
| **合算補正値の定義** | aptitude = track_condition_value + pace_effect_value / loss = trouble_value + temperament_value + weight_effect_value / aptitude + loss の合計値で判定 |
| **使用モデル** | Claude Haiku 4.5（他のLLM処理と統一） |

---

## 7. Step 5　DB保存（insert.py）

| 項目 | 内容 |
| --- | --- |
| スクリプト | insert.py |
| 実行方法 | `python3 insert.py output_<race_id>.json` |
| 処理内容 | ① horses upsert（馬名→horse_id取得/新規登録）② races upsert ③ horse_performances insert（frame_number / horse_number / eval_tag を含む） |
| 使用ライブラリ | supabase / python-dotenv |
| 認証 | SUPABASE_SERVICE_KEY（service_role）を使用。RLSをバイパスして書き込み可能 |

---

## 8. Step 3〜4　整合性チェック・レビュー（未実装）

| Step | 内容 | 状態 |
| --- | --- | --- |
| Step 3：整合性チェック | adjusted_margin = 実着差 + Σ（7項目の馬身換算値）で検証。閾値超えでreview_flagを立てる | ⬜ 未実装 |
| Step 4：管理画面レビュー | review_flag=trueのレコードを手動確認・修正 | ⬜ 未実装 |

---

## 9. 運用ルール（Phase 1 現状）

| タイミング | 処理内容 | 担当 |
| --- | --- | --- |
| レース後（手動） | fetch_race.py でレース結果取得（枠番・馬番含む） | 開発者（Mac） |
| レース後（手動） | fetch_transcript.py で回顧字幕取得 | 開発者（Mac） |
| 上記後（手動） | pipeline.py で JSON生成（eval_tag生成を含む） | 開発者（Mac） |
| 上記後（手動） | insert.py で Supabase に投入 | 開発者（Mac） |
| フラグ発生時（手動） | 管理画面で確認・修正・再確定（未実装） | 開発者 |
| 生テキスト保存 | transcript_\<video_id\>.txt を原本として保持 | 自動（ローカル） |

---

以上　— 07. データパイプライン設計　v1.3
