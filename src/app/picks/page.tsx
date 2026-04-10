"use client";

// NOTE: このページは upcoming_entries + calcHorsePicks ベースで印を表示する。
// horse_performances の eval_tag は参照しない。

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type {
  UpcomingEntry,
  UpcomingEntryWithForm,
  RecentPerf,
  EvalTag,
  HorsePick,
  PickSymbol,
} from "@/lib/database.types";
import {
  calcValueBetDetails,
  calcHorsePicks,
} from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

// ─── 型 ──────────────────────────────────────────────────────────

interface RaceWithPicks {
  raceId: string;
  raceName: string;
  raceDate: string;
  track: string;
  grade: string;
  surface: string;
  distance: number;
  entries: PickEntry[];
}

interface PickEntry {
  entryId: number;
  horseId: number | null;
  horseName: string;
  frameNumber: number | null;
  horseNumber: number | null;
  odds: number | null;
  popularity: number | null;
  jockey: string | null;
  pick: HorsePick | null;
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

// ◎○▲△★ のみ表示対象（✓は除外して注目馬に絞る）
const NOTABLE_SYMBOLS: PickSymbol[] = ["◎", "○", "▲", "△", "★"];

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}月${dt.getDate()}日`;
}

// ─── データ取得 ───────────────────────────────────────────────────

async function fetchPicksData(): Promise<RaceWithPicks[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // 今日以降の upcoming_races を取得
    const { data: upcomingRaces } = await (supabase as any)
      .from("upcoming_races")
      .select("race_id, race_name, race_date, track, grade, surface, distance")
      .gte("race_date", today)
      .order("race_date")
      .order("race_number");

    if (!upcomingRaces || upcomingRaces.length === 0) return [];

    const raceIds = (upcomingRaces as { race_id: string }[]).map((r) => r.race_id);

    // upcoming_entries を一括取得
    const { data: allEntries } = await (supabase as any)
      .from("upcoming_entries")
      .select("*")
      .in("race_id", raceIds);

    if (!allEntries || allEntries.length === 0) return [];

    const entries = allEntries as (UpcomingEntry & { race_id: string })[];

    // horse_id がある馬のみ近走成績を取得
    const horseIds = [...new Set(
      entries.map((e) => e.horse_id).filter((id): id is number => id !== null)
    )];

    // horse_id がない馬は名前で解決
    const noIdNames = [...new Set(
      entries.filter((e) => !e.horse_id).map((e) => e.horse_name)
    )];

    const nameToIdMap = new Map<string, number>();
    if (noIdNames.length > 0) {
      const { data: horses } = await supabase
        .from("horses")
        .select("horse_id, name")
        .in("name", noIdNames);
      for (const h of (horses ?? []) as { horse_id: number; name: string }[]) {
        nameToIdMap.set(h.name, h.horse_id);
      }
    }

    // horse_id を確定
    const allHorseIds = [...new Set([
      ...horseIds,
      ...Array.from(nameToIdMap.values()),
    ])];

    // 近走成績を一括取得
    const recentPerfsMap = new Map<number, RecentPerf[]>();
    if (allHorseIds.length > 0) {
      const { data: perfs } = await supabase
        .from("horse_performances")
        .select(`
          horse_id,
          finish_order,
          margin,
          eval_tag,
          trouble_value,
          temperament_value,
          weight_effect_value,
          track_condition_value,
          pace_effect_value,
          races ( race_name, race_date )
        `)
        .in("horse_id", allHorseIds);

      type RawPerf = {
        horse_id: number;
        finish_order: number;
        margin: number | null;
        eval_tag: EvalTag | null;
        trouble_value: number | null;
        temperament_value: number | null;
        weight_effect_value: number | null;
        track_condition_value: number | null;
        pace_effect_value: number | null;
        races: { race_name: string; race_date: string } | null;
      };

      const byHorse = new Map<number, RawPerf[]>();
      for (const row of (perfs ?? []) as RawPerf[]) {
        if (!row.races) continue;
        if (!byHorse.has(row.horse_id)) byHorse.set(row.horse_id, []);
        byHorse.get(row.horse_id)!.push(row);
      }

      for (const [hid, ps] of byHorse.entries()) {
        recentPerfsMap.set(
          hid,
          ps
            .sort((a, b) => b.races!.race_date.localeCompare(a.races!.race_date))
            .slice(0, 5)
            .map((p) => ({
              race_name: p.races!.race_name,
              race_date: p.races!.race_date,
              finish_order: p.finish_order,
              margin: p.margin,
              eval_tag: p.eval_tag,
              trouble_value: p.trouble_value,
              temperament_value: p.temperament_value,
              weight_effect_value: p.weight_effect_value,
              track_condition_value: p.track_condition_value,
              pace_effect_value: p.pace_effect_value,
            }))
        );
      }
    }

    // レースごとに印を計算
    const result: RaceWithPicks[] = [];

    for (const race of upcomingRaces as {
      race_id: string;
      race_name: string;
      race_date: string;
      track: string;
      grade: string;
      surface: string;
      distance: number;
    }[]) {
      const raceEntries = entries.filter((e) => e.race_id === race.race_id);
      if (raceEntries.length === 0) continue;

      // UpcomingEntryWithForm に変換
      const withForm: UpcomingEntryWithForm[] = raceEntries.map((e) => {
        const hid = e.horse_id ?? nameToIdMap.get(e.horse_name) ?? null;
        return {
          ...e,
          horse_id: hid,
          recentPerfs: hid ? (recentPerfsMap.get(hid) ?? []) : [],
        };
      });

      const valueBetMap = calcValueBetDetails(withForm);
      const picksMap = calcHorsePicks(withForm, valueBetMap);

      // ◎○▲△★ がある馬のみピックアップ
      const notableEntries: PickEntry[] = [];
      for (const e of withForm) {
        const hid = e.horse_id;
        const pick = hid ? (picksMap.get(hid) ?? null) : null;
        if (!pick || !NOTABLE_SYMBOLS.includes(pick.symbol)) continue;
        notableEntries.push({
          entryId: e.id,
          horseId: hid,
          horseName: e.horse_name,
          frameNumber: e.frame_number,
          horseNumber: e.horse_number,
          odds: e.odds,
          popularity: e.popularity,
          jockey: e.jockey,
          pick,
        });
      }

      if (notableEntries.length === 0) continue;

      // 印の優先順位でソート
      const symbolOrder: Record<PickSymbol, number> = { "◎": 0, "○": 1, "▲": 2, "△": 3, "★": 4, "✓": 5 };
      notableEntries.sort((a, b) =>
        symbolOrder[a.pick!.symbol] - symbolOrder[b.pick!.symbol]
      );

      result.push({
        raceId: race.race_id,
        raceName: race.race_name,
        raceDate: race.race_date,
        track: race.track,
        grade: race.grade,
        surface: race.surface,
        distance: race.distance,
        entries: notableEntries,
      });
    }

    return result;
  } catch (e) {
    console.error(e);
    return [];
  }
}

// ─── メインコンポーネント ────────────────────────────────────────

export default function PicksPage() {
  const [races, setRaces] = useState<RaceWithPicks[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRaces, setExpandedRaces] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPicksData().then((data) => {
      setRaces(data);
      // デフォルトで最初のレースを展開
      if (data.length > 0) {
        setExpandedRaces(new Set([data[0].raceId]));
      }
      setLoading(false);
    });
  }, []);

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
          {loading ? "…" : `${totalHorses} horses`}
        </span>
      </header>

      <main className="pt-16 pb-28 max-w-md mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--kaiko-text-muted)]">
            <span className="material-symbols-outlined text-[40px] animate-pulse">hourglass_empty</span>
            <p className="text-sm font-bold">印を計算中…</p>
          </div>
        ) : races.length === 0 ? (
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
                  {/* レースヘッダー */}
                  <button
                    onClick={() => toggleRace(race.raceId)}
                    className="w-full px-4 py-3 flex items-center gap-2 text-left active:bg-gray-50"
                  >
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${gradeStyle} font-[family-name:var(--font-rajdhani)] uppercase shrink-0`}>
                      {race.grade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-[var(--kaiko-text-main)] truncate">
                        {race.raceName}
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

                  {/* レース詳細リンク */}
                  <div className="px-4 pb-1 -mt-1">
                    <Link
                      href={`/races/upcoming/${race.raceId}`}
                      className="text-[10px] text-[var(--kaiko-primary)] font-bold flex items-center gap-0.5 hover:underline"
                    >
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                      レース詳細を見る
                    </Link>
                  </div>

                  {/* 馬リスト */}
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
        {/* 印 */}
        <span className={`text-2xl font-black leading-none w-7 text-center shrink-0 ${style.color}`}>
          {pick.symbol}
        </span>

        {/* 馬名 */}
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
          {entry.jockey && (
            <div className="text-[10px] text-[var(--kaiko-text-muted)] truncate">{entry.jockey}</div>
          )}
        </div>

        {/* オッズ */}
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

      {/* 展開パネル */}
      {expanded && (
        <div className={`mx-4 mb-3 px-3 py-3 rounded-xl border ${style.border} ${style.bg}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-lg font-black ${style.color}`}>{pick.symbol}</span>
            <span className={`text-[11px] font-black ${style.color}`}>{style.label}</span>
          </div>

          {/* EV・勝率 */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-white/60 rounded-lg px-3 py-2 text-center">
              <div className="font-[family-name:var(--font-bebas-neue)] text-xl text-[var(--kaiko-text-main)]">
                {pick.ev.toFixed(2)}
              </div>
              <div className="text-[9px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">期待値 (EV)</div>
            </div>
            <div className="bg-white/60 rounded-lg px-3 py-2 text-center">
              <div className="font-[family-name:var(--font-bebas-neue)] text-xl text-[var(--kaiko-text-main)]">
                {pick.winProb.toFixed(1)}%
              </div>
              <div className="text-[9px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">推定勝率</div>
            </div>
          </div>

          {/* 印の意味説明 */}
          <p className="text-[11px] text-[var(--kaiko-text-sub)] leading-relaxed">
            {pick.symbol === "◎" && "最も期待値が高い馬。近走の補正スコアと単勝オッズから算出。"}
            {pick.symbol === "○" && "期待値2位の馬。複数のデータから安定した実力を示している。"}
            {pick.symbol === "▲" && "期待値3位の馬。対抗として検討に値する。"}
            {pick.symbol === "△" && "期待値4位の馬。複穴候補として抑えておきたい。"}
            {pick.symbol === "★" && "能力ランクに対して人気が低い逆張り買い候補。期待値が高い穴馬。"}
          </p>

          {/* 馬詳細へのリンク */}
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
