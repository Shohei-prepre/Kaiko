import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { RaceWithPerformances, HorseRating } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
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
        horses ( horse_id, name, born_year, trainer )
      )
    `)
    .eq("race_id", id)
    .single();

  if (error || !data) {
    console.error("[getRace] query error:", error, "id:", id);
    return null;
  }

  const race = data as RaceWithPerformances;
  race.horse_performances = race.horse_performances ?? [];
  race.horse_performances.sort((a, b) => a.finish_order - b.finish_order);
  return race;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const GRADE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  G1: { border: "border-[var(--kaiko-primary)]/50", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G2: { border: "border-[var(--kaiko-primary)]/30", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G3: { border: "border-black/10",  bg: "bg-black/6",  text: "text-[var(--kaiko-text-muted)]" },
  OP: { border: "border-black/8",  bg: "bg-black/5",   text: "text-[var(--kaiko-text-muted)]" },
};

const SURFACE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  "芝":    { border: "border-[var(--kaiko-tag-green-text)]/30", bg: "bg-[var(--kaiko-tag-green-bg)]", text: "text-[var(--kaiko-tag-green-text)]" },
  "ダート": { border: "border-[var(--kaiko-tag-gold-text)]/30",  bg: "bg-[var(--kaiko-tag-gold-bg)]",  text: "text-[var(--kaiko-tag-gold-text)]" },
};

const TRACK_CONDITION_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  "良":   { border: "border-[var(--kaiko-tag-blue-text)]/30",  bg: "bg-[var(--kaiko-tag-blue-bg)]",  text: "text-[var(--kaiko-tag-blue-text)]" },
  "稍重": { border: "border-[var(--kaiko-tag-gold-text)]/30",  bg: "bg-[var(--kaiko-tag-gold-bg)]",  text: "text-[var(--kaiko-tag-gold-text)]" },
  "重":   { border: "border-[var(--kaiko-tag-red-text)]/30",   bg: "bg-[var(--kaiko-tag-red-bg)]",   text: "text-[var(--kaiko-tag-red-text)]" },
  "不良": { border: "border-[var(--kaiko-tag-red-text)]/30",   bg: "bg-[var(--kaiko-tag-red-bg)]",   text: "text-[var(--kaiko-tag-red-text)]" },
};

function Badge({ label, style }: { label: string; style: { border: string; bg: string; text: string } }) {
  return (
    <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${style.border} ${style.bg} ${style.text} uppercase tracking-wider`}>
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

  // horse_ratings を一括取得してレース内ランクを計算（1=最強）
  const ratingRankMap = new Map<number, number>();
  const perfHorseIds = race.horse_performances
    .map((p) => p.horse_id)
    .filter((id): id is number => id !== null);
  if (perfHorseIds.length > 0) {
    const { data: ratings } = await (supabase as any)
      .from("horse_ratings")
      .select("horse_id, rating")
      .in("horse_id", perfHorseIds);
    [...((ratings ?? []) as Pick<HorseRating, "horse_id" | "rating">[])]
      .sort((a, b) => b.rating - a.rating)
      .forEach((r, i) => ratingRankMap.set(r.horse_id, i + 1));
  }

  const lapTimesRaw = race.lap_times ?? [];
  const lapTimes: number[] = Array.isArray(lapTimesRaw)
    ? lapTimesRaw
    : typeof lapTimesRaw === "string"
      ? (() => { try { return JSON.parse(lapTimesRaw); } catch { return []; } })()
      : [];
  const midIndex = Math.floor(lapTimes.length / 2);

  const firstHalf = lapTimes.slice(0, midIndex).reduce((s, v) => s + v, 0).toFixed(1);
  const secondHalf = lapTimes.slice(midIndex).reduce((s, v) => s + v, 0).toFixed(1);

  const gradeBadge = GRADE_BADGE[race.grade] ?? GRADE_BADGE["OP"];
  const surfaceBadge = SURFACE_BADGE[race.surface] ?? SURFACE_BADGE["芝"];
  const conditionBadge = TRACK_CONDITION_BADGE[race.track_condition] ?? TRACK_CONDITION_BADGE["良"];

  return (
    <>
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-black/8">
        <div className="flex items-center w-full gap-3">
          <BackButton />
          <Link href="/" className="flex items-baseline gap-0.5 shrink-0">
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black tracking-tighter text-[#131313]">回顧</span>
            <span className="text-xl font-[family-name:var(--font-noto-sans-jp)] font-black text-[var(--kaiko-primary)] italic">AI</span>
          </Link>
          <div className="flex flex-col leading-tight ml-auto text-right min-w-0 max-w-[140px]">
            <span className="text-sm font-bold text-[#131313] truncate">{race.race_name}</span>
            <span className="text-[10px] text-[var(--kaiko-text-muted)] font-bold truncate">
              {race.race_date.replace(/-/g, "/")} · {race.track} {race.grade}
            </span>
          </div>
        </div>
      </header>

      <main className="pt-16 px-3 max-w-md mx-auto pb-28 space-y-3">

        {/* レース概要カード */}
        <section className="bg-white rounded-2xl overflow-hidden border border-black/8">
          <div className="h-1 bg-[var(--kaiko-primary)] w-full" />
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-3xl font-black text-[#131313] tracking-tight leading-none">
                {race.race_name}
              </h2>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-black/6 border border-black/10 text-[var(--kaiko-text-muted)] uppercase tracking-wide ml-2 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--kaiko-text-muted)] inline-block" />
                終了
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge label={race.grade} style={gradeBadge} />
              <Badge label={race.surface} style={surfaceBadge} />
              <Badge label={race.track_condition} style={conditionBadge} />
              <Badge label={`${race.distance}m`} style={{ border: "border-black/8", bg: "bg-black/5", text: "text-[var(--kaiko-text-muted)]" }} />
              <Badge label={`${race.horse_performances.length}頭`} style={{ border: "border-black/8", bg: "bg-black/5", text: "text-[var(--kaiko-text-muted)]" }} />
            </div>
            <div className="flex gap-4 text-[13px] text-[var(--kaiko-text-muted)] font-bold">
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
          <div className="bg-white border border-black/8 rounded-2xl p-4">
            <span className="text-[11px] uppercase text-[var(--kaiko-text-muted)] font-bold block mb-1 tracking-widest">Pace</span>
            <span className="text-sm font-bold text-[#131313]">{race.pace ?? "—"}</span>
          </div>
          <div className="bg-white border border-black/8 rounded-2xl p-4">
            <span className="text-[11px] uppercase text-[var(--kaiko-text-muted)] font-bold block mb-1 tracking-widest">Track Bias</span>
            <span className="text-sm font-bold text-[#131313]">{race.track_bias_summary ?? "—"}</span>
          </div>
          {race.pace_summary && (
            <div className="col-span-2 bg-white border border-black/8 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">analytics</span>
                <span className="text-[11px] font-bold text-[#131313] uppercase tracking-widest">展開サマリー</span>
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--kaiko-text-muted)] font-medium">{race.pace_summary}</p>
            </div>
          )}
        </section>

        {/* ラップタイム */}
        {lapTimes.length > 0 && (
          <section className="bg-white rounded-2xl border border-black/8 p-5">
            <div className="flex justify-between items-center mb-5">
              <span className="text-[11px] uppercase text-[var(--kaiko-text-muted)] font-bold tracking-widest">Lap Time Analysis</span>
              <span className="text-[11px] font-bold text-[var(--kaiko-primary)] uppercase">
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
                    className={`flex-1 rounded-t-sm transition-[height] duration-300 ${isAccel ? "bg-[var(--kaiko-primary)]/60" : "bg-black/10"}`}
                    style={{ height: `${h}%` }}
                    title={`${sec}s`}
                  />
                );
              })}
            </div>
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--kaiko-text-muted)] font-bold uppercase">
                <span className="w-2.5 h-2.5 rounded-sm bg-black/10" />通常
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--kaiko-text-muted)] font-bold uppercase">
                <span className="w-2.5 h-2.5 rounded-sm bg-[var(--kaiko-primary)]/60" />加速区間
              </span>
            </div>
          </section>
        )}

        {/* 出走馬リスト */}
        <div className="flex items-center gap-2 px-1 pt-2">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">list_alt</span>
          <span className="text-[12px] font-black text-[#131313] uppercase tracking-wider">
            出走馬（全{race.horse_performances.length}頭）
          </span>
        </div>

        <section className="bg-white rounded-2xl overflow-hidden border border-black/8">
          {/* テーブルヘッダー */}
          <div
            className="grid gap-2 px-3 py-3 bg-black/4 border-b border-black/8 items-center"
            style={{ gridTemplateColumns: "28px 28px 1fr 105px" }}
          >
            <span className="text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">着</span>
            <span className="text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">枠</span>
            <span className="text-[10px] font-black text-[var(--kaiko-text-muted)]">馬名 / データ</span>
            <span className="text-[10px] font-black text-[var(--kaiko-text-muted)] text-right">能力 → 適性/ロス</span>
          </div>

          {race.horse_performances.map((perf, i) => (
            <HorseRow
              key={perf.id}
              perf={perf}
              isFirst={i === 0}
              ratingRank={ratingRankMap.get(perf.horse_id) ?? undefined}
            />
          ))}
        </section>

        {/* CTA */}
        <div className="pt-2">
          <Link
            href={`/compare`}
            className="w-full bg-[var(--kaiko-primary)] text-[#131313] py-4 rounded-3xl font-black text-[14px] font-[family-name:var(--font-noto-sans-jp)] tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            能力比較に追加する
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
          </Link>
        </div>
      </main>

      <BottomNav />
    </>
  );
}
