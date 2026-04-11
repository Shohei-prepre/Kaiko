/**
 * netkeiba の着差テキストを馬身数値に変換する
 * 1着は margin="" (空文字) → 0
 */
const MARGIN_MAP: Record<string, number> = {
  "":       0,
  "ハナ":   0.05,
  "クビ":   0.1,
  "アタマ": 0.2,
  "1/2":    0.5,
  "3/4":    0.75,
  "1":      1.0,
  "1.1/4":  1.25,
  "1.1/2":  1.5,
  "1.3/4":  1.75,
  "2":      2.0,
  "2.1/2":  2.5,
  "3":      3.0,
  "4":      4.0,
  "5":      5.0,
  "6":      6.0,
  "7":      7.0,
  "8":      8.0,
  "9":      9.0,
  "10":     10.0,
  "大":     10.0,
};

export function parseMarginText(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.trim();
  if (t in MARGIN_MAP) return MARGIN_MAP[t];
  // 整数・小数のフォールバック
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

/**
 * レース内の全馬データから「1着からの累積馬身差」マップを構築する（着差テキスト版）
 * perfs: 同一レースの全馬 { horse_id, finish_order, margin } を finish_order 昇順で渡す
 * 返り値: horse_id → 1着からの累積馬身差（1着=0）
 */
export function buildCumulativeMargins(
  perfs: { horse_id: number; finish_order: number; margin: string | null }[]
): Map<number, number> {
  const sorted = [...perfs].sort((a, b) => a.finish_order - b.finish_order);
  const result = new Map<number, number>();
  let cumulative = 0;
  for (const p of sorted) {
    if (p.finish_order === 1) {
      result.set(p.horse_id, 0);
    } else {
      cumulative += parseMarginText(p.margin);
      result.set(p.horse_id, cumulative);
    }
  }
  return result;
}

/**
 * 複数レースの全馬 perf から「race_id → horse_id → 1着からの累積馬身差」を構築する（数値margin版）
 * DBの horse_performances.margin（number | null）を直接使う。
 * 返り値: Map<race_id, Map<horse_id, cumulative_margin>>（1着=0）
 */
export function buildRaceMarginMaps(
  perfs: { horse_id: number; race_id: string; finish_order: number; margin: number | null }[]
): Map<string, Map<number, number>> {
  const byRace = new Map<string, typeof perfs>();
  for (const p of perfs) {
    if (!byRace.has(p.race_id)) byRace.set(p.race_id, []);
    byRace.get(p.race_id)!.push(p);
  }
  const result = new Map<string, Map<number, number>>();
  for (const [raceId, racePerfs] of byRace.entries()) {
    const sorted = [...racePerfs].sort((a, b) => a.finish_order - b.finish_order);
    const horseMap = new Map<number, number>();
    let cum = 0;
    for (const p of sorted) {
      if (p.finish_order === 1) {
        horseMap.set(p.horse_id, 0);
      } else {
        const m = p.margin;
        cum += (m !== null && Number.isFinite(m)) ? m : 0;
        horseMap.set(p.horse_id, cum);
      }
    }
    result.set(raceId, horseMap);
  }
  return result;
}
