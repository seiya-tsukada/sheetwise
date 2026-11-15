import { createElement } from 'react';
import type { ChartConfig, ChartDataResult } from '@/src/types/analysis';
import { ChartRenderer } from './components/ChartRenderer';

export interface CreateChartElementParams {
  config: ChartConfig;
  data?: ChartDataResult;
  loading?: boolean;
}

export function createChartComponent({ config, data, loading }: CreateChartElementParams) {
  return createElement(ChartRenderer, { config, result: data, loading });
}
