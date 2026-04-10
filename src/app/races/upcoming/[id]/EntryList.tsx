"use client";

import { useState } from "react";
import Link from "next/link";
import type { UpcomingEntryWithForm, RecentPerf } from "@/lib/database.types";
import type { ValueBetDetail, HorsePick } from "@/lib/database.types";
import { isBuyCandidate } from "@/lib/database.types";

const WAKU_STYLES: Record<number, { bg: string; border: string }> = {
  1: { bg: "bg-white",         border: "border-gray-300" },
  2: { bg: "bg-[#e2e8f0]",     border: "border-gray-300" },
  3: { bg: "bg-[#fee2e2]",     border: "border-red-200" },
  4: { bg: "bg-[#dbeafe]",     border: "border-blue-200" },
  5: { bg: "bg-[#fef9c3]",     border: "border-yellow-300" },
  6: { bg: "bg-[#dcfce7]",     border: "border-emerald-200" },
  7: { bg: "bg-[#ffedd5]",     border: "border-orange-200" },
  8: { bg: "bg-[#fce7f3]",     border: "border-pink-200" },
};

const EVAL_MINI: Record<string, { bg: string; border: string; text: string }> = {
  below:     { bg: "bg-[var(--kaiko-eval-positive-bg)]", border: "border-emerald-200", text: "text-[var(--kaiko-eval-positive-text)]" },
  fair:      { bg: "bg-[var(--kaiko-eval-neutral-bg)]",  border: "border-blue-200",    text: "text-[var(--kaiko-eval-neutral-text)]" },
  above:     { bg: "bg-[var(--kaiko-eval-warning-bg)]",  border: "border-amber-200",   text: "text-[var(--kaiko-eval-warning-text)]" },
  disregard: { bg: "bg-[var(--kaiko-eval-disregard-bg)]", border: "border-gray-200",   text: "text-[var(--kaiko-text-muted)]" },
};

const PICK_STYLE: Record<string, { text: string; weight: string; label: string; desc: string; color: string }> = {
  "◎": { text: "text-red-600",    weight: "font-black", label: "本命",   desc: "最も期待値が高い馬", color: "bg-red-50 border-red-200" },
  "○": { text: "text-blue-600",   weight: "font-black", label: "対抗",   desc: "2番手の期待値",      color: "bg-blue-50 border-blue-200" },
  "▲": { text: "text-gray-800",   weight: "font-black", label: "単穴",   desc: "3番手の期待値",      color: "bg-gray-50 border-gray-300" },
  "△": { text: "text-gray-500",   weight: "font-bold",  label: "連下",   desc: "4番手の期待値",      color: "bg-gray-50 border-gray-200" },
  "★": { text: "text-amber-500",  weight: "font-black", label: "逆張り", desc: "能力の割に人気がない穴馬", color: "bg-amber-50 border-amber-200" },
  "✓": { text: "text-gray-300",   weight: "font-bold",  label: "参考",   desc: "データあり・圏外",   color: "bg-gray-50 border-gray-200" },
};

function EvalMiniBadge({ perf }: { perf: RecentPerf }) {
  const tag = perf.eval_tag ?? "disregard";
  const s = EVAL_MINI[tag] ?? EVAL_MINI.disregard;
  const label = tag === "disregard" ? "-" : String(perf.finish_order);
  return (
    <span className={`font-[family-name:var(--font-rajdhani)] text-[10px] font-black w-[18px] h-[18px] rounded flex items-center justify-center border ${s.bg} ${s.border} ${s.text}`}>
      {label}
    </span>
  );
}

interface Props {
  entriesWithForm: UpcomingEntryWithForm[];
  valueBetMap: [number, ValueBetDetail][];
  picksMap: [number, HorsePick][];
}

