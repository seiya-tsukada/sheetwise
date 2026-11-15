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
import type { ChartConfig, ChartDataResult } from '@/src/types/analysis';
import { CHART_PALETTE, formatChartTick, formatTooltipValue } from '../chartConfig';

interface ChartRendererProps {
  config: ChartConfig;
  result?: ChartDataResult;
  loading?: boolean;
}

export function ChartRenderer({ config, result, loading }: ChartRendererProps) {
  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-slate-100 bg-slate-50/70">
        <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <span>DuckDB クエリを実行中...</span>
        </div>
      </div>
    );
  }

  if (result?.error) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-red-200 bg-red-50/50 px-4 text-center">
        <p className="text-xs text-red-700">{result.error}</p>
      </div>
    );
  }

  if (!result || result.data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-slate-100 bg-slate-50/50 px-4 text-center">
        <p className="text-xs text-slate-500">
          現在の条件に該当するグラフデータがありません。フィルターまたは軸設定を調整してください。
        </p>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
  };

  if (config.type === 'line') {
    return (
      <div className="h-72 w-full" data-testid={`chart-surface-${config.id}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={result.data} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatChartTick}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatChartTick}
              axisLine={false}
              tickLine={false}
              width={54}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: unknown) => [formatTooltipValue(value), '']}
            />
            {result.seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '12px' }} />}
            {result.seriesKeys.map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_PALETTE[idx % CHART_PALETTE.length]}
                strokeWidth={2.2}
                dot={{ r: 3, strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.type === 'bar' || config.type === 'histogram' || config.type === 'grouped_bar') {
    return (
      <div className="h-72 w-full" data-testid={`chart-surface-${config.id}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={result.data} margin={{ top: 10, right: 16, left: 4, bottom: 14 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatChartTick}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              interval={0}
              angle={result.data.length > 7 ? -20 : 0}
              textAnchor={result.data.length > 7 ? 'end' : 'middle'}
              height={result.data.length > 7 ? 52 : 30}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatChartTick}
              axisLine={false}
              tickLine={false}
              width={54}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: unknown) => [formatTooltipValue(value), '']}
            />
            {result.seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '12px' }} />}
            {result.seriesKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.type === 'pie') {
    const valueKey = result.seriesKeys[0] || '件数';
    return (
      <div className="h-72 w-full" data-testid={`chart-surface-${config.id}`}>
        <ResponsiveContainer width="100%" height="100%">
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
                <Cell
                  key={`cell-${idx}`}
                  fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: unknown) => [formatTooltipValue(value), valueKey]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.type === 'scatter') {
    return (
      <div className="h-72 w-full" data-testid={`chart-surface-${config.id}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 16, left: 4, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="x"
              name={result.xAxisLabel}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatChartTick}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={result.yAxisLabel}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatChartTick}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <ZAxis range={[45, 45]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={tooltipStyle}
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
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
