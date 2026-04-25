"use client";

import { useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import PurchaseSupportSection from "@/app/races/upcoming/[id]/PurchaseSupportSection";
import type { UpcomingEntryWithForm } from "@/lib/database.types";

// ─── 型 ──────────────────────────────────────────────────────────

export interface PickEntry {
  entryId: number;
  horseId: number | null;
  horseName: string;
  frameNumber: number | null;
  horseNumber: number | null;
  odds: number | null;
  popularity: number | null;
  jockey: string | null;
  symbol: "◎" | "○";
  abilityRank: number;
  adjustedRank: number;
  runningStyle: string | null;
  rating: number | null;
}

export interface RaceWithPicks {
  raceId: string;
  raceName: string;
  raceDate: string;
  track: string;
  grade: string;
  surface: string;
  distance: number;
  raceNumber: number | null;
  pacePattern: "前残り" | "差し有利" | "フラット";
  entries: PickEntry[];
  adjustedScores: [number, number][];
  allEntries: { horseId: number; horseName: string; horseNumber: number | null; popularity: number | null; odds: number | null }[];
}

// ─── スタイル定数 ─────────────────────────────────────────────────

const SYMBOL_STYLE: Record<"◎" | "○", { color: string; label: string }> = {
  "◎": { color: "text-[var(--kaiko-primary)]", label: "適正1位" },
  "○": { color: "text-blue-500",               label: "適正2位" },
};

const GRADE_STYLE: Record<string, string> = {
  G1: "text-[var(--kaiko-primary)] border-[var(--kaiko-primary)]/40 bg-[var(--kaiko-primary)]/10",
  G2: "text-[var(--kaiko-primary)] border-[var(--kaiko-primary)]/40 bg-[var(--kaiko-primary)]/10",
  G3: "text-[var(--kaiko-text-muted)] border-black/10 bg-black/4",
};

const RUNNING_STYLE_COLOR: Record<string, string> = {
  "逃げ":     "text-[var(--kaiko-tag-red-text)]",
  "先行":     "text-[var(--kaiko-tag-gold-text)]",
  "差し":     "text-[var(--kaiko-tag-blue-text)]",
  "追い込み": "text-[var(--kaiko-tag-green-text)]",
};

const PACE_LABEL: Record<string, string> = {
  "前残り":   "前残り",
  "差し有利": "差し有利",
  "フラット": "フラット",
};

const WAKU_NUM_STYLE: Record<number, { bg: string; text: string }> = {
  1: { bg: "bg-white",       text: "text-[#131313]" },
  2: { bg: "bg-zinc-500",    text: "text-white" },
  3: { bg: "bg-red-600",     text: "text-white" },
  4: { bg: "bg-blue-600",    text: "text-white" },
  5: { bg: "bg-yellow-400",  text: "text-[#131313]" },
  6: { bg: "bg-emerald-600", text: "text-white" },
  7: { bg: "bg-orange-500",  text: "text-[#131313]" },
  8: { bg: "bg-pink-500",    text: "text-[#131313]" },
};

// ─── ユーティリティ ──────────────────────────────────────────────

function getWeekRange(): { sat: string; sun: string } {
  const today = new Date();
  const day = today.getDay();
  const diffToSat = day === 0 ? -1 : 6 - day;
  const sat = new Date(today);
  sat.setDate(today.getDate() + diffToSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { sat: fmt(sat), sun: fmt(sun) };
}

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}月${dt.getDate()}日`;
}

// ─── メインコンポーネント ────────────────────────────────────────

export default function PicksClient({ races }: { races: RaceWithPicks[] }) {
  const [activeDay, setActiveDay] = useState<"sat" | "sun">("sun");
  const [expandedRaces, setExpandedRaces] = useState<Set<string>>(
    () => new Set(races.length > 0 ? [races[0].raceId] : [])
  );

  const { sat, sun } = getWeekRange();
  const dateStr = activeDay === "sat" ? sat : sun;

  const filteredRaces = races.filter((r) => r.raceDate === dateStr);
  const byVenue = filteredRaces.reduce<Record<string, RaceWithPicks[]>>((acc, r) => {
    if (!acc[r.track]) acc[r.track] = [];
    acc[r.track].push(r);
    return acc;
  }, {});
  const venueList = Object.entries(byVenue);

  const totalHorses = filteredRaces.reduce((sum, r) => sum + r.entries.length, 0);

  const toggleRace = (raceId: string) => {
    setExpandedRaces((prev) => {
      const next = new Set(prev);
      if (next.has(raceId)) next.delete(raceId);
      else next.add(raceId);
      return next;
    });
  };

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-[#131313] border-b border-black/8">
        <Link href="/" className="flex items-baseline gap-0.5">
          <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter text-white">回顧</span>
          <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
        </Link>
        <div className="ml-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_activity</span>
          <span className="text-[13px] font-black text-white tracking-tight">コツコツ予想</span>
        </div>
      </header>

      <main className="pt-16 pb-28 max-w-md mx-auto">
        {/* 曜日タブ */}
        <div className="flex gap-2 px-3 pt-3 pb-2">
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

        {races.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--kaiko-text-muted)] px-3">
            <span className="material-symbols-outlined text-[48px]">search_off</span>
            <p className="text-sm font-bold">注目馬がいません</p>
            <p className="text-[11px] text-center leading-relaxed">直近の未来レースを表示します</p>
          </div>
        ) : venueList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-[var(--kaiko-text-muted)] px-3">
            <span className="material-symbols-outlined text-[40px]">event_busy</span>
            <p className="text-sm font-bold">該当日のレースがありません</p>
          </div>
        ) : (
          <div className="px-3 space-y-4">
            {/* 競馬場ごとにグループ表示 */}
            {venueList.map(([track, trackRaces]) => (
              <div key={track}>
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]">location_on</span>
                  <span className="text-[12px] font-black text-[#131313] uppercase tracking-wider">{track}</span>
                </div>

                <div className="space-y-3">
                  {trackRaces.map((race) => {
                    const gradeStyle = GRADE_STYLE[race.grade] ?? "text-[var(--kaiko-text-muted)] border-black/10 bg-black/4";
                    const adapted = race.allEntries.map((e) => ({
                      id: 0,
                      race_id: race.raceId,
                      horse_id: e.horseId,
                      horse_name: e.horseName,
                      frame_number: null,
                      horse_number: e.horseNumber,
                      jockey: null,
                      weight_carried: null,
                      odds: e.odds,
                      popularity: e.popularity,
                      recentPerfs: [],
                    } as UpcomingEntryWithForm));

                    return (
                      <div key={race.raceId} className="space-y-1.5">
                        {/* レースヘッダー */}
                        <Link
                          href={`/races/upcoming/${race.raceId}`}
                          className="flex items-center gap-2 px-1"
                        >
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${gradeStyle} uppercase shrink-0`}>
                            {race.grade || "—"}
                          </span>
                          {race.raceNumber !== null && (
                            <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] shrink-0">
                              R{race.raceNumber}
                            </span>
                          )}
                          <span className="text-[13px] font-black text-[#131313] truncate flex-1">{race.raceName}</span>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[var(--kaiko-primary)]/10 text-[var(--kaiko-primary)] shrink-0">
                            {PACE_LABEL[race.pacePattern]}
                          </span>
                          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px] shrink-0">chevron_right</span>
                        </Link>

                        {/* コツコツ予想 */}
                        <PurchaseSupportSection
                          adjustedScores={race.adjustedScores}
                          entriesWithForm={adapted}
                          raceId={race.raceId}
                          defaultOpen={false}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}

