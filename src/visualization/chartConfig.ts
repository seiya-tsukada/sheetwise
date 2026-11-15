import type { AggregationMethod, ChartSortOrder, ChartType } from '@/src/types/analysis';

export const CHART_PALETTE = [
  '#2563EB', // Cobalt Blue
  '#0EA5E9', // Sky Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#EC4899', // Rose
];

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: '折れ線グラフ',
  bar: '棒グラフ',
  grouped_bar: 'グループ化棒グラフ',
  pie: '円グラフ',
  scatter: '散布図',
  histogram: 'ヒストグラム',
};

export const AGGREGATION_LABELS: Record<AggregationMethod, string> = {
  SUM: '合計 (SUM)',
  AVG: '平均 (AVG)',
  COUNT: '件数 (COUNT)',
  MIN: '最小 (MIN)',
  MAX: '最大 (MAX)',
};

export const SORT_ORDER_LABELS: Record<ChartSortOrder, string> = {
  value_desc: '値が大きい順',
  value_asc: '値が小さい順',
  label_asc: 'ラベル昇順',
  label_desc: 'ラベル降順',
};

export function formatChartTick(value: unknown): string {
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  const str = String(value ?? '');
  return str.length > 14 ? `${str.slice(0, 13)}…` : str;
}

export function formatTooltipValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
  }
  return String(value ?? '');
}
