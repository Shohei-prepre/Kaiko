"use client";

import { useState } from "react";
import type { CourseCharacteristic } from "@/lib/courseCharacteristics";

type PaceTab = "前残り" | "差し有利" | "フラット";

interface Props {
  track:    string;
  surface:  string;
  distance: number;
  courseChar:          CourseCharacteristic | null;
  trackBiasLevel:      string | null;
  trackBiasSummary:    string | null;
  pacePattern:         PaceTab;
  paceSummary:         string;
  /** 親コンポーネントが保持する選択中のペースタブ */
  selectedPace:        PaceTab;
  /** タブ切替ハンドラ（親のstateを更新する） */
  onPaceChange:        (pace: PaceTab) => void;
}

/**
 * バイアスレベルに対応したバッジスタイルを返す
 */
function biasLevelStyle(level: string | null): { label: string; textCls: string; bgCls: string } {
  switch (level) {
    case "◎": return { label: "◎ 強い",    textCls: "text-[var(--kaiko-primary)]",  bgCls: "bg-[var(--kaiko-primary)]/10" };
    case "○": return { label: "○ 中程度",   textCls: "text-orange-500",              bgCls: "bg-orange-50" };
    case "△": return { label: "△ 弱い",    textCls: "text-[var(--kaiko-text-muted)]", bgCls: "bg-black/5" };
    case "×": return { label: "× ほぼなし", textCls: "text-[var(--kaiko-text-muted)]", bgCls: "bg-black/5" };
    default:  return { label: "—",         textCls: "text-[var(--kaiko-text-muted)]", bgCls: "bg-black/5" };
  }
}


/**
 * レース分析セクション
 * コース特性 / トラックバイアス予想 / 展開予想（3タブ）を表示
 */
export default function RaceAnalysisSection({
  track,
  surface,
  distance,
  courseChar,
  trackBiasLevel,
  trackBiasSummary,
  pacePattern,
  paceSummary,
  selectedPace,
  onPaceChange,
}: Props) {
  const TABS: PaceTab[] = ["前残り", "差し有利", "フラット"];
  const [courseCharOpen, setCourseCharOpen] = useState(false);

  const biasStyle = biasLevelStyle(trackBiasLevel);

  return (
    <>
      {/* ① コース特性カード（デフォルト折りたたみ） */}
      {courseChar && (
        <section className="bg-white rounded-xl overflow-hidden border border-black/8">
          <button
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-black/4 active:bg-black/8 transition-colors"
            onClick={() => setCourseCharOpen((v) => !v)}
          >
            <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]">map</span>
            <span className="text-[10px] font-black text-[#131313] uppercase tracking-wider">
              コース特性 — {track} {surface}{distance}m
            </span>
            <span className="material-symbols-outlined text-[var(--kaiko-text-muted)] text-[18px] ml-auto">
              {courseCharOpen ? "expand_less" : "expand_more"}
            </span>
          </button>
          {courseCharOpen && (
            <div className="divide-y divide-black/6 border-t border-black/8">
              <div className="px-4 py-2.5">
                <span className="block text-[9px] font-black text-[var(--kaiko-primary)] uppercase tracking-wider mb-0.5">脚質傾向</span>
                <span className="text-[12px] font-bold text-[#131313] leading-snug line-clamp-2">{courseChar.runningStyle}</span>
              </div>
              <div className="px-4 py-2.5">
                <span className="block text-[9px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider mb-0.5">枠順傾向</span>
                <span className="text-[12px] font-bold text-[#131313] leading-snug line-clamp-2">{courseChar.postBias}</span>
              </div>
              <div className="px-4 py-2.5">
                <span className="block text-[9px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider mb-0.5">特記</span>
                <span className="text-[12px] font-bold text-[#131313] leading-snug line-clamp-2">{courseChar.notes}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ② トラックバイアス予想（常時表示・データなし時は「なし」） */}
      <section className="bg-white rounded-xl overflow-hidden border border-black/8">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-black/4 border-b border-black/8">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          <span className="text-[10px] font-black text-[#131313] uppercase tracking-wider">トラックバイアス予想</span>
          {trackBiasSummary && (
            <div className="ml-auto">
              <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${biasStyle.bgCls} ${biasStyle.textCls}`}>
                {biasStyle.label}
              </span>
            </div>
          )}
        </div>
        <div className="px-4 py-3">
          {trackBiasSummary ? (
            <>
              <p className="text-[12px] font-bold text-[#131313] leading-snug">{trackBiasSummary}</p>
            </>
          ) : (
            <p className="text-[12px] text-[var(--kaiko-text-muted)]">なし</p>
          )}
        </div>
      </section>

      {/* ③ 展開予想タブ */}
      <section className="bg-white rounded-xl overflow-hidden border border-black/8">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-black/4 border-b border-black/8">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>stacked_line_chart</span>
          <span className="text-[10px] font-black text-[#131313] uppercase tracking-wider">展開予想</span>
          {/* 推奨バッジ */}
          <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[var(--kaiko-primary)]/10 text-[var(--kaiko-primary)] uppercase tracking-wide">
            推奨: {pacePattern}
          </span>
        </div>

        {/* タブ */}
        <div className="flex border-b border-black/8">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onPaceChange(tab)}
              className={`flex-1 py-2.5 text-[12px] font-black transition-colors ${
                selectedPace === tab
                  ? "text-[var(--kaiko-primary)] border-b-2 border-[var(--kaiko-primary)]"
                  : "text-[var(--kaiko-text-muted)]"
              }`}
            >
              {tab === pacePattern ? `${tab} ★` : tab}
            </button>
          ))}
        </div>

        {/* タブコンテンツ：説明テキストのみ */}
        <div className="px-4 py-3">
          <p className="text-[11px] text-[var(--kaiko-text-muted)] leading-snug">{paceSummary}</p>
        </div>
      </section>
    </>
  );
}
