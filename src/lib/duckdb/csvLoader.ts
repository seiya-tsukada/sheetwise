import type { CsvEncodingOption, DetectedEncodingLabel } from '@/src/types/analysis';
import { decodeCsvBytes } from './csvDecoder';
import { duckdbClient } from './duckdbClient';
import { getOrInitDuckDB } from './duckdbInitializer';
import { escapeIdentifier, escapeLiteral, generateSafeTableName } from './queryBuilder';
import type { CsvLoadProgress } from './types';

export { decodeCsvBytes, type DecodedCsvPayload } from './csvDecoder';

export interface LoadCsvResult {
  tableName: string;
  detectedEncoding: DetectedEncodingLabel;
  rowCount: number;
  columnCount: number;
}

let activeVirtualFile: string | null = null;
let activeTableName: string | null = null;

/**
 * 以前のCSVデータとテーブルをDuckDBからクリーンアップする
 */
export async function cleanupLoadedCsv(): Promise<void> {
  if (activeTableName) {
    try {
      await duckdbClient.dropTable(activeTableName);
    } catch {
      // ignore
    }
    activeTableName = null;
  }
  if (activeVirtualFile) {
    try {
      const db = await getOrInitDuckDB();
      await db.dropFile(activeVirtualFile);
    } catch {
      // ignore
    }
    activeVirtualFile = null;
  }
}

/**
 * ブラウザ上のCSVバイト列をDuckDB-Wasmへ登録し、テーブルを生成する
 */
export async function loadCsvFileIntoDuckDB(
  buffer: ArrayBuffer,
  fileName: string,
  encodingOption: CsvEncodingOption,
  onProgress?: (progress: CsvLoadProgress) => void
): Promise<LoadCsvResult> {
  onProgress?.({
    stage: 'decoding',
    percent: 20,
    message: '文字コードを確認し、CSVデータを前処理しています...',
  });

  const rawBytes = new Uint8Array(buffer);
  const { text, detectedEncoding } = decodeCsvBytes(rawBytes, encodingOption);
  const utf8Bytes = new TextEncoder().encode(text);

  onProgress?.({
    stage: 'initializing_engine',
    percent: 45,
    message: 'DuckDB-Wasm 分析エンジンを初期化しています...',
  });

  const db = await getOrInitDuckDB();

  // 前回データをクリーンアップ
  await cleanupLoadedCsv();

  onProgress?.({
    stage: 'loading_table',
    percent: 70,
    message: 'DuckDB テーブルへ高速インポートしています...',
  });

  const tableName = generateSafeTableName('csv_tbl');
  const virtualFileName = `upload_${Date.now()}.csv`;

  try {
    await db.registerFileBuffer(virtualFileName, utf8Bytes);
    activeVirtualFile = virtualFileName;

    const tblIdent = escapeIdentifier(tableName);
    const fileLit = escapeLiteral(virtualFileName);

    try {
      await duckdbClient.execute(`
        CREATE TABLE ${tblIdent} AS
        SELECT * FROM read_csv_auto(${fileLit}, header=true, normalize_names=false, ignore_errors=false)
      `);
    } catch {
      // 一部不正行を含むCSVに対するフォールバック
      await duckdbClient.execute(`DROP TABLE IF EXISTS ${tblIdent}`);
      await duckdbClient.execute(`
        CREATE TABLE ${tblIdent} AS
        SELECT * FROM read_csv_auto(${fileLit}, header=true, normalize_names=false, ignore_errors=true, all_varchar=false)
      `);
    }

    activeTableName = tableName;

    const cols = await duckdbClient.getTableColumns(tableName);
    const countRows = await duckdbClient.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM ${tblIdent}`
    );
    const rowCount = Number(countRows[0]?.cnt ?? 0);

    if (cols.length === 0 || rowCount === 0) {
      await cleanupLoadedCsv();
      throw new Error(
        'CSVから有効なレコードを読み込めませんでした。区切り文字やヘッダー構造を確認してください。'
      );
    }

    onProgress?.({
      stage: 'ready',
      percent: 100,
      message: 'CSVデータの読み込みが完了しました。',
    });

    return {
      tableName,
      detectedEncoding,
      rowCount,
      columnCount: cols.length,
    };
  } catch (error) {
    await cleanupLoadedCsv();
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`CSVファイルの読み込みに失敗しました (${fileName})`);
  }
}
