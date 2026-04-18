"use client";

import { useState, useMemo, useCallback } from "react";
import type { UpcomingEntryWithForm } from "@/lib/database.types";
import type { CourseCharacteristic } from "@/lib/courseCharacteristics";
import RaceAnalysisSection from "./RaceAnalysisSection";
import EntryList from "./EntryList";

export type PaceTab = "前残り" | "差し有利" | "フラット";
export type PickSymbol = "◎" | "○" | "▲" | "△";
export const PICK_SYMBOLS: PickSymbol[] = ["◎", "○", "▲", "△"];

// ── 調整パラメータ（チューニング用定数） ─────────────────────────────────────

/** 展開有利/不利で加減するレーティング点数（≈馬身数） */
const PACE_ADJUSTMENT = 2.0;

/** バイアス強度別の補正量（◎=強い偏り〜×=なし） */
const BIAS_MAGNITUDE: Record<string, number> = {
  "◎": 1.5,
  "○": 1.0,
  "△": 0.5,
  "×": 0.0,
};

/** 枠番の内外分類 */
const FRAME_INNER = [1, 2, 3];
const FRAME_OUTER = [6, 7, 8];

// ── 適正スコア計算 ─────────────────────────────────────────────────────────────

/**
 * 展開・バイアスを加味した1頭分の適正スコアを計算する。
 * baseRating を起点に、展開補正・枠順バイアス補正を加算/減算して返す。
 */
function calcAdjustedScore(
  baseRating: number,
  runningStyle: string | null,
  frameNumber: number | null,
  selectedPace: PaceTab,
  biasLevel: string | null,
  postBias: string | null
): number {
  let score = baseRating;

  // 展開補正
  if (selectedPace === "前残り") {
    if (runningStyle === "逃げ" || runningStyle === "先行") score += PACE_ADJUSTMENT;
    else if (runningStyle === "差し" || runningStyle === "追い込み") score -= PACE_ADJUSTMENT;
  } else if (selectedPace === "差し有利") {
    if (runningStyle === "差し" || runningStyle === "追い込み") score += PACE_ADJUSTMENT;
    else if (runningStyle === "逃げ" || runningStyle === "先行") score -= PACE_ADJUSTMENT;
  }
  // フラット: 補正なし

  // 枠順バイアス補正（courseChar.postBias のテキストから内外を判定）
  if (biasLevel && frameNumber && postBias) {
    const mag = BIAS_MAGNITUDE[biasLevel] ?? 0;
    if (mag > 0) {
      const innerFavor = postBias.includes("内枠") && !postBias.includes("外枠有利");
      const outerFavor = postBias.includes("外枠") && !postBias.includes("内枠有利");
      if (innerFavor) {
        if (FRAME_INNER.includes(frameNumber)) score += mag;
        else if (FRAME_OUTER.includes(frameNumber)) score -= mag;
      } else if (outerFavor) {
        if (FRAME_OUTER.includes(frameNumber)) score += mag;
        else if (FRAME_INNER.includes(frameNumber)) score -= mag;
      }
    }
  }

  return score;
}

// ── 型定義 ────────────────────────────────────────────────────────────────────

interface RunningStyleEntry {
  horseName:    string;
  horseNumber:  number;
  runningStyle: string | null;
}

interface Props {
  track:    string;
  surface:  string;
  distance: number;
  entriesWithForm:     UpcomingEntryWithForm[];
  ratingArr:           [number, number][];
  abilityRankArr:      [number, number][];
  runningStyleArr:     [number, string][];
  paceResult:          { pattern: PaceTab; summary: string };
  courseChar:          CourseCharacteristic | null;
  trackBiasLevel:      string | null;
  trackBiasSummary:    string | null;
  runningStyleEntries: RunningStyleEntry[];
  entryCount:          number;
}

// ── メインコンポーネント ───────────────────────────────────────────────────────

