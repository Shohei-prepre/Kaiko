"""
pipeline_results.py — レース結果のみのDB投入スクリプト（回顧情報なし）

回顧動画・字幕なしでレース結果だけを Supabase に投入する。
LLM系フィールドはすべて null で投入され、フロントでは全馬「度外視」表示になる。
後から pipeline.py で回顧処理を行うと upsert で自動的に上書きされる。

使い方:
  # 単一レース
  python3 pipeline_results.py 202501010611

  # 複数レース（スペース区切り）
  python3 pipeline_results.py 202501010611 202501010612 202501010701

  # 日付指定（その日の全レースを取得）
  python3 pipeline_results.py --date 2025-01-01

  # 日付範囲（--from と --to は両方必要）
  python3 pipeline_results.py --from 2025-01-01 --to 2025-03-31
"""

from __future__ import annotations

import sys
import json
import os
import re
import argparse
from datetime import date, timedelta
from typing import Optional
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client

# insert.py の upsert 関数を再利用
from insert import upsert_horses, upsert_race, upsert_performances

# ── 定数 ──────────────────────────────────────────────────────────────────

load_dotenv()
SUPABASE_URL        = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# race_id の開催場コード → 競馬場名
VENUE_MAP = {
    "01": "札幌", "02": "函館", "03": "福島", "04": "新潟",
    "05": "東京", "06": "中山", "07": "阪神", "08": "小倉",
    "09": "中京", "10": "中京", "11": "京都",
    "15": "金沢", "16": "笠松", "17": "名古屋", "18": "園田",
    "19": "姫路", "22": "佐賀", "23": "高知",
}

# 着差テキスト → 馬身数（float）
MARGIN_MAP = {
    "ハナ": 0.1, "アタマ": 0.2, "クビ": 0.3,
    "1/2": 0.5, "3/4": 0.75,
    "1": 1.0, "1.1/4": 1.25, "1.1/2": 1.5, "1.3/4": 1.75,
    "2": 2.0, "2.1/2": 2.5,
    "3": 3.0, "3.1/2": 3.5,
    "4": 4.0, "5": 5.0,
    "大差": 10.0,
    "同着": 0.0,
}

# ── ユーティリティ関数 ────────────────────────────────────────────────────

def parse_margin(text: str) -> float | None:
    """着差テキストを馬身数(float)に変換する"""
    t = text.strip()
    if not t or t in ("-", ""):
        return None  # 1着は None
    if t in MARGIN_MAP:
        return MARGIN_MAP[t]
    # 数値っぽければそのまま
    try:
        return float(t)
    except ValueError:
        return None


def parse_finish_order(text: str) -> int | None:
    """着順テキストを int に変換する（中止・除外・失格は None）"""
    t = text.strip()
    if not t:
        return None
    if re.match(r"^\d+$", t):
        return int(t)
    return None  # "中止", "除外", "失格" など


def race_date_from_id(race_id: str) -> str:
    """race_id の先頭 8 桁 YYYYMMDD を YYYY-MM-DD 形式に変換する"""
    d = race_id[:8]
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}"


def venue_from_id(race_id: str) -> str:
    """race_id の 9〜10 桁目（開催場コード）から競馬場名を返す"""
    code = race_id[8:10]
    return VENUE_MAP.get(code, f"不明({code})")


# ── レース結果スクレイピング ─────────────────────────────────────────────

