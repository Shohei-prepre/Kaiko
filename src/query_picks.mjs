// 4/11-12 の全レースの ◎○ 馬 と 能力ランク1-3位を取得するスクリプト
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gkhedouhdzvqamadkxia.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdra" +
  "GVkb3VoZHp2cWFtYWRreGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTk2MTYsImV4cCI6MjA4OTU5NTYxNn0" +
  ".BTgAc3WXumQiCJJYLnaFt7xlJjfYxuVK2YVSSm_Pu9c";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 補正スコア計算（小さいほど強い）
function calcCorrectedScore(perf) {
  const ability =
    (perf.trouble_value ?? 0) +
    (perf.temperament_value ?? 0) +
    (perf.weight_effect_value ?? 0) +
    (perf.track_condition_value ?? 0) +
    (perf.pace_effect_value ?? 0);
  const cm = perf.cumulative_margin;
  const base = (cm !== null && cm !== undefined && isFinite(cm)) ? cm : perf.finish_order;
  return base - ability;
}

// 能力ランクマップ計算
function calcAllAbilityRanks(entries) {
  const result = new Map();
  const withScore = entries
    .filter((e) => e.horse_id !== null)
    .map((e) => {
      const valid = e.recentPerfs.filter((p) => p.eval_tag !== "disregard");
      if (valid.length < 1) return null;
      const avg = valid.reduce((sum, p) => sum + calcCorrectedScore(p), 0) / valid.length;
      return { horse_id: e.horse_id, avg };
    })
    .filter((x) => x !== null);

  [...withScore]
    .sort((a, b) => a.avg - b.avg)
    .forEach((x, i) => result.set(x.horse_id, i + 1));
  return result;
}

// ◎○▲△★ シンボル計算
function calcHorsePicks(entries) {
  const result = new Map();
  if (entries.length === 0) return result;

  const abilityRankMap = calcAllAbilityRanks(entries);

  const valueCandidates = entries
    .filter((e) => e.horse_id != null && e.popularity != null)
    .flatMap((e) => {
      const abilityRank = abilityRankMap.get(e.horse_id);
      if (!abilityRank) return [];
      const oddsRank = e.popularity;
      const gap = oddsRank - abilityRank;
      if (gap <= 0) return [];
      return [{ horse_id: e.horse_id, horse_name: e.horse_name, abilityRank, oddsRank, valueScore: gap / abilityRank }];
    })
    .sort((a, b) => b.valueScore - a.valueScore);

  const mainSymbols = ["◎", "○", "▲", "△"];
  valueCandidates.forEach((h, i) => {
    const symbol = i < mainSymbols.length ? mainSymbols[i] : "★";
    result.set(h.horse_id, { symbol, horseName: h.horse_name, abilityRank: h.abilityRank, oddsRank: h.oddsRank });
  });

  return result;
}