export default function UpcomingRaceClient({
  track, surface, distance,
  entriesWithForm,
  ratingArr,
  abilityRankArr,
  runningStyleArr,
  paceResult,
  courseChar,
  trackBiasLevel,
  trackBiasSummary,
  runningStyleEntries,
  entryCount,
}: Props) {
  // 展開選択（推奨パターンをデフォルト）
  const [selectedPace, setSelectedPace] = useState<PaceTab>(paceResult.pattern);
  // ユーザー設定の印（null = 「なし」に明示変更、undefined = デフォルトに委ねる）
  const [userPicks, setUserPicks] = useState<Map<number, PickSymbol | null>>(() => new Map());
  // ピッカーを開く対象 horse_id
  const [pickerOpenId, setPickerOpenId] = useState<number | null>(null);

  const ratingMap     = useMemo(() => new Map(ratingArr),     [ratingArr]);
  const runningStyleMap = useMemo(() => new Map(runningStyleArr), [runningStyleArr]);
  const postBias = courseChar?.postBias ?? null;

  // 適正スコア → 適正ランク（selectedPace が変わるたびに再計算）
  const adjustedRankMap = useMemo((): Map<number, number> => {
    const scores: [number, number][] = [];
    for (const entry of entriesWithForm) {
      const hid = entry.horse_id;
      if (!hid) continue;
      const base  = ratingMap.get(hid) ?? 0;
      const style = runningStyleMap.get(hid) ?? null;
      const frame = entry.frame_number;
      const score = calcAdjustedScore(base, style, frame, selectedPace, trackBiasLevel, postBias);
      scores.push([hid, score]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    const map = new Map<number, number>();
    scores.forEach(([hid], i) => map.set(hid, i + 1));
    return map;
  }, [entriesWithForm, ratingMap, runningStyleMap, selectedPace, trackBiasLevel, postBias]);

  // 有効な印（ユーザー変更優先 → なければ適正ランク1位=◎、2位=○）
  const effectivePicks = useMemo((): Map<number, PickSymbol> => {
    const map = new Map<number, PickSymbol>();
    for (const [hid, rank] of adjustedRankMap.entries()) {
      const override = userPicks.get(hid);
      if (override === null) continue;        // 「なし」に明示設定
      if (override !== undefined) {
        map.set(hid, override);              // ユーザーが選んだ印
      } else if (rank === 1) {
        map.set(hid, "◎");
      } else if (rank === 2) {
        map.set(hid, "○");
      }
    }
    return map;
  }, [adjustedRankMap, userPicks]);

  // 印変更ハンドラ
  const handlePickChange = useCallback((horseId: number, symbol: PickSymbol | null) => {
    setUserPicks((prev) => {
      const next = new Map(prev);
      next.set(horseId, symbol);
      return next;
    });
    setPickerOpenId(null);
  }, []);

  const handlePickerToggle = useCallback((horseId: number) => {
    setPickerOpenId((prev) => (prev === horseId ? null : horseId));
  }, []);

  // EntryList に渡す配列形式
  const adjustedRankArr = useMemo(() => [...adjustedRankMap.entries()], [adjustedRankMap]);
  const userPicksArr    = useMemo((): [number, string][] => [...effectivePicks.entries()], [effectivePicks]);

  // ピッカーに表示する馬名
  const pickerHorseName = pickerOpenId !== null
    ? (entriesWithForm.find((e) => e.horse_id === pickerOpenId)?.horse_name ?? "")
    : "";

  return (
    <>
      {/* コース特性 + トラックバイアス + 展開予想（展開ボタンはここで制御） */}
      <RaceAnalysisSection
        track={track}
        surface={surface}
        distance={distance}
        courseChar={courseChar}
        trackBiasLevel={trackBiasLevel}
        trackBiasSummary={trackBiasSummary}
        pacePattern={paceResult.pattern}
        paceSummary={paceResult.summary}
        runningStyleEntries={runningStyleEntries}
        selectedPace={selectedPace}
        onPaceChange={setSelectedPace}
      />

      {/* 出走馬リスト ラベル */}
      <div className="flex items-center gap-2 px-1 pt-1">
        <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">list_alt</span>
        <span className="text-[12px] font-black text-[#131313] uppercase tracking-wider">
          出馬表（{entryCount}頭）
        </span>
      </div>

      {/* 出走馬テーブル */}
      <EntryList
        entriesWithForm={entriesWithForm}
        abilityRankMap={abilityRankArr}
        adjustedRankMap={adjustedRankArr}
        runningStyleMap={runningStyleArr}
        userPicksMap={userPicksArr}
        pickerOpenId={pickerOpenId}
        onPickerToggle={handlePickerToggle}
      />

      {/* 印ピッカーオーバーレイ（固定ボトムバー） */}
      {pickerOpenId !== null && (
        <>
          {/* 背景タップで閉じる */}
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpenId(null)} />
          {/* ピッカーバー */}
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl border border-black/10 shadow-xl px-4 py-3 min-w-[300px]">
            <p className="text-[11px] text-[var(--kaiko-text-muted)] mb-3 text-center font-bold truncate">{pickerHorseName}</p>
            <div className="flex items-center gap-2 justify-center">
              {PICK_SYMBOLS.map((sym) => {
                const isSelected = effectivePicks.get(pickerOpenId) === sym;
                const color =
                  sym === "◎" ? "var(--kaiko-primary)"
                  : sym === "○" ? "#60a5fa"
                  : "#131313";
                return (
                  <button
                    key={sym}
                    onClick={() => handlePickChange(pickerOpenId, sym)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-[22px] font-black border transition-colors ${
                      isSelected ? "ring-2 ring-offset-1" : ""
                    }`}
                    style={{
                      color,
                      borderColor: isSelected ? color : "#e5e7eb",
                      background: isSelected ? `color-mix(in srgb, ${color} 15%, white)` : "white",
                      ringColor: color,
                    }}
                  >
                    {sym}
                  </button>
                );
              })}
              <button
                onClick={() => handlePickChange(pickerOpenId, null)}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-[12px] font-black border border-black/10 text-[var(--kaiko-text-muted)] active:bg-black/5"
              >
                なし
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
