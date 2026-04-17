import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { UpcomingRace } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

async function getUpcomingRaces(): Promise<UpcomingRace[]> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("upcoming_races" as never)
      .select("*")
      .gte("race_date", today)
      .order("race_date")
      .order("race_number");
    if (error || !data) return [];
    return data as UpcomingRace[];
  } catch {
    return [];
  }
}

function groupByDate(races: UpcomingRace[]): { date: string; races: UpcomingRace[] }[] {
  const map = new Map<string, UpcomingRace[]>();
  for (const r of races) {
    if (!map.has(r.race_date)) map.set(r.race_date, []);
    map.get(r.race_date)!.push(r);
  }
  return Array.from(map.entries()).map(([date, rs]) => ({ date, races: rs }));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

const GRADE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  G1: { border: "border-[var(--kaiko-primary)]/40", bg: "bg-[var(--kaiko-primary)]/10", text: "text-[var(--kaiko-primary)]" },
  G2: { border: "border-[var(--kaiko-primary)]/40", bg: "bg-[var(--kaiko-primary)]/10", text: "text-[var(--kaiko-primary)]" },
  G3: { border: "border-black/10", bg: "bg-black/6", text: "text-[var(--kaiko-text-muted)]" },
  OP: { border: "border-black/8",  bg: "bg-black/5", text: "text-[var(--kaiko-text-muted)]" },
};

function GradeBadge({ grade }: { grade: string }) {
  const style = GRADE_BADGE[grade] ?? GRADE_BADGE["OP"];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${style.border} ${style.bg} ${style.text}`}>
      {grade}
    </span>
  );
}

export default async function UpcomingListPage() {
  const races = await getUpcomingRaces();
  const grouped = groupByDate(races);

  return (
    <div className="min-h-screen bg-[#f2f4f7] pb-24">
      {/* ヘッダー */}
      <header className="bg-white border-b border-[var(--kaiko-border)] sticky top-0 z-50 h-14 flex items-center px-4">
        <h1 className="text-xl font-black tracking-tighter font-[family-name:var(--font-noto-sans-jp)]">
          <Link href="/">
            <span className="text-[var(--kaiko-text-main)]">回顧</span>
            <span className="text-[var(--kaiko-primary)] italic">AI</span>
          </Link>
        </h1>
        <span className="ml-3 text-[11px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] uppercase tracking-widest">
          Upcoming
        </span>
      </header>

      <main className="max-w-md mx-auto px-3 pt-4 space-y-4">
        {races.length === 0 ? (
          <EmptyState />
        ) : (
          grouped.map(({ date, races: dayRaces }) => (
            <section key={date}>
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[16px]">event</span>
                <span className="text-[12px] font-black text-[var(--kaiko-text-main)] tracking-wider">
                  {formatDate(date)}
                </span>
              </div>
              <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] overflow-hidden">
                {dayRaces.map((race) => (
                  <Link
                    key={race.race_id}
                    href={`/races/upcoming/${race.race_id}`}
                    className="flex items-center gap-3 px-4 py-3 border-b border-[var(--kaiko-border)] last:border-b-0 hover:bg-gray-50 active:opacity-60 transition-opacity"
                  >
                    <div className="w-8 h-8 flex items-center justify-center font-bold font-[family-name:var(--font-rajdhani)] text-sm flex-shrink-0 bg-gray-100 text-[var(--kaiko-text-sub)] rounded">
                      {race.race_number ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <GradeBadge grade={race.grade} />
                        <h3 className="font-bold text-sm truncate tracking-tight">{race.race_name}</h3>
                      </div>
                      <span className="text-[11px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] font-medium">
                        {race.track} / {race.distance}m / {race.surface}
                        {race.head_count ? ` / ${race.head_count}頭` : ""}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-[var(--kaiko-text-muted)] flex-shrink-0">
                      chevron_right
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-[var(--kaiko-border)] p-8 text-center mt-4">
      <span className="material-symbols-outlined text-[var(--kaiko-text-muted)] text-[48px] block mb-3">
        event_upcoming
      </span>
      <p className="text-sm font-bold text-[var(--kaiko-text-main)] mb-1">出走前データなし</p>
      <p className="text-[12px] text-[var(--kaiko-text-muted)] leading-relaxed">
        netkeibaから出馬票が取得されると<br />ここに表示されます
      </p>
    </div>
  );
}
