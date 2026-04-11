"use client";

import { useState } from "react";
import Link from "next/link";
import type { HorsePick, PickSymbol } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

// ─── 型 ──────────────────────────────────────────────────────────

export interface HorseStats {
  abilityRank: number;
  oddsRank: number;
  avgScore: number;
  racesAnalyzed: number;
}

export interface PickEntry {
  entryId: number;
  horseId: number | null;
  horseName: string;
  frameNumber: number | null;
  horseNumber: number | null;
  odds: number | null;
  popularity: number | null;
  jockey: string | null;
  pick: HorsePick | null;
  stats: HorseStats | null;
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
  entries: PickEntry[];
}

// ─── スタイル定数 ─────────────────────────────────────────────────

const PICK_STYLE: Record<PickSymbol, { color: string; bg: string; border: string; label: string }> = {
  "◎": { color: "text-[var(--kaiko-sym-good)]",  bg: "bg-amber-50",   border: "border-amber-200",  label: "最注目" },
  "○": { color: "text-[var(--kaiko-sym-great)]", bg: "bg-blue-50",    border: "border-blue-200",   label: "注目" },
  "▲": { color: "text-[var(--kaiko-primary)]",   bg: "bg-indigo-50",  border: "border-indigo-200", label: "対抗" },
  "△": { color: "text-emerald-600",              bg: "bg-emerald-50", border: "border-emerald-200",label: "複穴" },
  "★": { color: "text-rose-500",                 bg: "bg-rose-50",    border: "border-rose-200",   label: "逆張り" },
  "✓": { color: "text-[var(--kaiko-text-muted)]",bg: "bg-gray-50",    border: "border-gray-200",   label: "データあり" },
};

const GRADE_STYLE: Record<string, string> = {
  G1: "text-[var(--kaiko-tag-gold-text)] border-[#e8c060] bg-[var(--kaiko-tag-gold-bg)]",
  G2: "text-[var(--kaiko-tag-gold-text)] border-[#e8c060] bg-[var(--kaiko-tag-gold-bg)]",
  G3: "text-[var(--kaiko-text-sub)] border-gray-300 bg-gray-100",
};

