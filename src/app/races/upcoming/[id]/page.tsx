import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type {
  UpcomingRace,
  UpcomingEntry,
  UpcomingEntryWithForm,
  RecentPerf,
  EvalTag,
} from "@/lib/database.types";
import { isBuyCandidate } from "@/lib/database.types";
import BottomNav from "@/components/BottomNav";

interface Props {
  params: Promise<{ id: string }>;
}

// ── データ取得 ──────────────────────────────────────────────────

async function getUpcomingRace(id: string): Promise<UpcomingRace | null> {
  try {
    const { data, error } = await supabase
      .from("upcoming_races" as never)
      .select("*")
      .eq("race_id", id)
      .single();
    if (error || !data) return null;
    return data as UpcomingRace;
  } catch {
    return null;
  }
}

async function getEntries(raceId: string): Promise<UpcomingEntry[]> {
  try {
    const { data, error } = await supabase
      .from("upcoming_entries" as never)
      .select("*")
      .eq("race_id", raceId)
      .order("popularity");
    if (error || !data) return [];
    return data as UpcomingEntry[];
  } catch {
    return [];
  }
}

/** 馬名 → horse_id をDBで解決（horse_idがNULLの馬向け） */
async function resolveHorseIdsByName(names: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (names.length === 0) return map;
  try {
    const { data } = await supabase
      .from("horses")
      .select("horse_id, name")
      .in("name", names);
    for (const h of (data ?? []) as { horse_id: number; name: string }[]) {
      map.set(h.name, h.horse_id);
    }
  } catch { /* ignore */ }
  return map;
}

async function getRecentPerfsForHorses(
  horseIds: number[]
): Promise<Map<number, RecentPerf[]>> {
  const result = new Map<number, RecentPerf[]>();
  if (horseIds.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from("horse_performances")
      .select(`
        horse_id,
        finish_order,
        margin,
        eval_tag,
        races ( race_name, race_date )
      `)
      .in("horse_id", horseIds);

    if (error || !data) return result;

    type RawPerf = {
      horse_id: number;
      finish_order: number;
      margin: number | null;
      eval_tag: EvalTag | null;
      races: { race_name: string; race_date: string } | null;
    };

    // horse_id ごとに race_date 降順でソートして上位3件取得
    const byHorse = new Map<number, RawPerf[]>();
    for (const row of data as RawPerf[]) {
      if (!row.races) continue;
      if (!byHorse.has(row.horse_id)) byHorse.set(row.horse_id, []);
      byHorse.get(row.horse_id)!.push(row);
    }

    for (const [hid, perfs] of byHorse.entries()) {
      const sorted = perfs
        .sort((a, b) => b.races!.race_date.localeCompare(a.races!.race_date))
        .slice(0, 3)
        .map((p) => ({
          race_name: p.races!.race_name,
          race_date: p.races!.race_date,
          finish_order: p.finish_order,
          margin: p.margin,
          eval_tag: p.eval_tag,
        }));
      result.set(hid, sorted);
    }
  } catch {
    // テーブルが存在しない場合など
  }

  return result;
}

// ── ヘルパー ──────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatOddsUpdated(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WAKU_STYLES: Record<number, { bg: string; border: string }> = {
  1: { bg: "bg-white",         border: "border-gray-300" },
  2: { bg: "bg-[#e2e8f0]",     border: "border-gray-300" },
  3: { bg: "bg-[#fee2e2]",     border: "border-red-200" },
  4: { bg: "bg-[#dbeafe]",     border: "border-blue-200" },
  5: { bg: "bg-[#fef9c3]",     border: "border-yellow-300" },
  6: { bg: "bg-[#dcfce7]",     border: "border-emerald-200" },
  7: { bg: "bg-[#ffedd5]",     border: "border-orange-200" },
  8: { bg: "bg-[#fce7f3]",     border: "border-pink-200" },
};

const GRADE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  G1: { border: "border-[#e8c060]", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G2: { border: "border-[#e8c060]", bg: "bg-[var(--kaiko-tag-gold-bg)]", text: "text-[var(--kaiko-tag-gold-text)]" },
  G3: { border: "border-gray-300",  bg: "bg-gray-100",                   text: "text-[var(--kaiko-text-sub)]" },
  OP: { border: "border-[var(--kaiko-border)]", bg: "bg-gray-50",        text: "text-[var(--kaiko-text-sub)]" },
};

