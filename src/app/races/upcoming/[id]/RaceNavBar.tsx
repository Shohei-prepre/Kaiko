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

  const tracks = [...new Set(races.map((r) => r.track))];

  const sameTrackRaces = races
    .filter((r) => r.track === currentTrack)
    .sort((a, b) => a.race_number - b.race_number);

  const currentIdx = sameTrackRaces.findIndex((r) => r.race_id === currentRaceId);
  const prevRace = currentIdx > 0 ? sameTrackRaces[currentIdx - 1] : null;
  const nextRace = currentIdx < sameTrackRaces.length - 1 ? sameTrackRaces[currentIdx + 1] : null;

  const handleTrackClick = (track: string) => {
    if (track === currentTrack) return;
    const same = races.find((r) => r.track === track && r.race_number === currentRaceNumber);
    const first = races.find((r) => r.track === track);
    const target = same ?? first;
    if (target) router.push(`/races/upcoming/${target.race_id}`);
  };

  return (
    <div className="fixed top-14 left-0 w-full z-40 bg-[#131313] border-b border-white/10">
      {/* 会場タブ */}
      {tracks.length > 1 && (
        <div className="flex overflow-x-auto scrollbar-none border-b border-white/10">
          {tracks.map((track) => {
            const isActive = track === currentTrack;
            return (
              <button
                key={track}
                onClick={() => handleTrackClick(track)}
                className={`shrink-0 px-5 py-2 text-[12px] font-black tracking-wide transition-colors ${
                  isActive
                    ? "text-[var(--kaiko-primary)] border-b-2 border-[var(--kaiko-primary)]"
                    : "text-[var(--kaiko-text-muted)]"
                }`}
              >
                {track}
              </button>
            );
          })}
        </div>
      )}

      {/* レースナビ: 前後1R + 現在 */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <button
          onClick={() => prevRace && router.push(`/races/upcoming/${prevRace.race_id}`)}
          disabled={!prevRace}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors min-w-[64px] ${
            prevRace
              ? "bg-white/10 text-white"
              : "opacity-0 pointer-events-none"
          }`}
        >
          ← {prevRace ? `${prevRace.race_number}R` : ""}
        </button>

        <span className="text-[14px] font-black text-[var(--kaiko-primary)]">
          {currentRaceNumber}R
        </span>

        <button
          onClick={() => nextRace && router.push(`/races/upcoming/${nextRace.race_id}`)}
          disabled={!nextRace}
          className={`flex items-center justify-end gap-1 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-colors min-w-[64px] ${
            nextRace
              ? "bg-white/10 text-white"
              : "opacity-0 pointer-events-none"
          }`}
        >
          {nextRace ? `${nextRace.race_number}R` : ""} →
        </button>
      </div>
    </div>
  );
}
