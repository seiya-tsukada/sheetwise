export type SqlRow = Record<string, unknown>;

export interface QueryExecutor {
  query<T extends SqlRow = SqlRow>(sql: string): Promise<T[]>;
  execute(sql: string): Promise<void>;
  getTableColumns(tableName: string): Promise<Array<{ name: string; type: string }>>;
}

export interface CsvLoadProgress {
  stage: 'reading' | 'decoding' | 'initializing_engine' | 'loading_table' | 'ready';
  percent: number;
  message: string;
}
