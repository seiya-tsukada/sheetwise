import { useCallback, useEffect, useRef, useState } from 'react';
import {
  executeChartQuery,
  fetchDataTablePage,
  rerunAnalysisWithFilters,
} from '@/src/features/analysis';
import {
  importCsvBufferAndAnalyze,
  importLocalFileAndAnalyze,
  SupersededLoadError,
} from '@/src/features/csv-import/services/csvImportService';
import { SAMPLE_DATASETS } from '@/src/features/csv-import/services/sampleDatasets';
import { cleanupLoadedCsv } from '@/src/lib/duckdb/csvLoader';
import type { CsvLoadProgress } from '@/src/lib/duckdb/types';
import type {
  AnalysisResult,
  ChartConfig,
  ChartDataResult,
  CsvEncodingOption,
  GlobalFilterState,
  TableQueryParams,
  TableQueryResult,
} from '@/src/types/analysis';

const EMPTY_FILTERS: GlobalFilterState = {
  categoryFilters: {},
  dateFilter: undefined,
  numericFilter: undefined,
};

const INITIAL_TABLE_PARAMS: TableQueryParams = {
  page: 1,
  pageSize: 25,
  search: '',
  sortColumn: undefined,
  sortDirection: 'asc',
  columnFilters: {},
};

export function useDashboardState() {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [chartDataMap, setChartDataMap] = useState<Record<string, ChartDataResult>>({});
  const [chartLoadingMap, setChartLoadingMap] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<GlobalFilterState>(EMPTY_FILTERS);
  const [isFiltering, setIsFiltering] = useState(false);

  const [tableParams, setTableParams] = useState<TableQueryParams>(INITIAL_TABLE_PARAMS);
  const [tableResult, setTableResult] = useState<TableQueryResult | null>(null);
  const [isTableLoading, setIsTableLoading] = useState(false);

  const [isLoadingCsv, setIsLoadingCsv] = useState(false);
  const [loadProgress, setLoadProgress] = useState<CsvLoadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [encodingOption, setEncodingOption] = useState<CsvEncodingOption>('auto');

  const lastBufferRef = useRef<{
    buffer: ArrayBuffer;
    fileName: string;
    fileSizeBytes: number;
  } | null>(null);

  const loadAllCharts = useCallback(
    async (
      targetAnalysis: AnalysisResult,
      chartConfigs: ChartConfig[],
      activeFilters: GlobalFilterState
    ) => {
      const loadingInit: Record<string, boolean> = {};
      for (const c of chartConfigs) {
        loadingInit[c.id] = true;
      }
      setChartLoadingMap(loadingInit);

      const results = await Promise.all(
        chartConfigs.map((cfg) =>
          executeChartQuery(
            targetAnalysis.fileInfo.tableName,
            cfg,
            targetAnalysis.schema,
            activeFilters
          )
        )
      );

      const nextMap: Record<string, ChartDataResult> = {};
      const nextLoading: Record<string, boolean> = {};
      for (const res of results) {
        nextMap[res.chartId] = res;
        nextLoading[res.chartId] = false;
      }
      setChartDataMap(nextMap);
      setChartLoadingMap(nextLoading);
    },
    []
  );

  const refreshTable = useCallback(
    async (
      targetAnalysis: AnalysisResult,
      activeFilters: GlobalFilterState,
      params: TableQueryParams
    ) => {
      setIsTableLoading(true);
      try {
        const res = await fetchDataTablePage(
          targetAnalysis.fileInfo.tableName,
          targetAnalysis.schema,
          activeFilters,
          params
        );
        setTableResult(res);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'データテーブルの取得に失敗しました'
        );
      } finally {
        setIsTableLoading(false);
      }
    },
    []
  );

  const applyNewAnalysis = useCallback(
    async (nextAnalysis: AnalysisResult) => {
      setAnalysis(nextAnalysis);
      setCharts(nextAnalysis.recommendedCharts);
      setFilters(EMPTY_FILTERS);
      setTableParams(INITIAL_TABLE_PARAMS);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
      await Promise.all([
        loadAllCharts(nextAnalysis, nextAnalysis.recommendedCharts, EMPTY_FILTERS),
        refreshTable(nextAnalysis, EMPTY_FILTERS, INITIAL_TABLE_PARAMS),
      ]);
    },
    [loadAllCharts, refreshTable]
  );

  const handleUploadFile = useCallback(
    async (file: File, encodingOverride?: CsvEncodingOption) => {
      const enc = encodingOverride ?? encodingOption;
      setIsLoadingCsv(true);
      setErrorMessage(null);
      setLoadProgress({
        stage: 'reading',
        percent: 5,
        message: `${file.name} を読み込んでいます...`,
      });

      try {
        const buffer = await file.arrayBuffer();
        lastBufferRef.current = {
          buffer,
          fileName: file.name,
          fileSizeBytes: file.size,
        };
        const result = await importLocalFileAndAnalyze(file, enc, setLoadProgress);
        await applyNewAnalysis(result);
      } catch (err) {
        if (err instanceof SupersededLoadError) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'CSVファイルの読み込みに失敗しました。'
        );
      } finally {
        setIsLoadingCsv(false);
      }
    },
    [applyNewAnalysis, encodingOption]
  );

  const handleLoadSampleDataset = useCallback(
    async (sampleId: string) => {
      const sample = SAMPLE_DATASETS.find((s) => s.id === sampleId);
      if (!sample) return;

      setIsLoadingCsv(true);
      setErrorMessage(null);
      setLoadProgress({
        stage: 'reading',
        percent: 10,
        message: `サンプルデータ「${sample.name}」を読み込んでいます...`,
      });

      try {
        const encoded = new TextEncoder().encode(sample.csvContent);
        const buffer = encoded.buffer.slice(
          encoded.byteOffset,
          encoded.byteOffset + encoded.byteLength
        );
        lastBufferRef.current = {
          buffer,
          fileName: sample.fileName,
          fileSizeBytes: buffer.byteLength,
        };
        const result = await importCsvBufferAndAnalyze({
          buffer,
          fileName: sample.fileName,
          fileSizeBytes: buffer.byteLength,
          encodingOption: 'utf-8',
          onProgress: setLoadProgress,
        });
        await applyNewAnalysis(result);
      } catch (err) {
        if (err instanceof SupersededLoadError) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'サンプルデータの読み込みに失敗しました。'
        );
      } finally {
        setIsLoadingCsv(false);
      }
    },
    [applyNewAnalysis]
  );

  const handleReloadWithEncoding = useCallback(
    async (nextEncoding: CsvEncodingOption) => {
      setEncodingOption(nextEncoding);
      if (!lastBufferRef.current) return;
      const { buffer, fileName, fileSizeBytes } = lastBufferRef.current;

      setIsLoadingCsv(true);
      setErrorMessage(null);
      try {
        const result = await importCsvBufferAndAnalyze({
          buffer,
          fileName,
          fileSizeBytes,
          encodingOption: nextEncoding,
          onProgress: setLoadProgress,
        });
        await applyNewAnalysis(result);
      } catch (err) {
        if (err instanceof SupersededLoadError) return;
        setErrorMessage(
          err instanceof Error ? err.message : '文字コードの再読み込みに失敗しました。'
        );
      } finally {
        setIsLoadingCsv(false);
      }
    },
    [applyNewAnalysis]
  );

  const handleUpdateFilters = useCallback(
    async (nextFilters: GlobalFilterState) => {
      if (!analysis) return;
      setFilters(nextFilters);
      setIsFiltering(true);
      const resetPageParams: TableQueryParams = { ...tableParams, page: 1 };
      setTableParams(resetPageParams);

      try {
        const nextAnalysis = await rerunAnalysisWithFilters(
          analysis.fileInfo,
          analysis.schema,
          nextFilters,
          charts
        );
        setAnalysis(nextAnalysis);
        await Promise.all([
          loadAllCharts(nextAnalysis, charts, nextFilters),
          refreshTable(nextAnalysis, nextFilters, resetPageParams),
        ]);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'フィルター再計算中にエラーが発生しました。'
        );
      } finally {
        setIsFiltering(false);
      }
    },
    [analysis, charts, loadAllCharts, refreshTable, tableParams]
  );

  const handleUpdateChart = useCallback(
    async (updatedConfig: ChartConfig) => {
      if (!analysis) return;
      const exists = charts.some((c) => c.id === updatedConfig.id);
      const nextCharts = exists
        ? charts.map((c) => (c.id === updatedConfig.id ? updatedConfig : c))
        : [...charts, updatedConfig];

      setCharts(nextCharts);
      setChartLoadingMap((prev) => ({ ...prev, [updatedConfig.id]: true }));

      const res = await executeChartQuery(
        analysis.fileInfo.tableName,
        updatedConfig,
        analysis.schema,
        filters
      );
      setChartDataMap((prev) => ({ ...prev, [updatedConfig.id]: res }));
      setChartLoadingMap((prev) => ({ ...prev, [updatedConfig.id]: false }));
    },
    [analysis, charts, filters]
  );

  const handleDeleteChart = useCallback((chartId: string) => {
    setCharts((prev) => prev.filter((c) => c.id !== chartId));
    setChartDataMap((prev) => {
      const next = { ...prev };
      delete next[chartId];
      return next;
    });
  }, []);

  const handleUpdateTableParams = useCallback(
    async (nextParams: TableQueryParams) => {
      setTableParams(nextParams);
      if (!analysis) return;
      await refreshTable(analysis, filters, nextParams);
    },
    [analysis, filters, refreshTable]
  );

  const handleResetToUpload = useCallback(async () => {
    await cleanupLoadedCsv();
    lastBufferRef.current = null;
    setAnalysis(null);
    setCharts([]);
    setChartDataMap({});
    setFilters(EMPTY_FILTERS);
    setTableResult(null);
    setErrorMessage(null);
    setLoadProgress(null);
  }, []);

  useEffect(() => {
    return () => {
      void cleanupLoadedCsv();
    };
  }, []);

  return {
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
  };
}
