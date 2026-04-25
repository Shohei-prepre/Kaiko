// picks/page.tsx
// レース詳細（/races/upcoming/[id]）と全く同じロジックで印を算出する。
// - 能力ランク: horse_ratings（なければ補正スコアフォールバック）
// - 適正ランク: 推奨ペースパターン × 脚質 × 枠順バイアス補正後のスコア順
// - ◎ = 適正ランク1位、○ = 適正ランク2位

import { supabase } from "@/lib/supabase";
import type {
  UpcomingEntry,
  UpcomingEntryWithForm,
  RecentPerf,
  EvalTag,
} from "@/lib/database.types";
import { calcAllAbilityRanks } from "@/lib/database.types";
import { buildRaceMarginMaps } from "@/lib/parseMargin";
import { getCourseCharacteristic } from "@/lib/courseCharacteristics";
import PicksClient from "./PicksClient";
import type { RaceWithPicks, PickEntry } from "./PicksClient";

// ─── 定数（UpcomingRaceClientと同値） ─────────────────────────────
const PACE_ADJUSTMENT = 0.7;
const BIAS_MAGNITUDE: Record<string, number> = { "◎": 0.6, "○": 0.4, "△": 0.2, "×": 0.0 };
const FRAME_INNER = [1, 2, 3];
const FRAME_OUTER = [6, 7, 8];

// ─── 走法判定（race detail の page.tsx と同一） ───────────────────
function calcRunningStyle(positionOrders: (string | null)[]): string | null {
  const firsts = positionOrders
    .map((p) => {
      if (!p) return null;
      const n = parseInt(p.split("-")[0], 10);
      return isNaN(n) ? null : n;
    })
    .filter((n): n is number => n !== null);
  if (firsts.length === 0) return null;
  const avg = firsts.reduce((a, b) => a + b, 0) / firsts.length;
  if (avg <= 2.0) return "逃げ";
  if (avg <= 4.5) return "先行";
  if (avg <= 9.0) return "差し";
  return "追い込み";
}

// ─── ペースパターン推定（race detail の page.tsx と同一） ─────────
function calcPacePattern(
  runningStyleMap: Map<number, string>
): "前残り" | "差し有利" | "フラット" {
  const styles = [...runningStyleMap.values()];
  const escape = styles.filter((s) => s === "逃げ").length;
  const lead   = styles.filter((s) => s === "先行").length;
  if (escape >= 2) return "差し有利";
  if (escape === 1 && lead <= 3) return "前残り";
  if (escape === 0) return "フラット";
  return "差し有利";
}

// ─── 適正スコア計算（UpcomingRaceClient と同一ロジック） ─────────
function calcAdjustedScore(
  baseRating: number,
  runningStyle: string | null,
  frameNumber: number | null,
  pace: "前残り" | "差し有利" | "フラット",
  biasLevel: string | null,
  postBias: string | null
): number {
  let score = baseRating;
  if (pace === "前残り") {
    if (runningStyle === "逃げ" || runningStyle === "先行") score += PACE_ADJUSTMENT;
    else if (runningStyle === "差し" || runningStyle === "追い込み") score -= PACE_ADJUSTMENT;
  } else if (pace === "差し有利") {
    if (runningStyle === "差し" || runningStyle === "追い込み") score += PACE_ADJUSTMENT;
    else if (runningStyle === "逃げ" || runningStyle === "先行") score -= PACE_ADJUSTMENT;
  }
  if (biasLevel && frameNumber && postBias) {
    const mag = BIAS_MAGNITUDE[biasLevel] ?? 0;
    if (mag > 0) {
      const innerFavor = postBias.includes("内枠") && !postBias.includes("外枠有利");
      const outerFavor = postBias.includes("外枠") && !postBias.includes("内枠有利");
      if (innerFavor) {
        if (FRAME_INNER.includes(frameNumber)) score += mag;
        else if (FRAME_OUTER.includes(frameNumber)) score -= mag;
      } else if (outerFavor) {
        if (FRAME_OUTER.includes(frameNumber)) score += mag;
        else if (FRAME_INNER.includes(frameNumber)) score -= mag;
      }
    }
  }
  return score;
}

