/**
 * Characterization (golden) tests.
 *
 * Pins the exact outputs of the rule-based type inference and chart
 * recommendation logic across a wide grid of inputs, so refactors can prove
 * they did not change behavior. Regenerate intentionally with:
 *   UPDATE_SNAPSHOTS=1 npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QueryExecutor, SqlRow } from '../../lib/duckdb/types';
import { buildChartQuery } from '../../lib/duckdb/chartQueryBuilder';
import type {
  AggregationMethod,
  CategoryMetricComparison,
  ChartConfig,
  ChartSortOrder,
  ChartType,
  ColumnRole,
  ColumnSchema,
  CorrelationResult,
  DataProfile,
  GlobalFilterState,
  InferredDataType,
  TrendAnalysisResult,
} from '../../types/analysis';
import { generateKpiCards, recommendCharts } from './charts/chartRecommendationEngine';
import { generateInsights } from './insights/insightEngine';
import { analyzeTrends } from './rules/trendRules';
import { detectSchema, inferColumnRole, mapDuckdbType } from './schema/schemaDetector';
import { executeChartQuery } from './services/analysisService';

const SNAPSHOT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '__snapshots__',
  'characterization.json'
);

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function col(
  name: string,
  role: ColumnRole,
  dataType: InferredDataType,
  uniqueCount: number,
  rowCount = 100
): ColumnSchema {
  return {
    name,
    duckdbType: 'VARCHAR',
    dataType,
    role,
    rowCount,
    nullCount: 0,
    nullRate: 0,
    uniqueCount,
    uniqueRate: uniqueCount / rowCount,
    sampleValues: [],
  };
}

// ---------------------------------------------------------------------------
// Scenario generators
// ---------------------------------------------------------------------------

function mapDuckdbTypeCases() {
  const types = [
    'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'HUGEINT', 'UBIGINT', 'UINTEGER',
    'DOUBLE', 'FLOAT', 'DECIMAL(10,2)', 'NUMERIC', 'REAL', 'BOOLEAN', 'BOOL',
    'DATE', 'date', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP_NS', 'TIME',
    'INTERVAL', 'VARCHAR', 'TEXT', 'CHAR(3)', 'BLOB', 'UUID', 'INTEGER[]', 'VARCHAR[]',
    'STRUCT(a INTEGER)', 'MAP(VARCHAR, INTEGER)', 'BIT', 'POINT', '', 'DATETIME',
  ];
  return types.map((t) => ({ input: t, output: mapDuckdbType(t) }));
}

function inferColumnRoleCases() {
  const names = [
    '顧客ID', 'order_id', 'id', 'customer id', 'product_code', 'sku', '品番', '売上',
    'sales_amount', 'id_count', 'total_id', '地域', 'note text', 'comment', 'flag',
    'ad_cost', 'score', 'name', 'user no', 'key_metric',
  ];
  const dataTypes: InferredDataType[] = [
    'Integer', 'Float', 'String', 'Boolean', 'Date', 'Timestamp', 'Unknown',
  ];
  const stats = [
    { rowCount: 3, uniqueCount: 2, uniqueRate: 0.67 },
    { rowCount: 5, uniqueCount: 2, uniqueRate: 0.4 },
    { rowCount: 9, uniqueCount: 9, uniqueRate: 1 },
    { rowCount: 10, uniqueCount: 10, uniqueRate: 1 },
    { rowCount: 100, uniqueCount: 96, uniqueRate: 0.96 },
    { rowCount: 100, uniqueCount: 95, uniqueRate: 0.95 },
    { rowCount: 100, uniqueCount: 98, uniqueRate: 0.98 },
    { rowCount: 100, uniqueCount: 85, uniqueRate: 0.85 },
    { rowCount: 100, uniqueCount: 19, uniqueRate: 0.9 },
    { rowCount: 200, uniqueCount: 61, uniqueRate: 0.51 },
    { rowCount: 200, uniqueCount: 61, uniqueRate: 0.5 },
    { rowCount: 200, uniqueCount: 60, uniqueRate: 0.6 },
    { rowCount: 100, uniqueCount: 1, uniqueRate: 0.01 },
    { rowCount: 100, uniqueCount: 7, uniqueRate: 0.07 },
  ];
  const flags = [
    {},
    { isDateCoercible: true },
    { isNumericCoercible: true },
  ];
  const cases: Array<{ input: unknown; output: ColumnRole }> = [];
  for (const name of names) {
    for (const dataType of dataTypes) {
      for (const s of stats) {
        for (const f of flags) {
          const input = { name, dataType, ...s, ...f };
          cases.push({ input, output: inferColumnRole(input) });
        }
      }
    }
  }
  return cases;
}

interface DatasetScenario {
  schema: ColumnSchema[];
  profile: DataProfile;
  correlations: CorrelationResult[];
  categoryComparisons: CategoryMetricComparison[];
  trends: TrendAnalysisResult[];
}

function buildDatasetScenarios(count: number): DatasetScenario[] {
  const rand = mulberry32(20261115);
  const scenarios: DatasetScenario[] = [];
  const grans = ['day', 'week', 'month'] as const;

  for (let i = 0; i < count; i++) {
    const schema: ColumnSchema[] = [];
    const profile: DataProfile = {
      overview: {
        totalRows: 100,
        filteredRows: rand() < 0.3 ? 40 : 100,
        totalColumns: 0,
        columnsWithNulls: Math.floor(rand() * 3),
        duplicateRows: Math.floor(rand() * 3),
        warnings: [],
      },
      numericProfiles: {},
      categoryProfiles: {},
      dateProfiles: {},
    };

    const nDates = pick(rand, [0, 0, 1, 2]);
    const nMetrics = pick(rand, [0, 1, 1, 2, 3]);
    const nCats = pick(rand, [0, 1, 2, 3]);
    const nBools = pick(rand, [0, 0, 1]);

    for (let d = 0; d < nDates; d++) {
      const name = `date_${d}`;
      schema.push(col(name, 'date', 'Date', 50));
      if (rand() < 0.85) {
        profile.dateProfiles[name] = {
          columnName: name,
          minDate: rand() < 0.8 ? '2025-01-01' : null,
          maxDate: '2025-12-31',
          spanDays: Math.floor(rand() * 400),
          recommendedGranularity: pick(rand, grans),
        };
      }
    }
    for (let m = 0; m < nMetrics; m++) {
      const name = `metric_${m}`;
      schema.push(col(name, 'metric', pick(rand, ['Integer', 'Float'] as const), 80));
      if (rand() < 0.9) {
        const hasStats = rand() < 0.85;
        profile.numericProfiles[name] = {
          columnName: name,
          count: pick(rand, [0, 2, 3, 4, 5, 50]),
          min: hasStats ? 1 : null,
          max: hasStats ? 1234567.5 : null,
          mean: hasStats ? pick(rand, [10.5, 2500, 1_500_000]) : null,
          median: rand() < 0.8 ? 9 : null,
          sum: hasStats ? pick(rand, [1000, 2_000_000_000, 12.345]) : null,
          stdDev: 1,
          q1: 1,
          q3: 2,
          iqr: 1,
          outlierCount: 0,
        };
      }
    }
    const uniqChoices = [1, 2, 3, 5, 7, 8, 10, 11, 12, 13, 40, 41];
    for (let c = 0; c < nCats; c++) {
      const name = `cat_${c}`;
      const uniq = pick(rand, uniqChoices);
      schema.push(col(name, 'category', 'String', uniq));
      if (rand() < 0.7) {
        const profUniq = rand() < 0.8 ? uniq : pick(rand, uniqChoices);
        profile.categoryProfiles[name] = {
          columnName: name,
          uniqueCount: profUniq,
          topCategories:
            rand() < 0.85
              ? [
                  { value: 'A', count: 40, ratio: 0.4 },
                  { value: 'B', count: 30, ratio: 0.3 },
                ].slice(0, pick(rand, [1, 2]))
              : [],
        };
      }
    }
    for (let b = 0; b < nBools; b++) {
      schema.push(col(`flag_${b}`, 'boolean', 'Boolean', 2));
    }
    if (rand() < 0.3) schema.push(col('row_id', 'id', 'Integer', 100));
    if (rand() < 0.2) schema.push(col('memo', 'text', 'String', 90));

    // Shuffle column order deterministically.
    for (let k = schema.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [schema[k], schema[j]] = [schema[j], schema[k]];
    }
    profile.overview.totalColumns = schema.length;

    const metrics = schema.filter((c) => c.role === 'metric');
    const cats = schema.filter((c) => c.role === 'category' || c.role === 'boolean');
    const dates = schema.filter((c) => c.role === 'date');

    const correlations: CorrelationResult[] =
      metrics.length >= 2 && rand() < 0.6
        ? [
            {
              columnA: metrics[metrics.length - 1].name,
              columnB: metrics[0].name,
              pearsonR: pick(rand, [0.9, -0.5, 0.3]),
              strength: pick(rand, ['strong', 'moderate', 'weak'] as const),
              direction: pick(rand, ['positive', 'negative'] as const),
              sampleSize: 80,
            },
          ]
        : [];

    const categoryComparisons: CategoryMetricComparison[] = [];
    if (cats.length > 0 && metrics.length > 0 && rand() < 0.7) {
      const catName = pick(rand, cats).name;
      const nItems = pick(rand, [0, 1, 3, 4]);
      categoryComparisons.push({
        categoryColumn: catName,
        metricColumn: metrics[0].name,
        overallMean: pick(rand, [0, 100]),
        overallSum: pick(rand, [0, 1000]),
        top3Share: pick(rand, [0.5, 0.75]),
        topItems: Array.from({ length: nItems }, (_, idx) => ({
          category: `item_${idx}`,
          sum: 100 - idx * 10,
          mean: pick(rand, [80, 120, 200]),
          count: 10,
          share: 0.3 - idx * 0.05,
        })),
      });
    }

    const trends: TrendAnalysisResult[] = [];
    if (dates.length > 0 && metrics.length > 0 && rand() < 0.75) {
      const hasChange = rand() < 0.7;
      const changeRate = pick(rand, [0.2, -0.3, 0.005, 0, -0.01, 0.1]);
      trends.push({
        dateColumn: dates[0].name,
        metricColumn: metrics[0].name,
        granularity: pick(rand, grans),
        points: Array.from({ length: pick(rand, [2, 3, 5]) }, (_, idx) => ({
          period: `2025-0${idx + 1}`,
          value: idx * 10,
          count: 1,
        })),
        latestPeriod: hasChange ? '2025-05' : null,
        previousPeriod: hasChange ? '2025-04' : null,
        latestValue: hasChange ? 120 : null,
        previousValue: hasChange ? 100 : null,
        changeRate: hasChange ? changeRate : null,
        peakPeriod: rand() < 0.7 ? { period: '2025-03', value: 300 } : null,
        troughPeriod: rand() < 0.7 ? { period: '2025-01', value: 5 } : null,
        direction: 'up',
      });
    }

    scenarios.push({ schema, profile, correlations, categoryComparisons, trends });
  }
  return scenarios;
}

function recommendationCases() {
  return buildDatasetScenarios(600).map((s) => {
    const charts = recommendCharts(
      s.schema,
      s.profile,
      s.correlations,
      s.categoryComparisons,
      s.trends
    );
    const kpis = generateKpiCards(s.schema, s.profile, s.trends, s.categoryComparisons);
    const insights = generateInsights({
      schema: s.schema,
      profile: s.profile,
      qualityIssues: [],
      correlations: s.correlations,
      categoryComparisons: s.categoryComparisons,
      distributionBiases: [],
      trends: s.trends,
      recommendedCharts: charts,
    });
    return { charts, kpis, insights };
  });
}

const QUERY_SCHEMA: ColumnSchema[] = [
  col('注文日', 'date', 'Date', 50),
  col('日付文字列', 'date', 'String', 50),
  col('地域', 'category', 'String', 5),
  col('チャネル', 'category', 'String', 3),
  col('売上', 'metric', 'Integer', 80),
  col('単価', 'metric', 'String', 70),
];

const QUERY_FILTERS: Array<GlobalFilterState | undefined> = [
  undefined,
  { categoryFilters: {}, dateFilter: undefined, numericFilter: undefined },
  {
    categoryFilters: { 地域: ['東京', '__NULL__'] },
    dateFilter: { column: '注文日', start: '2025-01-01', end: '2025-06-30' },
    numericFilter: { column: '売上', min: 10, max: 1000 },
  },
];

function chartQueryConfigs(): ChartConfig[] {
  const types: ChartType[] = ['line', 'bar', 'pie', 'scatter', 'histogram', 'grouped_bar'];
  const xAxes = ['注文日', '日付文字列', '地域', '売上'];
  const yAxes = ['*', '売上', '単価'];
  const aggs: AggregationMethod[] = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];
  const sorts: ChartSortOrder[] = ['value_desc', 'value_asc', 'label_asc', 'label_desc'];
  const grans = [undefined, 'day', 'week', 'month'] as const;
  const limits = [0, 3, 20, 999];

  const rand = mulberry32(42);
  const configs: ChartConfig[] = [];
  let n = 0;
  for (const type of types) {
    for (const xAxis of xAxes) {
      for (const yAxis of yAxes) {
        for (const aggregation of aggs) {
          configs.push({
            id: `c${n++}`,
            title: 't',
            type,
            xAxis,
            yAxis,
            aggregation,
            sort: pick(rand, sorts),
            limit: pick(rand, limits),
            granularity: pick(rand, grans),
            secondaryYAxis: rand() < 0.4 ? '単価' : undefined,
            groupBy: rand() < 0.6 ? 'チャネル' : undefined,
          });
        }
      }
    }
  }
  return configs;
}

function chartQueryCases() {
  const out: string[] = [];
  for (const cfg of chartQueryConfigs()) {
    for (const f of QUERY_FILTERS) {
      out.push(buildChartQuery('tbl', cfg, QUERY_SCHEMA, f));
    }
  }
  return out;
}

class FakeExecutor implements QueryExecutor {
  readonly log: string[] = [];
  constructor(
    private readonly respond: (sql: string) => SqlRow[] | Error,
    private readonly columns: Array<{ name: string; type: string }> = []
  ) {}
  async query<T extends SqlRow = SqlRow>(sql: string): Promise<T[]> {
    this.log.push(sql);
    const res = this.respond(sql);
    if (res instanceof Error) throw res;
    return res as T[];
  }
  async execute(sql: string): Promise<void> {
    this.log.push(sql);
  }
  async getTableColumns() {
    return this.columns;
  }
}

async function chartDataCases() {
  const rowSets: SqlRow[][] = [
    [],
    [
      { x_label: 'A', y_value: 10, y_value_2: 3, x_value: 1, group_label: 'g1' },
      { x_label: 'A', y_value: null, y_value_2: null, x_value: null, group_label: 'g2' },
      { x_label: null, y_value: 5, y_value_2: 1, x_value: 2, group_label: null },
      { x_label: 'B', y_value: '7', y_value_2: undefined, x_value: '3', group_label: 'g1' },
    ],
  ];
  const out: unknown[] = [];
  for (const cfg of chartQueryConfigs()) {
    for (const rows of rowSets) {
      out.push(await executeChartQuery('tbl', cfg, QUERY_SCHEMA, undefined, new FakeExecutor(() => rows)));
    }
    out.push(
      await executeChartQuery('tbl', cfg, QUERY_SCHEMA, undefined, new FakeExecutor(() => new Error('boom')))
    );
  }
  return out;
}

async function trendSqlCases() {
  const out: unknown[] = [];
  for (const gran of ['day', 'week', 'month', undefined] as const) {
    const profile: DataProfile = {
      overview: { totalRows: 1, filteredRows: 1, totalColumns: 1, columnsWithNulls: 0, duplicateRows: 0, warnings: [] },
      numericProfiles: {},
      categoryProfiles: {},
      dateProfiles: gran
        ? { 注文日: { columnName: '注文日', minDate: null, maxDate: null, spanDays: 1, recommendedGranularity: gran } }
        : {},
    };
    const exec = new FakeExecutor(() => []);
    const res = await analyzeTrends(exec, 'tbl', QUERY_SCHEMA, profile, QUERY_FILTERS[2]);
    out.push({ res, sql: exec.log });
  }
  return out;
}

async function detectSchemaCases() {
  interface FakeCol {
    name: string;
    type: string;
    nulls: number;
    uniq: number;
    samples: unknown[];
    validRatio?: number;
    statsError?: boolean;
    samplesError?: boolean;
    checkError?: boolean;
  }
  const scenarios: FakeCol[][] = [
    [
      { name: '注文日', type: 'VARCHAR', nulls: 0, uniq: 50, samples: ['2025-01-01', '2025/02/03'], validRatio: 0.9 },
      { name: '日付?', type: 'VARCHAR', nulls: 5, uniq: 50, samples: ['2025-01', '2025-02-01 10:00'], validRatio: 0.84 },
      { name: '金額', type: 'VARCHAR', nulls: 0, uniq: 90, samples: ['1,200', '-3.5', '100'], validRatio: 0.85 },
      { name: '数値?', type: 'VARCHAR', nulls: 0, uniq: 90, samples: ['1,200', 'abc'], validRatio: 1 },
      { name: '空', type: 'VARCHAR', nulls: 100, uniq: 0, samples: [] },
      { name: 'samples_null', type: 'VARCHAR', nulls: 0, uniq: 3, samples: [null, undefined, ''] },
      { name: 'whitespace', type: 'VARCHAR', nulls: 0, uniq: 3, samples: ['  ', ' 2025-01-01 '], validRatio: 1 },
      { name: '顧客ID', type: 'BIGINT', nulls: 0, uniq: 100, samples: [1, 2] },
      { name: 'flag', type: 'BOOLEAN', nulls: 0, uniq: 2, samples: [true] },
      { name: 'ts', type: 'TIMESTAMP', nulls: 1, uniq: 99, samples: ['2025-01-01 00:00:00'] },
      { name: '地域', type: 'VARCHAR', nulls: 0, uniq: 5, samples: ['東京', '大阪'] },
    ],
    [
      { name: 'err_stats', type: 'VARCHAR', nulls: 0, uniq: 5, samples: ['1'], statsError: true, validRatio: 1 },
      { name: 'err_samples', type: 'DOUBLE', nulls: 0, uniq: 5, samples: [], samplesError: true },
      { name: 'err_check', type: 'VARCHAR', nulls: 0, uniq: 5, samples: ['2025-01-01'], checkError: true },
      { name: 'err_check_num', type: 'VARCHAR', nulls: 0, uniq: 5, samples: ['42'], checkError: true },
      { name: 'zero_nonnull', type: 'VARCHAR', nulls: 0, uniq: 5, samples: ['42'], validRatio: -1 },
    ],
  ];

  const out: unknown[] = [];
  for (const totalRows of [0, 100]) {
    for (const cols of scenarios) {
      const findCol = (sql: string) => cols.find((c) => sql.includes(`"${c.name}"`));
      const exec = new FakeExecutor(
        (sql) => {
          if (sql.includes('total_rows')) return [{ total_rows: totalRows }];
          const c = findCol(sql);
          if (!c) return [];
          if (sql.includes('null_cnt')) {
            return c.statsError ? new Error('stats') : [{ null_cnt: c.nulls, uniq_cnt: c.uniq }];
          }
          if (sql.includes('SELECT DISTINCT')) {
            return c.samplesError ? new Error('samples') : c.samples.map((val) => ({ val }));
          }
          if (sql.includes('valid_cnt')) {
            if (c.checkError) return new Error('check');
            if (c.validRatio === -1) return [{ valid_cnt: 0, non_null_cnt: 0 }];
            return [{ valid_cnt: Math.round((c.validRatio ?? 0) * 100), non_null_cnt: 100 }];
          }
          return [];
        },
        cols.map((c) => ({ name: c.name, type: c.type }))
      );
      const schema = await detectSchema(exec, 'tbl');
      out.push({ schema, sql: exec.log });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapshot harness
// ---------------------------------------------------------------------------

async function collect() {
  return {
    mapDuckdbType: mapDuckdbTypeCases(),
    inferColumnRole: inferColumnRoleCases(),
    recommendation: recommendationCases(),
    chartQuery: chartQueryCases(),
    chartData: await chartDataCases(),
    trendSql: await trendSqlCases(),
    detectSchema: await detectSchemaCases(),
  };
}

test('analysis & visualization rules match golden snapshot', async () => {
  // JSON round-trip normalizes undefined fields the same way on both sides,
  // and SQL whitespace is collapsed so formatting-only changes are allowed.
  const actual = JSON.parse(JSON.stringify(await collect()), (_key, value) =>
    typeof value === 'string' && /\b(SELECT|WITH)\b/.test(value)
      ? value.replace(/\s+/g, ' ').trim()
      : value
  );

  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(SNAPSHOT_PATH)) {
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 1)}\n`);
    return;
  }

  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  for (const key of Object.keys(expected)) {
    assert.deepEqual(actual[key], expected[key], `snapshot mismatch in "${key}"`);
  }
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
});
