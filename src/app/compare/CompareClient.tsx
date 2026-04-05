"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import type { Horse, HorsePerformance, Race } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

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

interface HorseOption {
  horse: Horse;
  perfs: PerfWithRace[]; // disregard除外済み・直近5走
}

// 物差し馬ロジック: 馬Aと馬Bに共通して出走した馬を探す
// 補正後能力差を計算（馬身）
function calcAdjustedDiff(
  perfA: PerfWithRace,
  perfB: PerfWithRace,
  raceTrackBias: number
): number {
  const baseDiff = (perfB.finish_order - perfA.finish_order) * 0.5; // 着差ベース（仮）

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

// 直接対決時の能力差
function calcDirectDiff(
  perfsA: PerfWithRace[],
  perfsB: PerfWithRace[]
): { diff: number; races: { perfA: PerfWithRace; perfB: PerfWithRace }[] } | null {
  const results: { perfA: PerfWithRace; perfB: PerfWithRace }[] = [];

  for (const pA of perfsA) {
    const pB = perfsB.find((p) => p.race_id === pA.race_id);
    if (pB) results.push({ perfA: pA, perfB: pB });
  }

  if (results.length === 0) return null;

  const diffs = results.map(({ perfA, perfB }) =>
    calcAdjustedDiff(perfA, perfB, perfA.races.track_bias_value ?? 0)
  );
  const avg = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  return { diff: avg, races: results };
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

async function fetchHorseOption(id: number): Promise<HorseOption | null> {
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

  return {
    horse: horse as Horse,
    perfs: ((perfs ?? []) as PerfWithRace[]),
  };
}

async function searchHorses(query: string): Promise<Horse[]> {
  if (!query.trim()) return [];
  const supabase = getSupabase();
  const { data } = await supabase
    .from("horses")
    .select("*")
    .ilike("name", `%${query}%`)
    .limit(10);
  return (data ?? []) as Horse[];
}

// 馬選択モーダル
function HorseSelectModal({
  onSelect,
  onClose,
}: {
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Horse[]>([]);

  useEffect(() => {
    if (!query) { setResults([]); return; }
    const t = setTimeout(async () => {
      const horses = await searchHorses(query);
      setResults(horses);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
      <div className="bg-white w-full rounded-t-2xl p-4 space-y-3 max-h-[70vh] flex flex-col">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-[var(--kaiko-text-main)]">馬を選択</h3>
          <button onClick={onClose} className="material-symbols-outlined text-[var(--kaiko-text-muted)]">close</button>
        </div>
        <input
          className="w-full border border-[var(--kaiko-border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--kaiko-primary)]"
          placeholder="馬名を入力..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="overflow-y-auto flex-1 divide-y divide-[var(--kaiko-border)]">
          {results.map((h) => (
            <button
              key={h.horse_id}
              className="w-full text-left px-2 py-3 text-sm font-bold hover:bg-gray-50"
              onClick={() => { onSelect(h.horse_id); onClose(); }}
            >
              {h.name}
            </button>
          ))}
          {query && results.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--kaiko-text-muted)]">見つかりませんでした</p>
          )}
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

  // URL の ?horse= から馬Aを初期セット
  useEffect(() => {
    const horseId = searchParams.get("horse");
    if (horseId) {
      fetchHorseOption(Number(horseId)).then((opt) => { if (opt) setHorseA(opt); });
    }
  }, [searchParams]);

  const handleSelectHorse = useCallback(async (id: number) => {
    const opt = await fetchHorseOption(id);
    if (!opt) return;
    if (modal === "A") setHorseA(opt);
    else setHorseB(opt);
  }, [modal]);

  // 能力差計算
  const directResult =
    horseA && horseB
      ? calcDirectDiff(horseA.perfs, horseB.perfs)
      : null;

  const diff = directResult?.diff ?? null;
  const isDirect = directResult !== null;
  const aIsStronger = diff !== null && diff > 0;

  // タブコンテンツ用のレース
  const tabRaces = directResult?.races ?? [];
  const tabRace = activeTab > 0 ? tabRaces[activeTab - 1] : null;

  // 統合評価の補正値（直接対決の平均）
  const avgCorr: Record<string, number> = {};
  if (directResult && directResult.races.length > 0) {
    for (const item of CORRECTION_ITEMS) {
      const vals = directResult.races.map(({ perfA }) => perfA[item.key] as number ?? 0);
      avgCorr[item.key as string] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
  }

  const tabs = ["統合評価", ...(tabRaces.map((_, i) => `レース${i + 1}`))];

  return (
    <>
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 flex justify-between items-center w-full px-4 h-16">
        <div className="flex items-center gap-3">
          <Link href="/races">
            <span className="material-symbols-outlined text-[var(--kaiko-on-surface-variant)] cursor-pointer">arrow_back</span>
          </Link>
          <h1 className="text-base font-bold text-[var(--kaiko-on-surface)]">能力比較</h1>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-bold text-lg text-[var(--kaiko-primary)] tracking-tight font-[family-name:var(--font-noto-sans-jp)]">回顧AI</span>
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-xl">analytics</span>
        </div>
      </header>

      <main className="p-4 max-w-md mx-auto pb-28 space-y-4">

        {/* 馬A vs 馬B */}
        <section className="flex items-stretch gap-3 relative">
          {/* 馬A */}
          <div className="flex-1 bg-white border border-[var(--kaiko-outline-variant)] rounded-xl p-3 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div>
              <span className="text-[10px] font-bold text-[var(--kaiko-primary)] block mb-1">比較馬 A</span>
              <h2 className="text-base font-bold leading-tight line-clamp-2 text-[var(--kaiko-on-surface)]">
                {horseA ? horseA.horse.name : <span className="text-[var(--kaiko-on-surface-variant)]">未選択</span>}
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
            <div className="bg-[#2c313a] text-white text-[11px] font-black w-9 h-9 rounded-full flex items-center justify-center border-[3px] border-[var(--kaiko-surface)] italic shadow-md">VS</div>
          </div>

          {/* 馬B */}
          <div className="flex-1 bg-white border border-[var(--kaiko-outline-variant)] rounded-xl p-3 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div>
              <span className="text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] block mb-1">比較馬 B</span>
              <h2 className="text-base font-bold leading-tight line-clamp-2 text-[var(--kaiko-on-surface)]">
                {horseB ? horseB.horse.name : <span className="text-[var(--kaiko-on-surface-variant)]">未選択</span>}
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

        {/* サマリー */}
        {horseA && horseB ? (
          diff !== null ? (
            <section className="bg-white rounded-2xl p-6 text-center space-y-4 shadow-sm border border-[var(--kaiko-outline-variant)] relative overflow-hidden">
              <div className="absolute top-0 w-full h-1 bg-[var(--kaiko-primary)]/10 left-0" />
              <p className="text-xs font-bold text-[var(--kaiko-on-surface-variant)] tracking-wider">もし直接対決したら</p>
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-[family-name:var(--font-bebas-neue)] text-6xl text-[var(--kaiko-primary)] leading-none tracking-tight">
                  {formatVal(Math.abs(diff))}
                </span>
                <span className="text-lg font-bold text-[var(--kaiko-on-surface)]">馬身</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="inline-flex items-center gap-2 bg-[var(--kaiko-primary-container)] px-6 py-2.5 rounded-full">
                  <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  <span className="font-bold text-[var(--kaiko-primary)] text-sm">
                    {aIsStronger ? horseA.horse.name : horseB.horse.name}が優勢
                  </span>
                </div>
              </div>
              {!isDirect && (
                <p className="text-[11px] text-[var(--kaiko-text-muted)]">※ 物差し馬経由で推定</p>
              )}
            </section>
          ) : (
            <section className="bg-white rounded-2xl p-6 text-center shadow-sm border border-[var(--kaiko-outline-variant)]">
              <p className="text-sm text-[var(--kaiko-on-surface-variant)]">共通レースが見つかりません</p>
              <p className="text-[11px] text-[var(--kaiko-text-muted)] mt-1">両馬が共通して出走したレースが必要です</p>
            </section>
          )
        ) : (
          <section className="bg-white rounded-2xl p-6 text-center shadow-sm border border-[var(--kaiko-outline-variant)]">
            <p className="text-sm text-[var(--kaiko-on-surface-variant)]">馬A・馬Bを選択してください</p>
          </section>
        )}

        {/* タブ */}
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

            {/* 補正詳細カード */}
            <section className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[var(--kaiko-outline-variant)]">
              <div className="bg-[var(--kaiko-surface-container-low)] px-4 py-3 border-b border-[var(--kaiko-outline-variant)]/30">
                <h3 className="font-bold text-[12px] uppercase tracking-wider text-[var(--kaiko-on-surface-variant)]">能力補正詳細</h3>
              </div>
              <div className="divide-y divide-[var(--kaiko-outline-variant)]/30">
                {/* 着差ベース */}
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm font-medium text-[var(--kaiko-on-surface-variant)]">実際の着差（ベース）</span>
                  <span className="font-[family-name:var(--font-bebas-neue)] text-2xl text-[var(--kaiko-on-surface)]">
                    {tabRace
                      ? formatVal((tabRace.perfB.finish_order - tabRace.perfA.finish_order) * 0.5)
                      : formatVal(diff ?? 0)}
                  </span>
                </div>

                {/* 補正グリッド */}
                <div className="grid grid-cols-2 bg-gray-50/30 gap-px">
                  {CORRECTION_ITEMS.map((item) => {
                    const val = tabRace
                      ? (tabRace.perfA[item.key] as number ?? 0)
                      : (avgCorr[item.key as string] ?? 0);
                    return (
                      <div key={item.key as string} className="bg-white p-4">
                        <span className="text-[10px] font-bold text-[var(--kaiko-on-surface-variant)] block mb-1">{item.label}</span>
                        <span className={`font-[family-name:var(--font-bebas-neue)] text-xl ${corrClass(val)}`}>
                          {formatVal(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 合計 */}
                <div className="flex items-center justify-between p-5 bg-[var(--kaiko-primary)]/5">
                  <span className="font-bold text-[var(--kaiko-primary)] text-sm">補正後の能力差</span>
                  <div className="text-right">
                    <span className="font-[family-name:var(--font-bebas-neue)] text-3xl text-[var(--kaiko-primary)] leading-none">
                      {formatVal(diff ?? 0)}
                    </span>
                    <span className="text-xs font-bold text-[var(--kaiko-primary)] ml-1.5">馬身</span>
                  </div>
                </div>
              </div>
            </section>

            {/* CTA */}
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

      {/* 馬選択モーダル */}
      {modal && (
        <HorseSelectModal
          onSelect={handleSelectHorse}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
