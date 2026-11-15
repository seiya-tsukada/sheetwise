export type CsvEncodingOption = 'auto' | 'utf-8' | 'shift_jis';

export type DetectedEncodingLabel = 'UTF-8' | 'UTF-8 BOM' | 'Shift_JIS';

export type InferredDataType =
  | 'Integer'
  | 'Float'
  | 'String'
  | 'Boolean'
  | 'Date'
  | 'Timestamp'
  | 'Unknown';

export type ColumnRole =
  | 'date'
  | 'category'
  | 'metric'
  | 'id'
  | 'text'
  | 'boolean';

export interface ColumnSchema {
  name: string;
  duckdbType: string;
  dataType: InferredDataType;
  role: ColumnRole;
  rowCount: number;
  nullCount: number;
  nullRate: number;
  uniqueCount: number;
  uniqueRate: number;
  sampleValues: string[];
  isNumericCoercible?: boolean;
  isDateCoercible?: boolean;
}

export interface NumericColumnProfile {
  columnName: string;
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  sum: number | null;
  stdDev: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  outlierCount: number;
}

export interface CategoryValueStat {
  value: string;
  count: number;
  ratio: number;
}

export interface CategoryColumnProfile {
  columnName: string;
  uniqueCount: number;
  topCategories: CategoryValueStat[];
}

export interface DateColumnProfile {
  columnName: string;
  minDate: string | null;
  maxDate: string | null;
  spanDays: number;
  recommendedGranularity: 'day' | 'week' | 'month';
}

export interface DatasetOverview {
  totalRows: number;
  filteredRows: number;
  totalColumns: number;
  columnsWithNulls: number;
  duplicateRows: number;
  warnings: string[];
}

export interface DataProfile {
  overview: DatasetOverview;
  numericProfiles: Record<string, NumericColumnProfile>;
  categoryProfiles: Record<string, CategoryColumnProfile>;
  dateProfiles: Record<string, DateColumnProfile>;
}

export interface DataQualityIssue {
  id: string;
  columnName?: string;
  kind:
    | 'high_null'
    | 'duplicates'
    | 'high_cardinality'
    | 'type_inconsistency'
    | 'outliers'
    | 'id_uniqueness';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  metricValue: number;
  metricLabel: string;
}

export interface CorrelationResult {
  columnA: string;
  columnB: string;
  pearsonR: number;
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'positive' | 'negative';
  sampleSize: number;
}

export interface CategoryMetricItem {
  category: string;
  sum: number;
  mean: number;
  count: number;
  share: number;
}

export interface CategoryMetricComparison {
  categoryColumn: string;
  metricColumn: string;
  overallMean: number;
  overallSum: number;
  top3Share: number;
  topItems: CategoryMetricItem[];
  bottomItem?: CategoryMetricItem;
}

export interface DistributionBiasResult {
  columnName: string;
  mean: number;
  median: number;
  skewDirection: 'right' | 'left' | 'symmetric';
  divergenceRatio: number;
}

export interface TrendPoint {
  period: string;
  value: number;
  count: number;
}

export interface TrendAnalysisResult {
  dateColumn: string;
  metricColumn: string;
  granularity: 'day' | 'week' | 'month';
  points: TrendPoint[];
  latestPeriod: string | null;
  previousPeriod: string | null;
  latestValue: number | null;
  previousValue: number | null;
  changeRate: number | null;
  peakPeriod: { period: string; value: number } | null;
  troughPeriod: { period: string; value: number } | null;
  direction: 'up' | 'down' | 'flat';
}

export type InsightCategory =
  | 'Overview'
  | 'Trend'
  | 'Comparison'
  | 'Distribution'
  | 'Correlation'
  | 'Data Quality'
  | 'Anomaly';

export type InsightSeverity = 'high' | 'medium' | 'low';

export interface InsightEvidence {
  label: string;
  value: string;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  category: InsightCategory;
  severity: InsightSeverity;
  evidence: InsightEvidence[];
  targetColumns: string[];
  relatedChartId?: string;
}

export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'scatter'
  | 'histogram'
  | 'grouped_bar';

export type AggregationMethod = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';

export type ChartSortOrder =
  | 'value_desc'
  | 'value_asc'
  | 'label_asc'
  | 'label_desc';

export interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  xAxis: string;
  yAxis: string;
  secondaryYAxis?: string;
  groupBy?: string;
  aggregation: AggregationMethod;
  sort: ChartSortOrder;
  limit: number;
  granularity?: 'day' | 'week' | 'month';
  reason?: string;
}

export interface ChartDataResult {
  chartId: string;
  data: Record<string, string | number | null>[];
  seriesKeys: string[];
  xAxisLabel: string;
  yAxisLabel: string;
  error?: string;
}

export interface KpiCardData {
  id: string;
  label: string;
  value: string;
  subtext?: string;
  deltaText?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
}

export interface GlobalFilterState {
  categoryFilters: Record<string, string[]>;
  dateFilter?: {
    column: string;
    start?: string;
    end?: string;
  };
  numericFilter?: {
    column: string;
    min?: number;
    max?: number;
  };
}

export interface DatasetFileInfo {
  fileName: string;
  fileSizeBytes: number;
  encodingUsed: CsvEncodingOption;
  detectedEncoding: DetectedEncodingLabel;
  tableName: string;
  loadedAt: string;
}

export interface AnalysisResult {
  fileInfo: DatasetFileInfo;
  schema: ColumnSchema[];
  profile: DataProfile;
  kpis: KpiCardData[];
  qualityIssues: DataQualityIssue[];
  correlations: CorrelationResult[];
  categoryComparisons: CategoryMetricComparison[];
  distributionBiases: DistributionBiasResult[];
  trends: TrendAnalysisResult[];
  insights: Insight[];
  recommendedCharts: ChartConfig[];
  partialErrors: string[];
}

export interface TableQueryParams {
  page: number;
  pageSize: number;
  search: string;
  sortColumn?: string;
  sortDirection: 'asc' | 'desc';
  columnFilters: Record<string, string>;
}

export interface TableQueryResult {
  rows: Record<string, unknown>[];
  totalMatchingRows: number;
  page: number;
  pageSize: number;
}
