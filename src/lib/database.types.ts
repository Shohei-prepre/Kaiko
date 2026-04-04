export type EvalTag = "above" | "fair" | "below" | "disregard";
export type Surface = "芝" | "ダート";
export type TrackCondition = "良" | "稍重" | "重" | "不良";
export type Grade = "G1" | "G2" | "G3" | "OP" | "3勝" | "2勝" | "1勝" | "未勝利" | "新馬";

export interface Race {
  id: string;
  race_name: string;
  race_date: string;
  track: string;
  distance: number;
  surface: Surface;
  grade: Grade;
  track_condition: TrackCondition;
  lap_times: number[] | null;
  pace: string | null;
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
  id: string;
  name: string;
  born_year: number | null;
  trainer: string | null;
}

export interface HorsePerformance {
  id: string;
  race_id: string;
  horse_id: string;
  finish_order: number;
  margin: number | null;
  weight_carried: number | null;
  horse_weight: number | null;
  position_order: string | null;
  frame_number: number | null;
  horse_number: number | null;
  trouble_level: string | null;
  trouble_value: number;
  trouble_summary: string | null;
  temperament_level: string | null;
  temperament_value: number;
  temperament_summary: string | null;
  weight_effect_level: string | null;
  weight_effect_value: number;
  weight_effect_summary: string | null;
  track_condition_level: string | null;
  track_condition_value: number;
  track_condition_summary: string | null;
  pace_effect_level: string | null;
  pace_effect_value: number;
  pace_effect_summary: string | null;
  eval_tag: EvalTag | null;
  horses?: Horse;
}

export interface RaceWithPerformances extends Race {
  horse_performances: HorsePerformance[];
}

// フロントエンドで計算する値
export function calcAptitudeValue(p: HorsePerformance): number {
  return p.track_condition_value + p.pace_effect_value;
}

export function calcLossValue(p: HorsePerformance): number {
  return p.trouble_value + p.temperament_value + p.weight_effect_value;
}

export function calcAbilityValue(p: HorsePerformance): number {
  return calcAptitudeValue(p) + calcLossValue(p);
}

// abilityValue から評価記号を返す
export function abilitySymbol(value: number): string {
  if (value >= 2.0) return "◎";
  if (value >= 1.0) return "○";
  if (value >= 0) return "△";
  return "×";
}

export type SymbolColor = "great" | "good" | "fair" | "bad";
export function symbolColorClass(symbol: string): string {
  switch (symbol) {
    case "◎": return "text-[var(--kaiko-sym-good)]";
    case "○": return "text-[var(--kaiko-sym-great)]";
    case "△": return "text-[var(--kaiko-sym-fair)]";
    case "×": return "text-[var(--kaiko-sym-bad)]";
    default: return "text-[var(--kaiko-text-muted)]";
  }
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
