"""
generate_race_analysis.py — レース分析データ生成スクリプト（Gemini版）

upcoming_races テーブルの各レースについて:
1. Gemini（Google Search grounding）で当日の馬場・バイアス情報を検索＆分析
2. track_bias_level / track_bias_summary を upcoming_races に upsert

Twitter APIは不要。Gemini が Google Search を使ってX投稿や競馬サイトを検索する。

使い方:
  cd pipeline
  pip install google-genai
  python generate_race_analysis.py           # 未分析のみ（track_bias_summary IS NULL）
  python generate_race_analysis.py --force   # 全レース上書き

必要な環境変数（.env）:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
  GEMINI_API_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

from google import genai
from google.genai import types
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY       = os.environ.get("GEMINI_API_KEY", "")

GEMINI_MODEL = "gemini-2.5-flash"
WAIT_SEC     = 1.5   # レート制限対策


def check_env() -> None:
    missing = []
    if not SUPABASE_URL:         missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY: missing.append("SUPABASE_SERVICE_KEY")
    if not GEMINI_API_KEY:       missing.append("GEMINI_API_KEY")
    if missing:
        print(f"❌ .env に以下を設定してください: {', '.join(missing)}")
        sys.exit(1)


def fetch_upcoming_races(supabase: Client, force: bool) -> list[dict]:
    query = supabase.from_("upcoming_races").select(
        "race_id, race_date, track, surface, distance, track_bias_summary"
    )
    if not force:
        query = query.is_("track_bias_summary", "null")
    return (query.order("race_date").execute().data or [])


def analyze_with_gemini(
    client: genai.Client,
    track: str,
    surface: str,
    distance: int,
    race_date: str,
) -> dict | None:
    """
    Gemini + Google Search grounding で馬場バイアスを検索・分析する。
    JSON形式で返す。失敗時は None。
    """
    prompt = (
        f"{race_date}に開催される{track}競馬場（{surface}{distance}m）の"
        f"当日の馬場状態・トラックバイアスを調べてください。\n"
        f"X（旧Twitter）や競馬情報サイトの当日情報を検索し、"
        f"内外の有利不利や前後の有利不利を把握してください。\n\n"
        f"以下のJSON形式のみで返答してください（説明文・コードブロック不要）:\n"
        f'{{\n'
        f'  "track_bias_level": "◎",\n'
        f'  "track_bias_summary": "60字以内の日本語"\n'
        f'}}\n\n'
        f"track_bias_level の値:\n"
        f"  ◎ = 強い偏りあり\n"
        f"  ○ = 中程度の偏り\n"
        f"  △ = 弱い偏り\n"
        f"  × = ほぼフラット\n"
        f"  null = 情報不足で判断不能\n\n"
        f"情報が少ない場合は両方 null にしてください。"
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            ),
        )
        raw = response.text.strip()

        # コードブロックがあれば除去
        if "```" in raw:
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        return json.loads(raw)

    except json.JSONDecodeError as e:
        print(f"  ⚠ JSONパースエラー: {e}")
        return None
    except Exception as e:
        print(f"  ⚠ Gemini APIエラー: {e}")
        return None


def upsert_bias(
    supabase: Client,
    race_id: str,
    level: str | None,
    summary: str | None,
) -> None:
    supabase.from_("upcoming_races").update({
        "track_bias_level":   level,
        "track_bias_summary": summary,
    }).eq("race_id", race_id).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="レース分析データ生成（Gemini + Google Search）")
    parser.add_argument("--force", action="store_true", help="既存データも上書きする")
    parser.add_argument("--date", type=str, help="対象日付（YYYY-MM-DD）。指定なしは全日程")
    args = parser.parse_args()

    check_env()

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    client   = genai.Client(api_key=GEMINI_API_KEY)

    print("=== generate_race_analysis.py (Gemini + Google Search) ===")
    print(f"モード: {'全レース上書き' if args.force else '未分析のみ'}")
    if args.date:
        print(f"対象日: {args.date}")

    races = fetch_upcoming_races(supabase, args.force)
    if args.date:
        races = [r for r in races if r["race_date"] == args.date]
    print(f"対象レース数: {len(races)}\n")

    if not races:
        print("✅ 処理対象なし。")
        return

    success = 0
    skip    = 0

    for i, race in enumerate(races, 1):
        race_id   = race["race_id"]
        race_date = race["race_date"]
        track     = race["track"]
        surface   = race["surface"]
        distance  = race["distance"]

        print(f"[{i}/{len(races)}] {track} {surface}{distance}m ({race_date}) — {race_id}")
        print(f"  Gemini検索・分析中...")

        result = analyze_with_gemini(client, track, surface, distance, race_date)
        time.sleep(WAIT_SEC)

        if result is None:
            print(f"  ⚠ スキップ（分析失敗）")
            skip += 1
            continue

        level   = result.get("track_bias_level")
        summary = result.get("track_bias_summary")

        if summary:
            print(f"  ✅ level={level}  {summary[:50]}...")
        else:
            print(f"  ℹ バイアス情報なし（情報不足）→ null で保存")

        upsert_bias(supabase, race_id, level, summary)
        success += 1

    print(f"\n完了: 成功={success}件, スキップ={skip}件")


if __name__ == "__main__":
    main()
