"use client";

import { useState } from "react";
import Link from "next/link";
import type { HorsePerformance, Race, EvalTag } from "@/lib/database.types";
import { calcAptitudeValue, calcLossValue, abilitySymbol, symbolColorClass } from "@/lib/database.types";

interface PerformanceWithRace extends HorsePerformance {
  races: Race;
}

const EVAL_TAG_STYLES: Record<EvalTag, { bg: string; text: string; border: string; label: string }> = {
  fair:      { bg: "bg-[var(--kaiko-eval-neutral-bg)]",   text: "text-[var(--kaiko-eval-neutral-text)]",   border: "border-[var(--kaiko-eval-neutral-text)]/30",   label: "実力通り" },
  below:     { bg: "bg-[var(--kaiko-eval-positive-bg)]",  text: "text-[var(--kaiko-eval-positive-text)]",  border: "border-[var(--kaiko-eval-positive-text)]/30",  label: "ラッキー" },
  above:     { bg: "bg-[var(--kaiko-eval-warning-bg)]",   text: "text-[var(--kaiko-eval-warning-text)]",   border: "border-[var(--kaiko-eval-warning-text)]/30",   label: "伸び代◎" },
  disregard: { bg: "bg-[var(--kaiko-eval-disregard-bg)]", text: "text-[var(--kaiko-eval-disregard-text)]", border: "border-black/8",                              label: "度外視" },
};

const SURFACE_ICON: Record<string, string> = { "芝": "芝 ", "ダート": "ダート " };

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatVal(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}

function corrClass(v: number): string {
  if (v > 0) return "text-[var(--kaiko-tag-green-text)]";
  if (v < 0) return "text-[var(--kaiko-tag-red-text)]";
  return "text-[#6A6B61]";
}

interface Props {
  perfs: PerformanceWithRace[];
}

