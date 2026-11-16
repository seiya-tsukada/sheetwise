import type { ColumnSchema, GlobalFilterState } from '@/src/types/analysis';
import { buildWhereClause, escapeIdentifier, escapeLiteral } from './queryBuilder';

/**
 * ユーザーSQL内で元データを参照するための固定エイリアス
 */
export const USER_SQL_TABLE_ALIAS = 'data';

export const USER_SQL_MAX_PAGE_SIZE = 200;

/**
 * buildUserSqlQueries で包んだSQLのうち、ユーザーSQLより前にある行数（WITH 行と SELECT 行）
 */
export const USER_SQL_LINE_OFFSET = 2;

/**
 * 末尾のセミコロンと空白を取り除く（単一ステートメント前提）
 */
export function normalizeUserSql(sql: string): string {
  return sql.trim().replace(/[\s;]+$/, '').trim();
}

/**
 * パースのみ行い、単一のSELECT文かどうかを検証するSQL。
 * json_serialize_sql は SELECT 以外や複数ステートメントを {"error": true} として返す。
 */
export function buildValidationQuery(userSql: string): string {
  return `SELECT CAST(json_serialize_sql(${escapeLiteral(userSql)}) AS VARCHAR) AS j`;
}

/**
 * json_serialize_sql の結果からエラーメッセージを取り出す（問題なければ null）
 */
export function parseValidationResult(json: unknown): string | null {
  if (typeof json !== 'string') return 'SQLを解析できませんでした。';
  try {
    const parsed = JSON.parse(json) as { error?: boolean; error_message?: string };
    if (!parsed.error) return null;
    const msg = parsed.error_message ?? '';
    if (/Only SELECT statements/i.test(msg)) {
      return 'SELECT 文（WITH ... SELECT を含む）のみ実行できます。データの変更や削除はできません。';
    }
    if (/multiple statements|more than one statement/i.test(msg)) {
      return '一度に実行できるのは1つのSQL文だけです。';
    }
    return msg || 'SQLを解析できませんでした。';
  } catch {
    return 'SQLを解析できませんでした。';
  }
}

/**
 * ユーザーSQLを data CTE とページングで包み、行取得SQLと件数SQLを生成する。
 * ユーザーSQL末尾の行コメントで閉じ括弧が潰れないよう改行で囲む。
 */
export function buildUserSqlQueries(
  userSql: string,
  tableName: string,
  schema: ColumnSchema[],
  filters: GlobalFilterState | undefined,
  page: number,
  pageSize: number
): { rowsSql: string; countSql: string } {
  const where = filters ? buildWhereClause(filters, schema) : '';
  const cte = `WITH ${escapeIdentifier(USER_SQL_TABLE_ALIAS)} AS (SELECT * FROM ${escapeIdentifier(tableName)} ${where})`;
  const inner = `(\n${userSql}\n) AS user_query`;

  const size = Math.max(1, Math.min(USER_SQL_MAX_PAGE_SIZE, Math.floor(pageSize)));
  const offset = Math.max(0, (Math.max(1, Math.floor(page)) - 1) * size);

  return {
    rowsSql: `${cte}\nSELECT * FROM ${inner}\nLIMIT ${size} OFFSET ${offset}`,
    countSql: `${cte}\nSELECT COUNT(*) AS cnt FROM ${inner}`,
  };
}

export interface SqlTemplate {
  label: string;
  sql: string;
}

function asDateExpr(col: ColumnSchema): string {
  const ident = escapeIdentifier(col.name);
  return /^(DATE|TIMESTAMP)/i.test(col.duckdbType) ? ident : `TRY_CAST(${ident} AS DATE)`;
}

/**
 * スキーマの列ロールから、そのデータで動くクエリテンプレートを組み立てる
 */
export function buildSqlTemplates(schema: ColumnSchema[]): SqlTemplate[] {
  const t = USER_SQL_TABLE_ALIAS;
  const category = schema.find((c) => c.role === 'category');
  const metric = schema.find((c) => c.role === 'metric');
  const date = schema.find((c) => c.role === 'date');
  const key = schema.find((c) => c.role === 'id') ?? schema[0];

  const templates: SqlTemplate[] = [{ label: '先頭100行', sql: `SELECT *\nFROM ${t}\nLIMIT 100` }];

  if (category) {
    const cat = escapeIdentifier(category.name);
    templates.push({
      label: 'カテゴリ別集計',
      sql: metric
        ? `SELECT ${cat}, COUNT(*) AS 件数, SUM(${escapeIdentifier(metric.name)}) AS 合計\nFROM ${t}\nGROUP BY 1\nORDER BY 3 DESC`
        : `SELECT ${cat}, COUNT(*) AS 件数\nFROM ${t}\nGROUP BY 1\nORDER BY 2 DESC`,
    });
  }

  if (date) {
    const month = `DATE_TRUNC('month', ${asDateExpr(date)})`;
    templates.push({
      label: '月次推移',
      sql: metric
        ? `SELECT ${month} AS 月, SUM(${escapeIdentifier(metric.name)}) AS 合計\nFROM ${t}\nGROUP BY 1\nORDER BY 1`
        : `SELECT ${month} AS 月, COUNT(*) AS 件数\nFROM ${t}\nGROUP BY 1\nORDER BY 1`,
    });
  }

  if (metric) {
    templates.push({
      label: '上位10件',
      sql: `SELECT *\nFROM ${t}\nORDER BY ${escapeIdentifier(metric.name)} DESC NULLS LAST\nLIMIT 10`,
    });
  }

  if (key) {
    const k = escapeIdentifier(key.name);
    templates.push({
      label: '重複チェック',
      sql: `SELECT ${k}, COUNT(*) AS 件数\nFROM ${t}\nGROUP BY 1\nHAVING COUNT(*) > 1\nORDER BY 2 DESC`,
    });
  }

  return templates;
}
