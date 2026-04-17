export type EvalTag = "above" | "fair" | "below" | "disregard";
export type Surface = "芝" | "ダート";
export type TrackCondition = "良" | "稍重" | "重" | "不良";
export type Grade = "G1" | "G2" | "G3" | "OP" | "3勝" | "2勝" | "1勝" | "未勝利" | "新馬";

export interface Race {
  race_id: string;
  race_name: string;
  race_date: string;
  track: string;
  distance: number;
  surface: Surface;
  grade: Grade;
  track_condition: TrackCondition;
  lap_times: number[] | null;
  pace: string | null;
  race_number: number | null;
  kai_nichi: string | null;
  track_bias_level: string | null;
  track_bias_value: number | null;
  track_bias_summary: string | null;
  course_aptitude_level: string | null;
  course_aptitude_value: number | null;
  course_aptitude_summary: string | null;
  pace_level: string | null;
  pace_value: number | null;
  pace_summary: string | null;
}

export interface Horse {
  horse_id: number;
  name: string;
  born_year: number | null;
  trainer: string | null;
}

export interface HorsePerformance {
  id: number;
  race_id: string;
  horse_id: number;
  finish_order: number;
  margin: number | null;
  weight_carried: number | null;
  horse_weight: string | null;
  position_order: string | null;
  frame_number: number | null;
  horse_number: number | null;
  trouble_level: string | null;
  trouble_value: number | null;
  trouble_summary: string | null;
  temperament_level: string | null;
  temperament_value: number | null;
  temperament_summary: string | null;
  weight_effect_level: string | null;
  weight_effect_value: number | null;
  weight_effect_summary: string | null;
  track_condition_level: string | null;
  track_condition_value: number | null;
  track_condition_summary: string | null;
  pace_effect_level: string | null;
  pace_effect_value: number | null;
  pace_effect_summary: string | null;
  eval_tag: EvalTag | null;
  horses?: Horse;
}

export interface RaceWithPerformances extends Race {
  horse_performances: HorsePerformance[];
}

// フロントエンドで計算する値（null は 0 扱い）
export function calcAptitudeValue(p: HorsePerformance): number {
  return (p.track_condition_value ?? 0) + (p.pace_effect_value ?? 0);
}

export function calcLossValue(p: HorsePerformance): number {
  return (p.trouble_value ?? 0) + (p.temperament_value ?? 0) + (p.weight_effect_value ?? 0);
}

export function calcAbilityValue(p: HorsePerformance): number {
  return calcAptitudeValue(p) + calcLossValue(p);
}

export function abilitySymbol(value: number): string {
  if (value >= 2.0) return "◎";
  if (value >= 1.0) return "○";
  if (value >= 0) return "△";
  return "×";
}

export function symbolColorClass(symbol: string): string {
  switch (symbol) {
    case "◎": return "text-[var(--kaiko-sym-good)]";
    case "○": return "text-[var(--kaiko-sym-great)]";
    case "△": return "text-[var(--kaiko-sym-fair)]";
    case "×": return "text-[var(--kaiko-sym-bad)]";
    default: return "text-[var(--kaiko-text-muted)]";
  }
}

// ────────── 出走前（upcoming）────────────────────────────────────────────────

export interface UpcomingRace {
  race_id: string;
  race_name: string;
  race_date: string;
  track: string;
  distance: number;
  surface: Surface;
  grade: Grade;
  race_number: number | null;
  head_count: number | null;
  odds_updated_at: string | null;
}

export interface UpcomingEntry {
  id: number;
  race_id: string;
  horse_id: number | null;
  horse_name: string;
  frame_number: number | null;
  horse_number: number | null;
  jockey: string | null;
  weight_carried: number | null;
  odds: number | null;
  popularity: number | null;
}

export interface RecentPerf {
  race_name: string;
  race_date: string;
  race_id: string;
  finish_order: number;
  margin: number | null;
  /** 1着からの累積着差（馬身）。データがあれば calcCorrectedScore のベースに使う */
  cumulative_margin: number | null;
  eval_tag: EvalTag | null;
  // ability_value 計算用
  trouble_value: number | null;
  temperament_value: number | null;
  weight_effect_value: number | null;
  track_condition_value: number | null;
  pace_effect_value: number | null;
}

export interface UpcomingEntryWithForm extends UpcomingEntry {
  recentPerfs: RecentPerf[];
}

/** 近走の実力以下が 2走以上 → 次走買い候補 */
export function isBuyCandidate(recentPerfs: RecentPerf[]): boolean {
  const valid = recentPerfs.filter((p) => p.eval_tag !== "disregard");
  return valid.filter((p) => p.eval_tag === "below").length >= 2;
}