async function main() {
  // 4/11 と 4/12 のレース取得
  const { data: races, error: raceErr } = await supabase
    .from("upcoming_races")
    .select("race_id, race_name, race_date, track, grade, race_number, surface, distance")
    .in("race_date", ["2026-04-11", "2026-04-12"])
    .order("race_date")
    .order("track")
    .order("race_number");

  if (raceErr || !races) {
    console.error("レース取得エラー:", raceErr);
    return;
  }
  console.log(`\n取得レース数: ${races.length}\n`);

  const circleResults = []; // ◎○ の馬
  const topAbilityResults = []; // 能力ランク1-3位

  for (const race of races) {
    // エントリー取得
    const { data: entries } = await supabase
      .from("upcoming_entries")
      .select("id, race_id, horse_id, horse_name, horse_number, frame_number, jockey, odds, popularity, weight_carried")
      .eq("race_id", race.race_id)
      .order("horse_number");

    if (!entries || entries.length === 0) continue;

    // horse_id が null の馬を名前でlookup
    const nullIdNames = entries.filter((e) => e.horse_id === null).map((e) => e.horse_name);
    let nameToId = new Map();
    if (nullIdNames.length > 0) {
      const { data: horses } = await supabase
        .from("horses")
        .select("horse_id, name")
        .in("name", nullIdNames);
      for (const h of horses ?? []) nameToId.set(h.name, h.horse_id);
    }

    const resolvedEntries = entries.map((e) => ({
      ...e,
      horse_id: e.horse_id ?? nameToId.get(e.horse_name) ?? null,
    }));

    const horseIds = resolvedEntries.filter((e) => e.horse_id !== null).map((e) => e.horse_id);

    // 近走パフォーマンス取得
    let perfsMap = new Map();
    if (horseIds.length > 0) {
      const { data: perfs } = await supabase
        .from("horse_performances")
        .select(`
          horse_id, race_id, finish_order, margin, eval_tag,
          trouble_value, temperament_value, weight_effect_value,
          track_condition_value, pace_effect_value, position_order,
          races ( race_name, race_date )
        `)
        .in("horse_id", horseIds);

      const byHorse = new Map();
      for (const p of (perfs ?? []).filter((p) => p.races)) {
        if (!byHorse.has(p.horse_id)) byHorse.set(p.horse_id, []);
        byHorse.get(p.horse_id).push(p);
      }
      for (const [hid, ps] of byHorse.entries()) {
        perfsMap.set(
          hid,
          ps.sort((a, b) => b.races.race_date.localeCompare(a.races.race_date)).slice(0, 5)
        );
      }
    }

    const entriesWithForm = resolvedEntries.map((e) => ({
      ...e,
      recentPerfs: e.horse_id ? (perfsMap.get(e.horse_id) ?? []) : [],
    }));

    // ◎○計算
    const picksMap = calcHorsePicks(entriesWithForm);
    const abilityRankMap = calcAllAbilityRanks(entriesWithForm);

    const raceLabel = `${race.race_date.slice(5).replace("-", "/")} ${race.track} R${race.race_number} ${race.race_name}(${race.grade})`;

    // ◎○のみ抽出
    for (const [horseId, pick] of picksMap.entries()) {
      if (pick.symbol === "◎" || pick.symbol === "○") {
        const entry = entriesWithForm.find((e) => e.horse_id === horseId);
        circleResults.push({
          race: raceLabel,
          symbol: pick.symbol,
          horseName: entry?.horse_name ?? pick.horseName,
          abilityRank: pick.abilityRank,
          oddsRank: pick.oddsRank,
          odds: entry?.odds ?? null,
        });
      }
    }

    // 能力ランク1-3位を抽出
    for (const [horseId, rank] of abilityRankMap.entries()) {
      if (rank <= 3) {
        const entry = entriesWithForm.find((e) => e.horse_id === horseId);
        topAbilityResults.push({
          race: raceLabel,
          abilityRank: rank,
          horseName: entry?.horse_name ?? `ID:${horseId}`,
          oddsRank: entry?.popularity ?? null,
          odds: entry?.odds ?? null,
        });
      }
    }
  }

  // ─── レースごとにまとめたマップを構築 ───
  const raceMap = new Map(); // raceLabel -> { circles: [], abilities: [] }
  for (const r of circleResults) {
    if (!raceMap.has(r.race)) raceMap.set(r.race, { circles: [], abilities: [] });
    raceMap.get(r.race).circles.push(r);
  }
  for (const r of topAbilityResults) {
    if (!raceMap.has(r.race)) raceMap.set(r.race, { circles: [], abilities: [] });
    raceMap.get(r.race).abilities.push(r);
  }

  // ─── 出力 ───
  // raceLabel は "04/11 中山 R1 ..." 形式。R番号を数値で比較するためにパース
  const SYMBOL_ORDER = ["◎", "○", "▲", "△", "★"];
  const parseRaceKey = (label) => {
    const m = label.match(/^(\d+\/\d+) (\S+) R(\d+)/);
    return m ? [m[1], m[2], parseInt(m[3], 10)] : [label, "", 0];
  };
  const sortedRaces = [...raceMap.keys()].sort((a, b) => {
    const [dateA, trackA, numA] = parseRaceKey(a);
    const [dateB, trackB, numB] = parseRaceKey(b);
    return dateA.localeCompare(dateB) || trackA.localeCompare(trackB) || numA - numB;
  });

  let prevDate = "";
  for (const raceLabel of sortedRaces) {
    const dateStr = raceLabel.slice(0, 5);
    if (dateStr !== prevDate) {
      console.log(`\n${"═".repeat(60)}`);
      console.log(`  ${dateStr}`);
      console.log(`${"═".repeat(60)}`);
      prevDate = dateStr;
    }

    const { circles, abilities } = raceMap.get(raceLabel);
    console.log(`\n【${raceLabel}】`);

    // ◎→○ の順で表示
    const sortedCircles = [...circles].sort((a, b) => SYMBOL_ORDER.indexOf(a.symbol) - SYMBOL_ORDER.indexOf(b.symbol));
    for (const r of sortedCircles) {
      console.log(`  ${r.symbol} ${r.horseName.padEnd(12)} 能力${r.abilityRank}位 / ${r.oddsRank}人気 (${r.odds ?? "?"}倍)`);
    }

    // 区切り
    console.log(`  ${"─".repeat(40)}`);

    // 能力ランク1-3位を順で表示
    const sortedAbilities = [...abilities].sort((a, b) => a.abilityRank - b.abilityRank);
    for (const r of sortedAbilities) {
      console.log(`  能力${r.abilityRank}位 ${r.horseName.padEnd(12)} ${r.oddsRank ?? "?"}人気 (${r.odds ?? "?"}倍)`);
    }
  }
}

main();
