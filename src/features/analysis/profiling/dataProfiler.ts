import { recommendGranularity } from '../granularity';
import type { QueryExecutor } from '@/src/lib/duckdb/types';
import {
  buildWhereClause,
  dateExpr,
  escapeIdentifier,
  numericExpr,
} from '@/src/lib/duckdb/queryBuilder';
import type {
  CategoryColumnProfile,
  ColumnSchema,
  DataProfile,
  DateColumnProfile,
  GlobalFilterState,
  NumericColumnProfile,
} from '@/src/types/analysis';

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export async function profileDataset(
  executor: QueryExecutor,
  tableName: string,
  schema: ColumnSchema[],
  filters?: GlobalFilterState
): Promise<DataProfile> {
  const tbl = escapeIdentifier(tableName);
  const whereClause = buildWhereClause(filters, schema);
  const andPrefix = whereClause ? `${whereClause} AND` : 'WHERE';

  // 総レコード数 & フィルター適用後レコード数
  const totalRes = await executor.query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM ${tbl}`);
  const totalRows = Number(totalRes[0]?.cnt ?? 0);

  const filteredRes = await executor.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM ${tbl} ${whereClause}`
  );
  const filteredRows = Number(filteredRes[0]?.cnt ?? 0);

  // 重複レコード数
  let duplicateRows = 0;
  if (schema.length > 0 && filteredRows > 0) {
    try {
      const allCols = schema.map((c) => escapeIdentifier(c.name)).join(', ');
      const dupRes = await executor.query<{ dup_cnt: number }>(`
        SELECT COALESCE(SUM(cnt - 1), 0) AS dup_cnt
        FROM (
          SELECT COUNT(*) AS cnt
          FROM ${tbl}
          ${whereClause}
          GROUP BY ${allCols}
          HAVING COUNT(*) > 1
        ) t
      `);
      duplicateRows = Number(dupRes[0]?.dup_cnt ?? 0);
    } catch {
      duplicateRows = 0;
    }
  }

  // NULLを含むカラム数（フィルター後）
  let columnsWithNulls = 0;
  for (const col of schema) {
    try {
      const ident = escapeIdentifier(col.name);
      const res = await executor.query<{ null_cnt: number }>(
        `SELECT COUNT(*) - COUNT(${ident}) AS null_cnt FROM ${tbl} ${whereClause}`
      );
      if (Number(res[0]?.null_cnt ?? 0) > 0) {
        columnsWithNulls++;
      }
    } catch {
      // ignore
    }
  }

  // 数値カラムのプロファイリング
  const numericProfiles: Record<string, NumericColumnProfile> = {};
  const numericCols = schema.filter(
    (c) => c.role === 'metric' || (c.dataType === 'Integer' && c.role !== 'id') || c.dataType === 'Float'
  );

  for (const col of numericCols) {
    try {
      const expr = numericExpr(col.name, schema);
      const statRows = await executor.query<{
        cnt: number;
        min_v: number | null;
        max_v: number | null;
        mean_v: number | null;
        median_v: number | null;
        sum_v: number | null;
        std_v: number | null;
        q1_v: number | null;
        q3_v: number | null;
      }>(`
        SELECT
          COUNT(${expr}) AS cnt,
          MIN(${expr}) AS min_v,
          MAX(${expr}) AS max_v,
          AVG(${expr}) AS mean_v,
          MEDIAN(${expr}) AS median_v,
          SUM(${expr}) AS sum_v,
          STDDEV_SAMP(${expr}) AS std_v,
          QUANTILE_CONT(${expr}, 0.25) AS q1_v,
          QUANTILE_CONT(${expr}, 0.75) AS q3_v
        FROM ${tbl}
        ${andPrefix} ${expr} IS NOT NULL
      `);

      const row = statRows[0];
      const q1 = toNullableNumber(row?.q1_v);
      const q3 = toNullableNumber(row?.q3_v);
      const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;

      let outlierCount = 0;
      if (iqr !== null && iqr > 0 && q1 !== null && q3 !== null) {
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        const outRes = await executor.query<{ out_cnt: number }>(`
          SELECT COUNT(*) AS out_cnt
          FROM ${tbl}
          ${andPrefix} (${expr} < ${lower} OR ${expr} > ${upper})
        `);
        outlierCount = Number(outRes[0]?.out_cnt ?? 0);
      }

      numericProfiles[col.name] = {
        columnName: col.name,
        count: Number(row?.cnt ?? 0),
        min: toNullableNumber(row?.min_v),
        max: toNullableNumber(row?.max_v),
        mean: toNullableNumber(row?.mean_v),
        median: toNullableNumber(row?.median_v),
        sum: toNullableNumber(row?.sum_v),
        stdDev: toNullableNumber(row?.std_v),
        q1,
        q3,
        iqr,
        outlierCount,
      };
    } catch {
      // ignore failed numeric profiling for individual column
    }
  }

  // カテゴリカラムのプロファイリング
  const categoryProfiles: Record<string, CategoryColumnProfile> = {};
  const catCols = schema.filter((c) => c.role === 'category' || c.role === 'boolean');

  for (const col of catCols) {
    try {
      const ident = escapeIdentifier(col.name);
      const uniqRes = await executor.query<{ uniq_cnt: number }>(
        `SELECT COUNT(DISTINCT ${ident}) AS uniq_cnt FROM ${tbl} ${whereClause}`
      );
      const uniqueCount = Number(uniqRes[0]?.uniq_cnt ?? 0);

      const topRows = await executor.query<{ val: string; cnt: number }>(`
        SELECT
          COALESCE(CAST(${ident} AS VARCHAR), '(欠損)') AS val,
          COUNT(*) AS cnt
        FROM ${tbl}
        ${whereClause}
        GROUP BY 1
        ORDER BY cnt DESC
        LIMIT 12
      `);

      const denom = Math.max(1, filteredRows);
      categoryProfiles[col.name] = {
        columnName: col.name,
        uniqueCount,
        topCategories: topRows.map((r) => ({
          value: String(r.val),
          count: Number(r.cnt),
          ratio: Number(r.cnt) / denom,
        })),
      };
    } catch {
      // ignore
    }
  }

  // 日付カラムのプロファイリング
  const dateProfiles: Record<string, DateColumnProfile> = {};
  const dateCols = schema.filter((c) => c.role === 'date');

  for (const col of dateCols) {
    try {
      const dExpr = dateExpr(col.name, schema);
      const res = await executor.query<{
        min_d: string | null;
        max_d: string | null;
        span_days: number | null;
      }>(`
        SELECT
          STRFTIME(MIN(${dExpr}), '%Y-%m-%d') AS min_d,
          STRFTIME(MAX(${dExpr}), '%Y-%m-%d') AS max_d,
          DATE_DIFF('day', MIN(${dExpr}), MAX(${dExpr})) AS span_days
        FROM ${tbl}
        ${andPrefix} ${dExpr} IS NOT NULL
      `);

      const row = res[0];
      const spanDays = Math.max(0, Number(row?.span_days ?? 0));
      const recommendedGranularity = recommendGranularity(spanDays);

      dateProfiles[col.name] = {
        columnName: col.name,
        minDate: row?.min_d ? String(row.min_d) : null,
        maxDate: row?.max_d ? String(row.max_d) : null,
        spanDays,
        recommendedGranularity,
      };
    } catch {
      // ignore
    }
  }

  // 全体警告サマリー
  const warnings: string[] = [];
  if (duplicateRows > 0) {
    warnings.push(`${duplicateRows.toLocaleString()}件の重複レコードが含まれています`);
  }
  if (columnsWithNulls > 0) {
    warnings.push(`${columnsWithNulls}個のカラムに欠損値（NULL）が含まれています`);
  }
  const outlierCols = Object.values(numericProfiles).filter((p) => p.outlierCount > 0);
  if (outlierCols.length > 0) {
    warnings.push(`${outlierCols.length}個の数値カラムで外れ値候補が検出されました`);
  }

  return {
    overview: {
      totalRows,
      filteredRows,
      totalColumns: schema.length,
      columnsWithNulls,
      duplicateRows,
      warnings,
    },
    numericProfiles,
    categoryProfiles,
    dateProfiles,
  };
}
