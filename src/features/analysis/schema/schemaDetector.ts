import type { QueryExecutor } from '@/src/lib/duckdb/types';
import { escapeIdentifier } from '@/src/lib/duckdb/queryBuilder';
import type { ColumnRole, ColumnSchema, InferredDataType } from '@/src/types/analysis';

const ID_NAME_PATTERN =
  /(^|[_\-\s])(id|uuid|code|cd|key|no|num|serial|sku|番号|コード|キー|品番)([_\-\s]|$)|(id|番号|コード)$/i;

const METRIC_NAME_PATTERN =
  /(sales|amount|revenue|price|cost|profit|margin|qty|quantity|count|total|sum|avg|score|rate|ratio|weight|height|duration|salary|budget|spend|ad|click|impression|conversion|age|stock|inventory|売上|金額|単価|数量|利益|原価|広告|費用|コスト|スコア|年齢|在庫|給与|年収|時間|点数|評価|件数|アクセス|クリック)/i;

const DATE_VALUE_PATTERN =
  /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}([T\s]\d{1,2}:\d{2}(:\d{2})?)?|\d{4}[-/]\d{1,2})$/;

const NUMERIC_VALUE_PATTERN = /^-?[\d,]+(\.\d+)?$/;

export function mapDuckdbType(duckdbType: string): InferredDataType {
  const upper = duckdbType.toUpperCase();
  if (
    upper.includes('INT') ||
    upper.includes('BIGINT') ||
    upper.includes('SMALLINT') ||
    upper.includes('TINYINT') ||
    upper.includes('HUGEINT')
  ) {
    return 'Integer';
  }
  if (
    upper.includes('DOUBLE') ||
    upper.includes('FLOAT') ||
    upper.includes('DECIMAL') ||
    upper.includes('NUMERIC') ||
    upper.includes('REAL')
  ) {
    return 'Float';
  }
  if (upper.includes('BOOL')) {
    return 'Boolean';
  }
  if (upper === 'DATE') {
    return 'Date';
  }
  if (upper.includes('TIMESTAMP') || upper.includes('TIME')) {
    return 'Timestamp';
  }
  if (upper.includes('VARCHAR') || upper.includes('TEXT') || upper.includes('CHAR')) {
    return 'String';
  }
  return 'Unknown';
}

/**
 * カラムの型・名称・カーディナリティから分析上の役割を推定する（純粋関数）
 */
export function inferColumnRole(input: {
  name: string;
  dataType: InferredDataType;
  rowCount: number;
  uniqueCount: number;
  uniqueRate: number;
  isDateCoercible?: boolean;
  isNumericCoercible?: boolean;
}): ColumnRole {
  const { name, dataType, rowCount, uniqueCount, uniqueRate, isDateCoercible, isNumericCoercible } =
    input;

  if (dataType === 'Date' || dataType === 'Timestamp' || isDateCoercible) {
    return 'date';
  }

  if (dataType === 'Boolean') {
    return 'boolean';
  }

  const looksLikeIdByName = ID_NAME_PATTERN.test(name.trim());
  const looksLikeMetricByName = METRIC_NAME_PATTERN.test(name.trim());

  if (looksLikeIdByName && !looksLikeMetricByName) {
    return 'id';
  }

  if (dataType === 'Integer' || dataType === 'Float' || isNumericCoercible) {
    // 整数でほぼ全行ユニーク（かつ行数10件以上）で、明確な指標名でない場合はID候補とみなす
    if (
      dataType === 'Integer' &&
      rowCount >= 10 &&
      uniqueRate >= 0.96 &&
      !looksLikeMetricByName
    ) {
      return 'id';
    }
    // 2値のみの整数フラグ（0/1等）で指標名でない場合
    if (dataType === 'Integer' && uniqueCount <= 2 && !looksLikeMetricByName) {
      return 'boolean';
    }
    return 'metric';
  }

  if (dataType === 'String') {
    if (looksLikeIdByName) {
      return 'id';
    }
    if (uniqueCount <= 2 && rowCount >= 5) {
      return 'boolean';
    }
    // 高カーディナリティ文字列（行数の85%以上ユニークかつ20種以上）はIDまたは自由テキスト
    if (rowCount >= 10 && uniqueRate >= 0.85 && uniqueCount >= 20) {
      return uniqueRate >= 0.98 && !/\s/.test(name) ? 'id' : 'text';
    }
    if (uniqueCount > 60 && uniqueRate > 0.5) {
      return 'text';
    }
    return 'category';
  }

  return 'category';
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
    const ident = escapeIdentifier(col.name);
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
      nullCount = 0;
      uniqueCount = 0;
    }

    try {
      const sampleRows = await executor.query<{ val: unknown }>(`
        SELECT DISTINCT CAST(${ident} AS VARCHAR) AS val
        FROM ${tbl}
        WHERE ${ident} IS NOT NULL
        LIMIT 8
      `);
      sampleValues = sampleRows
        .map((r) => (r.val === null || r.val === undefined ? '' : String(r.val)))
        .filter((v) => v.length > 0);
    } catch {
      sampleValues = [];
    }

    let dataType = mapDuckdbType(col.type);
    let isDateCoercible = false;
    let isNumericCoercible = false;

    // 文字列カラムでも日付や数値として変換可能かチェックする
    if (dataType === 'String' && sampleValues.length > 0) {
      const nonEmptySamples = sampleValues.filter((v) => v.trim().length > 0);
      if (
        nonEmptySamples.length > 0 &&
        nonEmptySamples.every((v) => DATE_VALUE_PATTERN.test(v.trim()))
      ) {
        try {
          const dateCheck = await executor.query<{ valid_cnt: number; non_null_cnt: number }>(`
            SELECT
              COUNT(TRY_CAST(REPLACE(CAST(${ident} AS VARCHAR), '/', '-') AS TIMESTAMP)) AS valid_cnt,
              COUNT(${ident}) AS non_null_cnt
            FROM ${tbl}
          `);
          const validCnt = Number(dateCheck[0]?.valid_cnt ?? 0);
          const nonNullCnt = Number(dateCheck[0]?.non_null_cnt ?? 0);
          if (nonNullCnt > 0 && validCnt / nonNullCnt >= 0.85) {
            isDateCoercible = true;
            dataType = 'Date';
          }
        } catch {
          // ignore
        }
      } else if (
        nonEmptySamples.length > 0 &&
        nonEmptySamples.every((v) => NUMERIC_VALUE_PATTERN.test(v.trim()))
      ) {
        try {
          const numCheck = await executor.query<{ valid_cnt: number; non_null_cnt: number }>(`
            SELECT
              COUNT(TRY_CAST(REPLACE(CAST(${ident} AS VARCHAR), ',', '') AS DOUBLE)) AS valid_cnt,
              COUNT(${ident}) AS non_null_cnt
            FROM ${tbl}
          `);
          const validCnt = Number(numCheck[0]?.valid_cnt ?? 0);
          const nonNullCnt = Number(numCheck[0]?.non_null_cnt ?? 0);
          if (nonNullCnt > 0 && validCnt / nonNullCnt >= 0.85) {
            isNumericCoercible = true;
            dataType = 'Float';
          }
        } catch {
          // ignore
        }
      }
    }

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
      sampleValues: sampleValues.slice(0, 4),
      isDateCoercible,
      isNumericCoercible,
    });
  }

  return schemas;
}
