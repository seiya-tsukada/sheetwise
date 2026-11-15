import { useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Database,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { CsvLoadProgress } from '@/src/lib/duckdb/types';
import type { CsvEncodingOption } from '@/src/types/analysis';
import { SAMPLE_DATASETS } from '../services/sampleDatasets';

interface CsvUploadViewProps {
  encodingOption: CsvEncodingOption;
  onChangeEncoding: (enc: CsvEncodingOption) => void;
  onSelectFile: (file: File) => void;
  onSelectSample: (sampleId: string) => void;
  isLoading: boolean;
  loadProgress: CsvLoadProgress | null;
  errorMessage: string | null;
  onDismissError: () => void;
}

export function CsvUploadView({
  encodingOption,
  onChangeEncoding,
  onSelectFile,
  onSelectSample,
  isLoading,
  loadProgress,
  errorMessage,
  onDismissError,
}: CsvUploadViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setSelectedFileMeta({ name: file.name, size: file.size });
    onSelectFile(file);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
      {/* ヒーロー & アップロードエリア */}
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col justify-center lg:col-span-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-blue-700">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>完全ブラウザ内処理 · 外部サーバー送信なし</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl [text-wrap:balance]">
            CSVを置くだけで、データ構造を自律理解し可視化する
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            ローカルのCSVファイルをアップロードすると、ブラウザ内のDuckDB-Wasmエンジンがカラムの型・役割・品質・統計・相関・時系列推移を自動分析し、インサイトと最適なグラフ群を生成します。
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-200 pt-6">
            <div>
              <dt className="text-xs text-slate-500">分析エンジン</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                DuckDB-Wasm
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">対応文字コード</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                UTF-8 / SJIS
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">外部通信</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-emerald-700">
                0 Byte (Local)
              </dd>
            </div>
          </dl>
        </div>

        {/* 右側アップロードゾーン */}
        <div id="upload-zone" className="lg:col-span-7">
          <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    ローカルCSVファイルの読み込み
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ヘッダー行付きのCSVファイル（UTF-8 / UTF-8 BOM / Shift_JIS）に対応
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="encoding-select"
                    className="text-xs font-medium text-slate-600 whitespace-nowrap"
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

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                className={`mt-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/60'
                    : 'border-slate-300 bg-slate-50/50 hover:border-slate-400'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-600">
                  <Upload className="h-5 w-5" aria-hidden="true" />
                </div>

                <p className="mt-4 text-sm font-semibold text-slate-900">
                  CSVファイルをここにドラッグ＆ドロップ
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  または下のボタンからローカルのファイルを選択してください
                </p>

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

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                  <span>{isLoading ? '読み込み・分析中...' : 'CSVファイルを選択'}</span>
                </button>

                {selectedFileMeta && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-600 tabular-nums">
                    <span className="font-medium text-slate-800">{selectedFileMeta.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytes(selectedFileMeta.size)}</span>
                  </div>
                )}
              </div>

              {/* 読み込みプログレス */}
              {isLoading && loadProgress && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 p-4"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-blue-900">
                    <span>{loadProgress.message}</span>
                    <span className="font-mono tabular-nums">{loadProgress.percent}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full bg-blue-600 transition-all duration-200"
                      style={{ width: `${loadProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* エラー表示 */}
              {errorMessage && (
                <div
                  role="alert"
                  className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-semibold">CSV読み込みエラー</p>
                      <p className="mt-0.5 text-xs text-red-800">{errorMessage}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="text-xs font-medium text-red-700 hover:text-red-900 underline shrink-0 cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>
                ファイルはブラウザのメモリ上でのみ処理され、外部サーバーやLLM APIへ送信されることはありません。
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* サンプルデータ検証セクション */}
      <section id="sample-datasets" className="mt-12 border-t border-slate-200 pt-10">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              サンプルCSVデータで動作を確認する
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              データ構造の違いに応じてKPI・インサイト・グラフ推薦がどう変化するかを即座に試せます
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SAMPLE_DATASETS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              disabled={isLoading}
              onClick={() => onSelectSample(sample.id)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/20 disabled:opacity-60 cursor-pointer"
            >
              <div>
                <p className="font-mono text-[11px] text-slate-500">{sample.fileName}</p>
                <h3 className="mt-1.5 font-display text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                  {sample.name}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {sample.description}
                </p>
              </div>
              <span className="mt-4 inline-flex items-center text-xs font-semibold text-blue-600">
                このデータで分析を実行 →
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 利用方法・仕組み */}
      <section id="how-it-works" className="mt-12 border-t border-slate-200 pt-10">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          自律分析パイプラインの仕組み
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Database className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span>01. スキーマ・役割の自動推定</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              DuckDB-WasmでCSVを取り込み、数値・日付・カテゴリ・IDカラムを自動識別します。顧客IDや注文IDを誤って売上指標として合計しないよう設計されています。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span>02. ルールベース統計・品質診断</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              欠損率・重複行・IQR外れ値・分布の偏り・カテゴリ集中度・ピアソン相関・時系列の前期間比をSQL集計で算出し、数値根拠付きのインサイトを生成します。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BarChart3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span>03. グラフ推薦と対話的探索</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              データの型とカーディナリティに応じて折れ線・棒・散布図・ヒストグラム・円グラフを自動選定。グラフの種類や軸・集計方法の変更も即座にDuckDBを再実行して反映します。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
