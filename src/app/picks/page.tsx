// NOTE: このページは upcoming_entries + calcHorsePicks ベースで印を表示する。
// horse_performances の eval_tag は参照しない。

import { supabase } from "@/lib/supabase";
import type {
  UpcomingEntry,
  UpcomingEntryWithForm,
  RecentPerf,
  EvalTag,
  PickSymbol,
} from "@/lib/database.types";
import {
  calcValueBetDetails,
  calcHorsePicks,
  calcCorrectedScore,
} from "@/lib/database.types";
import { buildRaceMarginMaps } from "@/lib/parseMargin";
import PicksClient from "./PicksClient";
import type { RaceWithPicks, PickEntry, HorseStats } from "./PicksClient";

// ─── 全馬スタッツ計算 ─────────────────────────────────────────────

function calcAllHorseStats(withForm: UpcomingEntryWithForm[]): Map<number, HorseStats> {
  const result = new Map<number, HorseStats>();

  const scored = withForm
    .filter((e) => e.horse_id !== null && e.popularity !== null)
    .map((e) => {
      const valid = e.recentPerfs.filter(
        (p) => p.eval_tag !== "disregard"
      );
      if (valid.length < 1) return null;
      const avg = valid.reduce((sum, p) => sum + calcCorrectedScore(p), 0) / valid.length;
      return { horse_id: e.horse_id!, avg, oddsRank: e.popularity!, racesAnalyzed: valid.length };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const sorted = [...scored].sort((a, b) => a.avg - b.avg);
  sorted.forEach((x, i) => {
    result.set(x.horse_id, {
      abilityRank: i + 1,
      oddsRank: x.oddsRank,
      avgScore: Math.round(x.avg * 10) / 10,
      racesAnalyzed: x.racesAnalyzed,
    });
  });

  return result;
}

// ─── データ取得 ───────────────────────────────────────────────────

const NOTABLE_SYMBOLS: PickSymbol[] = ["◎", "○", "▲", "△", "★"];

async function fetchPicksData(): Promise<RaceWithPicks[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: upcomingRaces } = await (supabase as any)
      .from("upcoming_races")
      .select("race_id, race_name, race_date, track, grade, surface, distance, race_number")
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

    const recentPerfsMap = new Map<number, RecentPerf[]>();
    if (allHorseIds.length > 0) {
      const { data: perfs } = await supabase
        .from("horse_performances")
        .select(`
          horse_id,
          race_id,
          finish_order,
          margin,
          eval_tag,
          trouble_value,
          temperament_value,
          weight_effect_value,
          track_condition_value,
          pace_effect_value,
          races ( race_name, race_date )
        `)
        .in("horse_id", allHorseIds);

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
        races: { race_name: string; race_date: string } | null;
      };

      // まず馬ごとに直近5走に絞る（全走から race_ids を収集すると膨大になるため）
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

      // 直近5走の race_id だけで累積着差マップを構築（全走は不要）
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
            (allMargins as { horse_id: number; race_id: string; finish_order: number; margin: number | null }[])
          );
        }
      }

      for (const [hid, ps] of slicedByHorse.entries()) {
        recentPerfsMap.set(
          hid,
          ps.map((p) => {
            const cm = raceMarginMaps.get(p.race_id)?.get(p.horse_id);
            return {
              race_name: p.races!.race_name,
              race_date: p.races!.race_date,
              race_id: p.race_id,
              finish_order: p.finish_order,
              margin: p.margin,
              // NaN になりえる値は null 扱いしてフォールバック
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

    const result: RaceWithPicks[] = [];

    for (const race of upcomingRaces as {
      race_id: string; race_name: string; race_date: string;
      track: string; grade: string; surface: string;
      distance: number; race_number: number | null;
    }[]) {
      const raceEntries = entries.filter((e) => e.race_id === race.race_id);
      if (raceEntries.length === 0) continue;

      const withForm: UpcomingEntryWithForm[] = raceEntries.map((e) => {
        const hid = e.horse_id ?? nameToIdMap.get(e.horse_name) ?? null;
        return { ...e, horse_id: hid, recentPerfs: hid ? (recentPerfsMap.get(hid) ?? []) : [] };
      });

      const valueBetMap = calcValueBetDetails(withForm);
      const picksMap = calcHorsePicks(withForm, valueBetMap);
      const statsMap = calcAllHorseStats(withForm);

      const notableEntries: PickEntry[] = [];
      for (const e of withForm) {
        const hid = e.horse_id;
        const pick = hid ? (picksMap.get(hid) ?? null) : null;
        if (!pick || !NOTABLE_SYMBOLS.includes(pick.symbol)) continue;
        notableEntries.push({
          entryId: e.id,
          horseId: hid,
          horseName: e.horse_name,
          frameNumber: e.frame_number,
          horseNumber: e.horse_number,
          odds: e.odds,
          popularity: e.popularity,
          jockey: e.jockey,
          pick,
          stats: hid ? (statsMap.get(hid) ?? null) : null,
        });
      }

      if (notableEntries.length === 0) continue;

      const symbolOrder: Record<PickSymbol, number> = { "◎": 0, "○": 1, "▲": 2, "△": 3, "★": 4, "✓": 5 };
      notableEntries.sort((a, b) => symbolOrder[a.pick!.symbol] - symbolOrder[b.pick!.symbol]);

      result.push({
        raceId: race.race_id,
        raceName: race.race_name,
        raceDate: race.race_date,
        track: race.track,
        grade: race.grade,
        surface: race.surface,
        distance: race.distance,
        raceNumber: race.race_number,
        entries: notableEntries,
      });
    }

    return result;
  } catch (e) {
    console.error(e);
    return [];
  }
}

// ─── Server Component ─────────────────────────────────────────────

export default async function PicksPage() {
  const races = await fetchPicksData();
  return <PicksClient races={races} />;
}
