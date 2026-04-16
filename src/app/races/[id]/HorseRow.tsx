"use client";

import { useState } from "react";
import Link from "next/link";
import type { HorsePerformance } from "@/lib/database.types";
import { calcAptitudeValue, calcLossValue, abilitySymbol, symbolColorClass } from "@/lib/database.types";

const WAKU_STYLES: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: "bg-white",       border: "border-transparent", text: "text-[#131313]" },
  2: { bg: "bg-zinc-500",    border: "border-transparent", text: "text-white" },
  3: { bg: "bg-red-600",     border: "border-transparent", text: "text-white" },
  4: { bg: "bg-blue-600",    border: "border-transparent", text: "text-white" },
  5: { bg: "bg-yellow-400",  border: "border-transparent", text: "text-[#131313]" },
  6: { bg: "bg-emerald-600", border: "border-transparent", text: "text-white" },
  7: { bg: "bg-orange-500",  border: "border-transparent", text: "text-[#131313]" },
  8: { bg: "bg-pink-500",    border: "border-transparent", text: "text-[#131313]" },
};

const EVAL_TAG_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  fair:      { bg: "bg-[var(--kaiko-eval-neutral-bg)]",    text: "text-[var(--kaiko-eval-neutral-text)]",    border: "border-[var(--kaiko-eval-neutral-text)]/30",   label: "実力通り" },
  below:     { bg: "bg-[var(--kaiko-eval-positive-bg)]",   text: "text-[var(--kaiko-eval-positive-text)]",   border: "border-[var(--kaiko-eval-positive-text)]/30",  label: "ラッキー" },
  above:     { bg: "bg-[var(--kaiko-eval-warning-bg)]",    text: "text-[var(--kaiko-eval-warning-text)]",    border: "border-[var(--kaiko-eval-warning-text)]/30",   label: "伸び代◎" },
  disregard: { bg: "bg-[var(--kaiko-eval-disregard-bg)]",  text: "text-[var(--kaiko-eval-disregard-text)]",  border: "border-black/8",                              label: "度外視" },
};

interface Props {
  perf: HorsePerformance;
  isFirst?: boolean;
}

export default function HorseRow({ perf, isFirst = false }: Props) {
  const [expanded, setExpanded] = useState(isFirst);

  const horse = perf.horses;
  const waku = perf.frame_number ?? 1;
  const wakuStyle = WAKU_STYLES[waku] ?? WAKU_STYLES[1];
  const evalTag = perf.eval_tag ?? "disregard";
  const evalStyle = EVAL_TAG_STYLES[evalTag];

  const aptValue = calcAptitudeValue(perf);
  const lossValue = calcLossValue(perf);
  const abilityValue = aptValue + lossValue;
  const symbol = abilitySymbol(abilityValue);
  const aptSymbol = abilitySymbol(aptValue);
  const lossSymbol = abilitySymbol(lossValue);
  const symColor = symbolColorClass(symbol);
  const aptColor = symbolColorClass(aptSymbol);
  const lossColor = symbolColorClass(lossSymbol);

  const isDisregard = evalTag === "disregard";

  return (
    <div className={`border-b border-black/6 last:border-b-0 ${isFirst ? "bg-[var(--kaiko-primary)]/5" : ""}`}>
      {/* 馬行 */}
      <button
        className="w-full text-left"
        onClick={() => !isDisregard && setExpanded((v) => !v)}
      >
        <div className={`grid gap-2 px-3 py-4 items-center ${!isDisregard ? "hover:bg-black/4 cursor-pointer" : "cursor-default"}`}
          style={{ gridTemplateColumns: "28px 28px 1fr 105px" }}
        >
          {/* 着順 */}
          <span className={`text-xl font-black text-center italic leading-none ${isFirst ? "text-[var(--kaiko-primary)]" : "text-[var(--kaiko-text-muted)]"}`}>
            {perf.finish_order}
          </span>

          {/* 枠番 */}
          <div className={`w-6 h-6 rounded-none ${wakuStyle.bg} flex items-center justify-center text-[11px] font-black ${wakuStyle.text}`}>
            {waku}
          </div>

          {/* 馬名 */}
          <div className="min-w-0">
            {horse?.horse_id ? (
              <Link
                href={`/horses/${horse.horse_id}`}
                className="font-bold text-[14px] text-[#131313] leading-tight truncate block hover:text-[var(--kaiko-primary)] active:opacity-70"
                onClick={(e) => e.stopPropagation()}
              >
                {horse.name}
              </Link>
            ) : (
              <h3 className="font-bold text-[14px] text-[#131313] leading-tight truncate">
                {horse?.name ?? "—"}
              </h3>
            )}
            <span className="text-[10px] text-[var(--kaiko-text-muted)] font-bold block mt-0.5">
              {perf.weight_carried}kg · {perf.position_order ?? "—"}
            </span>
          </div>

          {/* 能力評価 */}
          <div className="flex flex-col items-end gap-1.5">
            {!isDisregard ? (
              <div className="flex items-center gap-0.5">
                <span className="text-[7px] font-black text-[var(--kaiko-text-muted)] uppercase">能力</span>
                <span className={`text-[16px] font-black leading-none ${symColor}`}>{symbol}</span>
              </div>
            ) : (
              <span className="text-[16px] font-black text-[var(--kaiko-text-muted)] leading-none">—</span>
            )}
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${evalStyle.border} ${evalStyle.bg} ${evalStyle.text} tracking-tight whitespace-nowrap`}>
              {evalStyle.label}
            </span>
          </div>
        </div>
      </button>

      {/* 展開パネル */}
      {expanded && !isDisregard && (
        <div className="px-3 pb-4 pt-1 space-y-2 bg-black/4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/6 border border-black/8 p-2 rounded-2xl">
              <span className="text-[9px] font-black text-[var(--kaiko-text-muted)] block mb-1">展開</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] font-black text-[var(--kaiko-primary)]">
                  {(perf.pace_effect_value ?? 0) >= 0 ? "+" : ""}{(perf.pace_effect_value ?? 0).toFixed(1)}馬身
                </span>
                <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)]">
                  {perf.pace_effect_summary ?? "—"}
                </span>
              </div>
            </div>
            <div className="bg-black/6 border border-black/8 p-2 rounded-2xl">
              <span className="text-[9px] font-black text-[var(--kaiko-text-muted)] block mb-1">トラックB</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] font-black text-[var(--kaiko-primary)]">
                  {(perf.track_condition_value ?? 0) >= 0 ? "+" : ""}{(perf.track_condition_value ?? 0).toFixed(1)}馬身
                </span>
                <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)]">
                  {perf.track_condition_summary ?? "—"}
                </span>
              </div>
            </div>
          </div>
          {(perf.trouble_summary || perf.temperament_summary || perf.weight_effect_summary) && (
            <div className="bg-black/6 border border-black/8 p-3 rounded-2xl">
              <p className="text-[12px] text-[#131313] font-medium leading-relaxed">
                {[perf.trouble_summary, perf.temperament_summary, perf.weight_effect_summary]
                  .filter(Boolean)
                  .join("。")}
              </p>
            </div>
          )}
          <Link
            href={`/horses/${perf.horse_id}`}
            className="flex items-center justify-end gap-1 text-[11px] font-bold text-[var(--kaiko-primary)]"
          >
            馬ページへ
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </Link>
        </div>
      )}
    </div>
  );
}
