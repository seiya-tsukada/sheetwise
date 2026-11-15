import type { ChartConfig, ChartDataResult } from '@/src/types/analysis';

type SqlRow = Record<string, unknown>;
type ChartDatum = Record<string, string | number | null>;

const MISSING_LABEL = '(欠損)';
const COUNT_SERIES_LABEL = '件数';

/**
 * SQL 集計結果（x_label / y_value / ... 列）を Recharts 用データに変換するストラテジー
 */
interface ChartDataTransformer {
  id: string;
  matches: (config: ChartConfig) => boolean;
  transform: (config: ChartConfig, rows: SqlRow[]) => ChartDataResult;
}

const label = (value: unknown) => String(value ?? MISSING_LABEL);
/** NULL は 0 とみなす（undefined は Number() に任せる既存挙動を維持） */
const nullAsZero = (value: unknown) => (value === null ? 0 : Number(value));

/** 散布図: {x, y} の点列 */
const scatterTransformer: ChartDataTransformer = {
  id: 'scatter',
  matches: (config) => config.type === 'scatter',
  transform: (config, rows) => ({
    chartId: config.id,
    data: rows.map((r) => ({
      x: Number(r.x_value ?? 0),
      y: Number(r.y_value ?? 0),
    })),
    seriesKeys: ['y'],
    xAxisLabel: config.xAxis,
    yAxisLabel: config.yAxis,
  }),
};

/** グループ化棒グラフ: (x_label, group_label) の縦持ちを x ごとの横持ちにピボット */
const groupedBarTransformer: ChartDataTransformer = {
  id: 'grouped_bar',
  matches: (config) => config.type === 'grouped_bar' && Boolean(config.groupBy),
  transform: (config, rows) => {
    const byX = new Map<string, ChartDatum>();
    const groups = new Set<string>();

    for (const r of rows) {
      const xLabel = label(r.x_label);
      const gLabel = label(r.group_label);
      groups.add(gLabel);

      const entry = byX.get(xLabel) ?? { name: xLabel };
      byX.set(xLabel, entry);
      entry[gLabel] = Number(r.y_value ?? 0);
    }

    const seriesKeys = Array.from(groups);
    const data = Array.from(byX.values()).map((row) => {
      for (const k of seriesKeys) {
        if (row[k] === undefined) row[k] = 0;
      }
      return row;
    });

    return {
      chartId: config.id,
      data,
      seriesKeys,
      xAxisLabel: config.xAxis,
      yAxisLabel: `${config.yAxis} (${config.aggregation})`,
    };
  },
};

/** 単系列 / 2系列の集計（棒・円・折れ線・ヒストグラム） */
const seriesTransformer: ChartDataTransformer = {
  id: 'series',
  matches: () => true,
  transform: (config, rows) => {
    const primaryKey =
      config.aggregation === 'COUNT' && config.yAxis === '*'
        ? COUNT_SERIES_LABEL
        : `${config.yAxis} (${config.aggregation})`;
    const secondaryKey = config.secondaryYAxis
      ? `${config.secondaryYAxis} (${config.aggregation})`
      : undefined;

    const data = rows.map((r) => {
      const item: ChartDatum = {
        name: label(r.x_label),
        [primaryKey]: nullAsZero(r.y_value),
      };
      if (secondaryKey) {
        item[secondaryKey] = nullAsZero(r.y_value_2);
      }
      return item;
    });

    return {
      chartId: config.id,
      data,
      seriesKeys: secondaryKey ? [primaryKey, secondaryKey] : [primaryKey],
      xAxisLabel: config.xAxis,
      yAxisLabel: primaryKey,
    };
  },
};

export const CHART_DATA_TRANSFORMERS: readonly ChartDataTransformer[] = [
  scatterTransformer,
  groupedBarTransformer,
  seriesTransformer,
];

export function toChartData(config: ChartConfig, rows: SqlRow[]): ChartDataResult {
  const transformer = CHART_DATA_TRANSFORMERS.find((t) => t.matches(config)) ?? seriesTransformer;
  return transformer.transform(config, rows);
}

export function toChartErrorResult(config: ChartConfig, message: string): ChartDataResult {
  return {
    chartId: config.id,
    data: [],
    seriesKeys: [],
    xAxisLabel: config.xAxis,
    yAxisLabel: config.yAxis,
    error: message,
  };
}
