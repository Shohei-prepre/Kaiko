"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import type { Race } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

function getWeekRange(weekOffset = 0): { sat: string; sun: string; label: string } {
  const today = new Date();
  const day = today.getDay();
  const diffToSat = day === 0 ? -1 : 6 - day;
  const sat = new Date(today);
  sat.setDate(today.getDate() + diffToSat + weekOffset * 7);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);

  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

  return {
    sat: sat.toISOString().slice(0, 10),
    sun: sun.toISOString().slice(0, 10),
    label: `${fmt(sat)} - ${fmt(sun)}`,
  };
}

interface VenueGroup {
  track: string;
  races: Race[];
}

function groupByVenue(races: Race[]): VenueGroup[] {
  const map = new Map<string, Race[]>();
  for (const r of races) {
    if (!map.has(r.track)) map.set(r.track, []);
    map.get(r.track)!.push(r);
  }
  return Array.from(map.entries()).map(([track, rs]) => ({
    track,
    races: rs.sort((a, b) => (a.race_number ?? 0) - (b.race_number ?? 0)),
  }));
}

function GradeBadge({ grade }: { grade: string }) {
  if (grade === "G1")
    return <span className="bg-[#f59e0b] text-white text-[10px] font-bold px-1.5 py-0.5">{grade}</span>;
  if (grade === "G2" || grade === "G3")
    return <span className="bg-[var(--kaiko-on-surface-variant)] text-white text-[10px] font-bold px-1.5 py-0.5">{grade}</span>;
  if (grade === "OP")
    return <span className="border border-[var(--kaiko-border)] text-[var(--kaiko-on-surface-variant)] text-[10px] font-bold px-1.5 py-0.5 font-[family-name:var(--font-rajdhani)] uppercase">{grade}</span>;
  return null;
}

const NOTICES = [
  { date: "2026.04.01", type: "Update", typeBg: "bg-[var(--kaiko-primary-container)] text-[var(--kaiko-primary)]", text: "新機能：AIによるレース直後評価の精度が向上しました。" },
  { date: "2026.03.25", type: "Maintenance", typeBg: "bg-gray-100 text-[var(--kaiko-on-surface-variant)]", text: "次回メンテナンスの予定はありません。" },
];