/**
 * 1走分の補正後スコアを計算（小さいほど強い）
 * cumulative_margin がある場合は着差ベース（比較ページと同一の物差し）、
 * なければ着順ベースにフォールバック。
 */
export function calcCorrectedScore(perf: RecentPerf): number {
  const ability =
    (perf.trouble_value ?? 0) +
    (perf.temperament_value ?? 0) +
    (perf.weight_effect_value ?? 0) +
    (perf.track_condition_value ?? 0) +
    (perf.pace_effect_value ?? 0);
  const cm = perf.cumulative_margin;
  const base = (cm !== null && cm !== undefined && Number.isFinite(cm)) ? cm : perf.finish_order;
  return base - ability;
}

export interface ValueBetDetail {
  /** 能力推定ランク（1=最強）: 補正スコア平均の昇順 */
  abilityRank: number;
  /** 人気順（1=最人気） */
  oddsRank: number;
  /** 補正スコア平均（小さいほど強い）: finish_order - ability_value の平均 */
  avgScore: number;
  /** 分析に使った非度外視走数 */
  racesAnalyzed: number;
}

/**
 * 出走前レースの「逆張り買い」詳細。
 * 各馬の直近5走（disregard除外、最低1走必要）の補正スコア平均でランク付けし、
 * 能力ランク < 人気ランク（能力の割に人気がない）の馬を返す。
 *
 * 返り値: horse_id → ValueBetDetail の Map（フラグ立ちの馬のみ）
 */
