import type { ReactElement, ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { ChartConfig, ChartDataResult, ChartType } from '@/src/types/analysis';
import { CHART_PALETTE, formatChartTick, formatTooltipValue } from '../chartConfig';

interface ChartRendererProps {
  config: ChartConfig;
  result?: ChartDataResult;
  loading?: boolean;
}

interface ChartBodyProps {
  result: ChartDataResult;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
};
const AXIS_TICK = { fontSize: 11, fill: '#64748b' };
const AXIS_LINE = { stroke: '#cbd5e1' };
const LEGEND_STYLE = { fontSize: '12px' };
/** 棒グラフでラベルを斜めにする件数の閾値 */
const BAR_LABEL_TILT_THRESHOLD = 7;

const paletteColor = (idx: number) => CHART_PALETTE[idx % CHART_PALETTE.length];
const seriesTooltipFormatter = (value: unknown) => [formatTooltipValue(value), ''];

// ---------------------------------------------------------------------------
// グラフ種別ごとの描画
// ---------------------------------------------------------------------------

function LineChartBody({ result }: ChartBodyProps) {
  return (
    <LineChart data={result.data} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis
        dataKey="name"
        tick={AXIS_TICK}
        tickFormatter={formatChartTick}
        axisLine={AXIS_LINE}
        tickLine={false}
      />
      <YAxis
        tick={AXIS_TICK}
        tickFormatter={formatChartTick}
        axisLine={false}
        tickLine={false}
        width={54}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={seriesTooltipFormatter} />
      {result.seriesKeys.length > 1 && <Legend wrapperStyle={LEGEND_STYLE} />}
      {result.seriesKeys.map((key, idx) => (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={paletteColor(idx)}
          strokeWidth={2.2}
          dot={{ r: 3, strokeWidth: 1.5 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}

function BarChartBody({ result }: ChartBodyProps) {
  const tiltLabels = result.data.length > BAR_LABEL_TILT_THRESHOLD;
  return (
    <BarChart data={result.data} margin={{ top: 10, right: 16, left: 4, bottom: 14 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis
        dataKey="name"
        tick={AXIS_TICK}
        tickFormatter={formatChartTick}
        axisLine={AXIS_LINE}
        tickLine={false}
        interval={0}
        angle={tiltLabels ? -20 : 0}
        textAnchor={tiltLabels ? 'end' : 'middle'}
        height={tiltLabels ? 52 : 30}
      />
      <YAxis
        tick={AXIS_TICK}
        tickFormatter={formatChartTick}
        axisLine={false}
        tickLine={false}
        width={54}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={seriesTooltipFormatter} />
      {result.seriesKeys.length > 1 && <Legend wrapperStyle={LEGEND_STYLE} />}
      {result.seriesKeys.map((key, idx) => (
        <Bar
          key={key}
          dataKey={key}
          fill={paletteColor(idx)}
          radius={[4, 4, 0, 0]}
          maxBarSize={44}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

function PieChartBody({ result }: ChartBodyProps) {
  const valueKey = result.seriesKeys[0] || '件数';
  return (
    <PieChart>
      <Pie
        data={result.data}
        dataKey={valueKey}
        nameKey="name"
        cx="50%"
        cy="50%"
        innerRadius={52}
        outerRadius={92}
        paddingAngle={2}
        isAnimationActive={false}
      >
        {result.data.map((_, idx) => (
          <Cell key={`cell-${idx}`} fill={paletteColor(idx)} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        formatter={(value: unknown) => [formatTooltipValue(value), valueKey]}
      />
      <Legend wrapperStyle={LEGEND_STYLE} />
    </PieChart>
  );
}

function ScatterChartBody({ result }: ChartBodyProps) {
  return (
    <ScatterChart margin={{ top: 10, right: 16, left: 4, bottom: 12 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis
        type="number"
        dataKey="x"
        name={result.xAxisLabel}
        tick={AXIS_TICK}
        tickFormatter={formatChartTick}
        axisLine={AXIS_LINE}
        tickLine={false}
      />
      <YAxis
        type="number"
        dataKey="y"
        name={result.yAxisLabel}
        tick={AXIS_TICK}
        tickFormatter={formatChartTick}
        axisLine={false}
        tickLine={false}
        width={56}
      />
      <ZAxis range={[45, 45]} />
      <Tooltip
        cursor={{ strokeDasharray: '3 3' }}
        contentStyle={TOOLTIP_STYLE}
        formatter={(value: unknown) => formatTooltipValue(value)}
      />
      <Scatter
        name={`${result.xAxisLabel} × ${result.yAxisLabel}`}
        data={result.data}
        fill={CHART_PALETTE[0]}
        fillOpacity={0.78}
        isAnimationActive={false}
      />
    </ScatterChart>
  );
}

/**
 * グラフ種別 → 描画関数。
 * ResponsiveContainer は直下の子要素に width/height を注入するため、
 * コンポーネントとしてではなく関数として呼び出し、Recharts のチャート要素を直接渡す。
 */
const CHART_BODIES: Record<ChartType, (props: ChartBodyProps) => ReactElement> = {
  line: LineChartBody,
  bar: BarChartBody,
  histogram: BarChartBody,
  grouped_bar: BarChartBody,
  pie: PieChartBody,
  scatter: ScatterChartBody,
};

// ---------------------------------------------------------------------------
// 状態表示（読み込み中 / エラー / データなし）
// ---------------------------------------------------------------------------

function ChartStatusPanel({
  tone,
  children,
}: {
  tone: 'neutral' | 'muted' | 'error';
  children: ReactNode;
}) {
  const toneClass = {
    neutral: 'border-slate-100 bg-slate-50/70',
    muted: 'border-slate-100 bg-slate-50/50 px-4 text-center',
    error: 'border-red-200 bg-red-50/50 px-4 text-center',
  }[tone];
  return (
    <div className={`flex h-72 items-center justify-center rounded-lg border ${toneClass}`}>
      {children}
    </div>
  );
}

export function ChartRenderer({ config, result, loading }: ChartRendererProps) {
  if (loading) {
    return (
      <ChartStatusPanel tone="neutral">
        <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span>DuckDB クエリを実行中...</span>
        </div>
      </ChartStatusPanel>
    );
  }

  if (result?.error) {
    return (
      <ChartStatusPanel tone="error">
        <p className="text-xs text-red-700">{result.error}</p>
      </ChartStatusPanel>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <ChartStatusPanel tone="muted">
        <p className="text-xs text-slate-500">
          現在の条件に該当するグラフデータがありません。フィルターまたは軸設定を調整してください。
        </p>
      </ChartStatusPanel>
    );
  }

  const renderBody = CHART_BODIES[config.type];
  if (!renderBody) return null;

  return (
    <div className="h-72 w-full" data-testid={`chart-surface-${config.id}`}>
      <ResponsiveContainer width="100%" height="100%">
        {renderBody({ result })}
      </ResponsiveContainer>
    </div>
  );
}