export default function EntryList({ entriesWithForm, valueBetMap: valueBetArr, picksMap: picksArr }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Map に復元
  const valueBetMap = new Map<number, ValueBetDetail>(valueBetArr);
  const picksMap = new Map<number, HorsePick>(picksArr);

  return (
    <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] overflow-hidden">
      {/* テーブルヘッダー */}
      <div
        className="grid gap-2 px-3 py-2.5 bg-gray-50 border-b border-[var(--kaiko-border)] items-center"
        style={{ gridTemplateColumns: "20px 28px 24px 1fr 72px" }}
      >
        <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">印</span>
        <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">枠</span>
        <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">馬</span>
        <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)]">馬名 / 騎手</span>
        <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-right">単勝 / 近走</span>
      </div>

      {entriesWithForm.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[var(--kaiko-text-muted)]">
          エントリーデータがありません
        </div>
      ) : (
        entriesWithForm.map((entry) => {
          const isCandidate = isBuyCandidate(entry.recentPerfs);
          const vbDetail: ValueBetDetail | undefined = entry.horse_id ? valueBetMap.get(entry.horse_id) : undefined;
          const isValueBet = vbDetail !== undefined;
          const pick: HorsePick | undefined = entry.horse_id ? picksMap.get(entry.horse_id) : undefined;
          const waku = entry.frame_number ?? 1;
          const wakuStyle = WAKU_STYLES[Math.min(waku, 8)] ?? WAKU_STYLES[1];
          const horseHref = entry.horse_id ? `/horses/${entry.horse_id}` : undefined;
          const isExpanded = expandedId === entry.id;
          const pickStyle = pick ? PICK_STYLE[pick.symbol] : null;

          // pick がなくても逆張り詳細があればタップ可能にする
          const isExpandable = !!(pick || vbDetail);

          return (
            <div
              key={entry.id}
              className={`border-b border-[var(--kaiko-border)] last:border-b-0 ${
                isValueBet ? "bg-amber-50/50 border-l-2 border-l-amber-400" :
                isCandidate ? "bg-emerald-50/40 border-l-2 border-l-emerald-400" : ""
              }`}
            >
              {/* メイン行 */}
              <button
                className="w-full text-left"
                onClick={() => isExpandable ? setExpandedId(isExpanded ? null : entry.id) : undefined}
              >
                <div
                  className={`grid gap-2 px-3 py-3.5 items-center ${isExpandable ? "cursor-pointer active:bg-gray-50" : ""}`}
                  style={{ gridTemplateColumns: "20px 28px 24px 1fr 72px" }}
                >
                  {/* 印 */}
                  <div className="flex flex-col items-center justify-center">
                    {pick ? (
                      <>
                        <span className={`text-[18px] leading-none ${PICK_STYLE[pick.symbol]?.text} ${PICK_STYLE[pick.symbol]?.weight}`}>
                          {pick.symbol}
                        </span>
                        <span className="text-[8px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] leading-none mt-0.5">
                          {pick.ev.toFixed(1)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-[var(--kaiko-text-muted)]">—</span>
                    )}
                  </div>

                  {/* 枠番 */}
                  <div className={`w-6 h-6 rounded-md ${wakuStyle.bg} border ${wakuStyle.border} shadow-sm flex items-center justify-center text-[11px] font-black font-[family-name:var(--font-rajdhani)]`}>
                    {entry.frame_number ?? "-"}
                  </div>

                  {/* 馬番 */}
                  <span className="text-[13px] font-black text-[var(--kaiko-text-muted)] text-center font-[family-name:var(--font-rajdhani)] italic leading-none">
                    {entry.horse_number ?? "-"}
                  </span>

                  {/* 馬名・騎手 */}
                  <div className="min-w-0">
                    {horseHref ? (
                      <Link
                        href={horseHref}
                        className="font-bold text-[14px] text-[var(--kaiko-text-main)] leading-tight truncate block hover:text-[var(--kaiko-primary)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {entry.horse_name}
                      </Link>
                    ) : (
                      <span className="font-bold text-[14px] text-[var(--kaiko-text-main)] leading-tight truncate block">
                        {entry.horse_name}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {entry.jockey && (
                        <span className="text-[10px] text-[var(--kaiko-text-sub)] font-[family-name:var(--font-rajdhani)] font-bold">
                          {entry.jockey}
                        </span>
                      )}
                      {entry.weight_carried && (
                        <span className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                          {entry.weight_carried}kg
                        </span>
                      )}
                    </div>
                    {/* タグ */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {isValueBet && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-700">
                          <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                          逆張り買い
                        </span>
                      )}
                      {isCandidate && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--kaiko-eval-positive-bg)] border border-emerald-200 text-[var(--kaiko-eval-positive-text)]">
                          <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
                          次走買い候補
                        </span>
                      )}
                    </div>
                  </div>

                  {/* オッズ・近3走 */}
                  <div className="flex flex-col items-end gap-1.5">
                    {entry.odds !== null ? (
                      <div className="flex items-baseline gap-0.5">
                        <span className={`text-[18px] font-black leading-none font-[family-name:var(--font-rajdhani)] ${
                          (entry.popularity ?? 99) <= 3
                            ? "text-[var(--kaiko-primary)]"
                            : "text-[var(--kaiko-text-sub)]"
                        }`}>
                          {entry.odds.toFixed(1)}
                        </span>
                        <span className={`text-[10px] font-bold leading-none ${
                          (entry.popularity ?? 99) <= 3
                            ? "text-[var(--kaiko-primary)]"
                            : "text-[var(--kaiko-text-sub)]"
                        }`}>倍</span>
                      </div>
                    ) : (
                      <span className="text-[13px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">—</span>
                    )}
                    <div className="flex items-center gap-0.5">
                      {entry.popularity !== null && (
                        <span className={`font-[family-name:var(--font-rajdhani)] text-[9px] font-black text-white px-1 rounded leading-none py-0.5 mr-1 ${
                          entry.popularity <= 3 ? "bg-amber-500" : "bg-gray-400"
                        }`}>
                          {entry.popularity}人気
                        </span>
                      )}
                      <div className="flex gap-0.5">
                        {entry.recentPerfs.length > 0
                          ? entry.recentPerfs.map((p, i) => (
                              <EvalMiniBadge key={i} perf={p} />
                            ))
                          : <span className="text-[9px] text-[var(--kaiko-text-muted)]">—</span>
                        }
                      </div>
                    </div>
                    {isExpandable && (
                      <span className="text-[8px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                        {isExpanded ? "▲ 閉じる" : "▼ 詳細"}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {/* 展開パネル: 印の詳細 or 逆張り詳細のみ */}
              {isExpanded && (pick || vbDetail) && (
                <div className={`mx-3 mb-3 rounded-xl border ${pickStyle ? pickStyle.color : "bg-amber-50 border-amber-200"} p-3 space-y-2.5`}>

                  {/* 印あり: ヘッダー + EV + 推定勝率 */}
                  {pick && pickStyle && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={`text-[22px] font-black leading-none ${pickStyle.text} ${pickStyle.weight}`}>
                          {pick.symbol}
                        </span>
                        <div>
                          <span className={`text-[12px] font-black ${pickStyle.text}`}>{pickStyle.label}</span>
                          <p className="text-[10px] text-[var(--kaiko-text-muted)]">{pickStyle.desc}</p>
                        </div>
                        <div className="ml-auto text-right">
                          <span className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] block">EV（回収率目安）</span>
                          <span className={`text-[18px] font-black font-[family-name:var(--font-rajdhani)] leading-none ${
                            pick.ev >= 1.0 ? "text-emerald-600" : "text-[var(--kaiko-text-sub)]"
                          }`}>
                            {pick.ev.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-[var(--kaiko-text-muted)] block">{pick.ev >= 1.0 ? "▲ 理論プラス" : "▼ 理論マイナス"}</span>
                        </div>
                      </div>
                      <div className="bg-white/70 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">推定勝率</span>
                            <span className="text-[9px] text-[var(--kaiko-text-muted)] block">補正スコアベース・全頭補正済</span>
                          </div>
                          <span className="text-[14px] font-black text-[var(--kaiko-text-main)] font-[family-name:var(--font-rajdhani)]">
                            {pick.winProb.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--kaiko-primary)] rounded-full transition-all"
                            style={{ width: `${Math.min(pick.winProb, 100)}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-[var(--kaiko-text-muted)] mt-1 leading-snug">
                          ※データあり馬全体を全頭数で補正した理論確率。
                        </p>
                      </div>
                    </>
                  )}

                  {/* 印なし・逆張りのみの場合のヘッダー */}
                  {!pick && vbDetail && (
                    <div className="flex items-center gap-2">
                      <span className="text-[22px] font-black leading-none text-amber-500">★</span>
                      <div>
                        <span className="text-[12px] font-black text-amber-700">逆張り買い候補</span>
                        <p className="text-[10px] text-[var(--kaiko-text-muted)]">能力の割に人気がない馬（EV計算データ不足）</p>
                      </div>
                    </div>
                  )}

                  {/* 逆張り詳細（isValueBetの場合） */}
                  {vbDetail && (
                    <div className="bg-amber-50/80 rounded-lg border border-amber-200 p-2.5">
                      <p className="text-[10px] font-black text-amber-800 mb-1.5 uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">逆張り買い詳細</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        <div className="text-amber-700">能力推定ランク</div>
                        <div className="font-black text-amber-900">{vbDetail.abilityRank}位</div>
                        <div className="text-amber-700">現在人気</div>
                        <div className="font-black text-amber-900">{vbDetail.oddsRank}番人気</div>
                        <div className="text-amber-700">補正スコア平均</div>
                        <div className="font-black text-amber-900">{vbDetail.avgScore}</div>
                        <div className="text-amber-700">分析走数</div>
                        <div className="font-black text-amber-900">{vbDetail.racesAnalyzed}走</div>
                      </div>
                      <p className="text-[9px] text-amber-600 mt-1.5 leading-snug">
                        補正スコア＝着順−能力補正値。小さいほど強い。
                      </p>
                    </div>
                  )}

                  {/* 近走詳細 */}
                  {entry.recentPerfs.length > 0 && (
                    <div className="bg-white/70 rounded-lg p-2.5">
                      <p className="text-[10px] font-black text-[var(--kaiko-text-muted)] mb-2 uppercase font-[family-name:var(--font-rajdhani)] tracking-wider">近走成績</p>
                      <div className="space-y-1.5">
                        {entry.recentPerfs.map((perf, i) => {
                          const tag = perf.eval_tag ?? "disregard";
                          const evalLabel = { below: "実力以下", fair: "実力通り", above: "実力以上", disregard: "度外視" }[tag];
                          const evalColor = {
                            below: "text-emerald-600",
                            fair: "text-blue-600",
                            above: "text-amber-600",
                            disregard: "text-gray-400",
                          }[tag];
                          return (
                            <div key={i} className="flex items-center gap-2 text-[10px]">
                              <span className="font-black font-[family-name:var(--font-rajdhani)] text-[var(--kaiko-text-muted)] w-3 text-right shrink-0">
                                {tag === "disregard" ? "-" : perf.finish_order}
                              </span>
                              <span className="text-[var(--kaiko-text-sub)] truncate flex-1">{perf.race_name}</span>
                              <span className={`font-bold shrink-0 ${evalColor}`}>{evalLabel}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {horseHref && (
                    <Link
                      href={horseHref}
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
        })
      )}
    </section>
  );
}
