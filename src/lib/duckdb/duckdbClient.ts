import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { getOrInitDuckDB } from './duckdbInitializer';
import { escapeIdentifier } from './queryBuilder';
import type { QueryExecutor, SqlRow } from './types';

function normalizeArrowValue(val: unknown, fieldType?: { typeId?: number; toString?: () => string }): unknown {
  if (val === null || val === undefined) return null;

  const typeId = fieldType?.typeId;
  const typeStr = fieldType?.toString ? fieldType.toString() : '';

  if (typeId === 8 || typeStr.startsWith('Date')) {
    const ms = typeof val === 'bigint' ? Number(val) : typeof val === 'number' ? val : NaN;
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  if (typeId === 10 || typeStr.startsWith('Timestamp')) {
    const ms = typeof val === 'bigint' ? Number(val) : typeof val === 'number' ? val : NaN;
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
    }
  }

  if (typeof val === 'bigint') {
    return Number(val);
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'object') {
    const str = String(val);
    if (str !== '[object Object]') return str;
  }
  return val;
}

export function translateSqlError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/Conversion Error|Could not convert/i.test(raw)) {
    return 'データ型の変換中にエラーが発生しました。数値または日付フォーマットが混在している可能性があります。';
  }
  if (/Parser Error|syntax error/i.test(raw)) {
    return 'クエリ構文エラーが発生しました。カラム名やフィルター条件を確認してください。';
  }
  if (/Out of Memory|memory/i.test(raw)) {
    return 'ブラウザのメモリ上限に近づきました。データ件数を絞るか、より小さいファイルでお試しください。';
  }
  if (/CSV|Invalid Input Error/i.test(raw)) {
    return 'CSVの形式を解析できませんでした。文字コード（UTF-8 / Shift_JIS）や区切り文字・引用符を確認してください。';
  }
  return `分析クエリの実行中にエラーが発生しました: ${raw}`;
}

class DuckDBClient implements QueryExecutor {
  private connection: AsyncDuckDBConnection | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private async getConnection(): Promise<AsyncDuckDBConnection> {
    const db = await getOrInitDuckDB();
    if (!this.connection) {
      this.connection = await db.connect();
    }
    return this.connection;
  }

  /**
   * 単一接続へのクエリを直列化して競合を防ぐ
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  async query<T extends SqlRow = SqlRow>(sql: string): Promise<T[]> {
    return this.enqueue(async () => {
      try {
        const conn = await this.getConnection();
        const result = await conn.query(sql);
        const rows: T[] = [];
        const numRows = result.numRows;
        const fields = result.schema.fields;

        for (let r = 0; r < numRows; r++) {
          const obj: Record<string, unknown> = {};
          for (let c = 0; c < fields.length; c++) {
            const colVec = result.getChildAt(c);
            const rawVal = colVec ? colVec.get(r) : null;
            obj[fields[c].name] = normalizeArrowValue(rawVal, fields[c].type);
          }
          rows.push(obj as T);
        }
        return rows;
      } catch (err) {
        throw new Error(translateSqlError(err));
      }
    });
  }

  async execute(sql: string): Promise<void> {
    return this.enqueue(async () => {
      try {
        const conn = await this.getConnection();
        await conn.query(sql);
      } catch (err) {
        throw new Error(translateSqlError(err));
      }
    });
  }

  async getTableColumns(tableName: string): Promise<Array<{ name: string; type: string }>> {
    const rows = await this.query<{ column_name: string; column_type: string }>(
      `DESCRIBE ${escapeIdentifier(tableName)}`
    );
    return rows.map((r) => ({
      name: String(r.column_name),
      type: String(r.column_type),
    }));
  }

  async dropTable(tableName: string): Promise<void> {
    await this.execute(`DROP TABLE IF EXISTS ${escapeIdentifier(tableName)}`);
  }

  async close(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
      } catch {
        // ignore close errors
      }
      this.connection = null;
    }
  }
}

export const duckdbClient = new DuckDBClient();