const NOTABLE_SYMBOLS: PickSymbol[] = ["◎", "○", "▲", "△", "★"];

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}月${dt.getDate()}日`;
}

// ─── メインコンポーネント ────────────────────────────────────────

export default function PicksClient({ races }: { races: RaceWithPicks[] }) {
  const [expandedRaces, setExpandedRaces] = useState<Set<string>>(
    () => new Set(races.length > 0 ? [races[0].raceId] : [])
  );

  const totalHorses = races.reduce((sum, r) => sum + r.entries.length, 0);

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
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-[var(--kaiko-border)] shadow-sm">
        <div className="flex items-baseline gap-0.5">
          <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter">回顧</span>
          <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
        </div>
        <div className="ml-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">tips_and_updates</span>
          <span className="text-[13px] font-black text-[var(--kaiko-text-main)] tracking-tight">注目馬</span>
        </div>
        <span className="ml-auto font-[family-name:var(--font-rajdhani)] text-[11px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">
          {totalHorses} horses
        </span>
      </header>

      <main className="pt-16 pb-28 max-w-md mx-auto">
        {races.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--kaiko-text-muted)]">
            <span className="material-symbols-outlined text-[48px]">search_off</span>
            <p className="text-sm font-bold">注目馬がいません</p>
            <p className="text-[11px] text-center leading-relaxed">
              直近の未来レースに印のついた馬を表示します
            </p>
          </div>
        ) : (
          <div className="px-3 pt-3 space-y-3">
            {/* 凡例 */}
            <div className="flex flex-wrap gap-2 px-1 pb-1">
              {NOTABLE_SYMBOLS.map((sym) => (
                <span key={sym} className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${PICK_STYLE[sym].bg} ${PICK_STYLE[sym].border} ${PICK_STYLE[sym].color}`}>
                  {sym} {PICK_STYLE[sym].label}
                </span>
              ))}
            </div>

            {races.map((race) => {
              const isExpanded = expandedRaces.has(race.raceId);
              const gradeStyle = GRADE_STYLE[race.grade] ?? "text-[var(--kaiko-text-sub)] border-gray-300 bg-gray-100";

              return (
                <div key={race.raceId} className="bg-white rounded-xl border border-[var(--kaiko-border)] shadow-[0_1px_3px_rgba(0,0,0,0.07)] overflow-hidden">
                  <button
                    onClick={() => toggleRace(race.raceId)}
                    className="w-full px-4 py-3 flex items-center gap-2 text-left active:bg-gray-50"
                  >
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${gradeStyle} font-[family-name:var(--font-rajdhani)] uppercase shrink-0`}>
                      {race.grade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        {race.raceNumber !== null && (
                          <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] shrink-0">
                            R{race.raceNumber}
                          </span>
                        )}
                        <div className="text-[13px] font-black text-[var(--kaiko-text-main)] truncate">
                          {race.raceName}
                        </div>
                      </div>
                      <div className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                        {formatDate(race.raceDate)} · {race.track} · {race.surface}{race.distance}m
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)]">
                        {race.entries.length}頭
                      </span>
                      <span className="material-symbols-outlined text-[var(--kaiko-text-muted)] text-[18px]">
                        {isExpanded ? "expand_less" : "expand_more"}
                      </span>
                    </div>
                  </button>

                  <div className="px-4 pb-1 -mt-1">
                    <Link
                      href={`/races/upcoming/${race.raceId}`}
                      className="text-[10px] text-[var(--kaiko-primary)] font-bold flex items-center gap-0.5 hover:underline"
                    >
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                      レース詳細を見る
                    </Link>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[var(--kaiko-border)]">
                      {race.entries.map((entry, i) => (
                        <PickHorseRow
                          key={entry.entryId}
                          entry={entry}
                          isLast={i === race.entries.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
  const pick = entry.pick!;
  const style = PICK_STYLE[pick.symbol];

  return (
    <div className={`${isLast ? "" : "border-b border-[var(--kaiko-border)]"}`}>
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-gray-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`text-2xl font-black leading-none w-7 text-center shrink-0 ${style.color}`}>
          {pick.symbol}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            {entry.horseNumber !== null && (
              <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                {entry.horseNumber}番
              </span>
            )}
            <span className="text-[14px] font-black text-[var(--kaiko-text-main)] truncate">
              {entry.horseName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {entry.jockey && (
              <span className="text-[10px] text-[var(--kaiko-text-muted)] truncate">{entry.jockey}</span>
            )}
            {entry.stats && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600 shrink-0">
                能力{entry.stats.abilityRank}位
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {entry.odds !== null && (
            <div className="font-[family-name:var(--font-rajdhani)] text-[15px] font-bold text-[var(--kaiko-text-main)]">
              {entry.odds.toFixed(1)}倍
            </div>
          )}
          {entry.popularity !== null && (
            <div className="text-[10px] text-[var(--kaiko-text-muted)]">{entry.popularity}番人気</div>
          )}
        </div>

        <span className="material-symbols-outlined text-[var(--kaiko-text-muted)] text-[16px] shrink-0">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div className={`mx-4 mb-3 px-3 py-3 rounded-xl border ${style.border} ${style.bg}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-lg font-black ${style.color}`}>{pick.symbol}</span>
            <span className={`text-[11px] font-black ${style.color}`}>{style.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-white/60 rounded-lg px-3 py-2 text-center">
              <div className={`font-[family-name:var(--font-bebas-neue)] text-xl ${pick.ev >= 1.0 ? "text-emerald-600" : "text-[var(--kaiko-text-main)]"}`}>
                {pick.ev.toFixed(2)}
              </div>
              <div className="text-[9px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">EV（回収率目安）</div>
              <div className="text-[8px] text-[var(--kaiko-text-muted)]">{pick.ev >= 1.0 ? "▲理論プラス" : "▼理論マイナス"}</div>
            </div>
            <div className="bg-white/60 rounded-lg px-3 py-2 text-center">
              <div className="font-[family-name:var(--font-bebas-neue)] text-xl text-[var(--kaiko-text-main)]">
                {pick.winProb.toFixed(1)}%
              </div>
              <div className="text-[9px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">推定勝率</div>
              <div className="text-[8px] text-[var(--kaiko-text-muted)]">全頭補正済</div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--kaiko-text-sub)] leading-relaxed mb-3">
            {pick.symbol === "◎" && "最も期待値が高い馬。近走の補正スコアと単勝オッズから算出。"}
            {pick.symbol === "○" && "期待値2位の馬。複数のデータから安定した実力を示している。"}
            {pick.symbol === "▲" && "期待値3位の馬。対抗として検討に値する。"}
            {pick.symbol === "△" && "期待値4位の馬。複穴候補として抑えておきたい。"}
            {pick.symbol === "★" && "能力ランクに対して人気が低い逆張り買い候補。期待値が高い穴馬。"}
          </p>

          {entry.stats ? (
            <div className="bg-white/70 rounded-lg px-3 py-2.5 mb-2">
              <div className="text-[9px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider mb-2">能力データ</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] text-[var(--kaiko-text-sub)]">能力推定ランク</span>
                  <span className="font-[family-name:var(--font-rajdhani)] text-[13px] font-bold text-[var(--kaiko-text-main)]">{entry.stats.abilityRank}位</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] text-[var(--kaiko-text-sub)]">現在人気</span>
                  <span className="font-[family-name:var(--font-rajdhani)] text-[13px] font-bold text-[var(--kaiko-text-main)]">{entry.stats.oddsRank}番人気</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] text-[var(--kaiko-text-sub)]">補正スコア平均</span>
                  <span className={`font-[family-name:var(--font-rajdhani)] text-[13px] font-bold ${entry.stats.avgScore <= 2 ? "text-[var(--kaiko-sym-good)]" : entry.stats.avgScore <= 4 ? "text-[var(--kaiko-sym-great)]" : "text-[var(--kaiko-text-main)]"}`}>
                    {entry.stats.avgScore.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] text-[var(--kaiko-text-sub)]">分析走数</span>
                  <span className="font-[family-name:var(--font-rajdhani)] text-[13px] font-bold text-[var(--kaiko-text-main)]">{entry.stats.racesAnalyzed}走</span>
                </div>
              </div>
              {pick.symbol === "★" && entry.stats.abilityRank < entry.stats.oddsRank && (
                <div className="mt-2 pt-2 border-t border-[var(--kaiko-border)]">
                  <span className="text-[10px] text-rose-600 font-bold">
                    能力{entry.stats.abilityRank}位 vs 人気{entry.stats.oddsRank}番人気 — 能力の割に人気がない馬
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/50 rounded-lg px-3 py-2 mb-2 text-center">
              <span className="text-[10px] text-[var(--kaiko-text-muted)]">近走データ不足のため能力データなし</span>
            </div>
          )}

          {entry.horseId && (
            <Link
              href={`/horses/${entry.horseId}`}
              className="mt-2 flex items-center gap-1 text-[11px] text-[var(--kaiko-primary)] font-bold hover:underline"
            >
              <span className="material-symbols-outlined text-[13px]">open_in_new</span>
              {entry.horseName}の詳細を見る
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
