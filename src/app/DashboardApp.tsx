import { useEffect, useRef, useState } from 'react';
import { AppHeader, type DashboardSectionTab } from '@/src/components/common/AppHeader';
import { CsvUploadView } from '@/src/features/csv-import/components/CsvUploadView';
import { SAMPLE_DATASETS } from '@/src/features/csv-import/services/sampleDatasets';
import { DashboardWorkspace } from '@/src/features/dashboard/components/DashboardWorkspace';
import { useDashboardState } from '@/src/features/dashboard/hooks/useDashboardState';

export function DashboardApp() {
  const {
    analysis,
    charts,
    chartDataMap,
    chartLoadingMap,
    filters,
    isFiltering,
    tableParams,
    tableResult,
    isTableLoading,
    isLoadingCsv,
    loadProgress,
    errorMessage,
    encodingOption,
    setEncodingOption,
    setErrorMessage,
    handleUploadFile,
    handleLoadSampleDataset,
    handleReloadWithEncoding,
    handleUpdateFilters,
    handleUpdateChart,
    handleDeleteChart,
    handleUpdateTableParams,
    handleResetToUpload,
  } = useDashboardState();

  const [activeTab, setActiveTab] = useState<DashboardSectionTab>('overview');
  const autostartHandledRef = useRef(false);

  useEffect(() => {
    if (autostartHandledRef.current) return;
    autostartHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const sampleParam = params.get('sample');
    const autostart = params.get('autostart') === '1';

    if (sampleParam && SAMPLE_DATASETS.some((s) => s.id === sampleParam)) {
      void handleLoadSampleDataset(sampleParam);
    } else if (autostart) {
      void handleLoadSampleDataset(SAMPLE_DATASETS[0].id);
    }
  }, [handleLoadSampleDataset]);

  return (
    <div id="top" className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <AppHeader
        hasDataset={Boolean(analysis)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onResetToUpload={() => {
          setActiveTab('overview');
          void handleResetToUpload();
        }}
      />

      <div className="flex-1">
        {!analysis ? (
          <CsvUploadView
            encodingOption={encodingOption}
            onChangeEncoding={setEncodingOption}
            onSelectFile={(file) => {
              setActiveTab('overview');
              void handleUploadFile(file);
            }}
            onSelectSample={(id) => {
              setActiveTab('overview');
              void handleLoadSampleDataset(id);
            }}
            isLoading={isLoadingCsv}
            loadProgress={loadProgress}
            errorMessage={errorMessage}
            onDismissError={() => setErrorMessage(null)}
          />
        ) : (
          <DashboardWorkspace
            analysis={analysis}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            charts={charts}
            chartDataMap={chartDataMap}
            chartLoadingMap={chartLoadingMap}
            filters={filters}
            isFiltering={isFiltering}
            tableParams={tableParams}
            tableResult={tableResult}
            isTableLoading={isTableLoading}
            encodingOption={encodingOption}
            onReloadEncoding={(enc) => void handleReloadWithEncoding(enc)}
            onApplyFilters={(next) => void handleUpdateFilters(next)}
            onSaveChart={(cfg) => void handleUpdateChart(cfg)}
            onDeleteChart={handleDeleteChart}
            onUpdateTableParams={(next) => void handleUpdateTableParams(next)}
          />
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        CSV Intelligence Dashboard · すべてのCSV処理はブラウザ内の DuckDB-Wasm で完結し、外部へ送信されません
      </footer>
    </div>
  );
}
