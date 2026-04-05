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
}

export interface UpcomingEntryWithForm extends UpcomingEntry {
  recentPerfs: RecentPerf[];
}

/** 近走の実力以下が 2走以上 → 次走買い候補 */
export function isBuyCandidate(recentPerfs: RecentPerf[]): boolean {
  const valid = recentPerfs.filter((p) => p.eval_tag !== "disregard");
  return valid.filter((p) => p.eval_tag === "below").length >= 2;
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
