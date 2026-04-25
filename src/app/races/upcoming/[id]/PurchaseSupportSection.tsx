"use client";

import { useState } from "react";
import type { UpcomingEntryWithForm } from "@/lib/database.types";

/** この点差以上なら「◎一強」と判定 */
const LARGE_GAP_THRESHOLD = 0.5;

type PersonalityTab = "コツコツ" | "ワーキング" | "エクスタシー";

/** タブごとの基準金額 */
const BASE_AMOUNT: Record<PersonalityTab, number> = {
  "コツコツ":    1000,
  "ワーキング":  1000,
  "エクスタシー": 2000,
};

/** 全タブ共通の金額プリセット */
const PRESETS = [200, 500, 1000, 2500, 5000, 10000];

/** プリセット金額の表示ラベル */
function formatPreset(p: number): string {
  if (p >= 10000) return `${p / 10000}万`;
  if (p >= 1000)  return `${p / 1000}K`;
  return `${p}`;
}

interface Props {
  /** [horse_id, adjusted_score] — score降順で並んでいること */
  adjustedScores: [number, number][];
  entriesWithForm: UpcomingEntryWithForm[];
  raceId: string;
  defaultOpen?: boolean;
}

interface Horse {
  hid: number;
  num: number | null;
  name: string;
  popularity: number | null;
}

// ── サブコンポーネント ─────────────────────────────────────────────────────

function HorseNum({ num }: { num: number | null }) {
  return (
    <span className="w-6 h-6 rounded-full bg-[#131313] text-white text-[11px] font-black flex items-center justify-center shrink-0">
      {num ?? "?"}
    </span>
  );
}

function BetLabel({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[9px] font-black w-12 shrink-0 uppercase tracking-wider"
      style={{ color }}
    >
      {label}
    </span>
  );
}

/** 単勝 / 複勝 / ワイド / 馬連 */
function SimpleBetRow({
  label,
  horses,
  color,
  allocation,
  multiplier = 1,
}: {
  label: string;
  horses: Horse[];
  color: string;
  allocation?: number;
  multiplier?: number;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <BetLabel label={label} color={color} />
      <div className="flex items-center gap-1.5 flex-wrap flex-1">
        {horses.map((h, i) => (
          <div key={h.hid} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-[10px] text-[var(--kaiko-text-muted)] font-bold">–</span>
            )}
            <span className="text-[11px] font-black text-[#131313] mr-0.5">
              {i === 0 ? "◎" : "○"}
            </span>
            <HorseNum num={h.num} />
            <span className="text-[11px] font-bold text-[#131313] ml-1 break-all">
              {h.name}
            </span>
            {h.popularity !== null && (
              <span className={`text-[9px] font-black px-1 py-0.5 rounded-full shrink-0 ${
                h.popularity <= 3
                  ? "bg-[var(--kaiko-primary)]/10 text-[var(--kaiko-primary)]"
                  : h.popularity <= 6
                  ? "bg-black/6 text-[#131313]"
                  : "bg-black/4 text-[var(--kaiko-text-muted)]"
              }`}>
                {h.popularity}人気
              </span>
            )}
          </div>
        ))}
      </div>
      {allocation !== undefined && (
        <span className="ml-auto text-[9px] font-black text-[var(--kaiko-text-muted)] bg-black/5 px-1.5 py-0.5 rounded-full shrink-0">
          {(allocation * multiplier).toLocaleString()}円
        </span>
      )}
    </div>
  );
}

/** エクスタシー用 単勝行（multiplier対応） */
function GamblerTanshoRow({
  horse,
  baseAmount,
  color,
  multiplier = 1,
}: {
  horse: Horse;
  baseAmount: number;
  color: string;
  multiplier?: number;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <BetLabel label="単勝" color={color} />
      <div className="flex items-center gap-1.5 flex-1">
        <HorseNum num={horse.num} />
        <span className="text-[11px] font-bold text-[#131313] break-all">{horse.name}</span>
        {horse.popularity !== null && (
          <span className={`text-[9px] font-black px-1 py-0.5 rounded-full shrink-0 ${
            horse.popularity <= 3
              ? "bg-[var(--kaiko-primary)]/10 text-[var(--kaiko-primary)]"
              : horse.popularity <= 6
              ? "bg-black/6 text-[#131313]"
              : "bg-black/4 text-[var(--kaiko-text-muted)]"
          }`}>
            {horse.popularity}人気
          </span>
        )}
      </div>
      <span className="text-[10px] font-black text-[#131313] shrink-0">
        {(baseAmount * multiplier).toLocaleString()}円
      </span>
    </div>
  );
}