const SURFACE_BADGE: Record<string, { border: string; bg: string; text: string }> = {
  "芝":    { border: "border-[#80c8a0]", bg: "bg-[var(--kaiko-tag-green-bg)]", text: "text-[var(--kaiko-tag-green-text)]" },
  "ダート": { border: "border-[#c0a060]", bg: "bg-[var(--kaiko-tag-gold-bg)]",  text: "text-[var(--kaiko-tag-gold-text)]" },
};

function Badge({ label, style }: { label: string; style: { border: string; bg: string; text: string } }) {
  return (
    <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${style.border} ${style.bg} ${style.text} font-[family-name:var(--font-rajdhani)] uppercase tracking-wider`}>
      {label}
    </span>
  );
}

// 近3走ミニバッジ（着順数字 + eval_tag 色）
const EVAL_MINI: Record<string, { bg: string; border: string; text: string }> = {
  below:     { bg: "bg-[var(--kaiko-eval-positive-bg)]", border: "border-emerald-200", text: "text-[var(--kaiko-eval-positive-text)]" },
  fair:      { bg: "bg-[var(--kaiko-eval-neutral-bg)]",  border: "border-blue-200",    text: "text-[var(--kaiko-eval-neutral-text)]" },
  above:     { bg: "bg-[var(--kaiko-eval-warning-bg)]",  border: "border-amber-200",   text: "text-[var(--kaiko-eval-warning-text)]" },
  disregard: { bg: "bg-[var(--kaiko-eval-disregard-bg)]", border: "border-gray-200",   text: "text-[var(--kaiko-text-muted)]" },
};

function EvalMiniBadge({ perf }: { perf: RecentPerf }) {
  const tag = perf.eval_tag ?? "disregard";
  const s = EVAL_MINI[tag] ?? EVAL_MINI.disregard;
  const label = tag === "disregard" ? "-" : String(perf.finish_order);
  return (
    <span
      className={`font-[family-name:var(--font-rajdhani)] text-[10px] font-black w-[18px] h-[18px] rounded flex items-center justify-center border ${s.bg} ${s.border} ${s.text}`}
    >
      {label}
    </span>
  );
}

// ── ページ本体 ──────────────────────────────────────────────────

export default async function UpcomingRaceDetailPage({ params }: Props) {
  const { id } = await params;

  const [race, entries] = await Promise.all([
    getUpcomingRace(id),
    getEntries(id),
  ]);

  if (!race) notFound();

  // horse_id が NULL の馬を名前で解決
  const unlinkedNames = entries
    .filter((e) => e.horse_id === null)
    .map((e) => e.horse_name);
  const nameToIdMap = await resolveHorseIdsByName(unlinkedNames);

  // 全 horse_id を収集（直接持っているもの + 名前解決したもの）
  const resolvedEntries = entries.map((e) => ({
    ...e,
    horse_id: e.horse_id ?? nameToIdMap.get(e.horse_name) ?? null,
  }));

  const horseIds = resolvedEntries
    .map((e) => e.horse_id)
    .filter((hid): hid is number => hid !== null);

  const recentPerfsMap = await getRecentPerfsForHorses(horseIds);

  const entriesWithForm: UpcomingEntryWithForm[] = resolvedEntries.map((e) => ({
    ...e,
    recentPerfs: e.horse_id ? (recentPerfsMap.get(e.horse_id) ?? []) : [],
  }));

  const buyCandidates = entriesWithForm.filter((e) => isBuyCandidate(e.recentPerfs));

  const gradeBadge = GRADE_BADGE[race.grade] ?? GRADE_BADGE["OP"];
  const surfaceBadge = SURFACE_BADGE[race.surface] ?? SURFACE_BADGE["芝"];

  return (
    <>
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-4 h-14 bg-white border-b border-[var(--kaiko-border)] shadow-sm">
        <div className="flex items-center w-full gap-3">
          <Link
            href="/races"
            className="w-8 h-8 rounded-lg border border-[var(--kaiko-border)] bg-white flex items-center justify-center active:scale-95 duration-150"
          >
            <span className="material-symbols-outlined text-[var(--kaiko-text-main)] text-[18px]">arrow_back_ios_new</span>
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
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-3xl font-black text-[var(--kaiko-text-main)] tracking-tight leading-none">
                {race.race_name}
              </h2>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-[var(--kaiko-primary)] font-[family-name:var(--font-rajdhani)] uppercase tracking-wide ml-2 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--kaiko-primary)] animate-pulse inline-block" />
                出走前
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge label={race.grade} style={gradeBadge} />
              <Badge label={race.surface} style={surfaceBadge} />
              <Badge label={`${race.distance}m`} style={{ border: "border-[var(--kaiko-border)]", bg: "bg-gray-50", text: "text-[var(--kaiko-text-sub)]" }} />
              {race.head_count && (
                <Badge label={`${race.head_count}頭`} style={{ border: "border-[var(--kaiko-border)]", bg: "bg-gray-50", text: "text-[var(--kaiko-text-sub)]" }} />
              )}
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

        {/* オッズ更新バナー */}
        <div className="flex items-center gap-2 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] px-4 py-3">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">sync</span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-bold text-[var(--kaiko-text-main)]">オッズ最終更新</span>
            <span className="text-[11px] text-[var(--kaiko-text-muted)] ml-2 font-[family-name:var(--font-rajdhani)]">
              {formatOddsUpdated(race.odds_updated_at)}
            </span>
          </div>
          <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)] uppercase tracking-wider shrink-0">
            netkeiba
          </span>
        </div>

        {/* 凡例 */}
        <div className="flex items-center gap-3 px-1 flex-wrap">
          <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-bold text-[var(--kaiko-text-muted)] uppercase tracking-wider">近3走：</span>
          {(["below", "fair", "above", "disregard"] as const).map((tag) => {
            const labels = { below: "実力以下", fair: "実力通り", above: "実力以上", disregard: "度外視" };
            const colors = { below: "bg-emerald-400", fair: "bg-[var(--kaiko-primary)]", above: "bg-amber-400", disregard: "bg-gray-300" };
            return (
              <div key={tag} className="flex items-center gap-1">
                <span className={`w-[7px] h-[7px] rounded-full ${colors[tag]} inline-block`} />
                <span className="text-[10px] text-[var(--kaiko-text-sub)] font-bold">{labels[tag]}</span>
              </div>
            );
          })}
        </div>

        {/* 出走馬リスト */}
        <div className="flex items-center gap-2 px-1 pt-1">
          <span className="material-symbols-outlined text-[var(--kaiko-primary)] text-[18px]">list_alt</span>
          <span className="text-[12px] font-black text-[var(--kaiko-text-main)] uppercase tracking-wider">
            出馬表（{entriesWithForm.length}頭）
          </span>
        </div>

        <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[var(--kaiko-border)] overflow-hidden">
          {/* テーブルヘッダー */}
          <div
            className="grid gap-2 px-3 py-2.5 bg-gray-50 border-b border-[var(--kaiko-border)] items-center"
            style={{ gridTemplateColumns: "28px 24px 1fr 72px" }}
          >
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">枠</span>
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-center">馬</span>
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)]">馬名 / 騎手</span>
            <span className="font-[family-name:var(--font-rajdhani)] text-[10px] font-black text-[var(--kaiko-text-muted)] text-right">単勝 / 近3走</span>
          </div>

          {entriesWithForm.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--kaiko-text-muted)]">
              エントリーデータがありません
            </div>
          ) : (
            entriesWithForm.map((entry) => {
              const isCandidate = isBuyCandidate(entry.recentPerfs);
              const waku = entry.frame_number ?? 1;
              const wakuStyle = WAKU_STYLES[Math.min(waku, 8)] ?? WAKU_STYLES[1];
              const horseHref = entry.horse_id ? `/horses/${entry.horse_id}` : undefined;

              return (
                <div
                  key={entry.id}
                  className={`border-b border-[var(--kaiko-border)] last:border-b-0 ${
                    isCandidate ? "bg-emerald-50/40 border-l-2 border-l-emerald-400" : ""
                  }`}
                >
                  <div
                    className="grid gap-2 px-3 py-3.5 items-center"
                    style={{ gridTemplateColumns: "28px 24px 1fr 72px" }}
                  >
                    {/* 枠番 */}
                    <div
                      className={`w-6 h-6 rounded-md ${wakuStyle.bg} border ${wakuStyle.border} shadow-sm flex items-center justify-center text-[11px] font-black font-[family-name:var(--font-rajdhani)]`}
                    >
                      {entry.frame_number ?? "-"}
                    </div>

                    {/* 馬番 */}
                    <span className="text-[13px] font-black text-[var(--kaiko-text-muted)] text-center font-[family-name:var(--font-rajdhani)] italic leading-none">
                      {entry.horse_number ?? "-"}
                    </span>

                    {/* 馬名・騎手 */}
                    <div className="min-w-0">
                      {horseHref ? (
                        <Link href={horseHref} className="font-bold text-[14px] text-[var(--kaiko-text-main)] leading-tight truncate block hover:text-[var(--kaiko-primary)]">
                          {entry.horse_name}
                        </Link>
                      ) : (
                        <span className="font-bold text-[14px] text-[var(--kaiko-text-main)] leading-tight truncate block">
                          {entry.horse_name}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {entry.jockey && (
                          <span className="text-[10px] text-[var(--kaiko-text-sub)] font-[family-name:var(--font-rajdhani)] font-bold">
                            {entry.jockey}
                          </span>
                        )}
                        {entry.weight_carried && (
                          <span className="text-[10px] text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">
                            {entry.weight_carried}kg
                          </span>
                        )}
                      </div>
                      {isCandidate && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--kaiko-eval-positive-bg)] border border-emerald-200 text-[var(--kaiko-eval-positive-text)] mt-1">
                          <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
                          次走買い候補
                        </span>
                      )}
                    </div>

                    {/* オッズ・近3走 */}
                    <div className="flex flex-col items-end gap-1.5">
                      {entry.odds !== null ? (
                        <div className="flex items-baseline gap-0.5">
                          <span className={`text-[18px] font-black leading-none font-[family-name:var(--font-rajdhani)] ${
                            (entry.popularity ?? 99) <= 3
                              ? "text-[var(--kaiko-primary)]"
                              : "text-[var(--kaiko-text-sub)]"
                          }`}>
                            {entry.odds.toFixed(1)}
                          </span>
                          <span className={`text-[10px] font-bold leading-none ${
                            (entry.popularity ?? 99) <= 3
                              ? "text-[var(--kaiko-primary)]"
                              : "text-[var(--kaiko-text-sub)]"
                          }`}>倍</span>
                        </div>
                      ) : (
                        <span className="text-[13px] font-bold text-[var(--kaiko-text-muted)] font-[family-name:var(--font-rajdhani)]">—</span>
                      )}

                      <div className="flex items-center gap-0.5">
                        {entry.popularity !== null && (
                          <span className={`font-[family-name:var(--font-rajdhani)] text-[9px] font-black text-white px-1 rounded leading-none py-0.5 mr-1 ${
                            entry.popularity <= 3 ? "bg-amber-500" : "bg-gray-400"
                          }`}>
                            {entry.popularity}人気
                          </span>
                        )}
                        {/* 近3走ミニバッジ */}
                        <div className="flex gap-0.5">
                          {entry.recentPerfs.length > 0
                            ? entry.recentPerfs.map((p, i) => (
                                <EvalMiniBadge key={i} perf={p} />
                              ))
                            : <span className="text-[9px] text-[var(--kaiko-text-muted)]">—</span>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* 次走買い候補サマリー */}
        {buyCandidates.length > 0 && (
          <section className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-emerald-200 overflow-hidden">
            <div className="h-1 bg-emerald-400 w-full" />
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-emerald-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
                <span className="text-[12px] font-black text-[var(--kaiko-text-main)] uppercase tracking-wider">次走買い候補</span>
                <span className="text-[10px] font-bold text-[var(--kaiko-text-muted)] ml-auto">近2走以上 実力以下</span>
              </div>
              <div className="space-y-2">
                {buyCandidates.map((e) => {
                  const waku = e.frame_number ?? 1;
                  const wakuStyle = WAKU_STYLES[Math.min(waku, 8)] ?? WAKU_STYLES[1];
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 bg-[var(--kaiko-eval-positive-bg)] border border-emerald-200 rounded-lg px-3 py-2.5"
                    >
                      <div className={`w-5 h-5 rounded ${wakuStyle.bg} border ${wakuStyle.border} flex items-center justify-center text-[10px] font-black font-[family-name:var(--font-rajdhani)] shrink-0`}>
                        {e.frame_number ?? "-"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-bold text-[var(--kaiko-text-main)]">{e.horse_name}</span>
                        {e.jockey && (
                          <span className="text-[10px] text-[var(--kaiko-text-sub)] ml-2">{e.jockey}</span>
                        )}
                      </div>
                      {e.odds !== null && (
                        <div className="text-right shrink-0">
                          <span className="text-[16px] font-black text-[var(--kaiko-primary)] font-[family-name:var(--font-rajdhani)]">
                            {e.odds.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-[var(--kaiko-primary)] font-bold">倍</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

      </main>

      <BottomNav />
    </>
  );
}
