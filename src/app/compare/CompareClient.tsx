"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import type { Horse, HorsePerformance, Race } from "@/lib/database.types";
import { buildRaceMarginMaps } from "@/lib/parseMargin";
import BottomNav from "@/components/BottomNav";

function BackButtonClient() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="w-8 h-8 flex items-center justify-center active:opacity-60"
    >
      <span className="material-symbols-outlined text-[var(--kaiko-on-surface-variant)] text-[24px]">
        arrow_back
      </span>
    </button>
  );
}

// 補正項目（DBカラム準拠）
const CORRECTION_ITEMS: { key: keyof HorsePerformance; label: string }[] = [
  { key: "weight_effect_value", label: "斤量補正" },
  { key: "track_condition_value", label: "馬場適性" },
  { key: "pace_effect_value", label: "展開・ペース" },
  { key: "trouble_value", label: "不利・出遅れ" },
  { key: "temperament_value", label: "折り合い" },
];

interface PerfWithRace extends HorsePerformance {
  races: Race;
}

interface PerfWithRaceAndHorse extends HorsePerformance {
  races: Race;
  horses: Horse;
}

interface HorseOption {
  horse: Horse;
  perfs: PerfWithRace[];
  raceId?: string; // この馬をどのレースから選んだか（馬B選択時の同レースフィルタ用）
  raceMarginMaps: Map<string, Map<number, number>>; // race_id → horse_id → 1着からの累積着差
}

// 物差し馬候補（perfsを保持してクライアントサイドで再計算可能にする）
interface BenchmarkCandidate {
  horseId: number;
  horseName: string;
  estimatedDiff: number;
  raceCount: number;
  perfsInARaces: PerfWithRace[]; // 物差し馬の、馬Aと同走したレースのperf
  perfsInBRaces: PerfWithRace[]; // 物差し馬の、馬Bと同走したレースのperf
}

/**
 * 補正後能力差を計算（正 = perfA が perfB より強い）
 * raceMarginMap がある場合は累積着差ベース、なければ着順差×0.5 にフォールバック。
 */
function calcAdjustedDiff(
  perfA: PerfWithRace,
  perfB: PerfWithRace,
  raceTrackBias: number,
  raceMarginMap?: Map<number, number>
): number {
  let baseDiff: number;
  const cumA = raceMarginMap?.get(perfA.horse_id);
  const cumB = raceMarginMap?.get(perfB.horse_id);
  if (cumA !== undefined && cumB !== undefined) {
    // cumB - cumA: 正 = A が B より前（A が強い）
    baseDiff = cumB - cumA;
  } else {
    baseDiff = (perfB.finish_order - perfA.finish_order) * 0.5;
  }
  const corrA =
    (perfA.weight_effect_value ?? 0) +
    (perfA.track_condition_value ?? 0) +
    (perfA.pace_effect_value ?? 0) +
    (perfA.trouble_value ?? 0) +
    (perfA.temperament_value ?? 0);
  const corrB =
    (perfB.weight_effect_value ?? 0) +
    (perfB.track_condition_value ?? 0) +
    (perfB.pace_effect_value ?? 0) +
    (perfB.trouble_value ?? 0) +
    (perfB.temperament_value ?? 0);
  return baseDiff + corrA - corrB + raceTrackBias;
}

// 直接対決の能力差
function calcDirectDiff(
  perfsA: PerfWithRace[],
  perfsB: PerfWithRace[],
  raceMarginMaps?: Map<string, Map<number, number>>
): { diff: number; races: { perfA: PerfWithRace; perfB: PerfWithRace; baseDiff: number }[] } | null {
  const results: { perfA: PerfWithRace; perfB: PerfWithRace; baseDiff: number }[] = [];
  for (const pA of perfsA) {
    const pB = perfsB.find((p) => p.race_id === pA.race_id);
    if (pB) {
      const marginMap = raceMarginMaps?.get(pA.race_id);
      const cumA = marginMap?.get(pA.horse_id);
      const cumB = marginMap?.get(pB.horse_id);
      const baseDiff = (cumA !== undefined && cumB !== undefined)
        ? cumB - cumA
        : (pB.finish_order - pA.finish_order) * 0.5;
      results.push({ perfA: pA, perfB: pB, baseDiff });
    }
  }
  if (results.length === 0) return null;
  const diffs = results.map(({ perfA, perfB }) => {
    const marginMap = raceMarginMaps?.get(perfA.race_id);
    return calcAdjustedDiff(perfA, perfB, perfA.races.track_bias_value ?? 0, marginMap);
  });
  return { diff: diffs.reduce((s, v) => s + v, 0) / diffs.length, races: results };
}

// 物差し馬経由の間接能力差は findBenchmarkCandidates 内で着差ベースで計算済みのため
// selectedBenchmark.estimatedDiff を直接利用する。

