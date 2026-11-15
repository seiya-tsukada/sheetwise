import { useRef, useState } from 'react';
import { AlertCircle, FileSpreadsheet, Loader2, ShieldCheck, Upload } from 'lucide-react';
import type { CsvLoadProgress } from '@/src/lib/duckdb/types';
import type { CsvEncodingOption } from '@/src/types/analysis';

interface CsvUploadViewProps {
  encodingOption: CsvEncodingOption;
  onChangeEncoding: (enc: CsvEncodingOption) => void;
  onSelectFile: (file: File) => void;
  isLoading: boolean;
  loadProgress: CsvLoadProgress | null;
  errorMessage: string | null;
  onDismissError: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export function CsvUploadView({
  encodingOption,
  onChangeEncoding,
  onSelectFile,
  isLoading,
  loadProgress,
  errorMessage,
  onDismissError,
}: CsvUploadViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (isLoading || !files || files.length === 0) return;
    const file = files[0];
    setSelectedFileMeta({ name: file.name, size: file.size });
    onSelectFile(file);
  };

  const openPicker = () => {
    if (!isLoading) fileInputRef.current?.click();
  };

  const percent = loadProgress?.percent ?? 0;

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            CSVファイルを読み込む
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            ファイルを置くと、型・品質・傾向を自動で分析してグラフを作成します
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            aria-hidden="true"
            tabIndex={-1}
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {/* ドロップゾーン全体がクリック可能 */}
          <div
            role="button"
            tabIndex={isLoading ? -1 : 0}
            aria-label="CSVファイルを選択、またはここにドラッグ＆ドロップ"
            aria-disabled={isLoading}
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              dragDepth.current += 1;
              if (!isLoading) setIsDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              dragDepth.current = 0;
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`group flex min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 ${
              isLoading
                ? 'cursor-progress border-blue-300 bg-blue-50/40'
                : isDragging
                  ? 'cursor-copy border-blue-500 bg-blue-50'
                  : 'cursor-pointer border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/30'
            }`}
          >
            {isLoading ? (
              <div role="status" aria-live="polite" className="w-full max-w-sm">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
                {selectedFileMeta && (
                  <p className="mt-4 truncate text-sm font-semibold text-slate-900">
                    {selectedFileMeta.name}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>{loadProgress?.message ?? '読み込み中...'}</span>
                  <span className="font-mono tabular-nums">{percent}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full bg-blue-600 transition-all duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
                    isDragging
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 ring-1 ring-slate-200 group-hover:ring-blue-300'
                  }`}
                >
                  <Upload className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-5 text-base font-semibold text-slate-900">
                  {isDragging ? 'ここでドロップして読み込み' : 'CSVファイルをドラッグ＆ドロップ'}
                </p>
                <p className="mt-1 text-sm text-slate-500">または</p>
                <span className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-blue-700">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  ファイルを選択
                </span>
                <p className="mt-4 text-xs text-slate-500">
                  ヘッダー行付きの .csv（UTF-8 / UTF-8 BOM / Shift_JIS）
                </p>
              </>
            )}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">読み込みに失敗しました</p>
                  <p className="mt-0.5 text-xs text-red-800">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                className="shrink-0 cursor-pointer text-xs font-medium text-red-700 underline hover:text-red-900"
              >
                閉じる
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>ブラウザ内でのみ処理され、外部へは送信されません</span>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="encoding-select"
                className="whitespace-nowrap text-xs font-medium text-slate-600"
              >
                文字コード
              </label>
              <select
                id="encoding-select"
                value={encodingOption}
                onChange={(e) => onChangeEncoding(e.target.value as CsvEncodingOption)}
                disabled={isLoading}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="auto">自動判定（推奨）</option>
                <option value="utf-8">UTF-8 / BOM</option>
                <option value="shift_jis">Shift_JIS</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
