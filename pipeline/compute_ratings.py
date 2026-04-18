"""
compute_ratings.py — グローバルレーティング計算スクリプト

全レースの全出走ペア間の補正後着差を最小二乗法で同時に解き、
各馬の能力レーティングを算出して Supabase の horse_ratings テーブルに upsert する。

【アルゴリズム概要】
  minimize Σ w_ij × (r_A - r_B - adjustedDiff(A,B))²
    r[]         : 各馬の能力値（求めたい変数）
    adjustedDiff: 着差差 + LLM補正差 + track_bias（比較ページと同じ計算）
    w           : 時間減衰 × LLM補正有無の重み

【重みパラメータ】
  時間減衰 : 0.75 ^ years_ago（1年で×0.75、2年で×0.5625）
  LLM補正あり : weight × 1.0
  LLM補正なし : weight × 0.5（着差ベースのみ、ノイズが多いため低め）

使い方:
  cd pipeline
  python compute_ratings.py

依存ライブラリ（追加インストール必要）:
  pip install scipy numpy
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import date

import numpy as np
from dotenv import load_dotenv
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import lsqr
from supabase import create_client, Client

# ── 定数 ──────────────────────────────────────────────────────────────────────

load_dotenv()
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

CORRECTION_KEYS = [
    "trouble_value",
    "temperament_value",
    "weight_effect_value",
    "track_condition_value",
    "pace_effect_value",
]

TIME_DECAY_BASE   = 0.75   # 1年で 0.75 倍
LLM_ABSENT_WEIGHT = 0.5    # LLM補正なしのペアの追加重み
MIN_WEIGHT        = 0.02   # これ未満のウェイトはスキップ（古すぎるデータ）
MIN_RACES         = 2      # horse_ratings に登録する最小走数
FETCH_PAGE_SIZE   = 1000   # Supabase 取得のページサイズ（デフォルト上限に合わせる）
UPSERT_BATCH_SIZE = 500    # upsert のバッチサイズ

# ── 時間減衰 ──────────────────────────────────────────────────────────────────

def time_weight(race_date_str: str) -> float:
    """race_date (YYYY-MM-DD) から時間減衰係数を返す（1年で 0.75）"""
    try:
        d = date.fromisoformat(race_date_str)
    except ValueError:
        return 0.5
    years_ago = (date.today() - d).days / 365.25
    return TIME_DECAY_BASE ** years_ago


# ── LLM補正判定 ───────────────────────────────────────────────────────────────

def has_llm(perf: dict) -> bool:
    """LLM補正値（5項目）が1つ以上ある場合 True"""
    return any(perf.get(k) is not None for k in CORRECTION_KEYS)


def correction_sum(perf: dict) -> float:
    """5補正項目の合計（null は 0 扱い）"""
    return sum(perf.get(k) or 0.0 for k in CORRECTION_KEYS)


# ── 累積着差マップ構築 ────────────────────────────────────────────────────────

def build_cum_margins(perfs: list[dict]) -> dict[int, float]:
    """
    同一レースの全馬 perf から horse_id → 1着からの累積着差を構築する。
    margin は float（DB保存の数値）として受け取る。1着 = 0.0。
    """
    sorted_perfs = sorted(perfs, key=lambda p: p["finish_order"])
    result: dict[int, float] = {}
    cum = 0.0
    for p in sorted_perfs:
        if p["finish_order"] == 1:
            result[p["horse_id"]] = 0.0
        else:
            m = p.get("margin")
            # NaN・None・文字列は 0 扱い
            if m is not None and isinstance(m, (int, float)) and m == m:
                cum += float(m)
            result[p["horse_id"]] = cum
    return result


# ── 補正後着差の計算（比較ページ calcAdjustedDiff の Python 版） ──────────────

def adjusted_diff(
    pa: dict,
    pb: dict,
    cum_map: dict[int, float],
    track_bias: float,
) -> float:
    """
    2頭の補正後能力差を計算する（正 = pa が pb より強い）。
    着差データがあれば累積着差ベース、なければ着順差×0.5 にフォールバック。
    """
    ca = cum_map.get(pa["horse_id"])
    cb = cum_map.get(pb["horse_id"])

    if ca is not None and cb is not None:
        base_diff = cb - ca          # 正 = pa が先着（強い）
    else:
        base_diff = (pb["finish_order"] - pa["finish_order"]) * 0.5

    corr_a = correction_sum(pa)
    corr_b = correction_sum(pb)
    return base_diff + corr_a - corr_b + track_bias


# ── ペア生成 ──────────────────────────────────────────────────────────────────

def build_pairs(
    all_perfs: list[dict],
) -> list[tuple[int, int, float, float]]:
    """
    全レースの全出走ペアを生成する。
    disregard の馬はスキップ。重みが MIN_WEIGHT 未満もスキップ。

    Returns:
        [(horse_id_a, horse_id_b, adjusted_diff, weight)]
        adjusted_diff > 0 → 馬A が馬B より強い
    """
    by_race: dict[str, list[dict]] = defaultdict(list)
    for p in all_perfs:
        by_race[p["race_id"]].append(p)

    pairs: list[tuple[int, int, float, float]] = []

    for race_id, perfs in by_race.items():
        # disregard を除外してから処理
        valid = [p for p in perfs if p.get("eval_tag") != "disregard"]
        if len(valid) < 2:
            continue

        race_date   = valid[0].get("race_date", "")
        track_bias  = valid[0].get("track_bias_value") or 0.0
        t_w         = time_weight(race_date)

        cum_map = build_cum_margins(valid)

        for i, pa in enumerate(valid):
            for pb in valid[i + 1:]:
                diff = adjusted_diff(pa, pb, cum_map, float(track_bias))

                # LLM補正の有無でウェイト調整
                llm_w = 1.0 if (has_llm(pa) and has_llm(pb)) else LLM_ABSENT_WEIGHT
                w     = t_w * llm_w

                if w < MIN_WEIGHT:
                    continue

                pairs.append((pa["horse_id"], pb["horse_id"], diff, w))

    return pairs


# ── 最小二乗求解 ──────────────────────────────────────────────────────────────

def solve_ratings(
    pairs: list[tuple[int, int, float, float]],
) -> dict[int, float]:
    """
    重み付き最小二乗でグローバルレーティングを算出する。
    アンカー：全馬の平均 = 0。
    Returns: {horse_id: rating}
    """
    horses = sorted({h for a, b, _, _ in pairs for h in (a, b)})
    n      = len(horses)
    idx    = {h: i for i, h in enumerate(horses)}
    m      = len(pairs)

    print(f"  行列サイズ: {m} ペア × {n} 馬")

    A = lil_matrix((m + 1, n), dtype=float)
    b = np.zeros(m + 1, dtype=float)

    for k, (ha, hb, diff, w) in enumerate(pairs):
        A[k, idx[ha]] =  w
        A[k, idx[hb]] = -w
        b[k]           = diff * w

    # アンカー制約：全馬の平均 = 0
    A[m, :] = 1.0
    b[m]    = 0.0

    print("  lsqr で求解中...")
    result  = lsqr(A.tocsr(), b, iter_lim=3000, atol=1e-6, btol=1e-6)
    ratings = result[0]
    print(f"  反復: {result[2]}回  残差ノルム: {result[3]:.4f}")

    return {h: float(ratings[idx[h]]) for h in horses}


# ── 残差・接続数 ──────────────────────────────────────────────────────────────

def calc_errors_and_connections(
    pairs:   list[tuple[int, int, float, float]],
    ratings: dict[int, float],
) -> tuple[dict[int, float], dict[int, int]]:
    """
    各馬の残差 RMS（信頼指標）と繋がった馬の数を計算する。
    Returns: (errors, connections)
    """
    residuals: dict[int, list[float]] = defaultdict(list)
    connected: dict[int, set[int]]   = defaultdict(set)

    for ha, hb, diff, w in pairs:
        ra = ratings.get(ha, 0.0)
        rb = ratings.get(hb, 0.0)
        residuals[ha].append((ra - rb - diff) * w)
        residuals[hb].append((rb - ra + diff) * w)
        connected[ha].add(hb)
        connected[hb].add(ha)

    errors      = {h: float(np.sqrt(np.mean(np.array(v) ** 2))) for h, v in residuals.items()}
    connections = {h: len(s) for h, s in connected.items()}
    return errors, connections


# ── メイン ────────────────────────────────────────────────────────────────────

def main() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ .env に SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください")
        sys.exit(1)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print("=== compute_ratings.py ===")
    print("1. horse_performances を全件取得中...")

    all_perfs: list[dict] = []
    offset = 0
    while True:
        resp = supabase.from_("horse_performances").select(
            "horse_id, race_id, finish_order, margin, eval_tag, "
            "trouble_value, temperament_value, weight_effect_value, "
            "track_condition_value, pace_effect_value, "
            "races(race_date, track_bias_value)"
        ).range(offset, offset + FETCH_PAGE_SIZE - 1).execute()

        rows = resp.data or []
        if not rows:
            break

        # races のネストを平坦化
        for row in rows:
            race_info = row.pop("races", None) or {}
            row["race_date"]        = race_info.get("race_date", "")
            row["track_bias_value"] = race_info.get("track_bias_value")

        all_perfs.extend(rows)
        print(f"  取得済み: {len(all_perfs)} 件")
        if len(rows) < FETCH_PAGE_SIZE:
            break
        offset += FETCH_PAGE_SIZE

    print(f"  合計: {len(all_perfs)} パフォーマンス")

    if not all_perfs:
        print("❌ データが0件です。")
        sys.exit(1)

    print("\n2. ペア生成中...")
    pairs = build_pairs(all_perfs)
    print(f"  {len(pairs)} ペア生成")

    if not pairs:
        print("❌ 有効なペアが0件です。データを確認してください。")
        sys.exit(1)

    print("\n3. レーティング計算中（最小二乗法）...")
    ratings = solve_ratings(pairs)
    print(f"  {len(ratings)} 頭の rating を算出")

    print("\n4. 残差・接続数を計算中...")
    errors, connections = calc_errors_and_connections(pairs, ratings)

    # 走数カウント（disregard 除外）
    race_counts: dict[int, set[str]] = defaultdict(set)
    for p in all_perfs:
        if p.get("eval_tag") != "disregard":
            race_counts[p["horse_id"]].add(p["race_id"])

    print("\n5. horse_ratings に upsert 中...")
    records = []
    for horse_id, rating in ratings.items():
        rc = len(race_counts.get(horse_id, set()))
        if rc < MIN_RACES:
            continue  # 走数不足はスキップ（フロントで非表示）
        records.append({
            "horse_id":         horse_id,
            "rating":           round(rating, 4),
            "rating_error":     round(errors.get(horse_id, 0.0), 4),
            "races_analyzed":   rc,
            "connected_horses": connections.get(horse_id, 0),
        })

    print(f"  upsert 対象: {len(records)} 頭（{len(ratings) - len(records)} 頭は走数不足でスキップ）")

    for i in range(0, len(records), UPSERT_BATCH_SIZE):
        chunk = records[i : i + UPSERT_BATCH_SIZE]
        supabase.from_("horse_ratings").upsert(
            chunk, on_conflict="horse_id"
        ).execute()
        print(f"  {min(i + UPSERT_BATCH_SIZE, len(records))} / {len(records)} 完了")

    print(f"\n{'='*50}")
    print(f"✅ 完了: {len(records)} 頭の rating を更新しました")
    if ratings:
        sorted_r = sorted(ratings.items(), key=lambda x: x[1], reverse=True)
        print(f"\n  rating 上位5頭（horse_id: rating）:")
        for hid, r in sorted_r[:5]:
            print(f"    {hid}: {r:+.3f}")


if __name__ == "__main__":
    main()
