import { duckdbClient, SqlExecutionError, type QueryColumn } from '@/src/lib/duckdb/duckdbClient';
import {
  buildUserSqlQueries,
  buildValidationQuery,
  normalizeUserSql,
  parseValidationResult,
  USER_SQL_LINE_OFFSET,
} from '@/src/lib/duckdb/sqlQueryBuilder';
import type { ColumnSchema, GlobalFilterState } from '@/src/types/analysis';

export interface UserSqlResult {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
  elapsedMs: number;
}

export interface UserSqlRequest {
  sql: string;
  tableName: string;
  schema: ColumnSchema[];
  /** 指定するとダッシュボードのフィルターを適用した行だけを data として扱う */
  filters?: GlobalFilterState;
  page: number;
  pageSize: number;
}

/**
 * ユーザーが書いたSQLエラーは生メッセージの方が原因を追いやすいので、そちらを優先する
 */
export function userSqlErrorMessage(err: unknown): string {
  if (err instanceof SqlExecutionError) return err.rawMessage;
  return err instanceof Error ? err.message : String(err);
}

/**
 * DuckDBのエラーの "LINE n:" は包んだ後のSQLの行番号なので、ユーザーが書いたSQLの行番号に戻す
 */
function shiftErrorLineNumbers(err: unknown, offset: number): unknown {
  if (!(err instanceof SqlExecutionError)) return err;
  const raw = err.rawMessage.replace(/LINE (\d+):/g, (_, n: string) => `LINE ${Math.max(1, Number(n) - offset)}:`);
  return new SqlExecutionError(err.message, raw);
}

/**
 * 単一SELECT文であることを検証してから、ページ分の行と総件数を取得する
 */
export async function runUserSql(req: UserSqlRequest): Promise<UserSqlResult> {
  const sql = normalizeUserSql(req.sql);
  if (!sql) throw new Error('SQLを入力してください。');

  const [validation] = await duckdbClient.query<{ j: string }>(buildValidationQuery(sql));
  const validationError = parseValidationResult(validation?.j);
  if (validationError) throw new Error(validationError);

  const { rowsSql, countSql } = buildUserSqlQueries(
    sql,
    req.tableName,
    req.schema,
    req.filters,
    req.page,
    req.pageSize
  );

  const started = performance.now();
  const [{ columns, rows }, countRes] = await Promise.all([
    duckdbClient.queryWithColumns(rowsSql),
    duckdbClient.query<{ cnt: number }>(countSql),
  ]).catch((err: unknown) => {
    throw shiftErrorLineNumbers(err, USER_SQL_LINE_OFFSET);
  });

  return {
    columns,
    rows,
    totalRows: Number(countRes[0]?.cnt ?? 0),
    page: req.page,
    pageSize: req.pageSize,
    elapsedMs: Math.round(performance.now() - started),
  };
}
