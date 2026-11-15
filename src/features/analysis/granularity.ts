export type TimeGranularity = 'day' | 'week' | 'month';

export const DEFAULT_GRANULARITY: TimeGranularity = 'month';

/** グラフタイトル等で使う「日別 / 週別 / 月別」 */
export const GRANULARITY_LABELS: Record<TimeGranularity, string> = {
  day: '日別',
  week: '週別',
  month: '月別',
};

/** 集計説明文で使う「日次 / 週次 / 月次」 */
export const GRANULARITY_PERIOD_LABELS: Record<TimeGranularity, string> = {
  day: '日次',
  week: '週次',
  month: '月次',
};

/**
 * データ期間（日数）→ 推奨集計粒度 のルール表（上から順に評価）。
 * どれにも当てはまらなければ月次。
 */
const GRANULARITY_BY_SPAN: ReadonlyArray<{ maxSpanDays: number; granularity: TimeGranularity }> = [
  { maxSpanDays: 45, granularity: 'day' },
  { maxSpanDays: 180, granularity: 'week' },
];

export function recommendGranularity(spanDays: number): TimeGranularity {
  return (
    GRANULARITY_BY_SPAN.find((rule) => spanDays <= rule.maxSpanDays)?.granularity ??
    DEFAULT_GRANULARITY
  );
}
