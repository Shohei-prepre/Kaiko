"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Lottie from "lottie-react";
import horseRunAnimation from "@/lib/horse-run.json";
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

  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

  return {
    sat: toLocalDateStr(sat),
    sun: toLocalDateStr(sun),
    label: `${fmt(sat)} - ${fmt(sun)}`,
  };
}

interface VenueGroup {
  track: string;
  races: Race[];
}

interface UpcomingRace {
  race_id?: string;
  race_number: number;
  race_name: string;
  grade: string;
  distance: number;
  surface: "芝" | "ダート" | "障";
}

interface UpcomingVenue {
  track: string;
  races: UpcomingRace[];
}

const MOCK_UPCOMING: Record<string, UpcomingVenue[]> = {
  "SATURDAY": [
    {
      track: "中山",
      races: [
        { race_number: 11, race_name: "ニュージーランドトロフィー", grade: "G2", distance: 1600, surface: "芝" },
        { race_number: 10, race_name: "春雷ステークス", grade: "OP", distance: 1200, surface: "芝" },
        { race_number: 9,  race_name: "3歳500万下", grade: "—", distance: 1800, surface: "芝" },
      ],
    },
    {
      track: "阪神",
      races: [
        { race_number: 11, race_name: "阪神牝馬ステークス", grade: "G2", distance: 1600, surface: "芝" },
        { race_number: 10, race_name: "阪神ダービートライアル", grade: "OP", distance: 1800, surface: "ダート" },
        { race_number: 9,  race_name: "4歳以上1000万下", grade: "—", distance: 2000, surface: "芝" },
      ],
    },
  ],
  "SUNDAY": [
    {
      track: "中山",
      races: [
        { race_number: 11, race_name: "皐月賞", grade: "G1", distance: 2000, surface: "芝" },
        { race_number: 10, race_name: "中山グランドジャンプ", grade: "G1", distance: 4250, surface: "障" },
        { race_number: 9,  race_name: "4歳以上1600万下", grade: "—", distance: 2200, surface: "芝" },
      ],
    },
    {
      track: "阪神",
      races: [
        { race_number: 11, race_name: "アンタレスステークス", grade: "G3", distance: 1800, surface: "ダート" },
        { race_number: 10, race_name: "忘れな草賞", grade: "OP", distance: 2000, surface: "芝" },
        { race_number: 9,  race_name: "3歳500万下", grade: "—", distance: 1600, surface: "芝" },
      ],
    },
  ],
};

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

/** グレードバッジ：ライトテーマ対応 */
function GradeBadge({ grade }: { grade: string }) {
  if (grade === "G1")
    return <span className="bg-[var(--kaiko-primary)] text-[#131313] text-[10px] font-black px-1.5 py-0.5 rounded">{grade}</span>;
  if (grade === "G2" || grade === "G3")
    return <span className="bg-black/6 text-[#131313] text-[10px] font-bold px-1.5 py-0.5 rounded border border-black/10">{grade}</span>;
  if (grade === "OP")
    return <span className="border border-black/10 text-[var(--kaiko-text-muted)] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">{grade}</span>;
  return null;
}

const NOTICES = [
  { date: "2026.04.01", type: "Update", typeBg: "bg-[var(--kaiko-primary-container)] text-[var(--kaiko-primary)]", text: "新機能：AIによるレース直後評価の精度が向上しました。" },
  { date: "2026.03.25", type: "Maintenance", typeBg: "bg-black/6 text-[var(--kaiko-text-muted)]", text: "次回メンテナンスの予定はありません。" },
];

