import type { QueryExecutor } from '@/src/lib/duckdb/types';
import {
  buildWhereClause,
  escapeIdentifier,
  numericExpr,
} from '@/src/lib/duckdb/queryBuilder';
import type {
  CategoryMetricComparison,
  ColumnSchema,
  CorrelationResult,
  DataProfile,
  DistributionBiasResult,
  GlobalFilterState,
} from '@/src/types/analysis';

/**
 * 数値カラムの平均値と中央値の乖離から分布の偏りを評価する（純粋関数）
 */
export function evaluateDistributionBiases(profile: DataProfile): DistributionBiasResult[] {
  const results: DistributionBiasResult[] = [];

  for (const num of Object.values(profile.numericProfiles)) {
    if (
      num.mean === null ||
      num.median === null ||
      num.count < 5 ||
      num.stdDev === null ||
      num.stdDev === 0
    ) {
      continue;
    }

    const denom = Math.max(Math.abs(num.median), Math.abs(num.mean), 1e-9);
    const divergenceRatio = Math.abs(num.mean - num.median) / denom;

    if (divergenceRatio >= 0.15) {
      results.push({
        columnName: num.columnName,
        mean: num.mean,
        median: num.median,
        skewDirection: num.mean > num.median ? 'right' : 'left',
        divergenceRatio,
      });
    }
  }

  return results.sort((a, b) => b.divergenceRatio - a.divergenceRatio);
}

/**
 * 数値指標カラム間のピアソン相関係数をDuckDBで算出する
 */
export async function computeCorrelations(
  executor: QueryExecutor,
  tableName: string,
  schema: ColumnSchema[],
  filters?: GlobalFilterState
): Promise<CorrelationResult[]> {
  const metricCols = schema.filter((c) => c.role === 'metric').slice(0, 6);
  if (metricCols.length < 2) return [];

  const tbl = escapeIdentifier(tableName);
  const whereClause = buildWhereClause(filters, schema);
  const andPrefix = whereClause ? `${whereClause} AND` : 'WHERE';

  const correlations: CorrelationResult[] = [];

  for (let i = 0; i < metricCols.length; i++) {
    for (let j = i + 1; j < metricCols.length; j++) {
      const colA = metricCols[i];
      const colB = metricCols[j];
      const exprA = numericExpr(colA.name, schema);
      const exprB = numericExpr(colB.name, schema);

      try {
        const rows = await executor.query<{ r: number | null; n: number }>(`
          SELECT
            CORR(${exprA}, ${exprB}) AS r,
            COUNT(*) AS n
          FROM ${tbl}
          ${andPrefix} ${exprA} IS NOT NULL AND ${exprB} IS NOT NULL
        `);

        const rVal = rows[0]?.r;
        const nVal = Number(rows[0]?.n ?? 0);
        if (rVal === null || rVal === undefined || !Number.isFinite(Number(rVal)) || nVal < 5) {
          continue;
        }
        const pearsonR = Number(rVal);
        const absR = Math.abs(pearsonR);
        const strength: CorrelationResult['strength'] =
          absR >= 0.7 ? 'strong' : absR >= 0.45 ? 'moderate' : 'weak';

        correlations.push({
          columnA: colA.name,
          columnB: colB.name,
          pearsonR,
          strength,
          direction: pearsonR >= 0 ? 'positive' : 'negative',
          sampleSize: nVal,
        });
      } catch {
        // ignore individual pair failure
      }
    }
  }

  return correlations.sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR));
}

/**
 * カテゴリ別の数値指標集計（構成比・上位/下位カテゴリ比較）をDuckDBで算出する
 */
export async function computeCategoryComparisons(
  executor: QueryExecutor,
  tableName: string,
  schema: ColumnSchema[],
  profile: DataProfile,
  filters?: GlobalFilterState
): Promise<CategoryMetricComparison[]> {
  const catCols = schema
    .filter((c) => {
      if (c.role !== 'category') return false;
      const catProf = profile.categoryProfiles[c.name];
      const uniq = catProf?.uniqueCount ?? c.uniqueCount;
      return uniq >= 2 && uniq <= 40;
    })
    .slice(0, 2);

  const metricCols = schema.filter((c) => c.role === 'metric').slice(0, 2);
  if (catCols.length === 0 || metricCols.length === 0) return [];

  const tbl = escapeIdentifier(tableName);
  const whereClause = buildWhereClause(filters, schema);
  const comparisons: CategoryMetricComparison[] = [];

  for (const catCol of catCols) {
    const catIdent = escapeIdentifier(catCol.name);
    for (const metCol of metricCols) {
      const metProf = profile.numericProfiles[metCol.name];
      if (!metProf || metProf.sum === null || metProf.mean === null) continue;

      const metExpr = numericExpr(metCol.name, schema);

      try {
        const rows = await executor.query<{
          category: string;
          sum_v: number;
          mean_v: number;
          cnt: number;
        }>(`
          SELECT
            COALESCE(CAST(${catIdent} AS VARCHAR), '(欠損)') AS category,
            COALESCE(SUM(${metExpr}), 0) AS sum_v,
            COALESCE(AVG(${metExpr}), 0) AS mean_v,
            COUNT(*) AS cnt
          FROM ${tbl}
          ${whereClause}
          GROUP BY 1
          ORDER BY sum_v DESC
        `);

        if (rows.length < 2) continue;

        const overallSum = rows.reduce((acc, r) => acc + Number(r.sum_v), 0);
        const absSumDenom = overallSum > 0 ? overallSum : 1;

        const items = rows.map((r) => ({
          category: String(r.category),
          sum: Number(r.sum_v),
          mean: Number(r.mean_v),
          count: Number(r.cnt),
          share: overallSum > 0 ? Number(r.sum_v) / absSumDenom : 0,
        }));

        const top3Share = items.slice(0, 3).reduce((acc, item) => acc + item.share, 0);

        comparisons.push({
          categoryColumn: catCol.name,
          metricColumn: metCol.name,
          overallMean: metProf.mean,
          overallSum,
          top3Share,
          topItems: items.slice(0, 10),
          bottomItem: items[items.length - 1],
        });
      } catch {
        // ignore
      }
    }
  }

  return comparisons;
}
