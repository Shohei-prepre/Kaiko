import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { HorsePerformance, Horse, Race } from "@/lib/database.types";
import { calcAptitudeValue, calcLossValue, abilitySymbol, symbolColorClass } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

type PickPerf = HorsePerformance & {
  horses: Horse;
  races: Pick<Race, "race_id" | "race_name" | "race_date" | "track" | "grade" | "surface" | "distance">;
};

async function getPicks(): Promise<PickPerf[]> {
  const { data, error } = await supabase
    .from("horse_performances")
    .select(`
      *,
      horses ( horse_id, name, born_year, trainer ),
      races ( race_id, race_name, race_date, track, grade, surface, distance )
    `)
    .eq("eval_tag", "below")
    .not("horses", "is", null)
    .not("races", "is", null);

  if (error || !data) return [];

  return (data as PickPerf[])
    .filter((p) => {
      const v = calcAptitudeValue(p) + calcLossValue(p);
      return v >= 1.0;
    })
    .sort((a, b) => {
      const vA = calcAptitudeValue(a) + calcLossValue(a);
      const vB = calcAptitudeValue(b) + calcLossValue(b);
      if (vB !== vA) return vB - vA;
      return b.races.race_date.localeCompare(a.races.race_date);
    });
}

const GRADE_STYLE: Record<string, string> = {
  G1: "text-[var(--kaiko-tag-gold-text)] border-[#e8c060] bg-[var(--kaiko-tag-gold-bg)]",
  G2: "text-[var(--kaiko-tag-gold-text)] border-[#e8c060] bg-[var(--kaiko-tag-gold-bg)]",
  G3: "text-[var(--kaiko-text-sub)] border-gray-300 bg-gray-100",
};

function formatDate(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

function lossSummary(p: PickPerf): string {
  return [p.trouble_summary, p.temperament_summary, p.weight_effect_summary]
    .filter(Boolean)
    .join("。") || p.pace_effect_summary || "—";
}

export default async function PicksPage() {
  const picks = await getPicks();

  const doubleCircle = picks.filter((p) => abilitySymbol(calcAptitudeValue(p) + calcLossValue(p)) === "◎");
  const circle = picks.filter((p) => abilitySymbol(calcAptitudeValue(p) + calcLossValue(p)) === "○");

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-[var(--kaiko-border)] shadow-sm">
        <div className="flex items-baseline gap-0.5">
          <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter">回顧</span>
          <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
        </div>
        <div className="ml-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">tips_and_updates</span>
          <span className="text-[13px] font-black text-[var(--kaiko-text-main)] tracking-tight">逆張り買い候補</span>
        </div>
        <span className="ml-auto font-[family-name:var(--font-rajdhani)] text-[11px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">
          {picks.length} horses
        </span>
      </header>

      <main className="pt-16 pb-28 max-w-md mx-auto">
        {picks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--kaiko-text-muted)]">
            <span className="material-symbols-outlined text-[48px]">search_off</span>
            <p className="text-sm font-bold">候補馬がありません</p>
          </div>
        ) : (
          <>
            {doubleCircle.length > 0 && (
              <section className="px-3 pt-4">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`text-2xl font-black leading-none ${symbolColorClass("◎")}`}>◎</span>
                  <span className="text-[11px] font-black text-[var(--kaiko-text-main)] uppercase tracking-wider">
                    最注目 — {doubleCircle.length}頭
                  </span>
                </div>
                <div className="bg-white rounded-xl border border-[var(--kaiko-border)] shadow-[0_1px_3px_rgba(0,0,0,0.07)] overflow-hidden">
                  {doubleCircle.map((p, i) => (
                    <PickRow key={p.id} perf={p} isLast={i === doubleCircle.length - 1} />
                  ))}
                </div>
              </section>
            )}

            {circle.length > 0 && (
              <section className="px-3 pt-4">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`text-2xl font-black leading-none ${symbolColorClass("○")}`}>○</span>
                  <span className="text-[11px] font-black text-[var(--kaiko-text-main)] uppercase tracking-wider">
                    注目 — {circle.length}頭
                  </span>
                </div>
                <div className="bg-white rounded-xl border border-[var(--kaiko-border)] shadow-[0_1px_3px_rgba(0,0,0,0.07)] overflow-hidden">
                  {circle.map((p, i) => (
                    <PickRow key={p.id} perf={p} isLast={i === circle.length - 1} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </>
  );
}

function PickRow({ perf: p, isLast }: { perf: PickPerf; isLast: boolean }) {
  const abilityValue = calcAptitudeValue(p) + calcLossValue(p);
  const sym = abilitySymbol(abilityValue);
  const symColor = symbolColorClass(sym);
  const lossVal = calcLossValue(p);
  const gradeStyle = GRADE_STYLE[p.races.grade] ?? "text-[var(--kaiko-text-sub)] border-gray-300 bg-gray-50";

  return (
    <div className={`px-4 py-3.5 ${isLast ? "" : "border-b border-[var(--kaiko-border)]"}`}>
      <div className="flex items-start gap-3">
        {/* シンボル */}
        <span className={`text-[28px] font-black leading-none mt-0.5 shrink-0 ${symColor}`}>{sym}</span>

        <div className="flex-1 min-w-0">
          {/* 馬名 + 着順 */}
          <div className="flex items-baseline gap-2 mb-1">
            <Link
              href={`/horses/${p.horses.horse_id}`}
              className="text-[15px] font-black text-[var(--kaiko-text-main)] hover:text-[var(--kaiko-primary)] truncate leading-tight"
            >
              {p.horses.name}
            </Link>
            <span className="text-[11px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] shrink-0">
              {p.finish_order}着
            </span>
          </div>

          {/* レース情報 */}
          <Link
            href={`/races/${p.races.race_id}`}
            className="flex items-center gap-1.5 mb-2 group"
          >
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${gradeStyle} font-[family-name:var(--font-rajdhani)] uppercase`}>
              {p.races.grade}
            </span>
            <span className="text-[11px] font-bold text-[var(--kaiko-primary)] group-hover:underline truncate">
              {p.races.race_name}
            </span>
            <span className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] shrink-0">
              {p.races.track} · {formatDate(p.races.race_date)}
            </span>
          </Link>

          {/* 理由サマリー */}
          <p className="text-[11px] text-[var(--kaiko-text-sub)] leading-relaxed font-medium line-clamp-2">
            {lossSummary(p)}
          </p>
        </div>

        {/* ロス値 */}
        <div className="shrink-0 text-right">
          <span className="font-[family-name:var(--font-bebas-neue)] text-2xl text-[var(--kaiko-sym-good)] leading-none">
            +{lossVal.toFixed(1)}
          </span>
          <span className="block text-[8px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">loss</span>
        </div>
      </div>
    </div>
  );
}
