"use client";

import { useState } from "react";
import Link from "next/link";
import type { UpcomingEntryWithForm, RecentPerf } from "@/lib/database.types";
import { isBuyCandidate } from "@/lib/database.types";

/**
 * 能力推定ランクと近走評価から自然言語の説明を生成する
 */
function generateAbilityExplanation(
  abilityRank: number,
  racesAnalyzed: number,
  recentPerfs: RecentPerf[]
): string {
  const belowCount = recentPerfs.filter((p) => p.eval_tag === "below").length;
  const aboveCount = recentPerfs.filter((p) => p.eval_tag === "above").length;
  const disregardCount = recentPerfs.filter((p) => p.eval_tag === "disregard").length;

  let evalPhrase = "";
  if (belowCount >= 2) {
    evalPhrase = "近走は不利・ロスが重なっており、巻き返しが期待できます。";
  } else if (belowCount === 1 && disregardCount >= 1) {
    evalPhrase = "不利やアクシデントを含む走りがあり、額面以上の力を持つ可能性があります。";
  } else if (aboveCount >= 2) {
    evalPhrase = "近走は条件に恵まれた面があり、着順ほどの実力差はない可能性があります。";
  } else if (disregardCount >= 1) {
    evalPhrase = "度外視すべき走りを含んでいます。";
  } else {
    evalPhrase = "概ね実力通りの走りが続いています。";
  }

  let rankPhrase = "";
  if (abilityRank === 1) {
    rankPhrase = "能力推定はメンバー最上位です。";
  } else if (abilityRank <= 3) {
    rankPhrase = `能力推定は上位${abilityRank}番手です。`;
  } else {
    rankPhrase = `能力推定は${abilityRank}番手の評価です。`;
  }

  return `過去${racesAnalyzed}走を分析。${evalPhrase}${rankPhrase}`;
}

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
  below:     "伸び代◎",
  fair:      "実力通り",
  above:     "ラッキー",
  disregard: "度外視",
};

// 印記号ごとのテキストカラー
const PICK_COLOR: Record<string, string> = {
  "◎": "text-[var(--kaiko-primary)]",
  "○": "text-blue-400",
  "▲": "text-[#131313]",
  "△": "text-[var(--kaiko-text-muted)]",
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
  entriesWithForm:  UpcomingEntryWithForm[];
  /** 能力ランク（レーティングベース） */
  abilityRankMap:   [number, number][];
  /** 展開・枠バイアス補正後の適正ランク */
  adjustedRankMap:  [number, number][];
  runningStyleMap:  [number, string][];
  /** 有効な印（ユーザー選択 or デフォルト自動付与） */
  userPicksMap:     [number, string][];
  /** 現在ピッカーを開いている horse_id */
  pickerOpenId:     number | null;
  /** 印セルをタップしたときのハンドラ */
  onPickerToggle:   (horseId: number) => void;
}

