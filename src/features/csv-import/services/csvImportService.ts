import { runInitialAnalysis } from '@/src/features/analysis';
import { loadCsvFileIntoDuckDB } from '@/src/lib/duckdb/csvLoader';
import type { CsvLoadProgress } from '@/src/lib/duckdb/types';
import type { AnalysisResult, CsvEncodingOption, DatasetFileInfo } from '@/src/types/analysis';

let activeLoadSequence = 0;

export class SupersededLoadError extends Error {
  constructor() {
    super('別のファイル読み込みが開始されたため、この読み込みはキャンセルされました。');
    this.name = 'SupersededLoadError';
  }
}

export async function importCsvBufferAndAnalyze(params: {
  buffer: ArrayBuffer;
  fileName: string;
  fileSizeBytes: number;
  encodingOption: CsvEncodingOption;
  onProgress?: (progress: CsvLoadProgress) => void;
}): Promise<AnalysisResult> {
  const sequenceId = ++activeLoadSequence;

  const ensureCurrent = () => {
    if (sequenceId !== activeLoadSequence) {
      throw new SupersededLoadError();
    }
  };

  params.onProgress?.({
    stage: 'reading',
    percent: 10,
    message: 'ローカルCSVファイルを読み込んでいます...',
  });

  const loadResult = await loadCsvFileIntoDuckDB(
    params.buffer,
    params.fileName,
    params.encodingOption,
    (prog) => {
      if (sequenceId === activeLoadSequence) {
        params.onProgress?.(prog);
      }
    }
  );

  ensureCurrent();

  const fileInfo: DatasetFileInfo = {
    fileName: params.fileName,
    fileSizeBytes: params.fileSizeBytes,
    encodingUsed: params.encodingOption,
    detectedEncoding: loadResult.detectedEncoding,
    tableName: loadResult.tableName,
    loadedAt: new Date().toISOString(),
  };

  const analysis = await runInitialAnalysis(fileInfo);
  ensureCurrent();

  return analysis;
}

export async function importLocalFileAndAnalyze(
  file: File,
  encodingOption: CsvEncodingOption,
  onProgress?: (progress: CsvLoadProgress) => void
): Promise<AnalysisResult> {
  if (!file) {
    throw new Error('ファイルが選択されていません。');
  }
  const buffer = await file.arrayBuffer();
  return importCsvBufferAndAnalyze({
    buffer,
    fileName: file.name,
    fileSizeBytes: file.size,
    encodingOption,
    onProgress,
  });
}
