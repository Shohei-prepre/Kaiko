"use client";

import { useState } from "react";
import type { UpcomingEntryWithForm } from "@/lib/database.types";

/** この点差以上なら「◎一強」と判定 */
const LARGE_GAP_THRESHOLD = 0.5;

type PersonalityTab = "コツコツ" | "ワーキング";

interface Props {
  /** [horse_id, adjusted_score] — score降順で並んでいること */
  adjustedScores: [number, number][];
  entriesWithForm: UpcomingEntryWithForm[];
  defaultOpen?: boolean;
}

interface Horse {
  hid: number;
  num: number | null;
  name: string;
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

/** 単勝 / 複勝 / ワイド / 馬連 — 配分% バッジ付き */
function SimpleBetRow({
  label,
  horses,
  color,
  allocation,
}: {
  label: string;
  horses: Horse[];
  color: string;
  allocation?: string;
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
          </div>
        ))}
      </div>
      {allocation && (
        <span className="ml-auto text-[9px] font-black text-[var(--kaiko-text-muted)] bg-black/5 px-1.5 py-0.5 rounded-full shrink-0">
          {allocation}
        </span>
      )}
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
}: {
  label: string;
  axis: Horse[];
  rest: Horse[];
  isTrifecta: boolean;
  color: string;
}) {
  const tickets = rest.length;
  const slots = [
    { slot: isTrifecta ? "1着" : "1", horses: [axis[0]] },
    { slot: isTrifecta ? "2着" : "2", horses: [axis[1]] },
    { slot: isTrifecta ? "3着" : "3", horses: rest },
  ];

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 mb-1.5">
        <BetLabel label={label} color={color} />
        <span className="ml-auto text-[10px] font-black text-[#131313]">{tickets}点</span>
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
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<PersonalityTab>("コツコツ");

  if (adjustedScores.length < 2) return null;

  const gap = adjustedScores[0][1] - adjustedScores[1][1];
  const isLargeGap = gap >= LARGE_GAP_THRESHOLD;

  const horseMap = new Map(
    entriesWithForm.filter((e) => e.horse_id != null).map((e) => [e.horse_id!, e])
  );

  const top5: Horse[] = adjustedScores.slice(0, 5).map(([hid]) => {
    const entry = horseMap.get(hid);
    return { hid, num: entry?.horse_number ?? null, name: entry?.horse_name ?? "?" };
  });

  const rank1 = top5[0];
  const rank2 = top5[1];
  const rest  = top5.slice(2);

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
            {(["コツコツ", "ワーキング"] as PersonalityTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
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

          <div className="px-4 pb-3 space-y-1">
            {/* 根拠テキスト */}
            <p className="text-[11px] text-[var(--kaiko-text-muted)] leading-snug pb-1">
              適性差:{" "}
              <span className="font-bold text-[#131313]">{gap.toFixed(2)}pt</span>
              {isLargeGap ? " — ◎が明確に優位。" : " — 接戦。"}
            </p>

            <div className="divide-y divide-black/6">
              {activeTab === "コツコツ" ? (
                /* コツコツ: 単勝+複勝 or ワイド+馬連（配分%付き・3連なし） */
                isLargeGap ? (
                  <>
                    <SimpleBetRow
                      label="単勝"
                      horses={[rank1]}
                      color="var(--kaiko-primary)"
                      allocation="20%"
                    />
                    <SimpleBetRow
                      label="複勝"
                      horses={[rank1]}
                      color="var(--kaiko-tag-green-text)"
                      allocation="80%"
                    />
                  </>
                ) : (
                  <>
                    <SimpleBetRow
                      label="ワイド"
                      horses={[rank1, rank2]}
                      color="var(--kaiko-tag-green-text)"
                      allocation="70%"
                    />
                    <SimpleBetRow
                      label="馬連"
                      horses={[rank1, rank2]}
                      color="#60a5fa"
                      allocation="30%"
                    />
                  </>
                )
              ) : (
                /* ワーキング: 単勝 or 馬連 + 3連複F（+ 3連単F は一強のみ） */
                <>
                  {isLargeGap ? (
                    <SimpleBetRow
                      label="単勝"
                      horses={[rank1]}
                      color="var(--kaiko-primary)"
                    />
                  ) : (
                    <SimpleBetRow
                      label="馬連"
                      horses={[rank1, rank2]}
                      color="#60a5fa"
                    />
                  )}
                  {rest.length > 0 && (
                    <FormationRow
                      label="3連複F"
                      axis={[rank1, rank2]}
                      rest={rest}
                      isTrifecta={false}
                      color="var(--kaiko-text-muted)"
                    />
                  )}
                  {isLargeGap && rest.length > 0 && (
                    <FormationRow
                      label="3連単F"
                      axis={[rank1, rank2]}
                      rest={rest}
                      isTrifecta={true}
                      color="var(--kaiko-primary)"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