// ─── 馬行コンポーネント ────────────────────────────────────────────

function PickHorseRow({ entry, isLast }: { entry: PickEntry; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sym = entry.symbol;
  const symStyle = SYMBOL_STYLE[sym];
  const wakuStyle = WAKU_NUM_STYLE[Math.min(entry.frameNumber ?? 1, 8)] ?? WAKU_NUM_STYLE[1];

  return (
    <div className={`${isLast ? "" : "border-b border-black/6"}`}>
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-black/4 active:bg-black/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* 印 */}
        <span className={`text-2xl font-black leading-none w-7 text-center shrink-0 ${symStyle.color}`}>
          {sym}
        </span>

        {/* 馬番バッジ */}
        <div className={`w-6 h-6 rounded-lg ${wakuStyle.bg} border border-black/10 flex items-center justify-center text-[11px] font-black shrink-0 ${wakuStyle.text}`}>
          {entry.horseNumber ?? "—"}
        </div>

        {/* 馬名・騎手 */}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-black text-[#131313] truncate">{entry.horseName}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {entry.jockey && (
              <span className="text-[10px] text-[var(--kaiko-text-muted)] truncate">{entry.jockey}</span>
            )}
            {entry.runningStyle && (
              <span className={`text-[10px] font-black shrink-0 ${RUNNING_STYLE_COLOR[entry.runningStyle] ?? "text-[var(--kaiko-text-muted)]"}`}>
                {entry.runningStyle}
              </span>
            )}
          </div>
        </div>

        {/* 能力ランク・適正ランク */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 能力ランク（青） */}
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-[var(--kaiko-primary)] uppercase tracking-wider leading-none mb-0.5">能力</span>
            <span className={`font-black leading-none ${
              entry.abilityRank === 1 ? "text-[18px] text-[var(--kaiko-primary)]" :
              entry.abilityRank <= 3  ? "text-[15px] text-[#131313]" :
              "text-[13px] text-[var(--kaiko-text-muted)]"
            }`}>{entry.abilityRank}<span className="text-[9px]">位</span></span>
          </div>
          {/* 適正ランク（オレンジ） */}
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-orange-500 uppercase tracking-wider leading-none mb-0.5">適正</span>
            <span className={`font-black leading-none ${
              entry.adjustedRank === 1 ? "text-[18px] text-orange-500" :
              entry.adjustedRank <= 3  ? "text-[15px] text-[#131313]" :
              "text-[13px] text-[var(--kaiko-text-muted)]"
            }`}>{entry.adjustedRank}<span className="text-[9px]">位</span></span>
          </div>
        </div>

        {/* オッズ・人気 */}
        <div className="shrink-0 text-right min-w-[44px]">
          {entry.odds !== null && (
            <div className="text-[14px] font-black text-[#131313]">{entry.odds.toFixed(1)}倍</div>
          )}
          {entry.popularity !== null && (
            <div className={`text-[11px] font-black ${
              entry.popularity <= 3 ? "text-[var(--kaiko-primary)]" :
              entry.popularity <= 6 ? "text-[#131313]" :
              "text-[var(--kaiko-text-muted)]"
            }`}>{entry.popularity}番人気</div>
          )}
        </div>

        <span className="material-symbols-outlined text-[var(--kaiko-text-muted)] text-[16px] shrink-0">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {/* 展開パネル */}
      {expanded && (
        <div className="mx-4 mb-3 rounded-xl border border-black/8 bg-black/3 p-3 space-y-2">
          {/* 印・ラベル */}
          <div className="flex items-center gap-2">
            <span className={`text-[22px] font-black leading-none ${symStyle.color}`}>{sym}</span>
            <span className={`text-[13px] font-black ${symStyle.color}`}>{symStyle.label}</span>
            {entry.runningStyle && (
              <span className={`ml-auto text-[11px] font-black ${RUNNING_STYLE_COLOR[entry.runningStyle] ?? ""}`}>
                {entry.runningStyle}
              </span>
            )}
          </div>

          {/* 能力ランク・適正ランク横並び */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[var(--kaiko-primary)]/5 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] font-black text-[var(--kaiko-primary)] uppercase tracking-wider">能力ランク</span>
              <span className={`text-[20px] font-black leading-none ${
                entry.abilityRank === 1 ? "text-[var(--kaiko-primary)]" :
                entry.abilityRank <= 3  ? "text-[#131313]" :
                "text-[var(--kaiko-text-muted)]"
              }`}>{entry.abilityRank}<span className="text-[11px]">位</span></span>
            </div>
            <div className="bg-orange-50 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-wider">適正ランク</span>
              <span className={`text-[20px] font-black leading-none ${
                entry.adjustedRank === 1 ? "text-orange-500" :
                entry.adjustedRank <= 3  ? "text-[#131313]" :
                "text-[var(--kaiko-text-muted)]"
              }`}>{entry.adjustedRank}<span className="text-[11px]">位</span></span>
            </div>
          </div>

          {/* レーティング */}
          {entry.rating !== null && (
            <div className="flex items-center justify-between border-t border-black/8 pt-2">
              <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">レーティング</span>
              <span className="text-[14px] font-black text-[#131313]">{entry.rating.toFixed(2)}</span>
            </div>
          )}

          {/* 人気との差 */}
          {entry.popularity !== null && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">現在人気</span>
              <span className={`text-[14px] font-black px-2 py-0.5 rounded-xl ${
                entry.popularity <= 3 ? "bg-[var(--kaiko-primary)] text-[#131313]" :
                entry.popularity <= 6 ? "bg-black/8 text-[#131313]" :
                "bg-black/5 text-[var(--kaiko-text-muted)]"
              }`}>{entry.popularity}番人気</span>
            </div>
          )}

          {entry.horseId && (
            <Link
              href={`/horses/${entry.horseId}`}
              className="flex items-center justify-end gap-1 text-[11px] font-bold text-[var(--kaiko-primary)] pt-1"
              onClick={(e) => e.stopPropagation()}
            >
              馬ページへ
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