// 物差し馬候補を検索（両馬の直近5走に共通して出走した馬）
async function findBenchmarkCandidates(
  horseA: HorseOption,
  horseB: HorseOption
): Promise<BenchmarkCandidate[]> {
  const raceIdsA = horseA.perfs.map((p) => p.race_id);
  const raceIdsB = horseB.perfs.map((p) => p.race_id);
  if (raceIdsA.length === 0 || raceIdsB.length === 0) return [];

  const supabase = getSupabase();

  const [{ data: rawA }, { data: rawB }] = await Promise.all([
    supabase
      .from("horse_performances")
      .select("*, races(*), horses(*)")
      .in("race_id", raceIdsA)
      .neq("eval_tag", "disregard"),
    supabase
      .from("horse_performances")
      .select("*, races(*), horses(*)")
      .in("race_id", raceIdsB)
      .neq("eval_tag", "disregard"),
  ]);

  const allRacePerfs = [
    ...((rawA ?? []) as PerfWithRaceAndHorse[]),
    ...((rawB ?? []) as PerfWithRaceAndHorse[]),
  ];
  // 着差累積マップを構築（全馬の finish_order+margin が必要）
  const raceMarginMaps = buildRaceMarginMaps(
    allRacePerfs.map((p) => ({
      horse_id: p.horse_id,
      race_id: p.race_id,
      finish_order: p.finish_order,
      margin: p.margin,
    }))
  );

  const perfsInA = ((rawA ?? []) as PerfWithRaceAndHorse[]).filter(
    (p) => p.horse_id !== horseA.horse.horse_id && p.horse_id !== horseB.horse.horse_id
  );
  const perfsInB = ((rawB ?? []) as PerfWithRaceAndHorse[]).filter(
    (p) => p.horse_id !== horseA.horse.horse_id && p.horse_id !== horseB.horse.horse_id
  );

  const horseIdsInB = new Set(perfsInB.map((p) => p.horse_id));
  const candidateIds = [...new Set(perfsInA.map((p) => p.horse_id))].filter((id) =>
    horseIdsInB.has(id)
  );

  const results: BenchmarkCandidate[] = [];

  for (const cid of candidateIds) {
    const cpA = perfsInA.filter((p) => p.horse_id === cid);
    const cpB = perfsInB.filter((p) => p.horse_id === cid);

    const diffs: number[] = [];
    for (const pA of cpA) {
      const perfA = horseA.perfs.find((p) => p.race_id === pA.race_id);
      if (!perfA) continue;
      const alpha = calcAdjustedDiff(perfA, pA, pA.races.track_bias_value ?? 0, raceMarginMaps.get(pA.race_id));
      for (const pB of cpB) {
        const perfB = horseB.perfs.find((p) => p.race_id === pB.race_id);
        if (!perfB) continue;
        const beta = calcAdjustedDiff(pB, perfB, pB.races.track_bias_value ?? 0, raceMarginMaps.get(pB.race_id));
        diffs.push(alpha + beta);
      }
    }
    if (diffs.length === 0) continue;

    const avgDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    const horseName = cpA[0]?.horses?.name ?? `馬${cid}`;

    results.push({
      horseId: cid,
      horseName,
      estimatedDiff: avgDiff,
      raceCount: diffs.length,
      perfsInARaces: cpA,
      perfsInBRaces: cpB,
    });
  }

  // 推定差の絶対値が小さい順（接戦を精度高く推定できる物差し馬を優先）
  return results.sort((a, b) => Math.abs(a.estimatedDiff) - Math.abs(b.estimatedDiff));
}

async function fetchHorseOption(id: number, fromRaceId?: string): Promise<HorseOption | null> {
  const supabase = getSupabase();
  const { data: horse } = await supabase
    .from("horses")
    .select("*")
    .eq("horse_id", id)
    .single();
  if (!horse) return null;
  const { data: perfs } = await supabase
    .from("horse_performances")
    .select("*, races(*)")
    .eq("horse_id", id)
    .neq("eval_tag", "disregard")
    .order("race_id", { ascending: false })
    .limit(5);

  // 着差累積計算用に同レースの全馬 finish_order+margin を取得
  const raceIds = ((perfs ?? []) as { race_id: string }[]).map((p) => p.race_id);
  let raceMarginMaps = new Map<string, Map<number, number>>();
  if (raceIds.length > 0) {
    const { data: allRacePerfs } = await supabase
      .from("horse_performances")
      .select("horse_id, race_id, finish_order, margin")
      .in("race_id", raceIds);
    if (allRacePerfs) {
      raceMarginMaps = buildRaceMarginMaps(
        allRacePerfs as { horse_id: number; race_id: string; finish_order: number; margin: number | null }[]
      );
    }
  }

  // raceId の解決:
  // 1. 呼び出し元からレースを指定された場合はそれを使う
  // 2. それ以外は upcoming_entries から horse_id で出走予定レースを検索
  let raceId: string | undefined = fromRaceId;
  if (!raceId) {
    const { data: entry } = await supabase
      .from("upcoming_entries")
      .select("race_id")
      .eq("horse_id", id)
      .limit(1)
      .single();
    raceId = (entry as { race_id: string } | null)?.race_id ?? undefined;
  }

  return { horse: horse as Horse, perfs: ((perfs ?? []) as PerfWithRace[]), raceId, raceMarginMaps };
}

// 補正値の色クラス
function corrClass(v: number): string {
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-red-500";
  return "text-gray-400";
}

function formatVal(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}

// かな行フィルター
const KANA_ROWS = [
  { label: "ア", chars: "アイウエオ" },
  { label: "カ", chars: "カキクケコガギグゲゴ" },
  { label: "サ", chars: "サシスセソザジズゼゾ" },
  { label: "タ", chars: "タチツテトダヂヅデド" },
  { label: "ナ", chars: "ナニヌネノ" },
  { label: "ハ", chars: "ハヒフヘホバビブベボパピプペポ" },
  { label: "マ", chars: "マミムメモ" },
  { label: "ヤ", chars: "ヤユヨ" },
  { label: "ラ", chars: "ラリルレロ" },
  { label: "ワ", chars: "ワヲン" },
];

const EVAL_DOT: Record<string, string> = {
  below: "bg-emerald-500",
  above: "bg-amber-400",
  fair: "bg-blue-400",
  disregard: "bg-gray-300",
};

// レース一覧から「年月 → 週 → レース」への絞り込みロジック

function getYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=日, 6=土
  // その週の土曜を基準とする
  const diffToSat = day === 0 ? -1 : 6 - day;
  const sat = new Date(d);
  sat.setDate(d.getDate() + diffToSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  const fmt = (dt: Date) => `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
  return `${fmt(sat)}〜${fmt(sun)}`;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diffToSat = day === 0 ? -1 : 6 - day;
  const sat = new Date(d);
  sat.setDate(d.getDate() + diffToSat);
  return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, "0")}-${String(sat.getDate()).padStart(2, "0")}`;
}

