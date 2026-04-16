import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type {
  UpcomingRace,
  UpcomingEntry,
  UpcomingEntryWithForm,
  RecentPerf,
  EvalTag,
} from "@/lib/database.types";
import { isBuyCandidate, calcValueBetDetails, calcHorsePicks, calcAllAbilityRanks } from "@/lib/database.types";
import { buildRaceMarginMaps } from "@/lib/parseMargin";
import { getCourseCharacteristic } from "@/lib/courseCharacteristics";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import EntryList from "./EntryList";
import RaceNavBar from "./RaceNavBar";

interface Props {
  params: Promise<{ id: string }>;
}

interface RaceNav {
  race_id: string;
  track: string;
  race_number: number;
}

async function getRacesForDate(date: string): Promise<RaceNav[]> {
  try {
    const { data } = await supabase
      .from("upcoming_races" as never)
      .select("race_id, track, race_number")
      .eq("race_date", date)
      .order("track")
      .order("race_number");
    return (data ?? []) as RaceNav[];
  } catch {
    return [];
  }
}

async function getUpcomingRace(id: string): Promise<UpcomingRace | null> {
  try {
    const { data, error } = await supabase
      .from("upcoming_races" as never)
      .select("*")
      .eq("race_id", id)
      .single();
    if (error || !data) return null;
    return data as UpcomingRace;
  } catch {
    return null;
  }
}

async function getEntries(raceId: string, headCount: number | null): Promise<UpcomingEntry[]> {
  try {
    let query = supabase
      .from("upcoming_entries" as never)
      .select("*")
      .eq("race_id", raceId);
    if (headCount) query = (query as any).lte("horse_number", headCount);
    const { data, error } = await (query as any).order("popularity");
    if (error || !data) return [];
    return data as UpcomingEntry[];
  } catch {
    return [];
  }
}

async function resolveHorseIdsByName(names: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (names.length === 0) return map;
  try {
    const { data } = await supabase
      .from("horses")
      .select("horse_id, name")
      .in("name", names);
    for (const h of (data ?? []) as { horse_id: number; name: string }[]) {
      map.set(h.name, h.horse_id);
    }
  } catch {}
  return map;
}

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

async function getRecentPerfsForHorses(
  horseIds: number[]
): Promise<{ perfsMap: Map<number, RecentPerf[]>; runningStyleMap: Map<number, string> }> {
  const perfsMap = new Map<number, RecentPerf[]>();
  const runningStyleMap = new Map<number, string>();
  if (horseIds.length === 0) return { perfsMap, runningStyleMap };

  try {
    const { data, error } = await supabase
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
        position_order,
        races ( race_name, race_date )
      `)
      .in("horse_id", horseIds);

    if (error || !data) return { perfsMap, runningStyleMap };

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

    const byHorse = new Map<number, RawPerf[]>();
    for (const row of (data as RawPerf[]).filter((r) => r.races)) {
      if (!byHorse.has(row.horse_id)) byHorse.set(row.horse_id, []);
      byHorse.get(row.horse_id)!.push(row);
    }
    const slicedByHorse = new Map<number, RawPerf[]>();
    for (const [hid, perfs] of byHorse.entries()) {
      slicedByHorse.set(
        hid,
        perfs.sort((a, b) => b.races!.race_date.localeCompare(a.races!.race_date)).slice(0, 5)
      );
    }

    const uniqueRaceIds = [...new Set(
      [...slicedByHorse.values()].flat().map((p) => p.race_id)
    )];
    let raceMarginMaps = new Map<string, Map<number, number>>();
    if (uniqueRaceIds.length > 0) {
      const { data: allMargins } = await (supabase as any)
        .from("horse_performances")
        .select("horse_id, race_id, finish_order, margin")
        .in("race_id", uniqueRaceIds)
        .limit(10000);
      if (allMargins) {
        raceMarginMaps = buildRaceMarginMaps(
          allMargins as { horse_id: number; race_id: string; finish_order: number; margin: number | null }[]
        );
      }
    }

    for (const [hid, sorted] of slicedByHorse.entries()) {
      const validPositions = sorted
        .filter((p) => p.eval_tag !== "disregard")
        .map((p) => p.position_order);
      const style = calcRunningStyle(validPositions);
      if (style) runningStyleMap.set(hid, style);

      perfsMap.set(
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
  } catch {}

  return { perfsMap, runningStyleMap };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatOddsUpdated(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const GRADE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  G1: { border: "border-[var(--kaiko-primary)]/50", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G2: { border: "border-[var(--kaiko-primary)]/30", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G3: { border: "border-black/10", bg: "bg-black/6", text: "text-[var(--kaiko-text-muted)]" },
  OP: { border: "border-black/8", bg: "bg-black/5",  text: "text-[var(--kaiko-text-muted)]" },
};

const SURFACE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  "芝":    { border: "border-[var(--kaiko-tag-green-text)]/30", bg: "bg-[var(--kaiko-tag-green-bg)]", text: "text-[var(--kaiko-tag-green-text)]" },
  "ダート": { border: "border-[var(--kaiko-tag-gold-text)]/30",  bg: "bg-[var(--kaiko-tag-gold-bg)]",  text: "text-[var(--kaiko-tag-gold-text)]" },
};

function Badge({ label, style }: { label: string; style: { border: string; bg: string; text: string } }) {
  return (
    <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${style.border} ${style.bg} ${style.text} uppercase tracking-wider`}>
      {label}
    </span>
  );
}

