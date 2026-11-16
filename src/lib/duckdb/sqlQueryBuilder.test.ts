import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSqlTemplates,
  buildUserSqlQueries,
  buildValidationQuery,
  normalizeUserSql,
  parseValidationResult,
} from './sqlQueryBuilder';
import type { ColumnSchema, GlobalFilterState } from '../../types/analysis';

function col(name: string, duckdbType: string, role: ColumnSchema['role']): ColumnSchema {
  return {
    name,
    duckdbType,
    dataType: duckdbType === 'DATE' ? 'Date' : duckdbType === 'BIGINT' ? 'Integer' : 'String',
    role,
    rowCount: 10,
    nullCount: 0,
    nullRate: 0,
    uniqueCount: 10,
    uniqueRate: 1,
    sampleValues: [],
  };
}

const SCHEMA: ColumnSchema[] = [
  col('注文ID', 'VARCHAR', 'id'),
  col('日付', 'DATE', 'date'),
  col('販売チャネル', 'VARCHAR', 'category'),
  col('売上金額', 'BIGINT', 'metric'),
];

test('normalizeUserSql strips trailing semicolons and whitespace', () => {
  assert.equal(normalizeUserSql('  SELECT 1;;  \n'), 'SELECT 1');
  assert.equal(normalizeUserSql(' ; '), '');
});

test('buildValidationQuery escapes quotes in user SQL', () => {
  assert.equal(
    buildValidationQuery("SELECT 'a'"),
    "SELECT CAST(json_serialize_sql('SELECT ''a''') AS VARCHAR) AS j"
  );
});

test('parseValidationResult accepts SELECT and rejects other statements', () => {
  assert.equal(parseValidationResult('{"error":false,"statements":[]}'), null);
  assert.match(
    parseValidationResult('{"error":true,"error_message":"Only SELECT statements can be serialized to json!"}') ?? '',
    /SELECT 文/
  );
  assert.equal(
    parseValidationResult('{"error":true,"error_message":"Parser Error: syntax error at or near \\"FORM\\""}'),
    'Parser Error: syntax error at or near "FORM"'
  );
  assert.ok(parseValidationResult(undefined));
});

test('buildUserSqlQueries wraps user SQL with data CTE and paging', () => {
  const { rowsSql, countSql } = buildUserSqlQueries(
    'SELECT * FROM data -- trailing comment',
    'csv_1',
    SCHEMA,
    undefined,
    3,
    50
  );
  assert.equal(
    rowsSql,
    'WITH "data" AS (SELECT * FROM "csv_1" )\nSELECT * FROM (\nSELECT * FROM data -- trailing comment\n) AS user_query\nLIMIT 50 OFFSET 100'
  );
  assert.equal(
    countSql,
    'WITH "data" AS (SELECT * FROM "csv_1" )\nSELECT COUNT(*) AS cnt FROM (\nSELECT * FROM data -- trailing comment\n) AS user_query'
  );
});

test('buildUserSqlQueries applies dashboard filters inside the data CTE and clamps page size', () => {
  const filters: GlobalFilterState = { categoryFilters: { 販売チャネル: ['オンライン'] } };
  const { rowsSql } = buildUserSqlQueries('SELECT 1', 'csv_1', SCHEMA, filters, 1, 10_000);
  assert.match(rowsSql, /^WITH "data" AS \(SELECT \* FROM "csv_1" WHERE \(CAST\("販売チャネル" AS VARCHAR\) IN \('オンライン'\)\)\)/);
  assert.match(rowsSql, /LIMIT 200 OFFSET 0$/);
});

test('buildSqlTemplates uses column roles', () => {
  const labels = buildSqlTemplates(SCHEMA).map((t) => t.label);
  assert.deepEqual(labels, ['先頭100行', 'カテゴリ別集計', '月次推移', '上位10件', '重複チェック']);
  const monthly = buildSqlTemplates(SCHEMA).find((t) => t.label === '月次推移');
  assert.match(monthly?.sql ?? '', /DATE_TRUNC\('month', "日付"\)/);
});
