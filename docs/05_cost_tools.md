# KAIKO　05. コスト・ツール役割分担

ver 1.1　|　2026年3月

---

## 1. 月間コスト概算

| サービス | 用途・月額 |
| --- | --- |
| Claude Pro | 設計・壁打ち　約¥3,000 |
| Cursor Pro | コード開発　約¥3,000 |
| Supabase | DB・認証　無料〜約¥3,500 |
| Vercel | ホスティング　無料 |
| GitHub Actions | バッチ処理　無料 |
| Grok API（X Search） | X投稿取得　月$1〜2 |
| Claude Haiku 4.5 | 字幕整形・回顧AI処理　〜$2〜4/月（1レース約$0.01） |
| 合計（スタート時） | 約¥6,000〜¥10,000/月 |

> ※ Gemini 2.0 Flash は Phase 1では使用しない。Claude Haiku 4.5 に統一。
>
> ※ 1レースあたりのAPIコスト目安：約$0.01（約1.5円）
> - 重賞のみ（月20レース）：約$0.20
> - 全レース（月240レース）：約$2.40

---

## 2. ツール役割分担

| ツール | 役割 |
| --- | --- |
| Claude（claude.ai） | 設計の壁打ち・相談・ドキュメント作成 |
| Cursor | Webアプリのコードを書く（メイン開発環境） |
| Claude Code | Claude関連の理解・実験・ターミナル操作 |
| Genspark / Speakly | リサーチ・音声入力 |
| GitHub | コード管理・バッチ処理（Actions） |
| Notion | 仕様書・タスク管理（フェーズ完了時に転記） |

---

## 3. ローカル開発スクリプト（~/kaiko_test/）

| ファイル | 用途 |
| --- | --- |
| fetch_race.py | netkeibaからレース結果をスクレイピング |
| fetch_transcript.py | YouTube字幕を取得してテキスト保存（ローカルMac実行必須） |
| pipeline.py | fetch_race + fetch_transcript → Claude API → DB用JSON出力 |
| .env | ANTHROPIC_API_KEY を管理（Gitに含めない） |
| output_\<race_id\>.json | pipeline.py の出力。races / horse_performances 形式 |

---

## 4. ドキュメント管理方針

- Claudeのプロジェクト機能に決定事項まとめを置き、常時コンテキストを共有
- 各設計ドキュメントは章立て単位で個別ファイルで管理
- 大きな変更があったタイミングでバージョンを上げる（v1.0 → v1.1）
- Notionへの転記はフェーズ完了時にまとめて行う

---

以上　— 05. コスト・ツール役割分担　v1.1
