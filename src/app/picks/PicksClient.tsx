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
  "◎": { color: "text-amber-400",                    bg: "bg-amber-900/30",              border: "border-amber-400/30",              label: "最注目" },
  "○": { color: "text-blue-400",                     bg: "bg-blue-900/30",               border: "border-blue-400/30",               label: "注目" },
  "▲": { color: "text-[var(--kaiko-primary)]",       bg: "bg-[var(--kaiko-primary)]/10", border: "border-[var(--kaiko-primary)]/30", label: "対抗" },
  "△": { color: "text-emerald-400",                  bg: "bg-emerald-900/30",            border: "border-emerald-400/30",            label: "複穴" },
  "★": { color: "text-rose-400",                     bg: "bg-rose-900/30",               border: "border-rose-400/30",               label: "逆張り" },
  "✓": { color: "text-[var(--kaiko-text-muted)]",    bg: "bg-black/4",                   border: "border-black/8",                  label: "データあり" },
};

const GRADE_STYLE: Record<string, string> = {
  G1: "text-[var(--kaiko-primary)] border-[var(--kaiko-primary)]/40 bg-[var(--kaiko-primary)]/10",
  G2: "text-[var(--kaiko-primary)] border-[var(--kaiko-primary)]/40 bg-[var(--kaiko-primary)]/10",
  G3: "text-[var(--kaiko-text-muted)] border-black/10 bg-black/4",
};

const NOTABLE_SYMBOLS: PickSymbol[] = ["◎", "○", "▲", "△", "★"];

