"""
compute_ratings.py — グローバルレーティング計算スクリプト（Dual-Solve Blend版）

全レースの全出走ペア間の補正後着差を最小二乗法で同時に解き、
各馬の能力レーティングを算出して Supabase の horse_ratings テーブルに upsert する。

【アルゴリズム概要】
  minimize Σ w_ij × (r_A - r_B - adjustedDiff(A,B))²
    r[]         : 各馬の能力値（求めたい変数）
    adjustedDiff: 着差差 + LLM補正差 + track_bias（比較ページと同じ計算）
    w           : 時間減衰 × LLM補正有無 × 補正ペナルティ（施策1）

【Dual-Solve Blend（施策2）】
  1. raw solve  : 補正を全て0として生の着差だけでIRLS → raw_rating
  2. corr solve : 補正+施策1ペナルティ込みでIRLS → corrected_rating
  3. blend      : 2つの差が大きい馬ほどrawの方向に引き戻す
    gap         = |corrected - raw|
    blend_ratio = min(gap / BLEND_THRESHOLD, MAX_BLEND)
    final       = corrected × (1 - blend_ratio) + raw × blend_ratio

【重みパラメータ】
  時間減衰        : 0.75 ^ years_ago（1年で×0.75、2年で×0.5625）
  LLM補正あり     : weight × 1.0
  LLM補正なし     : weight × 0.5（着差ベースのみ、ノイズが多いため低め）
  補正ペナルティ  : 1 / (1 + (total_correction / 2.0)^2)（大きい補正ほど重みを下げる）

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
LLM_ABSENT_WEIGHT = 1.0    # LLM補正なしでも同じ重みで扱う
MIN_WEIGHT        = 0.02   # これ未満のウェイトはスキップ（古すぎるデータ）
MIN_RACES         = 1      # horse_ratings に登録する最小走数
FETCH_PAGE_SIZE   = 1000   # Supabase 取得のページサイズ（デフォルト上限に合わせる）
UPSERT_BATCH_SIZE = 500    # upsert のバッチサイズ
CORRECTION_CAP    = 3.0    # trouble_value の上限（馬身）
RATING_DAMP       = 0.05   # L2正則化係数。証拠の薄い馬のratingを0に引き戻す

# 施策1：補正ペナルティ閾値
# この補正量（馬身）でペナルティが50%になる。小さいほど補正への懐疑が強い
CORRECTION_PENALTY_THRESHOLD = 2.0

# 施策2：Dual-Solve Blendパラメータ
BLEND_THRESHOLD = 3.0   # この差（馬身）でblend_ratioが最大に達する
MAX_BLEND       = 0.5   # 最大ブレンド比率（rawに引き戻す最大割合）

# trouble以外の補正係数（1.0=そのまま、0.5=半分に緩める）
# ペース・馬場・気性・体重は主観評価のブレが大きいため緩めに設定
CORRECTION_SCALE: dict[str, float] = {
    "trouble_value":        1.0,  # 出遅れ・不利：そのまま
    "temperament_value":    0.5,  # 気性・折り合い：半分
    "weight_effect_value":  0.5,  # 体重増減：半分
    "track_condition_value":0.5,  # 馬場適性：半分
    "pace_effect_value":    0.5,  # ペース影響：半分
}

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
    """5補正項目の合計。trouble はキャップあり、他は CORRECTION_SCALE で緩める。
    合計がマイナス（条件が向いた方向）は無視する。
    プラス方向（不利・ロスの説明）のみを能力推定に使う。"""
    trouble = perf.get("trouble_value") or 0.0
    trouble = max(-CORRECTION_CAP, min(CORRECTION_CAP, trouble))
    others = sum(
        (perf.get(k) or 0.0) * CORRECTION_SCALE[k]
        for k in CORRECTION_KEYS if k != "trouble_value"
    )
    return max(0.0, trouble + others)


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
    use_corrections: bool = True,
) -> float:
    """
    2頭の補正後能力差を計算する（正 = pa が pb より強い）。
    use_corrections=False のとき補正・track_biasを無視し生の着差のみ返す。
    着差データがあれば累積着差ベース、なければ着順差×0.5 にフォールバック。
    """
    ca = cum_map.get(pa["horse_id"])
    cb = cum_map.get(pb["horse_id"])

    if ca is not None and cb is not None:
        base_diff = cb - ca          # 正 = pa が先着（強い）
    else:
        base_diff = (pb["finish_order"] - pa["finish_order"]) * 0.5

    if not use_corrections:
        return base_diff

    corr_a = correction_sum(pa)
    corr_b = correction_sum(pb)
    return base_diff + corr_a - corr_b + track_bias


# ── ペア生成 ──────────────────────────────────────────────────────────────────

def build_pairs(
    all_perfs: list[dict],
    use_corrections: bool = True,
) -> list[tuple[int, int, float, float]]:
    """
    全レースの全出走ペアを生成する。
    disregard の馬はスキップ。重みが MIN_WEIGHT 未満もスキップ。

    use_corrections=False のとき補正を無視した rawペアを生成（Dual-Solve Blend用）。
    use_corrections=True のとき施策1の補正ペナルティも重みに乗算する。

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

        race_date  = valid[0].get("race_date", "")
        track_bias = float(valid[0].get("track_bias_value") or 0.0) if use_corrections else 0.0
        t_w        = time_weight(race_date)

        cum_map = build_cum_margins(valid)

        for i, pa in enumerate(valid):
            for pb in valid[i + 1:]:
                diff = adjusted_diff(pa, pb, cum_map, track_bias, use_corrections)

                # LLM補正の有無でウェイト調整
                llm_w = 1.0 if (has_llm(pa) and has_llm(pb)) else LLM_ABSENT_WEIGHT

                if use_corrections:
                    # 施策1：補正ペナルティ — 補正量が大きいほど重みを下げる
                    total_corr = abs(correction_sum(pa)) + abs(correction_sum(pb))
                    corr_penalty = 1.0 / (1.0 + (total_corr / CORRECTION_PENALTY_THRESHOLD) ** 2)
                    w = t_w * llm_w * corr_penalty
                else:
                    w = t_w * llm_w

                if w < MIN_WEIGHT:
                    continue

                pairs.append((pa["horse_id"], pb["horse_id"], diff, w))

    return pairs


