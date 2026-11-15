import type { QueryExecutor } from '@/src/lib/duckdb/types';
import { dateExpr, escapeIdentifier, numericExpr } from '@/src/lib/duckdb/queryBuilder';
import type { ColumnSchema, InferredDataType } from '@/src/types/analysis';
import { inferColumnRole } from './roleRules';
import { mapDuckdbType } from './typeRules';

export { COLUMN_ROLE_RULES, ROLE_THRESHOLDS, inferColumnRole } from './roleRules';
export { DUCKDB_TYPE_RULES, mapDuckdbType } from './typeRules';

const SAMPLE_QUERY_LIMIT = 8;
const SAMPLE_KEEP_COUNT = 4;

/**
 * 文字列カラムを別の型へ昇格させるルール表。
 * サンプル値すべてが `samplePattern` に一致した最初のルールだけを
 * DuckDB 上で検証し、変換成功率が `minValidRatio` 以上なら採用する。
 */
interface CoercionRule {
  kind: 'date' | 'numeric';
  samplePattern: RegExp;
  /** 変換を試みる SQL 式（列名から生成） */
  castExpr: (columnName: string) => string;
  promotedType: InferredDataType;
  minValidRatio: number;
}

export const STRING_COERCION_RULES: readonly CoercionRule[] = [
  {
    kind: 'date',
    samplePattern: /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}([T\s]\d{1,2}:\d{2}(:\d{2})?)?|\d{4}[-/]\d{1,2})$/,
    castExpr: (name) => dateExpr(name),
    promotedType: 'Date',
    minValidRatio: 0.85,
  },
  {
    kind: 'numeric',
    samplePattern: /^-?[\d,]+(\.\d+)?$/,
    castExpr: (name) => numericExpr(name),
    promotedType: 'Float',
    minValidRatio: 0.85,
  },
];

interface ColumnBasics {
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
}

async function fetchColumnBasics(
  executor: QueryExecutor,
  tbl: string,
  ident: string
): Promise<ColumnBasics> {
  let nullCount = 0;
  let uniqueCount = 0;
  let sampleValues: string[] = [];

  try {
    const statRows = await executor.query<{ null_cnt: number; uniq_cnt: number }>(`
      SELECT
        COUNT(*) - COUNT(${ident}) AS null_cnt,
        COUNT(DISTINCT ${ident}) AS uniq_cnt
      FROM ${tbl}
    `);
    nullCount = Number(statRows[0]?.null_cnt ?? 0);
    uniqueCount = Number(statRows[0]?.uniq_cnt ?? 0);
  } catch {
    // 統計取得に失敗した場合は 0 のまま扱う
  }

  try {
    const sampleRows = await executor.query<{ val: unknown }>(`
      SELECT DISTINCT CAST(${ident} AS VARCHAR) AS val
      FROM ${tbl}
      WHERE ${ident} IS NOT NULL
      LIMIT ${SAMPLE_QUERY_LIMIT}
    `);
    sampleValues = sampleRows
      .map((r) => (r.val === null || r.val === undefined ? '' : String(r.val)))
      .filter((v) => v.length > 0);
  } catch {
    // サンプル取得に失敗した場合は空のまま扱う
  }

  return { nullCount, uniqueCount, sampleValues };
}

/**
 * 文字列カラムがサンプル的に日付/数値らしければ、DuckDB で変換成功率を検証して型を昇格する
 */
async function detectStringCoercion(
  executor: QueryExecutor,
  tbl: string,
  columnName: string,
  sampleValues: string[]
): Promise<CoercionRule | null> {
  const samples = sampleValues.map((v) => v.trim()).filter((v) => v.length > 0);
  if (samples.length === 0) return null;

  // サンプルに一致した最初のルールのみ検証する（日付に見える列を数値として再検証しない）
  const rule = STRING_COERCION_RULES.find((r) => samples.every((v) => r.samplePattern.test(v)));
  if (!rule) return null;

  try {
    const rows = await executor.query<{ valid_cnt: number; non_null_cnt: number }>(`
      SELECT
        COUNT(${rule.castExpr(columnName)}) AS valid_cnt,
        COUNT(${escapeIdentifier(columnName)}) AS non_null_cnt
      FROM ${tbl}
    `);
    const validCnt = Number(rows[0]?.valid_cnt ?? 0);
    const nonNullCnt = Number(rows[0]?.non_null_cnt ?? 0);
    return nonNullCnt > 0 && validCnt / nonNullCnt >= rule.minValidRatio ? rule : null;
  } catch {
    return null;
  }
}

export async function detectSchema(
  executor: QueryExecutor,
  tableName: string
): Promise<ColumnSchema[]> {
  const columns = await executor.getTableColumns(tableName);
  const tbl = escapeIdentifier(tableName);

  const countRows = await executor.query<{ total_rows: number }>(
    `SELECT COUNT(*) AS total_rows FROM ${tbl}`
  );
  const totalRows = Number(countRows[0]?.total_rows ?? 0);

  const schemas: ColumnSchema[] = [];

  for (const col of columns) {
    const { nullCount, uniqueCount, sampleValues } = await fetchColumnBasics(
      executor,
      tbl,
      escapeIdentifier(col.name)
    );

    const baseType = mapDuckdbType(col.type);
    const coercion =
      baseType === 'String'
        ? await detectStringCoercion(executor, tbl, col.name, sampleValues)
        : null;

    const dataType = coercion?.promotedType ?? baseType;
    const isDateCoercible = coercion?.kind === 'date';
    const isNumericCoercible = coercion?.kind === 'numeric';

    const nullRate = totalRows > 0 ? nullCount / totalRows : 0;
    const nonNullRows = Math.max(0, totalRows - nullCount);
    const uniqueRate = nonNullRows > 0 ? uniqueCount / nonNullRows : 0;

    const role = inferColumnRole({
      name: col.name,
      dataType,
      rowCount: totalRows,
      uniqueCount,
      uniqueRate,
      isDateCoercible,
      isNumericCoercible,
    });

    schemas.push({
      name: col.name,
      duckdbType: col.type,
      dataType,
      role,
      rowCount: totalRows,
      nullCount,
      nullRate,
      uniqueCount,
      uniqueRate,
      sampleValues: sampleValues.slice(0, SAMPLE_KEEP_COUNT),
      isDateCoercible,
      isNumericCoercible,
    });
  }

  return schemas;
}