/**
 * 日付文字列を「X月Y日」形式に変換
 */
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

  /**
   * レースの展開・折りたたみを切り替える
   */
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
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">tips_and_updates</span>
          <span className="text-[13px] font-black text-white tracking-tight">注目馬</span>
        </div>
        <span className="ml-auto text-[11px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">
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
              const gradeStyle = GRADE_STYLE[race.grade] ?? "text-[var(--kaiko-text-muted)] border-black/10 bg-black/4";

              return (
                <div key={race.raceId} className="bg-white rounded-2xl border border-black/8 overflow-hidden">
                  <button
                    onClick={() => toggleRace(race.raceId)}
                    className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-black/4 active:bg-black/5 transition-colors"
                  >
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${gradeStyle} uppercase shrink-0`}>
                      {race.grade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        {race.raceNumber !== null && (
                          <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] shrink-0">
                            R{race.raceNumber}
                          </span>
                        )}
                        <div className="text-[13px] font-black text-[#131313] truncate">
                          {race.raceName}
                        </div>
                      </div>
                      <div className="text-[10px] text-[var(--kaiko-text-muted)]">
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
                      className="text-[10px] text-[var(--kaiko-primary)] font-bold flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                      レース詳細を見る
                    </Link>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-black/8">
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
  const [showTooltip, setShowTooltip] = useState(false);
  const pick = entry.pick!;
  const style = PICK_STYLE[pick.symbol];

  /** 印ラベルに対応する短い説明文 */
  const pickDesc: Record<string, string> = {
    "◎": "最も期待値が高い馬",
    "○": "2番手の期待値",
    "▲": "3番手の期待値",
    "△": "4番手の期待値",
    "★": "能力の割に人気がない穴馬",
    "✓": "データあり・圏外",
  };

  return (
    <div className={`${isLast ? "" : "border-b border-black/6"}`}>
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-black/4 active:bg-black/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`text-2xl font-black leading-none w-7 text-center shrink-0 ${style.color}`}>
          {pick.symbol}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            {entry.horseNumber !== null && (
              <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)]">
                {entry.horseNumber}番
              </span>
            )}
            <span className="text-[14px] font-black text-[#131313] truncate">
              {entry.horseName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {entry.jockey && (
              <span className="text-[10px] text-[var(--kaiko-text-muted)] truncate">{entry.jockey}</span>
            )}
            {entry.stats && (
              <span className={`text-[10px] font-black shrink-0 ${
                entry.stats.abilityRank === 1 ? "text-[var(--kaiko-primary)]" :
                entry.stats.abilityRank <= 3 ? "text-[#131313]" :
                "text-[var(--kaiko-text-muted)]"
              }`}>
                能力{entry.stats.abilityRank}位
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {entry.odds !== null && (
            <div className="text-[15px] font-black text-[#131313]">
              {entry.odds.toFixed(1)}倍
            </div>
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
        <div className="mx-4 mb-3 rounded-2xl border bg-black/5 border-white/12 p-3 space-y-2.5">

          {/* ヘッダー：印 + ラベル + EV */}
          <div className="flex items-center gap-2">
            <span className={`text-[22px] font-black leading-none ${style.color}`}>{pick.symbol}</span>
            <div>
              <span className={`text-[13px] font-black ${style.color}`}>{style.label}</span>
              <p className="text-[11px] text-[var(--kaiko-text-muted)]">{pickDesc[pick.symbol]}</p>
            </div>
            <div className="ml-auto text-right">
              <span className="text-[11px] text-[var(--kaiko-text-muted)] block">EV（回収率目安）</span>
              <span className={`text-[18px] font-black leading-none ${
                pick.ev >= 1.0 ? "text-[var(--kaiko-tag-green-text)]" : "text-[var(--kaiko-text-muted)]"
              }`}>
                {pick.ev.toFixed(2)}
              </span>
              <span className="text-[10px] text-[var(--kaiko-text-muted)] block">{pick.ev >= 1.0 ? "▲ 理論プラス" : "▼ 理論マイナス"}</span>
            </div>
          </div>

          {/* 推定勝率（? ツールチップ付き・プログレスバー） */}
          <div className="bg-black/5 rounded-2xl p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">推定勝率</span>
                <button
                  type="button"
                  className="w-[15px] h-[15px] rounded-full bg-black/8 flex items-center justify-center text-[9px] font-black text-[var(--kaiko-text-muted)] shrink-0 active:bg-white/25"
                  onClick={(e) => { e.stopPropagation(); setShowTooltip((v) => !v); }}
                >
                  ?
                </button>
              </div>
              <span className="text-[15px] font-black text-[#131313]">{pick.winProb.toFixed(1)}%</span>
            </div>
            {showTooltip && (
              <p className="text-[10px] text-[var(--kaiko-text-muted)] mb-1.5 leading-snug bg-black/4 rounded-xl px-2.5 py-1.5">
                データあり馬全体を全頭数で補正した理論確率
              </p>
            )}
            <div className="w-full h-1.5 bg-black/6 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--kaiko-primary)] rounded-full transition-all"
                style={{ width: `${Math.min(pick.winProb, 100)}%` }}
              />
            </div>
          </div>

          {/* 能力データ */}
          {entry.stats ? (
            <div className="bg-black/5 rounded-2xl border border-black/8 p-2.5 space-y-2">
              {/* 能力推定ランク（王冠アイコン付き） */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--kaiko-text-muted)]">能力推定ランク</span>
                <div className="flex items-center gap-1.5">
                  {entry.stats.abilityRank <= 3 && (
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        entry.stats.abilityRank === 1 ? "text-[var(--kaiko-primary)]" :
                        entry.stats.abilityRank === 2 ? "text-slate-500" :
                        "text-orange-300"
                      }`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      emoji_events
                    </span>
                  )}
                  <span className={`text-[22px] font-black leading-none ${
                    entry.stats.abilityRank === 1 ? "text-[var(--kaiko-primary)]" :
                    entry.stats.abilityRank === 2 ? "text-slate-500" :
                    entry.stats.abilityRank === 3 ? "text-amber-600" :
                    "text-[var(--kaiko-text-muted)]"
                  }`}>{entry.stats.abilityRank}位</span>
                </div>
              </div>

              {/* 現在人気（目立たせる） */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--kaiko-text-muted)]">現在人気</span>
                <span className={`text-[18px] font-black leading-none px-2 py-0.5 rounded-xl ${
                  entry.stats.oddsRank <= 3
                    ? "bg-[var(--kaiko-primary)] text-[#131313]"
                    : entry.stats.oddsRank <= 6
                    ? "bg-black/8 text-[#131313]"
                    : "bg-black/5 text-[var(--kaiko-text-muted)]"
                }`}>{entry.stats.oddsRank}番人気</span>
              </div>

              {/* 分析走数（小さめ補足） */}
              <p className="text-[10px] text-[var(--kaiko-text-muted)]">分析走数: {entry.stats.racesAnalyzed}走</p>
            </div>
          ) : (
            <div className="bg-black/5 border border-black/8 rounded-2xl px-3 py-2 text-center">
              <span className="text-[10px] text-[var(--kaiko-text-muted)]">近走データ不足のため能力データなし</span>
            </div>
          )}

          {entry.horseId && (
            <Link
              href={`/horses/${entry.horseId}`}
              className="flex items-center justify-end gap-1 text-[11px] font-bold text-[var(--kaiko-primary)]"
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
