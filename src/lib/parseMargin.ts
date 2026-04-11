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
 * レース内の全馬データから「1着からの累積馬身差」マップを構築する
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
