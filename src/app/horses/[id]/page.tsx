import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Horse, HorsePerformance, Race, EvalTag } from "@/lib/database.types";
import { calcAptitudeValue, calcLossValue, abilitySymbol, symbolColorClass } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

interface Props {
  params: Promise<{ id: string }>;
}

interface PerformanceWithRace extends HorsePerformance {
  races: Race;
}

interface HorseWithPerformances extends Horse {
  horse_performances: PerformanceWithRace[];
}

async function getHorse(id: string): Promise<HorseWithPerformances | null> {
  const { data, error } = await supabase
    .from("horses")
    .select(`
      *,
      horse_performances (
        *,
        races ( race_id, race_name, race_date, track, distance, surface, grade, track_condition )
      )
    `)
    .eq("horse_id", id)
    .single();

  if (error || !data) return null;

  const horse = data as HorseWithPerformances;
  horse.horse_performances.sort(
    (a, b) => new Date(b.races.race_date).getTime() - new Date(a.races.race_date).getTime()
  );
  return horse;
}

const EVAL_TAG_STYLES: Record<EvalTag, { bg: string; text: string; border: string; label: string }> = {
  fair:      { bg: "bg-[var(--kaiko-eval-neutral-bg)]",   text: "text-[var(--kaiko-eval-neutral-text)]",   border: "border-blue-200",   label: "実力通り" },
  below:     { bg: "bg-[var(--kaiko-eval-positive-bg)]",  text: "text-[var(--kaiko-eval-positive-text)]",  border: "border-emerald-200",label: "実力以下" },
  above:     { bg: "bg-[var(--kaiko-eval-warning-bg)]",   text: "text-[var(--kaiko-eval-warning-text)]",   border: "border-amber-200",  label: "実力以上" },
  disregard: { bg: "bg-[var(--kaiko-eval-disregard-bg)]", text: "text-[var(--kaiko-eval-disregard-text)]", border: "border-gray-300",   label: "度外視" },
};

