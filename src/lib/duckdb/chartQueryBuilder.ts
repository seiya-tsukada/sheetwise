import type {
  AggregationMethod,
  ChartConfig,
  ChartSortOrder,
  ColumnSchema,
  GlobalFilterState,
} from '@/src/types/analysis';
import {
  buildWhereClause,
  dateExpr,
  escapeIdentifier,
  numericExpr,
  periodLabelExpr,
} from './queryBuilder';

const MISSING_LABEL = '(欠損)';

const AGGREGATION_SQL: Record<AggregationMethod, (expr: string) => string> = {
  SUM: (e) => `COALESCE(SUM(${e}), 0)`,
  AVG: (e) => `AVG(${e})`,
  COUNT: (e) => `COUNT(${e})`,
  MIN: (e) => `MIN(${e})`,
  MAX: (e) => `MAX(${e})`,
};

/** カテゴリ集計グラフの ORDER BY（未指定・不明値は値の降順） */
const CATEGORY_ORDER_BY: Record<ChartSortOrder, string> = {
  value_desc: 'y_value DESC',
  value_asc: 'y_value ASC',
  label_asc: 'x_label ASC',
  label_desc: 'x_label DESC',
};

/** グラフ種別ごとの上限 */
const LIMITS = {
  defaultLimit: 20,
  maxLimit: 500,
  histogramMinBins: 5,
  histogramMaxBins: 20,
  scatterMinPoints: 50,
  scatterMaxPoints: 300,
  groupedBarMaxX: 12,
  groupedBarMaxSeries: 5,
} as const;

/** SQL 生成ストラテジーが共有する前計算済みの値 */
interface ChartQueryContext {
  config: ChartConfig;
  schema: ColumnSchema[];
  /** エスケープ済みテーブル名 */
  tbl: string;
  /** "WHERE ..." または空文字 */
  whereClause: string;
  /** 追加条件を連結するための "WHERE ... AND" または "WHERE" */
  andPrefix: string;
  safeLimit: number;
}

interface ChartQueryStrategy {
  id: string;
  matches: (ctx: ChartQueryContext) => boolean;
  build: (ctx: ChartQueryContext) => string;
}

function aggregationSql(agg: AggregationMethod, expr: string): string {
  return AGGREGATION_SQL[agg](expr);
}

/** 主系列の集計式（COUNT(*) / COUNT(col) / 数値変換した列の集計） */
function primaryAggregateSql({ config, schema }: ChartQueryContext): string {
  const yExpr =
    config.aggregation === 'COUNT'
      ? config.yAxis === '*'
        ? '*'
        : escapeIdentifier(config.yAxis)
      : numericExpr(config.yAxis, schema);
  return aggregationSql(config.aggregation, yExpr);
}

/** 第2系列がある場合の SELECT 句断片 */
function secondarySelectSql({ config, schema }: ChartQueryContext): string {
  return config.secondaryYAxis
    ? `, ${aggregationSql(config.aggregation, numericExpr(config.secondaryYAxis, schema))} AS y_value_2`
    : '';
}

function labelOrMissing(identSql: string): string {
  return `COALESCE(CAST(${identSql} AS VARCHAR), '${MISSING_LABEL}')`;
}

function isDateAxis({ config, schema }: ChartQueryContext): boolean {
  const xCol = schema.find((c) => c.name === config.xAxis);
  return xCol?.role === 'date' || xCol?.dataType === 'Date' || xCol?.dataType === 'Timestamp';
}

// ---------------------------------------------------------------------------
// Strategies（評価順）
// ---------------------------------------------------------------------------

