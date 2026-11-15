import type { QueryExecutor } from '@/src/lib/duckdb/types';
import {
  buildWhereClause,
  dateExpr,
  numericExpr,
  periodLabelExpr,
} from '@/src/lib/duckdb/queryBuilder';
import type {
  ColumnSchema,
  DataProfile,
  GlobalFilterState,
  TrendAnalysisResult,
  TrendPoint,
} from '@/src/types/analysis';

/**
 * 時系列ポイント列から前期間比・ピーク・トレンド方向を計算する（純粋関数）
 */
export function evaluateTrendPoints(
  dateColumn: string,
  metricColumn: string,
  granularity: 'day' | 'week' | 'month',
  points: TrendPoint[]
): TrendAnalysisResult {
  if (points.length === 0) {
    return {
      dateColumn,
      metricColumn,
      granularity,
      points: [],
      latestPeriod: null,
      previousPeriod: null,
      latestValue: null,
      previousValue: null,
      changeRate: null,
      peakPeriod: null,
      troughPeriod: null,
      direction: 'flat',
    };
  }

  let peak = points[0];
  let trough = points[0];
  for (const pt of points) {
    if (pt.value > peak.value) peak = pt;
    if (pt.value < trough.value) trough = pt;
  }

  const latest = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : null;

  let changeRate: number | null = null;
  let direction: TrendAnalysisResult['direction'] = 'flat';

  if (prev && prev.value !== 0) {
    changeRate = (latest.value - prev.value) / Math.abs(prev.value);
    if (changeRate >= 0.03) direction = 'up';
    else if (changeRate <= -0.03) direction = 'down';
  } else if (points.length >= 3) {
    const first = points[0];
    if (first.value !== 0) {
      const spanChange = (latest.value - first.value) / Math.abs(first.value);
      if (spanChange >= 0.05) direction = 'up';
      else if (spanChange <= -0.05) direction = 'down';
    }
  }

  return {
    dateColumn,
    metricColumn,
    granularity,
    points,
    latestPeriod: latest.period,
    previousPeriod: prev ? prev.period : null,
    latestValue: latest.value,
    previousValue: prev ? prev.value : null,
    changeRate,
    peakPeriod: { period: peak.period, value: peak.value },
    troughPeriod: { period: trough.period, value: trough.value },
    direction,
  };
}

/**
 * 日付カラムが存在する場合に時系列推移分析を実行する
 */
export async function analyzeTrends(
  executor: QueryExecutor,
  tableName: string,
  schema: ColumnSchema[],
  profile: DataProfile,
  filters?: GlobalFilterState
): Promise<TrendAnalysisResult[]> {
  const dateCols = schema.filter((c) => c.role === 'date');
  const metricCols = schema.filter((c) => c.role === 'metric').slice(0, 2);
  if (dateCols.length === 0 || metricCols.length === 0) return [];

  const primaryDateCol = dateCols[0];
  const dateProf = profile.dateProfiles[primaryDateCol.name];
  const granularity = dateProf?.recommendedGranularity ?? 'month';

  const dExpr = dateExpr(primaryDateCol.name, schema);
  const periodSql = periodLabelExpr(granularity, dExpr);

  const whereClause = buildWhereClause(filters, schema);
  const andPrefix = whereClause ? `${whereClause} AND` : 'WHERE';

  const results: TrendAnalysisResult[] = [];

  for (const metCol of metricCols) {
    const mExpr = numericExpr(metCol.name, schema);
    try {
      const rows = await executor.query<{
        period: string;
        val: number;
        cnt: number;
      }>(`
        SELECT
          ${periodSql} AS period,
          COALESCE(SUM(${mExpr}), 0) AS val,
          COUNT(*) AS cnt
        FROM "${tableName.replace(/"/g, '""')}"
        ${andPrefix} ${dExpr} IS NOT NULL
        GROUP BY 1
        ORDER BY 1 ASC
      `);

      const points: TrendPoint[] = rows.map((r) => ({
        period: String(r.period),
        value: Number(r.val),
        count: Number(r.cnt),
      }));

      if (points.length >= 2) {
        results.push(evaluateTrendPoints(primaryDateCol.name, metCol.name, granularity, points));
      }
    } catch {
      // ignore failed trend
    }
  }

  return results;
}
