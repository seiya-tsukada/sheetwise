import { useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Plus, ShieldCheck } from 'lucide-react';
import { ChartCard } from '@/src/components/charts/ChartCard';
import { ChartEditorModal } from '@/src/components/charts/ChartEditorModal';
import type { DashboardSectionTab } from '@/src/components/common/AppHeader';
import { FilterBar } from '@/src/components/dashboard/FilterBar';
import { InsightsSection } from '@/src/components/dashboard/InsightsSection';
import { KpiStrip } from '@/src/components/dashboard/KpiStrip';
import { SchemaProfilePanel } from '@/src/components/dashboard/SchemaProfilePanel';
import { DataTableView } from '@/src/components/data-table/DataTableView';
import type {
  AnalysisResult,
  ChartConfig,
  ChartDataResult,
  CsvEncodingOption,
  GlobalFilterState,
  TableQueryParams,
  TableQueryResult,
} from '@/src/types/analysis';

interface DashboardWorkspaceProps {
  analysis: AnalysisResult;
  activeTab: DashboardSectionTab;
  onChangeTab: (tab: DashboardSectionTab) => void;
  charts: ChartConfig[];
  chartDataMap: Record<string, ChartDataResult>;
  chartLoadingMap: Record<string, boolean>;
  filters: GlobalFilterState;
  isFiltering: boolean;
  tableParams: TableQueryParams;
  tableResult: TableQueryResult | null;
  isTableLoading: boolean;
  encodingOption: CsvEncodingOption;
  onReloadEncoding: (enc: CsvEncodingOption) => void;
  onApplyFilters: (next: GlobalFilterState) => void;
  onSaveChart: (cfg: ChartConfig) => void;
  onDeleteChart: (chartId: string) => void;
  onUpdateTableParams: (next: TableQueryParams) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DashboardWorkspace({
  analysis,
  activeTab,
  onChangeTab,
  charts,
  chartDataMap,
  chartLoadingMap,
  filters,
  isFiltering,
  tableParams,
  tableResult,
  isTableLoading,
  encodingOption,
  onReloadEncoding,
  onApplyFilters,
  onSaveChart,
  onDeleteChart,
  onUpdateTableParams,
}: DashboardWorkspaceProps) {
  const [editingChart, setEditingChart] = useState<ChartConfig | null>(null);
  const [isAddingChart, setIsAddingChart] = useState(false);
  const [highlightedChartId, setHighlightedChartId] = useState<string | null>(null);

  const handleFocusChart = (chartId: string) => {
    onChangeTab('overview');
    setHighlightedChartId(chartId);
    window.setTimeout(() => {
      const el = document.getElementById(chartId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    window.setTimeout(() => {
      setHighlightedChartId((curr) => (curr === chartId ? null : curr));
    }, 2400);
  };

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* ファイル情報 & データ概要ヘッダー */}
      <section
        aria-label="ファイル概要"
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <FileSpreadsheet className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
            <span className="font-mono font-semibold text-slate-900 truncate">
              {analysis.fileInfo.fileName}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatFileSize(analysis.fileInfo.fileSizeBytes)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {analysis.profile.overview.totalRows.toLocaleString('ja-JP')} 行 ×{' '}
              {analysis.profile.overview.totalColumns} カラム
            </span>
            <span aria-hidden="true">·</span>
            <span>文字コード: {analysis.fileInfo.detectedEncoding}</span>
          </div>

          {analysis.profile.overview.warnings.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-amber-800">
              <span className="inline-flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                品質アラート:
              </span>
              {analysis.profile.overview.warnings.map((w, idx) => (
                <span key={idx}>{w}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="workspace-encoding" className="text-xs text-slate-500 whitespace-nowrap">
              文字コード切替
            </label>
            <select
              id="workspace-encoding"
              value={encodingOption}
              onChange={(e) => onReloadEncoding(e.target.value as CsvEncodingOption)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none"
            >
              <option value="auto">自動判定</option>
              <option value="utf-8">UTF-8</option>
              <option value="shift_jis">Shift_JIS</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 whitespace-nowrap">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ローカル処理中</span>
          </div>
        </div>
      </section>

      {analysis.partialErrors.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900"
        >
          一部の補助分析でエラーが発生しましたが、利用可能な分析結果は正常に表示されています（
          {analysis.partialErrors[0]}）
        </div>
      )}

      {/* 全体フィルター */}
      <FilterBar
        analysis={analysis}
        filters={filters}
        onApplyFilters={onApplyFilters}
        isFiltering={isFiltering}
      />

      {/* KPIカード */}
      <KpiStrip kpis={analysis.kpis} isUpdating={isFiltering} />

      {/* タブに応じたコンテンツ表示 */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 推奨グラフセクション */}
          <section aria-label="可視化ダッシュボード" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  推奨可視化グラフ（{charts.length}件）
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  データ構造とカーディナリティに基づき自動選定されたグラフです。設定や追加も自由に行えます。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingChart(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>グラフを追加</span>
              </button>
            </div>

            {charts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                <p className="text-sm font-medium text-slate-800">
                  自動推薦できる有効なグラフが見つかりませんでした
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  「グラフを追加」ボタンからX軸・Y軸を指定してカスタムグラフを作成できます。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {charts.map((chart) => (
                  <ChartCard
                    key={chart.id}
                    config={chart}
                    data={chartDataMap[chart.id]}
                    loading={chartLoadingMap[chart.id]}
                    isHighlighted={highlightedChartId === chart.id}
                    onEdit={(cfg) => setEditingChart(cfg)}
                    onDelete={onDeleteChart}
                  />
                ))}
              </div>
            )}
          </section>

          {/* インサイト */}
          <InsightsSection insights={analysis.insights} onFocusChart={handleFocusChart} />

          {/* データテーブル */}
          <DataTableView
            schema={analysis.schema}
            params={tableParams}
            result={tableResult}
            loading={isTableLoading}
            onChangeParams={onUpdateTableParams}
          />
        </div>
      )}

      {activeTab === 'charts' && (
        <section aria-label="グラフ分析" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                インタラクティブ・グラフワークスペース（{charts.length}件）
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                軸・集計方法・並び替え・表示件数を変更するとDuckDBクエリが即座に再実行されます
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingChart(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>グラフを追加</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {charts.map((chart) => (
              <ChartCard
                key={chart.id}
                config={chart}
                data={chartDataMap[chart.id]}
                loading={chartLoadingMap[chart.id]}
                isHighlighted={highlightedChartId === chart.id}
                onEdit={(cfg) => setEditingChart(cfg)}
                onDelete={onDeleteChart}
              />
            ))}
          </div>
        </section>
      )}

      {activeTab === 'schema' && <SchemaProfilePanel analysis={analysis} />}

      {activeTab === 'table' && (
        <DataTableView
          schema={analysis.schema}
          params={tableParams}
          result={tableResult}
          loading={isTableLoading}
          onChangeParams={onUpdateTableParams}
        />
      )}

      {/* グラフ編集・新規追加モーダル */}
      {(editingChart || isAddingChart) && (
        <ChartEditorModal
          initialConfig={editingChart}
          isNew={isAddingChart}
          schema={analysis.schema}
          onSave={(saved) => {
            onSaveChart(saved);
            setEditingChart(null);
            setIsAddingChart(false);
          }}
          onClose={() => {
            setEditingChart(null);
            setIsAddingChart(false);
          }}
        />
      )}
    </main>
  );
}