/** 週選択モーダル（ダーク背景を維持） */
function WeekSelectModal({
  currentOffset,
  onSelect,
  onClose,
}: {
  currentOffset: number;
  onSelect: (offset: number) => void;
  onClose: () => void;
}) {
  const weeks = Array.from({ length: 27 }, (_, i) => i - 24);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="bg-[#131313] w-full max-h-[70vh] flex flex-col rounded-t-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-black/8">
          <span className="font-bold text-white">週を選択</span>
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
                className={`w-full flex items-center justify-between px-4 py-3 border-b border-black/6 text-left ${isSelected ? "bg-black/6" : "hover:bg-black/4"}`}
              >
                <div>
                  <span className={`text-sm font-bold ${isSelected ? "text-[var(--kaiko-primary)]" : "text-white"}`}>
                    {w.label}
                  </span>
                  {isCurrent && (
                    <span className="ml-2 text-[10px] font-bold text-[var(--kaiko-primary)] uppercase">今週</span>
                  )}
                  {offset === 1 && (
                    <span className="ml-2 text-[10px] font-bold text-[var(--kaiko-tag-green-text)] uppercase">来週</span>
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

/** Upcoming 開催場カード：ライトテーマ対応 */
function UpcomingVenueCard({
  venue,
  expanded,
  onToggle,
}: {
  venue: UpcomingVenue;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sorted = [...venue.races].sort((a, b) => {
    const gradeOrder: Record<string, number> = { G1: 0, G2: 1, G3: 2, OP: 3 };
    const ga = gradeOrder[a.grade] ?? 4;
    const gb = gradeOrder[b.grade] ?? 4;
    if (ga !== gb) return ga - gb;
    return b.race_number - a.race_number;
  });
  const display = expanded ? sorted : sorted.slice(0, 3);

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-black/8">
      <div className="px-4 py-3 border-b border-black/8 flex justify-between items-center">
        <h2 className="text-xl font-black text-[#131313] tracking-tight">{venue.track}</h2>
        <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)]">
          {venue.races.length} レース
        </span>
      </div>
      <div className="divide-y divide-black/6">
        {display.map((race) => {
          const inner = (
            <>
              {/* レース番号バッジ：ダーク背景・白テキスト */}
              <div className="min-w-[40px] h-8 px-1.5 flex items-center justify-center font-black text-[13px] flex-shrink-0 bg-[#131313] text-white rounded-xl">
                {race.race_number}R
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <GradeBadge grade={race.grade} />
                  <h3 className="font-bold text-sm text-[#131313] truncate tracking-tight">{race.race_name}</h3>
                </div>
                <span className="text-[11px] text-[var(--kaiko-text-muted)] font-medium">
                  {race.distance}m / {race.surface === "芝" ? "Turf" : race.surface === "ダート" ? "Dirt" : "Hurdle"}
                </span>
              </div>
              <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] flex-shrink-0">
                chevron_right
              </span>
            </>
          );
          if (!race.race_id) {
            return (
              <div key={race.race_number} className="flex items-center gap-3 px-4 py-3 opacity-50">
                <div className="min-w-[40px] h-8 px-1.5 flex items-center justify-center font-black text-[13px] flex-shrink-0 bg-black/6 text-[var(--kaiko-text-muted)] rounded-xl">
                  {race.race_number}R
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <GradeBadge grade={race.grade} />
                    <h3 className="font-bold text-sm text-[var(--kaiko-text-muted)] truncate tracking-tight">準備中...</h3>
                  </div>
                  <span className="text-[11px] text-[var(--kaiko-text-muted)] font-medium">
                    {race.distance}m / {race.surface === "芝" ? "Turf" : race.surface === "ダート" ? "Dirt" : "Hurdle"}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <Link key={race.race_id} href={`/races/upcoming/${race.race_id}`} className="flex items-center gap-3 px-4 py-3 active:opacity-60 transition-opacity hover:bg-black/4">
              {inner}
            </Link>
          );
        })}
      </div>
      {venue.races.length > 3 && (
        <button
          onClick={onToggle}
          className="w-full py-3 text-[var(--kaiko-text-muted)] text-[11px] font-bold border-t border-black/8 flex items-center justify-center gap-1 bg-black/4 active:opacity-60"
        >
          {expanded ? (
            <>閉じる <span className="material-symbols-outlined text-[14px]">expand_less</span></>
          ) : (
            <>{venue.races.length}レースを見る <span className="material-symbols-outlined text-[14px]">expand_more</span></>
          )}
        </button>
      )}
    </div>
  );
}

export default function RacesClient() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeDay, setActiveDay] = useState<"sat" | "sun">("sun");
  const [venues, setVenues] = useState<VenueGroup[]>([]);
  const [upcomingVenues, setUpcomingVenues] = useState<UpcomingVenue[]>([]);
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
  const isOtherWeek = ![-1, 0, 1].includes(weekOffset);

  const dateStr = activeDay === "sat" ? currentWeek.sat : currentWeek.sun;

  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  // 先週土曜日以降はすべて upcoming（予想）として表示
  const isFutureDate = dateStr >= getWeekRange(-1).sat;

  useEffect(() => {
    const fallbackMock = MOCK_UPCOMING[activeDay === "sat" ? "SATURDAY" : "SUNDAY"] ?? [];

    if (isFutureDate) {
      setVenues([]);
      setUpcomingVenues(fallbackMock);
      setLoading(false);

      let cancelled = false;
      try {
        const supabase = getSupabase();
        Promise.resolve(
          supabase
            .from("upcoming_races" as never)
            .select("*")
            .eq("race_date", dateStr)
            .order("race_number")
        ).then(({ data }) => {
          if (cancelled) return;
          if (data && (data as {race_id:string}[]).length > 0) {
            type URow = { race_id: string; race_name: string; grade: string; distance: number; surface: string; track: string; race_number: number };
            const rows = data as URow[];
            const map = new Map<string, UpcomingRace[]>();
            for (const r of rows) {
              if (!map.has(r.track)) map.set(r.track, []);
              map.get(r.track)!.push({
                race_id: r.race_id,
                race_number: r.race_number ?? 0,
                race_name: r.race_name,
                grade: r.grade,
                distance: r.distance,
                surface: (r.surface as "芝" | "ダート" | "障") ?? "芝",
              });
            }
            setUpcomingVenues(
              Array.from(map.entries()).map(([track, races]) => ({ track, races }))
            );
          }
        }).catch(() => {});
      } catch {}

      return () => { cancelled = true; };
    } else {
      setLoading(true);
      setVenues([]);
      setUpcomingVenues([]);

      const timeout = setTimeout(() => setLoading(false), 3000);
      let cancelled = false;

      try {
        const supabase = getSupabase();
        Promise.resolve(
          supabase
            .from("races")
            .select("*")
            .eq("race_date", dateStr)
            .order("race_number")
        ).then(({ data }) => {
          if (cancelled) return;
          clearTimeout(timeout);

          if (data && (data as Race[]).length > 0) {
            setVenues(groupByVenue(data as Race[]));
            setLoading(false);
          } else {
            Promise.resolve(
              supabase
                .from("upcoming_races" as never)
                .select("*")
                .eq("race_date", dateStr)
                .order("race_number")
            ).then(({ data: upData }) => {
              if (cancelled) return;
              if (upData && (upData as { race_id: string }[]).length > 0) {
                type URow = { race_id: string; race_name: string; grade: string; distance: number; surface: string; track: string; race_number: number };
                const rows = upData as URow[];
                const map = new Map<string, UpcomingRace[]>();
                for (const r of rows) {
                  if (!map.has(r.track)) map.set(r.track, []);
                  map.get(r.track)!.push({
                    race_id: r.race_id,
                    race_number: r.race_number ?? 0,
                    race_name: r.race_name,
                    grade: r.grade,
                    distance: r.distance,
                    surface: (r.surface as "芝" | "ダート" | "障") ?? "芝",
                  });
                }
                setUpcomingVenues(
                  Array.from(map.entries()).map(([track, races]) => ({ track, races }))
                );
              }
              setLoading(false);
            }).catch(() => {
              if (!cancelled) setLoading(false);
            });
          }
        }).catch(() => {
          if (cancelled) return;
          clearTimeout(timeout);
          setLoading(false);
        });
      } catch {
        clearTimeout(timeout);
        setLoading(false);
      }

      return () => { cancelled = true; clearTimeout(timeout); };
    }
  }, [dateStr, isFutureDate, activeDay]);

  return (
    <div className="min-h-screen pb-20">
      {/* ヘッダー：ダーク背景を維持 */}
      <header className="bg-[#131313] flex items-center w-full px-4 h-14 sticky top-0 z-50">
        <Link href="/" className="text-xl font-black tracking-tighter text-white font-[family-name:var(--font-noto-sans-jp)]">
          回顧<span className="text-[var(--kaiko-primary)] italic">AI</span>
        </Link>
      </header>

      <main className="max-w-md mx-auto">
        {/* 週セレクター：先週・今週・来週 */}
        <div className="bg-white border-b border-black/8">
          <div className="flex px-4 pt-3">
            {[
              { offset: -1, label: "先週" },
              { offset:  0, label: "今週" },
              { offset:  1, label: "来週" },
            ].map(({ offset, label }) => {
              const w = getWeekRange(offset);
              const isActive = weekOffset === offset;
              return (
                <button
                  key={offset}
                  onClick={() => setWeekOffset(offset)}
                  style={{ touchAction: "manipulation" }}
                  className={`flex-1 pb-3 text-center transition-colors ${
                    isActive
                      ? "border-b-2 border-[var(--kaiko-primary)] text-[#131313]"
                      : "text-[var(--kaiko-text-muted)]"
                  }`}
                >
                  <span className="text-sm font-bold">{label}</span>
                  <span className="block text-[10px]">{w.label}</span>
                </button>
              );
            })}
          </div>
          {/* 他の週を見る */}
          <button
            onClick={() => setShowModal(true)}
            style={{ touchAction: "manipulation" }}
            className="w-full py-2 flex items-center justify-center gap-1 text-[11px] font-bold text-[var(--kaiko-text-muted)] active:opacity-60 border-t border-black/6"
          >
            <span className="material-symbols-outlined text-[14px]">calendar_month</span>
            他の週を見る
            {isOtherWeek && (
              <span className="text-[var(--kaiko-primary)] ml-1">({currentWeek.label})</span>
            )}
          </button>
        </div>

        {/* 曜日タブ */}
        <div className="px-4 py-4 flex gap-2">
          {(["sat", "sun"] as const).map((day) => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              style={{ touchAction: "manipulation" }}
              className={`px-6 py-2 rounded-xl text-sm font-bold active:opacity-70 transition-all ${
                activeDay === day
                  ? "bg-[var(--kaiko-primary)] text-[#131313] shadow-sm"
                  : "bg-white border border-black/8 text-[var(--kaiko-text-muted)]"
              }`}
            >
              {day === "sat" ? "土曜日" : "日曜日"}
            </button>
          ))}
        </div>

        {/* Upcoming バナー */}
        {(isFutureDate || upcomingVenues.length > 0) && (
          <p className="mx-4 mb-3 text-[11px] text-[var(--kaiko-text-muted)]">分析データはレース終了後に公開されます。出走情報は変更になる場合があります。</p>
        )}

        {/* 競馬場カード */}
        <section className="mb-8">
          {loading ? (
            <div className="mx-4 bg-white border border-black/8 rounded-xl p-8 flex flex-col items-center gap-2">
              <Lottie animationData={horseRunAnimation} loop autoplay className="w-32 h-32" />
              <p className="text-sm text-[var(--kaiko-text-muted)]">読み込み中...</p>
            </div>
          ) : isFutureDate || upcomingVenues.length > 0 ? (
            upcomingVenues.length === 0 ? (
              <div className="mx-4 bg-white border border-black/8 rounded-xl p-8 text-center">
                <p className="text-sm text-[var(--kaiko-text-muted)]">出走前データがありません</p>
              </div>
            ) : (
              <div className="space-y-3 px-4">
                {upcomingVenues.map((venue) => (
                  <UpcomingVenueCard
                    key={venue.track}
                    venue={venue}
                    expanded={expandedVenues.has(venue.track)}
                    onToggle={() => toggleVenue(venue.track)}
                  />
                ))}
              </div>
            )
          ) : venues.length === 0 ? (
            <div className="mx-4 bg-white border border-black/8 rounded-xl p-8 text-center">
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
                  <div key={venue.track} className="bg-white rounded-xl overflow-hidden border border-black/8">
                    <div className="px-4 py-3 border-b border-black/8 flex justify-between items-center">
                      <h2 className="text-xl font-black text-[#131313] tracking-tight">{venue.track}</h2>
                      <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)]">
                        {venue.races.length} レース
                      </span>
                    </div>
                    <div className="divide-y divide-black/6">
                      {displayRaces.map((race) => (
                        <Link key={race.race_id} href={`/races/${race.race_id}`} className="flex items-center gap-3 px-4 py-3 active:opacity-60 transition-opacity hover:bg-black/4">
                          {/* レース番号バッジ：ダーク背景・白テキスト */}
                          <div className="min-w-[40px] h-8 px-1.5 flex items-center justify-center font-black text-[13px] flex-shrink-0 bg-[#131313] text-white rounded-xl">
                            {race.race_number ?? "?"}R
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <GradeBadge grade={race.grade} />
                              <h3 className="font-bold text-sm text-[#131313] truncate tracking-tight">{race.race_name}</h3>
                            </div>
                            <span className="text-[11px] text-[var(--kaiko-text-muted)] font-medium">
                              {race.distance}m / {race.surface === "芝" ? "Turf" : "Dirt"}
                            </span>
                          </div>
                          <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] flex-shrink-0">chevron_right</span>
                        </Link>
                      ))}
                    </div>
                    {venue.races.length > 3 && (
                      <button
                        onClick={() => toggleVenue(venue.track)}
                        className="w-full py-3 text-[var(--kaiko-text-muted)] text-[11px] font-bold border-t border-black/8 flex items-center justify-center gap-1 bg-black/4 active:opacity-60"
                      >
                        {isExpanded ? (
                          <>閉じる <span className="material-symbols-outlined text-[14px]">expand_less</span></>
                        ) : (
                          <>{venue.races.length}レースを見る <span className="material-symbols-outlined text-[14px]">expand_more</span></>
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
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-black text-xl text-[#131313] tracking-tight">お知らせ</h2>
            <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] tracking-widest uppercase">基本情報</span>
          </div>
          <div className="bg-white border border-black/8 rounded-xl overflow-hidden">
            {NOTICES.map((n, i) => (
              <div key={i} className={`p-4 ${i < NOTICES.length - 1 ? "border-b border-black/8" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-[var(--kaiko-primary)] tracking-wider">{n.date}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${n.typeBg}`}>{n.type}</span>
                </div>
                <p className="text-sm font-medium mt-1.5 leading-relaxed text-[#131313]">{n.text}</p>
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