# ── 最小二乗求解 ──────────────────────────────────────────────────────────────

IRLS_ITERATIONS  = 5      # IRLSの反復回数
IRLS_HUBER_DELTA = 2.0   # Huber閾値（馬身）。これより大きい残差を外れ値として下げる

def solve_ratings(
    pairs: list[tuple[int, int, float, float]],
) -> dict[int, float]:
    """
    IRLS（反復重み付き最小二乗法）でグローバルレーティングを算出する。
    外れ値ペア（予測と実態が大きくかけ離れているペア）を自動的に downweight する。
    アンカー：全馬の平均 = 0。
    Returns: {horse_id: rating}
    """
    horses = sorted({h for a, b, _, _ in pairs for h in (a, b)})
    n      = len(horses)
    idx    = {h: i for i, h in enumerate(horses)}
    m      = len(pairs)

    print(f"  行列サイズ: {m} ペア × {n} 馬")

    # 初期ロバスト重み（全1.0）
    robust_w = np.ones(m, dtype=float)

    ratings = np.zeros(n, dtype=float)

    for irls_iter in range(IRLS_ITERATIONS):
        A = lil_matrix((m + 1, n), dtype=float)
        b = np.zeros(m + 1, dtype=float)

        for k, (ha, hb, diff, w) in enumerate(pairs):
            ew = w * robust_w[k]   # 元の重み × ロバスト重み
            A[k, idx[ha]] =  ew
            A[k, idx[hb]] = -ew
            b[k]           = diff * ew

        # アンカー制約：全馬の平均 = 0
        A[m, :] = 1.0
        b[m]    = 0.0

        result  = lsqr(A.tocsr(), b, damp=RATING_DAMP, iter_lim=3000, atol=1e-6, btol=1e-6)
        ratings = result[0]

        # 残差を計算してロバスト重みを更新（Huber重み）
        residuals = np.array([
            ratings[idx[ha]] - ratings[idx[hb]] - diff
            for ha, hb, diff, _ in pairs
        ])
        abs_res = np.abs(residuals)
        robust_w = np.where(
            abs_res <= IRLS_HUBER_DELTA,
            1.0,
            IRLS_HUBER_DELTA / np.maximum(abs_res, 1e-8)
        )

        outliers = int(np.sum(abs_res > IRLS_HUBER_DELTA))
        print(f"  IRLS {irls_iter + 1}/{IRLS_ITERATIONS}: 残差ノルム={result[3]:.4f}  外れ値ペア={outliers}件")

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

    print("=== compute_ratings.py (Dual-Solve Blend) ===")
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

    # ── Step 1: rawペア生成（補正なし） ──────────────────────────────────────
    print("\n2. rawペア生成中（補正なし・time_decay/llm_weightのみ）...")
    raw_pairs = build_pairs(all_perfs, use_corrections=False)
    print(f"  {len(raw_pairs)} ペア生成")

    if not raw_pairs:
        print("❌ 有効なrawペアが0件です。データを確認してください。")
        sys.exit(1)

    # ── Step 2: correctedペア生成（補正+ペナルティあり） ─────────────────────
    print("\n3. correctedペア生成中（補正+施策1ペナルティ）...")
    corrected_pairs = build_pairs(all_perfs, use_corrections=True)
    print(f"  {len(corrected_pairs)} ペア生成")

    # ── Step 3: raw solve ────────────────────────────────────────────────────
    print("\n4. rawレーティング計算中（最小二乗法）...")
    raw_ratings = solve_ratings(raw_pairs)
    print(f"  {len(raw_ratings)} 頭の raw_rating を算出")

    # ── Step 4: corrected solve ──────────────────────────────────────────────
    print("\n5. correctedレーティング計算中（最小二乗法）...")
    corrected_ratings = solve_ratings(corrected_pairs)
    print(f"  {len(corrected_ratings)} 頭の corrected_rating を算出")

    # ── Step 5: Dual-Solve Blend ─────────────────────────────────────────────
    print(f"\n6. Dual-Solve Blend（BLEND_THRESHOLD={BLEND_THRESHOLD}, MAX_BLEND={MAX_BLEND}）...")
    all_horses = set(raw_ratings.keys()) | set(corrected_ratings.keys())
    final_ratings: dict[int, float] = {}
    blend_stats = {"no_blend": 0, "partial": 0, "max_blend": 0}

    for h in all_horses:
        raw_r  = raw_ratings.get(h, 0.0)
        corr_r = corrected_ratings.get(h, 0.0)
        gap    = abs(corr_r - raw_r)
        blend_ratio = min(gap / BLEND_THRESHOLD, MAX_BLEND)
        final_ratings[h] = corr_r * (1 - blend_ratio) + raw_r * blend_ratio

        if blend_ratio == 0:
            blend_stats["no_blend"] += 1
        elif blend_ratio >= MAX_BLEND:
            blend_stats["max_blend"] += 1
        else:
            blend_stats["partial"] += 1

    print(f"  ブレンドなし: {blend_stats['no_blend']} 頭")
    print(f"  部分ブレンド: {blend_stats['partial']} 頭")
    print(f"  最大ブレンド（≥{MAX_BLEND}）: {blend_stats['max_blend']} 頭")

    # ── Step 6: 残差・接続数（final_ratingsに対して再計算） ──────────────────
    print("\n7. 残差・接続数を計算中（correctedペア × final_ratings）...")
    errors, connections = calc_errors_and_connections(corrected_pairs, final_ratings)

    # 走数カウント（disregard 除外）
    race_counts: dict[int, set[str]] = defaultdict(set)
    for p in all_perfs:
        if p.get("eval_tag") != "disregard":
            race_counts[p["horse_id"]].add(p["race_id"])

    # ── Step 7: upsert ───────────────────────────────────────────────────────
    print("\n8. horse_ratings に upsert 中...")
    records = []
    for horse_id, rating in final_ratings.items():
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

    print(f"  upsert 対象: {len(records)} 頭（{len(final_ratings) - len(records)} 頭は走数不足でスキップ）")

    for i in range(0, len(records), UPSERT_BATCH_SIZE):
        chunk = records[i : i + UPSERT_BATCH_SIZE]
        supabase.from_("horse_ratings").upsert(
            chunk, on_conflict="horse_id"
        ).execute()
        print(f"  {min(i + UPSERT_BATCH_SIZE, len(records))} / {len(records)} 完了")

    print(f"\n{'='*50}")
    print(f"✅ 完了: {len(records)} 頭の rating を更新しました")
    if final_ratings:
        sorted_r = sorted(final_ratings.items(), key=lambda x: x[1], reverse=True)
        print(f"\n  rating 上位5頭（horse_id: final_rating / corrected / raw）:")
        for hid, r in sorted_r[:5]:
            print(f"    {hid}: final={r:+.3f}  corr={corrected_ratings.get(hid, 0):+.3f}  raw={raw_ratings.get(hid, 0):+.3f}")


if __name__ == "__main__":
    main()