def scrape_race(race_id: str) -> dict | None:
    """
    netkeiba の結果ページから races + horse_performances 用データを取得する。
    取得失敗時は None を返す。
    """
    url = f"https://race.netkeiba.com/race/result.html?race_id={race_id}"
    print(f"  → {url}")
    res = requests.get(url, headers=HEADERS, timeout=15)
    res.encoding = "EUC-JP"
    soup = BeautifulSoup(res.text, "html.parser")

    # ── レース名 ──
    race_name_el = (
        soup.select_one(".RaceName")
        or soup.select_one(".Race_Name")
        or soup.select_one(".RaceMainName")
    )
    race_name = race_name_el.text.strip() if race_name_el else f"レース{race_id[-2:]}R"

    # ── グレード ──
    grade = _parse_grade(soup, race_name)

    # ── RaceData01: 距離・馬場・馬場状態 ──
    data01 = soup.select_one(".RaceData01")
    data01_text = data01.text.strip() if data01 else ""
    surface, distance, track_condition = _parse_data01(data01_text)

    # ── RaceData02: kai_nichi ──
    data02 = soup.select_one(".RaceData02")
    kai_nichi = ""
    if data02:
        spans = data02.select("span")
        parts = [s.text.strip() for s in spans if s.text.strip()]
        kai_nichi = " ".join(parts[:3]) if len(parts) >= 3 else " ".join(parts)

    # ── ラップタイム ──
    lap_times = _parse_lap_times(soup)

    # ── 開催場・race_number ──
    track = venue_from_id(race_id)
    race_number = int(race_id[-2:])
    race_date = race_date_from_id(race_id)

    # ── 結果テーブル ──
    table = soup.select_one(".RaceTable01")
    if not table:
        print(f"  ⚠️  結果テーブルが見つかりません（race_id={race_id}）")
        return None

    performances = []
    for row in table.select("tr")[1:]:
        cols = row.select("td")
        if len(cols) < 13:
            continue

        finish_order = parse_finish_order(cols[0].text.strip())
        if finish_order is None:
            continue  # 中止・除外などはスキップ

        margin_raw = cols[8].text.strip() if len(cols) > 8 else ""
        margin = parse_margin(margin_raw) if finish_order != 1 else None

        frame_raw = cols[1].text.strip()
        horse_number_raw = cols[2].text.strip()
        weight_raw = cols[5].text.strip()
        horse_weight_raw = cols[14].text.strip() if len(cols) > 14 else ""

        performances.append({
            "race_id":        race_id,
            "horse_name":     cols[3].text.strip(),
            "finish_order":   finish_order,
            "margin":         margin,
            "weight_carried": float(weight_raw) if weight_raw else None,
            "frame_number":   int(frame_raw) if frame_raw.isdigit() else None,
            "horse_number":   int(horse_number_raw) if horse_number_raw.isdigit() else None,
            "position_order": cols[12].text.strip() if len(cols) > 12 else None,
            "horse_weight":   horse_weight_raw or None,
            # LLM系フィールドはすべて null
            "trouble_level":       None,
            "trouble_value":       None,
            "trouble_summary":     None,
            "temperament_level":   None,
            "temperament_value":   None,
            "temperament_summary": None,
            "weight_effect_level":   None,
            "weight_effect_value":   None,
            "weight_effect_summary": None,
            "track_condition_level":   None,
            "track_condition_value":   None,
            "track_condition_summary": None,
            "pace_effect_level":   None,
            "pace_effect_value":   None,
            "pace_effect_summary": None,
            "eval_tag": None,
            "sources":    ["netkeiba"],
            "confidence": "high",  # レース結果自体は確定値なので high
        })

    if not performances:
        print(f"  ⚠️  出走馬データが取得できませんでした（race_id={race_id}）")
        return None

    race_data = {
        "race_id":       race_id,
        "race_name":     race_name,
        "race_date":     race_date,
        "track":         track,
        "distance":      distance,
        "surface":       surface,
        "grade":         grade,
        "track_condition": track_condition,
        "race_number":   race_number,
        "kai_nichi":     kai_nichi,
        "lap_times":     lap_times,
        # LLM系フィールドはすべて null
        "pace":               None,
        "pace_level":         None,
        "pace_value":         None,
        "pace_summary":       None,
        "track_bias_level":   None,
        "track_bias_value":   None,
        "track_bias_summary": None,
        "course_aptitude_level":   None,
        "course_aptitude_value":   None,
        "course_aptitude_summary": None,
        "sources":    ["netkeiba"],
        "confidence": "high",
    }

    return {"races": race_data, "horse_performances": performances}


def _parse_grade(soup: BeautifulSoup, race_name: str) -> str:
    """グレードを netkeiba のアイコンクラスまたはレース名から判定する"""
    # netkeiba の grade アイコンクラス例: Icon_GradeType1 / Icon_GradeType2 ...
    for cls, grade in [
        ("Icon_GradeType1", "G1"),
        ("Icon_GradeType2", "G2"),
        ("Icon_GradeType3", "G3"),
        ("Icon_GradeTypeL",  "L"),
        ("Icon_GradeType15", "L"),
    ]:
        if soup.select_one(f".{cls}"):
            return grade

    # レース名から判定
    name = race_name.upper()
    if "(G1)" in name or "（G1）" in name:
        return "G1"
    if "(G2)" in name or "（G2）" in name:
        return "G2"
    if "(G3)" in name or "（G3）" in name:
        return "G3"

    # RaceName 内のテキストで判定
    for el in soup.select(".RaceName, .RaceLabel"):
        t = el.text
        for g in ["G1", "G2", "G3"]:
            if g in t:
                return g

    # OP / 特別 / クラス判定
    for el in soup.select(".Icon_GradeType, .RaceLabel, .RaceData01, .RaceData02"):
        t = el.text
        if "オープン" in t or "OP" in t:
            return "OP"
        if "新馬" in t:
            return "新馬"
        if "未勝利" in t:
            return "未勝利"
        if "3勝" in t or "1600万" in t:
            return "3勝"
        if "2勝" in t or "1000万" in t:
            return "2勝"
        if "1勝" in t or "500万" in t:
            return "1勝"
        if "障害" in t:
            return "障害"

    return "—"


