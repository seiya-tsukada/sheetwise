import test from 'node:test';
import assert from 'node:assert/strict';
import { inferColumnRole } from '../schema/schemaDetector';
import { evaluateDataQualityRules } from './dataQualityRules';
import { evaluateDistributionBiases } from './statisticalRules';
import { evaluateTrendPoints } from './trendRules';
import { recommendCharts } from '../charts/chartRecommendationEngine';
import { generateInsights } from '../insights/insightEngine';
import type { ColumnSchema, DataProfile } from '../../../types/analysis';

test('inferColumnRole never classifies numeric customer/order IDs as metric', () => {
  assert.equal(
    inferColumnRole({
      name: '顧客ID',
      dataType: 'Integer',
      rowCount: 100,
      uniqueCount: 100,
      uniqueRate: 1,
    }),
    'id'
  );
  assert.equal(
    inferColumnRole({
      name: 'order_id',
      dataType: 'Integer',
      rowCount: 50,
      uniqueCount: 25,
      uniqueRate: 0.5,
    }),
    'id'
  );
  assert.equal(
    inferColumnRole({
      name: '売上',
      dataType: 'Integer',
      rowCount: 15,
      uniqueCount: 15,
      uniqueRate: 1,
    }),
    'metric'
  );
});

test('recommendCharts avoids Pie when cardinality > 7 and does not force 3 charts on minimal schema', () => {
  const minimalSchema: ColumnSchema[] = [
    {
      name: 'ID',
      duckdbType: 'VARCHAR',
      dataType: 'String',
      role: 'id',
      rowCount: 20,
      nullCount: 0,
      nullRate: 0,
      uniqueCount: 20,
      uniqueRate: 1,
      sampleValues: ['1'],
    },
    {
      name: '地域',
      duckdbType: 'VARCHAR',
      dataType: 'String',
      role: 'category',
      rowCount: 20,
      nullCount: 0,
      nullRate: 0,
      uniqueCount: 12,
      uniqueRate: 0.6,
      sampleValues: ['東京'],
    },
  ];

  const profile: DataProfile = {
    overview: {
      totalRows: 20,
      filteredRows: 20,
      totalColumns: 2,
      columnsWithNulls: 0,
      duplicateRows: 0,
      warnings: [],
    },
    numericProfiles: {},
    categoryProfiles: {
      地域: {
        columnName: '地域',
        uniqueCount: 12,
        topCategories: [{ value: '東京', count: 5, ratio: 0.25 }],
      },
    },
    dateProfiles: {},
  };

  const charts = recommendCharts(minimalSchema, profile, [], [], []);
  assert.ok(charts.length < 3);
  assert.equal(charts.some((c) => c.type === 'pie'), false);
});

test('evaluateTrendPoints, evaluateDataQualityRules, and generateInsights produce grounded evidence and correlation disclaimer', () => {
  const trend = evaluateTrendPoints('日付', '売上', 'month', [
    { period: '2025-10', value: 1000, count: 5 },
    { period: '2025-11', value: 1200, count: 6 },
    { period: '2025-12', value: 1500, count: 8 },
  ]);

  assert.equal(trend.direction, 'up');
  assert.equal(trend.peakPeriod?.period, '2025-12');
  assert.equal(Math.round((trend.changeRate ?? 0) * 100), 25);

  const schema: ColumnSchema[] = [
    {
      name: '顧客ID',
      duckdbType: 'VARCHAR',
      dataType: 'String',
      role: 'id',
      rowCount: 20,
      nullCount: 0,
      nullRate: 0,
      uniqueCount: 20,
      uniqueRate: 1,
      sampleValues: ['C-1'],
    },
    {
      name: '売上',
      duckdbType: 'DOUBLE',
      dataType: 'Float',
      role: 'metric',
      rowCount: 20,
      nullCount: 2,
      nullRate: 0.1,
      uniqueCount: 18,
      uniqueRate: 1,
      sampleValues: ['1000'],
    },
    {
      name: '広告費',
      duckdbType: 'DOUBLE',
      dataType: 'Float',
      role: 'metric',
      rowCount: 20,
      nullCount: 0,
      nullRate: 0,
      uniqueCount: 18,
      uniqueRate: 0.9,
      sampleValues: ['200'],
    },
  ];

  const profile: DataProfile = {
    overview: {
      totalRows: 20,
      filteredRows: 20,
      totalColumns: 3,
      columnsWithNulls: 1,
      duplicateRows: 2,
      warnings: [],
    },
    numericProfiles: {
      売上: {
        columnName: '売上',
        count: 18,
        min: 100,
        max: 9000,
        mean: 1500,
        median: 900,
        sum: 27000,
        stdDev: 1800,
        q1: 500,
        q3: 1400,
        iqr: 900,
        outlierCount: 1,
      },
      広告費: {
        columnName: '広告費',
        count: 20,
        min: 50,
        max: 800,
        mean: 200,
        median: 190,
        sum: 4000,
        stdDev: 120,
        q1: 120,
        q3: 260,
        iqr: 140,
        outlierCount: 0,
      },
    },
    categoryProfiles: {},
    dateProfiles: {},
  };

  const qualityIssues = evaluateDataQualityRules(schema, profile);
  assert.ok(qualityIssues.some((q) => q.kind === 'duplicates'));
  assert.ok(qualityIssues.some((q) => q.kind === 'outliers'));
  assert.ok(qualityIssues.some((q) => q.kind === 'id_uniqueness'));

  const biases = evaluateDistributionBiases(profile);
  assert.equal(biases.length, 1);
  assert.equal(biases[0].skewDirection, 'right');

  const insights = generateInsights({
    schema,
    profile,
    qualityIssues,
    correlations: [
      {
        columnA: '売上',
        columnB: '広告費',
        pearsonR: 0.92,
        strength: 'strong',
        direction: 'positive',
        sampleSize: 18,
      },
    ],
    categoryComparisons: [],
    distributionBiases: biases,
    trends: [trend],
    recommendedCharts: [],
  });

  const corrInsight = insights.find((i) => i.category === 'Correlation');
  assert.ok(corrInsight);
  assert.match(corrInsight.description, /因果関係を示すものではありません/);
  assert.ok(insights.every((ins) => ins.evidence.length > 0));
});
