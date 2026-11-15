import { Pencil, Trash2 } from 'lucide-react';
import type { ChartConfig, ChartDataResult } from '@/src/types/analysis';
import { CHART_TYPE_LABELS } from '@/src/visualization/chartConfig';
import { createChartComponent } from '@/src/visualization/chartFactory';

interface ChartCardProps {
  config: ChartConfig;
  data?: ChartDataResult;
  loading?: boolean;
  isHighlighted?: boolean;
  onEdit: (config: ChartConfig) => void;
  onDelete: (chartId: string) => void;
}

export function ChartCard({
  config,
  data,
  loading,
  isHighlighted,
  onEdit,
  onDelete,
}: ChartCardProps) {
  const aggLabel = config.type === 'scatter' || config.type === 'histogram' ? '' : ` · ${config.aggregation}`;
  const yLabel = config.yAxis === '*' ? '件数' : config.yAxis;

  return (
    <article
      id={config.id}
      className={`rounded-xl border bg-white p-5 transition-colors ${
        isHighlighted ? 'border-blue-500 ring-2 ring-blue-500/15' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-slate-900 truncate">
            {config.title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 truncate">
            {CHART_TYPE_LABELS[config.type]}
            <span aria-hidden="true"> · </span>
            X: {config.xAxis}
            {config.type !== 'histogram' && (
              <>
                <span aria-hidden="true"> · </span>
                Y: {yLabel}
              </>
            )}
            {aggLabel}
            {config.type !== 'scatter' && (
              <>
                <span aria-hidden="true"> · </span>
                上限 {config.limit}件
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(config)}
            aria-label={`グラフ「${config.title}」の設定を編集`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            <span>設定</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(config.id)}
            aria-label={`グラフ「${config.title}」を削除`}
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {config.reason && (
        <p className="mt-2 text-[11px] text-slate-500">{config.reason}</p>
      )}

      <div className="mt-4">
        {createChartComponent({ config, data, loading })}
      </div>
    </article>
  );
}
