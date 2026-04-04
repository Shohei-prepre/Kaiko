import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { RaceWithPerformances } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";
import HorseRow from "./HorseRow";

interface Props {
  params: Promise<{ id: string }>;
}

async function getRace(id: string): Promise<RaceWithPerformances | null> {
  const { data, error } = await supabase
    .from("races")
    .select(`
      *,
      horse_performances (
        *,
        horses ( id, name, born_year, trainer )
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const race = data as RaceWithPerformances;
  race.horse_performances.sort((a, b) => a.finish_order - b.finish_order);
  return race;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const GRADE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  G1: { border: "border-[#e8c060]", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G2: { border: "border-[#e8c060]", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G3: { border: "border-gray-300",  bg: "bg-gray-100",                    text: "text-[var(--kaiko-text-sub)]" },
  OP: { border: "border-[var(--kaiko-border)]", bg: "bg-gray-50",         text: "text-[var(--kaiko-text-sub)]" },
};

const SURFACE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  "芝":   { border: "border-[#80c8a0]", bg: "bg-[var(--kaiko-tag-green-bg)]", text: "text-[var(--kaiko-tag-green-text)]" },
  "ダート": { border: "border-[#c0a060]", bg: "bg-[var(--kaiko-tag-gold-bg)]",  text: "text-[var(--kaiko-tag-gold-text)]" },
};

const TRACK_CONDITION_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  "良":  { border: "border-[#99bbf5]", bg: "bg-[var(--kaiko-tag-blue-bg)]", text: "text-[var(--kaiko-tag-blue-text)]" },
  "稍重": { border: "border-[#c0a060]", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  "重":  { border: "border-red-200",    bg: "bg-[var(--kaiko-tag-red-bg)]",  text: "text-[var(--kaiko-tag-red-text)]" },
  "不良": { border: "border-red-200",    bg: "bg-[var(--kaiko-tag-red-bg)]",  text: "text-[var(--kaiko-tag-red-text)]" },
};

function Badge({ label, style }: { label: string; style: { border: string; bg: string; text: string } }) {
  return (
    <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${style.border} ${style.bg} ${style.text} font-[family-name:var(--font-rajdhani)] uppercase tracking-wider`}>
      {label}
    </span>
  );
}

const LAP_MAX_SECONDS = 13.5;
const LAP_MIN_SECONDS = 10.5;

function lapHeight(sec: number): number {
  const pct = (LAP_MAX_SECONDS - sec) / (LAP_MAX_SECONDS - LAP_MIN_SECONDS);
  return Math.min(95, Math.max(20, Math.round(pct * 95)));
}