def _parse_data01(text: str) -> tuple[str, int, str]:
    """
    RaceData01 テキストから surface / distance / track_condition を返す。
    例: "芝1600m（左）/ 天候：晴 / 芝：良 / 発走：15:40"
    """
    surface = "芝"
    distance = 0
    track_condition = "良"

    # 距離・馬場面
    m = re.search(r"(芝|ダート|障害|ダ)[\s　]*(\d+)m", text)
    if m:
        surf_raw = m.group(1)
        distance = int(m.group(2))
        surface = "ダート" if surf_raw in ("ダート", "ダ") else ("障" if surf_raw == "障害" else "芝")

    # 馬場状態（芝：良 / ダート：稍重 などのパターン）
    cond_m = re.search(r"(?:芝|ダート|ダ)[：:]\s*(良|稍重|重|不良)", text)
    if cond_m:
        track_condition = cond_m.group(1)
    else:
        # "馬場：良" など別表記
        cond_m2 = re.search(r"(?:馬場|バ)[：:]\s*(良|稍重|重|不良)", text)
        if cond_m2:
            track_condition = cond_m2.group(1)

    return surface, distance, track_condition


def _parse_lap_times(soup: BeautifulSoup) -> list[float] | None:
    """ラップタイムテーブルから float リストを取得する"""
    lap_table = soup.select_one(".Race_HaronTime, .HaronTime, .LapTime")
    if not lap_table:
        return None
    laps = []
    for td in lap_table.select("td"):
        t = td.text.strip()
        try:
            laps.append(float(t))
        except ValueError:
            pass
    return laps if laps else None


# ── 日付からレースID一覧を取得 ───────────────────────────────────────────

def fetch_race_ids_for_date(target_date: str) -> list[str]:
    """
    netkeiba の開催一覧ページから指定日のレース ID を取得する。
    target_date: "YYYY-MM-DD" 形式
    """
    date_str = target_date.replace("-", "")
    url = f"https://race.netkeiba.com/top/race_list_sub.html?kaisai_date={date_str}"
    print(f"  → 開催一覧を取得: {url}")
    res = requests.get(url, headers=HEADERS, timeout=15)
    res.encoding = "EUC-JP"
    soup = BeautifulSoup(res.text, "html.parser")

    race_ids = []
    for a in soup.select("a[href*='race_id=']"):
        href = a.get("href", "")
        m = re.search(r"race_id=(\d{12})", href)
        if m:
            rid = m.group(1)
            if rid not in race_ids:
                race_ids.append(rid)

    return sorted(race_ids)


def dates_in_range(start: str, end: str) -> list[str]:
    """YYYY-MM-DD の start〜end（両端含む）の日付リストを返す"""
    d = date.fromisoformat(start)
    e = date.fromisoformat(end)
    result = []
    while d <= e:
        result.append(d.isoformat())
        d += timedelta(days=1)
    return result


# ── メイン処理 ────────────────────────────────────────────────────────────

def process_race(race_id: str, supabase: Client) -> bool:
    """1レースを取得して DB に投入する。成功で True、スキップで False を返す"""
    print(f"\n[{race_id}] 処理開始")

    data = scrape_race(race_id)
    if not data:
        print(f"  ❌ スクレイピング失敗: {race_id}")
        return False

    race_data = data["races"]
    perfs = data["horse_performances"]

    print(f"  レース名: {race_data['race_name']} / {race_data['track']} / {race_data['distance']}m"
          f" / {race_data['surface']} / {race_data['track_condition']} / {len(perfs)}頭")

    print(f"  --- Step 1: horses upsert ---")
    name_to_id = upsert_horses(perfs)

    print(f"  --- Step 2: races upsert ---")
    upsert_race(race_data)

    print(f"  --- Step 3: horse_performances upsert ---")
    upsert_performances(perfs, name_to_id)

    print(f"  ✅ {race_id} 投入完了")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="レース結果のみをDBに投入するスクリプト（回顧情報なし）"
    )
    parser.add_argument("race_ids", nargs="*", help="投入する race_id（複数可）")
    parser.add_argument("--date",  help="指定日の全レースを投入 (YYYY-MM-DD)")
    parser.add_argument("--from",  dest="date_from", help="日付範囲の開始 (YYYY-MM-DD)")
    parser.add_argument("--to",    dest="date_to",   help="日付範囲の終了 (YYYY-MM-DD)")
    args = parser.parse_args()

    # 投入する race_id リストを構築
    race_ids: list[str] = list(args.race_ids)

    if args.date:
        ids = fetch_race_ids_for_date(args.date)
        print(f"  {args.date}: {len(ids)} レース検出")
        race_ids.extend(ids)

    if args.date_from and args.date_to:
        for d in dates_in_range(args.date_from, args.date_to):
            ids = fetch_race_ids_for_date(d)
            if ids:
                print(f"  {d}: {len(ids)} レース検出")
                race_ids.extend(ids)

    # 重複除去・順序保持
    seen = set()
    race_ids = [r for r in race_ids if not (r in seen or seen.add(r))]

    if not race_ids:
        parser.print_help()
        sys.exit(1)

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ .env に SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print(f"\n📋 投入対象: {len(race_ids)} レース")

    ok = 0
    ng = 0
    for race_id in race_ids:
        success = process_race(race_id, supabase)
        if success:
            ok += 1
        else:
            ng += 1

    print(f"\n{'='*50}")
    print(f"✅ 完了: {ok} 件成功 / {ng} 件失敗")
    if ng:
        print("⚠️  失敗したレースは race_id を確認して再実行してください")


if __name__ == "__main__":
    main()