export default function EntryList({
  entriesWithForm,
  abilityRankMap:   abilityRankArr,
  adjustedRankMap:  adjustedRankArr,
  runningStyleMap:  runningStyleArr,
  userPicksMap:     userPicksArr,
  pickerOpenId,
  onPickerToggle,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const runningStyleMap  = new Map<number, string>(runningStyleArr);
  const abilityRankMap   = new Map<number, number>(abilityRankArr);
  const adjustedRankMap  = new Map<number, number>(adjustedRankArr);
  const userPicksMap     = new Map<number, string>(userPicksArr);

  // グリッド列定義：人気 | 馬番 | 印 | 馬名 | 能力 | 適正 | 単勝/近走
  const GRID_COLS = "28px 22px 20px 1fr 32px 32px 52px";

  return (
    <section className="bg-white rounded-xl overflow-hidden border border-black/8">
      {/* テーブルヘッダー */}
      <div
        className="grid gap-1 px-3 py-2.5 bg-black/4 border-b border-black/8 items-center"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)] text-center">人気</span>
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)] text-center">馬番</span>
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)] text-center">印</span>
        <span className="text-[11px] font-black text-[var(--kaiko-text-muted)]">馬名 / 騎手</span>
        <span className="text-[11px] font-black text-[var(--kaiko-primary)] text-center">能力</span>
        <span className="text-[11px] font-black text-orange-500 text-center">適正</span>
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
                  className="grid gap-1 px-3 py-3.5 items-center"
                  style={{ gridTemplateColumns: GRID_COLS }}
                >
                  <div className="flex items-center justify-center">
                    <span className="text-[12px] font-black text-[var(--kaiko-text-muted)]">
                      {entry.popularity ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className={`w-[22px] h-[22px] rounded-none flex items-center justify-center text-[12px] font-black ${wakuStyle.bg} ${wakuStyle.text}`}>
                      {entry.horse_number ?? "-"}
                    </span>
                  </div>
                  <span className="text-[var(--kaiko-text-muted)] text-center text-[13px]">—</span>
                  <div className="min-w-0">
                    <span className="font-bold text-[14px] text-[var(--kaiko-text-muted)] leading-tight truncate block">
                      {entry.horse_name}
                    </span>
                    <span className="text-[11px] text-[var(--kaiko-text-muted)]">準備中...</span>
                  </div>
                  <span className="text-[12px] text-[var(--kaiko-text-muted)] text-center">—</span>
                  <span className="text-[12px] text-[var(--kaiko-text-muted)] text-center">—</span>
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

          const isCandidate  = isBuyCandidate(entry.recentPerfs);
          const isExpanded   = expandedId === entry.id;
          const userPick     = userPicksMap.get(entry.horse_id);
          const runningStyle = runningStyleMap.get(entry.horse_id);
          const runningColor = runningStyle ? RUNNING_STYLE_COLOR[runningStyle] : null;
          const abilityRank  = abilityRankMap.get(entry.horse_id);
          const adjustedRank = adjustedRankMap.get(entry.horse_id);
          // abilityRankがある馬は展開可能
          const isExpandable = abilityRank !== undefined;
          // 印ピッカーが開いているかどうか
          const isPickerOpen = pickerOpenId === entry.horse_id;

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
              <div
                className={`grid gap-1 px-3 py-3.5 items-center ${isExpandable ? "cursor-pointer active:bg-black/4" : ""}`}
                style={{ gridTemplateColumns: GRID_COLS }}
                onClick={() => isExpandable ? setExpandedId(isExpanded ? null : entry.id) : undefined}
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

                {/* 印 — タップでピッカーを開く */}
                <button
                  className={`flex items-center justify-center w-full h-full rounded-md transition-colors ${
                    isPickerOpen ? "bg-black/8" : "active:bg-black/6"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickerToggle(entry.horse_id!);
                  }}
                >
                  {userPick ? (
                    <span className={`text-[18px] leading-none font-black ${PICK_COLOR[userPick] ?? "text-[#131313]"}`}>
                      {userPick}
                    </span>
                  ) : (
                    <span className="text-[11px] text-black/20 font-black">＋</span>
                  )}
                </button>

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

                {/* 能力ランク */}
                <AbilityRankCell rank={abilityRank} />

                {/* 適正ランク（展開・枠補正後） */}
                <div className="flex items-baseline justify-center gap-0">
                  {adjustedRank !== undefined ? (
                    <>
                      <span className={`font-black leading-none ${
                        adjustedRank === 1 ? "text-[22px] text-orange-500"
                        : adjustedRank <= 3 ? "text-[18px] text-[#131313]"
                        : "text-[15px] text-[var(--kaiko-text-muted)]"
                      }`}>{adjustedRank}</span>
                      <span className={`text-[9px] font-black leading-none ${
                        adjustedRank === 1 ? "text-orange-500" : adjustedRank <= 3 ? "text-[#131313]" : "text-[var(--kaiko-text-muted)]"
                      }`}>位</span>
                    </>
                  ) : (
                    <span className="text-[12px] text-[var(--kaiko-text-muted)] text-center block">—</span>
                  )}
                </div>

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

              {/* 展開パネル */}
              {isExpanded && abilityRank !== undefined && (
                <div className="mx-3 mb-3 rounded-xl border bg-black/5 border-white/12 p-3 space-y-2.5">

                  {/* 能力・適正ランク比較 */}
                  <div className="bg-black/5 rounded-xl border border-black/8 p-2.5 space-y-2">
                    <div className="flex items-center gap-3">
                      {/* 能力ランク */}
                      <div className="flex-1 text-center">
                        <p className="text-[10px] font-black text-[var(--kaiko-primary)] uppercase tracking-wider mb-1">能力</p>
                        <div className="flex items-baseline justify-center gap-0">
                          <span className={`font-black leading-none ${
                            abilityRank === 1 ? "text-[26px] text-[var(--kaiko-primary)]"
                            : abilityRank <= 3 ? "text-[22px] text-[#131313]"
                            : "text-[18px] text-[var(--kaiko-text-muted)]"
                          }`}>{abilityRank}</span>
                          <span className={`text-[10px] font-black ${abilityRank <= 3 ? "text-[#131313]" : "text-[var(--kaiko-text-muted)]"}`}>位</span>
                        </div>
                        <p className="text-[9px] text-[var(--kaiko-text-muted)] mt-0.5">レーティング</p>
                      </div>

                      {/* 矢印 */}
                      <span className="material-symbols-outlined text-[20px] text-[var(--kaiko-text-muted)]">arrow_forward</span>

                      {/* 適正ランク */}
                      <div className="flex-1 text-center">
                        <p className="text-[10px] font-black text-orange-500 uppercase tracking-wider mb-1">適正</p>
                        <div className="flex items-baseline justify-center gap-0">
                          <span className={`font-black leading-none ${
                            adjustedRank === 1 ? "text-[26px] text-orange-500"
                            : (adjustedRank ?? 99) <= 3 ? "text-[22px] text-[#131313]"
                            : "text-[18px] text-[var(--kaiko-text-muted)]"
                          }`}>{adjustedRank ?? "—"}</span>
                          {adjustedRank !== undefined && (
                            <span className={`text-[10px] font-black ${adjustedRank === 1 ? "text-orange-500" : (adjustedRank ?? 99) <= 3 ? "text-[#131313]" : "text-[var(--kaiko-text-muted)]"}`}>位</span>
                          )}
                        </div>
                        <p className="text-[9px] text-[var(--kaiko-text-muted)] mt-0.5">展開・枠補正</p>
                      </div>
                    </div>

                    {/* 自然言語説明 */}
                    <p className="text-[11px] text-[#131313] leading-snug border-t border-black/8 pt-2">
                      {generateAbilityExplanation(abilityRank, entry.recentPerfs.length, entry.recentPerfs)}
                    </p>

                    {/* 現在人気 */}
                    {entry.popularity && entry.popularity > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--kaiko-text-muted)]">現在人気</span>
                        <span className={`text-[14px] font-black leading-none px-2 py-0.5 rounded-xl ${
                          entry.popularity <= 3
                            ? "bg-[var(--kaiko-primary)] text-[#131313]"
                            : entry.popularity <= 6
                            ? "bg-black/8 text-[#131313]"
                            : "bg-black/5 text-[var(--kaiko-text-muted)]"
                        }`}>{entry.popularity}番人気</span>
                      </div>
                    )}
                  </div>

                  {/* 近走成績 */}
                  {entry.recentPerfs.length > 0 && (
                    <div className="bg-black/5 rounded-xl p-2.5">
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