const WAKU_STYLES: Record<number, { bg: string; border: string }> = {
  1: { bg: "bg-white",         border: "border-gray-300" },
  2: { bg: "bg-[#e2e8f0]",     border: "border-gray-300" },
  3: { bg: "bg-[#fee2e2]",     border: "border-red-200" },
  4: { bg: "bg-[#dbeafe]",     border: "border-blue-200" },
  5: { bg: "bg-[#fef9c3]",     border: "border-yellow-300" },
  6: { bg: "bg-[#dcfce7]",     border: "border-emerald-200" },
  7: { bg: "bg-[#ffedd5]",     border: "border-orange-200" },
  8: { bg: "bg-[#fce7f3]",     border: "border-pink-200" },
};

export default async function UpcomingRaceDetailPage({ params }: Props) {
  const { id } = await params;

  const [race, ] = await Promise.all([getUpcomingRace(id)]);
  if (!race) notFound();

  const [entries, navRaces] = await Promise.all([
    getEntries(id, race.head_count),
    getRacesForDate(race.race_date),
  ]);

  const unlinkedNames = entries
    .filter((e) => e.horse_id === null)
    .map((e) => e.horse_name);
  const nameToIdMap = await resolveHorseIdsByName(unlinkedNames);

  const resolvedEntries = entries.map((e) => ({
    ...e,
    horse_id: e.horse_id ?? nameToIdMap.get(e.horse_name) ?? null,
  }));

  const horseIds = resolvedEntries
    .map((e) => e.horse_id)
    .filter((hid): hid is number => hid !== null);

  const { perfsMap, runningStyleMap } = await getRecentPerfsForHorses(horseIds);

  const entriesWithForm: UpcomingEntryWithForm[] = resolvedEntries.map((e) => ({
    ...e,
    recentPerfs: e.horse_id ? (perfsMap.get(e.horse_id) ?? []) : [],
  }));

  const buyCandidates = entriesWithForm.filter((e) => isBuyCandidate(e.recentPerfs));
  const valueBetMap = calcValueBetDetails(entriesWithForm);
  const picksMap = calcHorsePicks(entriesWithForm, valueBetMap);
  const abilityRankMap = calcAllAbilityRanks(entriesWithForm);

  const gradeBadge = GRADE_BADGE[race.grade] ?? GRADE_BADGE["OP"];
  const surfaceBadge = SURFACE_BADGE[race.surface] ?? SURFACE_BADGE["芝"];
  const courseChar = getCourseCharacteristic(race.track, race.surface, race.distance);

  const valueBetArr = Array.from(valueBetMap.entries());
  const picksArr = Array.from(picksMap.entries());
  const runningStyleArr = Array.from(runningStyleMap.entries());
  const abilityRankArr = Array.from(abilityRankMap.entries());

  return (
    <>
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-black/8">
        <div className="flex items-center w-full gap-3">
          <BackButton />
          <Link href="/" className="flex items-baseline gap-0.5 shrink-0">
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter text-[#131313]">回顧</span>
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
          </Link>
          <div className="flex flex-col leading-tight ml-auto text-right min-w-0 max-w-[140px]">
            <span className="text-sm font-bold text-[#131313] truncate">{race.race_name}</span>
            <span className="text-[10px] text-[var(--kaiko-text-muted)] font-bold truncate">
              {race.race_date.replace(/-/g, "/")} · {race.track} {race.grade}
            </span>
          </div>
        </div>
      </header>

      <RaceNavBar
        races={navRaces}
        currentRaceId={id}
        currentTrack={race.track}
        currentRaceNumber={race.race_number ?? 0}
      />

      <main className="pt-36 px-3 max-w-md mx-auto pb-28 space-y-3">

        {/* レース概要（カードなし） */}
        <section className="pt-1 pb-2 px-1">
          <div className="flex items-start justify-between mb-3">
            <h2 className="text-3xl font-black text-[#131313] tracking-tight leading-none">
              {race.race_name}
            </h2>
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-[var(--kaiko-primary-container)] border border-[var(--kaiko-primary)]/30 text-[var(--kaiko-primary)] uppercase tracking-wide ml-2 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--kaiko-primary)] animate-pulse inline-block" />
              出走前
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge label={race.grade} style={gradeBadge} />
            <Badge label={race.surface} style={surfaceBadge} />
            <Badge label={`${race.distance}m`} style={{ border: "border-black/8", bg: "bg-black/5", text: "text-[var(--kaiko-text-muted)]" }} />
            {race.head_count && (
              <Badge label={`${race.head_count}頭`} style={{ border: "border-black/8", bg: "bg-black/5", text: "text-[var(--kaiko-text-muted)]" }} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--kaiko-text-muted)]">
            <span className="flex items-center gap-1 font-bold">
              <span className="material-symbols-outlined text-[15px]">location_on</span>
              {race.track}競馬場
            </span>
            <span>{formatDate(race.race_date)}</span>
            {race.odds_updated_at && (
              <span className="font-normal">
                オッズ更新 {formatOddsUpdated(race.odds_updated_at)}
              </span>
            )}
          </div>
        </section>

        {/* コース特性カード */}
        {courseChar && (
          <section className="bg-white rounded-2xl overflow-hidden border border-black/8">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-black/4 border-b border-black/8">
              <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]">map</span>
              <span className="text-[10px] font-black text-[#131313] uppercase tracking-wider">
                コース特性 — {race.track} {race.surface}{race.distance}m
              </span>
            </div>
            <div className="divide-y divide-black/6">
              <div className="px-4 py-2.5">
                <span className="block text-[9px] font-black text-[var(--kaiko-primary)] uppercase tracking-wider mb-0.5">脚質傾向</span>
                <span className="text-[12px] font-bold text-[#131313] leading-snug line-clamp-2">{courseChar.runningStyle}</span>
              </div>
              <div className="px-4 py-2.5">
                <span className="block text-[9px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider mb-0.5">枠順傾向</span>
                <span className="text-[12px] font-bold text-[#131313] leading-snug line-clamp-2">{courseChar.postBias}</span>
              </div>
              <div className="px-4 py-2.5">
                <span className="block text-[9px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider mb-0.5">特記</span>
                <span className="text-[12px] font-bold text-[#131313] leading-snug line-clamp-2">{courseChar.notes}</span>
              </div>
            </div>
          </section>
        )}

        {/* 出走馬リスト */}
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">list_alt</span>
          <span className="text-[12px] font-black text-[#131313] uppercase tracking-wider">
            出馬表（{entriesWithForm.length}頭）
          </span>
        </div>

        <EntryList
          entriesWithForm={entriesWithForm}
          valueBetMap={valueBetArr}
          runningStyleMap={runningStyleArr}
          abilityRankMap={abilityRankArr}
          picksMap={picksArr}
        />

        {/* 次走買い候補サマリー */}
        {buyCandidates.length > 0 && (
          <section className="bg-white rounded-2xl overflow-hidden border border-[var(--kaiko-tag-green-text)]/30">
            <div className="h-1 bg-[var(--kaiko-tag-green-text)] w-full" />
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[var(--kaiko-tag-green-text)] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
                <span className="text-[12px] font-black text-[#131313] uppercase tracking-wider">次走買い候補</span>
                <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] ml-auto">近2走以上 伸び代◎</span>
              </div>
              <div className="space-y-2">
                {buyCandidates.map((e) => {
                  const waku = e.frame_number ?? 1;
                  const wakuStyle = WAKU_STYLES[Math.min(waku, 8)] ?? WAKU_STYLES[1];
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 bg-[var(--kaiko-eval-positive-bg)] border border-[var(--kaiko-eval-positive-text)]/30 rounded-2xl px-3 py-2.5"
                    >
                      <div className={`w-5 h-5 rounded-lg ${wakuStyle.bg} border ${wakuStyle.border} flex items-center justify-center text-[10px] font-black shrink-0`}>
                        {e.frame_number ?? "-"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-bold text-[#131313]">{e.horse_name}</span>
                        {e.jockey && (
                          <span className="text-[10px] text-[var(--kaiko-text-muted)] ml-2">{e.jockey}</span>
                        )}
                      </div>
                      {e.odds !== null && (
                        <div className="text-right shrink-0">
                          <span className="text-[16px] font-black text-[var(--kaiko-primary)]">
                            {e.odds.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-[var(--kaiko-primary)] font-bold">倍</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

      </main>

      <BottomNav />
    </>
  );
}