// 週選択モーダル（過去24週 + 未来2週）
function WeekSelectModal({
  currentOffset,
  onSelect,
  onClose,
}: {
  currentOffset: number;
  onSelect: (offset: number) => void;
  onClose: () => void;
}) {
  const weeks = Array.from({ length: 27 }, (_, i) => i - 24); // -24〜+2

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="bg-white w-full max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--kaiko-outline-variant)]">
          <span className="font-bold text-[var(--kaiko-text-main)]">週を選択</span>
          <button onClick={onClose}>
            <span className="material-symbols-outlined text-[var(--kaiko-text-muted)]">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {weeks.reverse().map((offset) => {
            const w = getWeekRange(offset);
            const isSelected = offset === currentOffset;
            const isCurrent = offset === 0;
            return (
              <button
                key={offset}
                onClick={() => { onSelect(offset); onClose(); }}
                className={`w-full flex items-center justify-between px-4 py-3 border-b border-[var(--kaiko-outline-variant)] text-left ${isSelected ? "bg-[var(--kaiko-primary-container)]" : "hover:bg-gray-50"}`}
              >
                <div>
                  <span className={`text-sm font-bold ${isSelected ? "text-[var(--kaiko-primary)]" : "text-[var(--kaiko-text-main)]"}`}>
                    {w.label}
                  </span>
                  {isCurrent && (
                    <span className="ml-2 text-[10px] font-bold text-[var(--kaiko-primary)] font-[family-name:var(--font-rajdhani)] uppercase">This Week</span>
                  )}
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

export default function RacesClient() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeDay, setActiveDay] = useState<"sat" | "sun">("sun");
  const [venues, setVenues] = useState<VenueGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());

  const toggleVenue = (track: string) =>
    setExpandedVenues((prev) => {
      const next = new Set(prev);
      next.has(track) ? next.delete(track) : next.add(track);
      return next;
    });

  const currentWeek = getWeekRange(weekOffset);
  const isThisWeek = weekOffset === 0;
  const isNextWeek = weekOffset === 1;

  const dateStr = activeDay === "sat" ? currentWeek.sat : currentWeek.sun;

  useEffect(() => {
    setLoading(true);
    const supabase = getSupabase();
    supabase
      .from("races")
      .select("*")
      .eq("race_date", dateStr)
      .order("race_number")
      .then(({ data }) => {
        setVenues(groupByVenue((data ?? []) as Race[]));
        setLoading(false);
      });
  }, [dateStr]);

  return (
    <div className="[&_*]:!rounded-none min-h-screen bg-[#f8f9fa] text-[var(--kaiko-on-surface)] pb-20">
      {/* ヘッダー */}
      <header className="bg-white border-b border-[var(--kaiko-outline-variant)] flex justify-between items-center w-full px-4 h-14 sticky top-0 z-50">
        <h1 className="text-xl font-black tracking-tighter text-[var(--kaiko-primary)] font-[family-name:var(--font-noto-sans-jp)]">回顧AI</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 p-2 active:opacity-60 transition-opacity"
        >
          <span className="text-[12px] font-bold text-[var(--kaiko-on-surface-variant)]">ほかの週を見る</span>
          <span className="material-symbols-outlined text-[var(--kaiko-on-surface-variant)]">calendar_month</span>
        </button>
      </header>

      <main className="max-w-md mx-auto">
        {/* 週セレクター */}
        <div className="bg-white px-4 pt-4 border-b border-[var(--kaiko-outline-variant)]">
          <div className="flex gap-4">
            {[
              { offset: 1, label: "来週", sublabel: "Next Week" },
              { offset: 0, label: "今週", sublabel: "This Week" },
            ].map(({ offset, label, sublabel }) => {
              const w = getWeekRange(offset);
              const isActive = weekOffset === offset;
              return (
                <button
                  key={offset}
                  onClick={() => setWeekOffset(offset)}
                  className={`flex-1 pb-3 text-center transition-colors ${
                    isActive
                      ? "border-b-2 border-[var(--kaiko-primary)] text-[var(--kaiko-primary)]"
                      : "text-[var(--kaiko-on-surface-variant)] opacity-60"
                  }`}
                >
                  <span className="block text-[10px] font-[family-name:var(--font-rajdhani)] font-bold uppercase tracking-widest">{sublabel}</span>
                  <span className="text-sm font-bold">{label}</span>
                  <span className="block text-[10px] font-[family-name:var(--font-rajdhani)]">{w.label}</span>
                </button>
              );
            })}
            {/* 今週・来週以外が選ばれている場合に表示 */}
            {!isThisWeek && !isNextWeek && (
              <div className="flex-1 pb-3 text-center border-b-2 border-[var(--kaiko-primary)] text-[var(--kaiko-primary)]">
                <span className="block text-[10px] font-[family-name:var(--font-rajdhani)] font-bold uppercase tracking-widest">Selected</span>
                <span className="text-sm font-bold">指定週</span>
                <span className="block text-[10px] font-[family-name:var(--font-rajdhani)]">{currentWeek.label}</span>
              </div>
            )}
          </div>
        </div>

        {/* 曜日タブ */}
        <div className="px-4 py-4 flex gap-2">
          {(["sat", "sun"] as const).map((day) => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`px-6 py-1.5 !rounded-full text-sm font-bold active:opacity-70 transition-all ${
                activeDay === day
                  ? "bg-[var(--kaiko-primary)] text-white shadow-sm"
                  : "bg-white border border-[var(--kaiko-outline-variant)] text-[var(--kaiko-on-surface-variant)]"
              }`}
            >
              {day === "sat" ? "土曜日" : "日曜日"}
            </button>
          ))}
        </div>

        {/* 競馬場カード */}
        <section className="mb-8">
          {loading ? (
            <div className="mx-4 bg-white border border-[var(--kaiko-outline-variant)] p-8 text-center text-sm text-[var(--kaiko-text-muted)]">
              読み込み中...
            </div>
          ) : venues.length === 0 ? (
            <div className="mx-4 bg-white border border-[var(--kaiko-outline-variant)] p-8 text-center">
              <p className="text-sm text-[var(--kaiko-text-muted)] mb-2">レースデータがありません</p>
              <button onClick={() => setShowModal(true)} className="text-[11px] font-bold text-[var(--kaiko-primary)] underline">
                ほかの週を見る
              </button>
            </div>
          ) : (
            <div className="space-y-3 px-4">
              {venues.map((venue) => {
                const isExpanded = expandedVenues.has(venue.track);
                const sorted = [...venue.races].sort((a, b) => {
                  const gradeOrder: Record<string, number> = { G1: 0, G2: 1, G3: 2, OP: 3 };
                  const ga = gradeOrder[a.grade] ?? 4;
                  const gb = gradeOrder[b.grade] ?? 4;
                  if (ga !== gb) return ga - gb;
                  return (b.race_number ?? 0) - (a.race_number ?? 0);
                });
                const displayRaces = isExpanded ? sorted : sorted.slice(0, 3);

                return (
                  <div key={venue.track} className="bg-white border border-[var(--kaiko-outline-variant)] shadow-sm">
                    <div className="px-4 py-3 border-b border-[var(--kaiko-outline-variant)] flex justify-between items-center">
                      <h2 className="text-xl font-black font-[family-name:var(--font-noto-sans-jp)] tracking-tight">{venue.track}</h2>
                      <span className="text-[11px] font-bold text-[var(--kaiko-on-surface-variant)] font-[family-name:var(--font-rajdhani)]">
                        {venue.races.length} RACES
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--kaiko-outline-variant)]">
                      {displayRaces.map((race) => (
                        <Link key={race.race_id} href={`/races/${race.race_id}`} className="flex items-center gap-3 px-4 py-3 active:opacity-60 transition-opacity hover:bg-gray-50">
                          <div className="w-8 h-8 flex items-center justify-center font-bold font-[family-name:var(--font-rajdhani)] text-sm flex-shrink-0 bg-gray-100 text-[var(--kaiko-on-surface-variant)]">
                            {race.race_number ?? "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <GradeBadge grade={race.grade} />
                              <h3 className="font-bold text-sm truncate tracking-tight">{race.race_name}</h3>
                            </div>
                            <span className="text-[11px] text-[var(--kaiko-on-surface-variant)] font-[family-name:var(--font-rajdhani)] font-medium">
                              {race.distance}m / {race.surface === "芝" ? "Turf" : "Dirt"}
                            </span>
                          </div>
                          <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-on-surface-variant)] flex-shrink-0">chevron_right</span>
                        </Link>
                      ))}
                    </div>
                    {venue.races.length > 3 && (
                      <button
                        onClick={() => toggleVenue(venue.track)}
                        className="w-full py-3 text-[var(--kaiko-primary)] text-[11px] font-bold font-[family-name:var(--font-rajdhani)] uppercase tracking-widest border-t border-[var(--kaiko-outline-variant)] flex items-center justify-center gap-1 bg-gray-50 active:opacity-60"
                      >
                        {isExpanded ? (
                          <>Show Less <span className="material-symbols-outlined text-[14px]">expand_less</span></>
                        ) : (
                          <>View All {venue.races.length} Races <span className="material-symbols-outlined text-[14px]">expand_more</span></>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* お知らせ */}
        <section className="px-4 mb-12">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-black text-xl font-[family-name:var(--font-noto-sans-jp)] tracking-tight">お知らせ</h2>
            <span className="text-[10px] font-[family-name:var(--font-rajdhani)] font-bold text-[var(--kaiko-on-surface-variant)] opacity-60 tracking-widest">INFORMATION</span>
          </div>
          <div className="bg-white border border-[var(--kaiko-outline-variant)] divide-y divide-[var(--kaiko-outline-variant)] shadow-sm">
            {NOTICES.map((n, i) => (
              <div key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-[family-name:var(--font-rajdhani)] font-bold text-[var(--kaiko-primary)] tracking-wider">{n.date}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 uppercase font-[family-name:var(--font-rajdhani)] ${n.typeBg}`}>{n.type}</span>
                </div>
                <p className="text-sm font-medium mt-1.5 leading-relaxed">{n.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <BottomNav />

      {showModal && (
        <WeekSelectModal
          currentOffset={weekOffset}
          onSelect={setWeekOffset}
          onClose={() => setShowModal(false)}
        />
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}
