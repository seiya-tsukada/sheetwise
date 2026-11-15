import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartQuery } from './chartQueryBuilder';
import {
  buildTableQueries,
  buildWhereClause,
  escapeIdentifier,
  escapeLiteral,
} from './queryBuilder';
import type { ColumnSchema } from '../../types/analysis';

const SAMPLE_SCHEMA: ColumnSchema[] = [
  {
    name: '注文ID',
    duckdbType: 'VARCHAR',
    dataType: 'String',
    role: 'id',
    rowCount: 100,
    nullCount: 0,
    nullRate: 0,
    uniqueCount: 100,
    uniqueRate: 1,
    sampleValues: ['ORD-1'],
  },
  {
    name: '日付',
    duckdbType: 'DATE',
    dataType: 'Date',
    role: 'date',
    rowCount: 100,
    nullCount: 0,
    nullRate: 0,
    uniqueCount: 30,
    uniqueRate: 0.3,
    sampleValues: ['2025-10-01'],
  },
  {
    name: '商品"カテゴリ',
    duckdbType: 'VARCHAR',
    dataType: 'String',
    role: 'category',
    rowCount: 100,
    nullCount: 0,
    nullRate: 0,
    uniqueCount: 5,
    uniqueRate: 0.05,
    sampleValues: ['SaaS'],
  },
  {
    name: '売上',
    duckdbType: 'DOUBLE',
    dataType: 'Float',
    role: 'metric',
    rowCount: 100,
    nullCount: 0,
    nullRate: 0,
    uniqueCount: 80,
    uniqueRate: 0.8,
    sampleValues: ['12000'],
  },
];

test('escapeIdentifier and escapeLiteral neutralize SQL injection characters', () => {
  assert.equal(escapeIdentifier('col"name; DROP TABLE x;--'), '"col""name; DROP TABLE x;--"');
  assert.equal(escapeLiteral("O'Reilly'; --"), "'O''Reilly''; --'");
});

test('buildWhereClause ignores unknown columns and safely escapes category/date/numeric filters', () => {
  const where = buildWhereClause(
    {
      categoryFilters: {
        '商品"カテゴリ': ["A's", '__NULL__'],
        '存在しない列; DROP TABLE x': ['evil'],
      },
      dateFilter: {
        column: '日付',
        start: '2025-07-01',
        end: '2025-12-31',
      },
      numericFilter: {
        column: '売上',
        min: 1000,
        max: 500000,
      },
    },
    SAMPLE_SCHEMA
  );

  assert.match(where, /"商品""カテゴリ"/);
  assert.match(where, /'A''s'/);
  assert.match(where, /IS NULL/);
  assert.doesNotMatch(where, /存在しない列/);
  assert.match(where, />= 1000/);
  assert.match(where, /<= 500000/);
});

test('buildChartQuery produces valid SQL for bar, line, histogram, and scatter', () => {
  const barSql = buildChartQuery(
    'tbl_1',
    {
      id: 'c1',
      title: 'Bar',
      type: 'bar',
      xAxis: '商品"カテゴリ',
      yAxis: '売上',
      aggregation: 'SUM',
      sort: 'value_desc',
      limit: 10,
    },
    SAMPLE_SCHEMA
  );
  assert.match(barSql, /COALESCE\(SUM\(CAST\("売上" AS DOUBLE\)\), 0\) AS y_value/);
  assert.match(barSql, /LIMIT 10/);

  const lineSql = buildChartQuery(
    'tbl_1',
    {
      id: 'c2',
      title: 'Line',
      type: 'line',
      xAxis: '日付',
      yAxis: '売上',
      aggregation: 'SUM',
      sort: 'label_asc',
      limit: 30,
      granularity: 'month',
    },
    SAMPLE_SCHEMA
  );
  assert.match(lineSql, /DATE_TRUNC\('month'/);

  const histSql = buildChartQuery(
    'tbl_1',
    {
      id: 'c3',
      title: 'Hist',
      type: 'histogram',
      xAxis: '売上',
      yAxis: '*',
      aggregation: 'COUNT',
      sort: 'label_asc',
      limit: 10,
    },
    SAMPLE_SCHEMA
  );
  assert.match(histSql, /bin_idx/);
});

test('buildTableQueries generates paginated LIMIT/OFFSET and validated ORDER BY', () => {
  const { rowsSql, countSql } = buildTableQueries('tbl_1', SAMPLE_SCHEMA, undefined, {
    page: 3,
    pageSize: 25,
    search: 'SaaS',
    sortColumn: '売上',
    sortDirection: 'desc',
    columnFilters: {},
  });

  assert.match(countSql, /SELECT COUNT\(\*\) AS cnt FROM "tbl_1"/);
  assert.match(rowsSql, /ORDER BY "売上" DESC NULLS LAST/);
  assert.match(rowsSql, /LIMIT 25 OFFSET 50/);
});