const SURFACE_ICON: Record<string, string> = { "芝": "🌿", "ダート": "🟤" };

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default async function HorsePage({ params }: Props) {
  const { id } = await params;
  const horse = await getHorse(id);
  if (!horse) notFound();

  const perfs = horse.horse_performances;

  return (
    <>
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-[var(--kaiko-border)] shadow-sm">
        <div className="flex items-center w-full gap-3">
          <Link
            href="javascript:history.back()"
            className="w-8 h-8 rounded-lg border border-[var(--kaiko-border)] bg-white flex items-center justify-center active:scale-95 duration-150"
          >
            <span className="material-symbols-outlined text-[var(--kaiko-text-main)] text-[18px]">arrow_back_ios_new</span>
          </Link>
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter">回顧</span>
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
          </div>
          <span className="ml-auto text-sm font-bold text-[var(--kaiko-text-main)] truncate max-w-[120px]">
            {horse.name}
          </span>
        </div>
      </header>

      <main className="pt-16 px-3 max-w-md mx-auto pb-28 space-y-3">

        {/* 馬プロフィールカード */}
        <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] overflow-hidden">
          <div className="h-1 bg-[var(--kaiko-primary)] w-full" />
          <div className="p-5">
            <h2 className="text-2xl font-black text-[var(--kaiko-text-main)] tracking-tight mb-3">{horse.name}</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              {horse.born_year && (
                <div>
                  <span className="font-[family-name:var(--font-rajdhani)] text-[10px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest block">Born</span>
                  <span className="font-bold text-[var(--kaiko-text-main)]">{horse.born_year}年生</span>
                </div>
              )}
              {horse.trainer && (
                <div>
                  <span className="font-[family-name:var(--font-rajdhani)] text-[10px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest block">Trainer</span>
                  <span className="font-bold text-[var(--kaiko-text-main)]">{horse.trainer}</span>
                </div>
              )}
              <div>
                <span className="font-[family-name:var(--font-rajdhani)] text-[10px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest block">Races</span>
                <span className="font-bold text-[var(--kaiko-text-main)]">{perfs.length}戦</span>
              </div>
            </div>
          </div>
        </section>

        {/* 出走歴 */}
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">history</span>
          <span className="text-[12px] font-black text-[var(--kaiko-text-main)] uppercase tracking-wider">出走歴</span>
        </div>

        <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] overflow-hidden">
          {perfs.length === 0 ? (
            <p className="p-5 text-sm text-[var(--kaiko-text-muted)]">出走データがありません</p>
          ) : (
            perfs.map((perf, i) => {
              const race = perf.races;
              const evalTag = perf.eval_tag ?? "disregard";
              const evalStyle = EVAL_TAG_STYLES[evalTag];
              const isDisregard = evalTag === "disregard";

              const aptValue = calcAptitudeValue(perf);
              const lossValue = calcLossValue(perf);
              const symbol = abilitySymbol(aptValue + lossValue);
              const aptSymbol = abilitySymbol(aptValue);
              const lossSymbol = abilitySymbol(lossValue);
              const symColor = symbolColorClass(symbol);
              const aptColor = symbolColorClass(aptSymbol);
              const lossColor = symbolColorClass(lossSymbol);

              return (
                <Link
                  key={perf.id}
                  href={`/races/${race.race_id}`}
                  className={`flex items-center gap-3 px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors ${i < perfs.length - 1 ? "border-b border-[var(--kaiko-border)]" : ""}`}
                >
                  {/* 着順 */}
                  <span className={`text-xl font-black font-[family-name:var(--font-rajdhani)] italic leading-none w-7 text-center shrink-0 ${i === 0 ? "text-[var(--kaiko-tag-gold-text)]" : "text-[var(--kaiko-text-muted)]"}`}>
                    {perf.finish_order}
                  </span>

                  {/* レース情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[13px] font-bold text-[var(--kaiko-text-main)] truncate">{race.race_name}</span>
                      <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-bold text-[var(--kaiko-text-muted)] shrink-0">{race.grade}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--kaiko-text-muted)] font-bold font-[family-name:var(--font-rajdhani)]">
                      <span>{formatDate(race.race_date)}</span>
                      <span>{race.track}</span>
                      <span>{SURFACE_ICON[race.surface]}{race.distance}m</span>
                    </div>
                  </div>

                  {/* 評価ブロック */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {!isDisregard ? (
                      <div className="flex items-center gap-0.5">
                        <span className={`text-[15px] font-black leading-none ${symColor}`}>{symbol}</span>
                        <div className="flex gap-0.5 ml-1">
                          <div className="bg-gray-50 border border-[var(--kaiko-border)] rounded px-1 py-0.5 flex items-center gap-0.5">
                            <span className="font-[family-name:var(--font-rajdhani)] text-[7px] font-black text-[var(--kaiko-text-muted)]">適</span>
                            <span className={`text-[10px] font-black leading-none ${aptColor}`}>{aptSymbol}</span>
                          </div>
                          <div className="bg-gray-50 border border-[var(--kaiko-border)] rounded px-1 py-0.5 flex items-center gap-0.5">
                            <span className="font-[family-name:var(--font-rajdhani)] text-[7px] font-black text-[var(--kaiko-text-muted)]">ロ</span>
                            <span className={`text-[10px] font-black leading-none ${lossColor}`}>{lossSymbol}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[15px] font-black text-[var(--kaiko-text-muted)] leading-none">—</span>
                    )}
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${evalStyle.border} ${evalStyle.bg} ${evalStyle.text} whitespace-nowrap font-[family-name:var(--font-rajdhani)]`}>
                      {evalStyle.label}
                    </span>
                  </div>

                  <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] shrink-0">chevron_right</span>
                </Link>
              );
            })
          )}
        </section>

        {/* CTA */}
        <div className="pt-2">
          <Link
            href={`/compare?horse=${id}`}
            className="w-full bg-[var(--kaiko-primary)] text-white py-4 rounded-xl font-black text-[14px] font-[family-name:var(--font-rajdhani)] tracking-[0.1em] uppercase flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
          >
            この馬を比較に追加
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
          </Link>
        </div>

      </main>

      <BottomNav />
    </>
  );
}