export default async function RaceDetailPage({ params }: Props) {
  const { id } = await params;
  const race = await getRace(id);

  if (!race) notFound();

  const lapTimes = race.lap_times ?? [];
  const midIndex = Math.floor(lapTimes.length / 2);

  const firstHalf = lapTimes.slice(0, midIndex).reduce((s, v) => s + v, 0).toFixed(1);
  const secondHalf = lapTimes.slice(midIndex).reduce((s, v) => s + v, 0).toFixed(1);

  const gradeBadge = GRADE_BADGE[race.grade] ?? GRADE_BADGE["OP"];
  const surfaceBadge = SURFACE_BADGE[race.surface] ?? SURFACE_BADGE["芝"];
  const conditionBadge = TRACK_CONDITION_BADGE[race.track_condition] ?? TRACK_CONDITION_BADGE["良"];

  return (
    <>
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-[var(--kaiko-border)] shadow-sm">
        <div className="flex items-center w-full gap-3">
          <Link
            href="/races"
            className="w-8 h-8 rounded-lg border border-[var(--kaiko-border)] bg-white flex items-center justify-center active:scale-95 duration-150"
          >
            <span className="material-symbols-outlined text-[var(--kaiko-text-main)] text-[18px] font-bold">arrow_back_ios_new</span>
          </Link>
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter">回顧</span>
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
          </div>
          <div className="flex flex-col leading-tight ml-auto text-right">
            <span className="text-sm font-bold text-[var(--kaiko-text-main)]">{race.race_name}</span>
            <span className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] font-bold">
              {race.race_date.replace(/-/g, "/")} · {race.track} {race.grade}
            </span>
          </div>
        </div>
      </header>

      <main className="pt-16 px-3 max-w-md mx-auto pb-28 space-y-3">

        {/* レース概要カード */}
        <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05),_0_1px_2px_rgba(0,0,0,0.1)] border border-[var(--kaiko-border)] overflow-hidden">
          <div className="h-1 bg-[var(--kaiko-primary)] w-full" />
          <div className="p-5">
            <h2 className="text-3xl font-black text-[var(--kaiko-text-main)] mb-3 tracking-tight">{race.race_name}</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge label={race.grade} style={gradeBadge} />
              <Badge label={race.surface} style={surfaceBadge} />
              <Badge label={race.track_condition} style={conditionBadge} />
              <Badge label={`${race.distance}m`} style={{ border: "border-[var(--kaiko-border)]", bg: "bg-gray-50", text: "text-[var(--kaiko-text-sub)]" }} />
              <Badge label={`${race.horse_performances.length}頭`} style={{ border: "border-[var(--kaiko-border)]", bg: "bg-gray-50", text: "text-[var(--kaiko-text-sub)]" }} />
            </div>
            <div className="flex gap-4 text-[13px] text-[var(--kaiko-text-sub)] font-bold">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">location_on</span>
                {race.track}競馬場
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                {formatDate(race.race_date)}
              </span>
            </div>
          </div>
        </section>

        {/* 情報グリッド */}
        <section className="grid grid-cols-2 gap-2">
          <div className="bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] rounded-xl p-4">
            <span className="font-[family-name:var(--font-rajdhani)] text-[11px] uppercase text-[var(--kaiko-text-muted)] font-bold block mb-1 tracking-widest">Pace</span>
            <span className="text-sm font-bold text-[var(--kaiko-text-main)]">{race.pace ?? "—"}</span>
          </div>
          <div className="bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] rounded-xl p-4">
            <span className="font-[family-name:var(--font-rajdhani)] text-[11px] uppercase text-[var(--kaiko-text-muted)] font-bold block mb-1 tracking-widest">Track Bias</span>
            <span className="text-sm font-bold text-[var(--kaiko-text-main)]">{race.track_bias_summary ?? "—"}</span>
          </div>
          {race.pace_summary && (
            <div className="col-span-2 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">analytics</span>
                <span className="text-[11px] font-bold text-[var(--kaiko-text-main)] uppercase tracking-widest">展開サマリー</span>
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--kaiko-text-sub)] font-medium">{race.pace_summary}</p>
            </div>
          )}
        </section>

        {/* ラップタイム */}
        {lapTimes.length > 0 && (
          <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] p-5">
            <div className="flex justify-between items-center mb-5">
              <span className="font-[family-name:var(--font-rajdhani)] text-[11px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest">Lap Time Analysis</span>
              <span className="font-[family-name:var(--font-rajdhani)] text-[11px] font-bold text-[var(--kaiko-primary)] uppercase">
                前半 {firstHalf} / 後半 {secondHalf}
              </span>
            </div>
            <div className="flex items-end gap-[3px] h-16 mb-4">
              {lapTimes.map((sec, i) => {
                const h = lapHeight(sec);
                const isAccel = i >= midIndex && sec < (lapTimes[i - 1] ?? 99);
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm transition-[height] duration-300 ${isAccel ? "bg-amber-500/60" : "bg-[var(--kaiko-primary)]/20"}`}
                    style={{ height: `${h}%` }}
                    title={`${sec}s`}
                  />
                );
              })}
            </div>
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--kaiko-text-muted)] font-bold uppercase">
                <span className="w-2.5 h-2.5 rounded-sm bg-[var(--kaiko-primary)]/20" />通常
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--kaiko-text-muted)] font-bold uppercase">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/60" />加速区間
              </span>
            </div>
          </section>
        )}

        {/* 出走馬リスト */}
        <div className="flex items-center gap-2 px-1 pt-2">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">list_alt</span>
          <span className="text-[12px] font-black text-[var(--kaiko-text-main)] uppercase tracking-wider">
            出走馬（全{race.horse_performances.length}頭）
          </span>
        </div>

        <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] overflow-hidden">
          {/* テーブルヘッダー */}
          <div
            className="grid gap-2 px-3 py-3 bg-gray-50 border-b border-[var(--kaiko-border)] items-center"
            style={{ gridTemplateColumns: "28px 28px 1fr 105px" }}
          >
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">着</span>
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">枠</span>
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)]">馬名 / データ</span>
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-right">能力 → 適性/ロス</span>
          </div>

          {race.horse_performances.map((perf, i) => (
            <HorseRow key={perf.id} perf={perf} isFirst={i === 0} />
          ))}
        </section>

        {/* CTA */}
        <div className="pt-2">
          <Link
            href={`/compare`}
            className="w-full bg-[var(--kaiko-primary)] text-white py-4 rounded-xl font-black text-[14px] font-[family-name:var(--font-rajdhani)] tracking-[0.1em] uppercase flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
          >
            Add horse to comparison
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
          </Link>
        </div>
      </main>

      <BottomNav />
    </>
  );
}
