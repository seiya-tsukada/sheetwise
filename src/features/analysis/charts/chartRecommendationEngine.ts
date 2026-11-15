import type {
  CategoryMetricComparison,
  ChartConfig,
  ColumnSchema,
  CorrelationResult,
  DataProfile,
  KpiCardData,
  TrendAnalysisResult,
} from '@/src/types/analysis';
import { applyChartRules } from './chartRules';
import { applyKpiRules } from './kpiRules';

export { formatCompactNumber } from '../formatters';
export { CHART_RULES, CHART_RULE_THRESHOLDS, MAX_RECOMMENDED_CHARTS } from './chartRules';
export { HIGHLIGHT_KPI_RULES, KPI_RULES, MAX_KPI_CARDS } from './kpiRules';

/**
 * データ構造と分析結果に応じてKPIカードを自動生成する（純粋関数）
 */
export function generateKpiCards(
  schema: ColumnSchema[],
  profile: DataProfile,
  trends: TrendAnalysisResult[],
  categoryComparisons: CategoryMetricComparison[]
): KpiCardData[] {
  return applyKpiRules({ schema, profile, trends, categoryComparisons });
}

/**
 * データ構造と分析結果に基づき最適なグラフ群（最大4個、不適切な場合は無理に生成しない）を推薦する
 */
export function recommendCharts(
  schema: ColumnSchema[],
  profile: DataProfile,
  correlations: CorrelationResult[],
  categoryComparisons: CategoryMetricComparison[],
  trends: TrendAnalysisResult[]
): ChartConfig[] {
  return applyChartRules({ schema, profile, correlations, categoryComparisons, trends });
}
