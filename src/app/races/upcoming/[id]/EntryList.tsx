"use client";

import { useState } from "react";
import Link from "next/link";
import type { UpcomingEntryWithForm, RecentPerf } from "@/lib/database.types";
import type { ValueBetDetail, HorsePick } from "@/lib/database.types";
import { isBuyCandidate } from "@/lib/database.types";

// 枠番色（馬番バッジの背景色として使用）
const WAKU_NUM_STYLE: Record<number, { bg: string; text: string }> = {
  1: { bg: "bg-white",          text: "text-[#131313]" },
  2: { bg: "bg-zinc-500",       text: "text-white" },
  3: { bg: "bg-red-600",        text: "text-white" },
  4: { bg: "bg-blue-600",       text: "text-white" },
  5: { bg: "bg-yellow-400",     text: "text-[#131313]" },
  6: { bg: "bg-emerald-600",    text: "text-white" },
  7: { bg: "bg-orange-500",     text: "text-[#131313]" },
  8: { bg: "bg-pink-500",       text: "text-[#131313]" },
};

const EVAL_MINI: Record<string, { bg: string; border: string; text: string }> = {
  below:     { bg: "bg-[var(--kaiko-eval-positive-bg)]", border: "border-[var(--kaiko-eval-positive-text)]/30", text: "text-[var(--kaiko-eval-positive-text)]" },
  fair:      { bg: "bg-[var(--kaiko-eval-neutral-bg)]",  border: "border-[var(--kaiko-eval-neutral-text)]/30",  text: "text-[var(--kaiko-eval-neutral-text)]" },
  above:     { bg: "bg-[var(--kaiko-eval-warning-bg)]",  border: "border-[var(--kaiko-eval-warning-text)]/30",  text: "text-[var(--kaiko-eval-warning-text)]" },
  disregard: { bg: "bg-white/6",                          border: "border-black/8",                             text: "text-[var(--kaiko-text-muted)]" },
};

// eval_tagの表示ラベル
const EVAL_LABEL: Record<string, string> = {
  below:     "ラッキー",
  fair:      "実力通り",
  above:     "伸び代◎",
  disregard: "度外視",
};

const PICK_STYLE: Record<string, { text: string; weight: string; label: string; desc: string; color: string }> = {
  "◎": { text: "text-red-500",                            weight: "font-black", label: "本命",   desc: "最も期待値が高い馬",      color: "bg-red-900/30 border-red-500/30" },
  "○": { text: "text-blue-400",                           weight: "font-black", label: "対抗",   desc: "2番手の期待値",            color: "bg-blue-900/30 border-blue-500/30" },
  "▲": { text: "text-[#131313]",                          weight: "font-black", label: "単穴",   desc: "3番手の期待値",            color: "bg-black/6 border-black/10" },
  "△": { text: "text-[#6A6B61]",                          weight: "font-bold",  label: "連下",   desc: "4番手の期待値",            color: "bg-black/4 border-black/8" },
  "★": { text: "text-[var(--kaiko-tag-gold-text)]",       weight: "font-black", label: "穴",     desc: "能力の割に人気がない穴馬", color: "bg-[var(--kaiko-tag-gold-bg)] border-[var(--kaiko-tag-gold-text)]/30" },
  "✓": { text: "text-[#6A6B61]",                          weight: "font-bold",  label: "参考",   desc: "データあり・圏外",         color: "bg-black/4 border-black/8" },
};

// 走法テキストカラーのみ（囲みなし）
const RUNNING_STYLE_COLOR: Record<string, string> = {
  "逃げ":     "text-[var(--kaiko-tag-red-text)]",
  "先行":     "text-[var(--kaiko-tag-gold-text)]",
  "差し":     "text-[var(--kaiko-tag-blue-text)]",
  "追い込み": "text-[var(--kaiko-tag-green-text)]",
};

/**
 * 近走評価のミニバッジ（着順 or "-"）
 */
function EvalMiniBadge({ perf }: { perf: RecentPerf }) {
  const tag = perf.eval_tag ?? "fair";
  const s = EVAL_MINI[tag] ?? EVAL_MINI.fair;
  const label = tag === "disregard" ? "-" : String(perf.finish_order);
  return (
    <span className={`text-[11px] font-black w-[18px] h-[18px] rounded-lg flex items-center justify-center border ${s.bg} ${s.border} ${s.text}`}>
      {label}
    </span>
  );
}

/**
 * 能力ランク表示（最も目立つUI）
 */
