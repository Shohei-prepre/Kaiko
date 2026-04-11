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
  finish_order: number;
  margin: number | null;
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

/** 1走分の補正後スコアを計算（小さいほど強い） */
export function calcCorrectedScore(perf: RecentPerf): number {
  const ability =
    (perf.trouble_value ?? 0) +
    (perf.temperament_value ?? 0) +
    (perf.weight_effect_value ?? 0) +
    (perf.track_condition_value ?? 0) +
    (perf.pace_effect_value ?? 0);
  return perf.finish_order - ability;
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
 * 【確率推定の考え方】
 * - 推定勝率 = 能力スコア確率（ソフトマックス）× (1-marketWeight)
 *            + 市場確率（1/オッズの正規化）× marketWeight のブレンド
 * - marketWeight=0 → 純能力評価、marketWeight=1 → 純オッズ市場追従
 * - eligible が全出走頭数より少ない場合は (eligible数 / 全頭数) に圧縮し
 *   過大評価を防ぐ
 *
 * 【EVの意味】
 * - EV = 推定勝率 × 単勝オッズ
 * - EV > 1.0 なら「理論上プラス収支」の馬
 * - 印は EV 降順で ◎○▲△ を割り当て
 * - ★：逆張りフラグ馬のうち EV 最高かつ ◎○▲△ 外の 1 頭
 * - ✓：データあり・上記以外
 *
 * @param k            ソフトマックス感度（大きいほどスコア差が確率差に強く出る）
 * @param marketWeight 市場オッズへの重み 0〜1（0=純能力、1=純市場）
 */
export function calcHorsePicks(
  entries: UpcomingEntryWithForm[],
  valueBetMap: Map<number, ValueBetDetail>,
  k = 0.3,
  marketWeight = 0.75  // ← ここを変えて人気 vs 能力のバランスを調整
): Map<number, HorsePick> {
  const result = new Map<number, HorsePick>();

  const totalEntries = entries.length;
  if (totalEntries === 0) return result;

  // 過去1走以上の非度外視データ + オッズがある馬のみ対象
  const eligible = entries
    .map((e) => {
      if (!e.horse_id || !e.odds) return null;
      const valid = e.recentPerfs.filter((p) => p.eval_tag !== "disregard");
      if (valid.length < 1) return null;
      const avg = valid.reduce((sum, p) => sum + calcCorrectedScore(p), 0) / valid.length;
      return { horse_id: e.horse_id, avg, odds: e.odds };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // eligible が0頭なら印なし
  if (eligible.length < 1) return result;

  // ── 能力確率: ソフトマックス（補正スコアが低いほど強い）──────────
  const abilityRaws = eligible.map((h) => Math.exp(-h.avg * k));
  const abilityTotal = abilityRaws.reduce((a, b) => a + b, 0);

  // ── 市場確率: オッズの逆数（eligible内で正規化）──────────────────
  // 低オッズ（人気馬）ほど高い確率になる
  const marketRaws = eligible.map((h) => 1 / h.odds);
  const marketTotal = marketRaws.reduce((a, b) => a + b, 0);

  // eligible 全体に割り当てる確率シェア = eligible数 / 全頭数
  const eligibleShare = eligible.length / totalEntries;

  const evList = eligible.map((h, i) => {
    const abilityProb = abilityRaws[i] / abilityTotal;
    const marketProb  = marketRaws[i]  / marketTotal;
    // ブレンド: marketWeight で人気側と能力側のバランスを取る
    const blended = (1 - marketWeight) * abilityProb + marketWeight * marketProb;
    const prob = blended * eligibleShare;
    const ev   = prob * h.odds;
    return { horse_id: h.horse_id, prob, ev };
  });

  // EV 降順にソート
  const sorted = [...evList].sort((a, b) => b.ev - a.ev);

  // ◎○▲△ を上位4頭に割り当て
  const mainSymbols: PickSymbol[] = ["◎", "○", "▲", "△"];
  const top4Ids = new Set<number>();
  const symbolMap = new Map<number, PickSymbol>();

  sorted.forEach((h, i) => {
    if (i < 4) {
      symbolMap.set(h.horse_id, mainSymbols[i]);
      top4Ids.add(h.horse_id);
    } else {
      symbolMap.set(h.horse_id, "✓");
    }
  });

  // ★: 逆張りフラグ馬のうち EV 最高かつ top4 外の 1 頭
  const bestStar = sorted.find(
    (h) => valueBetMap.has(h.horse_id) && !top4Ids.has(h.horse_id)
  );
  if (bestStar) {
    symbolMap.set(bestStar.horse_id, "★");
  }

  // 結果 Map を組み立て（確率は % 表示、EV は小数2桁）
  evList.forEach((h) => {
    result.set(h.horse_id, {
      symbol: symbolMap.get(h.horse_id)!,
      winProb: Math.round(h.prob * 1000) / 10,   // 例: 0.123 → 12.3%
      ev: Math.round(h.ev * 100) / 100,           // 例: 1.23
    });
  });

  return result;
}

export type Database = {
  public: {
    Tables: {
      races: { Row: Race; Insert: Partial<Race>; Update: Partial<Race> };
      horses: { Row: Horse; Insert: Partial<Horse>; Update: Partial<Horse> };
      horse_performances: { Row: HorsePerformance; Insert: Partial<HorsePerformance>; Update: Partial<HorsePerformance> };
    };
  };
};
