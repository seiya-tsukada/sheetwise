import type {
  AggregationMethod,
  ChartConfig,
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

function aggregationSql(agg: AggregationMethod, expr: string): string {
  switch (agg) {
    case 'SUM':
      return `COALESCE(SUM(${expr}), 0)`;
    case 'AVG':
      return `AVG(${expr})`;
    case 'COUNT':
      return `COUNT(${expr})`;
    case 'MIN':
      return `MIN(${expr})`;
    case 'MAX':
      return `MAX(${expr})`;
  }
}

/**
 * グラフ設定から集計用SQLクエリを生成する
 */
export function buildChartQuery(
  tableName: string,
  config: ChartConfig,
  schema: ColumnSchema[],
  filters?: GlobalFilterState
): string {
  const tbl = escapeIdentifier(tableName);
  const whereClause = buildWhereClause(filters, schema);
  const andPrefix = whereClause ? `${whereClause} AND` : 'WHERE';
  const safeLimit = Math.max(1, Math.min(500, Math.floor(config.limit || 20)));

  const xCol = schema.find((c) => c.name === config.xAxis);
  const xIdent = escapeIdentifier(config.xAxis);

  // ヒストグラム
  if (config.type === 'histogram') {
    const valExpr = numericExpr(config.xAxis, schema);
    const bins = Math.min(20, Math.max(5, safeLimit));
    return `
      WITH stats AS (
        SELECT MIN(${valExpr}) AS min_v, MAX(${valExpr}) AS max_v
        FROM ${tbl}
        ${andPrefix} ${valExpr} IS NOT NULL
      ),
      binned AS (
        SELECT
          CASE
            WHEN s.max_v = s.min_v THEN 0
            ELSE LEAST(${bins - 1}, GREATEST(0, FLOOR((${valExpr} - s.min_v) / ((s.max_v - s.min_v) / ${bins}))))
          END AS bin_idx,
          s.min_v,
          s.max_v
        FROM ${tbl}, stats s
        ${andPrefix} ${valExpr} IS NOT NULL
      )
      SELECT
        CAST(bin_idx AS INTEGER) AS bin_idx,
        CASE
          WHEN MIN(max_v) = MIN(min_v) THEN CAST(ROUND(MIN(min_v), 2) AS VARCHAR)
          ELSE CONCAT(
            CAST(ROUND(MIN(min_v) + bin_idx * ((MIN(max_v) - MIN(min_v)) / ${bins}), 1) AS VARCHAR),
            ' - ',
            CAST(ROUND(MIN(min_v) + (bin_idx + 1) * ((MIN(max_v) - MIN(min_v)) / ${bins}), 1) AS VARCHAR)
          )
        END AS x_label,
        COUNT(*) AS y_value
      FROM binned
      GROUP BY bin_idx
      ORDER BY bin_idx ASC
    `.trim();
  }

  // 散布図 (サンプリングして最大300点)
  if (config.type === 'scatter') {
    const xNum = numericExpr(config.xAxis, schema);
    const yNum = numericExpr(config.yAxis, schema);
    const scatterLimit = Math.min(300, Math.max(50, safeLimit));
    return `
      SELECT
        ${xNum} AS x_value,
        ${yNum} AS y_value
      FROM ${tbl}
      ${andPrefix} ${xNum} IS NOT NULL AND ${yNum} IS NOT NULL
      LIMIT ${scatterLimit}
    `.trim();
  }

  // グループ化棒グラフ (Category x SecondaryCategory x Metric)
  if (config.type === 'grouped_bar' && config.groupBy) {
    const yExpr =
      config.aggregation === 'COUNT'
        ? config.yAxis === '*'
          ? '*'
          : escapeIdentifier(config.yAxis)
        : numericExpr(config.yAxis, schema);
    const aggSql = aggregationSql(config.aggregation, yExpr);
    const gIdent = escapeIdentifier(config.groupBy);

    return `
      WITH top_x AS (
        SELECT COALESCE(CAST(${xIdent} AS VARCHAR), '(欠損)') AS x_val
        FROM ${tbl}
        ${whereClause}
        GROUP BY 1
        ORDER BY ${aggSql} DESC
        LIMIT ${Math.min(12, safeLimit)}
      ),
      top_g AS (
        SELECT COALESCE(CAST(${gIdent} AS VARCHAR), '(欠損)') AS g_val
        FROM ${tbl}
        ${whereClause}
        GROUP BY 1
        ORDER BY COUNT(*) DESC
        LIMIT 5
      )
      SELECT
        COALESCE(CAST(t.${xIdent} AS VARCHAR), '(欠損)') AS x_label,
        COALESCE(CAST(t.${gIdent} AS VARCHAR), '(欠損)') AS group_label,
        ${aggSql} AS y_value
      FROM ${tbl} t
      ${whereClause}
      GROUP BY 1, 2
      HAVING COALESCE(CAST(t.${xIdent} AS VARCHAR), '(欠損)') IN (SELECT x_val FROM top_x)
         AND COALESCE(CAST(t.${gIdent} AS VARCHAR), '(欠損)') IN (SELECT g_val FROM top_g)
      ORDER BY 1 ASC, 3 DESC
    `.trim();
  }

  // 時系列・折れ線グラフ (Date x Metric, optionally secondaryYAxis)
  const isDateAxis = xCol?.role === 'date' || xCol?.dataType === 'Date' || xCol?.dataType === 'Timestamp';
  if (config.type === 'line' && isDateAxis) {
    const dExpr = dateExpr(config.xAxis, schema);
    const gran = config.granularity || 'month';
    const truncUnit = gran === 'day' ? 'day' : gran === 'week' ? 'week' : 'month';
    const periodSql =
      truncUnit === 'day'
        ? `STRFTIME(DATE_TRUNC('day', ${dExpr}), '%Y-%m-%d')`
        : truncUnit === 'week'
          ? `STRFTIME(DATE_TRUNC('week', ${dExpr}), '%Y-%m-%d')`
          : `STRFTIME(DATE_TRUNC('month', ${dExpr}), '%Y-%m')`;

    const yExpr =
      config.aggregation === 'COUNT'
        ? config.yAxis === '*'
          ? '*'
          : escapeIdentifier(config.yAxis)
        : numericExpr(config.yAxis, schema);
    const aggSql = aggregationSql(config.aggregation, yExpr);

    const secondarySelect = config.secondaryYAxis
      ? `, ${aggregationSql(config.aggregation, numericExpr(config.secondaryYAxis, schema))} AS y_value_2`
      : '';

    const orderDir = config.sort === 'label_desc' ? 'DESC' : 'ASC';

    return `
      SELECT
        ${periodSql} AS x_label,
        ${aggSql} AS y_value
        ${secondarySelect}
      FROM ${tbl}
      ${andPrefix} ${dExpr} IS NOT NULL
      GROUP BY 1
      ORDER BY 1 ${orderDir}
      LIMIT ${safeLimit}
    `.trim();
  }

  // 一般的な集計グラフ (Bar, Pie, Line on Category)
  const yExpr =
    config.aggregation === 'COUNT'
      ? config.yAxis === '*'
        ? '*'
        : escapeIdentifier(config.yAxis)
      : numericExpr(config.yAxis, schema);
  const aggSql = aggregationSql(config.aggregation, yExpr);

  let orderBySql = 'y_value DESC';
  if (config.sort === 'value_asc') orderBySql = 'y_value ASC';
  else if (config.sort === 'label_asc') orderBySql = 'x_label ASC';
  else if (config.sort === 'label_desc') orderBySql = 'x_label DESC';

  const secondarySelect = config.secondaryYAxis
    ? `, ${aggregationSql(config.aggregation, numericExpr(config.secondaryYAxis, schema))} AS y_value_2`
    : '';

  return `
    SELECT
      COALESCE(CAST(${xIdent} AS VARCHAR), '(欠損)') AS x_label,
      ${aggSql} AS y_value
      ${secondarySelect}
    FROM ${tbl}
    ${whereClause}
    GROUP BY 1
    ORDER BY ${orderBySql}
    LIMIT ${safeLimit}
  `.trim();
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
