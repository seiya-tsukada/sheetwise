import { useState } from 'react';
import { X } from 'lucide-react';
import type {
  AggregationMethod,
  ChartConfig,
  ChartSortOrder,
  ChartType,
  ColumnSchema,
} from '@/src/types/analysis';
import {
  AGGREGATION_LABELS,
  CHART_TYPE_LABELS,
  SORT_ORDER_LABELS,
} from '@/src/visualization/chartConfig';

interface ChartEditorModalProps {
  initialConfig: ChartConfig | null;
  isNew: boolean;
  schema: ColumnSchema[];
  onSave: (config: ChartConfig) => void;
  onClose: () => void;
}

export function ChartEditorModal({
  initialConfig,
  isNew,
  schema,
  onSave,
  onClose,
}: ChartEditorModalProps) {
  const defaultX =
    schema.find((c) => c.role === 'date')?.name ??
    schema.find((c) => c.role === 'category')?.name ??
    schema[0]?.name ??
    '';
  const defaultY = schema.find((c) => c.role === 'metric')?.name ?? '*';
  const numericCols = schema.filter((c) => c.role === 'metric' || c.dataType === 'Integer' || c.dataType === 'Float');
  const categoryCols = schema.filter((c) => c.role === 'category' || c.role === 'boolean');

  const [title, setTitle] = useState(
    initialConfig?.title ?? `${defaultX} 別 ${defaultY === '*' ? '件数' : defaultY}`
  );
  const [type, setType] = useState<ChartType>(initialConfig?.type ?? 'bar');
  const [xAxis, setXAxis] = useState(initialConfig?.xAxis ?? defaultX);
  const [yAxis, setYAxis] = useState(initialConfig?.yAxis ?? defaultY);
  const [secondaryYAxis, setSecondaryYAxis] = useState(initialConfig?.secondaryYAxis ?? '');
  const [groupBy, setGroupBy] = useState(initialConfig?.groupBy ?? '');
  const [aggregation, setAggregation] = useState<AggregationMethod>(
    initialConfig?.aggregation ?? (defaultY === '*' ? 'COUNT' : 'SUM')
  );
  const [sort, setSort] = useState<ChartSortOrder>(initialConfig?.sort ?? 'value_desc');
  const [limit, setLimit] = useState<number>(initialConfig?.limit ?? 12);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>(
    initialConfig?.granularity ?? 'month'
  );

  const selectedXSchema = schema.find((c) => c.name === xAxis);
  const isDateX = selectedXSchema?.role === 'date';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveY =
      type === 'histogram'
        ? '*'
        : aggregation === 'COUNT' && yAxis === ''
          ? '*'
          : yAxis || '*';

    const nextConfig: ChartConfig = {
      id: initialConfig?.id ?? `chart-custom-${Date.now()}`,
      title: title.trim() || `${xAxis} の分析グラフ`,
      type,
      xAxis,
      yAxis: effectiveY,
      secondaryYAxis: type === 'line' && secondaryYAxis ? secondaryYAxis : undefined,
      groupBy: type === 'grouped_bar' && groupBy ? groupBy : undefined,
      aggregation: effectiveY === '*' ? 'COUNT' : aggregation,
      sort,
      limit: Math.max(3, Math.min(250, Number(limit) || 12)),
      granularity: isDateX ? granularity : undefined,
      reason: isNew ? 'ユーザーにより追加されたカスタムグラフ' : initialConfig?.reason,
    };

    onSave(nextConfig);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="chart-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="chart-editor-title" className="font-display text-base font-semibold text-slate-900">
            {isNew ? '新しいグラフを追加' : 'グラフ設定の編集'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="モーダルを閉じる"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="chart-title-input" className="block text-xs font-medium text-slate-700">
              グラフタイトル
            </label>
            <input
              id="chart-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="chart-type-select" className="block text-xs font-medium text-slate-700">
                グラフの種類
              </label>
              <select
                id="chart-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as ChartType)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((t) => (
                  <option key={t} value={t}>
                    {CHART_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="chart-x-select" className="block text-xs font-medium text-slate-700">
                {type === 'histogram' ? '対象数値カラム' : 'X軸（分類・日付・数値）'}
              </label>
              <select
                id="chart-x-select"
                value={xAxis}
                onChange={(e) => setXAxis(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {(type === 'histogram' || type === 'scatter' ? numericCols : schema).map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name} ({col.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {type !== 'histogram' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="chart-y-select" className="block text-xs font-medium text-slate-700">
                  Y軸（集計対象）
                </label>
                <select
                  id="chart-y-select"
                  value={yAxis}
                  onChange={(e) => setYAxis(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  {type !== 'scatter' && <option value="*">レコード件数 (*)</option>}
                  {(type === 'scatter' ? numericCols : schema).map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name} ({col.dataType})
                    </option>
                  ))}
                </select>
              </div>

              {type !== 'scatter' && (
                <div>
                  <label htmlFor="chart-agg-select" className="block text-xs font-medium text-slate-700">
                    集計方法
                  </label>
                  <select
                    id="chart-agg-select"
                    value={yAxis === '*' ? 'COUNT' : aggregation}
                    disabled={yAxis === '*'}
                    onChange={(e) => setAggregation(e.target.value as AggregationMethod)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 focus:border-blue-500 focus:outline-none"
                  >
                    {(Object.keys(AGGREGATION_LABELS) as AggregationMethod[]).map((agg) => (
                      <option key={agg} value={agg}>
                        {AGGREGATION_LABELS[agg]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {type === 'line' && numericCols.length >= 2 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="chart-sec-y-select"
                  className="block text-xs font-medium text-slate-700"
                >
                  第2系列（任意）
                </label>
                <select
                  id="chart-sec-y-select"
                  value={secondaryYAxis}
                  onChange={(e) => setSecondaryYAxis(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">なし</option>
                  {numericCols
                    .filter((c) => c.name !== yAxis)
                    .map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                </select>
              </div>

              {isDateX && (
                <div>
                  <label
                    htmlFor="chart-granularity-select"
                    className="block text-xs font-medium text-slate-700"
                  >
                    時系列粒度
                  </label>
                  <select
                    id="chart-granularity-select"
                    value={granularity}
                    onChange={(e) =>
                      setGranularity(e.target.value as 'day' | 'week' | 'month')
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="day">日別</option>
                    <option value="week">週別</option>
                    <option value="month">月別</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {type === 'grouped_bar' && (
            <div>
              <label htmlFor="chart-groupby-select" className="block text-xs font-medium text-slate-700">
                グループ分割カラム
              </label>
              <select
                id="chart-groupby-select"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">選択してください</option>
                {categoryCols
                  .filter((c) => c.name !== xAxis)
                  .map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="chart-sort-select" className="block text-xs font-medium text-slate-700">
                並び替え
              </label>
              <select
                id="chart-sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as ChartSortOrder)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                {(Object.keys(SORT_ORDER_LABELS) as ChartSortOrder[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_ORDER_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="chart-limit-input" className="block text-xs font-medium text-slate-700">
                表示件数上限（上位N件）
              </label>
              <input
                id="chart-limit-input"
                type="number"
                min={3}
                max={250}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
            >
              {isNew ? 'グラフを追加' : '変更を反映'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
