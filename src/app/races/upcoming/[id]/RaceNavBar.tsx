"use client";

import { useRouter } from "next/navigation";

interface RaceNav {
  race_id: string;
  track: string;
  race_number: number;
}

interface Props {
  races: RaceNav[];
  currentRaceId: string;
  currentTrack: string;
  currentRaceNumber: number;
}

export default function RaceNavBar({ races, currentRaceId, currentTrack, currentRaceNumber }: Props) {
  const router = useRouter();

  // 会場一覧（順序維持）
  const tracks = [...new Set(races.map((r) => r.track))];

  // 現在会場のレース番号一覧
  const sameTrackRaces = races.filter((r) => r.track === currentTrack).sort((a, b) => a.race_number - b.race_number);

  // 会場クリック → 同じレース番号があればそこへ、なければその会場の最初のレースへ
  const handleTrackClick = (track: string) => {
    if (track === currentTrack) return;
    const same = races.find((r) => r.track === track && r.race_number === currentRaceNumber);
    const first = races.find((r) => r.track === track);
    const target = same ?? first;
    if (target) router.push(`/races/upcoming/${target.race_id}`);
  };

  // レース番号クリック
  const handleRaceClick = (raceId: string) => {
    if (raceId === currentRaceId) return;
    router.push(`/races/upcoming/${raceId}`);
  };

  return (
    <div className="fixed top-14 left-0 w-full z-40 bg-white border-b border-[var(--kaiko-border)] shadow-sm">
      {/* 会場タブ */}
      {tracks.length > 1 && (
        <div className="flex overflow-x-auto scrollbar-none border-b border-[var(--kaiko-border)]">
          {tracks.map((track) => {
            const isActive = track === currentTrack;
            return (
              <button
                key={track}
                onClick={() => handleTrackClick(track)}
                className={`shrink-0 px-4 py-1.5 text-[11px] font-black tracking-wide transition-colors ${
                  isActive
                    ? "text-[var(--kaiko-primary)] border-b-2 border-[var(--kaiko-primary)]"
                    : "text-[var(--kaiko-text-muted)] hover:text-[var(--kaiko-text-main)]"
                }`}
              >
                {track}
              </button>
            );
          })}
        </div>
      )}

      {/* レース番号タブ */}
      <div className="flex overflow-x-auto scrollbar-none px-2 py-1 gap-1">
        {sameTrackRaces.map((r) => {
          const isActive = r.race_id === currentRaceId;
          return (
            <button
              key={r.race_id}
              onClick={() => handleRaceClick(r.race_id)}
              className={`shrink-0 min-w-[36px] px-2 py-1 rounded text-[11px] font-black font-[family-name:var(--font-rajdhani)] transition-colors ${
                isActive
                  ? "bg-[var(--kaiko-primary)] text-white"
                  : "bg-gray-100 text-[var(--kaiko-text-muted)] hover:bg-gray-200"
              }`}
            >
              {r.race_number}R
            </button>
          );
        })}
      </div>
    </div>
  );
}
