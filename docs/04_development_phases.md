# KAIKO　04. 開発フェーズ

ver 1.2　|　2026年3月

スモールスタートを前提に、動くものを早く作って段階的に拡張していく方針です。

| フェーズ | 内容 |
| --- | --- |
| Phase 0：環境構築（完了） | Cursor・Supabase・GitHubのセットアップ |
| Phase 1：データを貯める（完了） | テーブル作成・パイプライン構築・JSONをSupabaseに投入する仕組み |
| Phase 2：見る画面を作る（次） | 検索・一覧表示・スマートフォン対応 |
| Phase 3：自動収集 | GitHub Actionsで定期実行・YouTube字幕・ブログ取得 |

---

## Phase 0：環境構築（完了）

- Cursor インストール完了
- Supabase アカウント・プロジェクト作成完了
- GitHub アカウント準備完了

---

## Phase 1：データを貯める仕組み（完了）

| ファイル名 | 役割 | 状態 |
| --- | --- | --- |
| fetch_race.py | netkeibaからレース結果取得スクリプト | ✅ 完成 |
| fetch_transcript.py | YouTube字幕取得スクリプト | ✅ 完成 |
| pipeline.py | fetch_race + fetch_transcript → Claude API → DB用JSON生成 | ✅ 完成 |
| insert.py | output_\<race_id\>.json を Supabase に投入 | ✅ 完成 |
| kaiko_create_tables.sql | horses / races / horse_performances テーブル作成SQL | ✅ 完成・実行済み |
| output_202607010201.json | races / horse_performances 形式のサンプルJSON | ✅ 生成・投入確認済み |

すべてのファイルは `~/kaiko_test/` に配置。

### 実行方法

```bash
# 1. JSONを生成
python3 pipeline.py <race_id> "<youtube_url>"

# 2. SupabaseにJSONを投入
python3 insert.py output_<race_id>.json
```

### 環境変数（~/kaiko_test/.env）

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://<project_id>.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
```

---

## Phase 2：見る画面を作る（次のフェーズ）

- Next.jsプロジェクト作成
- 馬名・レース名で検索できる画面
- 回顧一覧を表示する画面
- スマートフォン対応（レスポンシブ）

---

## Phase 3：自動収集

- GitHub Actionsで定期実行の設定（fetch_transcript.pyはローカルMac必須のため要検討）
- YouTubeから字幕を自動取得
- ブログから記事を自動取得

---

以上　— 04. 開発フェーズ　v1.2
