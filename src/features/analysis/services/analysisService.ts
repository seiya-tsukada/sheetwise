import { duckdbClient } from '@/src/lib/duckdb/duckdbClient';
import { buildChartQuery } from '@/src/lib/duckdb/chartQueryBuilder';
import { buildTableQueries } from '@/src/lib/duckdb/queryBuilder';
import type { QueryExecutor } from '@/src/lib/duckdb/types';
import type {
  AnalysisResult,
  ChartConfig,
  ChartDataResult,
  ColumnSchema,
  DatasetFileInfo,
  GlobalFilterState,
  TableQueryParams,
  TableQueryResult,
} from '@/src/types/analysis';
import { toChartData, toChartErrorResult } from '@/src/visualization/chartDataTransform';
import { generateKpiCards, recommendCharts } from '../charts/chartRecommendationEngine';
import { generateInsights } from '../insights/insightEngine';
import { profileDataset } from '../profiling/dataProfiler';
import {
  detectTypeInconsistencies,
  evaluateDataQualityRules,
} from '../rules/dataQualityRules';
import {
  computeCategoryComparisons,
  computeCorrelations,
  evaluateDistributionBiases,
} from '../rules/statisticalRules';
import { analyzeTrends } from '../rules/trendRules';
import { detectSchema } from '../schema/schemaDetector';

/**
 * 既存スキーマと現在のグローバルフィルターに基づいて分析と推奨結果を計算する
 */
export async function analyzeWithSchema(
  executor: QueryExecutor,
  fileInfo: DatasetFileInfo,
  schema: ColumnSchema[],
  filters?: GlobalFilterState,
  existingCharts?: ChartConfig[]
): Promise<AnalysisResult> {
  const partialErrors: string[] = [];

  const profile = await profileDataset(executor, fileInfo.tableName, schema, filters);

  let typeInconsistencies: Awaited<ReturnType<typeof detectTypeInconsistencies>> = [];
  try {
    typeInconsistencies = await detectTypeInconsistencies(
      executor,
      fileInfo.tableName,
      schema,
      filters
    );
  } catch (err) {
    partialErrors.push(err instanceof Error ? err.message : '型整合性チェックの一部が失敗しました');
  }

  const qualityIssues = evaluateDataQualityRules(schema, profile, typeInconsistencies);
  const distributionBiases = evaluateDistributionBiases(profile);

  let correlations: Awaited<ReturnType<typeof computeCorrelations>> = [];
  try {
    correlations = await computeCorrelations(executor, fileInfo.tableName, schema, filters);
  } catch (err) {
    partialErrors.push(err instanceof Error ? err.message : '相関分析の一部が失敗しました');
  }

  let categoryComparisons: Awaited<ReturnType<typeof computeCategoryComparisons>> = [];
  try {
    categoryComparisons = await computeCategoryComparisons(
      executor,
      fileInfo.tableName,
      schema,
      profile,
      filters
    );
  } catch (err) {
    partialErrors.push(err instanceof Error ? err.message : 'カテゴリ比較分析の一部が失敗しました');
  }

  let trends: Awaited<ReturnType<typeof analyzeTrends>> = [];
  try {
    trends = await analyzeTrends(executor, fileInfo.tableName, schema, profile, filters);
  } catch (err) {
    partialErrors.push(err instanceof Error ? err.message : '時系列分析の一部が失敗しました');
  }

  const recommendedCharts =
    existingCharts && existingCharts.length > 0
      ? existingCharts
      : recommendCharts(schema, profile, correlations, categoryComparisons, trends);

  const kpis = generateKpiCards(schema, profile, trends, categoryComparisons);

  const insights = generateInsights({
    schema,
    profile,
    qualityIssues,
    correlations,
    categoryComparisons,
    distributionBiases,
    trends,
    recommendedCharts,
  });

  return {
    fileInfo,
    schema,
    profile,
    kpis,
    qualityIssues,
    correlations,
    categoryComparisons,
    distributionBiases,
    trends,
    insights,
    recommendedCharts,
    partialErrors,
  };
}

/**
 * 初回読み込み時のフル分析オーケストレーション
 */
export async function runInitialAnalysis(
  fileInfo: DatasetFileInfo,
  executor: QueryExecutor = duckdbClient
): Promise<AnalysisResult> {
  const schema = await detectSchema(executor, fileInfo.tableName);
  return analyzeWithSchema(executor, fileInfo, schema);
}

/**
 * フィルター変更時の再分析オーケストレーション
 */
export async function rerunAnalysisWithFilters(
  fileInfo: DatasetFileInfo,
  schema: ColumnSchema[],
  filters: GlobalFilterState,
  currentCharts: ChartConfig[],
  executor: QueryExecutor = duckdbClient
): Promise<AnalysisResult> {
  return analyzeWithSchema(executor, fileInfo, schema, filters, currentCharts);
}

/**
 * 個別グラフの集計クエリをDuckDBで実行し、Recharts向けデータを返す
 */
export async function executeChartQuery(
  tableName: string,
  config: ChartConfig,
  schema: ColumnSchema[],
  filters?: GlobalFilterState,
  executor: QueryExecutor = duckdbClient
): Promise<ChartDataResult> {
  try {
    const sql = buildChartQuery(tableName, config, schema, filters);
    const rows = await executor.query<Record<string, unknown>>(sql);
    return toChartData(config, rows);
  } catch (err) {
    return toChartErrorResult(
      config,
      err instanceof Error ? err.message : 'グラフ集計クエリの実行に失敗しました'
    );
  }
}

/**
 * データテーブル用のページネーションクエリをDuckDBで実行する
 */
export async function fetchDataTablePage(
  tableName: string,
  schema: ColumnSchema[],
  filters: GlobalFilterState | undefined,
  params: TableQueryParams,
  executor: QueryExecutor = duckdbClient
): Promise<TableQueryResult> {
  const { rowsSql, countSql } = buildTableQueries(tableName, schema, filters, params);
  const [countRes, rows] = await Promise.all([
    executor.query<{ cnt: number }>(countSql),
    executor.query<Record<string, unknown>>(rowsSql),
  ]);

  return {
    rows,
    totalMatchingRows: Number(countRes[0]?.cnt ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}
