"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import type { Race } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

// 今週の土日を計算（weekOffset: 0=今週, 1=来週, -1=先週）
function getWeekRange(weekOffset = 0): { sat: string; sun: string; label: string } {
  const today = new Date();
  const day = today.getDay(); // 0=日, 6=土
  const diffToSat = ((6 - day + 7) % 7) - (day === 0 ? 7 : 0);
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
  session: string;
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
    session: "",
    races: rs.sort((a, b) => (b.grade > a.grade ? -1 : 1)),
  }));
}

// グレードバッジ
function GradeBadge({ grade }: { grade: string }) {
  if (grade === "G1")
    return <span className="bg-[#f59e0b] text-white text-[10px] font-bold px-1.5 py-0.5">{grade}</span>;
  if (grade === "G2" || grade === "G3")
    return <span className="bg-[var(--kaiko-on-surface-variant)] text-white text-[10px] font-bold px-1.5 py-0.5">{grade}</span>;
  if (grade === "OP")
    return <span className="border border-[var(--kaiko-border)] text-[var(--kaiko-on-surface-variant)] text-[10px] font-bold px-1.5 py-0.5 font-[family-name:var(--font-rajdhani)] uppercase">{grade}</span>;
  return null;
}

// お知らせダミーデータ
const NOTICES = [
  { date: "2026.04.01", type: "Update", typeBg: "bg-[var(--kaiko-primary-container)] text-[var(--kaiko-primary)]", text: "新機能：AIによるレース直後評価の精度が向上しました。" },
  { date: "2026.03.25", type: "Maintenance", typeBg: "bg-gray-100 text-[var(--kaiko-on-surface-variant)]", text: "次回メンテナンスの予定はありません。" },
];

