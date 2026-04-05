"use client";

import { useState } from "react";
import Link from "next/link";
import type { HorsePerformance } from "@/lib/database.types";
import { calcAptitudeValue, calcLossValue, abilitySymbol, symbolColorClass } from "@/lib/database.types";

const WAKU_STYLES: Record<number, { bg: string; border: string }> = {
  1: { bg: "bg-[var(--kaiko-waku-1)]", border: "border-gray-300" },
  2: { bg: "bg-[var(--kaiko-waku-2)]", border: "border-gray-300" },
  3: { bg: "bg-[var(--kaiko-waku-3)]", border: "border-red-200" },
  4: { bg: "bg-[var(--kaiko-waku-4)]", border: "border-blue-200" },
  5: { bg: "bg-[var(--kaiko-waku-5)]", border: "border-yellow-300" },
  6: { bg: "bg-[var(--kaiko-waku-6)]", border: "border-emerald-200" },
  7: { bg: "bg-[var(--kaiko-waku-7)]", border: "border-orange-200" },
  8: { bg: "bg-[var(--kaiko-waku-8)]", border: "border-pink-200" },
};

const EVAL_TAG_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  fair:      { bg: "bg-[var(--kaiko-eval-neutral-bg)]",    text: "text-[var(--kaiko-eval-neutral-text)]",    border: "border-blue-200",   label: "実力通り" },
  below:     { bg: "bg-[var(--kaiko-eval-positive-bg)]",   text: "text-[var(--kaiko-eval-positive-text)]",   border: "border-emerald-200",label: "実力以下" },
  above:     { bg: "bg-[var(--kaiko-eval-warning-bg)]",    text: "text-[var(--kaiko-eval-warning-text)]",    border: "border-amber-200",  label: "実力以上" },
  disregard: { bg: "bg-[var(--kaiko-eval-disregard-bg)]",  text: "text-[var(--kaiko-eval-disregard-text)]",  border: "border-gray-300",   label: "度外視" },
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
    <div className={`border-b border-[var(--kaiko-border)] last:border-b-0 ${isFirst ? "bg-blue-50/20" : ""}`}>
      {/* 馬行 */}
      <button
        className="w-full text-left"
        onClick={() => !isDisregard && setExpanded((v) => !v)}
      >
        <div className={`grid gap-2 px-3 py-4 items-center ${!isDisregard ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
          style={{ gridTemplateColumns: "28px 28px 1fr 105px" }}
        >
          {/* 着順 */}
          <span className={`text-xl font-black text-center font-[family-name:var(--font-rajdhani)] italic leading-none ${isFirst ? "text-[var(--kaiko-tag-gold-text)]" : "text-[var(--kaiko-text-muted)]"}`}>
            {perf.finish_order}
          </span>

          {/* 枠番 */}
          <div className={`w-6 h-6 rounded-md ${wakuStyle.bg} border ${wakuStyle.border} shadow-sm flex items-center justify-center text-[11px] font-black font-[family-name:var(--font-rajdhani)]`}>
            {waku}
          </div>

          {/* 馬名 */}
          <div className="min-w-0">
            <h3 className="font-bold text-[14px] text-[var(--kaiko-text-main)] leading-tight truncate">
              {horse?.name ?? "—"}
            </h3>
            <span className="text-[10px] text-[var(--kaiko-text-sub)] font-[family-name:var(--font-rajdhani)] font-bold block mt-0.5">
              {perf.weight_carried}kg · {perf.position_order ?? "—"}
            </span>
          </div>

          {/* 能力評価 */}
          <div className="flex flex-col items-end gap-1.5">
            {!isDisregard ? (
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5">
                  <span className="font-[family-name:var(--font-rajdhani)] text-[7px] font-black text-[var(--kaiko-text-muted)] uppercase">能力</span>
                  <span className={`text-[16px] font-black leading-none ${symColor}`}>{symbol}</span>
                </div>
                <div className="flex gap-0.5">
                  <div className="bg-white border border-[var(--kaiko-border)] rounded-md px-1 py-0.5 flex items-center gap-0.5 shadow-sm">
                    <span className="font-[family-name:var(--font-rajdhani)] text-[7px] font-black text-[var(--kaiko-text-muted)]">適</span>
                    <span className={`text-[11px] font-black leading-none ${aptColor}`}>{aptSymbol}</span>
                  </div>
                  <div className="bg-white border border-[var(--kaiko-border)] rounded-md px-1 py-0.5 flex items-center gap-0.5 shadow-sm">
                    <span className="font-[family-name:var(--font-rajdhani)] text-[7px] font-black text-[var(--kaiko-text-muted)]">ロ</span>
                    <span className={`text-[11px] font-black leading-none ${lossColor}`}>{lossSymbol}</span>
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-[16px] font-black text-[var(--kaiko-text-muted)] leading-none">—</span>
            )}
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${evalStyle.border} ${evalStyle.bg} ${evalStyle.text} tracking-tight whitespace-nowrap font-[family-name:var(--font-rajdhani)]`}>
              {evalStyle.label}
            </span>
          </div>
        </div>
      </button>

      {/* 展開パネル */}
      {expanded && !isDisregard && (
        <div className="px-3 pb-4 pt-1 space-y-2 bg-white/60">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white border border-[var(--kaiko-border)] p-2 rounded-lg shadow-sm">
              <span className="font-[family-name:var(--font-rajdhani)] text-[9px] font-black text-[var(--kaiko-text-muted)] block mb-1">展開</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] font-black text-[var(--kaiko-primary)]">
                  {(perf.pace_effect_value ?? 0) >= 0 ? "+" : ""}{(perf.pace_effect_value ?? 0).toFixed(1)}馬身
                </span>
                <span className="text-[10px] font-bold text-[var(--kaiko-text-sub)]">
                  {perf.pace_effect_summary ?? "—"}
                </span>
              </div>
            </div>
            <div className="bg-white border border-[var(--kaiko-border)] p-2 rounded-lg shadow-sm">
              <span className="font-[family-name:var(--font-rajdhani)] text-[9px] font-black text-[var(--kaiko-text-muted)] block mb-1">トラックB</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] font-black text-[var(--kaiko-primary)]">
                  {(perf.track_condition_value ?? 0) >= 0 ? "+" : ""}{(perf.track_condition_value ?? 0).toFixed(1)}馬身
                </span>
                <span className="text-[10px] font-bold text-[var(--kaiko-text-sub)]">
                  {perf.track_condition_summary ?? "—"}
                </span>
              </div>
            </div>
          </div>
          {(perf.trouble_summary || perf.temperament_summary || perf.weight_effect_summary) && (
            <div className="bg-white border border-[var(--kaiko-border)] p-3 rounded-lg shadow-sm">
              <p className="text-[12px] text-[var(--kaiko-text-main)] font-medium leading-relaxed">
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
