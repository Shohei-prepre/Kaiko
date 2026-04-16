import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Horse, HorsePerformance, Race } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import HorseHistory from "./HorseHistory";

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


export default async function HorsePage({ params }: Props) {
  const { id } = await params;
  const horse = await getHorse(id);
  if (!horse) notFound();

  const perfs = horse.horse_performances;

  return (
    <>
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-black/8">
        <div className="flex items-center w-full gap-3">
          <BackButton />
          <Link href="/" className="flex items-baseline gap-0.5">
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter text-[#131313]">回顧</span>
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
          </Link>
          <span className="ml-auto text-sm font-bold text-[#131313] truncate max-w-[120px]">
            {horse.name}
          </span>
        </div>
      </header>

      <main className="pt-16 px-3 max-w-md mx-auto pb-28 space-y-3">

        {/* 馬プロフィールカード */}
        <section className="bg-white rounded-2xl overflow-hidden border border-black/8">
          <div className="h-1 bg-[var(--kaiko-primary)] w-full" />
          <div className="p-5">
            <h2 className="text-2xl font-black text-[#131313] tracking-tight mb-3">{horse.name}</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              {horse.born_year && (
                <div>
                  <span className="text-[10px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest block">Born</span>
                  <span className="font-bold text-[#131313]">{horse.born_year}年生</span>
                </div>
              )}
              {horse.trainer && (
                <div>
                  <span className="text-[10px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest block">Trainer</span>
                  <span className="font-bold text-[#131313]">{horse.trainer}</span>
                </div>
              )}
              <div>
                <span className="text-[10px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest block">Races</span>
                <span className="font-bold text-[#131313]">{perfs.length}戦</span>
              </div>
            </div>
          </div>
        </section>

        {/* 出走歴 */}
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">history</span>
          <span className="text-[12px] font-black text-[#131313] uppercase tracking-wider">出走歴</span>
        </div>

        <section className="bg-white rounded-2xl overflow-hidden border border-black/8">
          <HorseHistory perfs={perfs} />
        </section>

        {/* CTA */}
        <div className="pt-2">
          <Link
            href={`/compare?horse=${id}`}
            className="w-full bg-[var(--kaiko-primary)] text-[#131313] py-4 rounded-3xl font-black text-[14px] tracking-wider uppercase flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
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