export function calcValueBetDetails(
  entries: UpcomingEntryWithForm[]
): Map<number, ValueBetDetail> {
  const result = new Map<number, ValueBetDetail>();

  const withScore = entries
    .filter((e) => e.horse_id !== null && e.odds !== null && e.popularity !== null)
    .map((e) => {
      const valid = e.recentPerfs.filter((p) => p.eval_tag !== "disregard");
      // 最低1走の非度外視データが必要
      if (valid.length < 1) return null;
      const avg = valid.reduce((sum, p) => sum + calcCorrectedScore(p), 0) / valid.length;
      return { horse_id: e.horse_id!, avg, oddsRank: e.popularity!, racesAnalyzed: valid.length };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // 能力ランク: avg 昇順（小さいほど強い → ランク1が最強）
  const sorted = [...withScore].sort((a, b) => a.avg - b.avg);
  sorted.forEach((x, i) => {
    const abilityRank = i + 1;
    // 能力ランク < 人気ランク = 「能力の割に人気がない」＝ 逆張り買い
    if (abilityRank < x.oddsRank) {
      result.set(x.horse_id, {
        abilityRank,
        oddsRank: x.oddsRank,
        avgScore: Math.round(x.avg * 10) / 10,
        racesAnalyzed: x.racesAnalyzed,
      });
    }
  });

  return result;
}

/**
 * 全出走馬の能力推定ランクを返す（データがある馬のみ）。
 * 返り値: horse_id → abilityRank（1=最強）
 */
export function calcAllAbilityRanks(
  entries: UpcomingEntryWithForm[]
): Map<number, number> {
  const result = new Map<number, number>();
  const withScore = entries
    .filter((e) => e.horse_id !== null)
    .map((e) => {
      const valid = e.recentPerfs.filter((p) => p.eval_tag !== "disregard");
      if (valid.length < 1) return null;
      const avg = valid.reduce((sum, p) => sum + calcCorrectedScore(p), 0) / valid.length;
      return { horse_id: e.horse_id!, avg };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  [...withScore]
    .sort((a, b) => a.avg - b.avg)
    .forEach((x, i) => result.set(x.horse_id, i + 1));

  return result;
}

/** @deprecated calcValueBetDetails を使ってください */
export function calcValueBetFlags(entries: UpcomingEntryWithForm[]): Set<number> {
  return new Set(calcValueBetDetails(entries).keys());
}

// ────────── 期待値ベース推奨シンボル ──────────────────────────────────────────

export type PickSymbol = "◎" | "○" | "▲" | "△" | "★" | "✓";

export interface HorsePick {
  symbol: PickSymbol;
  /** 推定勝率（%）*/
  winProb: number;
  /** 期待値 = 推定勝率 × 単勝オッズ */
  ev: number;
}

/**
 * 出走馬ごとの推奨シンボルと期待値を計算する。
 *
 * 【シンボル割り当て】
 * valueScore = (人気順 - 能力順) / 能力順 でランク付け。
 * 能力順 < 人気順（能力の割に人気がない）の馬のみ対象。
 * 同じギャップ幅でも能力が高いほど高スコアになるため、
 * 元々能力が低い馬は過大評価されにくい。
 * - ◎○▲△：valueScore 上位4頭（gap > 0 の馬のみ）
 * - ✓：データあり・バリュー外（能力順 ≥ 人気順）
 *
 * 【EV・winProb】
 * 能力スコアと市場確率（1/オッズ）のブレンドで推定勝率を計算。
 * シンボル割り当てには使わず表示用として残す。
 */
export function calcHorsePicks(
  entries: UpcomingEntryWithForm[],
  _valueBetMap: Map<number, ValueBetDetail>,
  k = 0.3,
  marketWeight = 0.75,
  /** horse_ratings から事前計算したランクマップ。渡された場合は calcAllAbilityRanks の代わりに使用 */
  precomputedRankMap?: Map<number, number>
): Map<number, HorsePick> {
  const result = new Map<number, HorsePick>();

  const totalEntries = entries.length;
  if (totalEntries === 0) return result;

  // ── EV 計算（winProb / ev の表示用）──────────────────────────────
  const eligible = entries
    .map((e) => {
      if (!e.horse_id || !e.odds) return null;
      const valid = e.recentPerfs.filter((p) => p.eval_tag !== "disregard");
      if (valid.length < 1) return null;
      const avg = valid.reduce((sum, p) => sum + calcCorrectedScore(p), 0) / valid.length;
      return { horse_id: e.horse_id, avg, odds: e.odds };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const evMap = new Map<number, { winProb: number; ev: number }>();
  if (eligible.length > 0) {
    const abilityRaws = eligible.map((h) => Math.exp(-h.avg * k));
    const abilityTotal = abilityRaws.reduce((a, b) => a + b, 0);
    const marketRaws = eligible.map((h) => 1 / h.odds);
    const marketTotal = marketRaws.reduce((a, b) => a + b, 0);
    const eligibleShare = eligible.length / totalEntries;
    eligible.forEach((h, i) => {
      const abilityProb = abilityRaws[i] / abilityTotal;
      const marketProb  = marketRaws[i]  / marketTotal;
      const blended = (1 - marketWeight) * abilityProb + marketWeight * marketProb;
      const prob = blended * eligibleShare;
      evMap.set(h.horse_id, {
        winProb: Math.round(prob * 1000) / 10,
        ev: Math.round(prob * h.odds * 100) / 100,
      });
    });
  }

  // ── シンボル割り当て: valueScore = gap / abilityRank ─────────────
  // precomputedRankMap（horse_ratings ベース）があればそちらを優先
  const abilityRankMap = precomputedRankMap ?? calcAllAbilityRanks(entries);

  const valueCandidates = entries
    .filter((e) => e.horse_id != null && e.popularity != null)
    .flatMap((e) => {
      const abilityRank = abilityRankMap.get(e.horse_id!);
      if (!abilityRank) return [];
      const oddsRank = e.popularity!;
      const gap = oddsRank - abilityRank;
      if (gap <= 0) return [];
      return [{ horse_id: e.horse_id!, abilityRank, oddsRank, valueScore: gap / abilityRank }];
    })
    .sort((a, b) => b.valueScore - a.valueScore);

  const mainSymbols: PickSymbol[] = ["◎", "○", "▲", "△"];
  const assignedIds = new Set<number>();

  valueCandidates.forEach((h, i) => {
    const symbol = i < mainSymbols.length ? mainSymbols[i] : "★";
    const ev = evMap.get(h.horse_id) ?? { winProb: 0, ev: 0 };
    result.set(h.horse_id, { symbol, ...ev });
    assignedIds.add(h.horse_id);
  });

  // データあり・バリュー外 → ✓
  for (const e of entries) {
    if (e.horse_id != null && !assignedIds.has(e.horse_id) && abilityRankMap.has(e.horse_id)) {
      const ev = evMap.get(e.horse_id) ?? { winProb: 0, ev: 0 };
      result.set(e.horse_id, { symbol: "✓", ...ev });
    }
  }

  return result;
}

// ────────── グローバルレーティング ───────────────────────────────────────────

/** compute_ratings.py が計算し horse_ratings テーブルに保存するレーティング */
export interface HorseRating {
  horse_id: number;
  rating: number;
  rating_error: number | null;
  races_analyzed: number;
  connected_horses: number | null;
  computed_at: string;
}

export type Database = {
  public: {
    Tables: {
      races: { Row: Race; Insert: Partial<Race>; Update: Partial<Race> };
      horses: { Row: Horse; Insert: Partial<Horse>; Update: Partial<Horse> };
      horse_performances: { Row: HorsePerformance; Insert: Partial<HorsePerformance>; Update: Partial<HorsePerformance> };
      horse_ratings: { Row: HorseRating; Insert: Partial<HorseRating>; Update: Partial<HorseRating> };
    };
  };
};