// 馬選択モーダル
function HorseSelectModal({
  onSelect,
  onClose,
  horseA,
}: {
  onSelect: (id: number, fromRaceId?: string) => void;
  onClose: () => void;
  horseA?: HorseOption; // 馬B選択時のみ渡す（同レースフィルタ用）
}) {
  // horseA が渡されている場合は「同じレースから」タブをデフォルトに
  const [tab, setTab] = useState<"same" | "race" | "name">(horseA?.raceId ? "same" : "race");

  // 「同じレースから」タブ用
  const [sameRaceHorses, setSameRaceHorses] = useState<
    { horseId: number; horseName: string; horseNumber: number | null; jockey: string | null; popularity: number | null }[]
  >([]);
  const [sameRaceLoading, setSameRaceLoading] = useState(false);

  const [races, setRaces] = useState<Race[]>([]);
  // 出走前レースのIDセット（upcoming_races テーブル由来）
  const [upcomingRaceIds, setUpcomingRaceIds] = useState<Set<string>>(new Set());
  // 出走前レースの出走馬リスト（upcoming_entries 由来）
  const [upcomingRaceHorses, setUpcomingRaceHorses] = useState<
    { horseId: number; horseName: string; horseNumber: number | null; jockey: string | null; popularity: number | null }[]
  >([]);
  // 絞り込みステップ: null=年月選択, "YYYY-MM"=週選択, "YYYY-MM-DD"=レース選択, race=馬選択
  const [selectedYearMonth, setSelectedYearMonth] = useState<string | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [raceHorses, setRaceHorses] = useState<{ horse: Horse; finish_order: number; eval_tag: string }[]>([]);
  const [raceLoading, setRaceLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    // 過去レース取得
    supabase
      .from("races")
      .select("race_id,race_name,race_date,track,grade,race_number")
      .not("race_date", "is", null)
      .order("race_date", { ascending: false })
      .then(({ data }) => setRaces((data ?? []) as Race[]));
    // 出走前レース取得してマージ
    Promise.resolve(
      supabase
        .from("upcoming_races" as never)
        .select("race_id,race_name,race_date,track,grade,race_number")
        .order("race_date", { ascending: false })
    ).then(({ data }) => {
      const rows = (data ?? []) as { race_id: string; race_name: string; race_date: string; track: string; grade: string; race_number: number | null }[];
      if (rows.length === 0) return;
      setUpcomingRaceIds(new Set(rows.map((r) => r.race_id)));
      setRaces((prev) => {
        const existingIds = new Set(prev.map((r) => r.race_id));
        const newRows = rows.filter((r) => !existingIds.has(r.race_id)) as unknown as Race[];
        return [...newRows, ...prev];
      });
    });
  }, []);

  // 「同じレースから」タブ: horseA.raceId があれば upcoming_entries から同レース馬を取得
  useEffect(() => {
    if (!horseA?.raceId) return;
    setSameRaceLoading(true);
    const supabase = getSupabase();
    supabase
      .from("upcoming_entries")
      .select("horse_id, horse_name, horse_number, jockey, popularity")
      .eq("race_id", horseA.raceId)
      .order("horse_number", { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []) as {
          horse_id: number | null;
          horse_name: string;
          horse_number: number | null;
          jockey: string | null;
          popularity: number | null;
        }[];
        setSameRaceHorses(
          rows
            .filter((r) => r.horse_id !== null && r.horse_id !== horseA.horse.horse_id)
            .map((r) => ({
              horseId: r.horse_id!,
              horseName: r.horse_name,
              horseNumber: r.horse_number,
              jockey: r.jockey,
              popularity: r.popularity,
            }))
        );
        setSameRaceLoading(false);
      });
  }, [horseA?.raceId, horseA?.horse.horse_id]);

  // 年月リスト（降順・重複なし）
  const yearMonths = useMemo(() => {
    const set = new Set(races.map((r) => getYearMonth(r.race_date)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [races]);

  // 選択された年月内の週リスト
  const weeksInMonth = useMemo(() => {
    if (!selectedYearMonth) return [];
    const inMonth = races.filter((r) => getYearMonth(r.race_date) === selectedYearMonth);
    const map = new Map<string, string>(); // weekKey → label
    for (const r of inMonth) {
      const key = getWeekKey(r.race_date);
      if (!map.has(key)) map.set(key, getWeekLabel(r.race_date));
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [races, selectedYearMonth]);

  // 選択された週内のレース
  const racesInWeek = useMemo(() => {
    if (!selectedWeekKey) return [];
    return races.filter((r) => getWeekKey(r.race_date) === selectedWeekKey);
  }, [races, selectedWeekKey]);

  useEffect(() => {
    if (!selectedRace) return;
    setRaceLoading(true);
    setRaceHorses([]);
    setUpcomingRaceHorses([]);
    const supabase = getSupabase();

    if (upcomingRaceIds.has(selectedRace.race_id)) {
      // 出走前レース：upcoming_entries から取得
      Promise.resolve(
        supabase
          .from("upcoming_entries" as never)
          .select("horse_id, horse_name, horse_number, jockey, popularity")
          .eq("race_id", selectedRace.race_id)
          .order("horse_number")
      ).then(({ data }) => {
        const rows = (data ?? []) as {
          horse_id: number | null; horse_name: string;
          horse_number: number | null; jockey: string | null; popularity: number | null;
        }[];
        setUpcomingRaceHorses(
          rows.filter((r) => r.horse_id !== null).map((r) => ({
            horseId: r.horse_id!,
            horseName: r.horse_name,
            horseNumber: r.horse_number,
            jockey: r.jockey,
            popularity: r.popularity,
          }))
        );
        setRaceLoading(false);
      });
    } else {
      // 過去レース：horse_performances から取得
      supabase
        .from("horse_performances")
        .select("finish_order, eval_tag, horses(horse_id, name)")
        .eq("race_id", selectedRace.race_id)
        .order("finish_order")
        .then(({ data }) => {
          setRaceHorses(
            (data ?? []).map((d: any) => ({
              horse: d.horses as Horse,
              finish_order: d.finish_order,
              eval_tag: d.eval_tag ?? "fair",
            }))
          );
          setRaceLoading(false);
        });
    }
  }, [selectedRace, upcomingRaceIds]);

  // パンくずのステップ判定
  const step = selectedRace ? "horses" : selectedWeekKey ? "races" : selectedYearMonth ? "weeks" : "months";

  const [allHorses, setAllHorses] = useState<Horse[]>([]);
  const [query, setQuery] = useState("");
  const [activeRow, setActiveRow] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "name" || allHorses.length > 0) return;
    const supabase = getSupabase();
    supabase
      .from("horses")
      .select("*")
      .order("name")
      .then(({ data }) => setAllHorses((data ?? []) as Horse[]));
  }, [tab, allHorses.length]);

  const filteredHorses = useMemo(() => {
    let list = allHorses;
    if (activeRow) {
      const row = KANA_ROWS.find((r) => r.label === activeRow);
      if (row) list = list.filter((h) => row.chars.includes(h.name[0]));
    }
    if (query) list = list.filter((h) => h.name.includes(query));
    return list;
  }, [allHorses, activeRow, query]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--kaiko-border)]">
          {tab === "race" && step !== "months" ? (
            <button
              onClick={() => {
                if (step === "horses") { setSelectedRace(null); setRaceHorses([]); }
                else if (step === "races") setSelectedWeekKey(null);
                else if (step === "weeks") setSelectedYearMonth(null);
              }}
              className="flex items-center gap-1 text-sm font-bold text-[var(--kaiko-primary)]"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              {step === "horses" ? "レース一覧" : step === "races" ? "週を選択" : "年月を選択"}
            </button>
          ) : (
            <h3 className="font-bold text-[var(--kaiko-text-main)]">馬を選択</h3>
          )}
          <button onClick={onClose}>
            <span className="material-symbols-outlined text-[var(--kaiko-text-muted)]">close</span>
          </button>
        </div>

        <div className="flex border-b border-[var(--kaiko-border)]">
          {/* 「同じレースから」タブ: horseA.raceId がある場合のみ表示 */}
          {horseA?.raceId && (
            <button
              onClick={() => setTab("same")}
              className={`flex-1 py-2.5 text-[12px] font-bold transition-colors ${
                tab === "same"
                  ? "border-b-2 border-[var(--kaiko-primary)] text-[var(--kaiko-primary)]"
                  : "text-[var(--kaiko-text-muted)]"
              }`}
            >
              同じレース
            </button>
          )}
          <button
            onClick={() => setTab("race")}
            className={`flex-1 py-2.5 text-[12px] font-bold transition-colors ${
              tab === "race"
                ? "border-b-2 border-[var(--kaiko-primary)] text-[var(--kaiko-primary)]"
                : "text-[var(--kaiko-text-muted)]"
            }`}
          >
            {horseA?.raceId ? "他レース" : "レースから選ぶ"}
          </button>
          <button
            onClick={() => setTab("name")}
            className={`flex-1 py-2.5 text-[12px] font-bold transition-colors ${
              tab === "name"
                ? "border-b-2 border-[var(--kaiko-primary)] text-[var(--kaiko-primary)]"
                : "text-[var(--kaiko-text-muted)]"
            }`}
          >
            馬名から選ぶ
          </button>
        </div>

        {/* 「同じレースから」タブパネル */}
        {tab === "same" && horseA?.raceId && (
          <div className="overflow-y-auto flex-1">
            <div className="px-4 py-2 bg-gray-50 border-b border-[var(--kaiko-border)]">
              <p className="text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">
                同じレースの出走馬
              </p>
            </div>
            {sameRaceLoading ? (
              <p className="py-8 text-center text-sm text-[var(--kaiko-text-muted)]">読み込み中...</p>
            ) : sameRaceHorses.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--kaiko-text-muted)]">
                同レースの出走馬データがありません
              </p>
            ) : (
              sameRaceHorses.map(({ horseId, horseName, horseNumber, jockey, popularity }) => (
                <button
                  key={horseId}
                  onClick={() => { onSelect(horseId, horseA.raceId); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--kaiko-border)] hover:bg-gray-50 text-left active:bg-gray-100"
                >
                  {/* 馬番 */}
                  <span className="text-base font-black text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] w-6 text-right flex-shrink-0">
                    {horseNumber ?? "—"}
                  </span>
                  {/* 馬名・騎手 */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-[var(--kaiko-text-main)] block truncate">
                      {horseName}
                    </span>
                    {jockey && (
                      <span className="text-[11px] text-[var(--kaiko-text-muted)]">{jockey}</span>
                    )}
                  </div>
                  {/* 人気 */}
                  {popularity != null && (
                    <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] flex-shrink-0">
                      {popularity}人気
                    </span>
                  )}
                  <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] flex-shrink-0">
                    chevron_right
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "race" && (
          <div className="overflow-y-auto flex-1">
            {/* Step 1: 年月選択 */}
            {step === "months" && (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-[var(--kaiko-border)]">
                  <p className="text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">年月を選択</p>
                </div>
                {races.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--kaiko-text-muted)]">読み込み中...</p>
                ) : (
                  yearMonths.map((ym) => {
                    const [year, month] = ym.split("-");
                    const count = races.filter((r) => getYearMonth(r.race_date) === ym).length;
                    return (
                      <button
                        key={ym}
                        onClick={() => setSelectedYearMonth(ym)}
                        className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[var(--kaiko-border)] hover:bg-gray-50 text-left"
                      >
                        <span className="text-sm font-bold text-[var(--kaiko-text-main)]">
                          {year}年 {parseInt(month)}月
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                            {count} races
                          </span>
                          <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)]">chevron_right</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}

            {/* Step 2: 週選択 */}
            {step === "weeks" && selectedYearMonth && (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-[var(--kaiko-border)]">
                  <p className="text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">
                    週を選択 — {selectedYearMonth.replace("-", "年")}月
                  </p>
                </div>
                {weeksInMonth.map(({ key, label }) => {
                  const count = races.filter((r) => getWeekKey(r.race_date) === key).length;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedWeekKey(key)}
                      className="w-full flex items-center justify-between px-4 py-3.5 border-b border-[var(--kaiko-border)] hover:bg-gray-50 text-left"
                    >
                      <span className="text-sm font-bold text-[var(--kaiko-text-main)]">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                          {count} races
                        </span>
                        <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)]">chevron_right</span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {/* Step 3: レース選択 */}
            {step === "races" && selectedWeekKey && (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-[var(--kaiko-border)]">
                  <p className="text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">
                    レースを選択 — {getWeekLabel(selectedWeekKey + "-01")}
                  </p>
                </div>
                {racesInWeek.map((race) => (
                  <button
                    key={race.race_id}
                    onClick={() => setSelectedRace(race)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--kaiko-border)] hover:bg-gray-50 text-left"
                  >
                    <div className="flex-shrink-0 text-center min-w-[40px]">
                      <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] block">
                        {race.race_date ? race.race_date.slice(5).replace("-", "/") : "—"}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)]">{race.track}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-[var(--kaiko-text-main)] truncate block">
                        {race.race_name}
                      </span>
                      <span className="text-[11px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] font-bold">
                        {race.grade} · R{race.race_number}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] flex-shrink-0">
                      chevron_right
                    </span>
                  </button>
                ))}
              </>
            )}

            {/* Step 4: 馬選択 */}
            {step === "horses" && selectedRace && (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-[var(--kaiko-border)]">
                  <p className="text-[11px] font-bold text-[var(--kaiko-text-muted)]">
                    {selectedRace.race_date?.slice(5).replace("-", "/")} {selectedRace.track}{" "}
                    {selectedRace.race_name}
                    {upcomingRaceIds.has(selectedRace.race_id) && (
                      <span className="ml-2 text-[9px] text-emerald-600 font-bold uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">UPCOMING</span>
                    )}
                  </p>
                </div>
                {raceLoading ? (
                  <p className="py-8 text-center text-sm text-[var(--kaiko-text-muted)]">読み込み中...</p>
                ) : upcomingRaceIds.has(selectedRace.race_id) ? (
                  // 出走前レース：馬番・馬名・騎手表示
                  upcomingRaceHorses.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--kaiko-text-muted)]">出走馬データがありません</p>
                  ) : (
                    upcomingRaceHorses.map(({ horseId, horseName, horseNumber, jockey, popularity }) => (
                      <button
                        key={horseId}
                        onClick={() => { onSelect(horseId, selectedRace.race_id); onClose(); }}
                        className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--kaiko-border)] hover:bg-gray-50 text-left"
                      >
                        <span className="text-base font-black text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] w-6 text-right flex-shrink-0">
                          {horseNumber ?? "—"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-[var(--kaiko-text-main)] truncate block">{horseName}</span>
                          {jockey && <span className="text-[11px] text-[var(--kaiko-text-muted)]">{jockey}</span>}
                        </div>
                        {popularity != null && (
                          <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] flex-shrink-0">
                            {popularity}人気
                          </span>
                        )}
                        <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] flex-shrink-0">chevron_right</span>
                      </button>
                    ))
                  )
                ) : (
                  // 過去レース：着順・評価表示
                  raceHorses.map(({ horse, finish_order, eval_tag }) => (
                    <button
                      key={horse.horse_id}
                      onClick={() => { onSelect(horse.horse_id, selectedRace.race_id); onClose(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--kaiko-border)] hover:bg-gray-50 text-left"
                    >
                      <span className="text-base font-black text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] w-6 text-right flex-shrink-0">
                        {finish_order === 99 ? "中" : finish_order}
                      </span>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${EVAL_DOT[eval_tag] ?? "bg-gray-300"}`} />
                      <span className="text-sm font-bold text-[var(--kaiko-text-main)]">{horse.name}</span>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {tab === "name" && (
          <>
            <div className="flex gap-1 px-3 py-2 border-b border-[var(--kaiko-border)] overflow-x-auto no-scrollbar">
              {KANA_ROWS.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setActiveRow(activeRow === label ? null : label)}
                  className={`flex-shrink-0 w-8 h-8 rounded-full text-[12px] font-bold transition-colors ${
                    activeRow === label
                      ? "bg-[var(--kaiko-primary)] text-white"
                      : "bg-gray-100 text-[var(--kaiko-text-muted)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="px-3 py-2 border-b border-[var(--kaiko-border)]">
              <input
                className="w-full border border-[var(--kaiko-border)] rounded-xl px-3 py-2 text-sm outline-none focus:border-[var(--kaiko-primary)]"
                placeholder="馬名で絞り込み..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-[var(--kaiko-border)]">
              {filteredHorses.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--kaiko-text-muted)]">
                  {allHorses.length === 0 ? "読み込み中..." : "見つかりませんでした"}
                </p>
              ) : (
                filteredHorses.map((h) => (
                  <button
                    key={h.horse_id}
                    className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-gray-50"
                    onClick={() => { onSelect(h.horse_id); onClose(); }}
                  >
                    {h.name}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}

// 物差し馬変更モーダル
function BenchmarkSelectModal({
  candidates,
  selectedId,
  onSelect,
  onClose,
}: {
  candidates: BenchmarkCandidate[];
  selectedId: number | null;
  onSelect: (candidate: BenchmarkCandidate) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-2xl max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--kaiko-border)]">
          <h3 className="font-bold text-[var(--kaiko-text-main)]">物差し馬を選択</h3>
          <button onClick={onClose}>
            <span className="material-symbols-outlined text-[var(--kaiko-text-muted)]">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-[var(--kaiko-border)]">
          {candidates.map((c) => {
            const isSelected = selectedId === c.horseId;
            return (
              <button
                key={c.horseId}
                onClick={() => { onSelect(c); onClose(); }}
                className={`w-full flex items-center justify-between px-4 py-3 text-left ${
                  isSelected ? "bg-[var(--kaiko-primary-container)]" : "hover:bg-gray-50"
                }`}
              >
                <div>
                  <span
                    className={`text-sm font-bold block ${
                      isSelected ? "text-[var(--kaiko-primary)]" : "text-[var(--kaiko-on-surface)]"
                    }`}
                  >
                    {c.horseName}
                  </span>
                  <span className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                    {c.raceCount}レース経由 · 推定差 {formatVal(c.estimatedDiff)} 馬身
                  </span>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">check</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CompareClient() {
  const searchParams = useSearchParams();

  const [horseA, setHorseA] = useState<HorseOption | null>(null);
  const [horseB, setHorseB] = useState<HorseOption | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [modal, setModal] = useState<"A" | "B" | null>(null);

  // 物差し馬
  const [benchmarkCandidates, setBenchmarkCandidates] = useState<BenchmarkCandidate[]>([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkCandidate | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);

  // URL の ?horse= から馬Aを初期セット
  useEffect(() => {
    const horseId = searchParams.get("horse");
    if (horseId) {
      fetchHorseOption(Number(horseId)).then((opt) => { if (opt) setHorseA(opt); });
    }
  }, [searchParams]);

  const handleSelectHorse = useCallback(async (id: number, fromRaceId?: string) => {
    // fromRaceId がある場合はそれを優先、なければ fetchHorseOption 内で upcoming_entries から自動解決
    const opt = await fetchHorseOption(id, fromRaceId);
    if (!opt) return;
    if (modal === "A") setHorseA(opt);
    else setHorseB(opt);
  }, [modal]);

  // 直接対決（horseA の raceMarginMaps を使って着差ベースで計算）
  const directResult = useMemo(
    () => (horseA && horseB ? calcDirectDiff(horseA.perfs, horseB.perfs, horseA.raceMarginMaps) : null),
    [horseA, horseB]
  );

  // 物差し馬候補を自動検索（直接対決がない場合）
  useEffect(() => {
    if (!horseA || !horseB || directResult) {
      setBenchmarkCandidates([]);
      setSelectedBenchmark(null);
      return;
    }
    let cancelled = false;
    setBenchmarkLoading(true);
    setBenchmarkCandidates([]);
    setSelectedBenchmark(null);

    findBenchmarkCandidates(horseA, horseB).then((candidates) => {
      if (cancelled) return;
      setBenchmarkCandidates(candidates);
      setSelectedBenchmark(candidates[0] ?? null);
      setBenchmarkLoading(false);
    }).catch(() => {
      if (!cancelled) setBenchmarkLoading(false);
    });

    return () => { cancelled = true; };
  }, [horseA, horseB, directResult]);

  // 表示に使う能力差と種別
  const directDiff = directResult?.diff ?? null;
  // findBenchmarkCandidates 内で着差ベースで計算済みの値を直接使用
  const indirectDiff = selectedBenchmark?.estimatedDiff ?? null;

  const diff = directDiff ?? indirectDiff;
  const isDirect = directResult !== null;
  const aIsStronger = diff !== null && diff > 0;

  // タブコンテンツ用のレース（直接対決のみ）
  const tabRaces = directResult?.races ?? [];
  const tabRace = activeTab > 0 ? tabRaces[activeTab - 1] : null;

  // 補正詳細の集計（A・B両方 + 生着差 + バイアス）
  const avgCorrA: Record<string, number> = {};
  const avgCorrB: Record<string, number> = {};
  let avgRawDiff = 0;
  let avgBias = 0;
  if (directResult && directResult.races.length > 0) {
    for (const item of CORRECTION_ITEMS) {
      const valsA = directResult.races.map(({ perfA }) => (perfA[item.key] as number) ?? 0);
      const valsB = directResult.races.map(({ perfB }) => (perfB[item.key] as number) ?? 0);
      avgCorrA[item.key as string] = valsA.reduce((s, v) => s + v, 0) / valsA.length;
      avgCorrB[item.key as string] = valsB.reduce((s, v) => s + v, 0) / valsB.length;
    }
    const rawDiffs = directResult.races.map(({ baseDiff }) => baseDiff);
    avgRawDiff = rawDiffs.reduce((s, v) => s + v, 0) / rawDiffs.length;
    const biases = directResult.races.map(({ perfA }) => perfA.races.track_bias_value ?? 0);
    avgBias = biases.reduce((s, v) => s + v, 0) / biases.length;
  }

  const tabs = ["統合評価", ...(tabRaces.map((_, i) => `レース${i + 1}`))];

  return (
    <>
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex justify-between items-center w-full px-4 h-16">
        <div className="flex items-center gap-3">
          <BackButtonClient />
          <h1 className="text-base font-bold text-[var(--kaiko-on-surface)]">能力比較</h1>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-bold text-lg text-[var(--kaiko-primary)] tracking-tight font-[family-name:var(--font-noto-sans-jp)]">
            回顧AI
          </span>
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-xl">analytics</span>
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto pb-28 space-y-4">

        {/* 馬A vs 馬B */}
        <section className="flex items-stretch gap-3 relative">
          <div className="flex-1 bg-white border border-[var(--kaiko-outline-variant)] rounded-xl p-3 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div>
              <span className="text-[10px] font-bold text-[var(--kaiko-primary)] block mb-1">比較馬 A</span>
              <h2 className="text-base font-bold leading-tight line-clamp-2 text-[var(--kaiko-on-surface)]">
                {horseA ? (
                  <Link href={`/horses/${horseA.horse.horse_id}`} className="hover:underline">
                    {horseA.horse.name}
                  </Link>
                ) : (
                  <span className="text-[var(--kaiko-on-surface-variant)]">未選択</span>
                )}
              </h2>
            </div>
            <button
              onClick={() => setModal("A")}
              className="mt-2 flex items-center justify-center gap-1 border border-[var(--kaiko-outline-variant)] rounded-full py-1 text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] w-full hover:bg-gray-50"
            >
              <span>変更</span>
              <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
            </button>
          </div>

          {/* VS バッジ */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="bg-[#2c313a] text-white text-[11px] font-black w-9 h-9 rounded-full flex items-center justify-center border-[3px] border-[var(--kaiko-surface)] italic shadow-md">
              VS
            </div>
          </div>

          <div className="flex-1 bg-white border border-[var(--kaiko-outline-variant)] rounded-xl p-3 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div>
              <span className="text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] block mb-1">
                比較馬 B
              </span>
              <h2 className="text-base font-bold leading-tight line-clamp-2 text-[var(--kaiko-on-surface)]">
                {horseB ? (
                  <Link href={`/horses/${horseB.horse.horse_id}`} className="hover:underline">
                    {horseB.horse.name}
                  </Link>
                ) : (
                  <span className="text-[var(--kaiko-on-surface-variant)]">未選択</span>
                )}
              </h2>
            </div>
            <button
              onClick={() => setModal("B")}
              className="mt-2 flex items-center justify-center gap-1 border border-[var(--kaiko-outline-variant)] rounded-full py-1 text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] w-full hover:bg-gray-50"
            >
              <span>変更</span>
              <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
            </button>
          </div>
        </section>

        {/* 物差し馬セレクター（直接対決がない場合のみ） */}
        {horseA && horseB && !directResult && (
          <section className="bg-[#f8f9fa] border border-[var(--kaiko-outline-variant)] rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]">
                straighten
              </span>
              <span className="text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">
                物差し馬
              </span>
            </div>
            {benchmarkLoading ? (
              <div className="flex items-center gap-2 px-1 py-1">
                <span className="text-xs text-[var(--kaiko-text-muted)]">候補を検索中...</span>
              </div>
            ) : benchmarkCandidates.length === 0 ? (
              <p className="text-xs text-[var(--kaiko-text-muted)] px-1">
                共通の対戦馬が見つかりません
              </p>
            ) : (
              <button
                onClick={() => setShowBenchmarkModal(true)}
                className="w-full flex items-center justify-between bg-white border border-[var(--kaiko-border)] rounded-lg px-3 py-2 hover:bg-gray-50 active:opacity-70 transition-opacity"
              >
                <div className="text-left">
                  <span className="text-sm font-bold text-[var(--kaiko-on-surface)] block">
                    {selectedBenchmark?.horseName ?? "—"}
                  </span>
                  {selectedBenchmark && (
                    <span className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                      {selectedBenchmark.raceCount}レース経由 · 候補{benchmarkCandidates.length}頭
                    </span>
                  )}
                </div>
                <span className="material-symbols-outlined text-[var(--kaiko-on-surface-variant)] text-[18px]">
                  expand_more
                </span>
              </button>
            )}
          </section>
        )}

        {/* サマリー */}
        {horseA && horseB ? (
          diff !== null ? (
            <section className="bg-white rounded-2xl p-6 text-center space-y-4 shadow-sm border border-[var(--kaiko-outline-variant)] relative overflow-hidden">
              <div className="absolute top-0 w-full h-1 bg-[var(--kaiko-primary)]/10 left-0" />
              <p className="text-xs font-bold text-[var(--kaiko-on-surface-variant)] tracking-wider">
                もし直接対決したら
              </p>
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-[family-name:var(--font-bebas-neue)] text-6xl text-[var(--kaiko-primary)] leading-none tracking-tight">
                  {formatVal(Math.abs(diff))}
                </span>
                <span className="text-lg font-bold text-[var(--kaiko-on-surface)]">馬身</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="inline-flex items-center gap-2 bg-[var(--kaiko-primary-container)] px-6 py-2.5 rounded-full">
                  <span
                    className="material-symbols-outlined text-[var(--kaiko-primary)] text-xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    auto_awesome
                  </span>
                  <span className="font-bold text-[var(--kaiko-primary)] text-sm">
                    {aIsStronger ? horseA.horse.name : horseB.horse.name}が優勢
                  </span>
                </div>
              </div>
              {!isDirect && selectedBenchmark && (
                <p className="text-[11px] text-[var(--kaiko-text-muted)]">
                  ※ {selectedBenchmark.horseName}（物差し馬）経由で推定
                </p>
              )}
            </section>
          ) : !directResult && !benchmarkLoading && benchmarkCandidates.length === 0 ? (
            <section className="bg-white rounded-2xl p-6 text-center shadow-sm border border-[var(--kaiko-outline-variant)]">
              <span
                className="material-symbols-outlined text-[var(--kaiko-text-muted)] text-3xl mb-2 block"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                search_off
              </span>
              <p className="text-sm font-bold text-[var(--kaiko-on-surface-variant)]">
                共通レースが見つかりません
              </p>
              <p className="text-[11px] text-[var(--kaiko-text-muted)] mt-1">
                直近5走に共通の対戦馬がいません
              </p>
            </section>
          ) : benchmarkLoading ? (
            <section className="bg-white rounded-2xl p-6 text-center shadow-sm border border-[var(--kaiko-outline-variant)]">
              <p className="text-sm text-[var(--kaiko-on-surface-variant)]">物差し馬を検索中...</p>
            </section>
          ) : null
        ) : (
          <section className="bg-white rounded-2xl p-6 text-center shadow-sm border border-[var(--kaiko-outline-variant)]">
            <p className="text-sm text-[var(--kaiko-on-surface-variant)]">馬A・馬Bを選択してください</p>
          </section>
        )}

        {/* 補正詳細タブ（直接対決のみ） */}
        {tabRaces.length > 0 && (
          <>
            <nav className="flex gap-1 bg-gray-200/40 p-1 rounded-full">
              {tabs.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className={`flex-1 py-2.5 px-2 text-xs font-bold rounded-full transition-all ${
                    activeTab === i
                      ? "bg-[var(--kaiko-primary)] text-white shadow-md"
                      : "text-[var(--kaiko-on-surface-variant)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <section className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[var(--kaiko-outline-variant)]">
              <div className="bg-[var(--kaiko-surface-container-low)] px-4 py-3 border-b border-[var(--kaiko-outline-variant)]/30">
                <h3 className="font-bold text-[12px] uppercase tracking-wider text-[var(--kaiko-on-surface-variant)]">
                  能力補正詳細
                </h3>
              </div>
              <div className="divide-y divide-[var(--kaiko-outline-variant)]/30">

                {/* ベース着差 */}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-[11px] font-medium text-[var(--kaiko-on-surface-variant)]">
                    実際の着差（ベース）
                  </span>
                  <span className="font-[family-name:var(--font-bebas-neue)] text-2xl text-[var(--kaiko-on-surface)]">
                    {tabRace
                      ? formatVal(tabRace.baseDiff)
                      : formatVal(avgRawDiff)}
                  </span>
                </div>

                {/* 補正項目テーブル（A・B並列） */}
                <div>
                  {/* ヘッダー */}
                  <div className="grid grid-cols-3 px-4 py-1.5 bg-gray-50 border-b border-[var(--kaiko-outline-variant)]/30">
                    <span className="text-[9px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider">補正項目</span>
                    <span className="text-[9px] font-black text-[var(--kaiko-primary)] uppercase tracking-wider text-center">
                      {horseA?.horse.name ?? "馬A"}
                    </span>
                    <span className="text-[9px] font-black text-[var(--kaiko-on-surface-variant)] uppercase tracking-wider text-center">
                      {horseB?.horse.name ?? "馬B"}
                    </span>
                  </div>
                  {CORRECTION_ITEMS.map((item) => {
                    const valA = tabRace
                      ? ((tabRace.perfA[item.key] as number) ?? 0)
                      : (avgCorrA[item.key as string] ?? 0);
                    const valB = tabRace
                      ? ((tabRace.perfB[item.key] as number) ?? 0)
                      : (avgCorrB[item.key as string] ?? 0);
                    return (
                      <div key={item.key as string} className="grid grid-cols-3 px-4 py-2.5 border-b border-[var(--kaiko-outline-variant)]/20 last:border-b-0">
                        <span className="text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] self-center">
                          {item.label}
                        </span>
                        <span className={`font-[family-name:var(--font-bebas-neue)] text-lg text-center ${corrClass(valA)}`}>
                          {formatVal(valA)}
                        </span>
                        <span className={`font-[family-name:var(--font-bebas-neue)] text-lg text-center ${corrClass(valB)}`}>
                          {formatVal(valB)}
                        </span>
                      </div>
                    );
                  })}
                  {/* コースバイアス（レース全体） */}
                  {(() => {
                    const bias = tabRace
                      ? (tabRace.perfA.races.track_bias_value ?? 0)
                      : avgBias;
                    return (
                      <div className="grid grid-cols-3 px-4 py-2.5 bg-gray-50/60">
                        <span className="text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] self-center">コースバイアス</span>
                        <span className={`font-[family-name:var(--font-bebas-neue)] text-lg text-center ${corrClass(bias)}`}>
                          {formatVal(bias)}
                        </span>
                        <span className="text-[11px] text-center text-[var(--kaiko-text-muted)] self-center">（共通）</span>
                      </div>
                    );
                  })()}
                </div>

                {/* 補正後の能力差 */}
                <div className="flex items-center justify-between p-5 bg-[var(--kaiko-primary)]/5">
                  <span className="font-bold text-[var(--kaiko-primary)] text-sm">補正後の能力差</span>
                  <div className="text-right">
                    <span className="font-[family-name:var(--font-bebas-neue)] text-3xl text-[var(--kaiko-primary)] leading-none">
                      {formatVal(directDiff ?? 0)}
                    </span>
                    <span className="text-xs font-bold text-[var(--kaiko-primary)] ml-1.5">馬身</span>
                  </div>
                </div>
              </div>
            </section>

            {tabRace && (
              <div className="pt-2 pb-6">
                <Link
                  href={`/races/${tabRace.perfA.race_id}`}
                  className="w-full bg-[var(--kaiko-on-surface)] text-white py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-black/5"
                >
                  <span className="font-bold text-sm tracking-tight">レース詳細へ戻る</span>
                  <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </Link>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />

      {modal && (
        <HorseSelectModal
          onSelect={handleSelectHorse}
          onClose={() => setModal(null)}
          horseA={modal === "B" && horseA ? horseA : undefined}
        />
      )}

      {showBenchmarkModal && (
        <BenchmarkSelectModal
          candidates={benchmarkCandidates}
          selectedId={selectedBenchmark?.horseId ?? null}
          onSelect={(c) => setSelectedBenchmark(c)}
          onClose={() => setShowBenchmarkModal(false)}
        />
      )}
    </>
  );
}