function AbilityRankCell({ rank }: { rank: number | undefined }) {
  if (rank === undefined) {
    return <span className="text-[12px] text-[var(--kaiko-text-muted)] text-center block">—</span>;
  }
  const size = rank === 1 ? "text-[22px]" : rank <= 3 ? "text-[18px]" : "text-[15px]";
  const color = rank === 1
    ? "text-[var(--kaiko-primary)]"
    : rank <= 3
    ? "text-[#131313]"
    : "text-[var(--kaiko-text-muted)]";
  return (
    <div className="flex items-baseline justify-center gap-0">
      <span className={`font-black leading-none ${size} ${color}`}>{rank}</span>
      <span className={`text-[9px] font-black leading-none ${color}`}>位</span>
    </div>
  );
}

interface Props {
  entriesWithForm: UpcomingEntryWithForm[];
  valueBetMap: [number, ValueBetDetail][];
  picksMap: [number, HorsePick][];
  runningStyleMap: [number, string][];
  abilityRankMap: [number, number][];
}

export default function EntryList({ entriesWithForm, valueBetMap: valueBetArr, picksMap: picksArr, runningStyleMap: runningStyleArr, abilityRankMap: abilityRankArr }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showWinProbTooltipId, setShowWinProbTooltipId] = useState<number | null>(null);

  const valueBetMap = new Map<number, ValueBetDetail>(valueBetArr);
  const picksMap = new Map<number, HorsePick>(picksArr);
  const runningStyleMap = new Map<number, string>(runningStyleArr);
  const abilityRankMap = new Map<number, number>(abilityRankArr);

  // グリッド列定義：人気 | 馬番 | 印 | 馬名 | 能力 | 単勝/近走
  const GRID_COLS = "34px 26px 24px 1fr 46px 56px";

  return (
    <section className="bg-white rounded-2xl overflow-hidden border border-black/8">
      {/* テーブルヘッダー */}
      <div
        className="grid gap-2 px-3 py-2.5 bg-black/4 border-b border-black/8 items-center"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)] text-center">人気</span>
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)] text-center">馬番</span>
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)] text-center">印</span>
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)]">馬名 / 騎手</span>
        <span className="text-[11px] font-black text-[var(--kaiko-primary)] text-center">能力</span>
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)] text-right">単勝</span>
      </div>

      {entriesWithForm.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-[var(--kaiko-text-muted)]">
          エントリーデータがありません
        </div>
      ) : (
        entriesWithForm.map((entry) => {
          const waku = Math.min(entry.frame_number ?? 1, 8);
          const wakuStyle = WAKU_NUM_STYLE[waku] ?? WAKU_NUM_STYLE[1];
          const horseHref = entry.horse_id ? `/horses/${entry.horse_id}` : undefined;

          // horse_idがない場合は準備中として表示
          if (!entry.horse_id) {
            return (
              <div key={entry.id} className="border-b border-black/6 last:border-b-0 opacity-40">
                <div
                  className="grid gap-2 px-3 py-3.5 items-center"
                  style={{ gridTemplateColumns: GRID_COLS }}
                >
                  {/* 人気（丸なし・文字のみ） */}
                  <div className="flex items-center justify-center">
                    <span className="text-[12px] font-black text-[var(--kaiko-text-muted)]">
                      {entry.popularity ?? "—"}
                    </span>
                  </div>
                  {/* 馬番（枠色・四角バッジ） */}
                  <div className="flex items-center justify-center">
                    <span className={`w-[22px] h-[22px] rounded-none flex items-center justify-center text-[12px] font-black ${wakuStyle.bg} ${wakuStyle.text}`}>
                      {entry.horse_number ?? "-"}
                    </span>
                  </div>
                  {/* 印なし */}
                  <span className="text-[var(--kaiko-text-muted)] text-center text-[13px]">—</span>
                  {/* 馬名 + 準備中 */}
                  <div className="min-w-0">
                    <span className="font-bold text-[14px] text-[var(--kaiko-text-muted)] leading-tight truncate block">
                      {entry.horse_name}
                    </span>
                    <span className="text-[11px] text-[var(--kaiko-text-muted)]">準備中...</span>
                  </div>
                  {/* 能力なし */}
                  <span className="text-[12px] text-[var(--kaiko-text-muted)] text-center">—</span>
                  {/* オッズ */}
                  <div className="flex flex-col items-end">
                    {entry.odds !== null && (
                      <span className="text-[14px] font-black text-[var(--kaiko-text-muted)]">
                        {entry.odds.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          const isCandidate = isBuyCandidate(entry.recentPerfs);
          const vbDetail: ValueBetDetail | undefined = valueBetMap.get(entry.horse_id);
          const pick: HorsePick | undefined = picksMap.get(entry.horse_id);
          const isExpanded = expandedId === entry.id;
          const pickStyle = pick ? PICK_STYLE[pick.symbol] : null;
          const runningStyle = runningStyleMap.get(entry.horse_id);
          const runningColor = runningStyle ? RUNNING_STYLE_COLOR[runningStyle] : null;
          const abilityRank = abilityRankMap.get(entry.horse_id);
          // pickがある場合のみ展開可能
          const isExpandable = !!pick;

          // 人気カラー（丸なし）
          const popularityColor = entry.popularity !== null
            ? entry.popularity <= 3
              ? "text-[var(--kaiko-primary)] font-black"
              : entry.popularity <= 6
              ? "text-[#131313] font-black"
              : "text-[var(--kaiko-text-muted)] font-bold"
            : "text-[var(--kaiko-text-muted)]";

          return (
            <div
              key={entry.id}
              className={`border-b border-black/6 last:border-b-0 ${
                isCandidate ? "border-l-2 border-l-[var(--kaiko-tag-green-text)]" : ""
              }`}
            >
              {/* メイン行 */}
              <button
                className="w-full text-left"
                onClick={() => isExpandable ? setExpandedId(isExpanded ? null : entry.id) : undefined}
              >
                <div
                  className={`grid gap-2 px-3 py-3.5 items-center ${isExpandable ? "cursor-pointer active:bg-black/4" : ""}`}
                  style={{ gridTemplateColumns: GRID_COLS }}
                >
                  {/* 人気（丸なし・文字カラーのみ） */}
                  <div className="flex items-center justify-center">
                    {entry.popularity !== null ? (
                      <span className={`text-[13px] ${popularityColor}`}>
                        {entry.popularity}
                      </span>
                    ) : (
                      <span className="text-[12px] text-[var(--kaiko-text-muted)]">—</span>
                    )}
                  </div>

                  {/* 馬番（枠番の色で表現・四角バッジ） */}
                  <div className="flex items-center justify-center">
                    <span className={`w-[22px] h-[22px] rounded-none flex items-center justify-center text-[12px] font-black ${wakuStyle.bg} ${wakuStyle.text}`}>
                      {entry.horse_number ?? "-"}
                    </span>
                  </div>

                  {/* 印 */}
                  <div className="flex flex-col items-center justify-center">
                    {pick ? (
                      <span className={`text-[18px] leading-none ${PICK_STYLE[pick.symbol]?.text} ${PICK_STYLE[pick.symbol]?.weight}`}>
                        {pick.symbol}
                      </span>
                    ) : (
                      <span className="text-[13px] text-[var(--kaiko-text-muted)]">—</span>
                    )}
                  </div>

                  {/* 馬名・騎手 */}
                  <div className="min-w-0">
                    {horseHref ? (
                      <Link
                        href={horseHref}
                        className="font-bold text-[14px] text-[#131313] leading-tight truncate block hover:text-[var(--kaiko-primary)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {entry.horse_name}
                      </Link>
                    ) : (
                      <span className="font-bold text-[14px] text-[#131313] leading-tight truncate block">
                        {entry.horse_name}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {entry.jockey && (
                        <span className="text-[11px] text-[var(--kaiko-text-muted)] font-bold truncate max-w-[80px]">
                          {entry.jockey}
                        </span>
                      )}
                      {entry.weight_carried && (
                        <span className="text-[11px] text-[var(--kaiko-text-muted)]">
                          {entry.weight_carried}kg
                        </span>
                      )}
                      {/* 走法：アイコン（カラードット）＋テキストのみ、囲みなし */}
                      {runningStyle && runningColor && (
                        <span className={`text-[11px] font-bold ${runningColor} flex items-center gap-0.5 shrink-0`}>
                          <span className="text-[8px] leading-none">●</span>
                          {runningStyle}
                        </span>
                      )}
                    </div>
                    {isCandidate && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--kaiko-eval-positive-bg)] border border-[var(--kaiko-eval-positive-text)]/30 text-[var(--kaiko-eval-positive-text)]">
                          <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
                          次走買い候補
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 能力ランク（最も目立つ） */}
                  <AbilityRankCell rank={abilityRank} />

                  {/* 単勝オッズ・近走 */}
                  <div className="flex flex-col items-end gap-1">
                    {entry.odds !== null ? (
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-[16px] font-black leading-none text-[#131313]">
                          {entry.odds.toFixed(1)}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)]">倍</span>
                      </div>
                    ) : (
                      <span className="text-[13px] font-bold text-[var(--kaiko-text-muted)]">—</span>
                    )}
                    <div className="flex items-center gap-0.5">
                      {entry.recentPerfs.length > 0
                        ? entry.recentPerfs.slice(0, 3).map((p, i) => (
                            <EvalMiniBadge key={i} perf={p} />
                          ))
                        : <span className="text-[11px] text-[var(--kaiko-text-muted)]">—</span>
                      }
                    </div>
                    {isExpandable && (
                      <span className="text-[10px] text-[var(--kaiko-text-muted)]">
                        {isExpanded ? "閉じる ▴" : "詳細 ▾"}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {/* 展開パネル（pickがある場合のみ） */}
              {isExpanded && pick && pickStyle && (
                <div className="mx-3 mb-3 rounded-2xl border bg-black/5 border-white/12 p-3 space-y-2.5">

                  <div className="flex items-center gap-2">
                    <span className={`text-[22px] font-black leading-none ${pickStyle.text} ${pickStyle.weight}`}>
                      {pick.symbol}
                    </span>
                    <div>
                      <span className={`text-[13px] font-black ${pickStyle.text}`}>{pickStyle.label}</span>
                      <p className="text-[11px] text-[var(--kaiko-text-muted)]">{pickStyle.desc}</p>
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

                  {/* 推定勝率 */}
                  <div className="bg-black/5 rounded-2xl p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">推定勝率</span>
                        <button
                          type="button"
                          className="w-[15px] h-[15px] rounded-full bg-black/8 flex items-center justify-center text-[9px] font-black text-[var(--kaiko-text-muted)] shrink-0 active:bg-white/25"
                          onClick={(e) => { e.stopPropagation(); setShowWinProbTooltipId(showWinProbTooltipId === entry.id ? null : entry.id); }}
                        >
                          ?
                        </button>
                      </div>
                      <span className="text-[15px] font-black text-[#131313]">
                        {pick.winProb.toFixed(1)}%
                      </span>
                    </div>
                    {showWinProbTooltipId === entry.id && (
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

                  {/* 能力推定ランク（vbDetailがある場合のみ） */}
                  {vbDetail && (
                    <div className="bg-black/5 rounded-2xl border border-black/8 p-2.5 space-y-2">
                      {/* 能力推定ランク（王冠アイコン付き） */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--kaiko-text-muted)]">能力推定ランク</span>
                        <div className="flex items-center gap-1.5">
                          {vbDetail.abilityRank <= 3 && (
                            <span
                              className={`material-symbols-outlined text-[18px] ${
                                vbDetail.abilityRank === 1 ? "text-[var(--kaiko-primary)]" :
                                vbDetail.abilityRank === 2 ? "text-slate-500" :
                                "text-amber-600"
                              }`}
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              emoji_events
                            </span>
                          )}
                          <span className={`text-[22px] font-black leading-none ${
                            vbDetail.abilityRank === 1 ? "text-[var(--kaiko-primary)]" :
                            vbDetail.abilityRank === 2 ? "text-slate-500" :
                            vbDetail.abilityRank === 3 ? "text-amber-600" :
                            "text-[var(--kaiko-text-muted)]"
                          }`}>{vbDetail.abilityRank}位</span>
                        </div>
                      </div>

                      {/* 現在人気 */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--kaiko-text-muted)]">現在人気</span>
                        <span className={`text-[18px] font-black leading-none px-2 py-0.5 rounded-xl ${
                          vbDetail.oddsRank <= 3
                            ? "bg-[var(--kaiko-primary)] text-[#131313]"
                            : vbDetail.oddsRank <= 6
                            ? "bg-black/8 text-[#131313]"
                            : "bg-black/5 text-[var(--kaiko-text-muted)]"
                        }`}>{vbDetail.oddsRank}番人気</span>
                      </div>

                      {/* 分析走数（小さめ補足） */}
                      <p className="text-[10px] text-[var(--kaiko-text-muted)]">分析走数: {vbDetail.racesAnalyzed}走</p>
                    </div>
                  )}

                  {/* 近走成績 */}
                  {entry.recentPerfs.length > 0 && (
                    <div className="bg-black/5 rounded-2xl p-2.5">
                      <p className="text-[11px] font-black text-[var(--kaiko-text-muted)] mb-2 uppercase tracking-wider">近走成績</p>
                      <div className="space-y-1.5">
                        {entry.recentPerfs.slice(0, 3).map((perf, i) => {
                          const tag = perf.eval_tag ?? "fair";
                          const evalLabel = EVAL_LABEL[tag] ?? "—";
                          const evalColor = {
                            below:     "text-[var(--kaiko-tag-green-text)]",
                            fair:      "text-[var(--kaiko-text-muted)]",
                            above:     "text-[var(--kaiko-tag-gold-text)]",
                            disregard: "text-[var(--kaiko-text-muted)]",
                          }[tag] ?? "text-[var(--kaiko-text-muted)]";
                          return (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="font-black text-[var(--kaiko-text-muted)] w-3 text-right shrink-0">
                                {tag === "disregard" ? "-" : perf.finish_order}
                              </span>
                              <span className="text-[var(--kaiko-text-muted)] truncate flex-1">{perf.race_name}</span>
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
