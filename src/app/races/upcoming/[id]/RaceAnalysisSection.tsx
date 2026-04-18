"use client";

import { useState } from "react";
import type { CourseCharacteristic } from "@/lib/courseCharacteristics";

interface RunningStyleEntry {
  horseName:    string;
  horseNumber:  number;
  runningStyle: string | null;
}

interface Props {
  track:    string;
  surface:  string;
  distance: number;
  courseChar:          CourseCharacteristic | null;
  trackBiasLevel:      string | null;
  trackBiasSummary:    string | null;
  pacePattern:         "前残り" | "差し有利" | "フラット";
  paceSummary:         string;
  runningStyleEntries: RunningStyleEntry[];
}

type PaceTab = "前残り" | "差し有利" | "フラット";

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
 * タブ別の有利・不利脚質を返す
 */
function getFavorableStyles(tab: PaceTab): { favor: string[]; unfavor: string[] } {
  switch (tab) {
    case "前残り":   return { favor: ["逃げ", "先行"], unfavor: ["差し", "追い込み"] };
    case "差し有利": return { favor: ["差し", "追い込み"], unfavor: ["逃げ", "先行"] };
    case "フラット": return { favor: [], unfavor: [] };
  }
}

/**
 * 展開予想の脚質カラー
 */
const RUNNING_STYLE_COLOR: Record<string, string> = {
  "逃げ":     "text-[var(--kaiko-tag-red-text)]",
  "先行":     "text-[var(--kaiko-tag-gold-text)]",
  "差し":     "text-[var(--kaiko-tag-blue-text)]",
  "追い込み": "text-[var(--kaiko-tag-green-text)]",
};

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
  runningStyleEntries,
}: Props) {
  const [activeTab, setActiveTab] = useState<PaceTab>(pacePattern);

  const TABS: PaceTab[] = ["前残り", "差し有利", "フラット"];
  const { favor, unfavor } = getFavorableStyles(activeTab);

  const favorEntries  = runningStyleEntries.filter((e) => e.runningStyle && favor.includes(e.runningStyle));
  const unfavorEntries = runningStyleEntries.filter((e) => e.runningStyle && unfavor.includes(e.runningStyle));
  const neutralEntries = runningStyleEntries.filter((e) => !e.runningStyle);
  const flatEntries   = runningStyleEntries; // フラットタブ用

  const biasStyle = biasLevelStyle(trackBiasLevel);

  return (
    <>
      {/* ① コース特性カード */}
      {courseChar && (
        <section className="bg-white rounded-xl overflow-hidden border border-black/8">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-black/4 border-b border-black/8">
            <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]">map</span>
            <span className="text-[10px] font-black text-[#131313] uppercase tracking-wider">
              コース特性 — {track} {surface}{distance}m
            </span>
          </div>
          <div className="divide-y divide-black/6">
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
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-[12px] font-black transition-colors ${
                activeTab === tab
                  ? "text-[var(--kaiko-primary)] border-b-2 border-[var(--kaiko-primary)]"
                  : "text-[var(--kaiko-text-muted)]"
              }`}
            >
              {tab === pacePattern ? `${tab} ★` : tab}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className="px-4 py-3 space-y-3">
          {activeTab === "フラット" ? (
            /* フラット: 全馬並列表示 */
            <div>
              <p className="text-[10px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider mb-2">出走馬（脚質別）</p>
              <div className="space-y-1">
                {flatEntries.map((e) => (
                  <div key={e.horseNumber} className="flex items-center gap-2 text-[12px]">
                    <span className="font-black text-[var(--kaiko-text-muted)] w-5 text-right shrink-0">{e.horseNumber}番</span>
                    <span className="font-bold text-[#131313] flex-1 truncate">{e.horseName}</span>
                    {e.runningStyle && (
                      <span className={`text-[11px] font-bold shrink-0 ${RUNNING_STYLE_COLOR[e.runningStyle] ?? "text-[var(--kaiko-text-muted)]"}`}>
                        {e.runningStyle}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* 有利馬 */}
              {favorEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-black text-[var(--kaiko-tag-green-text)] uppercase tracking-wider">▲ 有利</span>
                    <span className="text-[10px] text-[var(--kaiko-text-muted)]">
                      {activeTab === "前残り" ? "逃げ・先行" : "差し・追い込み"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {favorEntries.map((e) => (
                      <div key={e.horseNumber} className="flex items-center gap-2 text-[12px]">
                        <span className="font-black text-[var(--kaiko-text-muted)] w-5 text-right shrink-0">{e.horseNumber}番</span>
                        <span className="font-bold text-[#131313] flex-1 truncate">{e.horseName}</span>
                        <span className={`text-[11px] font-bold shrink-0 ${RUNNING_STYLE_COLOR[e.runningStyle!] ?? "text-[var(--kaiko-text-muted)]"}`}>
                          {e.runningStyle}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 不利馬 */}
              {unfavorEntries.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider">▽ 不利</span>
                    <span className="text-[10px] text-[var(--kaiko-text-muted)]">
                      {activeTab === "前残り" ? "差し・追い込み" : "逃げ・先行"}
                    </span>
                  </div>
                  <div className="space-y-1 opacity-60">
                    {unfavorEntries.map((e) => (
                      <div key={e.horseNumber} className="flex items-center gap-2 text-[12px]">
                        <span className="font-black text-[var(--kaiko-text-muted)] w-5 text-right shrink-0">{e.horseNumber}番</span>
                        <span className="font-bold text-[var(--kaiko-text-muted)] flex-1 truncate">{e.horseName}</span>
                        <span className={`text-[11px] font-bold shrink-0 ${RUNNING_STYLE_COLOR[e.runningStyle!] ?? "text-[var(--kaiko-text-muted)]"}`}>
                          {e.runningStyle}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 脚質不明馬 */}
              {neutralEntries.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-[var(--kaiko-text-muted)] uppercase tracking-wider mb-1.5">脚質不明</p>
                  <div className="space-y-1 opacity-50">
                    {neutralEntries.map((e) => (
                      <div key={e.horseNumber} className="flex items-center gap-2 text-[12px]">
                        <span className="font-black text-[var(--kaiko-text-muted)] w-5 text-right shrink-0">{e.horseNumber}番</span>
                        <span className="font-bold text-[var(--kaiko-text-muted)] flex-1 truncate">{e.horseName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 説明テキスト */}
          <div className="pt-2 border-t border-black/6">
            <p className="text-[11px] text-[var(--kaiko-text-muted)] leading-snug">{paceSummary}</p>
          </div>
        </div>
      </section>
    </>
  );
}