// ─── データ取得 ─────────────────────────────────────────────────
async function fetchPicksData(): Promise<RaceWithPicks[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: upcomingRaces } = await (supabase as any)
      .from("upcoming_races")
      .select("race_id, race_name, race_date, track, grade, surface, distance, race_number, track_bias_level, track_bias_summary, head_count")
      .gte("race_date", today)
      .order("race_date")
      .order("race_number");

    if (!upcomingRaces || upcomingRaces.length === 0) return [];

    const raceIds = (upcomingRaces as { race_id: string }[]).map((r) => r.race_id);

    const { data: allEntries } = await (supabase as any)
      .from("upcoming_entries")
      .select("*")
      .in("race_id", raceIds);

    if (!allEntries || allEntries.length === 0) return [];

    const entries = allEntries as (UpcomingEntry & { race_id: string })[];

    // horse_id の名寄せ
    const horseIds = [...new Set(
      entries.map((e) => e.horse_id).filter((id): id is number => id !== null)
    )];
    const noIdNames = [...new Set(
      entries.filter((e) => !e.horse_id).map((e) => e.horse_name)
    )];
    const nameToIdMap = new Map<string, number>();
    if (noIdNames.length > 0) {
      const { data: horses } = await supabase
        .from("horses")
        .select("horse_id, name")
        .in("name", noIdNames);
      for (const h of (horses ?? []) as { horse_id: number; name: string }[]) {
        nameToIdMap.set(h.name, h.horse_id);
      }
    }
    const allHorseIds = [...new Set([
      ...horseIds,
      ...Array.from(nameToIdMap.values()),
    ])];

    // horse_ratings 一括取得
    const ratingByHorseId = new Map<number, number>();
    if (allHorseIds.length > 0) {
      const { data: ratings } = await (supabase as any)
        .from("horse_ratings")
        .select("horse_id, rating")
        .in("horse_id", allHorseIds);
      for (const r of (ratings ?? []) as { horse_id: number; rating: number }[]) {
        ratingByHorseId.set(r.horse_id, r.rating);
      }
    }

    // horse_performances 一括取得（走法計算 + 補正スコアフォールバック用）
    type RawPerf = {
      horse_id: number;
      race_id: string;
      finish_order: number;
      margin: number | null;
      eval_tag: EvalTag | null;
      trouble_value: number | null;
      temperament_value: number | null;
      weight_effect_value: number | null;
      track_condition_value: number | null;
      pace_effect_value: number | null;
      position_order: string | null;
      races: { race_name: string; race_date: string } | null;
    };

    const recentPerfsMap = new Map<number, RecentPerf[]>();
    const runningStyleMapAll = new Map<number, string>();

    if (allHorseIds.length > 0) {
      const { data: perfs } = await supabase
        .from("horse_performances")
        .select(`
          horse_id, race_id, finish_order, margin, eval_tag,
          trouble_value, temperament_value, weight_effect_value,
          track_condition_value, pace_effect_value, position_order,
          races ( race_name, race_date )
        `)
        .in("horse_id", allHorseIds);

      const byHorse = new Map<number, RawPerf[]>();
      for (const row of (perfs ?? []) as RawPerf[]) {
        if (!row.races) continue;
        if (!byHorse.has(row.horse_id)) byHorse.set(row.horse_id, []);
        byHorse.get(row.horse_id)!.push(row);
      }
      const slicedByHorse = new Map<number, RawPerf[]>();
      for (const [hid, ps] of byHorse.entries()) {
        slicedByHorse.set(
          hid,
          ps.sort((a, b) => b.races!.race_date.localeCompare(a.races!.race_date)).slice(0, 5)
        );
      }

      // 累積着差マップ構築（補正スコアフォールバック用）
      const uniqueRaceIds = [...new Set(
        [...slicedByHorse.values()].flat().map((p) => p.race_id)
      )];
      let raceMarginMaps = new Map<string, Map<number, number>>();
      if (uniqueRaceIds.length > 0) {
        const { data: allMargins } = await (supabase as any)
          .from("horse_performances")
          .select("horse_id, race_id, finish_order, margin")
          .in("race_id", uniqueRaceIds)
          .limit(20000);
        if (allMargins) {
          raceMarginMaps = buildRaceMarginMaps(
            allMargins as { horse_id: number; race_id: string; finish_order: number; margin: number | null }[]
          );
        }
      }

      for (const [hid, sorted] of slicedByHorse.entries()) {
        // 走法計算
        const validPositions = sorted
          .filter((p) => p.eval_tag !== "disregard")
          .map((p) => p.position_order);
        const style = calcRunningStyle(validPositions);
        if (style) runningStyleMapAll.set(hid, style);

        // RecentPerf 組み立て
        recentPerfsMap.set(
          hid,
          sorted.map((p) => {
            const cm = raceMarginMaps.get(p.race_id)?.get(p.horse_id);
            return {
              race_name: p.races!.race_name,
              race_date: p.races!.race_date,
              race_id: p.race_id,
              finish_order: p.finish_order,
              margin: p.margin,
              cumulative_margin: (cm !== undefined && Number.isFinite(cm)) ? cm : null,
              eval_tag: p.eval_tag,
              trouble_value: p.trouble_value,
              temperament_value: p.temperament_value,
              weight_effect_value: p.weight_effect_value,
              track_condition_value: p.track_condition_value,
              pace_effect_value: p.pace_effect_value,
            };
          })
        );
      }
    }

    // ─── レースごとに処理 ──────────────────────────────────────
    const result: RaceWithPicks[] = [];

    for (const race of upcomingRaces as {
      race_id: string; race_name: string; race_date: string;
      track: string; grade: string; surface: string;
      distance: number; race_number: number | null;
      track_bias_level: string | null; head_count: number | null;
    }[]) {
      const raceEntries = entries.filter((e) => e.race_id === race.race_id);
      if (raceEntries.length === 0) continue;

      // head_count 制限（race detail と同じ）
      const filteredEntries = race.head_count
        ? raceEntries.filter((e) => (e.horse_number ?? 0) <= race.head_count!)
        : raceEntries;

      const withForm: UpcomingEntryWithForm[] = filteredEntries.map((e) => {
        const hid = e.horse_id ?? nameToIdMap.get(e.horse_name) ?? null;
        return { ...e, horse_id: hid, recentPerfs: hid ? (recentPerfsMap.get(hid) ?? []) : [] };
      });

      // このレースの走法マップ（horse_id → 走法）
      const raceRunningStyleMap = new Map<number, string>();
      for (const e of withForm) {
        const hid = e.horse_id;
        if (!hid) continue;
        const style = runningStyleMapAll.get(hid);
        if (style) raceRunningStyleMap.set(hid, style);
      }

      // ペースパターン推定
      const pacePattern = calcPacePattern(raceRunningStyleMap);

      // コース特性（枠順バイアス補正用）
      const courseChar = getCourseCharacteristic(race.track, race.surface, race.distance);
      const postBias = courseChar?.postBias ?? null;

      // 能力ランク（rating 降順、なければ補正スコアフォールバック）
      const raceRatingRankMap = new Map<number, number>();
      [...withForm]
        .filter((e) => e.horse_id != null && ratingByHorseId.has(e.horse_id!))
        .sort((a, b) => ratingByHorseId.get(b.horse_id!)! - ratingByHorseId.get(a.horse_id!)!)
        .forEach((e, i) => raceRatingRankMap.set(e.horse_id!, i + 1));

      const abilityRankMap = raceRatingRankMap.size > 0
        ? raceRatingRankMap
        : calcAllAbilityRanks(withForm);

      // 適正スコア計算 → 適正ランクマップ
      const scores: [number, number][] = [];
      for (const e of withForm) {
        const hid = e.horse_id;
        if (!hid) continue;
        const baseRating = ratingByHorseId.get(hid) ?? 0;
        const style = raceRunningStyleMap.get(hid) ?? null;
        const frame = e.frame_number;
        const score = calcAdjustedScore(
          baseRating, style, frame, pacePattern,
          race.track_bias_level, postBias
        );
        scores.push([hid, score]);
      }
      scores.sort((a, b) => b[1] - a[1]);
      const adjustedRankMap = new Map<number, number>();
      scores.forEach(([hid], i) => adjustedRankMap.set(hid, i + 1));

      // ◎（適正1位）・○（適正2位）の馬だけ抽出
      const pickedEntries: PickEntry[] = [];
      for (const e of withForm) {
        const hid = e.horse_id;
        if (!hid) continue;
        const adjRank = adjustedRankMap.get(hid);
        if (adjRank !== 1 && adjRank !== 2) continue;
        const symbol: "◎" | "○" = adjRank === 1 ? "◎" : "○";
        pickedEntries.push({
          entryId: e.id,
          horseId: hid,
          horseName: e.horse_name,
          frameNumber: e.frame_number,
          horseNumber: e.horse_number,
          odds: e.odds,
          popularity: e.popularity,
          jockey: e.jockey,
          symbol,
          abilityRank: abilityRankMap.get(hid) ?? 999,
          adjustedRank: adjRank,
          runningStyle: raceRunningStyleMap.get(hid) ?? null,
          rating: ratingByHorseId.get(hid) ?? null,
        });
      }

      if (pickedEntries.length === 0) continue;

      // ◎ → ○ の順に並べる
      pickedEntries.sort((a, b) => a.adjustedRank - b.adjustedRank);

      result.push({
        raceId: race.race_id,
        raceName: race.race_name,
        raceDate: race.race_date,
        track: race.track,
        grade: race.grade,
        surface: race.surface,
        distance: race.distance,
        raceNumber: race.race_number,
        pacePattern,
        entries: pickedEntries,
        adjustedScores: scores,
        allEntries: withForm
          .filter((e) => e.horse_id != null)
          .map((e) => ({ horseId: e.horse_id!, horseName: e.horse_name, horseNumber: e.horse_number })),
      });
    }

    return result;
  } catch (e) {
    console.error(e);
    return [];
  }
}

// ─── Server Component ────────────────────────────────────────────
export default async function PicksPage() {
  const races = await fetchPicksData();
  return <PicksClient races={races} />;
}
