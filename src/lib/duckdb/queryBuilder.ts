import type {
  ColumnSchema,
  GlobalFilterState,
  TableQueryParams,
} from '@/src/types/analysis';

/**
 * SQL識別子をダブルクォートで安全にエスケープする
 */
export function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * SQL文字列リテラルをシングルクォートで安全にエスケープする
 */
export function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 内部テーブル名用のサニタイズ済み識別子を生成する
 */
export function generateSafeTableName(prefix = 'csv_data'): string {
  const sanitizedPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24) || 'csv_data';
  const rand = Math.random().toString(36).slice(2, 8);
  return `${sanitizedPrefix}_${Date.now()}_${rand}`;
}

/**
 * カラムが数値として扱えるSQL式を返す（文字列型でも数値変換可能な場合を考慮）
 */
export function numericExpr(colName: string, schema?: ColumnSchema[]): string {
  const col = schema?.find((c) => c.name === colName);
  const ident = escapeIdentifier(colName);
  if (col && (col.dataType === 'Integer' || col.dataType === 'Float')) {
    return `CAST(${ident} AS DOUBLE)`;
  }
  return `TRY_CAST(REPLACE(CAST(${ident} AS VARCHAR), ',', '') AS DOUBLE)`;
}

/**
 * カラムが日付/日時として扱えるSQL式を返す
 */
export function dateExpr(colName: string, schema?: ColumnSchema[]): string {
  const col = schema?.find((c) => c.name === colName);
  const ident = escapeIdentifier(colName);
  if (col && (col.dataType === 'Date' || col.dataType === 'Timestamp')) {
    return `CAST(${ident} AS TIMESTAMP)`;
  }
  return `TRY_CAST(REPLACE(CAST(${ident} AS VARCHAR), '/', '-') AS TIMESTAMP)`;
}

/**
 * 時系列集計の粒度ごとの DATE_TRUNC 単位と表示フォーマット
 */
const PERIOD_FORMATS = {
  day: { unit: 'day', format: '%Y-%m-%d' },
  week: { unit: 'week', format: '%Y-%m-%d' },
  month: { unit: 'month', format: '%Y-%m' },
} as const;

/**
 * 日付式を粒度で丸めた期間ラベル（文字列）のSQL式を返す。未指定・不明な粒度は月次。
 */
export function periodLabelExpr(granularity: string | undefined, dateSqlExpr: string): string {
  const { unit, format } =
    PERIOD_FORMATS[granularity as keyof typeof PERIOD_FORMATS] ?? PERIOD_FORMATS.month;
  return `STRFTIME(DATE_TRUNC('${unit}', ${dateSqlExpr}), '${format}')`;
}

/**
 * GlobalFilterState から WHERE 句（"WHERE ..." または空文字）を構築する
 */
export function buildWhereClause(
  filters: GlobalFilterState | undefined,
  schema: ColumnSchema[],
  tableParams?: Pick<TableQueryParams, 'search' | 'columnFilters'>
): string {
  const conditions: string[] = [];
  const validColumns = new Set(schema.map((c) => c.name));

  if (filters) {
    // カテゴリフィルター
    for (const [colName, selectedValues] of Object.entries(filters.categoryFilters)) {
      if (!validColumns.has(colName) || !selectedValues || selectedValues.length === 0) {
        continue;
      }
      const ident = escapeIdentifier(colName);
      const hasNullToken = selectedValues.includes('__NULL__');
      const nonNullValues = selectedValues.filter((v) => v !== '__NULL__');

      const parts: string[] = [];
      if (nonNullValues.length > 0) {
        const list = nonNullValues.map((v) => escapeLiteral(v)).join(', ');
        parts.push(`CAST(${ident} AS VARCHAR) IN (${list})`);
      }
      if (hasNullToken) {
        parts.push(`${ident} IS NULL`);
      }
      if (parts.length > 0) {
        conditions.push(`(${parts.join(' OR ')})`);
      }
    }

    // 日付期間フィルター
    if (filters.dateFilter && validColumns.has(filters.dateFilter.column)) {
      const expr = dateExpr(filters.dateFilter.column, schema);
      if (filters.dateFilter.start) {
        conditions.push(`${expr} >= TRY_CAST(${escapeLiteral(filters.dateFilter.start)} AS TIMESTAMP)`);
      }
      if (filters.dateFilter.end) {
        // 終了日は当日23:59:59まで含める
        conditions.push(
          `${expr} < (TRY_CAST(${escapeLiteral(filters.dateFilter.end)} AS TIMESTAMP) + INTERVAL '1 day')`
        );
      }
    }

    // 数値範囲フィルター
    if (filters.numericFilter && validColumns.has(filters.numericFilter.column)) {
      const expr = numericExpr(filters.numericFilter.column, schema);
      if (
        filters.numericFilter.min !== undefined &&
        Number.isFinite(filters.numericFilter.min)
      ) {
        conditions.push(`${expr} >= ${filters.numericFilter.min}`);
      }
      if (
        filters.numericFilter.max !== undefined &&
        Number.isFinite(filters.numericFilter.max)
      ) {
        conditions.push(`${expr} <= ${filters.numericFilter.max}`);
      }
    }
  }

  // データテーブル検索・カラム個別フィルター
  if (tableParams) {
    const trimmedSearch = tableParams.search.trim();
    if (trimmedSearch.length > 0 && schema.length > 0) {
      const likePattern = escapeLiteral(`%${trimmedSearch.replace(/[%_\\]/g, '\\$&')}%`);
      const orClauses = schema.map(
        (col) => `COALESCE(CAST(${escapeIdentifier(col.name)} AS VARCHAR), '') ILIKE ${likePattern} ESCAPE '\\'`
      );
      conditions.push(`(${orClauses.join(' OR ')})`);
    }

    for (const [colName, filterVal] of Object.entries(tableParams.columnFilters || {})) {
      const trimmed = filterVal.trim();
      if (!trimmed || !validColumns.has(colName)) continue;
      const likePattern = escapeLiteral(`%${trimmed.replace(/[%_\\]/g, '\\$&')}%`);
      conditions.push(
        `COALESCE(CAST(${escapeIdentifier(colName)} AS VARCHAR), '') ILIKE ${likePattern} ESCAPE '\\'`
      );
    }
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * データテーブルのページネーション取得用SQLと件数取得SQLを生成する
 */
export function buildTableQueries(
  tableName: string,
  schema: ColumnSchema[],
  filters: GlobalFilterState | undefined,
  params: TableQueryParams
): { rowsSql: string; countSql: string } {
  const tbl = escapeIdentifier(tableName);
  const whereClause = buildWhereClause(filters, schema, params);
  const validColumns = new Set(schema.map((c) => c.name));

  let orderClause = '';
  if (params.sortColumn && validColumns.has(params.sortColumn)) {
    const dir = params.sortDirection === 'desc' ? 'DESC' : 'ASC';
    orderClause = `ORDER BY ${escapeIdentifier(params.sortColumn)} ${dir} NULLS LAST`;
  }

  const pageSize = Math.max(1, Math.min(200, Math.floor(params.pageSize)));
  const offset = Math.max(0, (Math.max(1, Math.floor(params.page)) - 1) * pageSize);

  const countSql = `SELECT COUNT(*) AS cnt FROM ${tbl} ${whereClause}`.trim();
  const rowsSql = `SELECT * FROM ${tbl} ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`.trim();

  return { rowsSql, countSql };
}
