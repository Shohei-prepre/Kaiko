"""
generate_race_analysis.py — レース分析データ生成スクリプト

upcoming_races テーブルの各レースについて:
1. Twitter API v2 でX投稿を検索（馬場・バイアス関連）
2. 取得した投稿をClaude APIに渡してバイアス情報を要約
3. track_bias_level / track_bias_summary を upcoming_races に upsert

使い方:
  cd pipeline
  pip install anthropic tweepy
  python generate_race_analysis.py           # 未分析のみ（track_bias_summary IS NULL）
  python generate_race_analysis.py --force   # 全レース上書き

必要な環境変数（.env）:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
  ANTHROPIC_API_KEY
  TWITTER_BEARER_TOKEN
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import anthropic
import tweepy
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_API_KEY    = os.environ.get("ANTHROPIC_API_KEY", "")
TWITTER_BEARER_TOKEN = os.environ.get("TWITTER_BEARER_TOKEN", "")

# Claude モデル（コスト抑制のため Haiku を使用）
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

# X検索で取得する最大ツイート数
MAX_TWEETS = 10

# API呼び出し間のウェイト（レート制限対策）
TWITTER_WAIT_SEC   = 2.0
ANTHROPIC_WAIT_SEC = 0.5


def check_env() -> None:
    """必要な環境変数が揃っているか確認する"""
    missing = []
    if not SUPABASE_URL:         missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY: missing.append("SUPABASE_SERVICE_KEY")
    if not ANTHROPIC_API_KEY:    missing.append("ANTHROPIC_API_KEY")
    if not TWITTER_BEARER_TOKEN: missing.append("TWITTER_BEARER_TOKEN")
    if missing:
        print(f"❌ .env に以下を設定してください: {', '.join(missing)}")
        sys.exit(1)


def fetch_upcoming_races(supabase: Client, force: bool) -> list[dict]:
    """処理対象の upcoming_races を取得する"""
    query = supabase.from_("upcoming_races").select(
        "race_id, race_date, track, surface, distance, track_bias_summary"
    )
    if not force:
        # NULL のレースのみ対象
        query = query.is_("track_bias_summary", "null")

    resp = query.order("race_date").execute()
    return resp.data or []


def search_x_posts(client: tweepy.Client, track: str, race_date: str) -> str:
    """
    X（Twitter）でトラックバイアス関連の投稿を検索し、テキストを連結して返す。
    結果が0件の場合は空文字列を返す。
    """
    # 当日・前日を含む検索クエリ
    query = (
        f'"{track}競馬場" (馬場 OR バイアス OR 内枠 OR 外枠 OR 馬場状態) '
        f'lang:ja -is:retweet'
    )

    try:
        resp = client.search_recent_tweets(
            query=query,
            max_results=MAX_TWEETS,
            tweet_fields=["created_at", "text"],
        )
    except tweepy.TooManyRequests:
        print("  ⚠ X API レート制限。15分後にリトライしてください。")
        return ""
    except Exception as e:
        print(f"  ⚠ X API エラー: {e}")
        return ""

    if not resp.data:
        return ""

    lines = []
    for tweet in resp.data:
        lines.append(f"- {tweet.text.strip()}")

    return "\n".join(lines)


def analyze_with_claude(
    ai: anthropic.Anthropic,
    track: str,
    surface: str,
    distance: int,
    tweets_text: str,
) -> dict | None:
    """
    Claude に X投稿を渡してバイアス情報をJSON形式で生成させる。
    JSONのパースに失敗した場合は None を返す。
    """
    if not tweets_text:
        prompt_body = (
            f"レース: {track}競馬場 {surface}{distance}m\n\n"
            f"X（Twitter）の投稿が見つかりませんでした。\n"
            f"投稿情報なしの場合は track_bias_level と track_bias_summary を null にしてください。"
        )
    else:
        prompt_body = (
            f"以下はX（Twitter）の投稿です。{track}競馬場（{surface}{distance}m）の\n"
            f"当日の馬場・トラックバイアスについて分析してください。\n\n"
            f"投稿:\n{tweets_text}\n\n"
            f"下記JSON形式のみで返答（説明文不要）:\n"
            f'{{\n'
            f'  "track_bias_level": "◎",      // ◎強い偏り/○中程度/△弱い/×ほぼなし/null=判断不能\n'
            f'  "track_bias_summary": "..."   // 60字以内の日本語。情報が少なければ null\n'
            f'}}'
        )

    try:
        message = ai.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt_body}],
        )
        raw = message.content[0].text.strip()

        # コードブロックがあれば除去
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  ⚠ JSONパースエラー: {e}\n  レスポンス: {raw[:200]}")
        return None
    except Exception as e:
        print(f"  ⚠ Claude APIエラー: {e}")
        return None


def upsert_bias(supabase: Client, race_id: str, level: str | None, summary: str | None) -> None:
    """track_bias を upcoming_races に upsert する"""
    supabase.from_("upcoming_races").update({
        "track_bias_level":   level,
        "track_bias_summary": summary,
    }).eq("race_id", race_id).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="レース分析データ生成（X投稿 + Claude）")
    parser.add_argument("--force", action="store_true", help="既存データも上書きする")
    args = parser.parse_args()

    check_env()

    supabase    = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    ai          = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    twitter     = tweepy.Client(bearer_token=TWITTER_BEARER_TOKEN)

    print("=== generate_race_analysis.py ===")
    print(f"モード: {'全レース上書き' if args.force else '未分析のみ'}")

    races = fetch_upcoming_races(supabase, args.force)
    print(f"対象レース数: {len(races)}\n")

    if not races:
        print("✅ 処理対象なし。")
        return

    success = 0
    skip    = 0

    for i, race in enumerate(races, 1):
        race_id  = race["race_id"]
        race_date = race["race_date"]
        track    = race["track"]
        surface  = race["surface"]
        distance = race["distance"]

        print(f"[{i}/{len(races)}] {track} {surface}{distance}m ({race_date}) — {race_id}")

        # X投稿を検索
        print(f"  X検索中...")
        tweets_text = search_x_posts(twitter, track, race_date)
        tweet_count = tweets_text.count("- ") if tweets_text else 0
        print(f"  投稿取得: {tweet_count}件")
        time.sleep(TWITTER_WAIT_SEC)

        # Claude で分析
        print(f"  Claude分析中...")
        result = analyze_with_claude(ai, track, surface, distance, tweets_text)
        time.sleep(ANTHROPIC_WAIT_SEC)

        if result is None:
            print(f"  ⚠ スキップ（分析失敗）")
            skip += 1
            continue

        level   = result.get("track_bias_level")
        summary = result.get("track_bias_summary")

        if not summary:
            print(f"  ℹ バイアス情報なし（投稿不足）→ null で保存")
        else:
            print(f"  ✅ level={level}  summary={summary[:40]}...")

        upsert_bias(supabase, race_id, level, summary)
        success += 1

    print(f"\n完了: 成功={success}件, スキップ={skip}件")


if __name__ == "__main__":
    main()
