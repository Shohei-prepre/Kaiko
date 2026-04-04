# KAIKO　02. 技術スタック・システム構成

ver 1.2　|　2026年3月

---

## 1. 技術スタック

| 役割 | 採用技術 |
| --- | --- |
| フロントエンド | Next.js 15 + TypeScript |
| スタイリング | Tailwind CSS + shadcn/ui |
| 状態管理 | Zustand + TanStack Query |
| データベース | Supabase（PostgreSQL） |
| 認証 | Supabase Auth + RLS |
| ストレージ | Supabase Storage → Cloudflare R2（段階移行） |
| バッチ処理 | GitHub Actions（定期実行・無料枠内） |
| AI処理（字幕整形・構造化） | Claude Haiku 4.5（統一） |
| ホスティング | Vercel |
| 開発エディタ | Cursor |
| 競馬データ取得 | netkeibaスクレイピング（fetch_race.py） |

---

## 2. システム構成レイヤー

| レイヤー | 内容 |
| --- | --- |
| フロントエンド | Next.js / Vercel でホスティング。公開ページ・認証済みページ・API Routesを含む |
| データ層 | Supabase PostgreSQL + RLS。馬・レース・回顧・オッズを一元管理 |
| ストレージ | 字幕生テキスト・ブログ生HTMLをR2に保存。AI処理前の原本を維持し再処理に備える |
| バッチ処理 | GitHub Actionsで毎週定期実行。収集→前処理→AI処理→DB保存の流れ |
| データ収集（構造化） | netkeibaスクレイピングでレース結果を取得。REST API経由でSupabaseに送信 |

---

## 3. ローカル開発環境（~/kaiko_test/）

Phase 1の動作確認はローカルMacで実施。以下のスクリプトが完成・動作確認済み。

| ファイル名 | 役割 | 状態 |
| --- | --- | --- |
| fetch_race.py | netkeibaからレース結果を取得（着順・馬名・斤量・通過順位など） | ✅ 完成 |
| fetch_transcript.py | YouTube字幕をテキストファイルに保存（ローカルMac実行必須） | ✅ 完成 |
| pipeline.py | 2つを組み合わせてClaude APIに渡し、DB用JSONを生成 | ✅ 完成 |
| output_\<race_id\>.json | races / horse_performances テーブル用JSON出力 | ✅ 生成確認済み |

実行方法：

```bash
python3 pipeline.py <race_id> "<youtube_url>"
```

---

## 4. AI処理の方針

### コスト削減の3原則

- AIを使わなくていい箇所（定型的な数値データ収集）にはAIを使わない
- 前処理でトークン数を削減（30〜50%削減）してからAIに渡す
- 修正と構造化を1回のAPIコールで同時実行する

### AI処理の流れ

| 処理内容 | 使用AI | コスト目安 |
| --- | --- | --- |
| 字幕テキスト整形・回顧9項目JSON化 | Claude Haiku 4.5 | $1.00/$5.00 per MTok |
| X投稿の収集・要約 | Grok API（X Search） | 月$1〜2 |
| オッズ収集 | AIなし | コストゼロ |
| 構造化データ取得 | AIなし（netkeiba） | 無料 |

> ※ 当初予定していたGemini 2.0 Flash（字幕整形）は、Phase 1ではClaude Haiku 4.5に統一。
>
> ※ JRA-VAN DataLab（Windows専用）は会社PC利用不可のため、netkeibaスクレイピングで代替。

---

## 5. スケールアップ方針

| パターン | 構成 | 目安ユーザー数 |
| --- | --- | --- |
| A（現在） | Supabase完結構成 | 〜1,000人 |
| B | Supabase + Cloudflare R2 | 〜10,000人 |
| C | Neon + Supabase Auth + R2 + Upstash Redis | 10,000人以上 |

> ※ Authだけは最初から慎重に選定。移行リスクが最高のためSupabase Authを固定とする。

---

以上　— 02. 技術スタック・システム構成　v1.2