/** エクスタシー用 3連複1軸流し行（multiplier対応） */
function GamblerSanrenpukuRow({
  axis,
  partners,
  points,
  basePerPoint,
  color,
  multiplier = 1,
}: {
  axis: Horse;
  partners: Horse[];
  points: number;
  basePerPoint: number;
  color: string;
  multiplier?: number;
}) {
  const perPoint = basePerPoint * multiplier;
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 mb-1.5">
        <BetLabel label="3連複F" color={color} />
        <span className="text-[10px] text-[var(--kaiko-text-muted)]">
          {points}点 × {perPoint.toLocaleString()}円
        </span>
        <span className="ml-auto text-[10px] font-black text-[#131313]">
          {(points * perPoint).toLocaleString()}円
        </span>
      </div>
      <div className="space-y-1 pl-1 border-l-2 border-black/10 ml-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[var(--kaiko-text-muted)] w-6 shrink-0">軸</span>
          <span className="w-5 h-5 rounded-full bg-[#131313] text-white text-[10px] font-black flex items-center justify-center">
            {axis.num ?? "?"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[var(--kaiko-text-muted)] w-6 shrink-0">相手</span>
          <div className="flex gap-1">
            {partners.map((h) => (
              <span
                key={h.hid}
                className="w-5 h-5 rounded-full bg-[#131313]/8 text-[#131313] text-[10px] font-black flex items-center justify-center"
              >
                {h.num ?? "?"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** エクスタシー用 3連単フォーメーション行（multiplier対応） */
function GamblerSanrentanRow({
  points,
  basePerPoint,
  slot1,
  slot2,
  slot3,
  color,
  multiplier = 1,
}: {
  points: number;
  basePerPoint: number;
  slot1: Horse[];
  slot2: Horse[];
  slot3: Horse[];
  color: string;
  multiplier?: number;
}) {
  const perPoint = basePerPoint * multiplier;
  const slots = [
    { label: "1着", horses: slot1 },
    { label: "2着", horses: slot2 },
    { label: "3着", horses: slot3 },
  ];
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 mb-1.5">
        <BetLabel label="3連単F" color={color} />
        <span className="text-[10px] text-[var(--kaiko-text-muted)]">
          {points}点 × {perPoint.toLocaleString()}円
        </span>
        <span className="ml-auto text-[10px] font-black text-[#131313]">
          {(points * perPoint).toLocaleString()}円
        </span>
      </div>
      <div className="space-y-1 pl-1 border-l-2 border-black/10 ml-1">
        {slots.map(({ label, horses }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="text-[9px] text-[var(--kaiko-text-muted)] w-6 shrink-0">{label}</span>
            <div className="flex gap-1">
              {horses.map((h) => (
                <span
                  key={h.hid}
                  className="w-5 h-5 rounded-full bg-[#131313]/8 text-[#131313] text-[10px] font-black flex items-center justify-center"
                >
                  {h.num ?? "?"}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** エクスタシータブ本体 */
function GamblerSection({ top5, multiplier = 1 }: { top5: Horse[]; multiplier?: number }) {
  if (top5.length < 4) {
    return (
      <p className="text-[11px] text-[var(--kaiko-text-muted)] py-2">
        ランク上位4頭が揃っていないため買い目を生成できません
      </p>
    );
  }

  const rank1 = top5[0];
  const rank2 = top5[1];
  const rank3 = top5[2];
  const rank4 = top5[3];

  // 穴馬判定: ◎が5人気以下 or 人気不明
  const isAnaUma = rank1.popularity === null || rank1.popularity >= 5;
  const total = BASE_AMOUNT["エクスタシー"] * multiplier;

  return (
    <div>
      {/* パターンラベル */}
      <div className="flex items-center gap-1.5 pb-1.5">
        {isAnaUma ? (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-black/6 text-[var(--kaiko-text-muted)]">
            穴馬狙い
          </span>
        ) : (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[var(--kaiko-primary)]/10 text-[var(--kaiko-primary)]">
            本命狙い
          </span>
        )}
        <span className="text-[10px] text-[var(--kaiko-text-muted)]">
          ◎が{rank1.popularity != null ? `${rank1.popularity}人気` : "人気不明"}
        </span>
      </div>

      <div className="divide-y divide-black/6">
        {isAnaUma ? (
          /* 穴馬: 単勝500 + 3連複3点×100=300 + 3連単4点×300=1,200 = 2,000円 */
          <>
            <GamblerTanshoRow horse={rank1} baseAmount={500} color="var(--kaiko-primary)" multiplier={multiplier} />
            <GamblerSanrenpukuRow
              axis={rank1}
              partners={[rank2, rank3, rank4]}
              points={3}
              basePerPoint={100}
              color="var(--kaiko-text-muted)"
              multiplier={multiplier}
            />
            <GamblerSanrentanRow
              points={4}
              basePerPoint={300}
              slot1={[rank1]}
              slot2={[rank2, rank3]}
              slot3={[rank2, rank3, rank4]}
              color="#f97316"
              multiplier={multiplier}
            />
          </>
        ) : (
          /* 人気馬: 3連単F 4点×500=2,000円 */
          <GamblerSanrentanRow
            points={4}
            basePerPoint={500}
            slot1={[rank1]}
            slot2={[rank2, rank3]}
            slot3={[rank2, rank3, rank4]}
            color="#f97316"
            multiplier={multiplier}
          />
        )}
      </div>

      {/* 合計 */}
      <div className="flex justify-end items-center pt-2 mt-1 border-t border-black/8">
        <span className="text-[10px] text-[var(--kaiko-text-muted)] mr-1.5">合計</span>
        <span className="text-[13px] font-black text-[#131313]">{total.toLocaleString()}円</span>
      </div>
    </div>
  );
}

/** 3連複 / 3連単 フォーメーション行 */
function FormationRow({
  label,
  axis,
  rest,
  isTrifecta,
  color,
  basePerPoint,
  multiplier = 1,
}: {
  label: string;
  axis: Horse[];
  rest: Horse[];
  isTrifecta: boolean;
  color: string;
  basePerPoint?: number;
  multiplier?: number;
}) {
  const tickets = rest.length;
  const perPoint = basePerPoint !== undefined ? basePerPoint * multiplier : undefined;
  const slots = [
    { slot: isTrifecta ? "1着" : "1", horses: [axis[0]] },
    { slot: isTrifecta ? "2着" : "2", horses: [axis[1]] },
    { slot: isTrifecta ? "3着" : "3", horses: rest },
  ];

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 mb-1.5">
        <BetLabel label={label} color={color} />
        {perPoint !== undefined ? (
          <>
            <span className="text-[10px] text-[var(--kaiko-text-muted)]">
              {tickets}点 × {perPoint.toLocaleString()}円
            </span>
            <span className="ml-auto text-[10px] font-black text-[#131313]">
              {(tickets * perPoint).toLocaleString()}円
            </span>
          </>
        ) : (
          <span className="ml-auto text-[10px] font-black text-[#131313]">{tickets}点</span>
        )}
      </div>

      {/* スロット表示 */}
      <div className="space-y-1 pl-1 border-l-2 border-black/10 ml-1">
        {slots.map(({ slot, horses }) => (
          <div key={slot} className="flex items-center gap-1.5">
            <span className="text-[9px] text-[var(--kaiko-text-muted)] w-6 shrink-0">{slot}</span>
            <div className="flex gap-1">
              {horses.map((h) => (
                <span
                  key={h.hid}
                  className="w-5 h-5 rounded-full bg-[#131313]/8 text-[#131313] text-[10px] font-black flex items-center justify-center"
                >
                  {h.num ?? "?"}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── メインコンポーネント ───────────────────────────────────────────────────

export default function PurchaseSupportSection({
  adjustedScores,
  entriesWithForm,
  raceId,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<PersonalityTab>("コツコツ");
  const [selectedAmount, setSelectedAmount] = useState(1000);

  if (adjustedScores.length < 2) return null;

  const gap = adjustedScores[0][1] - adjustedScores[1][1];
  const isLargeGap = gap >= LARGE_GAP_THRESHOLD;

  const horseMap = new Map(
    entriesWithForm.filter((e) => e.horse_id != null).map((e) => [e.horse_id!, e])
  );

  const top5: Horse[] = adjustedScores.slice(0, 5).map(([hid]) => {
    const entry = horseMap.get(hid);
    return { hid, num: entry?.horse_number ?? null, name: entry?.horse_name ?? "?", popularity: entry?.popularity ?? null };
  });

  const rank1 = top5[0];
  const rank2 = top5[1];
  const rest  = top5.slice(2);

  const handleTabChange = (tab: PersonalityTab) => {
    setActiveTab(tab);
    setSelectedAmount(1000);
  };

  const multiplier = selectedAmount / BASE_AMOUNT[activeTab];
  const currentTotal = selectedAmount;

  return (
    <section className="bg-white rounded-xl overflow-hidden border border-black/8">
      {/* ヘッダー（折りたたみ） */}
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-black/4 active:bg-black/8 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          local_activity
        </span>
        <span className="text-[10px] font-black text-[#131313] uppercase tracking-wider">
          買い目サポート
        </span>
        <span
          className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full ${
            isLargeGap
              ? "bg-[var(--kaiko-primary)]/10 text-[var(--kaiko-primary)]"
              : "bg-black/6 text-[var(--kaiko-text-muted)]"
          }`}
        >
          {isLargeGap ? "◎一強" : "接戦"}
        </span>
        <span className="material-symbols-outlined text-[var(--kaiko-text-muted)] text-[18px] ml-2">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {/* コンテンツ */}
      {open && (
        <div className="border-t border-black/8">
          {/* タブ切り替え */}
          <div className="flex gap-1.5 px-4 pt-3 pb-1">
            {(["コツコツ", "ワーキング", "エクスタシー"] as PersonalityTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black transition-colors ${
                  activeTab === tab
                    ? "bg-[var(--kaiko-primary)] text-[#131313]"
                    : "bg-black/6 text-[var(--kaiko-text-muted)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 金額セレクター */}
          <div className="flex gap-1.5 px-4 pt-2 pb-1">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setSelectedAmount(preset)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors ${
                  selectedAmount === preset
                    ? "bg-[var(--kaiko-primary)] text-[#131313]"
                    : "bg-black/6 text-[var(--kaiko-text-muted)]"
                }`}
              >
                {formatPreset(preset)}
              </button>
            ))}
          </div>

          <div className="px-4 pb-3 space-y-1">
            {/* 根拠テキスト */}
            <p className="text-[11px] text-[var(--kaiko-text-muted)] leading-snug pb-1">
              適性差:{" "}
              <span className="font-bold text-[#131313]">{gap.toFixed(2)}pt</span>
              {isLargeGap ? " — ◎が明確に優位。" : " — 接戦。"}
            </p>

            <div className="divide-y divide-black/6">
              {activeTab === "コツコツ" ? (
                /* コツコツ: 単勝+複勝 or ワイド+馬連 */
                <>
                  <div className="divide-y divide-black/6">
                    {isLargeGap ? (
                      <>
                        <SimpleBetRow label="単勝" horses={[rank1]} color="var(--kaiko-primary)"        allocation={200} multiplier={multiplier} />
                        <SimpleBetRow label="複勝" horses={[rank1]} color="var(--kaiko-tag-green-text)" allocation={800} multiplier={multiplier} />
                      </>
                    ) : (
                      <>
                        <SimpleBetRow label="ワイド" horses={[rank1, rank2]} color="var(--kaiko-tag-green-text)" allocation={700} multiplier={multiplier} />
                        <SimpleBetRow label="馬連"   horses={[rank1, rank2]} color="#60a5fa"                      allocation={300} multiplier={multiplier} />
                      </>
                    )}
                  </div>
                  <div className="flex justify-end items-center pt-2 mt-1 border-t border-black/8">
                    <span className="text-[10px] text-[var(--kaiko-text-muted)] mr-1.5">合計</span>
                    <span className="text-[13px] font-black text-[#131313]">{currentTotal.toLocaleString()}円</span>
                  </div>
                </>
              ) : activeTab === "エクスタシー" ? (
                <GamblerSection top5={top5} multiplier={multiplier} />
              ) : (
                /* ワーキング: 単勝100 or 馬連400 + 3連複F + 3連単F */
                <>
                  <div className="divide-y divide-black/6">
                    {isLargeGap ? (
                      <SimpleBetRow label="単勝" horses={[rank1]} color="var(--kaiko-primary)" allocation={100} multiplier={multiplier} />
                    ) : (
                      <SimpleBetRow label="馬連" horses={[rank1, rank2]} color="#60a5fa" allocation={400} multiplier={multiplier} />
                    )}
                    {rest.length > 0 && (
                      <FormationRow
                        label="3連複F"
                        axis={[rank1, rank2]}
                        rest={rest}
                        isTrifecta={false}
                        color="var(--kaiko-text-muted)"
                        basePerPoint={isLargeGap ? 100 : 200}
                        multiplier={multiplier}
                      />
                    )}
                    {isLargeGap && rest.length > 0 && (
                      <FormationRow
                        label="3連単F"
                        axis={[rank1, rank2]}
                        rest={rest}
                        isTrifecta={true}
                        color="var(--kaiko-primary)"
                        basePerPoint={200}
                        multiplier={multiplier}
                      />
                    )}
                  </div>
                  <div className="flex justify-end items-center pt-2 mt-1 border-t border-black/8">
                    <span className="text-[10px] text-[var(--kaiko-text-muted)] mr-1.5">合計</span>
                    <span className="text-[13px] font-black text-[#131313]">{currentTotal.toLocaleString()}円</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* netkeibaで投票ボタン */}
          <div className="px-4 pb-4">
            <a
              href={`https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#131313] text-white rounded-xl py-3 font-black text-sm flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              netkeibaで投票する
              <span className="ml-auto text-[10px] font-bold opacity-60 pr-1">{currentTotal.toLocaleString()}円</span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
