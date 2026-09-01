/** Thai baht formatter. Shared so the board, analytics, and signals agree. */
export function formatBaht(n: number | null | undefined): string {
  if (n == null) return '฿0';
  return '฿' + Math.round(n).toLocaleString('en-US');
}

/**
 * Sum non-null deal.value per workflow lane (folk-style "total per stage").
 * Mirrors the board's grouping so the header rollups stay consistent with the cards.
 */
export function sumLaneValues(
  lanes: { id: string }[],
  byAction: Record<string, { value: number | null }[]>
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const lane of lanes) {
    const deals = byAction[lane.id] || [];
    sums[lane.id] = deals.reduce((acc, d) => acc + (d.value || 0), 0);
  }
  return sums;
}