export default function HorseHistory({ perfs }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (perfs.length === 0) {
    return <p className="p-5 text-sm text-[var(--kaiko-text-muted)]">出走データがありません</p>;
  }

  return (
    <>
      {perfs.map((perf, i) => {
        const race = perf.races;
        const evalTag = perf.eval_tag ?? "fair";
        const evalStyle = EVAL_TAG_STYLES[evalTag];
        const isDisregard = evalTag === "disregard";
        const isExpanded = expandedId === perf.id;

        const aptValue = calcAptitudeValue(perf);
        const lossValue = calcLossValue(perf);
        const symbol = abilitySymbol(aptValue + lossValue);
        const aptSymbol = abilitySymbol(aptValue);
        const lossSymbol = abilitySymbol(lossValue);
        const symColor = symbolColorClass(symbol);
        const aptColor = symbolColorClass(aptSymbol);
        const lossColor = symbolColorClass(lossSymbol);

        const CORRECTION_ITEMS = [
          { key: "pace_effect_value" as keyof HorsePerformance, label: "展開・ペース", summaryKey: "pace_effect_summary" as keyof HorsePerformance },
          { key: "track_condition_value" as keyof HorsePerformance, label: "馬場適性",   summaryKey: "track_condition_summary" as keyof HorsePerformance },
          { key: "trouble_value" as keyof HorsePerformance, label: "不利・出遅れ",       summaryKey: "trouble_summary" as keyof HorsePerformance },
          { key: "temperament_value" as keyof HorsePerformance, label: "折り合い",       summaryKey: "temperament_summary" as keyof HorsePerformance },
          { key: "weight_effect_value" as keyof HorsePerformance, label: "斤量補正",     summaryKey: "weight_effect_summary" as keyof HorsePerformance },
        ];

        return (
          <div key={perf.id} className={i < perfs.length - 1 ? "border-b border-black/6" : ""}>
            {/* メイン行 */}
            <button
              className="w-full text-left"
              onClick={() => !isDisregard && setExpandedId(isExpanded ? null : perf.id)}
            >
              <div className={`flex items-center gap-3 px-4 py-4 transition-colors ${!isDisregard ? "hover:bg-black/4 active:bg-black/5" : ""}`}>
                {/* 着順 */}
                <span className={`text-xl font-black italic leading-none w-7 text-center shrink-0 ${i === 0 ? "text-[var(--kaiko-primary)]" : "text-[var(--kaiko-text-muted)]"}`}>
                  {perf.finish_order}
                </span>

                {/* レース情報 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[13px] font-bold text-[#131313] truncate">{race.race_name}</span>
                    <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] shrink-0">{race.grade}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--kaiko-text-muted)] font-bold">
                    <span>{formatDate(race.race_date)}</span>
                    <span>{race.track}</span>
                    <span>{SURFACE_ICON[race.surface]}{race.distance}m</span>
                  </div>
                </div>

                {/* 評価ブロック */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {!isDisregard ? (
                    <div className="flex items-center gap-0.5">
                      <span className={`text-[15px] font-black leading-none ${symColor}`}>{symbol}</span>
                      <div className="flex gap-0.5 ml-1">
                        <div className="bg-black/6 border border-black/8 rounded-lg px-1 py-0.5 flex items-center gap-0.5">
                          <span className="text-[7px] font-black text-[var(--kaiko-text-muted)]">適</span>
                          <span className={`text-[10px] font-black leading-none ${aptColor}`}>{aptSymbol}</span>
                        </div>
                        <div className="bg-black/6 border border-black/8 rounded-lg px-1 py-0.5 flex items-center gap-0.5">
                          <span className="text-[7px] font-black text-[var(--kaiko-text-muted)]">ロ</span>
                          <span className={`text-[10px] font-black leading-none ${lossColor}`}>{lossSymbol}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[15px] font-black text-[var(--kaiko-text-muted)] leading-none">—</span>
                  )}
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${evalStyle.border} ${evalStyle.bg} ${evalStyle.text} whitespace-nowrap`}>
                    {evalStyle.label}
                  </span>
                </div>

                {/* 展開インジケーター */}
                {!isDisregard && (
                  <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] shrink-0 transition-transform duration-200" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                    chevron_right
                  </span>
                )}
              </div>
            </button>

            {/* 展開パネル */}
            {isExpanded && !isDisregard && (
              <div className="px-4 pb-4 pt-1 bg-black/4 space-y-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[14px]">analytics</span>
                  <span className="text-[10px] font-black text-[#131313] uppercase tracking-wider">
                    このレースの馬詳細
                  </span>
                </div>

                {/* 基本情報 */}
                <div className="grid grid-cols-3 gap-2">
                  {perf.weight_carried && (
                    <div className="bg-black/6 border border-black/8 rounded-2xl p-2 text-center">
                      <span className="text-[9px] font-black text-[var(--kaiko-text-muted)] block">斤量</span>
                      <span className="text-[13px] font-black text-[#131313]">{perf.weight_carried}kg</span>
                    </div>
                  )}
                  {perf.horse_weight && (
                    <div className="bg-black/6 border border-black/8 rounded-2xl p-2 text-center">
                      <span className="text-[9px] font-black text-[var(--kaiko-text-muted)] block">馬体重</span>
                      <span className="text-[13px] font-black text-[#131313]">{perf.horse_weight}</span>
                    </div>
                  )}
                  {perf.position_order && (
                    <div className="bg-black/6 border border-black/8 rounded-2xl p-2 text-center">
                      <span className="text-[9px] font-black text-[var(--kaiko-text-muted)] block">通過順</span>
                      <span className="text-[13px] font-black text-[#131313]">{perf.position_order}</span>
                    </div>
                  )}
                </div>

                {/* 補正値テーブル */}
                <div className="bg-black/6 border border-black/8 rounded-2xl overflow-hidden">
                  {CORRECTION_ITEMS.map((item) => {
                    const val = perf[item.key] as number | null ?? 0;
                    const summary = perf[item.summaryKey] as string | null;
                    if (val === 0 && !summary) return null;
                    return (
                      <div key={item.key as string} className="flex items-center gap-3 px-3 py-2 border-b border-black/6 last:border-b-0">
                        <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] w-20 shrink-0">{item.label}</span>
                        <span className={`text-[15px] font-black leading-none ${corrClass(val)} shrink-0`}>
                          {formatVal(val)}
                        </span>
                        {summary && (
                          <span className="text-[10px] text-[var(--kaiko-text-muted)] leading-snug flex-1">{summary}</span>
                        )}
                      </div>
                    );
                  }).filter(Boolean)}
                  {/* 合計 */}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--kaiko-primary)]/8">
                    <span className="text-[11px] font-bold text-[var(--kaiko-primary)]">補正合計</span>
                    <span className={`text-[18px] font-black leading-none ${corrClass(aptValue + lossValue)}`}>
                      {formatVal(aptValue + lossValue)}
                    </span>
                  </div>
                </div>

                {/* レースへのリンク */}
                <Link
                  href={`/races/${race.race_id}`}
                  className="flex items-center justify-between gap-2 bg-black/6 border border-black/8 rounded-2xl px-3 py-2.5 hover:bg-black/8 active:opacity-70 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px] shrink-0">open_in_new</span>
                    <span className="text-[11px] font-bold text-[var(--kaiko-primary)] truncate">{race.race_name}のレース詳細</span>
                  </div>
                  <span className="material-symbols-outlined text-[14px] text-[var(--kaiko-text-muted)] shrink-0">chevron_right</span>
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