/** ヒストグラム: 数値を等幅ビンに分割して件数を数える */
const histogramQuery: ChartQueryStrategy = {
  id: 'histogram',
  matches: ({ config }) => config.type === 'histogram',
  build: ({ config, schema, tbl, andPrefix, safeLimit }) => {
    const valExpr = numericExpr(config.xAxis, schema);
    const bins = Math.min(LIMITS.histogramMaxBins, Math.max(LIMITS.histogramMinBins, safeLimit));
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
    `;
  },
};

/** 散布図: 両軸が数値の行をサンプリング */
const scatterQuery: ChartQueryStrategy = {
  id: 'scatter',
  matches: ({ config }) => config.type === 'scatter',
  build: ({ config, schema, tbl, andPrefix, safeLimit }) => {
    const xNum = numericExpr(config.xAxis, schema);
    const yNum = numericExpr(config.yAxis, schema);
    const scatterLimit = Math.min(
      LIMITS.scatterMaxPoints,
      Math.max(LIMITS.scatterMinPoints, safeLimit)
    );
    return `
      SELECT
        ${xNum} AS x_value,
        ${yNum} AS y_value
      FROM ${tbl}
      ${andPrefix} ${xNum} IS NOT NULL AND ${yNum} IS NOT NULL
      LIMIT ${scatterLimit}
    `;
  },
};

/** グループ化棒グラフ: Category × SeriesCategory × Metric（上位のみ） */
const groupedBarQuery: ChartQueryStrategy = {
  id: 'grouped_bar',
  matches: ({ config }) => config.type === 'grouped_bar' && Boolean(config.groupBy),
  build: (ctx) => {
    const { config, tbl, whereClause, safeLimit } = ctx;
    const aggSql = primaryAggregateSql(ctx);
    const xIdent = escapeIdentifier(config.xAxis);
    const gIdent = escapeIdentifier(config.groupBy!);
    const xLabel = labelOrMissing(`t.${xIdent}`);
    const gLabel = labelOrMissing(`t.${gIdent}`);

    return `
      WITH top_x AS (
        SELECT ${labelOrMissing(xIdent)} AS x_val
        FROM ${tbl}
        ${whereClause}
        GROUP BY 1
        ORDER BY ${aggSql} DESC
        LIMIT ${Math.min(LIMITS.groupedBarMaxX, safeLimit)}
      ),
      top_g AS (
        SELECT ${labelOrMissing(gIdent)} AS g_val
        FROM ${tbl}
        ${whereClause}
        GROUP BY 1
        ORDER BY COUNT(*) DESC
        LIMIT ${LIMITS.groupedBarMaxSeries}
      )
      SELECT
        ${xLabel} AS x_label,
        ${gLabel} AS group_label,
        ${aggSql} AS y_value
      FROM ${tbl} t
      ${whereClause}
      GROUP BY 1, 2
      HAVING ${xLabel} IN (SELECT x_val FROM top_x)
         AND ${gLabel} IN (SELECT g_val FROM top_g)
      ORDER BY 1 ASC, 3 DESC
    `;
  },
};

/** 時系列折れ線: 日付軸を粒度で丸めて集計 */
const timeSeriesLineQuery: ChartQueryStrategy = {
  id: 'time_series_line',
  matches: (ctx) => ctx.config.type === 'line' && isDateAxis(ctx),
  build: (ctx) => {
    const { config, schema, tbl, andPrefix, safeLimit } = ctx;
    const dExpr = dateExpr(config.xAxis, schema);
    const orderDir = config.sort === 'label_desc' ? 'DESC' : 'ASC';
    return `
      SELECT
        ${periodLabelExpr(config.granularity, dExpr)} AS x_label,
        ${primaryAggregateSql(ctx)} AS y_value
        ${secondarySelectSql(ctx)}
      FROM ${tbl}
      ${andPrefix} ${dExpr} IS NOT NULL
      GROUP BY 1
      ORDER BY 1 ${orderDir}
      LIMIT ${safeLimit}
    `;
  },
};

/** 汎用カテゴリ集計（棒・円・カテゴリ軸の折れ線・groupBy なしのグループ化棒） */
const categoryAggregateQuery: ChartQueryStrategy = {
  id: 'category_aggregate',
  matches: () => true,
  build: (ctx) => {
    const { config, tbl, whereClause, safeLimit } = ctx;
    const orderBySql = CATEGORY_ORDER_BY[config.sort] ?? CATEGORY_ORDER_BY.value_desc;
    return `
      SELECT
        ${labelOrMissing(escapeIdentifier(config.xAxis))} AS x_label,
        ${primaryAggregateSql(ctx)} AS y_value
        ${secondarySelectSql(ctx)}
      FROM ${tbl}
      ${whereClause}
      GROUP BY 1
      ORDER BY ${orderBySql}
      LIMIT ${safeLimit}
    `;
  },
};

export const CHART_QUERY_STRATEGIES: readonly ChartQueryStrategy[] = [
  histogramQuery,
  scatterQuery,
  groupedBarQuery,
  timeSeriesLineQuery,
  categoryAggregateQuery,
];

/**
 * グラフ設定から集計用SQLクエリを生成する
 */
export function buildChartQuery(
  tableName: string,
  config: ChartConfig,
  schema: ColumnSchema[],
  filters?: GlobalFilterState
): string {
  const whereClause = buildWhereClause(filters, schema);
  const ctx: ChartQueryContext = {
    config,
    schema,
    tbl: escapeIdentifier(tableName),
    whereClause,
    andPrefix: whereClause ? `${whereClause} AND` : 'WHERE',
    safeLimit: Math.max(
      1,
      Math.min(LIMITS.maxLimit, Math.floor(config.limit || LIMITS.defaultLimit))
    ),
  };
  const strategy = CHART_QUERY_STRATEGIES.find((s) => s.matches(ctx)) ?? categoryAggregateQuery;
  return strategy.build(ctx).trim();
}
