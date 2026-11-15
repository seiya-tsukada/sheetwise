/** 桁の大きい値を短縮表記する単位（大きい順に評価） */
const COMPACT_UNITS: ReadonlyArray<{ threshold: number; suffix: string }> = [
  { threshold: 1_000_000_000, suffix: 'B' },
  { threshold: 1_000_000, suffix: 'M' },
];

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const unit = COMPACT_UNITS.find((u) => Math.abs(value) >= u.threshold);
  if (unit) {
    return `${(value / unit.threshold).toFixed(2)}${unit.suffix}`;
  }
  return Number.isInteger(value)
    ? value.toLocaleString('ja-JP')
    : value.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
}
