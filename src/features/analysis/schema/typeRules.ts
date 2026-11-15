import type { InferredDataType } from '@/src/types/analysis';

/**
 * DuckDB の型名 → 推定データ型 のルール表。
 * 上から順に評価し、最初にマッチしたルールを採用する（first-match）。
 */
interface DuckdbTypeRule {
  type: InferredDataType;
  /** 大文字化済みの DuckDB 型名に対する判定 */
  matches: (upperTypeName: string) => boolean;
}

const includesAny =
  (...keywords: string[]) =>
  (upper: string) =>
    keywords.some((k) => upper.includes(k));

const equals = (expected: string) => (upper: string) => upper === expected;

export const DUCKDB_TYPE_RULES: readonly DuckdbTypeRule[] = [
  // BIGINT / SMALLINT / TINYINT / HUGEINT / UBIGINT も 'INT' を含む。
  // 注意: 既存挙動として INTERVAL も 'INT' を含むため Integer になる。
  { type: 'Integer', matches: includesAny('INT') },
  { type: 'Float', matches: includesAny('DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'REAL') },
  { type: 'Boolean', matches: includesAny('BOOL') },
  { type: 'Date', matches: equals('DATE') },
  // TIMESTAMP / TIMESTAMP WITH TIME ZONE / TIME はすべて 'TIME' を含む
  { type: 'Timestamp', matches: includesAny('TIME') },
  // VARCHAR / CHAR(n) は 'CHAR' を含む
  { type: 'String', matches: includesAny('CHAR', 'TEXT') },
];

export function mapDuckdbType(duckdbType: string): InferredDataType {
  const upper = duckdbType.toUpperCase();
  return DUCKDB_TYPE_RULES.find((rule) => rule.matches(upper))?.type ?? 'Unknown';
}