export default function RacesClient() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeDay, setActiveDay] = useState<"sat" | "sun">("sun");
  const [venues, setVenues] = useState<VenueGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const thisWeek = getWeekRange(0);
  const nextWeek = getWeekRange(1);
  const currentWeek = weekOffset === 0 ? thisWeek : nextWeek;

  useEffect(() => {
    const dateStr = activeDay === "sat" ? currentWeek.sat : currentWeek.sun;
    setLoading(true);
    const supabase = getSupabase();
    supabase
      .from("races")
      .select("*")
      .eq("race_date", dateStr)
      .order("track")
      .then(({ data }) => {
        setVenues(groupByVenue((data ?? []) as Race[]));
        setLoading(false);
      });
  }, [weekOffset, activeDay, currentWeek.sat, currentWeek.sun]);

  return (
    // この画面のみ border-radius: 0（シャープコーナー）
    <div className="[&_*]:!rounded-none min-h-screen bg-[#f8f9fa] text-[var(--kaiko-on-surface)] pb-20">
      {/* ヘッダー */}
      <header className="bg-white border-b border-[var(--kaiko-outline-variant)] flex justify-between items-center w-full px-4 h-14 sticky top-0 z-50">
        <h1 className="text-xl font-black tracking-tighter text-[var(--kaiko-primary)] font-[family-name:var(--font-noto-sans-jp)]">回顧AI</h1>
        <button className="flex items-center gap-1.5 p-2 hover:bg-gray-50 transition-colors active:scale-95 duration-100">
          <span className="text-[12px] font-bold text-[var(--kaiko-on-surface-variant)]">ほかの週を見る</span>
          <span className="material-symbols-outlined text-[var(--kaiko-on-surface-variant)]">calendar_month</span>
        </button>
      </header>

      <main className="max-w-md mx-auto">
        {/* 週セレクター */}
        <div className="bg-white px-4 pt-4 border-b border-[var(--kaiko-outline-variant)]">
          <div className="flex gap-4">
            {[
              { offset: 1, label: "来週", sublabel: "Next Week", range: nextWeek.label },
              { offset: 0, label: "今週", sublabel: "This Week", range: thisWeek.label },
            ].map(({ offset, label, sublabel, range }) => (
              <button
                key={offset}
                onClick={() => setWeekOffset(offset)}
                className={`flex-1 pb-3 text-center transition-colors ${
                  weekOffset === offset
                    ? "border-b-2 border-[var(--kaiko-primary)] text-[var(--kaiko-primary)]"
                    : "text-[var(--kaiko-on-surface-variant)] opacity-60"
                }`}
              >
                <span className="block text-[10px] font-[family-name:var(--font-rajdhani)] font-bold uppercase tracking-widest">{sublabel}</span>
                <span className="text-sm font-bold">{label}</span>
                <span className="block text-[10px] font-[family-name:var(--font-rajdhani)]">{range}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 曜日タブ（ピル型 → この画面だけ !rounded-none を上書きして rounded-full を使う） */}
        <div className="px-4 py-4 flex gap-2">
          {(["sat", "sun"] as const).map((day) => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`px-6 py-1.5 !rounded-full text-sm font-bold active:scale-95 transition-all ${
                activeDay === day
                  ? "bg-[var(--kaiko-primary)] text-white shadow-sm"
                  : "bg-white border border-[var(--kaiko-outline-variant)] text-[var(--kaiko-on-surface-variant)]"
              }`}
            >
              {day === "sat" ? "土曜日" : "日曜日"}
            </button>
          ))}
        </div>

        {/* 競馬場カード（横スクロール） */}
        <section className="mb-8">
          <div className="flex overflow-x-auto gap-4 px-4 no-scrollbar snap-x">
            {loading ? (
              <div className="min-w-[290px] snap-center bg-white border border-[var(--kaiko-outline-variant)] p-8 text-center text-sm text-[var(--kaiko-text-muted)]">
                読み込み中...
              </div>
            ) : venues.length === 0 ? (
              <div className="min-w-[290px] snap-center bg-white border border-[var(--kaiko-outline-variant)] p-8 text-center text-sm text-[var(--kaiko-text-muted)]">
                レースデータがありません
              </div>
            ) : (
              venues.map((venue) => {
                const mainRaces = venue.races.slice(0, 3);
                return (
                  <div
                    key={venue.track}
                    className="min-w-[290px] snap-center bg-white border border-[var(--kaiko-outline-variant)] flex-shrink-0 shadow-sm"
                  >
                    {/* カードヘッダー */}
                    <div className="p-4 border-b border-[var(--kaiko-outline-variant)] flex justify-between items-end">
                      <h2 className="text-xl font-black font-[family-name:var(--font-noto-sans-jp)] tracking-tight">{venue.track}</h2>
                      {venue.session && (
                        <span className="bg-gray-100 px-2 py-0.5 text-[10px] font-[family-name:var(--font-rajdhani)] font-bold">{venue.session}</span>
                      )}
                    </div>

                    {/* レース一覧 */}
                    <div className="p-4 space-y-4">
                      {mainRaces.map((race, i) => {
                        const isMain = i === 0;
                        return (
                          <Link key={race.id} href={`/races/${race.id}`} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                            <div className={`w-9 h-9 flex items-center justify-center font-bold font-[family-name:var(--font-rajdhani)] text-sm flex-shrink-0 ${isMain ? "bg-[var(--kaiko-on-surface)] text-white" : "bg-gray-200 text-[var(--kaiko-on-surface-variant)]"}`}>
                              {String(mainRaces.indexOf(race) + 9).padStart(2, " ")}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <GradeBadge grade={race.grade} />
                                <h3 className="font-bold text-sm truncate tracking-tight">{race.race_name}</h3>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[11px] text-[var(--kaiko-on-surface-variant)] font-[family-name:var(--font-rajdhani)] font-medium tracking-tight">
                                  {race.distance}m / {race.surface === "芝" ? "Turf" : "Dirt"}
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>

                    <button className="w-full py-3 bg-gray-50 text-[var(--kaiko-primary)] text-[10px] font-bold font-[family-name:var(--font-rajdhani)] uppercase tracking-widest border-t border-[var(--kaiko-outline-variant)] hover:bg-[var(--kaiko-primary-container)] transition-colors">
                      View all {venue.races.length} Races
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* お知らせ */}
        <section className="px-4 mb-12">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-black text-xl font-[family-name:var(--font-noto-sans-jp)] tracking-tight">お知らせ</h2>
            <span className="text-[10px] font-[family-name:var(--font-rajdhani)] font-bold text-[var(--kaiko-on-surface-variant)] opacity-60 tracking-widest">INFORMATION</span>
          </div>
          <div className="bg-white border border-[var(--kaiko-outline-variant)] divide-y divide-[var(--kaiko-outline-variant)] shadow-sm">
            {NOTICES.map((n, i) => (
              <div key={i} className="p-4 hover:bg-gray-50 transition-colors">
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

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}
